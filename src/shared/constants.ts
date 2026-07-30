/** 打在所有由 CraftLift 建立的資源上的標籤。
 *  清單頁只顯示帶有這個標籤的機器，避免動到使用者其他用途的 VM。 */
export const CRAFTLIFT_LABEL = 'craftlift'

/** VM metadata 的鍵名。
 *  用 metadata 而不是 label 存顯示名稱，是因為 GCP 的 label 只接受
 *  小寫英數字與連字號，存不了中文；metadata 則可以放任意文字。 */
export const META = {
  displayName: 'craftlift-display-name',
  mcVersion: 'craftlift-mc-version',
  tier: 'craftlift-tier',
  createdAt: 'craftlift-created-at',
  /** 主程式種類。v1.1.0 之前建立的機器沒有這個鍵，讀不到就是 vanilla。 */
  flavor: 'craftlift-flavor',
  loaderVersion: 'craftlift-loader-version'
} as const

/** Minecraft 伺服器在 VM 上的安裝位置 */
export const REMOTE = {
  serverDir: '/opt/minecraft',
  backupDir: '/opt/minecraft/backups',
  modsDir: '/opt/minecraft/mods',
  /**
   * 停用中的模組放這裡。
   *
   * 兩個載入器掃 mods 資料夾時都不進子資料夾——Fabric 的
   * DirectoryModCandidateFinder 把 walkFileTree 的深度設成 1，NeoForge 的
   * ModsFolderLocator 用的是不遞迴的 Files.list()——所以放進來就等於停用，
   * 檔名不必動。這比改成 .disabled 好的地方是：mods 底下永遠就是「實際會
   * 載入的那些」，整包抓回電腦可以直接用。
   */
  inactiveModsDir: '/opt/minecraft/mods/inactive',
  logFile: '/opt/minecraft/logs/latest.log',
  serviceName: 'minecraft',
  rconPort: 25575,
  gamePort: 25565
} as const

/** 保留的備份份數上限，超過就刪最舊的 */
export const BACKUP_KEEP = 5

/**
 * 機型方案。
 *
 * 刻意用「幾個人一起玩」當作選擇依據，而不是叫使用者去看懂 e2-standard-2
 * 是什麼意思。這裡不標任何金額——估價算錯比不估更糟，UI 上改成提供
 * 連結讓使用者去看 Google 官方的即時費用。
 *
 * jvmHeap 保留約 1/4 記憶體給作業系統與 JVM 本身的非堆積開銷，
 * 全部給堆積會讓系統在尖峰時被 OOM killer 砍掉。
 */
export interface Tier {
  id: 'small' | 'standard' | 'large'
  machineType: string
  cpus: number
  ramGb: number
}

export const TIERS: Tier[] = [
  { id: 'small', machineType: 'e2-medium', cpus: 2, ramGb: 4 },
  { id: 'standard', machineType: 'e2-standard-2', cpus: 2, ramGb: 8 },
  { id: 'large', machineType: 'e2-standard-4', cpus: 4, ramGb: 16 }
]

export const DEFAULT_TIER = 'standard'

/**
 * 依機器記憶體換算要給 JVM 的堆積大小。
 *
 * 保留約四分之一給作業系統與 JVM 自身的非堆積開銷（執行緒堆疊、
 * metaspace、GC 結構）。全部給堆積的話，機器會在尖峰時被系統的
 * OOM killer 直接砍掉，比伺服器卡頓嚴重得多。
 */
export function jvmHeapFor(memoryGb: number): string {
  const heap = Math.max(1, Math.floor(memoryGb * 0.75))
  return `${heap}G`
}

/**
 * 模組載入器。
 *
 * 三個都只是「換掉 server.jar」而已，對 CraftLift 來說差別在於安裝方式與
 * 支援的 Minecraft 版本範圍。玩家端也必須裝同一個載入器與同一份模組——
 * 這是使用者最容易忽略的一件事，介面上要講。
 *
 * 插件伺服器（Paper）不在這張清單裡：它吃的是外掛不是模組，玩家端什麼都
 * 不用裝，概念不同，之後另外處理。
 */
export interface Loader {
  id: 'fabric' | 'neoforge' | 'forge'
  /** 這個載入器支援的最舊 Minecraft 版本 */
  minMcVersion: string
}

export const LOADERS: Loader[] = [
  { id: 'fabric', minMcVersion: '1.14' },
  { id: 'neoforge', minMcVersion: '1.20.1' },
  { id: 'forge', minMcVersion: '1.7.10' }
]

/**
 * 比較兩個 Minecraft 版本號。
 *
 * 只處理 1.21.4 這種正式版編號——建立畫面的版本清單本來就沒有快照版。
 * 段數不同時（1.21 與 1.21.4）缺的段當 0，所以 1.21 < 1.21.4。
 */
export function mcVersionAtLeast(version: string, minimum: string): boolean {
  const parse = (v: string): number[] => v.split('.').map((part) => Number(part) || 0)
  const a = parse(version)
  const b = parse(minimum)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return true
}

/**
 * 低於這個記憶體就提醒使用者模組會不夠跑。
 *
 * 不是硬性下限——模組數量差很多，二十個模組跟三百個模組不是同一回事。
 * 但 4GB 配上一份中型模組包幾乎一定會卡，先講比事後才發現好。
 */
export const MODDED_RECOMMENDED_RAM_GB = 8

/** 可選區域。預設彰化，台灣玩家延遲最低。 */
export interface Zone {
  id: string
  region: string
}

export const ZONES: Zone[] = [
  { id: 'asia-east1-b', region: 'asia-east1' },
  { id: 'asia-northeast1-b', region: 'asia-northeast1' },
  { id: 'asia-southeast1-b', region: 'asia-southeast1' },
  { id: 'us-central1-a', region: 'us-central1' },
  { id: 'europe-west1-b', region: 'europe-west1' }
]

export const DEFAULT_ZONE = 'asia-east1-b'

/** 磁碟預設 50GB pd-balanced。
 *  不用 pd-standard(HDD) 是因為 Minecraft 載入區塊很吃隨機讀取，HDD 會明顯卡頓。 */
export const DEFAULT_DISK_GB = 50
export const DISK_TYPE = 'pd-balanced'

/** 預設啟用靜態 IP。關掉的話 VM 每次重開機位址都會變。 */
export const DEFAULT_USE_STATIC_IP = true

/** 自動建立的預算警示金額（美元）。
 *  Google 會在達到門檻時直接寄信給使用者，這是唯一不需要 app 開著就能生效的防護。 */
export const BUDGET_ALERT_USD = 250

/** 需要啟用的 GCP API */
export const REQUIRED_APIS = [
  'compute.googleapis.com',
  'cloudbilling.googleapis.com',
  'billingbudgets.googleapis.com'
] as const

/** 使用者查看真實額度的官方頁面。
 *  我們不自己算錢，一律導向 Google 自己的數字。 */
export const BILLING_CONSOLE_URL = 'https://console.cloud.google.com/billing'
export const PRICING_CALCULATOR_URL = 'https://cloud.google.com/products/calculator'
