import type { LoaderVersion, ModLoader } from '@shared/types'

/**
 * 模組載入器的版本查詢與安裝資訊。
 *
 * 三個載入器都有公開的版本來源，不需要驗證：
 *   Fabric   —— 官方 meta API，直接給 JSON，還能組出一個可以直接跑的
 *               伺服器啟動 jar，是三者中最乾淨的
 *   NeoForge —— Maven 的 maven-metadata.xml
 *   Forge    —— Maven 的 maven-metadata.xml
 *
 * 後兩者只能拿到 installer jar，要在機器上執行 `--installServer` 才會
 * 把伺服器裝起來，產生的檔案佈局各版本不同——所以啟動腳本是在機器上
 * 「找」出啟動方式，而不是在這裡猜路徑。
 */

const FABRIC_META = 'https://meta.fabricmc.net/v2'
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge'

async function fetchJson<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`無法取得${what}（HTTP ${res.status}）`)
  return (await res.json()) as T
}

async function fetchText(url: string, what: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`無法取得${what}（HTTP ${res.status}）`)
  return res.text()
}

/**
 * 比較兩個以點與連字號分段的版本號，新的排前面。
 *
 * 純字串排序會把 21.4.9 排在 21.4.86 後面（'9' > '8'），所以逐段轉數字比。
 * 非數字的段（beta、rc1）一律視為比同位置的數字小，這樣正式版會排在
 * 同號的測試版前面。
 */
function compareVersionsDesc(a: string, b: string): number {
  const parts = (v: string): string[] => v.split(/[.-]/)
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = Number(pa[i])
    const nb = Number(pb[i])
    const aNum = Number.isFinite(na)
    const bNum = Number.isFinite(nb)
    if (aNum && bNum) {
      if (na !== nb) return nb - na
    } else if (aNum !== bNum) {
      // 有數字的那邊比較新（21.4.86 比 21.4.86-beta 新）
      return aNum ? -1 : 1
    } else if (pa[i] !== pb[i]) {
      return (pb[i] ?? '').localeCompare(pa[i] ?? '')
    }
  }
  return 0
}

/** 從 maven-metadata.xml 裡把所有 <version> 撈出來 */
function versionsFromMavenMetadata(xml: string): string[] {
  return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1].trim())
}

/**
 * NeoForge 的版本號前綴。
 *
 * 它不用 Minecraft 的版本號，而是把 1.21.4 對應成 21.4.x——主版號取
 * Minecraft 的次版號，次版號取修訂號，沒有修訂號時是 0（1.21 → 21.0.x）。
 */
function neoforgePrefix(mcVersion: string): string {
  const [, minor, patch] = mcVersion.split('.')
  if (!minor) throw new Error(`看不懂的 Minecraft 版本：${mcVersion}`)
  return `${minor}.${patch ?? '0'}.`
}

interface FabricLoaderEntry {
  loader: { version: string; stable: boolean }
}

/**
 * 版本號本身有沒有預發布標記。
 *
 * 三個載入器都用這個判斷「是不是測試版」，而不是相信各自 API 的欄位——
 * Fabric 的 `stable` 其實是「官方推薦的那一個」，251 個版本裡只有 1 個是
 * true，照它標的話清單上幾乎每一項都會被寫成測試版，那是假的。
 */
function looksStable(version: string): boolean {
  return !/-(beta|alpha|rc|pre|snapshot)/i.test(version)
}

interface FabricInstallerEntry {
  version: string
  stable: boolean
}

/**
 * 列出某個載入器可以搭配某個 Minecraft 版本的版本，新的排前面。
 *
 * 查不到任何版本時直接報錯而不是回空陣列：空的下拉選單看起來像介面壞了，
 * 「這個組合沒有可用版本」才是使用者需要知道的事。
 */
export async function listLoaderVersions(
  loader: ModLoader,
  mcVersion: string
): Promise<LoaderVersion[]> {
  let versions: LoaderVersion[]

  if (loader === 'fabric') {
    const entries = await fetchJson<FabricLoaderEntry[]>(
      `${FABRIC_META}/versions/loader/${encodeURIComponent(mcVersion)}`,
      'Fabric 版本清單'
    )
    // Fabric 自己就是照新到舊回傳的
    versions = entries.map((e) => ({ id: e.loader.version, stable: looksStable(e.loader.version) }))
  } else if (loader === 'neoforge') {
    const xml = await fetchText(`${NEOFORGE_MAVEN}/maven-metadata.xml`, 'NeoForge 版本清單')
    const prefix = neoforgePrefix(mcVersion)
    versions = versionsFromMavenMetadata(xml)
      .filter((v) => v.startsWith(prefix))
      .sort(compareVersionsDesc)
      .map((v) => ({ id: v, stable: looksStable(v) }))
  } else {
    const xml = await fetchText(`${FORGE_MAVEN}/maven-metadata.xml`, 'Forge 版本清單')
    // Forge 的版本號長這樣：1.20.1-47.2.0，前面那一段就是 Minecraft 版本
    const prefix = `${mcVersion}-`
    versions = versionsFromMavenMetadata(xml)
      .filter((v) => v.startsWith(prefix))
      .sort(compareVersionsDesc)
      .map((v) => ({ id: v.slice(prefix.length), stable: looksStable(v) }))
  }

  if (versions.length === 0) {
    throw new Error(`${loader} 沒有搭配 Minecraft ${mcVersion} 的版本`)
  }
  return versions
}

export interface LoaderInstall {
  /** 實際採用的載入器版本，會寫進機器的 metadata */
  version: string
  /**
   * 怎麼裝。
   *   serverJar —— 下載下來就是可以直接跑的 server.jar（Fabric）
   *   installer —— 下載的是安裝程式，要在機器上跑 --installServer
   */
  kind: 'serverJar' | 'installer'
  url: string
}

/**
 * 決定要裝哪一版，並給出下載網址。
 *
 * wanted 是空字串時代表「交給 CraftLift 挑」——取最新的正式版，
 * 沒有正式版才退而求其次用最新的那一個。
 */
export async function resolveLoaderInstall(
  loader: ModLoader,
  mcVersion: string,
  wanted: string
): Promise<LoaderInstall> {
  const versions = await listLoaderVersions(loader, mcVersion)

  let version = wanted.trim()
  if (version) {
    if (!versions.some((v) => v.id === version)) {
      throw new Error(`${loader} 沒有 ${version} 這個版本可以搭配 Minecraft ${mcVersion}`)
    }
  } else {
    version = (versions.find((v) => v.stable) ?? versions[0]).id
  }

  if (loader === 'fabric') {
    // Fabric 的伺服器啟動 jar 還要帶 installer 版本，那是另一條清單
    const installers = await fetchJson<FabricInstallerEntry[]>(
      `${FABRIC_META}/versions/installer`,
      'Fabric 安裝程式版本'
    )
    const installer = installers.find((i) => i.stable) ?? installers[0]
    if (!installer) throw new Error('查不到 Fabric 安裝程式的版本')
    return {
      version,
      kind: 'serverJar',
      url: `${FABRIC_META}/versions/loader/${encodeURIComponent(mcVersion)}/${version}/${installer.version}/server/jar`
    }
  }

  if (loader === 'neoforge') {
    return {
      version,
      kind: 'installer',
      url: `${NEOFORGE_MAVEN}/${version}/neoforge-${version}-installer.jar`
    }
  }

  // Forge 的 maven 路徑用的是完整的 1.20.1-47.2.0，畫面上顯示的只有後半段
  const full = `${mcVersion}-${version}`
  return {
    version,
    kind: 'installer',
    url: `${FORGE_MAVEN}/${full}/forge-${full}-installer.jar`
  }
}
