import { createReadStream, createWriteStream } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { REMOTE } from '@shared/constants'
import type { Backup, PlayerLists, RemoteFile, ServerProperties } from '@shared/types'
import type { ServerConnection } from './ssh'

/**
 * POSIX shell 的單引號跳脫。
 *
 * 用單引號包住字串，並把字串裡的每個單引號換成 '\'' 這個序列。
 * 這是唯一可以嚴格證明安全的跳脫方式——單引號內 shell 不做任何解釋，
 * 而唯一能結束單引號的字元就是單引號本身，我們把它處理掉了。
 *
 * 用雙引號跳脫則不安全，因為雙引號內 $ ` \ 仍會被解釋。
 */
function sq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** 確保路徑落在 Minecraft 目錄底下，擋掉 ../../etc/passwd 這種花招 */
function assertInServerDir(path: string): void {
  const normalized = path.replace(/\\/g, '/')
  if (!normalized.startsWith(REMOTE.serverDir) || normalized.includes('..')) {
    throw new Error(`路徑不在允許的範圍內：${path}`)
  }
}

// ---------------------------------------------------------------------------
// 服務控制
// ---------------------------------------------------------------------------

export interface ServiceStatus {
  running: boolean
  /** 線上玩家名稱。伺服器沒跑或還在啟動時為 null。 */
  players: string[] | null
  playerCount: number | null
  maxPlayers: number | null
}

export async function getServiceStatus(conn: ServerConnection): Promise<ServiceStatus> {
  const active = await conn.exec(`systemctl is-active ${REMOTE.serviceName}`)
  const running = active.stdout.trim() === 'active'
  if (!running) return { running: false, players: null, playerCount: null, maxPlayers: null }

  try {
    // Minecraft 的 list 指令回傳格式：
    // "There are 2 of a max of 20 players online: Alice, Bob"
    const output = await conn.rcon('list')
    const counts = output.match(/(\d+)\s+of\s+a\s+max\s+of\s+(\d+)/)
    const namePart = output.split(':')[1] ?? ''
    const players = namePart
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
    return {
      running: true,
      players,
      playerCount: counts ? Number(counts[1]) : players.length,
      maxPlayers: counts ? Number(counts[2]) : null
    }
  } catch {
    // 機器開著但 Minecraft 還在載入時，RCON 尚未就緒，這是正常過渡狀態
    return { running: true, players: null, playerCount: null, maxPlayers: null }
  }
}

export async function startMinecraft(conn: ServerConnection): Promise<void> {
  await conn.exec(`sudo systemctl start ${REMOTE.serviceName}`)
}

export async function stopMinecraft(conn: ServerConnection): Promise<void> {
  await conn.exec(`sudo systemctl stop ${REMOTE.serviceName}`)
}

export async function restartMinecraft(conn: ServerConnection): Promise<void> {
  await conn.exec(`sudo systemctl restart ${REMOTE.serviceName}`)
}

export async function sendCommand(conn: ServerConnection, command: string): Promise<string> {
  return conn.rcon(command)
}

// ---------------------------------------------------------------------------
// 日誌
// ---------------------------------------------------------------------------

/** 取得最近的日誌內容 */
export async function tailLog(conn: ServerConnection, lines = 300): Promise<string> {
  const result = await conn.exec(`sudo tail -n ${lines} ${sq(REMOTE.logFile)} 2>/dev/null || true`)
  return result.stdout
}

/** 持續串流日誌，回傳停止函式 */
export async function followLog(
  conn: ServerConnection,
  onData: (chunk: string) => void
): Promise<() => void> {
  return conn.execStream(`sudo tail -n 200 -F ${sq(REMOTE.logFile)}`, onData)
}

// ---------------------------------------------------------------------------
// 檔案管理
// ---------------------------------------------------------------------------

export async function listFiles(conn: ServerConnection, path: string): Promise<RemoteFile[]> {
  assertInServerDir(path)
  // 用 NUL 當分隔字元，這樣檔名裡就算有換行也不會弄亂解析
  const result = await conn.exec(
    `sudo find ${sq(path)} -maxdepth 1 -mindepth 1 -printf '%y\\t%s\\t%T@\\t%f\\0'`
  )
  return result.stdout
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const [type, size, mtime, ...nameParts] = entry.split('\t')
      const name = nameParts.join('\t')
      return {
        name,
        path: `${path.replace(/\/$/, '')}/${name}`,
        isDirectory: type === 'd',
        size: Number(size) || 0,
        modifiedAt: Math.floor(Number(mtime) * 1000) || 0
      }
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export async function readTextFile(conn: ServerConnection, path: string): Promise<string> {
  assertInServerDir(path)
  const result = await conn.exec(`sudo cat ${sq(path)}`)
  if (result.code !== 0) throw new Error(result.stderr.trim() || '讀取檔案失敗')
  return result.stdout
}

/**
 * 寫入檔案。
 *
 * SFTP 是用登入使用者的身分連線的，沒有權限直接寫 /opt/minecraft
 * （那是 minecraft 使用者的目錄）。所以先傳到 /tmp，再用 sudo 搬進去
 * 並設定正確的擁有者。
 */
export async function writeTextFile(
  conn: ServerConnection,
  path: string,
  content: string
): Promise<void> {
  assertInServerDir(path)
  const staging = `/tmp/craftlift-${randomBytes(6).toString('hex')}`

  const sftp = await conn.sftp()
  await new Promise<void>((resolve, reject) => {
    const stream = sftp.createWriteStream(staging)
    stream.on('close', resolve).on('error', reject)
    stream.end(Buffer.from(content, 'utf8'))
  })

  const result = await conn.exec(
    `sudo install -o minecraft -g minecraft -m 644 ${sq(staging)} ${sq(path)} && rm -f ${sq(staging)}`
  )
  if (result.code !== 0) throw new Error(result.stderr.trim() || '寫入檔案失敗')
}

export async function deleteRemoteFile(conn: ServerConnection, path: string): Promise<void> {
  assertInServerDir(path)
  if (path.replace(/\/$/, '') === REMOTE.serverDir) {
    throw new Error('不能刪除伺服器根目錄')
  }
  const result = await conn.exec(`sudo rm -rf ${sq(path)}`)
  if (result.code !== 0) throw new Error(result.stderr.trim() || '刪除失敗')
}

export async function uploadFile(
  conn: ServerConnection,
  localPath: string,
  remotePath: string
): Promise<void> {
  assertInServerDir(remotePath)
  const staging = `/tmp/craftlift-${randomBytes(6).toString('hex')}`

  const sftp = await conn.sftp()
  await pipeline(createReadStream(localPath), sftp.createWriteStream(staging))

  const result = await conn.exec(
    `sudo install -o minecraft -g minecraft -m 644 ${sq(staging)} ${sq(remotePath)} && rm -f ${sq(staging)}`
  )
  if (result.code !== 0) throw new Error(result.stderr.trim() || '上傳失敗')
}

export async function downloadFile(
  conn: ServerConnection,
  remotePath: string,
  localPath: string
): Promise<void> {
  assertInServerDir(remotePath)
  const staging = `/tmp/craftlift-${randomBytes(6).toString('hex')}`

  // 先複製一份到登入使用者讀得到的地方，再用 SFTP 抓回來
  const prep = await conn.exec(
    `sudo cp ${sq(remotePath)} ${sq(staging)} && sudo chmod 644 ${sq(staging)}`
  )
  if (prep.code !== 0) throw new Error(prep.stderr.trim() || '準備下載失敗')

  try {
    const sftp = await conn.sftp()
    await pipeline(sftp.createReadStream(staging), createWriteStream(localPath))
  } finally {
    await conn.exec(`rm -f ${sq(staging)}`)
  }
}

// ---------------------------------------------------------------------------
// 備份
// ---------------------------------------------------------------------------

export async function listBackups(conn: ServerConnection): Promise<Backup[]> {
  const files = await listFiles(conn, REMOTE.backupDir)
  return files
    .filter((f) => !f.isDirectory && f.name.endsWith('.tar.gz'))
    .map((f) => ({ fileName: f.name, path: f.path, size: f.size, modifiedAt: f.modifiedAt }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
}

/** 立刻執行一次備份（會先叫伺服器把資料寫入磁碟） */
export async function createBackup(conn: ServerConnection): Promise<string> {
  const result = await conn.exec(`sudo ${REMOTE.serverDir}/backup.sh`)
  if (result.code !== 0) throw new Error(result.stderr.trim() || '備份失敗')
  return result.stdout.trim()
}

/** 修改自動備份間隔，並讓 systemd 立即套用 */
export async function setBackupInterval(conn: ServerConnection, hours: number): Promise<void> {
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
    throw new Error('備份間隔必須是 1 到 168 小時之間的整數')
  }
  const unit = `/etc/systemd/system/${REMOTE.serviceName}-backup.timer`
  await conn.exec(
    `sudo sed -i ${sq(`s/^OnUnitActiveSec=.*/OnUnitActiveSec=${hours}h/`)} ${sq(unit)} ` +
      `&& sudo systemctl daemon-reload ` +
      `&& sudo systemctl restart ${REMOTE.serviceName}-backup.timer`
  )
}

// ---------------------------------------------------------------------------
// server.properties
// ---------------------------------------------------------------------------

export async function getServerProperties(conn: ServerConnection): Promise<ServerProperties> {
  const text = await readTextFile(conn, `${REMOTE.serverDir}/server.properties`)
  const props: ServerProperties = {}
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    props[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return props
}

/**
 * 寫回 server.properties。
 *
 * 刻意保留 RCON 相關設定不讓使用者改——關掉 RCON 會讓 CraftLift
 * 再也送不出指令，備份也會失去「先存檔再打包」的能力。
 */
const PROTECTED_KEYS = new Set(['enable-rcon', 'rcon.port', 'rcon.password'])

export async function setServerProperties(
  conn: ServerConnection,
  updates: ServerProperties
): Promise<void> {
  const current = await getServerProperties(conn)
  const merged: ServerProperties = { ...current }
  for (const [key, value] of Object.entries(updates)) {
    if (PROTECTED_KEYS.has(key)) continue
    merged[key] = value
  }
  const text =
    '# 由 CraftLift 產生，改動會在伺服器重新啟動後生效\n' +
    Object.entries(merged)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') +
    '\n'
  await writeTextFile(conn, `${REMOTE.serverDir}/server.properties`, text)
}

// ---------------------------------------------------------------------------
// 玩家管理
// ---------------------------------------------------------------------------

/** Minecraft 玩家名稱只能是英數字與底線，1–16 字。擋掉其他東西。 */
const VALID_PLAYER = /^[A-Za-z0-9_]{1,16}$/

function assertValidPlayer(name: string): void {
  if (!VALID_PLAYER.test(name)) throw new Error(`不是有效的玩家名稱：${name}`)
}

async function readJsonList(conn: ServerConnection, fileName: string): Promise<string[]> {
  try {
    const text = await readTextFile(conn, `${REMOTE.serverDir}/${fileName}`)
    const parsed = JSON.parse(text) as Array<{ name?: string }>
    return parsed.map((e) => e.name ?? '').filter(Boolean)
  } catch {
    // 檔案還不存在（伺服器剛裝好、還沒有人被加進名單）是正常的
    return []
  }
}

export async function getPlayerLists(conn: ServerConnection): Promise<PlayerLists> {
  const [whitelist, ops, banned] = await Promise.all([
    readJsonList(conn, 'whitelist.json'),
    readJsonList(conn, 'ops.json'),
    readJsonList(conn, 'banned-players.json')
  ])
  return { whitelist, ops, banned }
}

/**
 * Minecraft 對「這個帳號不存在」的回應。
 *
 * 伺服器的 online-mode 預設是開的，所有名單指令都會先拿名稱去 Mojang
 * 查真實帳號，查不到就回這句話——但**結束碼仍然是 0**。不特別認出這句，
 * 使用者打錯一個字的下場是：輸入框清空、清單沒變、沒有任何說明。
 *
 * 這裡刻意只認這一句。實測其餘幾種回應都不是錯誤：
 *   Player is already whitelisted            ← 本來就在名單上，結果正是他要的
 *   Nothing changed. The player already is an operator
 *   Nothing changed. The player isn't banned ← 本來就沒被封鎖
 *   Player is not whitelisted
 * 把這些也當錯誤丟出去，只會在使用者其實沒做錯事的時候嚇他一跳。
 *
 * 這是對英文原版訊息做字串比對，不夠漂亮。改成「下指令後回頭讀 JSON 檔
 * 確認」看似穩健，實際上伺服器寫檔有延遲，會變成一個更難解的競態。
 */
const RCON_NO_SUCH_ACCOUNT = /That player does not exist|No player was found/i

/**
 * 所有玩家名單的修改都透過 RCON 指令，而不是直接改 JSON 檔。
 * 這樣伺服器會立即生效，不用重啟；直接改檔案的話伺服器不會知道。
 */
export async function modifyPlayer(
  conn: ServerConnection,
  action: 'whitelist-add' | 'whitelist-remove' | 'op' | 'deop' | 'ban' | 'pardon',
  player: string
): Promise<string> {
  assertValidPlayer(player)
  const commands: Record<typeof action, string> = {
    'whitelist-add': `whitelist add ${player}`,
    'whitelist-remove': `whitelist remove ${player}`,
    op: `op ${player}`,
    deop: `deop ${player}`,
    ban: `ban ${player}`,
    pardon: `pardon ${player}`
  }
  const response = await conn.rcon(commands[action])
  if (RCON_NO_SUCH_ACCOUNT.test(response)) {
    throw new Error(
      `Minecraft 查不到「${player}」這個帳號，請確認拼字。名稱必須和正版帳號完全一致。`
    )
  }
  return response
}
