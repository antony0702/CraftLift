import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer } from '@shared/types'
import { REMOTE } from '@shared/constants'
import { call, errorText } from '../lib/api'
import { ErrorText, StatusDot, Tabs } from '../components/Ui'
import ConsoleTab from './tabs/ConsoleTab'
import FilesTab from './tabs/FilesTab'
import PropertiesTab from './tabs/PropertiesTab'
import PlayersTab from './tabs/PlayersTab'
import BackupsTab from './tabs/BackupsTab'

export default function ServerDetail({
  server: initial,
  onBack,
  onDeleted
}: {
  server: MinecraftServer
  onBack: () => void
  onDeleted: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [server, setServer] = useState(initial)
  const [tab, setTab] = useState('console')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setServer(await call(window.api.server.get(initial.name, initial.zone)))
    } catch (err) {
      setMessage(errorText(err))
    }
  }, [initial.name, initial.zone])

  useEffect(() => {
    const timer = setInterval(() => void refresh(), 10_000)
    return () => clearInterval(timer)
  }, [refresh])

  const running = server.state === 'RUNNING'
  const transitioning = server.state === 'STAGING' || server.state === 'STOPPING' || server.state === 'PROVISIONING'

  const power = async (action: 'start' | 'stop'): Promise<void> => {
    setBusy(true)
    setMessage('')
    try {
      await call(window.api.server[action](server.name, server.zone))
      await refresh()
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!window.confirm(t('detail.confirmDelete', { name: server.displayName }))) return
    setBusy(true)
    try {
      await call(window.api.server.delete(server.name, server.zone))
      onDeleted()
    } catch (err) {
      setMessage(errorText(err))
      setBusy(false)
    }
  }

  const copyAddress = async (): Promise<void> => {
    if (!server.externalIp) return
    await navigator.clipboard.writeText(`${server.externalIp}:${REMOTE.gamePort}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="page">
      <div className="detail-head">
        <button type="button" className="link" onClick={onBack}>
          ← {t('common.back')}
        </button>

        <div className="detail-title">
          <StatusDot state={server.state} />
          <h2>{server.displayName}</h2>
          <span className="muted small">
            Minecraft {server.mcVersion} · {server.machineType} · {server.zone}
          </span>
        </div>

        <div className="detail-actions">
          {server.externalIp && (
            <button type="button" className="address" onClick={() => void copyAddress()}>
              {copied ? t('common.copied') : `${server.externalIp}:${REMOTE.gamePort}`}
            </button>
          )}
          <button
            type="button"
            className="primary"
            disabled={busy || transitioning}
            onClick={() => void power(running ? 'stop' : 'start')}
          >
            {transitioning
              ? t(`state.${server.state}`)
              : running
                ? t('detail.shutdown')
                : t('detail.boot')}
          </button>
          <button type="button" className="link danger" disabled={busy} onClick={() => void remove()}>
            {t('detail.delete')}
          </button>
        </div>
      </div>

      {running && <p className="muted small">{t('detail.shutdownNote')}</p>}
      <ErrorText>{message}</ErrorText>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'console', label: t('detail.tabs.console') },
          { id: 'properties', label: t('detail.tabs.properties') },
          { id: 'players', label: t('detail.tabs.players') },
          { id: 'files', label: t('detail.tabs.files') },
          { id: 'backups', label: t('detail.tabs.backups') }
        ]}
      />

      <div className="card">
        {!running && tab !== 'console' ? (
          <div className="empty">
            <p>{t('detail.needRunning')}</p>
            <p className="muted small">{t('detail.needRunningHint')}</p>
          </div>
        ) : (
          <>
            {tab === 'console' && <ConsoleTab server={server} />}
            {tab === 'properties' && <PropertiesTab server={server} />}
            {tab === 'players' && <PlayersTab server={server} />}
            {tab === 'files' && <FilesTab server={server} />}
            {tab === 'backups' && <BackupsTab server={server} />}
          </>
        )}
      </div>
    </div>
  )
}
