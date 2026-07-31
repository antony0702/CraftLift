import { useTranslation } from 'react-i18next'
import type { Transfer } from '@shared/types'
import { percentOf } from '../lib/transfers'
import { TransferRow } from './Ui'

/**
 * 狀態列上那幾條傳輸進度。
 *
 * 「檔案」與「模組」兩個分頁長得一樣、行為也一樣，所以抽出來共用——
 * 同一件事在兩個地方各寫一次，遲早會有一邊忘了改。
 *
 * 按鈕直接打主行程，不經過所屬分頁：傳輸的狀態本來就住在那裡，
 * 分頁只是剛好正在看它的人。
 */
export default function Transfers({
  transfers
}: {
  transfers: Transfer[]
}): React.JSX.Element | null {
  const { t } = useTranslation()
  if (transfers.length === 0) return null

  return (
    <>
      {transfers.map((job) => {
        // 每個狀態一個完整的鍵，不用「已暫停」＋「正在上傳」拼字串——
        // 那樣在中文會變成「已暫停正在上傳」
        const suffix =
          job.state === 'paused' ? 'Paused' : job.state === 'cancelled' ? 'Cancelled' : ''
        const label = t(`transfer.${job.kind}${suffix}`)
        return (
          <TransferRow
            key={job.id}
            label={label}
            name={job.label}
            percent={percentOf(job)}
            tone={
              job.state === 'failed'
                ? 'failed'
                : job.state === 'cancelled'
                  ? 'cancelled'
                  : job.state === 'paused'
                    ? 'paused'
                    : 'running'
            }
            onPause={
              job.state === 'running'
                ? () => void window.api.transfer.pause(job.id)
                : undefined
            }
            onResume={
              job.state === 'paused'
                ? () => void window.api.transfer.resume(job.id)
                : undefined
            }
            onCancel={
              job.state === 'running' || job.state === 'paused'
                ? () => void window.api.transfer.cancel(job.id)
                : undefined
            }
            pauseTitle={t('transfer.pause')}
            resumeTitle={t('transfer.resume')}
            cancelTitle={t('transfer.cancel')}
          />
        )
      })}
    </>
  )
}
