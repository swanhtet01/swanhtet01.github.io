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
  returnShopInventoryOrder,
  type ShopInventoryOrderReturnAllocation,
  type ShopInventoryState,
} from './shop-inventory-foundation.ts'

export const COMMERCE_WORKSPACE_SCHEMA = 'supermega.commerce.workspace.v2' as const
export const COMMERCE_STOREFRONT_SCHEMA = 'supermega.ecommerce.storefront.v1' as const
export const COMMERCE_ORDER_CALCULATION_SCHEMA = 'supermega.commerce.order-calculation.v1' as const
export const COMMERCE_ORDER_CALCULATION_V2_SCHEMA = 'supermega.commerce.order-calculation.v2' as const
export const COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA = 'supermega.commerce.daily-close-export.v3' as const
export const COMMERCE_ACCOUNTING_HANDOFF_SCHEMA = 'supermega.commerce.accounting-handoff.v2' as const
export const COMMERCE_CLOSE_SETTLEMENT_SCHEMA = 'supermega.commerce.close-settlement.v1' as const
const COMMERCE_STOREFRONT_PREVIEW_SCHEMA = 'supermega.ecommerce.storefront_preview.v1' as const
export const COMMERCE_KEY = 'supermega.commerce.workspace.v2'
export const LEGACY_COMMERCE_KEYS = ['supermega.commerce.workspace.v1', 'supermega.shop.workspace.v2']
export const COMMERCE_LOCK = 'supermega-commerce-workspace-v2'

export type CommerceItem = {
  sku: string
  name: string
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

export type CommerceAccountRole = 'payment_clearing' | 'sales_revenue' | 'sales_revenue_unverified' | 'tax_payable'

export type CommerceAccountMappingEntry = {
  accountRole: CommerceAccountRole
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
  sourceRecordId?: string
  evidenceReference?: string
  lines?: CommerceOrderLine[]
  advancementActionIds?: string[]
  completion?: CommerceActionProof
  returns?: CommerceOrderReturn[]
  corrections?: CommerceOrderCorrection[]
  calculation?: CommerceOrderCalculation
  total: number
  status: CommerceOrderStatus
}

export type CommerceOrderPromiseUrgency = 'late' | 'due_soon' | 'scheduled' | 'unrecorded'

export function commerceOrderPromiseUrgency(order: CommerceOrder, now: number): CommerceOrderPromiseUrgency {
  const promisedAt = order.promisedAt ? Date.parse(order.promisedAt) : Number.NaN
  if (!Number.isFinite(promisedAt) || !Number.isFinite(now)) return 'unrecorded'
  if (promisedAt <= now) return 'late'
  return promisedAt - now <= 60 * 60 * 1000 ? 'due_soon' : 'scheduled'
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

export type CommerceStockMovementKind = 'opening' | 'reserve' | 'release' | 'receipt' | 'count' | 'return' | 'production_issue' | 'production_receipt'

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
  createdAt: string
  expectedAt?: string
  supplier: string
  sku: string
  quantityOrdered: number
  creation: CommerceActionProof
  cancellation?: CommerceActionProof
}

export type CommercePurchaseOrderProgress = {
  received: number
  remaining: number
  status: 'open' | 'partially_received' | 'received' | 'cancelled'
}

export type CommercePurchaseOrderArrivalUrgency = 'late' | 'due_soon' | 'scheduled' | 'unrecorded' | 'closed'

export type CommerceSupplierPerformanceStatus = 'attention' | 'on_track' | 'collecting'

export type CommerceSupplierPerformance = {
  supplier: string
  totalOrders: number
  activeOrders: number
  orderedUnits: number
  receivedUnits: number
  openUnits: number
  lateOpenOrders: number
  completedDeliveries: number
  onTimeDeliveries: number
  lateDeliveries: number
  receiptRateBasisPoints: number
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
  websiteIntakes?: CommerceWebsiteIntake[]
  storefrontRequests?: CommerceStorefrontRequest[]
  storefrontConfiguration?: CommerceStorefrontConfiguration
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
  expectedAt: string
  supplier: string
  sku: string
  quantityOrdered: number
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

export type CommerceMutationResult =
  | { ok: true; state: CommerceState; replayed: boolean }
  | { ok: false; error: string }

const orderStatuses: CommerceOrderStatus[] = ['confirmed', 'preparing', 'ready', 'completed', 'cancelled']
const paymentStatuses: CommercePaymentStatus[] = ['pending', 'reconciled']
const refundStatuses: CommerceRefundStatus[] = ['none', 'due', 'settled']
const movementKinds: CommerceStockMovementKind[] = ['opening', 'reserve', 'release', 'receipt', 'count', 'return', 'production_issue', 'production_receipt']
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
const productionReceiptFields = [
  'productionReleaseId',
  'productionCommandDigest',
  'productionJobId',
  'productionOutputBatchId',
  'productionReleasedAt',
  'productionSourceProduct',
] as const
const productionIssueExclusiveFields = ['productionRequestId', 'productionMaterialId', 'productionInputLotId', 'productionQuantityMilli', 'productionUnit', 'conversionNote'] as const
const productionReceiptExclusiveFields = ['productionReleaseId', 'productionOutputBatchId', 'productionReleasedAt', 'productionSourceProduct'] as const
const returnDispositions: CommerceReturnDisposition[] = ['restock', 'not_restocked']
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
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/
const maxStorefrontRequests = 100
const maxPurchaseOrders = 100
const maxCatalogBaselines = 500
const maxCatalogChanges = 500
const maxTaxConfigurations = 100
const maxAccountMappingConfigurations = 100
const maxOrderLines = 20
const maxReturnsPerOrder = 100
const maxCorrectionsPerOrder = 100
const closeIdPattern = /^CLOSE-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const closeActionIdPattern = /^ACT-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/
const purchaseOrderIdPattern = /^PO-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const taxCodePattern = /^[A-Z0-9][A-Z0-9_-]{0,11}$/
const taxJurisdictionCodePattern = /^[A-Z0-9][A-Z0-9_-]{1,15}$/
const externalAccountCodePattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/
export const commerceAccountRoles: CommerceAccountRole[] = ['payment_clearing', 'sales_revenue', 'sales_revenue_unverified', 'tax_payable']
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

function storefrontRequestV2(value: Record<string, unknown>, field: string): CommerceStorefrontRequestV2 {
  const requestFields = [
    'schema', 'mode', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt', 'sourcePreviewDigest',
    'sourceStorefrontRevision', 'sourceStorefrontActionId', 'customerReference', 'fulfilment', 'currency',
    'lines', 'quote', 'totalMmk',
  ]
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
  if (value.currency !== 'MMK' || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > maxOrderLines) throw new Error(`${field} currency or lines are invalid.`)
  const lines = value.lines.map((line, index) => storefrontRequestLineV2(line, `${field}.lines[${index}]`))
  if (lines.some((line, index) => index > 0 && compareCanonicalText(lines[index - 1].sku, line.sku) >= 0)) throw new Error(`${field}.lines must use unique canonical SKU order.`)
  const subtotalMmk = lines.reduce((total, line) => total + line.lineTotalMmk, 0)
  assertSafeInteger(subtotalMmk, `${field}.subtotalMmk`, 1)
  assertSafeInteger(value.totalMmk, `${field}.totalMmk`, 1)
  if (value.totalMmk !== subtotalMmk) throw new Error(`${field}.totalMmk is invalid.`)

  if (!isRecord(value.quote)) throw new Error(`${field}.quote is invalid.`)
  const quote = value.quote
  const quoteFields = [
    'schema', 'scope', 'quoteId', 'idempotencyKey', 'quotedAt', 'expiresAt', 'sourcePreviewDigest',
    'pimDigest', 'currency', 'customerReference', 'fulfilment', 'lines', 'subtotalMmk', 'promotion',
    'tax', 'shipping', 'payment', 'totalMmk', 'quoteDigest',
  ]
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

function myanmarBusinessDate(timestamp: string) {
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

function sha256Hex(source: string) {
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
  return { schema: COMMERCE_WORKSPACE_SCHEMA, items: [], orders: [], movements: [], closes: [], catalogBaselines: [], catalogChanges: [], websiteIntakes: [], storefrontRequests: [], purchaseOrders: [] }
}

export function createSeedCommerce(now = deterministicSeedNow): CommerceState {
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
    actor: 'Demo operator',
    reason: 'Anchor the seeded Shop catalog values.',
    evidenceReference: 'DEMO-SEED-CATALOG',
  }
  return {
    schema: COMMERCE_WORKSPACE_SCHEMA,
    items,
    orders: [
      { id: 'ORD-1042', createdAt: firstOrderAt, customer: 'May', owner: 'Demo operator', channel: 'Messenger', item: 'Daily essentials basket', itemSku: 'SM-1001', quantity: 2, payment: 'KBZPay', paymentStatus: 'pending', refundStatus: 'none', promisedAt: new Date(now + 60 * 60 * 1000).toISOString(), calculation: { schema: COMMERCE_ORDER_CALCULATION_SCHEMA, currency: 'MMK', catalogRevision: 0, subtotalMmk: 37000, taxMode: 'not_configured', taxMmk: 0, totalMmk: 37000 }, total: 37000, status: 'preparing' },
      { id: 'ORD-1041', createdAt: secondOrderAt, customer: 'Ko Aung', owner: 'Demo operator', channel: 'Phone', item: 'Household refill', itemSku: 'SM-1003', quantity: 1, payment: 'Cash on delivery', paymentStatus: 'pending', refundStatus: 'none', promisedAt: new Date(now + 90 * 60 * 1000).toISOString(), calculation: { schema: COMMERCE_ORDER_CALCULATION_SCHEMA, currency: 'MMK', catalogRevision: 0, subtotalMmk: 12000, taxMode: 'not_configured', taxMmk: 0, totalMmk: 12000 }, total: 12000, status: 'ready' },
    ],
    movements: [
      { id: 'MOV-ACT-DEMO-1042', actionId: 'ACT-DEMO-1042', createdAt: firstOrderAt, actor: 'Demo operator', reason: 'Seed the local Commerce walkthrough.', evidenceReference: 'DEMO-SEED-ORD-1042', kind: 'reserve', sku: 'SM-1001', quantityDelta: -2, orderId: 'ORD-1042' },
      { id: 'MOV-ACT-DEMO-1041', actionId: 'ACT-DEMO-1041', createdAt: secondOrderAt, actor: 'Demo operator', reason: 'Seed the local Commerce walkthrough.', evidenceReference: 'DEMO-SEED-ORD-1041', kind: 'reserve', sku: 'SM-1003', quantityDelta: -1, orderId: 'ORD-1041' },
    ],
    closes: [],
    catalogBaselines: items.map((item) => createCommerceCatalogBaseline(item, baselineProof)),
    catalogChanges: [],
    websiteIntakes: [],
    storefrontRequests: [],
    purchaseOrders: [],
  }
}

export function validateCommerceState(value: unknown): CommerceState {
  if (!isRecord(value) || value.schema !== COMMERCE_WORKSPACE_SCHEMA) throw new Error('Commerce workspace schema is not v2.')
  if (!Array.isArray(value.items) || !Array.isArray(value.orders) || !Array.isArray(value.movements) || !Array.isArray(value.closes)) throw new Error('Commerce workspace collections are incomplete.')
  if (value.catalogBaselines !== undefined && !Array.isArray(value.catalogBaselines)) throw new Error('Commerce catalog baselines must be an array when present.')
  if (value.catalogChanges !== undefined && !Array.isArray(value.catalogChanges)) throw new Error('Commerce catalog changes must be an array when present.')
  if (value.taxConfigurations !== undefined && !Array.isArray(value.taxConfigurations)) throw new Error('Commerce tax configurations must be an array when present.')
  if (value.accountMappingConfigurations !== undefined && !Array.isArray(value.accountMappingConfigurations)) throw new Error('Commerce account mapping configurations must be an array when present.')
  if (value.websiteIntakes !== undefined && !Array.isArray(value.websiteIntakes)) throw new Error('Commerce Website intakes must be an array when present.')
  if (value.storefrontRequests !== undefined && !Array.isArray(value.storefrontRequests)) throw new Error('Commerce storefront requests must be an array when present.')
  if (value.storefrontConfiguration !== undefined && !isRecord(value.storefrontConfiguration)) throw new Error('Commerce storefront configuration must be an object when present.')
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
  const websiteIntakes = (value.websiteIntakes ?? []) as unknown[]
  const storefrontRequests = (value.storefrontRequests ?? []) as unknown[]
  const storefrontConfiguration = value.storefrontConfiguration
  const purchaseOrders = (value.purchaseOrders ?? []) as unknown[]
  if (catalogBaselines.length > maxCatalogBaselines) throw new Error(`Commerce catalog baselines cannot exceed ${maxCatalogBaselines}.`)
  if (catalogChanges.length > maxCatalogChanges) throw new Error(`Commerce catalog changes cannot exceed ${maxCatalogChanges}.`)
  if (taxConfigurations.length > maxTaxConfigurations) throw new Error(`Commerce tax configurations cannot exceed ${maxTaxConfigurations}.`)
  if (accountMappingConfigurations.length > maxAccountMappingConfigurations) throw new Error(`Commerce account mapping configurations cannot exceed ${maxAccountMappingConfigurations}.`)
  if (storefrontRequests.length > maxStorefrontRequests) throw new Error(`Commerce storefront requests cannot exceed ${maxStorefrontRequests}.`)
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
  const correctionActionIds: string[] = []
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
  const purchaseOrderActionIds: string[] = []
  const purchaseOrderIds: string[] = []
  const activePurchaseOrderSkus: string[] = []
  const purchaseOrderById = new Map<string, CommercePurchaseOrder>()
  let storefrontConfigurationActionId = ''

  for (const [index, candidate] of items.entries()) {
    if (!isRecord(candidate)) throw new Error(`items[${index}] is invalid.`)
    const sku = canonicalText(candidate.sku, `items[${index}].sku`, 80)
    itemSkus.push(sku)
    itemBySku.set(sku, candidate)
    canonicalText(candidate.name, `items[${index}].name`)
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
    if (!Array.isArray(candidate.mappings) || candidate.mappings.length !== commerceAccountRoles.length) {
      throw new Error(`accountMappingConfigurations[${index}].mappings must cover every account role exactly once.`)
    }
    for (const [mappingIndex, mapping] of candidate.mappings.entries()) {
      const field = `accountMappingConfigurations[${index}].mappings[${mappingIndex}]`
      if (!isRecord(mapping) || !hasExactKeys(mapping, ['accountRole', 'externalAccountCode'])
        || mapping.accountRole !== commerceAccountRoles[mappingIndex]) {
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

  for (const [index, candidate] of purchaseOrders.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['id', 'createdAt', 'supplier', 'sku', 'quantityOrdered', 'creation'],
      ['expectedAt', 'cancellation'],
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
    if (!isRecord(candidate.creation)
      || !hasExactKeys(candidate.creation, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
      || !validProof(candidate.creation as CommerceActionProof)
      || candidate.creation.capturedAt !== candidate.createdAt) {
      throw new Error(`purchaseOrders[${index}].creation is invalid.`)
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
    purchaseOrderIds.push(id)
    purchaseOrderById.set(id, candidate as unknown as CommercePurchaseOrder)
  }
  assertUnique(purchaseOrderIds, 'Purchase order ID')

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
          || (capturedLineSubtotal !== null && calculation.subtotalMmk !== capturedLineSubtotal)) {
          throw new Error(`orders[${index}].calculation must preserve its deterministic untaxed MMK subtotal.`)
        }
      } else {
        assertSafeInteger(calculation.taxConfigurationRevision, `orders[${index}].calculation.taxConfigurationRevision`, 1)
        assertSafeInteger(calculation.taxRateBasisPoints, `orders[${index}].calculation.taxRateBasisPoints`)
        assertSafeInteger(calculation.listedSubtotalMmk, `orders[${index}].calculation.listedSubtotalMmk`, 1)
        const configuration = (taxConfigurations as CommerceTaxConfiguration[]).find((entry) => entry.revision === calculation.taxConfigurationRevision)
        const expected = configuration && capturedLineSubtotal !== null
          ? configuredOrderCalculation(configuration, capturedLineSubtotal, Number(calculation.catalogRevision))
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
    } else if (capturedLineSubtotal !== null && candidate.total !== capturedLineSubtotal) {
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
    orderById.set(candidate.id as string, candidate)
  }
  assertUnique(orderIds, 'Order ID')
  assertUnique(sourceRecordIds, 'Order source record ID')
  assertUnique(reconciliationActionIds, 'Payment reconciliation action ID')
  assertUnique(refundSettlementActionIds, 'Refund settlement action ID')
  assertUnique(completionActionIds, 'Order completion action ID')
  assertUnique(returnActionIds, 'Order return action ID')
  assertUnique(correctionActionIds, 'Order correction action ID')

  const reserveByOrder = new Map<string, number>()
  const releaseByOrder = new Map<string, number>()
  const reserveActionsByOrder = new Map<string, Set<string>>()
  const releaseActionsByOrder = new Map<string, Set<string>>()
  const reserveMovementByOrder = new Map<string, CommerceStockMovement>()
  const movementsByAction = new Map<string, CommerceStockMovement[]>()
  const receiptQuantityByPurchaseOrder = new Map<string, number>()
  const latestReceiptAtByPurchaseOrder = new Map<string, bigint>()
  const productionRequestIds: string[] = []
  const productionReleaseIds: string[] = []
  const productionSkuBySourceProduct = new Map<string, string>()
  for (const [index, candidate] of movements.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(
      candidate,
      ['id', 'actionId', 'createdAt', 'actor', 'reason', 'evidenceReference', 'kind', 'sku', 'quantityDelta'],
      ['orderId', 'purchaseOrderId', 'expectedQuantity', 'countedQuantity', ...productionIssueFields, ...productionReceiptExclusiveFields],
    )) throw new Error(`movements[${index}] is invalid.`)
    movementIds.push(requiredText(candidate.id, `movements[${index}].id`))
    movementActionIds.push(requiredText(candidate.actionId, `movements[${index}].actionId`))
    if (!validTimestamp(candidate.createdAt)) throw new Error(`movements[${index}].createdAt is invalid.`)
    for (const field of ['actor', 'reason', 'evidenceReference', 'sku'] as const) requiredText(candidate[field], `movements[${index}].${field}`)
    if (!itemSkus.includes(candidate.sku as string)) throw new Error(`movements[${index}].sku is unknown.`)
    if (!movementKinds.includes(candidate.kind as CommerceStockMovementKind)) throw new Error(`movements[${index}].kind is invalid.`)
    const retainedProductionFields = productionIssueFields.filter((field) => candidate[field] !== undefined)
    const retainedProductionReceiptFields = productionReceiptFields.filter((field) => candidate[field] !== undefined)
    if (candidate.kind === 'production_issue') {
      if (retainedProductionFields.length !== productionIssueFields.length
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
    } else if (candidate.kind === 'production_receipt') {
      if (retainedProductionReceiptFields.length !== productionReceiptFields.length
        || productionIssueExclusiveFields.some((field) => candidate[field] !== undefined)
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
    } else if (retainedProductionFields.length || retainedProductionReceiptFields.length) {
      throw new Error(`movements[${index}] production fields are unsupported for ${String(candidate.kind)}.`)
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
    if (candidate.kind === 'production_receipt') continue
    if (candidate.kind === 'receipt') {
      if (candidate.orderId !== undefined) throw new Error(`movements[${index}] receipt cannot reference an order.`)
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
        if (!Number.isSafeInteger(received) || received > purchaseOrder.quantityOrdered) {
          throw new Error(`movements[${index}] exceeds its purchase order quantity.`)
        }
        receiptQuantityByPurchaseOrder.set(purchaseOrderId, received)
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
    if (purchaseOrder.cancellation) {
      if (received >= purchaseOrder.quantityOrdered
        || (timestampMicros(purchaseOrder.cancellation.capturedAt) as bigint) < (latestReceiptAtByPurchaseOrder.get(purchaseOrder.id) ?? 0n)) {
        throw new Error(`${purchaseOrder.id} has an invalid cancellation boundary.`)
      }
    } else if (received < purchaseOrder.quantityOrdered) {
      activePurchaseOrderSkus.push(purchaseOrder.sku)
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
    ...catalogChangeActionIds.filter((actionId) => !catalogBaselineActionSet.has(actionId)),
    ...catalogBaselineActionSet,
    ...taxConfigurationActionIds,
    ...accountMappingConfigurationActionIds,
    ...websiteIntakeCreationActionIds,
    ...closeActionIds,
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

export function loadCommerceWorkspace(storage = browserStorage()): CommerceWorkspaceSnapshot {
  if (!storage) return { state: createEmptyCommerce(), source: 'recovery', error: 'Commerce storage is unavailable. No local data was replaced.' }
  let currentRaw: string | null
  try { currentRaw = storage.getItem(COMMERCE_KEY) } catch { return { state: createEmptyCommerce(), source: 'recovery', error: 'Commerce storage could not be read. No local data was replaced.' } }
  if (currentRaw !== null) {
    try {
      return { state: validateCommerceState(JSON.parse(currentRaw)), source: 'current', error: '' }
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
  return persistInitialState(storage, createSeedCommerce(), 'seed')
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
    || state.orders.some((order) => order.corrections?.some((record) => record.actionId === actionId))
    || state.closes.some((close) => close.actionId === actionId)
    || commerceCatalogBaselines(state).some((baseline) => baseline.proof.actionId === actionId)
    || commerceCatalogChanges(state).some((change) => change.proof.actionId === actionId)
    || commerceTaxConfigurations(state).some((configuration) => configuration.proof.actionId === actionId)
    || commerceAccountMappingConfigurations(state).some((configuration) => configuration.proof.actionId === actionId)
    || commerceWebsiteIntakes(state).some((intake) => intake.creation.actionId === actionId || intake.conversion?.actionId === actionId)
    || commercePurchaseOrders(state).some((purchaseOrder) => purchaseOrder.creation.actionId === actionId || purchaseOrder.cancellation?.actionId === actionId)
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

export function commerceOrderCalculationDigest(order: CommerceOrder) {
  if (!order.calculation) return null
  return `sha256:${sha256Hex(JSON.stringify([
    'supermega.commerce.order-calculation.snapshot.v1',
    order.id,
    order.calculation,
  ]))}`
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

export function commerceStorefrontConfiguration(state: CommerceState) {
  return state.storefrontConfiguration ?? null
}

export function commercePurchaseOrders(state: CommerceState) {
  return state.purchaseOrders ?? []
}

export function commercePurchaseOrderProgress(state: CommerceState, purchaseOrder: CommercePurchaseOrder): CommercePurchaseOrderProgress {
  const received = state.movements
    .filter((movement) => movement.kind === 'receipt' && movement.purchaseOrderId === purchaseOrder.id)
    .reduce((total, movement) => total + movement.quantityDelta, 0)
  const remaining = purchaseOrder.quantityOrdered - received
  return {
    received,
    remaining,
    status: purchaseOrder.cancellation
      ? 'cancelled'
      : remaining === 0
        ? 'received'
        : received > 0
          ? 'partially_received'
          : 'open',
  }
}

export function commercePurchaseOrderArrivalUrgency(
  purchaseOrder: CommercePurchaseOrder,
  progress: CommercePurchaseOrderProgress,
  now: number,
): CommercePurchaseOrderArrivalUrgency {
  if (progress.status === 'received' || progress.status === 'cancelled') return 'closed'
  const expectedAt = purchaseOrder.expectedAt ? Date.parse(purchaseOrder.expectedAt) : Number.NaN
  if (!Number.isFinite(expectedAt) || !Number.isFinite(now)) return 'unrecorded'
  if (expectedAt <= now) return 'late'
  return expectedAt - now <= 24 * 60 * 60 * 1000 ? 'due_soon' : 'scheduled'
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
    const deliveryMeasured = progress.status === 'received' && completedAt !== null && promisedAt !== null
    const onTime = progress.status === 'received'
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
      openUnits: 0,
      lateOpenOrders: 0,
      completedDeliveries: 0,
      onTimeDeliveries: 0,
      lateDeliveries: 0,
      receiptRateBasisPoints: 0,
      onTimeRateBasisPoints: null,
      status: 'collecting' as CommerceSupplierPerformanceStatus,
    }
    existing.totalOrders += 1
    existing.activeOrders += active ? 1 : 0
    existing.orderedUnits = addSafeUnits(existing.orderedUnits, purchaseOrder.quantityOrdered)
    existing.receivedUnits = addSafeUnits(existing.receivedUnits, progress.received)
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
    onTimeRateBasisPoints: supplier.completedDeliveries
      ? Math.round((supplier.onTimeDeliveries / supplier.completedDeliveries) * 10_000)
      : null,
    status: supplier.lateOpenOrders || supplier.lateDeliveries
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
  if (!validProof(proof)
    || !sku || sku !== item.sku || sku.length > 80
    || !name || name !== item.name || name.length > 180
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
  return order.item === commerceOrderItemSummary(order.lines)
    && order.itemSku === expectedItemSku
    && order.quantity === quantity
    && (order.calculation?.schema === COMMERCE_ORDER_CALCULATION_V2_SCHEMA
      ? order.calculation.listedSubtotalMmk === total && order.total === order.calculation.totalMmk
      : order.total === total) ? order.lines : null
}

export function reserveCommerceOrder(state: CommerceState, order: CommerceOrder, proof: CommerceActionProof) {
  const promisedAt = timestampMicros(order.promisedAt)
  const createdAt = timestampMicros(order.createdAt)
  const confirmedAt = timestampMicros(proof.capturedAt)
  if (!validProof(proof)
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
  const calculation = commerceOrderCalculation(state, order.total, proof.capturedAt)
  if (!calculation) return null
  const authoritativeOrder: CommerceOrder = {
    ...order,
    lines,
    calculation,
    total: calculation.totalMmk,
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

export function createCommercePurchaseOrder(
  state: CommerceState,
  input: CommercePurchaseOrderInput,
  proof: CommerceActionProof,
) {
  const supplier = optionalText(input.supplier)
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
    || input.quantityOrdered < 1) return null
  const current = validateCommerceState(state)
  const existing = commercePurchaseOrders(current).find((purchaseOrder) => purchaseOrder.id === input.id)
  if (existing) {
    return existing.expectedAt === input.expectedAt
      && existing.supplier === input.supplier
      && existing.sku === input.sku
      && existing.quantityOrdered === input.quantityOrdered
      && sameActionProof(existing.creation, proof) ? current : null
  }
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
    createdAt: proof.capturedAt,
    expectedAt: input.expectedAt,
    supplier,
    sku: input.sku,
    quantityOrdered: input.quantityOrdered,
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
) {
  if (!validProof(proof) || !Number.isSafeInteger(quantity) || quantity < 1) return null
  const current = validateCommerceState(state)
  const replayMovement = current.movements.find((movement) => movement.actionId === proof.actionId)
  if (replayMovement) {
    const aggregateReplayMatches = replayMovement.kind === 'receipt'
      && replayMovement.purchaseOrderId === purchaseOrderId
      && replayMovement.quantityDelta === quantity
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
  if (quantity > progress.remaining) return null
  const item = current.items.find((candidate) => candidate.sku === purchaseOrder.sku)
  if (!item) return null
  const nextBalance = safeBalance(item.onHand, quantity)
  if (nextBalance === null) return null
  const movement = movementFor(proof, {
    kind: 'receipt',
    sku: purchaseOrder.sku,
    quantityDelta: quantity,
    purchaseOrderId,
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

export function commerceDailyCloseExport(state: CommerceState, closeId: string): CommerceDailyCloseExport | null {
  const current = validateCommerceState(state)
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

function commerceCsvCell(value: string | number | null | string[]) {
  let raw = Array.isArray(value) ? value.join(';') : value === null ? '' : String(value)
  if (/^[=+@-]/.test(raw)) raw = `'${raw}`
  return `"${raw.replace(/"/g, '""')}"`
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
      entry.calculationStatus,
      entry.amountMmk,
      entry.mappingStatus,
    ]),
  ]
}

export function commerceAccountingHandoff(state: CommerceState, closeId: string): CommerceAccountingHandoff | null {
  const closeExport = commerceDailyCloseExport(state, closeId)
  if (!closeExport) return null
  if (closeExport.orders.some((order) => order.corrections.length)) return null
  const closeAt = timestampMicros(closeExport.closedAt) as bigint
  const accountMapping = commerceAccountMappingConfigurations(validateCommerceState(state)).find(
    (configuration) => (timestampMicros(configuration.proof.capturedAt) as bigint) <= closeAt,
  ) ?? null
  const externalAccountCodeByRole = new Map(
    accountMapping?.mappings.map((mapping) => [mapping.accountRole, mapping.externalAccountCode]) ?? [],
  )
  const mappedAccount = (accountRole: CommerceAccountRole) => externalAccountCodeByRole.get(accountRole) ?? null
  const paymentGroups = new Map<string, { amountMmk: number; statuses: Set<CommerceDailyCloseExportOrder['calculationStatus']> }>()
  let acceptedSubtotalMmk = 0
  let acceptedTaxMmk = 0
  let legacyUnverifiedMmk = 0
  let acceptedOrderCount = 0
  let legacyUnverifiedOrderCount = 0
  let taxConfiguredOrderCount = 0
  for (const order of closeExport.orders) {
    const payment = paymentGroups.get(order.paymentMethod) ?? { amountMmk: 0, statuses: new Set() }
    payment.amountMmk += order.totalMmk
    payment.statuses.add(order.calculationStatus)
    paymentGroups.set(order.paymentMethod, payment)
    if (order.calculationStatus === 'accepted' && order.subtotalMmk !== null && order.taxMmk !== null) {
      acceptedOrderCount += 1
      acceptedSubtotalMmk += order.subtotalMmk
      acceptedTaxMmk += order.taxMmk
      if (order.taxMode !== 'not_configured') taxConfiguredOrderCount += 1
    } else {
      legacyUnverifiedOrderCount += 1
      legacyUnverifiedMmk += order.totalMmk
    }
  }
  const entries: CommerceAccountingHandoffEntry[] = [...paymentGroups.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([paymentMethod, group], index) => ({
      lineId: `DEBIT-${String(index + 1).padStart(3, '0')}`,
      side: 'debit',
      accountRole: 'payment_clearing',
      externalAccountCode: mappedAccount('payment_clearing'),
      paymentMethod,
      calculationStatus: group.statuses.size > 1 ? 'mixed' : [...group.statuses][0],
      amountMmk: group.amountMmk,
      mappingStatus: accountMapping ? 'mapped' : 'unmapped',
    }))
  const credits: Array<Omit<CommerceAccountingHandoffEntry, 'lineId'>> = []
  if (acceptedSubtotalMmk) credits.push({
    side: 'credit',
    accountRole: 'sales_revenue',
    externalAccountCode: mappedAccount('sales_revenue'),
    paymentMethod: null,
    calculationStatus: 'accepted',
    amountMmk: acceptedSubtotalMmk,
    mappingStatus: accountMapping ? 'mapped' : 'unmapped',
  })
  if (acceptedTaxMmk) credits.push({
    side: 'credit',
    accountRole: 'tax_payable',
    externalAccountCode: mappedAccount('tax_payable'),
    paymentMethod: null,
    calculationStatus: 'accepted',
    amountMmk: acceptedTaxMmk,
    mappingStatus: accountMapping ? 'mapped' : 'unmapped',
  })
  if (legacyUnverifiedMmk) credits.push({
    side: 'credit',
    accountRole: 'sales_revenue_unverified',
    externalAccountCode: mappedAccount('sales_revenue_unverified'),
    paymentMethod: null,
    calculationStatus: 'legacy_unverified',
    amountMmk: legacyUnverifiedMmk,
    mappingStatus: accountMapping ? 'mapped' : 'unmapped',
  })
  entries.push(...credits.map((entry, index) => ({ ...entry, lineId: `CREDIT-${String(index + 1).padStart(3, '0')}` })))
  const totalDebitMmk = entries.filter((entry) => entry.side === 'debit').reduce((total, entry) => total + entry.amountMmk, 0)
  const totalCreditMmk = entries.filter((entry) => entry.side === 'credit').reduce((total, entry) => total + entry.amountMmk, 0)
  if (totalDebitMmk !== closeExport.totalMmk || totalCreditMmk !== closeExport.totalMmk) return null
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
    'line_id',
    'side',
    'account_role',
    'external_account_code',
    'payment_method',
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
    entry.lineId,
    entry.side,
    entry.accountRole,
    entry.externalAccountCode,
    entry.paymentMethod,
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

export function advanceCommerceOrder(
  state: CommerceState,
  orderId: string,
  expectedStatus: CommerceOrderStatus,
  proof?: CommerceActionProof,
  timestampAuthority: 'client' | 'managed-server' = 'client',
) {
  const current = validateCommerceState(state)
  const order = current.orders.find((candidate) => candidate.id === orderId)
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
