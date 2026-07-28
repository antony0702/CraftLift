import type { AuthStatus } from '@shared/types'
import { runGcloud, runGcloudJson } from './exec'

/**
 * 查詢目前登入的 Google 帳號。
 * 只讀取本機既有的憑證，不會觸發任何登入流程。
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const accounts = await runGcloudJson<Array<{ account: string; status: string }>>(['auth', 'list'])
  const active = accounts.find((a) => a.status === 'ACTIVE')
  return { loggedIn: Boolean(active), account: active?.account ?? null }
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
  return getAuthStatus()
}
