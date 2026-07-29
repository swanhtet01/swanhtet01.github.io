import {
  commercePurchaseOrderArrivalUrgency,
  commercePurchaseOrderProgress,
  commercePurchaseOrders,
  commerceReceivablesAging,
  commerceStorefrontRequests,
  type CommerceState,
} from './commerce-workspace.ts'
import {
  productionMaintenanceRecords,
  type ProductionState,
} from './production-workspace.ts'
import {
  readinessChecks,
  type WebsiteWorkspace,
} from '../products/website/website-model.ts'

export const OPERATIONAL_REPORT_CONTRACT = 'supermega.operational_report.v1' as const
export const OPERATIONAL_REPORT_EXPORT_CONTRACT = 'supermega.operational_report_export.v1' as const
export const OPERATIONAL_REPORT_VIEW_KEY = 'supermega.operational-report-view.v1'

export const operationalProducts = ['commerce', 'production', 'website', 'ecommerce'] as const
export type OperationalProduct = typeof operationalProducts[number]
export type OperationalSeverity = 'critical' | 'warning' | 'action' | 'ready'
export type OperationalSurface = 'commerce' | 'production' | 'website'
export type OperationalSourceMode = 'sample' | 'record' | 'managed' | 'error'

export type OperationalSource = {
  surface: OperationalSurface
  mode: OperationalSourceMode
  revision: number | null
  updatedAt: string | null
}

export type OperationalReportEntry = {
  id: string
  product: OperationalProduct
  severity: OperationalSeverity
  label: string
  detail: string
  count: number
  route: string
  sourceSurface: OperationalSurface
  sourceRevision: number | null
}

export type OperationalReport = {
  contract: typeof OPERATIONAL_REPORT_CONTRACT
  observedAt: string
  mode: 'local' | 'managed'
  allowedProducts: OperationalProduct[]
  sources: OperationalSource[]
  entries: OperationalReportEntry[]
  summary: {
    critical: number
    warning: number
    action: number
    ready: number
  }
  controls: {
    permissionFiltered: true
    sourceBacked: true
    readOnly: true
    containsCustomerValues: false
    externalWritesPerformed: false
    safeToShareExternally: false
  }
}

export type OperationalReportView = {
  product: 'all' | OperationalProduct
  urgency: 'all' | 'attention' | 'critical'
}

type OperationalReportInput = {
  mode: 'local' | 'managed'
  allowedProducts: readonly OperationalProduct[]
  sources: readonly OperationalSource[]
  commerce?: CommerceState
  production?: ProductionState
  website?: WebsiteWorkspace
  now: number
}

const productSurface: Record<OperationalProduct, OperationalSurface> = {
  commerce: 'commerce',
  production: 'production',
  website: 'website',
  ecommerce: 'commerce',
}

const severityScore: Record<OperationalSeverity, number> = {
  critical: 100,
  warning: 80,
  action: 60,
  ready: 10,
}

function exactIso(value: string) {
  try { return new Date(value).toISOString() === value } catch { return false }
}

function canonicalProducts(value: readonly OperationalProduct[]) {
  return operationalProducts.filter((product) => value.includes(product))
}

function validateSources(value: readonly OperationalSource[], allowedProducts: readonly OperationalProduct[]) {
  const required = new Set(allowedProducts.map((product) => productSurface[product]))
  const seen = new Set<OperationalSurface>()
  for (const source of value) {
    if (!['commerce', 'production', 'website'].includes(source.surface)
      || !['sample', 'record', 'managed', 'error'].includes(source.mode)
      || seen.has(source.surface)
      || source.revision !== null && (!Number.isSafeInteger(source.revision) || source.revision < 0)
      || source.updatedAt !== null && !exactIso(source.updatedAt)) {
      throw new Error('Operational report source is invalid.')
    }
    seen.add(source.surface)
  }
  if ([...required].some((surface) => !seen.has(surface))) throw new Error('Operational report source coverage is incomplete.')
  return value.filter((source) => required.has(source.surface)).map((source) => ({ ...source }))
}

function task(
  source: OperationalSource,
  product: OperationalProduct,
  id: string,
  severity: OperationalSeverity,
  label: string,
  detail: string,
  count: number,
  route: string,
): OperationalReportEntry {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Operational report count is invalid.')
  return { id, product, severity, label, detail, count, route, sourceSurface: source.surface, sourceRevision: source.revision }
}

function sourceUnavailableTask(source: OperationalSource, product: OperationalProduct) {
  const label = product === 'commerce' ? 'Shop' : product === 'production' ? 'Plant' : product === 'website' ? 'Website' : 'Ecommerce'
  const setupProduct = product === 'commerce' ? 'commerce' : product === 'production' ? 'production' : product
  if (source.mode === 'error') {
    return task(source, product, `${product}.source_recovery`, 'critical', `Repair saved ${label} data`, 'The source failed validation; no sample values were substituted.', 1, `/settings/?product=${setupProduct}`)
  }
  if (source.mode === 'managed' && source.revision === 0) {
    return task(source, product, `${product}.managed_setup`, 'action', `Set up managed ${label}`, 'Your role can read this product, but no managed record has been initialized.', 1, `/settings/?product=${setupProduct}`)
  }
  return null
}

function shopEntries(input: OperationalReportInput, source: OperationalSource) {
  const unavailable = sourceUnavailableTask(source, 'commerce')
  if (unavailable) return [unavailable]
  const state = input.commerce
  if (!state) return [task(source, 'commerce', 'commerce.setup', 'action', 'Set up Shop', 'Import catalog, stock, customers, and operating controls.', 1, '/settings/?product=commerce')]
  const entries: OperationalReportEntry[] = []
  const refundDue = state.orders.filter((order) => order.refundStatus === 'due').length
  const overdue = commerceReceivablesAging(state, input.now).overdueOrders
  const lowStock = state.items.filter((item) => item.onHand <= item.reorderAt).length
  const activeOrders = state.orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled').length
  const purchaseOrders = commercePurchaseOrders(state)
  const progress = purchaseOrders.map((order) => ({ order, progress: commercePurchaseOrderProgress(state, order) }))
  const latePurchases = progress.filter(({ order, progress: current }) => commercePurchaseOrderArrivalUrgency(order, current, input.now) === 'late').length
  const supplierDiscrepancies = progress.filter(({ progress: current }) => current.status === 'received_with_discrepancy').length
  if (refundDue) entries.push(task(source, 'commerce', 'commerce.refunds_due', 'critical', `Resolve ${refundDue} refund${refundDue === 1 ? '' : 's'}`, 'Reconciled money requires accountable settlement evidence.', refundDue, '/shop/?tab=orders'))
  if (overdue) entries.push(task(source, 'commerce', 'commerce.receivables_overdue', 'critical', `Follow up ${overdue} overdue balance${overdue === 1 ? '' : 's'}`, 'Collection contact remains evidence-only until reviewed.', overdue, '/shop/?tab=orders'))
  if (latePurchases) entries.push(task(source, 'commerce', 'commerce.purchases_late', 'warning', `Review ${latePurchases} late purchase order${latePurchases === 1 ? '' : 's'}`, 'Confirm supplier arrival or record the receiving exception.', latePurchases, '/shop/?tab=inventory'))
  if (supplierDiscrepancies) entries.push(task(source, 'commerce', 'commerce.supplier_discrepancies', 'warning', `Resolve ${supplierDiscrepancies} supplier discrepanc${supplierDiscrepancies === 1 ? 'y' : 'ies'}`, 'Rejected units still require debit and physical-return handling.', supplierDiscrepancies, '/shop/?tab=inventory'))
  if (lowStock) entries.push(task(source, 'commerce', 'commerce.low_stock', 'warning', `Replenish ${lowStock} low-stock item${lowStock === 1 ? '' : 's'}`, 'Review supplier or Plant replenishment before promise risk grows.', lowStock, '/shop/?tab=inventory'))
  if (activeOrders) entries.push(task(source, 'commerce', 'commerce.active_orders', 'action', `Move ${activeOrders} active order${activeOrders === 1 ? '' : 's'}`, 'Prepare, fulfil, or close the next promised order.', activeOrders, '/shop/?tab=orders'))
  if (!entries.length) entries.push(task(source, 'commerce', 'commerce.ready', 'ready', 'Shop is ready for the next sale', 'Counter, stock, customer, payment, and close controls have no derived exception.', 0, '/shop/?tab=counter'))
  return entries
}

function plantEntries(input: OperationalReportInput, source: OperationalSource) {
  const unavailable = sourceUnavailableTask(source, 'production')
  if (unavailable) return [unavailable]
  const state = input.production
  if (!state) return [task(source, 'production', 'production.setup', 'action', 'Set up Plant', 'Import jobs and establish the controlled production plan.', 1, '/settings/?product=production')]
  const entries: OperationalReportEntry[] = []
  const urgentIssues = state.issues.filter((issue) => issue.status === 'open' && (issue.severity === 'critical' || issue.severity === 'high')).length
  const heldJobs = state.jobs.filter((job) => job.qualityHold && !job.closure).length
  const openMaintenance = productionMaintenanceRecords(state).filter((record) => !record.completion).length
  const openJobs = state.jobs.filter((job) => !job.closure && job.output < job.target).length
  if (urgentIssues) entries.push(task(source, 'production', 'production.urgent_issues', 'critical', `Contain ${urgentIssues} urgent problem${urgentIssues === 1 ? '' : 's'}`, 'Resolve the highest-severity exception before release.', urgentIssues, '/plant/?tab=issues'))
  if (heldJobs) entries.push(task(source, 'production', 'production.quality_holds', 'critical', `Review ${heldJobs} quality hold${heldJobs === 1 ? '' : 's'}`, 'Inspect, rework, or retain each hold with attributable evidence.', heldJobs, '/plant/?tab=issues'))
  if (openMaintenance) entries.push(task(source, 'production', 'production.open_maintenance', 'warning', `Complete ${openMaintenance} maintenance record${openMaintenance === 1 ? '' : 's'}`, 'Record tested return to service before relying on the machine.', openMaintenance, '/plant/?tab=issues'))
  if (openJobs) entries.push(task(source, 'production', 'production.open_jobs', 'action', `Run ${openJobs} open job${openJobs === 1 ? '' : 's'}`, 'Record material, routed work, output, quality, and shift evidence.', openJobs, '/plant/?tab=production'))
  if (!entries.length) entries.push(task(source, 'production', 'production.ready', 'ready', 'Plant is ready for the next plan', 'Jobs, issues, quality holds, and maintenance have no derived exception.', 0, '/plant/?tab=production'))
  return entries
}

function websiteEntries(input: OperationalReportInput, source: OperationalSource) {
  const unavailable = sourceUnavailableTask(source, 'website')
  if (unavailable) return [unavailable]
  const state = input.website
  if (!state) return [task(source, 'website', 'website.setup', 'action', 'Set up Website', 'Create the page structure, approved content, and responsive evidence.', 1, '/settings/?product=website')]
  const failedChecks = readinessChecks(state).filter((check) => !check.passed).length
  if (failedChecks) return [task(source, 'website', 'website.readiness', 'warning', `Finish ${failedChecks} launch check${failedChecks === 1 ? '' : 's'}`, 'Complete content and evidence before any release claim.', failedChecks, '/website/')]
  if (!state.localPublishes.length) return [task(source, 'website', 'website.first_release', 'action', 'Record the first local release', 'Approve the exact artifact after readiness passes.', 1, '/website/')]
  return [task(source, 'website', 'website.ready', 'ready', 'Website release evidence is current', 'Review hosting, domain, TLS, rollback, and lead measurement before promotion.', 0, '/website/')]
}

function ecommerceEntries(input: OperationalReportInput, source: OperationalSource) {
  const unavailable = sourceUnavailableTask(source, 'ecommerce')
  if (unavailable) return [unavailable]
  const state = input.commerce
  if (!state) return [task(source, 'ecommerce', 'ecommerce.setup', 'action', 'Set up Ecommerce', 'Project the Shop catalog and save the storefront controls.', 1, '/settings/?product=ecommerce')]
  const waitingRequests = commerceStorefrontRequests(state).filter((request) => !state.orders.some((order) => order.sourceRecordId === request.id)).length
  if (waitingRequests) return [task(source, 'ecommerce', 'ecommerce.waiting_requests', 'warning', `Review ${waitingRequests} customer request${waitingRequests === 1 ? '' : 's'}`, 'Shop must confirm stock, promise, payment, and fulfilment.', waitingRequests, '/shop/?tab=orders&source=ecommerce')]
  if (!state.storefrontConfiguration) return [task(source, 'ecommerce', 'ecommerce.storefront_setup', 'action', 'Save the Shop-backed storefront', 'Choose products and checkout boundaries before customer requests.', 1, '/ecommerce/')]
  return [task(source, 'ecommerce', 'ecommerce.ready', 'ready', 'Ecommerce is ready for a reviewed request', 'Cart and quote remain bounded by Shop stock, payment, and fulfilment review.', 0, '/ecommerce/')]
}

export function buildOperationalReport(input: OperationalReportInput): OperationalReport {
  if (!Number.isFinite(input.now)) throw new Error('Operational report time is invalid.')
  const observedAt = new Date(input.now).toISOString()
  if (input.mode !== 'local' && input.mode !== 'managed') throw new Error('Operational report mode is invalid.')
  const allowedProducts = canonicalProducts(input.allowedProducts)
  if (!allowedProducts.length || allowedProducts.length !== input.allowedProducts.length || new Set(input.allowedProducts).size !== input.allowedProducts.length
    || JSON.stringify(allowedProducts) !== JSON.stringify(input.allowedProducts)) throw new Error('Operational report permissions are invalid.')
  const sources = validateSources(input.sources, allowedProducts)
  const bySurface = new Map(sources.map((source) => [source.surface, source]))
  const entries = allowedProducts.flatMap((product) => {
    const source = bySurface.get(productSurface[product]) as OperationalSource
    if (product === 'commerce') return shopEntries(input, source)
    if (product === 'production') return plantEntries(input, source)
    if (product === 'website') return websiteEntries(input, source)
    return ecommerceEntries(input, source)
  }).sort((left, right) => severityScore[right.severity] - severityScore[left.severity]
    || operationalProducts.indexOf(left.product) - operationalProducts.indexOf(right.product)
    || left.id.localeCompare(right.id))
  const summary = {
    critical: entries.filter((entry) => entry.severity === 'critical').length,
    warning: entries.filter((entry) => entry.severity === 'warning').length,
    action: entries.filter((entry) => entry.severity === 'action').length,
    ready: entries.filter((entry) => entry.severity === 'ready').length,
  }
  return {
    contract: OPERATIONAL_REPORT_CONTRACT,
    observedAt,
    mode: input.mode,
    allowedProducts: [...allowedProducts],
    sources,
    entries,
    summary,
    controls: {
      permissionFiltered: true,
      sourceBacked: true,
      readOnly: true,
      containsCustomerValues: false,
      externalWritesPerformed: false,
      safeToShareExternally: false,
    },
  }
}

export function restoreOperationalReportView(value: unknown, allowedProducts: readonly OperationalProduct[]): OperationalReportView {
  const fallback: OperationalReportView = { product: 'all', urgency: 'attention' }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const candidate = value as Partial<OperationalReportView>
  if (!['all', ...allowedProducts].includes(candidate.product as 'all' | OperationalProduct)
    || !['all', 'attention', 'critical'].includes(candidate.urgency as string)
    || Object.keys(candidate).sort().join(',') !== 'product,urgency') return fallback
  return candidate as OperationalReportView
}

export function filterOperationalReport(report: OperationalReport, view: OperationalReportView) {
  const safeView = restoreOperationalReportView(view, report.allowedProducts)
  return report.entries.filter((entry) => (
    (safeView.product === 'all' || entry.product === safeView.product)
    && (safeView.urgency === 'all'
      || safeView.urgency === 'critical' && entry.severity === 'critical'
      || safeView.urgency === 'attention' && entry.severity !== 'ready')
  ))
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function exportOperationalReport(report: OperationalReport, view: OperationalReportView) {
  const safeView = restoreOperationalReportView(view, report.allowedProducts)
  const payload = {
    contract: OPERATIONAL_REPORT_EXPORT_CONTRACT,
    reportContract: report.contract,
    observedAt: report.observedAt,
    mode: report.mode,
    allowedProducts: report.allowedProducts,
    sources: report.sources,
    view: safeView,
    entries: filterOperationalReport(report, safeView),
    controls: report.controls,
  }
  const digest = `sha256:${hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload))))}`
  return { ...payload, digest }
}
