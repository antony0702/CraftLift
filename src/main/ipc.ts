import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  Backup,
  BillingAccount,
  CreateServerOptions,
  MachineType,
  McVersion,
  MinecraftServer,
  PlayerLists,
  Preferences,
  PriceEstimate,
  RemoteFile,
  Result,
  ServerProperties
} from '@shared/types'
import { jvmHeapFor, REMOTE } from '@shared/constants'
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
import { defaultLocalBackupDir, getPreferences, setPreferences } from './preferences'

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

  handle('project:current', async (): Promise<string | null> => {
    currentProjectId = await findExistingProject()
    return currentProjectId
  })

  handle('project:ensure', async (billingAccountId: string): Promise<string> => {
    const project = await ensureProject(billingAccountId)
    currentProjectId = project.projectId
    return project.projectId
  })

  handle('project:delete', async (): Promise<void> => {
    const projectId = await requireProject()
    closeAllConnections()
    await deleteProject(projectId)
    currentProjectId = null
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
          await ops.downloadFile(conn, backups[0].path, join(dir, backups[0].fileName))
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
  handle('files:delete', async (name: string, zone: string, path: string): Promise<void> =>
    withConnection(name, zone, (conn) => ops.deleteRemoteFile(conn, path))
  )

  handle(
    'files:upload',
    async (name: string, zone: string, remoteDir: string): Promise<string | null> => {
      const window = getWindow()
      if (!window) return null
      const picked = await dialog.showOpenDialog(window, { properties: ['openFile'] })
      if (picked.canceled || !picked.filePaths[0]) return null

      const localPath = picked.filePaths[0]
      const fileName = localPath.split(/[\\/]/).pop() as string
      await withConnection(name, zone, (conn) =>
        ops.uploadFile(conn, localPath, `${remoteDir.replace(/\/$/, '')}/${fileName}`)
      )
      return fileName
    }
  )

  handle(
    'files:download',
    async (name: string, zone: string, remotePath: string): Promise<string | null> => {
      const window = getWindow()
      if (!window) return null
      const fileName = remotePath.split('/').pop() as string
      const picked = await dialog.showSaveDialog(window, { defaultPath: fileName })
      if (picked.canceled || !picked.filePath) return null

      await withConnection(name, zone, (conn) =>
        ops.downloadFile(conn, remotePath, picked.filePath as string)
      )
      return picked.filePath
    }
  )

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
  handle('prefs:set', async (updates: Partial<Preferences>): Promise<Preferences> =>
    setPreferences(updates)
  )

  handle('app:openExternal', async (url: string): Promise<void> => {
    // 只放行 https，避免畫面端被誘導去開本機檔案或執行檔
    if (!url.startsWith('https://')) throw new Error('只允許開啟 https 連結')
    await shell.openExternal(url)
  })

  handle('app:chooseDirectory', async (): Promise<string | null> => {
    const window = getWindow()
    if (!window) return null
    const picked = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    return picked.canceled ? null : (picked.filePaths[0] ?? null)
  })
}
