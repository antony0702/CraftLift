import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer } from '@shared/types'
import { call, errorText } from '../../lib/api'
import { ErrorText } from '../../components/Ui'

/**
 * 主控台。
 *
 * 伺服器的執行狀態與電源已經由左欄負責，這裡只做一件事：
 * 看見正在發生什麼，並且送得出指令。
 */
export default function ConsoleTab({ server }: { server: MinecraftServer }): React.JSX.Element {
  const { t } = useTranslation()
  const [log, setLog] = useState('')
  const [people, setPeople] = useState<string[] | null>(null)
  const [command, setCommand] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  /** Minecraft 本身在不在跑。機器的電源是左欄管的，這裡管的是服務。 */
  const [running, setRunning] = useState<boolean | null>(null)
  const [power, setPower] = useState<'start' | 'stop' | 'restart' | null>(null)
  const logRef = useRef<HTMLPreElement>(null)
  /** 使用者往上捲看歷史時就不要硬把畫面拉回底部 */
  const stick = useRef(true)

  useEffect(() => {
    let cancelled = false

    const unsubscribe = window.api.log.onData((payload) => {
      if (payload.name !== server.name) return
      setLog((prev) => {
        // 只留最後 100000 字，長時間開著才不會把記憶體吃光
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
  }, [server.name, server.zone])

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const status = await call(window.api.minecraft.status(server.name, server.zone))
        setPeople(status.players)
        setRunning(status.running)
      } catch {
        // 啟動過程中 RCON 尚未就緒，屬正常過渡狀態
      }
    }
    void load()
    const timer = setInterval(() => void load(), 15_000)
    return () => clearInterval(timer)
  }, [server.name, server.zone])

  useEffect(() => {
    if (stick.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  const send = async (): Promise<void> => {
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

  /** 停止與重新啟動會把線上的人踢掉，所以先問一次；啟動不會，直接做。 */
  const control = async (action: 'start' | 'stop' | 'restart'): Promise<void> => {
    if (action !== 'start' && people && people.length > 0) {
      if (!window.confirm(t('console.confirmKick', { n: people.length }))) return
    }
    setPower(action)
    setMessage('')
    try {
      await call(window.api.minecraft[action](server.name, server.zone))
      setRunning(action !== 'stop')
      if (action === 'stop') setPeople([])
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setPower(null)
    }
  }

  return (
    <>
      <div className="roster">
        <span className="k">{t('console.who')}</span>
        {people === null ? (
          <span className="muted small">{t('console.starting')}</span>
        ) : people.length === 0 ? (
          <span className="muted small">{t('console.nobody')}</span>
        ) : (
          people.map((p) => (
            <span key={p} className="p fact">
              {p}
            </span>
          ))
        )}
      </div>

      <pre
        className="log"
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {log || t('console.noLog')}
      </pre>

      <form
        className="prompt"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <span className="slash">/</span>
        <input
          type="text"
          value={command}
          placeholder={t('console.commandPlaceholder')}
          onChange={(e) => setCommand(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="torch" disabled={busy || !command.trim()}>
          {t('console.send')}
        </button>
      </form>

      {/* Minecraft 本身的電源。左欄那個是整台機器的，兩者不一樣：
          停掉 Minecraft 機器還在跑，也還在計費。 */}
      <div className="actions">
        {running === false ? (
          <button type="button" disabled={power !== null} onClick={() => void control('start')}>
            {power === 'start' ? t('console.starting') : t('console.startMc')}
          </button>
        ) : (
          <>
            <button type="button" disabled={power !== null} onClick={() => void control('restart')}>
              {power === 'restart' ? t('console.restarting') : t('console.restart')}
            </button>
            <button
              type="button"
              className="danger"
              disabled={power !== null}
              onClick={() => void control('stop')}
            >
              {power === 'stop' ? t('console.stopping') : t('console.stopMc')}
            </button>
          </>
        )}
        <span className="muted small">{t('console.powerNote')}</span>
      </div>

      <ErrorText>{message}</ErrorText>
    </>
  )
}
