import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BillingAccount } from '@shared/types'
import { call, errorText } from '../lib/api'
import { ErrorText, Loading } from '../components/Ui'
import { Copy } from '../components/Icons'
import WorldBlock from '../components/WorldBlock'

const INSTALL_COMMAND = 'winget install --id Google.CloudSDK'
const GCLOUD_DOWNLOAD = 'https://cloud.google.com/sdk/docs/install'
const FREE_TRIAL_URL = 'https://cloud.google.com/free'

type Phase =
  | 'checking'
  | 'gcloud-missing'
  | 'need-login'
  | 'logging-in'
  | 'no-billing'
  | 'pick-billing'
  | 'preparing'
  | 'error'

/**
 * 首次設定。
 *
 * 有一段無法自動化：建立 Google 帳號、綁定信用卡。Google 規定那必須由
 * 使用者本人在瀏覽器完成。這個畫面的責任是把那一段講清楚並引導過去，
 * 其餘全部自動處理。
 */
export default function Setup({
  onReady
}: {
  onReady: (projectId: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('checking')
  const [version, setVersion] = useState<string | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [billing, setBilling] = useState<BillingAccount[]>([])
  const [selected, setSelected] = useState('')
  const [detected, setDetected] = useState(0)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const check = useCallback(async () => {
    setPhase('checking')
    setMessage('')
    try {
      const gcloud = await call(window.api.gcloud.status())
      setVersion(gcloud.version)
      if (!gcloud.installed) return setPhase('gcloud-missing')

      const auth = await call(window.api.gcloud.authStatus())
      setAccount(auth.account)
      if (!auth.loggedIn) return setPhase('need-login')

      const existing = await call(window.api.project.current())
      if (existing) return onReady(existing)

      const accounts = await call(window.api.project.billingAccounts())
      const usable = accounts.filter((a) => a.open)
      setDetected(accounts.length)
      setBilling(usable)
      if (usable.length === 0) return setPhase('no-billing')

      setSelected(usable[0].id)
      setPhase('pick-billing')
    } catch (err) {
      setMessage(errorText(err))
      setPhase('error')
    }
  }, [onReady])

  useEffect(() => {
    void check()
  }, [check])

  /**
   * 使用者切到瀏覽器裝 gcloud 或申請帳單帳戶，弄完切回來時自動重新檢查。
   * 沒有這段的話，畫面會一直停在原地，使用者明明已經辦好了卻以為程式壞掉。
   */
  useEffect(() => {
    if (phase !== 'gcloud-missing' && phase !== 'no-billing') return
    const onFocus = (): void => void check()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [phase, check])

  const login = async (): Promise<void> => {
    setPhase('logging-in')
    setMessage('')
    try {
      await call(window.api.gcloud.login())
      await check()
    } catch (err) {
      setMessage(errorText(err))
      setPhase('need-login')
    }
  }

  const prepare = async (): Promise<void> => {
    setPhase('preparing')
    setMessage('')
    try {
      onReady(await call(window.api.project.ensure(selected)))
    } catch (err) {
      setMessage(errorText(err))
      setPhase('pick-billing')
    }
  }

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(INSTALL_COMMAND)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const open = (url: string): void => void window.api.app.openExternal(url)

  return (
    <div className="screen narrow">
      {phase === 'checking' && <Loading text={t('setup.checking')} />}

      {phase === 'gcloud-missing' && (
        <>
          <div className="eyebrow">{t('setup.steps.environment')}</div>
          <h2>{t('setup.gcloudMissing.title')}</h2>
          <p className="muted small">{t('setup.gcloudMissing.desc')}</p>
          <p className="field-label">{t('setup.gcloudMissing.how')}</p>
          <div className="command">
            <code>{INSTALL_COMMAND}</code>
            <button type="button" onClick={() => void copy()} aria-label={t('common.copy')}>
              {copied ? t('common.copied') : <Copy />}
            </button>
          </div>
          <p className="muted small">{t('setup.gcloudMissing.afterInstall')}</p>
          <div className="actions">
            <button type="button" className="torch" onClick={() => void check()}>
              {t('setup.gcloudMissing.recheck')}
            </button>
            <button type="button" className="bare" onClick={() => open(GCLOUD_DOWNLOAD)}>
              {t('setup.gcloudMissing.download')}
            </button>
          </div>
        </>
      )}

      {(phase === 'need-login' || phase === 'logging-in') && (
        <>
          <div className="eyebrow">{t('setup.steps.account')}</div>
          <h2>{t('setup.login.title')}</h2>
          <p className="muted small">{t('setup.login.desc')}</p>
          {version && <p className="muted small fact">Google Cloud CLI {version}</p>}
          {phase === 'logging-in' ? (
            <>
              <Loading text={t('setup.login.waiting')} />
              <p className="muted small">{t('setup.login.waitingHint')}</p>
            </>
          ) : (
            <div className="actions">
              <button type="button" className="torch" onClick={() => void login()}>
                {t('setup.login.button')}
              </button>
            </div>
          )}
          <ErrorText>{message}</ErrorText>
        </>
      )}

      {phase === 'no-billing' && (
        <>
          <div className="eyebrow">{t('setup.steps.account')}</div>
          <h2>{t('setup.noBilling.title')}</h2>
          <p className="muted small">{t('setup.noBilling.desc')}</p>
          <ul className="muted small">
            <li>{t('setup.noBilling.point1')}</li>
            <li>{t('setup.noBilling.point2')}</li>
            <li>{t('setup.noBilling.point3')}</li>
          </ul>
          {detected > 0 && <ErrorText>{t('setup.noBilling.foundButClosed', { count: detected })}</ErrorText>}
          <p className="muted small">{t('setup.noBilling.autoRecheck')}</p>
          <div className="actions">
            <button type="button" className="torch" onClick={() => open(FREE_TRIAL_URL)}>
              {t('setup.noBilling.open')}
            </button>
            <button type="button" className="bare" onClick={() => void check()}>
              {t('setup.noBilling.recheck')}
            </button>
          </div>
        </>
      )}

      {(phase === 'pick-billing' || phase === 'preparing') && (
        <>
          <div className="eyebrow">{t('setup.steps.server')}</div>
          <h2>{t('setup.billing.title')}</h2>
          <p className="muted small">
            {t('setup.billing.signedInAs')} <span className="fact">{account}</span>
          </p>

          {phase === 'preparing' ? (
            <>
              <Loading text={t('setup.billing.preparing')} />
              <p className="muted small">{t('setup.billing.preparingHint')}</p>
            </>
          ) : (
            <>
              <label className="field">
                <span className="field-label">{t('setup.billing.select')}</span>
                <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {billing.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName} ({a.id})
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small">{t('setup.billing.whatHappens')}</p>
              <div className="actions">
                <button type="button" className="torch" onClick={() => void prepare()}>
                  {t('setup.billing.continue')}
                </button>
              </div>
            </>
          )}
          <ErrorText>{message}</ErrorText>
        </>
      )}

      {phase === 'error' && (
        <>
          <WorldBlock size={66} lit={false} />
          <h2>{t('common.error')}</h2>
          <ErrorText>{message}</ErrorText>
          <div className="actions">
            <button type="button" className="torch" onClick={() => void check()}>
              {t('common.retry')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
