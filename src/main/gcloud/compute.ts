import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  CreateServerOptions,
  InstanceState,
  MinecraftServer,
  ServerFlavor
} from '@shared/types'
import { CRAFTLIFT_LABEL, DISK_TYPE, META, REMOTE } from '@shared/constants'
import { runGcloud, runGcloudJson } from './exec'

/** GCE 執行個體名稱只能用小寫英數字與連字號，所以顯示名稱另外存在 metadata。 */
function generateInstanceName(): string {
  return `craftlift-${randomBytes(4).toString('hex')}`
}

/** GCP 的 API 常常回傳完整資源 URL，我們只要最後那一段 */
function lastSegment(url: string | undefined): string {
  if (!url) return ''
  return url.substring(url.lastIndexOf('/') + 1)
}

interface RawInstance {
  name: string
  zone: string
  status: string
  machineType: string
  networkInterfaces?: Array<{ accessConfigs?: Array<{ natIP?: string }> }>
  metadata?: { items?: Array<{ key: string; value: string }> }
}

function metaValue(raw: RawInstance, key: string): string | null {
  return raw.metadata?.items?.find((i) => i.key === key)?.value ?? null
}

/**
 * metadata 裡的種類字串轉回型別。
 *
 * v1.1.0 之前建立的機器沒有這個鍵，而那些機器裝的確實是原版，所以
 * 讀不到就是 vanilla。認不得的值也一樣——與其顯示一個不存在的載入器，
 * 不如當成原版，至少畫面不會叫使用者去管一個不存在的 mods 資料夾。
 */
function toFlavor(value: string | null): ServerFlavor {
  const known: ServerFlavor[] = ['vanilla', 'fabric', 'neoforge', 'forge']
  return known.find((f) => f === value) ?? 'vanilla'
}

function toServer(raw: RawInstance): MinecraftServer {
  const flavor = toFlavor(metaValue(raw, META.flavor))
  return {
    name: raw.name,
    displayName: metaValue(raw, META.displayName) ?? raw.name,
    zone: lastSegment(raw.zone),
    state: (raw.status as InstanceState) ?? 'UNKNOWN',
    externalIp: raw.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? null,
    machineType: lastSegment(raw.machineType),
    mcVersion: metaValue(raw, META.mcVersion) ?? '未知',
    flavor,
    loaderVersion: flavor === 'vanilla' ? null : metaValue(raw, META.loaderVersion),
    tier: metaValue(raw, META.tier) ?? 'standard',
    createdAt: metaValue(raw, META.createdAt)
  }
}

/**
 * 列出這個專案裡所有由 CraftLift 建立的伺服器。
 * 靠標籤過濾，不會顯示使用者其他用途的機器。
 */
export async function listServers(projectId: string): Promise<MinecraftServer[]> {
  const raw = await runGcloudJson<RawInstance[]>([
    'compute',
    'instances',
    'list',
    `--project=${projectId}`,
    `--filter=labels.${CRAFTLIFT_LABEL}=true`
  ])
  return raw.map(toServer)
}

/** 取得單一伺服器的最新狀態（例如開機後要拿新的 IP） */
export async function getServer(
  projectId: string,
  name: string,
  zone: string
): Promise<MinecraftServer> {
  const raw = await runGcloudJson<RawInstance>([
    'compute',
    'instances',
    'describe',
    name,
    `--project=${projectId}`,
    `--zone=${zone}`
  ])
  return toServer(raw)
}

/**
 * 建立防火牆規則。
 *
 * 只開兩個埠：25565 給玩家連線、22 給 CraftLift 自己管理機器。
 * RCON 的 25575 刻意不開——RCON 協定的密碼是明文傳輸的，暴露在
 * 公網上等於把伺服器主控台送給任何人。我們一律走 SSH 通道存取它。
 */
export async function ensureFirewallRules(projectId: string): Promise<void> {
  const existing = await runGcloudJson<Array<{ name: string }>>([
    'compute',
    'firewall-rules',
    'list',
    `--project=${projectId}`
  ])
  const names = new Set(existing.map((r) => r.name))

  if (!names.has('craftlift-minecraft')) {
    await runGcloud([
      'compute',
      'firewall-rules',
      'create',
      'craftlift-minecraft',
      `--project=${projectId}`,
      `--allow=tcp:${REMOTE.gamePort}`,
      `--target-tags=${CRAFTLIFT_LABEL}`,
      '--source-ranges=0.0.0.0/0'
    ])
  }

  if (!names.has('craftlift-ssh')) {
    await runGcloud([
      'compute',
      'firewall-rules',
      'create',
      'craftlift-ssh',
      `--project=${projectId}`,
      '--allow=tcp:22',
      `--target-tags=${CRAFTLIFT_LABEL}`,
      '--source-ranges=0.0.0.0/0'
    ])
  }
}

/** 保留一個靜態 IP，回傳實際位址 */
async function reserveStaticIp(projectId: string, name: string, region: string): Promise<string> {
  await runGcloud([
    'compute',
    'addresses',
    'create',
    name,
    `--project=${projectId}`,
    `--region=${region}`
  ])
  const info = await runGcloudJson<{ address: string }>([
    'compute',
    'addresses',
    'describe',
    name,
    `--project=${projectId}`,
    `--region=${region}`
  ])
  return info.address
}

/** 釋放靜態 IP。刪機器時一定要一併呼叫，否則會持續計費。 */
async function releaseStaticIp(projectId: string, name: string, region: string): Promise<void> {
  try {
    await runGcloud([
      'compute',
      'addresses',
      'delete',
      name,
      `--project=${projectId}`,
      `--region=${region}`,
      '--quiet'
    ])
  } catch {
    // 本來就不存在（使用者選了浮動 IP）時會失敗，這是預期內的情況
  }
}

/** 由區域推出地區：asia-east1-b -> asia-east1 */
function regionOf(zone: string): string {
  return zone.replace(/-[a-z]$/, '')
}

/**
 * 建立一台 Minecraft 伺服器。
 *
 * 長字串（安裝腳本、可能是中文的顯示名稱）一律寫進暫存檔再用
 * --metadata-from-file 傳給 gcloud，完全不經過指令列，也就完全
 * 不必擔心特殊字元或命令注入。
 */
export async function createServer(
  projectId: string,
  opts: CreateServerOptions,
  startupScript: string,
  /** 實際裝上去的載入器版本。呼叫端在建立前就已經把「交給我們挑」定案了。 */
  loaderVersion: string | null
): Promise<MinecraftServer> {
  if (!opts.acceptedDisclaimer) {
    throw new Error('DISCLAIMER_NOT_ACCEPTED')
  }

  await ensureFirewallRules(projectId)

  const name = generateInstanceName()
  const region = regionOf(opts.zone)

  let staticIp: string | null = null
  if (opts.useStaticIp) {
    staticIp = await reserveStaticIp(projectId, name, region)
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'craftlift-'))
  try {
    const scriptPath = join(tempDir, 'startup.sh')
    const namePath = join(tempDir, 'displayname.txt')
    await writeFile(scriptPath, startupScript, 'utf8')
    await writeFile(namePath, opts.displayName, 'utf8')

    const args = [
      'compute',
      'instances',
      'create',
      name,
      `--project=${projectId}`,
      `--zone=${opts.zone}`,
      `--machine-type=${opts.machineType}`,
      '--image-family=ubuntu-2404-lts-amd64',
      '--image-project=ubuntu-os-cloud',
      `--boot-disk-size=${opts.diskGb}GB`,
      `--boot-disk-type=${DISK_TYPE}`,
      `--tags=${CRAFTLIFT_LABEL}`,
      `--labels=${CRAFTLIFT_LABEL}=true`,
      // 載入器版本只在模組伺服器上寫。metadata 的值不能是空字串，
      // 寫一個空的鍵之後讀回來會分不清「原版」與「查不到版本」。
      `--metadata=${META.mcVersion}=${opts.mcVersion},${META.tier}=${opts.machineType},${META.createdAt}=${new Date().toISOString()},${META.flavor}=${opts.flavor}` +
        (loaderVersion ? `,${META.loaderVersion}=${loaderVersion}` : ''),
      { literal: `--metadata-from-file=startup-script=${scriptPath},${META.displayName}=${namePath}` }
    ]

    if (staticIp) args.push(`--address=${staticIp}`)

    await runGcloud(args)
  } catch (err) {
    // 建立失敗時要把已經保留的 IP 收回來，否則使用者會被一個
    // 沒有機器在用、卻持續計費的位址纏上。
    if (staticIp) await releaseStaticIp(projectId, name, region)
    throw err
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }

  return getServer(projectId, name, opts.zone)
}

export async function startServer(projectId: string, name: string, zone: string): Promise<void> {
  await runGcloud([
    'compute',
    'instances',
    'start',
    name,
    `--project=${projectId}`,
    `--zone=${zone}`
  ])
}

export async function stopServer(projectId: string, name: string, zone: string): Promise<void> {
  await runGcloud(['compute', 'instances', 'stop', name, `--project=${projectId}`, `--zone=${zone}`])
}

/**
 * 刪除一台伺服器，連同它的開機磁碟與靜態 IP。
 *
 * 靜態 IP 是最容易漏掉的東西：它跟機器是分開的資源，機器刪了它還在，
 * 而且沒被使用的保留位址收費比使用中還高。
 */
export async function deleteServer(projectId: string, name: string, zone: string): Promise<void> {
  await runGcloud([
    'compute',
    'instances',
    'delete',
    name,
    `--project=${projectId}`,
    `--zone=${zone}`,
    '--delete-disks=all',
    '--quiet'
  ])
  await releaseStaticIp(projectId, name, regionOf(zone))
}
