import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer, ServerProperties } from '@shared/types'
import { call, errorText } from '../../lib/api'
import { ErrorText, Field, Loading, Modal, Waiting } from '../../components/Ui'

/**
 * 圖形化的 server.properties 編輯器。
 *
 * 只列出一般玩家真的會想改的設定，每一項都附中文說明。
 * 其他冷門設定仍然可以在「檔案」分頁裡直接編輯原始檔案。
 */
type Editor =
  | { key: string; kind: 'text' }
  | { key: string; kind: 'number'; min: number; max: number }
  | { key: string; kind: 'bool' }
  | { key: string; kind: 'select'; options: string[] }

const FIELDS: Editor[] = [
  { key: 'motd', kind: 'text' },
  { key: 'max-players', kind: 'number', min: 1, max: 200 },
  { key: 'difficulty', kind: 'select', options: ['peaceful', 'easy', 'normal', 'hard'] },
  { key: 'gamemode', kind: 'select', options: ['survival', 'creative', 'adventure', 'spectator'] },
  { key: 'pvp', kind: 'bool' },
  { key: 'hardcore', kind: 'bool' },
  { key: 'white-list', kind: 'bool' },
  { key: 'online-mode', kind: 'bool' },
  { key: 'allow-nether', kind: 'bool' },
  { key: 'allow-flight', kind: 'bool' },
  { key: 'spawn-monsters', kind: 'bool' },
  { key: 'view-distance', kind: 'number', min: 3, max: 32 },
  { key: 'simulation-distance', kind: 'number', min: 3, max: 32 },
  { key: 'spawn-protection', kind: 'number', min: 0, max: 100 },
  { key: 'level-seed', kind: 'text' }
]

export default function PropertiesTab({ server }: { server: MinecraftServer }): React.JSX.Element {
  const { t } = useTranslation()
  const [props, setProps] = useState<ServerProperties>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)
  /** 按下儲存後先問過再動手。null 代表還沒問。 */
  const [confirm, setConfirm] = useState<{ running: boolean; players: number | null } | null>(null)
  const [checking, setChecking] = useState(false)
  /** 儲存完正在重啟。這一段有十幾秒，不講的話畫面像當掉。 */
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        setProps(await call(window.api.props.get(server.name, server.zone)))
      } catch (err) {
        setMessage(errorText(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [server.name, server.zone])

  const update = (key: string, value: string): void => {
    setProps((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  /**
   * 按下儲存時先問一次。
   *
   * server.properties 只有在 Minecraft 啟動時才會被讀取，所以改完一定要重啟
   * 才會生效。重啟會把線上的玩家踢出去，那是使用者該先知道再決定的事——
   * 所以先查一下現在的狀態，把「會踢掉幾個人」講清楚再問。
   */
  const askBeforeSave = async (): Promise<void> => {
    setChecking(true)
    setMessage('')
    try {
      const status = await call(window.api.minecraft.status(server.name, server.zone))
      setConfirm({ running: status.running, players: status.playerCount })
    } catch {
      // 狀態查不到也還是要能存。當成沒在跑，只儲存不重啟，並在對話框裡說明。
      setConfirm({ running: false, players: null })
    } finally {
      setChecking(false)
    }
  }

  /**
   * 儲存，接著在 Minecraft 有在跑的時候重新啟動它。
   *
   * 沒在跑就只儲存——重啟一個停著的服務等於把它開起來，那不是使用者按下
   * 「儲存」時想要的事。
   */
  const save = async (restart: boolean): Promise<void> => {
    setConfirm(null)
    setSaving(true)
    setMessage('')
    try {
      const subset: ServerProperties = {}
      for (const field of FIELDS) {
        if (props[field.key] !== undefined) subset[field.key] = props[field.key]
      }
      await call(window.api.props.set(server.name, server.zone, subset))

      if (restart) {
        setRestarting(true)
        await call(window.api.minecraft.restart(server.name, server.zone))
      }
      setSaved(true)
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setRestarting(false)
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="properties">
      <p className="muted small">{t('props.restartNote')}</p>

      {FIELDS.map((field) => {
        const value = props[field.key] ?? ''
        const label = t(`props.fields.${field.key}.label`)
        const hint = t(`props.fields.${field.key}.hint`)

        if (field.kind === 'bool') {
          return (
            <label className="checkbox" key={field.key}>
              <input
                type="checkbox"
                checked={value === 'true'}
                onChange={(e) => update(field.key, String(e.target.checked))}
              />
              <span>
                {label} <span className="muted small">— {hint}</span>
              </span>
            </label>
          )
        }

        return (
          <Field key={field.key} label={label} hint={hint}>
            {field.kind === 'select' ? (
              <select value={value} onChange={(e) => update(field.key, e.target.value)}>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {t(`props.values.${opt}`, opt)}
                  </option>
                ))}
              </select>
            ) : field.kind === 'number' ? (
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={value}
                onChange={(e) => update(field.key, e.target.value)}
              />
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e) => update(field.key, e.target.value)}
              />
            )}
          </Field>
        )
      })}

      <ErrorText>{message}</ErrorText>

      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={saving || checking}
          onClick={() => void askBeforeSave()}
        >
          {restarting
            ? t('props.restarting')
            : saving
              ? t('common.saving')
              : checking
                ? t('props.checking')
                : t('common.save')}
        </button>
        {(saving || checking) && <Waiting />}
        {saved && <span className="muted small">{t('props.saved')}</span>}
      </div>

      {confirm && (
        <Modal
          /* 沒在跑就不會重啟，標題也不該那樣寫 */
          title={confirm.running ? t('props.confirmTitle') : t('props.confirmTitleStopped')}
          onClose={() => setConfirm(null)}
        >
          {confirm.running ? (
            <>
              <p>{t('props.confirmRunning')}</p>
              {confirm.players !== null && confirm.players > 0 && (
                <p className="error">{t('props.confirmPlayers', { n: confirm.players })}</p>
              )}
            </>
          ) : (
            <p>{t('props.confirmStopped')}</p>
          )}
          <div className="actions">
            <button type="button" className="primary" onClick={() => void save(confirm.running)}>
              {confirm.running ? t('props.saveAndRestart') : t('common.save')}
            </button>
            <button type="button" className="link-btn" onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
