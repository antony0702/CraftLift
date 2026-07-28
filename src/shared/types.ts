// 主行程與畫面共用的型別定義。
// 放在 shared/ 是為了讓兩邊永遠對得起來——改了型別，兩邊都會同時報錯。

/** gcloud 在這台電腦上的安裝狀態 */
export interface GcloudStatus {
  /** 是否已安裝且能正常執行 */
  installed: boolean
  /** gcloud 執行檔的完整路徑，未安裝時為 null */
  path: string | null
  /** gcloud 版本字串，例如 "531.0.0"，取不到時為 null */
  version: string | null
}

/** 目前登入 gcloud 的 Google 帳號狀態 */
export interface AuthStatus {
  /** 是否已有帳號登入 */
  loggedIn: boolean
  /** 目前作用中的帳號 email，未登入時為 null */
  account: string | null
}

/** 所有 gcloud 操作的統一回傳格式。
 *  不用丟例外的方式跨越 IPC，因為 Error 物件在 IPC 傳遞時會掉資訊。 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
