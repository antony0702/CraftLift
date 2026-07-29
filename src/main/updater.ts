import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import type { UpdateState } from '@shared/types'

/**
 * 自動更新。
 *
 * 更新來源是本專案的 GitHub Releases——electron-builder 發佈時會一併產生
 * latest.yml，裡面寫著最新版本號、安裝檔位址與 SHA512。這支程式做的事就是
 * 去讀那份檔案、比對版本、下載、重開安裝。
 *
 * 使用者資料不需要特別搬移：偏好設定在 %APPDATA%\CraftLift、SSH 金鑰在
 * ~\.ssh、本機備份在「文件」資料夾，伺服器本體在 GCP 上。NSIS 覆蓋更新
 * 只動安裝目錄（%LOCALAPPDATA%\Programs\CraftLift），上面那些都不在裡面。
 * 唯一要守住的規則是：**不要把任何使用者資料寫進安裝目錄。**
 */

let state: UpdateState = { phase: 'idle' }
let getWindow: () => BrowserWindow | null = () => null
/** 安裝前要做的收尾（設定「這次是真的要結束」、關掉 SSH 連線） */
let prepareQuit: () => void = () => {}

function setState(next: UpdateState): void {
  state = next
  getWindow()?.webContents.send('update:changed', next)
}

export function getUpdateState(): UpdateState {
  return state
}

/**
 * 把 electron-updater 的錯誤翻成使用者看得懂的話。
 *
 * 原始訊息長這樣：「Cannot find latest.yml in the latest release artifacts」、
 * 「net::ERR_INTERNET_DISCONNECTED」。直接丟給使用者只會讓他來問我們。
 */
function friendlyError(err: Error): string {
  const raw = err.message || String(err)
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ENOTFOUND|ETIMEDOUT/i.test(raw)) {
    return '連不上網路，稍後再試'
  }
  // 還沒發過任何一版，或該版沒附 latest.yml。對使用者而言等同「沒有更新」。
  if (/404|latest\.yml|No published versions/i.test(raw)) {
    return '目前沒有可用的更新'
  }
  if (/sha512|checksum|signature/i.test(raw)) {
    return '下載到的檔案校驗不符，已中止安裝'
  }
  return raw
}

/**
 * 版本說明。
 *
 * GitHub 回傳的是 Release 內文，可能帶 HTML。畫面端一律當純文字顯示，
 * 所以在這裡就把標籤去掉——不要讓「從網路來的字串」有機會變成畫面上的元素。
 */
function plainNotes(info: UpdateInfo): string | null {
  const notes = info.releaseNotes
  const text = typeof notes === 'string' ? notes : null
  if (!text) return null
  const stripped = text
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!stripped) return null
  return stripped.length > 1200 ? `${stripped.slice(0, 1200)}…` : stripped
}

function downloadSize(info: UpdateInfo): number | null {
  return info.files?.[0]?.size ?? null
}

export function initUpdater(options: {
  getWindow: () => BrowserWindow | null
  prepareQuit: () => void
}): void {
  getWindow = options.getWindow
  prepareQuit = options.prepareQuit

  // 開發模式沒有 app-update.yml，任何檢查都只會拿到一個誤導人的錯誤。
  if (!app.isPackaged) {
    state = { phase: 'unsupported' }
    return
  }

  // 先問過使用者才下載。使用者的網路可能按流量計費，靜靜抓一個八十幾 MB
  // 的安裝檔不是我們該替他做的決定。
  autoUpdater.autoDownload = false
  // 也不要在下次結束時偷偷裝。CraftLift 平常縮在系統匣，使用者很少真的
  // 結束它——真的結束的那一次通常是他趕時間，不該在那時候跳安裝程式。
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => setState({ phase: 'checking' }))

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setState({
      phase: 'available',
      version: info.version,
      notes: plainNotes(info),
      sizeBytes: downloadSize(info)
    })
  })

  autoUpdater.on('update-not-available', () => {
    setState({ phase: 'latest', version: app.getVersion() })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    // 只在下載中才更新百分比。使用者若中途按了別的按鈕讓狀態變了，
    // 這裡不該把畫面拉回下載中。
    if (state.phase !== 'downloading') return
    setState({ ...state, percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setState({ phase: 'ready', version: info.version })
  })

  autoUpdater.on('error', (err: Error) => {
    setState({ phase: 'error', message: friendlyError(err) })
  })

  // 啟動後延遲再查。開場那幾秒 gcloud 的查詢正在跑（每次呼叫要三四秒），
  // 這時候再插一個網路請求進去，只會讓第一畫面更慢出來。更新永遠可以晚點講。
  setTimeout(() => {
    void checkForUpdate()
  }, 12_000)
}

/** 主動檢查。錯誤透過狀態回報，不往外丟。 */
export async function checkForUpdate(): Promise<void> {
  if (!app.isPackaged) return
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    setState({ phase: 'error', message: friendlyError(err as Error) })
  }
}

/** 使用者同意後才會走到這裡 */
export async function downloadUpdate(): Promise<void> {
  if (state.phase !== 'available') return
  setState({ phase: 'downloading', version: state.version, percent: 0 })
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    setState({ phase: 'error', message: friendlyError(err as Error) })
  }
}

/**
 * 重開並安裝。
 *
 * quitAndInstall 會叫 app.quit()，而 CraftLift 的視窗預設是「關閉即縮到
 * 系統匣」——不先把那道攔截解除，程式會卡在關不掉的狀態，安裝程式也就
 * 永遠等不到舊版退出。prepareQuit 就是來解這個的。
 */
export function installUpdate(): void {
  if (state.phase !== 'ready') return
  prepareQuit()
  // 第一個參數 isSilent、第二個 isForceRunAfter：裝完直接把新版叫起來，
  // 不要讓使用者面對一個「更新完就消失了」的程式。
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
}
