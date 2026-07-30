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

/**
 * 伺服器跑的是哪一種主程式。
 *
 * vanilla 是 Mojang 官方的 server.jar；其餘三個是社群做的模組載入器，
 * 玩家端必須裝同一個載入器、同一份模組才連得進來。
 *
 * 這個聯集會再長——插件伺服器（Paper）預計在之後的版本加入。加新成員時
 * 要一併檢查 LOADERS 常數與所有 switch，別讓新種類靜靜掉進 vanilla 分支。
 */
export type ServerFlavor = 'vanilla' | 'fabric' | 'neoforge' | 'forge'

/** 模組載入器，也就是 vanilla 以外的種類 */
export type ModLoader = Exclude<ServerFlavor, 'vanilla'>

/** 某個載入器可以搭配某個 Minecraft 版本的一個版本 */
export interface LoaderVersion {
  /** 載入器自己的版本號，例如 Fabric 的 0.17.2、NeoForge 的 21.4.60 */
  id: string
  /** 正式版。false 代表 beta 之類的測試版本。 */
  stable: boolean
}

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
  /**
   * 主程式種類。
   *
   * v1.1.0 之前建立的機器沒有這個 metadata，主行程一律填 'vanilla'——
   * 那些機器裝的確實是原版。畫面這端可以當它一定有值。
   */
  flavor: ServerFlavor
  /** 載入器版本。原版時為 null。 */
  loaderVersion: string | null
  tier: string
  createdAt: string | null
}

/** 一種可選的機器規格 */
export interface MachineType {
  /** GCP 的機型名稱，例如 e2-standard-2 */
  name: string
  /** 系列代號，例如 e2、n2、c3 */
  family: string
  cpus: number
  memoryGb: number
  /** 共用核心機型（e2-micro 等）效能會被限制 */
  isSharedCpu: boolean
  description: string
}

/**
 * 費用估算結果。
 *
 * 這是估計值而非帳單：不含網路流量（取決於玩家人數與遊玩時數）、
 * 不含任何折扣或免費額度。complete 為 false 表示有項目查不到單價，
 * 此時 UI 必須明確告知使用者估算不完整，不可假裝數字是準的。
 */
export interface PriceEstimate {
  currency: string
  /** 機器執行中的每小時費用（含固定位址） */
  hourlyRunning: number
  /** 全月不關機的總費用（含磁碟） */
  monthlyAlwaysOn: number
  /** 磁碟每月費用。磁碟就算關機也照算。 */
  monthlyDisk: number
  complete: boolean
  /** 查不到單價的項目 */
  missing: string[]
}

/** 建立伺服器精靈收集到的設定 */
export interface CreateServerOptions {
  displayName: string
  mcVersion: string
  /** 主程式種類。預設 'vanilla'。 */
  flavor: ServerFlavor
  /**
   * 載入器版本。
   *
   * 空字串代表「交給 CraftLift 挑」——主行程會取該 Minecraft 版本
   * 對應的最新正式版。原版時忽略這個欄位。
   */
  loaderVersion: string
  /** GCP 機型名稱。可以是預設規格，也可以是 e2-custom-4-8192 這種自訂規格。 */
  machineType: string
  /** 這個機型的核心數與記憶體，用來換算 JVM 記憶體與顯示 */
  cpus: number
  memoryGb: number
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

/**
 * 遠端複製或搬移的一筆來源與去處。
 *
 * 去處是完整路徑而不是「目標資料夾」，因為撞名時使用者可能選了「兩者都保留」，
 * 那筆的檔名就會跟來源不一樣。把最終名稱在畫面那端決定完再送過來，
 * 主行程就不用再猜。
 */
export interface TransferItem {
  from: string
  to: string
  /** 去處已經存在時是否覆蓋。false（預設）代表呼叫端保證不會撞名。 */
  replace?: boolean
}

/** 一筆上傳：本機的哪個檔案或資料夾，要放到遠端的哪個完整路徑 */
export interface UploadItem {
  localPath: string
  remotePath: string
  replace?: boolean
}

/**
 * mods 資料夾裡的一個模組。
 *
 * 「停用」的做法是把檔案搬到 mods/inactive——兩個載入器掃 mods 時都不進
 * 子資料夾，所以搬進去就等於關掉，檔名不用動。這比刪掉好：排查模組衝突
 * 就是一個一個關掉再開回來，不用重新下載。
 */
export interface ModFile {
  /** 磁碟上的實際檔名 */
  fileName: string
  /** 完整路徑。停用中的會在 mods/inactive 底下。檔案操作都用這個。 */
  path: string
  /** 去掉 .jar 後的名稱，給人看的 */
  name: string
  enabled: boolean
  /**
   * 副檔名是不是小寫的 .jar。
   *
   * Fabric 的比對區分大小寫（`fileName.endsWith(".jar")`），NeoForge 會先
   * 轉小寫——所以 MOD.JAR 在 Fabric 上根本不會被載入。畫面要能把這種檔案
   * 跟真的啟用中的模組分開，否則會標成「啟用中」卻怎麼都沒作用。
   */
  loadable: boolean
  size: number
  modifiedAt: number
}

/**
 * 一趟進行中（或剛結束）的上傳／下載。
 *
 * 狀態由主行程保管而不是畫面——傳大檔要好幾分鐘，使用者這段期間會切分頁，
 * 進度存在元件裡的話切走一次就沒了，回來會以為傳輸消失了。
 */
export interface Transfer {
  id: string
  /**
   * backup 是「伺服器正在打包一份備份」，不是傳輸，但它跟上傳下載一樣
   * 會跑好幾分鐘、而且切分頁之後依然在跑，所以共用同一套登記機制。
   * 不要為這種長時間操作再發明第三種做法。
   */
  kind: 'upload' | 'download' | 'backup'
  /** 哪一台伺服器的。畫面只顯示自己這台的。 */
  server: string
  /**
   * 給人看的說明，通常是檔名。
   * kind 是 backup 時放的是 'world' 或 'setup'，畫面靠它分辨哪一區在打包。
   */
  label: string
  /** 總位元組。0 代表算不出來，畫面要顯示成不確定進度而不是假裝 0%。 */
  totalBytes: number
  doneBytes: number
  /** cancelled 跟 failed 分開：使用者自己按的不是錯誤，不該用紅字罵他 */
  state: 'running' | 'paused' | 'done' | 'failed' | 'cancelled'
  error?: string
}

/**
 * 模組清單，外加「現在跑的這份 Minecraft 有沒有載到最新的模組」。
 *
 * needsRestart 由機器上的時間戳算出來（模組的修改時間 vs 服務的啟動時間），
 * 不是畫面自己記的旗標。旗標會在切分頁、關掉 app、或從主控台分頁重啟之後
 * 說謊；時間戳不會。
 */
export interface ModsListing {
  mods: ModFile[]
  needsRestart: boolean
  /** Minecraft 服務正在跑。沒在跑時不該叫使用者「重新啟動」。 */
  running: boolean
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

/** 介面配色。system 表示跟隨作業系統設定。 */
export type ThemeChoice = 'light' | 'dark' | 'system'

/** 應用程式偏好設定 */
export interface Preferences {
  language: string
  /** 使用者選的配色。實際採用哪一套要看 system 解析後的結果。 */
  theme: ThemeChoice
  /**
   * 介面整體縮放。
   *
   * 'auto' 表示跟著視窗大小走——視窗變大，整個介面等比變大。
   * 也可以指定固定倍率（1 = 100%）。
   *
   * 非 11 倍數的倍率會讓點陣字落在非整數位置而略微變糊，但實測觀感
   * 影響很小，遠不如字太小或版面比例失衡來得難用。
   */
  uiScale: number | 'auto'
  /** 開機自動啟動。預設開啟，因為「到期前自動備份」需要 app 有在跑才能生效。 */
  launchAtLogin: boolean
  /** VM 上自動備份的間隔（小時） */
  backupIntervalHours: number
  /** 關機前自動把備份拉回本機 */
  backupToLocalOnShutdown: boolean
  /** 本機備份存放位置，null 表示使用預設的「文件」資料夾 */
  localBackupDir: string | null
  /**
   * 上次使用的 GCP 專案，純粹是快取。
   *
   * 真正的來源仍然是 GCP 上帶有 craftlift 標籤的專案——這樣換電腦或
   * 重灌後登入同一個帳號依然找得回來。但每次啟動都去查要四秒多，
   * 所以先用記住的值讓畫面立刻出來，再在背景核對。
   */
  lastProjectId: string | null
}

/**
 * 自動更新的狀態。
 *
 * 做成一個狀態機而不是好幾個布林值，是因為「正在檢查」「有新版」「下載中」
 * 「裝好等重開」這幾件事永遠只會成立其中一個。分開存遲早會出現
 * 「同時在下載又同時是最新版」這種畫面。
 */
export type UpdateState =
  /** 還沒查過 */
  | { phase: 'idle' }
  /** 開發模式或未打包，沒有更新來源可查 */
  | { phase: 'unsupported' }
  | { phase: 'checking' }
  /** 已經是最新版。version 是目前跑的版本。 */
  | { phase: 'latest'; version: string }
  /** 有新版，等使用者決定要不要下載 */
  | { phase: 'available'; version: string; notes: string | null; sizeBytes: number | null }
  | { phase: 'downloading'; version: string; percent: number }
  /** 已下載完成，等使用者決定何時重開安裝 */
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string }

/** 使用者填寫的意見回饋 */
export interface FeedbackInput {
  /** 必填 */
  subject: string
  /** 選填 */
  name: string
  /** 必填 */
  body: string
}

/** 所有跨 IPC 操作的統一回傳格式。
 *  不用丟例外，因為 Error 物件在 IPC 傳遞時會掉資訊。 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
