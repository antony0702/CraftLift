import { app, BrowserWindow, Menu, nativeImage, nativeTheme, shell, Tray } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { applyLaunchAtLogin, applyTheme, effectiveTheme, getPreferences } from './preferences'
import { applyZoom, bindZoomTarget } from './zoom'
import { closeAllConnections } from './server/ssh'
import { initUpdater } from './updater'

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

  bindZoomTarget(mainWindow)

  mainWindow.on('ready-to-show', () => {
    if (show) mainWindow?.show()
    // 設定檔載入後才有縮放倍率可用；applyZoom 本身是同步的
    void getPreferences().then(() => applyZoom())
  })

  /**
   * 視窗大小改變時重算縮放。
   *
   * 用節流而不是防抖。防抖會在拖曳期間一直重置計時器，整個過程都不
   * 套用縮放，放手後才跳一階——看起來就是「拉到某個程度突然變大變小」。
   * 節流則是拖曳過程中持續套用，只限制頻率。
   *
   * 32 毫秒約等於每秒三十次，肉眼看起來是連續的，同時把整頁重排的
   * 次數壓在合理範圍。尾端再補一次，確保停手時的尺寸一定正確。
   *
   * 注意：setZoomFactor 不會反過來改變 getContentSize 回傳的值
   * （那是與縮放無關的邏輯像素），所以這裡不會形成迴圈。
   */
  let lastApplied = 0
  let trailing: NodeJS.Timeout | null = null
  mainWindow.on('resize', () => {
    const now = Date.now()
    if (now - lastApplied >= 32) {
      lastApplied = now
      applyZoom()
      return
    }
    if (trailing) clearTimeout(trailing)
    trailing = setTimeout(() => {
      lastApplied = Date.now()
      applyZoom()
    }, 32)
  })

  /**
   * 按下關閉時縮到系統匣，不要真的結束程式。
   *
   * 伺服器是一直在跑的東西，關掉視窗通常是「先收起來」而不是「不玩了」，
   * 所以留在系統匣一點就能叫回來。真的要結束請用系統匣選單的「結束」。
   *
   * 注意這跟雲端伺服器無關——結束 CraftLift 不會讓伺服器停下來，
   * 它會一直執行也一直計費，直到有人按下關機。
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

    // 更新的安裝會叫 app.quit()，但這個程式的視窗是「關閉即縮到系統匣」。
    // prepareQuit 先解除那道攔截並收掉 SSH 連線，否則舊版永遠不會退出，
    // 安裝程式也就一直等在那裡。
    initUpdater({
      getWindow: () => mainWindow,
      prepareQuit: () => {
        isQuitting = true
        closeAllConnections()
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(true)
    })
  })
}

app.on('before-quit', () => {
  isQuitting = true
  closeAllConnections()
})

// 視窗全關了也不要結束——程式要留在系統匣，等使用者叫它回來。
app.on('window-all-closed', () => {
  // 刻意留空
})
