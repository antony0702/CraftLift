import { randomUUID } from 'node:crypto'
import type { Transfer } from '@shared/types'

/**
 * 上傳與下載的進度登記處，兼遙控器。
 *
 * 為什麼放在主行程而不是畫面裡：一趟傳輸可能要好幾分鐘，而使用者在這段
 * 期間本來就會切到別的分頁去看別的東西。進度若只存在元件的狀態裡，切走
 * 一次就整個消失，回來看到的是一個什麼都沒發生的畫面——但傳輸其實還在跑。
 * 那個落差比慢更讓人不安。
 *
 * 暫停與取消也在這裡：按鈕在畫面上，真正在傳的串流在主行程，中間要有個
 * 東西把兩者接起來。執行傳輸的那一方把控制函式登記進來，畫面那端只認識
 * 一個識別碼。
 */

const transfers = new Map<string, Transfer>()
/** 每筆傳輸對應的控制函式，由實際執行傳輸的那一方登記 */
const controls = new Map<string, TransferControls>()
const listeners = new Set<(list: Transfer[]) => void>()

/** 完成或失敗的紀錄留這麼久，讓剛切回來的畫面還看得到結果 */
const KEEP_FINISHED_MS = 8000

export interface TransferControls {
  pause: () => void
  resume: () => void
  cancel: () => void
}

/** 取消時丟這個，好跟真正的錯誤分開 */
export class TransferCancelled extends Error {
  constructor() {
    super('TRANSFER_CANCELLED')
    this.name = 'TransferCancelled'
  }
}

function snapshot(): Transfer[] {
  return [...transfers.values()]
}

function publish(): void {
  const list = snapshot()
  for (const listener of listeners) listener(list)
}

export function onTransfersChanged(listener: (list: Transfer[]) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function listTransfers(): Transfer[] {
  return snapshot()
}

export function pauseTransfer(id: string): void {
  const entry = transfers.get(id)
  if (!entry || entry.state !== 'running') return
  controls.get(id)?.pause()
  entry.state = 'paused'
  publish()
}

export function resumeTransfer(id: string): void {
  const entry = transfers.get(id)
  if (!entry || entry.state !== 'paused') return
  controls.get(id)?.resume()
  entry.state = 'running'
  publish()
}

/**
 * 取消。
 *
 * 只負責把串流拆掉；後續的清理（刪暫存、把狀態改成 cancelled）由執行
 * 傳輸的那一方在自己的 finally 裡做——那裡才知道有哪些東西要收拾。
 */
export function cancelTransfer(id: string): void {
  const entry = transfers.get(id)
  if (!entry || (entry.state !== 'running' && entry.state !== 'paused')) return
  controls.get(id)?.cancel()
}

export interface TransferHandle {
  id: string
  /** 累加已完成的位元組 */
  advance: (bytes: number) => void
  /** 換到下一個檔案時更新說明文字 */
  describe: (label: string) => void
  /** 下載時總量要問過遠端才知道，算出來再補上 */
  setTotal: (bytes: number) => void
  /** 登記這一段傳輸的暫停／繼續／取消。換一個檔案就換一組。 */
  attach: (controls: TransferControls | null) => void
  /** 使用者按過取消了嗎。換檔案之間會檢查，才不會取消完又開始傳下一個。 */
  isCancelled: () => boolean
  done: () => void
  fail: (message: string) => void
  cancelled: () => void
}

/**
 * 開一筆傳輸。
 *
 * totalBytes 是 0 時畫面會顯示成不確定進度——寧可誠實說不知道，
 * 也不要畫一條假的進度條。
 */
export function startTransfer(input: {
  kind: Transfer['kind']
  server: string
  label: string
  totalBytes: number
}): TransferHandle {
  const id = randomUUID()
  const entry: Transfer = {
    id,
    kind: input.kind,
    server: input.server,
    label: input.label,
    totalBytes: input.totalBytes,
    doneBytes: 0,
    state: 'running'
  }
  transfers.set(id, entry)
  publish()

  let cancelRequested = false

  // 每個資料區塊都往畫面送一次會塞爆 IPC，而且畫面根本畫不了那麼快。
  // 用時間節流，並確保結束時一定送一次最後的狀態。
  let lastSent = 0
  const throttled = (): void => {
    const now = Date.now()
    if (now - lastSent < 120) return
    lastSent = now
    publish()
  }

  const settle = (state: Transfer['state'], error?: string): void => {
    const current = transfers.get(id)
    if (!current) return
    current.state = state
    current.error = error
    if (state === 'done') current.doneBytes = current.totalBytes || current.doneBytes
    controls.delete(id)
    publish()
    setTimeout(() => {
      transfers.delete(id)
      publish()
    }, KEEP_FINISHED_MS)
  }

  return {
    id,
    advance: (bytes) => {
      const current = transfers.get(id)
      if (!current) return
      current.doneBytes += bytes
      throttled()
    },
    describe: (label) => {
      const current = transfers.get(id)
      if (!current) return
      current.label = label
      throttled()
    },
    setTotal: (bytes) => {
      const current = transfers.get(id)
      if (!current) return
      current.totalBytes = bytes
      publish()
    },
    attach: (next) => {
      if (!next) {
        controls.delete(id)
        return
      }
      controls.set(id, {
        ...next,
        cancel: () => {
          cancelRequested = true
          next.cancel()
        }
      })
      // 換檔案的空檔按下取消時，這一段還沒登記控制函式，所以旗標要補生效
      if (cancelRequested) next.cancel()
    },
    isCancelled: () => cancelRequested,
    done: () => settle('done'),
    fail: (message) => settle('failed', message),
    cancelled: () => settle('cancelled')
  }
}
