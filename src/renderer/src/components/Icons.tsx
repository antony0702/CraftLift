/**
 * 介面圖示。
 *
 * 全部用整數座標的方塊拼成，`shapeRendering="crispEdges"` 關掉抗鋸齒，
 * 這樣跟點陣字體是同一套語言——曲線與斜線在這裡是外來物。
 */

interface IconProps {
  size?: number
}

/**
 * 設定：三條滑桿。
 *
 * 原本是齒輪，但 18px 的點陣格線放不下齒輪的齒——八個角上的小方塊配一個
 * 挖空的中心，看起來像太陽而不是齒輪。滑桿在這個尺寸下不會認錯：三條線
 * 加三個突出來的把手，就算全部同色也讀得出來，因為把手比線高。
 */
export function Sliders({ size = 18 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="1" y="3" width="16" height="2" />
      <rect x="4" y="1" width="3" height="6" />
      <rect x="1" y="8" width="16" height="2" />
      <rect x="11" y="6" width="3" height="6" />
      <rect x="1" y="13" width="16" height="2" />
      <rect x="7" y="11" width="3" height="6" />
    </svg>
  )
}

/** 返回 */
export function Back({ size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="6" y="3" width="2" height="2" />
      <rect x="4" y="5" width="2" height="2" />
      <rect x="2" y="7" width="2" height="2" />
      <rect x="4" y="9" width="2" height="2" />
      <rect x="6" y="11" width="2" height="2" />
      <rect x="4" y="7" width="10" height="2" />
    </svg>
  )
}

/** 複製 */
export function Copy({ size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="8" height="1" />
      <rect x="1" y="2" width="1" height="7" />
      <rect x="1" y="9" width="3" height="1" />
      <rect x="5" y="4" width="8" height="1" />
      <rect x="5" y="12" width="8" height="1" />
      <rect x="5" y="5" width="1" height="7" />
      <rect x="12" y="5" width="1" height="7" />
    </svg>
  )
}

/** 上一層資料夾 */
export function Up({ size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="6" y="2" width="2" height="10" />
      <rect x="4" y="4" width="2" height="2" />
      <rect x="2" y="6" width="2" height="2" />
      <rect x="8" y="4" width="2" height="2" />
      <rect x="10" y="6" width="2" height="2" />
    </svg>
  )
}

/** 資料夾與檔案：檔案清單用 */
export function Folder({ size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="1" y="3" width="5" height="1" />
      <rect x="1" y="4" width="12" height="8" />
    </svg>
  )
}

export function FileIcon({ size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="3" y="1" width="6" height="12" />
      <rect x="9" y="4" width="2" height="9" />
      <rect x="9" y="3" width="1" height="1" />
    </svg>
  )
}

/* ── 視窗按鈕 ─────────────────────────────────────────────────
   無邊框視窗自己畫的那三顆。刻意畫得比系統的細——它們不是這個畫面
   要人看的東西，只是在原本的位置提供原本的功能。線寬固定 1px 而不
   隨 size 變，粗一點就會從「窗框」變成「按鈕」。 */

/** 最小化：一條底線 */
export function WinMinimize({ size = 10 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="1" y="5" width="8" height="1" />
    </svg>
  )
}

/** 最大化：一個空的方框 */
export function WinMaximize({ size = 10 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="8" height="1" />
      <rect x="1" y="8" width="8" height="1" />
      <rect x="1" y="2" width="1" height="6" />
      <rect x="8" y="2" width="1" height="6" />
    </svg>
  )
}

/** 還原：兩個錯開的方框，後面那個只露出兩條邊 */
export function WinRestore({ size = 10 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="3" y="0" width="7" height="1" />
      <rect x="9" y="1" width="1" height="6" />
      <rect x="3" y="6" width="6" height="1" />
      <rect x="0" y="3" width="7" height="1" />
      <rect x="0" y="9" width="7" height="1" />
      <rect x="0" y="4" width="1" height="5" />
      <rect x="6" y="4" width="1" height="5" />
    </svg>
  )
}

/** 關閉：一個叉 */
export function WinClose({ size = 10 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={`a${i}`} x={1 + i} y={1 + i} width="1" height="1" />
      ))}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={`b${i}`} x={8 - i} y={1 + i} width="1" height="1" />
      ))}
    </svg>
  )
}
