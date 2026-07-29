import { useCallback, useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'

/**
 * 訂閱更新狀態。
 *
 * 真正的狀態存在主行程——檢查與下載都在那邊跑，畫面切換或設定頁重開
 * 都不該讓進度歸零。所以這裡掛載時先問一次目前狀態，之後只被動接收。
 *
 * 標題列與設定頁各自呼叫一次這個 hook，兩邊聽的是同一串事件，會同步變動。
 */
export function useUpdate(): {
  state: UpdateState
  check: () => void
  download: () => void
  install: () => void
} {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })

  useEffect(() => {
    void window.api.update.state().then((r) => {
      if (r.ok) setState(r.data)
    })
    return window.api.update.onChange(setState)
  }, [])

  return {
    state,
    check: useCallback(() => void window.api.update.check(), []),
    download: useCallback(() => void window.api.update.download(), []),
    // 呼叫後程式就會結束並交給安裝程式，這裡不會再收到任何狀態
    install: useCallback(() => void window.api.update.install(), [])
  }
}

/** 下載大小。安裝檔是幾十 MB 的量級，MB 就夠精確了。 */
export function formatSize(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null
  return `${Math.round(bytes / 1024 / 1024)} MB`
}
