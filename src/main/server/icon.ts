import { randomBytes } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, nativeImage } from 'electron'
import { REMOTE } from '@shared/constants'
import type { ServerConnection } from './ssh'
import { deleteRemoteFiles, downloadPath, uploadPath } from './operations'

/**
 * 伺服器圖示——玩家在多人遊戲清單裡看到的那張小圖。
 *
 * Minecraft 只認伺服器根目錄下 64×64 的 `server-icon.png`，尺寸不對就整張
 * 不顯示，而且不會說為什麼。所以這裡在送上去之前就把圖處理好。
 *
 * 縮放用 Electron 內建的 nativeImage，不引入影像套件：這件事一年跑不了幾次，
 * 為它多背一個相依套件並不划算。
 *
 * 非正方形的圖直接擋掉而不是自己裁切——裁切等於替使用者決定要留哪一半，
 * 而他八成會發現自己的圖被切掉了頭。講清楚讓他自己準備一張方的比較好。
 */
const SIZE = 64

/** 圖片本身壞掉或根本不是圖片 */
export const ICON_UNREADABLE = 'craftlift:iconUnreadable'
/** 不是正方形。訊息要由畫面翻譯，所以這裡只給代碼。 */
export const ICON_NOT_SQUARE = 'craftlift:iconNotSquare'

function tempPath(): string {
  return join(app.getPath('temp'), `craftlift-icon-${randomBytes(6).toString('hex')}.png`)
}

/**
 * 讀回目前的圖示，回傳可以直接放進 <img src> 的 data URL。
 *
 * 沒有圖示不是錯誤——大多數伺服器本來就沒有，回傳 null 讓畫面顯示空狀態。
 */
export async function readIcon(conn: ServerConnection): Promise<string | null> {
  const local = tempPath()
  try {
    await downloadPath(conn, REMOTE.iconFile, local)
    const bytes = await readFile(local)
    return `data:image/png;base64,${bytes.toString('base64')}`
  } catch {
    return null
  } finally {
    await rm(local, { force: true })
  }
}

/**
 * 換一張圖示。
 *
 * 剛好就是 64×64 的話原檔照送，不重新編碼——重新編碼會讓像素風的圖被
 * 重新取樣，邊緣糊掉，而那正是這類圖最不能被動到的地方。
 */
export async function writeIcon(conn: ServerConnection, localPath: string): Promise<void> {
  const image = nativeImage.createFromPath(localPath)
  if (image.isEmpty()) throw new Error(ICON_UNREADABLE)

  const { width, height } = image.getSize()
  if (width !== height) throw new Error(ICON_NOT_SQUARE)

  let source = localPath
  let temp: string | null = null

  if (width !== SIZE) {
    const resized = image.resize({ width: SIZE, height: SIZE, quality: 'best' })
    temp = tempPath()
    await writeFile(temp, resized.toPNG())
    source = temp
  } else if (!/\.png$/i.test(localPath)) {
    // 尺寸對但不是 PNG（例如 64×64 的 jpg）——Minecraft 只讀 PNG
    temp = tempPath()
    await writeFile(temp, image.toPNG())
    source = temp
  }

  try {
    await uploadPath(conn, source, REMOTE.iconFile, true)
  } finally {
    if (temp) await rm(temp, { force: true })
  }
}

export async function removeIcon(conn: ServerConnection): Promise<void> {
  await deleteRemoteFiles(conn, [REMOTE.iconFile])
}
