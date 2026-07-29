/**
 * 介面圖示。
 *
 * 全部用整數座標的方塊拼成，`shapeRendering="crispEdges"` 關掉抗鋸齒，
 * 這樣跟點陣字體是同一套語言——曲線與斜線在這裡是外來物。
 */

interface IconProps {
  size?: number
}

/** 齒輪：偏好設定的入口 */
export function Gear({ size = 18 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="7" y="1" width="4" height="2" />
      <rect x="7" y="15" width="4" height="2" />
      <rect x="1" y="7" width="2" height="4" />
      <rect x="15" y="7" width="2" height="4" />
      <rect x="3" y="3" width="2" height="2" />
      <rect x="13" y="3" width="2" height="2" />
      <rect x="3" y="13" width="2" height="2" />
      <rect x="13" y="13" width="2" height="2" />
      <rect x="5" y="5" width="8" height="8" />
      {/* 中間挖空。用背景色而非 fill-rule，這樣在深淺主題都對。 */}
      <rect x="7" y="7" width="4" height="4" fill="var(--stone-900)" />
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
