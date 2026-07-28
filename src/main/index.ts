import { app, BrowserWindow, Menu, nativeImage, nativeTheme, shell, Tray } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import {
  applyLaunchAtLogin,
  applyTheme,
  autoScaleFor,
  effectiveTheme,
  getPreferences
} from './preferences'
import { closeAllConnections } from './server/ssh'

/**
 * 系統匣圖示：世界方塊的 32×32 版本。
 *
 * 內嵌成 base64 是為了避免打包後找不到檔案路徑的麻煩。原始圖由
 * design/generate-icon.js 產生，要改圖就改那支程式再重跑，
 * 把 build/tray-base64.txt 的內容貼回這裡。
 */
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAnklEQVR42mNgGAWjgEygnTPvPzIe/g5At5AQHj4OINViqjuE7g7AZVBcjxdeTDUHDZgDhAzc/4MwuUFNrMOkvbLBePA6AB1TmghhFqLjoeMAch2Cy+LB6wAVGZH/pGB0Cy205UjCQ98BMEyqxYPXAeQ6hGoWDxoHoIMHVfr/8eH/ByrwYorbAwPuAEIOobnFg8YBuBxENwsHnQOGDQAAT8Pm1lTSPWkAAAAASUVORK5CYII='

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** 區分「關閉視窗」與「真的要結束程式」 */
let isQuitting = false

function createWindow(show = true): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 以下三項是 Electron 的安全基本盤，不要改：
      contextIsolation: true, // 畫面與 preload 的變數完全隔離
      nodeIntegration: false, // 畫面拿不到 Node.js API
      sandbox: true // 畫面跑在沙箱裡
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (show) mainWindow?.show()
    void applyZoom()
  })

  /**
   * 視窗大小改變時重算縮放。
   *
   * 拖曳邊框時 resize 會連續觸發上百次，每次都設定縮放會讓畫面抖動，
   * 所以延遲到停手之後再套用。
   *
   * 注意：setZoomFactor 不會反過來改變 getContentSize 回傳的值
   * （那是與縮放無關的邏輯像素），所以這裡不會形成迴圈。
   */
  let resizeTimer: NodeJS.Timeout | null = null
  mainWindow.on('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => void applyZoom(), 80)
  })

  /**
   * 按下關閉時縮到系統匣，不要真的結束程式。
   *
   * 這不是為了黏著使用者，而是因為「試用到期前 7 天自動把存檔備份到本機」
   * 這個功能只有在 CraftLift 還在執行時才可能發生。程式關掉了，那道保護
   * 就失效，使用者的世界會在 90 天到期時真的消失。
   */
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // 外部連結一律丟給系統瀏覽器，不要在應用程式視窗裡開——
  // 那會讓使用者分不清哪裡是本軟體、哪裡是 Google 的網站。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 套用介面縮放。
 *
 * 縮放必須由主行程設定：畫面跑在沙箱裡，拿不到 webFrame。
 * 設定為 'auto' 時依視窗大小換算，否則用使用者指定的固定倍率。
 */
/** 上次實際套用的縮放。相同就不重設，避免無謂的整頁重排。 */
let appliedZoom = 0

async function applyZoom(): Promise<void> {
  if (!mainWindow) return
  const prefs = await getPreferences()
  const [width, height] = mainWindow.getContentSize()
  const factor = prefs.uiScale === 'auto' ? autoScaleFor(width, height) : prefs.uiScale

  // setZoomFactor 會強制整頁重新排版與重繪。拖曳視窗邊框時，縮放值
  // 四捨五入到小數兩位後其實常常沒變，這時再設一次只是白白讓畫面頓一下。
  if (factor === appliedZoom) return
  appliedZoom = factor
  mainWindow.webContents.setZoomFactor(factor)
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow(true)
    return
  }
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
  tray = new Tray(icon)
  tray.setToolTip('CraftLift')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '開啟 CraftLift', click: showWindow },
      { type: 'separator' },
      {
        label: '結束',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', showWindow)
}

// 只允許一個執行個體。使用者再次點圖示時，把既有視窗叫出來而不是開第二個。
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  void app.whenReady().then(async () => {
    registerIpcHandlers(() => mainWindow)

    const prefs = await getPreferences()
    applyLaunchAtLogin(prefs.launchAtLogin)
    applyTheme(prefs.theme)

    // 使用者在作業系統層級切換淺色／深色時通知畫面。
    // 只有 theme 設為 system 時這件事才會發生，但監聽不需要判斷——
    // themeSource 被鎖定成 light 或 dark 時，nativeTheme 不會發事件。
    nativeTheme.on('updated', () => {
      mainWindow?.webContents.send('theme:changed', effectiveTheme())
    })

    // 開機自動啟動時帶 --hidden，直接縮在系統匣，不要跳視窗打斷使用者
    const startHidden = process.argv.includes('--hidden')
    createWindow(!startHidden)
    createTray()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(true)
    })
  })
}

app.on('before-quit', () => {
  isQuitting = true
  closeAllConnections()
})

// 視窗全關了也不要結束，因為程式要留在系統匣繼續做到期前的備份。
app.on('window-all-closed', () => {
  // 刻意留空
})
