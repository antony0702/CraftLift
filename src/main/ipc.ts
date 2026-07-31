import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  Backup,
  BillingAccount,
  CreateServerOptions,
  FeedbackInput,
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
import { jvmHeapFor, REMOTE } from '@shared/constants'
import { applyZoom } from './zoom'
import { feedbackFormUrl, submitFeedback } from './feedback'
import { getGcloudStatus } from './gcloud/exec'
import { getAuthStatus, login, logout } from './gcloud/auth'
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
import { listLoaderVersions, resolveFabricApi, resolveLoaderInstall } from './loaders'
import type { LoaderInstall } from './loaders'
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
import {
  TransferCancelled,
  cancelTransfer,
  listTransfers,
  onTransfersChanged,
  pauseTransfer,
  resumeTransfer,
  startTransfer
} from './transfers'

/**
 * 目前使用中的 GCP 專案。
 *
 * 只當快取用——真正的來源永遠是 GCP 上帶有 craftlift 標籤的專案。
 * 這樣使用者換電腦或重灌後，登入同一個 Google 帳號就能接續使用，
 * 不會因為本機設定檔不見就找不到自己的伺服器。
 */
let currentProjectId: string | null = null

/**
 * 這個執行階段裡被刪掉的專案。
 *
 * GCP 的專案刪除不是立即生效的——`projects delete` 之後有一段傳播延遲，
 * 那幾秒內 `projects list` 仍然會把它列為 ACTIVE。於是「刪完 → 回到首次
 * 設定 → 立刻查有沒有既有專案」這個順序會把剛死掉的專案撿回來、寫回設定
 * 檔，並當成目前的專案交給畫面。之後每一個 API 都在打一個不存在的東西。
 *
 * 實際踩到的樣子：伺服器清單空白、機型下拉選單只剩一條沒有項目的細線，
 * 而且沒有任何錯誤訊息。記住自己刪過什麼，就不會再撿回來。
 */
const deletedThisSession = new Set<string>()

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

/** 遠端路徑的最後一段，拿來當進度條上的說明 */
function baseName(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path
}

/**
 * 跑一批下載，並登記成一筆看得到進度的傳輸。
 *
 * 總量要等 downloadPath 問過遠端才知道，所以是一邊跑一邊補上去的——
 * 第一個檔案還在算大小的那一兩秒，畫面顯示的是不確定進度。
 */
/** 取消是使用者自己按的，不是錯誤——兩者要分開，不然畫面會用紅字罵他 */
function isCancellation(err: unknown): boolean {
  return err instanceof TransferCancelled || (err instanceof Error && err.message === 'TRANSFER_CANCELLED')
}

async function runDownload(
  name: string,
  zone: string,
  jobs: Array<{ remotePath: string; localPath: string }>
): Promise<void> {
  const transfer = startTransfer({
    kind: 'download',
    server: name,
    label: baseName(jobs[0]?.remotePath ?? ''),
    totalBytes: 0
  })
  let total = 0
  try {
    await withConnection(name, zone, async (conn) => {
      for (const job of jobs) {
        if (transfer.isCancelled()) throw new TransferCancelled()
        transfer.describe(baseName(job.remotePath))
        await ops.downloadPath(
          conn,
          job.remotePath,
          job.localPath,
          { onProgress: transfer.advance, attach: transfer.attach },
          (bytes) => {
            total += bytes
            transfer.setTotal(total)
          }
        )
      }
    })
    transfer.done()
  } catch (err) {
    if (isCancellation(err)) {
      transfer.cancelled()
      return
    }
    transfer.fail(err instanceof Error ? err.message : String(err))
    throw err
  }
}

/** 每台伺服器目前的日誌串流停止函式 */
const logStoppers = new Map<string, () => void>()

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // --- 環境與登入 -----------------------------------------------------------
  handle('gcloud:status', getGcloudStatus)
  handle('gcloud:authStatus', getAuthStatus)
  handle('gcloud:login', login)

  /**
   * 登出。
   *
   * 除了撤銷憑證，記住的專案編號也要一起清掉——不清的話，換一個 Google
   * 帳號登入時會看到上一個帳號的專案，而那個專案在新帳號底下根本不存在。
   * SSH 連線同樣要收掉，它是用舊帳號的身分建立的。
   */
  handle('gcloud:logout', async (): Promise<void> => {
    closeAllConnections()
    await logout()
    currentProjectId = null
    await setPreferences({ lastProjectId: null })
  })

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

    /** 剛在這個執行階段刪掉的專案不算數，理由見 deletedThisSession */
    const usable = (id: string | null): string | null =>
      id && !deletedThisSession.has(id) ? id : null

    const prefs = await getPreferences()
    const remembered = usable(prefs.lastProjectId)
    if (remembered) {
      currentProjectId = remembered
      void findExistingProject().then(async (found) => {
        const actual = usable(found)
        if (actual !== remembered) {
          currentProjectId = actual
          await setPreferences({ lastProjectId: actual })
        }
      })
      return currentProjectId
    }

    currentProjectId = usable(await findExistingProject())
    // 記住的那個已經被刪掉時也要寫回去，否則下次啟動又會撿到它
    if (currentProjectId !== prefs.lastProjectId) {
      await setPreferences({ lastProjectId: currentProjectId })
    }
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
    deletedThisSession.add(projectId)
    currentProjectId = null
    await setPreferences({ lastProjectId: null })
  })

  // --- Minecraft 版本 -------------------------------------------------------
  handle('mc:versions', async (includeSnapshots: boolean): Promise<McVersion[]> =>
    listVersions(includeSnapshots)
  )
  handle('mc:latest', latestRelease)

  // --- 模組載入器版本 -------------------------------------------------------
  handle(
    'loader:versions',
    async (loader: ModLoader, mcVersion: string): Promise<LoaderVersion[]> =>
      listLoaderVersions(loader, mcVersion)
  )

  // --- 伺服器（GCP 層）------------------------------------------------------
  handle('server:list', async (): Promise<MinecraftServer[]> => listServers(await requireProject()))

  handle('server:create', async (opts: CreateServerOptions): Promise<MinecraftServer> => {
    const projectId = await requireProject()
    // Fabric 用不到 Mojang 的 server.jar（它自己會抓），但這一趟仍然要跑——
    // 這個 Minecraft 版本需要哪個 Java 版本只有 Mojang 說得準
    const jar = await getServerJarInfo(opts.mcVersion)
    const prefs = await getPreferences()

    // 版本在這裡才定案：畫面送空字串代表「交給 CraftLift 挑」。
    // 定案的結果要寫進機器的 metadata，否則之後查不出裝的是哪一版。
    let loader: LoaderInstall | null = null
    let fabricApi: { fileName: string; url: string } | null = null
    if (opts.flavor !== 'vanilla') {
      loader = await resolveLoaderInstall(opts.flavor, opts.mcVersion, opts.loaderVersion)
      // Fabric 的載入器不含 API，絕大多數模組都要它。查不到就讓建立失敗——
      // 這是一趟 HTTP，重試一次比拿到一台每個模組都裝不起來的伺服器好。
      if (opts.flavor === 'fabric') {
        fabricApi = await resolveFabricApi(opts.mcVersion)
      }
    }

    const script = buildStartupScript({
      serverJarUrl: jar.url,
      javaMajorVersion: jar.javaMajorVersion,
      // JVM 記憶體依實際選到的機器規格換算，不再綁定固定方案
      jvmHeap: jvmHeapFor(opts.memoryGb),
      backupIntervalHours: prefs.backupIntervalHours,
      flavor: opts.flavor,
      loader: loader ? { kind: loader.kind, url: loader.url } : null,
      fabricApi
    })
    return createServer(projectId, opts, script, loader?.version ?? null)
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
        const dir = prefs.localBackupDir ?? defaultLocalBackupDir()
        await mkdir(dir, { recursive: true })

        // 兩包分開挑。以前這裡拿的是 backups[0]，現在備份資料夾裡除了
        // 世界還有模組與設定，照時間拿最新的那個會變成「有時候帶回世界、
        // 有時候帶回模組」——而使用者完全看不出來少了哪一份。
        const newest = (prefix: string): (typeof backups)[number] | undefined =>
          backups.find((b) => b.fileName.startsWith(prefix))

        for (const prefix of ['world-', 'setup-']) {
          const target = newest(prefix)
          if (!target) continue
          const localPath = join(dir, target.fileName)
          // 一包失敗不能拖累另一包。世界很大、比較容易在傳輸中途斷掉，
          // 而模組那包才是「到期之後想重建伺服器」真正需要的東西——
          // 讓前者的失敗把後者一起吃掉，等於整個設計白做。
          try {
            // 模組那一包只有內容變了才會產生新檔名，所以本機已經有同一份
            // 就不用再傳一次——幾百 MB 走 SFTP 要好幾分鐘，而使用者正在
            // 等關機完成。
            await access(localPath)
            continue
          } catch {
            // 本機還沒有，往下傳
          }
          try {
            await ops.downloadPath(conn, target.path, localPath)
          } catch {
            // 記不下來也要繼續下一包
          }
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
      // 總量先算出來才畫得出進度條。這是本機的 stat，很快。
      let totalBytes = 0
      for (const item of items) {
        try {
          totalBytes += await ops.localSize(item.localPath)
        } catch {
          // 算不出來就算了，畫面會顯示成不確定進度
        }
      }
      const transfer = startTransfer({
        kind: 'upload',
        server: name,
        label: baseName(items[0]?.remotePath ?? ''),
        totalBytes
      })
      try {
        await withConnection(name, zone, async (conn) => {
          for (const item of items) {
            // 使用者在檔案與檔案之間按了取消，就不要再開始下一個
            if (transfer.isCancelled()) throw new TransferCancelled()
            transfer.describe(baseName(item.remotePath))
            await ops.uploadPath(conn, item.localPath, item.remotePath, item.replace, {
              onProgress: transfer.advance,
              attach: transfer.attach
            })
          }
        })
        transfer.done()
      } catch (err) {
        if (isCancellation(err)) {
          transfer.cancelled()
          return
        }
        transfer.fail(err instanceof Error ? err.message : String(err))
        throw err
      }
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
          await runDownload(name, zone, [{ remotePath: single, localPath: target }])
          return target
        }
      }

      const picked = await dialog.showOpenDialog(window, {
        properties: ['openDirectory', 'createDirectory']
      })
      if (picked.canceled || !picked.filePaths[0]) return null
      const dir = picked.filePaths[0]

      const jobs: Array<{ remotePath: string; localPath: string }> = []
      for (const remotePath of remotePaths) {
        jobs.push({
          remotePath,
          localPath: await freeLocalPath(dir, remotePath.split('/').pop() as string)
        })
      }
      await runDownload(name, zone, jobs)
      return dir
    }
  )

  /** 在檔案總管裡把剛下載的東西指出來 */
  handle('files:reveal', async (localPath: string): Promise<void> => {
    shell.showItemInFolder(localPath)
  })

  // --- 傳輸進度 -------------------------------------------------------------
  // 狀態放在主行程，所以畫面切走再回來仍然看得到還在跑的那幾筆
  handle('transfer:list', async (): Promise<Transfer[]> => listTransfers())
  handle('transfer:pause', async (id: string): Promise<void> => pauseTransfer(id))
  handle('transfer:resume', async (id: string): Promise<void> => resumeTransfer(id))
  handle('transfer:cancel', async (id: string): Promise<void> => cancelTransfer(id))
  onTransfersChanged((list) => getWindow()?.webContents.send('transfer:changed', list))

  // --- 備份 -----------------------------------------------------------------
  // --- 模組 -----------------------------------------------------------------
  /**
   * 這裡只有兩個口。模組的上傳、刪除、下載，以及「停用」（把副檔名改成
   * .disabled）全部走 files:* 那幾條已經驗過的路——它們本來就是同一件事，
   * 而且那邊已經有路徑逃逸防護。
   */
  handle('mods:list', async (name: string, zone: string): Promise<ModsListing> =>
    withConnection(name, zone, (conn) => ops.listMods(conn))
  )

  /** 只顯示 .jar 的檔案選擇視窗。選檔與上傳分開，畫面才能夾在中間問撞名。 */
  handle('mods:pick', async (): Promise<string[]> => {
    const window = getWindow()
    if (!window) return []
    const picked = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Minecraft mod', extensions: ['jar'] }]
    })
    return picked.canceled ? [] : picked.filePaths
  })

  handle('backup:list', async (name: string, zone: string): Promise<Backup[]> =>
    withConnection(name, zone, ops.listBackups)
  )
  /**
   * 立刻備份。
   *
   * 登記成一筆 backup，理由跟上傳下載一樣：打包一個世界要好幾分鐘，而
   * 使用者這段期間會切分頁。狀態若只活在備份分頁的元件裡，切走一次就
   * 消失，回來會看到一份還在寫的壓縮檔配上一顆可以按的下載按鈕——
   * 那會下載到不完整的檔案。
   */
  handle(
    'backup:create',
    async (name: string, zone: string, kind: 'world' | 'setup' | 'all' = 'all'): Promise<string> => {
      const job = startTransfer({ kind: 'backup', server: name, label: kind, totalBytes: 0 })
      try {
        const out = await withConnection(name, zone, (conn) => ops.createBackup(conn, kind))
        job.done()
        return out
      } catch (err) {
        job.fail(err instanceof Error ? err.message : String(err))
        throw err
      }
    }
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
