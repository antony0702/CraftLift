import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BillingAccount } from '@shared/types'
import { call, errorText } from '../lib/api'
import { Card, ErrorText, Loading } from '../components/Ui'

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
 * 首次設定流程。
 *
 * 誠實地說，這裡有一段是無法自動化的：建立 Google 帳號、綁定信用卡。
 * Google 規定那必須由使用者本人在瀏覽器完成。這個畫面的責任是
 * 把那一段講清楚並引導過去，其餘全部自動處理。
 */
export default function Setup({ onReady }: { onReady: (projectId: string) => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('checking')
  const [version, setVersion] = useState<string | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [billingAccounts, setBillingAccounts] = useState<BillingAccount[]>([])
  const [selectedBilling, setSelectedBilling] = useState<string>('')
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

      // 已經有專案的話直接進主畫面
      const existing = await call(window.api.project.current())
      if (existing) return onReady(existing)

      const accounts = await call(window.api.project.billingAccounts())
      const usable = accounts.filter((a) => a.open)
      setBillingAccounts(usable)
      if (usable.length === 0) return setPhase('no-billing')

      setSelectedBilling(usable[0].id)
      setPhase('pick-billing')
    } catch (err) {
      setMessage(errorText(err))
      setPhase('error')
    }
  }, [onReady])

  useEffect(() => {
    void check()
  }, [check])

  const handleLogin = async (): Promise<void> => {
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

  const handlePrepare = async (): Promise<void> => {
    setPhase('preparing')
    setMessage('')
    try {
      const projectId = await call(window.api.project.ensure(selectedBilling))
      onReady(projectId)
    } catch (err) {
      setMessage(errorText(err))
      setPhase('pick-billing')
    }
  }

  const copyCommand = async (): Promise<void> => {
    await navigator.clipboard.writeText(INSTALL_COMMAND)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openExternal = (url: string): void => void window.api.app.openExternal(url)

  return (
    <div className="page narrow">
      {phase === 'checking' && (
        <Card>
          <Loading text={t('setup.checking')} />
        </Card>
      )}

      {phase === 'gcloud-missing' && (
        <Card title={t('setup.gcloudMissing.title')}>
          <p className="muted">{t('setup.gcloudMissing.desc')}</p>
          <p className="label">{t('setup.gcloudMissing.how')}</p>
          <div className="command-row">
            <code>{INSTALL_COMMAND}</code>
            <button type="button" onClick={() => void copyCommand()}>
              {copied ? t('common.copied') : '⧉'}
            </button>
          </div>
          <p className="muted small">{t('setup.gcloudMissing.afterInstall')}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void check()}>
              {t('setup.gcloudMissing.recheck')}
            </button>
            <button type="button" className="link" onClick={() => openExternal(GCLOUD_DOWNLOAD)}>
              {t('setup.gcloudMissing.download')}
            </button>
          </div>
        </Card>
      )}

      {(phase === 'need-login' || phase === 'logging-in') && (
        <Card title={t('setup.login.title')}>
          <p className="muted">{t('setup.login.desc')}</p>
          {version && <p className="badge">✓ Google Cloud CLI {version}</p>}
          {phase === 'logging-in' ? (
            <>
              <Loading text={t('setup.login.waiting')} />
              <p className="muted small center">{t('setup.login.waitingHint')}</p>
            </>
          ) : (
            <div className="actions">
              <button type="button" className="primary" onClick={() => void handleLogin()}>
                {t('setup.login.button')}
              </button>
            </div>
          )}
          <ErrorText>{message}</ErrorText>
        </Card>
      )}

      {phase === 'no-billing' && (
        <Card title={t('setup.noBilling.title')}>
          <p className="muted">{t('setup.noBilling.desc')}</p>
          <ul className="muted small">
            <li>{t('setup.noBilling.point1')}</li>
            <li>{t('setup.noBilling.point2')}</li>
            <li>{t('setup.noBilling.point3')}</li>
          </ul>
          <div className="actions">
            <button type="button" className="primary" onClick={() => openExternal(FREE_TRIAL_URL)}>
              {t('setup.noBilling.open')}
            </button>
            <button type="button" className="link" onClick={() => void check()}>
              {t('setup.noBilling.recheck')}
            </button>
          </div>
        </Card>
      )}

      {(phase === 'pick-billing' || phase === 'preparing') && (
        <Card title={t('setup.billing.title')}>
          <p className="muted">
            {t('setup.billing.signedInAs')} <strong>{account}</strong>
          </p>
          {phase === 'preparing' ? (
            <>
              <Loading text={t('setup.billing.preparing')} />
              <p className="muted small center">{t('setup.billing.preparingHint')}</p>
            </>
          ) : (
            <>
              <label className="field">
                <span className="field-label">{t('setup.billing.select')}</span>
                <select
                  value={selectedBilling}
                  onChange={(e) => setSelectedBilling(e.target.value)}
                >
                  {billingAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName} ({a.id})
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small">{t('setup.billing.whatHappens')}</p>
              <div className="actions">
                <button type="button" className="primary" onClick={() => void handlePrepare()}>
                  {t('setup.billing.continue')}
                </button>
              </div>
            </>
          )}
          <ErrorText>{message}</ErrorText>
        </Card>
      )}

      {phase === 'error' && (
        <Card title={t('common.error')}>
          <ErrorText>{message}</ErrorText>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void check()}>
              {t('common.retry')}
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
