import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer, PlayerLists } from '@shared/types'
import { call, errorText } from '../../lib/api'
import { ErrorText, Loading } from '../../components/Ui'

type ListKey = 'whitelist' | 'ops' | 'banned'

/** 每個名單對應的新增／移除 RCON 動作 */
const ACTIONS: Record<ListKey, { add: 'whitelist-add' | 'op' | 'ban'; remove: 'whitelist-remove' | 'deop' | 'pardon' }> =
  {
    whitelist: { add: 'whitelist-add', remove: 'whitelist-remove' },
    ops: { add: 'op', remove: 'deop' },
    banned: { add: 'ban', remove: 'pardon' }
  }

export default function PlayersTab({ server }: { server: MinecraftServer }): React.JSX.Element {
  const { t } = useTranslation()
  const [lists, setLists] = useState<PlayerLists | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [drafts, setDrafts] = useState<Record<ListKey, string>>({
    whitelist: '',
    ops: '',
    banned: ''
  })

  /** 白名單是否已啟用。啟用但名單是空的時，沒有任何人進得來。 */
  const [whitelistEnabled, setWhitelistEnabled] = useState(false)

  const load = useCallback(async () => {
    try {
      const [players, props] = await Promise.all([
        call(window.api.players.get(server.name, server.zone)),
        call(window.api.props.get(server.name, server.zone))
      ])
      setLists(players)
      setWhitelistEnabled(props['white-list'] === 'true')
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

  const modify = async (
    key: ListKey,
    action: 'add' | 'remove',
    player: string
  ): Promise<void> => {
    const name = player.trim()
    if (!name) return
    setMessage('')
    try {
      await call(
        window.api.players.modify(server.name, server.zone, ACTIONS[key][action], name)
      )
      setDrafts((prev) => ({ ...prev, [key]: '' }))
      // 伺服器寫回 JSON 檔需要一點時間，稍等再讀
      setTimeout(() => void load(), 800)
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  if (loading) return <Loading />
  if (!lists) return <ErrorText>{message}</ErrorText>

  const sections: Array<{ key: ListKey; items: string[] }> = [
    { key: 'whitelist', items: lists.whitelist },
    { key: 'ops', items: lists.ops },
    { key: 'banned', items: lists.banned }
  ]

  return (
    <div className="players">
      {/* 白名單開著又是空的，等於整台伺服器沒人進得來。
          這是新伺服器的預設狀態，不講清楚的話使用者會以為程式壞了。 */}
      {whitelistEnabled && lists.whitelist.length === 0 && (
        <div className="notice">
          <strong>{t('players.lockedTitle')}</strong>
          <p className="muted small">{t('players.lockedBody')}</p>
        </div>
      )}
      <p className="muted small">{t('players.note')}</p>
      <ErrorText>{message}</ErrorText>

      {sections.map(({ key, items }) => (
        <div className="player-section" key={key}>
          <h3>{t(`players.${key}.title`)}</h3>
          <p className="muted small">{t(`players.${key}.desc`)}</p>

          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              void modify(key, 'add', drafts[key])
            }}
          >
            <input
              type="text"
              value={drafts[key]}
              placeholder={t('players.namePlaceholder')}
              maxLength={16}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
            />
            <button type="submit">{t(`players.${key}.add`)}</button>
          </form>

          {items.length === 0 ? (
            <p className="muted small">{t('players.emptyList')}</p>
          ) : (
            <ul className="chips">
              {items.map((name) => (
                <li key={name} className="chip">
                  {name}
                  <button
                    type="button"
                    aria-label="remove"
                    onClick={() => void modify(key, 'remove', name)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
