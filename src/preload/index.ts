import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AuthStatus,
  Backup,
  BillingAccount,
  CreateServerOptions,
  FeedbackInput,
  GcloudStatus,
  MachineType,
  McVersion,
  MinecraftServer,
  PlayerLists,
  Preferences,
  PriceEstimate,
  RemoteFile,
  Result,
  ServerProperties,
  TransferItem,
  UpdateState,
  UploadItem
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
    login: (): Promise<Result<AuthStatus>> => invoke('gcloud:login'),
    /** 登出：撤銷這台電腦上的憑證，並清掉記住的專案 */
    logout: (): Promise<Result<void>> => invoke('gcloud:logout')
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

  /** 機器規格與費用估算 */
  machine: {
    /** 列出該區域可用的所有機型 */
    list: (zone: string): Promise<Result<MachineType[]>> => invoke('machine:list', zone),
    /** 組出自訂規格的機型名稱，規格不合法時會回傳錯誤 */
    custom: (family: string, cpus: number, memoryGb: number): Promise<Result<string>> =>
      invoke('machine:custom', family, cpus, memoryGb),
    /** 估算費用。這是估計值，不是帳單。 */
    estimate: (input: {
      region: string
      family: string
      cpus: number
      memoryGb: number
      diskGb: number
      useStaticIp: boolean
    }): Promise<Result<PriceEstimate>> => invoke('price:estimate', input)
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
    /** 某個資料夾裡已經用掉的名稱。貼上與上傳前用來判斷會不會撞名。 */
    names: (name: string, zone: string, dir: string): Promise<Result<string[]>> =>
      invoke('files:names', name, zone, dir),
    read: (name: string, zone: string, path: string): Promise<Result<string>> =>
      invoke('files:read', name, zone, path),
    write: (name: string, zone: string, path: string, content: string): Promise<Result<void>> =>
      invoke('files:write', name, zone, path, content),
    /** 一次刪除多個。資料夾連同底下的東西一起刪。 */
    delete: (name: string, zone: string, paths: string[]): Promise<Result<void>> =>
      invoke('files:delete', name, zone, paths),
    mkdir: (name: string, zone: string, path: string): Promise<Result<void>> =>
      invoke('files:mkdir', name, zone, path),
    /** 重新命名，回傳新的完整路徑 */
    rename: (name: string, zone: string, path: string, newName: string): Promise<Result<string>> =>
      invoke('files:rename', name, zone, path, newName),
    copy: (name: string, zone: string, items: TransferItem[]): Promise<Result<void>> =>
      invoke('files:copy', name, zone, items),
    move: (name: string, zone: string, items: TransferItem[]): Promise<Result<void>> =>
      invoke('files:move', name, zone, items),
    /** 開檔案選擇視窗，只回傳選到的本機路徑，還沒上傳 */
    pick: (): Promise<Result<string[]>> => invoke('files:pick'),
    /** 同上，但選的是資料夾 */
    pickDirectory: (): Promise<Result<string[]>> => invoke('files:pickDirectory'),
    upload: (name: string, zone: string, items: UploadItem[]): Promise<Result<void>> =>
      invoke('files:upload', name, zone, items),
    /**
     * 下載。單一檔案會開「另存新檔」，多選或資料夾會開「選擇資料夾」。
     * 回傳實際存到的位置，使用者取消時回傳 null。
     */
    download: (name: string, zone: string, remotePaths: string[]): Promise<Result<string | null>> =>
      invoke('files:download', name, zone, remotePaths),
    /** 在檔案總管裡指出剛下載的東西 */
    reveal: (localPath: string): Promise<Result<void>> => invoke('files:reveal', localPath),
    /**
     * 從檔案總管拖進來的檔案在磁碟上的位置。
     *
     * 畫面本身拿不到 File 的實際路徑（Electron 已經移除 File.path），
     * 只能由這裡代問。這不算開後門——它只回答「使用者剛剛親手拖進來的
     * 那個檔案在哪」，問不出其他路徑。
     */
    pathOf: (file: File): string => webUtils.getPathForFile(file)
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

  /**
   * 自動更新。
   *
   * 這裡刻意沒有「直接安裝」以外的入口——畫面不能自己決定去下載或執行
   * 任何東西，只能請主行程走 electron-updater 那條有校驗碼把關的路。
   */
  update: {
    /** 目前狀態。畫面重新掛載時用這個補回背景進度。 */
    state: (): Promise<Result<UpdateState>> => invoke('update:state'),
    /** 手動檢查。結果由 onChange 送回來。 */
    check: (): Promise<Result<void>> => invoke('update:check'),
    /** 使用者同意後才呼叫 */
    download: (): Promise<Result<void>> => invoke('update:download'),
    /** 重開並安裝。呼叫後程式就會結束。 */
    install: (): Promise<Result<void>> => invoke('update:install'),
    /** 訂閱更新狀態變化。回傳取消訂閱的函式。 */
    onChange: (handler: (state: UpdateState) => void): (() => void) => {
      const listener = (_e: unknown, state: UpdateState): void => handler(state)
      ipcRenderer.on('update:changed', listener)
      return () => ipcRenderer.removeListener('update:changed', listener)
    }
  },

  /** 偏好設定與雜項 */
  app: {
    getPreferences: (): Promise<Result<Preferences>> => invoke('prefs:get'),
    setPreferences: (updates: Partial<Preferences>): Promise<Result<Preferences>> =>
      invoke('prefs:set', updates),
    /** 只允許 https，主行程會再檢查一次 */
    openExternal: (url: string): Promise<Result<void>> => invoke('app:openExternal', url),
    chooseDirectory: (): Promise<Result<string | null>> => invoke('app:chooseDirectory'),
    /** 應用程式版本 */
    version: (): Promise<Result<string>> => invoke('app:version'),
    /** 送出意見回饋。失敗時回傳錯誤，呼叫端可改走 openFeedbackForm。 */
    sendFeedback: (input: FeedbackInput): Promise<Result<void>> => invoke('feedback:send', input),
    /** 開瀏覽器填表單，內容已預先填好。直接送出失敗時的退路。 */
    openFeedbackForm: (input: FeedbackInput): Promise<Result<void>> =>
      invoke('feedback:openForm', input),

    /** 目前實際採用的配色（「跟隨系統」已解析成 light 或 dark） */
    effectiveTheme: (): Promise<Result<'light' | 'dark'>> => invoke('theme:effective'),
    /** 訂閱系統配色變化。回傳取消訂閱的函式。 */
    onThemeChange: (handler: (theme: 'light' | 'dark') => void): (() => void) => {
      const listener = (_e: unknown, theme: 'light' | 'dark'): void => handler(theme)
      ipcRenderer.on('theme:changed', listener)
      return () => ipcRenderer.removeListener('theme:changed', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type CraftLiftApi = typeof api
