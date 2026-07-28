import type { BrowserWindow } from 'electron'
import { autoScaleFor, getCachedPreferences } from './preferences'

/**
 * 介面縮放。
 *
 * 獨立成一個模組，是因為視窗建立（index.ts）與偏好設定變更（ipc.ts）
 * 都要套用縮放。若讓兩邊互相匯入會形成循環相依，各自實作一份則會讓
 * 「上次套用值」不同步，導致該套用時被跳過。
 *
 * 縮放必須由主行程設定：畫面跑在沙箱裡，拿不到 webFrame。
 */

let target: BrowserWindow | null = null
/** 上次實際送出的倍率。相同就不重設，避免無謂的整頁重排。 */
let applied = 0

export function bindZoomTarget(window: BrowserWindow | null): void {
  target = window
  applied = 0
}

/**
 * 依目前設定與視窗大小套用縮放。
 *
 * 全程同步：拖曳視窗時這個函式每秒會被呼叫數十次，中間夾一個 await
 * 會讓縮放慢半拍，看起來就像跟不上滑鼠。
 */
export function applyZoom(): void {
  if (!target || target.isDestroyed()) return
  const prefs = getCachedPreferences()
  if (!prefs) return

  const [width, height] = target.getContentSize()
  const factor = prefs.uiScale === 'auto' ? autoScaleFor(width, height) : prefs.uiScale

  if (factor === applied) return
  applied = factor
  target.webContents.setZoomFactor(factor)
}
