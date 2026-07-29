import type { AuthStatus } from '@shared/types'
import { runGcloud, runGcloudJson } from './exec'

/**
 * 登入狀態的快取。
 *
 * 每次 gcloud 呼叫在 Windows 上都要三秒多（Python 直譯器啟動），而登入
 * 狀態在一次執行期間幾乎不會變。查過一次就記住，登入或登出時再失效。
 */
let cached: AuthStatus | null = null

/**
 * 查詢目前登入的 Google 帳號。
 * 只讀取本機既有的憑證，不會觸發任何登入流程。
 */
export async function getAuthStatus(force = false): Promise<AuthStatus> {
  if (cached && !force) return cached
  const accounts = await runGcloudJson<Array<{ account: string; status: string }>>(['auth', 'list'])
  const active = accounts.find((a) => a.status === 'ACTIVE')
  cached = { loggedIn: Boolean(active), account: active?.account ?? null }
  return cached
}

/** 登入或登出後呼叫，讓下次查詢重新問一次 gcloud */
export function invalidateAuthCache(): void {
  cached = null
}

/**
 * 啟動 Google 登入流程。
 *
 * gcloud 會打開使用者的預設瀏覽器。因為登入的是 Google 官方已驗證的
 * gcloud 應用程式，使用者不會看到「此應用程式未經驗證」的警告畫面，
 * 也沒有 100 人使用上限——這正是我們選擇透過 gcloud 而不是自建
 * OAuth client 的原因。
 *
 * 這個呼叫會一直等到使用者在瀏覽器完成授權（或關掉視窗）才回來，
 * 可能長達數分鐘，呼叫端要顯示等待畫面。
 */
export async function login(): Promise<AuthStatus> {
  await runGcloud(['auth', 'login', '--brief'])
  invalidateAuthCache()
  return getAuthStatus(true)
}

/**
 * 登出目前的 Google 帳號。
 *
 * CraftLift 自己不保管任何憑證——登入狀態完全由 gcloud 管理，所以登出
 * 就是請 gcloud 把這個帳號的憑證撤銷掉。
 *
 * 只撤銷「使用中」的那一個，刻意不用 `--all`：使用者的 gcloud 可能還登著
 * 別的帳號在做跟 CraftLift 無關的事，一併清掉是越權。
 *
 * 本來就沒有登入時直接結束，不視為錯誤——使用者要的結果已經成立了。
 */
export async function logout(): Promise<void> {
  const status = await getAuthStatus(true)
  if (status.account) {
    await runGcloud(['auth', 'revoke', status.account, '--quiet'])
  }
  invalidateAuthCache()
}
