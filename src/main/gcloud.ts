import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { AuthStatus, GcloudStatus } from '@shared/types'

const execFileAsync = promisify(execFile)

/**
 * Windows 上 gcloud 的常見安裝位置。
 * 使用者可能用官方安裝檔（Program Files）或個人安裝（LOCALAPPDATA），兩種都要找。
 */
function candidatePaths(): string[] {
  const localAppData = process.env.LOCALAPPDATA ?? ''
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const suffix = join('Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd')

  return [
    localAppData && join(localAppData, suffix),
    join(programFiles, suffix),
    join(programFilesX86, suffix)
  ].filter((p): p is string => Boolean(p))
}

/** 快取找到的路徑，避免每次呼叫都重新掃硬碟 */
let cachedPath: string | null = null

/**
 * 找出 gcloud 執行檔的位置。
 * 先看常見安裝路徑（最可靠），再退而求其次交給系統 PATH。
 */
export async function findGcloud(): Promise<string | null> {
  if (cachedPath && existsSync(cachedPath)) return cachedPath

  for (const p of candidatePaths()) {
    if (existsSync(p)) {
      cachedPath = p
      return p
    }
  }

  // 找不到就問系統 PATH。使用者可能裝在自訂位置。
  try {
    const { stdout } = await execFileAsync('where', ['gcloud.cmd'], { windowsHide: true })
    const first = stdout.split(/\r?\n/).find((line) => line.trim().length > 0)
    if (first && existsSync(first.trim())) {
      cachedPath = first.trim()
      return cachedPath
    }
  } catch {
    // where 找不到東西時會回傳非零結束碼，這是預期內的情況，不是錯誤
  }

  return null
}

/**
 * 允許出現在 gcloud 參數裡的字元。
 *
 * 為什麼需要這個：Windows 上的 gcloud 是一個 .cmd 批次檔，而 Node.js 從
 * 18.20.2 起基於資安理由，規定執行 .cmd 一定要透過 shell（cmd.exe）。
 * 只要經過 shell，參數裡的 & | > ^ 等字元就有可能被解讀成指令而不是資料，
 * 造成命令注入。
 *
 * 我們的對策不是「想辦法跳脫特殊字元」（那條路歷史上錯誤百出），而是
 * 「一律拒絕特殊字元」。這在本專案完全可行，因為 GCP 的識別名稱本來就
 * 有嚴格格式限制——專案 ID、執行個體名稱、區域名稱都只允許小寫英數字
 * 和連字號。任何含有可疑字元的參數，代表程式有 bug 或有人在搞鬼，
 * 兩種情況都應該直接擋下來。
 */
const SAFE_ARG = /^[A-Za-z0-9._\-=/:@,*]+$/

/** 執行一次 gcloud 指令，回傳標準輸出 */
export async function runGcloud(args: string[]): Promise<string> {
  const gcloudPath = await findGcloud()
  if (!gcloudPath) throw new Error('GCLOUD_NOT_FOUND')

  for (const arg of args) {
    if (!SAFE_ARG.test(arg)) {
      throw new Error(`UNSAFE_ARGUMENT: ${arg}`)
    }
  }

  const { stdout } = await execFileAsync(`"${gcloudPath}"`, args, {
    shell: true,
    windowsHide: true,
    // gcloud 輸出可能很大（例如列出所有機型），預設 1MB 不夠用
    maxBuffer: 32 * 1024 * 1024
  })
  return stdout
}

/** 檢查 gcloud 是否已安裝，並取得版本 */
export async function getGcloudStatus(): Promise<GcloudStatus> {
  const path = await findGcloud()
  if (!path) return { installed: false, path: null, version: null }

  try {
    const stdout = await runGcloud(['version', '--format=json'])
    const parsed = JSON.parse(stdout) as Record<string, string>
    return {
      installed: true,
      path,
      version: parsed['Google Cloud SDK'] ?? null
    }
  } catch {
    // 檔案存在但跑不起來——可能安裝損毀，當作未安裝處理比較安全
    return { installed: false, path, version: null }
  }
}

/**
 * 查詢目前登入的 Google 帳號。
 * 注意這裡不會觸發登入流程，只是讀取本機已有的憑證。
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const stdout = await runGcloud(['auth', 'list', '--format=json'])
  const accounts = JSON.parse(stdout) as Array<{ account: string; status: string }>
  const active = accounts.find((a) => a.status === 'ACTIVE')
  return {
    loggedIn: Boolean(active),
    account: active?.account ?? null
  }
}

/**
 * 啟動 Google 登入流程。
 *
 * gcloud 會自動打開使用者的預設瀏覽器（通常是 Chrome）。因為登入的是
 * Google 官方已驗證的 gcloud 應用程式，使用者不會看到「此應用程式未經
 * 驗證」的警告畫面，也沒有 100 人使用上限。
 *
 * 這個呼叫會一直等到使用者在瀏覽器完成授權（或關掉視窗）才回來，
 * 可能長達數分鐘，所以呼叫端要顯示等待中的畫面。
 */
export async function login(): Promise<AuthStatus> {
  await runGcloud(['auth', 'login', '--brief'])
  return getAuthStatus()
}
