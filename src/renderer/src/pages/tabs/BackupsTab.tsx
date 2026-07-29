import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Backup, MinecraftServer } from '@shared/types'
import { BACKUP_KEEP } from '@shared/constants'
import { call, errorText, formatSize, formatTime } from '../../lib/api'
import { ErrorText, Field, Loading } from '../../components/Ui'

export default function BackupsTab({ server }: { server: MinecraftServer }): React.JSX.Element {
  const { t } = useTranslation()
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [interval, setIntervalHours] = useState(6)

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

  const createNow = async (): Promise<void> => {
    setBusy(true)
    setMessage('')
    try {
      await call(window.api.backup.create(server.name, server.zone))
      await load()
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
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
      await call(window.api.files.download(server.name, server.zone, backup.path))
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  if (loading) return <Loading />

  return (
    <div className="backups">
      {/* 這段警語很重要：使用者需要知道 VM 上的備份不是保命備份 */}
      <div className="notice">
        <strong>{t('backups.warningTitle')}</strong>
        <p className="muted small">{t('backups.warningBody')}</p>
      </div>

      <div className="toolbar">
        <span className="muted small">{t('backups.keepNote', { count: BACKUP_KEEP })}</span>
        <div className="grow" />
        <button type="button" className="primary" disabled={busy} onClick={() => void createNow()}>
          {busy ? t('backups.working') : t('backups.createNow')}
        </button>
      </div>

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

      {backups.length === 0 ? (
        <p className="muted small">{t('backups.empty')}</p>
      ) : (
        <table className="table">
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.path}>
                <td>{backup.fileName}</td>
                <td className="muted small nowrap">{formatSize(backup.size)}</td>
                <td className="muted small nowrap">{formatTime(backup.modifiedAt)}</td>
                <td className="nowrap">
                  <button type="button" className="link-btn" onClick={() => void download(backup)}>
                    {t('backups.saveToPc')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
