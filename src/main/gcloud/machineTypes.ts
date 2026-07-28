import type { MachineType } from '@shared/types'
import { runGcloudJson } from './exec'

interface RawMachineType {
  name: string
  description: string
  guestCpus: number
  memoryMb: number
  isSharedCpu: boolean
}

/** 每個區域的機型清單變動極少，快取起來避免每次開精靈都重查 */
const cache = new Map<string, MachineType[]>()

/**
 * 列出某個區域可用的所有機型。
 *
 * 不同區域提供的機型不一樣（新機種通常先在少數區域上線），
 * 所以一定要帶著區域查，不能寫死一份清單。
 */
export async function listMachineTypes(projectId: string, zone: string): Promise<MachineType[]> {
  const cached = cache.get(zone)
  if (cached) return cached

  const raw = await runGcloudJson<RawMachineType[]>([
    'compute',
    'machine-types',
    'list',
    `--project=${projectId}`,
    `--zones=${zone}`
  ])

  const types: MachineType[] = raw
    .map((m) => ({
      name: m.name,
      family: m.name.split('-')[0],
      cpus: m.guestCpus,
      memoryGb: Math.round((m.memoryMb / 1024) * 100) / 100,
      isSharedCpu: m.isSharedCpu,
      description: m.description
    }))
    .sort((a, b) =>
      a.family === b.family ? a.cpus - b.cpus || a.memoryGb - b.memoryGb : a.family.localeCompare(b.family)
    )

  cache.set(zone, types)
  return types
}

/**
 * 支援自訂核心數與記憶體的機型系列。
 *
 * 只有這幾個系列能用 `<系列>-custom-<核心>-<MB>` 的寫法；
 * 其他系列（C3、T2D 等）只能選預設規格。
 */
export const CUSTOM_CAPABLE_FAMILIES = ['e2', 'n1', 'n2', 'n2d'] as const

/**
 * 組出自訂機型的名稱。
 *
 * GCP 對自訂規格有一堆限制（核心數超過 1 必須是偶數、記憶體必須是 256MB 的
 * 倍數、每核心的記憶體有上下限，且各系列不同）。我們只做最基本的檢查，
 * 其餘交給 GCP 判斷——它的錯誤訊息比我們自己維護一份規則表準確得多，
 * 而且不會因為 Google 改規則就過時。
 */
export function buildCustomMachineType(family: string, cpus: number, memoryGb: number): string {
  if (!CUSTOM_CAPABLE_FAMILIES.includes(family as (typeof CUSTOM_CAPABLE_FAMILIES)[number])) {
    throw new Error(`${family} 系列不支援自訂規格`)
  }
  if (!Number.isInteger(cpus) || cpus < 1) throw new Error('核心數必須是正整數')
  if (cpus > 1 && cpus % 2 !== 0) throw new Error('核心數超過 1 時必須是偶數')

  const memoryMb = Math.round(memoryGb * 1024)
  if (memoryMb % 256 !== 0) throw new Error('記憶體必須是 0.25 GB 的倍數')

  // n1 的自訂機型不帶系列前綴，是歷史遺留的特例
  return family === 'n1' ? `custom-${cpus}-${memoryMb}` : `${family}-custom-${cpus}-${memoryMb}`
}
