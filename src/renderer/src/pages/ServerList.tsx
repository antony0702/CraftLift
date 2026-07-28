import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer } from '@shared/types'
import { call, errorText } from '../lib/api'
import { Card, ErrorText, Loading, StatusDot } from '../components/Ui'

export default function ServerList({
  onOpen,
  onCreate
}: {
  onOpen: (server: MinecraftServer) => void
  onCreate: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [servers, setServers] = useState<MinecraftServer[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    try {
      setServers(await call(window.api.server.list()))
      setMessage('')
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    // 機器開關機需要一點時間，定期重新整理讓狀態自己跟上
    const timer = setInterval(() => void refresh(), 15_000)
    return () => clearInterval(timer)
  }, [refresh])

  if (loading) {
    return (
      <div className="page">
        <Card>
          <Loading text={t('list.loading')} />
        </Card>
      </div>
    )
  }

  return (
    <div className="page">
      <Card
        title={t('list.title')}
        actions={
          <button type="button" className="primary" onClick={onCreate}>
            {t('list.create')}
          </button>
        }
      >
        <ErrorText>{message}</ErrorText>

        {servers.length === 0 ? (
          <div className="empty">
            <p>{t('list.empty')}</p>
            <p className="muted small">{t('list.emptyHint')}</p>
          </div>
        ) : (
          <ul className="server-list">
            {servers.map((server) => (
              <li key={server.name}>
                <button type="button" className="server-row" onClick={() => onOpen(server)}>
                  <StatusDot state={server.state} />
                  <div className="server-main">
                    <strong>{server.displayName}</strong>
                    <span className="muted small">
                      Minecraft {server.mcVersion} · {server.zone}
                    </span>
                  </div>
                  <div className="server-side">
                    <span className="muted small">{t(`state.${server.state}`)}</span>
                    {server.externalIp && <code className="ip">{server.externalIp}</code>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
