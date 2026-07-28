import type { ReactNode } from 'react'

/** 一組樸素的共用元件。目前以「能用」為準，美術之後再統一調整。 */

export function Spinner(): React.JSX.Element {
  return <div className="spinner" />
}

export function Loading({ text }: { text?: string }): React.JSX.Element {
  return (
    <div className="centered">
      <Spinner />
      {text && <p>{text}</p>}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }): React.JSX.Element | null {
  if (!children) return null
  return <p className="error">{children}</p>
}

export function Card({
  title,
  children,
  actions
}: {
  title?: ReactNode
  children: ReactNode
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
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
        {hint && <InfoIcon text={hint} />}
      </span>
      {children}
    </label>
  )
}

/**
 * 滑鼠移上去會顯示說明的小圖示。
 * 用在那些「一般玩家看不懂但又必須提供」的進階選項旁邊。
 */
export function InfoIcon({ text }: { text: ReactNode }): React.JSX.Element {
  return (
    <span className="info-icon" tabIndex={0}>
      i<span className="info-bubble">{text}</span>
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="close">
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
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === active ? 'tab active' : 'tab'}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function StatusDot({ state }: { state: string }): React.JSX.Element {
  const tone =
    state === 'RUNNING' ? 'ok' : state === 'TERMINATED' || state === 'SUSPENDED' ? 'off' : 'busy'
  return <span className={`dot ${tone}`} />
}
