/**
 * 世界方塊——整個介面的簽名元素。
 *
 * 一顆等角的地球方塊：頂面是海洋與陸地，側面是地質剖面，由上而下
 * 是海水、岩層、發亮的地核。那道橘光就是介面的強調色，所以圖示與
 * 配色是同一件事，不是兩套設計。
 *
 * 執行中的世界會在下方投出階梯狀的光池；關機的是一塊冷石頭。
 * 使用者不需要讀任何文字就知道伺服器在不在跑。
 *
 * 幾何與 design/generate-icon.js 產生應用程式圖示時用的是同一組座標，
 * 改造型時兩邊要一起改。
 */

interface Props {
  /** 邊長（像素）。用 11 的倍數才會跟版面的格線對齊。 */
  size: number
  /** 伺服器是否執行中。決定是地球還是冷石頭，以及要不要有光池。 */
  lit: boolean
}

export default function WorldBlock({ size, lit }: Props): React.JSX.Element {
  // clipPath 的 id 必須全域唯一，同一頁可能同時出現好幾顆方塊
  const uid = `w${size}${lit ? 'l' : 'd'}`

  return (
    <span className="stage">
      <span className="world">
        <svg width={size} height={size} viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden>
          <defs>
            <clipPath id={`${uid}T`}>
              <path d="M16 4 L30 12 L16 20 L2 12 Z" />
            </clipPath>
            <clipPath id={`${uid}L`}>
              <path d="M2 12 L16 20 L16 30 L2 22 Z" />
            </clipPath>
            <clipPath id={`${uid}R`}>
              <path d="M30 12 L16 20 L16 30 L30 22 Z" />
            </clipPath>
          </defs>

          {lit ? (
            <>
              {/* 左側面：背光，最暗。由上而下 海水→岩層→地核 */}
              <g clipPath={`url(#${uid}L)`}>
                <rect x="0" y="12" width="16" height="6" fill="#123047" />
                <rect x="0" y="18" width="16" height="6" fill="#241c14" />
                <rect x="0" y="24" width="16" height="3" fill="#8a3a10" />
                <rect x="0" y="27" width="16" height="4" fill="#e07a2f" />
              </g>
              {/* 右側面：受地核的光，整體亮一階 */}
              <g clipPath={`url(#${uid}R)`}>
                <rect x="16" y="12" width="16" height="6" fill="#1b4a6b" />
                <rect x="16" y="18" width="16" height="6" fill="#382b1e" />
                <rect x="16" y="24" width="16" height="3" fill="#b0561a" />
                <rect x="16" y="27" width="16" height="4" fill="#ffc078" />
              </g>
              {/* 頂面：海洋與陸地 */}
              <g clipPath={`url(#${uid}T)`}>
                <rect x="0" y="0" width="32" height="32" fill="#2b6c9e" />
                <g fill="#5e8c4a">
                  <rect x="9" y="9" width="5" height="1" />
                  <rect x="8" y="10" width="8" height="1" />
                  <rect x="9" y="11" width="6" height="1" />
                  <rect x="11" y="12" width="3" height="1" />
                  <rect x="18" y="11" width="6" height="1" />
                  <rect x="17" y="12" width="8" height="1" />
                  <rect x="19" y="13" width="5" height="1" />
                  <rect x="14" y="16" width="5" height="1" />
                </g>
                <rect x="0" y="4" width="32" height="1" fill="#4d90c0" opacity=".55" />
              </g>
            </>
          ) : (
            <>
              {/* 熄滅的世界。灰階走 CSS 變數，否則在淺色主題上會變成一團黑。 */}
              <g clipPath={`url(#${uid}L)`}>
                <rect x="0" y="12" width="16" height="19" fill="var(--dead-left)" />
              </g>
              <g clipPath={`url(#${uid}R)`}>
                <rect x="16" y="12" width="16" height="19" fill="var(--dead-right)" />
              </g>
              <g clipPath={`url(#${uid}T)`}>
                <rect x="0" y="0" width="32" height="32" fill="var(--dead-top)" />
                <g fill="var(--dead-land)">
                  <rect x="9" y="9" width="5" height="1" />
                  <rect x="8" y="10" width="8" height="1" />
                  <rect x="9" y="11" width="6" height="1" />
                  <rect x="18" y="11" width="6" height="1" />
                  <rect x="17" y="12" width="8" height="1" />
                  <rect x="14" y="16" width="5" height="1" />
                </g>
              </g>
            </>
          )}
        </svg>
      </span>

      {lit && (
        <span className="pool" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  )
}
