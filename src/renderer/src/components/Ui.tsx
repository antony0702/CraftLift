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

export function Loading({ text }: { text?: string }): React.JSX.Element {
  return (
    <div className="centered">
      <Waiting />
      {text && <p className="muted small">{text}</p>}
    </div>
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
