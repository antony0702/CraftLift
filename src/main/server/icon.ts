import { randomBytes } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, nativeImage } from 'electron'
import { REMOTE } from '@shared/constants'
import { DEFAULT_SERVER_ICON_BASE64 } from '@shared/serverIcon'
import type { ServerConnection } from './ssh'
import { downloadPath, uploadPath } from './operations'

/**
 * The server icon — the small image players see in their multiplayer list.
 *
 * Minecraft only reads a 64×64 `server-icon.png` in the server root. Wrong
 * dimensions and it shows nothing at all, without saying why. So the image is
 * put right here, before it is sent.
 *
 * Scaling uses Electron's built-in nativeImage rather than an image library:
 * this runs a handful of times a year, and is not worth another dependency.
 *
 * A non-square image is never cropped on its own — cropping decides for the
 * user which half to keep, and they will notice their picture lost its head.
 * Instead the renderer measures it with probeIcon first, asks whether to crop,
 * and only then calls in.
 */
const SIZE = 64

/** The file is broken, or is not an image at all */
export const ICON_UNREADABLE = 'craftlift:iconUnreadable'

function tempPath(): string {
  return join(app.getPath('temp'), `craftlift-icon-${randomBytes(6).toString('hex')}.png`)
}

/**
 * Read the current icon back as a data URL, ready for an <img src>.
 *
 * Having no icon is not an error — machines created before v1.1.0 have none,
 * and null tells the renderer to show the default. Newer machines get a
 * CraftLift icon written by the startup script, so they always have one.
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
 * Measure an image.
 *
 * This exists because "not square — shall I crop it?" has to be asked before
 * anything is done, and the renderer has no nativeImage. null means the file
 * could not be read as an image.
 */
export function probeIcon(localPath: string): { width: number; height: number } | null {
  const image = nativeImage.createFromPath(localPath)
  if (image.isEmpty()) return null
  return image.getSize()
}

/**
 * Turn a picked image into the PNG to upload, or null to send the file as-is.
 *
 * A file that is already a 64×64 PNG is sent untouched rather than re-encoded:
 * re-encoding resamples pixel art and softens its edges, which is the one
 * thing this kind of image cannot afford.
 *
 * Cropping takes the largest centred square. When a user presses "crop" they
 * mean "keep the middle" — taking a corner would cut the subject out.
 *
 * Split out from writeIcon so the image handling can be exercised without an
 * SSH connection.
 */
export function toIconPng(localPath: string): Buffer | null {
  let image = nativeImage.createFromPath(localPath)
  if (image.isEmpty()) throw new Error(ICON_UNREADABLE)

  const { width, height } = image.getSize()

  // Already exactly what Minecraft wants: send the file untouched
  if (width === height && width === SIZE && /\.png$/i.test(localPath)) return null

  if (width !== height) {
    const side = Math.min(width, height)
    image = image.crop({
      x: Math.round((width - side) / 2),
      y: Math.round((height - side) / 2),
      width: side,
      height: side
    })
  }
  if (image.getSize().width !== SIZE) {
    image = image.resize({ width: SIZE, height: SIZE, quality: 'best' })
  }
  return image.toPNG()
}

export async function writeIcon(conn: ServerConnection, localPath: string): Promise<void> {
  const png = toIconPng(localPath)
  let source = localPath
  let temp: string | null = null

  if (png) {
    temp = tempPath()
    await writeFile(temp, png)
    source = temp
  }

  try {
    await uploadPath(conn, source, REMOTE.iconFile, true)
  } finally {
    if (temp) await rm(temp, { force: true })
  }
}

/**
 * Put CraftLift's default icon back.
 *
 * Deliberately not "delete the file": with no file, Minecraft shows its own
 * grey block, whereas the user pressed "restore default" — and the default
 * they have in mind is the one this app gives, the one a new server starts with.
 */
export async function resetIcon(conn: ServerConnection): Promise<void> {
  const temp = tempPath()
  try {
    await writeFile(temp, Buffer.from(DEFAULT_SERVER_ICON_BASE64, 'base64'))
    await uploadPath(conn, temp, REMOTE.iconFile, true)
  } finally {
    await rm(temp, { force: true })
  }
}
