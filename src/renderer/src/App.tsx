import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supportedLanguages } from './i18n'
import type { AuthStatus, GcloudStatus } from '@shared/types'

/** 首次設定流程走到哪一步 */
type Phase = 'checking' | 'gcloud-missing' | 'need-login' | 'logging-in' | 'ready' | 'error'

/** 安裝 gcloud 的指令。用 winget 是因為 Windows 11 內建，使用者不用先裝別的東西。 */
const INSTALL_COMMAND = 'winget install --id Google.CloudSDK'
const DOWNLOAD_URL = 'https://cloud.google.com/sdk/docs/install'

export default function App(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [phase, setPhase] = useState<Phase>('checking')
  const [gcloud, setGcloud] = useState<GcloudStatus | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [copied, setCopied] = useState(false)

  /** 檢查 gcloud 有沒有裝、有沒有登入，決定要停在哪一步 */
  const checkEnvironment = useCallback(async () => {
    setPhase('checking')
    setErrorMessage('')

    const statusResult = await window.api.gcloud.status()
    if (!statusResult.ok) {
      setErrorMessage(statusResult.error)
      setPhase('error')
      return
    }

    setGcloud(statusResult.data)
    if (!statusResult.data.installed) {
      setPhase('gcloud-missing')
      return
    }

    const authResult = await window.api.gcloud.authStatus()
    if (!authResult.ok) {
      // 查不到登入狀態不算致命錯誤，當作還沒登入處理即可
      setPhase('need-login')
      return
    }

    setAuth(authResult.data)
    setPhase(authResult.data.loggedIn ? 'ready' : 'need-login')
  }, [])

  useEffect(() => {
    void checkEnvironment()
  }, [checkEnvironment])

  const handleLogin = async (): Promise<void> => {
    setPhase('logging-in')
    setErrorMessage('')

    const result = await window.api.gcloud.login()
    if (!result.ok) {
      setErrorMessage(result.error)
      setPhase('need-login')
      return
    }

    setAuth(result.data)
    setPhase(result.data.loggedIn ? 'ready' : 'need-login')
  }

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(INSTALL_COMMAND)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const currentStep = phase === 'gcloud-missing' || phase === 'checking' ? 0 : phase === 'ready' ? 2 : 1

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>{t('app.name')}</h1>
            <p className="tagline">{t('app.tagline')}</p>
          </div>
        </div>
        <select
          className="lang-select"
          value={i18n.language}
          onChange={(e) => void i18n.changeLanguage(e.target.value)}
          aria-label="Language"
        >
          {supportedLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </header>

      <ol className="steps">
        {[t('setup.steps.environment'), t('setup.steps.account'), t('setup.steps.server')].map(
          (label, index) => (
            <li
              key={label}
              className={index < currentStep ? 'done' : index === currentStep ? 'active' : ''}
            >
              <span className="step-index">{index + 1}</span>
              {label}
            </li>
          )
        )}
      </ol>

      <main className="card">
        {phase === 'checking' && (
          <div className="centered">
            <div className="spinner" />
            <p>{t('setup.checking')}</p>
          </div>
        )}

        {phase === 'gcloud-missing' && (
          <>
            <h2>{t('setup.gcloudMissing.title')}</h2>
            <p className="muted">{t('setup.gcloudMissing.desc')}</p>
            <p className="label">{t('setup.gcloudMissing.how')}</p>
            <div className="command-row">
              <code>{INSTALL_COMMAND}</code>
              <button type="button" onClick={() => void handleCopy()}>
                {copied ? t('common.copied') : '⧉'}
              </button>
            </div>
            <p className="muted small">{t('setup.gcloudMissing.afterInstall')}</p>
            <div className="actions">
              <button type="button" className="primary" onClick={() => void checkEnvironment()}>
                {t('setup.gcloudMissing.recheck')}
              </button>
              <a href={DOWNLOAD_URL} target="_blank" rel="noreferrer" className="link">
                {t('setup.gcloudMissing.download')}
              </a>
            </div>
          </>
        )}

        {(phase === 'need-login' || phase === 'logging-in') && (
          <>
            <h2>{t('setup.login.title')}</h2>
            <p className="muted">{t('setup.login.desc')}</p>
            {gcloud?.version && (
              <p className="badge">
                ✓ {t('setup.gcloudReady.title')} · {t('setup.gcloudReady.version', { version: gcloud.version })}
              </p>
            )}
            {phase === 'logging-in' ? (
              <div className="centered">
                <div className="spinner" />
                <p>{t('setup.login.waiting')}</p>
                <p className="muted small">{t('setup.login.waitingHint')}</p>
              </div>
            ) : (
              <div className="actions">
                <button type="button" className="primary" onClick={() => void handleLogin()}>
                  {t('setup.login.button')}
                </button>
              </div>
            )}
            {errorMessage && <p className="error">{errorMessage}</p>}
          </>
        )}

        {phase === 'ready' && (
          <>
            <h2>{t('setup.loggedIn.title')}</h2>
            <p className="account">{auth?.account}</p>
            <p className="muted">{t('setup.loggedIn.comingSoon')}</p>
            <div className="actions">
              <button type="button" className="primary" disabled>
                {t('setup.loggedIn.next')}
              </button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <h2>{t('common.error')}</h2>
            <p className="error">{errorMessage}</p>
            <div className="actions">
              <button type="button" className="primary" onClick={() => void checkEnvironment()}>
                {t('common.retry')}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
