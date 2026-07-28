import { contextBridge, ipcRenderer } from 'electron'
import type {
  AuthStatus,
  Backup,
  BillingAccount,
  CreateServerOptions,
  GcloudStatus,
  McVersion,
  MinecraftServer,
  PlayerLists,
  Preferences,
  RemoteFile,
  Result,
  ServerProperties
} from '@shared/types'

/**
 * 這裡是安全邊界。
 *
 * 畫面本身沒有任何 Node.js 或系統權限，只能呼叫下面明確列出的函式。
 * 就算未來畫面引入了有問題的第三方套件，它能做的也僅限於這張清單上的事。
 *
 * 每新增一個能力都要在這裡明確開一個口。**不要**為了方便而暴露
 * 「執行任意指令」或「讀寫任意路徑」這種通用介面——那等於把整道牆拆掉。
 */

type PlayerAction = 'whitelist-add' | 'whitelist-remove' | 'op' | 'deop' | 'ban' | 'pardon'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

const api = {
  /** 本機環境與 Google 帳號 */
  gcloud: {
    status: (): Promise<Result<GcloudStatus>> => invoke('gcloud:status'),
    authStatus: (): Promise<Result<AuthStatus>> => invoke('gcloud:authStatus'),
    login: (): Promise<Result<AuthStatus>> => invoke('gcloud:login')
  },

  /** GCP 專案與帳單 */
  project: {
    billingAccounts: (): Promise<Result<BillingAccount[]>> => invoke('project:billingAccounts'),
    current: (): Promise<Result<string | null>> => invoke('project:current'),
    ensure: (billingAccountId: string): Promise<Result<string>> =>
      invoke('project:ensure', billingAccountId),
    /** 徹底清除：刪掉整個專案，連同所有會計費的資源 */
    delete: (): Promise<Result<void>> => invoke('project:delete')
  },

  /** Minecraft 版本清單（來自 Mojang 官方公開資料） */
  mc: {
    versions: (includeSnapshots = false): Promise<Result<McVersion[]>> =>
      invoke('mc:versions', includeSnapshots),
    latest: (): Promise<Result<string>> => invoke('mc:latest')
  },

  /** 伺服器的建立與電源控制 */
  server: {
    list: (): Promise<Result<MinecraftServer[]>> => invoke('server:list'),
    create: (opts: CreateServerOptions): Promise<Result<MinecraftServer>> =>
      invoke('server:create', opts),
    get: (name: string, zone: string): Promise<Result<MinecraftServer>> =>
      invoke('server:get', name, zone),
    start: (name: string, zone: string): Promise<Result<void>> => invoke('server:start', name, zone),
    /** 關機。會先自動備份並把存檔帶回本機。 */
    stop: (name: string, zone: string): Promise<Result<void>> => invoke('server:stop', name, zone),
    delete: (name: string, zone: string): Promise<Result<void>> =>
      invoke('server:delete', name, zone)
  },

  /** Minecraft 行程本身的控制 */
  minecraft: {
    status: (
      name: string,
      zone: string
    ): Promise<
      Result<{
        running: boolean
        players: string[] | null
        playerCount: number | null
        maxPlayers: number | null
      }>
    > => invoke('mc:status', name, zone),
    start: (name: string, zone: string): Promise<Result<void>> => invoke('mc:start', name, zone),
    stop: (name: string, zone: string): Promise<Result<void>> => invoke('mc:stop', name, zone),
    restart: (name: string, zone: string): Promise<Result<void>> => invoke('mc:restart', name, zone),
    command: (name: string, zone: string, command: string): Promise<Result<string>> =>
      invoke('mc:command', name, zone, command)
  },

  /** 日誌 */
  log: {
    tail: (name: string, zone: string): Promise<Result<string>> => invoke('log:tail', name, zone),
    follow: (name: string, zone: string): Promise<Result<void>> => invoke('log:follow', name, zone),
    unfollow: (name: string): Promise<Result<void>> => invoke('log:unfollow', name),
    /** 訂閱即時日誌。回傳取消訂閱的函式。 */
    onData: (handler: (payload: { name: string; chunk: string }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { name: string; chunk: string }): void =>
        handler(payload)
      ipcRenderer.on('log:data', listener)
      return () => ipcRenderer.removeListener('log:data', listener)
    }
  },

  /** 檔案管理 */
  files: {
    list: (name: string, zone: string, path: string): Promise<Result<RemoteFile[]>> =>
      invoke('files:list', name, zone, path),
    read: (name: string, zone: string, path: string): Promise<Result<string>> =>
      invoke('files:read', name, zone, path),
    write: (name: string, zone: string, path: string, content: string): Promise<Result<void>> =>
      invoke('files:write', name, zone, path, content),
    delete: (name: string, zone: string, path: string): Promise<Result<void>> =>
      invoke('files:delete', name, zone, path),
    /** 開檔案選擇視窗並上傳。回傳檔名，使用者取消時回傳 null。 */
    upload: (name: string, zone: string, remoteDir: string): Promise<Result<string | null>> =>
      invoke('files:upload', name, zone, remoteDir),
    /** 開儲存視窗並下載。回傳存檔路徑，使用者取消時回傳 null。 */
    download: (name: string, zone: string, remotePath: string): Promise<Result<string | null>> =>
      invoke('files:download', name, zone, remotePath)
  },

  /** 備份 */
  backup: {
    list: (name: string, zone: string): Promise<Result<Backup[]>> => invoke('backup:list', name, zone),
    create: (name: string, zone: string): Promise<Result<string>> =>
      invoke('backup:create', name, zone),
    setInterval: (name: string, zone: string, hours: number): Promise<Result<void>> =>
      invoke('backup:setInterval', name, zone, hours)
  },

  /** server.properties */
  props: {
    get: (name: string, zone: string): Promise<Result<ServerProperties>> =>
      invoke('props:get', name, zone),
    set: (name: string, zone: string, updates: ServerProperties): Promise<Result<void>> =>
      invoke('props:set', name, zone, updates)
  },

  /** 玩家名單 */
  players: {
    get: (name: string, zone: string): Promise<Result<PlayerLists>> =>
      invoke('players:get', name, zone),
    modify: (
      name: string,
      zone: string,
      action: PlayerAction,
      player: string
    ): Promise<Result<string>> => invoke('players:modify', name, zone, action, player)
  },

  /** 偏好設定與雜項 */
  app: {
    getPreferences: (): Promise<Result<Preferences>> => invoke('prefs:get'),
    setPreferences: (updates: Partial<Preferences>): Promise<Result<Preferences>> =>
      invoke('prefs:set', updates),
    /** 只允許 https，主行程會再檢查一次 */
    openExternal: (url: string): Promise<Result<void>> => invoke('app:openExternal', url),
    chooseDirectory: (): Promise<Result<string | null>> => invoke('app:chooseDirectory')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type CraftLiftApi = typeof api
