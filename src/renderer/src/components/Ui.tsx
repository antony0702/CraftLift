import type { ReactNode } from 'react'

/** 共用元件。全部沿用同一套語彙：硬邊、無圓角、間距對齊 11px 格線。 */

/** 等待指示：逐格四階，跟世界方塊的光池是同一套語言，不用漸變。 */
export function Waiting(): React.JSX.Element {
  return (
    <span className="waiting" aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * 進度條。
 *
 * 用離散的格子而不是連續的長條——這套介面的等待指示、世界方塊底下的光池
 * 都是分階的，連續漸變的進度條會是整個畫面裡唯一一個平滑的東西。
 *
 * percent 是 null 時代表總量還不知道（例如下載才剛開始、還在問遠端有多大），
 * 這時候讓格子跑動而不是停在 0%——停著會被當成卡住了。
 */
export function Progress({
  percent,
  frozen
}: {
  percent: number | null
  /** 暫停中。總量還不知道時也不要讓格子跑動，那看起來像還在傳。 */
  frozen?: boolean
}): React.JSX.Element {
  const cells = 20
  const filled = percent === null ? 0 : Math.round((Math.min(100, Math.max(0, percent)) / 100) * cells)
  return (
    <span
      className={`progress${percent === null && !frozen ? ' unknown' : ''}`}
      role="progressbar"
      aria-valuenow={percent ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} className={i < filled ? 'on' : ''} />
      ))}
    </span>
  )
}

export function Loading({ text }: { text?: string }): React.JSX.Element {
  return (
    <div className="centered">
      <Waiting />
      {text && <p className="muted small">{text}</p>}
    </div>
  )
}

/**
 * 一列傳輸進度：「正在上傳 檔名 ▮▮▮▮▯▯▯▯ 45%」。
 *
 * 百分比用等寬字——它是機器算出來的數字，跟 IP、檔案大小同一類。
 */
export function TransferRow({
  label,
  name,
  percent,
  tone = 'running',
  onPause,
  onResume,
  onCancel,
  pauseTitle,
  resumeTitle,
  cancelTitle
}: {
  label: string
  name: string
  percent: number | null
  tone?: 'running' | 'paused' | 'failed' | 'cancelled'
  onPause?: () => void
  onResume?: () => void
  onCancel?: () => void
  pauseTitle?: string
  resumeTitle?: string
  cancelTitle?: string
}): React.JSX.Element {
  const stopped = tone === 'failed' || tone === 'cancelled'
  return (
    <span className={`transfer ${tone}`}>
      <span className="transfer-label">
        {label}
        {name && <span className="fact"> {name}</span>}
      </span>
      {/* 暫停時進度條停在原地不動：不確定進度那種跑動的動畫會讓人以為還在傳 */}
      <Progress percent={stopped ? 100 : percent} frozen={tone === 'paused'} />
      {percent !== null && !stopped && <span className="fact pct">{percent}%</span>}
      {/* 暫停與繼續的圖示用 CSS 畫，不用文字符號：▮▮ 這類方塊字元的寬高
          由字型決定，在 11px 的格線上比例會歪掉。畫出來的才對得準，
          也才跟這套介面的硬邊像素語彙一致。 */}
      {onResume && (
        <button type="button" className="icon-btn glyph-btn" title={resumeTitle} onClick={onResume}>
          <i className="ic-play" />
        </button>
      )}
      {onPause && (
        <button type="button" className="icon-btn glyph-btn" title={pauseTitle} onClick={onPause}>
          <i className="ic-pause" />
        </button>
      )}
      {onCancel && (
        <button type="button" className="icon-btn cancel-btn" title={cancelTitle} onClick={onCancel}>
          ✕
        </button>
      )}
    </span>
  )
}

export function ErrorText({ children }: { children: ReactNode }): React.JSX.Element | null {
  if (!children) return null
  return <p className="error">{children}</p>
}

export function Field({
  label,
  hint,
  children
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <Info text={hint} />}
      </span>
      {children}
    </label>
  )
}

/** 滑鼠移上去顯示說明。用在那些一般玩家看不懂但必須提供的進階選項旁。 */
export function Info({ text }: { text: ReactNode }): React.JSX.Element {
  return (
    <span className="info" tabIndex={0}>
      i<span>{text}</span>
    </span>
  )
}

export function Modal({
  title,
  children,
  onClose
}: {
  title: ReactNode
  children: ReactNode
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {/* 標題原樣輸出：檔案編輯器要的是等寬的路徑，對話框要的是一般標題，
              樣式交給呼叫端決定 */}
          {title}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Tabs({
  tabs,
  active,
  onChange
}: {
  tabs: Array<{ id: string; label: ReactNode }>
  active: string
  onChange: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/** 空狀態：邀請使用者動手，不是道歉。 */
export function Blank({
  children,
  action
}: {
  children: ReactNode
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="blank">
      {children}
      {action && <div style={{ marginTop: 22 }}>{action}</div>}
    </div>
  )
}
