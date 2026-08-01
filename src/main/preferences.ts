import { app, nativeTheme } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Preferences } from '@shared/types'

const DEFAULTS: Preferences = {
  language: 'zh-TW',
  theme: 'system',
  uiScale: 'auto',
  // 預設開啟，讓使用者開機後就能一點叫出來看伺服器狀態。
  // 這只影響 CraftLift 自己，跟雲端伺服器是否執行完全無關。
  launchAtLogin: true,
  backupIntervalHours: 6,
  backupToLocalOnShutdown: true,
  remindModRestart: true,
  localBackupDir: null,
  lastProjectId: null
}

function filePath(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

let cache: Preferences | null = null

/**
 * 同步取得已載入的偏好設定。
 *
 * 視窗 resize 每秒會觸發上百次，處理函式必須是同步的——每次都 await
 * 一個 Promise 會讓縮放慢半拍，拖曳時就看得出延遲。設定檔載入後就
 * 一直在記憶體裡，這裡直接讀它。尚未載入時回傳 null，呼叫端跳過即可。
 */
export function getCachedPreferences(): Preferences | null {
  return cache
}

export async function getPreferences(): Promise<Preferences> {
  if (cache) return cache
  try {
    const text = await readFile(filePath(), 'utf8')
    cache = { ...DEFAULTS, ...(JSON.parse(text) as Partial<Preferences>) }
  } catch {
    // 第一次啟動還沒有設定檔，用預設值
    cache = { ...DEFAULTS }
  }
  return cache
}

export async function setPreferences(updates: Partial<Preferences>): Promise<Preferences> {
  const current = await getPreferences()
  const next: Preferences = { ...current, ...updates }
  cache = next
  await writeFile(filePath(), JSON.stringify(next, null, 2), 'utf8')

  if (updates.launchAtLogin !== undefined) {
    applyLaunchAtLogin(next.launchAtLogin)
  }
  if (updates.theme !== undefined) {
    applyTheme(next.theme)
  }
  return next
}

/**
 * 把配色選擇交給 Electron。
 *
 * 設定 themeSource 之後，'system' 會自動跟隨作業系統，而且使用者在
 * 系統設定裡切換時 nativeTheme 會發出事件，不需要我們自己輪詢。
 */
export function applyTheme(choice: Preferences['theme']): void {
  nativeTheme.themeSource = choice
}

/** 目前實際採用的配色。'system' 解析後的結果就在這裡。 */
export function effectiveTheme(): 'light' | 'dark' {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

/**
 * 設計時的基準視窗大小。視窗剛好這麼大時，介面是 1.1 倍——
 * 那是實測下來最舒服的密度。
 */
const BASE_WIDTH = 1000
const BASE_HEIGHT = 700
const BASE_SCALE = 1.1

/**
 * 由視窗大小算出縮放倍率。
 *
 * 寬與高各算一次取較小者：只看寬度的話，把視窗拉成又寬又扁時內容
 * 會被放大到垂直方向裝不下，反而更難用。
 *
 * 上下限是為了避免極端視窗尺寸把介面壓成看不見或撐到荒謬。
 */
export function autoScaleFor(width: number, height: number): number {
  const ratio = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT)
  const scale = BASE_SCALE * ratio
  return Math.min(2.4, Math.max(0.8, Math.round(scale * 100) / 100))
}

/** 把「開機自動啟動」的設定同步到作業系統 */
export function applyLaunchAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    // 開機啟動時直接縮到系統匣，不要跳一個視窗打斷使用者
    args: ['--hidden']
  })
}

/** 預設的本機備份資料夾 */
export function defaultLocalBackupDir(): string {
  return join(app.getPath('documents'), 'CraftLift Backups')
}
