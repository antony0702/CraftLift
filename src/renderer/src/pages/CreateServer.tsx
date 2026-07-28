import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { McVersion } from '@shared/types'
import {
  DEFAULT_DISK_GB,
  DEFAULT_TIER,
  DEFAULT_USE_STATIC_IP,
  DEFAULT_ZONE,
  PRICING_CALCULATOR_URL,
  TIERS,
  ZONES
} from '@shared/constants'
import { call, errorText } from '../lib/api'
import { Card, ErrorText, Field, InfoIcon, Loading } from '../components/Ui'

/**
 * 建立伺服器精靈。
 *
 * 刻意不在任何地方顯示我們自己算的預估金額——估錯比不估更糟，
 * 而且會招來「你說一個月 X 元結果扣了 Y 元」的爭議。想知道費用的人
 * 給他 Google 官方計價機的連結。
 */
export default function CreateServer({
  onCreated,
  onCancel
}: {
  onCreated: () => void
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [versions, setVersions] = useState<McVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [mcVersion, setMcVersion] = useState('')
  const [tier, setTier] = useState<string>(DEFAULT_TIER)
  const [zone, setZone] = useState(DEFAULT_ZONE)
  const [diskGb, setDiskGb] = useState(DEFAULT_DISK_GB)
  const [useStaticIp, setUseStaticIp] = useState(DEFAULT_USE_STATIC_IP)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const [list, latest] = await Promise.all([
          call(window.api.mc.versions(false)),
          call(window.api.mc.latest())
        ])
        setVersions(list)
        setMcVersion(latest)
        setDisplayName(t('create.defaultName'))
      } catch (err) {
        setMessage(errorText(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [t])

  const submit = async (): Promise<void> => {
    setCreating(true)
    setMessage('')
    try {
      await call(
        window.api.server.create({
          displayName: displayName.trim() || 'Minecraft',
          mcVersion,
          tier,
          zone,
          diskGb,
          useStaticIp,
          acceptedDisclaimer: accepted
        })
      )
      onCreated()
    } catch (err) {
      setMessage(errorText(err))
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="page narrow">
        <Card>
          <Loading text={t('create.loading')} />
        </Card>
      </div>
    )
  }

  if (creating) {
    return (
      <div className="page narrow">
        <Card title={t('create.creating')}>
          <Loading />
          <p className="muted small center">{t('create.creatingHint')}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="page narrow">
      <Card title={t('create.title')}>
        <Field label={t('create.name')}>
          <input
            type="text"
            value={displayName}
            maxLength={40}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>

        <p className="field-label">{t('create.tier')}</p>
        <div className="tier-grid">
          {TIERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === tier ? 'tier-card selected' : 'tier-card'}
              onClick={() => setTier(option.id)}
            >
              <strong>{t(`create.tiers.${option.id}.name`)}</strong>
              <span className="muted small">{t(`create.tiers.${option.id}.players`)}</span>
              <span className="tier-spec">{option.ramGb} GB RAM</span>
            </button>
          ))}
        </div>
        <p className="muted small">
          {t('create.noPriceNote')}{' '}
          <button
            type="button"
            className="link inline"
            onClick={() => void window.api.app.openExternal(PRICING_CALCULATOR_URL)}
          >
            {t('create.officialCalculator')}
          </button>
        </p>

        <Field label={t('create.version')}>
          <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="button"
          className="link"
          onClick={() => setShowAdvanced((prev) => !prev)}
        >
          {showAdvanced ? t('create.hideAdvanced') : t('create.showAdvanced')}
        </button>

        {showAdvanced && (
          <div className="advanced">
            <Field label={t('create.zone')} hint={t('create.zoneHint')}>
              <select value={zone} onChange={(e) => setZone(e.target.value)}>
                {ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {t(`create.zones.${z.region}`)} ({z.id})
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t('create.disk')}>
              <input
                type="number"
                min={20}
                max={500}
                value={diskGb}
                onChange={(e) => setDiskGb(Number(e.target.value))}
              />
            </Field>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={!useStaticIp}
                onChange={(e) => setUseStaticIp(!e.target.checked)}
              />
              <span>
                {t('create.floatingIp')}
                <InfoIcon text={t('create.floatingIpHint')} />
              </span>
            </label>
          </div>
        )}

        {/* 費用免責。刻意不寫任何金額，只說明機制。 */}
        <div className="disclaimer">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>{t('create.disclaimer')}</span>
          </label>
          <p className="muted small">{t('create.disclaimerNote')}</p>
        </div>

        <ErrorText>{message}</ErrorText>

        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={!accepted || !mcVersion}
            onClick={() => void submit()}
          >
            {t('create.submit')}
          </button>
          <button type="button" className="link" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      </Card>
    </div>
  )
}
