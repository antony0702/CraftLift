// 主行程與畫面共用的型別定義。
// 放在 shared/ 是為了讓兩邊永遠對得起來——改了型別，兩邊都會同時報錯。

/** gcloud 在這台電腦上的安裝狀態 */
export interface GcloudStatus {
  installed: boolean
  path: string | null
  version: string | null
}

/** 目前登入 gcloud 的 Google 帳號狀態 */
export interface AuthStatus {
  loggedIn: boolean
  account: string | null
}

/** 一個 GCP 帳單帳戶。
 *  注意：Cloud Billing API 沒有任何欄位能區分「試用」與「付費」帳戶，
 *  所以我們不猜，一律要求使用者勾選免責聲明。 */
export interface BillingAccount {
  id: string
  displayName: string
  open: boolean
}

/** CraftLift 專用的 GCP 專案 */
export interface Project {
  projectId: string
  billingAccountId: string | null
}

/** VM 的執行狀態，直接對應 GCP 的 status 欄位 */
export type InstanceState =
  | 'PROVISIONING'
  | 'STAGING'
  | 'RUNNING'
  | 'STOPPING'
  | 'TERMINATED'
  | 'SUSPENDED'
  | 'UNKNOWN'

/** 一台 Minecraft 伺服器 */
export interface MinecraftServer {
  /** GCP 執行個體名稱，例如 craftlift-a1b2c3d4。永遠是安全字元。 */
  name: string
  /** 使用者取的顯示名稱，可以是中文。存在 metadata 裡。 */
  displayName: string
  zone: string
  state: InstanceState
  /** 對外 IP，機器關機時可能為 null */
  externalIp: string | null
  machineType: string
  mcVersion: string
  tier: string
  createdAt: string | null
}

/** 建立伺服器精靈收集到的設定 */
export interface CreateServerOptions {
  displayName: string
  mcVersion: string
  tier: string
  zone: string
  diskGb: number
  useStaticIp: boolean
  /** 使用者是否已勾選費用免責聲明。未勾選時主行程會直接拒絕。 */
  acceptedDisclaimer: boolean
}

/** 建立流程的進度回報，用來在 UI 上顯示現在做到哪 */
export interface ProgressUpdate {
  step: string
  detail?: string
  done: boolean
  failed?: boolean
}

/** Mojang 官方版本清單裡的一個版本 */
export interface McVersion {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
}

/** VM 上的一個檔案或資料夾 */
export interface RemoteFile {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: number
}

/** VM 上的一份備份 */
export interface Backup {
  fileName: string
  path: string
  size: number
  modifiedAt: number
}

/** server.properties 的內容，以鍵值對表示 */
export type ServerProperties = Record<string, string>

/** 玩家名單（白名單／管理員／封鎖） */
export interface PlayerLists {
  whitelist: string[]
  ops: string[]
  banned: string[]
}

/** 應用程式偏好設定 */
export interface Preferences {
  language: string
  /** 開機自動啟動。預設開啟，因為「到期前自動備份」需要 app 有在跑才能生效。 */
  launchAtLogin: boolean
  /** VM 上自動備份的間隔（小時） */
  backupIntervalHours: number
  /** 關機前自動把備份拉回本機 */
  backupToLocalOnShutdown: boolean
  /** 本機備份存放位置，null 表示使用預設的「文件」資料夾 */
  localBackupDir: string | null
}

/** 所有跨 IPC 操作的統一回傳格式。
 *  不用丟例外，因為 Error 物件在 IPC 傳遞時會掉資訊。 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
