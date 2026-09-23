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
import {
  buildSharedMasterDataRegistry,
  SHARED_MASTER_DATA_CONTRACT,
  type SharedMasterDataKind,
  type SharedMasterDataRegistry,
} from './shared-master-data.ts'

export const OPERATIONAL_REPORT_CONTRACT = 'supermega.operational_report.v2' as const
export const OPERATIONAL_REPORT_EXPORT_CONTRACT = 'supermega.operational_report_export.v2' as const
export const OPERATIONAL_REPORT_ACTION_PACKET_CONTRACT = 'supermega.operational_report_action_packet.v1' as const
export const SHARED_MASTER_DATA_REVIEW_PACKET_CONTRACT = 'supermega.shared_master_data_review_packet.v1' as const
export const SHARED_MASTER_DATA_DECISION_CONTRACT = 'supermega.shared_master_data_decision.v1' as const
export const SHARED_MASTER_DATA_DRY_RUN_CONTRACT = 'supermega.shared_master_data_dry_run.v1' as const
export const SHARED_MASTER_DATA_REHEARSAL_CONTRACT = 'supermega.shared_master_data_rehearsal.v1' as const
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

export type OperationalActionability = {
  workOrderRequired: boolean
  ownerReviewRequired: boolean
  ownerDueRequiredBeforeClosure: boolean
  evidenceRequiredBeforeClosure: boolean
  externalEffectAllowed: false
  managedWriteAllowed: false
}

export type OperationalReportEntry = {
  id: string
  product: OperationalProduct
  severity: OperationalSeverity
  label: string
  detail: string
  count: number
  route: string
  actionability: OperationalActionability
  sourceSurface: OperationalSurface
  sourceRevision: number | null
}

export type OperationalMasterDataDimension = {
  id: string
  product: OperationalProduct
  label: string
  recordCount: number
  status: 'ready' | 'attention' | 'unavailable'
  consumers: OperationalProduct[]
  sourceSurface: OperationalSurface
  sourceRevision: number | null
}

export type OperationalMasterData = {
  registryContract: typeof SHARED_MASTER_DATA_CONTRACT
  duplicateCandidates: number
  duplicateReview: SharedMasterDataRegistry['duplicateReview']
  dimensions: OperationalMasterDataDimension[]
  totalRecords: number
  attentionDimensions: number
  controls: {
    countsOnly: true
    customerValuesExcluded: true
    permissionFiltered: true
  }
}

export type OperationalReport = {
  contract: typeof OPERATIONAL_REPORT_CONTRACT
  observedAt: string
  mode: 'local' | 'managed'
  allowedProducts: OperationalProduct[]
  sources: OperationalSource[]
  entries: OperationalReportEntry[]
  masterData: OperationalMasterData
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

export type OperationalReportActionPacketInput = {
  ownerRole: string
  dueDate: string
  openedAt?: string
}

export type SharedMasterDataResolution = 'retain_separate_roles' | 'link_shared_party' | 'retain_separate_locations' | 'merge_in_owner'

export type SharedMasterDataDecisionInput = {
  decidedBy: string
  evidenceReference: string
  decisions: Array<{ candidateId: string; resolution: SharedMasterDataResolution }>
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

const masterDimensionIds: Record<OperationalProduct, readonly string[]> = {
  commerce: ['commerce.customers', 'commerce.suppliers', 'commerce.items', 'commerce.currency', 'commerce.tax_codes', 'commerce.account_codes', 'commerce.locations', 'commerce.trace_units'],
  production: ['production.units', 'production.documents'],
  website: ['website.documents'],
  ecommerce: ['ecommerce.documents'],
}

const masterConsumers: Record<string, readonly OperationalProduct[]> = {
  'commerce.customers': ['ecommerce'],
  'commerce.suppliers': ['production'],
  'commerce.items': ['production', 'website', 'ecommerce'],
  'commerce.currency': ['production', 'website', 'ecommerce'],
  'commerce.tax_codes': ['ecommerce'],
  'commerce.account_codes': ['production'],
  'commerce.locations': ['production', 'ecommerce'],
  'commerce.trace_units': ['production'],
  'production.units': ['commerce'],
  'production.documents': ['commerce'],
  'website.documents': ['ecommerce'],
  'ecommerce.documents': ['commerce'],
}

const masterDimensionLabels: Record<string, string> = {
  'commerce.customers': 'Customers',
  'commerce.suppliers': 'Suppliers',
  'commerce.items': 'Items',
  'commerce.currency': 'Currency',
  'commerce.tax_codes': 'Tax codes',
  'commerce.account_codes': 'Account codes',
  'commerce.locations': 'Locations',
  'commerce.trace_units': 'Lots and serials',
  'production.units': 'Units of measure',
  'production.documents': 'Plant documents',
  'website.documents': 'Website documents',
  'ecommerce.documents': 'Ecommerce documents',
}

const masterDimensionKinds: Record<string, readonly SharedMasterDataKind[]> = {
  'commerce.customers': ['customer'],
  'commerce.suppliers': ['supplier'],
  'commerce.items': ['item'],
  'commerce.currency': ['currency'],
  'commerce.tax_codes': ['tax'],
  'commerce.account_codes': ['account'],
  'commerce.locations': ['location'],
  'commerce.trace_units': ['lot', 'serial'],
  'production.units': ['unit'],
  'production.documents': ['document'],
  'website.documents': ['document'],
  'ecommerce.documents': ['document'],
}

const customerProductIds = ['shop', 'plant', 'website', 'ecommerce'] as const
const customerProductByOperationalProduct: Record<OperationalProduct, typeof customerProductIds[number]> = {
  commerce: 'shop',
  production: 'plant',
  website: 'website',
  ecommerce: 'ecommerce',
}
const actionSeverityByOperationalSeverity: Record<Exclude<OperationalSeverity, 'ready'>, 'critical' | 'high' | 'medium'> = {
  critical: 'critical',
  warning: 'high',
  action: 'medium',
}
const actionImpactByOperationalProduct: Record<OperationalProduct, 'quality' | 'revenue' | 'trust'> = {
  commerce: 'revenue',
  production: 'quality',
  website: 'trust',
  ecommerce: 'revenue',
}
const sensitiveTextPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]

function exactIso(value: string) {
  try { return new Date(value).toISOString() === value } catch { return false }
}

function exactDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

function safeLine(value: unknown, maximum: number, reason: string) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.length > maximum || normalized.normalize('NFC') !== normalized
    || Array.from(normalized).some((char) => {
      const code = char.codePointAt(0) || 0
      return code < 32 || code === 127
    })
    || sensitiveTextPatterns.some((pattern) => pattern.test(normalized))) {
    throw new Error(reason)
  }
  return normalized
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

function actionabilityFor(severity: OperationalSeverity): OperationalActionability {
  const workOrderRequired = severity !== 'ready'
  return {
    workOrderRequired,
    ownerReviewRequired: workOrderRequired,
    ownerDueRequiredBeforeClosure: workOrderRequired,
    evidenceRequiredBeforeClosure: workOrderRequired,
    externalEffectAllowed: false,
    managedWriteAllowed: false,
  }
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
  return { id, product, severity, label, detail, count, route, actionability: actionabilityFor(severity), sourceSurface: source.surface, sourceRevision: source.revision }
}

function masterDimension(
  allowedProducts: readonly OperationalProduct[],
  source: OperationalSource,
  product: OperationalProduct,
  id: string,
  label: string,
  recordCount: number,
  sourceAvailable: boolean,
): OperationalMasterDataDimension {
  if (!Number.isSafeInteger(recordCount) || recordCount < 0) throw new Error('Operational master-data count is invalid.')
  return {
    id,
    product,
    label,
    recordCount,
    status: !sourceAvailable ? 'unavailable' : recordCount ? 'ready' : 'attention',
    consumers: operationalProducts.filter((candidate) => allowedProducts.includes(candidate) && masterConsumers[id]?.includes(candidate)),
    sourceSurface: source.surface,
    sourceRevision: source.revision,
  }
}

function buildOperationalMasterData(registry: SharedMasterDataRegistry, sources: readonly OperationalSource[], allowedProducts: readonly OperationalProduct[]): OperationalMasterData {
  const bySurface = new Map(sources.map((source) => [source.surface, source]))
  const dimensions = allowedProducts.flatMap((product): OperationalMasterDataDimension[] => {
    const source = bySurface.get(productSurface[product]) as OperationalSource
    const sourceAvailable = source.mode !== 'error' && !(source.mode === 'managed' && source.revision === 0)
    return masterDimensionIds[product].map((id) => masterDimension(
      allowedProducts,
      source,
      product,
      id,
      masterDimensionLabels[id],
      sourceAvailable ? registry.records.filter((record) => record.ownerProduct === product && masterDimensionKinds[id].includes(record.kind)).length : 0,
      sourceAvailable,
    ))
  })
  return {
    registryContract: SHARED_MASTER_DATA_CONTRACT,
    duplicateCandidates: registry.duplicateReview.candidates.length,
    duplicateReview: structuredClone(registry.duplicateReview),
    dimensions,
    totalRecords: dimensions.reduce((total, dimension) => total + dimension.recordCount, 0),
    attentionDimensions: dimensions.filter((dimension) => dimension.status !== 'ready').length,
    controls: { countsOnly: true, customerValuesExcluded: true, permissionFiltered: true },
  }
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
  if (urgentIssues) entries.push(task(source, 'production', 'production.urgent_issues', 'critical', `Contain ${urgentIssues} urgent problem${urgentIssues === 1 ? '' : 's'}`, 'Resolve the highest-severity exception before release.', urgentIssues, '/plant/?tab=control'))
  if (heldJobs) entries.push(task(source, 'production', 'production.quality_holds', 'critical', `Review ${heldJobs} quality hold${heldJobs === 1 ? '' : 's'}`, 'Inspect, rework, or retain each hold with attributable evidence.', heldJobs, '/plant/?tab=control'))
  if (openMaintenance) entries.push(task(source, 'production', 'production.open_maintenance', 'warning', `Complete ${openMaintenance} maintenance record${openMaintenance === 1 ? '' : 's'}`, 'Record tested return to service before relying on the machine.', openMaintenance, '/plant/?tab=control'))
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
  const registry = buildSharedMasterDataRegistry({ allowedProducts, commerce: input.commerce, production: input.production, website: input.website })
  const masterData = buildOperationalMasterData(registry, sources, allowedProducts)
  return {
    contract: OPERATIONAL_REPORT_CONTRACT,
    observedAt,
    mode: input.mode,
    allowedProducts: [...allowedProducts],
    sources,
    entries,
    masterData,
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

function exactKeys(value: unknown, keys: readonly string[]) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value as Record<string, unknown>).sort()) === JSON.stringify([...keys].sort()))
}

const reviewAuthorityOrder = ['shop_inventory_command_chain', 'commerce_workspace', 'plant_workspace', 'website_workspace'] as const

function validateProjectedDuplicateReview(value: unknown, allowedProducts: readonly OperationalProduct[]) {
  if (!exactKeys(value, ['candidates', 'automaticMergeAllowed', 'mergePerformed', 'externalWritesPerformed'])) throw new Error('Operational report duplicate review is invalid.')
  const review = value as SharedMasterDataRegistry['duplicateReview']
  if (!Array.isArray(review.candidates) || review.candidates.length > 2_000
    || review.automaticMergeAllowed !== false || review.mergePerformed !== false || review.externalWritesPerformed !== false) {
    throw new Error('Operational report duplicate review is invalid.')
  }
  const usedRecordIds = new Set<string>()
  for (const [index, candidate] of review.candidates.entries()) {
    const recordOwners = candidate.recordIds?.map((id) => id.split(':')[0]) ?? []
    if (!exactKeys(candidate, ['id', 'kind', 'recordIds', 'ownerProducts', 'sourceAuthorities', 'reason', 'reviewRequired'])
      || candidate.id !== `DUP-${String(index + 1).padStart(3, '0')}` || !/^DUP-[0-9]{3,6}$/.test(candidate.id)
      || !['business_partner', 'location'].includes(candidate.kind) || candidate.reason !== 'normalized_identity_collision' || candidate.reviewRequired !== true
      || !Array.isArray(candidate.recordIds) || candidate.recordIds.length < 2 || candidate.recordIds.length > 400
      || JSON.stringify(candidate.recordIds) !== JSON.stringify([...candidate.recordIds].sort()) || new Set(candidate.recordIds).size !== candidate.recordIds.length
      || candidate.recordIds.some((id) => !/^(commerce|production|website|ecommerce):(customer|supplier|location):[A-Za-z0-9._~%+-]{1,240}$/.test(id) || usedRecordIds.has(id))
      || candidate.recordIds.some((id) => candidate.kind === 'business_partner' ? !/^commerce:(customer|supplier):/.test(id) : !/^commerce:location:/.test(id))
      || JSON.stringify(candidate.ownerProducts) !== JSON.stringify(operationalProducts.filter((product) => allowedProducts.includes(product) && recordOwners.includes(product)))
      || !Array.isArray(candidate.sourceAuthorities) || JSON.stringify(candidate.sourceAuthorities) !== JSON.stringify(reviewAuthorityOrder.filter((authority) => candidate.sourceAuthorities.includes(authority)))
      || candidate.sourceAuthorities.some((authority) => !reviewAuthorityOrder.includes(authority))) {
      throw new Error('Operational report duplicate candidate is invalid.')
    }
    candidate.recordIds.forEach((id) => usedRecordIds.add(id))
  }
  return review
}

function validateExportMasterData(value: unknown, allowedProducts: readonly OperationalProduct[], sources: readonly OperationalSource[]) {
  if (!exactKeys(value, ['registryContract', 'duplicateCandidates', 'duplicateReview', 'dimensions', 'totalRecords', 'attentionDimensions', 'controls'])) throw new Error('Operational report export master data is invalid.')
  const masterData = value as OperationalMasterData
  if (masterData.registryContract !== SHARED_MASTER_DATA_CONTRACT || !Number.isSafeInteger(masterData.duplicateCandidates) || masterData.duplicateCandidates < 0 || !Array.isArray(masterData.dimensions)
    || !exactKeys(masterData.controls, ['countsOnly', 'customerValuesExcluded', 'permissionFiltered'])
    || masterData.controls.countsOnly !== true || masterData.controls.customerValuesExcluded !== true || masterData.controls.permissionFiltered !== true) {
    throw new Error('Operational report export master data is invalid.')
  }
  const duplicateReview = validateProjectedDuplicateReview(masterData.duplicateReview, allowedProducts)
  if (masterData.duplicateCandidates !== duplicateReview.candidates.length) throw new Error('Operational report duplicate-review total is invalid.')
  const expectedIds = allowedProducts.flatMap((product) => masterDimensionIds[product])
  const bySurface = new Map(sources.map((source) => [source.surface, source]))
  for (const [index, dimension] of masterData.dimensions.entries()) {
    const source = bySurface.get(dimension.sourceSurface)
    const sourceAvailable = source?.mode !== 'error' && !(source?.mode === 'managed' && source.revision === 0)
    const expectedStatus = !sourceAvailable ? 'unavailable' : dimension.recordCount ? 'ready' : 'attention'
    if (!exactKeys(dimension, ['id', 'product', 'label', 'recordCount', 'status', 'consumers', 'sourceSurface', 'sourceRevision'])
      || dimension.id !== expectedIds[index] || !allowedProducts.includes(dimension.product)
      || dimension.sourceSurface !== productSurface[dimension.product]
      || dimension.sourceRevision !== source?.revision
      || dimension.label !== masterDimensionLabels[dimension.id]
      || !Number.isSafeInteger(dimension.recordCount) || dimension.recordCount < 0
      || dimension.status !== expectedStatus || !sourceAvailable && dimension.recordCount !== 0
      || !Array.isArray(dimension.consumers)
      || JSON.stringify(dimension.consumers) !== JSON.stringify(operationalProducts.filter((product) => allowedProducts.includes(product) && masterConsumers[dimension.id]?.includes(product)))) {
      throw new Error('Operational report export master-data dimension is invalid.')
    }
  }
  if (masterData.dimensions.length !== expectedIds.length
    || masterData.totalRecords !== masterData.dimensions.reduce((total, dimension) => total + dimension.recordCount, 0)
    || masterData.attentionDimensions !== masterData.dimensions.filter((dimension) => dimension.status !== 'ready').length) {
    throw new Error('Operational report export master-data totals are invalid.')
  }
  return masterData
}

async function digestPayload(value: unknown) {
  return `sha256:${hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))}`
}

function actionIdForEntry(entry: OperationalReportEntry) {
  const [, ...rest] = entry.id.split('.')
  return `operational-${[customerProductByOperationalProduct[entry.product], ...rest].join('-').replace(/[^a-z0-9]+/g, '-')}`
}

function buildActionEvidenceRef(report: OperationalReport, entry: OperationalReportEntry) {
  return `${OPERATIONAL_REPORT_CONTRACT}:${report.observedAt}:${customerProductByOperationalProduct[entry.product]}:${actionIdForEntry(entry)}`
}

function validateOperationalAction(value: unknown, packet: { openedAt: string, dueDate: string, ownerRole: string }) {
  if (!exactKeys(value, ['id', 'openedAt', 'productIds', 'sourceFinding', 'recommendation', 'severity', 'businessImpact', 'owner', 'dueDate', 'status', 'authority', 'acceptance', 'closure'])) {
    throw new Error('Operational report action is invalid.')
  }
  const action = value as {
    id: string
    openedAt: string
    productIds: string[]
    sourceFinding: { sourceType: string, label: string, evidenceRef: string, evidenceDigest: string }
    recommendation: string
    severity: string
    businessImpact: { kind: string, estimateLabel: string, measured: boolean }
    owner: { role: string, namedPrivate: boolean }
    dueDate: string
    status: string
    authority: { ownerApprovalRequired: boolean, externalWriteAllowed: boolean }
    acceptance: { evidenceRequired: string[], tests: string[] }
    closure: { closedAt: null, closureNote: null, measuredResult: null }
  }
  if (!/^operational-[a-z0-9][a-z0-9-]{2,96}$/.test(action.id)
    || action.openedAt !== packet.openedAt
    || action.dueDate !== packet.dueDate
    || !Array.isArray(action.productIds) || action.productIds.length !== 1 || !customerProductIds.includes(action.productIds[0] as typeof customerProductIds[number])
    || !['critical', 'high', 'medium'].includes(action.severity)
    || action.status !== 'owner-gated') throw new Error('Operational report action is invalid.')
  if (!exactKeys(action.sourceFinding, ['sourceType', 'label', 'evidenceRef', 'evidenceDigest'])
    || action.sourceFinding.sourceType !== 'runtime_metric'
    || !action.sourceFinding.evidenceRef.startsWith(`${OPERATIONAL_REPORT_CONTRACT}:`)
    || !/^sha256:[0-9a-f]{64}$/.test(action.sourceFinding.evidenceDigest)) throw new Error('Operational report action source is invalid.')
  safeLine(action.sourceFinding.label, 160, 'Operational report action source is invalid.')
  safeLine(action.sourceFinding.evidenceRef, 240, 'Operational report action source is invalid.')
  if (!exactKeys(action.businessImpact, ['kind', 'estimateLabel', 'measured'])
    || !['quality', 'revenue', 'trust'].includes(action.businessImpact.kind)
    || action.businessImpact.measured !== false) throw new Error('Operational report action impact is invalid.')
  safeLine(action.businessImpact.estimateLabel, 180, 'Operational report action impact is invalid.')
  if (!exactKeys(action.owner, ['role', 'namedPrivate'])
    || action.owner.role !== packet.ownerRole
    || action.owner.namedPrivate !== false) throw new Error('Operational report action owner is invalid.')
  if (!exactKeys(action.authority, ['ownerApprovalRequired', 'externalWriteAllowed'])
    || action.authority.ownerApprovalRequired !== true
    || action.authority.externalWriteAllowed !== false) throw new Error('Operational report action authority is invalid.')
  if (!exactKeys(action.acceptance, ['evidenceRequired', 'tests'])
    || !Array.isArray(action.acceptance.evidenceRequired) || action.acceptance.evidenceRequired.length < 2 || action.acceptance.evidenceRequired.length > 6
    || !Array.isArray(action.acceptance.tests) || action.acceptance.tests.length < 1 || action.acceptance.tests.length > 6) throw new Error('Operational report action acceptance is invalid.')
  action.acceptance.evidenceRequired.forEach((entry) => safeLine(entry, 160, 'Operational report action acceptance is invalid.'))
  action.acceptance.tests.forEach((entry) => safeLine(entry, 160, 'Operational report action acceptance is invalid.'))
  if (!exactKeys(action.closure, ['closedAt', 'closureNote', 'measuredResult'])
    || action.closure.closedAt !== null || action.closure.closureNote !== null || action.closure.measuredResult !== null) {
    throw new Error('Operational report action closure is invalid.')
  }
  return structuredClone(action)
}

export async function exportOperationalReportActionPacket(
  report: OperationalReport,
  view: OperationalReportView,
  input: OperationalReportActionPacketInput,
) {
  const safeView = restoreOperationalReportView(view, report.allowedProducts)
  const openedAt = input.openedAt === undefined ? report.observedAt : String(input.openedAt)
  const dueDate = String(input.dueDate || '').trim()
  const ownerRole = safeLine(input.ownerRole, 80, 'Operational report action owner is invalid.')
  if (!exactIso(openedAt)) throw new Error('Operational report action opened time is invalid.')
  if (!exactDate(dueDate)) throw new Error('Operational report action due date is invalid.')
  const sourceEntries = filterOperationalReport(report, safeView).filter((entry) => entry.actionability.workOrderRequired)
  const actions = await Promise.all(sourceEntries.map(async (entry) => {
    if (entry.severity === 'ready'
      || entry.actionability.ownerReviewRequired !== true
      || entry.actionability.ownerDueRequiredBeforeClosure !== true
      || entry.actionability.evidenceRequiredBeforeClosure !== true
      || entry.actionability.externalEffectAllowed !== false
      || entry.actionability.managedWriteAllowed !== false) {
      throw new Error('Operational report actionability cannot create a work order.')
    }
    const sourceFinding = {
      sourceType: 'runtime_metric' as const,
      label: entry.label,
      evidenceRef: buildActionEvidenceRef(report, entry),
      evidenceDigest: await digestPayload({
        reportContract: report.contract,
        observedAt: report.observedAt,
        entryId: entry.id,
        product: entry.product,
        severity: entry.severity,
        count: entry.count,
        route: entry.route,
        sourceSurface: entry.sourceSurface,
        sourceRevision: entry.sourceRevision,
      }),
    }
    return {
      id: actionIdForEntry(entry),
      openedAt,
      productIds: [customerProductByOperationalProduct[entry.product]],
      sourceFinding,
      recommendation: safeLine(`${entry.detail} Review ${entry.route} and record closure evidence before changing source data.`, 240, 'Operational report action recommendation is invalid.'),
      severity: actionSeverityByOperationalSeverity[entry.severity],
      businessImpact: {
        kind: actionImpactByOperationalProduct[entry.product],
        estimateLabel: `${customerProductByOperationalProduct[entry.product]} operating exception requires owner-reviewed closure.`,
        measured: false as const,
      },
      owner: {
        role: ownerRole,
        namedPrivate: false as const,
      },
      dueDate,
      status: 'owner-gated' as const,
      authority: {
        ownerApprovalRequired: true as const,
        externalWriteAllowed: false as const,
      },
      acceptance: {
        evidenceRequired: [
          'Owner-reviewed due date before closure',
          'Source-backed evidence reference before closure',
        ],
        tests: ['npm run app:verify'],
      },
      closure: {
        closedAt: null,
        closureNote: null,
        measuredResult: null,
      },
    }
  }))
  const payload = {
    contract: OPERATIONAL_REPORT_ACTION_PACKET_CONTRACT,
    reportContract: report.contract,
    observedAt: report.observedAt,
    mode: report.mode,
    view: safeView,
    openedAt,
    dueDate,
    ownerRole,
    actions,
    controls: {
      reviewOnly: true as const,
      operatingActionBoardReady: true as const,
      allActionsOwnerGated: true as const,
      externalWritesPerformed: false as const,
      managedWritesPerformed: false as const,
      privateIdentityExposed: false as const,
    },
  }
  return { ...payload, digest: await digestPayload(payload) }
}

export async function validateOperationalReportActionPacket(value: unknown) {
  if (!exactKeys(value, ['contract', 'reportContract', 'observedAt', 'mode', 'view', 'openedAt', 'dueDate', 'ownerRole', 'actions', 'controls', 'digest'])) {
    throw new Error('Operational report action packet is invalid.')
  }
  const packet = value as Awaited<ReturnType<typeof exportOperationalReportActionPacket>>
  if (packet.contract !== OPERATIONAL_REPORT_ACTION_PACKET_CONTRACT
    || packet.reportContract !== OPERATIONAL_REPORT_CONTRACT
    || !exactIso(packet.observedAt)
    || !['local', 'managed'].includes(packet.mode)
    || !exactIso(packet.openedAt)
    || !exactDate(packet.dueDate)
    || JSON.stringify(packet.view) !== JSON.stringify(restoreOperationalReportView(packet.view, operationalProducts))
    || !Array.isArray(packet.actions) || packet.actions.length > 2_000
    || !exactKeys(packet.controls, ['reviewOnly', 'operatingActionBoardReady', 'allActionsOwnerGated', 'externalWritesPerformed', 'managedWritesPerformed', 'privateIdentityExposed'])
    || packet.controls.reviewOnly !== true || packet.controls.operatingActionBoardReady !== true || packet.controls.allActionsOwnerGated !== true
    || packet.controls.externalWritesPerformed !== false || packet.controls.managedWritesPerformed !== false || packet.controls.privateIdentityExposed !== false) {
    throw new Error('Operational report action packet contract is invalid.')
  }
  const ownerRole = safeLine(packet.ownerRole, 80, 'Operational report action owner is invalid.')
  const seen = new Set<string>()
  for (const action of packet.actions) {
    const validated = validateOperationalAction(action, { openedAt: packet.openedAt, dueDate: packet.dueDate, ownerRole })
    if (seen.has(validated.id)) throw new Error('Operational report action id is duplicated.')
    seen.add(validated.id)
  }
  const { digest, ...payload } = packet
  if (!/^sha256:[0-9a-f]{64}$/.test(digest) || await digestPayload(payload) !== digest) throw new Error('Operational report action packet digest is invalid.')
  return structuredClone(packet)
}

export async function exportSharedMasterDataReviewPacket(report: OperationalReport) {
  const review = validateProjectedDuplicateReview(report.masterData.duplicateReview, report.allowedProducts)
  if (!review.candidates.length) throw new Error('No duplicate master-data review is required.')
  const payload = {
    contract: SHARED_MASTER_DATA_REVIEW_PACKET_CONTRACT,
    reportContract: report.contract,
    observedAt: report.observedAt,
    mode: report.mode,
    allowedProducts: report.allowedProducts,
    registryContract: report.masterData.registryContract,
    candidates: review.candidates.map((candidate) => ({
      ...structuredClone(candidate),
      allowedResolutions: candidate.kind === 'business_partner'
        ? ['retain_separate_roles', 'link_shared_party'] as const
        : ['retain_separate_locations', 'merge_in_owner'] as const,
    })),
    controls: {
      reviewOnly: true as const,
      humanDecisionRequired: true as const,
      automaticMergeAllowed: false as const,
      mergePerformed: false as const,
      sourceMutationPerformed: false as const,
      externalWritesPerformed: false as const,
    },
  }
  return { ...payload, digest: await digestPayload(payload) }
}

export async function validateSharedMasterDataReviewPacket(value: unknown) {
  if (!exactKeys(value, ['contract', 'reportContract', 'observedAt', 'mode', 'allowedProducts', 'registryContract', 'candidates', 'controls', 'digest'])) throw new Error('Shared master-data review packet is invalid.')
  const packet = value as Awaited<ReturnType<typeof exportSharedMasterDataReviewPacket>>
  if (packet.contract !== SHARED_MASTER_DATA_REVIEW_PACKET_CONTRACT || packet.reportContract !== OPERATIONAL_REPORT_CONTRACT
    || !exactIso(packet.observedAt) || !['local', 'managed'].includes(packet.mode)
    || !Array.isArray(packet.allowedProducts) || !packet.allowedProducts.length
    || JSON.stringify(packet.allowedProducts) !== JSON.stringify(canonicalProducts(packet.allowedProducts)) || new Set(packet.allowedProducts).size !== packet.allowedProducts.length
    || packet.registryContract !== SHARED_MASTER_DATA_CONTRACT || !Array.isArray(packet.candidates) || !packet.candidates.length
    || !exactKeys(packet.controls, ['reviewOnly', 'humanDecisionRequired', 'automaticMergeAllowed', 'mergePerformed', 'sourceMutationPerformed', 'externalWritesPerformed'])
    || packet.controls.reviewOnly !== true || packet.controls.humanDecisionRequired !== true || packet.controls.automaticMergeAllowed !== false
    || packet.controls.mergePerformed !== false || packet.controls.sourceMutationPerformed !== false || packet.controls.externalWritesPerformed !== false) {
    throw new Error('Shared master-data review packet contract is invalid.')
  }
  const projectedReview = {
    candidates: packet.candidates.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      recordIds: candidate.recordIds,
      ownerProducts: candidate.ownerProducts,
      sourceAuthorities: candidate.sourceAuthorities,
      reason: candidate.reason,
      reviewRequired: candidate.reviewRequired,
    })),
    automaticMergeAllowed: false as const,
    mergePerformed: false as const,
    externalWritesPerformed: false as const,
  }
  validateProjectedDuplicateReview(projectedReview, packet.allowedProducts)
  for (const candidate of packet.candidates) {
    const expected = candidate.kind === 'business_partner' ? ['retain_separate_roles', 'link_shared_party'] : ['retain_separate_locations', 'merge_in_owner']
    if (!exactKeys(candidate, ['id', 'kind', 'recordIds', 'ownerProducts', 'sourceAuthorities', 'reason', 'reviewRequired', 'allowedResolutions'])
      || JSON.stringify(candidate.allowedResolutions) !== JSON.stringify(expected)) throw new Error('Shared master-data review resolution is invalid.')
  }
  const { digest, ...payload } = packet
  if (!/^sha256:[0-9a-f]{64}$/.test(digest) || await digestPayload(payload) !== digest) throw new Error('Shared master-data review packet digest is invalid.')
  return structuredClone(packet)
}

function decisionText(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || value !== value.trim() || value.normalize('NFC') !== value || value.length < 2 || value.length > maximum
    || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error(`Shared master-data ${label} is invalid.`)
  }
  return value
}

function allowedResolutions(kind: 'business_partner' | 'location'): readonly SharedMasterDataResolution[] {
  return kind === 'business_partner' ? ['retain_separate_roles', 'link_shared_party'] : ['retain_separate_locations', 'merge_in_owner']
}

const invalidMasterDecision = 'Shared master-data decision is invalid.'
const invalidMasterDryRun = 'Shared master-data dry run is invalid.'
const invalidMasterRehearsal = 'Shared master-data rehearsal is invalid.'

export async function buildSharedMasterDataDecisionPacket(
  reviewValue: unknown,
  input: SharedMasterDataDecisionInput,
  decidedAt = new Date().toISOString(),
) {
  const reviewPacket = await validateSharedMasterDataReviewPacket(reviewValue)
  const decidedBy = decisionText(input.decidedBy, 'decision owner', 120)
  const evidenceReference = decisionText(input.evidenceReference, 'decision evidence', 240)
  if (!exactIso(decidedAt) || !Array.isArray(input.decisions) || input.decisions.length !== reviewPacket.candidates.length) {
    throw new Error(invalidMasterDecision)
  }
  const supplied = new Map<string, SharedMasterDataResolution>()
  for (const decision of input.decisions) {
    if (!exactKeys(decision, ['candidateId', 'resolution']) || typeof decision.candidateId !== 'string' || supplied.has(decision.candidateId)) {
      throw new Error(invalidMasterDecision)
    }
    supplied.set(decision.candidateId, decision.resolution)
  }
  const decisions = reviewPacket.candidates.map((candidate) => {
    const resolution = supplied.get(candidate.id)
    if (!resolution || !allowedResolutions(candidate.kind).includes(resolution)) throw new Error(invalidMasterDecision)
    return { candidateId: candidate.id, resolution }
  })
  const payload = {
    contract: SHARED_MASTER_DATA_DECISION_CONTRACT,
    decidedAt,
    decidedBy,
    evidenceReference,
    reviewPacket,
    decisions,
    controls: {
      complete: true as const,
      humanConfirmed: true as const,
      decisionOnly: true as const,
      automaticMergeAllowed: false as const,
      sourceMutationPerformed: false as const,
      externalWritesPerformed: false as const,
    },
  }
  return { ...payload, digest: await digestPayload(payload) }
}

export async function validateSharedMasterDataDecisionPacket(value: unknown) {
  if (!exactKeys(value, ['contract', 'decidedAt', 'decidedBy', 'evidenceReference', 'reviewPacket', 'decisions', 'controls', 'digest'])) throw new Error(invalidMasterDecision)
  const packet = value as Awaited<ReturnType<typeof buildSharedMasterDataDecisionPacket>>
  if (packet.contract !== SHARED_MASTER_DATA_DECISION_CONTRACT || !exactIso(packet.decidedAt)
    || !exactKeys(packet.controls, ['complete', 'humanConfirmed', 'decisionOnly', 'automaticMergeAllowed', 'sourceMutationPerformed', 'externalWritesPerformed'])
    || packet.controls.complete !== true || packet.controls.humanConfirmed !== true || packet.controls.decisionOnly !== true
    || packet.controls.automaticMergeAllowed !== false || packet.controls.sourceMutationPerformed !== false || packet.controls.externalWritesPerformed !== false
    || !Array.isArray(packet.decisions)) throw new Error(invalidMasterDecision)
  decisionText(packet.decidedBy, 'decision owner', 120)
  decisionText(packet.evidenceReference, 'decision evidence', 240)
  const reviewPacket = await validateSharedMasterDataReviewPacket(packet.reviewPacket)
  if (packet.decisions.length !== reviewPacket.candidates.length) throw new Error(invalidMasterDecision)
  for (const [index, decision] of packet.decisions.entries()) {
    const candidate = reviewPacket.candidates[index]
    if (!exactKeys(decision, ['candidateId', 'resolution']) || decision.candidateId !== candidate.id
      || !allowedResolutions(candidate.kind).includes(decision.resolution)) throw new Error(invalidMasterDecision)
  }
  const { digest, ...payload } = packet
  if (!/^sha256:[0-9a-f]{64}$/.test(digest) || await digestPayload(payload) !== digest) throw new Error(invalidMasterDecision)
  return structuredClone(packet)
}

function buildSharedMasterDataDryRunRoutes(decisionPacket: Awaited<ReturnType<typeof buildSharedMasterDataDecisionPacket>>) {
  return decisionPacket.decisions.map((decision, index) => {
    const candidate = decisionPacket.reviewPacket.candidates[index]
    if (candidate.ownerProducts.length !== 1 || candidate.sourceAuthorities.length !== 1) throw new Error('Shared master-data decision has no exclusive owner route.')
    const retain = decision.resolution === 'retain_separate_roles' || decision.resolution === 'retain_separate_locations'
    const merge = decision.resolution === 'merge_in_owner'
    return {
      candidateId: candidate.id,
      targetOwnerProduct: candidate.ownerProducts[0],
      targetSourceAuthority: candidate.sourceAuthorities[0],
      recordIds: [...candidate.recordIds],
      resolution: decision.resolution,
      proposedAction: retain ? 'retain_without_change' as const : merge ? 'merge_owner_records' as const : 'link_owner_records' as const,
      consequence: retain ? 'none' as const : merge ? 'destructive' as const : 'reversible' as const,
      requiredApprovals: retain
        ? ['master_data_owner'] as const
        : merge
          ? ['master_data_owner', 'source_system_owner', 'security_reviewer'] as const
          : ['master_data_owner', 'source_system_owner'] as const,
      executionAllowed: false as const,
    }
  })
}

export async function buildSharedMasterDataDryRunPlan(
  reviewValue: unknown,
  input: SharedMasterDataDecisionInput,
  decidedAt = new Date().toISOString(),
) {
  const decisionPacket = await buildSharedMasterDataDecisionPacket(reviewValue, input, decidedAt)
  const routes = buildSharedMasterDataDryRunRoutes(decisionPacket)
  const payload = {
    contract: SHARED_MASTER_DATA_DRY_RUN_CONTRACT,
    decisionPacket,
    routes,
    controls: {
      reviewOnly: true as const,
      recordValuesExcluded: true as const,
      sourceBackupRequiredBeforeExecution: routes.some((route) => route.consequence !== 'none'),
      executionAllowed: false as const,
      mutationsPerformed: false as const,
      externalWritesPerformed: false as const,
    },
  }
  return { ...payload, digest: await digestPayload(payload) }
}

export async function validateSharedMasterDataDryRunPlan(value: unknown) {
  if (!exactKeys(value, ['contract', 'decisionPacket', 'routes', 'controls', 'digest'])) throw new Error(invalidMasterDryRun)
  const plan = value as Awaited<ReturnType<typeof buildSharedMasterDataDryRunPlan>>
  if (plan.contract !== SHARED_MASTER_DATA_DRY_RUN_CONTRACT || !Array.isArray(plan.routes)
    || !exactKeys(plan.controls, ['reviewOnly', 'recordValuesExcluded', 'sourceBackupRequiredBeforeExecution', 'executionAllowed', 'mutationsPerformed', 'externalWritesPerformed'])
    || plan.controls.reviewOnly !== true || plan.controls.recordValuesExcluded !== true || plan.controls.executionAllowed !== false
    || plan.controls.mutationsPerformed !== false || plan.controls.externalWritesPerformed !== false) throw new Error(invalidMasterDryRun)
  const decisionPacket = await validateSharedMasterDataDecisionPacket(plan.decisionPacket)
  const expectedRoutes = buildSharedMasterDataDryRunRoutes(decisionPacket)
  if (JSON.stringify(plan.routes) !== JSON.stringify(expectedRoutes)
    || plan.controls.sourceBackupRequiredBeforeExecution !== expectedRoutes.some((route) => route.consequence !== 'none')) {
    throw new Error(invalidMasterDryRun)
  }
  const { digest, ...payload } = plan
  if (!/^sha256:[0-9a-f]{64}$/.test(digest) || await digestPayload(payload) !== digest) throw new Error(invalidMasterDryRun)
  return structuredClone(plan)
}

function rehearsalVerificationChecks(action: 'retain_without_change' | 'link_owner_records' | 'merge_owner_records') {
  if (action === 'retain_without_change') return ['records_remain_distinct', 'source_counts_unchanged', 'downstream_references_unchanged', 'audit_evidence_captured'] as const
  if (action === 'link_owner_records') return ['source_record_count_unchanged', 'shared_party_link_created', 'downstream_references_preserved', 'duplicate_detection_cleared', 'audit_evidence_captured'] as const
  return ['surviving_record_confirmed', 'retired_record_redirected', 'downstream_references_repointed', 'no_orphan_references', 'source_counts_reconciled', 'rollback_rehearsed', 'audit_evidence_captured'] as const
}

function buildSharedMasterDataRehearsalWorkOrders(dryRunPlan: Awaited<ReturnType<typeof buildSharedMasterDataDryRunPlan>>) {
  return dryRunPlan.routes.map((route, index) => ({
    id: `MDR-${String(index + 1).padStart(3, '0')}`,
    candidateId: route.candidateId,
    targetOwnerProduct: route.targetOwnerProduct,
    targetSourceAuthority: route.targetSourceAuthority,
    recordIds: route.recordIds,
    resolution: route.resolution,
    proposedAction: route.proposedAction,
    consequence: route.consequence,
    approvals: route.requiredApprovals.map((role) => ({ role, status: 'pending' as const })),
    preconditions: {
      isolatedCopyReady: false as const,
      backupEvidenceReference: null,
      rollbackOwner: null,
      rehearsalWindow: null,
    },
    verificationChecks: rehearsalVerificationChecks(route.proposedAction),
    separationOfDutiesRequired: route.consequence !== 'none',
    minimumDistinctApprovers: route.requiredApprovals.length,
    backupRequired: route.consequence !== 'none',
    rollbackRequired: route.consequence !== 'none',
    status: 'not_started' as const,
    sourceWriteAllowed: false as const,
  }))
}

export async function buildSharedMasterDataRehearsalPlan(dryRunValue: unknown) {
  const dryRunPlan = await validateSharedMasterDataDryRunPlan(dryRunValue)
  const workOrders = buildSharedMasterDataRehearsalWorkOrders(dryRunPlan)
  const payload = {
    contract: SHARED_MASTER_DATA_REHEARSAL_CONTRACT,
    dryRunPlan,
    workOrders,
    controls: {
      templateOnly: true as const,
      allApprovalsPending: true as const,
      isolatedRehearsalOnly: true as const,
      productionTargetAllowed: false as const,
      sourceWriteAllowed: false as const,
      executionPerformed: false as const,
      externalWritesPerformed: false as const,
    },
  }
  return { ...payload, digest: await digestPayload(payload) }
}

export async function validateSharedMasterDataRehearsalPlan(value: unknown) {
  if (!exactKeys(value, ['contract', 'dryRunPlan', 'workOrders', 'controls', 'digest'])) throw new Error(invalidMasterRehearsal)
  const plan = value as Awaited<ReturnType<typeof buildSharedMasterDataRehearsalPlan>>
  if (plan.contract !== SHARED_MASTER_DATA_REHEARSAL_CONTRACT || !Array.isArray(plan.workOrders)
    || !exactKeys(plan.controls, ['templateOnly', 'allApprovalsPending', 'isolatedRehearsalOnly', 'productionTargetAllowed', 'sourceWriteAllowed', 'executionPerformed', 'externalWritesPerformed'])
    || plan.controls.templateOnly !== true || plan.controls.allApprovalsPending !== true || plan.controls.isolatedRehearsalOnly !== true
    || plan.controls.productionTargetAllowed !== false || plan.controls.sourceWriteAllowed !== false
    || plan.controls.executionPerformed !== false || plan.controls.externalWritesPerformed !== false) {
    throw new Error(invalidMasterRehearsal)
  }
  const dryRunPlan = await validateSharedMasterDataDryRunPlan(plan.dryRunPlan)
  const expectedWorkOrders = buildSharedMasterDataRehearsalWorkOrders(dryRunPlan)
  if (JSON.stringify(plan.workOrders) !== JSON.stringify(expectedWorkOrders)) throw new Error(invalidMasterRehearsal)
  const { digest, ...payload } = plan
  if (!/^sha256:[0-9a-f]{64}$/.test(digest) || await digestPayload(payload) !== digest) throw new Error(invalidMasterRehearsal)
  return structuredClone(plan)
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
    masterData: report.masterData,
    controls: report.controls,
  }
  const digest = await digestPayload(payload)
  return { ...payload, digest }
}

export async function validateOperationalReportExport(value: unknown) {
  if (!exactKeys(value, ['contract', 'reportContract', 'observedAt', 'mode', 'allowedProducts', 'sources', 'view', 'entries', 'masterData', 'controls', 'digest'])) throw new Error('Operational report export is invalid.')
  const artifact = value as Awaited<ReturnType<typeof exportOperationalReport>>
  if (artifact.contract !== OPERATIONAL_REPORT_EXPORT_CONTRACT || artifact.reportContract !== OPERATIONAL_REPORT_CONTRACT
    || !exactIso(artifact.observedAt) || !['local', 'managed'].includes(artifact.mode)
    || !Array.isArray(artifact.allowedProducts) || JSON.stringify(artifact.allowedProducts) !== JSON.stringify(canonicalProducts(artifact.allowedProducts))
    || !artifact.allowedProducts.length || new Set(artifact.allowedProducts).size !== artifact.allowedProducts.length
    || !Array.isArray(artifact.sources) || !Array.isArray(artifact.entries)
    || JSON.stringify(artifact.view) !== JSON.stringify(restoreOperationalReportView(artifact.view, artifact.allowedProducts))
    || !exactKeys(artifact.controls, ['permissionFiltered', 'sourceBacked', 'readOnly', 'containsCustomerValues', 'externalWritesPerformed', 'safeToShareExternally'])
    || artifact.controls.permissionFiltered !== true || artifact.controls.sourceBacked !== true || artifact.controls.readOnly !== true
    || artifact.controls.containsCustomerValues !== false || artifact.controls.externalWritesPerformed !== false || artifact.controls.safeToShareExternally !== false) {
    throw new Error('Operational report export contract is invalid.')
  }
  const sources = validateSources(artifact.sources, artifact.allowedProducts)
  const bySurface = new Map(sources.map((source) => [source.surface, source]))
  for (const entry of artifact.entries) {
    const workOrderRequired = entry.severity !== 'ready'
    if (!exactKeys(entry, ['id', 'product', 'severity', 'label', 'detail', 'count', 'route', 'actionability', 'sourceSurface', 'sourceRevision'])
      || !artifact.allowedProducts.includes(entry.product) || entry.sourceSurface !== productSurface[entry.product]
      || entry.sourceRevision !== bySurface.get(entry.sourceSurface)?.revision
      || typeof entry.id !== 'string' || !/^[a-z]+[.][a-z_]+$/.test(entry.id)
      || !['critical', 'warning', 'action', 'ready'].includes(entry.severity)
      || typeof entry.label !== 'string' || !entry.label || entry.label.length > 160
      || typeof entry.detail !== 'string' || !entry.detail || entry.detail.length > 240
      || !Number.isSafeInteger(entry.count) || entry.count < 0
      || typeof entry.route !== 'string' || !entry.route.startsWith('/') || entry.route.startsWith('//')
      || !exactKeys(entry.actionability, ['workOrderRequired', 'ownerReviewRequired', 'ownerDueRequiredBeforeClosure', 'evidenceRequiredBeforeClosure', 'externalEffectAllowed', 'managedWriteAllowed'])
      || entry.actionability.workOrderRequired !== workOrderRequired
      || entry.actionability.ownerReviewRequired !== workOrderRequired
      || entry.actionability.ownerDueRequiredBeforeClosure !== workOrderRequired
      || entry.actionability.evidenceRequiredBeforeClosure !== workOrderRequired
      || entry.actionability.externalEffectAllowed !== false
      || entry.actionability.managedWriteAllowed !== false) {
      throw new Error('Operational report export entry is invalid.')
    }
  }
  validateExportMasterData(artifact.masterData, artifact.allowedProducts, sources)
  const { digest, ...payload } = artifact
  if (!/^sha256:[0-9a-f]{64}$/.test(digest) || await digestPayload(payload) !== digest) throw new Error('Operational report export digest is invalid.')
  return structuredClone(artifact)
}
