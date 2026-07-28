import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer } from '@shared/types'
import { REMOTE } from '@shared/constants'
import { call, errorText } from '../lib/api'
import { Blank, ErrorText, Loading } from '../components/Ui'
import WorldBlock from '../components/WorldBlock'

/**
 * 你的世界。
 *
 * 版面由內容的重要性決定，不是由清單順序決定：執行中的世界佔大版面，
 * 關機的縮成一行。多數時候你只在意那個正在跑的，介面應該反映這件事。
 */
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
  const [copied, setCopied] = useState<string | null>(null)
  /** 主角的線上人數。要連 SSH 才查得到，所以獨立於清單非同步取得。 */
  const [players, setPlayers] = useState<number | null>(null)

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
    // 開關機要花一兩分鐘，定期重讀讓狀態自己跟上
    const timer = setInterval(() => void refresh(), 15_000)
    return () => clearInterval(timer)
  }, [refresh])

  const starName = servers.find((s) => s.state === 'RUNNING')?.name ?? null
  const starZone = servers.find((s) => s.state === 'RUNNING')?.zone ?? null

  // 線上人數要連進機器才問得到，慢且可能失敗。查不到就不顯示，
  // 不要因為這個非必要的數字而讓整張清單卡住或報錯。
  useEffect(() => {
    if (!starName || !starZone) {
      setPlayers(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const status = await call(window.api.minecraft.status(starName, starZone))
        if (!cancelled) setPlayers(status.playerCount)
      } catch {
        if (!cancelled) setPlayers(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [starName, starZone])

  const copyAddress = async (server: MinecraftServer): Promise<void> => {
    if (!server.externalIp) return
    await navigator.clipboard.writeText(`${server.externalIp}:${REMOTE.gamePort}`)
    setCopied(server.name)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) {
    return (
      <div className="screen">
        <Loading text={t('list.loading')} />
      </div>
    )
  }

  const running = servers.filter((s) => s.state === 'RUNNING')
  const others = servers.filter((s) => s.state !== 'RUNNING')
  const star = running[0] ?? null
  const rest = star ? [...running.slice(1), ...others] : others

  return (
    <div className="screen">
      <div className="eyebrow">{t('list.title')}</div>
      <ErrorText>{message}</ErrorText>

      {servers.length === 0 ? (
        <Blank
          action={
            <button type="button" className="torch" onClick={onCreate}>
              {t('list.create')}
            </button>
          }
        >
          <WorldBlock size={88} lit={false} />
          <p>{t('list.empty')}</p>
          <p className="muted small">{t('list.emptyHint')}</p>
        </Blank>
      ) : (
        <>
          {star && (
            <div className="hero">
              <WorldBlock size={132} lit />
              <div>
                <h1>{star.displayName}</h1>
                <div className="who">
                  {players === null ? t('state.RUNNING') : t('list.playing', { count: players })}
                </div>
                {star.externalIp && (
                  <button type="button" className="addr fact" onClick={() => void copyAddress(star)}>
                    {copied === star.name ? (
                      t('common.copied')
                    ) : (
                      <>
                        {star.externalIp}
                        <span className="port">:{REMOTE.gamePort}</span>
                      </>
                    )}
                  </button>
                )}
                <span className="spec fact">
                  {star.mcVersion} · {star.machineType} · {star.zone}
                </span>
                <div className="acts">
                  <button type="button" className="torch" onClick={() => onOpen(star)}>
                    {t('list.manage')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {rest.map((server) => (
            <button key={server.name} type="button" className="dorm" onClick={() => onOpen(server)}>
              <WorldBlock size={44} lit={server.state === 'RUNNING'} />
              <span className="n">{server.displayName}</span>
              <span className="sp fact">
                {server.mcVersion} · {server.machineType}
              </span>
              <span className="st">{t(`state.${server.state}`)}</span>
            </button>
          ))}

          <div className="actions">
            <button type="button" className="torch" onClick={onCreate}>
              {t('list.create')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
