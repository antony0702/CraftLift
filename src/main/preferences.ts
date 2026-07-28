import { app, nativeTheme } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Preferences } from '@shared/types'

const DEFAULTS: Preferences = {
  language: 'zh-TW',
  theme: 'system',
  uiScale: 1,
  // 預設開啟。「試用到期前 7 天自動備份到本機」只有在 CraftLift 有在執行時
  // 才可能發生，關掉這個選項等於讓那道保護失效。
  launchAtLogin: true,
  backupIntervalHours: 6,
  backupToLocalOnShutdown: true,
  localBackupDir: null
}

function filePath(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

let cache: Preferences | null = null

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
