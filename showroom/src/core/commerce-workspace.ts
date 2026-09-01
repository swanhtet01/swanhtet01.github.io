import {
  countShopInventory,
  fulfilShopInventoryOrder,
  issueShopInventoryToProduction,
  planShopInventoryOrderAllocation,
  planShopInventoryOrderReturn,
  projectShopInventory,
  receiveShopInventory,
  receiveShopInventoryFromProduction,
  releaseShopInventoryOrder,
  reserveShopInventoryOrder,
  returnShopInventoryFromProduction,
  returnShopInventoryOrder,
  type ShopInventoryOrderReturnAllocation,
  type ShopInventoryState,
} from './shop-inventory-foundation.ts'
import { ledgerAccountRoles, type LedgerAccountRole } from './shop-ledger-accounts.ts'
// The general ledger is a projection over this workspace. The v4 handoff
// delegates to it; these bindings are only ever read inside functions, so the
// import cycle with shop-ledger-journal never touches module-evaluation order.
import {
  buildShopLedgerJournal,
  computeLedgerTrialBalance,
  type LedgerJournal,
  type LedgerTrialBalance,
} from './shop-ledger-journal.ts'

export const COMMERCE_WORKSPACE_SCHEMA = 'supermega.commerce.workspace.v2' as const
export const COMMERCE_STOREFRONT_SCHEMA = 'supermega.ecommerce.storefront.v1' as const
export const COMMERCE_ORDER_CALCULATION_SCHEMA = 'supermega.commerce.order-calculation.v1' as const
export const COMMERCE_ORDER_CALCULATION_V2_SCHEMA = 'supermega.commerce.order-calculation.v2' as const
export const COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA = 'supermega.commerce.daily-close-export.v3' as const
export const COMMERCE_ACCOUNTING_HANDOFF_SCHEMA = 'supermega.commerce.accounting-handoff.v3' as const
export const COMMERCE_ACCOUNTING_HANDOFF_V4_SCHEMA = 'supermega.commerce.accounting-handoff.v4' as const
export const COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA = 'supermega.commerce.supplier-payables-handoff.v1' as const
export const COMMERCE_CUSTOMER_RECEIVABLES_HANDOFF_SCHEMA = 'supermega.commerce.customer-receivables-handoff.v1' as const
export const COMMERCE_CLOSE_SETTLEMENT_SCHEMA = 'supermega.commerce.close-settlement.v1' as const
export const COMMERCE_SUPPORT_WORKLOAD_EXPORT_SCHEMA = 'supermega.commerce.support-workload.v1' as const
export const COMMERCE_ORDER_ACKNOWLEDGEMENT_SCHEMA = 'supermega.commerce.order-acknowledgement.v1' as const
export const COMMERCE_WORKSPACE_ARCHIVE_SCHEMA = 'supermega.commerce.workspace-archive.v1' as const
const COMMERCE_STOREFRONT_PREVIEW_SCHEMA = 'supermega.ecommerce.storefront_preview.v1' as const
export const COMMERCE_KEY = 'supermega.commerce.workspace.v2'
export const LEGACY_COMMERCE_KEYS = ['supermega.commerce.workspace.v1', 'supermega.shop.workspace.v2']
export const COMMERCE_LOCK = 'supermega-commerce-workspace-v2'

export type CommerceItem = {
  sku: string
  name: string
  // Burmese display name, carried alongside `name` rather than widening `name` to {en, my}:
  // `name` is snapshotted onto every order line and printed on receipts, so changing its type
  // would invalidate saved workspaces and stored orders.
  //
  // OPTIONAL, and it has to stay optional. Catalog items are PERSISTED under COMMERCE_KEY, and
  // every catalog written before this field existed carries no Burmese name -- as does every
  // catalog an owner imports from her own CSV, which has no column for one. Requiring it would
  // turn an ordinary existing workspace into an unreadable one.
  //
  // Only rows that sell a bookable service ever receive it, from the pack's own translations via
  // withShopServiceMyanmarNames. Retail goods have no Myanmar name anywhere in this codebase and
  // must not be given machine-made ones.
  nameMy?: string
  variant?: string
  onHand: number
  reorderAt: number
  price: number
}

export type CommerceOrderStatus = 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'
export type CommercePaymentStatus = 'pending' | 'reconciled'
export type CommerceRefundStatus = 'none' | 'due' | 'settled'
export type CommerceReturnDisposition = 'restock' | 'not_restocked'
export type CommerceCorrectionKind = 'credit' | 'debit'
export type CommerceCorrectionReasonCode = 'pricing_error' | 'service_recovery' | 'fee_adjustment' | 'other'

export type CommerceOrderLine = {
  sku: string
  name: string
  variant?: string
  quantity: number
  unitPriceMmk: number
}

export type CommerceOrderCalculationV1 = {
  schema: typeof COMMERCE_ORDER_CALCULATION_SCHEMA
  currency: 'MMK'
  catalogRevision: number
  subtotalMmk: number
  taxMode: 'not_configured'
  taxMmk: 0
  totalMmk: number
}

export type CommerceTaxMode = 'exclusive' | 'inclusive'

export type CommerceOrderCalculationV2 = {
  schema: typeof COMMERCE_ORDER_CALCULATION_V2_SCHEMA
  currency: 'MMK'
  catalogRevision: number
  taxConfigurationRevision: number
  taxCode: string
  taxJurisdictionCode?: string
  taxEffectiveFrom?: string
  taxRateBasisPoints: number
  taxMode: CommerceTaxMode
  listedSubtotalMmk: number
  subtotalMmk: number
  taxMmk: number
  totalMmk: number
}

export type CommerceOrderCalculation = CommerceOrderCalculationV1 | CommerceOrderCalculationV2

export type CommerceTaxDecision = {
  schema: 'supermega.ecommerce.tax-decision.v1'
  status: 'configured' | 'not_configured'
  catalogRevision: number
  taxConfigurationRevision: number | null
  taxCode: string | null
  taxJurisdictionCode: string | null
  taxEffectiveFrom: string | null
  taxRateBasisPoints: number
  taxMode: CommerceTaxMode | 'not_configured'
  listedSubtotalMmk: number
  subtotalMmk: number
  taxMmk: number
  totalMmk: number
  policyActionId: string | null
  reviewedAt: string
}

export type CommerceTaxConfiguration = {
  revision: number
  code: string
  label: string
  rateBasisPoints: number
  mode: CommerceTaxMode
  jurisdictionCode?: string
  effectiveFrom?: string
  proof: CommerceActionProof
}

export type CommerceTaxConfigurationInput = {
  code: string
  label: string
  rateBasisPoints: number
  mode: CommerceTaxMode
  jurisdictionCode: string
  effectiveFrom: string
}

export type CommerceAccountRole = 'payment_clearing' | 'sales_revenue' | 'sales_revenue_unverified' | 'tax_payable' | 'sales_adjustment' | 'correction_receivable' | 'correction_payable'

export type CommerceAccountMappingEntry = {
  // Widened to the ledger role set so a third mapping generation can map the
  // general-ledger roles (accounts_receivable, accounts_payable, etc.) to
  // external accountant codes. The legacy-4 and current-7 generations only ever
  // use CommerceAccountRole values, which remain a subset of LedgerAccountRole.
  accountRole: LedgerAccountRole
  externalAccountCode: string
}

export type CommerceAccountMappingConfiguration = {
  revision: number
  mappings: CommerceAccountMappingEntry[]
  proof: CommerceActionProof
}

export type CommerceAccountMappingInput = {
  mappings: CommerceAccountMappingEntry[]
}

export type CommerceCustomerCreditPolicyStatus = 'active' | 'hold'

export type CommerceCustomerCreditPolicy = {
  revision: number
  customer: string
  creditLimitMmk: number
  maxPaymentTermsDays: 0 | 7 | 30
  status: CommerceCustomerCreditPolicyStatus
  proof: CommerceActionProof
}

export type CommerceCustomerCreditPolicyInput = {
  customer: string
  creditLimitMmk: number
  maxPaymentTermsDays: 0 | 7 | 30
  status: CommerceCustomerCreditPolicyStatus
}

export type CommerceOrderCreditDecision = {
  policyRevision: number
  policyActionId: string
  creditLimitMmk: number
  exposureBeforeMmk: number
  orderAmountMmk: number
  exposureAfterMmk: number
  maxPaymentTermsDays: 0 | 7 | 30
  paymentTermsDays: 7 | 30
  status: 'approved'
}

export type CommercePromotionPolicy = {
  revision: number
  code: string
  discountBasisPoints: number
  minimumSubtotalMmk: number
  maximumDiscountMmk: number
  status: 'active' | 'inactive'
  effectiveFrom: string
  effectiveUntil: string | null
  proof: CommerceActionProof
}

export type CommercePromotionPolicyInput = Omit<CommercePromotionPolicy, 'revision' | 'proof'>

export type CommerceShippingPolicy = {
  revision: number
  zoneCode: string
  townships: string[]
  feeMmk: number
  promiseMinutes: number
  status: 'active' | 'inactive'
  effectiveFrom: string
  effectiveUntil: string | null
  proof: CommerceActionProof
}

export type CommerceShippingPolicyInput = Omit<CommerceShippingPolicy, 'revision' | 'proof'>

export type CommerceShippingDecision = {
  schema: 'supermega.commerce.shipping-decision.v1'
  status: 'pickup' | 'approved' | 'rejected'
  reason: 'pickup' | 'approved' | 'not_found' | 'inactive' | 'not_effective'
  township: string | null
  zoneCode: string | null
  policyRevision: number | null
  policyActionId: string | null
  feeMmk: number
  promiseMinutes: number | null
  reviewedAt: string
}

export type CommercePaymentAdapter = 'pay_on_pickup' | 'cash_on_delivery' | 'kbzpay_manual'

export type CommercePaymentPolicy = {
  revision: number
  adapter: CommercePaymentAdapter
  allowedFulfilments: Array<'pickup' | 'delivery'>
  maximumOrderMmk: number | null
  instructions: string
  status: 'active' | 'inactive'
  effectiveFrom: string
  effectiveUntil: string | null
  proof: CommerceActionProof
}

export type CommercePaymentPolicyInput = Omit<CommercePaymentPolicy, 'revision' | 'proof'>

export type CommercePaymentDecision = {
  schema: 'supermega.commerce.payment-decision.v1'
  status: 'approved' | 'rejected'
  reason: 'approved' | 'not_found' | 'inactive' | 'not_effective' | 'fulfilment_not_allowed' | 'amount_exceeded'
  adapter: CommercePaymentAdapter
  policyRevision: number | null
  policyActionId: string | null
  maximumOrderMmk: number | null
  instructions: string | null
  reviewedAt: string
  authorized: false
}

export type CommercePromotionDecisionReason = 'approved' | 'not_requested' | 'not_found' | 'inactive' | 'not_effective' | 'minimum_not_met'

export type CommercePromotionDecision = {
  schema: 'supermega.commerce.promotion-decision.v1'
  status: 'not_requested' | 'approved' | 'rejected'
  code: string | null
  policyRevision: number | null
  policyActionId: string | null
  discountBasisPoints: number
  grossSubtotalMmk: number
  discountMmk: number
  netSubtotalMmk: number
  reviewedAt: string
  reason: CommercePromotionDecisionReason
}

export type CommerceCustomerCreditReview = {
  customer: string
  policy: CommerceCustomerCreditPolicy | null
  paymentTermsDays: 0 | 7 | 30
  exposureBeforeMmk: number
  orderAmountMmk: number
  exposureAfterMmk: number
  allowed: boolean
  reason: 'cash_terms' | 'policy_missing' | 'customer_hold' | 'terms_exceeded' | 'limit_exceeded' | 'approved'
}

export type CommerceOrderReturn = {
  actionId: string
  createdAt: string
  actor: string
  reason: string
  evidenceReference: string
  sku: string
  quantity: number
  disposition: CommerceReturnDisposition
}

export type CommerceCorrectionCalculation = {
  currency: 'MMK'
  taxConfigurationRevision: number | null
  taxCode: string | null
  taxJurisdictionCode?: string | null
  taxEffectiveFrom?: string | null
  taxRateBasisPoints: number | null
  taxMode: 'not_configured' | CommerceTaxMode
  listedAmountMmk: number
  subtotalMmk: number
  taxMmk: number
  totalMmk: number
}

export type CommerceOrderCorrection = {
  documentId: string
  actionId: string
  createdAt: string
  actor: string
  reason: string
  evidenceReference: string
  kind: CommerceCorrectionKind
  reasonCode: CommerceCorrectionReasonCode
  sourceCalculationDigest: string
  calculation: CommerceCorrectionCalculation
  balanceAfterMmk: number
  financialStatus: 'review_required'
  postingAuthority: 'none'
  externalPostingPerformed: false
}

export type CommerceCollectionAction = {
  kind: 'customer_contact'
  proof: CommerceActionProof
}

export type CommerceSupportCategory = 'order_status' | 'delivery_issue' | 'payment_question' | 'item_issue' | 'other'
export type CommerceSupportResolutionOutcome = 'information_provided' | 'replacement_review_required' | 'refund_review_required' | 'no_action'
export type CommerceSupportPriority = 'urgent' | 'high' | 'normal' | 'low'
export type CommerceSupportUrgency = 'overdue' | 'due_soon' | 'scheduled' | 'untriaged' | 'resolved'
export type CommerceSupportResponsibilityEventKind = 'reassigned' | 'escalated'
export type CommerceSupportCheckpointKind = 'acknowledged' | 'first_response_ready'
export type CommerceSupportServiceEventKind = CommerceSupportResponsibilityEventKind | CommerceSupportCheckpointKind

export type CommerceOrderSupportServiceEvent = {
  kind: CommerceSupportServiceEventKind
  owner: string
  priority: CommerceSupportPriority
  dueAt: string
  note: string
  proof: CommerceActionProof
}

export type CommerceOrderSupportResolution = {
  outcome: CommerceSupportResolutionOutcome
  note: string
  proof: CommerceActionProof
}

export type CommerceOrderSupportReopen = {
  sourceResolutionActionId: string
  owner: string
  priority: CommerceSupportPriority
  dueAt: string
  note: string
  proof: CommerceActionProof
}

export type CommerceOrderSupportCase = {
  caseId: string
  sourceIntentId: string
  sourceRequestId: string
  customerRequestedAt: string
  category: CommerceSupportCategory
  customerDescription: string
  status: 'open' | 'resolved'
  priority?: CommerceSupportPriority
  owner?: string
  dueAt?: string
  opening: CommerceActionProof
  serviceEvents?: CommerceOrderSupportServiceEvent[]
  resolution?: CommerceOrderSupportResolution
  reopen?: CommerceOrderSupportReopen
  followUpServiceEvents?: CommerceOrderSupportServiceEvent[]
  followUpResolution?: CommerceOrderSupportResolution
  externalMessageSent: false
  refundStarted: false
}

export type CommerceOrder = {
  id: string
  createdAt: string
  customer: string
  owner?: string
  channel: string
  item: string
  itemSku?: string
  quantity: number
  payment: string
  paymentStatus: CommercePaymentStatus
  refundStatus: CommerceRefundStatus
  paymentReconciledAt?: string
  paymentReconciliationActionId?: string
  paymentReconciledBy?: string
  paymentReconciliationReason?: string
  paymentEvidenceReference?: string
  refundSettledAt?: string
  refundSettlementActionId?: string
  refundSettledBy?: string
  refundSettlementReason?: string
  refundEvidenceReference?: string
  fulfilment?: string
  fulfilmentReference?: string
  promisedAt?: string
  paymentDueAt?: string
  collectionActions?: CommerceCollectionAction[]
  creditDecision?: CommerceOrderCreditDecision
  promotionDecision?: CommercePromotionDecision
  shippingDecision?: CommerceShippingDecision
  paymentDecision?: CommercePaymentDecision
  taxDecision?: CommerceTaxDecision
  sourceRecordId?: string
  evidenceReference?: string
  lines?: CommerceOrderLine[]
  advancementActionIds?: string[]
  completion?: CommerceActionProof
  returns?: CommerceOrderReturn[]
  supportCases?: CommerceOrderSupportCase[]
  corrections?: CommerceOrderCorrection[]
  calculation?: CommerceOrderCalculation
  total: number
  status: CommerceOrderStatus
}

export type CommerceOrderAcknowledgement = {
  schema: typeof COMMERCE_ORDER_ACKNOWLEDGEMENT_SCHEMA
  documentType: 'order_acknowledgement'
  notice: 'Not a tax invoice, receipt, or payment confirmation.'
  orderId: string
  createdAt: string
  customer: string
  channel: string
  status: CommerceOrderStatus
  currency: 'MMK'
  lines: Array<CommerceOrderLine & { lineTotalMmk: number }>
  grossSubtotalMmk: number
  promotion: {
    status: 'applied' | 'not_applied' | 'not_recorded'
    code: string | null
    reason: CommercePromotionDecisionReason | null
    discountMmk: number
    netSubtotalMmk: number
  }
  delivery: {
    fulfilment: string
    reference: string
    township: string | null
    status: CommerceShippingDecision['status'] | 'not_recorded'
    feeMmk: number
    promisedAt: string
  }
  tax: {
    status: 'configured' | 'not_configured'
    code: string | null
    jurisdictionCode: string | null
    rateBasisPoints: number
    mode: CommerceTaxMode | 'not_configured'
    subtotalMmk: number
    taxMmk: number
  }
  totalMmk: number
  payment: {
    method: string
    status: CommercePaymentStatus
    dueAt: string | null
    reconciledAt: string | null
    refundStatus: CommerceRefundStatus
  }
  cancellation: {
    state: 'not_cancelled' | 'cancelled'
    cancelledAt: string | null
    actionId: string | null
    evidenceReference: string | null
  }
  evidence: {
    confirmationActionId: string
    confirmationCapturedAt: string
    confirmationEvidenceReference: string
    sourceRecordId: string | null
    sourceEvidenceReference: string | null
    calculationDigest: string
  }
  controls: {
    customerMessageSent: false
    taxInvoiceIssued: false
    paymentProviderCalled: false
    externalWritePerformed: false
  }
  digest: string
}

export type CommerceOrderPromiseUrgency = 'late' | 'due_soon' | 'scheduled' | 'unrecorded'

export function commerceOrderPromiseUrgency(order: CommerceOrder, now: number): CommerceOrderPromiseUrgency {
  const promisedAt = order.promisedAt ? Date.parse(order.promisedAt) : Number.NaN
  if (!Number.isFinite(promisedAt) || !Number.isFinite(now)) return 'unrecorded'
  if (promisedAt <= now) return 'late'
  return promisedAt - now <= 60 * 60 * 1000 ? 'due_soon' : 'scheduled'
}

export type CommerceReceivableAgingBucket = 'current' | '1_7' | '8_30' | '31_60' | 'over_60'

export type CommerceReceivableAgingRow = {
  orderId: string
  customer: string
  paymentMethod: string
  dueAt: string
  balanceMmk: number
  daysPastDue: number
  bucket: CommerceReceivableAgingBucket
  collectionActionCount: number
  lastCollectionAction?: CommerceActionProof
}

export type CommerceReceivablesAging = {
  asOf: string
  rows: CommerceReceivableAgingRow[]
  totalsMmk: Record<CommerceReceivableAgingBucket, number>
  totalOutstandingMmk: number
  overdueOrders: number
  overdueMmk: number
}

const receivableBuckets: CommerceReceivableAgingBucket[] = ['current', '1_7', '8_30', '31_60', 'over_60']
const dayMilliseconds = 24 * 60 * 60 * 1000

function receivableBucket(daysPastDue: number): CommerceReceivableAgingBucket {
  if (daysPastDue <= 0) return 'current'
  if (daysPastDue <= 7) return '1_7'
  if (daysPastDue <= 30) return '8_30'
  if (daysPastDue <= 60) return '31_60'
  return 'over_60'
}

export function commerceReceivablesAging(state: CommerceState, now: number): CommerceReceivablesAging {
  const safeNow = Number.isFinite(now) ? now : 0
  const rows = state.orders
    .filter((order) => order.status !== 'cancelled' && order.paymentStatus === 'pending')
    .flatMap((order): CommerceReceivableAgingRow[] => {
      const dueAt = order.paymentDueAt ?? order.promisedAt ?? order.createdAt
      const dueTime = Date.parse(dueAt)
      if (!Number.isFinite(dueTime) || !Number.isSafeInteger(order.total) || order.total < 0) return []
      const daysPastDue = safeNow > dueTime ? Math.ceil((safeNow - dueTime) / dayMilliseconds) : 0
      return [{
        orderId: order.id,
        customer: order.customer,
        paymentMethod: order.payment,
        dueAt,
        balanceMmk: order.total,
        daysPastDue,
        bucket: receivableBucket(daysPastDue),
        collectionActionCount: order.collectionActions?.length ?? 0,
        ...(order.collectionActions?.[0] ? { lastCollectionAction: order.collectionActions[0].proof } : {}),
      }]
    })
    .sort((left, right) => right.daysPastDue - left.daysPastDue || left.dueAt.localeCompare(right.dueAt) || left.orderId.localeCompare(right.orderId))
  const totalsMmk = Object.fromEntries(receivableBuckets.map((bucket) => [
    bucket,
    rows.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + row.balanceMmk, 0),
  ])) as Record<CommerceReceivableAgingBucket, number>
  return {
    asOf: new Date(safeNow).toISOString(),
    rows,
    totalsMmk,
    totalOutstandingMmk: rows.reduce((sum, row) => sum + row.balanceMmk, 0),
    overdueOrders: rows.filter((row) => row.daysPastDue > 0).length,
    overdueMmk: rows.filter((row) => row.daysPastDue > 0).reduce((sum, row) => sum + row.balanceMmk, 0),
  }
}

export type CommerceProductionMaterialUnit = 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'pack' | 'bag' | 'roll' | 'sheet' | 'm' | 'cm'

export type CommerceProductionMaterialRequest = {
  requestId: string
  sourceCommandDigest: string
  jobId: string
  materialId: string
  inputLotId: string
  quantityMilli: number
  unit: CommerceProductionMaterialUnit
}

export type CommerceProductionBatchReceipt = {
  releaseId: string
  sourceCommandDigest: string
  jobId: string
  outputBatchId: string
  releasedAt: string
  sourceProduct: string
  sku: string
  quantity: number
}

export type CommerceStockMovementKind = 'opening' | 'reserve' | 'release' | 'receipt' | 'count' | 'return' | 'production_issue' | 'production_return' | 'production_receipt'

export type CommerceStockMovement = {
  id: string
  actionId: string
  createdAt: string
  actor: string
  reason: string
  evidenceReference: string
  kind: CommerceStockMovementKind
  sku: string
  quantityDelta: number
  orderId?: string
  purchaseOrderId?: string
  rejectedQuantity?: number
  discrepancyCode?: CommercePurchaseOrderDiscrepancyCode
  discrepancyDisposition?: 'return_to_vendor'
  expectedQuantity?: number
  countedQuantity?: number
  productionRequestId?: string
  productionCommandDigest?: string
  productionJobId?: string
  productionMaterialId?: string
  productionInputLotId?: string
  productionQuantityMilli?: number
  productionUnit?: CommerceProductionMaterialUnit
  conversionNote?: string
  productionIssueActionId?: string
  productionReturnedQuantityMilli?: number
  productionReturnStockUnitId?: string
  productionReturnLocationId?: string
  productionReleaseId?: string
  productionOutputBatchId?: string
  productionReleasedAt?: string
  productionSourceProduct?: string
}

export type CommerceClose = {
  id: string
  createdAt: string
  total: number
  orders: number
  businessDate?: string
  orderIds?: string[]
  paymentExceptionOrderIds?: string[]
  stockExceptionSkus?: string[]
  actionId?: string
  operator?: string
  reason?: string
  evidenceReference?: string
  settlement?: CommerceCloseSettlement
}

export type CommerceCloseSettlementLine = {
  paymentMethod: string
  expectedMmk: number
  countedMmk: number
  varianceMmk: number
  status: 'matched' | 'variance_review'
  varianceOwner: string | null
  varianceReason: string | null
}

export type CommerceCloseSettlement = {
  schema: typeof COMMERCE_CLOSE_SETTLEMENT_SCHEMA
  status: 'matched' | 'variance_review'
  totalExpectedMmk: number
  totalCountedMmk: number
  totalVarianceMmk: number
  lines: CommerceCloseSettlementLine[]
}

export type CommerceCloseSettlementInputLine = {
  paymentMethod: string
  countedMmk: number
  varianceOwner: string
  varianceReason: string
}

export type CommerceCloseExpectation = {
  businessDate: string
  orderIds: string[]
  total: number
  paymentExceptionOrderIds: string[]
  stockExceptionSkus: string[]
  stateSnapshot: string
}

export type CommerceDailyCloseExportCorrection = {
  documentId: string
  kind: CommerceCorrectionKind
  reasonCode: CommerceCorrectionReasonCode
  createdAt: string
  actor: string
  evidenceReference: string
  sourceCalculationDigest: string
  listedAmountMmk: number
  subtotalMmk: number
  taxMmk: number
  totalMmk: number
  balanceAfterMmk: number
  financialStatus: 'review_required'
  postingAuthority: 'none'
  externalPostingPerformed: false
}

export type CommerceDailyCloseExportOrder = {
  orderId: string
  orderCreatedAt: string
  paymentMethod: string
  paymentReconciledAt: string | null
  paymentEvidenceReference: string | null
  currency: 'MMK'
  catalogRevision: number | null
  taxConfigurationRevision: number | null
  taxCode: string | null
  taxJurisdictionCode: string | null
  taxEffectiveFrom: string | null
  taxRateBasisPoints: number | null
  listedSubtotalMmk: number | null
  subtotalMmk: number | null
  taxMode: 'not_configured' | 'not_recorded' | CommerceTaxMode
  taxMmk: number | null
  originalTotalMmk: number
  totalMmk: number
  corrections: CommerceDailyCloseExportCorrection[]
  calculationStatus: 'accepted' | 'legacy_unverified'
}

export type CommerceDailyCloseExport = {
  schema: typeof COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA
  closeId: string
  businessDate: string
  closedAt: string
  actionId: string
  operator: string
  reason: string
  evidenceReference: string
  totalMmk: number
  orderCount: number
  paymentExceptionOrderIds: string[]
  stockExceptionSkus: string[]
  orders: CommerceDailyCloseExportOrder[]
  digest: string
}

export type CommerceAccountingHandoffEntry = {
  lineId: string
  side: 'debit' | 'credit'
  accountRole: CommerceAccountRole
  externalAccountCode: string | null
  paymentMethod: string | null
  sourceOrderId: string | null
  sourceDocumentId: string | null
  calculationStatus: 'accepted' | 'legacy_unverified' | 'mixed'
  amountMmk: number
  mappingStatus: 'mapped' | 'unmapped'
}

export type CommerceAccountingHandoff = {
  schema: typeof COMMERCE_ACCOUNTING_HANDOFF_SCHEMA
  status: 'review_required'
  postingAuthority: 'none'
  externalPostingPerformed: false
  currency: 'MMK'
  closeId: string
  businessDate: string
  closedAt: string
  sourceCloseDigest: string
  accountMappingRevision: number | null
  accountMappingEvidenceReference: string | null
  originalOrderTotalMmk: number
  netOrderTotalMmk: number
  correctionCount: number
  creditCorrectionMmk: number
  debitCorrectionMmk: number
  totalDebitMmk: number
  totalCreditMmk: number
  acceptedOrderCount: number
  legacyUnverifiedOrderCount: number
  taxConfiguredOrderCount: number
  paymentExceptionOrderIds: string[]
  stockExceptionSkus: string[]
  entries: CommerceAccountingHandoffEntry[]
  digest: string
}

// Accounting handoff v4 grows a ledger section over v3: the close handoff is
// carried through unchanged, and the general-ledger journal (the whole ledger
// since the shop's first close) plus its trial balance ride alongside it. The
// review-only posture is preserved exactly -- the device never claims the
// accountant's books were written.
export type CommerceAccountingHandoffV4 = {
  schema: typeof COMMERCE_ACCOUNTING_HANDOFF_V4_SCHEMA
  status: 'review_required'
  postingAuthority: 'none'
  externalPostingPerformed: false
  closeHandoff: CommerceAccountingHandoff
  ledger: {
    journal: LedgerJournal
    trialBalance: LedgerTrialBalance
  }
}

export type CommerceSupplierPayablesHandoffRow = {
  purchaseOrderId: string
  requisitionId: string | null
  supplier: string
  sku: string
  invoiceId: string
  supplierInvoiceReference: string
  invoiceIssuedAt: string
  dueAt: string
  orderedQuantity: number
  acceptedQuantity: number
  rejectedQuantity: number
  invoicedQuantity: number
  unitCostMmk: number
  grossInvoiceMmk: number
  supplierClaimMmk: number
  supplierCreditMmk: number
  netPayableMmk: number
  payableReviewActionId: string
  payableReviewedAt: string
  payableReviewedBy: string
  payableEvidenceReference: string
  receiptMovementIds: string[]
  supplierReturnClaimIds: string[]
  supplierCreditNoteIds: string[]
  physicalReturnStatus: 'not_required' | 'not_dispatched'
  supplierContacted: false
  accountingPosted: false
  paymentInitiated: false
}

export type CommerceSupplierPayablesHandoff = {
  schema: typeof COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA
  status: 'review_required'
  paymentAuthority: 'none'
  paymentInitiated: false
  accountingPosted: false
  currency: 'MMK'
  generatedAt: string
  readyInvoiceCount: number
  excludedInvoiceCount: number
  excludedInvoiceIds: string[]
  grossInvoiceTotalMmk: number
  supplierCreditTotalMmk: number
  netPayableTotalMmk: number
  rows: CommerceSupplierPayablesHandoffRow[]
  digest: string
}

export type CommerceCustomerReceivablesHandoffRow = {
  orderId: string
  customer: string
  paymentMethod: string
  createdAt: string
  dueAt: string
  balanceMmk: number
  daysPastDue: number
  bucket: CommerceReceivableAgingBucket
  collectionActionCount: number
  lastCollectionAt: string | null
  lastCollectionActor: string | null
  lastCollectionEvidence: string | null
  collectionAuthorized: false
}

export type CommerceCustomerReceivablesHandoff = {
  schema: typeof COMMERCE_CUSTOMER_RECEIVABLES_HANDOFF_SCHEMA
  status: 'review_required'
  collectionAuthority: 'none'
  paymentReceived: false
  accountingPosted: false
  currency: 'MMK'
  generatedAt: string
  outstandingOrderCount: number
  overdueOrderCount: number
  totalOutstandingMmk: number
  overdueOutstandingMmk: number
  bucketTotalsMmk: Record<CommerceReceivableAgingBucket, number>
  rows: CommerceCustomerReceivablesHandoffRow[]
  digest: string
}

export type CommerceSupplierPayableAgingBucket = 'overdue' | 'due_7_days' | 'scheduled'

export type CommerceSupplierPayableAgingRow = {
  purchaseOrderId: string
  invoiceId: string
  supplier: string
  dueAt: string
  netPayableMmk: number
  daysPastDue: number
  daysUntilDue: number
  bucket: CommerceSupplierPayableAgingBucket
}

export type CommerceSupplierPayablesAging = {
  asOf: string
  rows: CommerceSupplierPayableAgingRow[]
  totalsMmk: Record<CommerceSupplierPayableAgingBucket, number>
  totalNetPayableMmk: number
  overdueInvoiceCount: number
  dueWithin7DaysInvoiceCount: number
  blockedInvoiceCount: number
  paymentAuthority: 'none'
  paymentInitiated: false
}

export type CommerceWebsiteSource = {
  fingerprint: string
  approvalId: string
  snapshotId: string
  pageId: string
  siteName: string
  pagePath: string
}

export type CommerceWebsiteIntakeStatus = 'pending_confirmation' | 'converted'

export type CommerceWebsiteIntake = {
  id: string
  createdAt: string
  status: CommerceWebsiteIntakeStatus
  source: CommerceWebsiteSource
  sku: string
  quantity: number
  itemName: string
  itemVariant?: string
  unitPrice: number
  total: number
  creation: CommerceActionProof
  snapshotDigest?: string
  conversion?: CommerceActionProof & { orderId: string }
}

export type CommerceStorefrontRequestV1 = {
  schema: 'supermega.ecommerce.order_request.v1'
  mode: 'browser-local-request'
  state: 'pending_shop_review'
  id: string
  idempotencyKey: string
  createdAt: string
  sourcePreviewDigest: string
  sourceStorefrontRevision?: number | null
  sourceStorefrontActionId?: string | null
  customerReference: string
  fulfilment: 'pickup' | 'delivery'
  currency: 'MMK'
  line: {
    sku: string
    name: string
    variant: string | null
    quantity: number
    unitPriceMmk: number
  }
  totalMmk: number
}

export type CommerceStorefrontRequestLineV2 = {
  sku: string
  name: string
  variant: string | null
  quantity: number
  unitPriceMmk: number
  lineTotalMmk: number
}

export type CommerceStorefrontCustomerProfile = {
  schema: 'supermega.ecommerce.customer_profile_snapshot.v1'
  id: string
  revision: number
  name: string
  phone: string
  savedAt: string
  previousDigest: string | null
  profileDigest: string
}

export type CommerceStorefrontDeliveryAddress = {
  schema: 'supermega.ecommerce.delivery_address_snapshot.v1'
  id: string
  revision: number
  line1: string
  township: string
  city: string
  instructions: string | null
  savedAt: string
  previousDigest: string | null
  addressDigest: string
}

export type CommerceStorefrontRequestV2 = {
  schema: 'supermega.ecommerce.order_request.v2'
  mode: 'browser-local-request'
  state: 'pending_shop_review'
  scope: string
  id: string
  idempotencyKey: string
  createdAt: string
  sourcePreviewDigest: string
  sourceStorefrontRevision: number | null
  sourceStorefrontActionId: string | null
  customerReference: string
  customerProfile?: CommerceStorefrontCustomerProfile
  deliveryAddress?: CommerceStorefrontDeliveryAddress | null
  fulfilment: 'pickup' | 'delivery'
  currency: 'MMK'
  lines: CommerceStorefrontRequestLineV2[]
  quote: {
    schema: 'supermega.ecommerce.checkout_quote.v1'
    scope: string
    quoteId: string
    idempotencyKey: string
    quotedAt: string
    expiresAt: string
    sourcePreviewDigest: string
    pimDigest: string
    currency: 'MMK'
    customerReference: string
    customerProfile?: CommerceStorefrontCustomerProfile
    deliveryAddress?: CommerceStorefrontDeliveryAddress | null
    fulfilment: 'pickup' | 'delivery'
    lines: CommerceStorefrontRequestLineV2[]
    subtotalMmk: number
    promotion: { adapter: 'shop_promotion_review'; status: 'not_requested' | 'pending_shop_review'; code: string | null; amountMmk: 0 }
    tax: { adapter: 'price_inclusive'; status: 'included'; amountMmk: 0 }
    shipping: { adapter: 'pickup' | 'shop_delivery_review'; status: 'included' | 'pending_shop_review'; amountMmk: 0 }
    payment: { adapter: 'pay_on_pickup' | 'cash_on_delivery' | 'kbzpay_manual'; status: 'not_authorized'; amountMmk: 0 }
    totalMmk: number
    quoteDigest: string
  }
  totalMmk: number
}

export type CommerceStorefrontRequest = CommerceStorefrontRequestV1 | CommerceStorefrontRequestV2

export type CommerceStorefrontOrderStage = 'waiting_shop_review' | CommerceOrderStatus

export type CommerceStorefrontOrderNextAction =
  | 'review_in_shop'
  | 'start_preparing'
  | 'mark_ready'
  | 'confirm_payment'
  | 'complete_fulfilment'
  | 'settle_refund'
  | 'none'

export type CommerceStorefrontOrderTimelineEntry = {
  request: CommerceStorefrontRequest
  order: CommerceOrder | null
  stage: CommerceStorefrontOrderStage
  paymentStatus: 'not_authorized' | CommercePaymentStatus
  refundStatus: 'none' | CommerceRefundStatus
  returnedQuantity: number
  nextAction: CommerceStorefrontOrderNextAction
}

export type CommerceStorefrontMerchandising = {
  sku: string
  featured: boolean
  collection: string
  displayName: string
  note: string
}

export type CommerceStorefrontActivation = {
  contract: 'supermega.ecommerce.activation.v1'
  packageDigest: string
  workflowTemplateId: 'social-storefront' | 'pickup-preorder' | 'wholesale-request'
  confirmedAt: string
  skus: string[]
}

export type CommerceStorefrontConfiguration = {
  schema: typeof COMMERCE_STOREFRONT_SCHEMA
  revision: number
  shopCatalogSnapshotRevision: number
  shopCatalogDigest: string
  storeName: string
  summary: string
  selectedSkus: string[]
  merchandising?: CommerceStorefrontMerchandising[]
  activation?: CommerceStorefrontActivation
  saved: CommerceActionProof
}

export type CommercePurchaseOrder = {
  id: string
  requisitionId?: string
  createdAt: string
  expectedAt?: string
  supplier: string
  sku: string
  quantityOrdered: number
  unitCostMmk?: number
  creation: CommerceActionProof
  cancellation?: CommerceActionProof
  supplierInvoice?: CommerceSupplierInvoice
  supplierReturns?: CommerceSupplierReturnClaim[]
}

export type CommercePurchaseBudgetEnvelope = {
  id: string
  createdAt: string
  budgetCode: string
  label: string
  periodStart: string
  periodEnd: string
  ceilingMmk: number
  perRequisitionLimitMmk: number
  approval: CommerceActionProof
}

export type CommerceSupplierQuote = {
  supplier: string
  quoteReference: string
  vendorApprovalReference: string
  unitCostMmk: number
  deliveryAt: string
  validUntil: string
}

export type CommerceSupplierSourcingDecision = {
  id: string
  createdAt: string
  sku: string
  quantity: number
  quotes: CommerceSupplierQuote[]
  selectedQuoteReference: string
  unitCostToleranceBasisPoints: number
  deliveryToleranceDays: number
  approval: CommerceActionProof
}

export type CommercePurchaseRequisition = {
  id: string
  budgetEnvelopeId?: string
  sourceSourcingDecisionId?: string
  createdAt: string
  expectedAt: string
  supplier: string
  sku: string
  quantityRequested: number
  unitCostMmk: number
  totalMmk: number
  sourceDecisionDigest: string
  sourceReplenishmentDigest: string
  approval: CommerceActionProof
}

export type CommerceSupplierInvoice = {
  id: string
  supplierReference: string
  issuedAt: string
  dueAt: string
  quantityInvoiced: number
  unitCostMmk: number
  totalMmk: number
  recording: CommerceActionProof
  payableReview?: CommerceActionProof
}

export type CommerceSupplierCreditNote = {
  id: string
  supplierReference: string
  issuedAt: string
  amountMmk: number
  accountingPosted: false
  recording: CommerceActionProof
}

export type CommerceSupplierReturnClaim = {
  id: string
  createdAt: string
  receiptMovementId: string
  quantityRejected: number
  reasonCode: CommercePurchaseOrderDiscrepancyCode
  claimAmountMmk: number
  internalReturnReference: string
  physicalReturnStatus: 'not_dispatched'
  supplierContacted: false
  accountingPosted: false
  authorization: CommerceActionProof
  creditNotes: CommerceSupplierCreditNote[]
}

export type CommerceSupplierReturnClaimStatus = 'awaiting_credit' | 'partially_credited' | 'credited'

export type CommerceSupplierInvoiceMatchStatus = 'awaiting_receipt' | 'supplier_credit_pending' | 'quantity_variance' | 'price_variance' | 'matched'

export type CommerceSupplierInvoiceMatch = {
  status: CommerceSupplierInvoiceMatchStatus
  orderedQuantity: number
  acceptedQuantity: number
  rejectedQuantity: number
  invoicedQuantity: number
  orderedUnitCostMmk: number
  invoicedUnitCostMmk: number
  orderedTotalMmk: number
  invoicedTotalMmk: number
  supplierClaimMmk: number
  supplierCreditMmk: number
  supplierReturnBalanceMmk: number
  netInvoiceTotalMmk: number
  acceptedTotalMmk: number
  payableReady: boolean
}

export type CommercePurchaseOrderDiscrepancyCode = 'damaged' | 'wrong_item' | 'quality_failed'

export type CommercePurchaseOrderReceiptDiscrepancy = {
  quantityRejected: number
  reasonCode: CommercePurchaseOrderDiscrepancyCode
  disposition: 'return_to_vendor'
}

export type CommercePurchaseOrderProgress = {
  received: number
  rejected: number
  delivered: number
  remaining: number
  status: 'open' | 'partially_received' | 'received' | 'received_with_discrepancy' | 'cancelled'
}

export type CommercePurchaseOrderArrivalUrgency = 'late' | 'due_soon' | 'scheduled' | 'unrecorded' | 'closed'

export type CommerceSupplierPerformanceStatus = 'attention' | 'on_track' | 'collecting'

export type CommerceSupplierPerformance = {
  supplier: string
  totalOrders: number
  activeOrders: number
  orderedUnits: number
  receivedUnits: number
  rejectedUnits: number
  openUnits: number
  lateOpenOrders: number
  completedDeliveries: number
  onTimeDeliveries: number
  lateDeliveries: number
  receiptRateBasisPoints: number
  defectRateBasisPoints: number
  onTimeRateBasisPoints: number | null
  status: CommerceSupplierPerformanceStatus
}

export type CommerceCatalogChange = {
  sku: string
  previousPrice: number
  nextPrice: number
  previousReorderAt: number
  nextReorderAt: number
  proof: CommerceActionProof
}

export type CommerceCatalogBaseline = {
  sku: string
  price: number
  reorderAt: number
  proof: CommerceActionProof
  anchorDigest: string
}

export type CommerceState = {
  schema: typeof COMMERCE_WORKSPACE_SCHEMA
  items: CommerceItem[]
  orders: CommerceOrder[]
  movements: CommerceStockMovement[]
  closes: CommerceClose[]
  catalogBaselines?: CommerceCatalogBaseline[]
  catalogChanges?: CommerceCatalogChange[]
  taxConfigurations?: CommerceTaxConfiguration[]
  accountMappingConfigurations?: CommerceAccountMappingConfiguration[]
  customerCreditPolicies?: CommerceCustomerCreditPolicy[]
  promotionPolicies?: CommercePromotionPolicy[]
  shippingPolicies?: CommerceShippingPolicy[]
  paymentPolicies?: CommercePaymentPolicy[]
  websiteIntakes?: CommerceWebsiteIntake[]
  storefrontRequests?: CommerceStorefrontRequest[]
  storefrontConfiguration?: CommerceStorefrontConfiguration
  purchaseBudgetEnvelopes?: CommercePurchaseBudgetEnvelope[]
  supplierSourcingDecisions?: CommerceSupplierSourcingDecision[]
  purchaseRequisitions?: CommercePurchaseRequisition[]
  purchaseOrders?: CommercePurchaseOrder[]
  inventoryFoundation?: ShopInventoryState
}

export type CommerceActionProof = {
  actionId: string
  capturedAt: string
  actor: string
  reason: string
  evidenceReference: string
}

export type CommerceItemUpdate = {
  sku: string
  expectedPrice: number
  nextPrice: number
  expectedReorderAt: number
  nextReorderAt: number
}

export type CommerceOrderReturnInput = {
  orderId: string
  sku: string
  quantity: number
  disposition: CommerceReturnDisposition
}

export type CommerceOrderReturnExpectation = {
  orderId: string
  sku: string
  soldQuantity: number
  returnedQuantity: number
  stockOnHand: number | null
  inventoryHeadDigest: string | null
  locationAllocations: ShopInventoryOrderReturnAllocation[] | null
  orderSnapshot: string
}

export type CommerceOrderSupportOpenInput = {
  orderId: string
  sourceIntentId: string
  sourceRequestId: string
  customerRequestedAt: string
  category: CommerceSupportCategory
  customerDescription: string
  priority: CommerceSupportPriority
  owner: string
  dueAt: string
  externalMessageSent: false
  refundStarted: false
}

export type CommerceOrderSupportOpenExpectation = {
  orderId: string
  supportCaseCount: number
  orderSnapshot: string
}

export type CommerceOrderSupportResolveInput = {
  orderId: string
  caseId: string
  outcome: CommerceSupportResolutionOutcome
  note: string
}

export type CommerceOrderSupportReopenInput = {
  orderId: string
  caseId: string
  sourceResolutionActionId: string
  owner: string
  priority: CommerceSupportPriority
  dueAt: string
  note: string
}

export type CommerceOrderSupportReopenExpectation = {
  orderId: string
  caseId: string
  orderSnapshot: string
  caseSnapshot: string
}

export type CommerceOrderSupportServiceInput = {
  orderId: string
  caseId: string
  kind: CommerceSupportServiceEventKind
  owner: string
  priority: CommerceSupportPriority
  dueAt: string
  note: string
}

export type CommerceOrderSupportServiceExpectation = {
  orderId: string
  caseId: string
  orderSnapshot: string
  caseSnapshot: string
}

export type CommerceOrderSupportResolveExpectation = {
  orderId: string
  caseId: string
  orderSnapshot: string
  caseSnapshot: string
}

export type CommerceOrderCorrectionInput = {
  orderId: string
  kind: CommerceCorrectionKind
  reasonCode: CommerceCorrectionReasonCode
  listedAmountMmk: number
}

export type CommerceOrderCorrectionExpectation = {
  orderId: string
  sourceCalculationDigest: string
  correctionCount: number
  currentBalanceMmk: number
  orderSnapshot: string
}

export type CommerceWebsiteIntakeInput = {
  id: string
  source: CommerceWebsiteSource
  sku: string
  quantity: number
}

export type CommerceWebsiteOrderInput = {
  customer: string
  fulfilmentMethod: 'pickup' | 'local_delivery'
  paymentMethod: 'cash_on_delivery' | 'manual_qr' | 'manual_bank_transfer'
  promisedAt: string
}

export type CommercePurchaseOrderInput = {
  id: string
  requisitionId?: string
  expectedAt: string
  supplier: string
  sku: string
  quantityOrdered: number
  unitCostMmk?: number
}

export type CommercePurchaseRequisitionInput = {
  id: string
  budgetEnvelopeId: string
  sourceSourcingDecisionId: string
  expectedAt: string
  supplier: string
  sku: string
  quantityRequested: number
  unitCostMmk: number
  sourceDecisionDigest: string
  sourceReplenishmentDigest: string
}

export type CommercePurchaseBudgetEnvelopeInput = {
  id: string
  budgetCode: string
  label: string
  periodStart: string
  periodEnd: string
  ceilingMmk: number
  perRequisitionLimitMmk: number
}

export type CommerceSupplierSourcingDecisionInput = Omit<CommerceSupplierSourcingDecision, 'createdAt' | 'approval'>

export type CommerceSupplierInvoiceInput = {
  id: string
  supplierReference: string
  issuedAt: string
  dueAt: string
  quantityInvoiced: number
  unitCostMmk: number
}

export type CommerceSupplierReturnClaimInput = {
  id: string
  receiptMovementId: string
  internalReturnReference: string
}

export type CommerceSupplierCreditNoteInput = {
  id: string
  supplierReference: string
  issuedAt: string
  amountMmk: number
}

export type CommercePurchaseOrderLocationReceipt = {
  receiptId: string
  stockUnitId: string
  trackingCode: string
  locationId: string
  expectedHeadDigest: string
}

export type CommerceStockLocationCount = {
  countId: string
  stockUnitId: string
  locationId: string
  expectedQuantity: number
  countedQuantity: number
  expectedHeadDigest: string
}

type CommerceStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type CommerceStorefrontConfigurationInput = {
  storeName: string
  summary: string
  selectedSkus: string[]
  shopCatalogDigest: string
  merchandising?: CommerceStorefrontMerchandising[] | null
}

type CommerceLockManager = {
  request: <T>(name: string, options: { mode: 'exclusive' }, callback: () => T | Promise<T>) => Promise<T>
}

export type CommerceWorkspaceSnapshot = {
  state: CommerceState
  source: 'current' | 'legacy' | 'seed' | 'recovery'
  error: string
}

export type CommerceWorkspaceReadSnapshot = {
  state: CommerceState
  source: 'current' | 'legacy' | 'absent' | 'recovery'
  error: string
}

export type CommerceMutationResult =
  | { ok: true; state: CommerceState; replayed: boolean }
  | { ok: false; error: string }

const orderStatuses: CommerceOrderStatus[] = ['confirmed', 'preparing', 'ready', 'completed', 'cancelled']
const paymentStatuses: CommercePaymentStatus[] = ['pending', 'reconciled']
const refundStatuses: CommerceRefundStatus[] = ['none', 'due', 'settled']
const movementKinds: CommerceStockMovementKind[] = ['opening', 'reserve', 'release', 'receipt', 'count', 'return', 'production_issue', 'production_return', 'production_receipt']
const productionMaterialUnits = new Set<CommerceProductionMaterialUnit>(['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'bag', 'roll', 'sheet', 'm', 'cm'])
const productionIssueFields = [
  'productionRequestId',
  'productionCommandDigest',
  'productionJobId',
  'productionMaterialId',
  'productionInputLotId',
  'productionQuantityMilli',
  'productionUnit',
  'conversionNote',
] as const
const purchaseReceiptDiscrepancyFields = ['rejectedQuantity', 'discrepancyCode', 'discrepancyDisposition'] as const
const purchaseOrderDiscrepancyCodes = new Set<CommercePurchaseOrderDiscrepancyCode>(['damaged', 'wrong_item', 'quality_failed'])
const productionReceiptFields = [
  'productionReleaseId',
  'productionCommandDigest',
  'productionJobId',
  'productionOutputBatchId',
  'productionReleasedAt',
  'productionSourceProduct',
] as const
const productionIssueExclusiveFields = ['productionRequestId', 'productionMaterialId', 'productionInputLotId', 'productionQuantityMilli', 'productionUnit', 'conversionNote'] as const
const productionReturnExclusiveFields = ['productionIssueActionId', 'productionReturnedQuantityMilli', 'productionReturnStockUnitId', 'productionReturnLocationId'] as const
const productionReceiptExclusiveFields = ['productionReleaseId', 'productionOutputBatchId', 'productionReleasedAt', 'productionSourceProduct'] as const
const returnDispositions: CommerceReturnDisposition[] = ['restock', 'not_restocked']
const supportCategories: CommerceSupportCategory[] = ['delivery_issue', 'item_issue', 'order_status', 'other', 'payment_question']
const supportResolutionOutcomes: CommerceSupportResolutionOutcome[] = ['information_provided', 'replacement_review_required', 'refund_review_required', 'no_action']
const supportPriorities: CommerceSupportPriority[] = ['urgent', 'high', 'normal', 'low']
const supportResponsibilityEventKinds: CommerceSupportResponsibilityEventKind[] = ['reassigned', 'escalated']
const supportCheckpointKinds: CommerceSupportCheckpointKind[] = ['acknowledged', 'first_response_ready']
const supportServiceEventKinds: CommerceSupportServiceEventKind[] = [...supportResponsibilityEventKinds, ...supportCheckpointKinds]
const correctionKinds: CommerceCorrectionKind[] = ['credit', 'debit']
const correctionReasonCodes: CommerceCorrectionReasonCode[] = ['pricing_error', 'service_recovery', 'fee_adjustment', 'other']
const websiteIntakeStatuses: CommerceWebsiteIntakeStatus[] = ['pending_confirmation', 'converted']
const closeSnapshotFields = ['businessDate', 'orderIds', 'paymentExceptionOrderIds', 'stockExceptionSkus', 'actionId', 'operator', 'reason', 'evidenceReference'] as const
const refundSettlementFields = ['refundSettledAt', 'refundSettlementActionId', 'refundSettledBy', 'refundSettlementReason', 'refundEvidenceReference'] as const
const websiteIntakeIdPattern = /^WINT-[A-Z0-9-]{8,80}$/
const websiteFingerprintPattern = /^web-[a-f0-9]{8}$/
const storefrontRequestIdPattern = /^ECR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const storefrontIdempotencyPattern = /^ECI-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const storefrontQuoteIdPattern = /^ECQ-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const storefrontCustomerIdPattern = /^CUS-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const storefrontAddressIdPattern = /^ADR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const supportIntentIdPattern = /^ESR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const supportCaseIdPattern = /^CASE-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/
const maxStorefrontRequests = 100
const maxPurchaseRequisitions = 100
const maxPurchaseOrders = 100
const maxCatalogBaselines = 500
const maxCatalogChanges = 500
const maxTaxConfigurations = 100
const maxAccountMappingConfigurations = 100
const maxCustomerCreditPolicies = 500
const maxPromotionPolicies = 200
const maxShippingPolicies = 200
const maxPaymentPolicies = 200
const maxPurchaseBudgetEnvelopes = 200
const maxSupplierSourcingDecisions = 200
const maxSupplierReturnsPerPurchaseOrder = 50
const maxSupplierCreditsPerReturn = 50
const customerCreditTerms = new Set([0, 7, 30])
const maxOrderLines = 20
const maxReturnsPerOrder = 100
const maxSupportCasesPerOrder = 100
const maxSupportServiceEventsPerCase = 100
const maxCorrectionsPerOrder = 100
const maxCollectionActionsPerOrder = 100
const closeIdPattern = /^CLOSE-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const closeActionIdPattern = /^ACT-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/
const purchaseOrderIdPattern = /^PO-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const purchaseRequisitionIdPattern = /^PR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const purchaseBudgetEnvelopeIdPattern = /^PBE-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const supplierSourcingDecisionIdPattern = /^SSD-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const purchaseBudgetCodePattern = /^[A-Z0-9][A-Z0-9_-]{2,39}$/
const supplierInvoiceIdPattern = /^PINV-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const supplierReturnIdPattern = /^SRET-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const supplierCreditIdPattern = /^SCN-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const taxCodePattern = /^[A-Z0-9][A-Z0-9_-]{0,11}$/
const taxJurisdictionCodePattern = /^[A-Z0-9][A-Z0-9_-]{1,15}$/
const externalAccountCodePattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/
const legacyCommerceAccountRoles: CommerceAccountRole[] = ['payment_clearing', 'sales_revenue', 'sales_revenue_unverified', 'tax_payable']
export const commerceAccountRoles: CommerceAccountRole[] = [...legacyCommerceAccountRoles, 'sales_adjustment', 'correction_receivable', 'correction_payable']
const isoTimestampPattern = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/
const myanmarUtcOffsetMs = (6 * 60 + 30) * 60 * 1000
const deterministicSeedNow = Date.parse('2026-07-23T08:00:00.000Z')

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`)
  return value.trim()
}

function canonicalText(value: unknown, field: string, maximum = 180) {
  const text = requiredText(value, field)
  if (value !== text || text.length > maximum) throw new Error(`${field} must be canonical text of at most ${maximum} characters.`)
  return text
}

function canonicalBlankableText(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || value !== value.trim() || value.length > maximum) {
    throw new Error(`${field} must be canonical text of at most ${maximum} characters or empty.`)
  }
  return value
}

function canonicalBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') throw new Error(`${field} must be boolean.`)
  return value
}

function compareCanonicalText(left: string, right: string) {
  const leftCodePoints = Array.from(left, (character) => character.codePointAt(0) as number)
  const rightCodePoints = Array.from(right, (character) => character.codePointAt(0) as number)
  const sharedLength = Math.min(leftCodePoints.length, rightCodePoints.length)
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftCodePoints[index] !== rightCodePoints[index]) return leftCodePoints[index] - rightCodePoints[index]
  }
  return leftCodePoints.length - rightCodePoints.length
}

export function commerceStorefrontConfigurationActionId(revision: number, shopCatalogDigest: string) {
  if (!Number.isSafeInteger(revision) || revision < 1 || !sha256DigestPattern.test(shopCatalogDigest)) {
    throw new Error('Storefront configuration action identity is invalid.')
  }
  return `ACT-STOREFRONT-R${revision}-${shopCatalogDigest.slice('sha256:'.length)}`
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function timestampMicros(value: unknown): bigint | null {
  if (typeof value !== 'string' || value !== value.trim()) return null
  const match = isoTimestampPattern.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = '', zone] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (year < 1) return null
  const local = new Date(0)
  local.setUTCFullYear(year, month - 1, day)
  local.setUTCHours(hour, minute, second, 0)
  if (local.getUTCFullYear() !== year
    || local.getUTCMonth() !== month - 1
    || local.getUTCDate() !== day
    || local.getUTCHours() !== hour
    || local.getUTCMinutes() !== minute
    || local.getUTCSeconds() !== second) return null
  const offsetMinutes = zone === 'Z'
    ? 0
    : (zone.startsWith('+') ? 1 : -1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)))
  return BigInt(local.getTime() - offsetMinutes * 60_000) * 1_000n
    + BigInt(fractionText.padEnd(6, '0'))
}

function validTimestamp(value: unknown) {
  return timestampMicros(value) !== null
}

function assertSafeInteger(value: unknown, field: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${field} must be a safe integer of at least ${minimum}.`)
}

function assertUnique(values: string[], field: string) {
  if (new Set(values).size !== values.length) throw new Error(`${field} values must be unique.`)
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const fields = Object.keys(value)
  return required.every((field) => fields.includes(field))
    && fields.every((field) => required.includes(field) || optional.includes(field))
}

function storefrontRequestLineV2(value: unknown, field: string): CommerceStorefrontRequestLineV2 {
  if (!isRecord(value) || !hasExactKeys(value, ['sku', 'name', 'variant', 'quantity', 'unitPriceMmk', 'lineTotalMmk'])) {
    throw new Error(`${field} is invalid.`)
  }
  const sku = canonicalText(value.sku, `${field}.sku`, 80)
  const name = canonicalText(value.name, `${field}.name`)
  if (value.variant !== null) canonicalText(value.variant, `${field}.variant`)
  assertSafeInteger(value.quantity, `${field}.quantity`, 1)
  if (Number(value.quantity) > 99) throw new Error(`${field}.quantity must be at most 99.`)
  assertSafeInteger(value.unitPriceMmk, `${field}.unitPriceMmk`, 1)
  assertSafeInteger(value.lineTotalMmk, `${field}.lineTotalMmk`, 1)
  if (Number(value.quantity) * Number(value.unitPriceMmk) !== value.lineTotalMmk) throw new Error(`${field}.lineTotalMmk is invalid.`)
  return { sku, name, variant: value.variant as string | null, quantity: Number(value.quantity), unitPriceMmk: Number(value.unitPriceMmk), lineTotalMmk: Number(value.lineTotalMmk) }
}

function sameStorefrontRequestLinesV2(left: CommerceStorefrontRequestLineV2[], right: CommerceStorefrontRequestLineV2[]) {
  return left.length === right.length && left.every((line, index) => {
    const other = right[index]
    return line.sku === other.sku
      && line.name === other.name
      && line.variant === other.variant
      && line.quantity === other.quantity
      && line.unitPriceMmk === other.unitPriceMmk
      && line.lineTotalMmk === other.lineTotalMmk
  })
}

function storefrontCustomerProfile(value: unknown, field: string): CommerceStorefrontCustomerProfile {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schema', 'id', 'revision', 'name', 'phone', 'savedAt', 'previousDigest', 'profileDigest',
  ]) || value.schema !== 'supermega.ecommerce.customer_profile_snapshot.v1') throw new Error(`${field} is invalid.`)
  const id = canonicalText(value.id, `${field}.id`, 40)
  const phone = canonicalText(value.phone, `${field}.phone`, 32)
  const digitCount = phone.replace(/\D/g, '').length
  if (!storefrontCustomerIdPattern.test(id)
    || !/^\+?[0-9][0-9 ()-]{5,31}$/.test(phone)
    || digitCount < 6
    || digitCount > 15
    || !validTimestamp(value.savedAt)
    || typeof value.profileDigest !== 'string'
    || !sha256DigestPattern.test(value.profileDigest)
    || value.previousDigest !== null && (typeof value.previousDigest !== 'string' || !sha256DigestPattern.test(value.previousDigest))) {
    throw new Error(`${field} identity or evidence is invalid.`)
  }
  assertSafeInteger(value.revision, `${field}.revision`, 1)
  return {
    schema: 'supermega.ecommerce.customer_profile_snapshot.v1',
    id,
    revision: Number(value.revision),
    name: canonicalText(value.name, `${field}.name`, 80),
    phone,
    savedAt: String(value.savedAt),
    previousDigest: value.previousDigest as string | null,
    profileDigest: value.profileDigest,
  }
}

function storefrontDeliveryAddress(value: unknown, field: string): CommerceStorefrontDeliveryAddress {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schema', 'id', 'revision', 'line1', 'township', 'city', 'instructions',
    'savedAt', 'previousDigest', 'addressDigest',
  ]) || value.schema !== 'supermega.ecommerce.delivery_address_snapshot.v1') throw new Error(`${field} is invalid.`)
  const id = canonicalText(value.id, `${field}.id`, 40)
  if (!storefrontAddressIdPattern.test(id)
    || !validTimestamp(value.savedAt)
    || typeof value.addressDigest !== 'string'
    || !sha256DigestPattern.test(value.addressDigest)
    || value.previousDigest !== null && (typeof value.previousDigest !== 'string' || !sha256DigestPattern.test(value.previousDigest))) {
    throw new Error(`${field} identity or evidence is invalid.`)
  }
  assertSafeInteger(value.revision, `${field}.revision`, 1)
  if (value.instructions !== null) canonicalText(value.instructions, `${field}.instructions`, 160)
  return {
    schema: 'supermega.ecommerce.delivery_address_snapshot.v1',
    id,
    revision: Number(value.revision),
    line1: canonicalText(value.line1, `${field}.line1`, 120),
    township: canonicalText(value.township, `${field}.township`, 80),
    city: canonicalText(value.city, `${field}.city`, 80),
    instructions: value.instructions as string | null,
    savedAt: String(value.savedAt),
    previousDigest: value.previousDigest as string | null,
    addressDigest: value.addressDigest,
  }
}

function storefrontRequestV2(value: Record<string, unknown>, field: string): CommerceStorefrontRequestV2 {
  const baseRequestFields = [
    'schema', 'mode', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt', 'sourcePreviewDigest',
    'sourceStorefrontRevision', 'sourceStorefrontActionId', 'customerReference', 'fulfilment', 'currency',
    'lines', 'quote', 'totalMmk',
  ]
  const structuredFields = ['customerProfile', 'deliveryAddress']
  const structured = structuredFields.some((key) => key in value)
  const requestFields = structured ? [...baseRequestFields, ...structuredFields] : baseRequestFields
  if (!hasExactKeys(value, requestFields)
    || value.schema !== 'supermega.ecommerce.order_request.v2'
    || value.mode !== 'browser-local-request'
    || value.state !== 'pending_shop_review') throw new Error(`${field} is invalid.`)
  const scope = canonicalText(value.scope, `${field}.scope`)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,179}$/.test(scope)) throw new Error(`${field}.scope is invalid.`)
  const requestId = canonicalText(value.id, `${field}.id`, 40)
  const idempotencyKey = canonicalText(value.idempotencyKey, `${field}.idempotencyKey`, 40)
  if (!storefrontRequestIdPattern.test(requestId)
    || !storefrontIdempotencyPattern.test(idempotencyKey)
    || requestId.slice(4) !== idempotencyKey.slice(4)
    || !validTimestamp(value.createdAt)
    || typeof value.sourcePreviewDigest !== 'string'
    || !sha256DigestPattern.test(value.sourcePreviewDigest)) throw new Error(`${field} identity or source is invalid.`)
  if ((value.sourceStorefrontRevision === null) !== (value.sourceStorefrontActionId === null)) throw new Error(`${field} storefront provenance is incomplete.`)
  if (value.sourceStorefrontRevision !== null) {
    assertSafeInteger(value.sourceStorefrontRevision, `${field}.sourceStorefrontRevision`, 1)
    canonicalText(value.sourceStorefrontActionId, `${field}.sourceStorefrontActionId`, 160)
  }
  canonicalText(value.customerReference, `${field}.customerReference`, 80)
  if (value.fulfilment !== 'pickup' && value.fulfilment !== 'delivery') throw new Error(`${field}.fulfilment is invalid.`)
  const customerProfile = structured ? storefrontCustomerProfile(value.customerProfile, `${field}.customerProfile`) : null
  const deliveryAddress = structured
    ? value.deliveryAddress === null ? null : storefrontDeliveryAddress(value.deliveryAddress, `${field}.deliveryAddress`)
    : null
  if (structured
    && ((value.fulfilment === 'delivery') !== Boolean(deliveryAddress)
      || Date.parse(customerProfile!.savedAt) > Date.parse(String(value.createdAt))
      || deliveryAddress && Date.parse(deliveryAddress.savedAt) > Date.parse(String(value.createdAt)))) {
    throw new Error(`${field} customer or delivery identity is invalid.`)
  }
  if (value.currency !== 'MMK' || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > maxOrderLines) throw new Error(`${field} currency or lines are invalid.`)
  const lines = value.lines.map((line, index) => storefrontRequestLineV2(line, `${field}.lines[${index}]`))
  if (lines.some((line, index) => index > 0 && compareCanonicalText(lines[index - 1].sku, line.sku) >= 0)) throw new Error(`${field}.lines must use unique canonical SKU order.`)
  const subtotalMmk = lines.reduce((total, line) => total + line.lineTotalMmk, 0)
  assertSafeInteger(subtotalMmk, `${field}.subtotalMmk`, 1)
  assertSafeInteger(value.totalMmk, `${field}.totalMmk`, 1)
  if (value.totalMmk !== subtotalMmk) throw new Error(`${field}.totalMmk is invalid.`)

  if (!isRecord(value.quote)) throw new Error(`${field}.quote is invalid.`)
  const quote = value.quote
  const baseQuoteFields = [
    'schema', 'scope', 'quoteId', 'idempotencyKey', 'quotedAt', 'expiresAt', 'sourcePreviewDigest',
    'pimDigest', 'currency', 'customerReference', 'fulfilment', 'lines', 'subtotalMmk', 'promotion',
    'tax', 'shipping', 'payment', 'totalMmk', 'quoteDigest',
  ]
  const quoteFields = structured ? [...baseQuoteFields, ...structuredFields] : baseQuoteFields
  if (!hasExactKeys(quote, quoteFields)
    || quote.schema !== 'supermega.ecommerce.checkout_quote.v1'
    || quote.scope !== scope
    || quote.idempotencyKey !== idempotencyKey
    || quote.quotedAt !== value.createdAt
    || quote.sourcePreviewDigest !== value.sourcePreviewDigest
    || quote.currency !== 'MMK'
    || quote.customerReference !== value.customerReference
    || quote.fulfilment !== value.fulfilment
    || !Array.isArray(quote.lines)) throw new Error(`${field}.quote does not match the request.`)
  if (structured) {
    const quoteCustomerProfile = storefrontCustomerProfile(quote.customerProfile, `${field}.quote.customerProfile`)
    const quoteDeliveryAddress = quote.deliveryAddress === null ? null : storefrontDeliveryAddress(quote.deliveryAddress, `${field}.quote.deliveryAddress`)
    if (JSON.stringify(quoteCustomerProfile) !== JSON.stringify(customerProfile)
      || JSON.stringify(quoteDeliveryAddress) !== JSON.stringify(deliveryAddress)) throw new Error(`${field}.quote customer identity does not match the request.`)
  }
  const quoteId = canonicalText(quote.quoteId, `${field}.quote.quoteId`, 40)
  if (!storefrontQuoteIdPattern.test(quoteId) || quoteId.slice(4) !== idempotencyKey.slice(4)) throw new Error(`${field}.quote identity is invalid.`)
  if (!validTimestamp(quote.expiresAt)
    || (timestampMicros(quote.expiresAt) as bigint) <= (timestampMicros(quote.quotedAt) as bigint)
    || (timestampMicros(quote.expiresAt) as bigint) - (timestampMicros(quote.quotedAt) as bigint) > 1_800_000_000n) throw new Error(`${field}.quote expiry is invalid.`)
  if (typeof quote.pimDigest !== 'string' || !sha256DigestPattern.test(quote.pimDigest)
    || typeof quote.quoteDigest !== 'string' || !sha256DigestPattern.test(quote.quoteDigest)) throw new Error(`${field}.quote digest is invalid.`)
  const quoteLines = quote.lines.map((line, index) => storefrontRequestLineV2(line, `${field}.quote.lines[${index}]`))
  if (!sameStorefrontRequestLinesV2(lines, quoteLines) || quote.subtotalMmk !== subtotalMmk || quote.totalMmk !== subtotalMmk) throw new Error(`${field}.quote totals or lines are invalid.`)
  if (!isRecord(quote.promotion) || !hasExactKeys(quote.promotion, ['adapter', 'status', 'code', 'amountMmk'])
    || quote.promotion.adapter !== 'shop_promotion_review' || quote.promotion.amountMmk !== 0
    || (quote.promotion.code === null ? quote.promotion.status !== 'not_requested' : quote.promotion.status !== 'pending_shop_review')) throw new Error(`${field}.quote promotion boundary is invalid.`)
  if (quote.promotion.code !== null) canonicalText(quote.promotion.code, `${field}.quote.promotion.code`, 40)
  if (!isRecord(quote.tax) || !hasExactKeys(quote.tax, ['adapter', 'status', 'amountMmk'])
    || quote.tax.adapter !== 'price_inclusive' || quote.tax.status !== 'included' || quote.tax.amountMmk !== 0) throw new Error(`${field}.quote tax boundary is invalid.`)
  if (!isRecord(quote.shipping) || !hasExactKeys(quote.shipping, ['adapter', 'status', 'amountMmk']) || quote.shipping.amountMmk !== 0
    || (value.fulfilment === 'pickup' ? quote.shipping.adapter !== 'pickup' || quote.shipping.status !== 'included' : quote.shipping.adapter !== 'shop_delivery_review' || quote.shipping.status !== 'pending_shop_review')) throw new Error(`${field}.quote shipping boundary is invalid.`)
  if (!isRecord(quote.payment) || !hasExactKeys(quote.payment, ['adapter', 'status', 'amountMmk'])
    || !['pay_on_pickup', 'cash_on_delivery', 'kbzpay_manual'].includes(String(quote.payment.adapter))
    || (quote.payment.adapter !== 'kbzpay_manual'
      && (value.fulfilment === 'pickup' ? quote.payment.adapter !== 'pay_on_pickup' : quote.payment.adapter !== 'cash_on_delivery'))
    || quote.payment.status !== 'not_authorized' || quote.payment.amountMmk !== 0) throw new Error(`${field}.quote payment boundary is invalid.`)
  return value as CommerceStorefrontRequestV2
}

function sameProof(movement: CommerceStockMovement, proof: CommerceActionProof) {
  return movement.actionId === proof.actionId
    && movement.createdAt === proof.capturedAt
    && movement.actor === proof.actor
    && movement.reason === proof.reason
    && movement.evidenceReference === proof.evidenceReference
}

function sameReturnProof(record: CommerceOrderReturn, proof: CommerceActionProof) {
  return record.actionId === proof.actionId
    && record.createdAt === proof.capturedAt
    && record.actor === proof.actor
    && record.reason === proof.reason
    && record.evidenceReference === proof.evidenceReference
}

function movementMatchesReturn(movement: CommerceStockMovement, record: CommerceOrderReturn, orderId: string) {
  return movement.id === `MOV2:${encodeURIComponent(record.actionId)}`
    && movement.kind === 'return'
    && movement.orderId === orderId
    && movement.sku === record.sku
    && movement.quantityDelta === record.quantity
    && movement.actionId === record.actionId
    && movement.createdAt === record.createdAt
    && movement.actor === record.actor
    && movement.reason === record.reason
    && movement.evidenceReference === record.evidenceReference
}

export function myanmarBusinessDate(timestamp: string) {
  return new Date(Date.parse(timestamp) + myanmarUtcOffsetMs).toISOString().slice(0, 10)
}

function sameCloseProof(close: CommerceClose, proof: CommerceActionProof) {
  return close.actionId === proof.actionId
    && close.createdAt === proof.capturedAt
    && close.operator === proof.actor
    && close.reason === proof.reason
    && close.evidenceReference === proof.evidenceReference
}

function validProof(proof: CommerceActionProof) {
  return typeof proof?.actionId === 'string'
    && typeof proof?.capturedAt === 'string'
    && typeof proof?.actor === 'string'
    && typeof proof?.reason === 'string'
    && typeof proof?.evidenceReference === 'string'
    && Boolean(
      proof.actionId.trim()
      && proof.actor.trim()
      && proof.reason.trim()
      && proof.evidenceReference.trim()
      && validTimestamp(proof.capturedAt),
    )
}

const sha256RoundConstants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotateRight(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits))
}

export function sha256Hex(source: string) {
  const input = new TextEncoder().encode(source)
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(input)
  padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  const bitLength = BigInt(input.length) * 8n
  view.setUint32(paddedLength - 8, Number(bitLength >> 32n), false)
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn), false)

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const before15 = words[index - 15]
      const before2 = words[index - 2]
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3)
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choice + sha256RoundConstants[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('')
}

function proofDigestProjection(proof: CommerceActionProof) {
  return [proof.actionId, proof.capturedAt, proof.actor, proof.reason, proof.evidenceReference]
}

export function commerceCatalogBaselineDigest(
  baseline: Omit<CommerceCatalogBaseline, 'anchorDigest'>,
) {
  return `sha256:${sha256Hex(JSON.stringify([
    'supermega.commerce.catalog-baseline.v1',
    baseline.sku,
    baseline.price,
    baseline.reorderAt,
    proofDigestProjection(baseline.proof),
  ]))}`
}

export function createCommerceCatalogBaseline(
  item: Pick<CommerceItem, 'sku' | 'price' | 'reorderAt'>,
  proof: CommerceActionProof,
): CommerceCatalogBaseline {
  const baseline = {
    sku: item.sku,
    price: item.price,
    reorderAt: item.reorderAt,
    proof: { ...proof },
  }
  return { ...baseline, anchorDigest: commerceCatalogBaselineDigest(baseline) }
}

export function commerceWebsiteIntakeSnapshotDigest(
  intake: Omit<CommerceWebsiteIntake, 'snapshotDigest' | 'conversion' | 'status'>,
) {
  return `sha256:${sha256Hex(JSON.stringify([
    'supermega.commerce.website-intake.snapshot.v1',
    intake.id,
    intake.createdAt,
    [
      intake.source.fingerprint,
      intake.source.approvalId,
      intake.source.snapshotId,
      intake.source.pageId,
      intake.source.siteName,
      intake.source.pagePath,
    ],
    intake.sku,
    intake.quantity,
    intake.itemName,
    intake.itemVariant ?? null,
    intake.unitPrice,
    intake.total,
    proofDigestProjection(intake.creation),
  ]))}`
}

function safeBalance(value: number, delta: number) {
  const next = value + delta
  return Number.isSafeInteger(next) && next >= 0 ? next : null
}

export function commerceOrderItemSummary(lines: CommerceOrderLine[]) {
  return lines.length === 1 ? lines[0].name : `${lines.length} items`
}

function reservationLinesForOrder(order: CommerceOrder) {
  if (order.lines !== undefined) return order.lines.map((line) => ({ sku: line.sku, quantity: line.quantity }))
  return order.itemSku ? [{ sku: order.itemSku, quantity: order.quantity }] : []
}

function shopInventoryAvailableBySku(foundation: ShopInventoryState, catalogSkus: string[]) {
  const totals = new Map(catalogSkus.map((sku) => [sku, 0]))
  projectShopInventory(foundation, catalogSkus).balances.forEach((balance) => {
    totals.set(balance.sku, (totals.get(balance.sku) ?? 0) + balance.availableToPromise)
  })
  return totals
}

function shopInventoryMatchesItems(foundation: ShopInventoryState, items: CommerceItem[]) {
  const catalogSkus = items.map((item) => item.sku).sort()
  const available = shopInventoryAvailableBySku(foundation, catalogSkus)
  return items.every((item) => available.get(item.sku) === item.onHand)
}

function shopInventoryOrderActionMatches(
  foundation: ShopInventoryState,
  kind: 'order_reserve' | 'order_release' | 'order_fulfil',
  orderId: string,
  proof: CommerceActionProof,
  catalogSkus: string[],
) {
  try {
    projectShopInventory(foundation, catalogSkus)
    const matches = foundation.commands.filter((command) => command.payload.kind === kind
      && command.payload.orderId === orderId
      && sameActionProof(command.payload.proof, proof))
    return matches.length === 1
  } catch {
    return false
  }
}

function shopInventoryProductionActionMatches(
  foundation: ShopInventoryState,
  request: CommerceProductionMaterialRequest,
  sku: string,
  stockQuantity: number,
  conversionNote: string,
  proof: CommerceActionProof,
  catalogSkus: string[],
) {
  try {
    projectShopInventory(foundation, catalogSkus)
    const matches = foundation.commands.filter((command) => {
      const payload = command.payload
      return payload.kind === 'production_issue'
        && payload.productionRequestId === request.requestId
        && payload.productionCommandDigest === request.sourceCommandDigest
        && payload.productionJobId === request.jobId
        && payload.productionMaterialId === request.materialId
        && payload.productionInputLotId === request.inputLotId
        && payload.productionQuantityMilli === request.quantityMilli
        && payload.productionUnit === request.unit
        && payload.sku === sku
        && payload.stockQuantity === stockQuantity
        && payload.conversionNote === conversionNote
        && sameActionProof(payload.proof, proof)
    })
    return matches.length === 1
  } catch {
    return false
  }
}

export function commerceOrderLocationAllocationPreview(state: CommerceState, order: CommerceOrder) {
  if (!state.inventoryFoundation) return []
  if (!shopInventoryMatchesItems(state.inventoryFoundation, state.items)) {
    throw new Error('Location stock has drifted from aggregate Shop stock.')
  }
  return planShopInventoryOrderAllocation(state.inventoryFoundation, {
    orderId: order.id,
    customerReference: order.customer,
    lines: reservationLinesForOrder(order),
    catalogSkus: state.items.map((item) => item.sku).sort(),
  })
}

export function createEmptyCommerce(): CommerceState {
  return { schema: COMMERCE_WORKSPACE_SCHEMA, items: [], orders: [], movements: [], closes: [], catalogBaselines: [], catalogChanges: [], promotionPolicies: [], shippingPolicies: [], paymentPolicies: [], websiteIntakes: [], storefrontRequests: [], purchaseBudgetEnvelopes: [], supplierSourcingDecisions: [], purchaseOrders: [] }
}

export function createSeedCommerce(now = deterministicSeedNow): CommerceState {
  const completedOrderAt = new Date(now - 5 * 60 * 60 * 1000).toISOString()
  const completedPaymentAt = new Date(now - 4 * 60 * 60 * 1000).toISOString()
  const completedFulfilmentAt = new Date(now - 3 * 60 * 60 * 1000).toISOString()
  const purchaseOrderAt = new Date(now - 2 * 60 * 60 * 1000).toISOString()
  const firstOrderAt = new Date(now - 54 * 60 * 1000).toISOString()
  const secondOrderAt = new Date(now - 29 * 60 * 1000).toISOString()
  const items: CommerceItem[] = [
    { sku: 'SM-1001', name: 'Daily essentials basket', onHand: 34, reorderAt: 10, price: 18500 },
    { sku: 'SM-1002', name: 'Cold drink pack', onHand: 8, reorderAt: 12, price: 6500 },
    { sku: 'SM-1003', name: 'Household refill', onHand: 21, reorderAt: 8, price: 12000 },
    { sku: 'SM-1004', name: 'Personal care set', onHand: 13, reorderAt: 6, price: 22500 },
    { sku: 'SM-CARE-01', name: 'Family care set', variant: 'Standard bundle', onHand: 14, reorderAt: 6, price: 31000 },
  ]
  const baselineProof: CommerceActionProof = {
    actionId: 'ACT-DEMO-CATALOG-BASELINE',
    capturedAt: new Date(now).toISOString(),
    actor: 'Counter operator',
    reason: 'Anchor the seeded Shop catalog values.',
    evidenceReference: 'SEED-CATALOG',
  }
  return {
    schema: COMMERCE_WORKSPACE_SCHEMA,
    items,
    orders: [
      { id: 'ORD-1042', createdAt: firstOrderAt, customer: 'May', owner: 'Counter operator', channel: 'Messenger', item: 'Daily essentials basket', itemSku: 'SM-1001', quantity: 2, payment: 'KBZPay', paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'delivery', fulfilmentReference: 'Messenger delivery review #1042', promisedAt: new Date(now + 60 * 60 * 1000).toISOString(), lines: [{ sku: 'SM-1001', name: 'Daily essentials basket', quantity: 2, unitPriceMmk: 18500 }], calculation: { schema: COMMERCE_ORDER_CALCULATION_SCHEMA, currency: 'MMK', catalogRevision: 0, subtotalMmk: 37000, taxMode: 'not_configured', taxMmk: 0, totalMmk: 37000 }, total: 37000, status: 'preparing' },
      { id: 'ORD-1041', createdAt: secondOrderAt, customer: 'Ko Aung', owner: 'Counter operator', channel: 'Phone', item: 'Household refill', itemSku: 'SM-1003', quantity: 1, payment: 'Cash on delivery', paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'delivery', fulfilmentReference: 'Phone delivery review #1041', promisedAt: new Date(now + 90 * 60 * 1000).toISOString(), lines: [{ sku: 'SM-1003', name: 'Household refill', quantity: 1, unitPriceMmk: 12000 }], calculation: { schema: COMMERCE_ORDER_CALCULATION_SCHEMA, currency: 'MMK', catalogRevision: 0, subtotalMmk: 12000, taxMode: 'not_configured', taxMmk: 0, totalMmk: 12000 }, total: 12000, status: 'ready' },
      {
        id: 'ORD-1039',
        createdAt: completedOrderAt,
        customer: 'Daw Mya',
        owner: 'Counter operator',
        channel: 'Counter',
        item: 'Personal care set',
        itemSku: 'SM-1004',
        quantity: 1,
        payment: 'Cash',
        paymentStatus: 'reconciled',
        paymentReconciledAt: completedPaymentAt,
        paymentReconciliationActionId: 'ACT-DEMO-PAY-1039',
        paymentReconciledBy: 'Counter operator',
        paymentReconciliationReason: 'Matched the counter settlement.',
        paymentEvidenceReference: 'SEED-PAY-1039',
        refundStatus: 'none',
        fulfilment: 'pickup',
        fulfilmentReference: 'Counter handoff #1039',
        promisedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        lines: [{ sku: 'SM-1004', name: 'Personal care set', quantity: 1, unitPriceMmk: 22500 }],
        calculation: { schema: COMMERCE_ORDER_CALCULATION_SCHEMA, currency: 'MMK', catalogRevision: 0, subtotalMmk: 22500, taxMode: 'not_configured', taxMmk: 0, totalMmk: 22500 },
        total: 22500,
        status: 'completed',
        completion: {
          actionId: 'ACT-DEMO-COMPLETE-1039',
          capturedAt: completedFulfilmentAt,
          actor: 'Counter operator',
          reason: 'Confirmed the counter handoff.',
          evidenceReference: 'SEED-FULFILMENT-1039',
        },
      },
    ],
    movements: [
      { id: 'MOV-ACT-DEMO-1042', actionId: 'ACT-DEMO-1042', createdAt: firstOrderAt, actor: 'Counter operator', reason: 'Seed the local Commerce walkthrough.', evidenceReference: 'SEED-ORD-1042', kind: 'reserve', sku: 'SM-1001', quantityDelta: -2, orderId: 'ORD-1042' },
      { id: 'MOV-ACT-DEMO-1041', actionId: 'ACT-DEMO-1041', createdAt: secondOrderAt, actor: 'Counter operator', reason: 'Seed the local Commerce walkthrough.', evidenceReference: 'SEED-ORD-1041', kind: 'reserve', sku: 'SM-1003', quantityDelta: -1, orderId: 'ORD-1041' },
      { id: 'MOV-ACT-DEMO-1039', actionId: 'ACT-DEMO-1039', createdAt: completedOrderAt, actor: 'Counter operator', reason: 'Seed a completed order with accountable payment and fulfilment proof.', evidenceReference: 'SEED-ORD-1039', kind: 'reserve', sku: 'SM-1004', quantityDelta: -1, orderId: 'ORD-1039' },
    ],
    closes: [],
    catalogBaselines: items.map((item) => createCommerceCatalogBaseline(item, baselineProof)),
    catalogChanges: [],
    promotionPolicies: [{
      revision: 1,
      code: 'WELCOME',
      discountBasisPoints: 1_000,
      minimumSubtotalMmk: 10_000,
      maximumDiscountMmk: 10_000,
      status: 'active',
      effectiveFrom: baselineProof.capturedAt,
      effectiveUntil: null,
      proof: {
        ...baselineProof,
        actionId: 'ACT-DEMO-PROMOTION-WELCOME',
        reason: 'Approve the sample welcome promotion for Shop review.',
        evidenceReference: 'SEED-PROMOTION-WELCOME',
      },
    }],
    shippingPolicies: [{
      revision: 1,
      zoneCode: 'YGN-CENTRAL',
      townships: ['Bahan', 'Hlaing', 'Kamayut', 'Sanchaung', 'Tamwe'],
      feeMmk: 3_000,
      promiseMinutes: 120,
      status: 'active',
      effectiveFrom: baselineProof.capturedAt,
      effectiveUntil: null,
      proof: {
        ...baselineProof,
        actionId: 'ACT-DEMO-SHIPPING-YGN-CENTRAL',
        reason: 'Approve the sample Yangon central delivery policy.',
        evidenceReference: 'SEED-SHIPPING-YGN-CENTRAL',
      },
    }],
    paymentPolicies: [
      {
        revision: 3,
        adapter: 'kbzpay_manual',
        allowedFulfilments: ['delivery', 'pickup'],
        maximumOrderMmk: 5_000_000,
        instructions: 'Confirm the exact KBZPay reference in Shop before reconciliation.',
        status: 'active', effectiveFrom: baselineProof.capturedAt, effectiveUntil: null,
        proof: { ...baselineProof, actionId: 'ACT-DEMO-PAYMENT-KBZPAY', reason: 'Approve manual KBZPay review for the sample store.', evidenceReference: 'SEED-PAYMENT-KBZPAY' },
      },
      {
        revision: 2,
        adapter: 'cash_on_delivery',
        allowedFulfilments: ['delivery'],
        maximumOrderMmk: 500_000,
        instructions: 'Collect at delivery and reconcile the courier cash handoff in Shop.',
        status: 'active', effectiveFrom: baselineProof.capturedAt, effectiveUntil: null,
        proof: { ...baselineProof, actionId: 'ACT-DEMO-PAYMENT-COD', reason: 'Approve bounded cash on delivery for the sample store.', evidenceReference: 'SEED-PAYMENT-COD' },
      },
      {
        revision: 1,
        adapter: 'pay_on_pickup',
        allowedFulfilments: ['pickup'],
        maximumOrderMmk: null,
        instructions: 'Collect and reconcile payment at the Shop pickup handoff.',
        status: 'active', effectiveFrom: baselineProof.capturedAt, effectiveUntil: null,
        proof: { ...baselineProof, actionId: 'ACT-DEMO-PAYMENT-PICKUP', reason: 'Approve payment on pickup for the sample store.', evidenceReference: 'SEED-PAYMENT-PICKUP' },
      },
    ],
    websiteIntakes: [],
    storefrontRequests: [],
    purchaseBudgetEnvelopes: [{
      id: 'PBE-22222222-2222-4222-8222-222222222222',
      createdAt: baselineProof.capturedAt,
      budgetCode: 'SHOP-STOCK',
      label: 'Stock replenishment',
      periodStart: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString(),
      ceilingMmk: 5_000_000,
      perRequisitionLimitMmk: 1_000_000,
      approval: {
        ...baselineProof,
        actionId: 'ACT-DEMO-PURCHASE-BUDGET',
        reason: 'Approve a bounded sample stock-replenishment budget.',
        evidenceReference: 'SEED-PURCHASE-BUDGET',
      },
    }],
    purchaseOrders: [{
      id: 'PO-11111111-1111-4111-8111-111111111111',
      createdAt: purchaseOrderAt,
      expectedAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      supplier: 'Myanmar Beverage Supply',
      sku: 'SM-1002',
      quantityOrdered: 40,
      unitCostMmk: 4_200,
      creation: {
        actionId: 'ACT-DEMO-PO-1001',
        capturedAt: purchaseOrderAt,
        actor: 'Purchasing lead',
        reason: 'Replenish the low-stock cold drink pack.',
        evidenceReference: 'SEED-PO-1001',
      },
    }],
  }
}

function sameAccountableActor(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

// Recovers the instant a seeded workspace was generated at, so pristine-workspace checks compare
// against a seed rebuilt at that instant instead of assuming a fixed one. The catalog baseline
// proof is captured at exactly the seed instant, so no offset arithmetic is involved.
export function commerceSeedAnchor(state: CommerceState) {
  const baseline = state.catalogBaselines?.find((candidate) => candidate.proof.actionId === 'ACT-DEMO-CATALOG-BASELINE')
  if (!baseline) return null
  const anchor = Date.parse(baseline.proof.capturedAt)
  return Number.isFinite(anchor) ? anchor : null
}

export function upgradeCommerceSeedPolicies(stateValue: CommerceState) {
  const state = validateCommerceState(stateValue)
  const baseline = state.catalogBaselines?.find((candidate) => candidate.proof.actionId === 'ACT-DEMO-CATALOG-BASELINE')
  const baselineTime = baseline ? Date.parse(baseline.proof.capturedAt) : Number.NaN
  if (!baseline || Number.isNaN(baselineTime)) return state
  const seed = createSeedCommerce(baselineTime)
  const needsPromotion = (state.promotionPolicies?.length ?? 0) === 0
  const needsShipping = (state.shippingPolicies?.length ?? 0) === 0
  const needsPayment = (state.paymentPolicies?.length ?? 0) === 0
  const needsPurchaseBudget = (state.purchaseBudgetEnvelopes?.length ?? 0) === 0
  let needsOrderContract = false
  const upgradedOrders = state.orders.map((order) => {
    const seedOrder = seed.orders.find((candidate) => candidate.id === order.id)
    const seededReserve = state.movements.find((movement) => movement.kind === 'reserve'
      && movement.orderId === order.id
      && movement.actionId === `ACT-DEMO-${order.id.slice(4)}`)
    if (!seedOrder?.lines
      || !seedOrder.fulfilment
      || !seedOrder.fulfilmentReference
      || order.lines !== undefined
      || order.fulfilment !== undefined
      || order.fulfilmentReference !== undefined
      || order.customer !== seedOrder.customer
      || order.item !== seedOrder.item
      || order.itemSku !== seedOrder.itemSku
      || order.quantity !== seedOrder.quantity
      || order.total !== seedOrder.total
      || !seededReserve) return order
    needsOrderContract = true
    return {
      ...order,
      fulfilment: seedOrder.fulfilment,
      fulfilmentReference: seedOrder.fulfilmentReference,
      lines: seedOrder.lines,
    }
  })
  if (!needsPromotion && !needsShipping && !needsPayment && !needsPurchaseBudget && !needsOrderContract) return state
  return validateCommerceState({
    ...state,
    ...(needsOrderContract ? { orders: upgradedOrders } : {}),
    ...(needsPromotion ? { promotionPolicies: seed.promotionPolicies } : {}),
    ...(needsShipping ? { shippingPolicies: seed.shippingPolicies } : {}),
    ...(needsPayment ? { paymentPolicies: seed.paymentPolicies } : {}),
    ...(needsPurchaseBudget ? { purchaseBudgetEnvelopes: seed.purchaseBudgetEnvelopes } : {}),
  })
}

export function validateCommerceState(value: unknown): CommerceState {
  if (!isRecord(value) || value.schema !== COMMERCE_WORKSPACE_SCHEMA) throw new Error('Commerce workspace schema is not v2.')
  if (!Array.isArray(value.items) || !Array.isArray(value.orders) || !Array.isArray(value.movements) || !Array.isArray(value.closes)) throw new Error('Commerce workspace collections are incomplete.')
  if (value.catalogBaselines !== undefined && !Array.isArray(value.catalogBaselines)) throw new Error('Commerce catalog baselines must be an array when present.')
  if (value.catalogChanges !== undefined && !Array.isArray(value.catalogChanges)) throw new Error('Commerce catalog changes must be an array when present.')
  if (value.taxConfigurations !== undefined && !Array.isArray(value.taxConfigurations)) throw new Error('Commerce tax configurations must be an array when present.')
  if (value.accountMappingConfigurations !== undefined && !Array.isArray(value.accountMappingConfigurations)) throw new Error('Commerce account mapping configurations must be an array when present.')
  if (value.customerCreditPolicies !== undefined && !Array.isArray(value.customerCreditPolicies)) throw new Error('Commerce customer credit policies must be an array when present.')
  if (value.promotionPolicies !== undefined && !Array.isArray(value.promotionPolicies)) throw new Error('Commerce promotion policies must be an array when present.')
  if (value.shippingPolicies !== undefined && !Array.isArray(value.shippingPolicies)) throw new Error('Commerce shipping policies must be an array when present.')
  if (value.paymentPolicies !== undefined && !Array.isArray(value.paymentPolicies)) throw new Error('Commerce payment policies must be an array when present.')
  if (value.websiteIntakes !== undefined && !Array.isArray(value.websiteIntakes)) throw new Error('Commerce Website intakes must be an array when present.')
  if (value.storefrontRequests !== undefined && !Array.isArray(value.storefrontRequests)) throw new Error('Commerce storefront requests must be an array when present.')
  if (value.storefrontConfiguration !== undefined && !isRecord(value.storefrontConfiguration)) throw new Error('Commerce storefront configuration must be an object when present.')
  if (value.purchaseBudgetEnvelopes !== undefined && !Array.isArray(value.purchaseBudgetEnvelopes)) throw new Error('Commerce purchase budget envelopes must be an array when present.')
  if (value.supplierSourcingDecisions !== undefined && !Array.isArray(value.supplierSourcingDecisions)) throw new Error('Commerce supplier sourcing decisions must be an array when present.')
  if (value.purchaseRequisitions !== undefined && !Array.isArray(value.purchaseRequisitions)) throw new Error('Commerce purchase requisitions must be an array when present.')
  if (value.purchaseOrders !== undefined && !Array.isArray(value.purchaseOrders)) throw new Error('Commerce purchase orders must be an array when present.')
  if (value.inventoryFoundation !== undefined) {
    const inventory = value.inventoryFoundation
    if (!isRecord(inventory)
      || !hasExactKeys(inventory, ['schema', 'revision', 'headDigest', 'commands'])
      || inventory.schema !== 'supermega.shop.inventory_foundation.v1'
      || !Number.isSafeInteger(inventory.revision)
      || Number(inventory.revision) < 1
      || !Array.isArray(inventory.commands)
      || inventory.commands.length !== inventory.revision
      || inventory.commands.length > 2_000
      || typeof inventory.headDigest !== 'string'
      || !sha256DigestPattern.test(inventory.headDigest)) {
      throw new Error('Commerce location inventory envelope is invalid.')
    }
  }

  const items = value.items as unknown[]
  const orders = value.orders as unknown[]
  const movements = value.movements as unknown[]
  const closes = value.closes as unknown[]
  const catalogBaselines = (value.catalogBaselines ?? []) as unknown[]
  const catalogChanges = (value.catalogChanges ?? []) as unknown[]
  const taxConfigurations = (value.taxConfigurations ?? []) as unknown[]
  const accountMappingConfigurations = (value.accountMappingConfigurations ?? []) as unknown[]
  const customerCreditPolicies = (value.customerCreditPolicies ?? []) as unknown[]
  const promotionPolicies = (value.promotionPolicies ?? []) as unknown[]
  const shippingPolicies = (value.shippingPolicies ?? []) as unknown[]
  const paymentPolicies = (value.paymentPolicies ?? []) as unknown[]
  const websiteIntakes = (value.websiteIntakes ?? []) as unknown[]
  const storefrontRequests = (value.storefrontRequests ?? []) as unknown[]
  const storefrontConfiguration = value.storefrontConfiguration
  const purchaseBudgetEnvelopes = (value.purchaseBudgetEnvelopes ?? []) as unknown[]
  const supplierSourcingDecisions = (value.supplierSourcingDecisions ?? []) as unknown[]
  const purchaseRequisitions = (value.purchaseRequisitions ?? []) as unknown[]
  const purchaseOrders = (value.purchaseOrders ?? []) as unknown[]
  if (catalogBaselines.length > maxCatalogBaselines) throw new Error(`Commerce catalog baselines cannot exceed ${maxCatalogBaselines}.`)
  if (catalogChanges.length > maxCatalogChanges) throw new Error(`Commerce catalog changes cannot exceed ${maxCatalogChanges}.`)
  if (taxConfigurations.length > maxTaxConfigurations) throw new Error(`Commerce tax configurations cannot exceed ${maxTaxConfigurations}.`)
  if (accountMappingConfigurations.length > maxAccountMappingConfigurations) throw new Error(`Commerce account mapping configurations cannot exceed ${maxAccountMappingConfigurations}.`)
  if (customerCreditPolicies.length > maxCustomerCreditPolicies) throw new Error(`Commerce customer credit policies cannot exceed ${maxCustomerCreditPolicies}.`)
  if (promotionPolicies.length > maxPromotionPolicies) throw new Error(`Commerce promotion policies cannot exceed ${maxPromotionPolicies}.`)
  if (shippingPolicies.length > maxShippingPolicies) throw new Error(`Commerce shipping policies cannot exceed ${maxShippingPolicies}.`)
  if (paymentPolicies.length > maxPaymentPolicies) throw new Error(`Commerce payment policies cannot exceed ${maxPaymentPolicies}.`)
  if (purchaseBudgetEnvelopes.length > maxPurchaseBudgetEnvelopes) throw new Error(`Commerce purchase budget envelopes cannot exceed ${maxPurchaseBudgetEnvelopes}.`)
  if (supplierSourcingDecisions.length > maxSupplierSourcingDecisions) throw new Error(`Commerce supplier sourcing decisions cannot exceed ${maxSupplierSourcingDecisions}.`)
  if (storefrontRequests.length > maxStorefrontRequests) throw new Error(`Commerce storefront requests cannot exceed ${maxStorefrontRequests}.`)
  if (purchaseRequisitions.length > maxPurchaseRequisitions) throw new Error(`Commerce purchase requisitions cannot exceed ${maxPurchaseRequisitions}.`)
  if (purchaseOrders.length > maxPurchaseOrders) throw new Error(`Commerce purchase orders cannot exceed ${maxPurchaseOrders}.`)
  const itemSkus: string[] = []
  const itemBySku = new Map<string, Record<string, unknown>>()
  const orderIds: string[] = []
  const orderById = new Map<string, Record<string, unknown>>()
  const sourceRecordIds: string[] = []
  const movementIds: string[] = []
  const movementActionIds: string[] = []
  const reconciliationActionIds: string[] = []
  const refundSettlementActionIds: string[] = []
  const advancementActionIds: string[] = []
  const completionActionIds: string[] = []
  const returnActionIds: string[] = []
  const supportActionIds: string[] = []
  const supportSourceIntentIds: string[] = []
  const correctionActionIds: string[] = []
  const collectionActionIds: string[] = []
  const orderReturns: Array<{ orderId: string; record: CommerceOrderReturn }> = []
  const closeActionIds: string[] = []
  const closeBusinessDates: string[] = []
  const closedOrderIds: string[] = []
  const websiteIntakeCreationActionIds: string[] = []
  const websiteIntakeConversionActionIds: string[] = []
  const catalogBaselineActionIds: string[] = []
  const catalogChangeActionIds: string[] = []
  const taxConfigurationActionIds: string[] = []
  const accountMappingConfigurationActionIds: string[] = []
  const customerCreditPolicyActionIds: string[] = []
  const promotionPolicyActionIds: string[] = []
  const shippingPolicyActionIds: string[] = []
  const paymentPolicyActionIds: string[] = []
  const purchaseOrderActionIds: string[] = []
  const supplierReturnIds: string[] = []
  const supplierReturnReceiptIds: string[] = []
  const supplierReturnReferences: string[] = []
  const supplierCreditIds: string[] = []
  const supplierCreditReferences: string[] = []
  const purchaseBudgetEnvelopeActionIds: string[] = []
  const purchaseBudgetEnvelopeIds: string[] = []
  const purchaseBudgetEnvelopeById = new Map<string, CommercePurchaseBudgetEnvelope>()
  const supplierSourcingDecisionActionIds: string[] = []
  const supplierSourcingDecisionIds: string[] = []
  const supplierSourcingDecisionById = new Map<string, CommerceSupplierSourcingDecision>()
  const purchaseRequisitionActionIds: string[] = []
  const purchaseRequisitionIds: string[] = []
  const purchaseRequisitionById = new Map<string, CommercePurchaseRequisition>()
  const purchaseOrderIds: string[] = []
  const supplierInvoiceIds: string[] = []
  const supplierInvoiceReferences: string[] = []
  const activePurchaseOrderSkus: string[] = []
  const purchaseOrderById = new Map<string, CommercePurchaseOrder>()
  let storefrontConfigurationActionId = ''

  for (const [index, candidate] of items.entries()) {
    if (!isRecord(candidate)) throw new Error(`items[${index}] is invalid.`)
    const sku = canonicalText(candidate.sku, `items[${index}].sku`, 80)
    itemSkus.push(sku)
    itemBySku.set(sku, candidate)
    canonicalText(candidate.name, `items[${index}].name`)
    if (candidate.nameMy !== undefined) canonicalText(candidate.nameMy, `items[${index}].nameMy`)
    if (candidate.variant !== undefined) canonicalText(candidate.variant, `items[${index}].variant`)
    assertSafeInteger(candidate.onHand, `items[${index}].onHand`)
    assertSafeInteger(candidate.reorderAt, `items[${index}].reorderAt`)
    assertSafeInteger(candidate.price, `items[${index}].price`, 1)
  }
  assertUnique(itemSkus, 'Item SKU')

  const catalogBaselineSkus: string[] = []
  const catalogBaselineBySku = new Map<string, CommerceCatalogBaseline>()
  const catalogBaselineProofByAction = new Map<string, CommerceActionProof>()
  for (const [index, candidate] of catalogBaselines.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['sku', 'price', 'reorderAt', 'proof', 'anchorDigest'],
    )) throw new Error(`catalogBaselines[${index}] is invalid.`)
    const sku = canonicalText(candidate.sku, `catalogBaselines[${index}].sku`, 80)
    if (!itemBySku.has(sku)) throw new Error(`catalogBaselines[${index}].sku is unknown.`)
    assertSafeInteger(candidate.price, `catalogBaselines[${index}].price`, 1)
    assertSafeInteger(candidate.reorderAt, `catalogBaselines[${index}].reorderAt`)
    if (!isRecord(candidate.proof)
      || !hasExactKeys(candidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.proof as CommerceActionProof)) {
      throw new Error(`catalogBaselines[${index}].proof is invalid.`)
    }
    const proof = candidate.proof as unknown as CommerceActionProof
    for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
      canonicalText(proof[field], `catalogBaselines[${index}].proof.${field}`, field === 'actionId' ? 160 : 180)
    }
    if (typeof candidate.anchorDigest !== 'string'
      || !sha256DigestPattern.test(candidate.anchorDigest)
      || candidate.anchorDigest !== commerceCatalogBaselineDigest({
        sku,
        price: Number(candidate.price),
        reorderAt: Number(candidate.reorderAt),
        proof,
      })) {
      throw new Error(`catalogBaselines[${index}].anchorDigest is invalid.`)
    }
    const priorProof = catalogBaselineProofByAction.get(proof.actionId)
    if (priorProof && !sameActionProof(priorProof, proof)) {
      throw new Error(`catalogBaselines[${index}].proof conflicts with its shared catalog command.`)
    }
    const baseline = candidate as unknown as CommerceCatalogBaseline
    catalogBaselineSkus.push(sku)
    catalogBaselineActionIds.push(proof.actionId)
    catalogBaselineBySku.set(sku, baseline)
    catalogBaselineProofByAction.set(proof.actionId, proof)
  }
  assertUnique(catalogBaselineSkus, 'Catalog baseline SKU')

  const newerCatalogChangeBySku = new Map<string, CommerceCatalogChange>()
  for (const [index, candidate] of catalogChanges.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['sku', 'previousPrice', 'nextPrice', 'previousReorderAt', 'nextReorderAt', 'proof'],
    )) throw new Error(`catalogChanges[${index}] is invalid.`)
    const sku = canonicalText(candidate.sku, `catalogChanges[${index}].sku`, 80)
    const item = itemBySku.get(sku)
    if (!item) throw new Error(`catalogChanges[${index}].sku is unknown.`)
    assertSafeInteger(candidate.previousPrice, `catalogChanges[${index}].previousPrice`, 1)
    assertSafeInteger(candidate.nextPrice, `catalogChanges[${index}].nextPrice`, 1)
    assertSafeInteger(candidate.previousReorderAt, `catalogChanges[${index}].previousReorderAt`)
    assertSafeInteger(candidate.nextReorderAt, `catalogChanges[${index}].nextReorderAt`)
    if (candidate.previousPrice === candidate.nextPrice
      && candidate.previousReorderAt === candidate.nextReorderAt) {
      throw new Error(`catalogChanges[${index}] cannot record an unchanged item.`)
    }
    if (!isRecord(candidate.proof)
      || !hasExactKeys(candidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.proof as CommerceActionProof)) {
      throw new Error(`catalogChanges[${index}].proof is invalid.`)
    }
    const proof = candidate.proof as unknown as CommerceActionProof
    for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
      canonicalText(proof[field], `catalogChanges[${index}].proof.${field}`, field === 'actionId' ? 160 : 180)
    }
    const change = candidate as unknown as CommerceCatalogChange
    const newer = newerCatalogChangeBySku.get(sku)
    if (!newer) {
      if (item.price !== change.nextPrice || item.reorderAt !== change.nextReorderAt) {
        throw new Error(`catalogChanges[${index}] does not match the current catalog item.`)
      }
    } else if (newer.previousPrice !== change.nextPrice
      || newer.previousReorderAt !== change.nextReorderAt
      || (timestampMicros(newer.proof.capturedAt) as bigint) < (timestampMicros(change.proof.capturedAt) as bigint)) {
      throw new Error(`catalogChanges[${index}] breaks the newest-first item history.`)
    }
    newerCatalogChangeBySku.set(sku, change)
    catalogChangeActionIds.push(proof.actionId)
  }
  for (const [sku, oldestChange] of newerCatalogChangeBySku) {
    const baseline = catalogBaselineBySku.get(sku)
    if (!baseline) throw new Error(`Catalog change history for ${sku} has no anchored baseline.`)
    if (baseline.price !== oldestChange.previousPrice
      || baseline.reorderAt !== oldestChange.previousReorderAt
      || (timestampMicros(baseline.proof.capturedAt) as bigint) > (timestampMicros(oldestChange.proof.capturedAt) as bigint)) {
      throw new Error(`Catalog change history for ${sku} does not start from its anchored baseline.`)
    }
  }
  for (const [sku, baseline] of catalogBaselineBySku) {
    if (newerCatalogChangeBySku.has(sku)) continue
    const item = itemBySku.get(sku) as Record<string, unknown>
    if (item.price !== baseline.price || item.reorderAt !== baseline.reorderAt) {
      throw new Error(`Catalog baseline for ${sku} does not match the unchanged catalog item.`)
    }
  }

  let newerTaxConfiguration: CommerceTaxConfiguration | null = null
  for (const [index, candidate] of taxConfigurations.entries()) {
    const legacyShape = isRecord(candidate) && hasExactKeys(
      candidate,
      ['revision', 'code', 'label', 'rateBasisPoints', 'mode', 'proof'],
    )
    const scheduledShape = isRecord(candidate) && hasExactKeys(
      candidate,
      ['revision', 'code', 'label', 'rateBasisPoints', 'mode', 'jurisdictionCode', 'effectiveFrom', 'proof'],
    )
    if (!legacyShape && !scheduledShape) throw new Error(`taxConfigurations[${index}] is invalid.`)
    assertSafeInteger(candidate.revision, `taxConfigurations[${index}].revision`, 1)
    if (candidate.revision !== taxConfigurations.length - index) {
      throw new Error(`taxConfigurations[${index}].revision breaks the newest-first sequence.`)
    }
    const code = canonicalText(candidate.code, `taxConfigurations[${index}].code`, 12)
    if (!taxCodePattern.test(code)) throw new Error(`taxConfigurations[${index}].code is invalid.`)
    canonicalText(candidate.label, `taxConfigurations[${index}].label`, 80)
    assertSafeInteger(candidate.rateBasisPoints, `taxConfigurations[${index}].rateBasisPoints`)
    if (Number(candidate.rateBasisPoints) > 10_000) throw new Error(`taxConfigurations[${index}].rateBasisPoints must be at most 10000.`)
    if (candidate.mode !== 'exclusive' && candidate.mode !== 'inclusive') throw new Error(`taxConfigurations[${index}].mode is invalid.`)
    if (!isRecord(candidate.proof)
      || !hasExactKeys(candidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.proof as CommerceActionProof)) {
      throw new Error(`taxConfigurations[${index}].proof is invalid.`)
    }
    const configuration = candidate as unknown as CommerceTaxConfiguration
    if (scheduledShape) {
      const jurisdictionCode = canonicalText(configuration.jurisdictionCode, `taxConfigurations[${index}].jurisdictionCode`, 16)
      if (!taxJurisdictionCodePattern.test(jurisdictionCode)) throw new Error(`taxConfigurations[${index}].jurisdictionCode is invalid.`)
      if (!validTimestamp(configuration.effectiveFrom)
        || (timestampMicros(configuration.effectiveFrom) as bigint) < (timestampMicros(configuration.proof.capturedAt) as bigint)) {
        throw new Error(`taxConfigurations[${index}].effectiveFrom must be at or after its review proof.`)
      }
    }
    for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
      canonicalText(configuration.proof[field], `taxConfigurations[${index}].proof.${field}`, field === 'actionId' ? 160 : 180)
    }
    if (newerTaxConfiguration
      && (timestampMicros(newerTaxConfiguration.proof.capturedAt) as bigint) < (timestampMicros(configuration.proof.capturedAt) as bigint)) {
      throw new Error(`taxConfigurations[${index}] breaks the newest-first chronology.`)
    }
    if (newerTaxConfiguration
      && (timestampMicros(newerTaxConfiguration.effectiveFrom ?? newerTaxConfiguration.proof.capturedAt) as bigint)
        < (timestampMicros(configuration.effectiveFrom ?? configuration.proof.capturedAt) as bigint)) {
      throw new Error(`taxConfigurations[${index}] breaks the newest-first effective schedule.`)
    }
    newerTaxConfiguration = configuration
    taxConfigurationActionIds.push(configuration.proof.actionId)
  }

  let newerAccountMappingConfiguration: CommerceAccountMappingConfiguration | null = null
  for (const [index, candidate] of accountMappingConfigurations.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['revision', 'mappings', 'proof'])) {
      throw new Error(`accountMappingConfigurations[${index}] is invalid.`)
    }
    assertSafeInteger(candidate.revision, `accountMappingConfigurations[${index}].revision`, 1)
    if (candidate.revision !== accountMappingConfigurations.length - index) {
      throw new Error(`accountMappingConfigurations[${index}].revision breaks the newest-first sequence.`)
    }
    if (!Array.isArray(candidate.mappings)
      || (candidate.mappings.length !== legacyCommerceAccountRoles.length
        && candidate.mappings.length !== commerceAccountRoles.length
        && candidate.mappings.length !== ledgerAccountRoles.length)) {
      throw new Error(`accountMappingConfigurations[${index}].mappings must cover every account role exactly once.`)
    }
    const expectedAccountRoles: readonly LedgerAccountRole[] = candidate.mappings.length === legacyCommerceAccountRoles.length
      ? legacyCommerceAccountRoles
      : candidate.mappings.length === commerceAccountRoles.length
        ? commerceAccountRoles
        : ledgerAccountRoles
    for (const [mappingIndex, mapping] of candidate.mappings.entries()) {
      const field = `accountMappingConfigurations[${index}].mappings[${mappingIndex}]`
      if (!isRecord(mapping) || !hasExactKeys(mapping, ['accountRole', 'externalAccountCode'])
        || mapping.accountRole !== expectedAccountRoles[mappingIndex]) {
        throw new Error(`${field} must use the canonical account role order.`)
      }
      const code = canonicalText(mapping.externalAccountCode, `${field}.externalAccountCode`, 40)
      if (!externalAccountCodePattern.test(code)) throw new Error(`${field}.externalAccountCode is invalid.`)
    }
    if (!isRecord(candidate.proof)
      || !hasExactKeys(candidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.proof as CommerceActionProof)) {
      throw new Error(`accountMappingConfigurations[${index}].proof is invalid.`)
    }
    const configuration = candidate as unknown as CommerceAccountMappingConfiguration
    for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
      canonicalText(configuration.proof[field], `accountMappingConfigurations[${index}].proof.${field}`, field === 'actionId' ? 160 : 180)
    }
    if (newerAccountMappingConfiguration
      && (timestampMicros(newerAccountMappingConfiguration.proof.capturedAt) as bigint) < (timestampMicros(configuration.proof.capturedAt) as bigint)) {
      throw new Error(`accountMappingConfigurations[${index}] breaks the newest-first chronology.`)
    }
    newerAccountMappingConfiguration = configuration
    accountMappingConfigurationActionIds.push(configuration.proof.actionId)
  }

  let newerCustomerCreditPolicy: CommerceCustomerCreditPolicy | null = null
  for (const [index, candidate] of customerCreditPolicies.entries()) {
    const field = `customerCreditPolicies[${index}]`
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['revision', 'customer', 'creditLimitMmk', 'maxPaymentTermsDays', 'status', 'proof'])) {
      throw new Error(`${field} is invalid.`)
    }
    assertSafeInteger(candidate.revision, `${field}.revision`, 1)
    if (candidate.revision !== customerCreditPolicies.length - index) throw new Error(`${field}.revision breaks the newest-first sequence.`)
    canonicalText(candidate.customer, `${field}.customer`, 120)
    assertSafeInteger(candidate.creditLimitMmk, `${field}.creditLimitMmk`)
    if (!customerCreditTerms.has(Number(candidate.maxPaymentTermsDays))) throw new Error(`${field}.maxPaymentTermsDays is invalid.`)
    if (candidate.status !== 'active' && candidate.status !== 'hold') throw new Error(`${field}.status is invalid.`)
    if (!isRecord(candidate.proof)
      || !hasExactKeys(candidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.proof as CommerceActionProof)) throw new Error(`${field}.proof is invalid.`)
    const policy = candidate as unknown as CommerceCustomerCreditPolicy
    if (newerCustomerCreditPolicy
      && (timestampMicros(newerCustomerCreditPolicy.proof.capturedAt) as bigint) < (timestampMicros(policy.proof.capturedAt) as bigint)) {
      throw new Error(`${field} breaks the newest-first chronology.`)
    }
    newerCustomerCreditPolicy = policy
    customerCreditPolicyActionIds.push(policy.proof.actionId)
  }

  let newerPromotionPolicy: CommercePromotionPolicy | null = null
  for (const [index, candidate] of promotionPolicies.entries()) {
    const field = `promotionPolicies[${index}]`
    if (!isRecord(candidate) || !hasExactKeys(candidate, [
      'revision', 'code', 'discountBasisPoints', 'minimumSubtotalMmk', 'maximumDiscountMmk',
      'status', 'effectiveFrom', 'effectiveUntil', 'proof',
    ])) throw new Error(`${field} is invalid.`)
    assertSafeInteger(candidate.revision, `${field}.revision`, 1)
    if (candidate.revision !== promotionPolicies.length - index) throw new Error(`${field}.revision breaks the newest-first sequence.`)
    const code = canonicalText(candidate.code, `${field}.code`, 40)
    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(code)) throw new Error(`${field}.code is invalid.`)
    assertSafeInteger(candidate.discountBasisPoints, `${field}.discountBasisPoints`, 1)
    if (Number(candidate.discountBasisPoints) > 10_000) throw new Error(`${field}.discountBasisPoints is invalid.`)
    assertSafeInteger(candidate.minimumSubtotalMmk, `${field}.minimumSubtotalMmk`)
    assertSafeInteger(candidate.maximumDiscountMmk, `${field}.maximumDiscountMmk`, 1)
    if (candidate.status !== 'active' && candidate.status !== 'inactive') throw new Error(`${field}.status is invalid.`)
    if (!validTimestamp(candidate.effectiveFrom)
      || candidate.effectiveUntil !== null && (!validTimestamp(candidate.effectiveUntil)
        || (timestampMicros(candidate.effectiveUntil) as bigint) <= (timestampMicros(candidate.effectiveFrom) as bigint))) {
      throw new Error(`${field} effective window is invalid.`)
    }
    if (!isRecord(candidate.proof)
      || !hasExactKeys(candidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.proof as CommerceActionProof)
      || (timestampMicros(candidate.proof.capturedAt) as bigint) > (timestampMicros(candidate.effectiveFrom) as bigint)) {
      throw new Error(`${field}.proof is invalid.`)
    }
    const policy = candidate as unknown as CommercePromotionPolicy
    if (newerPromotionPolicy
      && (timestampMicros(newerPromotionPolicy.proof.capturedAt) as bigint) < (timestampMicros(policy.proof.capturedAt) as bigint)) {
      throw new Error(`${field} breaks the newest-first chronology.`)
    }
    newerPromotionPolicy = policy
    promotionPolicyActionIds.push(policy.proof.actionId)
  }

  let newerShippingPolicy: CommerceShippingPolicy | null = null
  for (const [index, candidate] of shippingPolicies.entries()) {
    const field = `shippingPolicies[${index}]`
    if (!isRecord(candidate) || !hasExactKeys(candidate, [
      'revision', 'zoneCode', 'townships', 'feeMmk', 'promiseMinutes',
      'status', 'effectiveFrom', 'effectiveUntil', 'proof',
    ])) throw new Error(`${field} is invalid.`)
    assertSafeInteger(candidate.revision, `${field}.revision`, 1)
    if (candidate.revision !== shippingPolicies.length - index) throw new Error(`${field}.revision breaks the newest-first sequence.`)
    const zoneCode = canonicalText(candidate.zoneCode, `${field}.zoneCode`, 40)
    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(zoneCode)) throw new Error(`${field}.zoneCode is invalid.`)
    if (!Array.isArray(candidate.townships) || candidate.townships.length < 1 || candidate.townships.length > 50) throw new Error(`${field}.townships is invalid.`)
    const townships = candidate.townships.map((township, townshipIndex) => canonicalText(township, `${field}.townships[${townshipIndex}]`, 80))
    if (townships.some((township, townshipIndex) => townshipIndex > 0 && townships[townshipIndex - 1].localeCompare(township, 'en', { sensitivity: 'base' }) >= 0)) throw new Error(`${field}.townships must use unique canonical order.`)
    assertSafeInteger(candidate.feeMmk, `${field}.feeMmk`)
    assertSafeInteger(candidate.promiseMinutes, `${field}.promiseMinutes`, 15)
    if (Number(candidate.promiseMinutes) > 10_080) throw new Error(`${field}.promiseMinutes is invalid.`)
    if (candidate.status !== 'active' && candidate.status !== 'inactive') throw new Error(`${field}.status is invalid.`)
    if (!validTimestamp(candidate.effectiveFrom)
      || candidate.effectiveUntil !== null && (!validTimestamp(candidate.effectiveUntil)
        || (timestampMicros(candidate.effectiveUntil) as bigint) <= (timestampMicros(candidate.effectiveFrom) as bigint))) throw new Error(`${field} effective window is invalid.`)
    if (!isRecord(candidate.proof)
      || !hasExactKeys(candidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.proof as CommerceActionProof)
      || (timestampMicros(candidate.proof.capturedAt) as bigint) > (timestampMicros(candidate.effectiveFrom) as bigint)) throw new Error(`${field}.proof is invalid.`)
    const policy = candidate as unknown as CommerceShippingPolicy
    if (newerShippingPolicy
      && (timestampMicros(newerShippingPolicy.proof.capturedAt) as bigint) < (timestampMicros(policy.proof.capturedAt) as bigint)) throw new Error(`${field} breaks the newest-first chronology.`)
    newerShippingPolicy = policy
    shippingPolicyActionIds.push(policy.proof.actionId)
  }

  let newerPaymentPolicy: CommercePaymentPolicy | null = null
  for (const [index, candidate] of paymentPolicies.entries()) {
    const field = `paymentPolicies[${index}]`
    if (!isRecord(candidate) || !hasExactKeys(candidate, [
      'revision', 'adapter', 'allowedFulfilments', 'maximumOrderMmk', 'instructions',
      'status', 'effectiveFrom', 'effectiveUntil', 'proof',
    ])) throw new Error(`${field} is invalid.`)
    assertSafeInteger(candidate.revision, `${field}.revision`, 1)
    if (candidate.revision !== paymentPolicies.length - index) throw new Error(`${field}.revision breaks the newest-first sequence.`)
    if (!['pay_on_pickup', 'cash_on_delivery', 'kbzpay_manual'].includes(String(candidate.adapter))) throw new Error(`${field}.adapter is invalid.`)
    const allowedFulfilments = candidate.allowedFulfilments
    if (!Array.isArray(allowedFulfilments) || allowedFulfilments.length < 1 || allowedFulfilments.length > 2
      || allowedFulfilments.some((value) => !['delivery', 'pickup'].includes(String(value)))
      || allowedFulfilments.some((value, fulfilmentIndex) => fulfilmentIndex > 0 && allowedFulfilments[fulfilmentIndex - 1] >= value)) throw new Error(`${field}.allowedFulfilments is invalid.`)
    if (candidate.maximumOrderMmk !== null) assertSafeInteger(candidate.maximumOrderMmk, `${field}.maximumOrderMmk`, 1)
    canonicalText(candidate.instructions, `${field}.instructions`, 240)
    if (candidate.status !== 'active' && candidate.status !== 'inactive') throw new Error(`${field}.status is invalid.`)
    if (!validTimestamp(candidate.effectiveFrom)
      || candidate.effectiveUntil !== null && (!validTimestamp(candidate.effectiveUntil)
        || (timestampMicros(candidate.effectiveUntil) as bigint) <= (timestampMicros(candidate.effectiveFrom) as bigint))) throw new Error(`${field} effective window is invalid.`)
    if (!isRecord(candidate.proof)
      || !hasExactKeys(candidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.proof as CommerceActionProof)
      || (timestampMicros(candidate.proof.capturedAt) as bigint) > (timestampMicros(candidate.effectiveFrom) as bigint)) throw new Error(`${field}.proof is invalid.`)
    const policy = candidate as unknown as CommercePaymentPolicy
    if (newerPaymentPolicy
      && (timestampMicros(newerPaymentPolicy.proof.capturedAt) as bigint) < (timestampMicros(policy.proof.capturedAt) as bigint)) throw new Error(`${field} breaks the newest-first chronology.`)
    newerPaymentPolicy = policy
    paymentPolicyActionIds.push(policy.proof.actionId)
  }

  let newerPurchaseBudgetEnvelope: CommercePurchaseBudgetEnvelope | null = null
  for (const [index, candidate] of purchaseBudgetEnvelopes.entries()) {
    const field = `purchaseBudgetEnvelopes[${index}]`
    if (!isRecord(candidate) || !hasExactKeys(candidate, [
      'id', 'createdAt', 'budgetCode', 'label', 'periodStart', 'periodEnd',
      'ceilingMmk', 'perRequisitionLimitMmk', 'approval',
    ])) throw new Error(`${field} is invalid.`)
    const id = canonicalText(candidate.id, `${field}.id`, 80)
    if (!purchaseBudgetEnvelopeIdPattern.test(id)) throw new Error(`${field}.id is invalid.`)
    const budgetCode = canonicalText(candidate.budgetCode, `${field}.budgetCode`, 40)
    if (!purchaseBudgetCodePattern.test(budgetCode) || budgetCode !== budgetCode.toUpperCase()) throw new Error(`${field}.budgetCode is invalid.`)
    canonicalText(candidate.label, `${field}.label`, 120)
    if (!validTimestamp(candidate.createdAt) || !validTimestamp(candidate.periodStart) || !validTimestamp(candidate.periodEnd)
      || (timestampMicros(candidate.periodStart) as bigint) > (timestampMicros(candidate.createdAt) as bigint)
      || (timestampMicros(candidate.createdAt) as bigint) >= (timestampMicros(candidate.periodEnd) as bigint)) throw new Error(`${field} period is invalid.`)
    assertSafeInteger(candidate.ceilingMmk, `${field}.ceilingMmk`, 1)
    assertSafeInteger(candidate.perRequisitionLimitMmk, `${field}.perRequisitionLimitMmk`, 1)
    if (Number(candidate.perRequisitionLimitMmk) > Number(candidate.ceilingMmk)) throw new Error(`${field} per-requisition limit exceeds its ceiling.`)
    if (!isRecord(candidate.approval)
      || !hasExactKeys(candidate.approval, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.approval as CommerceActionProof)
      || candidate.approval.capturedAt !== candidate.createdAt) throw new Error(`${field}.approval is invalid.`)
    const envelope = candidate as unknown as CommercePurchaseBudgetEnvelope
    if (newerPurchaseBudgetEnvelope
      && (timestampMicros(newerPurchaseBudgetEnvelope.createdAt) as bigint) < (timestampMicros(envelope.createdAt) as bigint)) throw new Error(`${field} breaks newest-first chronology.`)
    newerPurchaseBudgetEnvelope = envelope
    purchaseBudgetEnvelopeIds.push(id)
    purchaseBudgetEnvelopeActionIds.push(envelope.approval.actionId)
    purchaseBudgetEnvelopeById.set(id, envelope)
  }
  assertUnique(purchaseBudgetEnvelopeIds, 'Purchase budget envelope ID')
  for (let leftIndex = 0; leftIndex < purchaseBudgetEnvelopes.length; leftIndex += 1) {
    const left = purchaseBudgetEnvelopes[leftIndex] as CommercePurchaseBudgetEnvelope
    for (let rightIndex = leftIndex + 1; rightIndex < purchaseBudgetEnvelopes.length; rightIndex += 1) {
      const right = purchaseBudgetEnvelopes[rightIndex] as CommercePurchaseBudgetEnvelope
      if (left.budgetCode === right.budgetCode
        && (timestampMicros(left.periodStart) as bigint) < (timestampMicros(right.periodEnd) as bigint)
        && (timestampMicros(right.periodStart) as bigint) < (timestampMicros(left.periodEnd) as bigint)) throw new Error(`Purchase budget ${left.budgetCode} has overlapping envelopes.`)
    }
  }

  const supplierQuoteSources: string[] = []
  let newerSourcingDecision: CommerceSupplierSourcingDecision | null = null
  for (const [index, candidate] of supplierSourcingDecisions.entries()) {
    const field = `supplierSourcingDecisions[${index}]`
    if (!isRecord(candidate) || !hasExactKeys(candidate, [
      'id', 'createdAt', 'sku', 'quantity', 'quotes', 'selectedQuoteReference',
      'unitCostToleranceBasisPoints', 'deliveryToleranceDays', 'approval',
    ]) || !Array.isArray(candidate.quotes) || candidate.quotes.length < 1 || candidate.quotes.length > 5) throw new Error(`${field} is invalid.`)
    const id = canonicalText(candidate.id, `${field}.id`, 80)
    if (!supplierSourcingDecisionIdPattern.test(id)) throw new Error(`${field}.id is invalid.`)
    const sku = canonicalText(candidate.sku, `${field}.sku`, 80)
    if (!itemBySku.has(sku)) throw new Error(`${field}.sku is unknown.`)
    assertSafeInteger(candidate.quantity, `${field}.quantity`, 1)
    assertSafeInteger(candidate.unitCostToleranceBasisPoints, `${field}.unitCostToleranceBasisPoints`, 0)
    assertSafeInteger(candidate.deliveryToleranceDays, `${field}.deliveryToleranceDays`, 0)
    if (Number(candidate.unitCostToleranceBasisPoints) > 2_000 || Number(candidate.deliveryToleranceDays) > 30) throw new Error(`${field} tolerance is invalid.`)
    const createdAt = canonicalText(candidate.createdAt, `${field}.createdAt`, 35)
    if (!validTimestamp(createdAt) || !isRecord(candidate.approval)
      || !hasExactKeys(candidate.approval, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.approval as CommerceActionProof)
      || candidate.approval.capturedAt !== createdAt) throw new Error(`${field}.approval is invalid.`)
    const quoteReferences: string[] = []
    const suppliers: string[] = []
    for (const [quoteIndex, quoteCandidate] of candidate.quotes.entries()) {
      const quoteField = `${field}.quotes[${quoteIndex}]`
      if (!isRecord(quoteCandidate) || !hasExactKeys(quoteCandidate, [
        'supplier', 'quoteReference', 'vendorApprovalReference', 'unitCostMmk', 'deliveryAt', 'validUntil',
      ])) throw new Error(`${quoteField} is invalid.`)
      const supplier = canonicalText(quoteCandidate.supplier, `${quoteField}.supplier`, 120)
      const quoteReference = canonicalText(quoteCandidate.quoteReference, `${quoteField}.quoteReference`, 80)
      canonicalText(quoteCandidate.vendorApprovalReference, `${quoteField}.vendorApprovalReference`, 120)
      assertSafeInteger(quoteCandidate.unitCostMmk, `${quoteField}.unitCostMmk`, 1)
      if (BigInt(Number(quoteCandidate.unitCostMmk)) * BigInt(10_000 + Number(candidate.unitCostToleranceBasisPoints)) / 10_000n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${quoteField}.unitCostMmk exceeds the supported tolerance range.`)
      if (!validTimestamp(quoteCandidate.deliveryAt) || !validTimestamp(quoteCandidate.validUntil)
        || (timestampMicros(quoteCandidate.deliveryAt) as bigint) <= (timestampMicros(createdAt) as bigint)
        || (timestampMicros(quoteCandidate.validUntil) as bigint) < (timestampMicros(createdAt) as bigint)) throw new Error(`${quoteField} dates are invalid.`)
      quoteReferences.push(quoteReference)
      suppliers.push(supplier)
      supplierQuoteSources.push(`${supplier}\0${quoteReference}`)
    }
    assertUnique(quoteReferences, `${field} quote reference`)
    assertUnique(suppliers, `${field} supplier`)
    const selectedQuoteReference = canonicalText(candidate.selectedQuoteReference, `${field}.selectedQuoteReference`, 80)
    if (!quoteReferences.includes(selectedQuoteReference)) throw new Error(`${field}.selectedQuoteReference is unknown.`)
    const decision = candidate as unknown as CommerceSupplierSourcingDecision
    if (newerSourcingDecision && (timestampMicros(newerSourcingDecision.createdAt) as bigint) < (timestampMicros(createdAt) as bigint)) throw new Error(`${field} breaks newest-first chronology.`)
    newerSourcingDecision = decision
    supplierSourcingDecisionIds.push(id)
    supplierSourcingDecisionActionIds.push(decision.approval.actionId)
    supplierSourcingDecisionById.set(id, decision)
  }
  assertUnique(supplierSourcingDecisionIds, 'Supplier sourcing decision ID')
  assertUnique(supplierQuoteSources, 'Supplier quote source')

  for (const [index, candidate] of purchaseRequisitions.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, [
      'id', 'createdAt', 'expectedAt', 'supplier', 'sku', 'quantityRequested',
      'unitCostMmk', 'totalMmk', 'sourceDecisionDigest', 'sourceReplenishmentDigest', 'approval',
    ], ['budgetEnvelopeId', 'sourceSourcingDecisionId'])) throw new Error(`purchaseRequisitions[${index}] is invalid.`)
    const field = `purchaseRequisitions[${index}]`
    const id = canonicalText(candidate.id, `${field}.id`, 80)
    if (!purchaseRequisitionIdPattern.test(id)) throw new Error(`${field}.id is invalid.`)
    if (!validTimestamp(candidate.createdAt) || !validTimestamp(candidate.expectedAt)
      || (timestampMicros(candidate.expectedAt) as bigint) <= (timestampMicros(candidate.createdAt) as bigint)) throw new Error(`${field} dates are invalid.`)
    canonicalText(candidate.supplier, `${field}.supplier`, 120)
    const sku = canonicalText(candidate.sku, `${field}.sku`, 80)
    if (!itemSkus.includes(sku)) throw new Error(`${field}.sku is unknown.`)
    assertSafeInteger(candidate.quantityRequested, `${field}.quantityRequested`, 1)
    assertSafeInteger(candidate.unitCostMmk, `${field}.unitCostMmk`, 1)
    assertSafeInteger(candidate.totalMmk, `${field}.totalMmk`, 1)
    if (!Number.isSafeInteger(Number(candidate.quantityRequested) * Number(candidate.unitCostMmk))
      || candidate.totalMmk !== Number(candidate.quantityRequested) * Number(candidate.unitCostMmk)) throw new Error(`${field}.totalMmk must equal quantity times unit cost.`)
    if (typeof candidate.sourceDecisionDigest !== 'string' || !sha256DigestPattern.test(candidate.sourceDecisionDigest)
      || typeof candidate.sourceReplenishmentDigest !== 'string' || !sha256DigestPattern.test(candidate.sourceReplenishmentDigest)) throw new Error(`${field} source evidence is invalid.`)
    if (!isRecord(candidate.approval)
      || !hasExactKeys(candidate.approval, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.approval as CommerceActionProof)
      || candidate.approval.capturedAt !== candidate.createdAt) throw new Error(`${field}.approval is invalid.`)
    if (candidate.budgetEnvelopeId !== undefined) {
      const budgetEnvelopeId = canonicalText(candidate.budgetEnvelopeId, `${field}.budgetEnvelopeId`, 80)
      const envelope = purchaseBudgetEnvelopeById.get(budgetEnvelopeId)
      if (!envelope
        || (timestampMicros(candidate.createdAt) as bigint) < (timestampMicros(envelope.periodStart) as bigint)
        || (timestampMicros(candidate.createdAt) as bigint) >= (timestampMicros(envelope.periodEnd) as bigint)
        || Number(candidate.totalMmk) > envelope.perRequisitionLimitMmk) throw new Error(`${field} exceeds or falls outside its purchase budget authority.`)
    }
    if (candidate.sourceSourcingDecisionId !== undefined) {
      const sourceId = canonicalText(candidate.sourceSourcingDecisionId, `${field}.sourceSourcingDecisionId`, 80)
      const decision = supplierSourcingDecisionById.get(sourceId)
      const selected = decision?.quotes.find((quote) => quote.quoteReference === decision.selectedQuoteReference)
      const maximumUnitCost = selected && decision
        ? Number(BigInt(selected.unitCostMmk) * BigInt(10_000 + decision.unitCostToleranceBasisPoints) / 10_000n)
        : 0
      const latestDelivery = selected && decision
        ? (timestampMicros(selected.deliveryAt) as bigint) + BigInt(decision.deliveryToleranceDays) * 86_400_000_000n
        : 0n
      if (!decision || !selected || decision.sku !== sku || decision.quantity !== Number(candidate.quantityRequested)
        || selected.supplier !== candidate.supplier || Number(candidate.unitCostMmk) > maximumUnitCost
        || (timestampMicros(candidate.expectedAt) as bigint) > latestDelivery
        || (timestampMicros(candidate.createdAt) as bigint) > (timestampMicros(selected.validUntil) as bigint)) throw new Error(`${field} does not match its approved sourcing decision.`)
    }
    purchaseRequisitionIds.push(id)
    purchaseRequisitionActionIds.push(candidate.approval.actionId as string)
    purchaseRequisitionById.set(id, candidate as unknown as CommercePurchaseRequisition)
  }
  assertUnique(purchaseRequisitionIds, 'Purchase requisition ID')
  assertUnique(
    [...purchaseRequisitionById.values()].flatMap((requisition) => requisition.sourceSourcingDecisionId ? [requisition.sourceSourcingDecisionId] : []),
    'Consumed supplier sourcing decision ID',
  )

  const convertedRequisitionIds: string[] = []
  for (const [index, candidate] of purchaseOrders.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['id', 'createdAt', 'supplier', 'sku', 'quantityOrdered', 'creation'],
      ['requisitionId', 'expectedAt', 'unitCostMmk', 'cancellation', 'supplierInvoice', 'supplierReturns'],
    )) throw new Error(`purchaseOrders[${index}] is invalid.`)
    const id = canonicalText(candidate.id, `purchaseOrders[${index}].id`, 80)
    if (!purchaseOrderIdPattern.test(id)) throw new Error(`purchaseOrders[${index}].id is invalid.`)
    if (!validTimestamp(candidate.createdAt)) throw new Error(`purchaseOrders[${index}].createdAt is invalid.`)
    if (candidate.expectedAt !== undefined
      && (!validTimestamp(candidate.expectedAt)
        || (timestampMicros(candidate.expectedAt) as bigint) <= (timestampMicros(candidate.createdAt) as bigint))) {
      throw new Error(`purchaseOrders[${index}].expectedAt is invalid.`)
    }
    canonicalText(candidate.supplier, `purchaseOrders[${index}].supplier`, 120)
    const sku = canonicalText(candidate.sku, `purchaseOrders[${index}].sku`, 80)
    if (!itemSkus.includes(sku)) throw new Error(`purchaseOrders[${index}].sku is unknown.`)
    assertSafeInteger(candidate.quantityOrdered, `purchaseOrders[${index}].quantityOrdered`, 1)
    if (candidate.unitCostMmk !== undefined) assertSafeInteger(candidate.unitCostMmk, `purchaseOrders[${index}].unitCostMmk`, 1)
    let linkedRequisition: CommercePurchaseRequisition | null = null
    if (candidate.requisitionId !== undefined) {
      const requisitionId = canonicalText(candidate.requisitionId, `purchaseOrders[${index}].requisitionId`, 80)
      const requisition = purchaseRequisitionById.get(requisitionId)
      if (!requisition
        || requisition.sku !== sku
        || requisition.supplier !== candidate.supplier
        || requisition.expectedAt !== candidate.expectedAt
        || requisition.quantityRequested !== candidate.quantityOrdered
        || requisition.unitCostMmk !== candidate.unitCostMmk) throw new Error(`purchaseOrders[${index}] does not match its approved requisition.`)
      linkedRequisition = requisition
      convertedRequisitionIds.push(requisitionId)
    }
    if (!isRecord(candidate.creation)
      || !hasExactKeys(candidate.creation, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.creation as CommerceActionProof)
      || candidate.creation.capturedAt !== candidate.createdAt) {
      throw new Error(`purchaseOrders[${index}].creation is invalid.`)
    }
    if (linkedRequisition
      && ((timestampMicros(candidate.creation.capturedAt as string) as bigint) < (timestampMicros(linkedRequisition.createdAt) as bigint)
        || sameAccountableActor(candidate.creation.actor as string, linkedRequisition.approval.actor))) {
      throw new Error(`purchaseOrders[${index}] requires a later confirmation by a different operator.`)
    }
    for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
      canonicalText(candidate.creation[field], `purchaseOrders[${index}].creation.${field}`, field === 'actionId' ? 160 : 180)
    }
    purchaseOrderActionIds.push(candidate.creation.actionId as string)
    if (candidate.cancellation !== undefined) {
      if (!isRecord(candidate.cancellation)
        || !hasExactKeys(candidate.cancellation, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
        || !validProof(candidate.cancellation as CommerceActionProof)
        || (timestampMicros(candidate.cancellation.capturedAt) as bigint) < (timestampMicros(candidate.createdAt) as bigint)) {
        throw new Error(`purchaseOrders[${index}].cancellation is invalid.`)
      }
      for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
        canonicalText(candidate.cancellation[field], `purchaseOrders[${index}].cancellation.${field}`, field === 'actionId' ? 160 : 180)
      }
      purchaseOrderActionIds.push(candidate.cancellation.actionId as string)
    }
    if (candidate.supplierInvoice !== undefined) {
      const invoice = candidate.supplierInvoice
      const field = `purchaseOrders[${index}].supplierInvoice`
      if (candidate.unitCostMmk === undefined
        || !isRecord(invoice)
        || !hasExactKeys(invoice, [
          'id', 'supplierReference', 'issuedAt', 'dueAt', 'quantityInvoiced',
          'unitCostMmk', 'totalMmk', 'recording',
        ], ['payableReview'])) throw new Error(`${field} is invalid.`)
      const invoiceId = canonicalText(invoice.id, `${field}.id`, 80)
      if (!supplierInvoiceIdPattern.test(invoiceId)) throw new Error(`${field}.id is invalid.`)
      const supplierReference = canonicalText(invoice.supplierReference, `${field}.supplierReference`, 80)
      if (!validTimestamp(invoice.issuedAt)
        || !validTimestamp(invoice.dueAt)
        || (timestampMicros(invoice.issuedAt) as bigint) < (timestampMicros(candidate.createdAt) as bigint)
        || (timestampMicros(invoice.dueAt) as bigint) < (timestampMicros(invoice.issuedAt) as bigint)) {
        throw new Error(`${field} invoice dates are invalid.`)
      }
      assertSafeInteger(invoice.quantityInvoiced, `${field}.quantityInvoiced`, 1)
      assertSafeInteger(invoice.unitCostMmk, `${field}.unitCostMmk`, 1)
      assertSafeInteger(invoice.totalMmk, `${field}.totalMmk`, 1)
      if (!Number.isSafeInteger(Number(invoice.quantityInvoiced) * Number(invoice.unitCostMmk))
        || invoice.totalMmk !== Number(invoice.quantityInvoiced) * Number(invoice.unitCostMmk)) {
        throw new Error(`${field}.totalMmk must equal quantity times unit cost.`)
      }
      if (!isRecord(invoice.recording)
        || !hasExactKeys(invoice.recording, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
        || !validProof(invoice.recording as CommerceActionProof)
        || (timestampMicros(invoice.recording.capturedAt) as bigint) < (timestampMicros(invoice.issuedAt) as bigint)) {
        throw new Error(`${field}.recording is invalid.`)
      }
      for (const proofField of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
        canonicalText(invoice.recording[proofField], `${field}.recording.${proofField}`, proofField === 'actionId' ? 160 : 180)
      }
      purchaseOrderActionIds.push(invoice.recording.actionId as string)
      if (invoice.payableReview !== undefined) {
        if (!isRecord(invoice.payableReview)
          || !hasExactKeys(invoice.payableReview, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
          || !validProof(invoice.payableReview as CommerceActionProof)
          || (timestampMicros(invoice.payableReview.capturedAt) as bigint) < (timestampMicros(invoice.recording.capturedAt) as bigint)) {
          throw new Error(`${field}.payableReview is invalid.`)
        }
        purchaseOrderActionIds.push(invoice.payableReview.actionId as string)
      }
      supplierInvoiceIds.push(invoiceId)
      supplierInvoiceReferences.push(`${String(candidate.supplier)}\u0000${supplierReference}`)
    }
    if (candidate.supplierReturns !== undefined) {
      if (candidate.unitCostMmk === undefined || !Array.isArray(candidate.supplierReturns)
        || candidate.supplierReturns.length < 1 || candidate.supplierReturns.length > maxSupplierReturnsPerPurchaseOrder) {
        throw new Error(`purchaseOrders[${index}].supplierReturns is invalid.`)
      }
      let newerReturnAt: bigint | null = null
      for (const [returnIndex, returnCandidate] of candidate.supplierReturns.entries()) {
        const field = `purchaseOrders[${index}].supplierReturns[${returnIndex}]`
        if (!isRecord(returnCandidate) || !hasExactKeys(returnCandidate, [
          'id', 'createdAt', 'receiptMovementId', 'quantityRejected', 'reasonCode', 'claimAmountMmk',
          'internalReturnReference', 'physicalReturnStatus', 'supplierContacted', 'accountingPosted',
          'authorization', 'creditNotes',
        ]) || !Array.isArray(returnCandidate.creditNotes)
          || returnCandidate.creditNotes.length > maxSupplierCreditsPerReturn) throw new Error(`${field} is invalid.`)
        const returnId = canonicalText(returnCandidate.id, `${field}.id`, 80)
        if (!supplierReturnIdPattern.test(returnId)) throw new Error(`${field}.id is invalid.`)
        const createdAt = timestampMicros(returnCandidate.createdAt)
        if (createdAt === null || createdAt < (timestampMicros(candidate.createdAt) as bigint)
          || (newerReturnAt !== null && createdAt > newerReturnAt)) throw new Error(`${field}.createdAt is outside the purchase chronology.`)
        newerReturnAt = createdAt
        const receiptMovementId = canonicalText(returnCandidate.receiptMovementId, `${field}.receiptMovementId`, 2_000)
        assertSafeInteger(returnCandidate.quantityRejected, `${field}.quantityRejected`, 1)
        if (!purchaseOrderDiscrepancyCodes.has(returnCandidate.reasonCode as CommercePurchaseOrderDiscrepancyCode)) throw new Error(`${field}.reasonCode is invalid.`)
        assertSafeInteger(returnCandidate.claimAmountMmk, `${field}.claimAmountMmk`, 1)
        const internalReference = canonicalText(returnCandidate.internalReturnReference, `${field}.internalReturnReference`, 80)
        if (returnCandidate.physicalReturnStatus !== 'not_dispatched'
          || returnCandidate.supplierContacted !== false || returnCandidate.accountingPosted !== false
          || !isRecord(returnCandidate.authorization)
          || !hasExactKeys(returnCandidate.authorization, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
          || !validProof(returnCandidate.authorization as CommerceActionProof)
          || returnCandidate.authorization.capturedAt !== returnCandidate.createdAt) throw new Error(`${field} overclaims return execution or has invalid authorization.`)
        purchaseOrderActionIds.push(returnCandidate.authorization.actionId as string)
        let creditedMmk = 0
        let newerCreditAt: bigint | null = null
        for (const [creditIndex, creditCandidate] of returnCandidate.creditNotes.entries()) {
          const creditField = `${field}.creditNotes[${creditIndex}]`
          if (!isRecord(creditCandidate) || !hasExactKeys(creditCandidate, [
            'id', 'supplierReference', 'issuedAt', 'amountMmk', 'accountingPosted', 'recording',
          ])) throw new Error(`${creditField} is invalid.`)
          const creditId = canonicalText(creditCandidate.id, `${creditField}.id`, 80)
          if (!supplierCreditIdPattern.test(creditId)) throw new Error(`${creditField}.id is invalid.`)
          const supplierReference = canonicalText(creditCandidate.supplierReference, `${creditField}.supplierReference`, 80)
          const issuedAt = timestampMicros(creditCandidate.issuedAt)
          assertSafeInteger(creditCandidate.amountMmk, `${creditField}.amountMmk`, 1)
          if (issuedAt === null || issuedAt < createdAt || creditCandidate.accountingPosted !== false
            || !isRecord(creditCandidate.recording)
            || !hasExactKeys(creditCandidate.recording, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
            || !validProof(creditCandidate.recording as CommerceActionProof)
            || (timestampMicros(creditCandidate.recording.capturedAt) as bigint) < issuedAt
            || (newerCreditAt !== null && (timestampMicros(creditCandidate.recording.capturedAt) as bigint) > newerCreditAt)) throw new Error(`${creditField} is outside the claim chronology or overclaims posting.`)
          newerCreditAt = timestampMicros(creditCandidate.recording.capturedAt) as bigint
          creditedMmk += Number(creditCandidate.amountMmk)
          if (!Number.isSafeInteger(creditedMmk) || creditedMmk > Number(returnCandidate.claimAmountMmk)) throw new Error(`${field} supplier credits exceed the authorized claim.`)
          purchaseOrderActionIds.push(creditCandidate.recording.actionId as string)
          supplierCreditIds.push(creditId)
          supplierCreditReferences.push(`${String(candidate.supplier)}\u0000${supplierReference}`)
        }
        supplierReturnIds.push(returnId)
        supplierReturnReceiptIds.push(receiptMovementId)
        supplierReturnReferences.push(`${String(candidate.supplier)}\u0000${internalReference}`)
      }
    }
    purchaseOrderIds.push(id)
    purchaseOrderById.set(id, candidate as unknown as CommercePurchaseOrder)
  }
  assertUnique(purchaseOrderIds, 'Purchase order ID')
  assertUnique(convertedRequisitionIds, 'Converted purchase requisition ID')
  assertUnique(purchaseRequisitionIds.filter((id) => !convertedRequisitionIds.includes(id)).map((id) => purchaseRequisitionById.get(id)!.sku), 'Open purchase requisition SKU')
  const committedByBudgetEnvelope = new Map<string, number>()
  for (const requisition of purchaseRequisitionById.values()) {
    if (!requisition.budgetEnvelopeId) continue
    const linkedOrder = purchaseOrders.find((candidate) => isRecord(candidate) && candidate.requisitionId === requisition.id) as unknown as CommercePurchaseOrder | undefined
    if (linkedOrder?.cancellation) continue
    const committed = (committedByBudgetEnvelope.get(requisition.budgetEnvelopeId) ?? 0) + requisition.totalMmk
    if (!Number.isSafeInteger(committed)) throw new Error(`Purchase budget ${requisition.budgetEnvelopeId} commitment exceeds the safe integer range.`)
    committedByBudgetEnvelope.set(requisition.budgetEnvelopeId, committed)
  }
  for (const [budgetEnvelopeId, committedMmk] of committedByBudgetEnvelope) {
    const envelope = purchaseBudgetEnvelopeById.get(budgetEnvelopeId)
    if (!envelope || committedMmk > envelope.ceilingMmk) throw new Error(`Purchase budget ${budgetEnvelopeId} is overcommitted.`)
  }
  assertUnique(supplierInvoiceIds, 'Supplier invoice ID')
  assertUnique(supplierInvoiceReferences, 'Supplier invoice reference')
  assertUnique(supplierReturnIds, 'Supplier return ID')
  assertUnique(supplierReturnReceiptIds, 'Supplier return receipt movement ID')
  assertUnique(supplierReturnReferences, 'Supplier return reference')
  assertUnique(supplierCreditIds, 'Supplier credit note ID')
  assertUnique(supplierCreditReferences, 'Supplier credit note reference')

  if (storefrontConfiguration !== undefined) {
    if (!hasExactKeys(
      storefrontConfiguration,
      ['schema', 'revision', 'shopCatalogSnapshotRevision', 'shopCatalogDigest', 'storeName', 'summary', 'selectedSkus', 'saved'],
      ['activation', 'merchandising'],
    ) || storefrontConfiguration.schema !== COMMERCE_STOREFRONT_SCHEMA) {
      throw new Error('storefrontConfiguration is invalid.')
    }
    assertSafeInteger(storefrontConfiguration.revision, 'storefrontConfiguration.revision', 1)
    assertSafeInteger(storefrontConfiguration.shopCatalogSnapshotRevision, 'storefrontConfiguration.shopCatalogSnapshotRevision', 1)
    if (typeof storefrontConfiguration.shopCatalogDigest !== 'string' || !sha256DigestPattern.test(storefrontConfiguration.shopCatalogDigest)) {
      throw new Error('storefrontConfiguration.shopCatalogDigest is invalid.')
    }
    canonicalText(storefrontConfiguration.storeName, 'storefrontConfiguration.storeName', 60)
    canonicalText(storefrontConfiguration.summary, 'storefrontConfiguration.summary', 180)
    if (!Array.isArray(storefrontConfiguration.selectedSkus)
      || storefrontConfiguration.selectedSkus.length < 1
      || storefrontConfiguration.selectedSkus.length > 8) {
      throw new Error('storefrontConfiguration.selectedSkus must contain 1 to 8 Shop SKUs.')
    }
    const selectedSkus = storefrontConfiguration.selectedSkus.map((sku, index) => (
      canonicalText(sku, `storefrontConfiguration.selectedSkus[${index}]`, 80)
    ))
    assertUnique(selectedSkus, 'Storefront selected SKU')
    if (selectedSkus.some((sku) => !itemSkus.includes(sku))
      || !sameStringArray(selectedSkus, [...selectedSkus].sort(compareCanonicalText))) {
      throw new Error('storefrontConfiguration.selectedSkus must be sorted current Shop SKUs.')
    }
    if (storefrontConfiguration.merchandising !== undefined) {
      if (!Array.isArray(storefrontConfiguration.merchandising)
        || storefrontConfiguration.merchandising.length !== selectedSkus.length) {
        throw new Error('storefrontConfiguration.merchandising must cover every selected Shop SKU exactly once.')
      }
      const merchandisingSkus = storefrontConfiguration.merchandising.map((candidate, index) => {
        if (!isRecord(candidate)
          || !hasExactKeys(candidate, ['sku', 'featured', 'collection', 'displayName', 'note'])) {
          throw new Error(`storefrontConfiguration.merchandising[${index}] is invalid.`)
        }
        const sku = canonicalText(candidate.sku, `storefrontConfiguration.merchandising[${index}].sku`, 80)
        if (typeof candidate.featured !== 'boolean') {
          throw new Error(`storefrontConfiguration.merchandising[${index}].featured must be boolean.`)
        }
        canonicalText(candidate.collection, `storefrontConfiguration.merchandising[${index}].collection`, 120)
        canonicalBlankableText(candidate.displayName, `storefrontConfiguration.merchandising[${index}].displayName`, 180)
        canonicalBlankableText(candidate.note, `storefrontConfiguration.merchandising[${index}].note`, 300)
        return sku
      })
      if (!sameStringArray(merchandisingSkus, selectedSkus)) {
        throw new Error('storefrontConfiguration.merchandising must follow the canonical selected SKU order.')
      }
    }
    if (storefrontConfiguration.activation !== undefined) {
      const activation = storefrontConfiguration.activation
      if (!isRecord(activation)
        || !hasExactKeys(activation, ['contract', 'packageDigest', 'workflowTemplateId', 'confirmedAt', 'skus'])
        || activation.contract !== 'supermega.ecommerce.activation.v1'
        || typeof activation.packageDigest !== 'string'
        || !sha256DigestPattern.test(activation.packageDigest)
        || !['social-storefront', 'pickup-preorder', 'wholesale-request'].includes(String(activation.workflowTemplateId))
        || !validTimestamp(activation.confirmedAt)
        || !Array.isArray(activation.skus)
        || !activation.skus.every((sku) => typeof sku === 'string')
        || !sameStringArray(activation.skus as string[], selectedSkus)) {
        throw new Error('storefrontConfiguration.activation is invalid.')
      }
    }
    if (!isRecord(storefrontConfiguration.saved)
      || !hasExactKeys(storefrontConfiguration.saved, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(storefrontConfiguration.saved as CommerceActionProof)
      || storefrontConfiguration.saved.evidenceReference !== `ECOMMERCE-STOREFRONT:${storefrontConfiguration.shopCatalogDigest}:R${storefrontConfiguration.revision}`) {
      throw new Error('storefrontConfiguration.saved is invalid.')
    }
    const saved = storefrontConfiguration.saved as CommerceActionProof
    storefrontConfigurationActionId = canonicalText(saved.actionId, 'storefrontConfiguration.saved.actionId', 160)
    if (storefrontConfigurationActionId !== commerceStorefrontConfigurationActionId(
      storefrontConfiguration.revision as number,
      storefrontConfiguration.shopCatalogDigest,
    )) {
      throw new Error('storefrontConfiguration.saved.actionId is invalid.')
    }
    if (!validTimestamp(saved.capturedAt)) throw new Error('storefrontConfiguration.saved.capturedAt is invalid.')
    for (const field of ['actor', 'reason', 'evidenceReference'] as const) {
      canonicalText(saved[field], `storefrontConfiguration.saved.${field}`)
    }
  }

  for (const [index, candidate] of orders.entries()) {
    if (!isRecord(candidate)) throw new Error(`orders[${index}] is invalid.`)
    orderIds.push(requiredText(candidate.id, `orders[${index}].id`))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`orders[${index}].createdAt is invalid.`)
    for (const field of ['customer', 'channel', 'item', 'payment'] as const) requiredText(candidate[field], `orders[${index}].${field}`)
    if (candidate.owner !== undefined) canonicalText(candidate.owner, `orders[${index}].owner`, 120)
    if (candidate.itemSku !== undefined && !itemSkus.includes(requiredText(candidate.itemSku, `orders[${index}].itemSku`))) throw new Error(`orders[${index}].itemSku is unknown.`)
    assertSafeInteger(candidate.quantity, `orders[${index}].quantity`, 1)
    assertSafeInteger(candidate.total, `orders[${index}].total`)
    let capturedLineSubtotal: number | null = null
    if (candidate.lines !== undefined) {
      if (!Array.isArray(candidate.lines) || candidate.lines.length < 1 || candidate.lines.length > maxOrderLines) throw new Error(`orders[${index}].lines must contain 1 to ${maxOrderLines} entries.`)
      const lineSkus: string[] = []
      let capturedQuantity = 0
      let capturedTotal = 0
      for (const [lineIndex, lineCandidate] of candidate.lines.entries()) {
        if (!isRecord(lineCandidate) || !hasExactKeys(lineCandidate, ['sku', 'name', 'quantity', 'unitPriceMmk'], ['variant'])) throw new Error(`orders[${index}].lines[${lineIndex}] is invalid.`)
        const lineSku = canonicalText(lineCandidate.sku, `orders[${index}].lines[${lineIndex}].sku`, 80)
        if (!itemSkus.includes(lineSku)) throw new Error(`orders[${index}].lines[${lineIndex}].sku is unknown.`)
        canonicalText(lineCandidate.name, `orders[${index}].lines[${lineIndex}].name`)
        if (lineCandidate.variant !== undefined) canonicalText(lineCandidate.variant, `orders[${index}].lines[${lineIndex}].variant`)
        assertSafeInteger(lineCandidate.quantity, `orders[${index}].lines[${lineIndex}].quantity`, 1)
        assertSafeInteger(lineCandidate.unitPriceMmk, `orders[${index}].lines[${lineIndex}].unitPriceMmk`, 1)
        const nextQuantity = capturedQuantity + Number(lineCandidate.quantity)
        const lineTotal = Number(lineCandidate.quantity) * Number(lineCandidate.unitPriceMmk)
        const nextTotal = capturedTotal + lineTotal
        if (!Number.isSafeInteger(nextQuantity) || !Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(nextTotal)) throw new Error(`orders[${index}].lines exceed the safe integer limit.`)
        capturedQuantity = nextQuantity
        capturedTotal = nextTotal
        lineSkus.push(lineSku)
      }
      assertUnique(lineSkus, `orders[${index}] line SKU`)
      capturedLineSubtotal = capturedTotal
      const capturedLines = candidate.lines as CommerceOrderLine[]
      const expectedItemSku = capturedLines.length === 1 ? capturedLines[0].sku : undefined
      if (candidate.item !== commerceOrderItemSummary(capturedLines)
        || candidate.itemSku !== expectedItemSku
        || candidate.quantity !== capturedQuantity) throw new Error(`orders[${index}] does not match its immutable line snapshots.`)
    }
    let pricedSubtotal = capturedLineSubtotal
    if (candidate.promotionDecision !== undefined) {
      const field = `orders[${index}].promotionDecision`
      if (!isRecord(candidate.promotionDecision) || !hasExactKeys(candidate.promotionDecision, [
        'schema', 'status', 'code', 'policyRevision', 'policyActionId', 'discountBasisPoints',
        'grossSubtotalMmk', 'discountMmk', 'netSubtotalMmk', 'reviewedAt', 'reason',
      ]) || capturedLineSubtotal === null || !String(candidate.sourceRecordId ?? '').startsWith('ECR-')) {
        throw new Error(`${field} is invalid.`)
      }
      const decision = candidate.promotionDecision as unknown as CommercePromotionDecision
      const expected = commercePromotionDecision(
        promotionPolicies as CommercePromotionPolicy[],
        decision.code,
        capturedLineSubtotal,
        decision.reviewedAt,
      )
      if (!expected
        || JSON.stringify(expected) !== JSON.stringify(decision)
        || (timestampMicros(decision.reviewedAt) as bigint) > (timestampMicros(candidate.createdAt) as bigint)) {
        throw new Error(`${field} does not match the Shop price policy.`)
      }
      pricedSubtotal = decision.netSubtotalMmk
    }
    if (candidate.shippingDecision !== undefined) {
      const field = `orders[${index}].shippingDecision`
      if (!isRecord(candidate.shippingDecision) || !hasExactKeys(candidate.shippingDecision, [
        'schema', 'status', 'reason', 'township', 'zoneCode', 'policyRevision', 'policyActionId',
        'feeMmk', 'promiseMinutes', 'reviewedAt',
      ]) || pricedSubtotal === null || !String(candidate.sourceRecordId ?? '').startsWith('ECR-')) throw new Error(`${field} is invalid.`)
      const decision = candidate.shippingDecision as unknown as CommerceShippingDecision
      const expected = commerceShippingDecision(
        shippingPolicies as CommerceShippingPolicy[],
        candidate.fulfilment as 'pickup' | 'delivery',
        decision.township,
        decision.reviewedAt,
      )
      if (!expected || JSON.stringify(expected) !== JSON.stringify(decision)
        || decision.status === 'rejected'
        || (timestampMicros(decision.reviewedAt) as bigint) > (timestampMicros(candidate.createdAt) as bigint)
        || (decision.promiseMinutes !== null && candidate.promisedAt !== undefined
          && (timestampMicros(candidate.promisedAt) as bigint) < (timestampMicros(decision.reviewedAt) as bigint) + BigInt(decision.promiseMinutes) * 60_000_000n)) {
        throw new Error(`${field} does not match the Shop delivery policy.`)
      }
      const deliveredTotal = pricedSubtotal + decision.feeMmk
      if (!Number.isSafeInteger(deliveredTotal)) throw new Error(`${field} exceeds the safe MMK boundary.`)
      pricedSubtotal = deliveredTotal
    }
    let payableTotal = pricedSubtotal
    if (candidate.taxDecision !== undefined) {
      const field = `orders[${index}].taxDecision`
      if (!isRecord(candidate.taxDecision) || !hasExactKeys(candidate.taxDecision, [
        'schema', 'status', 'catalogRevision', 'taxConfigurationRevision', 'taxCode', 'taxJurisdictionCode',
        'taxEffectiveFrom', 'taxRateBasisPoints', 'taxMode', 'listedSubtotalMmk', 'subtotalMmk', 'taxMmk',
        'totalMmk', 'policyActionId', 'reviewedAt',
      ]) || pricedSubtotal === null || !String(candidate.sourceRecordId ?? '').startsWith('ECR-')) throw new Error(`${field} is invalid.`)
      const decision = candidate.taxDecision as unknown as CommerceTaxDecision
      const expected = commerceTaxDecision(value as CommerceState, pricedSubtotal, decision.reviewedAt)
      if (!expected || JSON.stringify(expected) !== JSON.stringify(decision)
        || (timestampMicros(decision.reviewedAt) as bigint) > (timestampMicros(candidate.createdAt) as bigint)) {
        throw new Error(`${field} does not match the Shop tax schedule.`)
      }
      payableTotal = decision.totalMmk
    }
    if (candidate.paymentDecision !== undefined) {
      const field = `orders[${index}].paymentDecision`
      if (!isRecord(candidate.paymentDecision) || !hasExactKeys(candidate.paymentDecision, [
        'schema', 'status', 'reason', 'adapter', 'policyRevision', 'policyActionId',
        'maximumOrderMmk', 'instructions', 'reviewedAt', 'authorized',
      ]) || pricedSubtotal === null || !String(candidate.sourceRecordId ?? '').startsWith('ECR-')) throw new Error(`${field} is invalid.`)
      const decision = candidate.paymentDecision as unknown as CommercePaymentDecision
      const reviewedCalculation = commerceOrderCalculation(value as CommerceState, pricedSubtotal, decision.reviewedAt)
      if (!reviewedCalculation) throw new Error(`${field} total is invalid.`)
      const expected = commercePaymentDecision(
        paymentPolicies as CommercePaymentPolicy[],
        decision.adapter,
        candidate.fulfilment as 'pickup' | 'delivery',
        candidate.taxDecision ? payableTotal as number : reviewedCalculation.totalMmk,
        decision.reviewedAt,
      )
      if (!expected || JSON.stringify(expected) !== JSON.stringify(decision)
        || decision.status !== 'approved' || decision.authorized !== false
        || candidate.payment !== commercePaymentAdapterLabel(decision.adapter)
        || (timestampMicros(decision.reviewedAt) as bigint) > (timestampMicros(candidate.createdAt) as bigint)) throw new Error(`${field} does not match the Shop payment policy.`)
    }
    if (candidate.calculation !== undefined) {
      if (!isRecord(candidate.calculation)) throw new Error(`orders[${index}].calculation is invalid.`)
      const calculation = candidate.calculation
      const v1 = calculation.schema === COMMERCE_ORDER_CALCULATION_SCHEMA
      const v2 = calculation.schema === COMMERCE_ORDER_CALCULATION_V2_SCHEMA
      const v2BaseFields = [
        'schema',
        'currency',
        'catalogRevision',
        'taxConfigurationRevision',
        'taxCode',
        'taxRateBasisPoints',
        'taxMode',
        'listedSubtotalMmk',
        'subtotalMmk',
        'taxMmk',
        'totalMmk',
      ]
      const validShape = v1
        ? hasExactKeys(calculation, ['schema', 'currency', 'catalogRevision', 'subtotalMmk', 'taxMode', 'taxMmk', 'totalMmk'])
        : v2 && (hasExactKeys(calculation, v2BaseFields)
          || hasExactKeys(calculation, [...v2BaseFields, 'taxJurisdictionCode', 'taxEffectiveFrom']))
      if (!validShape) throw new Error(`orders[${index}].calculation is invalid.`)
      assertSafeInteger(calculation.catalogRevision, `orders[${index}].calculation.catalogRevision`)
      assertSafeInteger(calculation.subtotalMmk, `orders[${index}].calculation.subtotalMmk`, v1 ? 1 : 0)
      assertSafeInteger(calculation.taxMmk, `orders[${index}].calculation.taxMmk`)
      assertSafeInteger(calculation.totalMmk, `orders[${index}].calculation.totalMmk`, 1)
      if (calculation.currency !== 'MMK'
        || Number(calculation.catalogRevision) > catalogChanges.length
        || candidate.total !== calculation.totalMmk) throw new Error(`orders[${index}].calculation totals are invalid.`)
      if (v1) {
        if (calculation.taxMode !== 'not_configured'
          || calculation.taxMmk !== 0
          || calculation.totalMmk !== calculation.subtotalMmk
          || (pricedSubtotal !== null && calculation.subtotalMmk !== pricedSubtotal)) {
          throw new Error(`orders[${index}].calculation must preserve its deterministic untaxed MMK subtotal.`)
        }
      } else {
        assertSafeInteger(calculation.taxConfigurationRevision, `orders[${index}].calculation.taxConfigurationRevision`, 1)
        assertSafeInteger(calculation.taxRateBasisPoints, `orders[${index}].calculation.taxRateBasisPoints`)
        assertSafeInteger(calculation.listedSubtotalMmk, `orders[${index}].calculation.listedSubtotalMmk`, 1)
        const configuration = (taxConfigurations as CommerceTaxConfiguration[]).find((entry) => entry.revision === calculation.taxConfigurationRevision)
        const expected = configuration && pricedSubtotal !== null
          ? configuredOrderCalculation(configuration, pricedSubtotal, Number(calculation.catalogRevision))
          : null
        if (!configuration
          || !expected
          || (timestampMicros(configuration.proof.capturedAt) as bigint) > (timestampMicros(candidate.createdAt) as bigint)
          || (timestampMicros(configuration.effectiveFrom ?? configuration.proof.capturedAt) as bigint) > (timestampMicros(candidate.createdAt) as bigint)
          || calculation.taxCode !== expected.taxCode
          || calculation.taxJurisdictionCode !== expected.taxJurisdictionCode
          || calculation.taxEffectiveFrom !== expected.taxEffectiveFrom
          || calculation.taxRateBasisPoints !== expected.taxRateBasisPoints
          || calculation.taxMode !== expected.taxMode
          || calculation.listedSubtotalMmk !== expected.listedSubtotalMmk
          || calculation.subtotalMmk !== expected.subtotalMmk
          || calculation.taxMmk !== expected.taxMmk
          || calculation.totalMmk !== expected.totalMmk) {
          throw new Error(`orders[${index}].calculation does not match its immutable tax configuration.`)
        }
      }
    } else if (pricedSubtotal !== null && candidate.total !== pricedSubtotal) {
      throw new Error(`orders[${index}] legacy total does not match its immutable line snapshots.`)
    }
    if (!orderStatuses.includes(candidate.status as CommerceOrderStatus)) throw new Error(`orders[${index}].status is invalid.`)
    if (!paymentStatuses.includes(candidate.paymentStatus as CommercePaymentStatus)) throw new Error(`orders[${index}].paymentStatus is invalid.`)
    if (!refundStatuses.includes(candidate.refundStatus as CommerceRefundStatus)) throw new Error(`orders[${index}].refundStatus is invalid.`)
    if (candidate.advancementActionIds !== undefined) {
      if (!Array.isArray(candidate.advancementActionIds)
        || candidate.advancementActionIds.length > 2
        || candidate.advancementActionIds.length > ({ confirmed: 0, preparing: 1, ready: 2, completed: 2, cancelled: 2 }[candidate.status as CommerceOrderStatus])) {
        throw new Error(`orders[${index}].advancementActionIds is invalid.`)
      }
      const orderAdvancementActionIds = candidate.advancementActionIds.map((actionId, actionIndex) => (
        canonicalText(actionId, `orders[${index}].advancementActionIds[${actionIndex}]`, 160)
      ))
      assertUnique(orderAdvancementActionIds, `orders[${index}] advancement action ID`)
      advancementActionIds.push(...orderAdvancementActionIds)
    }
    for (const field of ['fulfilment', 'fulfilmentReference', 'sourceRecordId', 'evidenceReference'] as const) {
      if (candidate[field] !== undefined) {
        const fieldValue = field === 'fulfilmentReference'
          ? canonicalText(candidate[field], `orders[${index}].${field}`, 160)
          : requiredText(candidate[field], `orders[${index}].${field}`)
        if (field === 'sourceRecordId') sourceRecordIds.push(fieldValue)
      }
    }
    if (candidate.promisedAt !== undefined) {
      const promisedAt = timestampMicros(candidate.promisedAt)
      const createdAt = timestampMicros(candidate.createdAt)
      if (promisedAt === null || createdAt === null || promisedAt <= createdAt) {
        throw new Error(`orders[${index}].promisedAt must be after its creation time.`)
      }
    }
    if (candidate.paymentStatus === 'reconciled') {
      if (!validTimestamp(candidate.paymentReconciledAt)) throw new Error(`orders[${index}].paymentReconciledAt is invalid.`)
      reconciliationActionIds.push(requiredText(candidate.paymentReconciliationActionId, `orders[${index}].paymentReconciliationActionId`))
      requiredText(candidate.paymentReconciledBy, `orders[${index}].paymentReconciledBy`)
      requiredText(candidate.paymentReconciliationReason, `orders[${index}].paymentReconciliationReason`)
      requiredText(candidate.paymentEvidenceReference, `orders[${index}].paymentEvidenceReference`)
    } else if (candidate.paymentReconciledAt !== undefined || candidate.paymentReconciliationActionId !== undefined || candidate.paymentReconciledBy !== undefined || candidate.paymentReconciliationReason !== undefined || candidate.paymentEvidenceReference !== undefined) {
      throw new Error(`orders[${index}] has reconciliation evidence while payment is pending.`)
    }
    const presentRefundSettlementFields = refundSettlementFields.filter((field) => candidate[field] !== undefined)
    if (candidate.refundStatus === 'settled') {
      if (presentRefundSettlementFields.length !== refundSettlementFields.length) throw new Error(`orders[${index}] requires complete refund settlement evidence.`)
      if (!validTimestamp(candidate.refundSettledAt) || String(candidate.refundSettledAt).length > 40) throw new Error(`orders[${index}].refundSettledAt is invalid.`)
      refundSettlementActionIds.push(canonicalText(candidate.refundSettlementActionId, `orders[${index}].refundSettlementActionId`, 160))
      canonicalText(candidate.refundSettledBy, `orders[${index}].refundSettledBy`)
      canonicalText(candidate.refundSettlementReason, `orders[${index}].refundSettlementReason`)
      canonicalText(candidate.refundEvidenceReference, `orders[${index}].refundEvidenceReference`)
    } else if (presentRefundSettlementFields.length) {
      throw new Error(`orders[${index}] has settlement evidence while refund is ${candidate.refundStatus}.`)
    }
    if ((candidate.refundStatus === 'due' || candidate.refundStatus === 'settled') && (candidate.status !== 'cancelled' || candidate.paymentStatus !== 'reconciled')) throw new Error(`orders[${index}] has an invalid refund exception.`)
    if (candidate.status === 'cancelled' && candidate.paymentStatus === 'reconciled' && candidate.refundStatus !== 'due' && candidate.refundStatus !== 'settled') throw new Error(`orders[${index}] must preserve a due or settled refund.`)
    if (candidate.completion !== undefined) {
      if (candidate.status !== 'completed'
        || !isRecord(candidate.completion)
        || !hasExactKeys(candidate.completion, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
        || !validProof(candidate.completion as CommerceActionProof)) {
        throw new Error(`orders[${index}].completion is invalid.`)
      }
      const completion = candidate.completion as CommerceActionProof
      for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
        canonicalText(completion[field], `orders[${index}].completion.${field}`, field === 'actionId' ? 160 : 180)
      }
      if ((timestampMicros(completion.capturedAt) as bigint) < (timestampMicros(candidate.createdAt) as bigint)
        || (candidate.paymentReconciledAt !== undefined
          && (timestampMicros(completion.capturedAt) as bigint) < (timestampMicros(candidate.paymentReconciledAt) as bigint))) {
        throw new Error(`orders[${index}].completion is outside the order chronology.`)
      }
      completionActionIds.push(completion.actionId)
    } else if (candidate.returns !== undefined || candidate.corrections !== undefined) {
      throw new Error(`orders[${index}] cannot retain returns or corrections without completion proof.`)
    }
    if (candidate.corrections !== undefined) {
      if (!Array.isArray(candidate.corrections)
        || candidate.corrections.length < 1
        || candidate.corrections.length > maxCorrectionsPerOrder
        || candidate.status !== 'completed'
        || candidate.paymentStatus !== 'reconciled'
        || !candidate.calculation) {
        throw new Error(`orders[${index}].corrections requires 1 to ${maxCorrectionsPerOrder} records on a calculated, reconciled, completed order.`)
      }
      const order = candidate as unknown as CommerceOrder
      const sourceCalculationDigest = commerceOrderCalculationDigest(order)
      let expectedBalance = order.total
      let previousCreatedAt = timestampMicros((candidate.completion as CommerceActionProof).capturedAt) as bigint
      for (const [correctionIndex, correctionCandidate] of [...candidate.corrections].reverse().entries()) {
        const field = `orders[${index}].corrections[${candidate.corrections.length - correctionIndex - 1}]`
        if (!isRecord(correctionCandidate) || !hasExactKeys(correctionCandidate, [
          'documentId', 'actionId', 'createdAt', 'actor', 'reason', 'evidenceReference', 'kind', 'reasonCode',
          'sourceCalculationDigest', 'calculation', 'balanceAfterMmk', 'financialStatus', 'postingAuthority',
          'externalPostingPerformed',
        ])) throw new Error(`${field} is invalid.`)
        const record = correctionCandidate as unknown as CommerceOrderCorrection
        const actionId = canonicalText(record.actionId, `${field}.actionId`, 160)
        if (record.documentId !== `COR2:${encodeURIComponent(actionId)}`) throw new Error(`${field}.documentId is invalid.`)
        const createdAt = timestampMicros(record.createdAt)
        if (createdAt === null || createdAt < previousCreatedAt) throw new Error(`${field}.createdAt is outside the order chronology.`)
        previousCreatedAt = createdAt
        for (const textField of ['actor', 'reason', 'evidenceReference'] as const) canonicalText(record[textField], `${field}.${textField}`)
        if (!correctionKinds.includes(record.kind) || !correctionReasonCodes.includes(record.reasonCode)) throw new Error(`${field} classification is invalid.`)
        if (record.sourceCalculationDigest !== sourceCalculationDigest) throw new Error(`${field}.sourceCalculationDigest does not bind the original order calculation.`)
        if (!isRecord(record.calculation)) throw new Error(`${field}.calculation is invalid.`)
        const calculation = commerceCorrectionCalculation(order, record.calculation.listedAmountMmk)
        if (!calculation || JSON.stringify(calculation) !== JSON.stringify(record.calculation)) throw new Error(`${field}.calculation is not deterministic from the original tax snapshot.`)
        expectedBalance += record.kind === 'debit' ? calculation.totalMmk : -calculation.totalMmk
        if (!Number.isSafeInteger(expectedBalance) || expectedBalance < 0 || record.balanceAfterMmk !== expectedBalance) throw new Error(`${field}.balanceAfterMmk is invalid.`)
        if (record.financialStatus !== 'review_required' || record.postingAuthority !== 'none' || record.externalPostingPerformed !== false) throw new Error(`${field} overclaims posting authority.`)
        correctionActionIds.push(actionId)
      }
    }
    let paymentTermsDays: 0 | 7 | 30 = 0
    if (candidate.paymentDueAt !== undefined) {
      const paymentDueAt = timestampMicros(candidate.paymentDueAt)
      const createdAt = timestampMicros(candidate.createdAt)
      if (paymentDueAt === null || createdAt === null || paymentDueAt < createdAt) {
        throw new Error(`orders[${index}].paymentDueAt cannot be before its creation time.`)
      }
      const paymentTermMicros = paymentDueAt - createdAt
      const dayMicros = 86_400_000_000n
      const supportedTerm = ([0, 7, 30] as const).find((days) => paymentTermMicros === BigInt(days) * dayMicros)
      if (supportedTerm === undefined) throw new Error(`orders[${index}].paymentDueAt must use a supported customer credit term.`)
      paymentTermsDays = supportedTerm
    }
    if (candidate.creditDecision !== undefined) {
      const field = `orders[${index}].creditDecision`
      if (!isRecord(candidate.creditDecision) || !hasExactKeys(candidate.creditDecision, [
        'policyRevision', 'policyActionId', 'creditLimitMmk', 'exposureBeforeMmk', 'orderAmountMmk',
        'exposureAfterMmk', 'maxPaymentTermsDays', 'paymentTermsDays', 'status',
      ])) throw new Error(`${field} is invalid.`)
      const decision = candidate.creditDecision
      assertSafeInteger(decision.policyRevision, `${field}.policyRevision`, 1)
      canonicalText(decision.policyActionId, `${field}.policyActionId`, 160)
      for (const numberField of ['creditLimitMmk', 'exposureBeforeMmk', 'orderAmountMmk', 'exposureAfterMmk'] as const) {
        assertSafeInteger(decision[numberField], `${field}.${numberField}`)
      }
      if ((decision.paymentTermsDays !== 7 && decision.paymentTermsDays !== 30)
        || !customerCreditTerms.has(Number(decision.maxPaymentTermsDays))
        || decision.status !== 'approved'
        || paymentTermsDays !== decision.paymentTermsDays
        || decision.orderAmountMmk !== candidate.total
        || decision.exposureAfterMmk !== Number(decision.exposureBeforeMmk) + Number(decision.orderAmountMmk)) {
        throw new Error(`${field} arithmetic or payment terms are invalid.`)
      }
      const policy = (customerCreditPolicies as CommerceCustomerCreditPolicy[]).find((entry) => (
        entry.revision === decision.policyRevision && entry.proof.actionId === decision.policyActionId
      ))
      if (!policy
        || policy.customer !== candidate.customer
        || policy.status !== 'active'
        || policy.creditLimitMmk !== decision.creditLimitMmk
        || policy.maxPaymentTermsDays !== decision.maxPaymentTermsDays
        || decision.paymentTermsDays > policy.maxPaymentTermsDays
        || decision.exposureAfterMmk > policy.creditLimitMmk
        || (timestampMicros(policy.proof.capturedAt) as bigint) > (timestampMicros(candidate.createdAt) as bigint)) {
        throw new Error(`${field} does not match an effective approved customer policy.`)
      }
    }
    if (candidate.collectionActions !== undefined) {
      if (!Array.isArray(candidate.collectionActions)
        || candidate.collectionActions.length < 1
        || candidate.collectionActions.length > maxCollectionActionsPerOrder) {
        throw new Error(`orders[${index}].collectionActions requires 1 to ${maxCollectionActionsPerOrder} records.`)
      }
      let newerActionAt: bigint | null = null
      for (const [actionIndex, actionCandidate] of candidate.collectionActions.entries()) {
        if (!isRecord(actionCandidate)
          || !hasExactKeys(actionCandidate, ['kind', 'proof'])
          || actionCandidate.kind !== 'customer_contact'
          || !isRecord(actionCandidate.proof)
          || !hasExactKeys(actionCandidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
          || !validProof(actionCandidate.proof as CommerceActionProof)) {
          throw new Error(`orders[${index}].collectionActions[${actionIndex}] is invalid.`)
        }
        const proof = actionCandidate.proof as CommerceActionProof
        const capturedAt = timestampMicros(proof.capturedAt)
        if (capturedAt === null
          || capturedAt < (timestampMicros(candidate.createdAt) as bigint)
          || (newerActionAt !== null && capturedAt > newerActionAt)) {
          throw new Error(`orders[${index}].collectionActions[${actionIndex}] is outside the order chronology.`)
        }
        newerActionAt = capturedAt
        for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
          canonicalText(proof[field], `orders[${index}].collectionActions[${actionIndex}].proof.${field}`, field === 'actionId' ? 160 : 180)
        }
        collectionActionIds.push(proof.actionId)
      }
    }
    if (candidate.returns !== undefined) {
      if (!Array.isArray(candidate.returns)
        || candidate.returns.length < 1
        || candidate.returns.length > maxReturnsPerOrder
        || candidate.status !== 'completed') {
        throw new Error(`orders[${index}].returns requires 1 to ${maxReturnsPerOrder} records on a completed order.`)
      }
      const soldBySku = new Map(reservationLinesForOrder(candidate as unknown as CommerceOrder).map((line) => [line.sku, line.quantity]))
      const returnedBySku = new Map<string, number>()
      let newerReturnAt: bigint | null = null
      for (const [returnIndex, returnCandidate] of candidate.returns.entries()) {
        if (!isRecord(returnCandidate) || !hasExactKeys(
          returnCandidate,
          ['actionId', 'createdAt', 'actor', 'reason', 'evidenceReference', 'sku', 'quantity', 'disposition'],
        )) throw new Error(`orders[${index}].returns[${returnIndex}] is invalid.`)
        const returnRecord = returnCandidate as unknown as CommerceOrderReturn
        const actionId = canonicalText(returnRecord.actionId, `orders[${index}].returns[${returnIndex}].actionId`, 160)
        const createdAt = timestampMicros(returnRecord.createdAt)
        if (createdAt === null
          || createdAt < (timestampMicros((candidate.completion as CommerceActionProof).capturedAt) as bigint)
          || (candidate.paymentReconciledAt !== undefined
            && createdAt < (timestampMicros(candidate.paymentReconciledAt) as bigint))
          || (newerReturnAt !== null && createdAt > newerReturnAt)) {
          throw new Error(`orders[${index}].returns[${returnIndex}].createdAt is outside the order chronology.`)
        }
        newerReturnAt = createdAt
        for (const field of ['actor', 'reason', 'evidenceReference'] as const) {
          canonicalText(returnRecord[field], `orders[${index}].returns[${returnIndex}].${field}`)
        }
        const returnSku = canonicalText(returnRecord.sku, `orders[${index}].returns[${returnIndex}].sku`, 80)
        const soldQuantity = soldBySku.get(returnSku)
        assertSafeInteger(returnRecord.quantity, `orders[${index}].returns[${returnIndex}].quantity`, 1)
        if (!returnDispositions.includes(returnRecord.disposition)) {
          throw new Error(`orders[${index}].returns[${returnIndex}].disposition is invalid.`)
        }
        const returnedQuantity = (returnedBySku.get(returnSku) ?? 0) + returnRecord.quantity
        if (!soldQuantity || !Number.isSafeInteger(returnedQuantity) || returnedQuantity > soldQuantity) {
          throw new Error(`orders[${index}].returns exceed the sold quantity for ${returnSku}.`)
        }
        returnedBySku.set(returnSku, returnedQuantity)
        returnActionIds.push(actionId)
        orderReturns.push({ orderId: candidate.id as string, record: returnRecord })
      }
    }
    if (candidate.supportCases !== undefined) {
      if (!Array.isArray(candidate.supportCases)
        || candidate.supportCases.length < 1
        || candidate.supportCases.length > maxSupportCasesPerOrder
        || candidate.status !== 'completed'
        || !candidate.completion) {
        throw new Error(`orders[${index}].supportCases requires 1 to ${maxSupportCasesPerOrder} records on a completed order.`)
      }
      let newerOpeningAt: bigint | null = null
      for (const [caseIndex, caseCandidate] of candidate.supportCases.entries()) {
        const field = `orders[${index}].supportCases[${caseIndex}]`
        if (!isRecord(caseCandidate) || !hasExactKeys(
          caseCandidate,
          ['caseId', 'sourceIntentId', 'sourceRequestId', 'customerRequestedAt', 'category', 'customerDescription', 'status', 'opening', 'externalMessageSent', 'refundStarted'],
          ['resolution', 'serviceEvents', 'priority', 'owner', 'dueAt', 'reopen', 'followUpServiceEvents', 'followUpResolution'],
        )) throw new Error(`${field} is invalid.`)
        const caseId = canonicalText(caseCandidate.caseId, `${field}.caseId`, 41)
        const sourceIntentId = canonicalText(caseCandidate.sourceIntentId, `${field}.sourceIntentId`, 40)
        const sourceRequestId = canonicalText(caseCandidate.sourceRequestId, `${field}.sourceRequestId`, 40)
        const expectedCaseId = `CASE-${sourceIntentId.slice(4)}`
        const expectedEvidence = `ECOMMERCE-SUPPORT:${sourceIntentId.slice(4)}:${String(candidate.id)}:${sourceRequestId}`
        if (!supportCaseIdPattern.test(caseId)
          || !supportIntentIdPattern.test(sourceIntentId)
          || caseId !== expectedCaseId
          || !storefrontRequestIdPattern.test(sourceRequestId)
          || sourceRequestId !== candidate.sourceRecordId
          || !validTimestamp(caseCandidate.customerRequestedAt)
          || !supportCategories.includes(caseCandidate.category as CommerceSupportCategory)
          || caseCandidate.externalMessageSent !== false
          || caseCandidate.refundStarted !== false
          || !isRecord(caseCandidate.opening)
          || !hasExactKeys(caseCandidate.opening, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
          || !validProof(caseCandidate.opening as CommerceActionProof)
          || caseCandidate.opening.evidenceReference !== expectedEvidence) {
          throw new Error(`${field} boundary is invalid.`)
        }
        canonicalText(caseCandidate.customerDescription, `${field}.customerDescription`, 300)
        const requestedAt = timestampMicros(caseCandidate.customerRequestedAt) as bigint
        const opening = caseCandidate.opening as CommerceActionProof
        const openingAt = timestampMicros(opening.capturedAt) as bigint
        const hasPriority = caseCandidate.priority !== undefined
        const hasOwner = caseCandidate.owner !== undefined
        const hasDueAt = caseCandidate.dueAt !== undefined
        if ((hasPriority || hasOwner || hasDueAt) && !(hasPriority && hasOwner && hasDueAt)) {
          throw new Error(`${field} service triage must include priority, owner, and due time together.`)
        }
        if (hasPriority && hasOwner && hasDueAt) {
          if (!supportPriorities.includes(caseCandidate.priority as CommerceSupportPriority)
            || !validTimestamp(caseCandidate.dueAt)
            || (timestampMicros(caseCandidate.dueAt) as bigint) <= openingAt) {
            throw new Error(`${field} service triage is invalid.`)
          }
          canonicalText(caseCandidate.owner, `${field}.owner`, 120)
        }
        if (openingAt < requestedAt
          || openingAt < (timestampMicros((candidate.completion as CommerceActionProof).capturedAt) as bigint)
          || (newerOpeningAt !== null && openingAt > newerOpeningAt)) {
          throw new Error(`${field} is outside the order chronology.`)
        }
        newerOpeningAt = openingAt
        const initialService = hasPriority && hasOwner && hasDueAt
          ? { priority: caseCandidate.priority as CommerceSupportPriority, owner: caseCandidate.owner as string, dueAt: caseCandidate.dueAt as string }
          : null
        if (caseCandidate.serviceEvents !== undefined && !initialService) throw new Error(`${field}.serviceEvents requires attributable opening triage.`)
        const originalTimeline = initialService
          ? validateSupportServiceTimeline(caseCandidate.serviceEvents, `${field}.serviceEvents`, caseId, initialService, openingAt, supportActionIds)
          : null
        for (const proofField of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) {
          canonicalText(opening[proofField], `${field}.opening.${proofField}`, proofField === 'actionId' ? 160 : 300)
        }
        const originalResolution = caseCandidate.resolution === undefined
          ? null
          : validateSupportResolution(caseCandidate.resolution, `${field}.resolution`, originalTimeline?.latestAt ?? openingAt, supportActionIds)
        if (caseCandidate.reopen !== undefined) {
          if (!originalResolution
            || !initialService
            || !isRecord(caseCandidate.reopen)
            || !hasExactKeys(caseCandidate.reopen, ['sourceResolutionActionId', 'owner', 'priority', 'dueAt', 'note', 'proof'])
            || caseCandidate.reopen.sourceResolutionActionId !== originalResolution.proof.actionId
            || !supportPriorities.includes(caseCandidate.reopen.priority as CommerceSupportPriority)
            || !validTimestamp(caseCandidate.reopen.dueAt)
            || !isRecord(caseCandidate.reopen.proof)
            || !hasExactKeys(caseCandidate.reopen.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
            || !validProof(caseCandidate.reopen.proof as CommerceActionProof)
            || caseCandidate.reopen.proof.evidenceReference !== `SUPPORT-REOPEN:${caseId}:${originalResolution.proof.actionId}`) {
            throw new Error(`${field}.reopen is invalid.`)
          }
          canonicalText(caseCandidate.reopen.owner, `${field}.reopen.owner`, 120)
          canonicalText(caseCandidate.reopen.note, `${field}.reopen.note`, 300)
          const reopenProof = caseCandidate.reopen.proof as CommerceActionProof
          const reopenAt = timestampMicros(reopenProof.capturedAt) as bigint
          if (reopenAt <= (timestampMicros(originalResolution.proof.capturedAt) as bigint)
            || (timestampMicros(caseCandidate.reopen.dueAt) as bigint) <= reopenAt) throw new Error(`${field}.reopen chronology is invalid.`)
          supportActionIds.push(reopenProof.actionId)
          const followUpTimeline = validateSupportServiceTimeline(
            caseCandidate.followUpServiceEvents,
            `${field}.followUpServiceEvents`,
            caseId,
            {
              owner: caseCandidate.reopen.owner as string,
              priority: caseCandidate.reopen.priority as CommerceSupportPriority,
              dueAt: caseCandidate.reopen.dueAt as string,
            },
            reopenAt,
            supportActionIds,
          )
          const followUpResolution = caseCandidate.followUpResolution === undefined
            ? null
            : validateSupportResolution(caseCandidate.followUpResolution, `${field}.followUpResolution`, followUpTimeline.latestAt, supportActionIds)
          if ((caseCandidate.status === 'open' && followUpResolution)
            || (caseCandidate.status === 'resolved' && !followUpResolution)
            || (caseCandidate.status !== 'open' && caseCandidate.status !== 'resolved')) throw new Error(`${field} follow-up status is invalid.`)
        } else if (caseCandidate.followUpServiceEvents !== undefined || caseCandidate.followUpResolution !== undefined) {
          throw new Error(`${field} follow-up evidence requires a retained reopen.`)
        } else if ((caseCandidate.status === 'open' && originalResolution)
          || (caseCandidate.status === 'resolved' && !originalResolution)
          || (caseCandidate.status !== 'open' && caseCandidate.status !== 'resolved')) {
          throw new Error(`${field} status is invalid.`)
        }
        supportSourceIntentIds.push(sourceIntentId)
        supportActionIds.push(opening.actionId)
      }
    }
    orderById.set(candidate.id as string, candidate)
  }
  assertUnique(orderIds, 'Order ID')
  assertUnique(sourceRecordIds, 'Order source record ID')
  assertUnique(reconciliationActionIds, 'Payment reconciliation action ID')
  assertUnique(refundSettlementActionIds, 'Refund settlement action ID')
  assertUnique(completionActionIds, 'Order completion action ID')
  assertUnique(returnActionIds, 'Order return action ID')
  assertUnique(supportActionIds, 'Order support action ID')
  assertUnique(supportSourceIntentIds, 'Order support source intent ID')
  assertUnique(correctionActionIds, 'Order correction action ID')
  assertUnique(collectionActionIds, 'Collection action ID')

  const reserveByOrder = new Map<string, number>()
  const releaseByOrder = new Map<string, number>()
  const reserveActionsByOrder = new Map<string, Set<string>>()
  const releaseActionsByOrder = new Map<string, Set<string>>()
  const reserveMovementByOrder = new Map<string, CommerceStockMovement>()
  const movementsByAction = new Map<string, CommerceStockMovement[]>()
  const receiptQuantityByPurchaseOrder = new Map<string, number>()
  const rejectedQuantityByPurchaseOrder = new Map<string, number>()
  const latestReceiptAtByPurchaseOrder = new Map<string, bigint>()
  const productionRequestIds: string[] = []
  const productionReleaseIds: string[] = []
  const productionSkuBySourceProduct = new Map<string, string>()
  for (const [index, candidate] of movements.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['id', 'actionId', 'createdAt', 'actor', 'reason', 'evidenceReference', 'kind', 'sku', 'quantityDelta'],
      ['orderId', 'purchaseOrderId', 'expectedQuantity', 'countedQuantity', ...purchaseReceiptDiscrepancyFields, ...productionIssueFields, ...productionReturnExclusiveFields, ...productionReceiptExclusiveFields],
    )) throw new Error(`movements[${index}] is invalid.`)
    movementIds.push(requiredText(candidate.id, `movements[${index}].id`))
    movementActionIds.push(requiredText(candidate.actionId, `movements[${index}].actionId`))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`movements[${index}].createdAt is invalid.`)
    for (const field of ['actor', 'reason', 'evidenceReference', 'sku'] as const) requiredText(candidate[field], `movements[${index}].${field}`)
    if (!itemSkus.includes(candidate.sku as string)) throw new Error(`movements[${index}].sku is unknown.`)
    if (!movementKinds.includes(candidate.kind as CommerceStockMovementKind)) throw new Error(`movements[${index}].kind is invalid.`)
    const retainedProductionFields = productionIssueFields.filter((field) => candidate[field] !== undefined)
    const retainedProductionReturnFields = productionReturnExclusiveFields.filter((field) => candidate[field] !== undefined)
    const retainedProductionReceiptFields = productionReceiptFields.filter((field) => candidate[field] !== undefined)
    const retainedDiscrepancyFields = purchaseReceiptDiscrepancyFields.filter((field) => candidate[field] !== undefined)
    if (candidate.kind === 'production_issue') {
      if (retainedProductionFields.length !== productionIssueFields.length
        || retainedProductionReturnFields.length
        || productionReceiptExclusiveFields.some((field) => candidate[field] !== undefined)
        || candidate.orderId !== undefined
        || candidate.purchaseOrderId !== undefined
        || candidate.expectedQuantity !== undefined
        || candidate.countedQuantity !== undefined) throw new Error(`movements[${index}] production issue fields are incomplete.`)
      const requestId = canonicalText(candidate.productionRequestId, `movements[${index}].productionRequestId`, 80)
      productionRequestIds.push(requestId)
      if (typeof candidate.productionCommandDigest !== 'string' || !sha256DigestPattern.test(candidate.productionCommandDigest)) throw new Error(`movements[${index}].productionCommandDigest is invalid.`)
      canonicalText(candidate.productionJobId, `movements[${index}].productionJobId`, 80)
      canonicalText(candidate.productionMaterialId, `movements[${index}].productionMaterialId`, 80)
      canonicalText(candidate.productionInputLotId, `movements[${index}].productionInputLotId`, 80)
      assertSafeInteger(candidate.productionQuantityMilli, `movements[${index}].productionQuantityMilli`, 1)
      if (!productionMaterialUnits.has(candidate.productionUnit as CommerceProductionMaterialUnit)) throw new Error(`movements[${index}].productionUnit is invalid.`)
      canonicalText(candidate.conversionNote, `movements[${index}].conversionNote`, 240)
    } else if (candidate.kind === 'production_return') {
      if (retainedProductionFields.length !== productionIssueFields.length
        || retainedProductionReturnFields.length !== productionReturnExclusiveFields.length
        || productionReceiptExclusiveFields.some((field) => candidate[field] !== undefined)
        || candidate.orderId !== undefined
        || candidate.purchaseOrderId !== undefined
        || candidate.expectedQuantity !== undefined
        || candidate.countedQuantity !== undefined) throw new Error(`movements[${index}] production return fields are incomplete.`)
      canonicalText(candidate.productionRequestId, `movements[${index}].productionRequestId`, 80)
      if (typeof candidate.productionCommandDigest !== 'string' || !sha256DigestPattern.test(candidate.productionCommandDigest)) throw new Error(`movements[${index}].productionCommandDigest is invalid.`)
      canonicalText(candidate.productionJobId, `movements[${index}].productionJobId`, 80)
      canonicalText(candidate.productionMaterialId, `movements[${index}].productionMaterialId`, 80)
      canonicalText(candidate.productionInputLotId, `movements[${index}].productionInputLotId`, 80)
      assertSafeInteger(candidate.productionQuantityMilli, `movements[${index}].productionQuantityMilli`, 1)
      if (!productionMaterialUnits.has(candidate.productionUnit as CommerceProductionMaterialUnit)) throw new Error(`movements[${index}].productionUnit is invalid.`)
      canonicalText(candidate.conversionNote, `movements[${index}].conversionNote`, 240)
      canonicalText(candidate.productionIssueActionId, `movements[${index}].productionIssueActionId`, 160)
      assertSafeInteger(candidate.productionReturnedQuantityMilli, `movements[${index}].productionReturnedQuantityMilli`, 1)
      canonicalText(candidate.productionReturnStockUnitId, `movements[${index}].productionReturnStockUnitId`, 80)
      canonicalText(candidate.productionReturnLocationId, `movements[${index}].productionReturnLocationId`, 80)
    } else if (candidate.kind === 'production_receipt') {
      if (retainedProductionReceiptFields.length !== productionReceiptFields.length
        || productionIssueExclusiveFields.some((field) => candidate[field] !== undefined)
        || retainedProductionReturnFields.length
        || candidate.orderId !== undefined
        || candidate.purchaseOrderId !== undefined
        || candidate.expectedQuantity !== undefined
        || candidate.countedQuantity !== undefined) throw new Error(`movements[${index}] production receipt fields are incomplete.`)
      productionReleaseIds.push(canonicalText(candidate.productionReleaseId, `movements[${index}].productionReleaseId`, 80))
      if (typeof candidate.productionCommandDigest !== 'string' || !sha256DigestPattern.test(candidate.productionCommandDigest)) throw new Error(`movements[${index}].productionCommandDigest is invalid.`)
      canonicalText(candidate.productionJobId, `movements[${index}].productionJobId`, 80)
      canonicalText(candidate.productionOutputBatchId, `movements[${index}].productionOutputBatchId`, 80)
      const productionSourceProduct = canonicalText(candidate.productionSourceProduct, `movements[${index}].productionSourceProduct`, 180)
      const sourceProductKey = productionSourceProduct.toLocaleLowerCase()
      const mappedSku = productionSkuBySourceProduct.get(sourceProductKey)
      if (mappedSku && mappedSku !== candidate.sku) throw new Error(`movements[${index}] conflicts with the retained Plant product mapping.`)
      productionSkuBySourceProduct.set(sourceProductKey, candidate.sku as string)
      if (!validTimestamp(candidate.productionReleasedAt)) throw new Error(`movements[${index}].productionReleasedAt is invalid.`)
      if ((timestampMicros(candidate.createdAt) as bigint) < (timestampMicros(candidate.productionReleasedAt) as bigint)) throw new Error(`movements[${index}] predates its Plant release.`)
    } else if (retainedProductionFields.length || retainedProductionReturnFields.length || retainedProductionReceiptFields.length) {
      throw new Error(`movements[${index}] production fields are unsupported for ${String(candidate.kind)}.`)
    }
    if (candidate.kind !== 'receipt' && retainedDiscrepancyFields.length) {
      throw new Error(`movements[${index}] purchase discrepancy fields are unsupported for ${String(candidate.kind)}.`)
    }
    const actionMovements = movementsByAction.get(candidate.actionId as string) ?? []
    actionMovements.push(candidate as unknown as CommerceStockMovement)
    movementsByAction.set(candidate.actionId as string, actionMovements)
    if (candidate.kind === 'count') {
      if (!Number.isSafeInteger(candidate.quantityDelta)
        || candidate.orderId !== undefined
        || candidate.purchaseOrderId !== undefined) throw new Error(`movements[${index}] count fields are invalid.`)
      assertSafeInteger(candidate.expectedQuantity, `movements[${index}].expectedQuantity`)
      assertSafeInteger(candidate.countedQuantity, `movements[${index}].countedQuantity`)
      if (candidate.quantityDelta !== Number(candidate.countedQuantity) - Number(candidate.expectedQuantity)) throw new Error(`movements[${index}] count variance is invalid.`)
      continue
    }
    if (candidate.expectedQuantity !== undefined || candidate.countedQuantity !== undefined) throw new Error(`movements[${index}] count fields are unsupported for ${String(candidate.kind)}.`)
    if (candidate.kind === 'opening') {
      assertSafeInteger(candidate.quantityDelta, `movements[${index}].quantityDelta`)
      if (candidate.orderId !== undefined || candidate.purchaseOrderId !== undefined) throw new Error(`movements[${index}] opening balance cannot reference an order.`)
      continue
    }
    if (!Number.isSafeInteger(candidate.quantityDelta) || candidate.quantityDelta === 0) throw new Error(`movements[${index}].quantityDelta is invalid.`)
    if ((candidate.kind === 'reserve' || candidate.kind === 'production_issue') && Number(candidate.quantityDelta) >= 0) throw new Error(`movements[${index}] ${String(candidate.kind)} must be negative.`)
    if (candidate.kind !== 'reserve' && candidate.kind !== 'production_issue' && Number(candidate.quantityDelta) <= 0) throw new Error(`movements[${index}] release, receipt, or return must be positive.`)
    if (candidate.kind === 'production_issue') continue
    if (candidate.kind === 'production_return') continue
    if (candidate.kind === 'production_receipt') continue
    if (candidate.kind === 'receipt') {
      if (candidate.orderId !== undefined) throw new Error(`movements[${index}] receipt cannot reference an order.`)
      if (retainedDiscrepancyFields.length !== 0 && retainedDiscrepancyFields.length !== purchaseReceiptDiscrepancyFields.length) {
        throw new Error(`movements[${index}] purchase discrepancy fields are incomplete.`)
      }
      if (retainedDiscrepancyFields.length) assertSafeInteger(candidate.rejectedQuantity, `movements[${index}].rejectedQuantity`, 1)
      const rejectedQuantity = retainedDiscrepancyFields.length ? Number(candidate.rejectedQuantity) : 0
      if (rejectedQuantity && (!purchaseOrderDiscrepancyCodes.has(candidate.discrepancyCode as CommercePurchaseOrderDiscrepancyCode)
        || candidate.discrepancyDisposition !== 'return_to_vendor')) {
        throw new Error(`movements[${index}] purchase discrepancy is invalid.`)
      }
      if (rejectedQuantity && candidate.purchaseOrderId === undefined) {
        throw new Error(`movements[${index}] purchase discrepancy requires a purchase order.`)
      }
      if (candidate.purchaseOrderId !== undefined) {
        const purchaseOrderId = canonicalText(candidate.purchaseOrderId, `movements[${index}].purchaseOrderId`, 80)
        const purchaseOrder = purchaseOrderById.get(purchaseOrderId)
        const createdAt = timestampMicros(candidate.createdAt) as bigint
        if (!purchaseOrder
          || purchaseOrder.sku !== candidate.sku
          || createdAt < (timestampMicros(purchaseOrder.createdAt) as bigint)
          || (purchaseOrder.cancellation && createdAt > (timestampMicros(purchaseOrder.cancellation.capturedAt) as bigint))) {
          throw new Error(`movements[${index}] does not match its purchase order.`)
        }
        const received = (receiptQuantityByPurchaseOrder.get(purchaseOrderId) ?? 0) + Number(candidate.quantityDelta)
        const rejected = (rejectedQuantityByPurchaseOrder.get(purchaseOrderId) ?? 0) + rejectedQuantity
        const delivered = received + rejected
        if (!Number.isSafeInteger(received) || !Number.isSafeInteger(rejected) || !Number.isSafeInteger(delivered) || delivered > purchaseOrder.quantityOrdered) {
          throw new Error(`movements[${index}] exceeds its purchase order quantity.`)
        }
        receiptQuantityByPurchaseOrder.set(purchaseOrderId, received)
        rejectedQuantityByPurchaseOrder.set(purchaseOrderId, rejected)
        const latestReceiptAt = latestReceiptAtByPurchaseOrder.get(purchaseOrderId) ?? 0n
        latestReceiptAtByPurchaseOrder.set(purchaseOrderId, createdAt > latestReceiptAt ? createdAt : latestReceiptAt)
      }
      continue
    }
    if (candidate.purchaseOrderId !== undefined) throw new Error(`movements[${index}] sales movement cannot reference a purchase order.`)
    const orderId = requiredText(candidate.orderId, `movements[${index}].orderId`)
    if (candidate.kind === 'return') {
      const matchingReturns = orderReturns.filter(({ orderId: returnOrderId, record }) => (
        returnOrderId === orderId && record.actionId === candidate.actionId
      ))
      if (matchingReturns.length !== 1
        || matchingReturns[0].record.disposition !== 'restock'
        || !movementMatchesReturn(candidate as unknown as CommerceStockMovement, matchingReturns[0].record, orderId)) {
        throw new Error(`movements[${index}] does not match one sellable order return.`)
      }
      continue
    }
    const order = orders.find((entry) => isRecord(entry) && entry.id === orderId) as Record<string, unknown> | undefined
    const orderLines = order ? reservationLinesForOrder(order as unknown as CommerceOrder) : []
    const matchingLines = orderLines.filter((line) => line.sku === candidate.sku)
    if (!order || matchingLines.length !== 1 || Math.abs(Number(candidate.quantityDelta)) !== matchingLines[0].quantity) throw new Error(`movements[${index}] does not match its order reservation.`)
    const counter = candidate.kind === 'reserve' ? reserveByOrder : releaseByOrder
    counter.set(orderId, (counter.get(orderId) ?? 0) + 1)
    const actions = candidate.kind === 'reserve' ? reserveActionsByOrder : releaseActionsByOrder
    const orderActions = actions.get(orderId) ?? new Set<string>()
    orderActions.add(candidate.actionId as string)
    actions.set(orderId, orderActions)
    if (candidate.kind === 'reserve' && !reserveMovementByOrder.has(orderId)) {
      reserveMovementByOrder.set(orderId, candidate as unknown as CommerceStockMovement)
    }
    if (candidate.kind === 'release' && order.status !== 'cancelled') throw new Error(`movements[${index}] release requires a cancelled order.`)
  }
  assertUnique(movementIds, 'Stock movement ID')
  assertUnique(productionRequestIds, 'Production material request ID')
  assertUnique(productionReleaseIds, 'Production batch release ID')
  const validatedMovements = movements as unknown as CommerceStockMovement[]
  const productionIssuesByAction = new Map(validatedMovements
    .filter((movement) => movement.kind === 'production_issue')
    .map((movement) => [movement.actionId, movement]))
  const productionReturnedByIssue = new Map<string, { productionQuantityMilli: bigint; stockQuantity: bigint }>()
  for (const movement of validatedMovements.filter((candidate) => candidate.kind === 'production_return')) {
    const sourceIssueActionId = movement.productionIssueActionId as string
    const issue = productionIssuesByAction.get(sourceIssueActionId)
    if (!issue) throw new Error(`Production return ${movement.actionId} does not reference one retained Plant issue.`)
    if (movement.sku !== issue.sku
      || movement.productionRequestId !== issue.productionRequestId
      || movement.productionCommandDigest !== issue.productionCommandDigest
      || movement.productionJobId !== issue.productionJobId
      || movement.productionMaterialId !== issue.productionMaterialId
      || movement.productionInputLotId !== issue.productionInputLotId
      || movement.productionQuantityMilli !== issue.productionQuantityMilli
      || movement.productionUnit !== issue.productionUnit
      || movement.conversionNote !== issue.conversionNote) {
      throw new Error(`Production return ${movement.actionId} does not match its immutable Plant issue.`)
    }
    if ((timestampMicros(movement.createdAt) as bigint) < (timestampMicros(issue.createdAt) as bigint)) {
      throw new Error(`Production return ${movement.actionId} predates its Plant issue.`)
    }
    const returnedProductionQuantityMilli = BigInt(movement.productionReturnedQuantityMilli as number)
    const returnedStockQuantity = BigInt(movement.quantityDelta)
    if (returnedProductionQuantityMilli * BigInt(-issue.quantityDelta) !== returnedStockQuantity * BigInt(issue.productionQuantityMilli as number)) {
      throw new Error(`Production return ${movement.actionId} does not preserve its reviewed conversion ratio.`)
    }
    const returned = productionReturnedByIssue.get(sourceIssueActionId) ?? { productionQuantityMilli: 0n, stockQuantity: 0n }
    const nextProductionQuantityMilli = returned.productionQuantityMilli + returnedProductionQuantityMilli
    const nextStockQuantity = returned.stockQuantity + returnedStockQuantity
    if (nextProductionQuantityMilli > BigInt(issue.productionQuantityMilli as number) || nextStockQuantity > BigInt(-issue.quantityDelta)) {
      throw new Error(`Production return ${movement.actionId} exceeds its Plant issue.`)
    }
    productionReturnedByIssue.set(sourceIssueActionId, { productionQuantityMilli: nextProductionQuantityMilli, stockQuantity: nextStockQuantity })
  }
  for (const { orderId, record } of orderReturns) {
    const order = orderById.get(orderId) as unknown as CommerceOrder | undefined
    const lines = order ? reservationLinesForOrder(order) : []
    const reserves = validatedMovements.filter((movement) => movement.kind === 'reserve' && movement.orderId === orderId)
    const releases = validatedMovements.filter((movement) => movement.kind === 'release' && movement.orderId === orderId)
    const latestBasis = [
      order?.createdAt,
      order?.paymentReconciledAt,
      order?.completion?.capturedAt,
      ...reserves.map((movement) => movement.createdAt),
    ].flatMap((timestamp) => timestamp ? [timestampMicros(timestamp) as bigint] : [])
      .reduce((latest, timestamp) => timestamp > latest ? timestamp : latest, 0n)
    const actionMovements = movementsByAction.get(record.actionId) ?? []
    if (!order
      || order.status !== 'completed'
      || !order.completion
      || !lines.length
      || reserves.length !== lines.length
      || releases.length
      || lines.some((line) => reserves.filter((movement) => (
        movement.sku === line.sku && movement.quantityDelta === -line.quantity
      )).length !== 1)
      || (timestampMicros(record.createdAt) as bigint) < latestBasis
      || (record.disposition === 'restock'
        ? actionMovements.length !== 1 || !movementMatchesReturn(actionMovements[0], record, orderId)
        : actionMovements.length !== 0)) {
      throw new Error(`Order return ${record.actionId} is not bound to one completed, reserved sale.`)
    }
  }
  for (const [actionId, actionMovements] of movementsByAction) {
    if (actionMovements.length < 2) continue
    const first = actionMovements[0]
    if ((first.kind !== 'reserve' && first.kind !== 'release')
      || !first.orderId
      || new Set(actionMovements.map((movement) => movement.sku)).size !== actionMovements.length
      || actionMovements.some((movement) => movement.kind !== first.kind
        || movement.orderId !== first.orderId
        || movement.createdAt !== first.createdAt
        || movement.actor !== first.actor
        || movement.reason !== first.reason
        || movement.evidenceReference !== first.evidenceReference)) throw new Error(`Stock movement action ${actionId} is not one exact order reservation group.`)
  }
  for (const [sku, item] of itemBySku) {
    const skuMovements = movements.filter(
      (movement): movement is CommerceStockMovement => isRecord(movement) && movement.sku === sku,
    )
    const oldestCountIndex = skuMovements.map((movement) => movement.kind === 'count').lastIndexOf(true)
    if (oldestCountIndex < 0) continue
    let balance = Number(item.onHand)
    for (const movement of skuMovements.slice(0, oldestCountIndex + 1)) {
      if (movement.kind === 'count' && movement.countedQuantity !== balance) throw new Error(`Stock count ${String(movement.actionId)} does not match the later movement history for ${sku}.`)
      const priorBalance = balance - Number(movement.quantityDelta)
      if (!Number.isSafeInteger(priorBalance) || priorBalance < 0) throw new Error(`Stock movement history for ${sku} has an invalid prior balance.`)
      if (movement.kind === 'count' && movement.expectedQuantity !== priorBalance) throw new Error(`Stock count ${String(movement.actionId)} does not match its expected balance for ${sku}.`)
      balance = priorBalance
    }
  }
  for (const [orderId, count] of reserveByOrder) {
    const order = orderById.get(orderId)
    const reservation = reserveMovementByOrder.get(orderId)
    if (!order
      || count !== reservationLinesForOrder(order as unknown as CommerceOrder).length
      || reserveActionsByOrder.get(orderId)?.size !== 1
      || (order.owner !== undefined && reservation?.actor !== order.owner)) throw new Error(`${orderId} does not have one owner-bound reservation action covering every order line.`)
  }
  for (const [orderId, count] of releaseByOrder) {
    const order = orderById.get(orderId)
    const expected = order ? reservationLinesForOrder(order as unknown as CommerceOrder).length : 0
    if (!expected
      || count !== expected
      || reserveByOrder.get(orderId) !== expected
      || releaseActionsByOrder.get(orderId)?.size !== 1) throw new Error(`${orderId} has an unproven stock release.`)
  }
  for (const purchaseOrder of purchaseOrderById.values()) {
    const received = receiptQuantityByPurchaseOrder.get(purchaseOrder.id) ?? 0
    const rejected = rejectedQuantityByPurchaseOrder.get(purchaseOrder.id) ?? 0
    const delivered = received + rejected
    for (const claim of purchaseOrder.supplierReturns ?? []) {
      const receipt = (movements as CommerceStockMovement[]).find((movement) => movement.id === claim.receiptMovementId)
      if (!receipt || receipt.kind !== 'receipt' || receipt.purchaseOrderId !== purchaseOrder.id
        || !receipt.rejectedQuantity || receipt.rejectedQuantity !== claim.quantityRejected
        || receipt.discrepancyCode !== claim.reasonCode || receipt.discrepancyDisposition !== 'return_to_vendor'
        || purchaseOrder.unitCostMmk === undefined
        || !Number.isSafeInteger(claim.quantityRejected * purchaseOrder.unitCostMmk)
        || claim.claimAmountMmk !== claim.quantityRejected * purchaseOrder.unitCostMmk
        || (timestampMicros(claim.createdAt) as bigint) < (timestampMicros(receipt.createdAt) as bigint)) {
        throw new Error(`${claim.id} does not bind one exact rejected supplier receipt.`)
      }
    }
    if (purchaseOrder.cancellation) {
      if (purchaseOrder.supplierInvoice
        || delivered >= purchaseOrder.quantityOrdered
        || (timestampMicros(purchaseOrder.cancellation.capturedAt) as bigint) < (latestReceiptAtByPurchaseOrder.get(purchaseOrder.id) ?? 0n)) {
        throw new Error(`${purchaseOrder.id} has an invalid cancellation boundary.`)
      }
    } else if (delivered < purchaseOrder.quantityOrdered) {
      activePurchaseOrderSkus.push(purchaseOrder.sku)
    }
    if (purchaseOrder.supplierInvoice?.payableReview) {
      const match = commerceSupplierInvoiceMatch(value as CommerceState, purchaseOrder)
      const latestReceiptAt = latestReceiptAtByPurchaseOrder.get(purchaseOrder.id) ?? 0n
      if (match.status !== 'matched'
        || (timestampMicros(purchaseOrder.supplierInvoice.payableReview.capturedAt) as bigint) < latestReceiptAt) {
        throw new Error(`${purchaseOrder.id} has an invalid payable-ready review.`)
      }
    }
  }
  assertUnique(activePurchaseOrderSkus, 'Active purchase order SKU')

  const closeIds: string[] = []
  for (const [index, candidate] of closes.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['id', 'createdAt', 'total', 'orders'],
      [...closeSnapshotFields, 'settlement'],
    )) throw new Error(`closes[${index}] is invalid.`)
    closeIds.push(requiredText(candidate.id, `closes[${index}].id`))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`closes[${index}].createdAt is invalid.`)
    assertSafeInteger(candidate.total, `closes[${index}].total`)
    assertSafeInteger(candidate.orders, `closes[${index}].orders`)
    const presentSnapshotFields = closeSnapshotFields.filter((field) => candidate[field] !== undefined)
    if (presentSnapshotFields.length && presentSnapshotFields.length !== closeSnapshotFields.length) {
      throw new Error(`closes[${index}] has incomplete exception and operator evidence.`)
    }
    if (presentSnapshotFields.length) {
      if (!Array.isArray(candidate.orderIds) || !Array.isArray(candidate.paymentExceptionOrderIds) || !Array.isArray(candidate.stockExceptionSkus)) {
        throw new Error(`closes[${index}] exception references must be arrays.`)
      }
      const businessDate = canonicalText(candidate.businessDate, `closes[${index}].businessDate`, 10)
      const orderIdsForClose = candidate.orderIds.map((value, referenceIndex) => canonicalText(value, `closes[${index}].orderIds[${referenceIndex}]`, 160))
      const paymentExceptionOrderIds = candidate.paymentExceptionOrderIds.map((value, referenceIndex) => canonicalText(value, `closes[${index}].paymentExceptionOrderIds[${referenceIndex}]`, 160))
      const stockExceptionSkus = candidate.stockExceptionSkus.map((value, referenceIndex) => canonicalText(value, `closes[${index}].stockExceptionSkus[${referenceIndex}]`, 80))
      if (!businessDatePattern.test(businessDate) || businessDate !== myanmarBusinessDate(String(candidate.createdAt))) throw new Error(`closes[${index}].businessDate must match its Myanmar close date.`)
      assertUnique(orderIdsForClose, `closes[${index}] order ID`)
      assertUnique(paymentExceptionOrderIds, `closes[${index}] payment exception order ID`)
      assertUnique(stockExceptionSkus, `closes[${index}] stock exception SKU`)
      if (orderIdsForClose.some((orderId) => !orderIds.includes(orderId))) throw new Error(`closes[${index}] references an unknown closed order.`)
      if (paymentExceptionOrderIds.some((orderId) => !orderIds.includes(orderId))) throw new Error(`closes[${index}] references an unknown payment exception order.`)
      if (stockExceptionSkus.some((sku) => !itemSkus.includes(sku))) throw new Error(`closes[${index}] references an unknown stock exception SKU.`)
      if (!sameStringArray(orderIdsForClose, [...orderIdsForClose].sort())
        || !sameStringArray(paymentExceptionOrderIds, [...paymentExceptionOrderIds].sort())
        || !sameStringArray(stockExceptionSkus, [...stockExceptionSkus].sort())) {
        throw new Error(`closes[${index}] exception references must be sorted.`)
      }
      const memberOrders = orderIdsForClose.map((orderId) => orderById.get(orderId) as unknown as CommerceOrder)
      const memberAdjustedTotals = memberOrders.map(commerceOrderAdjustedTotal)
      if (memberOrders.some((order) => order.status !== 'completed' || order.paymentStatus !== 'reconciled')
        || memberAdjustedTotals.some((total) => total === null)
        || candidate.orders !== orderIdsForClose.length
        || candidate.total !== memberAdjustedTotals.reduce<number>((sum, total) => sum + (total ?? 0), 0)) {
        throw new Error(`closes[${index}] totals must match its completed, reconciled order membership.`)
      }
      if (!closeIdPattern.test(String(candidate.id))) throw new Error(`closes[${index}].id must be a full close UUID.`)
      const actionId = canonicalText(candidate.actionId, `closes[${index}].actionId`, 160)
      if (!closeActionIdPattern.test(actionId)) throw new Error(`closes[${index}].actionId must be a full action UUID.`)
      closeActionIds.push(actionId)
      closeBusinessDates.push(businessDate)
      closedOrderIds.push(...orderIdsForClose)
      canonicalText(candidate.operator, `closes[${index}].operator`)
      canonicalText(candidate.reason, `closes[${index}].reason`)
      canonicalText(candidate.evidenceReference, `closes[${index}].evidenceReference`)
      if (candidate.settlement !== undefined) {
        const settlement = candidate.settlement
        if (!isRecord(settlement) || !hasExactKeys(settlement, ['schema', 'status', 'totalExpectedMmk', 'totalCountedMmk', 'totalVarianceMmk', 'lines'])
          || settlement.schema !== COMMERCE_CLOSE_SETTLEMENT_SCHEMA
          || !['matched', 'variance_review'].includes(String(settlement.status))
          || !Array.isArray(settlement.lines)) throw new Error(`closes[${index}].settlement is invalid.`)
        const expectedByPayment = new Map<string, number>()
        for (const order of memberOrders) {
          const adjustedTotal = commerceOrderAdjustedTotal(order)
          if (adjustedTotal === null) throw new Error(`closes[${index}].settlement order total is invalid.`)
          expectedByPayment.set(order.payment, (expectedByPayment.get(order.payment) ?? 0) + adjustedTotal)
        }
        const expectedMethods = [...expectedByPayment.keys()].sort()
        const settlementLines = settlement.lines.map((lineCandidate, lineIndex): CommerceCloseSettlementLine => {
          const field = `closes[${index}].settlement.lines[${lineIndex}]`
          if (!isRecord(lineCandidate) || !hasExactKeys(lineCandidate, ['paymentMethod', 'expectedMmk', 'countedMmk', 'varianceMmk', 'status', 'varianceOwner', 'varianceReason'])) throw new Error(`${field} is invalid.`)
          const paymentMethod = canonicalText(lineCandidate.paymentMethod, `${field}.paymentMethod`, 80)
          if (!Number.isSafeInteger(lineCandidate.expectedMmk) || Number(lineCandidate.expectedMmk) < 0
            || !Number.isSafeInteger(lineCandidate.countedMmk) || Number(lineCandidate.countedMmk) < 0
            || !Number.isSafeInteger(lineCandidate.varianceMmk)) throw new Error(`${field} amounts are invalid.`)
          const expectedMmk = Number(lineCandidate.expectedMmk)
          const countedMmk = Number(lineCandidate.countedMmk)
          const varianceMmk = Number(lineCandidate.varianceMmk)
          if (expectedByPayment.get(paymentMethod) !== expectedMmk || countedMmk - expectedMmk !== varianceMmk) throw new Error(`${field} does not match the closed orders.`)
          if (varianceMmk === 0) {
            if (lineCandidate.status !== 'matched' || lineCandidate.varianceOwner !== null || lineCandidate.varianceReason !== null) throw new Error(`${field} matched evidence is invalid.`)
          } else {
            if (lineCandidate.status !== 'variance_review') throw new Error(`${field} variance status is invalid.`)
            canonicalText(lineCandidate.varianceOwner, `${field}.varianceOwner`, 80)
            canonicalText(lineCandidate.varianceReason, `${field}.varianceReason`, 240)
          }
          return lineCandidate as unknown as CommerceCloseSettlementLine
        })
        const methods = settlementLines.map((line) => line.paymentMethod)
        if (!sameStringArray(methods, expectedMethods)) throw new Error(`closes[${index}].settlement payment methods are invalid.`)
        const totalExpectedMmk = settlementLines.reduce((total, line) => total + line.expectedMmk, 0)
        const totalCountedMmk = settlementLines.reduce((total, line) => total + line.countedMmk, 0)
        const totalVarianceMmk = settlementLines.reduce((total, line) => total + line.varianceMmk, 0)
        if (![totalExpectedMmk, totalCountedMmk, totalVarianceMmk].every(Number.isSafeInteger)
          || settlement.totalExpectedMmk !== totalExpectedMmk
          || settlement.totalCountedMmk !== totalCountedMmk
          || settlement.totalVarianceMmk !== totalVarianceMmk
          || totalExpectedMmk !== candidate.total
          || settlement.status !== (settlementLines.some((line) => line.status === 'variance_review') ? 'variance_review' : 'matched')) {
          throw new Error(`closes[${index}].settlement totals are invalid.`)
        }
      }
    }
  }
  assertUnique(closeIds, 'Daily close ID')
  assertUnique(closeBusinessDates, 'Daily close business date')
  assertUnique(closedOrderIds, 'Closed order ID')

  const intakeIds: string[] = []
  const intakeSources: string[] = []
  for (const [index, candidate] of websiteIntakes.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['id', 'createdAt', 'status', 'source', 'sku', 'quantity', 'itemName', 'unitPrice', 'total', 'creation'],
      ['itemVariant', 'snapshotDigest', 'conversion'],
    )) throw new Error(`websiteIntakes[${index}] is invalid.`)
    const intakeId = canonicalText(candidate.id, `websiteIntakes[${index}].id`, 85)
    if (!websiteIntakeIdPattern.test(intakeId)) throw new Error(`websiteIntakes[${index}].id is invalid.`)
    if (!validTimestamp(candidate.createdAt)) throw new Error(`websiteIntakes[${index}].createdAt is invalid.`)
    if (!websiteIntakeStatuses.includes(candidate.status as CommerceWebsiteIntakeStatus)) throw new Error(`websiteIntakes[${index}].status is invalid.`)
    if (!isRecord(candidate.source) || !hasExactKeys(candidate.source, ['fingerprint', 'approvalId', 'snapshotId', 'pageId', 'siteName', 'pagePath'])) {
      throw new Error(`websiteIntakes[${index}].source is invalid.`)
    }
    const fingerprint = canonicalText(candidate.source.fingerprint, `websiteIntakes[${index}].source.fingerprint`, 12)
    if (!websiteFingerprintPattern.test(fingerprint)) throw new Error(`websiteIntakes[${index}].source.fingerprint is invalid.`)
    const approvalId = canonicalText(candidate.source.approvalId, `websiteIntakes[${index}].source.approvalId`, 160)
    const snapshotId = canonicalText(candidate.source.snapshotId, `websiteIntakes[${index}].source.snapshotId`, 160)
    const pageId = canonicalText(candidate.source.pageId, `websiteIntakes[${index}].source.pageId`, 160)
    canonicalText(candidate.source.siteName, `websiteIntakes[${index}].source.siteName`, 160)
    const pagePath = canonicalText(candidate.source.pagePath, `websiteIntakes[${index}].source.pagePath`, 160)
    if (!pagePath.startsWith('/')) throw new Error(`websiteIntakes[${index}].source.pagePath must be absolute.`)
    const sku = canonicalText(candidate.sku, `websiteIntakes[${index}].sku`, 80)
    assertSafeInteger(candidate.quantity, `websiteIntakes[${index}].quantity`, 1)
    const item = itemBySku.get(sku)
    if (!item) throw new Error(`websiteIntakes[${index}].sku is unknown.`)
    const itemName = canonicalText(candidate.itemName, `websiteIntakes[${index}].itemName`)
    const itemVariant = candidate.itemVariant === undefined ? undefined : canonicalText(candidate.itemVariant, `websiteIntakes[${index}].itemVariant`)
    assertSafeInteger(candidate.unitPrice, `websiteIntakes[${index}].unitPrice`, 1)
    assertSafeInteger(candidate.total, `websiteIntakes[${index}].total`, 1)
    if (itemName !== item.name || itemVariant !== optionalText(item.variant) || candidate.total !== Number(candidate.quantity) * Number(candidate.unitPrice)) {
      throw new Error(`websiteIntakes[${index}] does not match its retained Commerce snapshot.`)
    }
    if (!isRecord(candidate.creation) || !hasExactKeys(candidate.creation, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])) {
      throw new Error(`websiteIntakes[${index}].creation is invalid.`)
    }
    const creation = candidate.creation as CommerceActionProof
    if (!validProof(creation) || creation.capturedAt !== candidate.createdAt) throw new Error(`websiteIntakes[${index}].creation is invalid.`)
    for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) canonicalText(creation[field], `websiteIntakes[${index}].creation.${field}`, field === 'actionId' ? 160 : 180)
    if (candidate.snapshotDigest !== undefined) {
      const snapshot: Omit<CommerceWebsiteIntake, 'snapshotDigest' | 'conversion' | 'status'> = {
        id: intakeId,
        createdAt: candidate.createdAt as string,
        source: candidate.source as unknown as CommerceWebsiteSource,
        sku,
        quantity: Number(candidate.quantity),
        itemName,
        unitPrice: Number(candidate.unitPrice),
        total: Number(candidate.total),
        creation,
      }
      if (itemVariant !== undefined) snapshot.itemVariant = itemVariant
      if (typeof candidate.snapshotDigest !== 'string'
        || !sha256DigestPattern.test(candidate.snapshotDigest)
        || candidate.snapshotDigest !== commerceWebsiteIntakeSnapshotDigest(snapshot)) {
        throw new Error(`websiteIntakes[${index}].snapshotDigest is invalid.`)
      }
    }
    websiteIntakeCreationActionIds.push(creation.actionId)

    const matchingSourceOrders = orders.filter((order) => isRecord(order) && order.sourceRecordId === intakeId) as Record<string, unknown>[]
    if (candidate.status === 'pending_confirmation') {
      if (candidate.conversion !== undefined || matchingSourceOrders.length) throw new Error(`websiteIntakes[${index}] pending intake has conversion history.`)
    } else {
      if (!isRecord(candidate.conversion) || !hasExactKeys(candidate.conversion, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference', 'orderId'])) {
        throw new Error(`websiteIntakes[${index}].conversion is invalid.`)
      }
      const conversion = candidate.conversion as CommerceActionProof & { orderId: string }
      if (!validProof(conversion)) throw new Error(`websiteIntakes[${index}].conversion is invalid.`)
      for (const field of ['actionId', 'actor', 'reason', 'evidenceReference'] as const) canonicalText(conversion[field], `websiteIntakes[${index}].conversion.${field}`, field === 'actionId' ? 160 : 180)
      const orderId = canonicalText(conversion.orderId, `websiteIntakes[${index}].conversion.orderId`, 160)
      const order = orderById.get(orderId)
      const matchingReservation = movements.filter((movement) => isRecord(movement)
        && movement.kind === 'reserve'
        && movement.orderId === orderId
        && movement.actionId === conversion.actionId)
      if (matchingSourceOrders.length !== 1 || !order || matchingSourceOrders[0] !== order
        || matchingReservation.length !== 1
        || !sameProof(matchingReservation[0] as unknown as CommerceStockMovement, conversion)
        || order.createdAt !== conversion.capturedAt
        || order.channel !== 'Website'
        || order.item !== itemName
        || order.itemSku !== sku
        || order.quantity !== candidate.quantity
        || order.total !== candidate.total
        || order.evidenceReference !== conversion.evidenceReference) {
        throw new Error(`websiteIntakes[${index}] does not match its converted Website order.`)
      }
      websiteIntakeConversionActionIds.push(conversion.actionId)
    }
    intakeIds.push(intakeId)
    intakeSources.push([fingerprint, approvalId, snapshotId, pageId].join('|'))
  }
  assertUnique(intakeIds, 'Website intake ID')
  assertUnique(intakeSources, 'Website intake source')
  assertUnique(websiteIntakeConversionActionIds, 'Website intake conversion action ID')
  const storefrontRequestIds: string[] = []
  const storefrontIdempotencyKeys: string[] = []
  const storefrontActionIds: string[] = []
  for (const [index, candidate] of storefrontRequests.entries()) {
    if (!isRecord(candidate)) throw new Error(`storefrontRequests[${index}] is invalid.`)
    if (candidate.schema === 'supermega.ecommerce.order_request.v2') {
      const request = storefrontRequestV2(candidate, `storefrontRequests[${index}]`)
      storefrontRequestIds.push(request.id)
      storefrontIdempotencyKeys.push(request.idempotencyKey)
      storefrontActionIds.push(`ACT-${request.id.slice(4)}`)
      continue
    }
    const legacyFields = ['schema', 'mode', 'state', 'id', 'idempotencyKey', 'createdAt', 'sourcePreviewDigest', 'customerReference', 'fulfilment', 'currency', 'line', 'totalMmk']
    const currentFields = [...legacyFields, 'sourceStorefrontRevision', 'sourceStorefrontActionId']
    if (!hasExactKeys(candidate, legacyFields) && !hasExactKeys(candidate, currentFields)) {
      throw new Error(`storefrontRequests[${index}] is invalid.`)
    }
    const hasStorefrontProvenance = 'sourceStorefrontRevision' in candidate
      && 'sourceStorefrontActionId' in candidate
    const requestId = canonicalText(candidate.id, `storefrontRequests[${index}].id`, 40)
    const idempotencyKey = canonicalText(candidate.idempotencyKey, `storefrontRequests[${index}].idempotencyKey`, 40)
    if (candidate.schema !== 'supermega.ecommerce.order_request.v1'
      || candidate.mode !== 'browser-local-request'
      || candidate.state !== 'pending_shop_review'
      || !storefrontRequestIdPattern.test(requestId)
      || !storefrontIdempotencyPattern.test(idempotencyKey)
      || requestId.slice(4) !== idempotencyKey.slice(4)
      || !validTimestamp(candidate.createdAt)
      || typeof candidate.sourcePreviewDigest !== 'string'
      || !sha256DigestPattern.test(candidate.sourcePreviewDigest)
      || (hasStorefrontProvenance
        && (candidate.sourceStorefrontRevision === null) !== (candidate.sourceStorefrontActionId === null))
      || (hasStorefrontProvenance
        && candidate.sourceStorefrontRevision !== null
        && (!Number.isSafeInteger(candidate.sourceStorefrontRevision)
          || Number(candidate.sourceStorefrontRevision) < 1
          || typeof candidate.sourceStorefrontActionId !== 'string'))
      || candidate.fulfilment !== 'pickup' && candidate.fulfilment !== 'delivery'
      || candidate.currency !== 'MMK'
      || !isRecord(candidate.line)
      || !hasExactKeys(candidate.line, ['sku', 'name', 'variant', 'quantity', 'unitPriceMmk'])) {
      throw new Error(`storefrontRequests[${index}] is invalid.`)
    }
    canonicalText(candidate.customerReference, `storefrontRequests[${index}].customerReference`, 80)
    if (hasStorefrontProvenance && candidate.sourceStorefrontActionId !== null) {
      canonicalText(
        candidate.sourceStorefrontActionId,
        `storefrontRequests[${index}].sourceStorefrontActionId`,
        160,
      )
    }
    canonicalText(candidate.line.sku, `storefrontRequests[${index}].line.sku`, 80)
    canonicalText(candidate.line.name, `storefrontRequests[${index}].line.name`)
    if (candidate.line.variant !== null) canonicalText(candidate.line.variant, `storefrontRequests[${index}].line.variant`)
    assertSafeInteger(candidate.line.quantity, `storefrontRequests[${index}].line.quantity`, 1)
    if (Number(candidate.line.quantity) > 99) throw new Error(`storefrontRequests[${index}].line.quantity must be at most 99.`)
    assertSafeInteger(candidate.line.unitPriceMmk, `storefrontRequests[${index}].line.unitPriceMmk`, 1)
    assertSafeInteger(candidate.totalMmk, `storefrontRequests[${index}].totalMmk`, 1)
    if (candidate.totalMmk !== Number(candidate.line.quantity) * Number(candidate.line.unitPriceMmk)) {
      throw new Error(`storefrontRequests[${index}].totalMmk is invalid.`)
    }
    storefrontRequestIds.push(requestId)
    storefrontIdempotencyKeys.push(idempotencyKey)
    storefrontActionIds.push(`ACT-${requestId.slice(4)}`)
  }
  assertUnique(storefrontRequestIds, 'Storefront request ID')
  assertUnique(storefrontIdempotencyKeys, 'Storefront request idempotency key')
  const catalogBaselineActionSet = new Set(catalogBaselineActionIds)
  for (const actionId of catalogBaselineActionSet) {
    const baselines = [...catalogBaselineBySku.values()].filter((baseline) => baseline.proof.actionId === actionId)
    const matchingChanges = catalogChanges.filter((candidate) => isRecord(candidate)
      && isRecord(candidate.proof)
      && candidate.proof.actionId === actionId) as unknown as CommerceCatalogChange[]
    const matchingMovements = movements.filter((candidate) => isRecord(candidate)
      && candidate.actionId === actionId) as unknown as CommerceStockMovement[]
    if (matchingChanges.length && matchingMovements.length) {
      throw new Error(`Catalog baseline action ${actionId} cannot anchor two event types.`)
    }
    if (matchingChanges.length) {
      const [baseline] = baselines
      const [change] = matchingChanges
      if (baselines.length !== 1
        || matchingChanges.length !== 1
        || change !== newerCatalogChangeBySku.get(baseline.sku)
        || change.sku !== baseline.sku
        || !sameActionProof(change.proof, baseline.proof)) {
        throw new Error(`Catalog baseline action ${actionId} does not match its first catalog change.`)
      }
    }
    if (matchingMovements.length) {
      const [baseline] = baselines
      const [movement] = matchingMovements
      if (baselines.length !== 1
        || matchingMovements.length !== 1
        || movement.kind !== 'opening'
        || movement.sku !== baseline.sku
        || !sameProof(movement, baseline.proof)) {
        throw new Error(`Catalog baseline action ${actionId} does not match its opening balance.`)
      }
    }
  }
  assertUnique([
    ...new Set(movementActionIds.filter((actionId) => !returnActionIds.includes(actionId) && !catalogBaselineActionSet.has(actionId))),
    ...reconciliationActionIds,
    ...refundSettlementActionIds,
    ...advancementActionIds,
    ...completionActionIds,
    ...returnActionIds,
    ...supportActionIds,
    ...correctionActionIds,
    ...collectionActionIds,
    ...catalogChangeActionIds.filter((actionId) => !catalogBaselineActionSet.has(actionId)),
    ...catalogBaselineActionSet,
    ...taxConfigurationActionIds,
    ...accountMappingConfigurationActionIds,
    ...customerCreditPolicyActionIds,
    ...promotionPolicyActionIds,
    ...shippingPolicyActionIds,
    ...paymentPolicyActionIds,
    ...purchaseBudgetEnvelopeActionIds,
    ...supplierSourcingDecisionActionIds,
    ...websiteIntakeCreationActionIds,
    ...closeActionIds,
    ...purchaseRequisitionActionIds,
    ...purchaseOrderActionIds,
    ...storefrontActionIds,
    ...(storefrontConfigurationActionId ? [storefrontConfigurationActionId] : []),
  ], 'Commerce action ID')
  if (value.inventoryFoundation) {
    try {
      if (!shopInventoryMatchesItems(
        value.inventoryFoundation as ShopInventoryState,
        value.items as CommerceItem[],
      )) throw new Error('available-to-promise stock does not match the Shop catalog')
      // Sorted, because projectShopInventory requires canonical SKU order and itemSkus is
      // built in CATALOG order. Every other caller sorts; this one did not, so validating any
      // workspace that had an inventory foundation threw for any catalog whose SKUs were not
      // already alphabetical -- which is essentially every real shop. The effect was that
      // location setup could never be confirmed.
      const inventory = projectShopInventory(value.inventoryFoundation as ShopInventoryState, [...itemSkus].sort())
      for (const decision of supplierSourcingDecisionById.values()) {
        for (const quote of decision.quotes) {
          const vendor = inventory.vendors.find((candidate) => candidate.name === quote.supplier)
          const policy = vendor && inventory.supplierPolicies.find((candidate) => (
            candidate.vendorId === vendor.id && candidate.sku === decision.sku && candidate.status === 'active'
          ))
          if (!policy || policy.commandId !== quote.vendorApprovalReference) throw new Error(`supplier quote ${quote.quoteReference} is not bound to an active approved-vendor policy`)
        }
      }
    } catch (error) {
      throw new Error(
        `Commerce location inventory is invalid: ${error instanceof Error ? error.message : 'integrity check failed'}.`,
        { cause: error },
      )
    }
  }
  return value as CommerceState
}

function legacyInteger(value: unknown, fallback: number, minimum = 0) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback
}

function legacyTimestamp(value: unknown) {
  return validTimestamp(value) ? value as string : '1970-01-01T00:00:00.000Z'
}

function migrateLegacyCommerce(value: unknown): CommerceState {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error('Legacy Commerce workspace has no item collection.')
  const items = value.items.map((candidate, index): CommerceItem => {
    if (!isRecord(candidate)) throw new Error(`Legacy item ${index + 1} is invalid.`)
    const item: CommerceItem = {
      sku: requiredText(candidate.sku, `legacy.items[${index}].sku`),
      name: requiredText(candidate.name, `legacy.items[${index}].name`),
      onHand: legacyInteger(candidate.onHand, 0),
      reorderAt: legacyInteger(candidate.reorderAt, 0),
      price: legacyInteger(candidate.price, 1, 1),
    }
    const variant = optionalText(candidate.variant)
    if (variant) item.variant = variant
    return item
  })
  const rawOrders = Array.isArray(value.orders) ? value.orders : Array.isArray(value.sales) ? value.sales : []
  const fromSales = !Array.isArray(value.orders) && Array.isArray(value.sales)
  const orders = rawOrders.map((candidate, index): CommerceOrder => {
    if (!isRecord(candidate)) throw new Error(`Legacy order ${index + 1} is invalid.`)
    const itemName = optionalText(candidate.item) ?? 'Legacy item'
    const matchingItems = items.filter((item) => item.name === itemName)
    const storedSku = optionalText(candidate.itemSku)
    const itemSku = storedSku && items.some((item) => item.sku === storedSku) ? storedSku : matchingItems.length === 1 ? matchingItems[0].sku : undefined
    const requestedStatus = fromSales ? 'completed' : candidate.status
    const status: Exclude<CommerceOrderStatus, 'cancelled'> = requestedStatus === 'confirmed' || requestedStatus === 'preparing' || requestedStatus === 'ready' || requestedStatus === 'completed' ? requestedStatus : 'completed'
    const order: CommerceOrder = {
      id: optionalText(candidate.id) ?? `ORD-LEGACY-${index + 1}`,
      createdAt: legacyTimestamp(candidate.createdAt),
      customer: (optionalText(candidate.customer) ?? optionalText(candidate.customerName) ?? 'Walk-in customer').replace('Legacy customer unavailable', 'Walk-in customer'),
      channel: (optionalText(candidate.channel) ?? 'Imported sale').replace('Legacy local sale', 'Imported sale'),
      item: itemName,
      quantity: legacyInteger(candidate.quantity, 1, 1),
      payment: optionalText(candidate.payment) ?? 'Payment not recorded',
      paymentStatus: 'pending',
      refundStatus: 'none',
      total: legacyInteger(candidate.total, 0),
      status,
    }
    if (itemSku) order.itemSku = itemSku
    for (const field of ['fulfilment', 'sourceRecordId', 'evidenceReference'] as const) {
      const fieldValue = optionalText(candidate[field])
      if (fieldValue) order[field] = fieldValue
    }
    return order
  })
  const rawCloses = Array.isArray(value.closes) ? value.closes : []
  const closes = rawCloses.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`Legacy close ${index + 1} is invalid.`)
    return {
      id: optionalText(candidate.id) ?? `CLOSE-LEGACY-${index + 1}`,
      createdAt: legacyTimestamp(candidate.createdAt),
      total: legacyInteger(candidate.total, 0),
      orders: legacyInteger(candidate.orders ?? candidate.transactions, 0),
    }
  })
  return validateCommerceState({ schema: COMMERCE_WORKSPACE_SCHEMA, items, orders, movements: [], closes, catalogBaselines: [], catalogChanges: [], websiteIntakes: [], storefrontRequests: [], purchaseOrders: [] })
}

export function normalizeCommerce(value: unknown): CommerceState {
  if (isRecord(value) && value.schema === COMMERCE_WORKSPACE_SCHEMA) return validateCommerceState(value)
  return migrateLegacyCommerce(value)
}

function browserStorage() {
  try { return globalThis.localStorage as CommerceStorage | undefined } catch { return undefined }
}

function persistInitialState(storage: CommerceStorage, state: CommerceState, source: CommerceWorkspaceSnapshot['source']): CommerceWorkspaceSnapshot {
  try {
    const serialized = JSON.stringify(state)
    storage.setItem(COMMERCE_KEY, serialized)
    if (storage.getItem(COMMERCE_KEY) !== serialized) throw new Error('write_not_confirmed')
    return { state, source, error: '' }
  } catch {
    return { state, source, error: 'Commerce storage is unavailable. This workspace is read-only until browser storage is restored.' }
  }
}

export function readCommerceWorkspace(storage = browserStorage()): CommerceWorkspaceReadSnapshot {
  if (!storage) return { state: createEmptyCommerce(), source: 'recovery', error: 'Commerce storage is unavailable. No local data was changed.' }
  let currentRaw: string | null
  try { currentRaw = storage.getItem(COMMERCE_KEY) } catch { return { state: createEmptyCommerce(), source: 'recovery', error: 'Commerce storage could not be read. No local data was changed.' } }
  if (currentRaw !== null) {
    try {
      return { state: validateCommerceState(JSON.parse(currentRaw)), source: 'current', error: '' }
    } catch {
      return { state: createEmptyCommerce(), source: 'recovery', error: 'Commerce v2 data is malformed. The read failed closed without replacing data.' }
    }
  }

  let invalidLegacyFound = false
  for (const legacyKey of LEGACY_COMMERCE_KEYS) {
    let legacyRaw: string | null
    try { legacyRaw = storage.getItem(legacyKey) } catch { invalidLegacyFound = true; continue }
    if (legacyRaw === null) continue
    try {
      return { state: migrateLegacyCommerce(JSON.parse(legacyRaw)), source: 'legacy', error: '' }
    } catch {
      invalidLegacyFound = true
    }
  }
  if (invalidLegacyFound) return { state: createEmptyCommerce(), source: 'recovery', error: 'Legacy Commerce data is malformed. The read failed closed without creating v2 data.' }
  return { state: createEmptyCommerce(), source: 'absent', error: '' }
}

export function loadCommerceWorkspace(storage = browserStorage()): CommerceWorkspaceSnapshot {
  if (!storage) return { state: createEmptyCommerce(), source: 'recovery', error: 'Commerce storage is unavailable. No local data was replaced.' }
  let currentRaw: string | null
  try { currentRaw = storage.getItem(COMMERCE_KEY) } catch { return { state: createEmptyCommerce(), source: 'recovery', error: 'Commerce storage could not be read. No local data was replaced.' } }
  if (currentRaw !== null) {
    try {
      const current = validateCommerceState(JSON.parse(currentRaw))
      const upgraded = upgradeCommerceSeedPolicies(current)
      return upgraded === current
        ? { state: current, source: 'current', error: '' }
        : persistInitialState(storage, upgraded, 'current')
    } catch {
      return { state: createEmptyCommerce(), source: 'recovery', error: 'Commerce v2 data is malformed. Recovery failed closed without restoring or replacing older data.' }
    }
  }

  let invalidLegacyFound = false
  for (const legacyKey of LEGACY_COMMERCE_KEYS) {
    let legacyRaw: string | null
    try { legacyRaw = storage.getItem(legacyKey) } catch { invalidLegacyFound = true; continue }
    if (legacyRaw === null) continue
    try {
      return persistInitialState(storage, migrateLegacyCommerce(JSON.parse(legacyRaw)), 'legacy')
    } catch {
      invalidLegacyFound = true
    }
  }
  if (invalidLegacyFound) return { state: createEmptyCommerce(), source: 'recovery', error: 'Legacy Commerce data is malformed. Migration failed closed and did not create v2 data.' }
  return persistInitialState(storage, createSeedCommerce(Date.now()), 'seed')
}

export function commerceWorkspaceCanWrite(
  storage = browserStorage(),
  lockManager = globalThis.navigator?.locks as unknown as CommerceLockManager | undefined,
) {
  if (!storage || !lockManager?.request || !storage.removeItem) return false
  const probeKey = `${COMMERCE_KEY}.write-probe.${Date.now()}.${Math.random().toString(36).slice(2)}`
  const probeValue = `${probeKey}.confirmed`
  try {
    const raw = storage.getItem(COMMERCE_KEY)
    if (raw === null) return false
    validateCommerceState(JSON.parse(raw))
    storage.setItem(probeKey, probeValue)
    const confirmed = storage.getItem(probeKey) === probeValue
    storage.removeItem(probeKey)
    return confirmed && storage.getItem(probeKey) === null
  } catch {
    try { storage.removeItem(probeKey) } catch { /* storage remains blocked */ }
    return false
  }
}

export async function mutateCommerceWorkspace(
  transition: (state: CommerceState) => CommerceState | null,
  storage = browserStorage(),
  lockManager = globalThis.navigator?.locks as unknown as CommerceLockManager | undefined,
): Promise<CommerceMutationResult> {
  if (!storage) return { ok: false, error: 'Commerce storage is unavailable; the change was not applied.' }
  if (!lockManager?.request) return { ok: false, error: 'This browser cannot lock Commerce writes; the change was not applied.' }
  try {
    return await lockManager.request(COMMERCE_LOCK, { mode: 'exclusive' }, async () => {
      let raw: string | null
      try { raw = storage.getItem(COMMERCE_KEY) } catch { return { ok: false, error: 'Commerce data could not be read; the change was not applied.' } as const }
      if (raw === null) return { ok: false, error: 'Commerce v2 is not initialized; reload before making a change.' } as const
      let current: CommerceState
      try { current = validateCommerceState(JSON.parse(raw)) } catch { return { ok: false, error: 'Commerce v2 is malformed; the change failed closed.' } as const }
      const next = transition(current)
      if (!next) return { ok: false, error: 'The Commerce state changed or the requested transition is not valid. Nothing was written.' } as const
      if (next === current) return { ok: true, state: current, replayed: true } as const
      let serialized: string
      try { serialized = JSON.stringify(validateCommerceState(next)) } catch { return { ok: false, error: 'The proposed Commerce state failed integrity checks. Nothing was written.' } as const }
      try {
        storage.setItem(COMMERCE_KEY, serialized)
        if (storage.getItem(COMMERCE_KEY) !== serialized) return { ok: false, error: 'Commerce storage did not confirm the write.' } as const
      } catch {
        return { ok: false, error: 'Commerce storage rejected the write. The interface was not advanced.' } as const
      }
      return { ok: true, state: next, replayed: false } as const
    })
  } catch {
    return { ok: false, error: 'The Commerce write lock failed. Nothing was applied.' }
  }
}

function movementFor(
  proof: CommerceActionProof,
  input: Omit<CommerceStockMovement, 'id' | 'actionId' | 'createdAt' | 'actor' | 'reason' | 'evidenceReference'>,
  idSuffix?: string,
): CommerceStockMovement {
  return {
    id: `MOV2:${encodeURIComponent(proof.actionId)}${idSuffix ? `:${idSuffix}` : ''}`,
    actionId: proof.actionId,
    createdAt: proof.capturedAt,
    actor: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
    ...input,
  }
}

function actionIdIsUsed(state: CommerceState, actionId: string) {
  return state.movements.some((movement) => movement.actionId === actionId)
    || state.orders.some((order) => order.paymentReconciliationActionId === actionId || order.refundSettlementActionId === actionId)
    || state.orders.some((order) => order.advancementActionIds?.includes(actionId))
    || state.orders.some((order) => order.completion?.actionId === actionId)
    || state.orders.some((order) => order.returns?.some((record) => record.actionId === actionId))
    || state.orders.some((order) => order.supportCases?.some((record) => record.opening.actionId === actionId
      || record.serviceEvents?.some((serviceEvent) => serviceEvent.proof.actionId === actionId)
      || record.resolution?.proof.actionId === actionId
      || record.reopen?.proof.actionId === actionId
      || record.followUpServiceEvents?.some((serviceEvent) => serviceEvent.proof.actionId === actionId)
      || record.followUpResolution?.proof.actionId === actionId))
    || state.orders.some((order) => order.corrections?.some((record) => record.actionId === actionId))
    || state.orders.some((order) => order.collectionActions?.some((record) => record.proof.actionId === actionId))
    || state.closes.some((close) => close.actionId === actionId)
    || commerceCatalogBaselines(state).some((baseline) => baseline.proof.actionId === actionId)
    || commerceCatalogChanges(state).some((change) => change.proof.actionId === actionId)
    || commerceTaxConfigurations(state).some((configuration) => configuration.proof.actionId === actionId)
    || commerceAccountMappingConfigurations(state).some((configuration) => configuration.proof.actionId === actionId)
    || commerceCustomerCreditPolicies(state).some((policy) => policy.proof.actionId === actionId)
    || commercePromotionPolicies(state).some((policy) => policy.proof.actionId === actionId)
    || commerceShippingPolicies(state).some((policy) => policy.proof.actionId === actionId)
    || commercePaymentPolicies(state).some((policy) => policy.proof.actionId === actionId)
    || commercePurchaseBudgetEnvelopes(state).some((envelope) => envelope.approval.actionId === actionId)
    || commerceSupplierSourcingDecisions(state).some((decision) => decision.approval.actionId === actionId)
    || commerceWebsiteIntakes(state).some((intake) => intake.creation.actionId === actionId || intake.conversion?.actionId === actionId)
    || commercePurchaseRequisitions(state).some((requisition) => requisition.approval.actionId === actionId)
    || commercePurchaseOrders(state).some((purchaseOrder) => purchaseOrder.creation.actionId === actionId
      || purchaseOrder.cancellation?.actionId === actionId
      || purchaseOrder.supplierInvoice?.recording.actionId === actionId
      || purchaseOrder.supplierInvoice?.payableReview?.actionId === actionId
      || purchaseOrder.supplierReturns?.some((claim) => claim.authorization.actionId === actionId
        || claim.creditNotes.some((credit) => credit.recording.actionId === actionId)))
    || state.storefrontConfiguration?.saved.actionId === actionId
    || state.inventoryFoundation?.commands.some((command) => command.payload.proof.actionId === actionId)
}

function sameWebsiteSource(left: CommerceWebsiteSource, right: CommerceWebsiteSource) {
  return left.fingerprint === right.fingerprint
    && left.approvalId === right.approvalId
    && left.snapshotId === right.snapshotId
    && left.pageId === right.pageId
    && left.siteName === right.siteName
    && left.pagePath === right.pagePath
}

function sameActionProof(left: CommerceActionProof, right: CommerceActionProof) {
  return left.actionId === right.actionId
    && left.capturedAt === right.capturedAt
    && left.actor === right.actor
    && left.reason === right.reason
    && left.evidenceReference === right.evidenceReference
}

function sameCatalogChange(left: CommerceCatalogChange, right: CommerceCatalogChange) {
  return left.sku === right.sku
    && left.previousPrice === right.previousPrice
    && left.nextPrice === right.nextPrice
    && left.previousReorderAt === right.previousReorderAt
    && left.nextReorderAt === right.nextReorderAt
    && sameActionProof(left.proof, right.proof)
}

function sameCatalogBaseline(left: CommerceCatalogBaseline, right: CommerceCatalogBaseline) {
  return left.sku === right.sku
    && left.price === right.price
    && left.reorderAt === right.reorderAt
    && left.anchorDigest === right.anchorDigest
    && sameActionProof(left.proof, right.proof)
}

function shopInventoryProductionReturnActionMatches(
  foundation: ShopInventoryState,
  sourceIssueActionId: string,
  productionQuantityMilli: number,
  stockQuantity: number,
  stockUnitId: string,
  locationId: string,
  proof: CommerceActionProof,
  catalogSkus: string[],
) {
  try {
    projectShopInventory(foundation, catalogSkus)
    const source = foundation.commands.find((command) => command.payload.kind === 'production_issue'
      && command.payload.proof.actionId === sourceIssueActionId)?.payload
    if (!source || source.kind !== 'production_issue') return false
    const matches = foundation.commands.filter((command) => {
      const payload = command.payload
      return payload.kind === 'production_return'
        && payload.productionIssueId === source.id
        && payload.productionQuantityMilli === productionQuantityMilli
        && payload.stockQuantity === stockQuantity
        && payload.stockUnitId === stockUnitId
        && payload.locationId === locationId
        && sameActionProof(payload.proof, proof)
    })
    return matches.length === 1
  } catch {
    return false
  }
}

type ValidatedSupportServiceTimeline = {
  effectiveService: CommerceSupportServiceState
  latestAt: bigint
  acknowledged: boolean
  firstResponseReady: boolean
}

function validateSupportServiceTimeline(
  value: unknown,
  field: string,
  caseId: string,
  initialService: CommerceSupportServiceState,
  initialAt: bigint,
  supportActionIds: string[],
): ValidatedSupportServiceTimeline {
  let effectiveService = initialService
  let latestAt = initialAt
  let acknowledged = false
  let firstResponseReady = false
  if (value === undefined) return { effectiveService, latestAt, acknowledged, firstResponseReady }
  if (!Array.isArray(value) || value.length < 1 || value.length > maxSupportServiceEventsPerCase) {
    throw new Error(`${field} requires 1 to ${maxSupportServiceEventsPerCase} records.`)
  }
  for (const [reverseIndex, serviceCandidate] of [...value].reverse().entries()) {
    const serviceIndex = value.length - reverseIndex - 1
    const serviceField = `${field}[${serviceIndex}]`
    if (!isRecord(serviceCandidate)
      || !hasExactKeys(serviceCandidate, ['kind', 'owner', 'priority', 'dueAt', 'note', 'proof'])
      || !supportServiceEventKinds.includes(serviceCandidate.kind as CommerceSupportServiceEventKind)
      || !supportPriorities.includes(serviceCandidate.priority as CommerceSupportPriority)
      || !validTimestamp(serviceCandidate.dueAt)
      || !isRecord(serviceCandidate.proof)
      || !hasExactKeys(serviceCandidate.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(serviceCandidate.proof as CommerceActionProof)
      || serviceCandidate.proof.evidenceReference !== `SUPPORT-SERVICE:${caseId}`) {
      throw new Error(`${serviceField} is invalid.`)
    }
    const serviceProof = serviceCandidate.proof as CommerceActionProof
    const serviceAt = timestampMicros(serviceProof.capturedAt) as bigint
    const dueAt = timestampMicros(serviceCandidate.dueAt) as bigint
    const previousDueAt = timestampMicros(effectiveService.dueAt) as bigint
    const previousPriority = supportPriorities.indexOf(effectiveService.priority)
    const nextPriority = supportPriorities.indexOf(serviceCandidate.priority as CommerceSupportPriority)
    canonicalText(serviceCandidate.owner, `${serviceField}.owner`, 120)
    canonicalText(serviceCandidate.note, `${serviceField}.note`, 300)
    if (serviceAt < latestAt) throw new Error(`${serviceField} chronology is invalid.`)
    if (serviceCandidate.kind === 'reassigned') {
      if (serviceCandidate.owner === effectiveService.owner
        || serviceCandidate.priority !== effectiveService.priority
        || serviceCandidate.dueAt !== effectiveService.dueAt) throw new Error(`${serviceField} must change only the accountable owner.`)
    } else if (serviceCandidate.kind === 'escalated') {
      if (serviceCandidate.owner !== effectiveService.owner
        || nextPriority > previousPriority
        || dueAt > previousDueAt
        || (nextPriority === previousPriority && dueAt === previousDueAt)
        || (serviceCandidate.dueAt !== effectiveService.dueAt && dueAt <= serviceAt)) {
        throw new Error(`${serviceField} must increase priority or bring a future due time forward without changing owner.`)
      }
    } else if (serviceCandidate.kind === 'acknowledged') {
      if (acknowledged
        || firstResponseReady
        || serviceCandidate.owner !== effectiveService.owner
        || serviceCandidate.priority !== effectiveService.priority
        || serviceCandidate.dueAt !== effectiveService.dueAt) {
        throw new Error(`${serviceField} must acknowledge the current service state exactly once.`)
      }
      acknowledged = true
    } else {
      if (!acknowledged
        || firstResponseReady
        || serviceCandidate.owner !== effectiveService.owner
        || serviceCandidate.priority !== effectiveService.priority
        || serviceCandidate.dueAt !== effectiveService.dueAt) {
        throw new Error(`${serviceField} must record one first response after acknowledgement without changing service state.`)
      }
      firstResponseReady = true
    }
    effectiveService = {
      priority: serviceCandidate.priority as CommerceSupportPriority,
      owner: serviceCandidate.owner as string,
      dueAt: serviceCandidate.dueAt as string,
    }
    latestAt = serviceAt
    supportActionIds.push(serviceProof.actionId)
  }
  return { effectiveService, latestAt, acknowledged, firstResponseReady }
}

function validateSupportResolution(
  value: unknown,
  field: string,
  minimumAt: bigint,
  supportActionIds: string[],
): CommerceOrderSupportResolution {
  if (!isRecord(value)
    || !hasExactKeys(value, ['outcome', 'note', 'proof'])
    || !supportResolutionOutcomes.includes(value.outcome as CommerceSupportResolutionOutcome)
    || !isRecord(value.proof)
    || !hasExactKeys(value.proof, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
    || !validProof(value.proof as CommerceActionProof)) {
    throw new Error(`${field} is invalid.`)
  }
  canonicalText(value.note, `${field}.note`, 300)
  const resolution = value as CommerceOrderSupportResolution
  if ((timestampMicros(resolution.proof.capturedAt) as bigint) < minimumAt) {
    throw new Error(`${field} predates its latest service event.`)
  }
  supportActionIds.push(resolution.proof.actionId)
  return resolution
}

function sameTaxConfiguration(left: CommerceTaxConfiguration, right: CommerceTaxConfiguration) {
  return left.revision === right.revision
    && left.code === right.code
    && left.label === right.label
    && left.rateBasisPoints === right.rateBasisPoints
    && left.mode === right.mode
    && left.jurisdictionCode === right.jurisdictionCode
    && left.effectiveFrom === right.effectiveFrom
    && sameActionProof(left.proof, right.proof)
}

function sameAccountMappingConfiguration(left: CommerceAccountMappingConfiguration, right: CommerceAccountMappingConfiguration) {
  return left.revision === right.revision
    && left.mappings.length === right.mappings.length
    && left.mappings.every((mapping, index) => mapping.accountRole === right.mappings[index]?.accountRole
      && mapping.externalAccountCode === right.mappings[index]?.externalAccountCode)
    && sameActionProof(left.proof, right.proof)
}

function validWebsiteSource(source: CommerceWebsiteSource) {
  return websiteFingerprintPattern.test(source.fingerprint)
    && [source.approvalId, source.snapshotId, source.pageId, source.siteName, source.pagePath].every((value) => typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 160)
    && source.pagePath.startsWith('/')
}

export function commerceWebsiteIntakes(state: CommerceState) {
  return state.websiteIntakes ?? []
}

export function commerceCatalogBaselines(state: CommerceState) {
  return state.catalogBaselines ?? []
}

export function commerceCatalogChanges(state: CommerceState) {
  return state.catalogChanges ?? []
}

export function commerceTaxConfigurations(state: CommerceState) {
  return state.taxConfigurations ?? []
}

export function commerceCurrentTaxConfiguration(state: CommerceState) {
  return commerceTaxConfigurations(state)[0] ?? null
}

export function commerceEffectiveTaxConfiguration(state: CommerceState, atTime: string) {
  const atMicros = timestampMicros(atTime)
  if (atMicros === null) return null
  return commerceTaxConfigurations(state).find((configuration) => {
    const effectiveMicros = timestampMicros(configuration.effectiveFrom ?? configuration.proof.capturedAt)
    return effectiveMicros !== null && effectiveMicros <= atMicros
  }) ?? null
}

export function commerceAccountMappingConfigurations(state: CommerceState) {
  return state.accountMappingConfigurations ?? []
}

export function commerceCurrentAccountMappingConfiguration(state: CommerceState) {
  return commerceAccountMappingConfigurations(state)[0] ?? null
}

export function commerceCustomerCreditPolicies(state: CommerceState) {
  return state.customerCreditPolicies ?? []
}

export function commerceCurrentCustomerCreditPolicy(state: CommerceState, customer: string, atTime?: string) {
  const atMicros = atTime === undefined ? null : timestampMicros(atTime)
  if (atTime !== undefined && atMicros === null) return null
  return commerceCustomerCreditPolicies(state).find((policy) => (
    policy.customer === customer
    && (atMicros === null || (timestampMicros(policy.proof.capturedAt) as bigint) <= atMicros)
  )) ?? null
}

export function commercePromotionPolicies(state: CommerceState) {
  return state.promotionPolicies ?? []
}

export function commerceShippingPolicies(state: CommerceState) {
  return state.shippingPolicies ?? []
}

export function commercePaymentPolicies(state: CommerceState) {
  return state.paymentPolicies ?? []
}

export function commerceCurrentPaymentPolicy(state: CommerceState, adapter: CommercePaymentAdapter, atTime?: string) {
  const atMicros = atTime === undefined ? null : timestampMicros(atTime)
  if (!['pay_on_pickup', 'cash_on_delivery', 'kbzpay_manual'].includes(adapter) || (atTime !== undefined && atMicros === null)) return null
  return commercePaymentPolicies(state).find((policy) => policy.adapter === adapter
    && (atMicros === null || (timestampMicros(policy.proof.capturedAt) as bigint) <= atMicros)) ?? null
}

export function commercePaymentDecision(
  policies: readonly CommercePaymentPolicy[],
  adapter: CommercePaymentAdapter,
  fulfilment: 'pickup' | 'delivery',
  orderAmountMmk: number,
  reviewedAtValue: string,
): CommercePaymentDecision | null {
  if (!['pay_on_pickup', 'cash_on_delivery', 'kbzpay_manual'].includes(adapter)
    || !['pickup', 'delivery'].includes(fulfilment)
    || !Number.isSafeInteger(orderAmountMmk) || orderAmountMmk < 1
    || !validTimestamp(reviewedAtValue)) return null
  const reviewedAt = new Date(reviewedAtValue).toISOString()
  const reviewedMicros = timestampMicros(reviewedAt) as bigint
  const policy = policies.find((candidate) => candidate.adapter === adapter
    && (timestampMicros(candidate.proof.capturedAt) as bigint) <= reviewedMicros) ?? null
  const base = {
    schema: 'supermega.commerce.payment-decision.v1' as const,
    adapter,
    policyRevision: policy?.revision ?? null,
    policyActionId: policy?.proof.actionId ?? null,
    maximumOrderMmk: policy?.maximumOrderMmk ?? null,
    instructions: policy?.instructions ?? null,
    reviewedAt,
    authorized: false as const,
  }
  if (!policy) return { ...base, status: 'rejected', reason: 'not_found' }
  if (policy.status !== 'active') return { ...base, status: 'rejected', reason: 'inactive' }
  if ((timestampMicros(policy.effectiveFrom) as bigint) > reviewedMicros
    || policy.effectiveUntil !== null && reviewedMicros >= (timestampMicros(policy.effectiveUntil) as bigint)) return { ...base, status: 'rejected', reason: 'not_effective' }
  if (!policy.allowedFulfilments.includes(fulfilment)) return { ...base, status: 'rejected', reason: 'fulfilment_not_allowed' }
  if (policy.maximumOrderMmk !== null && orderAmountMmk > policy.maximumOrderMmk) return { ...base, status: 'rejected', reason: 'amount_exceeded' }
  return { ...base, status: 'approved', reason: 'approved' }
}

export function restoreBrowserLocalSamplePaymentPolicies(
  stateValue: CommerceState,
  decision: CommercePaymentDecision,
  fulfilment: 'pickup' | 'delivery',
  orderAmountMmk: number,
) {
  const state = validateCommerceState(stateValue)
  if (commercePaymentPolicies(state).length) return state
  const samplePolicies = createSeedCommerce().paymentPolicies ?? []
  const expected = commercePaymentDecision(
    samplePolicies,
    decision.adapter,
    fulfilment,
    orderAmountMmk,
    decision.reviewedAt,
  )
  if (!expected
    || expected.status !== 'approved'
    || JSON.stringify(expected) !== JSON.stringify(decision)) return null
  return validateCommerceState({ ...state, paymentPolicies: samplePolicies })
}

export function commercePaymentAdapterLabel(adapter: CommercePaymentAdapter) {
  if (adapter === 'cash_on_delivery') return 'Cash on delivery'
  if (adapter === 'kbzpay_manual') return 'KBZPay'
  return 'Cash'
}

export function commerceCurrentShippingPolicy(state: CommerceState, zoneValue: string, atTime?: string) {
  const zoneCode = zoneValue.trim().toUpperCase()
  const atMicros = atTime === undefined ? null : timestampMicros(atTime)
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(zoneCode) || (atTime !== undefined && atMicros === null)) return null
  return commerceShippingPolicies(state).find((policy) => policy.zoneCode === zoneCode
    && (atMicros === null || (timestampMicros(policy.proof.capturedAt) as bigint) <= atMicros)) ?? null
}

export function commerceShippingDecision(
  policies: readonly CommerceShippingPolicy[],
  fulfilment: 'pickup' | 'delivery',
  townshipValue: string | null,
  reviewedAtValue: string,
): CommerceShippingDecision | null {
  if (!validTimestamp(reviewedAtValue) || !['pickup', 'delivery'].includes(fulfilment)) return null
  const reviewedAt = new Date(reviewedAtValue).toISOString()
  if (fulfilment === 'pickup') return {
    schema: 'supermega.commerce.shipping-decision.v1', status: 'pickup', reason: 'pickup', township: null,
    zoneCode: null, policyRevision: null, policyActionId: null, feeMmk: 0, promiseMinutes: null, reviewedAt,
  }
  const township = townshipValue?.trim() ?? ''
  if (!township || township.length > 80) return null
  const reviewedMicros = timestampMicros(reviewedAt) as bigint
  const policy = policies.find((candidate) => candidate.townships.some((entry) => entry.localeCompare(township, 'en', { sensitivity: 'base' }) === 0)
    && (timestampMicros(candidate.proof.capturedAt) as bigint) <= reviewedMicros) ?? null
  const base = {
    schema: 'supermega.commerce.shipping-decision.v1' as const,
    township,
    zoneCode: policy?.zoneCode ?? null,
    policyRevision: policy?.revision ?? null,
    policyActionId: policy?.proof.actionId ?? null,
    reviewedAt,
  }
  if (!policy) return { ...base, status: 'rejected', reason: 'not_found', feeMmk: 0, promiseMinutes: null }
  if (policy.status !== 'active') return { ...base, status: 'rejected', reason: 'inactive', feeMmk: 0, promiseMinutes: null }
  const effective = (timestampMicros(policy.effectiveFrom) as bigint) <= reviewedMicros
    && (policy.effectiveUntil === null || reviewedMicros < (timestampMicros(policy.effectiveUntil) as bigint))
  if (!effective) return { ...base, status: 'rejected', reason: 'not_effective', feeMmk: 0, promiseMinutes: null }
  return { ...base, status: 'approved', reason: 'approved', feeMmk: policy.feeMmk, promiseMinutes: policy.promiseMinutes }
}

export function commerceCurrentPromotionPolicy(state: CommerceState, codeValue: string, atTime?: string) {
  const code = codeValue.trim().toUpperCase()
  const atMicros = atTime === undefined ? null : timestampMicros(atTime)
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(code) || (atTime !== undefined && atMicros === null)) return null
  return commercePromotionPolicies(state).find((policy) => (
    policy.code === code
    && (atMicros === null || (timestampMicros(policy.proof.capturedAt) as bigint) <= atMicros)
  )) ?? null
}

export function commercePromotionDecision(
  policies: readonly CommercePromotionPolicy[],
  codeValue: string | null,
  grossSubtotalMmk: number,
  reviewedAtValue: string,
): CommercePromotionDecision | null {
  if (!Number.isSafeInteger(grossSubtotalMmk) || grossSubtotalMmk < 1 || !validTimestamp(reviewedAtValue)) return null
  const reviewedAt = new Date(reviewedAtValue).toISOString()
  const code = codeValue === null ? null : codeValue.trim().toUpperCase()
  if (code === '') return null
  const base = {
    schema: 'supermega.commerce.promotion-decision.v1' as const,
    code,
    grossSubtotalMmk,
    reviewedAt,
  }
  if (code === null) return {
    ...base,
    status: 'not_requested',
    policyRevision: null,
    policyActionId: null,
    discountBasisPoints: 0,
    discountMmk: 0,
    netSubtotalMmk: grossSubtotalMmk,
    reason: 'not_requested',
  }
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(code)) return null
  const policy = policies.find((candidate) => candidate.code === code
    && (timestampMicros(candidate.proof.capturedAt) as bigint) <= (timestampMicros(reviewedAt) as bigint)) ?? null
  const rejected = (reason: Exclude<CommercePromotionDecisionReason, 'approved' | 'not_requested'>): CommercePromotionDecision => ({
    ...base,
    status: 'rejected',
    policyRevision: policy?.revision ?? null,
    policyActionId: policy?.proof.actionId ?? null,
    discountBasisPoints: policy?.discountBasisPoints ?? 0,
    discountMmk: 0,
    netSubtotalMmk: grossSubtotalMmk,
    reason,
  })
  if (!policy) return rejected('not_found')
  if (policy.status !== 'active') return rejected('inactive')
  const at = timestampMicros(reviewedAt) as bigint
  if ((timestampMicros(policy.effectiveFrom) as bigint) > at
    || policy.effectiveUntil && (timestampMicros(policy.effectiveUntil) as bigint) < at) return rejected('not_effective')
  if (grossSubtotalMmk < policy.minimumSubtotalMmk) return rejected('minimum_not_met')
  const rawDiscount = Number(BigInt(grossSubtotalMmk) * BigInt(policy.discountBasisPoints) / 10_000n)
  const discountMmk = Math.min(rawDiscount, policy.maximumDiscountMmk, grossSubtotalMmk - 1)
  if (!Number.isSafeInteger(discountMmk) || discountMmk < 1) return rejected('minimum_not_met')
  return {
    ...base,
    status: 'approved',
    policyRevision: policy.revision,
    policyActionId: policy.proof.actionId,
    discountBasisPoints: policy.discountBasisPoints,
    discountMmk,
    netSubtotalMmk: grossSubtotalMmk - discountMmk,
    reason: 'approved',
  }
}

export function commerceCustomerCreditExposure(state: CommerceState, customer: string) {
  let exposure = 0
  for (const order of state.orders) {
    if (order.customer !== customer || order.status === 'cancelled' || order.paymentStatus !== 'pending') continue
    const next = exposure + order.total
    if (!Number.isSafeInteger(next)) throw new Error('Customer credit exposure exceeds the supported MMK range.')
    exposure = next
  }
  return exposure
}

export function commerceOrderPaymentTermsDays(order: Pick<CommerceOrder, 'createdAt' | 'paymentDueAt'>): 0 | 7 | 30 | null {
  if (order.paymentDueAt === undefined) return 0
  const createdAt = timestampMicros(order.createdAt)
  const paymentDueAt = timestampMicros(order.paymentDueAt)
  if (createdAt === null || paymentDueAt === null || paymentDueAt < createdAt) return null
  const delta = paymentDueAt - createdAt
  const dayMicros = 86_400_000_000n
  return ([0, 7, 30] as const).find((days) => delta === BigInt(days) * dayMicros) ?? null
}

export function commerceCustomerCreditReview(
  state: CommerceState,
  customer: string,
  orderAmountMmk: number,
  paymentTermsDays: 0 | 7 | 30,
  atTime?: string,
): CommerceCustomerCreditReview {
  const exposureBeforeMmk = commerceCustomerCreditExposure(state, customer)
  const exposureAfterMmk = exposureBeforeMmk + orderAmountMmk
  const policy = commerceCurrentCustomerCreditPolicy(state, customer, atTime)
  const reason = paymentTermsDays === 0
    ? 'cash_terms'
    : !policy
      ? 'policy_missing'
      : policy.status === 'hold'
        ? 'customer_hold'
        : paymentTermsDays > policy.maxPaymentTermsDays
          ? 'terms_exceeded'
          : !Number.isSafeInteger(exposureAfterMmk) || exposureAfterMmk > policy.creditLimitMmk
            ? 'limit_exceeded'
            : 'approved'
  return {
    customer,
    policy,
    paymentTermsDays,
    exposureBeforeMmk,
    orderAmountMmk,
    exposureAfterMmk,
    allowed: reason === 'cash_terms' || reason === 'approved',
    reason,
  }
}

function roundedTax(numerator: bigint, denominator: bigint) {
  return (numerator * 2n + denominator) / (denominator * 2n)
}

function configuredOrderCalculation(
  configuration: CommerceTaxConfiguration,
  listedSubtotalMmk: number,
  catalogRevision: number,
): CommerceOrderCalculationV2 | null {
  if (!Number.isSafeInteger(listedSubtotalMmk) || listedSubtotalMmk < 1) return null
  const listed = BigInt(listedSubtotalMmk)
  const rate = BigInt(configuration.rateBasisPoints)
  const tax = configuration.mode === 'exclusive'
    ? roundedTax(listed * rate, 10_000n)
    : roundedTax(listed * rate, 10_000n + rate)
  const subtotal = configuration.mode === 'exclusive' ? listed : listed - tax
  const total = configuration.mode === 'exclusive' ? listed + tax : listed
  if (subtotal < 0n || tax < 0n || total < 1n || total > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return {
    schema: COMMERCE_ORDER_CALCULATION_V2_SCHEMA,
    currency: 'MMK',
    catalogRevision,
    taxConfigurationRevision: configuration.revision,
    taxCode: configuration.code,
    ...(configuration.jurisdictionCode && configuration.effectiveFrom ? {
      taxJurisdictionCode: configuration.jurisdictionCode,
      taxEffectiveFrom: configuration.effectiveFrom,
    } : {}),
    taxRateBasisPoints: configuration.rateBasisPoints,
    taxMode: configuration.mode,
    listedSubtotalMmk,
    subtotalMmk: Number(subtotal),
    taxMmk: Number(tax),
    totalMmk: Number(total),
  }
}

export function commerceOrderCalculation(
  state: CommerceState,
  listedSubtotalMmk: number,
  atTime?: string,
): CommerceOrderCalculation | null {
  if (!Number.isSafeInteger(listedSubtotalMmk) || listedSubtotalMmk < 1) return null
  const configuration = atTime
    ? commerceEffectiveTaxConfiguration(state, atTime)
    : commerceCurrentTaxConfiguration(state)
  if (configuration) return configuredOrderCalculation(configuration, listedSubtotalMmk, commerceCatalogChanges(state).length)
  return {
    schema: COMMERCE_ORDER_CALCULATION_SCHEMA,
    currency: 'MMK',
    catalogRevision: commerceCatalogChanges(state).length,
    subtotalMmk: listedSubtotalMmk,
    taxMode: 'not_configured',
    taxMmk: 0,
    totalMmk: listedSubtotalMmk,
  }
}

export function commerceTaxDecision(
  state: CommerceState,
  listedSubtotalMmk: number,
  reviewedAtValue: string,
): CommerceTaxDecision | null {
  if (!validTimestamp(reviewedAtValue)) return null
  const reviewedAt = new Date(reviewedAtValue).toISOString()
  const calculation = commerceOrderCalculation(state, listedSubtotalMmk, reviewedAt)
  if (!calculation) return null
  if (calculation.schema === COMMERCE_ORDER_CALCULATION_SCHEMA) return {
    schema: 'supermega.ecommerce.tax-decision.v1',
    status: 'not_configured',
    catalogRevision: calculation.catalogRevision,
    taxConfigurationRevision: null,
    taxCode: null,
    taxJurisdictionCode: null,
    taxEffectiveFrom: null,
    taxRateBasisPoints: 0,
    taxMode: 'not_configured',
    listedSubtotalMmk,
    subtotalMmk: calculation.subtotalMmk,
    taxMmk: 0,
    totalMmk: calculation.totalMmk,
    policyActionId: null,
    reviewedAt,
  }
  const configuration = commerceTaxConfigurations(state).find((candidate) => candidate.revision === calculation.taxConfigurationRevision)
  if (!configuration) return null
  return {
    schema: 'supermega.ecommerce.tax-decision.v1',
    status: 'configured',
    catalogRevision: calculation.catalogRevision,
    taxConfigurationRevision: calculation.taxConfigurationRevision,
    taxCode: calculation.taxCode,
    taxJurisdictionCode: calculation.taxJurisdictionCode ?? null,
    taxEffectiveFrom: calculation.taxEffectiveFrom ?? null,
    taxRateBasisPoints: calculation.taxRateBasisPoints,
    taxMode: calculation.taxMode,
    listedSubtotalMmk: calculation.listedSubtotalMmk,
    subtotalMmk: calculation.subtotalMmk,
    taxMmk: calculation.taxMmk,
    totalMmk: calculation.totalMmk,
    policyActionId: configuration.proof.actionId,
    reviewedAt,
  }
}

export function commerceOrderCalculationDigest(order: CommerceOrder) {
  if (!order.calculation) return null
  return `sha256:${sha256Hex(JSON.stringify([
    'supermega.commerce.order-calculation.snapshot.v1',
    order.id,
    order.calculation,
  ]))}`
}

function commerceOrderAcknowledgementProjection(
  artifact: Omit<CommerceOrderAcknowledgement, 'digest'>,
) {
  return [
    artifact.schema,
    artifact.documentType,
    artifact.notice,
    artifact.orderId,
    artifact.createdAt,
    artifact.customer,
    artifact.channel,
    artifact.status,
    artifact.currency,
    artifact.lines.map((line) => [
      line.sku,
      line.name,
      line.variant ?? null,
      line.quantity,
      line.unitPriceMmk,
      line.lineTotalMmk,
    ]),
    artifact.grossSubtotalMmk,
    [
      artifact.promotion.status,
      artifact.promotion.code,
      artifact.promotion.reason,
      artifact.promotion.discountMmk,
      artifact.promotion.netSubtotalMmk,
    ],
    [
      artifact.delivery.fulfilment,
      artifact.delivery.reference,
      artifact.delivery.township,
      artifact.delivery.status,
      artifact.delivery.feeMmk,
      artifact.delivery.promisedAt,
    ],
    [
      artifact.tax.status,
      artifact.tax.code,
      artifact.tax.jurisdictionCode,
      artifact.tax.rateBasisPoints,
      artifact.tax.mode,
      artifact.tax.subtotalMmk,
      artifact.tax.taxMmk,
    ],
    artifact.totalMmk,
    [
      artifact.payment.method,
      artifact.payment.status,
      artifact.payment.dueAt,
      artifact.payment.reconciledAt,
      artifact.payment.refundStatus,
    ],
    [
      artifact.cancellation.state,
      artifact.cancellation.cancelledAt,
      artifact.cancellation.actionId,
      artifact.cancellation.evidenceReference,
    ],
    [
      artifact.evidence.confirmationActionId,
      artifact.evidence.confirmationCapturedAt,
      artifact.evidence.confirmationEvidenceReference,
      artifact.evidence.sourceRecordId,
      artifact.evidence.sourceEvidenceReference,
      artifact.evidence.calculationDigest,
    ],
    [
      artifact.controls.customerMessageSent,
      artifact.controls.taxInvoiceIssued,
      artifact.controls.paymentProviderCalled,
      artifact.controls.externalWritePerformed,
    ],
  ]
}

// Split out on the same terms as commerceDailyCloseExportFrom further down, and for a worse
// case. The Shop screen holds one acknowledgement per order and rebuilds them from a state that
// is a NEW OBJECT after every sale, so validateCommerceState ran once per order all day.
// Measured 2026-08-21 on a Shop driven to its enforced 2 MiB ceiling through the real
// transitions (1,262 orders, 1,081 completed, 2,097,406 bytes): one validation is 31-36 ms and
// is 97.1% of what one acknowledgement costs, so the map cost about 50 SECONDS after every
// sale (three runs, medians 47.6 s, 50.6 s, 54.5 s).
//
// Hoisting the validation is sound rather than a shortcut, because validateCommerceState is a
// PREDICATE and not a normaliser: it returns its argument by reference and leaves it byte for
// byte as it found it. One validation of a state object therefore says exactly what a thousand
// say about that same object. What changes here is how many times one state is checked, never
// whether it is -- this function is module-private and every way in validates first.
function commerceOrderAcknowledgementFrom(
  current: CommerceState,
  orderId: string,
): CommerceOrderAcknowledgement | null {
  const order = current.orders.find((candidate) => candidate.id === orderId)
  if (!order?.calculation || !order.fulfilment || !order.fulfilmentReference || !order.promisedAt) return null
  const lineSnapshots = validatedOrderLineSnapshots(order)
  const calculationDigest = commerceOrderCalculationDigest(order)
  if (!lineSnapshots || !calculationDigest) return null
  const reserves = current.movements.filter((movement) => movement.kind === 'reserve' && movement.orderId === order.id)
  if (reserves.length !== lineSnapshots.length) return null
  const confirmation = reserves[0]
  if (!confirmation || reserves.some((movement) => movement.actionId !== confirmation.actionId
    || movement.createdAt !== confirmation.createdAt
    || movement.evidenceReference !== confirmation.evidenceReference)) return null
  const releases = current.movements.filter((movement) => movement.kind === 'release' && movement.orderId === order.id)
  const cancelled = order.status === 'cancelled'
  if ((cancelled && releases.length !== lineSnapshots.length) || (!cancelled && releases.length !== 0)) return null
  const cancellation = cancelled ? releases[0] : undefined
  if (cancelled && (!cancellation || releases.some((movement) => movement.actionId !== cancellation.actionId
    || movement.createdAt !== cancellation.createdAt
    || movement.evidenceReference !== cancellation.evidenceReference))) return null

  const lines = lineSnapshots.map((line) => ({
    ...line,
    lineTotalMmk: line.quantity * line.unitPriceMmk,
  }))
  const grossSubtotalMmk = lines.reduce((sum, line) => sum + line.lineTotalMmk, 0)
  const promotion = order.promotionDecision
  const calculation = order.calculation
  const configuredTax = calculation.schema === COMMERCE_ORDER_CALCULATION_V2_SCHEMA ? calculation : null
  const artifact: Omit<CommerceOrderAcknowledgement, 'digest'> = {
    schema: COMMERCE_ORDER_ACKNOWLEDGEMENT_SCHEMA,
    documentType: 'order_acknowledgement',
    notice: 'Not a tax invoice, receipt, or payment confirmation.',
    orderId: order.id,
    createdAt: order.createdAt,
    customer: order.customer,
    channel: order.channel,
    status: order.status,
    currency: 'MMK',
    lines,
    grossSubtotalMmk,
    promotion: {
      status: promotion?.status === 'approved' ? 'applied' : promotion ? 'not_applied' : 'not_recorded',
      code: promotion?.code ?? null,
      reason: promotion?.reason ?? null,
      discountMmk: promotion?.discountMmk ?? 0,
      netSubtotalMmk: promotion?.netSubtotalMmk ?? grossSubtotalMmk,
    },
    delivery: {
      fulfilment: order.fulfilment,
      reference: order.fulfilmentReference,
      township: order.shippingDecision?.township ?? null,
      status: order.shippingDecision?.status ?? 'not_recorded',
      feeMmk: order.shippingDecision?.feeMmk ?? 0,
      promisedAt: order.promisedAt,
    },
    tax: {
      status: configuredTax ? 'configured' : 'not_configured',
      code: configuredTax?.taxCode ?? null,
      jurisdictionCode: configuredTax?.taxJurisdictionCode ?? null,
      rateBasisPoints: configuredTax?.taxRateBasisPoints ?? 0,
      mode: configuredTax?.taxMode ?? 'not_configured',
      subtotalMmk: calculation.subtotalMmk,
      taxMmk: calculation.taxMmk,
    },
    totalMmk: calculation.totalMmk,
    payment: {
      method: order.payment,
      status: order.paymentStatus,
      dueAt: order.paymentDueAt ?? null,
      reconciledAt: order.paymentReconciledAt ?? null,
      refundStatus: order.refundStatus,
    },
    cancellation: {
      state: cancelled ? 'cancelled' : 'not_cancelled',
      cancelledAt: cancellation?.createdAt ?? null,
      actionId: cancellation?.actionId ?? null,
      evidenceReference: cancellation?.evidenceReference ?? null,
    },
    evidence: {
      confirmationActionId: confirmation.actionId,
      confirmationCapturedAt: confirmation.createdAt,
      confirmationEvidenceReference: confirmation.evidenceReference,
      sourceRecordId: order.sourceRecordId ?? null,
      sourceEvidenceReference: order.evidenceReference ?? null,
      calculationDigest,
    },
    controls: {
      customerMessageSent: false,
      taxInvoiceIssued: false,
      paymentProviderCalled: false,
      externalWritePerformed: false,
    },
  }
  return {
    ...artifact,
    digest: `sha256:${sha256Hex(JSON.stringify(commerceOrderAcknowledgementProjection(artifact)))}`,
  }
}

export function commerceOrderAcknowledgement(
  state: CommerceState,
  orderId: string,
): CommerceOrderAcknowledgement | null {
  return commerceOrderAcknowledgementFrom(validateCommerceState(state), orderId)
}

// One validated state, and a way to ask it for acknowledgements one at a time.
//
// A screen listing orders needs two things the single-order entry point cannot give it at any
// sane price: many acknowledgements from ONE state, and only the ones it actually shows. This
// returns a reader bound to a state that has been validated exactly once, so a caller can ask
// for whichever orders it renders and pay for nothing else. Asking twice for the same order
// returns the same artifact -- built once, then remembered for the life of the reader, which
// lives exactly as long as the state it validated.
//
// The reader is the ONLY way out of this module to the unvalidated builder, and it cannot be
// constructed without validating: an invalid state throws here, at construction, rather than
// once per order at the call sites.
export function commerceOrderAcknowledgementReader(state: CommerceState) {
  const current = validateCommerceState(state)
  const built = new Map<string, CommerceOrderAcknowledgement | null>()
  return (orderId: string): CommerceOrderAcknowledgement | null => {
    if (built.has(orderId)) return built.get(orderId) ?? null
    const artifact = commerceOrderAcknowledgementFrom(current, orderId)
    built.set(orderId, artifact)
    return artifact
  }
}

function acknowledgementTextValue(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export function commerceOrderAcknowledgementText(artifact: CommerceOrderAcknowledgement) {
  const promotion = artifact.promotion.status === 'applied'
    ? `${artifact.promotion.code ?? 'Promotion'} - ${artifact.promotion.discountMmk} MMK discount`
    : artifact.promotion.status === 'not_applied'
      ? `${artifact.promotion.code ?? 'Promotion'} - not applied (${artifact.promotion.reason ?? 'not approved'})`
      : 'No promotion recorded'
  const cancellation = artifact.cancellation.state === 'cancelled'
    ? `Cancelled at ${artifact.cancellation.cancelledAt} - evidence ${artifact.cancellation.evidenceReference}`
    : 'Not cancelled'
  return [
    'SUPERMEGA ORDER ACKNOWLEDGEMENT',
    artifact.notice,
    '',
    `Order: ${acknowledgementTextValue(artifact.orderId)}`,
    `Created: ${artifact.createdAt}`,
    `Customer: ${acknowledgementTextValue(artifact.customer)}`,
    `Channel: ${acknowledgementTextValue(artifact.channel)}`,
    `Status: ${artifact.status}`,
    '',
    'ITEMS',
    ...artifact.lines.map((line) => `- ${line.quantity} x ${acknowledgementTextValue(line.name)}${line.variant ? ` (${acknowledgementTextValue(line.variant)})` : ''} [${acknowledgementTextValue(line.sku)}] @ ${line.unitPriceMmk} MMK = ${line.lineTotalMmk} MMK`),
    '',
    `Gross subtotal: ${artifact.grossSubtotalMmk} MMK`,
    `Promotion: ${promotion}`,
    `Delivery: ${acknowledgementTextValue(artifact.delivery.fulfilment)} - ${acknowledgementTextValue(artifact.delivery.reference)} - fee ${artifact.delivery.feeMmk} MMK`,
    `Promise: ${artifact.delivery.promisedAt}`,
    `Tax: ${artifact.tax.status}${artifact.tax.code ? ` - ${acknowledgementTextValue(artifact.tax.code)}` : ''} - ${artifact.tax.taxMmk} MMK`,
    `Total: ${artifact.totalMmk} MMK`,
    `Payment: ${acknowledgementTextValue(artifact.payment.method)} - ${artifact.payment.status} - refund ${artifact.payment.refundStatus}`,
    `Cancellation: ${cancellation}`,
    '',
    `Confirmation evidence: ${acknowledgementTextValue(artifact.evidence.confirmationActionId)} - ${acknowledgementTextValue(artifact.evidence.confirmationEvidenceReference)}`,
    `Calculation evidence: ${artifact.evidence.calculationDigest}`,
    `Document digest: ${artifact.digest}`,
    '',
    'No customer message was sent. No tax invoice was issued. No payment provider or external system was called.',
  ].join('\r\n')
}

export function commerceCorrectionCalculation(
  order: CommerceOrder,
  listedAmountMmk: number,
): CommerceCorrectionCalculation | null {
  if (!order.calculation || !Number.isSafeInteger(listedAmountMmk) || listedAmountMmk < 1) return null
  if (order.calculation.schema === COMMERCE_ORDER_CALCULATION_SCHEMA) {
    return {
      currency: 'MMK',
      taxConfigurationRevision: null,
      taxCode: null,
      taxRateBasisPoints: null,
      taxMode: 'not_configured',
      listedAmountMmk,
      subtotalMmk: listedAmountMmk,
      taxMmk: 0,
      totalMmk: listedAmountMmk,
    }
  }
  const configured = configuredOrderCalculation({
    revision: order.calculation.taxConfigurationRevision,
    code: order.calculation.taxCode,
    label: order.calculation.taxCode,
    rateBasisPoints: order.calculation.taxRateBasisPoints,
    mode: order.calculation.taxMode,
    ...(order.calculation.taxJurisdictionCode && order.calculation.taxEffectiveFrom ? {
      jurisdictionCode: order.calculation.taxJurisdictionCode,
      effectiveFrom: order.calculation.taxEffectiveFrom,
    } : {}),
    proof: order.completion ?? {
      actionId: 'calculation-only',
      capturedAt: order.createdAt,
      actor: 'calculation-only',
      reason: 'calculation-only',
      evidenceReference: 'calculation-only',
    },
  }, listedAmountMmk, order.calculation.catalogRevision)
  return configured ? {
    currency: configured.currency,
    taxConfigurationRevision: configured.taxConfigurationRevision,
    taxCode: configured.taxCode,
    ...(configured.taxJurisdictionCode && configured.taxEffectiveFrom ? {
      taxJurisdictionCode: configured.taxJurisdictionCode,
      taxEffectiveFrom: configured.taxEffectiveFrom,
    } : {}),
    taxRateBasisPoints: configured.taxRateBasisPoints,
    taxMode: configured.taxMode,
    listedAmountMmk: configured.listedSubtotalMmk,
    subtotalMmk: configured.subtotalMmk,
    taxMmk: configured.taxMmk,
    totalMmk: configured.totalMmk,
  } : null
}

export function commerceOrderAdjustedTotal(order: CommerceOrder) {
  let total = order.total
  for (const correction of order.corrections ?? []) {
    total += correction.kind === 'debit' ? correction.calculation.totalMmk : -correction.calculation.totalMmk
    if (!Number.isSafeInteger(total) || total < 0) return null
  }
  return total
}

export function commerceStorefrontRequests(state: CommerceState) {
  return state.storefrontRequests ?? []
}

// Read on every workspace change -- which is once per sale -- so this validates the state it
// was handed rather than a deep copy of it. The copy that used to open this function bought
// nothing: validateCommerceState is a PREDICATE and not a normaliser, returning its argument
// by reference and leaving it byte for byte as it found it (pinned in
// test_commerce_state_validator.mjs), so there was never a mutation here for a caller to be
// defended against. Nor was the copy what kept callers unaliased -- every order and request
// this function hands back is cloned individually on its way out, below.
//
// Measured 2026-08-24 on a Shop driven to its enforced 2 MiB ceiling through the real
// transitions (2,229 orders, 2,090,587 bytes) with the buying contract's own ceiling of 100
// storefront requests: the copy was 11 ms of the 129 ms this call costs. Pinned by count
// rather than by clock in test_ecommerce_order_coexistence.mjs (5d).
export function commerceStorefrontOrderTimeline(
  state: CommerceState,
  requests: CommerceStorefrontRequest[] = commerceStorefrontRequests(state),
): CommerceStorefrontOrderTimelineEntry[] {
  const current = validateCommerceState(state)
  const seenIds = new Set<string>()
  for (const request of requests) {
    if (seenIds.has(request.id)) throw new Error(`Duplicate Ecommerce request ${request.id} cannot be projected.`)
    seenIds.add(request.id)
  }
  const validatedRequests = commerceStorefrontRequests(validateCommerceState({
    ...current,
    storefrontRequests: structuredClone(requests),
  }))
  return validatedRequests.map((request): CommerceStorefrontOrderTimelineEntry => {
    const matchingOrders = current.orders.filter((order) => order.sourceRecordId === request.id)
    if (matchingOrders.length > 1) throw new Error(`Ecommerce request ${request.id} has multiple Shop orders.`)
    const order = matchingOrders[0] ? structuredClone(matchingOrders[0]) : null
    const nextAction: CommerceStorefrontOrderNextAction = !order
      ? 'review_in_shop'
      : order.refundStatus === 'due'
        ? 'settle_refund'
        : order.status === 'confirmed'
          ? 'start_preparing'
          : order.status === 'preparing'
            ? 'mark_ready'
            : order.status === 'ready' && order.paymentStatus !== 'reconciled'
              ? 'confirm_payment'
              : order.status === 'ready'
                ? 'complete_fulfilment'
                : 'none'
    return {
      request: structuredClone(request),
      order,
      stage: order?.status ?? 'waiting_shop_review',
      paymentStatus: order?.paymentStatus ?? 'not_authorized',
      refundStatus: order?.refundStatus ?? 'none',
      returnedQuantity: order?.returns?.reduce((total, record) => total + record.quantity, 0) ?? 0,
      nextAction,
    }
  }).sort((left, right) => Date.parse(right.request.createdAt) - Date.parse(left.request.createdAt))
}

export function commerceStorefrontConfiguration(state: CommerceState) {
  return state.storefrontConfiguration ?? null
}

export function commercePurchaseOrders(state: CommerceState) {
  return state.purchaseOrders ?? []
}

export function commerceSupplierReturnClaims(purchaseOrder: CommercePurchaseOrder) {
  return purchaseOrder.supplierReturns ?? []
}

export function commerceSupplierReturnClaimStatus(claim: CommerceSupplierReturnClaim): CommerceSupplierReturnClaimStatus {
  const creditedMmk = claim.creditNotes.reduce((total, credit) => total + credit.amountMmk, 0)
  return creditedMmk === 0 ? 'awaiting_credit' : creditedMmk === claim.claimAmountMmk ? 'credited' : 'partially_credited'
}

export function commerceSupplierReturnClaimBalance(claim: CommerceSupplierReturnClaim) {
  return claim.claimAmountMmk - claim.creditNotes.reduce((total, credit) => total + credit.amountMmk, 0)
}

export function commercePurchaseRequisitions(state: CommerceState) {
  return state.purchaseRequisitions ?? []
}

export function commercePurchaseBudgetEnvelopes(state: CommerceState) {
  return state.purchaseBudgetEnvelopes ?? []
}

export function commerceSupplierSourcingDecisions(state: CommerceState) {
  return state.supplierSourcingDecisions ?? []
}

export function commerceSupplierSourcingSelectedQuote(decision: CommerceSupplierSourcingDecision) {
  return decision.quotes.find((quote) => quote.quoteReference === decision.selectedQuoteReference) ?? null
}

export function commercePurchaseBudgetCommitment(state: CommerceState, envelope: CommercePurchaseBudgetEnvelope) {
  const linkedOrders = new Map(commercePurchaseOrders(state).flatMap((order) => order.requisitionId ? [[order.requisitionId, order] as const] : []))
  let committedMmk = 0
  let openRequisitions = 0
  let activePurchaseOrders = 0
  for (const requisition of commercePurchaseRequisitions(state)) {
    if (requisition.budgetEnvelopeId !== envelope.id) continue
    const purchaseOrder = linkedOrders.get(requisition.id)
    if (purchaseOrder?.cancellation) continue
    committedMmk += requisition.totalMmk
    if (!Number.isSafeInteger(committedMmk)) throw new Error('Purchase budget commitment exceeds the safe integer range.')
    if (purchaseOrder) activePurchaseOrders += 1
    else openRequisitions += 1
  }
  return {
    committedMmk,
    availableMmk: envelope.ceilingMmk - committedMmk,
    utilizationBasisPoints: Number(BigInt(committedMmk) * 10_000n / BigInt(envelope.ceilingMmk)),
    openRequisitions,
    activePurchaseOrders,
  }
}

export function commercePurchaseOrderProgress(state: CommerceState, purchaseOrder: CommercePurchaseOrder): CommercePurchaseOrderProgress {
  const receipts = state.movements.filter((movement) => movement.kind === 'receipt' && movement.purchaseOrderId === purchaseOrder.id)
  const received = receipts.reduce((total, movement) => total + movement.quantityDelta, 0)
  const rejected = receipts.reduce((total, movement) => total + (movement.rejectedQuantity ?? 0), 0)
  const delivered = received + rejected
  const remaining = purchaseOrder.quantityOrdered - delivered
  return {
    received,
    rejected,
    delivered,
    remaining,
    status: purchaseOrder.cancellation
      ? 'cancelled'
      : remaining === 0
        ? rejected > 0 ? 'received_with_discrepancy' : 'received'
        : delivered > 0
          ? 'partially_received'
          : 'open',
  }
}

export function commercePurchaseOrderArrivalUrgency(
  purchaseOrder: CommercePurchaseOrder,
  progress: CommercePurchaseOrderProgress,
  now: number,
): CommercePurchaseOrderArrivalUrgency {
  if (progress.status === 'received' || progress.status === 'received_with_discrepancy' || progress.status === 'cancelled') return 'closed'
  const expectedAt = purchaseOrder.expectedAt ? Date.parse(purchaseOrder.expectedAt) : Number.NaN
  if (!Number.isFinite(expectedAt) || !Number.isFinite(now)) return 'unrecorded'
  if (expectedAt <= now) return 'late'
  return expectedAt - now <= 24 * 60 * 60 * 1000 ? 'due_soon' : 'scheduled'
}

export function commerceSupplierInvoiceMatch(state: CommerceState, purchaseOrder: CommercePurchaseOrder): CommerceSupplierInvoiceMatch {
  const invoice = purchaseOrder.supplierInvoice
  if (!invoice || purchaseOrder.unitCostMmk === undefined) throw new Error('Supplier invoice matching requires retained PO commercial terms and an invoice.')
  const progress = commercePurchaseOrderProgress(state, purchaseOrder)
  const orderedTotalMmk = purchaseOrder.quantityOrdered * purchaseOrder.unitCostMmk
  if (!Number.isSafeInteger(orderedTotalMmk)) throw new Error('Purchase order total exceeds the supported safe integer range.')
  const supplierClaimMmk = commerceSupplierReturnClaims(purchaseOrder).reduce((total, claim) => total + claim.claimAmountMmk, 0)
  const supplierCreditMmk = commerceSupplierReturnClaims(purchaseOrder).reduce((total, claim) => total
    + claim.creditNotes.reduce((claimTotal, credit) => claimTotal + credit.amountMmk, 0), 0)
  const expectedSupplierReturnMmk = progress.rejected * purchaseOrder.unitCostMmk
  const supplierReturnBalanceMmk = expectedSupplierReturnMmk - supplierCreditMmk
  const netInvoiceTotalMmk = invoice.totalMmk - supplierCreditMmk
  const acceptedTotalMmk = progress.received * purchaseOrder.unitCostMmk
  if (![supplierClaimMmk, supplierCreditMmk, expectedSupplierReturnMmk, supplierReturnBalanceMmk, netInvoiceTotalMmk, acceptedTotalMmk].every(Number.isSafeInteger)) {
    throw new Error('Supplier invoice and return totals exceed the supported safe integer range.')
  }
  const status: CommerceSupplierInvoiceMatchStatus = progress.delivered < invoice.quantityInvoiced
    ? 'awaiting_receipt'
    : progress.rejected > 0 && (supplierClaimMmk !== expectedSupplierReturnMmk || supplierReturnBalanceMmk > 0)
      ? 'supplier_credit_pending'
    : invoice.quantityInvoiced !== purchaseOrder.quantityOrdered
      ? 'quantity_variance'
    : invoice.unitCostMmk !== purchaseOrder.unitCostMmk
      || netInvoiceTotalMmk !== acceptedTotalMmk
        ? 'price_variance'
        : 'matched'
  return {
    status,
    orderedQuantity: purchaseOrder.quantityOrdered,
    acceptedQuantity: progress.received,
    rejectedQuantity: progress.rejected,
    invoicedQuantity: invoice.quantityInvoiced,
    orderedUnitCostMmk: purchaseOrder.unitCostMmk,
    invoicedUnitCostMmk: invoice.unitCostMmk,
    orderedTotalMmk,
    invoicedTotalMmk: invoice.totalMmk,
    supplierClaimMmk,
    supplierCreditMmk,
    supplierReturnBalanceMmk,
    netInvoiceTotalMmk,
    acceptedTotalMmk,
    payableReady: status === 'matched' && Boolean(invoice.payableReview),
  }
}

export function commerceSupplierPerformance(state: CommerceState, now: number): CommerceSupplierPerformance[] {
  const current = validateCommerceState(state)
  const groups = new Map<string, CommerceSupplierPerformance>()
  const addSafeUnits = (currentTotal: number, increment: number) => {
    const nextTotal = currentTotal + increment
    if (!Number.isSafeInteger(nextTotal)) throw new Error('Supplier performance totals exceed the supported safe integer range.')
    return nextTotal
  }
  for (const purchaseOrder of commercePurchaseOrders(current)) {
    const progress = commercePurchaseOrderProgress(current, purchaseOrder)
    const active = progress.status === 'open' || progress.status === 'partially_received'
    const receipts = current.movements.filter((movement) => (
      movement.kind === 'receipt' && movement.purchaseOrderId === purchaseOrder.id
    ))
    const completedAt = receipts.reduce<bigint | null>((latest, receipt) => {
      const capturedAt = timestampMicros(receipt.createdAt) as bigint
      return latest === null || capturedAt > latest ? capturedAt : latest
    }, null)
    const promisedAt = purchaseOrder.expectedAt ? timestampMicros(purchaseOrder.expectedAt) : null
    const deliveryMeasured = (progress.status === 'received' || progress.status === 'received_with_discrepancy') && completedAt !== null && promisedAt !== null
    const onTime = (progress.status === 'received' || progress.status === 'received_with_discrepancy')
      && completedAt !== null
      && promisedAt !== null
      && completedAt <= promisedAt
    const lateDelivery = deliveryMeasured && !onTime
    const lateOpen = active && commercePurchaseOrderArrivalUrgency(purchaseOrder, progress, now) === 'late'
    const existing = groups.get(purchaseOrder.supplier) ?? {
      supplier: purchaseOrder.supplier,
      totalOrders: 0,
      activeOrders: 0,
      orderedUnits: 0,
      receivedUnits: 0,
      rejectedUnits: 0,
      openUnits: 0,
      lateOpenOrders: 0,
      completedDeliveries: 0,
      onTimeDeliveries: 0,
      lateDeliveries: 0,
      receiptRateBasisPoints: 0,
      defectRateBasisPoints: 0,
      onTimeRateBasisPoints: null,
      status: 'collecting' as CommerceSupplierPerformanceStatus,
    }
    existing.totalOrders += 1
    existing.activeOrders += active ? 1 : 0
    existing.orderedUnits = addSafeUnits(existing.orderedUnits, purchaseOrder.quantityOrdered)
    existing.receivedUnits = addSafeUnits(existing.receivedUnits, progress.received)
    existing.rejectedUnits = addSafeUnits(existing.rejectedUnits, progress.rejected)
    existing.openUnits = addSafeUnits(existing.openUnits, active ? progress.remaining : 0)
    existing.lateOpenOrders += lateOpen ? 1 : 0
    existing.completedDeliveries += deliveryMeasured ? 1 : 0
    existing.onTimeDeliveries += onTime ? 1 : 0
    existing.lateDeliveries += lateDelivery ? 1 : 0
    groups.set(purchaseOrder.supplier, existing)
  }
  const scored = [...groups.values()].map<CommerceSupplierPerformance>((supplier) => ({
    ...supplier,
    receiptRateBasisPoints: supplier.orderedUnits
      ? Math.round((supplier.receivedUnits / supplier.orderedUnits) * 10_000)
      : 0,
    defectRateBasisPoints: supplier.orderedUnits
      ? Math.round((supplier.rejectedUnits / supplier.orderedUnits) * 10_000)
      : 0,
    onTimeRateBasisPoints: supplier.completedDeliveries
      ? Math.round((supplier.onTimeDeliveries / supplier.completedDeliveries) * 10_000)
      : null,
    status: supplier.rejectedUnits || supplier.lateOpenOrders || supplier.lateDeliveries
      ? 'attention'
      : supplier.completedDeliveries
        ? 'on_track'
        : 'collecting',
  }))
  return scored.sort((left, right) => {
    const statusRank: Record<CommerceSupplierPerformanceStatus, number> = { attention: 0, collecting: 1, on_track: 2 }
    if (statusRank[left.status] !== statusRank[right.status]) return statusRank[left.status] - statusRank[right.status]
    if (left.openUnits !== right.openUnits) return right.openUnits - left.openUnits
    return compareCanonicalText(left.supplier, right.supplier)
  })
}

export function compareCommercePurchaseOrderAttention(
  left: { purchaseOrder: CommercePurchaseOrder; progress: CommercePurchaseOrderProgress },
  right: { purchaseOrder: CommercePurchaseOrder; progress: CommercePurchaseOrderProgress },
) {
  const leftActive = left.progress.status === 'open' || left.progress.status === 'partially_received'
  const rightActive = right.progress.status === 'open' || right.progress.status === 'partially_received'
  if (leftActive !== rightActive) return leftActive ? -1 : 1
  if (leftActive) {
    const leftExpectedAt = left.purchaseOrder.expectedAt ? timestampMicros(left.purchaseOrder.expectedAt) : null
    const rightExpectedAt = right.purchaseOrder.expectedAt ? timestampMicros(right.purchaseOrder.expectedAt) : null
    if (leftExpectedAt === null && rightExpectedAt !== null) return 1
    if (leftExpectedAt !== null && rightExpectedAt === null) return -1
    if (leftExpectedAt !== null && rightExpectedAt !== null && leftExpectedAt !== rightExpectedAt) {
      return leftExpectedAt < rightExpectedAt ? -1 : 1
    }
  }
  const leftCreatedAt = timestampMicros(left.purchaseOrder.createdAt) as bigint
  const rightCreatedAt = timestampMicros(right.purchaseOrder.createdAt) as bigint
  if (leftCreatedAt !== rightCreatedAt) {
    return leftActive
      ? leftCreatedAt < rightCreatedAt ? -1 : 1
      : leftCreatedAt > rightCreatedAt ? -1 : 1
  }
  return compareCanonicalText(left.purchaseOrder.id, right.purchaseOrder.id)
}

export function commerceCatalogDigestSource(state: CommerceState) {
  const current = validateCommerceState(state)
  return JSON.stringify(
    [...current.items]
      .sort((left, right) => compareCanonicalText(left.sku, right.sku))
      .map((item) => [item.sku, item.name, item.variant ?? null, item.price]),
  )
}

export async function commerceCatalogDigest(state: CommerceState) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('SHA-256 is unavailable.')
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(commerceCatalogDigestSource(state)),
  )
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function commerceStorefrontPreviewDigest(state: CommerceState) {
  const current = validateCommerceState(state)
  const configuration = commerceStorefrontConfiguration(current)
  if (!configuration) throw new Error('A saved storefront configuration is required.')
  if (configuration.shopCatalogDigest !== await commerceCatalogDigest(current)) {
    throw new Error('The saved storefront configuration does not match the current Shop catalog.')
  }
  const itemBySku = new Map(current.items.map((item) => [item.sku, item]))
  const merchandisingBySku = new Map(configuration.merchandising?.map((entry) => [entry.sku, entry]) ?? [])
  const source = JSON.stringify({
    schema: COMMERCE_STOREFRONT_PREVIEW_SCHEMA,
    mode: 'browser-local-preview',
    sourceCatalogSchema: COMMERCE_WORKSPACE_SCHEMA,
    storeName: configuration.storeName,
    summary: configuration.summary,
    currency: 'MMK',
    items: configuration.selectedSkus.map((sku) => {
      const item = itemBySku.get(sku)
      if (!item) throw new Error(`Saved storefront SKU ${sku} is unavailable.`)
      const merchandising = merchandisingBySku.get(sku)
      return {
        sku: item.sku,
        name: item.name,
        variant: item.variant ?? null,
        unitPriceMmk: item.price,
        availability: item.onHand > 0 ? 'available' : 'sold_out',
        ...(merchandising ? {
          merchandising: {
            featured: merchandising.featured,
            collection: merchandising.collection,
            displayName: merchandising.displayName,
            note: merchandising.note,
          },
        } : {}),
      }
    }),
  })
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('SHA-256 is unavailable.')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(source))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function saveCommerceStorefrontConfiguration(
  state: CommerceState,
  input: CommerceStorefrontConfigurationInput,
  proof: CommerceActionProof,
) {
  const current = validateCommerceState(structuredClone(state))
  if (!validProof(proof)
    || typeof input.shopCatalogDigest !== 'string'
    || !sha256DigestPattern.test(input.shopCatalogDigest)
    || !Array.isArray(input.selectedSkus)
    || input.selectedSkus.length < 1
    || input.selectedSkus.length > 8) return null
  let currentCatalogDigest: string
  try {
    currentCatalogDigest = await commerceCatalogDigest(current)
  } catch {
    return null
  }
  if (input.shopCatalogDigest !== currentCatalogDigest) return null
  let storeName: string
  let summary: string
  let selectedSkus: string[]
  let requestedMerchandising: CommerceStorefrontMerchandising[] | undefined
  try {
    storeName = canonicalText(input.storeName, 'Store name', 60)
    summary = canonicalText(input.summary, 'Store summary', 180)
    selectedSkus = input.selectedSkus
      .map((sku, index) => canonicalText(sku, `Selected SKU ${index + 1}`, 80))
      .sort(compareCanonicalText)
    if (input.merchandising !== undefined && input.merchandising !== null) {
      if (!Array.isArray(input.merchandising) || input.merchandising.length !== selectedSkus.length) return null
      requestedMerchandising = input.merchandising
        .map((candidate, index) => ({
          sku: canonicalText(candidate?.sku, `Merchandising row ${index + 1} SKU`, 80),
          featured: canonicalBoolean(candidate?.featured, `Merchandising row ${index + 1} featured`),
          collection: canonicalText(candidate?.collection, `Merchandising row ${index + 1} collection`, 120),
          displayName: canonicalBlankableText(candidate?.displayName, `Merchandising row ${index + 1} display name`, 180),
          note: canonicalBlankableText(candidate?.note, `Merchandising row ${index + 1} note`, 300),
        }))
        .sort((left, right) => compareCanonicalText(left.sku, right.sku))
    }
  } catch {
    return null
  }
  if (new Set(selectedSkus).size !== selectedSkus.length
    || selectedSkus.some((sku) => !current.items.some((item) => item.sku === sku))) return null
  const existing = commerceStorefrontConfiguration(current)
  const merchandising = input.merchandising === undefined
    ? existing?.merchandising
    : requestedMerchandising
  if (merchandising && !sameStringArray(merchandising.map((entry) => entry.sku), selectedSkus)) return null
  if (input.merchandising === undefined && existing?.merchandising
    && !sameStringArray(existing.selectedSkus, selectedSkus)) return null
  const sameMerchandising = JSON.stringify(existing?.merchandising ?? null) === JSON.stringify(merchandising ?? null)
  const retainsActivation = Boolean(existing?.activation
    && sameStringArray(existing.selectedSkus, selectedSkus)
    && sameMerchandising)
  if (existing
    && existing.storeName === storeName
    && existing.summary === summary
    && existing.shopCatalogDigest === input.shopCatalogDigest
    && existing.selectedSkus.length === selectedSkus.length
    && existing.selectedSkus.every((sku, index) => sku === selectedSkus[index])
    && sameMerchandising) return current
  if (actionIdIsUsed(current, proof.actionId)
    || (existing?.revision ?? 0) >= Number.MAX_SAFE_INTEGER
    || (existing?.shopCatalogSnapshotRevision ?? 0) >= Number.MAX_SAFE_INTEGER) return null
  const revision = (existing?.revision ?? 0) + 1
  const shopCatalogSnapshotRevision = existing
    ? existing.shopCatalogDigest === input.shopCatalogDigest
      ? existing.shopCatalogSnapshotRevision
      : existing.shopCatalogSnapshotRevision + 1
    : 1
  if (proof.actionId !== commerceStorefrontConfigurationActionId(revision, input.shopCatalogDigest)
    || proof.evidenceReference !== `ECOMMERCE-STOREFRONT:${input.shopCatalogDigest}:R${revision}`) return null
  return validateCommerceState({
    ...current,
    storefrontConfiguration: {
      schema: COMMERCE_STOREFRONT_SCHEMA,
      revision,
      shopCatalogSnapshotRevision,
      shopCatalogDigest: input.shopCatalogDigest,
      storeName,
      summary,
      selectedSkus,
      ...(merchandising ? { merchandising: merchandising.map((entry) => ({ ...entry })) } : {}),
      ...(retainsActivation ? { activation: structuredClone(existing?.activation) } : {}),
      saved: { ...proof },
    },
  })
}

export function commerceStorefrontRequestEquals(
  left: CommerceStorefrontRequest,
  right: CommerceStorefrontRequest,
) {
  if (left.schema !== right.schema) return false
  if (left.schema === 'supermega.ecommerce.order_request.v2' && right.schema === 'supermega.ecommerce.order_request.v2') {
    const canonical = (value: unknown): unknown => Array.isArray(value)
      ? value.map(canonical)
      : isRecord(value)
        ? Object.fromEntries(Object.entries(value).sort(([first], [second]) => compareCanonicalText(first, second)).map(([key, nested]) => [key, canonical(nested)]))
        : value
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
  }
  if (left.schema !== 'supermega.ecommerce.order_request.v1' || right.schema !== 'supermega.ecommerce.order_request.v1') return false
  return left.schema === right.schema
    && left.mode === right.mode
    && left.state === right.state
    && left.id === right.id
    && left.idempotencyKey === right.idempotencyKey
    && left.createdAt === right.createdAt
    && left.sourcePreviewDigest === right.sourcePreviewDigest
    && (left.sourceStorefrontRevision ?? null) === (right.sourceStorefrontRevision ?? null)
    && (left.sourceStorefrontActionId ?? null) === (right.sourceStorefrontActionId ?? null)
    && left.customerReference === right.customerReference
    && left.fulfilment === right.fulfilment
    && left.currency === right.currency
    && left.line.sku === right.line.sku
    && left.line.name === right.line.name
    && left.line.variant === right.line.variant
    && left.line.quantity === right.line.quantity
    && left.line.unitPriceMmk === right.line.unitPriceMmk
    && left.totalMmk === right.totalMmk
}

export function commerceStorefrontRequestLines(request: CommerceStorefrontRequest): CommerceStorefrontRequestLineV2[] {
  return request.schema === 'supermega.ecommerce.order_request.v2'
    ? request.lines.map((line) => ({ ...line }))
    : [{ ...request.line, lineTotalMmk: request.line.quantity * request.line.unitPriceMmk }]
}

export async function recordCommerceStorefrontRequest(
  state: CommerceState,
  request: CommerceStorefrontRequest,
  proof: CommerceActionProof,
) {
  const current = validateCommerceState(state)
  let validatedRequest: CommerceStorefrontRequest
  try {
    validatedRequest = validateCommerceState({
      ...current,
      storefrontRequests: [request],
    }).storefrontRequests?.[0] as CommerceStorefrontRequest
  } catch {
    return null
  }
  if (!validProof(proof)
    || proof.actionId !== `ACT-${validatedRequest.id.slice(4)}`
    || proof.capturedAt !== validatedRequest.createdAt
    || proof.evidenceReference !== `ECOMMERCE:${validatedRequest.id}:${validatedRequest.sourcePreviewDigest}`) return null
  const requests = commerceStorefrontRequests(current)
  const existingById = requests.find((candidate) => candidate.id === validatedRequest.id)
  const existingByIdempotency = requests.find((candidate) => candidate.idempotencyKey === validatedRequest.idempotencyKey)
  if (existingById || existingByIdempotency) {
    const existing = existingById ?? existingByIdempotency as CommerceStorefrontRequest
    return existingById === existingByIdempotency
      && commerceStorefrontRequestEquals(existing, validatedRequest) ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)
    || current.orders.some((order) => order.sourceRecordId === validatedRequest.id)) return null
  if (requests.length >= maxStorefrontRequests) return null
  const configuration = commerceStorefrontConfiguration(current)
  const lines = commerceStorefrontRequestLines(validatedRequest)
  if (!configuration || lines.some((line) => !configuration.selectedSkus.includes(line.sku))) return null
  if (validatedRequest.sourceStorefrontRevision !== configuration.revision
    || validatedRequest.sourceStorefrontActionId !== configuration.saved.actionId
    || (timestampMicros(validatedRequest.createdAt) as bigint) < (timestampMicros(configuration.saved.capturedAt) as bigint)) return null
  let expectedPreviewDigest: string
  try {
    expectedPreviewDigest = await commerceStorefrontPreviewDigest(current)
  } catch {
    return null
  }
  if (validatedRequest.sourcePreviewDigest !== expectedPreviewDigest) return null
  if (lines.some((line) => {
    const matches = current.items.filter((item) => item.sku === line.sku)
    return matches.length !== 1
      || matches[0].name !== line.name
      || (matches[0].variant ?? null) !== line.variant
      || matches[0].price !== line.unitPriceMmk
      || matches[0].onHand < 1
  })) return null
  return validateCommerceState({
    ...current,
    storefrontRequests: [validatedRequest, ...requests],
  })
}

export function commerceOrderNeedsAction(order: CommerceOrder) {
  return order.refundStatus === 'due'
    || (order.status !== 'completed' && order.status !== 'cancelled')
    || (order.status === 'completed' && order.paymentStatus === 'pending')
}

export function createCommerceWebsiteIntake(
  state: CommerceState,
  input: CommerceWebsiteIntakeInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || proof.capturedAt !== proof.capturedAt.trim()
    || !websiteIntakeIdPattern.test(input.id)
    || !validWebsiteSource(input.source)
    || typeof input.sku !== 'string'
    || input.sku !== input.sku.trim()
    || !Number.isSafeInteger(input.quantity)
    || input.quantity < 1
    || input.quantity > 99) return null
  const current = validateCommerceState(state)
  const intakes = commerceWebsiteIntakes(current)
  const existing = intakes.find((intake) => intake.id === input.id)
  if (existing) return sameWebsiteSource(existing.source, input.source)
    && existing.sku === input.sku
    && existing.quantity === input.quantity ? current : null
  const sourceExisting = intakes.find((intake) => [
    intake.source.fingerprint,
    intake.source.approvalId,
    intake.source.snapshotId,
    intake.source.pageId,
  ].join('|') === [
    input.source.fingerprint,
    input.source.approvalId,
    input.source.snapshotId,
    input.source.pageId,
  ].join('|'))
  if (sourceExisting) return sourceExisting.sku === input.sku && sourceExisting.quantity === input.quantity ? current : null
  if (actionIdIsUsed(current, proof.actionId)) return null
  const matchingItems = current.items.filter((item) => item.sku === input.sku)
  const item = matchingItems.length === 1 ? matchingItems[0] : null
  if (!item) return null
  const total = item.price * input.quantity
  if (!Number.isSafeInteger(total) || total < 1) return null
  const snapshot: Omit<CommerceWebsiteIntake, 'snapshotDigest' | 'conversion' | 'status'> = {
    id: input.id,
    createdAt: proof.capturedAt,
    source: { ...input.source },
    sku: item.sku,
    quantity: input.quantity,
    itemName: item.name,
    unitPrice: item.price,
    total,
    creation: { ...proof },
  }
  if (item.variant) snapshot.itemVariant = item.variant
  const intake: CommerceWebsiteIntake = {
    ...snapshot,
    status: 'pending_confirmation',
    snapshotDigest: commerceWebsiteIntakeSnapshotDigest(snapshot),
  }
  return validateCommerceState({
    ...current,
    websiteIntakes: [intake, ...intakes],
  })
}

export function convertCommerceWebsiteIntake(
  state: CommerceState,
  intakeId: string,
  input: CommerceWebsiteOrderInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || typeof input?.customer !== 'string'
    || !input.customer.trim()
    || input.customer !== input.customer.trim()
    || input.customer.length > 80
    || !['pickup', 'local_delivery'].includes(input.fulfilmentMethod)
    || !['cash_on_delivery', 'manual_qr', 'manual_bank_transfer'].includes(input.paymentMethod)
    || timestampMicros(input.promisedAt) === null
    || (timestampMicros(input.promisedAt) as bigint) <= (timestampMicros(proof.capturedAt) as bigint)) return null
  const current = validateCommerceState(state)
  const intakes = commerceWebsiteIntakes(current)
  const intake = intakes.find((candidate) => candidate.id === intakeId)
  if (!intake) return null
  if (intake.status === 'converted') {
    const order = current.orders.find((candidate) => candidate.id === intake.conversion?.orderId)
    return intake.conversion
      && order?.customer === input.customer
      && order.owner === proof.actor
      && order.fulfilment === (input.fulfilmentMethod === 'pickup' ? 'pickup' : 'delivery')
      && order.fulfilmentReference === intake.id
      && order.promisedAt === input.promisedAt
      && order.payment === (input.paymentMethod === 'cash_on_delivery' ? 'Cash on delivery' : input.paymentMethod === 'manual_qr' ? 'Manual QR review' : 'Manual bank transfer')
      && sameActionProof(intake.conversion, proof)
      && (!current.inventoryFoundation || shopInventoryOrderActionMatches(
        current.inventoryFoundation,
        'order_reserve',
        order.id,
        proof,
        current.items.map((item) => item.sku).sort(),
      )) ? current : null
  }
  if (!intake.snapshotDigest) return null
  if (actionIdIsUsed(current, proof.actionId)) return null
  const item = current.items.find((candidate) => candidate.sku === intake.sku)
  if (!item
    || item.name !== intake.itemName
    || (item.variant ?? undefined) !== (intake.itemVariant ?? undefined)
    || item.price !== intake.unitPrice
    || item.onHand < intake.quantity) return null
  const nextBalance = safeBalance(item.onHand, -intake.quantity)
  if (nextBalance === null) return null
  const orderId = `ORD-WEB-${intake.id.slice(5)}`
  if (current.orders.some((order) => order.id === orderId || order.sourceRecordId === intake.id)) return null
  const fulfilment = input.fulfilmentMethod === 'pickup' ? 'pickup' : 'delivery'
  const payment = input.paymentMethod === 'cash_on_delivery'
    ? 'Cash on delivery'
    : input.paymentMethod === 'manual_qr'
      ? 'Manual QR review'
      : 'Manual bank transfer'
  const calculation = commerceOrderCalculation(current, intake.total, proof.capturedAt)
  if (!calculation) return null
  const order: CommerceOrder = {
    id: orderId,
    createdAt: proof.capturedAt,
    customer: input.customer,
    owner: proof.actor,
    channel: 'Website',
    item: intake.itemName,
    itemSku: intake.sku,
    quantity: intake.quantity,
    payment,
    paymentStatus: 'pending',
    refundStatus: 'none',
    fulfilment,
    fulfilmentReference: intake.id,
    promisedAt: input.promisedAt,
    paymentDueAt: proof.capturedAt,
    sourceRecordId: intake.id,
    evidenceReference: proof.evidenceReference,
    calculation,
    total: intake.total,
    status: 'confirmed',
  }
  const movement = movementFor(proof, {
    kind: 'reserve',
    sku: intake.sku,
    quantityDelta: -intake.quantity,
    orderId,
  })
  const conversion = { ...proof, orderId }
  const nextItems = current.items.map((candidate) => candidate.sku === intake.sku ? { ...candidate, onHand: nextBalance } : candidate)
  let inventoryFoundation = current.inventoryFoundation
  if (inventoryFoundation) {
    try {
      const catalogSkus = current.items.map((candidate) => candidate.sku).sort()
      if (!shopInventoryMatchesItems(inventoryFoundation, current.items)) return null
      const locationResult = reserveShopInventoryOrder(inventoryFoundation, {
        orderId,
        customerReference: order.customer,
        lines: reservationLinesForOrder(order),
        proof,
        catalogSkus,
        expectedHeadDigest: inventoryFoundation.headDigest,
      })
      if (locationResult.replayed || !shopInventoryMatchesItems(locationResult.state, nextItems)) return null
      inventoryFoundation = locationResult.state
    } catch {
      return null
    }
  }
  return validateCommerceState({
    ...current,
    items: nextItems,
    orders: [order, ...current.orders],
    movements: [movement, ...current.movements],
    websiteIntakes: intakes.map((candidate) => candidate.id === intake.id ? {
      ...candidate,
      status: 'converted' as const,
      conversion,
    } : candidate),
    ...(inventoryFoundation ? { inventoryFoundation } : {}),
  })
}

export function registerCommerceItem(state: CommerceState, item: CommerceItem, proof: CommerceActionProof) {
  const sku = optionalText(item.sku)
  const name = optionalText(item.name)
  const variant = item.variant === undefined ? undefined : optionalText(item.variant)
  const nameMy = item.nameMy === undefined ? undefined : optionalText(item.nameMy)
  if (!validProof(proof)
    || !sku || sku !== item.sku || sku.length > 80
    || !name || name !== item.name || name.length > 180
    || (item.nameMy !== undefined && (nameMy !== item.nameMy || item.nameMy.length > 180))
    || (item.variant !== undefined && (variant !== item.variant || item.variant.length > 180))
    || !Number.isSafeInteger(item.onHand) || item.onHand < 0
    || !Number.isSafeInteger(item.reorderAt) || item.reorderAt < 0
    || !Number.isSafeInteger(item.price) || item.price < 1) return null
  const proofMovement = state.movements.find((movement) => movement.actionId === proof.actionId)
  if (proofMovement) {
    const storedItem = state.items.find((candidate) => candidate.sku === item.sku)
    const expectedBaseline = createCommerceCatalogBaseline(item, proof)
    const storedBaseline = commerceCatalogBaselines(state).find((candidate) => candidate.sku === item.sku)
    return proofMovement.kind === 'opening'
      && proofMovement.sku === item.sku
      && proofMovement.quantityDelta === item.onHand
      && sameProof(proofMovement, proof)
      && JSON.stringify(storedItem) === JSON.stringify(item)
      && (!storedBaseline || sameCatalogBaseline(storedBaseline, expectedBaseline)) ? state : null
  }
  if (state.inventoryFoundation && item.onHand > 0) return null
  if (actionIdIsUsed(state, proof.actionId) || state.items.some((candidate) => candidate.sku === item.sku)) return null
  const opening = movementFor(proof, { kind: 'opening', sku: item.sku, quantityDelta: item.onHand })
  const baseline = createCommerceCatalogBaseline(item, proof)
  return validateCommerceState({
    ...state,
    items: [item, ...state.items],
    movements: [opening, ...state.movements],
    catalogBaselines: [baseline, ...commerceCatalogBaselines(state)],
  })
}

export type CommerceCatalogImportResult = {
  state: CommerceState
  created: number
  alreadyPresent: number
  replayed: boolean
}

const commerceWorkingSampleActionPrefix = 'ACT-DEMO-WORKING-SAMPLE-'
// The catalog rows this writes are read by the client during a demo, so the
// actor and evidence read as store setup rather than as scaffolding. The action
// prefix above stays as it is: it identifies a replaceable sample and is never
// displayed.
const WORKING_SAMPLE_SETUP_ACTOR = 'Store manager'
const commerceWorkingSampleOrderIdPrefix = 'SETUP-SAMPLE-'

export function installCommerceWorkingSampleCatalog(stateValue: CommerceState, input: {
  sampleId: string
  sampleName: string
  items: CommerceItem[]
  capturedAt: string
}) {
  let source: CommerceState
  try { source = validateCommerceState(stateValue) } catch { return null }
  const sampleId = optionalText(input?.sampleId)?.toLowerCase()
  const sampleName = optionalText(input?.sampleName)
  if (!sampleId || !/^[a-z][a-z0-9-]{1,39}$/.test(sampleId)
    || !sampleName || sampleName.length > 80
    || !Array.isArray(input?.items) || input.items.length < 1 || input.items.length > 20
    || typeof input.capturedAt !== 'string' || !validTimestamp(input.capturedAt)) return null
  const uniqueSkus = new Set(input.items.map((item) => item.sku))
  if (uniqueSkus.size !== input.items.length) return null

  const sampleBaselines = commerceCatalogBaselines(source).filter((baseline) => baseline.proof.actionId.startsWith(commerceWorkingSampleActionPrefix))
  const sampleMovements = source.movements.filter((movement) => movement.actionId.startsWith(commerceWorkingSampleActionPrefix))
  const sampleOrders = source.orders.filter((order) => order.id.startsWith(commerceWorkingSampleOrderIdPrefix))
  const sampleSkus = new Set([
    ...sampleBaselines.map((baseline) => baseline.sku),
    ...sampleMovements.map((movement) => movement.sku),
  ])
  const requestedPrefix = `${commerceWorkingSampleActionPrefix}${sampleId.toUpperCase()}-`
  const currentSampleItems = source.items.filter((item) => sampleSkus.has(item.sku)).sort((left, right) => left.sku.localeCompare(right.sku))
  const requestedItems = input.items.map((item) => ({ ...item })).sort((left, right) => left.sku.localeCompare(right.sku))
  if (sampleSkus.size === requestedItems.length
    && sampleBaselines.length === requestedItems.length
    && sampleMovements.length === requestedItems.length
    && !sampleOrders.length
    && sampleBaselines.every((baseline) => baseline.proof.actionId.startsWith(requestedPrefix))
    && sampleMovements.every((movement) => movement.actionId.startsWith(requestedPrefix))
    && JSON.stringify(currentSampleItems) === JSON.stringify(requestedItems)) return source

  let base = source
  if (sampleSkus.size || sampleBaselines.length || sampleMovements.length || sampleOrders.length) {
    try {
      base = validateCommerceState({
        ...source,
        orders: source.orders.filter((order) => !order.id.startsWith(commerceWorkingSampleOrderIdPrefix)),
        items: source.items.filter((item) => !sampleSkus.has(item.sku)),
        movements: source.movements.filter((movement) => !movement.actionId.startsWith(commerceWorkingSampleActionPrefix)),
        catalogBaselines: commerceCatalogBaselines(source).filter((baseline) => !baseline.proof.actionId.startsWith(commerceWorkingSampleActionPrefix)),
      })
    } catch {
      return null
    }
  }
  const policySeedCapturedAt = (base.promotionPolicies ?? []).find(
    (policy) => policy.proof.actionId === 'ACT-DEMO-PROMOTION-WELCOME',
  )?.proof.capturedAt
  const policySeedAnchor = policySeedCapturedAt ? Date.parse(policySeedCapturedAt) : Number.NaN
  const seedAnchor = commerceSeedAnchor(base) ?? (Number.isFinite(policySeedAnchor) ? policySeedAnchor : null)
  if (seedAnchor === null) return null
  const seed = createSeedCommerce(seedAnchor)
  let cleanClientBase: CommerceState
  try {
    cleanClientBase = validateCommerceState({
      ...seed,
      items: [],
      orders: [],
      movements: [],
      catalogBaselines: [],
      purchaseBudgetEnvelopes: [],
      purchaseOrders: [],
    })
  } catch {
    return null
  }
  if (JSON.stringify(base) !== JSON.stringify(seed)
    && JSON.stringify(base) !== JSON.stringify(cleanClientBase)) return null
  // A selected client template is the workspace, not an extra category inside SuperMega's
  // generic demo shop. Once the exact, untouched seed has been proven above, remove its products,
  // orders, stock evidence, catalog baselines, and procurement example before registering the
  // client rows. Reusable checkout policies remain available to Ecommerce. Any owner-modified
  // workspace still fails the exact-seed comparison and is preserved unchanged.
  base = cleanClientBase
  if (requestedItems.some((item) => base.items.some((existing) => existing.sku === item.sku))) return null

  let next = base
  for (const [index, item] of requestedItems.entries()) {
    const registered = registerCommerceItem(next, item, {
      actionId: `${requestedPrefix}${String(index + 1).padStart(3, '0')}`,
      capturedAt: input.capturedAt,
      actor: WORKING_SAMPLE_SETUP_ACTOR,
      reason: `Seed the ${sampleName} working sample.`,
      evidenceReference: `SETUP-${sampleId.toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
    })
    if (!registered) return null
    next = registered
  }
  return next
}

export function installCommerceWorkingSampleActivity(stateValue: CommerceState, input: {
  sampleId: string
  sampleName: string
  counterSales: readonly {
    recordedAt: string
    payment: string
    lines: readonly { sku: string; quantity: number }[]
  }[]
  pendingOrder: {
    customerName: string
    requestedAt: string
    promisedFor: string
    lines: readonly { sku: string; quantity: number }[]
  }
}) {
  let source: CommerceState
  try { source = validateCommerceState(stateValue) } catch { return null }
  const sampleId = optionalText(input?.sampleId)?.toLowerCase()
  const sampleName = optionalText(input?.sampleName)
  if (!sampleId || !sampleName
    || !Array.isArray(input?.counterSales) || !input.counterSales.length
    || !isRecord(input?.pendingOrder)) return null
  if (commerceWorkingSampleCatalogId(source) !== sampleId) return null

  const sampleIdUpper = sampleId.toUpperCase()
  const activityPrefix = `${commerceWorkingSampleActionPrefix}${sampleIdUpper}-`
  const saleOrderIds = input.counterSales.map((_, n) => `${commerceWorkingSampleOrderIdPrefix}${sampleIdUpper}-SALE-${n + 1}`)
  const pendingOrderId = `${commerceWorkingSampleOrderIdPrefix}${sampleIdUpper}-ORDER`
  const allExpectedIds = new Set([...saleOrderIds, pendingOrderId])

  if (source.orders.filter((order) => allExpectedIds.has(order.id)).length === allExpectedIds.size) return source

  const existingSampleOrderIds = new Set(
    source.orders.filter((order) => order.id.startsWith(commerceWorkingSampleOrderIdPrefix)).map((order) => order.id),
  )
  let base = source
  if (existingSampleOrderIds.size) {
    try {
      base = validateCommerceState({
        ...source,
        orders: source.orders.filter((order) => !existingSampleOrderIds.has(order.id)),
        movements: source.movements.filter((movement) => !movement.orderId || !existingSampleOrderIds.has(movement.orderId)),
      })
    } catch { return null }
  }

  const itemBySku = new Map(base.items.map((item) => [item.sku, item]))
  const newOrders: CommerceOrder[] = []
  const newMovements: CommerceStockMovement[] = []
  // Running total reserved per SKU across every sale and the pending order, so a sample that
  // reserves the same item twice is checked against actual stock, not just each line alone.
  const reservedQuantityBySku = new Map<string, number>()

  for (const [n, sale] of input.counterSales.entries()) {
    const saleNumber = n + 1
    const orderId = saleOrderIds[n]
    const reserveActionId = `${activityPrefix}SALE-${saleNumber}-RESERVE`
    const settleActionId = `${activityPrefix}SALE-${saleNumber}-SETTLE`
    const completeActionId = `${activityPrefix}SALE-${saleNumber}-COMPLETE`
    if (!validTimestamp(sale?.recordedAt) || !Array.isArray(sale?.lines) || !sale.lines.length) return null
    const salePayment = optionalText(sale.payment)
    if (!salePayment) return null
    const orderLines: CommerceOrderLine[] = []
    let orderQuantity = 0
    let orderTotal = 0
    for (const line of sale.lines) {
      const item = itemBySku.get(line?.sku)
      if (!item || !Number.isSafeInteger(line?.quantity) || line.quantity < 1) return null
      const lineTotal = item.price * line.quantity
      const nextQty = orderQuantity + line.quantity
      const nextTotal = orderTotal + lineTotal
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(nextQty) || !Number.isSafeInteger(nextTotal)) return null
      orderQuantity = nextQty
      orderTotal = nextTotal
      orderLines.push({ sku: item.sku, name: item.name, ...(item.variant ? { variant: item.variant } : {}), quantity: line.quantity, unitPriceMmk: item.price })
      const reservedSoFar = safeBalance(reservedQuantityBySku.get(item.sku) ?? 0, line.quantity)
      if (reservedSoFar === null || reservedSoFar > item.onHand) return null
      reservedQuantityBySku.set(item.sku, reservedSoFar)
    }
    // A counter sale is money taken and then goods handed over: the customer pays at the till and
    // walks out with the purchase. Stage it in that order -- payment reconciled first, completion
    // after -- exactly as the demo seed's ORD-1039 does.
    //
    // Staging it 'completed' with payment left 'pending' put a permanent primary "Reconcile
    // payment" button on the owner's first screen that could never succeed: validateCommerceState
    // requires completion.capturedAt >= paymentReconciledAt, and a real till only ever stamps a
    // proof from the present clock, which is always later than this backdated completion.
    const paidAt = new Date(Date.parse(sale.recordedAt) + 5 * 60 * 1000).toISOString()
    const completedAt = new Date(Date.parse(sale.recordedAt) + 15 * 60 * 1000).toISOString()
    const reserveProof: CommerceActionProof = { actionId: reserveActionId, capturedAt: sale.recordedAt, actor: WORKING_SAMPLE_SETUP_ACTOR, reason: `Seed the ${sampleName} working sample sale ${saleNumber}.`, evidenceReference: `SETUP-${sampleIdUpper}-SALE-${saleNumber}-RESERVE` }
    newOrders.push({
      id: orderId,
      createdAt: sale.recordedAt,
      customer: 'Walk-in customer',
      owner: WORKING_SAMPLE_SETUP_ACTOR,
      channel: 'Walk-in',
      item: commerceOrderItemSummary(orderLines),
      ...(orderLines.length === 1 ? { itemSku: orderLines[0].sku } : {}),
      quantity: orderQuantity,
      payment: salePayment,
      paymentStatus: 'reconciled',
      paymentReconciledAt: paidAt,
      paymentReconciliationActionId: settleActionId,
      paymentReconciledBy: WORKING_SAMPLE_SETUP_ACTOR,
      paymentReconciliationReason: `Counter payment taken for the ${sampleName} working sample.`,
      paymentEvidenceReference: `SETUP-${sampleIdUpper}-SALE-${saleNumber}-SETTLE`,
      refundStatus: 'none',
      fulfilment: 'pickup',
      fulfilmentReference: `Counter ${orderId}`,
      promisedAt: new Date(Date.parse(sale.recordedAt) + 30 * 60 * 1000).toISOString(),
      lines: orderLines,
      calculation: { schema: COMMERCE_ORDER_CALCULATION_SCHEMA, currency: 'MMK', catalogRevision: 0, subtotalMmk: orderTotal, taxMode: 'not_configured', taxMmk: 0, totalMmk: orderTotal },
      total: orderTotal,
      status: 'completed',
      completion: { actionId: completeActionId, capturedAt: completedAt, actor: WORKING_SAMPLE_SETUP_ACTOR, reason: `Counter handoff for the ${sampleName} working sample.`, evidenceReference: `SETUP-${sampleIdUpper}-SALE-${saleNumber}-COMPLETE` },
    })
    for (const [lineIndex, line] of orderLines.entries()) {
      newMovements.push(movementFor(reserveProof, { kind: 'reserve', sku: line.sku, quantityDelta: -line.quantity, orderId }, `line-${lineIndex + 1}`))
    }
  }

  const { pendingOrder } = input
  const pendingCustomer = optionalText(pendingOrder?.customerName)
  if (!pendingCustomer
    || !validTimestamp(pendingOrder?.requestedAt)
    || !validTimestamp(pendingOrder?.promisedFor)
    || !Array.isArray(pendingOrder?.lines)
    || !pendingOrder.lines.length) return null
  const pendingReserveActionId = `${activityPrefix}ORDER-RESERVE`
  const pendingOrderLines: CommerceOrderLine[] = []
  let pendingQuantity = 0
  let pendingTotal = 0
  for (const line of pendingOrder.lines) {
    const item = itemBySku.get(line?.sku)
    if (!item || !Number.isSafeInteger(line?.quantity) || line.quantity < 1) return null
    const lineTotal = item.price * line.quantity
    const nextQty = pendingQuantity + line.quantity
    const nextTotal = pendingTotal + lineTotal
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(nextQty) || !Number.isSafeInteger(nextTotal)) return null
    pendingQuantity = nextQty
    pendingTotal = nextTotal
    pendingOrderLines.push({ sku: item.sku, name: item.name, ...(item.variant ? { variant: item.variant } : {}), quantity: line.quantity, unitPriceMmk: item.price })
    const reservedSoFar = safeBalance(reservedQuantityBySku.get(item.sku) ?? 0, line.quantity)
    if (reservedSoFar === null || reservedSoFar > item.onHand) return null
    reservedQuantityBySku.set(item.sku, reservedSoFar)
  }
  const pendingReserveProof: CommerceActionProof = { actionId: pendingReserveActionId, capturedAt: pendingOrder.requestedAt, actor: WORKING_SAMPLE_SETUP_ACTOR, reason: `Seed the ${sampleName} working sample pending order.`, evidenceReference: `SETUP-${sampleIdUpper}-ORDER-RESERVE` }
  newOrders.push({
    id: pendingOrderId,
    createdAt: pendingOrder.requestedAt,
    customer: pendingCustomer,
    owner: WORKING_SAMPLE_SETUP_ACTOR,
    channel: 'Phone',
    item: commerceOrderItemSummary(pendingOrderLines),
    ...(pendingOrderLines.length === 1 ? { itemSku: pendingOrderLines[0].sku } : {}),
    quantity: pendingQuantity,
    payment: 'Cash',
    paymentStatus: 'pending',
    refundStatus: 'none',
    fulfilment: 'pickup',
    fulfilmentReference: `Order ${pendingOrderId}`,
    promisedAt: pendingOrder.promisedFor,
    lines: pendingOrderLines,
    calculation: { schema: COMMERCE_ORDER_CALCULATION_SCHEMA, currency: 'MMK', catalogRevision: 0, subtotalMmk: pendingTotal, taxMode: 'not_configured', taxMmk: 0, totalMmk: pendingTotal },
    total: pendingTotal,
    status: 'confirmed',
  })
  for (const [lineIndex, line] of pendingOrderLines.entries()) {
    newMovements.push(movementFor(pendingReserveProof, { kind: 'reserve', sku: line.sku, quantityDelta: -line.quantity, orderId: pendingOrderId }, `line-${lineIndex + 1}`))
  }

  const nextItems = base.items.map((item) => {
    const reserved = reservedQuantityBySku.get(item.sku)
    return reserved ? { ...item, onHand: item.onHand - reserved } : item
  })

  try {
    return validateCommerceState({
      ...base,
      items: nextItems,
      orders: [...base.orders, ...newOrders],
      movements: [...base.movements, ...newMovements],
    })
  } catch { return null }
}

export function commerceWorkingSampleCatalogId(stateValue: CommerceState) {
  let state: CommerceState
  try { state = validateCommerceState(stateValue) } catch { return null }
  const sampleIds = new Set(commerceCatalogBaselines(state).flatMap((baseline) => {
    if (!baseline.proof.actionId.startsWith(commerceWorkingSampleActionPrefix)) return []
    const suffix = baseline.proof.actionId.slice(commerceWorkingSampleActionPrefix.length)
    const match = /^([A-Z][A-Z0-9-]{1,39})-\d{3}$/.exec(suffix)
    return match ? [match[1].toLowerCase()] : []
  }))
  return sampleIds.size === 1 ? [...sampleIds][0] : null
}

export function commerceWorkingSampleSkus(stateValue: CommerceState) {
  let state: CommerceState
  try { state = validateCommerceState(stateValue) } catch { return [] }
  const skus = new Set([
    ...commerceCatalogBaselines(state)
      .filter((baseline) => baseline.proof.actionId.startsWith(commerceWorkingSampleActionPrefix))
      .map((baseline) => baseline.sku),
    ...state.movements
      .filter((movement) => movement.actionId.startsWith(commerceWorkingSampleActionPrefix))
      .map((movement) => movement.sku),
  ])
  return [...skus].sort((left, right) => left.localeCompare(right, 'en'))
}

export function importCommerceCatalog(stateValue: CommerceState, input: {
  items: CommerceItem[]
  sourceDigest: string
  capturedAt: string
  actor: string
}): CommerceCatalogImportResult | null {
  if (!Array.isArray(input?.items) || input.items.length < 1 || input.items.length > 500
    || typeof input.sourceDigest !== 'string' || !sha256DigestPattern.test(input.sourceDigest)
    || typeof input.capturedAt !== 'string' || !validTimestamp(input.capturedAt)
    || typeof input.actor !== 'string' || input.actor !== input.actor.trim() || !input.actor || input.actor.length > 80) return null
  const sourceState = validateCommerceState(stateValue)
  const uniqueSkus = new Set(input.items.map((item) => item.sku))
  if (uniqueSkus.size !== input.items.length) return null
  let state = sourceState
  let created = 0
  let alreadyPresent = 0
  for (const [index, item] of input.items.entries()) {
    const existing = state.items.find((candidate) => candidate.sku === item.sku)
    if (existing) {
      if (existing.name !== item.name
        || existing.variant !== item.variant
        || existing.onHand !== item.onHand
        || existing.reorderAt !== item.reorderAt
        || existing.price !== item.price) return null
      alreadyPresent += 1
      continue
    }
    const sourceId = input.sourceDigest.slice(7, 19).toUpperCase()
    const proof: CommerceActionProof = {
      actionId: `ACT-CLIENT-IMPORT-${sourceId}-${String(index + 1).padStart(3, '0')}`,
      capturedAt: input.capturedAt,
      actor: input.actor,
      reason: `Approved client catalog import row ${index + 1}.`,
      evidenceReference: `CLIENT-IMPORT-${sourceId}-${item.sku}`,
    }
    const next = registerCommerceItem(state, item, proof)
    if (!next) return null
    state = next
    created += 1
  }
  return { state, created, alreadyPresent, replayed: created === 0 }
}

export function updateCommerceItem(state: CommerceState, update: CommerceItemUpdate, proof: CommerceActionProof) {
  if (!validProof(proof)
    || typeof update?.sku !== 'string'
    || !update.sku
    || update.sku !== update.sku.trim()
    || update.sku.length > 80
    || !Number.isSafeInteger(update.expectedPrice)
    || update.expectedPrice < 1
    || !Number.isSafeInteger(update.nextPrice)
    || update.nextPrice < 1
    || !Number.isSafeInteger(update.expectedReorderAt)
    || update.expectedReorderAt < 0
    || !Number.isSafeInteger(update.nextReorderAt)
    || update.nextReorderAt < 0
    || (update.expectedPrice === update.nextPrice
      && update.expectedReorderAt === update.nextReorderAt)) return null
  const current = validateCommerceState(state)
  const change: CommerceCatalogChange = {
    sku: update.sku,
    previousPrice: update.expectedPrice,
    nextPrice: update.nextPrice,
    previousReorderAt: update.expectedReorderAt,
    nextReorderAt: update.nextReorderAt,
    proof: { ...proof },
  }
  const changes = commerceCatalogChanges(current)
  const baselines = commerceCatalogBaselines(current)
  const replay = changes.find((candidate) => candidate.proof.actionId === proof.actionId)
  if (replay) return sameCatalogChange(replay, change) ? current : null
  const existingBaseline = baselines.find((baseline) => baseline.sku === update.sku)
  if (changes.length >= maxCatalogChanges
    || (!existingBaseline && baselines.length >= maxCatalogBaselines)
    || actionIdIsUsed(current, proof.actionId)) return null
  const items = current.items.filter((item) => item.sku === update.sku)
  if (items.length !== 1
    || items[0].price !== update.expectedPrice
    || items[0].reorderAt !== update.expectedReorderAt) return null
  const nextBaselines = existingBaseline
    ? baselines
    : [createCommerceCatalogBaseline(items[0], proof), ...baselines]
  return validateCommerceState({
    ...current,
    items: current.items.map((item) => item.sku === update.sku
      ? { ...item, price: update.nextPrice, reorderAt: update.nextReorderAt }
      : item),
    catalogBaselines: nextBaselines,
    catalogChanges: [change, ...changes],
  })
}

export function configureCommerceTax(
  state: CommerceState,
  input: CommerceTaxConfigurationInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || typeof input?.code !== 'string'
    || input.code !== input.code.trim()
    || !taxCodePattern.test(input.code)
    || typeof input.label !== 'string'
    || input.label !== input.label.trim()
    || !input.label
    || input.label.length > 80
    || !Number.isSafeInteger(input.rateBasisPoints)
    || input.rateBasisPoints < 0
    || input.rateBasisPoints > 10_000
    || (input.mode !== 'exclusive' && input.mode !== 'inclusive')
    || typeof input.jurisdictionCode !== 'string'
    || input.jurisdictionCode !== input.jurisdictionCode.trim()
    || !taxJurisdictionCodePattern.test(input.jurisdictionCode)
    || !validTimestamp(input.effectiveFrom)
    || (timestampMicros(input.effectiveFrom) as bigint) < (timestampMicros(proof.capturedAt) as bigint)) return null
  const current = validateCommerceState(state)
  const history = commerceTaxConfigurations(current)
  const replay = history.find((configuration) => configuration.proof.actionId === proof.actionId)
  if (replay) {
    return sameTaxConfiguration(replay, {
      revision: replay.revision,
      ...input,
      proof,
    }) ? current : null
  }
  const latest = history[0]
  if (history.length >= maxTaxConfigurations
    || actionIdIsUsed(current, proof.actionId)
    || (latest && latest.code === input.code
      && latest.label === input.label
      && latest.rateBasisPoints === input.rateBasisPoints
      && latest.mode === input.mode
      && latest.jurisdictionCode === input.jurisdictionCode
      && latest.effectiveFrom === input.effectiveFrom)
    || (latest && (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(latest.proof.capturedAt) as bigint))
    || (latest && (timestampMicros(input.effectiveFrom) as bigint)
      < (timestampMicros(latest.effectiveFrom ?? latest.proof.capturedAt) as bigint))) return null
  const configuration: CommerceTaxConfiguration = {
    revision: history.length + 1,
    code: input.code,
    label: input.label,
    rateBasisPoints: input.rateBasisPoints,
    mode: input.mode,
    jurisdictionCode: input.jurisdictionCode,
    effectiveFrom: input.effectiveFrom,
    proof: { ...proof },
  }
  return validateCommerceState({
    ...current,
    taxConfigurations: [configuration, ...history],
  })
}

export function configureCommerceAccountMapping(
  state: CommerceState,
  input: CommerceAccountMappingInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof) || !Array.isArray(input?.mappings) || input.mappings.length !== commerceAccountRoles.length) return null
  const mappings: CommerceAccountMappingEntry[] = []
  for (const [index, accountRole] of commerceAccountRoles.entries()) {
    const mapping = input.mappings[index]
    if (!mapping || mapping.accountRole !== accountRole
      || typeof mapping.externalAccountCode !== 'string'
      || mapping.externalAccountCode !== mapping.externalAccountCode.trim()
      || !externalAccountCodePattern.test(mapping.externalAccountCode)) return null
    mappings.push({ accountRole, externalAccountCode: mapping.externalAccountCode })
  }
  const current = validateCommerceState(state)
  const history = commerceAccountMappingConfigurations(current)
  const replay = history.find((configuration) => configuration.proof.actionId === proof.actionId)
  if (replay) {
    return sameAccountMappingConfiguration(replay, {
      revision: replay.revision,
      mappings,
      proof,
    }) ? current : null
  }
  const latest = history[0]
  if (history.length >= maxAccountMappingConfigurations
    || actionIdIsUsed(current, proof.actionId)
    || (latest && latest.mappings.every((mapping, index) => mapping.accountRole === mappings[index].accountRole
      && mapping.externalAccountCode === mappings[index].externalAccountCode))
    || (latest && (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(latest.proof.capturedAt) as bigint))) return null
  const configuration: CommerceAccountMappingConfiguration = {
    revision: history.length + 1,
    mappings,
    proof: { ...proof },
  }
  return validateCommerceState({
    ...current,
    accountMappingConfigurations: [configuration, ...history],
  })
}

export function configureCommerceCustomerCreditPolicy(
  state: CommerceState,
  input: CommerceCustomerCreditPolicyInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || typeof input?.customer !== 'string'
    || input.customer !== input.customer.trim()
    || !input.customer
    || input.customer.length > 120
    || !Number.isSafeInteger(input.creditLimitMmk)
    || input.creditLimitMmk < 0
    || !customerCreditTerms.has(input.maxPaymentTermsDays)
    || (input.status !== 'active' && input.status !== 'hold')) return null
  const current = validateCommerceState(state)
  const history = commerceCustomerCreditPolicies(current)
  const replay = history.find((policy) => policy.proof.actionId === proof.actionId)
  if (replay) {
    return replay.customer === input.customer
      && replay.creditLimitMmk === input.creditLimitMmk
      && replay.maxPaymentTermsDays === input.maxPaymentTermsDays
      && replay.status === input.status
      && sameActionProof(replay.proof, proof) ? current : null
  }
  const currentPolicy = commerceCurrentCustomerCreditPolicy(current, input.customer)
  const latest = history[0]
  if (history.length >= maxCustomerCreditPolicies
    || actionIdIsUsed(current, proof.actionId)
    || (currentPolicy
      && currentPolicy.creditLimitMmk === input.creditLimitMmk
      && currentPolicy.maxPaymentTermsDays === input.maxPaymentTermsDays
      && currentPolicy.status === input.status)
    || (latest && (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(latest.proof.capturedAt) as bigint))) return null
  const policy: CommerceCustomerCreditPolicy = {
    revision: history.length + 1,
    customer: input.customer,
    creditLimitMmk: input.creditLimitMmk,
    maxPaymentTermsDays: input.maxPaymentTermsDays,
    status: input.status,
    proof: { ...proof },
  }
  return validateCommerceState({
    ...current,
    customerCreditPolicies: [policy, ...history],
  })
}

export function configureCommercePromotionPolicy(
  state: CommerceState,
  input: CommercePromotionPolicyInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || typeof input?.code !== 'string'
    || input.code !== input.code.trim().toUpperCase()
    || !/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(input.code)
    || !Number.isSafeInteger(input.discountBasisPoints)
    || input.discountBasisPoints < 1
    || input.discountBasisPoints > 10_000
    || !Number.isSafeInteger(input.minimumSubtotalMmk)
    || input.minimumSubtotalMmk < 0
    || !Number.isSafeInteger(input.maximumDiscountMmk)
    || input.maximumDiscountMmk < 1
    || (input.status !== 'active' && input.status !== 'inactive')
    || !validTimestamp(input.effectiveFrom)
    || (timestampMicros(proof.capturedAt) as bigint) > (timestampMicros(input.effectiveFrom) as bigint)
    || (input.effectiveUntil !== null && (!validTimestamp(input.effectiveUntil)
      || (timestampMicros(input.effectiveUntil) as bigint) <= (timestampMicros(input.effectiveFrom) as bigint)))) return null
  const current = validateCommerceState(state)
  const history = commercePromotionPolicies(current)
  const replay = history.find((policy) => policy.proof.actionId === proof.actionId)
  if (replay) {
    return replay.code === input.code
      && replay.discountBasisPoints === input.discountBasisPoints
      && replay.minimumSubtotalMmk === input.minimumSubtotalMmk
      && replay.maximumDiscountMmk === input.maximumDiscountMmk
      && replay.status === input.status
      && replay.effectiveFrom === input.effectiveFrom
      && replay.effectiveUntil === input.effectiveUntil
      && sameActionProof(replay.proof, proof) ? current : null
  }
  const currentPolicy = commerceCurrentPromotionPolicy(current, input.code)
  const latest = history[0]
  if (history.length >= maxPromotionPolicies
    || actionIdIsUsed(current, proof.actionId)
    || (currentPolicy
      && currentPolicy.discountBasisPoints === input.discountBasisPoints
      && currentPolicy.minimumSubtotalMmk === input.minimumSubtotalMmk
      && currentPolicy.maximumDiscountMmk === input.maximumDiscountMmk
      && currentPolicy.status === input.status
      && currentPolicy.effectiveFrom === input.effectiveFrom
      && currentPolicy.effectiveUntil === input.effectiveUntil)
    || (latest && (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(latest.proof.capturedAt) as bigint))) return null
  const policy: CommercePromotionPolicy = {
    revision: history.length + 1,
    ...input,
    proof: { ...proof },
  }
  return validateCommerceState({
    ...current,
    promotionPolicies: [policy, ...history],
  })
}

export function configureCommerceShippingPolicy(
  state: CommerceState,
  input: CommerceShippingPolicyInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || typeof input?.zoneCode !== 'string'
    || input.zoneCode !== input.zoneCode.trim().toUpperCase()
    || !/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(input.zoneCode)
    || !Array.isArray(input.townships)
    || input.townships.length < 1
    || input.townships.length > 50
    || input.townships.some((township) => typeof township !== 'string' || township !== township.trim() || !township || township.length > 80)
    || input.townships.some((township, index) => index > 0 && input.townships[index - 1].localeCompare(township, 'en', { sensitivity: 'base' }) >= 0)
    || !Number.isSafeInteger(input.feeMmk) || input.feeMmk < 0
    || !Number.isSafeInteger(input.promiseMinutes) || input.promiseMinutes < 15 || input.promiseMinutes > 10_080
    || (input.status !== 'active' && input.status !== 'inactive')
    || !validTimestamp(input.effectiveFrom)
    || (timestampMicros(proof.capturedAt) as bigint) > (timestampMicros(input.effectiveFrom) as bigint)
    || (input.effectiveUntil !== null && (!validTimestamp(input.effectiveUntil)
      || (timestampMicros(input.effectiveUntil) as bigint) <= (timestampMicros(input.effectiveFrom) as bigint)))) return null
  const current = validateCommerceState(state)
  const history = commerceShippingPolicies(current)
  const replay = history.find((policy) => policy.proof.actionId === proof.actionId)
  if (replay) return replay.zoneCode === input.zoneCode
    && JSON.stringify(replay.townships) === JSON.stringify(input.townships)
    && replay.feeMmk === input.feeMmk
    && replay.promiseMinutes === input.promiseMinutes
    && replay.status === input.status
    && replay.effectiveFrom === input.effectiveFrom
    && replay.effectiveUntil === input.effectiveUntil
    && sameActionProof(replay.proof, proof) ? current : null
  const latest = history[0]
  const currentPolicy = commerceCurrentShippingPolicy(current, input.zoneCode)
  if (history.length >= maxShippingPolicies
    || actionIdIsUsed(current, proof.actionId)
    || (currentPolicy
      && currentPolicy.zoneCode === input.zoneCode
      && JSON.stringify(currentPolicy.townships) === JSON.stringify(input.townships)
      && currentPolicy.feeMmk === input.feeMmk
      && currentPolicy.promiseMinutes === input.promiseMinutes
      && currentPolicy.status === input.status
      && currentPolicy.effectiveFrom === input.effectiveFrom
      && currentPolicy.effectiveUntil === input.effectiveUntil)
    || (latest && (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(latest.proof.capturedAt) as bigint))) return null
  const policy: CommerceShippingPolicy = { revision: history.length + 1, ...input, proof: { ...proof } }
  return validateCommerceState({ ...current, shippingPolicies: [policy, ...history] })
}

export function configureCommercePaymentPolicy(
  state: CommerceState,
  input: CommercePaymentPolicyInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || !['pay_on_pickup', 'cash_on_delivery', 'kbzpay_manual'].includes(input?.adapter)
    || !Array.isArray(input.allowedFulfilments) || input.allowedFulfilments.length < 1 || input.allowedFulfilments.length > 2
    || input.allowedFulfilments.some((value) => !['delivery', 'pickup'].includes(value))
    || input.allowedFulfilments.some((value, index) => index > 0 && input.allowedFulfilments[index - 1] >= value)
    || (input.maximumOrderMmk !== null && (!Number.isSafeInteger(input.maximumOrderMmk) || input.maximumOrderMmk < 1))
    || typeof input.instructions !== 'string' || input.instructions !== input.instructions.trim() || !input.instructions || input.instructions.length > 240
    || (input.status !== 'active' && input.status !== 'inactive')
    || !validTimestamp(input.effectiveFrom)
    || (timestampMicros(proof.capturedAt) as bigint) > (timestampMicros(input.effectiveFrom) as bigint)
    || (input.effectiveUntil !== null && (!validTimestamp(input.effectiveUntil)
      || (timestampMicros(input.effectiveUntil) as bigint) <= (timestampMicros(input.effectiveFrom) as bigint)))) return null
  const current = validateCommerceState(state)
  const history = commercePaymentPolicies(current)
  const replay = history.find((policy) => policy.proof.actionId === proof.actionId)
  if (replay) return replay.adapter === input.adapter
    && JSON.stringify(replay.allowedFulfilments) === JSON.stringify(input.allowedFulfilments)
    && replay.maximumOrderMmk === input.maximumOrderMmk
    && replay.instructions === input.instructions
    && replay.status === input.status
    && replay.effectiveFrom === input.effectiveFrom
    && replay.effectiveUntil === input.effectiveUntil
    && sameActionProof(replay.proof, proof) ? current : null
  const latest = history[0]
  const currentPolicy = commerceCurrentPaymentPolicy(current, input.adapter)
  if (history.length >= maxPaymentPolicies
    || actionIdIsUsed(current, proof.actionId)
    || (currentPolicy
      && JSON.stringify(currentPolicy.allowedFulfilments) === JSON.stringify(input.allowedFulfilments)
      && currentPolicy.maximumOrderMmk === input.maximumOrderMmk
      && currentPolicy.instructions === input.instructions
      && currentPolicy.status === input.status
      && currentPolicy.effectiveFrom === input.effectiveFrom
      && currentPolicy.effectiveUntil === input.effectiveUntil)
    || (latest && (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(latest.proof.capturedAt) as bigint))) return null
  const policy: CommercePaymentPolicy = { revision: history.length + 1, ...input, proof: { ...proof } }
  return validateCommerceState({ ...current, paymentPolicies: [policy, ...history] })
}

function validatedOrderLineSnapshots(order: CommerceOrder): CommerceOrderLine[] | null {
  if (!Array.isArray(order.lines) || order.lines.length < 1 || order.lines.length > maxOrderLines) return null
  const skus = new Set<string>()
  let quantity = 0
  let total = 0
  for (const line of order.lines) {
    if (!isRecord(line)
      || !hasExactKeys(line, ['sku', 'name', 'quantity', 'unitPriceMmk'], ['variant'])
      || typeof line.sku !== 'string' || line.sku !== line.sku.trim() || !line.sku
      || typeof line.name !== 'string' || line.name !== line.name.trim() || !line.name
      || (line.variant !== undefined && (typeof line.variant !== 'string' || line.variant !== line.variant.trim() || !line.variant))
      || !Number.isSafeInteger(line.quantity) || line.quantity < 1
      || !Number.isSafeInteger(line.unitPriceMmk) || line.unitPriceMmk < 1
      || skus.has(line.sku)) return null
    const lineTotal = line.quantity * line.unitPriceMmk
    const nextQuantity = quantity + line.quantity
    const nextTotal = total + lineTotal
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(nextQuantity) || !Number.isSafeInteger(nextTotal)) return null
    skus.add(line.sku)
    quantity = nextQuantity
    total = nextTotal
  }
  const expectedItemSku = order.lines.length === 1 ? order.lines[0].sku : undefined
  const pricedTotal = (order.promotionDecision?.netSubtotalMmk ?? total) + (order.shippingDecision?.feeMmk ?? 0)
  if (order.promotionDecision && (order.promotionDecision.grossSubtotalMmk !== total
    || order.promotionDecision.netSubtotalMmk !== total - order.promotionDecision.discountMmk
    || order.promotionDecision.netSubtotalMmk < 1)) return null
  if (order.shippingDecision && (order.shippingDecision.status === 'rejected'
    || order.shippingDecision.feeMmk < 0
    || (order.shippingDecision.status === 'pickup' && order.shippingDecision.feeMmk !== 0))) return null
  return order.item === commerceOrderItemSummary(order.lines)
    && order.itemSku === expectedItemSku
    && order.quantity === quantity
    && (order.calculation?.schema === COMMERCE_ORDER_CALCULATION_V2_SCHEMA
      ? order.calculation.listedSubtotalMmk === pricedTotal && order.total === order.calculation.totalMmk
      : order.total === pricedTotal) ? order.lines : null
}

export function reserveCommerceOrder(state: CommerceState, order: CommerceOrder, proof: CommerceActionProof) {
  const promisedAt = timestampMicros(order.promisedAt)
  const createdAt = timestampMicros(order.createdAt)
  const confirmedAt = timestampMicros(proof.capturedAt)
  if (!validProof(proof)
    || order.creditDecision !== undefined
    || order.status !== 'confirmed'
    || order.owner !== proof.actor
    || !['pickup', 'delivery'].includes(order.fulfilment ?? '')
    || typeof order.fulfilmentReference !== 'string'
    || !order.fulfilmentReference.trim()
    || order.fulfilmentReference !== order.fulfilmentReference.trim()
    || order.fulfilmentReference.length > 160
    || promisedAt === null
    || createdAt === null
    || confirmedAt === null
    || promisedAt <= createdAt
    || promisedAt <= confirmedAt
    || !Number.isSafeInteger(order.quantity)
    || order.quantity < 1
    || !Number.isSafeInteger(order.total)
    || order.total < 1
    || order.paymentStatus !== 'pending'
    || order.refundStatus !== 'none') return null
  if (Boolean(order.sourceRecordId) !== Boolean(order.evidenceReference)
    || (order.evidenceReference && order.evidenceReference !== proof.evidenceReference)) return null
  if (order.promotionDecision) {
    const expectedPromotion = commercePromotionDecision(
      commercePromotionPolicies(state),
      order.promotionDecision.code,
      order.promotionDecision.grossSubtotalMmk,
      order.promotionDecision.reviewedAt,
    )
    if (!order.sourceRecordId?.startsWith('ECR-')
      || !expectedPromotion
      || JSON.stringify(expectedPromotion) !== JSON.stringify(order.promotionDecision)
      || (timestampMicros(order.promotionDecision.reviewedAt) as bigint) > (timestampMicros(order.createdAt) as bigint)) return null
  }
  if (order.shippingDecision) {
    const expectedShipping = commerceShippingDecision(
      commerceShippingPolicies(state),
      order.fulfilment as 'pickup' | 'delivery',
      order.shippingDecision.township,
      order.shippingDecision.reviewedAt,
    )
    if (!order.sourceRecordId?.startsWith('ECR-')
      || !expectedShipping
      || expectedShipping.status === 'rejected'
      || JSON.stringify(expectedShipping) !== JSON.stringify(order.shippingDecision)
      || (timestampMicros(order.shippingDecision.reviewedAt) as bigint) > (timestampMicros(order.createdAt) as bigint)
      || (order.shippingDecision.promiseMinutes !== null
        && (promisedAt as bigint) < (timestampMicros(order.shippingDecision.reviewedAt) as bigint) + BigInt(order.shippingDecision.promiseMinutes) * 60_000_000n)) return null
  }
  const reviewedListedSubtotal = order.taxDecision || order.paymentDecision
    ? (order.promotionDecision?.netSubtotalMmk ?? (order.lines
      ? order.lines.reduce((sum, line) => sum + line.unitPriceMmk * line.quantity, 0)
      : order.total - (order.shippingDecision?.feeMmk ?? 0))) + (order.shippingDecision?.feeMmk ?? 0)
    : null
  if (order.taxDecision) {
    const expectedTax = reviewedListedSubtotal === null
      ? null
      : commerceTaxDecision(state, reviewedListedSubtotal, order.taxDecision.reviewedAt)
    if (!order.sourceRecordId?.startsWith('ECR-')
      || !expectedTax
      || JSON.stringify(expectedTax) !== JSON.stringify(order.taxDecision)
      || (timestampMicros(order.taxDecision.reviewedAt) as bigint) > (timestampMicros(order.createdAt) as bigint)) return null
  }
  if (order.paymentDecision) {
    if (reviewedListedSubtotal === null) return null
    const reviewedCalculation = commerceOrderCalculation(state, reviewedListedSubtotal, order.paymentDecision.reviewedAt)
    if (!reviewedCalculation) return null
    const expectedPayment = commercePaymentDecision(
      commercePaymentPolicies(state),
      order.paymentDecision.adapter,
      order.fulfilment as 'pickup' | 'delivery',
      reviewedCalculation.totalMmk,
      order.paymentDecision.reviewedAt,
    )
    if (!order.sourceRecordId?.startsWith('ECR-')
      || !expectedPayment || expectedPayment.status !== 'approved'
      || JSON.stringify(expectedPayment) !== JSON.stringify(order.paymentDecision)
      || order.payment !== commercePaymentAdapterLabel(order.paymentDecision.adapter)
      || (timestampMicros(order.paymentDecision.reviewedAt) as bigint) > (timestampMicros(order.createdAt) as bigint)) return null
  }
  const proofMovements = state.movements.filter((movement) => movement.actionId === proof.actionId)
  if (proofMovements.length) {
    const storedOrder = state.orders.find((candidate) => candidate.id === order.id)
    if (!storedOrder) return null
    const storedLines = reservationLinesForOrder(storedOrder)
    const storedBusinessOrder = { ...storedOrder }
    if (storedOrder.calculation?.schema === COMMERCE_ORDER_CALCULATION_V2_SCHEMA) {
      storedBusinessOrder.total = storedOrder.calculation.listedSubtotalMmk
    }
    delete storedBusinessOrder.calculation
    delete storedBusinessOrder.creditDecision
    const requestedBusinessOrder = { ...order }
    delete requestedBusinessOrder.calculation
    if (requestedBusinessOrder.lines === undefined) delete storedBusinessOrder.lines
    return proofMovements.length === storedLines.length
      && storedLines.every((line) => proofMovements.some((movement) => movement.kind === 'reserve'
        && movement.orderId === storedOrder.id
        && movement.sku === line.sku
        && movement.quantityDelta === -line.quantity
        && sameProof(movement, proof)))
      && (!state.inventoryFoundation || shopInventoryOrderActionMatches(
        state.inventoryFoundation,
        'order_reserve',
        storedOrder.id,
        proof,
        state.items.map((item) => item.sku).sort(),
      ))
      && JSON.stringify(storedBusinessOrder) === JSON.stringify(requestedBusinessOrder) ? state : null
  }
  const capturedLines = order.lines === undefined ? undefined : validatedOrderLineSnapshots(order)
  if (order.lines !== undefined && !capturedLines) return null
  const legacyItem = order.lines === undefined && order.itemSku
    ? state.items.find((candidate) => candidate.sku === order.itemSku)
    : undefined
  const lines = capturedLines ?? (legacyItem ? [{
    sku: legacyItem.sku,
    name: legacyItem.name,
    ...(legacyItem.variant ? { variant: legacyItem.variant } : {}),
    quantity: order.quantity,
    unitPriceMmk: legacyItem.price,
  }] : [])
  if (!lines.length
    || (order.lines === undefined && (order.item !== legacyItem?.name || legacyItem.price * order.quantity !== order.total))) return null
  if (actionIdIsUsed(state, proof.actionId)) return null
  const duplicate = state.orders.some((candidate) => candidate.id === order.id || Boolean(order.sourceRecordId && candidate.sourceRecordId === order.sourceRecordId))
  if (duplicate) return null
  const nextBalances = new Map<string, number>()
  for (const line of lines) {
    const matchingItems = state.items.filter((candidate) => candidate.sku === line.sku)
    const item = matchingItems.length === 1 ? matchingItems[0] : undefined
    if (!item
      || item.name !== line.name
      || item.variant !== line.variant
      || item.price !== line.unitPriceMmk
      || item.onHand < line.quantity) return null
    const nextBalance = safeBalance(item.onHand, -line.quantity)
    if (nextBalance === null) return null
    nextBalances.set(item.sku, nextBalance)
  }
  const calculationSubtotal = (order.promotionDecision?.netSubtotalMmk ?? (capturedLines
    ? capturedLines.reduce((sum, line) => sum + line.unitPriceMmk * line.quantity, 0)
    : order.total)) + (order.shippingDecision?.feeMmk ?? 0)
  const calculation = commerceOrderCalculation(state, calculationSubtotal, proof.capturedAt)
  if (!calculation) return null
  const paymentTermsDays = commerceOrderPaymentTermsDays(order)
  if (paymentTermsDays === null) return null
  const creditReview = commerceCustomerCreditReview(
    state,
    order.customer,
    calculation.totalMmk,
    paymentTermsDays,
    order.createdAt,
  )
  if (!creditReview.allowed) return null
  const creditDecision: CommerceOrderCreditDecision | undefined = paymentTermsDays === 0
    ? undefined
    : {
      policyRevision: (creditReview.policy as CommerceCustomerCreditPolicy).revision,
      policyActionId: (creditReview.policy as CommerceCustomerCreditPolicy).proof.actionId,
      creditLimitMmk: (creditReview.policy as CommerceCustomerCreditPolicy).creditLimitMmk,
      exposureBeforeMmk: creditReview.exposureBeforeMmk,
      orderAmountMmk: creditReview.orderAmountMmk,
      exposureAfterMmk: creditReview.exposureAfterMmk,
      maxPaymentTermsDays: (creditReview.policy as CommerceCustomerCreditPolicy).maxPaymentTermsDays,
      paymentTermsDays,
      status: 'approved',
    }
  const authoritativeOrder: CommerceOrder = {
    ...order,
    lines,
    calculation,
    total: calculation.totalMmk,
    ...(creditDecision ? { creditDecision } : {}),
  }
  const movements = lines.map((line, index) => movementFor(
    proof,
    { kind: 'reserve', sku: line.sku, quantityDelta: -line.quantity, orderId: order.id },
    lines.length > 1 ? `L${index + 1}` : undefined,
  ))
  const nextItems = state.items.map((candidate) => nextBalances.has(candidate.sku) ? { ...candidate, onHand: nextBalances.get(candidate.sku) as number } : candidate)
  let inventoryFoundation = state.inventoryFoundation
  if (inventoryFoundation) {
    try {
      const catalogSkus = state.items.map((candidate) => candidate.sku).sort()
      if (!shopInventoryMatchesItems(inventoryFoundation, state.items)) return null
      const locationResult = reserveShopInventoryOrder(inventoryFoundation, {
        orderId: order.id,
        customerReference: order.customer,
        lines: lines.map(({ sku, quantity }) => ({ sku, quantity })),
        proof,
        catalogSkus,
        expectedHeadDigest: inventoryFoundation.headDigest,
      })
      if (locationResult.replayed || !shopInventoryMatchesItems(locationResult.state, nextItems)) return null
      inventoryFoundation = locationResult.state
    } catch {
      return null
    }
  }
  return validateCommerceState({
    ...state,
    items: nextItems,
    orders: [authoritativeOrder, ...state.orders],
    movements: [...movements, ...state.movements],
    ...(inventoryFoundation ? { inventoryFoundation } : {}),
  })
}

export function approveCommercePurchaseBudgetEnvelope(
  state: CommerceState,
  input: CommercePurchaseBudgetEnvelopeInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || !purchaseBudgetEnvelopeIdPattern.test(input.id)
    || typeof input.budgetCode !== 'string' || input.budgetCode !== input.budgetCode.trim().toUpperCase() || !purchaseBudgetCodePattern.test(input.budgetCode)
    || typeof input.label !== 'string' || input.label !== input.label.trim() || !input.label || input.label.length > 120
    || !validTimestamp(input.periodStart) || !validTimestamp(input.periodEnd)
    || (timestampMicros(input.periodStart) as bigint) > (timestampMicros(proof.capturedAt) as bigint)
    || (timestampMicros(proof.capturedAt) as bigint) >= (timestampMicros(input.periodEnd) as bigint)
    || !Number.isSafeInteger(input.ceilingMmk) || input.ceilingMmk < 1
    || !Number.isSafeInteger(input.perRequisitionLimitMmk) || input.perRequisitionLimitMmk < 1
    || input.perRequisitionLimitMmk > input.ceilingMmk) return null
  const current = validateCommerceState(state)
  const history = commercePurchaseBudgetEnvelopes(current)
  const existing = history.find((envelope) => envelope.id === input.id || envelope.approval.actionId === proof.actionId)
  if (existing) return existing.id === input.id
    && existing.budgetCode === input.budgetCode && existing.label === input.label
    && existing.periodStart === input.periodStart && existing.periodEnd === input.periodEnd
    && existing.ceilingMmk === input.ceilingMmk && existing.perRequisitionLimitMmk === input.perRequisitionLimitMmk
    && sameActionProof(existing.approval, proof) ? current : null
  if (history.length >= maxPurchaseBudgetEnvelopes || actionIdIsUsed(current, proof.actionId)) return null
  const envelope: CommercePurchaseBudgetEnvelope = {
    ...input,
    createdAt: proof.capturedAt,
    approval: { ...proof },
  }
  try {
    return validateCommerceState({ ...current, purchaseBudgetEnvelopes: [envelope, ...history] })
  } catch {
    return null
  }
}

export function approveCommerceSupplierSourcingDecision(
  state: CommerceState,
  input: CommerceSupplierSourcingDecisionInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof) || !supplierSourcingDecisionIdPattern.test(input.id)) return null
  const current = validateCommerceState(state)
  const history = commerceSupplierSourcingDecisions(current)
  const proposed: CommerceSupplierSourcingDecision = {
    ...input,
    quotes: input.quotes.map((quote) => ({ ...quote })),
    createdAt: proof.capturedAt,
    approval: { ...proof },
  }
  const existing = history.find((decision) => decision.id === input.id || decision.approval.actionId === proof.actionId)
  if (existing) return JSON.stringify(existing) === JSON.stringify(proposed) ? current : null
  if (history.length >= maxSupplierSourcingDecisions || actionIdIsUsed(current, proof.actionId)) return null
  try {
    return validateCommerceState({ ...current, supplierSourcingDecisions: [proposed, ...history] })
  } catch {
    return null
  }
}

export function approveCommercePurchaseRequisition(
  state: CommerceState,
  input: CommercePurchaseRequisitionInput,
  proof: CommerceActionProof,
) {
  const supplier = optionalText(input.supplier)
  const totalMmk = input.quantityRequested * input.unitCostMmk
  if (!validProof(proof)
    || !purchaseRequisitionIdPattern.test(input.id)
    || !purchaseBudgetEnvelopeIdPattern.test(input.budgetEnvelopeId)
    || !supplierSourcingDecisionIdPattern.test(input.sourceSourcingDecisionId)
    || !validTimestamp(input.expectedAt)
    || (timestampMicros(input.expectedAt) as bigint) <= (timestampMicros(proof.capturedAt) as bigint)
    || !supplier || supplier !== input.supplier || supplier.length > 120
    || typeof input.sku !== 'string' || input.sku !== input.sku.trim() || input.sku.length > 80
    || !Number.isSafeInteger(input.quantityRequested) || input.quantityRequested < 1
    || !Number.isSafeInteger(input.unitCostMmk) || input.unitCostMmk < 1
    || !Number.isSafeInteger(totalMmk)
    || !sha256DigestPattern.test(input.sourceDecisionDigest)
    || !sha256DigestPattern.test(input.sourceReplenishmentDigest)) return null
  const current = validateCommerceState(state)
  const existing = commercePurchaseRequisitions(current).find((requisition) => requisition.id === input.id)
  if (existing) return existing.expectedAt === input.expectedAt
    && existing.budgetEnvelopeId === input.budgetEnvelopeId
    && existing.sourceSourcingDecisionId === input.sourceSourcingDecisionId
    && existing.supplier === supplier && existing.sku === input.sku
    && existing.quantityRequested === input.quantityRequested && existing.unitCostMmk === input.unitCostMmk
    && existing.sourceDecisionDigest === input.sourceDecisionDigest
    && existing.sourceReplenishmentDigest === input.sourceReplenishmentDigest
    && sameActionProof(existing.approval, proof) ? current : null
  const budgetEnvelope = commercePurchaseBudgetEnvelopes(current).find((envelope) => envelope.id === input.budgetEnvelopeId)
  const sourcingDecision = commerceSupplierSourcingDecisions(current).find((decision) => decision.id === input.sourceSourcingDecisionId)
  const selectedQuote = sourcingDecision ? commerceSupplierSourcingSelectedQuote(sourcingDecision) : null
  const maximumUnitCost = sourcingDecision && selectedQuote
    ? Number(BigInt(selectedQuote.unitCostMmk) * BigInt(10_000 + sourcingDecision.unitCostToleranceBasisPoints) / 10_000n)
    : 0
  const latestDelivery = sourcingDecision && selectedQuote
    ? (timestampMicros(selectedQuote.deliveryAt) as bigint) + BigInt(sourcingDecision.deliveryToleranceDays) * 86_400_000_000n
    : 0n
  if (!budgetEnvelope
    || (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(budgetEnvelope.periodStart) as bigint)
    || (timestampMicros(proof.capturedAt) as bigint) >= (timestampMicros(budgetEnvelope.periodEnd) as bigint)
    || totalMmk > budgetEnvelope.perRequisitionLimitMmk
    || commercePurchaseBudgetCommitment(current, budgetEnvelope).availableMmk < totalMmk
    || !sourcingDecision || !selectedQuote || sourcingDecision.sku !== input.sku
    || sourcingDecision.quantity !== input.quantityRequested || selectedQuote.supplier !== supplier
    || input.unitCostMmk > maximumUnitCost
    || (timestampMicros(input.expectedAt) as bigint) > latestDelivery
    || (timestampMicros(proof.capturedAt) as bigint) > (timestampMicros(selectedQuote.validUntil) as bigint)
    || commercePurchaseRequisitions(current).some((requisition) => requisition.sourceSourcingDecisionId === sourcingDecision.id)) return null
  if (actionIdIsUsed(current, proof.actionId)
    || !current.items.some((item) => item.sku === input.sku)
    || commercePurchaseOrders(current).some((order) => order.sku === input.sku && !order.cancellation && commercePurchaseOrderProgress(current, order).remaining > 0)
    || commercePurchaseRequisitions(current).some((requisition) => requisition.sku === input.sku && !commercePurchaseOrders(current).some((order) => order.requisitionId === requisition.id))) return null
  const requisition: CommercePurchaseRequisition = {
    id: input.id, budgetEnvelopeId: input.budgetEnvelopeId, sourceSourcingDecisionId: input.sourceSourcingDecisionId, createdAt: proof.capturedAt, expectedAt: input.expectedAt, supplier,
    sku: input.sku, quantityRequested: input.quantityRequested, unitCostMmk: input.unitCostMmk,
    totalMmk, sourceDecisionDigest: input.sourceDecisionDigest,
    sourceReplenishmentDigest: input.sourceReplenishmentDigest, approval: { ...proof },
  }
  return validateCommerceState({ ...current, purchaseRequisitions: [requisition, ...commercePurchaseRequisitions(current)] })
}

export function createCommercePurchaseOrder(
  state: CommerceState,
  input: CommercePurchaseOrderInput,
  proof: CommerceActionProof,
) {
  const supplier = optionalText(input.supplier)
  const unitCostMmk = input.unitCostMmk
  if (!validProof(proof)
    || !purchaseOrderIdPattern.test(input.id)
    || !validTimestamp(input.expectedAt)
    || (timestampMicros(input.expectedAt) as bigint) <= (timestampMicros(proof.capturedAt) as bigint)
    || !supplier
    || supplier !== input.supplier
    || supplier.length > 120
    || typeof input.sku !== 'string'
    || input.sku !== input.sku.trim()
    || input.sku.length > 80
    || !Number.isSafeInteger(input.quantityOrdered)
    || input.quantityOrdered < 1
    || !Number.isSafeInteger(unitCostMmk)
    || (unitCostMmk ?? 0) < 1
    || !Number.isSafeInteger(input.quantityOrdered * (unitCostMmk ?? 0))) return null
  const current = validateCommerceState(state)
  const existing = commercePurchaseOrders(current).find((purchaseOrder) => purchaseOrder.id === input.id)
  if (existing) {
    return existing.requisitionId === input.requisitionId && existing.expectedAt === input.expectedAt
      && existing.supplier === input.supplier
      && existing.sku === input.sku
      && existing.quantityOrdered === input.quantityOrdered
      && existing.unitCostMmk === unitCostMmk
      && sameActionProof(existing.creation, proof) ? current : null
  }
  const requisition = input.requisitionId ? commercePurchaseRequisitions(current).find((candidate) => candidate.id === input.requisitionId) : null
  if (input.requisitionId && (!requisition
    || commercePurchaseOrders(current).some((order) => order.requisitionId === input.requisitionId)
    || requisition.expectedAt !== input.expectedAt || requisition.supplier !== supplier
    || requisition.sku !== input.sku || requisition.quantityRequested !== input.quantityOrdered
    || requisition.unitCostMmk !== unitCostMmk
    || (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(requisition.createdAt) as bigint)
    || sameAccountableActor(proof.actor, requisition.approval.actor))) return null
  if (actionIdIsUsed(current, proof.actionId)) return null
  if (current.inventoryFoundation) {
    const inventory = projectShopInventory(
      current.inventoryFoundation,
      current.items.map((item) => item.sku).sort(),
    )
    if (inventory.vendors.filter((vendor) => vendor.name === supplier).length !== 1) return null
  }
  const matchingItems = current.items.filter((item) => item.sku === input.sku)
  if (matchingItems.length !== 1) return null
  if (commercePurchaseOrders(current).some((purchaseOrder) => (
    purchaseOrder.sku === input.sku
    && commercePurchaseOrderProgress(current, purchaseOrder).remaining > 0
    && !purchaseOrder.cancellation
  ))) return null
  const purchaseOrder: CommercePurchaseOrder = {
    id: input.id,
    ...(input.requisitionId ? { requisitionId: input.requisitionId } : {}),
    createdAt: proof.capturedAt,
    expectedAt: input.expectedAt,
    supplier,
    sku: input.sku,
    quantityOrdered: input.quantityOrdered,
    unitCostMmk: unitCostMmk as number,
    creation: { ...proof },
  }
  return validateCommerceState({
    ...current,
    purchaseOrders: [purchaseOrder, ...commercePurchaseOrders(current)],
  })
}

export function receiveCommercePurchaseOrder(
  state: CommerceState,
  purchaseOrderId: string,
  quantity: number,
  proof: CommerceActionProof,
  locationReceipt?: CommercePurchaseOrderLocationReceipt,
  discrepancy?: CommercePurchaseOrderReceiptDiscrepancy,
) {
  const rejectedQuantity = discrepancy?.quantityRejected ?? 0
  if (!validProof(proof)
    || !Number.isSafeInteger(quantity)
    || quantity < 1
    || !Number.isSafeInteger(rejectedQuantity)
    || rejectedQuantity < 0
    || (discrepancy !== undefined && (rejectedQuantity < 1
      || !purchaseOrderDiscrepancyCodes.has(discrepancy.reasonCode)
      || discrepancy.disposition !== 'return_to_vendor'))) return null
  const current = validateCommerceState(state)
  const replayMovement = current.movements.find((movement) => movement.actionId === proof.actionId)
  if (replayMovement) {
    const aggregateReplayMatches = replayMovement.kind === 'receipt'
      && replayMovement.purchaseOrderId === purchaseOrderId
      && replayMovement.quantityDelta === quantity
      && (replayMovement.rejectedQuantity ?? 0) === rejectedQuantity
      && (replayMovement.discrepancyCode ?? null) === (discrepancy?.reasonCode ?? null)
      && (replayMovement.discrepancyDisposition ?? null) === (discrepancy?.disposition ?? null)
      && sameProof(replayMovement, proof)
    if (!aggregateReplayMatches) return null
    if (!current.inventoryFoundation) return locationReceipt ? null : current
    if (!locationReceipt) return null
    try {
      const catalogSkus = current.items.map((item) => item.sku).sort()
      const locationReplay = receiveShopInventory(current.inventoryFoundation, {
        ...locationReceipt,
        purchaseOrderId,
        sku: replayMovement.sku,
        quantity,
        proof,
        catalogSkus,
      })
      if (!locationReplay.replayed) return null
      return shopInventoryMatchesItems(locationReplay.state, current.items) ? current : null
    } catch {
      return null
    }
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const purchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrderId)
  if (!purchaseOrder
    || purchaseOrder.cancellation
    || (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(purchaseOrder.createdAt) as bigint)) return null
  const progress = commercePurchaseOrderProgress(current, purchaseOrder)
  if (!Number.isSafeInteger(quantity + rejectedQuantity) || quantity + rejectedQuantity > progress.remaining) return null
  const item = current.items.find((candidate) => candidate.sku === purchaseOrder.sku)
  if (!item) return null
  const nextBalance = safeBalance(item.onHand, quantity)
  if (nextBalance === null) return null
  const movement = movementFor(proof, {
    kind: 'receipt',
    sku: purchaseOrder.sku,
    quantityDelta: quantity,
    purchaseOrderId,
    ...(discrepancy ? {
      rejectedQuantity,
      discrepancyCode: discrepancy.reasonCode,
      discrepancyDisposition: discrepancy.disposition,
    } : {}),
  })
  const nextItems = current.items.map((candidate) => candidate.sku === purchaseOrder.sku ? { ...candidate, onHand: nextBalance } : candidate)
  let inventoryFoundation = current.inventoryFoundation
  if (inventoryFoundation) {
    if (!locationReceipt) return null
    try {
      const catalogSkus = current.items.map((candidate) => candidate.sku).sort()
      if (!shopInventoryMatchesItems(inventoryFoundation, current.items)) return null
      const locationResult = receiveShopInventory(inventoryFoundation, {
        ...locationReceipt,
        purchaseOrderId,
        sku: purchaseOrder.sku,
        quantity,
        proof,
        catalogSkus,
      })
      if (locationResult.replayed) return null
      if (!shopInventoryMatchesItems(locationResult.state, nextItems)) return null
      inventoryFoundation = locationResult.state
    } catch {
      return null
    }
  } else if (locationReceipt) return null
  return validateCommerceState({
    ...current,
    items: nextItems,
    movements: [movement, ...current.movements],
    ...(inventoryFoundation ? { inventoryFoundation } : {}),
  })
}

export function cancelCommercePurchaseOrder(
  state: CommerceState,
  purchaseOrderId: string,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)) return null
  const current = validateCommerceState(state)
  const purchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrderId)
  if (!purchaseOrder) return null
  if (purchaseOrder.cancellation) return sameActionProof(purchaseOrder.cancellation, proof) ? current : null
  if (purchaseOrder.supplierInvoice) return null
  if (actionIdIsUsed(current, proof.actionId)) return null
  const progress = commercePurchaseOrderProgress(current, purchaseOrder)
  const latestReceiptAt = current.movements
    .filter((movement) => movement.purchaseOrderId === purchaseOrderId)
    .reduce((latest, movement) => {
      const movementAt = timestampMicros(movement.createdAt) as bigint
      return movementAt > latest ? movementAt : latest
    }, timestampMicros(purchaseOrder.createdAt) as bigint)
  if (progress.remaining < 1 || (timestampMicros(proof.capturedAt) as bigint) < latestReceiptAt) return null
  return validateCommerceState({
    ...current,
    purchaseOrders: commercePurchaseOrders(current).map((candidate) => candidate.id === purchaseOrderId
      ? { ...candidate, cancellation: { ...proof } }
      : candidate),
  })
}

export function receiveCommerceStock(state: CommerceState, sku: string, quantity: number, proof: CommerceActionProof) {
  if (!validProof(proof) || !Number.isSafeInteger(quantity) || quantity < 1) return null
  const proofMovement = state.movements.find((movement) => movement.actionId === proof.actionId)
  if (proofMovement) return proofMovement.kind === 'receipt' && proofMovement.sku === sku && proofMovement.quantityDelta === quantity && sameProof(proofMovement, proof) ? state : null
  if (state.inventoryFoundation) return null
  if (actionIdIsUsed(state, proof.actionId)) return null
  const matchingItems = state.items.filter((candidate) => candidate.sku === sku)
  const item = matchingItems.length === 1 ? matchingItems[0] : undefined
  if (!item) return null
  const nextBalance = safeBalance(item.onHand, quantity)
  if (nextBalance === null) return null
  const movement = movementFor(proof, { kind: 'receipt', sku, quantityDelta: quantity })
  return validateCommerceState({
    ...state,
    items: state.items.map((candidate) => candidate.sku === sku ? { ...candidate, onHand: nextBalance } : candidate),
    movements: [movement, ...state.movements],
  })
}

export function issueCommerceStockToProduction(
  state: CommerceState,
  request: CommerceProductionMaterialRequest,
  sku: string,
  stockQuantity: number,
  conversionNote: string,
  proof: CommerceActionProof,
) {
  if (!validProof(proof) || !Number.isSafeInteger(stockQuantity) || stockQuantity < 1) return null
  let checkedRequest: CommerceProductionMaterialRequest
  let checkedSku: string
  let checkedConversionNote: string
  try {
    checkedRequest = {
      requestId: canonicalText(request.requestId, 'production material request ID', 80),
      sourceCommandDigest: request.sourceCommandDigest,
      jobId: canonicalText(request.jobId, 'production job ID', 80),
      materialId: canonicalText(request.materialId, 'production material ID', 80),
      inputLotId: canonicalText(request.inputLotId, 'production input lot ID', 80),
      quantityMilli: request.quantityMilli,
      unit: request.unit,
    }
    checkedSku = canonicalText(sku, 'production issue SKU', 80)
    checkedConversionNote = canonicalText(conversionNote, 'production issue conversion note', 240)
    if (!sha256DigestPattern.test(checkedRequest.sourceCommandDigest)) return null
    assertSafeInteger(checkedRequest.quantityMilli, 'production material quantity', 1)
    if (!productionMaterialUnits.has(checkedRequest.unit)) return null
  } catch {
    return null
  }
  const current = validateCommerceState(state)
  const matchingMovement = (movement: CommerceStockMovement) => movement.kind === 'production_issue'
    && movement.sku === checkedSku
    && movement.quantityDelta === -stockQuantity
    && movement.productionRequestId === checkedRequest.requestId
    && movement.productionCommandDigest === checkedRequest.sourceCommandDigest
    && movement.productionJobId === checkedRequest.jobId
    && movement.productionMaterialId === checkedRequest.materialId
    && movement.productionInputLotId === checkedRequest.inputLotId
    && movement.productionQuantityMilli === checkedRequest.quantityMilli
    && movement.productionUnit === checkedRequest.unit
    && movement.conversionNote === checkedConversionNote
  const replayMovement = current.movements.find((movement) => movement.actionId === proof.actionId)
  if (replayMovement) return matchingMovement(replayMovement)
    && sameProof(replayMovement, proof)
    && (!current.inventoryFoundation || shopInventoryProductionActionMatches(
      current.inventoryFoundation,
      checkedRequest,
      checkedSku,
      stockQuantity,
      checkedConversionNote,
      proof,
      current.items.map((item) => item.sku).sort(),
    )) ? current : null
  if (actionIdIsUsed(current, proof.actionId)
    || current.movements.some((movement) => movement.productionRequestId === checkedRequest.requestId)) return null
  const matchingItems = current.items.filter((candidate) => candidate.sku === checkedSku)
  const item = matchingItems.length === 1 ? matchingItems[0] : undefined
  if (!item) return null
  const nextBalance = safeBalance(item.onHand, -stockQuantity)
  if (nextBalance === null) return null
  let inventoryFoundation = current.inventoryFoundation
  if (inventoryFoundation) {
    try {
      if (!shopInventoryMatchesItems(inventoryFoundation, current.items)) return null
      const locationResult = issueShopInventoryToProduction(inventoryFoundation, {
        request: checkedRequest,
        sku: checkedSku,
        stockQuantity,
        conversionNote: checkedConversionNote,
        proof,
        catalogSkus: current.items.map((candidate) => candidate.sku).sort(),
        expectedHeadDigest: inventoryFoundation.headDigest,
      })
      inventoryFoundation = locationResult.state
    } catch {
      return null
    }
  }
  const movement = movementFor(proof, {
    kind: 'production_issue',
    sku: checkedSku,
    quantityDelta: -stockQuantity,
    productionRequestId: checkedRequest.requestId,
    productionCommandDigest: checkedRequest.sourceCommandDigest,
    productionJobId: checkedRequest.jobId,
    productionMaterialId: checkedRequest.materialId,
    productionInputLotId: checkedRequest.inputLotId,
    productionQuantityMilli: checkedRequest.quantityMilli,
    productionUnit: checkedRequest.unit,
    conversionNote: checkedConversionNote,
  })
  return validateCommerceState({
    ...current,
    items: current.items.map((candidate) => candidate.sku === checkedSku ? { ...candidate, onHand: nextBalance } : candidate),
    movements: [movement, ...current.movements],
    ...(inventoryFoundation ? { inventoryFoundation } : {}),
  })
}

export function recordCommerceSupplierInvoice(
  state: CommerceState,
  purchaseOrderId: string,
  input: CommerceSupplierInvoiceInput,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || !supplierInvoiceIdPattern.test(input.id)
    || !validTimestamp(input.issuedAt)
    || !validTimestamp(input.dueAt)
    || (timestampMicros(input.dueAt) as bigint) < (timestampMicros(input.issuedAt) as bigint)
    || !optionalText(input.supplierReference)
    || input.supplierReference !== input.supplierReference.trim()
    || input.supplierReference.length > 80
    || !Number.isSafeInteger(input.quantityInvoiced)
    || input.quantityInvoiced < 1
    || !Number.isSafeInteger(input.unitCostMmk)
    || input.unitCostMmk < 1
    || !Number.isSafeInteger(input.quantityInvoiced * input.unitCostMmk)
    || (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(input.issuedAt) as bigint)) return null
  const current = validateCommerceState(state)
  const purchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrderId)
  if (!purchaseOrder
    || purchaseOrder.cancellation
    || purchaseOrder.unitCostMmk === undefined
    || (timestampMicros(input.issuedAt) as bigint) < (timestampMicros(purchaseOrder.createdAt) as bigint)) return null
  const exactInvoice = purchaseOrder.supplierInvoice
  if (exactInvoice) {
    return exactInvoice.id === input.id
      && exactInvoice.supplierReference === input.supplierReference
      && exactInvoice.issuedAt === input.issuedAt
      && exactInvoice.dueAt === input.dueAt
      && exactInvoice.quantityInvoiced === input.quantityInvoiced
      && exactInvoice.unitCostMmk === input.unitCostMmk
      && sameActionProof(exactInvoice.recording, proof) ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)
    || commercePurchaseOrders(current).some((candidate) => candidate.supplierInvoice?.id === input.id
      || candidate.supplier === purchaseOrder.supplier
        && candidate.supplierInvoice?.supplierReference === input.supplierReference)) return null
  const supplierInvoice: CommerceSupplierInvoice = {
    ...input,
    totalMmk: input.quantityInvoiced * input.unitCostMmk,
    recording: { ...proof },
  }
  return validateCommerceState({
    ...current,
    purchaseOrders: commercePurchaseOrders(current).map((candidate) => candidate.id === purchaseOrderId
      ? { ...candidate, supplierInvoice }
      : candidate),
  })
}

export function markCommerceSupplierInvoicePayableReady(
  state: CommerceState,
  purchaseOrderId: string,
  proof: CommerceActionProof,
) {
  if (!validProof(proof)) return null
  const current = validateCommerceState(state)
  const purchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrderId)
  const invoice = purchaseOrder?.supplierInvoice
  if (!purchaseOrder || !invoice) return null
  if (invoice.payableReview) return sameActionProof(invoice.payableReview, proof) ? current : null
  if (actionIdIsUsed(current, proof.actionId)
    || commerceSupplierInvoiceMatch(current, purchaseOrder).status !== 'matched') return null
  const latestBasis = current.movements
    .filter((movement) => movement.kind === 'receipt' && movement.purchaseOrderId === purchaseOrderId)
    .reduce((latest, movement) => {
      const capturedAt = timestampMicros(movement.createdAt) as bigint
      return capturedAt > latest ? capturedAt : latest
    }, timestampMicros(invoice.recording.capturedAt) as bigint)
  if ((timestampMicros(proof.capturedAt) as bigint) < latestBasis) return null
  return validateCommerceState({
    ...current,
    purchaseOrders: commercePurchaseOrders(current).map((candidate) => candidate.id === purchaseOrderId
      ? { ...candidate, supplierInvoice: { ...invoice, payableReview: { ...proof } } }
      : candidate),
  })
}

export function authorizeCommerceSupplierReturn(
  state: CommerceState,
  purchaseOrderId: string,
  input: CommerceSupplierReturnClaimInput,
  proof: CommerceActionProof,
) {
  let internalReturnReference: string
  let receiptMovementId: string
  try {
    internalReturnReference = canonicalText(input.internalReturnReference, 'supplier return reference', 80)
    receiptMovementId = canonicalText(input.receiptMovementId, 'supplier return receipt movement ID', 2_000)
  } catch {
    return null
  }
  if (!validProof(proof) || !supplierReturnIdPattern.test(input.id)) return null
  const current = validateCommerceState(state)
  const purchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrderId)
  const receipt = current.movements.find((movement) => movement.id === receiptMovementId)
  if (!purchaseOrder || purchaseOrder.unitCostMmk === undefined || !receipt
    || receipt.kind !== 'receipt' || receipt.purchaseOrderId !== purchaseOrderId
    || !receipt.rejectedQuantity || !receipt.discrepancyCode || receipt.discrepancyDisposition !== 'return_to_vendor') return null
  const claimAmountMmk = receipt.rejectedQuantity * purchaseOrder.unitCostMmk
  if (!Number.isSafeInteger(claimAmountMmk)
    || (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(receipt.createdAt) as bigint)) return null
  const allClaims = commercePurchaseOrders(current).flatMap((order) => commerceSupplierReturnClaims(order).map((claim) => ({ order, claim })))
  const existing = allClaims.find(({ claim }) => claim.id === input.id || claim.authorization.actionId === proof.actionId)
  if (existing) return existing.order.id === purchaseOrderId
    && existing.claim.id === input.id
    && existing.claim.receiptMovementId === receiptMovementId
    && existing.claim.internalReturnReference === internalReturnReference
    && sameActionProof(existing.claim.authorization, proof) ? current : null
  if (actionIdIsUsed(current, proof.actionId)
    || commerceSupplierReturnClaims(purchaseOrder).length >= maxSupplierReturnsPerPurchaseOrder
    || allClaims.some(({ order, claim }) => claim.receiptMovementId === receiptMovementId
      || order.supplier === purchaseOrder.supplier && claim.internalReturnReference === internalReturnReference)) return null
  const claim: CommerceSupplierReturnClaim = {
    id: input.id,
    createdAt: proof.capturedAt,
    receiptMovementId,
    quantityRejected: receipt.rejectedQuantity,
    reasonCode: receipt.discrepancyCode,
    claimAmountMmk,
    internalReturnReference,
    physicalReturnStatus: 'not_dispatched',
    supplierContacted: false,
    accountingPosted: false,
    authorization: { ...proof },
    creditNotes: [],
  }
  return validateCommerceState({
    ...current,
    purchaseOrders: commercePurchaseOrders(current).map((candidate) => candidate.id === purchaseOrderId
      ? { ...candidate, supplierReturns: [claim, ...commerceSupplierReturnClaims(candidate)] }
      : candidate),
  })
}

export function recordCommerceSupplierCreditNote(
  state: CommerceState,
  purchaseOrderId: string,
  supplierReturnId: string,
  input: CommerceSupplierCreditNoteInput,
  proof: CommerceActionProof,
) {
  let supplierReference: string
  try {
    supplierReference = canonicalText(input.supplierReference, 'supplier credit reference', 80)
  } catch {
    return null
  }
  if (!validProof(proof) || !supplierReturnIdPattern.test(supplierReturnId)
    || !supplierCreditIdPattern.test(input.id) || !validTimestamp(input.issuedAt)
    || !Number.isSafeInteger(input.amountMmk) || input.amountMmk < 1
    || (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(input.issuedAt) as bigint)) return null
  const current = validateCommerceState(state)
  const purchaseOrder = commercePurchaseOrders(current).find((candidate) => candidate.id === purchaseOrderId)
  const claim = purchaseOrder?.supplierReturns?.find((candidate) => candidate.id === supplierReturnId)
  if (!purchaseOrder || !claim
    || (timestampMicros(input.issuedAt) as bigint) < (timestampMicros(claim.createdAt) as bigint)) return null
  const allCredits = commercePurchaseOrders(current).flatMap((order) => commerceSupplierReturnClaims(order)
    .flatMap((returnClaim) => returnClaim.creditNotes.map((credit) => ({ order, returnClaim, credit }))))
  const existing = allCredits.find(({ credit }) => credit.id === input.id || credit.recording.actionId === proof.actionId)
  if (existing) return existing.order.id === purchaseOrderId && existing.returnClaim.id === supplierReturnId
    && existing.credit.id === input.id && existing.credit.supplierReference === supplierReference
    && existing.credit.issuedAt === input.issuedAt && existing.credit.amountMmk === input.amountMmk
    && sameActionProof(existing.credit.recording, proof) ? current : null
  if (actionIdIsUsed(current, proof.actionId)
    || claim.creditNotes.length >= maxSupplierCreditsPerReturn
    || input.amountMmk > commerceSupplierReturnClaimBalance(claim)
    || allCredits.some(({ order, credit }) => credit.id === input.id
      || order.supplier === purchaseOrder.supplier && credit.supplierReference === supplierReference)) return null
  const credit: CommerceSupplierCreditNote = {
    ...input,
    supplierReference,
    accountingPosted: false,
    recording: { ...proof },
  }
  return validateCommerceState({
    ...current,
    purchaseOrders: commercePurchaseOrders(current).map((candidate) => candidate.id === purchaseOrderId
      ? { ...candidate, supplierReturns: commerceSupplierReturnClaims(candidate).map((returnClaim) => returnClaim.id === supplierReturnId
        ? { ...returnClaim, creditNotes: [credit, ...returnClaim.creditNotes] }
        : returnClaim) }
      : candidate),
  })
}

export function returnCommerceStockFromProduction(
  state: CommerceState,
  input: {
    sourceIssueActionId: string
    productionQuantityMilli: number
    stockQuantity: number
    stockUnitId: string
    locationId: string
    expectedInventoryHeadDigest: string
  },
  proof: CommerceActionProof,
) {
  if (!validProof(proof)
    || !Number.isSafeInteger(input.productionQuantityMilli)
    || input.productionQuantityMilli < 1
    || !Number.isSafeInteger(input.stockQuantity)
    || input.stockQuantity < 1) return null
  let sourceIssueActionId: string
  let stockUnitId: string
  let locationId: string
  try {
    sourceIssueActionId = canonicalText(input.sourceIssueActionId, 'production return source issue action ID', 160)
    stockUnitId = canonicalText(input.stockUnitId, 'production return stock unit ID', 80)
    locationId = canonicalText(input.locationId, 'production return location ID', 80)
    if (!sha256DigestPattern.test(input.expectedInventoryHeadDigest)) return null
  } catch {
    return null
  }
  const current = validateCommerceState(state)
  const sourceIssues = current.movements.filter((movement) => movement.kind === 'production_issue'
    && movement.actionId === sourceIssueActionId)
  if (sourceIssues.length !== 1) return null
  const issue = sourceIssues[0]
  const matchingMovement = (movement: CommerceStockMovement) => movement.kind === 'production_return'
    && movement.sku === issue.sku
    && movement.quantityDelta === input.stockQuantity
    && movement.productionRequestId === issue.productionRequestId
    && movement.productionCommandDigest === issue.productionCommandDigest
    && movement.productionJobId === issue.productionJobId
    && movement.productionMaterialId === issue.productionMaterialId
    && movement.productionInputLotId === issue.productionInputLotId
    && movement.productionQuantityMilli === issue.productionQuantityMilli
    && movement.productionUnit === issue.productionUnit
    && movement.conversionNote === issue.conversionNote
    && movement.productionIssueActionId === sourceIssueActionId
    && movement.productionReturnedQuantityMilli === input.productionQuantityMilli
    && movement.productionReturnStockUnitId === stockUnitId
    && movement.productionReturnLocationId === locationId
  const replayMovement = current.movements.find((movement) => movement.actionId === proof.actionId)
  if (replayMovement) return matchingMovement(replayMovement)
    && sameProof(replayMovement, proof)
    && current.inventoryFoundation
    && shopInventoryProductionReturnActionMatches(
      current.inventoryFoundation,
      sourceIssueActionId,
      input.productionQuantityMilli,
      input.stockQuantity,
      stockUnitId,
      locationId,
      proof,
      current.items.map((item) => item.sku).sort(),
    ) ? current : null
  if (actionIdIsUsed(current, proof.actionId)
    || !current.inventoryFoundation
    || current.inventoryFoundation.headDigest !== input.expectedInventoryHeadDigest
    || (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(issue.createdAt) as bigint)) return null
  const item = current.items.find((candidate) => candidate.sku === issue.sku)
  if (!item) return null
  const nextBalance = safeBalance(item.onHand, input.stockQuantity)
  if (nextBalance === null) return null
  let inventoryFoundation = current.inventoryFoundation
  try {
    if (!shopInventoryMatchesItems(inventoryFoundation, current.items)) return null
    const sourceCommand = inventoryFoundation.commands.find((command) => command.payload.kind === 'production_issue'
      && command.payload.proof.actionId === sourceIssueActionId)?.payload
    if (!sourceCommand || sourceCommand.kind !== 'production_issue') return null
    const locationResult = returnShopInventoryFromProduction(inventoryFoundation, {
      productionIssueId: sourceCommand.id,
      productionQuantityMilli: input.productionQuantityMilli,
      stockQuantity: input.stockQuantity,
      stockUnitId,
      locationId,
      proof,
      catalogSkus: current.items.map((candidate) => candidate.sku).sort(),
      expectedHeadDigest: input.expectedInventoryHeadDigest,
    })
    if (locationResult.replayed) return null
    inventoryFoundation = locationResult.state
  } catch {
    return null
  }
  const movement = movementFor(proof, {
    kind: 'production_return',
    sku: issue.sku,
    quantityDelta: input.stockQuantity,
    productionRequestId: issue.productionRequestId,
    productionCommandDigest: issue.productionCommandDigest,
    productionJobId: issue.productionJobId,
    productionMaterialId: issue.productionMaterialId,
    productionInputLotId: issue.productionInputLotId,
    productionQuantityMilli: issue.productionQuantityMilli,
    productionUnit: issue.productionUnit,
    conversionNote: issue.conversionNote,
    productionIssueActionId: sourceIssueActionId,
    productionReturnedQuantityMilli: input.productionQuantityMilli,
    productionReturnStockUnitId: stockUnitId,
    productionReturnLocationId: locationId,
  })
  return validateCommerceState({
    ...current,
    items: current.items.map((candidate) => candidate.sku === issue.sku ? { ...candidate, onHand: nextBalance } : candidate),
    movements: [movement, ...current.movements],
    inventoryFoundation,
  })
}

export function receiveCommerceProductionBatch(
  state: CommerceState,
  receipt: CommerceProductionBatchReceipt,
  proof: CommerceActionProof,
  locationReceipt?: { locationId: string; expectedHeadDigest: string },
) {
  if (!validProof(proof)) return null
  let checkedReceipt: CommerceProductionBatchReceipt
  try {
    checkedReceipt = {
      releaseId: canonicalText(receipt.releaseId, 'production release ID', 80),
      sourceCommandDigest: receipt.sourceCommandDigest,
      jobId: canonicalText(receipt.jobId, 'production job ID', 80),
      outputBatchId: canonicalText(receipt.outputBatchId, 'production output batch ID', 80),
      releasedAt: canonicalText(receipt.releasedAt, 'production release time', 40),
      sourceProduct: canonicalText(receipt.sourceProduct, 'production source product', 180),
      sku: canonicalText(receipt.sku, 'production receipt SKU', 80),
      quantity: receipt.quantity,
    }
    if (!/^QREL-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(checkedReceipt.releaseId)
      || !/^BATCH-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(checkedReceipt.outputBatchId)
      || !sha256DigestPattern.test(checkedReceipt.sourceCommandDigest)
      || !validTimestamp(checkedReceipt.releasedAt)
      || !Number.isSafeInteger(checkedReceipt.quantity)
      || checkedReceipt.quantity < 1
      || (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(checkedReceipt.releasedAt) as bigint)) return null
  } catch {
    return null
  }
  const locationId = locationReceipt?.locationId ?? 'LOC-MAIN'
  if (!/^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(locationId)
    || proof.evidenceReference !== `PLANT-BATCH:${checkedReceipt.releaseId}:${checkedReceipt.sourceCommandDigest}:${locationId}`) return null
  const current = validateCommerceState(state)
  const movementMatches = (movement: CommerceStockMovement) => movement.kind === 'production_receipt'
    && movement.sku === checkedReceipt.sku
    && movement.quantityDelta === checkedReceipt.quantity
    && movement.productionReleaseId === checkedReceipt.releaseId
    && movement.productionCommandDigest === checkedReceipt.sourceCommandDigest
    && movement.productionJobId === checkedReceipt.jobId
    && movement.productionOutputBatchId === checkedReceipt.outputBatchId
    && movement.productionReleasedAt === checkedReceipt.releasedAt
    && movement.productionSourceProduct === checkedReceipt.sourceProduct
  const replayMovement = current.movements.find((movement) => movement.actionId === proof.actionId)
  if (replayMovement) {
    if (!movementMatches(replayMovement) || !sameProof(replayMovement, proof)) return null
    if (!current.inventoryFoundation) return locationReceipt ? null : current
    if (!locationReceipt) return null
    try {
      const replay = receiveShopInventoryFromProduction(current.inventoryFoundation, {
        receipt: checkedReceipt,
        locationId,
        proof,
        catalogSkus: current.items.map((item) => item.sku).sort(),
        expectedHeadDigest: current.inventoryFoundation.headDigest,
      })
      return replay.replayed && shopInventoryMatchesItems(replay.state, current.items) ? current : null
    } catch {
      return null
    }
  }
  if (actionIdIsUsed(current, proof.actionId)
    || current.movements.some((movement) => movement.productionReleaseId === checkedReceipt.releaseId)) return null
  const matchingItems = current.items.filter((candidate) => candidate.sku === checkedReceipt.sku)
  const item = matchingItems.length === 1 ? matchingItems[0] : undefined
  if (!item) return null
  const sourceProductKey = checkedReceipt.sourceProduct.toLocaleLowerCase()
  const retainedMapping = current.movements.find((movement) => movement.kind === 'production_receipt'
    && movement.productionSourceProduct?.toLocaleLowerCase() === sourceProductKey)
  if (retainedMapping && retainedMapping.sku !== checkedReceipt.sku) return null
  const nextBalance = safeBalance(item.onHand, checkedReceipt.quantity)
  if (nextBalance === null) return null
  const nextItems = current.items.map((candidate) => candidate.sku === checkedReceipt.sku ? { ...candidate, onHand: nextBalance } : candidate)
  let inventoryFoundation = current.inventoryFoundation
  if (inventoryFoundation) {
    if (!locationReceipt || !shopInventoryMatchesItems(inventoryFoundation, current.items)) return null
    try {
      const locationResult = receiveShopInventoryFromProduction(inventoryFoundation, {
        receipt: checkedReceipt,
        locationId,
        proof,
        catalogSkus: current.items.map((candidate) => candidate.sku).sort(),
        expectedHeadDigest: locationReceipt.expectedHeadDigest,
      })
      if (locationResult.replayed || !shopInventoryMatchesItems(locationResult.state, nextItems)) return null
      inventoryFoundation = locationResult.state
    } catch {
      return null
    }
  } else if (locationReceipt) return null
  const movement = movementFor(proof, {
    kind: 'production_receipt',
    sku: checkedReceipt.sku,
    quantityDelta: checkedReceipt.quantity,
    productionReleaseId: checkedReceipt.releaseId,
    productionCommandDigest: checkedReceipt.sourceCommandDigest,
    productionJobId: checkedReceipt.jobId,
    productionOutputBatchId: checkedReceipt.outputBatchId,
    productionReleasedAt: checkedReceipt.releasedAt,
    productionSourceProduct: checkedReceipt.sourceProduct,
  })
  return validateCommerceState({
    ...current,
    items: nextItems,
    movements: [movement, ...current.movements],
    ...(inventoryFoundation ? { inventoryFoundation } : {}),
  })
}

export function countCommerceStock(
  state: CommerceState,
  sku: string,
  countedQuantity: number,
  proof: CommerceActionProof,
  locationCount?: CommerceStockLocationCount,
) {
  if (!validProof(proof) || !Number.isSafeInteger(countedQuantity) || countedQuantity < 0) return null
  const current = validateCommerceState(state)
  const replayMovement = current.movements.find((movement) => movement.actionId === proof.actionId)
  if (replayMovement) {
    const movementMatches = replayMovement.kind === 'count'
      && replayMovement.sku === sku
      && replayMovement.countedQuantity === countedQuantity
      && replayMovement.quantityDelta === countedQuantity - Number(replayMovement.expectedQuantity)
      && sameProof(replayMovement, proof)
    if (!movementMatches) return null
    if (!current.inventoryFoundation) return locationCount ? null : current
    if (!locationCount) return null
    try {
      const locationReplay = countShopInventory(current.inventoryFoundation, {
        ...locationCount,
        proof,
        catalogSkus: current.items.map((item) => item.sku).sort(),
      })
      return locationReplay.replayed && shopInventoryMatchesItems(locationReplay.state, current.items) ? current : null
    } catch {
      return null
    }
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const matchingItems = current.items.filter((candidate) => candidate.sku === sku)
  const item = matchingItems.length === 1 ? matchingItems[0] : undefined
  if (!item) return null
  const quantityDelta = countedQuantity - item.onHand
  if (!Number.isSafeInteger(quantityDelta)) return null
  let inventoryFoundation = current.inventoryFoundation
  if (inventoryFoundation) {
    if (!locationCount || !shopInventoryMatchesItems(inventoryFoundation, current.items)) return null
    try {
      const locationResult = countShopInventory(inventoryFoundation, {
        ...locationCount,
        proof,
        catalogSkus: current.items.map((candidate) => candidate.sku).sort(),
      })
      if (locationResult.replayed) return null
      const nextItems = current.items.map((candidate) => candidate.sku === sku ? { ...candidate, onHand: countedQuantity } : candidate)
      if (!shopInventoryMatchesItems(locationResult.state, nextItems)) return null
      inventoryFoundation = locationResult.state
    } catch {
      return null
    }
  } else if (locationCount) return null
  const movement = movementFor(proof, {
    kind: 'count',
    sku,
    quantityDelta,
    expectedQuantity: item.onHand,
    countedQuantity,
  })
  const nextState: CommerceState = {
    ...current,
    items: current.items.map((candidate) => candidate.sku === sku ? { ...candidate, onHand: countedQuantity } : candidate),
    movements: [movement, ...current.movements],
  }
  if (inventoryFoundation) nextState.inventoryFoundation = inventoryFoundation
  return validateCommerceState(nextState)
}

export function commerceOrderHasReleasableReservation(state: CommerceState, orderId: string) {
  const order = state.orders.find((candidate) => candidate.id === orderId)
  if (!order || order.status === 'completed' || order.status === 'cancelled') return false
  const lines = reservationLinesForOrder(order)
  if (!lines.length) return false
  const reserves = state.movements.filter((movement) => movement.kind === 'reserve' && movement.orderId === orderId)
  const releases = state.movements.filter((movement) => movement.kind === 'release' && movement.orderId === orderId)
  const aggregateReady = reserves.length === lines.length
    && releases.length === 0
    && lines.every((line) => reserves.filter((movement) => movement.sku === line.sku && movement.quantityDelta === -line.quantity).length === 1)
  if (!aggregateReady || !state.inventoryFoundation) return aggregateReady
  try {
    const projection = projectShopInventory(
      state.inventoryFoundation,
      state.items.map((item) => item.sku).sort(),
    )
    const locationReservations = projection.reservations.filter((reservation) => reservation.orderId === orderId && reservation.status === 'active')
    const unitById = new Map(projection.stockUnits.map((unit) => [unit.id, unit]))
    const locationTotals = new Map<string, number>()
    locationReservations.forEach((reservation) => {
      const unit = unitById.get(reservation.stockUnitId)
      if (unit) locationTotals.set(unit.sku, (locationTotals.get(unit.sku) ?? 0) + reservation.quantity)
    })
    return lines.every((line) => locationTotals.get(line.sku) === line.quantity)
      && locationReservations.length > 0
  } catch {
    return false
  }
}

export function cancelCommerceOrder(state: CommerceState, orderId: string, proof: CommerceActionProof) {
  if (!validProof(proof)) return null
  const proofMovements = state.movements.filter((movement) => movement.actionId === proof.actionId)
  if (proofMovements.length) {
    const order = state.orders.find((candidate) => candidate.id === orderId)
    const lines = order ? reservationLinesForOrder(order) : []
    return order?.status === 'cancelled'
      && proofMovements.length === lines.length
      && lines.every((line) => proofMovements.some((movement) => movement.kind === 'release'
        && movement.orderId === orderId
        && movement.sku === line.sku
        && movement.quantityDelta === line.quantity
        && sameProof(movement, proof)))
      && (!state.inventoryFoundation || shopInventoryOrderActionMatches(
        state.inventoryFoundation,
        'order_release',
        orderId,
        proof,
        state.items.map((item) => item.sku).sort(),
      )) ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId) || !commerceOrderHasReleasableReservation(state, orderId)) return null
  const order = state.orders.find((candidate) => candidate.id === orderId)
  if (!order) return null
  const lines = reservationLinesForOrder(order)
  const nextBalances = new Map<string, number>()
  for (const line of lines) {
    const matchingItems = state.items.filter((candidate) => candidate.sku === line.sku)
    const item = matchingItems.length === 1 ? matchingItems[0] : undefined
    if (!item) return null
    const nextBalance = safeBalance(item.onHand, line.quantity)
    if (nextBalance === null) return null
    nextBalances.set(item.sku, nextBalance)
  }
  const movements = lines.map((line, index) => movementFor(
    proof,
    { kind: 'release', sku: line.sku, quantityDelta: line.quantity, orderId },
    lines.length > 1 ? `L${index + 1}` : undefined,
  ))
  const nextItems = state.items.map((candidate) => nextBalances.has(candidate.sku) ? { ...candidate, onHand: nextBalances.get(candidate.sku) as number } : candidate)
  let inventoryFoundation = state.inventoryFoundation
  if (inventoryFoundation) {
    try {
      const catalogSkus = state.items.map((candidate) => candidate.sku).sort()
      if (!shopInventoryMatchesItems(inventoryFoundation, state.items)) return null
      const locationResult = releaseShopInventoryOrder(inventoryFoundation, {
        orderId,
        proof,
        catalogSkus,
        expectedHeadDigest: inventoryFoundation.headDigest,
      })
      if (locationResult.replayed || !shopInventoryMatchesItems(locationResult.state, nextItems)) return null
      inventoryFoundation = locationResult.state
    } catch {
      return null
    }
  }
  return validateCommerceState({
    ...state,
    items: nextItems,
    orders: state.orders.map((candidate) => candidate.id === orderId ? {
      ...candidate,
      status: 'cancelled' as const,
      refundStatus: candidate.paymentStatus === 'reconciled' ? 'due' as const : 'none' as const,
    } : candidate),
    movements: [...movements, ...state.movements],
    ...(inventoryFoundation ? { inventoryFoundation } : {}),
  })
}

export function reconcileCommercePayment(state: CommerceState, orderId: string, proof: CommerceActionProof) {
  if (!validProof(proof)) return null
  const order = state.orders.find((candidate) => candidate.id === orderId)
  if (!order || order.status === 'cancelled') return null
  if (order.paymentStatus === 'reconciled') {
    return order.paymentReconciliationActionId === proof.actionId
      && order.paymentReconciledAt === proof.capturedAt
      && order.paymentReconciledBy === proof.actor
      && order.paymentReconciliationReason === proof.reason
      && order.paymentEvidenceReference === proof.evidenceReference ? state : null
  }
  if (actionIdIsUsed(state, proof.actionId)) return null
  // The record keeps payment at or before handover (validateCommerceState enforces
  // completion.capturedAt >= paymentReconciledAt), so a proof stamped after this order was
  // completed cannot be written without breaking the chronology. Refuse it here instead of
  // letting validateCommerceState throw out of a transition: returning null is what every other
  // refusal in this module does, and it is what the callers are written to handle.
  if (order.completion
    && (timestampMicros(proof.capturedAt) as bigint) > (timestampMicros(order.completion.capturedAt) as bigint)) return null
  return validateCommerceState({
    ...state,
    orders: state.orders.map((candidate) => candidate.id === orderId ? {
      ...candidate,
      paymentStatus: 'reconciled' as const,
      paymentReconciledAt: proof.capturedAt,
      paymentReconciliationActionId: proof.actionId,
      paymentReconciledBy: proof.actor,
      paymentReconciliationReason: proof.reason,
      paymentEvidenceReference: proof.evidenceReference,
    } : candidate),
  })
}

export function recordCommerceCollectionAction(state: CommerceState, orderId: string, proof: CommerceActionProof) {
  if (!validProof(proof)) return null
  const order = state.orders.find((candidate) => candidate.id === orderId)
  const replay = order?.collectionActions?.find((record) => record.proof.actionId === proof.actionId)
  if (replay) return sameActionProof(replay.proof, proof) ? state : null
  const capturedAt = timestampMicros(proof.capturedAt)
  const createdAt = order ? timestampMicros(order.createdAt) : null
  if (!order
    || order.status === 'cancelled'
    || order.paymentStatus !== 'pending'
    || actionIdIsUsed(state, proof.actionId)
    || (order.collectionActions?.length ?? 0) >= maxCollectionActionsPerOrder
    || capturedAt === null
    || createdAt === null
    || capturedAt < createdAt) return null
  return validateCommerceState({
    ...state,
    orders: state.orders.map((candidate) => candidate.id === orderId ? {
      ...candidate,
      collectionActions: [{ kind: 'customer_contact' as const, proof: { ...proof } }, ...(candidate.collectionActions ?? [])],
    } : candidate),
  })
}

export function settleCommerceRefund(state: CommerceState, orderId: string, proof: CommerceActionProof) {
  if (!validProof(proof)) return null
  const order = state.orders.find((candidate) => candidate.id === orderId)
  if (!order) return null
  if (order.refundStatus === 'settled') {
    return order.status === 'cancelled'
      && order.paymentStatus === 'reconciled'
      && order.refundSettlementActionId === proof.actionId
      && order.refundSettledAt === proof.capturedAt
      && order.refundSettledBy === proof.actor
      && order.refundSettlementReason === proof.reason
      && order.refundEvidenceReference === proof.evidenceReference ? state : null
  }
  if (order.refundStatus !== 'due'
    || order.status !== 'cancelled'
    || order.paymentStatus !== 'reconciled'
    || actionIdIsUsed(state, proof.actionId)) return null
  return validateCommerceState({
    ...state,
    orders: state.orders.map((candidate) => candidate.id === orderId ? {
      ...candidate,
      refundStatus: 'settled' as const,
      refundSettledAt: proof.capturedAt,
      refundSettlementActionId: proof.actionId,
      refundSettledBy: proof.actor,
      refundSettlementReason: proof.reason,
      refundEvidenceReference: proof.evidenceReference,
    } : candidate),
  })
}

function sameOrderReturnExpectation(
  left: CommerceOrderReturnExpectation,
  right: CommerceOrderReturnExpectation,
) {
  return left.orderId === right.orderId
    && left.sku === right.sku
    && left.soldQuantity === right.soldQuantity
    && left.returnedQuantity === right.returnedQuantity
    && left.stockOnHand === right.stockOnHand
    && left.inventoryHeadDigest === right.inventoryHeadDigest
    && JSON.stringify(left.locationAllocations) === JSON.stringify(right.locationAllocations)
    && left.orderSnapshot === right.orderSnapshot
}

export function commerceOrderReturnExpectation(
  state: CommerceState,
  orderId: string,
  sku: string,
  disposition: CommerceReturnDisposition,
  quantityToReturn?: number,
): CommerceOrderReturnExpectation | null {
  if (!returnDispositions.includes(disposition)) return null
  const current = validateCommerceState(state)
  const matchingOrders = current.orders.filter((order) => order.id === orderId)
  const order = matchingOrders.length === 1 ? matchingOrders[0] : undefined
  if (!order || order.status !== 'completed' || !order.completion) return null
  const matchingLines = reservationLinesForOrder(order).filter((line) => line.sku === sku)
  if (matchingLines.length !== 1) return null
  const lines = reservationLinesForOrder(order)
  const reserves = current.movements.filter((movement) => movement.kind === 'reserve' && movement.orderId === orderId)
  const releases = current.movements.filter((movement) => movement.kind === 'release' && movement.orderId === orderId)
  if (reserves.length !== lines.length
    || releases.length
    || lines.some((line) => reserves.filter((movement) => (
      movement.sku === line.sku && movement.quantityDelta === -line.quantity
    )).length !== 1)) return null
  const returnedQuantity = (order.returns ?? [])
    .filter((record) => record.sku === sku)
    .reduce((sum, record) => sum + record.quantity, 0)
  if (!Number.isSafeInteger(returnedQuantity) || returnedQuantity >= matchingLines[0].quantity) return null
  const item = current.items.find((candidate) => candidate.sku === sku)
  if (!item) return null
  let inventoryHeadDigest: string | null = null
  let locationAllocations: ShopInventoryOrderReturnAllocation[] | null = null
  if (current.inventoryFoundation && disposition === 'restock') {
    if (!Number.isSafeInteger(quantityToReturn) || Number(quantityToReturn) < 1) return null
    try {
      inventoryHeadDigest = current.inventoryFoundation.headDigest
      locationAllocations = planShopInventoryOrderReturn(current.inventoryFoundation, {
        orderId,
        sku,
        quantity: quantityToReturn,
        catalogSkus: current.items.map((candidate) => candidate.sku).sort(),
      })
    } catch {
      return null
    }
  }
  return {
    orderId,
    sku,
    soldQuantity: matchingLines[0].quantity,
    returnedQuantity,
    stockOnHand: disposition === 'restock' ? item.onHand : null,
    inventoryHeadDigest,
    locationAllocations,
    orderSnapshot: JSON.stringify(order),
  }
}

export function recordCommerceOrderReturn(
  state: CommerceState,
  input: CommerceOrderReturnInput,
  proof: CommerceActionProof,
  expected: CommerceOrderReturnExpectation,
) {
  if (!validProof(proof)
    || typeof input.orderId !== 'string'
    || !input.orderId
    || input.orderId !== input.orderId.trim()
    || input.orderId.length > 160
    || typeof input.sku !== 'string'
    || !input.sku
    || input.sku !== input.sku.trim()
    || input.sku.length > 80
    || !Number.isSafeInteger(input.quantity)
    || input.quantity < 1
    || !returnDispositions.includes(input.disposition)
    || [proof.actionId, proof.actor, proof.reason, proof.evidenceReference].some((value) => value !== value.trim())) return null
  const current = validateCommerceState(state)
  const replayRecords = current.orders.flatMap((order) => (
    (order.returns ?? [])
      .filter((record) => record.actionId === proof.actionId)
      .map((record) => ({ order, record }))
  ))
  if (replayRecords.length) {
    if (replayRecords.length !== 1) return null
    const { order, record } = replayRecords[0]
    const replayMovements = current.movements.filter((movement) => movement.actionId === proof.actionId)
    const aggregateMatches = order.id === input.orderId
      && record.sku === input.sku
      && record.quantity === input.quantity
      && record.disposition === input.disposition
      && sameReturnProof(record, proof)
      && (record.disposition === 'restock'
        ? replayMovements.length === 1 && movementMatchesReturn(replayMovements[0], record, order.id)
        : replayMovements.length === 0)
    if (!aggregateMatches) return null
    if (!current.inventoryFoundation) return current
    if (record.disposition !== 'restock') {
      return current.inventoryFoundation.commands.some((command) => command.payload.proof.actionId === proof.actionId)
        ? null
        : current
    }
    try {
      const locationReplay = returnShopInventoryOrder(current.inventoryFoundation, {
        orderId: input.orderId,
        sku: input.sku,
        quantity: input.quantity,
        proof,
        catalogSkus: current.items.map((item) => item.sku).sort(),
        expectedHeadDigest: current.inventoryFoundation.headDigest,
      })
      return locationReplay.replayed && shopInventoryMatchesItems(locationReplay.state, current.items) ? current : null
    } catch {
      return null
    }
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const actual = commerceOrderReturnExpectation(current, input.orderId, input.sku, input.disposition, input.quantity)
  if (!actual || !expected || !sameOrderReturnExpectation(actual, expected)) return null
  const remaining = actual.soldQuantity - actual.returnedQuantity
  if (input.quantity > remaining) return null
  const order = current.orders.find((candidate) => candidate.id === input.orderId)
  const item = current.items.find((candidate) => candidate.sku === input.sku)
  if (!order || !item || !order.completion) return null
  const latestBasis = [
    order.createdAt,
    order.paymentReconciledAt,
    order.completion.capturedAt,
    ...current.movements.filter((movement) => movement.orderId === order.id).map((movement) => movement.createdAt),
    ...(order.returns ?? []).map((record) => record.createdAt),
  ].flatMap((timestamp) => timestamp ? [timestampMicros(timestamp) as bigint] : [])
    .reduce((latest, timestamp) => timestamp > latest ? timestamp : latest, 0n)
  if ((timestampMicros(proof.capturedAt) as bigint) < latestBasis) return null
  const record: CommerceOrderReturn = {
    actionId: proof.actionId,
    createdAt: proof.capturedAt,
    actor: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
    sku: input.sku,
    quantity: input.quantity,
    disposition: input.disposition,
  }
  const nextBalance = input.disposition === 'restock'
    ? safeBalance(item.onHand, input.quantity)
    : item.onHand
  if (nextBalance === null) return null
  const nextItems = input.disposition === 'restock'
    ? current.items.map((candidate) => candidate.sku === input.sku ? { ...candidate, onHand: nextBalance } : candidate)
    : current.items
  let inventoryFoundation = current.inventoryFoundation
  if (inventoryFoundation && input.disposition === 'restock') {
    if (expected.inventoryHeadDigest !== inventoryFoundation.headDigest || !expected.locationAllocations) return null
    try {
      const locationResult = returnShopInventoryOrder(inventoryFoundation, {
        orderId: input.orderId,
        sku: input.sku,
        quantity: input.quantity,
        proof,
        catalogSkus: current.items.map((candidate) => candidate.sku).sort(),
        expectedHeadDigest: expected.inventoryHeadDigest,
      })
      const locationCommand = locationResult.state.commands.at(-1)?.payload
      if (locationResult.replayed
        || locationCommand?.kind !== 'order_return'
        || JSON.stringify(locationCommand.allocations) !== JSON.stringify(expected.locationAllocations)
        || !shopInventoryMatchesItems(locationResult.state, nextItems)) return null
      inventoryFoundation = locationResult.state
    } catch {
      return null
    }
  } else if (expected.inventoryHeadDigest !== null || expected.locationAllocations !== null) return null
  const movement = input.disposition === 'restock'
    ? movementFor(proof, {
        kind: 'return',
        sku: input.sku,
        quantityDelta: input.quantity,
        orderId: input.orderId,
      })
    : null
  return validateCommerceState({
    ...current,
    items: nextItems,
    orders: current.orders.map((candidate) => candidate.id === input.orderId
      ? { ...candidate, returns: [record, ...(candidate.returns ?? [])] }
      : candidate),
    movements: movement ? [movement, ...current.movements] : current.movements,
    ...(inventoryFoundation ? { inventoryFoundation } : {}),
  })
}

function sameSupportOpenExpectation(
  left: CommerceOrderSupportOpenExpectation,
  right: CommerceOrderSupportOpenExpectation,
) {
  return left.orderId === right.orderId
    && left.supportCaseCount === right.supportCaseCount
    && left.orderSnapshot === right.orderSnapshot
}

export function commerceOrderSupportOpenExpectation(
  state: CommerceState,
  orderId: string,
  sourceIntentId: string,
): CommerceOrderSupportOpenExpectation | null {
  const current = validateCommerceState(state)
  const order = current.orders.find((candidate) => candidate.id === orderId)
  if (!order
    || order.status !== 'completed'
    || !order.completion
    || !order.sourceRecordId
    || !storefrontRequestIdPattern.test(order.sourceRecordId)
    || !supportIntentIdPattern.test(sourceIntentId)
    || order.supportCases?.some((entry) => entry.sourceIntentId === sourceIntentId)) return null
  return {
    orderId,
    supportCaseCount: order.supportCases?.length ?? 0,
    orderSnapshot: JSON.stringify(order),
  }
}

export function commerceSupportCaseUrgency(
  supportCase: CommerceOrderSupportCase,
  now: number,
): CommerceSupportUrgency {
  if (supportCase.status === 'resolved') return 'resolved'
  const service = commerceSupportServiceState(supportCase)
  if (!service || !Number.isFinite(now)) return 'untriaged'
  const dueTime = Date.parse(service.dueAt)
  if (!Number.isFinite(dueTime)) return 'untriaged'
  if (dueTime <= now) return 'overdue'
  return dueTime - now <= 60 * 60 * 1000 ? 'due_soon' : 'scheduled'
}

export type CommerceSupportServiceState = {
  owner: string
  priority: CommerceSupportPriority
  dueAt: string
}

export type CommerceSupportQueueRow = {
  orderId: string
  customer: string
  supportCase: CommerceOrderSupportCase
  service: CommerceSupportServiceState | null
  checkpoints: CommerceSupportCheckpointState
  urgency: CommerceSupportUrgency
}

export type CommerceSupportCheckpointState = {
  acknowledged: CommerceOrderSupportServiceEvent | null
  firstResponseReady: CommerceOrderSupportServiceEvent | null
}

export type CommerceSupportSlaSummary = {
  openCases: number
  overdueCases: number
  awaitingAcknowledgement: number
  awaitingFirstResponse: number
  firstResponseReady: number
  responseTargetMisses: number
}

export type CommerceSupportAgeBucket = 'under_4h' | '4_24h' | '1_3d' | 'over_3d'

export type CommerceSupportWorkloadOwner = {
  owner: string
  openCases: number
  overdueCases: number
}

export type CommerceSupportWorkloadRow = {
  orderId: string
  caseId: string
  category: CommerceSupportCategory
  status: CommerceOrderSupportCase['status']
  cycle: 'initial' | 'follow_up'
  repeatContact: boolean
  linkedResolutionActionId: string | null
  priority: CommerceSupportPriority | null
  owner: string | null
  dueAt: string | null
  urgency: CommerceSupportUrgency
  customerRequestedAt: string
  cycleOpenedAt: string
  acknowledgedAt: string | null
  firstResponseReadyAt: string | null
  resolvedAt: string | null
  caseAgeMinutes: number
  cycleAgeMinutes: number
  ageBucket: CommerceSupportAgeBucket
  responseTargetMissed: boolean
  serviceEventCount: number
  reassignmentCount: number
  escalationCount: number
  initialResolutionOutcome: CommerceSupportResolutionOutcome | null
  followUpResolutionOutcome: CommerceSupportResolutionOutcome | null
}

export type CommerceSupportWorkloadExport = {
  schema: typeof COMMERCE_SUPPORT_WORKLOAD_EXPORT_SCHEMA
  asOf: string
  digest: string
  controls: {
    customerDataIncluded: false
    freeTextIncluded: false
    externalActionsPerformed: false
  }
  summary: {
    totalCases: number
    openCases: number
    resolvedCases: number
    reopenedCases: number
    overdueCases: number
    responseTargetMisses: number
    ageBuckets: Record<CommerceSupportAgeBucket, number>
    ownerWorkload: CommerceSupportWorkloadOwner[]
  }
  rows: CommerceSupportWorkloadRow[]
}

export function commerceSupportServiceState(
  supportCase: CommerceOrderSupportCase,
): CommerceSupportServiceState | null {
  const latest = supportCase.reopen ? supportCase.followUpServiceEvents?.[0] : supportCase.serviceEvents?.[0]
  if (latest) return { owner: latest.owner, priority: latest.priority, dueAt: latest.dueAt }
  if (supportCase.reopen) return { owner: supportCase.reopen.owner, priority: supportCase.reopen.priority, dueAt: supportCase.reopen.dueAt }
  return supportCase.owner && supportCase.priority && supportCase.dueAt
    ? { owner: supportCase.owner, priority: supportCase.priority, dueAt: supportCase.dueAt }
    : null
}

export function commerceSupportCheckpointState(
  supportCase: CommerceOrderSupportCase,
): CommerceSupportCheckpointState {
  const chronological = [...(supportCase.reopen ? supportCase.followUpServiceEvents ?? [] : supportCase.serviceEvents ?? [])].reverse()
  return {
    acknowledged: chronological.find((event) => event.kind === 'acknowledged') ?? null,
    firstResponseReady: chronological.find((event) => event.kind === 'first_response_ready') ?? null,
  }
}

export function commerceSupportQueue(
  orders: CommerceOrder[],
  now: number,
): CommerceSupportQueueRow[] {
  const urgencyRank: Record<CommerceSupportUrgency, number> = {
    overdue: 0,
    due_soon: 1,
    scheduled: 2,
    untriaged: 3,
    resolved: 4,
  }
  return orders.flatMap((order) => (order.supportCases ?? [])
    .filter((supportCase) => supportCase.status === 'open')
    .map((supportCase) => ({
      orderId: order.id,
      customer: order.customer,
      supportCase,
      service: commerceSupportServiceState(supportCase),
      checkpoints: commerceSupportCheckpointState(supportCase),
      urgency: commerceSupportCaseUrgency(supportCase, now),
    })))
    .sort((left, right) => urgencyRank[left.urgency] - urgencyRank[right.urgency]
      || supportPriorities.indexOf(left.service?.priority ?? 'low') - supportPriorities.indexOf(right.service?.priority ?? 'low')
      || (left.service?.dueAt ?? '9999').localeCompare(right.service?.dueAt ?? '9999')
      || left.supportCase.customerRequestedAt.localeCompare(right.supportCase.customerRequestedAt)
      || left.supportCase.caseId.localeCompare(right.supportCase.caseId))
}

export function commerceSupportSlaSummary(
  orders: CommerceOrder[],
  now: number,
): CommerceSupportSlaSummary {
  const queue = commerceSupportQueue(orders, now)
  return queue.reduce<CommerceSupportSlaSummary>((summary, row) => {
    const acknowledged = row.checkpoints.acknowledged
    const firstResponseReady = row.checkpoints.firstResponseReady
    const targetMissed = firstResponseReady
      ? Date.parse(firstResponseReady.proof.capturedAt) > Date.parse(firstResponseReady.dueAt)
      : row.service !== null && Date.parse(row.service.dueAt) <= now
    return {
      openCases: summary.openCases + 1,
      overdueCases: summary.overdueCases + (row.urgency === 'overdue' ? 1 : 0),
      awaitingAcknowledgement: summary.awaitingAcknowledgement + (acknowledged ? 0 : 1),
      awaitingFirstResponse: summary.awaitingFirstResponse + (acknowledged && !firstResponseReady ? 1 : 0),
      firstResponseReady: summary.firstResponseReady + (firstResponseReady ? 1 : 0),
      responseTargetMisses: summary.responseTargetMisses + (targetMissed ? 1 : 0),
    }
  }, {
    openCases: 0,
    overdueCases: 0,
    awaitingAcknowledgement: 0,
    awaitingFirstResponse: 0,
    firstResponseReady: 0,
    responseTargetMisses: 0,
  })
}

function commerceSupportAgeBucket(ageMinutes: number): CommerceSupportAgeBucket {
  if (ageMinutes < 4 * 60) return 'under_4h'
  if (ageMinutes < 24 * 60) return '4_24h'
  if (ageMinutes < 3 * 24 * 60) return '1_3d'
  return 'over_3d'
}

function commerceSupportWorkloadDigest(artifact: Omit<CommerceSupportWorkloadExport, 'digest'>) {
  return `sha256:${sha256Hex(JSON.stringify(artifact))}`
}

export function commerceSupportWorkloadExport(
  state: CommerceState,
  asOf: string,
): CommerceSupportWorkloadExport {
  const current = validateCommerceState(state)
  const asOfMs = Date.parse(asOf)
  if (!Number.isFinite(asOfMs) || new Date(asOfMs).toISOString() !== asOf) {
    throw new Error('Support workload as-of time must be one exact UTC timestamp.')
  }
  const urgencyRank: Record<CommerceSupportUrgency, number> = {
    overdue: 0,
    due_soon: 1,
    scheduled: 2,
    untriaged: 3,
    resolved: 4,
  }
  const rows = current.orders.flatMap((order): CommerceSupportWorkloadRow[] => (order.supportCases ?? []).map((supportCase) => {
    const allEvents = [...(supportCase.serviceEvents ?? []), ...(supportCase.followUpServiceEvents ?? [])]
    const service = commerceSupportServiceState(supportCase)
    const checkpoints = commerceSupportCheckpointState(supportCase)
    const currentResolution = supportCase.reopen ? supportCase.followUpResolution : supportCase.resolution
    const resolvedAt = supportCase.status === 'resolved' ? currentResolution?.proof.capturedAt ?? null : null
    const cycleOpenedAt = supportCase.reopen?.proof.capturedAt ?? supportCase.opening.capturedAt
    const retainedEventTimes = [
      supportCase.customerRequestedAt,
      supportCase.opening.capturedAt,
      ...(supportCase.serviceEvents ?? []).map((event) => event.proof.capturedAt),
      ...(supportCase.resolution ? [supportCase.resolution.proof.capturedAt] : []),
      ...(supportCase.reopen ? [supportCase.reopen.proof.capturedAt] : []),
      ...(supportCase.followUpServiceEvents ?? []).map((event) => event.proof.capturedAt),
      ...(supportCase.followUpResolution ? [supportCase.followUpResolution.proof.capturedAt] : []),
    ]
    if (retainedEventTimes.some((timestamp) => Date.parse(timestamp) > asOfMs)) {
      throw new Error(`Support workload as-of time precedes retained evidence for ${supportCase.caseId}.`)
    }
    const caseEndMs = resolvedAt ? Date.parse(resolvedAt) : asOfMs
    const cycleEndMs = resolvedAt ? Date.parse(resolvedAt) : asOfMs
    const caseAgeMinutes = Math.max(0, Math.floor((caseEndMs - Date.parse(supportCase.customerRequestedAt)) / 60_000))
    const cycleAgeMinutes = Math.max(0, Math.floor((cycleEndMs - Date.parse(cycleOpenedAt)) / 60_000))
    const responseTargetMissed = checkpoints.firstResponseReady
      ? Date.parse(checkpoints.firstResponseReady.proof.capturedAt) > Date.parse(checkpoints.firstResponseReady.dueAt)
      : service !== null && Date.parse(service.dueAt) <= asOfMs
    return {
      orderId: order.id,
      caseId: supportCase.caseId,
      category: supportCase.category,
      status: supportCase.status,
      cycle: supportCase.reopen ? 'follow_up' : 'initial',
      repeatContact: Boolean(supportCase.reopen),
      linkedResolutionActionId: supportCase.reopen?.sourceResolutionActionId ?? null,
      priority: service?.priority ?? null,
      owner: service?.owner ?? null,
      dueAt: service?.dueAt ?? null,
      urgency: commerceSupportCaseUrgency(supportCase, asOfMs),
      customerRequestedAt: supportCase.customerRequestedAt,
      cycleOpenedAt,
      acknowledgedAt: checkpoints.acknowledged?.proof.capturedAt ?? null,
      firstResponseReadyAt: checkpoints.firstResponseReady?.proof.capturedAt ?? null,
      resolvedAt,
      caseAgeMinutes,
      cycleAgeMinutes,
      ageBucket: commerceSupportAgeBucket(caseAgeMinutes),
      responseTargetMissed,
      serviceEventCount: allEvents.length,
      reassignmentCount: allEvents.filter((event) => event.kind === 'reassigned').length,
      escalationCount: allEvents.filter((event) => event.kind === 'escalated').length,
      initialResolutionOutcome: supportCase.resolution?.outcome ?? null,
      followUpResolutionOutcome: supportCase.followUpResolution?.outcome ?? null,
    }
  }))
    .sort((left, right) => Number(left.status === 'resolved') - Number(right.status === 'resolved')
      || urgencyRank[left.urgency] - urgencyRank[right.urgency]
      || (left.dueAt ?? '9999').localeCompare(right.dueAt ?? '9999')
      || left.customerRequestedAt.localeCompare(right.customerRequestedAt)
      || left.caseId.localeCompare(right.caseId))
  const ageBuckets: Record<CommerceSupportAgeBucket, number> = { under_4h: 0, '4_24h': 0, '1_3d': 0, over_3d: 0 }
  const ownerMap = new Map<string, CommerceSupportWorkloadOwner>()
  for (const row of rows) {
    ageBuckets[row.ageBucket] += 1
    if (row.status !== 'open' || !row.owner) continue
    const owner = ownerMap.get(row.owner) ?? { owner: row.owner, openCases: 0, overdueCases: 0 }
    owner.openCases += 1
    if (row.urgency === 'overdue') owner.overdueCases += 1
    ownerMap.set(row.owner, owner)
  }
  const unsigned: Omit<CommerceSupportWorkloadExport, 'digest'> = {
    schema: COMMERCE_SUPPORT_WORKLOAD_EXPORT_SCHEMA,
    asOf,
    controls: {
      customerDataIncluded: false,
      freeTextIncluded: false,
      externalActionsPerformed: false,
    },
    summary: {
      totalCases: rows.length,
      openCases: rows.filter((row) => row.status === 'open').length,
      resolvedCases: rows.filter((row) => row.status === 'resolved').length,
      reopenedCases: rows.filter((row) => row.repeatContact).length,
      overdueCases: rows.filter((row) => row.urgency === 'overdue').length,
      responseTargetMisses: rows.filter((row) => row.responseTargetMissed).length,
      ageBuckets,
      ownerWorkload: [...ownerMap.values()].sort((left, right) => right.overdueCases - left.overdueCases
        || right.openCases - left.openCases
        || left.owner.localeCompare(right.owner)),
    },
    rows,
  }
  return { ...unsigned, digest: commerceSupportWorkloadDigest(unsigned) }
}

export function recordCommerceOrderSupportCase(
  state: CommerceState,
  input: CommerceOrderSupportOpenInput,
  proof: CommerceActionProof,
  expected: CommerceOrderSupportOpenExpectation,
) {
  if (!validProof(proof)
    || typeof input.orderId !== 'string'
    || !input.orderId
    || input.orderId !== input.orderId.trim()
    || input.orderId.length > 160
    || !supportIntentIdPattern.test(input.sourceIntentId)
    || !storefrontRequestIdPattern.test(input.sourceRequestId)
    || !supportCategories.includes(input.category)
    || !supportPriorities.includes(input.priority)
    || typeof input.owner !== 'string'
    || !input.owner
    || input.owner !== input.owner.trim()
    || input.owner.length > 120
    || !validTimestamp(input.dueAt)
    || input.externalMessageSent !== false
    || input.refundStarted !== false
    || !validTimestamp(input.customerRequestedAt)
    || typeof input.customerDescription !== 'string'
    || !input.customerDescription
    || input.customerDescription !== input.customerDescription.trim()
    || input.customerDescription.length > 300) return null
  const current = validateCommerceState(state)
  const caseId = `CASE-${input.sourceIntentId.slice(4)}`
  const evidenceReference = `ECOMMERCE-SUPPORT:${input.sourceIntentId.slice(4)}:${input.orderId}:${input.sourceRequestId}`
  const replay = current.orders.flatMap((order) => (order.supportCases ?? []).map((entry) => ({ order, entry })))
    .find(({ entry }) => entry.sourceIntentId === input.sourceIntentId || entry.opening.actionId === proof.actionId)
  if (replay) {
    const expectedRecord: CommerceOrderSupportCase = {
      caseId,
      sourceIntentId: input.sourceIntentId,
      sourceRequestId: input.sourceRequestId,
      customerRequestedAt: input.customerRequestedAt,
      category: input.category,
      customerDescription: input.customerDescription,
      priority: input.priority,
      owner: input.owner,
      dueAt: input.dueAt,
      status: 'open',
      opening: proof,
      externalMessageSent: false,
      refundStarted: false,
    }
    return replay.order.id === input.orderId && JSON.stringify(replay.entry) === JSON.stringify(expectedRecord) ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const actual = commerceOrderSupportOpenExpectation(current, input.orderId, input.sourceIntentId)
  if (!actual || !expected || !sameSupportOpenExpectation(actual, expected)) return null
  const order = current.orders.find((candidate) => candidate.id === input.orderId)
  if (!order
    || !order.completion
    || order.sourceRecordId !== input.sourceRequestId
    || proof.evidenceReference !== evidenceReference
    || (timestampMicros(input.dueAt) as bigint) <= (timestampMicros(proof.capturedAt) as bigint)) return null
  const latest = [
    order.completion.capturedAt,
    input.customerRequestedAt,
    ...(order.supportCases ?? []).flatMap((entry) => [
      entry.opening.capturedAt,
      ...(entry.serviceEvents ?? []).map((serviceEvent) => serviceEvent.proof.capturedAt),
      ...(entry.resolution ? [entry.resolution.proof.capturedAt] : []),
      ...(entry.reopen ? [entry.reopen.proof.capturedAt] : []),
      ...(entry.followUpServiceEvents ?? []).map((serviceEvent) => serviceEvent.proof.capturedAt),
      ...(entry.followUpResolution ? [entry.followUpResolution.proof.capturedAt] : []),
    ]),
  ].map((value) => timestampMicros(value) as bigint).reduce((maximum, value) => value > maximum ? value : maximum, 0n)
  if ((timestampMicros(proof.capturedAt) as bigint) < latest) return null
  const supportCase: CommerceOrderSupportCase = {
    caseId,
    sourceIntentId: input.sourceIntentId,
    sourceRequestId: input.sourceRequestId,
    customerRequestedAt: input.customerRequestedAt,
    category: input.category,
    customerDescription: input.customerDescription,
    priority: input.priority,
    owner: input.owner,
    dueAt: input.dueAt,
    status: 'open',
    opening: proof,
    externalMessageSent: false,
    refundStarted: false,
  }
  return validateCommerceState({
    ...current,
    orders: current.orders.map((candidate) => candidate.id === input.orderId
      ? { ...candidate, supportCases: [supportCase, ...(candidate.supportCases ?? [])] }
      : candidate),
  })
}

export function commerceOrderSupportServiceExpectation(
  state: CommerceState,
  orderId: string,
  caseId: string,
): CommerceOrderSupportServiceExpectation | null {
  const current = validateCommerceState(state)
  const order = current.orders.find((candidate) => candidate.id === orderId)
  const supportCase = order?.supportCases?.find((candidate) => candidate.caseId === caseId)
  if (!order || !supportCase || supportCase.status !== 'open' || !commerceSupportServiceState(supportCase)) return null
  return { orderId, caseId, orderSnapshot: JSON.stringify(order), caseSnapshot: JSON.stringify(supportCase) }
}

export function recordCommerceOrderSupportServiceEvent(
  state: CommerceState,
  input: CommerceOrderSupportServiceInput,
  proof: CommerceActionProof,
  expected: CommerceOrderSupportServiceExpectation,
) {
  if (!validProof(proof)
    || typeof input.orderId !== 'string'
    || !input.orderId
    || input.orderId !== input.orderId.trim()
    || input.orderId.length > 160
    || !supportCaseIdPattern.test(input.caseId)
    || !supportServiceEventKinds.includes(input.kind)
    || !supportPriorities.includes(input.priority)
    || typeof input.owner !== 'string'
    || !input.owner
    || input.owner !== input.owner.trim()
    || input.owner.length > 120
    || !validTimestamp(input.dueAt)
    || typeof input.note !== 'string'
    || !input.note
    || input.note !== input.note.trim()
    || input.note.length > 300
    || proof.evidenceReference !== `SUPPORT-SERVICE:${input.caseId}`) return null
  const current = validateCommerceState(state)
  const replay = current.orders.flatMap((order) => (order.supportCases ?? []).flatMap((supportCase) => [
    ...(supportCase.serviceEvents ?? []),
    ...(supportCase.followUpServiceEvents ?? []),
  ].map((serviceEvent) => ({ order, supportCase, serviceEvent }))))
    .find(({ serviceEvent }) => serviceEvent.proof.actionId === proof.actionId)
  if (replay) {
    const expectedEvent: CommerceOrderSupportServiceEvent = {
      kind: input.kind,
      owner: input.owner,
      priority: input.priority,
      dueAt: input.dueAt,
      note: input.note,
      proof,
    }
    return replay.order.id === input.orderId
      && replay.supportCase.caseId === input.caseId
      && JSON.stringify(replay.serviceEvent) === JSON.stringify(expectedEvent)
      ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const actual = commerceOrderSupportServiceExpectation(current, input.orderId, input.caseId)
  if (!actual || !expected || JSON.stringify(actual) !== JSON.stringify(expected)) return null
  const order = current.orders.find((candidate) => candidate.id === input.orderId)
  const supportCase = order?.supportCases?.find((candidate) => candidate.caseId === input.caseId)
  const service = supportCase ? commerceSupportServiceState(supportCase) : null
  if (!order || !supportCase || !service) return null
  const proofAt = timestampMicros(proof.capturedAt) as bigint
  const dueAt = timestampMicros(input.dueAt) as bigint
  const previousDueAt = timestampMicros(service.dueAt) as bigint
  const previousPriority = supportPriorities.indexOf(service.priority)
  const nextPriority = supportPriorities.indexOf(input.priority)
  const checkpoints = commerceSupportCheckpointState(supportCase)
  const currentServiceEvents = supportCase.reopen ? supportCase.followUpServiceEvents ?? [] : supportCase.serviceEvents ?? []
  const latestAt = [supportCase.reopen?.proof.capturedAt ?? supportCase.opening.capturedAt, ...currentServiceEvents.map((entry) => entry.proof.capturedAt)]
    .map((value) => timestampMicros(value) as bigint)
    .reduce((maximum, value) => value > maximum ? value : maximum, 0n)
  if (proofAt < latestAt) return null
  if (input.kind === 'reassigned') {
    if (input.owner === service.owner || input.priority !== service.priority || input.dueAt !== service.dueAt) return null
  } else if (input.kind === 'escalated') {
    if (input.owner !== service.owner
      || nextPriority > previousPriority
      || dueAt > previousDueAt
      || (nextPriority === previousPriority && dueAt === previousDueAt)
      || (input.dueAt !== service.dueAt && dueAt <= proofAt)) return null
  } else if (input.kind === 'acknowledged') {
    if (checkpoints.acknowledged
      || checkpoints.firstResponseReady
      || input.owner !== service.owner
      || input.priority !== service.priority
      || input.dueAt !== service.dueAt) return null
  } else if (!checkpoints.acknowledged
    || checkpoints.firstResponseReady
    || input.owner !== service.owner
    || input.priority !== service.priority
    || input.dueAt !== service.dueAt) return null
  const serviceEvent: CommerceOrderSupportServiceEvent = {
    kind: input.kind,
    owner: input.owner,
    priority: input.priority,
    dueAt: input.dueAt,
    note: input.note,
    proof,
  }
  return validateCommerceState({
    ...current,
    orders: current.orders.map((candidate) => candidate.id === input.orderId
      ? {
          ...candidate,
          supportCases: candidate.supportCases?.map((entry) => entry.caseId === input.caseId
            ? supportCase.reopen
              ? { ...entry, followUpServiceEvents: [serviceEvent, ...(entry.followUpServiceEvents ?? [])] }
              : { ...entry, serviceEvents: [serviceEvent, ...(entry.serviceEvents ?? [])] }
            : entry),
        }
      : candidate),
  })
}

export function commerceOrderSupportResolveExpectation(
  state: CommerceState,
  orderId: string,
  caseId: string,
): CommerceOrderSupportResolveExpectation | null {
  const current = validateCommerceState(state)
  const order = current.orders.find((candidate) => candidate.id === orderId)
  const supportCase = order?.supportCases?.find((candidate) => candidate.caseId === caseId)
  if (!order
    || !supportCase
    || supportCase.status !== 'open'
    || (supportCase.reopen ? supportCase.followUpResolution !== undefined : supportCase.resolution !== undefined)) return null
  if (commerceSupportServiceState(supportCase) && !commerceSupportCheckpointState(supportCase).firstResponseReady) return null
  return { orderId, caseId, orderSnapshot: JSON.stringify(order), caseSnapshot: JSON.stringify(supportCase) }
}

export function commerceOrderSupportReopenExpectation(
  state: CommerceState,
  orderId: string,
  caseId: string,
): CommerceOrderSupportReopenExpectation | null {
  const current = validateCommerceState(state)
  const order = current.orders.find((candidate) => candidate.id === orderId)
  const supportCase = order?.supportCases?.find((candidate) => candidate.caseId === caseId)
  if (!order
    || !supportCase
    || supportCase.status !== 'resolved'
    || !supportCase.resolution
    || supportCase.reopen
    || supportCase.followUpServiceEvents
    || supportCase.followUpResolution) return null
  return { orderId, caseId, orderSnapshot: JSON.stringify(order), caseSnapshot: JSON.stringify(supportCase) }
}

export function reopenCommerceOrderSupportCase(
  state: CommerceState,
  input: CommerceOrderSupportReopenInput,
  proof: CommerceActionProof,
  expected: CommerceOrderSupportReopenExpectation,
) {
  if (!validProof(proof)
    || typeof input.orderId !== 'string'
    || !input.orderId
    || input.orderId !== input.orderId.trim()
    || input.orderId.length > 160
    || !supportCaseIdPattern.test(input.caseId)
    || typeof input.sourceResolutionActionId !== 'string'
    || !input.sourceResolutionActionId
    || !supportPriorities.includes(input.priority)
    || typeof input.owner !== 'string'
    || !input.owner
    || input.owner !== input.owner.trim()
    || input.owner.length > 120
    || !validTimestamp(input.dueAt)
    || typeof input.note !== 'string'
    || !input.note
    || input.note !== input.note.trim()
    || input.note.length > 300
    || proof.evidenceReference !== `SUPPORT-REOPEN:${input.caseId}:${input.sourceResolutionActionId}`) return null
  const current = validateCommerceState(state)
  const replay = current.orders.flatMap((order) => (order.supportCases ?? []).map((supportCase) => ({ order, supportCase })))
    .find(({ supportCase }) => supportCase.reopen?.proof.actionId === proof.actionId)
  if (replay) {
    const expectedReopen: CommerceOrderSupportReopen = {
      sourceResolutionActionId: input.sourceResolutionActionId,
      owner: input.owner,
      priority: input.priority,
      dueAt: input.dueAt,
      note: input.note,
      proof,
    }
    return replay.order.id === input.orderId
      && replay.supportCase.caseId === input.caseId
      && JSON.stringify(replay.supportCase.reopen) === JSON.stringify(expectedReopen)
      ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const actual = commerceOrderSupportReopenExpectation(current, input.orderId, input.caseId)
  if (!actual || !expected || JSON.stringify(actual) !== JSON.stringify(expected)) return null
  const order = current.orders.find((candidate) => candidate.id === input.orderId)
  const supportCase = order?.supportCases?.find((candidate) => candidate.caseId === input.caseId)
  if (!order
    || !supportCase?.resolution
    || supportCase.resolution.proof.actionId !== input.sourceResolutionActionId
    || (timestampMicros(proof.capturedAt) as bigint) <= (timestampMicros(supportCase.resolution.proof.capturedAt) as bigint)
    || (timestampMicros(input.dueAt) as bigint) <= (timestampMicros(proof.capturedAt) as bigint)) return null
  const reopen: CommerceOrderSupportReopen = {
    sourceResolutionActionId: input.sourceResolutionActionId,
    owner: input.owner,
    priority: input.priority,
    dueAt: input.dueAt,
    note: input.note,
    proof,
  }
  return validateCommerceState({
    ...current,
    orders: current.orders.map((candidate) => candidate.id === input.orderId
      ? {
          ...candidate,
          supportCases: candidate.supportCases?.map((entry) => entry.caseId === input.caseId
            ? { ...entry, status: 'open' as const, reopen }
            : entry),
        }
      : candidate),
  })
}

export function resolveCommerceOrderSupportCase(
  state: CommerceState,
  input: CommerceOrderSupportResolveInput,
  proof: CommerceActionProof,
  expected: CommerceOrderSupportResolveExpectation,
) {
  if (!validProof(proof)
    || typeof input.orderId !== 'string'
    || !input.orderId
    || input.orderId !== input.orderId.trim()
    || input.orderId.length > 160
    || !supportCaseIdPattern.test(input.caseId)
    || !supportResolutionOutcomes.includes(input.outcome)
    || typeof input.note !== 'string'
    || !input.note
    || input.note !== input.note.trim()
    || input.note.length > 300) return null
  const current = validateCommerceState(state)
  const replay = current.orders.flatMap((order) => (order.supportCases ?? []).flatMap((entry) => [entry.resolution, entry.followUpResolution]
    .filter((resolution): resolution is CommerceOrderSupportResolution => Boolean(resolution))
    .map((resolution) => ({ order, entry, resolution }))))
    .find(({ resolution }) => resolution.proof.actionId === proof.actionId)
  if (replay) {
    return replay.order.id === input.orderId
      && replay.entry.caseId === input.caseId
      && replay.resolution.outcome === input.outcome
      && replay.resolution.note === input.note
      && sameActionProof(replay.resolution.proof, proof)
      ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const actual = commerceOrderSupportResolveExpectation(current, input.orderId, input.caseId)
  if (!actual || !expected || JSON.stringify(actual) !== JSON.stringify(expected)) return null
  const order = current.orders.find((candidate) => candidate.id === input.orderId)
  const supportCase = order?.supportCases?.find((candidate) => candidate.caseId === input.caseId)
  if (!order || !supportCase || (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(supportCase.opening.capturedAt) as bigint)) return null
  const resolution: CommerceOrderSupportResolution = { outcome: input.outcome, note: input.note, proof }
  return validateCommerceState({
    ...current,
    orders: current.orders.map((candidate) => candidate.id === input.orderId
      ? { ...candidate, supportCases: candidate.supportCases?.map((entry) => entry.caseId === input.caseId
        ? entry.reopen
          ? { ...entry, status: 'resolved' as const, followUpResolution: resolution }
          : { ...entry, status: 'resolved' as const, resolution }
        : entry) }
      : candidate),
  })
}

function sameOrderCorrectionExpectation(
  left: CommerceOrderCorrectionExpectation,
  right: CommerceOrderCorrectionExpectation,
) {
  return left.orderId === right.orderId
    && left.sourceCalculationDigest === right.sourceCalculationDigest
    && left.correctionCount === right.correctionCount
    && left.currentBalanceMmk === right.currentBalanceMmk
    && left.orderSnapshot === right.orderSnapshot
}

function correctionMatches(
  record: CommerceOrderCorrection,
  input: CommerceOrderCorrectionInput,
  proof: CommerceActionProof,
) {
  return record.actionId === proof.actionId
    && record.createdAt === proof.capturedAt
    && record.actor === proof.actor
    && record.reason === proof.reason
    && record.evidenceReference === proof.evidenceReference
    && record.kind === input.kind
    && record.reasonCode === input.reasonCode
    && record.calculation.listedAmountMmk === input.listedAmountMmk
}

export function commerceOrderCorrectionExpectation(
  state: CommerceState,
  orderId: string,
): CommerceOrderCorrectionExpectation | null {
  const current = validateCommerceState(state)
  const order = current.orders.find((candidate) => candidate.id === orderId)
  const closedOrderIds = new Set(current.closes.flatMap((close) => close.orderIds ?? []))
  const sourceCalculationDigest = order ? commerceOrderCalculationDigest(order) : null
  const currentBalanceMmk = order ? commerceOrderAdjustedTotal(order) : null
  if (!order
    || order.status !== 'completed'
    || order.paymentStatus !== 'reconciled'
    || !order.completion
    || closedOrderIds.has(order.id)
    || !sourceCalculationDigest
    || currentBalanceMmk === null
    || (order.corrections?.length ?? 0) >= maxCorrectionsPerOrder) return null
  return {
    orderId,
    sourceCalculationDigest,
    correctionCount: order.corrections?.length ?? 0,
    currentBalanceMmk,
    orderSnapshot: JSON.stringify(order),
  }
}

export function recordCommerceOrderCorrection(
  state: CommerceState,
  input: CommerceOrderCorrectionInput,
  proof: CommerceActionProof,
  expected: CommerceOrderCorrectionExpectation,
) {
  if (!validProof(proof)
    || typeof input.orderId !== 'string'
    || !input.orderId
    || input.orderId !== input.orderId.trim()
    || input.orderId.length > 160
    || !correctionKinds.includes(input.kind)
    || !correctionReasonCodes.includes(input.reasonCode)
    || !Number.isSafeInteger(input.listedAmountMmk)
    || input.listedAmountMmk < 1
    || [proof.actionId, proof.actor, proof.reason, proof.evidenceReference].some((value) => value !== value.trim())) return null
  const current = validateCommerceState(state)
  const replayRecords = current.orders.flatMap((order) => (
    (order.corrections ?? [])
      .filter((record) => record.actionId === proof.actionId)
      .map((record) => ({ order, record }))
  ))
  if (replayRecords.length) {
    return replayRecords.length === 1
      && replayRecords[0].order.id === input.orderId
      && correctionMatches(replayRecords[0].record, input, proof) ? current : null
  }
  if (actionIdIsUsed(current, proof.actionId)) return null
  const actual = commerceOrderCorrectionExpectation(current, input.orderId)
  if (!actual || !expected || !sameOrderCorrectionExpectation(actual, expected)) return null
  const order = current.orders.find((candidate) => candidate.id === input.orderId)
  if (!order || !order.completion) return null
  const calculation = commerceCorrectionCalculation(order, input.listedAmountMmk)
  if (!calculation) return null
  const balanceAfterMmk = actual.currentBalanceMmk
    + (input.kind === 'debit' ? calculation.totalMmk : -calculation.totalMmk)
  if (!Number.isSafeInteger(balanceAfterMmk) || balanceAfterMmk < 0) return null
  const latestBasis = [
    order.createdAt,
    order.paymentReconciledAt,
    order.completion.capturedAt,
    ...(order.corrections ?? []).map((record) => record.createdAt),
  ].flatMap((timestamp) => timestamp ? [timestampMicros(timestamp) as bigint] : [])
    .reduce((latest, timestamp) => timestamp > latest ? timestamp : latest, 0n)
  if ((timestampMicros(proof.capturedAt) as bigint) < latestBasis) return null
  const record: CommerceOrderCorrection = {
    documentId: `COR2:${encodeURIComponent(proof.actionId)}`,
    actionId: proof.actionId,
    createdAt: proof.capturedAt,
    actor: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
    kind: input.kind,
    reasonCode: input.reasonCode,
    sourceCalculationDigest: actual.sourceCalculationDigest,
    calculation,
    balanceAfterMmk,
    financialStatus: 'review_required',
    postingAuthority: 'none',
    externalPostingPerformed: false,
  }
  return validateCommerceState({
    ...current,
    orders: current.orders.map((candidate) => candidate.id === input.orderId
      ? { ...candidate, corrections: [record, ...(candidate.corrections ?? [])] }
      : candidate),
  })
}

function sameCloseExpectation(left: CommerceCloseExpectation, right: CommerceCloseExpectation) {
  return left.businessDate === right.businessDate
    && left.total === right.total
    && left.stateSnapshot === right.stateSnapshot
    && sameStringArray(left.orderIds, right.orderIds)
    && sameStringArray(left.paymentExceptionOrderIds, right.paymentExceptionOrderIds)
    && sameStringArray(left.stockExceptionSkus, right.stockExceptionSkus)
}

function commerceOrderCloseBasis(order: CommerceOrder) {
  return [
    order.createdAt,
    order.paymentReconciledAt,
    order.completion?.capturedAt,
    ...(order.corrections ?? []).map((correction) => correction.createdAt),
  ].flatMap((timestamp) => timestamp ? [timestampMicros(timestamp) as bigint] : [])
    .reduce((latest, timestamp) => timestamp > latest ? timestamp : latest, 0n)
}

export function commerceCloseExpectation(state: CommerceState, capturedAt: string): CommerceCloseExpectation | null {
  if (!validTimestamp(capturedAt)) return null
  const current = validateCommerceState(state)
  if (current.closes.some((close) => !close.orderIds || !close.businessDate)) return null
  const businessDate = myanmarBusinessDate(capturedAt)
  if (current.closes.some((close) => close.businessDate === businessDate)) return null
  const previouslyClosedOrderIds = new Set(current.closes.flatMap((close) => close.orderIds ?? []))
  const eligibleOrders = current.orders
    .filter((order) => order.status === 'completed'
      && order.paymentStatus === 'reconciled'
      && !previouslyClosedOrderIds.has(order.id))
  if (eligibleOrders.some((order) => commerceOrderCloseBasis(order) > (timestampMicros(capturedAt) as bigint))) return null
  const orderIds = eligibleOrders
    .map((order) => order.id)
    .sort()
  const adjustedTotals = orderIds.map((orderId) => commerceOrderAdjustedTotal(current.orders.find((order) => order.id === orderId) as CommerceOrder))
  if (adjustedTotals.some((total) => total === null)) return null
  const total = adjustedTotals.reduce<number>((sum, value) => sum + (value ?? 0), 0)
  if (!Number.isSafeInteger(total)) return null
  return {
    businessDate,
    orderIds,
    total,
    paymentExceptionOrderIds: current.orders
      .filter((order) => order.refundStatus === 'due' || (order.status !== 'cancelled' && order.paymentStatus === 'pending'))
      .map((order) => order.id)
      .sort(),
    stockExceptionSkus: current.items
      .filter((item) => item.onHand <= item.reorderAt)
      .map((item) => item.sku)
      .sort(),
    stateSnapshot: JSON.stringify(current),
  }
}

function buildCommerceCloseSettlement(
  state: CommerceState,
  expected: CommerceCloseExpectation,
  input: CommerceCloseSettlementInputLine[],
): CommerceCloseSettlement | null {
  if (!expected || !Array.isArray(input)) return null
  let sourceState = state
  if (expected.stateSnapshot !== JSON.stringify(state)) {
    try {
      sourceState = validateCommerceState(JSON.parse(expected.stateSnapshot))
    } catch {
      return null
    }
  }
  const orderById = new Map(sourceState.orders.map((order) => [order.id, order]))
  const expectedByPayment = new Map<string, number>()
  for (const orderId of expected.orderIds) {
    const order = orderById.get(orderId)
    const adjustedTotal = order ? commerceOrderAdjustedTotal(order) : null
    if (!order || adjustedTotal === null) return null
    expectedByPayment.set(order.payment, (expectedByPayment.get(order.payment) ?? 0) + adjustedTotal)
  }
  const expectedMethods = [...expectedByPayment.keys()].sort()
  if (input.length !== expectedMethods.length) return null
  try {
    const lines = input.map((candidate): CommerceCloseSettlementLine => {
      const paymentMethod = canonicalText(candidate?.paymentMethod, 'settlement.paymentMethod', 80)
      if (!Number.isSafeInteger(candidate?.countedMmk) || candidate.countedMmk < 0) throw new Error('settlement.countedMmk is invalid')
      const expectedMmk = expectedByPayment.get(paymentMethod)
      if (expectedMmk === undefined) throw new Error('settlement.paymentMethod is unknown')
      const varianceMmk = candidate.countedMmk - expectedMmk
      if (!Number.isSafeInteger(varianceMmk)) throw new Error('settlement.varianceMmk is invalid')
      if (varianceMmk === 0) {
        if (candidate.varianceOwner.trim() || candidate.varianceReason.trim()) throw new Error('matched settlement cannot retain variance evidence')
        return { paymentMethod, expectedMmk, countedMmk: candidate.countedMmk, varianceMmk, status: 'matched', varianceOwner: null, varianceReason: null }
      }
      return {
        paymentMethod,
        expectedMmk,
        countedMmk: candidate.countedMmk,
        varianceMmk,
        status: 'variance_review',
        varianceOwner: canonicalText(candidate.varianceOwner, 'settlement.varianceOwner', 80),
        varianceReason: canonicalText(candidate.varianceReason, 'settlement.varianceReason', 240),
      }
    }).sort((left, right) => left.paymentMethod < right.paymentMethod ? -1 : left.paymentMethod > right.paymentMethod ? 1 : 0)
    if (!sameStringArray(lines.map((line) => line.paymentMethod), expectedMethods)) return null
    const totalExpectedMmk = lines.reduce((total, line) => total + line.expectedMmk, 0)
    const totalCountedMmk = lines.reduce((total, line) => total + line.countedMmk, 0)
    const totalVarianceMmk = lines.reduce((total, line) => total + line.varianceMmk, 0)
    if (![totalExpectedMmk, totalCountedMmk, totalVarianceMmk].every(Number.isSafeInteger) || totalExpectedMmk !== expected.total) return null
    return {
      schema: COMMERCE_CLOSE_SETTLEMENT_SCHEMA,
      status: lines.some((line) => line.status === 'variance_review') ? 'variance_review' : 'matched',
      totalExpectedMmk,
      totalCountedMmk,
      totalVarianceMmk,
      lines,
    }
  } catch {
    return null
  }
}

export function commerceCloseSettlementReview(
  state: CommerceState,
  expected: CommerceCloseExpectation,
  input: CommerceCloseSettlementInputLine[],
) {
  const current = validateCommerceState(state)
  return buildCommerceCloseSettlement(current, expected, input)
}

export function saveCommerceClose(
  state: CommerceState,
  closeId: string,
  proof: CommerceActionProof,
  expected: CommerceCloseExpectation,
  settlementInput?: CommerceCloseSettlementInputLine[],
) {
  if (!validProof(proof)
    || !validTimestamp(proof.capturedAt)
    || [proof.actionId, proof.actor, proof.reason, proof.evidenceReference].some((value) => value !== value.trim())
    || !closeActionIdPattern.test(proof.actionId)
    || !closeIdPattern.test(closeId)) return null
  const current = validateCommerceState(state)
  const settlement = settlementInput === undefined ? undefined : buildCommerceCloseSettlement(current, expected, settlementInput)
  if (settlementInput !== undefined && !settlement) return null
  const existing = current.closes.find((close) => close.id === closeId)
  if (existing) return sameCloseProof(existing, proof) && JSON.stringify(existing.settlement) === JSON.stringify(settlement) ? current : null
  if (actionIdIsUsed(current, proof.actionId)) return null
  const actual = commerceCloseExpectation(current, proof.capturedAt)
  if (!actual || !expected || !sameCloseExpectation(actual, expected)) return null
  const close: CommerceClose = {
    id: closeId,
    createdAt: proof.capturedAt,
    total: actual.total,
    orders: actual.orderIds.length,
    businessDate: actual.businessDate,
    orderIds: actual.orderIds,
    paymentExceptionOrderIds: actual.paymentExceptionOrderIds,
    stockExceptionSkus: actual.stockExceptionSkus,
    actionId: proof.actionId,
    operator: proof.actor,
    reason: proof.reason,
    evidenceReference: proof.evidenceReference,
    ...(settlement ? { settlement } : {}),
  }
  return validateCommerceState({ ...current, closes: [close, ...current.closes] })
}

function commerceDailyCloseExportProjection(artifact: Omit<CommerceDailyCloseExport, 'digest'>) {
  return [
    artifact.schema,
    artifact.closeId,
    artifact.businessDate,
    artifact.closedAt,
    artifact.actionId,
    artifact.operator,
    artifact.reason,
    artifact.evidenceReference,
    artifact.totalMmk,
    artifact.orderCount,
    artifact.paymentExceptionOrderIds,
    artifact.stockExceptionSkus,
    artifact.orders.map((order) => [
      order.orderId,
      order.orderCreatedAt,
      order.paymentMethod,
      order.paymentReconciledAt,
      order.paymentEvidenceReference,
      order.currency,
      order.catalogRevision,
      order.taxConfigurationRevision,
      order.taxCode,
      order.taxJurisdictionCode,
      order.taxEffectiveFrom,
      order.taxRateBasisPoints,
      order.listedSubtotalMmk,
      order.subtotalMmk,
      order.taxMode,
      order.taxMmk,
      order.originalTotalMmk,
      order.totalMmk,
      order.corrections.map((correction) => [
        correction.documentId,
        correction.kind,
        correction.reasonCode,
        correction.createdAt,
        correction.actor,
        correction.evidenceReference,
        correction.sourceCalculationDigest,
        correction.listedAmountMmk,
        correction.subtotalMmk,
        correction.taxMmk,
        correction.totalMmk,
        correction.balanceAfterMmk,
        correction.financialStatus,
        correction.postingAuthority,
        correction.externalPostingPerformed,
      ]),
      order.calculationStatus,
    ]),
  ]
}

// Split out of commerceDailyCloseExport so a caller that already holds a VALIDATED state can
// export many closes without paying validateCommerceState once per close. At the byte ceiling
// that validation dominates everything else: commerceWorkspaceArchive exports every close a
// shop has ever taken, and re-validating a 2 MiB workspace tens of times over is the
// difference between an archive a cheap Android tablet can produce and one it cannot. The
// public entry point below still validates, so its contract is unchanged.
function commerceDailyCloseExportFrom(current: CommerceState, closeId: string): CommerceDailyCloseExport | null {
  const close = current.closes.find((candidate) => candidate.id === closeId)
  if (!close?.businessDate
    || !close.orderIds
    || !close.paymentExceptionOrderIds
    || !close.stockExceptionSkus
    || !close.actionId
    || !close.operator
    || !close.reason
    || !close.evidenceReference) return null
  const orderById = new Map(current.orders.map((order) => [order.id, order]))
  if (close.orderIds.some((orderId) => commerceOrderCloseBasis(orderById.get(orderId) as CommerceOrder) > (timestampMicros(close.createdAt) as bigint))) return null
  const orders = close.orderIds.map((orderId): CommerceDailyCloseExportOrder => {
    const order = orderById.get(orderId) as CommerceOrder
    const calculation = order.calculation
    const configured = calculation?.schema === COMMERCE_ORDER_CALCULATION_V2_SCHEMA ? calculation : null
    const corrections = (order.corrections ?? []).map((correction): CommerceDailyCloseExportCorrection => ({
      documentId: correction.documentId,
      kind: correction.kind,
      reasonCode: correction.reasonCode,
      createdAt: correction.createdAt,
      actor: correction.actor,
      evidenceReference: correction.evidenceReference,
      sourceCalculationDigest: correction.sourceCalculationDigest,
      listedAmountMmk: correction.calculation.listedAmountMmk,
      subtotalMmk: correction.calculation.subtotalMmk,
      taxMmk: correction.calculation.taxMmk,
      totalMmk: correction.calculation.totalMmk,
      balanceAfterMmk: correction.balanceAfterMmk,
      financialStatus: correction.financialStatus,
      postingAuthority: correction.postingAuthority,
      externalPostingPerformed: correction.externalPostingPerformed,
    }))
    const adjustedTotal = commerceOrderAdjustedTotal(order)
    if (adjustedTotal === null) throw new Error(`Order ${order.id} has an invalid adjusted total.`)
    return {
      orderId: order.id,
      orderCreatedAt: order.createdAt,
      paymentMethod: order.payment,
      paymentReconciledAt: order.paymentReconciledAt ?? null,
      paymentEvidenceReference: order.paymentEvidenceReference ?? null,
      currency: calculation?.currency ?? 'MMK',
      catalogRevision: calculation?.catalogRevision ?? null,
      taxConfigurationRevision: configured?.taxConfigurationRevision ?? null,
      taxCode: configured?.taxCode ?? null,
      taxJurisdictionCode: configured?.taxJurisdictionCode ?? null,
      taxEffectiveFrom: configured?.taxEffectiveFrom ?? null,
      taxRateBasisPoints: configured?.taxRateBasisPoints ?? null,
      listedSubtotalMmk: configured?.listedSubtotalMmk ?? calculation?.subtotalMmk ?? null,
      subtotalMmk: calculation?.subtotalMmk ?? null,
      taxMode: calculation?.taxMode ?? 'not_recorded',
      taxMmk: calculation?.taxMmk ?? null,
      originalTotalMmk: order.total,
      totalMmk: adjustedTotal,
      corrections,
      calculationStatus: calculation ? 'accepted' : 'legacy_unverified',
    }
  })
  const artifact: Omit<CommerceDailyCloseExport, 'digest'> = {
    schema: COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA,
    closeId: close.id,
    businessDate: close.businessDate,
    closedAt: close.createdAt,
    actionId: close.actionId,
    operator: close.operator,
    reason: close.reason,
    evidenceReference: close.evidenceReference,
    totalMmk: close.total,
    orderCount: close.orders,
    paymentExceptionOrderIds: [...close.paymentExceptionOrderIds],
    stockExceptionSkus: [...close.stockExceptionSkus],
    orders,
  }
  return {
    ...artifact,
    digest: `sha256:${sha256Hex(JSON.stringify(commerceDailyCloseExportProjection(artifact)))}`,
  }
}

export function commerceDailyCloseExport(state: CommerceState, closeId: string): CommerceDailyCloseExport | null {
  return commerceDailyCloseExportFrom(validateCommerceState(state), closeId)
}

function commerceCsvCell(value: string | number | null | string[]) {
  let raw = Array.isArray(value) ? value.join(';') : value === null ? '' : String(value)
  if (/^[=+@-]/.test(raw)) raw = `'${raw}`
  return `"${raw.replace(/"/g, '""')}"`
}

export function commerceSupportWorkloadCsv(artifact: CommerceSupportWorkloadExport) {
  const { digest, ...unsigned } = artifact
  if (artifact.schema !== COMMERCE_SUPPORT_WORKLOAD_EXPORT_SCHEMA
    || digest !== commerceSupportWorkloadDigest(unsigned)) {
    throw new Error('Support workload export integrity check failed.')
  }
  const header = [
    'schema',
    'digest',
    'as_of',
    'total_cases',
    'open_cases',
    'resolved_cases',
    'reopened_cases',
    'overdue_cases',
    'response_target_misses',
    'owner_workload_json',
    'case_id',
    'order_id',
    'category',
    'status',
    'cycle',
    'repeat_contact',
    'linked_resolution_action_id',
    'priority',
    'owner',
    'due_at',
    'urgency',
    'customer_requested_at',
    'cycle_opened_at',
    'acknowledged_at',
    'first_response_ready_at',
    'resolved_at',
    'case_age_minutes',
    'cycle_age_minutes',
    'age_bucket',
    'response_target_missed',
    'service_event_count',
    'reassignment_count',
    'escalation_count',
    'initial_resolution_outcome',
    'follow_up_resolution_outcome',
    'customer_data_included',
    'free_text_included',
    'external_actions_performed',
  ]
  const sourceRows: Array<CommerceSupportWorkloadRow | null> = artifact.rows.length ? artifact.rows : [null]
  const rows = sourceRows.map((row) => [
    artifact.schema,
    artifact.digest,
    artifact.asOf,
    artifact.summary.totalCases,
    artifact.summary.openCases,
    artifact.summary.resolvedCases,
    artifact.summary.reopenedCases,
    artifact.summary.overdueCases,
    artifact.summary.responseTargetMisses,
    JSON.stringify(artifact.summary.ownerWorkload),
    row?.caseId ?? null,
    row?.orderId ?? null,
    row?.category ?? null,
    row?.status ?? null,
    row?.cycle ?? null,
    row ? String(row.repeatContact) : null,
    row?.linkedResolutionActionId ?? null,
    row?.priority ?? null,
    row?.owner ?? null,
    row?.dueAt ?? null,
    row?.urgency ?? null,
    row?.customerRequestedAt ?? null,
    row?.cycleOpenedAt ?? null,
    row?.acknowledgedAt ?? null,
    row?.firstResponseReadyAt ?? null,
    row?.resolvedAt ?? null,
    row?.caseAgeMinutes ?? null,
    row?.cycleAgeMinutes ?? null,
    row?.ageBucket ?? null,
    row ? String(row.responseTargetMissed) : null,
    row?.serviceEventCount ?? null,
    row?.reassignmentCount ?? null,
    row?.escalationCount ?? null,
    row?.initialResolutionOutcome ?? null,
    row?.followUpResolutionOutcome ?? null,
    String(artifact.controls.customerDataIncluded),
    String(artifact.controls.freeTextIncluded),
    String(artifact.controls.externalActionsPerformed),
  ].map(commerceCsvCell).join(','))
  return [header.map(commerceCsvCell).join(','), ...rows].join('\r\n')
}

export function commerceDailyCloseCsv(artifact: CommerceDailyCloseExport) {
  const header = [
    'schema',
    'record_type',
    'close_id',
    'business_date',
    'closed_at',
    'operator',
    'evidence_reference',
    'order_id',
    'order_created_at',
    'payment_method',
    'payment_reconciled_at',
    'payment_evidence_reference',
    'currency',
    'catalog_revision',
    'tax_configuration_revision',
    'tax_code',
    'tax_jurisdiction_code',
    'tax_effective_from',
    'tax_rate_basis_points',
    'listed_subtotal_mmk',
    'subtotal_mmk',
    'tax_mode',
    'tax_mmk',
    'original_total_mmk',
    'total_mmk',
    'corrections_json',
    'calculation_status',
    'payment_exception_order_ids',
    'stock_exception_skus',
    'artifact_digest',
  ]
  const rows: Array<Array<string | number | null | string[]>> = [[
    artifact.schema,
    'close',
    artifact.closeId,
    artifact.businessDate,
    artifact.closedAt,
    artifact.operator,
    artifact.evidenceReference,
    null,
    null,
    null,
    null,
    null,
    'MMK',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    artifact.totalMmk,
    null,
    null,
    artifact.paymentExceptionOrderIds,
    artifact.stockExceptionSkus,
    artifact.digest,
  ]]
  rows.push(...artifact.orders.map((order) => [
    artifact.schema,
    'order',
    artifact.closeId,
    artifact.businessDate,
    artifact.closedAt,
    null,
    null,
    order.orderId,
    order.orderCreatedAt,
    order.paymentMethod,
    order.paymentReconciledAt,
    order.paymentEvidenceReference,
    order.currency,
    order.catalogRevision,
    order.taxConfigurationRevision,
    order.taxCode,
    order.taxJurisdictionCode,
    order.taxEffectiveFrom,
    order.taxRateBasisPoints,
    order.listedSubtotalMmk,
    order.subtotalMmk,
    order.taxMode,
    order.taxMmk,
    order.originalTotalMmk,
    order.totalMmk,
    JSON.stringify(order.corrections),
    order.calculationStatus,
    null,
    null,
    artifact.digest,
  ]))
  return [header, ...rows].map((row) => row.map(commerceCsvCell).join(',')).join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Workspace archive -- every trading day this device has closed, in one file.
//
// WHY THIS EXISTS. The headroom meter (storage-durability.ts) tells an owner near the
// workspace ceiling to "export a backup from Settings so these records are safe off the
// device". Two files could have answered that and neither did the whole job:
//
//  - The workspace backup (local-workspace-backup.ts) is genuinely lossless and Shop can
//    genuinely load it back. But it is a map of storage keys to raw JSON strings. Nobody
//    can read it, and no accountant can be handed it.
//  - commerceDailyCloseExport produces a readable, digest-sealed CSV -- but the only place
//    it is surfaced (CoreApp.tsx, the "Last close" disclosure) builds it for latestClose
//    and nothing else. A shop 38 trading days into its history could download day 38 and
//    had no route to days 1-37 at all.
//
// So the gap was not "a lossless artifact" -- one already ships. It was that a shop's own
// trading history had no readable form. This archive is that form: it walks every close,
// reusing the export builder that already exists rather than defining a second projection
// of the same records.
//
// WHAT IT IS NOT. It cannot be loaded back into Shop. There is no importer, and
// CommerceDailyCloseExportOrder is a narrower record than CommerceOrder, so an importer
// built on it would be lossy. That is declared in-band as `restorable: false` and said in
// the owner's own words in the interface, because an export whose limits are only written
// in a pull request is an export that will be trusted for something it cannot do.
//
// COMPLETENESS IS THE WHOLE POINT. An archive that quietly drops a record type is worse
// than no archive, because the owner stops looking. Two record classes can legitimately
// fail to reach a close export and both were silently droppable:
//
//  - A legacy close taken before evidence fields existed: commerceDailyCloseExportFrom
//    returns null for it (missing actionId/operator/reason/evidenceReference).
//  - An order not on any exported close: today's un-closed sales, cancellations, and every
//    order belonging to a close that fell into the case above.
//
// Rather than filter those away, each one becomes a named gap row, and the artifact fails
// closed unless archived + uncovered accounts for every order in the workspace. The counts
// are derived from the state being archived on every build; none of them is a constant.
export type CommerceWorkspaceArchiveGap = {
  kind: 'close_without_evidence' | 'order_not_on_an_archived_close'
  id: string
  detail: string
}

export type CommerceWorkspaceArchive = {
  schema: typeof COMMERCE_WORKSPACE_ARCHIVE_SCHEMA
  workspaceSchema: typeof COMMERCE_WORKSPACE_SCHEMA
  generatedAt: string
  closeCount: number
  archivedCloseCount: number
  orderCount: number
  archivedOrderCount: number
  uncoveredOrderCount: number
  archivedTotalMmk: number
  closes: CommerceDailyCloseExport[]
  gaps: CommerceWorkspaceArchiveGap[]
  // The posture triple, in the shape the other accountant-facing artifacts use: what this
  // file cannot do, stated inside the file.
  restorable: false
  externalWritesPerformed: false
  digest: string
}

function commerceWorkspaceArchiveProjection(artifact: Omit<CommerceWorkspaceArchive, 'digest'>) {
  return [
    artifact.schema,
    artifact.workspaceSchema,
    artifact.generatedAt,
    artifact.closeCount,
    artifact.archivedCloseCount,
    artifact.orderCount,
    artifact.archivedOrderCount,
    artifact.uncoveredOrderCount,
    artifact.archivedTotalMmk,
    artifact.restorable,
    artifact.externalWritesPerformed,
    // The close digests, not the closes: each close is already sealed by its own
    // projection, so re-flattening every order here would only duplicate that work at the
    // exact scale where the cost matters.
    artifact.closes.map((close) => [close.closeId, close.businessDate, close.digest]),
    artifact.gaps.map((gap) => [gap.kind, gap.id, gap.detail]),
  ]
}

/**
 * Build a readable archive of every trading day this workspace has closed.
 *
 * Read-only by construction: the state is validated once, every close is projected through
 * the existing export builder, and nothing is written back. Returns null rather than an
 * incomplete archive if the coverage arithmetic does not account for every order.
 */
export function commerceWorkspaceArchive(state: CommerceState, generatedAt: string): CommerceWorkspaceArchive | null {
  if (!validTimestamp(generatedAt)) return null
  const current = validateCommerceState(state)

  const closes: CommerceDailyCloseExport[] = []
  const gaps: CommerceWorkspaceArchiveGap[] = []
  for (const close of current.closes) {
    const exported = commerceDailyCloseExportFrom(current, close.id)
    if (exported) {
      closes.push(exported)
      continue
    }
    gaps.push({
      kind: 'close_without_evidence',
      id: close.id,
      detail: `Closed ${close.businessDate ?? 'on an unrecorded date'} without the evidence record an export needs, so its ${close.orderIds?.length ?? close.orders} ${(close.orderIds?.length ?? close.orders) === 1 ? 'sale is' : 'sales are'} listed individually below.`,
    })
  }

  // Unconditional by design: an order is in this file or it has a row saying it is not, and
  // there is no third branch that could quietly swallow one. An earlier revision looked up
  // which close had claimed the order so the row could name it, and that lookup was both
  // unreachable in practice — a close carries all eight snapshot fields or none, so a close
  // that cannot be exported has no orderIds to claim with — and a place where a stray
  // `continue` would drop a record with nothing to catch it.
  const archivedOrderIds = new Set(closes.flatMap((close) => close.orders.map((order) => order.orderId)))
  for (const order of current.orders) {
    if (archivedOrderIds.has(order.id)) continue
    gaps.push({
      kind: 'order_not_on_an_archived_close',
      id: order.id,
      detail: `Not on a closed day in this file — ${order.status}, payment ${order.paymentStatus}.`,
    })
  }

  const archivedOrderCount = archivedOrderIds.size
  const uncoveredOrderCount = gaps.filter((gap) => gap.kind === 'order_not_on_an_archived_close').length
  // Fail closed on the one thing this artifact promises. If some order is neither archived
  // nor named as a gap, the file would understate the shop's history without saying so --
  // exactly the silence this whole batch exists to remove.
  if (archivedOrderCount + uncoveredOrderCount !== current.orders.length) return null

  const archivedTotalMmk = closes.reduce((sum, close) => sum + close.totalMmk, 0)
  if (!Number.isSafeInteger(archivedTotalMmk)) return null

  const artifact: Omit<CommerceWorkspaceArchive, 'digest'> = {
    schema: COMMERCE_WORKSPACE_ARCHIVE_SCHEMA,
    workspaceSchema: COMMERCE_WORKSPACE_SCHEMA,
    generatedAt,
    closeCount: current.closes.length,
    archivedCloseCount: closes.length,
    orderCount: current.orders.length,
    archivedOrderCount,
    uncoveredOrderCount,
    archivedTotalMmk,
    closes,
    gaps,
    restorable: false,
    externalWritesPerformed: false,
  }
  return {
    ...artifact,
    digest: `sha256:${sha256Hex(JSON.stringify(commerceWorkspaceArchiveProjection(artifact)))}`,
  }
}

export function commerceWorkspaceArchiveCsv(artifact: CommerceWorkspaceArchive) {
  // Verify before serialising, the way the support-workload and ledger-journal builders do.
  // commerceDailyCloseCsv does not, and this is the artifact an owner is told to keep for
  // years -- a tampered or hand-edited archive must refuse to re-serialise rather than
  // quietly produce a file that disagrees with its own seal.
  const { digest, ...unsigned } = artifact
  if (artifact.schema !== COMMERCE_WORKSPACE_ARCHIVE_SCHEMA
    || digest !== `sha256:${sha256Hex(JSON.stringify(commerceWorkspaceArchiveProjection(unsigned)))}`) {
    throw new Error('Workspace archive integrity check failed.')
  }
  const header = [
    'archive_schema',
    'archive_digest',
    'generated_at',
    'record_type',
    'record_detail',
    'restorable',
    'close_count',
    'archived_close_count',
    'order_count',
    'archived_order_count',
    'uncovered_order_count',
    'close_id',
    'business_date',
    'closed_at',
    'operator',
    'evidence_reference',
    'close_digest',
    'order_id',
    'order_created_at',
    'payment_method',
    'payment_reconciled_at',
    'payment_evidence_reference',
    'currency',
    'catalog_revision',
    'tax_configuration_revision',
    'tax_code',
    'tax_jurisdiction_code',
    'tax_effective_from',
    'tax_rate_basis_points',
    'listed_subtotal_mmk',
    'subtotal_mmk',
    'tax_mode',
    'tax_mmk',
    'original_total_mmk',
    'total_mmk',
    'corrections_json',
    'calculation_status',
    'payment_exception_order_ids',
    'stock_exception_skus',
  ]
  const blank = new Array(header.length - 11).fill(null) as Array<string | number | null | string[]>
  const lead = (recordType: string, detail: string | null): Array<string | number | null | string[]> => [
    artifact.schema,
    artifact.digest,
    artifact.generatedAt,
    recordType,
    detail,
    'no',
    artifact.closeCount,
    artifact.archivedCloseCount,
    artifact.orderCount,
    artifact.archivedOrderCount,
    artifact.uncoveredOrderCount,
  ]
  const rows: Array<Array<string | number | null | string[]>> = [[
    ...lead('archive', `Every trading day this device has closed. ${artifact.archivedCloseCount} of ${artifact.closeCount} closed ${artifact.closeCount === 1 ? 'day' : 'days'} and ${artifact.archivedOrderCount} of ${artifact.orderCount} ${artifact.orderCount === 1 ? 'sale' : 'sales'} are in this file. Shop cannot load this file back in.`),
    ...blank,
  ]]
  for (const close of artifact.closes) {
    rows.push([
      ...lead('close', null),
      close.closeId,
      close.businessDate,
      close.closedAt,
      close.operator,
      close.evidenceReference,
      close.digest,
      null, null, null, null, null,
      'MMK',
      null, null, null, null, null, null, null, null, null, null, null,
      close.totalMmk,
      null,
      null,
      close.paymentExceptionOrderIds,
      close.stockExceptionSkus,
    ])
    for (const order of close.orders) {
      rows.push([
        ...lead('order', null),
        close.closeId,
        close.businessDate,
        close.closedAt,
        null,
        null,
        close.digest,
        order.orderId,
        order.orderCreatedAt,
        order.paymentMethod,
        order.paymentReconciledAt,
        order.paymentEvidenceReference,
        order.currency,
        order.catalogRevision,
        order.taxConfigurationRevision,
        order.taxCode,
        order.taxJurisdictionCode,
        order.taxEffectiveFrom,
        order.taxRateBasisPoints,
        order.listedSubtotalMmk,
        order.subtotalMmk,
        order.taxMode,
        order.taxMmk,
        order.originalTotalMmk,
        order.totalMmk,
        JSON.stringify(order.corrections),
        order.calculationStatus,
        null,
        null,
      ])
    }
  }
  for (const gap of artifact.gaps) {
    rows.push([
      ...lead(gap.kind === 'close_without_evidence' ? 'close_not_archived' : 'sale_not_archived', gap.detail),
      gap.kind === 'close_without_evidence' ? gap.id : null,
      null, null, null, null, null,
      gap.kind === 'close_without_evidence' ? null : gap.id,
      // No money columns are filled on a gap row: a gap says a record is NOT in this file,
      // and inventing a currency or a zero total for it would let a reader sum the archive
      // and believe the sum covered everything.
      ...new Array(header.length - 18).fill(null) as Array<string | number | null | string[]>,
    ])
  }
  return [header, ...rows].map((row) => row.map(commerceCsvCell).join(',')).join('\r\n') + '\r\n'
}

function commerceAccountingHandoffProjection(artifact: Omit<CommerceAccountingHandoff, 'digest'>) {
  return [
    artifact.schema,
    artifact.status,
    artifact.postingAuthority,
    artifact.externalPostingPerformed,
    artifact.currency,
    artifact.closeId,
    artifact.businessDate,
    artifact.closedAt,
    artifact.sourceCloseDigest,
    artifact.accountMappingRevision,
    artifact.accountMappingEvidenceReference,
    artifact.originalOrderTotalMmk,
    artifact.netOrderTotalMmk,
    artifact.correctionCount,
    artifact.creditCorrectionMmk,
    artifact.debitCorrectionMmk,
    artifact.totalDebitMmk,
    artifact.totalCreditMmk,
    artifact.acceptedOrderCount,
    artifact.legacyUnverifiedOrderCount,
    artifact.taxConfiguredOrderCount,
    artifact.paymentExceptionOrderIds,
    artifact.stockExceptionSkus,
    artifact.entries.map((entry) => [
      entry.lineId,
      entry.side,
      entry.accountRole,
      entry.externalAccountCode,
      entry.paymentMethod,
      entry.sourceOrderId,
      entry.sourceDocumentId,
      entry.calculationStatus,
      entry.amountMmk,
      entry.mappingStatus,
    ]),
  ]
}

export function commerceAccountingHandoff(state: CommerceState, closeId: string): CommerceAccountingHandoff | null {
  const closeExport = commerceDailyCloseExport(state, closeId)
  if (!closeExport) return null
  const closeAt = timestampMicros(closeExport.closedAt) as bigint
  const accountMapping = commerceAccountMappingConfigurations(validateCommerceState(state)).find(
    (configuration) => (timestampMicros(configuration.proof.capturedAt) as bigint) <= closeAt,
  ) ?? null
  const externalAccountCodeByRole = new Map(
    accountMapping?.mappings.map((mapping) => [mapping.accountRole, mapping.externalAccountCode]) ?? [],
  )
  const mappedAccount = (accountRole: CommerceAccountRole) => externalAccountCodeByRole.get(accountRole) ?? null
  const mappedEntry = (accountRole: CommerceAccountRole) => {
    const externalAccountCode = mappedAccount(accountRole)
    return { externalAccountCode, mappingStatus: externalAccountCode ? 'mapped' as const : 'unmapped' as const }
  }
  const paymentGroups = new Map<string, { amountMmk: number; statuses: Set<CommerceDailyCloseExportOrder['calculationStatus']> }>()
  let acceptedSubtotalMmk = 0
  let acceptedTaxMmk = 0
  let legacyUnverifiedMmk = 0
  let acceptedOrderCount = 0
  let legacyUnverifiedOrderCount = 0
  let taxConfiguredOrderCount = 0
  let correctionCount = 0
  let creditCorrectionMmk = 0
  let debitCorrectionMmk = 0
  let originalOrderTotalMmk = 0
  for (const order of closeExport.orders) {
    const payment = paymentGroups.get(order.paymentMethod) ?? { amountMmk: 0, statuses: new Set() }
    payment.amountMmk += order.originalTotalMmk
    payment.statuses.add(order.calculationStatus)
    paymentGroups.set(order.paymentMethod, payment)
    originalOrderTotalMmk += order.originalTotalMmk
    if (order.calculationStatus === 'accepted' && order.subtotalMmk !== null && order.taxMmk !== null) {
      acceptedOrderCount += 1
      acceptedSubtotalMmk += order.subtotalMmk
      acceptedTaxMmk += order.taxMmk
      if (order.taxMode !== 'not_configured') taxConfiguredOrderCount += 1
    } else {
      legacyUnverifiedOrderCount += 1
      legacyUnverifiedMmk += order.originalTotalMmk
    }
  }
  const entries: CommerceAccountingHandoffEntry[] = [...paymentGroups.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([paymentMethod, group], index) => ({
      lineId: `DEBIT-${String(index + 1).padStart(3, '0')}`,
      side: 'debit',
      accountRole: 'payment_clearing',
      ...mappedEntry('payment_clearing'),
      paymentMethod,
      sourceOrderId: null,
      sourceDocumentId: null,
      calculationStatus: group.statuses.size > 1 ? 'mixed' : [...group.statuses][0],
      amountMmk: group.amountMmk,
    }))
  const credits: Array<Omit<CommerceAccountingHandoffEntry, 'lineId'>> = []
  if (acceptedSubtotalMmk) credits.push({
    side: 'credit',
    accountRole: 'sales_revenue',
    ...mappedEntry('sales_revenue'),
    paymentMethod: null,
    sourceOrderId: null,
    sourceDocumentId: null,
    calculationStatus: 'accepted',
    amountMmk: acceptedSubtotalMmk,
  })
  if (acceptedTaxMmk) credits.push({
    side: 'credit',
    accountRole: 'tax_payable',
    ...mappedEntry('tax_payable'),
    paymentMethod: null,
    sourceOrderId: null,
    sourceDocumentId: null,
    calculationStatus: 'accepted',
    amountMmk: acceptedTaxMmk,
  })
  if (legacyUnverifiedMmk) credits.push({
    side: 'credit',
    accountRole: 'sales_revenue_unverified',
    ...mappedEntry('sales_revenue_unverified'),
    paymentMethod: null,
    sourceOrderId: null,
    sourceDocumentId: null,
    calculationStatus: 'legacy_unverified',
    amountMmk: legacyUnverifiedMmk,
  })
  entries.push(...credits.map((entry, index) => ({ ...entry, lineId: `CREDIT-${String(index + 1).padStart(3, '0')}` })))
  const corrections = closeExport.orders.flatMap((order) => order.corrections.map((correction) => ({ order, correction })))
    .sort((left, right) => left.correction.createdAt.localeCompare(right.correction.createdAt)
      || left.order.orderId.localeCompare(right.order.orderId)
      || left.correction.documentId.localeCompare(right.correction.documentId))
  for (const [index, { order, correction }] of corrections.entries()) {
    correctionCount += 1
    const base = {
      paymentMethod: null,
      sourceOrderId: order.orderId,
      sourceDocumentId: correction.documentId,
      calculationStatus: order.calculationStatus,
    } as const
    const suffix = String(index + 1).padStart(3, '0')
    if (correction.kind === 'credit') {
      creditCorrectionMmk += correction.totalMmk
      if (correction.subtotalMmk) entries.push({
        lineId: `CORR-${suffix}-ADJ-D`, side: 'debit', accountRole: 'sales_adjustment',
        ...mappedEntry('sales_adjustment'), ...base, amountMmk: correction.subtotalMmk,
      })
      if (correction.taxMmk) entries.push({
        lineId: `CORR-${suffix}-TAX-D`, side: 'debit', accountRole: 'tax_payable',
        ...mappedEntry('tax_payable'), ...base, amountMmk: correction.taxMmk,
      })
      entries.push({
        lineId: `CORR-${suffix}-PAY-C`, side: 'credit', accountRole: 'correction_payable',
        ...mappedEntry('correction_payable'), ...base, amountMmk: correction.totalMmk,
      })
    } else {
      debitCorrectionMmk += correction.totalMmk
      entries.push({
        lineId: `CORR-${suffix}-REC-D`, side: 'debit', accountRole: 'correction_receivable',
        ...mappedEntry('correction_receivable'), ...base, amountMmk: correction.totalMmk,
      })
      if (correction.subtotalMmk) entries.push({
        lineId: `CORR-${suffix}-ADJ-C`, side: 'credit', accountRole: 'sales_adjustment',
        ...mappedEntry('sales_adjustment'), ...base, amountMmk: correction.subtotalMmk,
      })
      if (correction.taxMmk) entries.push({
        lineId: `CORR-${suffix}-TAX-C`, side: 'credit', accountRole: 'tax_payable',
        ...mappedEntry('tax_payable'), ...base, amountMmk: correction.taxMmk,
      })
    }
  }
  const totalDebitMmk = entries.filter((entry) => entry.side === 'debit').reduce((total, entry) => total + entry.amountMmk, 0)
  const totalCreditMmk = entries.filter((entry) => entry.side === 'credit').reduce((total, entry) => total + entry.amountMmk, 0)
  const expectedControlTotalMmk = originalOrderTotalMmk + creditCorrectionMmk + debitCorrectionMmk
  if (totalDebitMmk !== expectedControlTotalMmk || totalCreditMmk !== expectedControlTotalMmk) return null
  const artifact: Omit<CommerceAccountingHandoff, 'digest'> = {
    schema: COMMERCE_ACCOUNTING_HANDOFF_SCHEMA,
    status: 'review_required',
    postingAuthority: 'none',
    externalPostingPerformed: false,
    currency: 'MMK',
    closeId: closeExport.closeId,
    businessDate: closeExport.businessDate,
    closedAt: closeExport.closedAt,
    sourceCloseDigest: closeExport.digest,
    accountMappingRevision: accountMapping?.revision ?? null,
    accountMappingEvidenceReference: accountMapping?.proof.evidenceReference ?? null,
    originalOrderTotalMmk,
    netOrderTotalMmk: closeExport.totalMmk,
    correctionCount,
    creditCorrectionMmk,
    debitCorrectionMmk,
    totalDebitMmk,
    totalCreditMmk,
    acceptedOrderCount,
    legacyUnverifiedOrderCount,
    taxConfiguredOrderCount,
    paymentExceptionOrderIds: [...closeExport.paymentExceptionOrderIds],
    stockExceptionSkus: [...closeExport.stockExceptionSkus],
    entries,
  }
  return {
    ...artifact,
    digest: `sha256:${sha256Hex(JSON.stringify(commerceAccountingHandoffProjection(artifact)))}`,
  }
}

export function commerceAccountingHandoffCsv(artifact: CommerceAccountingHandoff) {
  const header = [
    'schema',
    'status',
    'posting_authority',
    'external_posting_performed',
    'close_id',
    'business_date',
    'closed_at',
    'currency',
    'source_close_digest',
    'account_mapping_revision',
    'account_mapping_evidence_reference',
    'original_order_total_mmk',
    'net_order_total_mmk',
    'correction_count',
    'credit_correction_mmk',
    'debit_correction_mmk',
    'line_id',
    'side',
    'account_role',
    'external_account_code',
    'payment_method',
    'source_order_id',
    'source_document_id',
    'calculation_status',
    'amount_mmk',
    'mapping_status',
    'accepted_order_count',
    'legacy_unverified_order_count',
    'tax_configured_order_count',
    'payment_exception_order_ids',
    'stock_exception_skus',
    'artifact_digest',
  ]
  const rows = artifact.entries.map((entry): Array<string | number | null | string[]> => [
    artifact.schema,
    artifact.status,
    artifact.postingAuthority,
    String(artifact.externalPostingPerformed),
    artifact.closeId,
    artifact.businessDate,
    artifact.closedAt,
    artifact.currency,
    artifact.sourceCloseDigest,
    artifact.accountMappingRevision,
    artifact.accountMappingEvidenceReference,
    artifact.originalOrderTotalMmk,
    artifact.netOrderTotalMmk,
    artifact.correctionCount,
    artifact.creditCorrectionMmk,
    artifact.debitCorrectionMmk,
    entry.lineId,
    entry.side,
    entry.accountRole,
    entry.externalAccountCode,
    entry.paymentMethod,
    entry.sourceOrderId,
    entry.sourceDocumentId,
    entry.calculationStatus,
    entry.amountMmk,
    entry.mappingStatus,
    artifact.acceptedOrderCount,
    artifact.legacyUnverifiedOrderCount,
    artifact.taxConfiguredOrderCount,
    artifact.paymentExceptionOrderIds,
    artifact.stockExceptionSkus,
    artifact.digest,
  ])
  return [header, ...rows].map((row) => row.map(commerceCsvCell).join(',')).join('\r\n') + '\r\n'
}

// Accounting handoff v4: the v3 close handoff plus the general-ledger section,
// delegating the journal derivation to shop-ledger-journal. Fails closed if the
// close handoff is unavailable or the ledger does not balance (buildShopLedger-
// Journal returns null on any imbalance) -- no partial handoff is emitted. The
// v3 close handoff is carried through byte-for-byte, so its own CSV still
// verifies against the same digest.
export function commerceAccountingHandoffV4(state: CommerceState, closeId: string): CommerceAccountingHandoffV4 | null {
  const closeHandoff = commerceAccountingHandoff(state, closeId)
  if (!closeHandoff) return null
  const journal = buildShopLedgerJournal(state)
  if (!journal) return null
  return {
    schema: COMMERCE_ACCOUNTING_HANDOFF_V4_SCHEMA,
    status: 'review_required',
    postingAuthority: 'none',
    externalPostingPerformed: false,
    closeHandoff,
    ledger: { journal, trialBalance: computeLedgerTrialBalance(journal) },
  }
}

function commerceSupplierPayablesHandoffProjection(artifact: Omit<CommerceSupplierPayablesHandoff, 'digest'>) {
  return [
    artifact.schema,
    artifact.status,
    artifact.paymentAuthority,
    artifact.paymentInitiated,
    artifact.accountingPosted,
    artifact.currency,
    artifact.generatedAt,
    artifact.readyInvoiceCount,
    artifact.excludedInvoiceCount,
    artifact.excludedInvoiceIds,
    artifact.grossInvoiceTotalMmk,
    artifact.supplierCreditTotalMmk,
    artifact.netPayableTotalMmk,
    artifact.rows.map((row) => [
      row.purchaseOrderId,
      row.requisitionId,
      row.supplier,
      row.sku,
      row.invoiceId,
      row.supplierInvoiceReference,
      row.invoiceIssuedAt,
      row.dueAt,
      row.orderedQuantity,
      row.acceptedQuantity,
      row.rejectedQuantity,
      row.invoicedQuantity,
      row.unitCostMmk,
      row.grossInvoiceMmk,
      row.supplierClaimMmk,
      row.supplierCreditMmk,
      row.netPayableMmk,
      row.payableReviewActionId,
      row.payableReviewedAt,
      row.payableReviewedBy,
      row.payableEvidenceReference,
      row.receiptMovementIds,
      row.supplierReturnClaimIds,
      row.supplierCreditNoteIds,
      row.physicalReturnStatus,
      row.supplierContacted,
      row.accountingPosted,
      row.paymentInitiated,
    ]),
  ]
}

function commerceSupplierPayablesHandoffDigest(artifact: Omit<CommerceSupplierPayablesHandoff, 'digest'>) {
  return `sha256:${sha256Hex(JSON.stringify(commerceSupplierPayablesHandoffProjection(artifact)))}`
}

export function commerceSupplierPayablesHandoff(state: CommerceState): CommerceSupplierPayablesHandoff | null {
  const current = validateCommerceState(state)
  const invoicedOrders = commercePurchaseOrders(current)
    .filter((purchaseOrder) => Boolean(purchaseOrder.supplierInvoice))
    .sort((left, right) => (left.supplierInvoice?.dueAt ?? '').localeCompare(right.supplierInvoice?.dueAt ?? '')
      || left.supplier.localeCompare(right.supplier)
      || (left.supplierInvoice?.id ?? '').localeCompare(right.supplierInvoice?.id ?? ''))
  const excludedInvoiceIds: string[] = []
  const rows: CommerceSupplierPayablesHandoffRow[] = []
  for (const purchaseOrder of invoicedOrders) {
    const invoice = purchaseOrder.supplierInvoice as CommerceSupplierInvoice
    const match = commerceSupplierInvoiceMatch(current, purchaseOrder)
    if (!match.payableReady || !invoice.payableReview) {
      excludedInvoiceIds.push(invoice.id)
      continue
    }
    const claims = commerceSupplierReturnClaims(purchaseOrder)
    const receiptMovementIds = current.movements
      .filter((movement) => movement.kind === 'receipt' && movement.purchaseOrderId === purchaseOrder.id)
      .map((movement) => movement.id)
      .sort()
    const supplierReturnClaimIds = claims.map((claim) => claim.id).sort()
    const supplierCreditNoteIds = claims.flatMap((claim) => claim.creditNotes.map((credit) => credit.id)).sort()
    rows.push({
      purchaseOrderId: purchaseOrder.id,
      requisitionId: purchaseOrder.requisitionId ?? null,
      supplier: purchaseOrder.supplier,
      sku: purchaseOrder.sku,
      invoiceId: invoice.id,
      supplierInvoiceReference: invoice.supplierReference,
      invoiceIssuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      orderedQuantity: match.orderedQuantity,
      acceptedQuantity: match.acceptedQuantity,
      rejectedQuantity: match.rejectedQuantity,
      invoicedQuantity: match.invoicedQuantity,
      unitCostMmk: match.invoicedUnitCostMmk,
      grossInvoiceMmk: match.invoicedTotalMmk,
      supplierClaimMmk: match.supplierClaimMmk,
      supplierCreditMmk: match.supplierCreditMmk,
      netPayableMmk: match.netInvoiceTotalMmk,
      payableReviewActionId: invoice.payableReview.actionId,
      payableReviewedAt: invoice.payableReview.capturedAt,
      payableReviewedBy: invoice.payableReview.actor,
      payableEvidenceReference: invoice.payableReview.evidenceReference,
      receiptMovementIds,
      supplierReturnClaimIds,
      supplierCreditNoteIds,
      physicalReturnStatus: match.rejectedQuantity ? 'not_dispatched' : 'not_required',
      supplierContacted: false,
      accountingPosted: false,
      paymentInitiated: false,
    })
  }
  if (!rows.length) return null
  const grossInvoiceTotalMmk = rows.reduce((total, row) => total + row.grossInvoiceMmk, 0)
  const supplierCreditTotalMmk = rows.reduce((total, row) => total + row.supplierCreditMmk, 0)
  const netPayableTotalMmk = rows.reduce((total, row) => total + row.netPayableMmk, 0)
  if (![grossInvoiceTotalMmk, supplierCreditTotalMmk, netPayableTotalMmk].every(Number.isSafeInteger)
    || grossInvoiceTotalMmk - supplierCreditTotalMmk !== netPayableTotalMmk) {
    throw new Error('Supplier payables handoff totals exceed the supported safe integer range or do not balance.')
  }
  const artifact: Omit<CommerceSupplierPayablesHandoff, 'digest'> = {
    schema: COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA,
    status: 'review_required',
    paymentAuthority: 'none',
    paymentInitiated: false,
    accountingPosted: false,
    currency: 'MMK',
    generatedAt: rows.map((row) => row.payableReviewedAt).sort().at(-1) as string,
    readyInvoiceCount: rows.length,
    excludedInvoiceCount: excludedInvoiceIds.length,
    excludedInvoiceIds,
    grossInvoiceTotalMmk,
    supplierCreditTotalMmk,
    netPayableTotalMmk,
    rows,
  }
  return { ...artifact, digest: commerceSupplierPayablesHandoffDigest(artifact) }
}

export function commerceSupplierPayablesHandoffCsv(artifact: CommerceSupplierPayablesHandoff) {
  const { digest, ...unsigned } = artifact
  if (artifact.schema !== COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA
    || digest !== commerceSupplierPayablesHandoffDigest(unsigned)) {
    throw new Error('Supplier payables handoff integrity check failed.')
  }
  const header = [
    'schema', 'status', 'payment_authority', 'payment_initiated', 'accounting_posted', 'currency',
    'generated_at', 'ready_invoice_count', 'excluded_invoice_count', 'excluded_invoice_ids',
    'gross_invoice_total_mmk', 'supplier_credit_total_mmk', 'net_payable_total_mmk',
    'purchase_order_id', 'requisition_id', 'supplier', 'sku', 'invoice_id', 'supplier_invoice_reference',
    'invoice_issued_at', 'due_at', 'ordered_quantity', 'accepted_quantity', 'rejected_quantity',
    'invoiced_quantity', 'unit_cost_mmk', 'gross_invoice_mmk', 'supplier_claim_mmk',
    'supplier_credit_mmk', 'net_payable_mmk', 'payable_review_action_id', 'payable_reviewed_at',
    'payable_reviewed_by', 'payable_evidence_reference', 'receipt_movement_ids',
    'supplier_return_claim_ids', 'supplier_credit_note_ids', 'physical_return_status',
    'supplier_contacted', 'row_accounting_posted', 'row_payment_initiated', 'artifact_digest',
  ]
  const rows = artifact.rows.map((row): Array<string | number | null | string[]> => [
    artifact.schema, artifact.status, artifact.paymentAuthority, String(artifact.paymentInitiated),
    String(artifact.accountingPosted), artifact.currency, artifact.generatedAt, artifact.readyInvoiceCount,
    artifact.excludedInvoiceCount, artifact.excludedInvoiceIds, artifact.grossInvoiceTotalMmk,
    artifact.supplierCreditTotalMmk, artifact.netPayableTotalMmk, row.purchaseOrderId, row.requisitionId,
    row.supplier, row.sku, row.invoiceId, row.supplierInvoiceReference, row.invoiceIssuedAt, row.dueAt,
    row.orderedQuantity, row.acceptedQuantity, row.rejectedQuantity, row.invoicedQuantity, row.unitCostMmk,
    row.grossInvoiceMmk, row.supplierClaimMmk, row.supplierCreditMmk, row.netPayableMmk,
    row.payableReviewActionId, row.payableReviewedAt, row.payableReviewedBy, row.payableEvidenceReference,
    row.receiptMovementIds, row.supplierReturnClaimIds, row.supplierCreditNoteIds, row.physicalReturnStatus,
    String(row.supplierContacted), String(row.accountingPosted), String(row.paymentInitiated), artifact.digest,
  ])
  return [header, ...rows].map((row) => row.map(commerceCsvCell).join(',')).join('\r\n') + '\r\n'
}

export function commerceSupplierPayablesAging(state: CommerceState, now: number): CommerceSupplierPayablesAging {
  const current = validateCommerceState(state)
  const safeNow = Number.isFinite(now) ? now : 0
  let blockedInvoiceCount = 0
  const rows = commercePurchaseOrders(current).flatMap((purchaseOrder): CommerceSupplierPayableAgingRow[] => {
    const invoice = purchaseOrder.supplierInvoice
    if (!invoice) return []
    const match = commerceSupplierInvoiceMatch(current, purchaseOrder)
    if (!match.payableReady) {
      blockedInvoiceCount += 1
      return []
    }
    const dueTime = Date.parse(invoice.dueAt)
    if (!Number.isFinite(dueTime)) return []
    const daysPastDue = safeNow > dueTime ? Math.ceil((safeNow - dueTime) / dayMilliseconds) : 0
    const daysUntilDue = safeNow < dueTime ? Math.ceil((dueTime - safeNow) / dayMilliseconds) : 0
    return [{
      purchaseOrderId: purchaseOrder.id,
      invoiceId: invoice.id,
      supplier: purchaseOrder.supplier,
      dueAt: invoice.dueAt,
      netPayableMmk: match.netInvoiceTotalMmk,
      daysPastDue,
      daysUntilDue,
      bucket: daysPastDue ? 'overdue' : daysUntilDue <= 7 ? 'due_7_days' : 'scheduled',
    }]
  }).sort((left, right) => {
    const rank: Record<CommerceSupplierPayableAgingBucket, number> = { overdue: 0, due_7_days: 1, scheduled: 2 }
    return rank[left.bucket] - rank[right.bucket]
      || left.dueAt.localeCompare(right.dueAt)
      || left.invoiceId.localeCompare(right.invoiceId)
  })
  const buckets: CommerceSupplierPayableAgingBucket[] = ['overdue', 'due_7_days', 'scheduled']
  const totalsMmk = Object.fromEntries(buckets.map((bucket) => [
    bucket,
    rows.filter((row) => row.bucket === bucket).reduce((total, row) => total + row.netPayableMmk, 0),
  ])) as Record<CommerceSupplierPayableAgingBucket, number>
  const totalNetPayableMmk = rows.reduce((total, row) => total + row.netPayableMmk, 0)
  if (![...Object.values(totalsMmk), totalNetPayableMmk].every(Number.isSafeInteger)) {
    throw new Error('Supplier payables aging totals exceed the supported safe integer range.')
  }
  return {
    asOf: new Date(safeNow).toISOString(),
    rows,
    totalsMmk,
    totalNetPayableMmk,
    overdueInvoiceCount: rows.filter((row) => row.bucket === 'overdue').length,
    dueWithin7DaysInvoiceCount: rows.filter((row) => row.bucket === 'due_7_days').length,
    blockedInvoiceCount,
    paymentAuthority: 'none',
    paymentInitiated: false,
  }
}

function commerceCustomerReceivablesHandoffProjection(artifact: Omit<CommerceCustomerReceivablesHandoff, 'digest'>) {
  return [
    artifact.schema,
    artifact.status,
    artifact.collectionAuthority,
    artifact.paymentReceived,
    artifact.accountingPosted,
    artifact.currency,
    artifact.generatedAt,
    artifact.outstandingOrderCount,
    artifact.overdueOrderCount,
    artifact.totalOutstandingMmk,
    artifact.overdueOutstandingMmk,
    receivableBuckets.map((bucket) => [bucket, artifact.bucketTotalsMmk[bucket]]),
    artifact.rows.map((row) => [
      row.orderId,
      row.customer,
      row.paymentMethod,
      row.createdAt,
      row.dueAt,
      row.balanceMmk,
      row.daysPastDue,
      row.bucket,
      row.collectionActionCount,
      row.lastCollectionAt,
      row.lastCollectionActor,
      row.lastCollectionEvidence,
      row.collectionAuthorized,
    ]),
  ]
}

function commerceCustomerReceivablesHandoffDigest(artifact: Omit<CommerceCustomerReceivablesHandoff, 'digest'>) {
  return `sha256:${sha256Hex(JSON.stringify(commerceCustomerReceivablesHandoffProjection(artifact)))}`
}

export function commerceCustomerReceivablesHandoff(state: CommerceState, now: number): CommerceCustomerReceivablesHandoff | null {
  const aging = commerceReceivablesAging(state, now)
  if (!aging.rows.length) return null
  const orderMap = new Map(state.orders.map((order) => [order.id, order]))
  const rows: CommerceCustomerReceivablesHandoffRow[] = aging.rows.map((agingRow) => {
    const order = orderMap.get(agingRow.orderId)
    const lastAction = agingRow.lastCollectionAction ?? null
    return {
      orderId: agingRow.orderId,
      customer: agingRow.customer,
      paymentMethod: agingRow.paymentMethod,
      createdAt: order?.createdAt ?? agingRow.dueAt,
      dueAt: agingRow.dueAt,
      balanceMmk: agingRow.balanceMmk,
      daysPastDue: agingRow.daysPastDue,
      bucket: agingRow.bucket,
      collectionActionCount: agingRow.collectionActionCount,
      lastCollectionAt: lastAction?.capturedAt ?? null,
      lastCollectionActor: lastAction?.actor ?? null,
      lastCollectionEvidence: lastAction?.evidenceReference ?? null,
      collectionAuthorized: false,
    }
  })
  if (![aging.totalOutstandingMmk, aging.overdueMmk].every(Number.isSafeInteger)) {
    throw new Error('Customer receivables handoff totals exceed the supported safe integer range.')
  }
  const artifact: Omit<CommerceCustomerReceivablesHandoff, 'digest'> = {
    schema: COMMERCE_CUSTOMER_RECEIVABLES_HANDOFF_SCHEMA,
    status: 'review_required',
    collectionAuthority: 'none',
    paymentReceived: false,
    accountingPosted: false,
    currency: 'MMK',
    generatedAt: aging.asOf,
    outstandingOrderCount: aging.rows.length,
    overdueOrderCount: aging.overdueOrders,
    totalOutstandingMmk: aging.totalOutstandingMmk,
    overdueOutstandingMmk: aging.overdueMmk,
    bucketTotalsMmk: aging.totalsMmk,
    rows,
  }
  return { ...artifact, digest: commerceCustomerReceivablesHandoffDigest(artifact) }
}

export function commerceCustomerReceivablesHandoffCsv(artifact: CommerceCustomerReceivablesHandoff) {
  const { digest, ...unsigned } = artifact
  if (artifact.schema !== COMMERCE_CUSTOMER_RECEIVABLES_HANDOFF_SCHEMA
    || digest !== commerceCustomerReceivablesHandoffDigest(unsigned)) {
    throw new Error('Customer receivables handoff integrity check failed.')
  }
  const header = [
    'schema', 'status', 'collection_authority', 'payment_received', 'accounting_posted', 'currency',
    'generated_at', 'outstanding_order_count', 'overdue_order_count',
    'total_outstanding_mmk', 'overdue_outstanding_mmk',
    'bucket_current_mmk', 'bucket_1_7_mmk', 'bucket_8_30_mmk', 'bucket_31_60_mmk', 'bucket_over_60_mmk',
    'order_id', 'customer', 'payment_method', 'created_at', 'due_at', 'balance_mmk',
    'days_past_due', 'bucket', 'collection_action_count',
    'last_collection_at', 'last_collection_actor', 'last_collection_evidence',
    'row_collection_authorized', 'artifact_digest',
  ]
  const rows = artifact.rows.map((row): Array<string | number | null | string[]> => [
    artifact.schema, artifact.status, artifact.collectionAuthority, String(artifact.paymentReceived),
    String(artifact.accountingPosted), artifact.currency, artifact.generatedAt,
    artifact.outstandingOrderCount, artifact.overdueOrderCount,
    artifact.totalOutstandingMmk, artifact.overdueOutstandingMmk,
    artifact.bucketTotalsMmk['current'], artifact.bucketTotalsMmk['1_7'],
    artifact.bucketTotalsMmk['8_30'], artifact.bucketTotalsMmk['31_60'], artifact.bucketTotalsMmk['over_60'],
    row.orderId, row.customer, row.paymentMethod, row.createdAt, row.dueAt, row.balanceMmk,
    row.daysPastDue, row.bucket, row.collectionActionCount,
    row.lastCollectionAt, row.lastCollectionActor, row.lastCollectionEvidence,
    String(row.collectionAuthorized), artifact.digest,
  ])
  return [header, ...rows].map((row) => row.map(commerceCsvCell).join(',')).join('\r\n') + '\r\n'
}

export function advanceCommerceOrder(
  state: CommerceState,
  orderId: string,
  expectedStatus: CommerceOrderStatus,
  proof?: CommerceActionProof,
  timestampAuthority: 'client' | 'managed-server' = 'client',
) {
  const current = validateCommerceState(state)
  const order = current.orders.find((candidate) => candidate.id === orderId)
  if (order && proof && validProof(proof)) {
    const advanceTargets: Record<'confirmed' | 'preparing' | 'ready', CommerceOrderStatus> = { confirmed: 'preparing', preparing: 'ready', ready: 'completed' }
    const replayed = (expectedStatus === 'confirmed' || expectedStatus === 'preparing')
      ? order.status === advanceTargets[expectedStatus]
        && order.advancementActionIds?.[order.advancementActionIds.length - 1] === proof.actionId
      : expectedStatus === 'ready'
        ? order.status === 'completed' && order.completion?.actionId === proof.actionId
        : false
    if (replayed) return current
  }
  if (!order || order.status !== expectedStatus || order.status === 'completed' || order.status === 'cancelled') return null
  const currentStatus = order.status as 'confirmed' | 'preparing' | 'ready'
  if (order.status === 'ready' && order.paymentStatus !== 'reconciled') return null
  if (!proof
    || !validProof(proof)
    || [proof.actionId, proof.actor, proof.reason, proof.evidenceReference].some((value) => value !== value.trim())
    || actionIdIsUsed(current, proof.actionId)) return null
  let retainedProof = proof
  if (order.status === 'ready') {
    const chronology = [
      order.createdAt,
      order.paymentReconciledAt,
      ...current.movements.filter((movement) => movement.orderId === order.id).map((movement) => movement.createdAt),
    ].flatMap((timestamp) => timestamp ? [{ timestamp, micros: timestampMicros(timestamp) as bigint }] : [])
    const latestBasis = chronology.reduce(
      (latest, candidate) => candidate.micros > latest.micros ? candidate : latest,
      { timestamp: proof.capturedAt, micros: 0n },
    )
    if ((timestampMicros(proof.capturedAt) as bigint) < latestBasis.micros) {
      if (timestampAuthority !== 'managed-server') return null
      retainedProof = { ...proof, capturedAt: latestBasis.timestamp }
    }
  }
  const next: Record<'confirmed' | 'preparing' | 'ready', CommerceOrderStatus> = { confirmed: 'preparing', preparing: 'ready', ready: 'completed' }
  let inventoryFoundation = current.inventoryFoundation
  if (currentStatus === 'ready' && inventoryFoundation) {
    try {
      const catalogSkus = current.items.map((item) => item.sku).sort()
      if (!shopInventoryMatchesItems(inventoryFoundation, current.items)) return null
      const locationResult = fulfilShopInventoryOrder(inventoryFoundation, {
        orderId,
        proof: retainedProof,
        catalogSkus,
        expectedHeadDigest: inventoryFoundation.headDigest,
      })
      if (locationResult.replayed || !shopInventoryMatchesItems(locationResult.state, current.items)) return null
      inventoryFoundation = locationResult.state
    } catch {
      return null
    }
  }
  return validateCommerceState({
    ...current,
    orders: current.orders.map((candidate) => candidate.id === orderId ? {
      ...candidate,
      status: next[currentStatus],
      ...(currentStatus !== 'ready'
        ? { advancementActionIds: [...(candidate.advancementActionIds ?? []), proof.actionId] }
        : {}),
      ...(currentStatus === 'ready' ? { completion: { ...retainedProof } } : {}),
    } : candidate),
    ...(inventoryFoundation ? { inventoryFoundation } : {}),
  })
}
