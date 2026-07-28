import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type { AuthStatus, GcloudStatus, Result } from '@shared/types'
import { getAuthStatus, getGcloudStatus, login } from './gcloud'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 以下三項是 Electron 的安全基本盤，不要改：
      contextIsolation: true, // 畫面與 preload 的變數完全隔離
      nodeIntegration: false, // 畫面拿不到 Node.js API
      sandbox: true // 畫面跑在沙箱裡
    }
  })

  // 等畫面準備好再顯示，避免使用者看到一片白閃過
  mainWindow.on('ready-to-show', () => mainWindow.show())

  // 畫面裡的外部連結（例如「查看剩餘額度」）一律丟給系統瀏覽器開，
  // 不要在應用程式視窗內開啟——那會讓使用者分不清哪裡是本軟體、哪裡是 Google。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    // 開發模式：連到 Vite 的開發伺服器，存檔即時更新
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    // 正式模式：載入打包好的靜態檔案
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 把主行程的能力包成 IPC 通道給畫面呼叫。
 *
 * 統一用 Result 型別回傳而不是直接丟例外：Error 物件跨越 IPC 時
 * 會被序列化成難以辨識的字串，改用明確的成功／失敗結構好處理得多。
 */
function registerIpcHandlers(): void {
  const wrap =
    <T>(fn: () => Promise<T>) =>
    async (): Promise<Result<T>> => {
      try {
        return { ok: true, data: await fn() }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }

  ipcMain.handle('gcloud:status', wrap<GcloudStatus>(getGcloudStatus))
  ipcMain.handle('gcloud:authStatus', wrap<AuthStatus>(getAuthStatus))
  ipcMain.handle('gcloud:login', wrap<AuthStatus>(login))
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  // macOS 的慣例：點 Dock 圖示時若沒有視窗就開一個。
  // 本專案第一版只做 Windows，但留著不影響任何事。
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
