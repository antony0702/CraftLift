import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer } from '@shared/types'
import { call, errorText } from '../lib/api'
import { Blank, ErrorText, Loading } from '../components/Ui'
import WorldBlock from '../components/WorldBlock'

/**
 * 伺服器清單。
 *
 * 每台伺服器用同一種版面呈現。先前把執行中的那台放大成主角、其餘縮成
 * 一行，結果同一份資訊在兩種尺寸下呈現，看起來像壞掉而不是有層次。
 * 狀態的差異交給世界方塊表達——亮的在跑、暗的沒跑，那已經夠清楚了。
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
  /** 各伺服器的線上人數。要連 SSH 才問得到，所以獨立於清單非同步取得。 */
  const [players, setPlayers] = useState<Record<string, number>>({})

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

  // 只問正在執行的那幾台。連線本身要好幾秒，查不到就不顯示人數，
  // 不要因為這個非必要的數字讓整張清單卡住或報錯。
  const runningKey = servers
    .filter((s) => s.state === 'RUNNING')
    .map((s) => `${s.name}:${s.zone}`)
    .join(',')

  useEffect(() => {
    if (!runningKey) return
    let cancelled = false
    for (const entry of runningKey.split(',')) {
      const [name, zone] = entry.split(':')
      void (async () => {
        try {
          const status = await call(window.api.minecraft.status(name, zone))
          if (!cancelled && status.playerCount !== null) {
            setPlayers((prev) => ({ ...prev, [name]: status.playerCount as number }))
          }
        } catch {
          // 伺服器剛開機時 RCON 尚未就緒，屬正常過渡狀態
        }
      })()
    }
    return () => {
      cancelled = true
    }
  }, [runningKey])

  const copyAddress = async (server: MinecraftServer): Promise<void> => {
    if (!server.externalIp) return
    // 只複製位址本身。Minecraft 的預設埠就是 25565，玩家不需要打出來。
    await navigator.clipboard.writeText(server.externalIp)
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

  return (
    <div className="screen">
      <ErrorText>{message}</ErrorText>

      {servers.length === 0 ? (
        <Blank
          action={
            <button type="button" className="torch big" onClick={onCreate}>
              {t('list.create')}
            </button>
          }
        >
          <WorldBlock size={88} lit={false} />
          <p>{t('list.empty')}</p>
          <p className="muted">{t('list.emptyHint')}</p>
        </Blank>
      ) : (
        <>
          {servers.map((server) => {
            const running = server.state === 'RUNNING'
            const count = players[server.name]
            return (
              <div className="world-row" key={server.name}>
                <WorldBlock size={110} lit={running} />
                <div className="world-info">
                  <h1>{server.displayName}</h1>
                  <div className="who">
                    {running
                      ? count === undefined
                        ? t('state.RUNNING')
                        : t('list.playing', { count })
                      : t(`state.${server.state}`)}
                  </div>
                  {server.externalIp && (
                    <button
                      type="button"
                      className="addr fact"
                      title={t('list.copyAddress')}
                      onClick={() => void copyAddress(server)}
                    >
                      {copied === server.name ? t('common.copied') : server.externalIp}
                    </button>
                  )}
                  <span className="spec fact">
                    {server.mcVersion} · {server.machineType} · {server.zone}
                  </span>
                  <div className="acts">
                    <button type="button" className="torch big" onClick={() => onOpen(server)}>
                      {t('list.manage')}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="actions">
            <button type="button" className="torch big" onClick={onCreate}>
              {t('list.create')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
