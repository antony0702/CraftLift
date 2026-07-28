import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MinecraftServer, ServerProperties } from '@shared/types'
import { call, errorText } from '../../lib/api'
import { ErrorText, Field, Loading } from '../../components/Ui'

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

  const save = async (): Promise<void> => {
    setSaving(true)
    setMessage('')
    try {
      const subset: ServerProperties = {}
      for (const field of FIELDS) {
        if (props[field.key] !== undefined) subset[field.key] = props[field.key]
      }
      await call(window.api.props.set(server.name, server.zone, subset))
      setSaved(true)
    } catch (err) {
      setMessage(errorText(err))
    } finally {
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
        <button type="button" className="primary" disabled={saving} onClick={() => void save()}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
        {saved && <span className="muted small">{t('props.saved')}</span>}
      </div>
    </div>
  )
}
