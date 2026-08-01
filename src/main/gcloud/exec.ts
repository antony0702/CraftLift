import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { GcloudStatus } from '@shared/types'

const execFileAsync = promisify(execFile)

/** Windows 上 gcloud 的常見安裝位置 */
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

let cachedPath: string | null = null

/** 找出 gcloud 執行檔的位置 */
export async function findGcloud(): Promise<string | null> {
  if (cachedPath && existsSync(cachedPath)) return cachedPath

  for (const p of candidatePaths()) {
    if (existsSync(p)) {
      cachedPath = p
      return p
    }
  }

  try {
    const { stdout } = await execFileAsync('where', ['gcloud.cmd'], { windowsHide: true })
    const first = stdout.split(/\r?\n/).find((line) => line.trim().length > 0)
    if (first && existsSync(first.trim())) {
      cachedPath = first.trim()
      return cachedPath
    }
  } catch {
    // where 找不到時回傳非零結束碼，是預期內的情況
  }

  return null
}

/**
 * 允許直接出現在指令列上的字元。
 *
 * 為什麼要這麼嚴：Windows 的 gcloud 是批次檔，Node.js 從 18.20.2 起
 * 基於資安理由規定執行批次檔一定要透過 cmd.exe。只要經過 shell，
 * 參數裡的 & | > ^ 就可能被當成指令執行，造成命令注入。
 *
 * 對策不是「跳脫特殊字元」（那條路歷史上錯誤百出），而是「一律拒絕」。
 * 這在本專案完全可行，因為 GCP 的識別名稱本來就只允許小寫英數字與
 * 連字號。任何含可疑字元的參數都代表程式有 bug 或有人在搞鬼。
 */
const SAFE_ARG = /^[A-Za-z0-9._\-=/:@,*[\]]+$/

/**
 * 那使用者取的中文伺服器名稱、幾百行的安裝腳本怎麼辦？
 * 答案是「根本不要放到指令列上」——寫進暫存檔，只把檔案路徑傳給 gcloud。
 * 檔案內容不經過 shell，多長多奇怪的字元都不會有事。
 *
 * 路徑是我們自己產生的（暫存目錄），不是使用者輸入，但仍然檢查一次，
 * 因為使用者的 Windows 帳號名稱可能包含奇怪字元而讓路徑帶上特殊符號。
 */
export interface PathArg {
  /** 這個參數的完整內容，例如 `--metadata-from-file=startup-script=C:\Temp\x.sh` */
  literal: string
}

export type GcloudArg = string | PathArg

const DANGEROUS_IN_PATH = /["%\r\n&|<>^]/

function renderArg(arg: GcloudArg): string {
  if (typeof arg === 'string') {
    if (!SAFE_ARG.test(arg)) throw new Error(`UNSAFE_ARGUMENT: ${arg}`)
    return arg
  }
  if (DANGEROUS_IN_PATH.test(arg.literal)) {
    throw new Error(`UNSAFE_PATH_ARGUMENT: ${arg.literal}`)
  }
  // 路徑可能含空白，用雙引號包起來。上面已經確認裡面沒有雙引號可以逃逸。
  return `"${arg.literal}"`
}

async function runGcloudRaw(args: GcloudArg[]): Promise<{ stdout: string; stderr: string }> {
  const gcloudPath = await findGcloud()
  if (!gcloudPath) throw new Error('GCLOUD_NOT_FOUND')

  const rendered = args.map(renderArg)

  try {
    const { stdout, stderr } = await execFileAsync(`"${gcloudPath}"`, rendered, {
      shell: true,
      windowsHide: true,
      // gcloud 輸出可能很大（例如列出所有機型），預設 1MB 不夠
      maxBuffer: 64 * 1024 * 1024
    })
    return { stdout, stderr }
  } catch (err) {
    // gcloud 把有用的錯誤訊息寫在 stderr，預設的例外訊息只有結束碼，
    // 對除錯完全沒幫助，所以這裡把 stderr 撈出來。
    const e = err as { stderr?: string; message?: string }
    const detail = (e.stderr ?? '').trim() || e.message || String(err)
    // 非零結束碼吐的也是同一批訊息，一樣先換成代碼再往上丟
    throw new Error(describeFailure(detail))
  }
}

/** 執行一次 gcloud 指令，回傳標準輸出 */
export async function runGcloud(args: GcloudArg[]): Promise<string> {
  return (await runGcloudRaw(args)).stdout
}

/**
 * gcloud 的「部分失敗」。
 *
 * 查一個已經不存在、或沒有權限的專案時，gcloud **不會**用非零結束碼告訴你。
 * 它把警告印到 stderr，stdout 照樣給一個空陣列，結束碼 0。實測：
 *
 *   gcloud compute machine-types list --project=<已刪除的專案> --format=json
 *     stdout : []
 *     結束碼 : 0
 *     stderr : WARNING: Some requests did not succeed.
 *               - The resource 'projects/xxx' was not found
 *
 * 照單全收的下場是：伺服器清單顯示「你還沒有任何伺服器」，而不是「你的專案
 * 不見了」；機型下拉選單變成一條沒有任何項目的細線。對一個管理別人世界存檔
 * 的程式，這種表現方式是不能接受的——使用者會以為東西真的沒了。
 *
 * 判斷刻意保守。實測四種正常查詢（專案清單、帳單帳戶、機型清單、VM 清單）
 * 的 stderr **完全是空的**；而「真的沒有東西」的空結果，stderr 同樣是空的。
 * 所以只認下面這幾個字樣，不會把「查得到但沒東西」誤判成失敗。
 */
const GCLOUD_PARTIAL_FAILURE =
  /Some requests did not succeed|was not found|PERMISSION_DENIED|Permission denied|has not been used in project|^ERROR:/im

/**
 * 把 gcloud 的失敗訊息換成畫面認得的代碼。
 *
 * gcloud 講的是英文，而且講的是它自己的世界的話：
 * 「The resource 'projects/craftlift-48a0d61e6d' was not found」對使用者
 * 來說既看不懂，也看不出下一步該做什麼。認得出來的幾種在這裡換成代碼，
 * 由畫面那端翻成使用者的語言。
 *
 * 認不出來的原樣往上丟。全部換成一句「發生錯誤」會把真正有用的細節吃掉——
 * 使用者看不懂的訊息至少還能貼給別人看，被吃掉的訊息誰也救不了。
 */
export const GCLOUD_ERROR_PREFIX = 'craftlift:'

function classify(stderr: string): string | null {
  if (/has not been used in project|SERVICE_DISABLED/i.test(stderr)) {
    return `${GCLOUD_ERROR_PREFIX}apiDisabled`
  }
  // 專案不見了要排在權限前面：專案被刪掉時 gcloud 兩種訊息都可能吐
  if (/projects\/[^']*' was not found|was not found.*projects\//i.test(stderr)) {
    return `${GCLOUD_ERROR_PREFIX}projectMissing`
  }
  if (/PERMISSION_DENIED|Permission denied|not authorized/i.test(stderr)) {
    return `${GCLOUD_ERROR_PREFIX}permissionDenied`
  }
  // Every server reserves a static address, and four per region is the quota a
  // trial account meets first — so this is the failure users actually hit, and
  // it is worth its own message because the way out (delete an old server, or
  // switch to a floating address) is not guessable from Google's wording.
  if (/Quota 'IN_USE_ADDRESSES' exceeded/i.test(stderr)) {
    return `${GCLOUD_ERROR_PREFIX}addressQuota`
  }
  if (/Quota '[A-Z_]+' exceeded|QUOTA_EXCEEDED/i.test(stderr)) {
    return `${GCLOUD_ERROR_PREFIX}quotaExceeded`
  }
  return null
}

/**
 * gcloud's own headline, which says nothing.
 *
 * "Could not fetch resource:" is printed as a title with the real reason on the
 * lines below it, so taking the first line hands the user a sentence with no
 * information in it — that is exactly what a blocked create looked like.
 */
const GCLOUD_BANNER = /^ERROR:|Could not fetch resource|Some requests did not succeed|^WARNING:/i

/** 把 gcloud 的多行警告壓成一句話。細節那一行比開頭的橫幅有用。 */
function describeFailure(stderr: string): string {
  const code = classify(stderr)
  if (code) return code

  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const known = lines.find((line) =>
    /was not found|PERMISSION_DENIED|Permission denied|has not been used in project/i.test(line)
  )
  // Anything that is not the banner beats the banner
  const detail = known ?? lines.find((line) => !GCLOUD_BANNER.test(line))
  return (detail ?? lines[0] ?? 'gcloud 查詢失敗').replace(/^[-\s]+/, '')
}

/** Exposed for tests: turning gcloud's noise into one line is worth checking. */
export const describeFailureForTest = describeFailure

/** 執行 gcloud 並把 JSON 輸出解析好 */
export async function runGcloudJson<T>(args: GcloudArg[]): Promise<T> {
  const { stdout, stderr } = await runGcloudRaw([...args, '--format=json'])

  const noise = stderr.trim()
  if (noise && GCLOUD_PARTIAL_FAILURE.test(noise)) {
    throw new Error(describeFailure(noise))
  }

  const trimmed = stdout.trim()
  if (!trimmed) return [] as unknown as T
  return JSON.parse(trimmed) as T
}

/** 版本字串只用於顯示，取得後就記住，不必每次都問 */
let cachedVersion: string | null = null

/**
 * 檢查 gcloud 是否已安裝。
 *
 * 刻意不執行 `gcloud version`。Windows 上的 gcloud 是 Python CLI，
 * 光是啟動直譯器就要三秒多，而這個檢查在首次設定畫面是擋在最前面的，
 * 使用者會直接感受到那三秒。檔案存在就當作已安裝——真的壞掉的話，
 * 後面第一個實際指令就會報錯，而且錯誤訊息比這裡準確得多。
 *
 * 版本字串只用於顯示，在背景慢慢取得即可。
 */
export async function getGcloudStatus(): Promise<GcloudStatus> {
  const path = await findGcloud()
  if (!path) return { installed: false, path: null, version: null }

  if (cachedVersion === null) void warmVersion()
  return { installed: true, path, version: cachedVersion }
}

/** 在背景取得版本字串，不擋任何流程 */
async function warmVersion(): Promise<void> {
  try {
    const parsed = await runGcloudJson<Record<string, string>>(['version'])
    cachedVersion = parsed['Google Cloud SDK'] ?? null
  } catch {
    // 取不到版本不影響任何功能，顯示空白即可
  }
}
