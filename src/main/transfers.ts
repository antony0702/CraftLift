import { randomUUID } from 'node:crypto'
import type { Transfer } from '@shared/types'

/**
 * 上傳與下載的進度登記處。
 *
 * 為什麼放在主行程而不是畫面裡：一趟傳輸可能要好幾分鐘，而使用者在這段
 * 期間本來就會切到別的分頁去看別的東西。進度若只存在元件的狀態裡，切走
 * 一次就整個消失，回來看到的是一個什麼都沒發生的畫面——但傳輸其實還在跑。
 * 那個落差比慢更讓人不安。
 *
 * 登記在這裡之後，任何時候重新掛載的畫面都能問「現在有什麼正在傳」，
 * 接著訂閱後續的變化。
 */

const transfers = new Map<string, Transfer>()
const listeners = new Set<(list: Transfer[]) => void>()

/** 完成或失敗的紀錄留這麼久，讓剛切回來的畫面還看得到結果 */
const KEEP_FINISHED_MS = 8000

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

export interface TransferHandle {
  /** 累加已完成的位元組 */
  advance: (bytes: number) => void
  /** 換到下一個檔案時更新說明文字 */
  describe: (label: string) => void
  /** 下載時總量要問過遠端才知道，算出來再補上 */
  setTotal: (bytes: number) => void
  done: () => void
  fail: (message: string) => void
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
    publish()
    setTimeout(() => {
      transfers.delete(id)
      publish()
    }, KEEP_FINISHED_MS)
  }

  return {
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
    done: () => settle('done'),
    fail: (message) => settle('failed', message)
  }
}
