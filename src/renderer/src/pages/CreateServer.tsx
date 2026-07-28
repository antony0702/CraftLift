import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MachineType, McVersion, PriceEstimate } from '@shared/types'
import {
  DEFAULT_DISK_GB,
  DEFAULT_TIER,
  DEFAULT_USE_STATIC_IP,
  DEFAULT_ZONE,
  PRICING_CALCULATOR_URL,
  TIERS,
  ZONES,
  jvmHeapFor
} from '@shared/constants'
import { call, errorText } from '../lib/api'
import { Card, ErrorText, Field, InfoIcon, Loading } from '../components/Ui'

/** 支援自訂核心與記憶體的系列，與主行程的清單保持一致 */
const CUSTOM_CAPABLE = ['e2', 'n1', 'n2', 'n2d']

function regionOf(zone: string): string {
  return zone.replace(/-[a-z]$/, '')
}

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
  const [zone, setZone] = useState(DEFAULT_ZONE)
  const [diskGb, setDiskGb] = useState(DEFAULT_DISK_GB)
  const [useStaticIp, setUseStaticIp] = useState(DEFAULT_USE_STATIC_IP)
  const [accepted, setAccepted] = useState(false)

  // 機型選擇：簡易模式用 tier，進階模式直接選機型或自訂規格
  const [tier, setTier] = useState<string>(DEFAULT_TIER)
  const [machineTypes, setMachineTypes] = useState<MachineType[]>([])
  const [family, setFamily] = useState('e2')
  const [selectedType, setSelectedType] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [customCpus, setCustomCpus] = useState(2)
  const [customMemory, setCustomMemory] = useState(8)

  const [estimate, setEstimate] = useState<PriceEstimate | null>(null)
  const [estimateError, setEstimateError] = useState('')

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

  // 機型清單依區域而異，換區域要重抓
  useEffect(() => {
    if (!showAdvanced) return
    void (async () => {
      try {
        const list = await call(window.api.machine.list(zone))
        setMachineTypes(list)
        setSelectedType((prev) =>
          prev && list.some((m) => m.name === prev) ? prev : (list.find((m) => m.family === family)?.name ?? '')
        )
      } catch (err) {
        setMessage(errorText(err))
      }
    })()
  }, [showAdvanced, zone, family])

  const families = useMemo(
    () => [...new Set(machineTypes.map((m) => m.family))].sort(),
    [machineTypes]
  )
  const typesInFamily = useMemo(
    () => machineTypes.filter((m) => m.family === family),
    [machineTypes, family]
  )

  /** 目前實際會送出的機器規格 */
  const spec = useMemo(() => {
    if (!showAdvanced) {
      const chosen = TIERS.find((x) => x.id === tier) ?? TIERS[1]
      return { name: chosen.machineType, family: 'e2', cpus: chosen.cpus, memoryGb: chosen.ramGb }
    }
    if (customMode) {
      return { name: '', family, cpus: customCpus, memoryGb: customMemory }
    }
    const found = machineTypes.find((m) => m.name === selectedType)
    return found
      ? { name: found.name, family: found.family, cpus: found.cpus, memoryGb: found.memoryGb }
      : null
  }, [showAdvanced, tier, customMode, family, customCpus, customMemory, machineTypes, selectedType])

  // 估價。輸入會連續變動，稍微延遲再查，避免拖動數字時狂打 API。
  useEffect(() => {
    if (!spec) return
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await call(
            window.api.machine.estimate({
              region: regionOf(zone),
              family: spec.family,
              cpus: spec.cpus,
              memoryGb: spec.memoryGb,
              diskGb,
              useStaticIp
            })
          )
          if (!cancelled) {
            setEstimate(result)
            setEstimateError('')
          }
        } catch (err) {
          if (!cancelled) {
            setEstimate(null)
            setEstimateError(errorText(err))
          }
        }
      })()
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [spec, zone, diskGb, useStaticIp])

  const submit = async (): Promise<void> => {
    if (!spec) return
    setCreating(true)
    setMessage('')
    try {
      let machineType = spec.name
      if (!machineType) {
        // 自訂規格：交給主行程組出名稱，順便做基本檢查
        machineType = await call(window.api.machine.custom(spec.family, spec.cpus, spec.memoryGb))
      }
      await call(
        window.api.server.create({
          displayName: displayName.trim() || 'Minecraft',
          mcVersion,
          machineType,
          cpus: spec.cpus,
          memoryGb: spec.memoryGb,
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

  const money = (value: number): string => `$${value.toFixed(2)}`

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

        {!showAdvanced && (
          <>
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
                  <span className="tier-spec">
                    {option.cpus} vCPU · {option.ramGb} GB
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <Field label={t('create.version')}>
          <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id}
              </option>
            ))}
          </select>
        </Field>

        <button type="button" className="link" onClick={() => setShowAdvanced((prev) => !prev)}>
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

            <Field label={t('create.family')} hint={t('create.familyHint')}>
              <select
                value={family}
                onChange={(e) => {
                  setFamily(e.target.value)
                  setCustomMode(false)
                }}
              >
                {families.map((f) => (
                  <option key={f} value={f}>
                    {f.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>

            <div className="segmented">
              <button
                type="button"
                className={!customMode ? 'active' : ''}
                onClick={() => setCustomMode(false)}
              >
                {t('create.predefined')}
              </button>
              <button
                type="button"
                className={customMode ? 'active' : ''}
                disabled={!CUSTOM_CAPABLE.includes(family)}
                onClick={() => setCustomMode(true)}
              >
                {t('create.custom')}
              </button>
            </div>
            {!CUSTOM_CAPABLE.includes(family) && (
              <p className="muted small">{t('create.customUnsupported', { family: family.toUpperCase() })}</p>
            )}

            {customMode ? (
              <>
                <Field label={t('create.cpus')} hint={t('create.cpusHint')}>
                  <input
                    type="number"
                    min={1}
                    max={128}
                    step={1}
                    value={customCpus}
                    onChange={(e) => setCustomCpus(Number(e.target.value))}
                  />
                </Field>
                <Field label={t('create.memory')} hint={t('create.memoryHint')}>
                  <input
                    type="number"
                    min={1}
                    max={512}
                    step={0.25}
                    value={customMemory}
                    onChange={(e) => setCustomMemory(Number(e.target.value))}
                  />
                </Field>
              </>
            ) : (
              <Field label={t('create.machineType')}>
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                  {typesInFamily.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} — {m.cpus} vCPU, {m.memoryGb} GB
                      {m.isSharedCpu ? ` (${t('create.sharedCpu')})` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label={t('create.disk')}>
              <input
                type="number"
                min={20}
                max={2000}
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

        {/* ---- 費用估算 ---- */}
        <div className="estimate">
          <div className="estimate-head">
            <span className="field-label">{t('create.estimate.title')}</span>
            {spec && (
              <span className="muted small">
                {spec.cpus} vCPU · {spec.memoryGb} GB · {t('create.estimate.heap', { heap: jvmHeapFor(spec.memoryGb) })}
              </span>
            )}
          </div>

          {estimateError ? (
            <p className="muted small">{t('create.estimate.unavailable')}</p>
          ) : !estimate ? (
            <p className="muted small">{t('create.estimate.calculating')}</p>
          ) : (
            <>
              <div className="estimate-figures">
                <div>
                  <strong>{money(estimate.monthlyAlwaysOn)}</strong>
                  <span className="muted small">{t('create.estimate.perMonth')}</span>
                </div>
                <div>
                  <strong>{money(estimate.hourlyRunning)}</strong>
                  <span className="muted small">{t('create.estimate.perHour')}</span>
                </div>
                <div>
                  <strong>{money(estimate.monthlyDisk)}</strong>
                  <span className="muted small">{t('create.estimate.diskPerMonth')}</span>
                </div>
              </div>
              {!estimate.complete && (
                <p className="muted small">{t('create.estimate.incomplete')}</p>
              )}
            </>
          )}

          {/* 這段免責必須跟數字放在一起，分開放就失去意義 */}
          <p className="muted small estimate-disclaimer">{t('create.estimate.disclaimer')}</p>
          <button
            type="button"
            className="link inline"
            onClick={() => void window.api.app.openExternal(PRICING_CALCULATOR_URL)}
          >
            {t('create.officialCalculator')}
          </button>
        </div>

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
            disabled={!accepted || !mcVersion || !spec}
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
