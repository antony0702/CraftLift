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
 * gcloud 產生的 OpenSSH 私鑰位置。
 *
 * 讓 gcloud 負責產生金鑰、上傳公鑰到專案 metadata、處理金鑰散佈，
 * 是這個專案裡最划算的一筆交易——這三件事自己實作會非常痛。
 *
 * 注意：Windows 上的 gcloud 實際使用 PuTTY 連線，用的是同目錄下的
 * `.ppk` 檔。ssh2 讀不懂 PuTTY 格式，所以這裡固定指向 OpenSSH 格式的
 * 那一份（gcloud 兩種都會產生）。不要改成從 gcloud 的指令輸出解析路徑，
 * 那會拿到 .ppk。
 */
const OPENSSH_KEY_PATH = join(homedir(), '.ssh', 'google_compute_engine')

/**
 * 第一次連線前，先讓 gcloud 跑一次真正的 SSH。
 *
 * 這一步會：產生金鑰對（如果還沒有）、把公鑰寫進專案 metadata、
 * 等待金鑰散佈到機器上。跳過這步直接用 ssh2 連，一定會被拒絕。
 *
 * 兩個 Windows 上的坑：
 * - `--quiet` 只壓得住 gcloud 自己的提問。gcloud 在 Windows 用的是
 *   PuTTY，而 PuTTY 會另外跳出「是否信任這台主機的金鑰」的提示並卡住。
 *   必須加上 --strict-host-key-checking=no 才不會停在那裡等輸入。
 * - 就算這個指令最後失敗，公鑰通常已經上傳完成了（上傳發生在連線之前），
 *   所以失敗時不直接放棄，改由呼叫端試著用 ssh2 連連看。
 */
export async function bootstrapSshAccess(
  projectId: string,
  name: string,
  zone: string
): Promise<void> {
  await runGcloud([
    'compute',
    'ssh',
    name,
    `--project=${projectId}`,
    `--zone=${zone}`,
    '--command=true',
    '--quiet',
    '--strict-host-key-checking=no'
  ])
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
    '--quiet'
  ])

  // 輸出尾端是 user@host。使用者名稱由 gcloud 從 Google 帳號推導，
  // 規則有不少邊角情況（點會變底線之類），問它比自己算可靠。
  const target = output.match(/(\S+)@((?:\d{1,3}\.){3}\d{1,3}|[\w.-]+)\s*$/m)
  if (!target) {
    throw new Error(`無法從 gcloud 的輸出判斷連線資訊：${output.slice(0, 300)}`)
  }

  return {
    username: target[1],
    host: target[2],
    // 刻意不從輸出解析金鑰路徑：Windows 上 gcloud 給的是 PuTTY 的 .ppk，
    // ssh2 讀不懂。固定用 OpenSSH 格式那一份。
    privateKeyPath: OPENSSH_KEY_PATH
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

  /**
   * 借一條 SFTP 通道，用完立刻還。
   *
   * 每呼叫一次 sftp() 就會在這條 SSH 連線上開一個新通道，而 OpenSSH 預設
   * 同時只允許十個（MaxSessions 10）。連線是長期重複使用的，通道借了不還
   * 就會愈積愈多，第十一次檔案操作開始整組功能會突然壞掉，錯誤訊息只有
   * 一句沒頭沒尾的「Channel open failure」。所以出入口只留這一個。
   */
  async withSftp<T>(fn: (sftp: SFTPWrapper) => Promise<T>): Promise<T> {
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      this.client.sftp((err, handle) => (err ? reject(err) : resolve(handle)))
    })
    try {
      return await fn(sftp)
    } finally {
      sftp.end()
    }
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
/** 已經完成金鑰上傳的機器。這個步驟很慢，做過一次就不用再做。 */
const bootstrapped = new Set<string>()

export async function getConnection(
  projectId: string,
  name: string,
  zone: string
): Promise<ServerConnection> {
  const existing = pool.get(name)
  if (existing) return existing

  if (!bootstrapped.has(name)) {
    try {
      await bootstrapSshAccess(projectId, name, zone)
    } catch {
      // 就算這一步報錯，公鑰通常已經上傳完成（上傳在實際連線之前發生）。
      // 直接放棄的話會把一個其實可以連的情況判成失敗，所以繼續往下試，
      // 真的連不上時 ssh2 會丟出自己的錯誤。
    }
    bootstrapped.add(name)
  }

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
