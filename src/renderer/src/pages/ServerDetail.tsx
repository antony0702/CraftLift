import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer } from '@shared/types'
import { call, errorText } from '../lib/api'
import { ErrorText, Tabs } from '../components/Ui'
import { Back } from '../components/Icons'
import WorldBlock from '../components/WorldBlock'
import ConsoleTab from './tabs/ConsoleTab'
import FilesTab from './tabs/FilesTab'
import ModsTab from './tabs/ModsTab'
import PropertiesTab from './tabs/PropertiesTab'
import PlayersTab from './tabs/PlayersTab'
import BackupsTab from './tabs/BackupsTab'

/**
 * 伺服器控制台。
 *
 * 左欄回答「這個世界是什麼」——身分、位址、規格、電源；
 * 右欄回答「正在發生什麼」——日誌、設定、玩家、檔案、備份。
 * 這樣分工之後，最常看的位址與狀態一直都在，不會被分頁切換洗掉。
 */
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
  const [players, setPlayers] = useState<number | null>(null)

  const running = server.state === 'RUNNING'
  const modded = server.flavor !== 'vanilla'
  const moving =
    server.state === 'STAGING' || server.state === 'STOPPING' || server.state === 'PROVISIONING'

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

  useEffect(() => {
    if (!running) {
      setPlayers(null)
      return
    }
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const status = await call(window.api.minecraft.status(server.name, server.zone))
        if (!cancelled) setPlayers(status.playerCount)
      } catch {
        // 伺服器啟動過程中 RCON 還沒就緒，這是正常過渡狀態
      }
    }
    void load()
    const timer = setInterval(() => void load(), 15_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [running, server.name, server.zone])

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
    // Minecraft 的預設埠就是 25565，玩家不需要打出來
    await navigator.clipboard.writeText(server.externalIp)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div style={{ padding: '22px 33px 0' }}>
        <button type="button" className="bare" onClick={onBack}>
          <Back /> {t('common.back')}
        </button>
      </div>

      <div className="console">
        <div className="aside">
          <WorldBlock size={66} lit={running} />

          <h2>{server.displayName}</h2>
          <div className="who">
            {running
              ? players === null
                ? t('console.starting')
                : t('list.playing', { count: players })
              : t(`state.${server.state}`)}
          </div>

          {server.externalIp && (
            <button
              type="button"
              className="addr fact bare"
              title={t('list.copyAddress')}
              onClick={() => void copyAddress()}
            >
              {copied ? t('common.copied') : server.externalIp}
            </button>
          )}

          <dl>
            <dt>{t('detail.version')}</dt>
            <dd className="fact">{server.mcVersion}</dd>
            {modded && (
              <>
                <dt>{t('detail.loader')}</dt>
                <dd className="fact">
                  {t(`create.loaders.${server.flavor}.name`)}
                  {server.loaderVersion ? ` ${server.loaderVersion}` : ''}
                </dd>
              </>
            )}
            <dt>{t('detail.machine')}</dt>
            <dd className="fact">{server.machineType}</dd>
            <dt>{t('detail.zone')}</dt>
            <dd className="fact">{server.zone}</dd>
          </dl>

          <div className="power">
            <button
              type="button"
              className={running ? '' : 'torch'}
              disabled={busy || moving}
              onClick={() => void power(running ? 'stop' : 'start')}
            >
              {moving ? t(`state.${server.state}`) : running ? t('detail.shutdown') : t('detail.boot')}
            </button>
            <button type="button" className="link-btn danger" disabled={busy} onClick={() => void remove()}>
              {t('detail.delete')}
            </button>
          </div>

          {running && <p className="footnote">{t('detail.shutdownNote')}</p>}
          <ErrorText>{message}</ErrorText>
        </div>

        <div className="work">
          <Tabs
            active={tab}
            onChange={setTab}
            /* 模組分頁只給模組伺服器。原版沒有 mods 資料夾，
               留一個永遠空著的分頁只會讓人以為東西丟進去會生效。 */
            tabs={[
              { id: 'console', label: t('detail.tabs.console') },
              { id: 'properties', label: t('detail.tabs.properties') },
              { id: 'players', label: t('detail.tabs.players') },
              ...(modded ? [{ id: 'mods', label: t('detail.tabs.mods') }] : []),
              { id: 'files', label: t('detail.tabs.files') },
              { id: 'backups', label: t('detail.tabs.backups') }
            ]}
          />

          {!running ? (
            <div className="centered">
              <p className="muted">{t('detail.needRunning')}</p>
              <p className="muted small">{t('detail.needRunningHint')}</p>
            </div>
          ) : (
            <>
              {tab === 'console' && <ConsoleTab server={server} />}
              {tab === 'properties' && <PropertiesTab server={server} />}
              {tab === 'players' && <PlayersTab server={server} />}
              {tab === 'mods' && modded && <ModsTab server={server} />}
              {tab === 'files' && <FilesTab server={server} />}
              {tab === 'backups' && <BackupsTab server={server} />}
            </>
          )}
        </div>
      </div>
    </>
  )
}
