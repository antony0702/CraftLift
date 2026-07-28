import { randomBytes } from 'node:crypto'
import type { BillingAccount, Project } from '@shared/types'
import { BUDGET_ALERT_USD, CRAFTLIFT_LABEL, REQUIRED_APIS } from '@shared/constants'
import { runGcloud, runGcloudJson } from './exec'

/**
 * 產生一個 GCP 專案 ID。
 *
 * GCP 的規則：6–30 字元、只能小寫英文數字與連字號、開頭必須是字母、
 * 結尾不能是連字號，而且是全 Google 唯一。加隨機字串是為了避免撞名。
 */
function generateProjectId(): string {
  return `craftlift-${randomBytes(5).toString('hex')}` // craftlift- + 10 字 = 20 字
}

/** 列出使用者可用的帳單帳戶 */
export async function listBillingAccounts(): Promise<BillingAccount[]> {
  const raw = await runGcloudJson<Array<{ name: string; displayName: string; open: boolean }>>([
    'billing',
    'accounts',
    'list'
  ])
  return raw.map((a) => ({
    // name 長得像 "billingAccounts/01ABCD-2345EF-6789AB"，我們只要後半段
    id: a.name.replace(/^billingAccounts\//, ''),
    displayName: a.displayName,
    open: a.open
  }))
}

/**
 * 找出先前由 CraftLift 建立的專案。
 *
 * 刻意不把專案 ID 存在本機設定檔裡，而是靠標籤從 GCP 查回來——
 * 這樣使用者換電腦、重灌系統，只要登入同一個 Google 帳號就能接續使用。
 */
export async function findExistingProject(): Promise<string | null> {
  const projects = await runGcloudJson<Array<{ projectId: string; lifecycleState?: string }>>([
    'projects',
    'list',
    `--filter=labels.${CRAFTLIFT_LABEL}=true`
  ])
  const active = projects.find((p) => !p.lifecycleState || p.lifecycleState === 'ACTIVE')
  return active?.projectId ?? null
}

/** 查詢某個專案目前綁定的帳單帳戶 */
export async function getLinkedBillingAccount(projectId: string): Promise<string | null> {
  try {
    const info = await runGcloudJson<{ billingAccountName?: string; billingEnabled?: boolean }>([
      'billing',
      'projects',
      'describe',
      projectId
    ])
    if (!info.billingEnabled || !info.billingAccountName) return null
    return info.billingAccountName.replace(/^billingAccounts\//, '')
  } catch {
    return null
  }
}

/**
 * 建立專用的 GCP 專案。
 *
 * 為什麼要獨立開一個專案，而不是用使用者現成的：
 * 因為「徹底刪除」可以直接刪掉整個專案，一次帶走 VM、磁碟、靜態 IP、
 * 防火牆規則。用共用專案的話就得逐項刪，漏掉任何一個（尤其是靜態 IP，
 * 就算沒在用也持續計費）都可能害使用者被扣錢。
 */
export async function createProject(): Promise<string> {
  const projectId = generateProjectId()
  await runGcloud([
    'projects',
    'create',
    projectId,
    `--labels=${CRAFTLIFT_LABEL}=true`,
    '--quiet'
  ])
  return projectId
}

/** 把專案綁到帳單帳戶上。沒有這一步就開不了任何要錢的資源。 */
export async function linkBilling(projectId: string, billingAccountId: string): Promise<void> {
  await runGcloud([
    'billing',
    'projects',
    'link',
    projectId,
    `--billing-account=${billingAccountId}`
  ])
}

/** 啟用專案需要的 API。第一次啟用可能要等一兩分鐘。 */
export async function enableApis(projectId: string): Promise<void> {
  await runGcloud(['services', 'enable', ...REQUIRED_APIS, `--project=${projectId}`, '--quiet'])
}

/**
 * 建立預算警示。
 *
 * 這是整個費用防護裡唯一「不需要 CraftLift 開著也會生效」的機制——
 * 達到門檻時 Google 會直接寄 email 給使用者。因為 Cloud Billing API
 * 沒有提供查詢試用金餘額的方法，我們無法在 UI 顯示還剩多少錢，
 * 這個警示就成了最重要的一道防線。
 *
 * 失敗不視為致命錯誤：某些帳單帳戶的權限設定會擋下建立預算，
 * 但那不該讓整個建立流程停擺。
 */
export async function createBudgetAlert(
  projectId: string,
  billingAccountId: string
): Promise<boolean> {
  try {
    await runGcloud([
      'billing',
      'budgets',
      'create',
      `--billing-account=${billingAccountId}`,
      `--display-name=craftlift-${projectId}`,
      `--budget-amount=${BUDGET_ALERT_USD}USD`,
      `--filter-projects=projects/${projectId}`,
      '--threshold-rule=percent=0.5',
      '--threshold-rule=percent=0.9',
      '--threshold-rule=percent=1.0'
    ])
    return true
  } catch {
    return false
  }
}

/**
 * 一次把專案準備到可以開機器的狀態。
 * 已經存在就沿用，不重複建立。
 */
export async function ensureProject(billingAccountId: string): Promise<Project> {
  let projectId = await findExistingProject()
  if (!projectId) {
    projectId = await createProject()
  }

  const linked = await getLinkedBillingAccount(projectId)
  if (!linked) {
    await linkBilling(projectId, billingAccountId)
    // 新綁帳單後才建預算，否則會因為專案還沒開通而失敗
    await createBudgetAlert(projectId, billingAccountId)
  }

  await enableApis(projectId)

  return { projectId, billingAccountId: linked ?? billingAccountId }
}

/**
 * 徹底刪除——把整個專案丟進垃圾桶。
 *
 * 這會一次帶走 VM、磁碟、靜態 IP、防火牆規則、預算設定，
 * 保證不留下任何會繼續計費的東西。
 *
 * 注意：GCP 的專案刪除有 30 天緩衝期，期間可以還原。
 * 但資源會立刻停止計費，所以對使用者的荷包來說是即時生效的。
 */
export async function deleteProject(projectId: string): Promise<void> {
  await runGcloud(['projects', 'delete', projectId, '--quiet'])
}
