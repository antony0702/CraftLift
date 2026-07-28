import type { McVersion } from '@shared/types'

/** Mojang 官方的版本清單。公開資料，不需要任何驗證。 */
const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'

interface ManifestVersion {
  id: string
  type: McVersion['type']
  url: string
  releaseTime: string
}

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: ManifestVersion[]
}

interface VersionDetail {
  downloads?: { server?: { url: string; sha1: string } }
  javaVersion?: { majorVersion: number }
}

let manifestCache: Manifest | null = null

async function getManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache
  const res = await fetch(MANIFEST_URL)
  if (!res.ok) throw new Error(`無法取得 Minecraft 版本清單（HTTP ${res.status}）`)
  manifestCache = (await res.json()) as Manifest
  return manifestCache
}

/**
 * 取得可選的 Minecraft 版本。
 *
 * 預設只回傳正式版：快照版本每週好幾個，塞進下拉選單只會讓一般玩家困惑，
 * 而且快照版經常有破壞性變更，不適合當作「開一個服跟朋友玩」的選擇。
 */
export async function listVersions(includeSnapshots = false): Promise<McVersion[]> {
  const manifest = await getManifest()
  return manifest.versions
    .filter((v) => (includeSnapshots ? true : v.type === 'release'))
    .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }))
}

/** 目前最新的正式版，用來當作精靈的預設選項 */
export async function latestRelease(): Promise<string> {
  const manifest = await getManifest()
  return manifest.latest.release
}

export interface ServerJarInfo {
  url: string
  /** 這個版本需要的 Java 主版本。Mojang 自己在版本資訊裡標明，不用我們猜。 */
  javaMajorVersion: number
}

/**
 * 查出某個版本的 server.jar 下載網址，以及它需要的 Java 版本。
 *
 * Java 版本很重要：1.20.5 之後需要 Java 21，更早的版本用 Java 21 反而
 * 可能跑不起來。直接讀 Mojang 提供的欄位，比自己維護一張對照表可靠。
 */
export async function getServerJarInfo(versionId: string): Promise<ServerJarInfo> {
  const manifest = await getManifest()
  const version = manifest.versions.find((v) => v.id === versionId)
  if (!version) throw new Error(`找不到 Minecraft 版本：${versionId}`)

  const res = await fetch(version.url)
  if (!res.ok) throw new Error(`無法取得版本 ${versionId} 的詳細資訊（HTTP ${res.status}）`)
  const detail = (await res.json()) as VersionDetail

  const serverUrl = detail.downloads?.server?.url
  if (!serverUrl) {
    // 很舊的版本（1.2.5 以前）Mojang 沒有提供官方伺服器下載
    throw new Error(`版本 ${versionId} 沒有官方伺服器檔案，請改選較新的版本`)
  }

  return {
    url: serverUrl,
    // 沒標的一律當 Java 8，那是 Mojang 開始標記之前的舊版本共同需求
    javaMajorVersion: detail.javaVersion?.majorVersion ?? 8
  }
}
