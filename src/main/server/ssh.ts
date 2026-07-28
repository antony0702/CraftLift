import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { Client } from 'ssh2'
import type { SFTPWrapper } from 'ssh2'
import { REMOTE } from '@shared/constants'
import { runGcloud } from '../gcloud/exec'

export interface ExecResult {
  stdout: string
  stderr: string
  code: number
}

interface SshTarget {
  host: string
  username: string
  privateKeyPath: string
}

/**
 * gcloud 產生的 SSH 私鑰預設位置。
 * 讓 gcloud 負責產生金鑰、上傳公鑰到專案 metadata、處理 OS Login，
 * 是這個專案裡最划算的一筆交易——這三件事自己實作會非常痛。
 */
const DEFAULT_KEY_PATH = join(homedir(), '.ssh', 'google_compute_engine')

/**
 * 第一次連線前，先讓 gcloud 跑一次真正的 SSH。
 *
 * 這一步會：產生金鑰對（如果還沒有）、把公鑰寫進專案 metadata、
 * 等待金鑰散佈到機器上。跳過這步直接用 ssh2 連會被拒絕。
 *
 * 金鑰散佈需要一點時間，所以這裡會重試幾次。
 */
export async function bootstrapSshAccess(
  projectId: string,
  name: string,
  zone: string
): Promise<void> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await runGcloud([
        'compute',
        'ssh',
        name,
        `--project=${projectId}`,
        `--zone=${zone}`,
        '--command=true',
        '--quiet',
        '--tunnel-through-iap=false'
      ])
      return
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 10_000))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * 問 gcloud「你會怎麼連這台機器」，從答案裡挖出使用者名稱與金鑰路徑。
 *
 * 用 --dry-run 讓 gcloud 把它要執行的 ssh 指令印出來而不真的執行。
 * 這比自己猜使用者名稱可靠——gcloud 從 Google 帳號 email 推導使用者
 * 名稱的規則有不少邊角情況（點會變底線之類的）。
 */
export async function resolveSshTarget(
  projectId: string,
  name: string,
  zone: string
): Promise<SshTarget> {
  const output = await runGcloud([
    'compute',
    'ssh',
    name,
    `--project=${projectId}`,
    `--zone=${zone}`,
    '--dry-run',
    '--tunnel-through-iap=false'
  ])

  // 尾端會是 user@host 的形式
  const target = output.match(/(\S+)@((?:\d{1,3}\.){3}\d{1,3}|[\w.-]+)\s*$/m)
  if (!target) {
    throw new Error(`無法從 gcloud 的輸出判斷連線資訊：${output.slice(0, 300)}`)
  }

  // -i 後面接私鑰路徑，路徑可能含空白，所以抓到下一個 -o 之前為止
  const keyMatch = output.match(/-i\s+"?(.+?)"?\s+-o/)

  return {
    username: target[1],
    host: target[2],
    privateKeyPath: keyMatch?.[1] ?? DEFAULT_KEY_PATH
  }
}

/**
 * 一條連到某台伺服器的 SSH 連線。
 *
 * 建立連線本身要好幾秒，所以連上之後就留著重複使用，
 * 不要每次操作都重連。
 */
export class ServerConnection {
  private constructor(
    private readonly client: Client,
    readonly target: SshTarget
  ) {}

  static async open(projectId: string, name: string, zone: string): Promise<ServerConnection> {
    const target = await resolveSshTarget(projectId, name, zone)
    const privateKey = await readFile(target.privateKeyPath)

    const client = new Client()
    await new Promise<void>((resolve, reject) => {
      client
        .on('ready', resolve)
        .on('error', reject)
        .connect({
          host: target.host,
          username: target.username,
          privateKey,
          readyTimeout: 30_000,
          keepaliveInterval: 15_000
        })
    })

    return new ServerConnection(client, target)
  }

  /** 執行一個指令並等它跑完。stdin 的內容不會經過 shell 解析。 */
  exec(command: string, stdin?: string): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) return reject(err)
        let stdout = ''
        let stderr = ''
        stream
          .on('close', (code: number) => resolve({ stdout, stderr, code: code ?? 0 }))
          .on('data', (d: Buffer) => (stdout += d.toString('utf8')))
          .stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))

        if (stdin !== undefined) {
          stream.write(stdin)
          stream.end()
        }
      })
    })
  }

  /**
   * 持續執行一個指令並即時吐出輸出，用來做日誌串流。
   * 回傳一個停止函式。
   */
  execStream(command: string, onData: (chunk: string) => void): Promise<() => void> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) return reject(err)
        stream.on('data', (d: Buffer) => onData(d.toString('utf8')))
        stream.stderr.on('data', (d: Buffer) => onData(d.toString('utf8')))
        resolve(() => stream.close())
      })
    })
  }

  sftp(): Promise<SFTPWrapper> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
    })
  }

  /**
   * 送一個 Minecraft 指令給伺服器。
   *
   * 指令內容經由 stdin 傳給 VM 上的 rcon.py，完全不經過遠端 shell，
   * 所以就算玩家名稱裡有 `;` 或 `&&` 也不會出事。
   */
  async rcon(command: string): Promise<string> {
    const result = await this.exec(
      `sudo python3 ${REMOTE.serverDir}/rcon.py --stdin`,
      command
    )
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || `RCON 指令失敗（結束碼 ${result.code}）`)
    }
    return result.stdout.trim()
  }

  close(): void {
    this.client.end()
  }
}

/**
 * 連線池。
 * 同一台機器只保留一條連線，換機器時把舊的關掉。
 */
const pool = new Map<string, ServerConnection>()

export async function getConnection(
  projectId: string,
  name: string,
  zone: string
): Promise<ServerConnection> {
  const existing = pool.get(name)
  if (existing) return existing

  await bootstrapSshAccess(projectId, name, zone)
  const conn = await ServerConnection.open(projectId, name, zone)
  pool.set(name, conn)
  return conn
}

export function closeConnection(name: string): void {
  const conn = pool.get(name)
  if (conn) {
    conn.close()
    pool.delete(name)
  }
}

export function closeAllConnections(): void {
  for (const [name] of pool) closeConnection(name)
}
