/**
 * 產生 CraftLift 的應用程式圖示。
 *
 * 圖案是一個等角的「世界方塊」：頂面是海洋與陸地，側面像地質剖面，
 * 由上而下是海水、岩層、發亮的地核。那個橘色跟介面的強調色是同一個。
 *
 * 為什麼要自己畫而不用繪圖軟體：像素圖必須用整數倍放大才會銳利。
 * 這支程式在 32×32 的格子上畫一次，再用最近鄰放大到 64/128/256，
 * 每個尺寸的每個像素都精準對齊。16 與 48 另外用手工簡化的 16×16
 * 版本，因為 32×32 縮一半會把陸地細節糊成雜訊。
 *
 * 用法：node design/generate-icon.js
 */
const zlib = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')

// ── 調色 ────────────────────────────────────────────────────────
const C = {
  clear: null,
  ocean: [0x2b, 0x6c, 0x9e],
  oceanRim: [0x4d, 0x90, 0xc0],
  land: [0x5e, 0x8c, 0x4a],
  waterL: [0x12, 0x30, 0x47], // 左側面（背光）
  rockL: [0x24, 0x1c, 0x14],
  coreL: [0xe0, 0x7a, 0x2f],
  waterR: [0x1b, 0x4a, 0x6b], // 右側面（受光，亮一階）
  rockR: [0x38, 0x2b, 0x1e],
  coreR: [0xff, 0xc0, 0x78]
}

// ── 幾何：2:1 等角方塊 ──────────────────────────────────────────
const TOP = [[16, 4], [30, 12], [16, 20], [2, 12]]
const LEFT = [[2, 12], [16, 20], [16, 30], [2, 22]]
const RIGHT = [[30, 12], [16, 20], [16, 30], [30, 22]]

/** 陸地：畫在頂面上的像素塊 [x, y, 寬] */
const LAND = [
  [9, 9, 5], [8, 10, 8], [9, 11, 6], [11, 12, 3],
  [18, 11, 6], [17, 12, 8], [19, 13, 5], [14, 16, 5]
]

function inPoly(px, py, poly) {
  // 取像素中心點判斷，邊界才不會忽大忽小
  const x = px + 0.5
  const y = py + 0.5
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 側面的地質分層：依 y 決定是海水、岩層還是地核 */
function strata(y, side) {
  if (y < 18) return side === 'L' ? C.waterL : C.waterR
  if (y < 24) return side === 'L' ? C.rockL : C.rockR
  return side === 'L' ? C.coreL : C.coreR
}

/** 畫出 32×32 的世界方塊 */
function draw32() {
  const px = Array.from({ length: 32 }, () => Array(32).fill(C.clear))
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (inPoly(x, y, TOP)) px[y][x] = y === 4 ? C.oceanRim : C.ocean
      else if (inPoly(x, y, LEFT)) px[y][x] = strata(y, 'L')
      else if (inPoly(x, y, RIGHT)) px[y][x] = strata(y, 'R')
    }
  }
  // 陸地只畫在頂面範圍內
  for (const [lx, ly, w] of LAND) {
    for (let i = 0; i < w; i++) {
      if (inPoly(lx + i, ly, TOP)) px[ly][lx + i] = C.land
    }
  }
  return px
}

/**
 * 16×16 的手工簡化版。
 * 32×32 直接縮一半會把陸地糊成雜訊，工作列上看起來就是一團色塊，
 * 所以這個尺寸重畫：只保留方塊輪廓、一塊陸地、一道地核的光。
 */
function draw16() {
  const px = Array.from({ length: 16 }, () => Array(16).fill(C.clear))
  const top = [[8, 2], [15, 6], [8, 10], [1, 6]]
  const left = [[1, 6], [8, 10], [8, 15], [1, 11]]
  const right = [[15, 6], [8, 10], [8, 15], [15, 11]]
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (inPoly(x, y, top)) px[y][x] = C.ocean
      else if (inPoly(x, y, left)) px[y][x] = y < 9 ? C.waterL : y < 12 ? C.rockL : C.coreL
      else if (inPoly(x, y, right)) px[y][x] = y < 9 ? C.waterR : y < 12 ? C.rockR : C.coreR
    }
  }
  // 一塊看得出來的陸地就夠了
  for (const [lx, ly, w] of [[5, 5, 4], [9, 6, 3]]) {
    for (let i = 0; i < w; i++) if (inPoly(lx + i, ly, top)) px[ly][lx + i] = C.land
  }
  return px
}

/** 最近鄰整數倍放大——像素圖唯一正確的放大方式 */
function scale(px, factor) {
  const n = px.length * factor
  const out = Array.from({ length: n }, () => Array(n).fill(C.clear))
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) out[y][x] = px[Math.floor(y / factor)][Math.floor(x / factor)]
  }
  return out
}

// ── PNG 編碼 ────────────────────────────────────────────────────
const crcTable = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function toPng(px) {
  const size = px.length
  const raw = []
  for (let y = 0; y < size; y++) {
    raw.push(0) // 每列的濾波器型別
    for (let x = 0; x < size; x++) {
      const c = px[y][x]
      if (c) raw.push(c[0], c[1], c[2], 255)
      else raw.push(0, 0, 0, 0)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 位元深度
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from(raw), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/**
 * 打包成 .ico。
 * 每個尺寸各存一份 PNG——Windows Vista 之後支援 PNG 壓縮的圖示項目，
 * 比傳統的 BMP 小很多，也不用處理 AND 遮罩。
 */
function toIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // 保留
  header.writeUInt16LE(1, 2) // 型別 1 = 圖示
  header.writeUInt16LE(entries.length, 4)

  const dir = []
  let offset = 6 + entries.length * 16
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size // 256 以 0 表示
    e[1] = size >= 256 ? 0 : size
    e[2] = 0 // 調色盤色數
    e[3] = 0
    e.writeUInt16LE(1, 4) // 色彩平面
    e.writeUInt16LE(32, 6) // 每像素位元數
    e.writeUInt32BE(0, 8)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    dir.push(e)
    offset += png.length
  }
  return Buffer.concat([header, ...dir, ...entries.map((e) => e.png)])
}

// ── 產出 ────────────────────────────────────────────────────────
const root = path.join(__dirname, '..')
const buildDir = path.join(root, 'build')
fs.mkdirSync(buildDir, { recursive: true })

const base32 = draw32()
const base16 = draw16()

// 16 與 48 用手工簡化版放大；其餘由 32×32 放大。全部都是整數倍。
const sizes = [
  { size: 16, px: base16 },
  { size: 32, px: base32 },
  { size: 48, px: scale(base16, 3) },
  { size: 64, px: scale(base32, 2) },
  { size: 128, px: scale(base32, 4) },
  { size: 256, px: scale(base32, 8) }
]

const entries = sizes.map(({ size, px }) => ({ size, png: toPng(px) }))

fs.writeFileSync(path.join(buildDir, 'icon.ico'), toIco(entries))
fs.writeFileSync(path.join(buildDir, 'icon.png'), entries.find((e) => e.size === 256).png)

// 系統匣圖示直接內嵌進主行程，省去打包後找路徑的麻煩
const trayB64 = toPng(scale(base16, 2)).toString('base64')
fs.writeFileSync(path.join(buildDir, 'tray-base64.txt'), trayB64)

console.log('build/icon.ico   ' + sizes.map((s) => s.size).join(', '))
console.log('build/icon.png   256×256')
console.log('build/tray-base64.txt   32×32，貼進 src/main/index.ts')
