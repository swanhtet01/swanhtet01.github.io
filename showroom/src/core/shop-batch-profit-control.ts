export const SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256 = 'd2968009e5eb18c44420e2fbbe6b40072e59b9bac0cda1e9ff531a4cae7b5910'
export const SHOP_BATCH_PROFIT_CONTROL_CONTRACT = 'supermega.shop.batch_profit_control.v1'
export const SHOP_BATCH_PROFIT_CONTROL_MARGIN_FLOOR_BASIS_POINTS = 1_500
export const SHOP_BATCH_PROFIT_CONTROL_COST_HORIZON_DAYS = 180

const DISPOSITION_CONTRACT = 'supermega.shop.batch_profit_control.disposition_core.v1'
const SOURCE_RECORD_SET_CONTRACT = 'supermega.shop.batch_profit_control.source_record_set.v1'
const SALE_LEDGER_CONTRACT = 'supermega.shop.batch_profit_control.sale_allocation_ledger.v1'
const PRODUCTION_COST_CONTRACT = 'supermega.shop.batch_profit_control.production_cost_receipt.v1'
const OVERHEAD_CONTRACT = 'supermega.shop.batch_profit_control.overhead_receipt.v1'
const RETAINED_EVIDENCE_CONTRACT = 'supermega.shop.batch_profit_control.retained_evidence_receipt.v1'
const ENVELOPE_CONTRACT = 'supermega.shop.batch_profit_control.batch_envelope.v1'
const WORKSPACE_HISTORY_CONTRACT = 'supermega.shop.batch_profit_control.workspace_history_receipt.v1'
const COST_METHOD = 'owner_reviewed_standard_unit_cost_estimate'
const SYNTHETIC_CLASSIFICATION = 'synthetic_local_fixture_never_evidence'
const LOCAL_OPERATING_CLASSIFICATION = 'retained_non_sample_local_operating_evidence_not_pilot_customer_or_commercial_proof'
const DAY_MS = 24 * 60 * 60 * 1_000
const MAX_RECORD_COUNT = 100_000
const MAX_INDIVIDUAL_COUNT = 100_000
const MAX_INDIVIDUAL_MMK = 1_000_000_000_000
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type BatchClassification = typeof SYNTHETIC_CLASSIFICATION | typeof LOCAL_OPERATING_CLASSIFICATION
type BatchStatus = 'draft' | 'ready_for_review' | 'closed' | 'voided'
type RevisionReasonCode = 'initial' | 'source_correction' | 'adjustment_correction' | 'owner_review_correction' | 'voided'
type EstimateReasonCode = 'current_recipe_or_process_review' | 'recent_batch_review' | 'owner_standard_cost' | 'other_reviewed_basis'
type OtherCostReason = 'none' | 'fuel' | 'market_fee' | 'temporary_labor' | 'other_reviewed'

export type ShopBatchDispositionItem = {
  sku: string
  itemName: string
  producedUnits: number
  leftoverUnits: number
  wastedUnits: number
  remakeUnits: number
  preorderUnits: number
}

export type ShopBatchDispositionCore = {
  contract: typeof DISPOSITION_CONTRACT
  batchId: string
  revision: number
  businessDate: string
  projectionAt: string
  status: BatchStatus
  classification: BatchClassification
  items: ShopBatchDispositionItem[]
}

export type ShopBatchSaleLine = {
  sku: string
  orderLineBindingDigest: string
  completionBindingDigest: string
  completedAt: string
  sourceBusinessDate: string
  netUnits: number
  netValueMmk: number
  nonSample: boolean
  paymentReconciled: boolean
  completionPresent: boolean
  returnCount: number
  refundCount: number
  correctionCount: number
  discountCount: number
  adjustmentBindingDigest: string
}

export type ShopBatchStandardUnitCostEstimateSource = {
  sku: string
  method: typeof COST_METHOD
  estimateBasisDigest: string
  recipeRevisionDigest: string | null
  productionRunBindingDigest: string
  ownerReviewedStandardUnitCostEstimateMmk: number
  reviewedByRole: 'Shop owner' | 'Accountable manager'
  estimateReasonCode: EstimateReasonCode
  standardOutputUnits: number
  batchProducedUnits: number
  reviewedAt: string
  effectiveFrom: string
  effectiveTo: string | null
  reviewStatus: 'accepted' | 'missing' | 'unreviewed' | 'stale'
  sourceState: 'accepted' | 'missing_estimate' | 'missing_estimate_basis' | 'unlinked_production_run' | 'partial_quantity_coverage' | 'ambiguous_estimate_basis' | 'ambiguous_cost_method' | 'stale'
}

export type ShopBatchOverheadSource = {
  batchId: string
  revision: number
  reviewedAt: string
  packagingCostMmk: number
  deliveryCostMmk: number
  otherReviewedBatchCostMmk: number
  otherReviewedBatchCostReason: OtherCostReason
  evidenceBindingDigest: string
  ownerReviewBindingDigest: string
}

export type ShopBatchSourceRecordSet = {
  contract: typeof SOURCE_RECORD_SET_CONTRACT
  projectionAt: string
  batchId: string
  revision: number
  saleLines: ShopBatchSaleLine[]
  standardUnitCostEstimateSources: ShopBatchStandardUnitCostEstimateSource[]
  overheadSource: ShopBatchOverheadSource
  generatedReceiptsExcluded: true
}

export type ShopBatchSaleAllocation = {
  allocationId: string
  batchId: string
  envelopeRevision: number
  supersedesAllocationId: string | null
  orderLineBindingDigest: string
  completionBindingDigest: string
  allocationMode: 'whole_net_line_only'
  assignmentReason: 'same_business_date' | 'preorder_for_batch' | 'pickup_extra_for_batch'
  completedAt: string
  sourceBusinessDate: string
  batchBusinessDate: string
  retainedNetUnits: number
  retainedNetValueMmk: number
  allocatedNetUnits: number
  allocatedNetValueMmk: number
  priorAllocatedUnits: number
  priorAllocatedValueMmk: number
  remainingUnitsBefore: number
  remainingValueBefore: number
  preorderBatchBindingDigest: string | null
}

type SaleLedgerControls = {
  sourceDerived: true
  partialAllocationAllowed: false
  crossBatchReuseAllowed: false
  automaticDateOrSkuInference: false
  customerIdentityExported: false
  customerWrite: false
  paymentWrite: false
  stockWrite: false
  hostedWrite: false
  sameBatchCorrectionReplacementAllowed: true
}

export type ShopBatchSaleAllocationLedger = {
  contract: typeof SALE_LEDGER_CONTRACT
  generatedAt: string
  projectionAt: string
  batchId: string
  revision: number
  dispositionCoreDigest: string
  sourceRecordSetDigest: string
  allocations: ShopBatchSaleAllocation[]
  controls: SaleLedgerControls
  ledgerDigest: string
}

export type ShopBatchProductionCostBinding = ShopBatchStandardUnitCostEstimateSource & {
  coveredProducedUnits: number
}

type ProductionCostControls = {
  sourceDerived: false
  finishedSkuPurchaseReceiptAloneAccepted: false
  quantityCoverageRequired: true
  supplierIdentityExported: false
  accountingWrite: false
  supplierWrite: false
  stockWrite: false
  hostedWrite: false
  ownerReviewedEstimateReceiptRequired: true
  manualProjectionUnitCostEntryAccepted: false
}

export type ShopBatchProductionCostReceipt = {
  contract: typeof PRODUCTION_COST_CONTRACT
  generatedAt: string
  projectionAt: string
  batchId: string
  revision: number
  businessDate: string
  dispositionCoreDigest: string
  sourceRecordSetDigest: string
  method: typeof COST_METHOD
  skuBindings: ShopBatchProductionCostBinding[]
  summary: {
    coveredSkuCount: number
    totalSkuCount: number
    coveredProducedUnits: number
    totalProducedUnits: number
    quantityCoverageComplete: boolean
    partialCoverageCount: number
    ambiguousMethodCount: number
  }
  controls: ProductionCostControls
  receiptDigest: string
}

type OverheadControls = {
  sourceDerived: true
  customerIdentityExported: false
  customerWrite: false
  paymentWrite: false
  stockWrite: false
  hostedWrite: false
}

export type ShopBatchOverheadReceipt = ShopBatchOverheadSource & {
  contract: typeof OVERHEAD_CONTRACT
  projectionAt: string
  dispositionCoreDigest: string
  sourceRecordSetDigest: string
  controls: OverheadControls
  receiptDigest: string
}

export type ShopBatchRetainedSaleBinding = ShopBatchSaleAllocation & {
  sku: string
  saleAllocationLedgerDigest: string
  completedUnits: number
  completedSaleValueMmk: number
  nonSample: boolean
  paymentReconciled: boolean
  completionPresent: boolean
  returnCount: number
  refundCount: number
  correctionCount: number
  discountCount: number
  adjustmentState: 'complete' | 'unresolved'
  adjustmentBindingDigest: string
}

type RetainedEvidenceControls = {
  sourceDerived: true
  manualEvidenceAssertionAccepted: false
  privateIdentityExported: false
  customerWrite: false
  paymentWrite: false
  stockWrite: false
  hostedWrite: false
}

export type ShopBatchRetainedEvidenceReceipt = {
  contract: typeof RETAINED_EVIDENCE_CONTRACT
  generatedAt: string
  projectionAt: string
  batchId: string
  revision: number
  businessDate: string
  dispositionCoreDigest: string
  sourceRecordSetDigest: string
  saleAllocationLedgerDigest: string
  productionCostReceiptDigest: string
  ownerReviewedOverheadReceiptDigest: string
  saleLineBindings: ShopBatchRetainedSaleBinding[]
  productionCostSummary: {
    method: typeof COST_METHOD
    productionCostReceiptDigest: string
    coveredSkuCount: number
    coveredProducedUnits: number
    totalProducedUnits: number
    quantityCoverageComplete: boolean
    ambiguousMethodCount: number
    partialCoverageCount: number
  }
  adjustmentSummary: {
    returnCount: number
    refundCount: number
    correctionCount: number
    discountCount: number
    unresolvedAdjustmentCount: number
    allAdjustmentsLinked: boolean
  }
  controls: RetainedEvidenceControls
  receiptDigest: string
}

export type ShopBatchEnvelope = {
  contract: typeof ENVELOPE_CONTRACT
  batchId: string
  revision: number
  priorEnvelopeDigest: string | null
  revisionReasonCode: RevisionReasonCode
  logicalStatus: BatchStatus
  businessDate: string
  projectionAt: string
  classification: BatchClassification
  dispositionCoreDigest: string
  sourceRecordSetDigest: string
  retainedEvidenceReceiptDigest: string
  ownerReviewedOverheadReceiptDigest: string
  envelopeDigest: string
}

type WorkspaceHistoryControls = {
  sourceDerived: true
  completeWorkspaceScan: true
  activeClosedVoidedIncluded: true
  manualHistoryAssertionAccepted: false
  omittedHistoryAllowed: false
  privateIdentityExported: false
  customerWrite: false
  paymentWrite: false
  stockWrite: false
  hostedWrite: false
}

export type ShopBatchWorkspaceHistoryReceipt = {
  contract: typeof WORKSPACE_HISTORY_CONTRACT
  generatedAt: string
  projectionAt: string
  candidateBatchId: string
  candidateRevision: number
  scope: 'all_active_closed_voided_batch_lineages'
  envelopeCount: number
  saleAllocationLedgerCount: number
  envelopes: ShopBatchEnvelope[]
  saleAllocationLedgers: ShopBatchSaleAllocationLedger[]
  controls: WorkspaceHistoryControls
  receiptDigest: string
}

export type ShopBatchProfitControlInput = {
  dispositionCore: ShopBatchDispositionCore
  sourceRecordSet: ShopBatchSourceRecordSet
  saleAllocationLedger: ShopBatchSaleAllocationLedger
  productionCostReceipt: ShopBatchProductionCostReceipt
  overheadReceipt: ShopBatchOverheadReceipt
  retainedEvidenceReceipt: ShopBatchRetainedEvidenceReceipt
  batchEnvelope: ShopBatchEnvelope
  workspaceHistoryReceipt: ShopBatchWorkspaceHistoryReceipt
  marginFloorBasisPoints?: number
}

export type ShopBatchProfitPriority = {
  sku: string
  itemState: 'zero_sale_produced' | 'critical_negative_margin' | 'attention_below_floor'
  severity: 'critical_zero_sale' | 'critical_negative_margin' | 'attention_below_floor'
  completedSaleValueMmk: number
  reviewedProductionCostEstimateMmk: number
  allocatedBatchOverheadMmk: number
  contributionEstimateMmk: number
  contributionEstimateBasisPoints: number | null
  marginRiskEstimateMmk: number
  operationalCostRiskEstimateMmk: number
  ownerRole: 'Shop owner'
  dueLabel: 'Before the next batch decision'
  actionLabel: 'Review price, cost estimate, and batch disposition'
  closureCondition: string
}

export type ShopBatchProfitControlState = 'no_batch' | 'collecting_batch_evidence' | 'review_adjustments' | 'batch_margin_at_risk' | 'batch_controlled'

export type ShopBatchProfitControlProjection = {
  contract: typeof SHOP_BATCH_PROFIT_CONTROL_CONTRACT
  contractSourceSha256: typeof SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256
  state: Exclude<ShopBatchProfitControlState, 'no_batch'>
  batchIdentity: {
    batchId: string
    revision: number
    priorEnvelopeDigest: string | null
    logicalStatus: BatchStatus
    businessDate: string
    projectionAt: string
    classification: BatchClassification
    dispositionCoreDigest: string
    sourceRecordSetDigest: string
    saleAllocationLedgerDigest: string
    productionCostReceiptDigest: string
    retainedEvidenceReceiptDigest: string
    ownerReviewedOverheadReceiptDigest: string
    batchEnvelopeDigest: string
  }
  evidenceStatus: {
    canonicalDigestsComplete: true
    immutableRevisionLineageComplete: true
    reconciliationComplete: boolean
    batchSaleAllocationComplete: true
    crossBatchReuseAbsent: true
    retainedSalesEvidenceComplete: boolean
    productionQuantityCostCoverageComplete: true
    costEstimateBasisUnambiguous: true
    overheadReviewComplete: true
    adjustmentLinkageComplete: true
    profitStatus: 'available' | 'withheld'
    withheldReasonCodes: string[]
  }
  totals: {
    producedUnits: number
    completedSaleUnits: number
    leftoverUnits: number
    wastedUnits: number
    remakeUnits: number
    preorderUnits: number
    totalCompletedSaleValueMmk: number
    totalReviewedProductionCostEstimateMmk: number
    totalBatchOverheadMmk: number
    totalBatchCostEstimateMmk: number
  }
  estimatePreview: null | {
    batchContributionEstimateMmk: number
    aggregateContributionEstimateBasisPoints: number
    estimatedBreakEvenSoldValueMmk: number
    remainingToEstimatedBreakEvenMmk: number
    observedAverageNetSalePerUnitMmk: number
    breakEvenEquivalentCompletedUnits: number
    estimatedMarginAtRiskMmk: number
    overheadAllocationMmkBySku: Record<string, number>
  }
  priorities: ShopBatchProfitPriority[]
  truthBoundary: {
    costLabel: 'Owner-reviewed production-cost estimate'
    classification: BatchClassification
    boundary: string
    mayCountAsBaseline: false
    mayCountAsPilotRun: false
    mayCountAsCustomerEvidence: false
    mayCountAsCommercialProof: false
  }
  authority: {
    paymentWrite: false
    stockWrite: false
    supplierWrite: false
    accountingWrite: false
    customerWrite: false
    hostedWrite: false
    providerWrite: false
    modelUsed: false
  }
}

export type ShopBatchProfitControlNoBatchProjection = {
  contract: typeof SHOP_BATCH_PROFIT_CONTROL_CONTRACT
  contractSourceSha256: typeof SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256
  state: 'no_batch'
  batchIdentity: null
  evidenceStatus: {
    canonicalDigestsComplete: false
    immutableRevisionLineageComplete: false
    reconciliationComplete: false
    batchSaleAllocationComplete: false
    crossBatchReuseAbsent: false
    retainedSalesEvidenceComplete: false
    productionQuantityCostCoverageComplete: false
    costEstimateBasisUnambiguous: false
    overheadReviewComplete: false
    adjustmentLinkageComplete: false
    profitStatus: 'withheld'
    withheldReasonCodes: ['no_batch']
  }
  totals: null
  estimatePreview: null
  priorities: []
  truthBoundary: {
    costLabel: 'Owner-reviewed production-cost estimate'
    classification: null
    boundary: string
    mayCountAsBaseline: false
    mayCountAsPilotRun: false
    mayCountAsCustomerEvidence: false
    mayCountAsCommercialProof: false
  }
  authority: {
    paymentWrite: false
    stockWrite: false
    supplierWrite: false
    accountingWrite: false
    customerWrite: false
    hostedWrite: false
    providerWrite: false
    modelUsed: false
  }
}

type JsonObject = Record<string, unknown>

function fail(code: string): never {
  throw new Error(code)
}

function asObject(value: unknown, code: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(code)
  return value as JsonObject
}

function exactKeys(value: unknown, expected: readonly string[], code: string) {
  const keys = Object.keys(asObject(value, code)).sort()
  const wanted = [...expected].sort()
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) fail(code)
}

function exactValue<T>(value: unknown, expected: T, code: string): T {
  if (value !== expected) fail(code)
  return expected
}

function safeString(value: unknown, code: string, maximum = 160) {
  if (
    typeof value !== 'string' ||
    value !== value.normalize('NFC') ||
    value.length < 1 ||
    value.length > maximum ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 0x1f || codePoint === 0x7f
    })
  ) fail(code)
  return value
}

function safeId(value: unknown, code: string) {
  const id = safeString(value, code, 80)
  if (!SAFE_ID_PATTERN.test(id)) fail(code)
  return id
}

function safeDigest(value: unknown, code: string) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) fail(code)
  return value
}

function safeWhole(value: unknown, code: string, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) fail(code)
  return Number(value)
}

function safeBoolean(value: unknown, code: string) {
  if (typeof value !== 'boolean') fail(code)
  return value
}

function safeArray(value: unknown, code: string) {
  if (!Array.isArray(value) || value.length > MAX_RECORD_COUNT) fail(code)
  return value
}

function safeTimestamp(value: unknown, projectionAtMs: number | null, code: string) {
  const timestamp = safeString(value, code, 40)
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().replace('.000Z', 'Z') !== timestamp.replace('.000Z', 'Z')) fail(code)
  if (projectionAtMs !== null && parsed > projectionAtMs) fail(code)
  return parsed
}

function safeDate(value: unknown, code: string) {
  const date = safeString(value, code, 10)
  const parsed = Date.parse(`${date}T00:00:00Z`)
  if (!DATE_PATTERN.test(date) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) fail(code)
  return date
}

function yangonDate(timestampMs: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestampMs))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function exactOrder<T>(rows: readonly T[], key: (row: T) => string, code: string) {
  let prior: string | null = null
  for (const row of rows) {
    const current = key(row)
    if (prior !== null && prior >= current) fail(code)
    prior = current
  }
}

function validateFalseControls(value: unknown, expected: Record<string, boolean>, code: string) {
  exactKeys(value, Object.keys(expected), code)
  const controls = asObject(value, code)
  for (const [key, expectedValue] of Object.entries(expected)) exactValue(controls[key], expectedValue, code)
}

function normalizeCanonical(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.normalize('NFC')
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('shop_batch_profit_canonical_number_invalid')
    return value
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeCanonical(entry, seen))
  const source = asObject(value, 'shop_batch_profit_canonical_object_invalid')
  if (seen.has(source)) fail('shop_batch_profit_canonical_cycle')
  seen.add(source)
  const normalized: JsonObject = {}
  const keys = Object.keys(source).map((key) => key.normalize('NFC')).sort()
  if (new Set(keys).size !== keys.length) fail('shop_batch_profit_canonical_key_collision')
  for (const key of keys) {
    const sourceKey = Object.keys(source).find((candidate) => candidate.normalize('NFC') === key)
    if (!sourceKey || source[sourceKey] === undefined) fail('shop_batch_profit_canonical_value_invalid')
    normalized[key] = normalizeCanonical(source[sourceKey], seen)
  }
  seen.delete(source)
  return normalized
}

async function canonicalDigest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeCanonical(value)))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function withoutField(value: unknown, field: string) {
  const source = asObject(value, 'shop_batch_profit_digest_body_invalid')
  const body: JsonObject = {}
  for (const [key, entry] of Object.entries(source)) if (key !== field) body[key] = entry
  return body
}

function assertSharedBinding(value: { batchId: string; revision: number; projectionAt: string }, core: ShopBatchDispositionCore, code: string) {
  if (value.batchId !== core.batchId || value.revision !== core.revision || value.projectionAt !== core.projectionAt) fail(code)
}

function validateDisposition(core: ShopBatchDispositionCore) {
  exactKeys(core, ['contract', 'batchId', 'revision', 'businessDate', 'projectionAt', 'status', 'classification', 'items'], 'shop_batch_profit_disposition_shape_invalid')
  exactValue(core.contract, DISPOSITION_CONTRACT, 'shop_batch_profit_disposition_contract_invalid')
  safeId(core.batchId, 'shop_batch_profit_batch_id_invalid')
  safeWhole(core.revision, 'shop_batch_profit_revision_invalid', MAX_INDIVIDUAL_COUNT)
  if (core.revision < 1) fail('shop_batch_profit_revision_invalid')
  const projectionAtMs = safeTimestamp(core.projectionAt, null, 'shop_batch_profit_projection_time_invalid')
  safeDate(core.businessDate, 'shop_batch_profit_business_date_invalid')
  if (core.businessDate > yangonDate(projectionAtMs)) fail('shop_batch_profit_business_date_future')
  if (!['draft', 'ready_for_review', 'closed', 'voided'].includes(core.status)) fail('shop_batch_profit_status_invalid')
  if (![SYNTHETIC_CLASSIFICATION, LOCAL_OPERATING_CLASSIFICATION].includes(core.classification)) fail('shop_batch_profit_classification_invalid')
  const items = safeArray(core.items, 'shop_batch_profit_items_invalid') as ShopBatchDispositionItem[]
  if (!items.length) fail('shop_batch_profit_items_invalid')
  for (const item of items) {
    exactKeys(item, ['sku', 'itemName', 'producedUnits', 'leftoverUnits', 'wastedUnits', 'remakeUnits', 'preorderUnits'], 'shop_batch_profit_item_shape_invalid')
    safeId(item.sku, 'shop_batch_profit_sku_invalid')
    const itemName = safeString(item.itemName, 'shop_batch_profit_item_name_invalid', 120)
    if (/@|https?:|\\/iu.test(itemName)) fail('shop_batch_profit_item_name_private_shape')
    safeWhole(item.producedUnits, 'shop_batch_profit_produced_units_invalid', MAX_INDIVIDUAL_COUNT)
    safeWhole(item.leftoverUnits, 'shop_batch_profit_leftover_units_invalid', MAX_INDIVIDUAL_COUNT)
    safeWhole(item.wastedUnits, 'shop_batch_profit_wasted_units_invalid', MAX_INDIVIDUAL_COUNT)
    safeWhole(item.remakeUnits, 'shop_batch_profit_remake_units_invalid', MAX_INDIVIDUAL_COUNT)
    safeWhole(item.preorderUnits, 'shop_batch_profit_preorder_units_invalid', MAX_INDIVIDUAL_COUNT)
    if (item.remakeUnits > item.producedUnits) fail('shop_batch_profit_remake_exceeds_produced')
  }
  exactOrder(items, (item) => item.sku, 'shop_batch_profit_item_order_invalid')
  return projectionAtMs
}

function validateSaleLine(line: ShopBatchSaleLine, projectionAtMs: number) {
  exactKeys(line, ['sku', 'orderLineBindingDigest', 'completionBindingDigest', 'completedAt', 'sourceBusinessDate', 'netUnits', 'netValueMmk', 'nonSample', 'paymentReconciled', 'completionPresent', 'returnCount', 'refundCount', 'correctionCount', 'discountCount', 'adjustmentBindingDigest'], 'shop_batch_profit_sale_line_shape_invalid')
  safeId(line.sku, 'shop_batch_profit_sale_sku_invalid')
  safeDigest(line.orderLineBindingDigest, 'shop_batch_profit_sale_binding_invalid')
  safeDigest(line.completionBindingDigest, 'shop_batch_profit_completion_binding_invalid')
  safeTimestamp(line.completedAt, projectionAtMs, 'shop_batch_profit_sale_time_invalid')
  safeDate(line.sourceBusinessDate, 'shop_batch_profit_sale_business_date_invalid')
  if (line.sourceBusinessDate > yangonDate(projectionAtMs)) fail('shop_batch_profit_sale_business_date_future')
  safeWhole(line.netUnits, 'shop_batch_profit_sale_units_invalid', MAX_INDIVIDUAL_COUNT)
  safeWhole(line.netValueMmk, 'shop_batch_profit_sale_value_invalid', MAX_INDIVIDUAL_MMK)
  if (line.netUnits === 0 && line.netValueMmk > 0) fail('shop_batch_profit_sale_quantity_value_invalid')
  safeBoolean(line.nonSample, 'shop_batch_profit_sale_classification_invalid')
  safeBoolean(line.paymentReconciled, 'shop_batch_profit_payment_evidence_invalid')
  safeBoolean(line.completionPresent, 'shop_batch_profit_completion_evidence_invalid')
  safeWhole(line.returnCount, 'shop_batch_profit_return_count_invalid', MAX_INDIVIDUAL_COUNT)
  safeWhole(line.refundCount, 'shop_batch_profit_refund_count_invalid', MAX_INDIVIDUAL_COUNT)
  safeWhole(line.correctionCount, 'shop_batch_profit_correction_count_invalid', MAX_INDIVIDUAL_COUNT)
  safeWhole(line.discountCount, 'shop_batch_profit_discount_count_invalid', MAX_INDIVIDUAL_COUNT)
  safeDigest(line.adjustmentBindingDigest, 'shop_batch_profit_adjustment_binding_invalid')
}

function validateCostSource(source: ShopBatchStandardUnitCostEstimateSource, core: ShopBatchDispositionCore, projectionAtMs: number) {
  exactKeys(source, ['sku', 'method', 'estimateBasisDigest', 'recipeRevisionDigest', 'productionRunBindingDigest', 'ownerReviewedStandardUnitCostEstimateMmk', 'reviewedByRole', 'estimateReasonCode', 'standardOutputUnits', 'batchProducedUnits', 'reviewedAt', 'effectiveFrom', 'effectiveTo', 'reviewStatus', 'sourceState'], 'shop_batch_profit_cost_source_shape_invalid')
  safeId(source.sku, 'shop_batch_profit_cost_sku_invalid')
  exactValue(source.method, COST_METHOD, 'shop_batch_profit_cost_method_invalid')
  safeDigest(source.estimateBasisDigest, 'shop_batch_profit_estimate_basis_invalid')
  if (source.recipeRevisionDigest !== null) safeDigest(source.recipeRevisionDigest, 'shop_batch_profit_recipe_revision_invalid')
  safeDigest(source.productionRunBindingDigest, 'shop_batch_profit_production_run_binding_invalid')
  safeWhole(source.ownerReviewedStandardUnitCostEstimateMmk, 'shop_batch_profit_unit_cost_estimate_invalid', MAX_INDIVIDUAL_MMK)
  if (!['Shop owner', 'Accountable manager'].includes(source.reviewedByRole)) fail('shop_batch_profit_cost_reviewer_role_invalid')
  if (!['current_recipe_or_process_review', 'recent_batch_review', 'owner_standard_cost', 'other_reviewed_basis'].includes(source.estimateReasonCode)) fail('shop_batch_profit_cost_reason_invalid')
  safeWhole(source.standardOutputUnits, 'shop_batch_profit_standard_output_invalid', MAX_INDIVIDUAL_COUNT)
  safeWhole(source.batchProducedUnits, 'shop_batch_profit_cost_batch_units_invalid', MAX_INDIVIDUAL_COUNT)
  const reviewedAtMs = safeTimestamp(source.reviewedAt, projectionAtMs, 'shop_batch_profit_cost_review_time_invalid')
  if (Math.floor((projectionAtMs - reviewedAtMs) / DAY_MS) > SHOP_BATCH_PROFIT_CONTROL_COST_HORIZON_DAYS) fail('shop_batch_profit_cost_estimate_stale')
  safeDate(source.effectiveFrom, 'shop_batch_profit_cost_effective_from_invalid')
  if (source.effectiveFrom > core.businessDate) fail('shop_batch_profit_cost_not_effective')
  if (source.effectiveTo !== null) {
    safeDate(source.effectiveTo, 'shop_batch_profit_cost_effective_to_invalid')
    if (source.effectiveTo < core.businessDate || source.effectiveTo < source.effectiveFrom) fail('shop_batch_profit_cost_not_effective')
  }
  exactValue(source.reviewStatus, 'accepted', 'shop_batch_profit_cost_review_not_accepted')
  exactValue(source.sourceState, 'accepted', 'shop_batch_profit_cost_source_not_accepted')
}

function validateOverheadValues(value: ShopBatchOverheadSource, core: ShopBatchDispositionCore, projectionAtMs: number) {
  exactKeys(value, ['batchId', 'revision', 'reviewedAt', 'packagingCostMmk', 'deliveryCostMmk', 'otherReviewedBatchCostMmk', 'otherReviewedBatchCostReason', 'evidenceBindingDigest', 'ownerReviewBindingDigest'], 'shop_batch_profit_overhead_source_shape_invalid')
  if (value.batchId !== core.batchId || value.revision !== core.revision) fail('shop_batch_profit_overhead_source_binding_invalid')
  safeTimestamp(value.reviewedAt, projectionAtMs, 'shop_batch_profit_overhead_review_time_invalid')
  safeWhole(value.packagingCostMmk, 'shop_batch_profit_packaging_cost_invalid', MAX_INDIVIDUAL_MMK)
  safeWhole(value.deliveryCostMmk, 'shop_batch_profit_delivery_cost_invalid', MAX_INDIVIDUAL_MMK)
  safeWhole(value.otherReviewedBatchCostMmk, 'shop_batch_profit_other_cost_invalid', MAX_INDIVIDUAL_MMK)
  if (!['none', 'fuel', 'market_fee', 'temporary_labor', 'other_reviewed'].includes(value.otherReviewedBatchCostReason)) fail('shop_batch_profit_other_cost_reason_invalid')
  if ((value.otherReviewedBatchCostMmk === 0) !== (value.otherReviewedBatchCostReason === 'none')) fail('shop_batch_profit_other_cost_reason_mismatch')
  safeDigest(value.evidenceBindingDigest, 'shop_batch_profit_overhead_evidence_binding_invalid')
  safeDigest(value.ownerReviewBindingDigest, 'shop_batch_profit_overhead_review_binding_invalid')
}

function validateSourceRecordSet(source: ShopBatchSourceRecordSet, core: ShopBatchDispositionCore, projectionAtMs: number) {
  exactKeys(source, ['contract', 'projectionAt', 'batchId', 'revision', 'saleLines', 'standardUnitCostEstimateSources', 'overheadSource', 'generatedReceiptsExcluded'], 'shop_batch_profit_source_shape_invalid')
  exactValue(source.contract, SOURCE_RECORD_SET_CONTRACT, 'shop_batch_profit_source_contract_invalid')
  assertSharedBinding(source, core, 'shop_batch_profit_source_binding_invalid')
  exactValue(source.generatedReceiptsExcluded, true, 'shop_batch_profit_generated_receipt_exclusion_missing')
  const saleLines = safeArray(source.saleLines, 'shop_batch_profit_sale_lines_invalid') as ShopBatchSaleLine[]
  for (const line of saleLines) validateSaleLine(line, projectionAtMs)
  exactOrder(saleLines, (line) => line.orderLineBindingDigest, 'shop_batch_profit_sale_line_order_invalid')
  const classificationMatches = core.classification === SYNTHETIC_CLASSIFICATION
    ? saleLines.every((line) => line.nonSample === false)
    : saleLines.every((line) => line.nonSample === true)
  if (!classificationMatches) fail('shop_batch_profit_classification_source_mismatch')
  const costs = safeArray(source.standardUnitCostEstimateSources, 'shop_batch_profit_cost_sources_invalid') as ShopBatchStandardUnitCostEstimateSource[]
  const costSkus = new Set<string>()
  for (const cost of costs) validateCostSource(cost, core, projectionAtMs)
  for (const cost of costs) {
    if (costSkus.has(cost.sku)) fail('shop_batch_profit_cost_source_ambiguous')
    costSkus.add(cost.sku)
  }
  const dispositionSkus = new Set(core.items.map((item) => item.sku))
  if (costSkus.size !== dispositionSkus.size || [...costSkus].some((sku) => !dispositionSkus.has(sku))) fail('shop_batch_profit_cost_source_coverage_invalid')
  exactOrder(costs, (cost) => `${cost.sku}\u0000${cost.effectiveFrom}\u0000${cost.estimateBasisDigest}`, 'shop_batch_profit_cost_source_order_invalid')
  validateOverheadValues(source.overheadSource, core, projectionAtMs)
}

function validateLedgerControls(controls: SaleLedgerControls) {
  validateFalseControls(controls, {
    sourceDerived: true,
    partialAllocationAllowed: false,
    crossBatchReuseAllowed: false,
    automaticDateOrSkuInference: false,
    customerIdentityExported: false,
    customerWrite: false,
    paymentWrite: false,
    stockWrite: false,
    hostedWrite: false,
    sameBatchCorrectionReplacementAllowed: true,
  }, 'shop_batch_profit_sale_ledger_controls_invalid')
}

type ShopBatchAllocationBinding = Pick<ShopBatchDispositionCore, 'batchId' | 'revision' | 'businessDate'>

function validateAllocationShape(allocation: ShopBatchSaleAllocation, core: ShopBatchAllocationBinding, projectionAtMs: number) {
  exactKeys(allocation, ['allocationId', 'batchId', 'envelopeRevision', 'supersedesAllocationId', 'orderLineBindingDigest', 'completionBindingDigest', 'allocationMode', 'assignmentReason', 'completedAt', 'sourceBusinessDate', 'batchBusinessDate', 'retainedNetUnits', 'retainedNetValueMmk', 'allocatedNetUnits', 'allocatedNetValueMmk', 'priorAllocatedUnits', 'priorAllocatedValueMmk', 'remainingUnitsBefore', 'remainingValueBefore', 'preorderBatchBindingDigest'], 'shop_batch_profit_allocation_shape_invalid')
  safeId(allocation.allocationId, 'shop_batch_profit_allocation_id_invalid')
  if (allocation.batchId !== core.batchId || allocation.envelopeRevision !== core.revision) fail('shop_batch_profit_allocation_batch_binding_invalid')
  if (allocation.supersedesAllocationId !== null) safeId(allocation.supersedesAllocationId, 'shop_batch_profit_superseded_allocation_invalid')
  safeDigest(allocation.orderLineBindingDigest, 'shop_batch_profit_allocation_line_binding_invalid')
  safeDigest(allocation.completionBindingDigest, 'shop_batch_profit_allocation_completion_binding_invalid')
  exactValue(allocation.allocationMode, 'whole_net_line_only', 'shop_batch_profit_partial_allocation_forbidden')
  if (!['same_business_date', 'preorder_for_batch', 'pickup_extra_for_batch'].includes(allocation.assignmentReason)) fail('shop_batch_profit_assignment_reason_invalid')
  safeTimestamp(allocation.completedAt, projectionAtMs, 'shop_batch_profit_allocation_time_invalid')
  safeDate(allocation.sourceBusinessDate, 'shop_batch_profit_allocation_source_date_invalid')
  safeDate(allocation.batchBusinessDate, 'shop_batch_profit_allocation_batch_date_invalid')
  if (allocation.batchBusinessDate !== core.businessDate) fail('shop_batch_profit_allocation_business_date_mismatch')
  for (const [label, value, maximum] of [
    ['retained_units', allocation.retainedNetUnits, MAX_INDIVIDUAL_COUNT],
    ['retained_value', allocation.retainedNetValueMmk, MAX_INDIVIDUAL_MMK],
    ['allocated_units', allocation.allocatedNetUnits, MAX_INDIVIDUAL_COUNT],
    ['allocated_value', allocation.allocatedNetValueMmk, MAX_INDIVIDUAL_MMK],
    ['prior_units', allocation.priorAllocatedUnits, MAX_INDIVIDUAL_COUNT],
    ['prior_value', allocation.priorAllocatedValueMmk, MAX_INDIVIDUAL_MMK],
    ['remaining_units', allocation.remainingUnitsBefore, MAX_INDIVIDUAL_COUNT],
    ['remaining_value', allocation.remainingValueBefore, MAX_INDIVIDUAL_MMK],
  ] as const) safeWhole(value, `shop_batch_profit_allocation_${label}_invalid`, maximum)
  if (allocation.allocatedNetUnits !== allocation.retainedNetUnits || allocation.allocatedNetValueMmk !== allocation.retainedNetValueMmk) fail('shop_batch_profit_partial_allocation_forbidden')
  const crossDate = allocation.sourceBusinessDate !== allocation.batchBusinessDate
  if (crossDate && (allocation.assignmentReason !== 'preorder_for_batch' || allocation.preorderBatchBindingDigest === null)) fail('shop_batch_profit_cross_date_preorder_binding_missing')
  if (!crossDate && allocation.assignmentReason !== 'preorder_for_batch' && allocation.preorderBatchBindingDigest !== null) fail('shop_batch_profit_preorder_binding_unexpected')
  if (allocation.preorderBatchBindingDigest !== null) safeDigest(allocation.preorderBatchBindingDigest, 'shop_batch_profit_preorder_binding_invalid')
}

function findImmediatelyPriorAllocation(allocationsByLine: ReadonlyMap<string, readonly ShopBatchSaleAllocation[]>, allocation: ShopBatchSaleAllocation) {
  const matches = allocationsByLine.get(allocation.orderLineBindingDigest) ?? []
  if (matches.some((candidate) => candidate.batchId !== allocation.batchId)) fail('shop_batch_profit_cross_batch_sale_reuse')
  const sameBatch = matches.filter((candidate) => candidate.batchId === allocation.batchId)
  const duplicateIds = new Set<string>()
  for (const prior of sameBatch) {
    if (duplicateIds.has(prior.allocationId)) fail('shop_batch_profit_allocation_history_duplicate')
    duplicateIds.add(prior.allocationId)
    if (prior.envelopeRevision >= allocation.envelopeRevision) fail('shop_batch_profit_allocation_history_future')
  }
  const immediatelyPrior = sameBatch.find((candidate) => candidate.envelopeRevision === allocation.envelopeRevision - 1) ?? null
  if (sameBatch.some((candidate) => candidate.envelopeRevision > allocation.envelopeRevision - 1)) fail('shop_batch_profit_allocation_history_gap')
  return { immediatelyPrior, hasSameBatchHistory: sameBatch.length > 0 }
}

function validateSaleAllocationLedger(
  input: ShopBatchProfitControlInput,
  projectionAtMs: number,
  history: { allocationIds: ReadonlySet<string>; allocationsByLine: ReadonlyMap<string, readonly ShopBatchSaleAllocation[]> },
) {
  const { saleAllocationLedger: ledger, dispositionCore: core, sourceRecordSet: source } = input
  exactKeys(ledger, ['contract', 'generatedAt', 'projectionAt', 'batchId', 'revision', 'dispositionCoreDigest', 'sourceRecordSetDigest', 'allocations', 'controls', 'ledgerDigest'], 'shop_batch_profit_ledger_shape_invalid')
  exactValue(ledger.contract, SALE_LEDGER_CONTRACT, 'shop_batch_profit_ledger_contract_invalid')
  assertSharedBinding(ledger, core, 'shop_batch_profit_ledger_binding_invalid')
  safeTimestamp(ledger.generatedAt, projectionAtMs, 'shop_batch_profit_ledger_generated_time_invalid')
  safeDigest(ledger.dispositionCoreDigest, 'shop_batch_profit_ledger_disposition_digest_invalid')
  safeDigest(ledger.sourceRecordSetDigest, 'shop_batch_profit_ledger_source_digest_invalid')
  safeDigest(ledger.ledgerDigest, 'shop_batch_profit_ledger_digest_invalid')
  validateLedgerControls(ledger.controls)
  const allocations = safeArray(ledger.allocations, 'shop_batch_profit_allocations_invalid') as ShopBatchSaleAllocation[]
  exactOrder(allocations, (allocation) => `${allocation.batchId}\u0000${String(allocation.envelopeRevision).padStart(6, '0')}\u0000${allocation.orderLineBindingDigest}`, 'shop_batch_profit_allocation_order_invalid')
  const lines = new Map(source.saleLines.map((line) => [line.orderLineBindingDigest, line]))
  const allocationIds = new Set(history.allocationIds)
  for (const allocation of allocations) {
    validateAllocationShape(allocation, core, projectionAtMs)
    if (allocationIds.has(allocation.allocationId)) fail('shop_batch_profit_allocation_id_reused')
    allocationIds.add(allocation.allocationId)
    const line = lines.get(allocation.orderLineBindingDigest)
    if (!line
      || line.completionBindingDigest !== allocation.completionBindingDigest
      || line.completedAt !== allocation.completedAt
      || line.sourceBusinessDate !== allocation.sourceBusinessDate
      || line.netUnits !== allocation.retainedNetUnits
      || line.netValueMmk !== allocation.retainedNetValueMmk) fail('shop_batch_profit_allocation_source_mismatch')
    const { immediatelyPrior: prior, hasSameBatchHistory } = findImmediatelyPriorAllocation(history.allocationsByLine, allocation)
    if (core.revision === 1 || (!hasSameBatchHistory && prior === null)) {
      if (allocation.supersedesAllocationId !== null || allocation.priorAllocatedUnits !== 0 || allocation.priorAllocatedValueMmk !== 0) fail('shop_batch_profit_allocation_initial_lineage_invalid')
    } else if (prior === null) {
      fail('shop_batch_profit_allocation_history_gap')
    } else if (allocation.supersedesAllocationId !== prior.allocationId
      || allocation.priorAllocatedUnits !== prior.allocatedNetUnits
      || allocation.priorAllocatedValueMmk !== prior.allocatedNetValueMmk) fail('shop_batch_profit_allocation_supersession_invalid')
    if (allocation.remainingUnitsBefore !== allocation.retainedNetUnits || allocation.remainingValueBefore !== allocation.retainedNetValueMmk) fail('shop_batch_profit_allocation_remaining_invalid')
  }
  if (allocations.length !== source.saleLines.length || source.saleLines.some((line) => !allocations.some((allocation) => allocation.orderLineBindingDigest === line.orderLineBindingDigest))) fail('shop_batch_profit_sale_allocation_incomplete')
}

function validateProductionControls(controls: ProductionCostControls) {
  validateFalseControls(controls, {
    sourceDerived: false,
    finishedSkuPurchaseReceiptAloneAccepted: false,
    quantityCoverageRequired: true,
    supplierIdentityExported: false,
    accountingWrite: false,
    supplierWrite: false,
    stockWrite: false,
    hostedWrite: false,
    ownerReviewedEstimateReceiptRequired: true,
    manualProjectionUnitCostEntryAccepted: false,
  }, 'shop_batch_profit_production_controls_invalid')
}

function validateProductionCostReceipt(input: ShopBatchProfitControlInput, projectionAtMs: number) {
  const { productionCostReceipt: receipt, dispositionCore: core, sourceRecordSet: source } = input
  exactKeys(receipt, ['contract', 'generatedAt', 'projectionAt', 'batchId', 'revision', 'businessDate', 'dispositionCoreDigest', 'sourceRecordSetDigest', 'method', 'skuBindings', 'summary', 'controls', 'receiptDigest'], 'shop_batch_profit_production_receipt_shape_invalid')
  exactValue(receipt.contract, PRODUCTION_COST_CONTRACT, 'shop_batch_profit_production_receipt_contract_invalid')
  assertSharedBinding(receipt, core, 'shop_batch_profit_production_receipt_binding_invalid')
  if (receipt.businessDate !== core.businessDate) fail('shop_batch_profit_production_business_date_invalid')
  safeTimestamp(receipt.generatedAt, projectionAtMs, 'shop_batch_profit_production_generated_time_invalid')
  exactValue(receipt.method, COST_METHOD, 'shop_batch_profit_production_method_invalid')
  safeDigest(receipt.dispositionCoreDigest, 'shop_batch_profit_production_disposition_digest_invalid')
  safeDigest(receipt.sourceRecordSetDigest, 'shop_batch_profit_production_source_digest_invalid')
  safeDigest(receipt.receiptDigest, 'shop_batch_profit_production_receipt_digest_invalid')
  validateProductionControls(receipt.controls)
  const bindings = safeArray(receipt.skuBindings, 'shop_batch_profit_production_bindings_invalid') as ShopBatchProductionCostBinding[]
  exactOrder(bindings, (binding) => binding.sku, 'shop_batch_profit_production_binding_order_invalid')
  const dispositions = new Map(core.items.map((item) => [item.sku, item]))
  const sources = new Map(source.standardUnitCostEstimateSources.map((item) => [item.sku, item]))
  let coveredUnits = 0
  for (const binding of bindings) {
    exactKeys(binding, ['sku', 'method', 'estimateBasisDigest', 'recipeRevisionDigest', 'productionRunBindingDigest', 'ownerReviewedStandardUnitCostEstimateMmk', 'reviewedByRole', 'estimateReasonCode', 'standardOutputUnits', 'batchProducedUnits', 'coveredProducedUnits', 'reviewedAt', 'effectiveFrom', 'effectiveTo', 'reviewStatus', 'sourceState'], 'shop_batch_profit_production_binding_shape_invalid')
    const comparable = { ...binding } as Record<string, unknown>
    delete comparable.coveredProducedUnits
    validateCostSource(comparable as ShopBatchStandardUnitCostEstimateSource, core, projectionAtMs)
    safeWhole(binding.coveredProducedUnits, 'shop_batch_profit_covered_produced_units_invalid', MAX_INDIVIDUAL_COUNT)
    const disposition = dispositions.get(binding.sku)
    const sourceBinding = sources.get(binding.sku)
    if (!disposition || !sourceBinding) fail('shop_batch_profit_cost_sku_unlinked')
    if (JSON.stringify(normalizeCanonical(comparable)) !== JSON.stringify(normalizeCanonical(sourceBinding))) fail('shop_batch_profit_cost_source_receipt_mismatch')
    if (binding.batchProducedUnits !== disposition.producedUnits || binding.coveredProducedUnits !== disposition.producedUnits) fail('shop_batch_profit_produced_quantity_cost_coverage_incomplete')
    coveredUnits += binding.coveredProducedUnits
  }
  const totalProduced = core.items.reduce((sum, item) => sum + item.producedUnits, 0)
  exactKeys(receipt.summary, ['coveredSkuCount', 'totalSkuCount', 'coveredProducedUnits', 'totalProducedUnits', 'quantityCoverageComplete', 'partialCoverageCount', 'ambiguousMethodCount'], 'shop_batch_profit_production_summary_shape_invalid')
  if (bindings.length !== core.items.length
    || receipt.summary.coveredSkuCount !== bindings.length
    || receipt.summary.totalSkuCount !== core.items.length
    || receipt.summary.coveredProducedUnits !== coveredUnits
    || receipt.summary.totalProducedUnits !== totalProduced
    || receipt.summary.quantityCoverageComplete !== true
    || receipt.summary.partialCoverageCount !== 0
    || receipt.summary.ambiguousMethodCount !== 0
    || coveredUnits !== totalProduced) fail('shop_batch_profit_production_summary_invalid')
}

function validateOverheadControls(controls: OverheadControls) {
  validateFalseControls(controls, {
    sourceDerived: true,
    customerIdentityExported: false,
    customerWrite: false,
    paymentWrite: false,
    stockWrite: false,
    hostedWrite: false,
  }, 'shop_batch_profit_overhead_controls_invalid')
}

function validateOverheadReceipt(input: ShopBatchProfitControlInput, projectionAtMs: number) {
  const { overheadReceipt: receipt, dispositionCore: core, sourceRecordSet: source } = input
  exactKeys(receipt, ['contract', 'batchId', 'revision', 'projectionAt', 'dispositionCoreDigest', 'sourceRecordSetDigest', 'reviewedAt', 'packagingCostMmk', 'deliveryCostMmk', 'otherReviewedBatchCostMmk', 'otherReviewedBatchCostReason', 'evidenceBindingDigest', 'ownerReviewBindingDigest', 'controls', 'receiptDigest'], 'shop_batch_profit_overhead_receipt_shape_invalid')
  exactValue(receipt.contract, OVERHEAD_CONTRACT, 'shop_batch_profit_overhead_contract_invalid')
  assertSharedBinding(receipt, core, 'shop_batch_profit_overhead_receipt_binding_invalid')
  validateOverheadValues({
    batchId: receipt.batchId,
    revision: receipt.revision,
    reviewedAt: receipt.reviewedAt,
    packagingCostMmk: receipt.packagingCostMmk,
    deliveryCostMmk: receipt.deliveryCostMmk,
    otherReviewedBatchCostMmk: receipt.otherReviewedBatchCostMmk,
    otherReviewedBatchCostReason: receipt.otherReviewedBatchCostReason,
    evidenceBindingDigest: receipt.evidenceBindingDigest,
    ownerReviewBindingDigest: receipt.ownerReviewBindingDigest,
  }, core, projectionAtMs)
  safeDigest(receipt.dispositionCoreDigest, 'shop_batch_profit_overhead_disposition_digest_invalid')
  safeDigest(receipt.sourceRecordSetDigest, 'shop_batch_profit_overhead_source_digest_invalid')
  safeDigest(receipt.receiptDigest, 'shop_batch_profit_overhead_receipt_digest_invalid')
  validateOverheadControls(receipt.controls)
  const comparable = {
    batchId: receipt.batchId,
    revision: receipt.revision,
    reviewedAt: receipt.reviewedAt,
    packagingCostMmk: receipt.packagingCostMmk,
    deliveryCostMmk: receipt.deliveryCostMmk,
    otherReviewedBatchCostMmk: receipt.otherReviewedBatchCostMmk,
    otherReviewedBatchCostReason: receipt.otherReviewedBatchCostReason,
    evidenceBindingDigest: receipt.evidenceBindingDigest,
    ownerReviewBindingDigest: receipt.ownerReviewBindingDigest,
  }
  if (JSON.stringify(normalizeCanonical(comparable)) !== JSON.stringify(normalizeCanonical(source.overheadSource))) fail('shop_batch_profit_overhead_source_receipt_mismatch')
}

function validateRetainedControls(controls: RetainedEvidenceControls) {
  validateFalseControls(controls, {
    sourceDerived: true,
    manualEvidenceAssertionAccepted: false,
    privateIdentityExported: false,
    customerWrite: false,
    paymentWrite: false,
    stockWrite: false,
    hostedWrite: false,
  }, 'shop_batch_profit_retained_controls_invalid')
}

function validateRetainedEvidenceReceipt(input: ShopBatchProfitControlInput, projectionAtMs: number) {
  const { retainedEvidenceReceipt: receipt, dispositionCore: core, sourceRecordSet: source, saleAllocationLedger: ledger, productionCostReceipt: production } = input
  exactKeys(receipt, ['contract', 'generatedAt', 'projectionAt', 'batchId', 'revision', 'businessDate', 'dispositionCoreDigest', 'sourceRecordSetDigest', 'saleAllocationLedgerDigest', 'productionCostReceiptDigest', 'ownerReviewedOverheadReceiptDigest', 'saleLineBindings', 'productionCostSummary', 'adjustmentSummary', 'controls', 'receiptDigest'], 'shop_batch_profit_retained_receipt_shape_invalid')
  exactValue(receipt.contract, RETAINED_EVIDENCE_CONTRACT, 'shop_batch_profit_retained_contract_invalid')
  assertSharedBinding(receipt, core, 'shop_batch_profit_retained_binding_invalid')
  if (receipt.businessDate !== core.businessDate) fail('shop_batch_profit_retained_business_date_invalid')
  safeTimestamp(receipt.generatedAt, projectionAtMs, 'shop_batch_profit_retained_generated_time_invalid')
  for (const [value, code] of [
    [receipt.dispositionCoreDigest, 'shop_batch_profit_retained_disposition_digest_invalid'],
    [receipt.sourceRecordSetDigest, 'shop_batch_profit_retained_source_digest_invalid'],
    [receipt.saleAllocationLedgerDigest, 'shop_batch_profit_retained_ledger_digest_invalid'],
    [receipt.productionCostReceiptDigest, 'shop_batch_profit_retained_production_digest_invalid'],
    [receipt.ownerReviewedOverheadReceiptDigest, 'shop_batch_profit_retained_overhead_digest_invalid'],
    [receipt.receiptDigest, 'shop_batch_profit_retained_receipt_digest_invalid'],
  ] as const) safeDigest(value, code)
  validateRetainedControls(receipt.controls)
  const bindings = safeArray(receipt.saleLineBindings, 'shop_batch_profit_retained_sale_bindings_invalid') as ShopBatchRetainedSaleBinding[]
  exactOrder(bindings, (binding) => binding.orderLineBindingDigest, 'shop_batch_profit_retained_sale_binding_order_invalid')
  const lines = new Map(source.saleLines.map((line) => [line.orderLineBindingDigest, line]))
  const allocations = new Map(ledger.allocations.map((allocation) => [allocation.orderLineBindingDigest, allocation]))
  const adjustmentTotals = { returnCount: 0, refundCount: 0, correctionCount: 0, discountCount: 0 }
  for (const binding of bindings) {
    exactKeys(binding, ['allocationId', 'batchId', 'envelopeRevision', 'supersedesAllocationId', 'orderLineBindingDigest', 'completionBindingDigest', 'allocationMode', 'assignmentReason', 'completedAt', 'sourceBusinessDate', 'batchBusinessDate', 'retainedNetUnits', 'retainedNetValueMmk', 'allocatedNetUnits', 'allocatedNetValueMmk', 'priorAllocatedUnits', 'priorAllocatedValueMmk', 'remainingUnitsBefore', 'remainingValueBefore', 'preorderBatchBindingDigest', 'sku', 'saleAllocationLedgerDigest', 'completedUnits', 'completedSaleValueMmk', 'nonSample', 'paymentReconciled', 'completionPresent', 'returnCount', 'refundCount', 'correctionCount', 'discountCount', 'adjustmentState', 'adjustmentBindingDigest'], 'shop_batch_profit_retained_sale_binding_shape_invalid')
    const line = lines.get(binding.orderLineBindingDigest)
    const allocation = allocations.get(binding.orderLineBindingDigest)
    if (!line || !allocation) fail('shop_batch_profit_retained_sale_unlinked')
    const allocationProjection = Object.fromEntries(Object.keys(allocation).map((key) => [key, binding[key as keyof ShopBatchRetainedSaleBinding]]))
    if (JSON.stringify(normalizeCanonical(allocationProjection)) !== JSON.stringify(normalizeCanonical(allocation))) fail('shop_batch_profit_retained_allocation_mismatch')
    if (binding.sku !== line.sku
      || binding.saleAllocationLedgerDigest !== ledger.ledgerDigest
      || binding.completedUnits !== line.netUnits
      || binding.completedSaleValueMmk !== line.netValueMmk
      || binding.nonSample !== line.nonSample
      || binding.paymentReconciled !== line.paymentReconciled
      || binding.completionPresent !== line.completionPresent
      || binding.returnCount !== line.returnCount
      || binding.refundCount !== line.refundCount
      || binding.correctionCount !== line.correctionCount
      || binding.discountCount !== line.discountCount
      || binding.adjustmentBindingDigest !== line.adjustmentBindingDigest
      || binding.adjustmentState !== 'complete') fail('shop_batch_profit_retained_sale_source_mismatch')
    adjustmentTotals.returnCount += binding.returnCount
    adjustmentTotals.refundCount += binding.refundCount
    adjustmentTotals.correctionCount += binding.correctionCount
    adjustmentTotals.discountCount += binding.discountCount
  }
  if (bindings.length !== source.saleLines.length) fail('shop_batch_profit_retained_sale_incomplete')
  exactKeys(receipt.productionCostSummary, ['method', 'productionCostReceiptDigest', 'coveredSkuCount', 'coveredProducedUnits', 'totalProducedUnits', 'quantityCoverageComplete', 'ambiguousMethodCount', 'partialCoverageCount'], 'shop_batch_profit_retained_production_summary_shape_invalid')
  if (receipt.productionCostSummary.method !== COST_METHOD
    || receipt.productionCostSummary.productionCostReceiptDigest !== production.receiptDigest
    || receipt.productionCostSummary.coveredSkuCount !== production.summary.coveredSkuCount
    || receipt.productionCostSummary.coveredProducedUnits !== production.summary.coveredProducedUnits
    || receipt.productionCostSummary.totalProducedUnits !== production.summary.totalProducedUnits
    || receipt.productionCostSummary.quantityCoverageComplete !== true
    || receipt.productionCostSummary.ambiguousMethodCount !== 0
    || receipt.productionCostSummary.partialCoverageCount !== 0) fail('shop_batch_profit_retained_production_summary_invalid')
  exactKeys(receipt.adjustmentSummary, ['returnCount', 'refundCount', 'correctionCount', 'discountCount', 'unresolvedAdjustmentCount', 'allAdjustmentsLinked'], 'shop_batch_profit_adjustment_summary_shape_invalid')
  if (receipt.adjustmentSummary.returnCount !== adjustmentTotals.returnCount
    || receipt.adjustmentSummary.refundCount !== adjustmentTotals.refundCount
    || receipt.adjustmentSummary.correctionCount !== adjustmentTotals.correctionCount
    || receipt.adjustmentSummary.discountCount !== adjustmentTotals.discountCount
    || receipt.adjustmentSummary.unresolvedAdjustmentCount !== 0
    || receipt.adjustmentSummary.allAdjustmentsLinked !== true) fail('shop_batch_profit_adjustment_linkage_incomplete')
}

async function validateEnvelopeDigest(envelope: ShopBatchEnvelope) {
  exactKeys(envelope, ['contract', 'batchId', 'revision', 'priorEnvelopeDigest', 'revisionReasonCode', 'logicalStatus', 'businessDate', 'projectionAt', 'classification', 'dispositionCoreDigest', 'sourceRecordSetDigest', 'retainedEvidenceReceiptDigest', 'ownerReviewedOverheadReceiptDigest', 'envelopeDigest'], 'shop_batch_profit_envelope_shape_invalid')
  exactValue(envelope.contract, ENVELOPE_CONTRACT, 'shop_batch_profit_envelope_contract_invalid')
  safeId(envelope.batchId, 'shop_batch_profit_envelope_batch_id_invalid')
  safeWhole(envelope.revision, 'shop_batch_profit_envelope_revision_invalid', MAX_INDIVIDUAL_COUNT)
  if (envelope.revision < 1) fail('shop_batch_profit_envelope_revision_invalid')
  if (envelope.priorEnvelopeDigest !== null) safeDigest(envelope.priorEnvelopeDigest, 'shop_batch_profit_envelope_prior_digest_invalid')
  if (!['initial', 'source_correction', 'adjustment_correction', 'owner_review_correction', 'voided'].includes(envelope.revisionReasonCode)) fail('shop_batch_profit_envelope_reason_invalid')
  if (!['draft', 'ready_for_review', 'closed', 'voided'].includes(envelope.logicalStatus)) fail('shop_batch_profit_envelope_status_invalid')
  safeDate(envelope.businessDate, 'shop_batch_profit_envelope_business_date_invalid')
  safeTimestamp(envelope.projectionAt, null, 'shop_batch_profit_envelope_projection_time_invalid')
  if (![SYNTHETIC_CLASSIFICATION, LOCAL_OPERATING_CLASSIFICATION].includes(envelope.classification)) fail('shop_batch_profit_envelope_classification_invalid')
  safeDigest(envelope.dispositionCoreDigest, 'shop_batch_profit_envelope_disposition_digest_invalid')
  safeDigest(envelope.sourceRecordSetDigest, 'shop_batch_profit_envelope_source_digest_invalid')
  safeDigest(envelope.retainedEvidenceReceiptDigest, 'shop_batch_profit_envelope_retained_digest_invalid')
  safeDigest(envelope.ownerReviewedOverheadReceiptDigest, 'shop_batch_profit_envelope_overhead_digest_invalid')
  safeDigest(envelope.envelopeDigest, 'shop_batch_profit_envelope_digest_invalid')
  if (await canonicalDigest(withoutField(envelope, 'envelopeDigest')) !== envelope.envelopeDigest) fail('shop_batch_profit_envelope_digest_mismatch')
}

function validateWorkspaceHistoryControls(controls: WorkspaceHistoryControls) {
  validateFalseControls(controls, {
    sourceDerived: true,
    completeWorkspaceScan: true,
    activeClosedVoidedIncluded: true,
    manualHistoryAssertionAccepted: false,
    omittedHistoryAllowed: false,
    privateIdentityExported: false,
    customerWrite: false,
    paymentWrite: false,
    stockWrite: false,
    hostedWrite: false,
  }, 'shop_batch_profit_workspace_history_controls_invalid')
}

async function validateHistoricalLedger(ledger: ShopBatchSaleAllocationLedger, envelope: ShopBatchEnvelope, projectionAtMs: number) {
  exactKeys(ledger, ['contract', 'generatedAt', 'projectionAt', 'batchId', 'revision', 'dispositionCoreDigest', 'sourceRecordSetDigest', 'allocations', 'controls', 'ledgerDigest'], 'shop_batch_profit_workspace_ledger_shape_invalid')
  exactValue(ledger.contract, SALE_LEDGER_CONTRACT, 'shop_batch_profit_workspace_ledger_contract_invalid')
  if (ledger.batchId !== envelope.batchId || ledger.revision !== envelope.revision || ledger.projectionAt !== envelope.projectionAt) fail('shop_batch_profit_workspace_ledger_envelope_mismatch')
  safeTimestamp(ledger.generatedAt, projectionAtMs, 'shop_batch_profit_workspace_ledger_time_invalid')
  safeTimestamp(ledger.projectionAt, projectionAtMs, 'shop_batch_profit_workspace_ledger_projection_time_invalid')
  if (ledger.dispositionCoreDigest !== envelope.dispositionCoreDigest || ledger.sourceRecordSetDigest !== envelope.sourceRecordSetDigest) fail('shop_batch_profit_workspace_ledger_envelope_mismatch')
  safeDigest(ledger.ledgerDigest, 'shop_batch_profit_workspace_ledger_digest_invalid')
  validateLedgerControls(ledger.controls)
  const allocations = safeArray(ledger.allocations, 'shop_batch_profit_workspace_allocations_invalid') as ShopBatchSaleAllocation[]
  exactOrder(allocations, (allocation) => `${allocation.batchId}\u0000${String(allocation.envelopeRevision).padStart(6, '0')}\u0000${allocation.orderLineBindingDigest}`, 'shop_batch_profit_workspace_allocation_order_invalid')
  const allocationIds = new Set<string>()
  for (const allocation of allocations) {
    validateAllocationShape(allocation, envelope, projectionAtMs)
    if (allocationIds.has(allocation.allocationId)) fail('shop_batch_profit_workspace_allocation_duplicate')
    allocationIds.add(allocation.allocationId)
  }
  if (await canonicalDigest(withoutField(ledger, 'ledgerDigest')) !== ledger.ledgerDigest) fail('shop_batch_profit_workspace_ledger_digest_mismatch')
}

function validateHistoricalAllocationLineage(allocations: readonly ShopBatchSaleAllocation[]) {
  const allocationIds = new Set<string>()
  const byLine = new Map<string, ShopBatchSaleAllocation[]>()
  for (const allocation of allocations) {
    if (allocationIds.has(allocation.allocationId)) fail('shop_batch_profit_workspace_allocation_id_reused')
    allocationIds.add(allocation.allocationId)
    const rows = byLine.get(allocation.orderLineBindingDigest) ?? []
    rows.push(allocation)
    byLine.set(allocation.orderLineBindingDigest, rows)
  }
  for (const rows of byLine.values()) {
    if (new Set(rows.map((row) => row.batchId)).size !== 1) fail('shop_batch_profit_cross_batch_sale_reuse')
    let prior: ShopBatchSaleAllocation | null = null
    for (const row of rows) {
      if (prior === null) {
        if (row.supersedesAllocationId !== null || row.priorAllocatedUnits !== 0 || row.priorAllocatedValueMmk !== 0) fail('shop_batch_profit_workspace_allocation_initial_lineage_invalid')
      } else if (row.envelopeRevision !== prior.envelopeRevision + 1
        || row.supersedesAllocationId !== prior.allocationId
        || row.priorAllocatedUnits !== prior.allocatedNetUnits
        || row.priorAllocatedValueMmk !== prior.allocatedNetValueMmk) fail('shop_batch_profit_workspace_allocation_lineage_invalid')
      prior = row
    }
  }
  return { allocationIds, allocationsByLine: byLine }
}

async function validateWorkspaceHistoryReceipt(input: ShopBatchProfitControlInput, projectionAtMs: number) {
  const { workspaceHistoryReceipt: receipt, dispositionCore: core } = input
  exactKeys(receipt, ['contract', 'generatedAt', 'projectionAt', 'candidateBatchId', 'candidateRevision', 'scope', 'envelopeCount', 'saleAllocationLedgerCount', 'envelopes', 'saleAllocationLedgers', 'controls', 'receiptDigest'], 'shop_batch_profit_workspace_history_shape_invalid')
  exactValue(receipt.contract, WORKSPACE_HISTORY_CONTRACT, 'shop_batch_profit_workspace_history_contract_invalid')
  safeTimestamp(receipt.generatedAt, projectionAtMs, 'shop_batch_profit_workspace_history_time_invalid')
  if (receipt.projectionAt !== core.projectionAt || receipt.candidateBatchId !== core.batchId || receipt.candidateRevision !== core.revision) fail('shop_batch_profit_workspace_history_candidate_mismatch')
  exactValue(receipt.scope, 'all_active_closed_voided_batch_lineages', 'shop_batch_profit_workspace_history_scope_invalid')
  const envelopes = safeArray(receipt.envelopes, 'shop_batch_profit_workspace_envelopes_invalid') as ShopBatchEnvelope[]
  const ledgers = safeArray(receipt.saleAllocationLedgers, 'shop_batch_profit_workspace_ledgers_invalid') as ShopBatchSaleAllocationLedger[]
  safeWhole(receipt.envelopeCount, 'shop_batch_profit_workspace_envelope_count_invalid', MAX_RECORD_COUNT)
  safeWhole(receipt.saleAllocationLedgerCount, 'shop_batch_profit_workspace_ledger_count_invalid', MAX_RECORD_COUNT)
  if (receipt.envelopeCount !== envelopes.length || receipt.saleAllocationLedgerCount !== ledgers.length || envelopes.length !== ledgers.length) fail('shop_batch_profit_workspace_history_count_mismatch')
  exactOrder(envelopes, (envelope) => `${envelope.batchId}\u0000${String(envelope.revision).padStart(6, '0')}`, 'shop_batch_profit_workspace_envelope_order_invalid')
  exactOrder(ledgers, (ledger) => `${ledger.batchId}\u0000${String(ledger.revision).padStart(6, '0')}`, 'shop_batch_profit_workspace_ledger_order_invalid')
  validateWorkspaceHistoryControls(receipt.controls)
  safeDigest(receipt.receiptDigest, 'shop_batch_profit_workspace_history_digest_invalid')

  const envelopeByRevision = new Map<string, ShopBatchEnvelope>()
  const envelopesByBatch = new Map<string, ShopBatchEnvelope[]>()
  for (const envelope of envelopes) {
    await validateEnvelopeDigest(envelope)
    if (envelope.batchId === core.batchId && envelope.revision >= core.revision) fail('shop_batch_profit_workspace_history_future')
    const key = `${envelope.batchId}\u0000${envelope.revision}`
    if (envelopeByRevision.has(key)) fail('shop_batch_profit_workspace_envelope_duplicate')
    envelopeByRevision.set(key, envelope)
    const rows = envelopesByBatch.get(envelope.batchId) ?? []
    rows.push(envelope)
    envelopesByBatch.set(envelope.batchId, rows)
  }
  for (const rows of envelopesByBatch.values()) {
    let priorDigest: string | null = null
    for (let index = 0; index < rows.length; index += 1) {
      const envelope = rows[index]
      if (envelope.revision !== index + 1 || envelope.priorEnvelopeDigest !== priorDigest) fail('shop_batch_profit_workspace_envelope_lineage_invalid')
      if ((envelope.revision === 1) !== (envelope.revisionReasonCode === 'initial')) fail('shop_batch_profit_workspace_envelope_lineage_invalid')
      priorDigest = envelope.envelopeDigest
    }
  }

  const workspaceAllocations: ShopBatchSaleAllocation[] = []
  for (const ledger of ledgers) {
    const envelope = envelopeByRevision.get(`${ledger.batchId}\u0000${ledger.revision}`)
    if (!envelope) fail('shop_batch_profit_workspace_ledger_envelope_missing')
    await validateHistoricalLedger(ledger, envelope, projectionAtMs)
    workspaceAllocations.push(...ledger.allocations)
    if (workspaceAllocations.length > MAX_RECORD_COUNT) fail('shop_batch_profit_workspace_allocation_count_invalid')
  }
  const allocationHistory = validateHistoricalAllocationLineage(workspaceAllocations)
  if (await canonicalDigest(withoutField(receipt, 'receiptDigest')) !== receipt.receiptDigest) fail('shop_batch_profit_workspace_history_digest_mismatch')
  return { envelopes, ...allocationHistory }
}

async function validateEnvelopeLineage(input: ShopBatchProfitControlInput, workspaceBatchEnvelopes: readonly ShopBatchEnvelope[]) {
  const { batchEnvelope: current, dispositionCore: core } = input
  await validateEnvelopeDigest(current)
  assertSharedBinding(current, core, 'shop_batch_profit_envelope_binding_invalid')
  if (current.businessDate !== core.businessDate || current.classification !== core.classification || current.logicalStatus !== core.status) fail('shop_batch_profit_envelope_core_mismatch')
  if (current.revisionReasonCode === 'voided' && current.logicalStatus !== 'voided') fail('shop_batch_profit_void_lineage_invalid')
  const byRevision = workspaceBatchEnvelopes.filter((envelope) => envelope.batchId === current.batchId)
  if (current.revision === 1) {
    if (current.priorEnvelopeDigest !== null || current.revisionReasonCode !== 'initial' || byRevision.length !== 0) fail('shop_batch_profit_initial_lineage_invalid')
    return
  }
  if (current.revisionReasonCode === 'initial' || byRevision.length !== current.revision - 1) fail('shop_batch_profit_revision_lineage_gap')
  let previousDigest: string | null = null
  for (let index = 0; index < byRevision.length; index += 1) {
    const envelope = byRevision[index]
    await validateEnvelopeDigest(envelope)
    if (envelope.batchId !== current.batchId || envelope.revision !== index + 1 || envelope.priorEnvelopeDigest !== previousDigest || envelope.classification !== current.classification || envelope.businessDate !== current.businessDate) fail('shop_batch_profit_revision_lineage_invalid')
    if (envelope.revision === 1 && envelope.revisionReasonCode !== 'initial') fail('shop_batch_profit_revision_lineage_invalid')
    if (envelope.revision > 1 && envelope.revisionReasonCode === 'initial') fail('shop_batch_profit_revision_lineage_invalid')
    previousDigest = envelope.envelopeDigest
  }
  if (current.priorEnvelopeDigest !== previousDigest) fail('shop_batch_profit_revision_prior_mismatch')
}

async function validateCanonicalDigests(input: ShopBatchProfitControlInput) {
  const dispositionDigest = await canonicalDigest(input.dispositionCore)
  const sourceDigest = await canonicalDigest(input.sourceRecordSet)
  const ledgerDigest = await canonicalDigest(withoutField(input.saleAllocationLedger, 'ledgerDigest'))
  const productionDigest = await canonicalDigest(withoutField(input.productionCostReceipt, 'receiptDigest'))
  const overheadDigest = await canonicalDigest(withoutField(input.overheadReceipt, 'receiptDigest'))
  const retainedDigest = await canonicalDigest(withoutField(input.retainedEvidenceReceipt, 'receiptDigest'))
  const envelopeDigest = await canonicalDigest(withoutField(input.batchEnvelope, 'envelopeDigest'))
  if (input.saleAllocationLedger.dispositionCoreDigest !== dispositionDigest
    || input.productionCostReceipt.dispositionCoreDigest !== dispositionDigest
    || input.overheadReceipt.dispositionCoreDigest !== dispositionDigest
    || input.retainedEvidenceReceipt.dispositionCoreDigest !== dispositionDigest
    || input.batchEnvelope.dispositionCoreDigest !== dispositionDigest) fail('shop_batch_profit_disposition_digest_mismatch')
  if (input.saleAllocationLedger.sourceRecordSetDigest !== sourceDigest
    || input.productionCostReceipt.sourceRecordSetDigest !== sourceDigest
    || input.overheadReceipt.sourceRecordSetDigest !== sourceDigest
    || input.retainedEvidenceReceipt.sourceRecordSetDigest !== sourceDigest
    || input.batchEnvelope.sourceRecordSetDigest !== sourceDigest) fail('shop_batch_profit_source_record_set_digest_mismatch')
  if (input.saleAllocationLedger.ledgerDigest !== ledgerDigest || input.retainedEvidenceReceipt.saleAllocationLedgerDigest !== ledgerDigest) fail('shop_batch_profit_sale_ledger_digest_mismatch')
  if (input.productionCostReceipt.receiptDigest !== productionDigest || input.retainedEvidenceReceipt.productionCostReceiptDigest !== productionDigest) fail('shop_batch_profit_production_cost_digest_mismatch')
  if (input.overheadReceipt.receiptDigest !== overheadDigest || input.retainedEvidenceReceipt.ownerReviewedOverheadReceiptDigest !== overheadDigest || input.batchEnvelope.ownerReviewedOverheadReceiptDigest !== overheadDigest) fail('shop_batch_profit_overhead_digest_mismatch')
  if (input.retainedEvidenceReceipt.receiptDigest !== retainedDigest || input.batchEnvelope.retainedEvidenceReceiptDigest !== retainedDigest) fail('shop_batch_profit_retained_evidence_digest_mismatch')
  if (input.batchEnvelope.envelopeDigest !== envelopeDigest) fail('shop_batch_profit_envelope_digest_mismatch')
  return { dispositionDigest, sourceDigest, ledgerDigest, productionDigest, overheadDigest, retainedDigest, envelopeDigest }
}

function safeBigIntOutput(value: bigint) {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) fail('shop_batch_profit_numeric_range_exceeded')
  return Number(value)
}

function sumBigInt(values: readonly bigint[]) {
  return values.reduce((sum, value) => sum + value, 0n)
}

function floorSigned(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) fail('shop_batch_profit_divisor_invalid')
  if (numerator >= 0n) return numerator / denominator
  return -((-numerator + denominator - 1n) / denominator)
}

function ceilPositive(numerator: bigint, denominator: bigint) {
  if (numerator < 0n || denominator <= 0n) fail('shop_batch_profit_divisor_invalid')
  return (numerator + denominator - 1n) / denominator
}

function allocateOverhead(totalOverhead: bigint, saleValues: ReadonlyMap<string, bigint>) {
  const sold = [...saleValues.entries()].filter(([, value]) => value > 0n)
  const totalSales = sumBigInt(sold.map(([, value]) => value))
  const result = new Map([...saleValues.keys()].map((sku) => [sku, 0n]))
  if (totalSales === 0n) return result
  const rows = sold.map(([sku, value]) => {
    const numerator = totalOverhead * value
    return { sku, amount: numerator / totalSales, remainder: numerator % totalSales }
  })
  let remaining = totalOverhead - sumBigInt(rows.map((row) => row.amount))
  const ranked = [...rows].sort((left, right) => left.remainder === right.remainder
    ? left.sku.localeCompare(right.sku)
    : left.remainder > right.remainder ? -1 : 1)
  for (let index = 0; remaining > 0n; index += 1, remaining -= 1n) ranked[index].amount += 1n
  for (const row of rows) result.set(row.sku, row.amount)
  return result
}

function projectionState(priorities: readonly ShopBatchProfitPriority[], withheld: readonly string[]) {
  if (withheld.includes('batch_not_closed') || withheld.includes('batch_voided') || withheld.includes('completed_sale_value_zero')) return 'collecting_batch_evidence' as const
  if (withheld.includes('retained_sale_evidence_incomplete')) return 'review_adjustments' as const
  if (withheld.includes('synthetic_or_sample_evidence_excluded')) return priorities.length ? 'batch_margin_at_risk' as const : 'batch_controlled' as const
  return priorities.length ? 'batch_margin_at_risk' as const : 'batch_controlled' as const
}

export function projectNoBatchProfitControl(): ShopBatchProfitControlNoBatchProjection {
  return {
    contract: SHOP_BATCH_PROFIT_CONTROL_CONTRACT,
    contractSourceSha256: SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256,
    state: 'no_batch',
    batchIdentity: null,
    evidenceStatus: {
      canonicalDigestsComplete: false,
      immutableRevisionLineageComplete: false,
      reconciliationComplete: false,
      batchSaleAllocationComplete: false,
      crossBatchReuseAbsent: false,
      retainedSalesEvidenceComplete: false,
      productionQuantityCostCoverageComplete: false,
      costEstimateBasisUnambiguous: false,
      overheadReviewComplete: false,
      adjustmentLinkageComplete: false,
      profitStatus: 'withheld',
      withheldReasonCodes: ['no_batch'],
    },
    totals: null,
    estimatePreview: null,
    priorities: [],
    truthBoundary: {
      costLabel: 'Owner-reviewed production-cost estimate',
      classification: null,
      boundary: 'No batch is selected. Decision estimates and priorities are unavailable; no evidence or authority is inferred.',
      mayCountAsBaseline: false,
      mayCountAsPilotRun: false,
      mayCountAsCustomerEvidence: false,
      mayCountAsCommercialProof: false,
    },
    authority: {
      paymentWrite: false,
      stockWrite: false,
      supplierWrite: false,
      accountingWrite: false,
      customerWrite: false,
      hostedWrite: false,
      providerWrite: false,
      modelUsed: false,
    },
  }
}

export async function projectShopBatchProfitControl(input: ShopBatchProfitControlInput): Promise<ShopBatchProfitControlProjection> {
  exactKeys(input, ['dispositionCore', 'sourceRecordSet', 'saleAllocationLedger', 'productionCostReceipt', 'overheadReceipt', 'retainedEvidenceReceipt', 'batchEnvelope', 'workspaceHistoryReceipt', ...(input.marginFloorBasisPoints === undefined ? [] : ['marginFloorBasisPoints'])], 'shop_batch_profit_input_shape_invalid')
  const projectionAtMs = validateDisposition(input.dispositionCore)
  validateSourceRecordSet(input.sourceRecordSet, input.dispositionCore, projectionAtMs)
  const workspaceHistory = await validateWorkspaceHistoryReceipt(input, projectionAtMs)
  await validateEnvelopeLineage(input, workspaceHistory.envelopes)
  validateSaleAllocationLedger(input, projectionAtMs, workspaceHistory)
  validateProductionCostReceipt(input, projectionAtMs)
  validateOverheadReceipt(input, projectionAtMs)
  validateRetainedEvidenceReceipt(input, projectionAtMs)
  const digests = await validateCanonicalDigests(input)
  const floorBasisPoints = input.marginFloorBasisPoints ?? SHOP_BATCH_PROFIT_CONTROL_MARGIN_FLOOR_BASIS_POINTS
  safeWhole(floorBasisPoints, 'shop_batch_profit_margin_floor_invalid', 10_000)

  const core = input.dispositionCore
  const saleValues = new Map(core.items.map((item) => [item.sku, 0n]))
  const saleUnits = new Map(core.items.map((item) => [item.sku, 0n]))
  for (const line of input.sourceRecordSet.saleLines) {
    if (!saleValues.has(line.sku)) fail('shop_batch_profit_sale_sku_unlinked')
    saleValues.set(line.sku, (saleValues.get(line.sku) ?? 0n) + BigInt(line.netValueMmk))
    saleUnits.set(line.sku, (saleUnits.get(line.sku) ?? 0n) + BigInt(line.netUnits))
  }
  let reconciliationComplete = true
  for (const item of core.items) {
    const reconciled = (saleUnits.get(item.sku) ?? 0n) + BigInt(item.leftoverUnits) + BigInt(item.wastedUnits)
    if (reconciled !== BigInt(item.producedUnits)) reconciliationComplete = false
  }
  if (!reconciliationComplete) fail('shop_batch_profit_reconciliation_mismatch')

  const costBySku = new Map(input.productionCostReceipt.skuBindings.map((binding) => [binding.sku, binding]))
  const reviewedProductionCost = new Map(core.items.map((item) => {
    const binding = costBySku.get(item.sku)
    if (!binding) fail('shop_batch_profit_cost_sku_unlinked')
    return [item.sku, BigInt(item.producedUnits) * BigInt(binding.ownerReviewedStandardUnitCostEstimateMmk)]
  }))
  const totalProductionCost = sumBigInt([...reviewedProductionCost.values()])
  const totalOverhead = BigInt(input.overheadReceipt.packagingCostMmk) + BigInt(input.overheadReceipt.deliveryCostMmk) + BigInt(input.overheadReceipt.otherReviewedBatchCostMmk)
  const totalSales = sumBigInt([...saleValues.values()])
  const totalCompletedUnits = sumBigInt([...saleUnits.values()])
  if (totalSales > 0n && totalCompletedUnits === 0n) fail('shop_batch_profit_sale_quantity_value_invalid')
  const totalBatchCost = totalProductionCost + totalOverhead
  const overheadBySku = allocateOverhead(totalOverhead, saleValues)
  const synthetic = core.classification === SYNTHETIC_CLASSIFICATION
  const saleCompletionEvidenceComplete = input.sourceRecordSet.saleLines.every((line) => line.paymentReconciled && line.completionPresent)
  const retainedSalesEvidenceComplete = !synthetic
    && input.sourceRecordSet.saleLines.length > 0
    && input.sourceRecordSet.saleLines.every((line) => line.nonSample && line.paymentReconciled && line.completionPresent)
  const withheldReasonCodes: string[] = []
  if (core.status !== 'closed') withheldReasonCodes.push(core.status === 'voided' ? 'batch_voided' : 'batch_not_closed')
  if (totalSales === 0n) withheldReasonCodes.push('completed_sale_value_zero')
  if (synthetic) withheldReasonCodes.push('synthetic_or_sample_evidence_excluded')
  if (!saleCompletionEvidenceComplete) withheldReasonCodes.push('retained_sale_evidence_incomplete')
  const decisionArithmeticAllowed = core.status === 'closed'
    && totalSales > 0n
    && totalCompletedUnits > 0n
    && saleCompletionEvidenceComplete
    && (synthetic || retainedSalesEvidenceComplete)
  const priorities: ShopBatchProfitPriority[] = []

  if (decisionArithmeticAllowed) {
    for (const item of core.items) {
      const saleValue = saleValues.get(item.sku) ?? 0n
      const cost = reviewedProductionCost.get(item.sku) ?? 0n
      const overhead = overheadBySku.get(item.sku) ?? 0n
      const contribution = saleValue - cost - overhead
      const operationalRisk = BigInt(item.leftoverUnits + item.wastedUnits) * BigInt(costBySku.get(item.sku)?.ownerReviewedStandardUnitCostEstimateMmk ?? 0)
      if (item.producedUnits > 0 && saleValue === 0n) {
        priorities.push({
          sku: item.sku,
          itemState: 'zero_sale_produced',
          severity: 'critical_zero_sale',
          completedSaleValueMmk: 0,
          reviewedProductionCostEstimateMmk: safeBigIntOutput(cost),
          allocatedBatchOverheadMmk: 0,
          contributionEstimateMmk: safeBigIntOutput(-cost),
          contributionEstimateBasisPoints: null,
          marginRiskEstimateMmk: safeBigIntOutput(cost),
          operationalCostRiskEstimateMmk: safeBigIntOutput(operationalRisk),
          ownerRole: 'Shop owner',
          dueLabel: 'Before the next batch decision',
          actionLabel: 'Review price, cost estimate, and batch disposition',
          closureCondition: 'A newly validated retained sale and owner-reviewed cost-estimate receipt must restore complete reconciliation and reach the configured contribution-estimate floor.',
        })
        continue
      }
      if (saleValue === 0n) continue
      const contributionBasisPoints = floorSigned(contribution * 10_000n, saleValue)
      const target = ceilPositive(saleValue * BigInt(floorBasisPoints), 10_000n)
      const marginRisk = target > contribution ? target - contribution : 0n
      const itemState = contribution < 0n ? 'critical_negative_margin' : contributionBasisPoints < BigInt(floorBasisPoints) ? 'attention_below_floor' : null
      if (!itemState) continue
      priorities.push({
        sku: item.sku,
        itemState,
        severity: itemState,
        completedSaleValueMmk: safeBigIntOutput(saleValue),
        reviewedProductionCostEstimateMmk: safeBigIntOutput(cost),
        allocatedBatchOverheadMmk: safeBigIntOutput(overhead),
        contributionEstimateMmk: safeBigIntOutput(contribution),
        contributionEstimateBasisPoints: safeBigIntOutput(contributionBasisPoints),
        marginRiskEstimateMmk: safeBigIntOutput(marginRisk),
        operationalCostRiskEstimateMmk: safeBigIntOutput(operationalRisk),
        ownerRole: 'Shop owner',
        dueLabel: 'Before the next batch decision',
        actionLabel: 'Review price, cost estimate, and batch disposition',
        closureCondition: 'A newly validated retained sale and owner-reviewed cost-estimate receipt must restore complete reconciliation and reach the configured contribution-estimate floor.',
      })
    }
  }
  const rank = { critical_zero_sale: 0, critical_negative_margin: 1, attention_below_floor: 2 } as const
  priorities.sort((left, right) => {
    const severity = rank[left.severity] - rank[right.severity]
    if (severity) return severity
    if (left.severity === 'critical_zero_sale') return right.marginRiskEstimateMmk - left.marginRiskEstimateMmk || left.sku.localeCompare(right.sku)
    return (left.contributionEstimateBasisPoints ?? 0) - (right.contributionEstimateBasisPoints ?? 0)
      || right.marginRiskEstimateMmk - left.marginRiskEstimateMmk
      || left.sku.localeCompare(right.sku)
  })

  const estimatePreview = decisionArithmeticAllowed
    ? {
        batchContributionEstimateMmk: safeBigIntOutput(totalSales - totalBatchCost),
        aggregateContributionEstimateBasisPoints: safeBigIntOutput(floorSigned((totalSales - totalBatchCost) * 10_000n, totalSales)),
        estimatedBreakEvenSoldValueMmk: safeBigIntOutput(totalBatchCost),
        remainingToEstimatedBreakEvenMmk: safeBigIntOutput(totalBatchCost > totalSales ? totalBatchCost - totalSales : 0n),
        observedAverageNetSalePerUnitMmk: safeBigIntOutput((totalSales + totalCompletedUnits / 2n) / totalCompletedUnits),
        breakEvenEquivalentCompletedUnits: safeBigIntOutput(ceilPositive(totalBatchCost * totalCompletedUnits, totalSales)),
        estimatedMarginAtRiskMmk: safeBigIntOutput(sumBigInt(priorities.map((priority) => BigInt(priority.marginRiskEstimateMmk)))),
        overheadAllocationMmkBySku: Object.fromEntries(core.items.map((item) => [item.sku, safeBigIntOutput(overheadBySku.get(item.sku) ?? 0n)])),
      }
    : null
  const profitStatus = withheldReasonCodes.length ? 'withheld' as const : 'available' as const

  return {
    contract: SHOP_BATCH_PROFIT_CONTROL_CONTRACT,
    contractSourceSha256: SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256,
    state: projectionState(priorities, withheldReasonCodes),
    batchIdentity: {
      batchId: core.batchId,
      revision: core.revision,
      priorEnvelopeDigest: input.batchEnvelope.priorEnvelopeDigest,
      logicalStatus: input.batchEnvelope.logicalStatus,
      businessDate: core.businessDate,
      projectionAt: core.projectionAt,
      classification: core.classification,
      dispositionCoreDigest: digests.dispositionDigest,
      sourceRecordSetDigest: digests.sourceDigest,
      saleAllocationLedgerDigest: digests.ledgerDigest,
      productionCostReceiptDigest: digests.productionDigest,
      retainedEvidenceReceiptDigest: digests.retainedDigest,
      ownerReviewedOverheadReceiptDigest: digests.overheadDigest,
      batchEnvelopeDigest: digests.envelopeDigest,
    },
    evidenceStatus: {
      canonicalDigestsComplete: true,
      immutableRevisionLineageComplete: true,
      reconciliationComplete,
      batchSaleAllocationComplete: true,
      crossBatchReuseAbsent: true,
      retainedSalesEvidenceComplete,
      productionQuantityCostCoverageComplete: true,
      costEstimateBasisUnambiguous: true,
      overheadReviewComplete: true,
      adjustmentLinkageComplete: true,
      profitStatus,
      withheldReasonCodes,
    },
    totals: {
      producedUnits: safeBigIntOutput(sumBigInt(core.items.map((item) => BigInt(item.producedUnits)))),
      completedSaleUnits: safeBigIntOutput(totalCompletedUnits),
      leftoverUnits: safeBigIntOutput(sumBigInt(core.items.map((item) => BigInt(item.leftoverUnits)))),
      wastedUnits: safeBigIntOutput(sumBigInt(core.items.map((item) => BigInt(item.wastedUnits)))),
      remakeUnits: safeBigIntOutput(sumBigInt(core.items.map((item) => BigInt(item.remakeUnits)))),
      preorderUnits: safeBigIntOutput(sumBigInt(core.items.map((item) => BigInt(item.preorderUnits)))),
      totalCompletedSaleValueMmk: safeBigIntOutput(totalSales),
      totalReviewedProductionCostEstimateMmk: safeBigIntOutput(totalProductionCost),
      totalBatchOverheadMmk: safeBigIntOutput(totalOverhead),
      totalBatchCostEstimateMmk: safeBigIntOutput(totalBatchCost),
    },
    estimatePreview,
    priorities,
    truthBoundary: {
      costLabel: 'Owner-reviewed production-cost estimate',
      classification: core.classification,
      boundary: synthetic
        ? 'Synthetic local calculation only. Reviewed cost values remain estimates; never actual accounting cost, baseline, pilot, customer, commercial, or release proof.'
        : 'Deterministic local operating estimate from retained non-sample sales and separately owner-reviewed cost-estimate receipts. Not actual accounting cost, pilot, customer, commercial, or release proof.',
      mayCountAsBaseline: false,
      mayCountAsPilotRun: false,
      mayCountAsCustomerEvidence: false,
      mayCountAsCommercialProof: false,
    },
    authority: {
      paymentWrite: false,
      stockWrite: false,
      supplierWrite: false,
      accountingWrite: false,
      customerWrite: false,
      hostedWrite: false,
      providerWrite: false,
      modelUsed: false,
    },
  }
}
