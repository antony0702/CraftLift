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
