import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AuthStatus,
  Backup,
  BillingAccount,
  CreateServerOptions,
  FeedbackInput,
  GcloudStatus,
  LoaderVersion,
  MachineType,
  McVersion,
  MinecraftServer,
  ModLoader,
  ModsListing,
  PlayerLists,
  Preferences,
  PriceEstimate,
  RemoteFile,
  Result,
  ServerProperties,
  Transfer,
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
    delete: (): Promise<Result<void>> => invoke('project:delete'),
    /**
     * 背景核對發現記住的專案是錯的時候會通知一次。
     *
     * 啟動時為了不讓畫面等 gcloud 四秒，先用記住的專案 ID 去查——
     * 那個專案如果已經被刪掉，畫面會先顯示一次錯誤。核對完成後靠這個
     * 事件叫畫面重來，錯誤才不會留在那裡騙人。
     */
    onChanged: (fn: (projectId: string | null) => void): (() => void) => {
      const listener = (_e: unknown, projectId: string | null): void => fn(projectId)
      ipcRenderer.on('project:changed', listener)
      return () => ipcRenderer.removeListener('project:changed', listener)
    }
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

  /** 模組載入器（來自各載入器官方的公開版本資料） */
  loader: {
    /** 這個載入器搭配這個 Minecraft 版本可以用的版本，新的排前面 */
    versions: (loader: ModLoader, mcVersion: string): Promise<Result<LoaderVersion[]>> =>
      invoke('loader:versions', loader, mcVersion)
  },

  /**
   * 模組管理。
   *
   * 這裡只有兩個方法，因為模組分頁做的事其實就是檔案總管做的事：上傳、
   * 刪除、下載、改名，全部走 files.* 那一套已經驗過的路徑（含路徑逃逸
   * 防護）。「停用」在模組生態裡本來就是把副檔名改成 .disabled，所以它
   * 也是一次 files.rename，不需要自己的通道。
   *
   * 剩下這兩個是檔案總管給不了的：一個要判斷啟用狀態並拆出好看的名稱，
   * 一個要在系統對話框裡只顯示 .jar。
   */
  mods: {
    list: (name: string, zone: string): Promise<Result<ModsListing>> =>
      invoke('mods:list', name, zone),
    /** 開檔案選擇視窗（只顯示 .jar），回傳選到的本機路徑，還沒上傳 */
    pick: (): Promise<Result<string[]>> => invoke('mods:pick')
  },

  /**
   * 伺服器圖示：玩家在多人遊戲清單裡看到的那張圖。
   *
   * 尺寸檢查與縮放都在主行程做完，這裡拿到的 get 結果已經是可以直接
   * 放進 <img src> 的 data URL。
   */
  icon: {
    get: (name: string, zone: string): Promise<Result<string | null>> =>
      invoke('icon:get', name, zone),
    set: (name: string, zone: string, localPath: string): Promise<Result<void>> =>
      invoke('icon:set', name, zone, localPath),
    clear: (name: string, zone: string): Promise<Result<void>> => invoke('icon:clear', name, zone),
    /** 開圖片選擇視窗，回傳本機路徑；取消時是 null */
    pick: (): Promise<Result<string | null>> => invoke('icon:pick')
  },

  /**
   * 上傳與下載的進度。
   *
   * 狀態由主行程保管，畫面只是訂閱者——所以切到別的分頁再回來，
   * 還在跑的傳輸依然看得到，不會像以前那樣憑空消失。
   */
  transfer: {
    /** 現在有哪些正在傳。畫面重新掛載時用這個補回進度。 */
    list: (): Promise<Result<Transfer[]>> => invoke('transfer:list'),
    /** 暫停：停止餵資料，連線與遠端檔案代號都留著，隨時可以繼續 */
    pause: (id: string): Promise<Result<void>> => invoke('transfer:pause', id),
    resume: (id: string): Promise<Result<void>> => invoke('transfer:resume', id),
    /** 取消。目的地那個檔案不會被動到——搬過去是在整份傳完之後才發生的。 */
    cancel: (id: string): Promise<Result<void>> => invoke('transfer:cancel', id),
    onChange: (handler: (list: Transfer[]) => void): (() => void) => {
      const listener = (_e: unknown, list: Transfer[]): void => handler(list)
      ipcRenderer.on('transfer:changed', listener)
      return () => ipcRenderer.removeListener('transfer:changed', listener)
    }
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
    /** 立刻備份。kind 決定備份世界還是模組與設定，不給就兩種都做。 */
    create: (
      name: string,
      zone: string,
      kind: 'world' | 'setup' | 'all' = 'all'
    ): Promise<Result<string>> => invoke('backup:create', name, zone, kind),
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
  /**
   * 視窗本身的操作。
   *
   * 只有這三顆按鈕需要走這裡；拖曳、貼齊、縮放、雙擊最大化都是 Windows
   * 自己做的，畫面那端只要把標題列標成拖曳區就好。
   */
  window: {
    minimize: (): Promise<Result<void>> => invoke('window:minimize'),
    toggleMaximize: (): Promise<Result<void>> => invoke('window:toggleMaximize'),
    close: (): Promise<Result<void>> => invoke('window:close'),
    isMaximized: (): Promise<Result<boolean>> => invoke('window:isMaximized'),
    /** 最大化狀態改變時通知。回傳取消訂閱的函式。 */
    onMaximizedChange: (handler: (maximized: boolean) => void): (() => void) => {
      const listener = (_e: unknown, maximized: boolean): void => handler(maximized)
      ipcRenderer.on('window:maximized', listener)
      return () => ipcRenderer.removeListener('window:maximized', listener)
    }
  },

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
