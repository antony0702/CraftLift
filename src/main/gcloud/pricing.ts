import type { PriceEstimate } from '@shared/types'
import { runGcloud } from './exec'

/** Compute Engine 在 Cloud Billing 目錄裡的服務代號 */
const COMPUTE_SERVICE_ID = '6F81-5844-456A'
const CATALOG_URL = `https://cloudbilling.googleapis.com/v1/services/${COMPUTE_SERVICE_ID}/skus`

interface Sku {
  description: string
  category: { resourceGroup: string; usageType: string }
  serviceRegions: string[]
  pricingInfo?: Array<{
    pricingExpression?: {
      tieredRates?: Array<{ unitPrice: { currencyCode: string; units?: string; nanos?: number } }>
    }
  }>
}

/** 整份目錄超過三萬筆，抓一次要好幾秒，所以放記憶體快取 */
let catalogCache: { skus: Sku[]; fetchedAt: number } | null = null
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

async function fetchCatalog(): Promise<Sku[]> {
  if (catalogCache && Date.now() - catalogCache.fetchedAt < CACHE_TTL_MS) {
    return catalogCache.skus
  }

  // 借用 gcloud 已經拿到的存取權杖。Cloud Billing 目錄 API 接受 OAuth，
  // 不需要另外申請 API 金鑰。
  const token = (await runGcloud(['auth', 'print-access-token'])).trim()
  if (!token) throw new Error('無法取得存取權杖')

  const skus: Sku[] = []
  let pageToken = ''
  do {
    const url = `${CATALOG_URL}?pageSize=5000&currencyCode=USD${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`價格目錄查詢失敗（HTTP ${res.status}）`)
    const json = (await res.json()) as { skus?: Sku[]; nextPageToken?: string }
    skus.push(...(json.skus ?? []))
    pageToken = json.nextPageToken ?? ''
  } while (pageToken)

  catalogCache = { skus, fetchedAt: Date.now() }
  return skus
}

function unitPrice(sku: Sku): number | null {
  // 取最後一階的價格：第一階常常是 0（免費額度），我們要的是實際單價
  const rates = sku.pricingInfo?.[0]?.pricingExpression?.tieredRates
  const rate = rates?.[rates.length - 1]
  if (!rate) return null
  return Number(rate.unitPrice.units ?? 0) + (rate.unitPrice.nanos ?? 0) / 1e9
}

/**
 * 這些字眼代表的是特殊計價項目，不是一般隨選機器的單價。
 * 混進來會讓估價嚴重偏離。
 */
const EXCLUDE =
  /Sole Tenancy|Premium|Commitment|Reserved|Spot|Preemptible|Custom|Confidential|DWS Defined/i

/**
 * 少數機型系列的 SKU 不是放在 CPU／RAM 分類底下。
 *
 * N1 是最早的機種，它的核心與記憶體都歸在 N1Standard 分類。
 * f1-micro 與 g1-small 則是整台機器一個價，沒有「每核心」「每 GB」的
 * 單價可拆——那兩種我們不估價，寧可老實說算不出來，也不要編一個數字。
 */
const RESOURCE_GROUP_OVERRIDE: Record<string, string> = { n1: 'N1Standard' }

/**
 * 由機型系列找出對應的 CPU／記憶體 SKU。
 *
 * Google 的 SKU 描述沒有統一格式：E2 是「E2 Instance Core running in Taiwan」、
 * N2D 是「N2D AMD Instance Core running in ...」、N1 則是「N1 Predefined
 * Instance Core running in ...」。這裡用寬鬆比對涵蓋常見寫法，
 * 找不到就明確回報「無法估價」，絕不用猜的數字充數。
 */
function findResourceSku(
  skus: Sku[],
  region: string,
  family: string,
  group: 'CPU' | 'RAM'
): Sku | undefined {
  const word = group === 'CPU' ? 'Core' : 'Ram'
  const upper = family.toUpperCase()

  const wantedGroup = RESOURCE_GROUP_OVERRIDE[family.toLowerCase()] ?? group
  const candidates = skus.filter(
    (s) =>
      s.category.resourceGroup === wantedGroup &&
      s.category.usageType === 'OnDemand' &&
      s.serviceRegions?.includes(region) &&
      !EXCLUDE.test(s.description)
  )

  const patterns = [
    // E2 Instance Core / N2D AMD Instance Core / C4A Arm Instance Core
    new RegExp(`^${upper}(?: AMD| Arm)? Instance ${word} running`, 'i'),
    // N1 Predefined Instance Core（N1 是舊機種，描述格式跟其他系列不同）
    new RegExp(`^${upper} Predefined Instance ${word} running`, 'i'),
    // M3 Memory-optimized Instance Core 之類
    new RegExp(`^${upper} .*Instance ${word} running`, 'i')
  ]

  // 幾個舊機種的 SKU 描述裡根本沒有系列代號，只能個別對應
  const LEGACY: Record<string, RegExp> = {
    n1: new RegExp(`^Predefined Instance ${word} running`, 'i'),
    c2: new RegExp(`^Compute optimized ${word} running`, 'i'),
    m1: new RegExp(`^Memory-optimized Instance ${word} running`, 'i')
  }
  const legacy = LEGACY[family.toLowerCase()]
  if (legacy) patterns.push(legacy)

  for (const pattern of patterns) {
    const hit = candidates.find((s) => pattern.test(s.description))
    if (hit) return hit
  }
  return undefined
}

/**
 * 依名稱找出一項 SKU。
 *
 * 不能用完全比對：同一項資源在不同區域的描述會多一個地區後綴
 * （彰化是「Balanced PD Capacity」，東京則是「Balanced PD Capacity in Japan」）。
 * 但也不能只用「包含」，否則「Balanced PD Capacity」會誤中價格為兩倍的
 * 「Regional Balanced PD Capacity」。所以比對開頭，並允許地區後綴。
 */
function findByPrefix(skus: Sku[], region: string, prefix: string): Sku | undefined {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: in .+)?$`, 'i')
  return skus.find(
    (s) =>
      s.serviceRegions?.includes(region) &&
      s.category.usageType === 'OnDemand' &&
      pattern.test(s.description.trim())
  )
}

export interface EstimateInput {
  region: string
  family: string
  cpus: number
  memoryGb: number
  diskGb: number
  useStaticIp: boolean
}

/**
 * 估算一台機器的費用。
 *
 * 這是估計值，不是帳單。它涵蓋機器、磁碟與固定位址，
 * 但不含網路流量（取決於玩家人數與遊玩時數，無從預測）、
 * 也不含任何折扣或免費額度。實際金額一律以 Google 為準。
 */
export async function estimatePrice(input: EstimateInput): Promise<PriceEstimate> {
  const skus = await fetchCatalog()
  const { region, family, cpus, memoryGb, diskGb, useStaticIp } = input

  const missing: string[] = []

  const cpuSku = findResourceSku(skus, region, family, 'CPU')
  const ramSku = findResourceSku(skus, region, family, 'RAM')
  const cpuRate = cpuSku ? unitPrice(cpuSku) : null
  const ramRate = ramSku ? unitPrice(ramSku) : null
  if (cpuRate === null || ramRate === null) missing.push('machine')

  // 磁碟以 GB/月計價。用開頭比對是為了避開價格兩倍的 Regional 版本。
  const diskSku = findByPrefix(skus, region, 'Balanced PD Capacity')
  const diskRate = diskSku ? unitPrice(diskSku) : null
  if (diskRate === null) missing.push('disk')

  const ipSku = useStaticIp ? findByPrefix(skus, region, 'Static Ip Charge') : undefined
  const ipRate = useStaticIp ? (ipSku ? unitPrice(ipSku) : null) : 0
  if (useStaticIp && ipRate === null) missing.push('ip')

  const machineHourly = (cpuRate ?? 0) * cpus + (ramRate ?? 0) * memoryGb
  const diskMonthly = (diskRate ?? 0) * diskGb
  const ipHourly = ipRate ?? 0

  // 用每月 730 小時換算，這是 Google 自己在計價頁使用的基準
  const hoursPerMonth = 730
  const monthly = machineHourly * hoursPerMonth + diskMonthly + ipHourly * hoursPerMonth

  return {
    currency: 'USD',
    hourlyRunning: machineHourly + ipHourly,
    monthlyAlwaysOn: monthly,
    monthlyDisk: diskMonthly,
    complete: missing.length === 0,
    missing
  }
}
