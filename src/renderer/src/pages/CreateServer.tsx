import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  LoaderVersion,
  MachineType,
  McVersion,
  ModLoader,
  PriceEstimate,
  ServerFlavor,
  ServerProperties
} from '@shared/types'
import { DEFAULT_PROPERTIES, PROPERTY_FIELDS } from '@shared/properties'
import {
  DEFAULT_DISK_GB,
  DEFAULT_TIER,
  DEFAULT_USE_STATIC_IP,
  DEFAULT_ZONE,
  LOADERS,
  MODDED_RECOMMENDED_RAM_GB,
  PRICING_CALCULATOR_URL,
  TIERS,
  ZONES,
  jvmHeapFor,
  mcVersionAtLeast
} from '@shared/constants'
import { call, errorText } from '../lib/api'
import { ErrorText, Field, Info, Loading } from '../components/Ui'
import PropertyFields from '../components/PropertyFields'
import WorldBlock from '../components/WorldBlock'

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
  const [advanced, setAdvanced] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [mcVersion, setMcVersion] = useState('')
  const [flavor, setFlavor] = useState<ServerFlavor>('vanilla')
  /** 載入器版本。'' 代表交給 CraftLift 挑最新正式版。 */
  const [loaderVersion, setLoaderVersion] = useState('')
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([])
  const [loaderLoading, setLoaderLoading] = useState(false)
  const [loaderFailed, setLoaderFailed] = useState(false)
  const [zone, setZone] = useState(DEFAULT_ZONE)
  const [diskGb, setDiskGb] = useState(DEFAULT_DISK_GB)
  const [useStaticIp, setUseStaticIp] = useState(DEFAULT_USE_STATIC_IP)
  const [accepted, setAccepted] = useState(false)

  const [tier, setTier] = useState<string>(DEFAULT_TIER)
  const [machineTypes, setMachineTypes] = useState<MachineType[]>([])
  const [machinesLoading, setMachinesLoading] = useState(false)
  const [machinesError, setMachinesError] = useState('')
  const [family, setFamily] = useState('e2')
  const [selectedType, setSelectedType] = useState('')
  const [custom, setCustom] = useState(false)
  const [cpus, setCpus] = useState(2)
  const [memory, setMemory] = useState(8)

  const [estimate, setEstimate] = useState<PriceEstimate | null>(null)
  const [estimateFailed, setEstimateFailed] = useState(false)

  /**
   * The Minecraft settings the new server starts with.
   *
   * Asked here rather than after creation: changing them later needs a
   * restart, and the user has just spent minutes waiting for the machine.
   */
  const [properties, setProperties] = useState<ServerProperties>({ ...DEFAULT_PROPERTIES })
  const updateProperty = (key: string, value: string): void =>
    setProperties((prev) => ({ ...prev, [key]: value }))

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

  // The machine catalogue differs per zone, so refetch when the zone changes.
  // Fetched in simple mode too: the tiers name a preferred machine type plus a
  // fallback, and only this list says which of them the zone actually offers.
  useEffect(() => {
    void (async () => {
      setMachinesLoading(true)
      setMachinesError('')
      try {
        const list = await call(window.api.machine.list(zone))
        setMachineTypes(list)
        setSelectedType((prev) =>
          prev && list.some((m) => m.name === prev)
            ? prev
            : (list.find((m) => m.family === family)?.name ?? '')
        )
      } catch (err) {
        // 清單抓不到時一定要清空並講原因。留著上一批會讓使用者選到這個
        // 機房根本沒有的機型；靜靜留一個空清單則會變成一條沒有項目的
        // 下拉選單——那看起來像介面壞了，而不是查詢失敗。
        setMachineTypes([])
        setMachinesError(errorText(err))
      } finally {
        setMachinesLoading(false)
      }
    })()
  }, [zone, family])

  /** 這個載入器支援目前選的 Minecraft 版本嗎 */
  const loaderFits = (loader: ModLoader): boolean => {
    const spec = LOADERS.find((l) => l.id === loader)
    return !spec || !mcVersion || mcVersionAtLeast(mcVersion, spec.minMcVersion)
  }
  const loaderTooOld = flavor !== 'vanilla' && !loaderFits(flavor)

  // 載入器版本清單。換 Minecraft 版本或換載入器都要重抓——同一個載入器
  // 在不同 Minecraft 版本下是完全不同的一串版本號。
  useEffect(() => {
    if (flavor === 'vanilla' || !mcVersion) {
      setLoaderVersions([])
      setLoaderFailed(false)
      return
    }
    let cancelled = false
    setLoaderLoading(true)
    setLoaderFailed(false)
    void (async () => {
      try {
        const list = await call(window.api.loader.versions(flavor, mcVersion))
        if (!cancelled) setLoaderVersions(list)
      } catch {
        // 查不到不是死路：留空字串就是「交給 CraftLift 挑」，主行程那端
        // 本來就會自己選最新的正式版。這裡只要說清楚會發生什麼事。
        if (!cancelled) {
          setLoaderVersions([])
          setLoaderFailed(true)
        }
      } finally {
        if (!cancelled) setLoaderLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [flavor, mcVersion])

  // 換過載入器或 Minecraft 版本之後，先前選的那個版本號多半已經不存在了
  useEffect(() => {
    setLoaderVersion('')
  }, [flavor, mcVersion])

  const families = useMemo(
    () => [...new Set(machineTypes.map((m) => m.family))].sort(),
    [machineTypes]
  )
  const inFamily = useMemo(
    () => machineTypes.filter((m) => m.family === family),
    [machineTypes, family]
  )

  /** The machine spec that will actually be submitted */
  const spec = useMemo(() => {
    if (!advanced) {
      const chosen = TIERS.find((x) => x.id === tier) ?? TIERS[1]
      // Take the first candidate this zone offers. Not every family exists
      // everywhere — Tokyo has no C3D at all today — and every candidate for a
      // tier has the same cpus and memory, so the spec shown stays true either
      // way. If the catalogue could not be loaded, fall back to the preferred
      // one: creating with a name the zone rejects beats not creating at all.
      const name =
        chosen.machineTypes.find((candidate) => machineTypes.some((m) => m.name === candidate)) ??
        chosen.machineTypes[0]
      return {
        name,
        family: name.split('-')[0],
        cpus: chosen.cpus,
        memoryGb: chosen.ramGb
      }
    }
    if (custom) return { name: '', family, cpus, memoryGb: memory }
    const found = machineTypes.find((m) => m.name === selectedType)
    return found
      ? { name: found.name, family: found.family, cpus: found.cpus, memoryGb: found.memoryGb }
      : null
  }, [advanced, tier, custom, family, cpus, memory, machineTypes, selectedType])

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
            setEstimateFailed(false)
          }
        } catch {
          if (!cancelled) {
            setEstimate(null)
            setEstimateFailed(true)
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
        machineType = await call(window.api.machine.custom(spec.family, spec.cpus, spec.memoryGb))
      }
      await call(
        window.api.server.create({
          displayName: displayName.trim() || 'Minecraft',
          mcVersion,
          flavor,
          loaderVersion: flavor === 'vanilla' ? '' : loaderVersion,
          machineType,
          cpus: spec.cpus,
          memoryGb: spec.memoryGb,
          zone,
          diskGb,
          useStaticIp,
          properties,
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
      <div className="screen narrow">
        <Loading text={t('create.loading')} />
      </div>
    )
  }

  if (creating) {
    return (
      <div className="screen narrow">
        <div className="centered">
          <WorldBlock size={88} lit />
          <h2>{t('create.creating')}</h2>
          <p className="muted small">{t('create.creatingHint')}</p>
        </div>
      </div>
    )
  }

  const money = (v: number): string => `$${v.toFixed(2)}`

  return (
    <div className="screen narrow">
      <div className="eyebrow">{t('create.title')}</div>

      <Field label={t('create.name')}>
        <input
          type="text"
          value={displayName}
          maxLength={40}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </Field>

      {!advanced && (
        <>
          <p className="field-label">{t('create.tier')}</p>
          <div className="tiers">
            {TIERS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="tier"
                aria-pressed={option.id === tier}
                onClick={() => setTier(option.id)}
              >
                <b>{t(`create.tiers.${option.id}.name`)}</b>
                <span className="spec">{t(`create.tiers.${option.id}.players`)}</span>
                <span className="spec fact">
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

      {/* ── 原版還是模組 ──
          先問「要不要模組」再問「哪一種」。把四個選項並排會讓使用者以為
          Fabric 跟原版是同一層的選擇，但實際上絕大多數人只要判斷第一題。 */}
      <p className="field-label">{t('create.flavor')}</p>
      <div className="segmented">
        <button
          type="button"
          aria-pressed={flavor === 'vanilla'}
          onClick={() => setFlavor('vanilla')}
        >
          {t('create.vanilla')}
        </button>
        <button
          type="button"
          aria-pressed={flavor !== 'vanilla'}
          onClick={() => setFlavor((prev) => (prev === 'vanilla' ? 'fabric' : prev))}
        >
          {t('create.modded')}
        </button>
      </div>

      {flavor !== 'vanilla' && (
        <div className="loader-choice">
          <div className="tiers">
            {LOADERS.map((option) => {
              const fits = loaderFits(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  className="tier"
                  aria-pressed={option.id === flavor}
                  onClick={() => setFlavor(option.id)}
                >
                  <b>{t(`create.loaders.${option.id}.name`)}</b>
                  <span className="spec">
                    {fits
                      ? t(`create.loaders.${option.id}.desc`)
                      : t('create.loaderNeeds', { version: option.minMcVersion })}
                  </span>
                </button>
              )
            })}
          </div>

          {loaderTooOld ? (
            /* 選了但版本搭不起來。與其偷偷幫他換掉，不如擋住並講原因——
               自己換掉的話，使用者會拿到一台跟他選的不一樣的伺服器。 */
            <p className="error">
              {t('create.loaderTooOld', {
                loader: t(`create.loaders.${flavor}.name`),
                version: mcVersion
              })}
            </p>
          ) : (
            <Field label={t('create.loaderVersion')} hint={t('create.loaderVersionHint')}>
              <select
                value={loaderVersion}
                disabled={loaderLoading || loaderVersions.length === 0}
                onChange={(e) => setLoaderVersion(e.target.value)}
              >
                <option value="">{t('create.loaderRecommended')}</option>
                {loaderVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id}
                    {v.stable ? '' : ` (${t('create.loaderBeta')})`}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {loaderLoading && <p className="muted small">{t('create.loaderLoading')}</p>}
          {loaderFailed && <p className="muted small">{t('create.loaderUnavailable')}</p>}

          {/* 這是模組伺服器最常見的失敗原因，不能只寫在說明文件裡 */}
          <div className="notice">
            <p className="small">{t('create.moddedNote')}</p>
          </div>
        </div>
      )}

      {/* ── Minecraft settings ──
          Asked here so the first thing a user does with a brand new server
          isn't changing settings and waiting through another restart. Same
          fields, same wording as the settings tab — they share one table. */}
      <div className="game-settings">
        <p className="field-label">{t('create.gameSettings')}</p>
        <PropertyFields
          fields={PROPERTY_FIELDS}
          values={properties}
          onChange={updateProperty}
        />
      </div>

      <button type="button" className="bare" onClick={() => setAdvanced((p) => !p)}>
        {advanced ? t('create.hideAdvanced') : t('create.showAdvanced')}
      </button>

      {advanced && (
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

          {/* 清單還沒回來或抓不到時，一定要講話。空的 <select> 點下去只會
              彈出一條沒有任何項目的細線，看起來像介面壞了。 */}
          {machinesLoading && <p className="muted small">{t('create.machinesLoading')}</p>}
          {!machinesLoading && machineTypes.length === 0 && (
            <div className="notice">
              <p>{t('create.machinesUnavailable')}</p>
              {machinesError && <p className="muted small fact">{machinesError}</p>}
            </div>
          )}

          <Field label={t('create.family')} hint={t('create.familyHint')}>
            <select
              value={family}
              disabled={families.length === 0}
              onChange={(e) => {
                setFamily(e.target.value)
                setCustom(false)
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
            <button type="button" aria-pressed={!custom} onClick={() => setCustom(false)}>
              {t('create.predefined')}
            </button>
            <button
              type="button"
              aria-pressed={custom}
              disabled={!CUSTOM_CAPABLE.includes(family)}
              onClick={() => setCustom(true)}
            >
              {t('create.custom')}
            </button>
          </div>
          {!CUSTOM_CAPABLE.includes(family) && (
            <p className="muted small">
              {t('create.customUnsupported', { family: family.toUpperCase() })}
            </p>
          )}

          {custom ? (
            <>
              <Field label={t('create.cpus')} hint={t('create.cpusHint')}>
                <input
                  type="number"
                  min={1}
                  max={128}
                  value={cpus}
                  onChange={(e) => setCpus(Number(e.target.value))}
                />
              </Field>
              <Field label={t('create.memory')} hint={t('create.memoryHint')}>
                <input
                  type="number"
                  min={1}
                  max={512}
                  step={0.25}
                  value={memory}
                  onChange={(e) => setMemory(Number(e.target.value))}
                />
              </Field>
            </>
          ) : (
            <Field label={t('create.machineType')}>
              <select
                value={selectedType}
                disabled={inFamily.length === 0}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                {inFamily.map((m) => (
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
              <Info text={t('create.floatingIpHint')} />
            </span>
          </label>
        </div>
      )}

      {/* ── 費用估算 ── */}
      <div className="estimate">
        <div className="field-label">
          {t('create.estimate.title')}
          {spec && (
            <span className="fact" style={{ marginLeft: 'auto' }}>
              {spec.cpus} vCPU · {spec.memoryGb} GB ·{' '}
              {t('create.estimate.heap', { heap: jvmHeapFor(spec.memoryGb) })}
            </span>
          )}
        </div>

        {/* 模組吃記憶體吃得比原版兇得多，在這裡講是因為旁邊就是規格 */}
        {flavor !== 'vanilla' && spec && spec.memoryGb < MODDED_RECOMMENDED_RAM_GB && (
          <p className="muted small">
            {t('create.moddedMemory', { gb: MODDED_RECOMMENDED_RAM_GB })}
          </p>
        )}

        {estimateFailed ? (
          <p className="muted small">{t('create.estimate.unavailable')}</p>
        ) : !estimate ? (
          <p className="muted small">{t('create.estimate.calculating')}</p>
        ) : (
          <>
            <div className="figures">
              <div>
                <b>{money(estimate.monthlyAlwaysOn)}</b>
                <span>{t('create.estimate.perMonth')}</span>
              </div>
              <div>
                <b>{money(estimate.hourlyRunning)}</b>
                <span>{t('create.estimate.perHour')}</span>
              </div>
              <div>
                <b>{money(estimate.monthlyDisk)}</b>
                <span>{t('create.estimate.diskPerMonth')}</span>
              </div>
            </div>
            {!estimate.complete && <p className="muted small">{t('create.estimate.incomplete')}</p>}
          </>
        )}

        {/* 免責必須跟數字放在一起，分開放就失去意義 */}
        <p className="muted small fine">{t('create.estimate.disclaimer')}</p>
        <button
          type="button"
          className="bare"
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
          className="torch"
          disabled={!accepted || !mcVersion || !spec || loaderTooOld}
          onClick={() => void submit()}
        >
          {t('create.submit')}
        </button>
        <button type="button" className="bare" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
