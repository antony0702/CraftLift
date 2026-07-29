import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Preferences, ThemeChoice } from '@shared/types'
import { BILLING_CONSOLE_URL } from '@shared/constants'
import { call, errorText } from '../lib/api'
import { formatSize, useUpdate } from '../lib/update'
import { ErrorText, Field, Info, Loading, Modal, Waiting } from '../components/Ui'
import { Back } from '../components/Icons'
import { supportedLanguages } from '../i18n'

const THEMES: ThemeChoice[] = ['system', 'light', 'dark']

/**
 * 介面縮放的選項。
 *
 * 'auto' 讓整個介面跟著視窗大小等比縮放；其餘是固定倍率，級距刻意做細，
 * 因為舒服的點落在 100% 到 125% 之間，級距太粗會找不到。
 */
const SCALES: Array<number | 'auto'> = [
  'auto',
  1,
  1.05,
  1.1,
  1.15,
  1.2,
  1.25,
  1.35,
  1.5,
  1.75,
  2
]

export default function Settings({
  projectId,
  onBack,
  onReturnToSetup
}: {
  projectId: string | null
  onBack: () => void
  /** 登出或徹底清除之後都要回到首次設定畫面，兩者走同一條路 */
  onReturnToSetup: () => void
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [feedback, setFeedback] = useState({ subject: '', name: '', body: '' })
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [version, setVersion] = useState('')
  const updater = useUpdate()

  /**
   * 送出回饋。
   *
   * 由主行程直接送到 Google 表單，使用者不必離開程式。若送出被拒或
   * 網路不通，就改開瀏覽器讓他自己送——回饋送不出去卻沒人知道，
   * 是最糟的結果，所以寧可多一道退路也不要靜靜失敗。
   */
  const sendFeedback = async (): Promise<void> => {
    setSending(true)
    setFeedbackError('')
    try {
      await call(window.api.app.sendFeedback(feedback))
      setSent(true)
      setFeedback({ subject: '', name: '', body: '' })
      setTimeout(() => {
        setSent(false)
        setFeedbackOpen(false)
      }, 1800)
    } catch {
      setFeedbackError(t('settings.feedback.failed'))
    } finally {
      setSending(false)
    }
  }

  /** 退路：開瀏覽器，內容已預先填好 */
  const openFeedbackForm = async (): Promise<void> => {
    await call(window.api.app.openFeedbackForm(feedback))
    setFeedbackOpen(false)
  }

  useEffect(() => {
    void (async () => {
      try {
        setPrefs(await call(window.api.app.getPreferences()))
      } catch (err) {
        setMessage(errorText(err))
      }
    })()
    void window.api.app.version().then((r) => {
      if (r.ok) setVersion(r.data)
    })
    // 這是快取過的，不會再花一次 gcloud 的三秒
    void window.api.gcloud.authStatus().then((r) => {
      if (r.ok) setAccount(r.data.account)
    })
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
      onReturnToSetup()
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * 登出 Google 帳號。
   *
   * 這不會動到雲端上的任何東西——伺服器、世界存檔、備份都留在 Google Cloud
   * 上，重新登入同一個帳號就全部回來。先問一次是因為要復原得再跑一趟瀏覽器
   * 授權，不是點錯就能馬上退回來的那種操作。
   */
  const signOut = async (): Promise<void> => {
    if (!window.confirm(t('settings.account.confirm'))) return
    setSigningOut(true)
    setMessage('')
    try {
      await call(window.api.gcloud.logout())
      // 成功就直接跳回首次設定畫面，這個元件會被卸載，不用收尾
      onReturnToSetup()
    } catch (err) {
      setMessage(errorText(err))
      setSigningOut(false)
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

      <Field label={t('settings.scale')} hint={t('settings.scaleHint')}>
        <select
          value={String(prefs.uiScale)}
          onChange={(e) =>
            void update({ uiScale: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })
          }
        >
          {SCALES.map((scale) => (
            <option key={String(scale)} value={String(scale)}>
              {scale === 'auto' ? t('settings.scaleAuto') : `${Math.round(scale * 100)}%`}
            </option>
          ))}
        </select>
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
        {t('update.title')}
      </div>
      <p className="muted small">
        {t('update.current')} <span className="fact">v{version}</span>
      </p>
      <p className="muted small">{t('update.safeNote')}</p>

      {/* 狀態一行講完。這裡不重複標題列的提示條，只補上那條看不到的資訊
          ——「查過了，你已經是最新的」以及失敗原因。 */}
      {updater.state.phase === 'checking' && <p className="small">{t('update.checking')}</p>}
      {updater.state.phase === 'latest' && <p className="small">{t('update.latest')}</p>}
      {updater.state.phase === 'unsupported' && (
        <p className="muted small">{t('update.unsupported')}</p>
      )}
      {updater.state.phase === 'downloading' && (
        <p className="small">
          {t('update.downloading')} <span className="fact">{updater.state.percent}%</span>
        </p>
      )}
      {updater.state.phase === 'error' && <ErrorText>{updater.state.message}</ErrorText>}

      {updater.state.phase === 'available' && (
        <>
          <p className="small">
            {t('update.available', { version: updater.state.version })}
            {formatSize(updater.state.sizeBytes) && (
              <span className="fact size">{formatSize(updater.state.sizeBytes)}</span>
            )}
          </p>
          {/* 版本說明是人寫給人看的，所以用點陣字，只把換行留住 */}
          {updater.state.notes && <div className="release-notes">{updater.state.notes}</div>}
        </>
      )}

      <div className="actions">
        <button
          type="button"
          disabled={
            updater.state.phase === 'checking' ||
            updater.state.phase === 'downloading' ||
            updater.state.phase === 'unsupported'
          }
          onClick={updater.check}
        >
          {t('update.check')}
        </button>
        {updater.state.phase === 'available' && (
          <button type="button" className="torch" onClick={updater.download}>
            {t('update.download')}
          </button>
        )}
        {updater.state.phase === 'ready' && (
          <button type="button" className="torch" onClick={updater.install}>
            {t('update.install')}
          </button>
        )}
        {(updater.state.phase === 'checking' || updater.state.phase === 'downloading') && <Waiting />}
      </div>

      <div className="eyebrow" style={{ marginTop: 44 }}>
        {t('settings.feedback.title')}
      </div>
      <p className="muted">{t('settings.feedback.desc')}</p>
      <div className="actions">
        <button type="button" onClick={() => setFeedbackOpen(true)}>
          {t('settings.feedback.open')}
        </button>
      </div>

      {feedbackOpen && (
        <Modal title={<h3>{t('settings.feedback.title')}</h3>} onClose={() => setFeedbackOpen(false)}>
          <Field label={t('settings.feedback.subject')}>
            <input
              type="text"
              value={feedback.subject}
              maxLength={80}
              placeholder={t('settings.feedback.subjectPlaceholder')}
              onChange={(e) => setFeedback({ ...feedback, subject: e.target.value })}
            />
          </Field>

          <Field label={t('settings.feedback.name')} hint={t('settings.feedback.nameHint')}>
            <input
              type="text"
              value={feedback.name}
              maxLength={40}
              onChange={(e) => setFeedback({ ...feedback, name: e.target.value })}
            />
          </Field>

          <Field label={t('settings.feedback.body')}>
            <textarea
              rows={7}
              value={feedback.body}
              placeholder={t('settings.feedback.bodyPlaceholder')}
              onChange={(e) => setFeedback({ ...feedback, body: e.target.value })}
            />
          </Field>

          <p className="footnote">{t('settings.feedback.privateNote')}</p>

          {feedbackError && (
            <>
              <ErrorText>{feedbackError}</ErrorText>
              <button type="button" className="bare" onClick={() => void openFeedbackForm()}>
                {t('settings.feedback.openInBrowser')}
              </button>
            </>
          )}

          <div className="actions">
            <button
              type="button"
              className="torch"
              disabled={sending || sent || !feedback.subject.trim() || !feedback.body.trim()}
              onClick={() => void sendFeedback()}
            >
              {sent
                ? t('settings.feedback.sent')
                : sending
                  ? t('settings.feedback.sending')
                  : t('settings.feedback.send')}
            </button>
            {sending && <Waiting />}
            <button type="button" className="bare" onClick={() => setFeedbackOpen(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
      )}

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
        {t('settings.account.title')}
      </div>
      <p className="muted small">
        {t('settings.account.current')}:{' '}
        <span className="fact">{account ?? t('settings.account.none')}</span>
      </p>
      <p className="muted small">{t('settings.account.note')}</p>
      <div className="actions">
        <button type="button" disabled={signingOut} onClick={() => void signOut()}>
          {signingOut ? t('settings.account.working') : t('settings.account.signOut')}
        </button>
        {signingOut && <Waiting />}
      </div>

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
