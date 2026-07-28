import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Preferences, ThemeChoice } from '@shared/types'
import { BILLING_CONSOLE_URL } from '@shared/constants'
import { call, errorText } from '../lib/api'
import { ErrorText, Field, Info, Loading } from '../components/Ui'
import { Back } from '../components/Icons'
import { supportedLanguages } from '../i18n'

const THEMES: ThemeChoice[] = ['system', 'light', 'dark']

export default function Settings({
  projectId,
  onBack,
  onProjectDeleted
}: {
  projectId: string | null
  onBack: () => void
  onProjectDeleted: () => void
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        setPrefs(await call(window.api.app.getPreferences()))
      } catch (err) {
        setMessage(errorText(err))
      }
    })()
  }, [])

  const update = async (patch: Partial<Preferences>): Promise<void> => {
    try {
      const next = await call(window.api.app.setPreferences(patch))
      setPrefs(next)
      if (patch.language) await i18n.changeLanguage(patch.language)
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  const chooseBackupDir = async (): Promise<void> => {
    const dir = await call(window.api.app.chooseDirectory())
    if (dir) await update({ localBackupDir: dir })
  }

  /**
   * 徹底清除。
   *
   * 刪掉整個 GCP 專案是唯一能保證「什麼都沒漏掉、之後不會突然冒出帳單」
   * 的做法——逐項刪很容易漏掉靜態 IP 那種獨立計費的資源。
   */
  const deleteEverything = async (): Promise<void> => {
    if (!window.confirm(t('settings.danger.confirm1'))) return
    if (!window.confirm(t('settings.danger.confirm2', { projectId }))) return
    setBusy(true)
    setMessage('')
    try {
      await call(window.api.project.delete())
      onProjectDeleted()
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (!prefs) return <Loading />

  return (
    <div className="screen narrow">
      <button type="button" className="bare" onClick={onBack}>
        <Back /> {t('common.back')}
      </button>

      <div className="eyebrow" style={{ marginTop: 22 }}>
        {t('settings.general')}
      </div>

      <Field label={t('settings.theme')}>
        <div className="segmented">
          {THEMES.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={prefs.theme === choice}
              onClick={() => void update({ theme: choice })}
            >
              {t(`settings.themes.${choice}`)}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('settings.language')}>
        <select value={prefs.language} onChange={(e) => void update({ language: e.target.value })}>
          {supportedLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </Field>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={prefs.launchAtLogin}
          onChange={(e) => void update({ launchAtLogin: e.target.checked })}
        />
        <span>
          {t('settings.launchAtLogin')}
          <Info text={t('settings.launchAtLoginHint')} />
        </span>
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={prefs.backupToLocalOnShutdown}
          onChange={(e) => void update({ backupToLocalOnShutdown: e.target.checked })}
        />
        <span>{t('settings.backupOnShutdown')}</span>
      </label>

      <Field label={t('settings.backupDir')}>
        <div className="inline-form">
          <input type="text" readOnly value={prefs.localBackupDir ?? t('settings.defaultDir')} />
          <button type="button" onClick={() => void chooseBackupDir()}>
            {t('settings.choose')}
          </button>
        </div>
      </Field>

      <div className="eyebrow" style={{ marginTop: 44 }}>
        {t('settings.billing.title')}
      </div>
      <p className="muted small">{t('settings.billing.note')}</p>
      <div className="actions">
        <button type="button" onClick={() => void window.api.app.openExternal(BILLING_CONSOLE_URL)}>
          {t('settings.billing.open')}
        </button>
      </div>
      {projectId && (
        <p className="muted small">
          {t('settings.project')}: <span className="fact">{projectId}</span>
        </p>
      )}

      <div className="eyebrow" style={{ marginTop: 44 }}>
        {t('settings.danger.title')}
      </div>
      <p className="muted small">{t('settings.danger.desc')}</p>
      <ErrorText>{message}</ErrorText>
      <div className="actions">
        <button
          type="button"
          className="danger"
          disabled={busy || !projectId}
          onClick={() => void deleteEverything()}
        >
          {busy ? t('settings.danger.working') : t('settings.danger.button')}
        </button>
      </div>
    </div>
  )
}
