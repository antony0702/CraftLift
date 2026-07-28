import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer } from '@shared/types'
import { call, errorText } from '../../lib/api'
import { ErrorText } from '../../components/Ui'

interface Status {
  running: boolean
  players: string[] | null
  playerCount: number | null
  maxPlayers: number | null
}

export default function ConsoleTab({ server }: { server: MinecraftServer }): React.JSX.Element {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status | null>(null)
  const [log, setLog] = useState('')
  const [command, setCommand] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)
  /** 使用者往上捲看歷史時就不要硬把畫面拉回底部 */
  const stickToBottom = useRef(true)

  const offline = server.state !== 'RUNNING'

  // 訂閱即時日誌
  useEffect(() => {
    if (offline) return
    let cancelled = false

    const unsubscribe = window.api.log.onData((payload) => {
      if (payload.name !== server.name) return
      setLog((prev) => {
        // 只留最後 100000 字，避免長時間開著把記憶體吃光
        const next = prev + payload.chunk
        return next.length > 100_000 ? next.slice(-100_000) : next
      })
    })

    void (async () => {
      try {
        const initial = await call(window.api.log.tail(server.name, server.zone))
        if (!cancelled) setLog(initial)
        await call(window.api.log.follow(server.name, server.zone))
      } catch (err) {
        if (!cancelled) setMessage(errorText(err))
      }
    })()

    return () => {
      cancelled = true
      unsubscribe()
      void window.api.log.unfollow(server.name)
    }
  }, [server.name, server.zone, offline])

  // 定期更新線上人數
  useEffect(() => {
    if (offline) return
    const load = async (): Promise<void> => {
      try {
        setStatus(await call(window.api.minecraft.status(server.name, server.zone)))
      } catch {
        // 伺服器啟動過程中 RCON 還沒就緒是正常的，不用打擾使用者
      }
    }
    void load()
    const timer = setInterval(() => void load(), 10_000)
    return () => clearInterval(timer)
  }, [server.name, server.zone, offline])

  useEffect(() => {
    if (stickToBottom.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  const runCommand = async (): Promise<void> => {
    const trimmed = command.trim()
    if (!trimmed) return
    setBusy(true)
    setMessage('')
    try {
      const reply = await call(window.api.minecraft.command(server.name, server.zone, trimmed))
      setLog((prev) => `${prev}\n> ${trimmed}\n${reply}\n`)
      setCommand('')
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const service = async (action: 'start' | 'stop' | 'restart'): Promise<void> => {
    setBusy(true)
    setMessage('')
    try {
      await call(window.api.minecraft[action](server.name, server.zone))
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (offline) {
    return (
      <div className="empty">
        <p>{t('console.machineOff')}</p>
        <p className="muted small">{t('console.machineOffHint')}</p>
      </div>
    )
  }

  return (
    <div className="console">
      <div className="console-bar">
        <span className={status?.running ? 'badge' : 'badge warn'}>
          {status?.running ? t('console.running') : t('console.starting')}
        </span>
        {status?.playerCount !== null && status?.playerCount !== undefined && (
          <span className="muted small">
            {t('console.players', { count: status.playerCount, max: status.maxPlayers ?? '?' })}
            {status.players && status.players.length > 0 && `: ${status.players.join(', ')}`}
          </span>
        )}
        <div className="spacer" />
        <button type="button" disabled={busy} onClick={() => void service('restart')}>
          {t('console.restart')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void service(status?.running ? 'stop' : 'start')}
        >
          {status?.running ? t('console.stopMc') : t('console.startMc')}
        </button>
      </div>

      <pre
        className="log"
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {log || t('console.noLog')}
      </pre>

      <form
        className="command-bar"
        onSubmit={(e) => {
          e.preventDefault()
          void runCommand()
        }}
      >
        <span className="prompt">/</span>
        <input
          type="text"
          value={command}
          placeholder={t('console.commandPlaceholder')}
          onChange={(e) => setCommand(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="primary" disabled={busy || !command.trim()}>
          {t('console.send')}
        </button>
      </form>

      <ErrorText>{message}</ErrorText>
    </div>
  )
}
