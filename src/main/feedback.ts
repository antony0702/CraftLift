import { app } from 'electron'
import type { FeedbackInput } from '@shared/types'

/**
 * 使用者意見回饋。
 *
 * 送到一份 Google 表單。選這個管道的理由：
 * - 使用者本來就必須有 Google 帳號（要用 GCP），所以零額外門檻
 * - 回覆是私密的，不像 GitHub issue 會公開，使用者敢附帳單相關細節
 * - 不需要伺服器，也不需要在開源的程式碼裡藏金鑰——藏了也等於公開
 *
 * 表單網址是公開資訊，被人拿去灌水最多只是試算表多幾列，隨時可以關閉
 * 表單。這是「被濫用也不痛」的管道，那正是公開專案需要的性質。
 */

const FORM_ID = '1FAIpQLSezvjms6MtSkXl_NesRndvqsJWLaa5vUMb8YkypuXLRcVHmlg'

/**
 * 表單各欄位的代號。
 *
 * 這串數字由 Google 產生，改動表單的題目順序或重建表單都會讓它們失效。
 * 取得方式：表單右上角 ⋮ → 取得預先填入的連結 → 隨便填 → 取得連結，
 * 網址裡的 entry.數字 就是。
 */
const FIELD = {
  subject: 'entry.375896748',
  name: 'entry.135567854',
  body: 'entry.57856978',
  meta: 'entry.909855674'
} as const

const BASE = `https://docs.google.com/forms/d/e/${FORM_ID}`

/** 附在回饋後面的環境資訊，省得每次都要問使用者用什麼版本 */
function metaLine(): string {
  return `CraftLift v${app.getVersion()} · ${process.platform} ${process.arch}`
}

function fields(input: FeedbackInput): Record<string, string> {
  return {
    [FIELD.subject]: input.subject.trim(),
    [FIELD.name]: input.name.trim(),
    [FIELD.body]: input.body.trim(),
    [FIELD.meta]: metaLine()
  }
}

/**
 * 直接送出回饋。
 *
 * 從主行程送而不是畫面：主行程是 Node 環境，沒有 CORS 限制，使用者
 * 填完按送出就結束，不必被丟到瀏覽器再按一次。
 *
 * 判斷成功只看 HTTP 狀態——實測必填欄位缺漏時 Google 回 400，成功回 200。
 * 不看回應內容裡的文字，因為那會隨使用者的語言變化。
 */
export async function submitFeedback(input: FeedbackInput): Promise<void> {
  const res = await fetch(`${BASE}/formResponse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields(input))
  })

  if (!res.ok) {
    throw new Error(`FEEDBACK_REJECTED_${res.status}`)
  }
}

/**
 * 預先填好內容的表單網址。
 *
 * 直接送出失敗時的退路——Google 改了介面、使用者的網路擋掉了 POST，
 * 都還能靠瀏覽器把話說出去。回饋送不出去卻沒人知道，是最糟的結果。
 */
export function feedbackFormUrl(input: FeedbackInput): string {
  const params = new URLSearchParams({ usp: 'pp_url', ...fields(input) })
  return `${BASE}/viewform?${params.toString()}`
}
