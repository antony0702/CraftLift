import { useEffect, useState } from 'react'
import type { Transfer } from '@shared/types'

/**
 * 訂閱某台伺服器正在進行的上傳與下載。
 *
 * 掛載時先問一次主行程「現在有什麼在傳」，之後才接後續變化——只訂閱不
 * 補問的話，切走再切回來的那一瞬間畫面會是空的，而傳輸其實還在跑。
 * 那個空白正是使用者回報「跳到其他頁面再回來，正在上傳就消失了」的原因。
 */
export function useTransfers(serverName: string): Transfer[] {
  const [all, setAll] = useState<Transfer[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await window.api.transfer.list()
      if (!cancelled && result.ok) setAll(result.data)
    })()
    const unsubscribe = window.api.transfer.onChange((list) => setAll(list))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return all.filter((t) => t.server === serverName)
}

/**
 * 剛完成的傳輸的識別碼，串成一個字串當作相依值。
 *
 * 用途是「傳完了就重新讀一次清單」。這件事不能靠呼叫端在 await 之後
 * 自己 setState——使用者切到別的分頁時元件已經卸載，那個 setState 落在
 * 一個死掉的元件上，切回來看到的還是傳輸前的清單。
 *
 * 主行程會把完成的紀錄多留幾秒，所以就算整段傳輸都發生在別的分頁上，
 * 切回來的當下仍然看得到那筆「已完成」，因而觸發一次重讀。
 */
export function completedKey(transfers: Transfer[]): string {
  return transfers
    .filter((t) => t.state === 'done')
    .map((t) => t.id)
    .join(',')
}

/** 已完成的百分比。總量還不知道時回 null，畫面要顯示成不確定進度。 */
export function percentOf(transfer: Transfer): number | null {
  if (!transfer.totalBytes) return null
  return Math.min(100, Math.round((transfer.doneBytes / transfer.totalBytes) * 100))
}
