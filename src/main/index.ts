import { app, BrowserWindow, Menu, nativeImage, shell, Tray } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { applyLaunchAtLogin, getPreferences } from './preferences'
import { closeAllConnections } from './server/ssh'

/** 托盤圖示。內嵌成 base64 是為了避免打包後找不到檔案路徑的各種麻煩。
 *  目前是暫時的純色圖示，之後會換成正式美術。 */
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABRUlEQVR4nMXXVVICUBjF8W8hoqJiYGOgomKgz7YY2IGBHRgbshO7sAO7cDXHcRwGHFEejHMWcH//lztzr4iPGZ5HkPtkRc6jFdkPw8i6H4L+bhD62wFk3vQj47of6Vd90F32QufoQZqjG6kXXUg5t0B7ZoGv8z8t/2Ucec4xGJyj+CmuPe1E8kkHko7bkXjUhoRD8/dBf41rDszQ7Ld6j/gvPN7egjh7M6h47F4TYnYb3REMPGanwR3AwKO3PQMIeNRWPah45GYd1Bu1ECauXq+BMPGINROEiYevmiBMPGylGsLEQ21VECauslVCmLhquQLCxEOWjBAmHrxohDDxoIVyCBNXzpdBmLhyrhTCxANnSyBMPGCmGMLE/aeL3t8EVPxtDFwx5RHAwBWThe4ABu43UfDxb0DFXaPirlFxb/u1q/bFXgEOsphuY1p1MQAAAABJRU5ErkJggg=='

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
    icon: join(__dirname, '../../build/icon.png'),
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
