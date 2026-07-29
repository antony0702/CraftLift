import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { UpdateState } from '@shared/types'
import { formatSize } from '../lib/update'

/** 進度分成 22 格，跟其他等待指示一樣是離散的——這套介面裡沒有平滑漸變。 */
const CELLS = 22

function Meter({ percent }: { percent: number }): React.JSX.Element {
  const lit = Math.round((percent / 100) * CELLS)
  return (
    <span className="meter" aria-hidden>
      {Array.from({ length: CELLS }, (_, i) => (
        <i key={i} className={i < lit ? 'on' : undefined} />
      ))}
    </span>
  )
}

/**
 * 更新提示。
 *
 * 橫貫在視窗列下方，因為它講的是整個程式的事，不屬於任何一個畫面。
 * 刻意不用彈窗擋住操作——使用者很可能正在等一台機器開機，這種時候
 * 被強制中斷，比晚幾分鐘再更新糟得多。
 *
 * 只在「有新版」「下載中」「已就緒」時出現。沒有更新時完全不佔位置，
 * 也不顯示「已是最新版」——那是使用者主動去設定裡按檢查時才想看到的話。
 */
export default function UpdateNotice({
  state,
  onDownload,
  onInstall
}: {
  state: UpdateState
  onDownload: () => void
  onInstall: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)

  // 狀態一變就把「稍後」解除。使用者按掉「有新版」的提示之後，等下載完成
  // 這件事仍然值得再講一次——不然他永遠不知道可以重開了。
  useEffect(() => setDismissed(false), [state.phase])

  if (dismissed) return null

  if (state.phase === 'available') {
    const size = formatSize(state.sizeBytes)
    return (
      <div className="update-bar">
        <span>
          {t('update.available', { version: state.version })}
          {size && <span className="fact size">{size}</span>}
        </span>
        <div className="grow" />
        <button type="button" className="torch small" onClick={onDownload}>
          {t('update.download')}
        </button>
        <button type="button" className="bare small" onClick={() => setDismissed(true)}>
          {t('update.later')}
        </button>
      </div>
    )
  }

  if (state.phase === 'downloading') {
    return (
      <div className="update-bar">
        <span>{t('update.downloading')}</span>
        <Meter percent={state.percent} />
        <span className="fact size">{state.percent}%</span>
      </div>
    )
  }

  if (state.phase === 'ready') {
    return (
      <div className="update-bar">
        <span>{t('update.ready', { version: state.version })}</span>
        <div className="grow" />
        <button type="button" className="torch small" onClick={onInstall}>
          {t('update.install')}
        </button>
        <button type="button" className="bare small" onClick={() => setDismissed(true)}>
          {t('update.later')}
        </button>
      </div>
    )
  }

  return null
}
