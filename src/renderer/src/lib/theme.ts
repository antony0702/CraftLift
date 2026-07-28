import { useEffect } from 'react'

/**
 * 把配色套到根元素上。
 *
 * 實際採用哪一套由主行程決定——它透過 Electron 的 nativeTheme 讀取
 * 作業系統設定，所以「跟隨系統」在使用者於系統設定裡切換時會即時反應，
 * 不需要畫面這端輪詢。
 */
export function useTheme(): void {
  useEffect(() => {
    const apply = (theme: 'light' | 'dark'): void => {
      document.documentElement.setAttribute('data-theme', theme)
    }

    void window.api.app.effectiveTheme().then((result) => {
      if (result.ok) apply(result.data)
    })

    return window.api.app.onThemeChange(apply)
  }, [])
}
