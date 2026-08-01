/**
 * The icon a new server is born with — CraftLift's world block.
 *
 * Why a string and not a file: this data is needed in three places — the main
 * process (restore default), the renderer (preview), and the startup script
 * (writing server-icon.png on a fresh machine). The startup script is plain
 * text metadata, so base64 is the only form it can carry; and nothing under
 * build/ ships in the installer (electron-builder packs out/ and package.json
 * only), so a file on disk would be missing in a real build. Compiling it into
 * the source is the one option that holds on all three sides.
 *
 * A 64×64 PNG, 338 bytes. Minecraft accepts that size and nothing else — wrong
 * dimensions and it shows no icon at all. Downsampled 4:1 with nearest
 * neighbour from build/icon.png (256×256): integer-ratio scaling of pixel art
 * is lossless, whereas smooth scaling would blur exactly the edges that matter.
 */
export const DEFAULT_SERVER_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABGUlEQVR42u3ZwQnCMBSH8c4g3hRP3nrQoxsIBVdwgTqAOIMHJ3CWjuImEYWCFEoTk5cmed8f3t3vh5aCVcUYY4wxFnmnR2d+D4DSV1+exuUA0BpeHIQ6AN/g7EHUAUgHJw+iDmDsg5zvjdVlD6IWwDc8NggAsR9uocKlAAGw3WJ/NJ/z/QpKh7tCrJr2ewDYAgwv9guOb3gfPDwA/gWYC8L1xsIBCAWQGshUMADSAK4gUg83AFIBCP0T8Q0GwBVgu14aiXMNP9QbkQNgLoApEKlgAFIF6C9WOAAAAGAHEBsiuXAAIoMkGwzAyF63nQl5prsGPfF/h9UDhAbJLhiAwCDZBwPgCVJcMACOEMWHAzABoiYYAMZYinsDcByeerp5/SAAAAAASUVORK5CYII='

/** Ready to drop straight into an <img src> */
export const DEFAULT_SERVER_ICON_DATA_URL = `data:image/png;base64,${DEFAULT_SERVER_ICON_BASE64}`
