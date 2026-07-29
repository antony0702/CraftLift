import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  Backup,
  BillingAccount,
  CreateServerOptions,
  FeedbackInput,
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
import { jvmHeapFor, REMOTE } from '@shared/constants'
import { applyZoom } from './zoom'
import { feedbackFormUrl, submitFeedback } from './feedback'
import { getGcloudStatus } from './gcloud/exec'
import { getAuthStatus, login } from './gcloud/auth'
import {
  deleteProject,
  ensureProject,
  findExistingProject,
  listBillingAccounts
} from './gcloud/project'
import {
  createServer,
  deleteServer,
  getServer,
  listServers,
  startServer,
  stopServer
} from './gcloud/compute'
import { buildCustomMachineType, listMachineTypes } from './gcloud/machineTypes'
import { estimatePrice } from './gcloud/pricing'
import type { EstimateInput } from './gcloud/pricing'
import { getServerJarInfo, latestRelease, listVersions } from './mojang'
import { buildStartupScript } from './server/startupScript'
import { closeAllConnections, closeConnection, getConnection } from './server/ssh'
import type { ServerConnection } from './server/ssh'
import * as ops from './server/operations'
import {
  defaultLocalBackupDir,
  effectiveTheme,
  getPreferences,
  setPreferences
} from './preferences'
import { checkForUpdate, downloadUpdate, getUpdateState, installUpdate } from './updater'

/**
 * 目前使用中的 GCP 專案。
 *
 * 只當快取用——真正的來源永遠是 GCP 上帶有 craftlift 標籤的專案。
 * 這樣使用者換電腦或重灌後，登入同一個 Google 帳號就能接續使用，
 * 不會因為本機設定檔不見就找不到自己的伺服器。
 */
let currentProjectId: string | null = null

async function requireProject(): Promise<string> {
  if (currentProjectId) return currentProjectId
  const found = await findExistingProject()
  if (!found) throw new Error('尚未建立 CraftLift 專案')
  currentProjectId = found
  return found
}

async function withConnection<T>(
  name: string,
  zone: string,
  fn: (conn: ServerConnection) => Promise<T>
): Promise<T> {
  const projectId = await requireProject()
  const conn = await getConnection(projectId, name, zone)
  return fn(conn)
}

/**
 * 在本機挑一個還沒被佔用的檔名。
 *
 * 一次下載多個檔案時不逐一問「要不要覆蓋」，而是像瀏覽器那樣自動加編號。
 * 默默蓋掉使用者電腦上既有的檔案是不能接受的。
 */
async function freeLocalPath(dir: string, fileName: string): Promise<string> {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''

  for (let n = 1; n < 1000; n++) {
    const candidate = join(dir, n === 1 ? fileName : `${stem} (${n})${ext}`)
    try {
      await access(candidate)
    } catch {
      return candidate
    }
  }
  return join(dir, `${stem}-${Date.now()}${ext}`)
}

/**
 * 把可能失敗的操作包成統一的成功／失敗結構。
 * 直接讓例外跨越 IPC 的話，Error 物件會被序列化成沒什麼用的字串。
 */
function handle<Args extends unknown[], T>(
  channel: string,
  fn: (...args: Args) => Promise<T>
): void {
  ipcMain.handle(channel, async (_event, ...args: Args): Promise<Result<T>> => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

/** 每台伺服器目前的日誌串流停止函式 */
const logStoppers = new Map<string, () => void>()

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // --- 環境與登入 -----------------------------------------------------------
  handle('gcloud:status', getGcloudStatus)
  handle('gcloud:authStatus', getAuthStatus)
  handle('gcloud:login', login)

  // --- 專案 -----------------------------------------------------------------
  handle('project:billingAccounts', async (): Promise<BillingAccount[]> => listBillingAccounts())

  /**
   * 目前使用的專案。
   *
   * 查詢 GCP 要四秒多，每次啟動都等太久，所以先回傳上次記住的值讓畫面
   * 立刻出來，再在背景向 GCP 核對。核對結果不同時更新快取——下次啟動
   * 就會是對的。真正的來源始終是 GCP 上的標籤，這裡只是加速。
   */
  handle('project:current', async (): Promise<string | null> => {
    if (currentProjectId) return currentProjectId

    const prefs = await getPreferences()
    if (prefs.lastProjectId) {
      currentProjectId = prefs.lastProjectId
      void findExistingProject().then(async (actual) => {
        if (actual !== prefs.lastProjectId) {
          currentProjectId = actual
          await setPreferences({ lastProjectId: actual })
        }
      })
      return currentProjectId
    }

    currentProjectId = await findExistingProject()
    if (currentProjectId) await setPreferences({ lastProjectId: currentProjectId })
    return currentProjectId
  })

  handle('project:ensure', async (billingAccountId: string): Promise<string> => {
    const project = await ensureProject(billingAccountId)
    currentProjectId = project.projectId
    await setPreferences({ lastProjectId: project.projectId })
    return project.projectId
  })

  handle('project:delete', async (): Promise<void> => {
    const projectId = await requireProject()
    closeAllConnections()
    await deleteProject(projectId)
    currentProjectId = null
    await setPreferences({ lastProjectId: null })
  })

  // --- Minecraft 版本 -------------------------------------------------------
  handle('mc:versions', async (includeSnapshots: boolean): Promise<McVersion[]> =>
    listVersions(includeSnapshots)
  )
  handle('mc:latest', latestRelease)

  // --- 伺服器（GCP 層）------------------------------------------------------
  handle('server:list', async (): Promise<MinecraftServer[]> => listServers(await requireProject()))

  handle('server:create', async (opts: CreateServerOptions): Promise<MinecraftServer> => {
    const projectId = await requireProject()
    const jar = await getServerJarInfo(opts.mcVersion)
    const prefs = await getPreferences()
    const script = buildStartupScript({
      serverJarUrl: jar.url,
      javaMajorVersion: jar.javaMajorVersion,
      // JVM 記憶體依實際選到的機器規格換算，不再綁定固定方案
      jvmHeap: jvmHeapFor(opts.memoryGb),
      backupIntervalHours: prefs.backupIntervalHours
    })
    return createServer(projectId, opts, script)
  })

  // --- 機型與價格 -----------------------------------------------------------
  handle('machine:list', async (zone: string): Promise<MachineType[]> =>
    listMachineTypes(await requireProject(), zone)
  )

  handle('machine:custom', async (family: string, cpus: number, memoryGb: number): Promise<string> =>
    buildCustomMachineType(family, cpus, memoryGb)
  )

  handle('price:estimate', async (input: EstimateInput): Promise<PriceEstimate> =>
    estimatePrice(input)
  )

  handle('server:get', async (name: string, zone: string): Promise<MinecraftServer> =>
    getServer(await requireProject(), name, zone)
  )

  handle('server:start', async (name: string, zone: string): Promise<void> => {
    await startServer(await requireProject(), name, zone)
  })

  handle('server:stop', async (name: string, zone: string): Promise<void> => {
    const projectId = await requireProject()
    const prefs = await getPreferences()

    // 關機前先備份。使用者按下關機時把存檔帶回本機，是「試用到期資料
    // 全部消失」這個風險最實際的解藥。備份失敗不擋關機——不然使用者
    // 會被卡在一台關不掉、持續消耗額度的機器上。
    if (prefs.backupToLocalOnShutdown) {
      try {
        const conn = await getConnection(projectId, name, zone)
        await ops.createBackup(conn)
        const backups = await ops.listBackups(conn)
        if (backups[0]) {
          const dir = prefs.localBackupDir ?? defaultLocalBackupDir()
          await mkdir(dir, { recursive: true })
          await ops.downloadPath(conn, backups[0].path, join(dir, backups[0].fileName))
        }
      } catch {
        // 忽略：備份失敗不應該讓使用者關不了機
      }
    }

    closeConnection(name)
    await stopServer(projectId, name, zone)
  })

  handle('server:delete', async (name: string, zone: string): Promise<void> => {
    closeConnection(name)
    await deleteServer(await requireProject(), name, zone)
  })

  // --- 伺服器（機器內部）----------------------------------------------------
  handle('mc:status', async (name: string, zone: string) =>
    withConnection(name, zone, ops.getServiceStatus)
  )
  handle('mc:start', async (name: string, zone: string) =>
    withConnection(name, zone, ops.startMinecraft)
  )
  handle('mc:stop', async (name: string, zone: string) =>
    withConnection(name, zone, ops.stopMinecraft)
  )
  handle('mc:restart', async (name: string, zone: string) =>
    withConnection(name, zone, ops.restartMinecraft)
  )
  handle('mc:command', async (name: string, zone: string, command: string): Promise<string> =>
    withConnection(name, zone, (conn) => ops.sendCommand(conn, command))
  )

  // --- 日誌 -----------------------------------------------------------------
  handle('log:tail', async (name: string, zone: string): Promise<string> =>
    withConnection(name, zone, (conn) => ops.tailLog(conn))
  )

  handle('log:follow', async (name: string, zone: string): Promise<void> => {
    logStoppers.get(name)?.()
    await withConnection(name, zone, async (conn) => {
      const stop = await ops.followLog(conn, (chunk) => {
        getWindow()?.webContents.send('log:data', { name, chunk })
      })
      logStoppers.set(name, stop)
    })
  })

  handle('log:unfollow', async (name: string): Promise<void> => {
    logStoppers.get(name)?.()
    logStoppers.delete(name)
  })

  // --- 檔案管理 -------------------------------------------------------------
  handle('files:list', async (name: string, zone: string, path: string): Promise<RemoteFile[]> =>
    withConnection(name, zone, (conn) => ops.listFiles(conn, path || REMOTE.serverDir))
  )
  handle('files:read', async (name: string, zone: string, path: string): Promise<string> =>
    withConnection(name, zone, (conn) => ops.readTextFile(conn, path))
  )
  handle(
    'files:write',
    async (name: string, zone: string, path: string, content: string): Promise<void> =>
      withConnection(name, zone, (conn) => ops.writeTextFile(conn, path, content))
  )
  handle('files:names', async (name: string, zone: string, dir: string): Promise<string[]> =>
    withConnection(name, zone, (conn) => ops.listNames(conn, dir))
  )
  handle('files:delete', async (name: string, zone: string, paths: string[]): Promise<void> =>
    withConnection(name, zone, (conn) => ops.deleteRemoteFiles(conn, paths))
  )
  handle('files:mkdir', async (name: string, zone: string, path: string): Promise<void> =>
    withConnection(name, zone, (conn) => ops.makeDirectory(conn, path))
  )
  handle(
    'files:rename',
    async (name: string, zone: string, path: string, newName: string): Promise<string> =>
      withConnection(name, zone, (conn) => ops.renameRemote(conn, path, newName))
  )
  handle(
    'files:copy',
    async (name: string, zone: string, items: TransferItem[]): Promise<void> =>
      withConnection(name, zone, (conn) => ops.copyRemote(conn, items))
  )
  handle(
    'files:move',
    async (name: string, zone: string, items: TransferItem[]): Promise<void> =>
      withConnection(name, zone, (conn) => ops.moveRemote(conn, items))
  )

  /**
   * 只開檔案選擇視窗，不上傳。
   *
   * 選檔跟上傳分開，畫面才能夾在中間問「已經有同名檔案，要取代嗎」——
   * 這是檔案總管的行為。合成一個 IPC 就沒有插話的餘地了。
   */
  handle('files:pick', async (): Promise<string[]> => {
    const window = getWindow()
    if (!window) return []
    const picked = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections']
    })
    return picked.canceled ? [] : picked.filePaths
  })

  /** 選資料夾上傳。資料夾整棵會被帶上去。 */
  handle('files:pickDirectory', async (): Promise<string[]> => {
    const window = getWindow()
    if (!window) return []
    const picked = await dialog.showOpenDialog(window, {
      properties: ['openDirectory', 'multiSelections']
    })
    return picked.canceled ? [] : picked.filePaths
  })

  handle(
    'files:upload',
    async (name: string, zone: string, items: UploadItem[]): Promise<void> => {
      await withConnection(name, zone, async (conn) => {
        for (const item of items) {
          await ops.uploadPath(conn, item.localPath, item.remotePath, item.replace)
        }
      })
    }
  )

  /**
   * 下載。單一檔案走「另存新檔」，其餘（多選或資料夾）走「選一個資料夾」，
   * 跟瀏覽器與檔案總管的習慣一致。回傳存到哪裡，畫面用它提供「開啟位置」。
   */
  handle(
    'files:download',
    async (name: string, zone: string, remotePaths: string[]): Promise<string | null> => {
      const window = getWindow()
      if (!window || remotePaths.length === 0) return null

      const single = remotePaths.length === 1 ? remotePaths[0] : null
      if (single) {
        const isDir = await withConnection(name, zone, (conn) =>
          ops.isRemoteDirectory(conn, single)
        )
        if (!isDir) {
          const picked = await dialog.showSaveDialog(window, {
            defaultPath: single.split('/').pop()
          })
          if (picked.canceled || !picked.filePath) return null
          const target = picked.filePath
          await withConnection(name, zone, (conn) => ops.downloadPath(conn, single, target))
          return target
        }
      }

      const picked = await dialog.showOpenDialog(window, {
        properties: ['openDirectory', 'createDirectory']
      })
      if (picked.canceled || !picked.filePaths[0]) return null
      const dir = picked.filePaths[0]

      await withConnection(name, zone, async (conn) => {
        for (const remotePath of remotePaths) {
          const target = await freeLocalPath(dir, remotePath.split('/').pop() as string)
          await ops.downloadPath(conn, remotePath, target)
        }
      })
      return dir
    }
  )

  /** 在檔案總管裡把剛下載的東西指出來 */
  handle('files:reveal', async (localPath: string): Promise<void> => {
    shell.showItemInFolder(localPath)
  })

  // --- 備份 -----------------------------------------------------------------
  handle('backup:list', async (name: string, zone: string): Promise<Backup[]> =>
    withConnection(name, zone, ops.listBackups)
  )
  handle('backup:create', async (name: string, zone: string): Promise<string> =>
    withConnection(name, zone, ops.createBackup)
  )
  handle('backup:setInterval', async (name: string, zone: string, hours: number): Promise<void> => {
    await setPreferences({ backupIntervalHours: hours })
    await withConnection(name, zone, (conn) => ops.setBackupInterval(conn, hours))
  })

  // --- server.properties ----------------------------------------------------
  handle('props:get', async (name: string, zone: string): Promise<ServerProperties> =>
    withConnection(name, zone, ops.getServerProperties)
  )
  handle(
    'props:set',
    async (name: string, zone: string, updates: ServerProperties): Promise<void> =>
      withConnection(name, zone, (conn) => ops.setServerProperties(conn, updates))
  )

  // --- 玩家管理 -------------------------------------------------------------
  handle('players:get', async (name: string, zone: string): Promise<PlayerLists> =>
    withConnection(name, zone, ops.getPlayerLists)
  )
  handle(
    'players:modify',
    async (
      name: string,
      zone: string,
      action: Parameters<typeof ops.modifyPlayer>[1],
      player: string
    ): Promise<string> =>
      withConnection(name, zone, (conn) => ops.modifyPlayer(conn, action, player))
  )

  // --- 偏好設定與雜項 -------------------------------------------------------
  handle('prefs:get', getPreferences)
  handle('prefs:set', async (updates: Partial<Preferences>): Promise<Preferences> => {
    const next = await setPreferences(updates)
    if (updates.uiScale !== undefined) applyZoom()
    return next
  })

  /** 目前實際採用的配色。設定為「跟隨系統」時，這裡回傳解析後的結果。 */
  handle('theme:effective', async (): Promise<'light' | 'dark'> => effectiveTheme())

  handle('app:openExternal', async (url: string): Promise<void> => {
    // 只放行 https，避免畫面端被誘導去開本機檔案或執行檔
    if (!url.startsWith('https://')) throw new Error('只允許開啟 https 連結')
    await shell.openExternal(url)
  })

  /** 應用程式版本，顯示在標題列旁 */
  handle('app:version', async (): Promise<string> => app.getVersion())

  // --- 自動更新 -------------------------------------------------------------
  // 進度與結果都透過 update:state 事件推給畫面，這幾個 handler 只負責觸發。
  // 畫面重新掛載時用 update:state 這個查詢把目前狀態補回來，不然重開設定頁
  // 會看到「還沒檢查過」，但背景其實正在下載。
  handle('update:state', async (): Promise<UpdateState> => getUpdateState())
  handle('update:check', async (): Promise<void> => checkForUpdate())
  handle('update:download', async (): Promise<void> => downloadUpdate())
  handle('update:install', async (): Promise<void> => installUpdate())

  // --- 意見回饋 -------------------------------------------------------------
  handle('feedback:send', async (input: FeedbackInput): Promise<void> => submitFeedback(input))

  /** 直接送出失敗時的退路：開瀏覽器，內容已預先填好 */
  handle('feedback:openForm', async (input: FeedbackInput): Promise<void> => {
    await shell.openExternal(feedbackFormUrl(input))
  })

  handle('app:chooseDirectory', async (): Promise<string | null> => {
    const window = getWindow()
    if (!window) return null
    const picked = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    return picked.canceled ? null : (picked.filePaths[0] ?? null)
  })
}
