import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Backup, MinecraftServer } from '@shared/types'
import { BACKUP_KEEP } from '@shared/constants'
import { call, errorText, formatSize, formatTime } from '../../lib/api'
import { completedKey, percentOf, useTransfers } from '../../lib/transfers'
import { ErrorText, Field, Info, Loading, Progress, TransferRow } from '../../components/Ui'

/**
 * 備份分成兩類，靠檔名前綴分辨。
 *
 * 後端本來就是分開打包的：世界每隔幾小時一份，模組與設定只有真的變動過
 * 才會產生新的一份。前端照這條線分開列，各自有自己的「立刻備份」按鈕——
 * 這兩件事的成本差很多（世界幾 GB、設定幾十 MB），使用者想單獨做哪一種
 * 就該做得到，不必為了留一份設定而重壓一次整個世界。
 */
const SECTIONS = [
  { id: 'world', prefix: 'world-' },
  { id: 'setup', prefix: 'setup-' }
] as const

type Kind = (typeof SECTIONS)[number]['id']

export default function BackupsTab({ server }: { server: MinecraftServer }): React.JSX.Element {
  const { t } = useTranslation()
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [interval, setIntervalHours] = useState(6)

  const transfers = useTransfers(server.name)

  const load = useCallback(async () => {
    try {
      const [list, prefs] = await Promise.all([
        call(window.api.backup.list(server.name, server.zone)),
        call(window.api.app.getPreferences())
      ])
      setBackups(list)
      setIntervalHours(prefs.backupIntervalHours)
      setMessage('')
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [server.name, server.zone])

  useEffect(() => {
    void load()
  }, [load])

  // 下載完成後重讀一次。跟其他分頁一樣，傳輸可能是在別的分頁上跑完的。
  const finished = completedKey(transfers)
  useEffect(() => {
    if (finished) void load()
  }, [finished, load])

  /**
   * 立刻備份。
   *
   * 「正在打包」的狀態刻意不放在這裡——它由主行程的登記處保管，這個元件
   * 只是訂閱者。放在元件裡的話，使用者切個分頁再回來就看不到打包中的
   * 提示，而下載按鈕會跑出來，於是下載到一份還在寫的壓縮檔。
   */
  const createNow = async (kind: Kind): Promise<void> => {
    setMessage('')
    try {
      await call(window.api.backup.create(server.name, server.zone, kind))
      await load()
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  const saveInterval = async (): Promise<void> => {
    setBusy(true)
    setMessage('')
    try {
      await call(window.api.backup.setInterval(server.name, server.zone, interval))
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const download = async (backup: Backup): Promise<void> => {
    try {
      await call(window.api.files.download(server.name, server.zone, [backup.path]))
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  if (loading) return <Loading />

  /**
   * 這一份備份正在被拉回本機嗎。
   *
   * 只認「進行中」與「已暫停」。登記處會把結束的紀錄多留幾秒，好讓剛切
   * 回來的畫面看得到結果——狀態列那種地方需要這個，但表格裡不行：這一格
   * 的職責是那顆下載按鈕，取消之後按鈕必須立刻回來，不能等紀錄過期。
   */
  const transferOf = (backup: Backup): (typeof transfers)[number] | undefined =>
    transfers.find(
      (job) =>
        job.kind === 'download' &&
        job.label === backup.fileName &&
        (job.state === 'running' || job.state === 'paused')
    )

  /** 這一區正在打包嗎。答案在主行程，所以切分頁回來依然正確。 */
  const packingOf = (kind: Kind): boolean =>
    transfers.some(
      (job) =>
        job.kind === 'backup' &&
        job.state === 'running' &&
        (job.label === kind || job.label === 'all')
    )
  const anyPacking = transfers.some((job) => job.kind === 'backup' && job.state === 'running')

  return (
    <div className="backups">
      {/* 這段警語很重要：使用者需要知道 VM 上的備份不是保命備份 */}
      <div className="notice">
        <strong>{t('backups.warningTitle')}</strong>
        <p className="muted small">{t('backups.warningBody')}</p>
      </div>

      <p className="muted small">{t('backups.keepNote', { count: BACKUP_KEEP })}</p>

      <Field label={t('backups.interval')} hint={t('backups.intervalHint')}>
        <div className="inline-form">
          <input
            type="number"
            min={1}
            max={168}
            value={interval}
            onChange={(e) => setIntervalHours(Number(e.target.value))}
          />
          <button type="button" disabled={busy} onClick={() => void saveInterval()}>
            {t('common.save')}
          </button>
        </div>
      </Field>

      <ErrorText>{message}</ErrorText>

      {SECTIONS.map((section) => {
        const rows = backups.filter((b) => b.fileName.startsWith(section.prefix))
        const packing = packingOf(section.id)
        return (
          <div className="backup-group" key={section.id}>
            <div className="toolbar">
              <h3>
                {t(`backups.groups.${section.id}.title`)}
                {/* Only the setup archive has a rule worth stating: it is
                    rebuilt on change, not on the schedule above. */}
                {section.id === 'setup' && <Info text={t('backups.groups.setup.hint')} />}
              </h3>
              <div className="grow" />
              <button
                type="button"
                className="primary"
                disabled={anyPacking}
                onClick={() => void createNow(section.id)}
              >
                {t(`backups.groups.${section.id}.createNow`)}
              </button>
            </div>

            {/* 打包中：顯示不確定進度。伺服器上的 tar 沒有辦法回報做到幾成，
                硬畫一條會填滿的進度條等於編數字——這時候誠實比較有用。
                打包完成之前不列出任何東西，也就下載不到半成品。 */}
            {packing && (
              <p className="small">
                <span className="transfer">
                  <span className="transfer-label">
                    {t(`backups.groups.${section.id}.packing`)}
                  </span>
                  <Progress percent={null} />
                </span>
              </p>
            )}

            {!packing && rows.length === 0 ? (
              <p className="muted small">{t('backups.empty')}</p>
            ) : (
              !packing && (
                <table className="table">
                  <tbody>
                    {rows.map((backup) => {
                      const job = transferOf(backup)
                      return (
                        <tr key={backup.path}>
                          <td className="fact">{backup.fileName}</td>
                          <td className="muted small nowrap">{formatSize(backup.size)}</td>
                          <td className="muted small nowrap">{formatTime(backup.modifiedAt)}</td>
                          <td className="nowrap">
                            {/* 下載中就把按鈕換成進度條。按鈕留在原地的話，
                                使用者會以為沒反應而再按一次。 */}
                            {job ? (
                              <TransferRow
                                label={t(
                                  job.state === 'paused'
                                    ? 'transfer.downloadPaused'
                                    : 'transfer.download'
                                )}
                                name=""
                                percent={percentOf(job)}
                                tone={job.state === 'paused' ? 'paused' : 'running'}
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
                                onCancel={() => void window.api.transfer.cancel(job.id)}
                                pauseTitle={t('transfer.pause')}
                                resumeTitle={t('transfer.resume')}
                                cancelTitle={t('transfer.cancel')}
                              />
                            ) : (
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => void download(backup)}
                              >
                                {t('backups.saveToPc')}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
