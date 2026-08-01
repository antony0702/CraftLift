import type { Result } from '@shared/types'
import i18n from '../i18n'

/**
 * 把主行程回傳的 Result 拆開。
 *
 * 主行程刻意不讓例外跨越 IPC（Error 物件序列化後會掉資訊），
 * 改用明確的成功／失敗結構。畫面這端再轉回例外，這樣就能用
 * 一般的 try/catch 寫法。
 */
export async function call<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new Error(result.error)
  return result.data
}

/**
 * 把錯誤轉成可以顯示的文字。
 *
 * 主行程認得出來的失敗會回傳 `craftlift:xxx` 這種代碼而不是原文，
 * 在這裡翻成使用者的語言。認不出來的原樣顯示——看不懂的英文至少
 * 還能貼給別人看，被換成「發生錯誤」就什麼線索都不剩了。
 */
export function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (!raw.startsWith('craftlift:')) return raw

  const key = `errors.${raw.slice('craftlift:'.length)}`
  const translated = i18n.t(key)
  return translated === key ? raw : translated
}

/** 把位元組數轉成人看得懂的大小 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatTime(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString()
}
