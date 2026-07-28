import { contextBridge, ipcRenderer } from 'electron'
import type { AuthStatus, GcloudStatus, Result } from '@shared/types'

/**
 * 這裡是安全邊界。
 *
 * 畫面（renderer）本身沒有任何 Node.js 或系統權限，它只能呼叫下面這幾個
 * 明確列出來的函式。這代表就算未來畫面載入了有問題的第三方程式碼，
 * 它能做的事情也只有「問 gcloud 狀態」「請求登入」這幾件，無法讀寫任意檔案
 * 或執行任意指令。
 *
 * 每新增一個能力都要在這裡明確開一個口，不要圖方便暴露通用的
 * 「執行任意指令」介面——那等於把安全邊界整個拆掉。
 */
const api = {
  gcloud: {
    /** 檢查 gcloud 是否已安裝 */
    status: (): Promise<Result<GcloudStatus>> => ipcRenderer.invoke('gcloud:status'),
    /** 查詢目前登入的 Google 帳號（不會觸發登入） */
    authStatus: (): Promise<Result<AuthStatus>> => ipcRenderer.invoke('gcloud:authStatus'),
    /** 啟動登入流程，會打開瀏覽器並等待使用者完成授權 */
    login: (): Promise<Result<AuthStatus>> => ipcRenderer.invoke('gcloud:login')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type CraftLiftApi = typeof api
