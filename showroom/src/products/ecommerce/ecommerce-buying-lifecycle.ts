import {
  COMMERCE_ORDER_ACKNOWLEDGEMENT_SCHEMA,
  commerceOrderAcknowledgement,
  commerceOrderAdjustedTotal,
  commerceOrderCalculationDigest,
  commerceOrderHasReleasableReservation,
  commercePromotionDecision,
  commerceSupportServiceState,
  commerceShippingDecision,
  commercePaymentDecision,
  type CommerceItem,
  type CommerceActionProof,
  type CommerceCorrectionKind,
  type CommerceCorrectionReasonCode,
  type CommerceOrder,
  type CommerceState,
  type CommercePromotionDecision,
  type CommercePromotionPolicy,
  type CommerceShippingDecision,
  type CommerceShippingPolicy,
  type CommerceSupportPriority,
  type CommerceSupportResolutionOutcome,
  type CommercePaymentDecision,
  type CommercePaymentPolicy,
  type CommerceTaxConfiguration,
  type CommerceTaxDecision,
} from '../../core/commerce-workspace.ts'
import {
  storefrontPreviewDigest,
  validateStorefrontPreview,
  type StorefrontPreview,
} from './storefront-model.ts'

export const ECOMMERCE_PIM_SCHEMA = 'supermega.ecommerce.pim_projection.v1' as const
export const ECOMMERCE_QUOTE_SCHEMA = 'supermega.ecommerce.checkout_quote.v1' as const
export const ECOMMERCE_CUSTOMER_PROFILE_SCHEMA = 'supermega.ecommerce.customer_profile_snapshot.v1' as const
export const ECOMMERCE_DELIVERY_ADDRESS_SCHEMA = 'supermega.ecommerce.delivery_address_snapshot.v1' as const
export const ECOMMERCE_REQUEST_SCHEMA_V2 = 'supermega.ecommerce.order_request.v2' as const
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V7 = 'supermega.ecommerce.shop_draft.v7' as const
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V6 = ECOMMERCE_SHOP_DRAFT_SCHEMA_V7
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V5 = ECOMMERCE_SHOP_DRAFT_SCHEMA_V7
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V4 = ECOMMERCE_SHOP_DRAFT_SCHEMA_V7
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V3 = ECOMMERCE_SHOP_DRAFT_SCHEMA_V7
export const ECOMMERCE_SHOP_DRAFT_SCHEMA_V2 = ECOMMERCE_SHOP_DRAFT_SCHEMA_V7
export const ECOMMERCE_RETURN_INTENT_SCHEMA = 'supermega.ecommerce.return_intent.v1' as const
export const ECOMMERCE_RETURN_OUTCOME_SCHEMA = 'supermega.ecommerce.return_outcome.v1' as const
export const ECOMMERCE_SUPPORT_INTENT_SCHEMA = 'supermega.ecommerce.support_intent.v1' as const
export const ECOMMERCE_SUPPORT_OUTCOME_SCHEMA = 'supermega.ecommerce.support_outcome.v1' as const
export const ECOMMERCE_CORRECTION_INTENT_SCHEMA = 'supermega.ecommerce.correction_intent.v1' as const
export const ECOMMERCE_CORRECTION_OUTCOME_SCHEMA = 'supermega.ecommerce.correction_outcome.v1' as const
export const ECOMMERCE_CANCELLATION_INTENT_SCHEMA = 'supermega.ecommerce.cancellation_intent.v1' as const
export const ECOMMERCE_CANCELLATION_DECISION_SCHEMA = 'supermega.ecommerce.cancellation_decision.v1' as const
export const ECOMMERCE_ORDER_AMENDMENT_INTENT_SCHEMA = 'supermega.ecommerce.order_amendment_intent.v1' as const
export const ECOMMERCE_ORDER_RESCHEDULE_INTENT_SCHEMA = 'supermega.ecommerce.order_reschedule_intent.v1' as const
export const ECOMMERCE_BUYING_STATE_SCHEMA = 'supermega.ecommerce.buying_lifecycle.v1' as const
export const ECOMMERCE_BUYING_EVENT_SCHEMA = 'supermega.ecommerce.buying_event.v1' as const
export const ECOMMERCE_BUYING_STATE_KEY_PREFIX = 'supermega.ecommerce.buying_lifecycle.v1.'
export const EMPTY_ECOMMERCE_BUYING_DIGEST = `sha256:${'0'.repeat(64)}`

export type EcommercePaymentAdapter = 'pay_on_pickup' | 'cash_on_delivery' | 'kbzpay_manual'
export type EcommerceFulfilment = 'pickup' | 'delivery'
export type EcommerceTaxDecision = CommerceTaxDecision
export type EcommerceReturnDisposition = 'restock' | 'not_restocked'
export type EcommerceSupportCategory = 'order_status' | 'delivery_issue' | 'payment_question' | 'item_issue' | 'other'
export type EcommerceCancellationReasonCode = 'changed_mind' | 'duplicate_order' | 'order_error' | 'delivery_too_slow' | 'other'

function roundedTax(numerator: bigint, denominator: bigint) {
  return (numerator * 2n + denominator) / (denominator * 2n)
}

function taxTimestampMicros(value: unknown, field: string) {
  const timestamp = canonicalTimestamp(value, field)
  const fraction = /\.([0-9]{1,6})/.exec(timestamp)?.[1]?.padEnd(6, '0') ?? '000000'
  return BigInt(Date.parse(timestamp)) * 1_000n + BigInt(fraction.slice(3))
}

function ecommerceTaxConfiguration(value: unknown, index: number, count: number): CommerceTaxConfiguration {
  if (!isRecord(value)) throw new Error(`taxConfigurations[${index}] must be an object.`)
  const legacyKeys = ['revision', 'code', 'label', 'rateBasisPoints', 'mode', 'proof']
  const scheduledKeys = [...legacyKeys.slice(0, -1), 'jurisdictionCode', 'effectiveFrom', 'proof']
  const actualKeys = Object.keys(value)
  const hasExactShape = (keys: string[]) => actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key))
  if (!hasExactShape(legacyKeys) && !hasExactShape(scheduledKeys)) {
    throw new Error(`taxConfigurations[${index}] fields do not match the contract.`)
  }
  const revision = safeInteger(value.revision, `taxConfigurations[${index}].revision`, 1)
  if (revision !== count - index) throw new Error(`taxConfigurations[${index}].revision breaks the newest-first sequence.`)
  const code = canonicalText(value.code, `taxConfigurations[${index}].code`, 12)
  if (!/^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(code)) throw new Error(`taxConfigurations[${index}].code is invalid.`)
  const label = canonicalText(value.label, `taxConfigurations[${index}].label`, 80)
  const rateBasisPoints = safeInteger(value.rateBasisPoints, `taxConfigurations[${index}].rateBasisPoints`, 0, 10_000)
  if (value.mode !== 'exclusive' && value.mode !== 'inclusive') throw new Error(`taxConfigurations[${index}].mode is invalid.`)
  const proof = exactObject(value.proof, `taxConfigurations[${index}].proof`, [
    'actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference',
  ])
  const capturedAt = canonicalTimestamp(proof.capturedAt, `taxConfigurations[${index}].proof.capturedAt`)
  const configuration: CommerceTaxConfiguration = {
    revision,
    code,
    label,
    rateBasisPoints,
    mode: value.mode,
    proof: {
      actionId: canonicalText(proof.actionId, `taxConfigurations[${index}].proof.actionId`, 160),
      capturedAt,
      actor: canonicalText(proof.actor, `taxConfigurations[${index}].proof.actor`, 180),
      reason: canonicalText(proof.reason, `taxConfigurations[${index}].proof.reason`, 180),
      evidenceReference: canonicalText(proof.evidenceReference, `taxConfigurations[${index}].proof.evidenceReference`, 180),
    },
  }
  if (hasExactShape(scheduledKeys)) {
    const jurisdictionCode = canonicalText(value.jurisdictionCode, `taxConfigurations[${index}].jurisdictionCode`, 16)
    if (!/^[A-Z0-9][A-Z0-9_-]{1,15}$/.test(jurisdictionCode)) {
      throw new Error(`taxConfigurations[${index}].jurisdictionCode is invalid.`)
    }
    const effectiveFrom = canonicalTimestamp(value.effectiveFrom, `taxConfigurations[${index}].effectiveFrom`)
    if (taxTimestampMicros(effectiveFrom, `taxConfigurations[${index}].effectiveFrom`)
      < taxTimestampMicros(capturedAt, `taxConfigurations[${index}].proof.capturedAt`)) {
      throw new Error(`taxConfigurations[${index}].effectiveFrom precedes its review proof.`)
    }
    configuration.jurisdictionCode = jurisdictionCode
    configuration.effectiveFrom = effectiveFrom
  }
  return configuration
}

export function reviewEcommerceTax(
  configurations: readonly CommerceTaxConfiguration[],
  listedSubtotalMmkValue: number,
  reviewedAtValue: string,
  catalogRevisionValue: number,
): EcommerceTaxDecision {
  const listedSubtotalMmk = safeInteger(listedSubtotalMmkValue, 'listedSubtotalMmk', 1)
  const catalogRevision = safeInteger(catalogRevisionValue, 'catalogRevision')
  const reviewedAt = canonicalTimestamp(reviewedAtValue, 'reviewedAt')
  const reviewedAtMicros = taxTimestampMicros(reviewedAt, 'reviewedAt')
  const rows = configurations.map((candidate, index) => ecommerceTaxConfiguration(candidate, index, configurations.length))
  rows.forEach((candidate, index) => {
    const newer = rows[index - 1]
    if (newer && (taxTimestampMicros(newer.proof.capturedAt, `taxConfigurations[${index - 1}].proof.capturedAt`)
      < taxTimestampMicros(candidate.proof.capturedAt, `taxConfigurations[${index}].proof.capturedAt`)
      || taxTimestampMicros(newer.effectiveFrom ?? newer.proof.capturedAt, `taxConfigurations[${index - 1}].effectiveFrom`)
      < taxTimestampMicros(candidate.effectiveFrom ?? candidate.proof.capturedAt, `taxConfigurations[${index}].effectiveFrom`))) {
      throw new Error(`taxConfigurations[${index}] breaks newest-first chronology.`)
    }
  })
  const configuration = rows.find((candidate) => {
    const effectiveFrom = candidate.effectiveFrom ?? candidate.proof.capturedAt
    return taxTimestampMicros(candidate.proof.capturedAt, 'taxConfiguration.proof.capturedAt') <= reviewedAtMicros
      && taxTimestampMicros(effectiveFrom, 'taxConfiguration.effectiveFrom') <= reviewedAtMicros
  })
  if (!configuration) return {
    schema: 'supermega.ecommerce.tax-decision.v1',
    status: 'not_configured',
    catalogRevision,
    taxConfigurationRevision: null,
    taxCode: null,
    taxJurisdictionCode: null,
    taxEffectiveFrom: null,
    taxRateBasisPoints: 0,
    taxMode: 'not_configured',
    listedSubtotalMmk,
    subtotalMmk: listedSubtotalMmk,
    taxMmk: 0,
    totalMmk: listedSubtotalMmk,
    policyActionId: null,
    reviewedAt,
  }
  const listed = BigInt(listedSubtotalMmk)
  const rate = BigInt(configuration.rateBasisPoints)
  const tax = configuration.mode === 'exclusive'
    ? roundedTax(listed * rate, 10_000n)
    : roundedTax(listed * rate, 10_000n + rate)
  const subtotal = configuration.mode === 'exclusive' ? listed : listed - tax
  const total = configuration.mode === 'exclusive' ? listed + tax : listed
  if (subtotal < 0n || tax < 0n || total < 1n || total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('The Shop tax decision exceeds the safe whole-MMK boundary.')
  }
  return {
    schema: 'supermega.ecommerce.tax-decision.v1',
    status: 'configured',
    catalogRevision,
    taxConfigurationRevision: configuration.revision,
    taxCode: canonicalText(configuration.code, 'taxConfiguration.code', 12),
    taxJurisdictionCode: configuration.jurisdictionCode
      ? canonicalText(configuration.jurisdictionCode, 'taxConfiguration.jurisdictionCode', 16)
      : null,
    taxEffectiveFrom: configuration.effectiveFrom
      ? canonicalTimestamp(configuration.effectiveFrom, 'taxConfiguration.effectiveFrom')
      : null,
    taxRateBasisPoints: configuration.rateBasisPoints,
    taxMode: configuration.mode,
    listedSubtotalMmk,
    subtotalMmk: Number(subtotal),
    taxMmk: Number(tax),
    totalMmk: Number(total),
    policyActionId: canonicalText(configuration.proof.actionId, 'taxConfiguration.proof.actionId', 160),
    reviewedAt,
  }
}

export function validateEcommerceTaxDecision(
  value: unknown,
  configurations?: readonly CommerceTaxConfiguration[],
): EcommerceTaxDecision {
  const source = exactObject(value, 'taxDecision', [
    'schema', 'status', 'catalogRevision', 'taxConfigurationRevision', 'taxCode', 'taxJurisdictionCode',
    'taxEffectiveFrom', 'taxRateBasisPoints', 'taxMode', 'listedSubtotalMmk', 'subtotalMmk', 'taxMmk',
    'totalMmk', 'policyActionId', 'reviewedAt',
  ])
  const status = source.status
  const taxMode = source.taxMode
  if ((status !== 'configured' && status !== 'not_configured')
    || (taxMode !== 'exclusive' && taxMode !== 'inclusive' && taxMode !== 'not_configured')) {
    throw new Error('The Ecommerce tax decision status is invalid.')
  }
  const decision: EcommerceTaxDecision = {
    schema: source.schema as EcommerceTaxDecision['schema'],
    status,
    catalogRevision: safeInteger(source.catalogRevision, 'taxDecision.catalogRevision'),
    taxConfigurationRevision: source.taxConfigurationRevision === null
      ? null
      : safeInteger(source.taxConfigurationRevision, 'taxDecision.taxConfigurationRevision', 1),
    taxCode: source.taxCode === null ? null : canonicalText(source.taxCode, 'taxDecision.taxCode', 12),
    taxJurisdictionCode: source.taxJurisdictionCode === null
      ? null
      : canonicalText(source.taxJurisdictionCode, 'taxDecision.taxJurisdictionCode', 16),
    taxEffectiveFrom: source.taxEffectiveFrom === null
      ? null
      : canonicalTimestamp(source.taxEffectiveFrom, 'taxDecision.taxEffectiveFrom'),
    taxRateBasisPoints: safeInteger(source.taxRateBasisPoints, 'taxDecision.taxRateBasisPoints', 0, 10_000),
    taxMode,
    listedSubtotalMmk: safeInteger(source.listedSubtotalMmk, 'taxDecision.listedSubtotalMmk', 1),
    subtotalMmk: safeInteger(source.subtotalMmk, 'taxDecision.subtotalMmk'),
    taxMmk: safeInteger(source.taxMmk, 'taxDecision.taxMmk'),
    totalMmk: safeInteger(source.totalMmk, 'taxDecision.totalMmk', 1),
    policyActionId: source.policyActionId === null
      ? null
      : canonicalText(source.policyActionId, 'taxDecision.policyActionId', 160),
    reviewedAt: canonicalTimestamp(source.reviewedAt, 'taxDecision.reviewedAt'),
  }
  if (decision.schema !== 'supermega.ecommerce.tax-decision.v1') {
    throw new Error('The Ecommerce tax decision schema is invalid.')
  }
  const listed = BigInt(decision.listedSubtotalMmk)
  const rate = BigInt(decision.taxRateBasisPoints)
  const expectedTax = decision.taxMode === 'exclusive'
    ? roundedTax(listed * rate, 10_000n)
    : decision.taxMode === 'inclusive'
      ? roundedTax(listed * rate, 10_000n + rate)
      : 0n
  const expectedSubtotal = decision.taxMode === 'inclusive' ? listed - expectedTax : listed
  const expectedTotal = decision.taxMode === 'exclusive' ? listed + expectedTax : listed
  const configured = decision.status === 'configured'
    && decision.taxMode !== 'not_configured'
    && decision.taxConfigurationRevision !== null
    && decision.taxCode !== null
    && decision.policyActionId !== null
    && Number(expectedTax) === decision.taxMmk
    && Number(expectedSubtotal) === decision.subtotalMmk
    && Number(expectedTotal) === decision.totalMmk
  const notConfigured = decision.status === 'not_configured'
    && decision.taxMode === 'not_configured'
    && decision.taxConfigurationRevision === null
    && decision.taxCode === null
    && decision.taxJurisdictionCode === null
    && decision.taxEffectiveFrom === null
    && decision.taxRateBasisPoints === 0
    && decision.policyActionId === null
    && decision.subtotalMmk === decision.listedSubtotalMmk
    && decision.taxMmk === 0
    && decision.totalMmk === decision.listedSubtotalMmk
  if (!configured && !notConfigured) {
    throw new Error('The Ecommerce tax decision calculation is invalid.')
  }
  if (configurations === undefined) return decision
  const expected = reviewEcommerceTax(configurations, decision.listedSubtotalMmk, decision.reviewedAt, decision.catalogRevision)
  if (canonicalJson(decision) !== canonicalJson(expected)) {
    throw new Error('The Ecommerce tax decision is stale, forged, or inconsistent with the Shop tax schedule.')
  }
  return decision
}

export type EcommercePimItem = {
  sku: string
  name: string
  variant: string | null
  unitPriceMmk: number
  availability: 'available' | 'sold_out'
}

export type EcommercePimProjection = {
  schema: typeof ECOMMERCE_PIM_SCHEMA
  scope: string
  sourcePreviewDigest: string
  items: EcommercePimItem[]
  pimDigest: string
}

export type EcommerceCartLine = {
  sku: string
  quantity: number
}

export type EcommerceCustomerProfileSnapshot = {
  schema: typeof ECOMMERCE_CUSTOMER_PROFILE_SCHEMA
  id: string
  revision: number
  name: string
  phone: string
  savedAt: string
  previousDigest: string | null
  profileDigest: string
}

export type EcommerceDeliveryAddressSnapshot = {
  schema: typeof ECOMMERCE_DELIVERY_ADDRESS_SCHEMA
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

export type EcommerceQuoteLine = {
  sku: string
  name: string
  variant: string | null
  quantity: number
  unitPriceMmk: number
  lineTotalMmk: number
}

export type EcommerceCheckoutQuote = {
  schema: typeof ECOMMERCE_QUOTE_SCHEMA
  scope: string
  quoteId: string
  idempotencyKey: string
  quotedAt: string
  expiresAt: string
  sourcePreviewDigest: string
  pimDigest: string
  currency: 'MMK'
  customerReference: string
  customerProfile?: EcommerceCustomerProfileSnapshot
  deliveryAddress?: EcommerceDeliveryAddressSnapshot | null
  fulfilment: EcommerceFulfilment
  lines: EcommerceQuoteLine[]
  subtotalMmk: number
  promotion: {
    adapter: 'shop_promotion_review'
    status: 'not_requested' | 'pending_shop_review'
    code: string | null
    amountMmk: 0
  }
  tax: {
    adapter: 'price_inclusive'
    status: 'included'
    amountMmk: 0
  }
  shipping: {
    adapter: 'pickup' | 'shop_delivery_review'
    status: 'included' | 'pending_shop_review'
    amountMmk: 0
  }
  payment: {
    adapter: EcommercePaymentAdapter
    status: 'not_authorized'
    amountMmk: 0
  }
  totalMmk: number
  quoteDigest: string
}

export type EcommerceOrderRequestV2 = {
  schema: typeof ECOMMERCE_REQUEST_SCHEMA_V2
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
  customerProfile?: EcommerceCustomerProfileSnapshot
  deliveryAddress?: EcommerceDeliveryAddressSnapshot | null
  fulfilment: EcommerceFulfilment
  currency: 'MMK'
  lines: EcommerceQuoteLine[]
  quote: EcommerceCheckoutQuote
  totalMmk: number
}

export type EcommerceShopDraftV2 = {
  schema: typeof ECOMMERCE_SHOP_DRAFT_SCHEMA_V7
  mode: 'browser-memory-shop-draft'
  state: 'review_required'
  id: string
  sourceRequestId: string
  sourcePreviewDigest: string
  quoteDigest: string
  quoteExpiresAt: string
  createdAt: string
  confirmedAt: string
  customerReference: string
  customerProfile?: EcommerceCustomerProfileSnapshot
  deliveryAddress?: EcommerceDeliveryAddressSnapshot | null
  fulfilment: EcommerceFulfilment
  currency: 'MMK'
  operatingContext: {
    organizationScope: string
    operatingUnitLocationId: 'LOC-MAIN'
    sourceAuthority: 'ecommerce'
    targetAuthority: 'commerce'
    recordType: 'order_request'
    writePolicy: 'human_review_required'
  }
  lines: EcommerceQuoteLine[]
  pricing: {
    subtotalMmk: number
    promotion: CommercePromotionDecision
    tax: EcommerceTaxDecision
    shipping: CommerceShippingDecision
    payment: CommercePaymentDecision
    totalMmk: number
  }
  totalMmk: number
  evidenceReference: string
}

export type EcommerceReturnIntent = {
  schema: typeof ECOMMERCE_RETURN_INTENT_SCHEMA
  state: 'pending_shop_review'
  scope: string
  id: string
  idempotencyKey: string
  createdAt: string
  orderId: string
  sourceRequestId: string
  sku: string
  quantity: number
  disposition: EcommerceReturnDisposition
  reason: string
  refundStatus: 'not_started'
  evidenceReference: string
}

export type EcommerceReturnOutcome = {
  schema: typeof ECOMMERCE_RETURN_OUTCOME_SCHEMA
  state: 'accepted'
  scope: string
  intentId: string
  orderId: string
  sourceRequestId: string
  sku: string
  quantity: number
  disposition: EcommerceReturnDisposition
  stockOutcome: 'restocked' | 'not_restocked'
  reviewedAt: string
  reviewedBy: string
  returnActionId: string
  returnEvidenceReference: string
  refundStatus: 'none' | 'due' | 'settled'
  refundSettledAt: string | null
  refundSettledBy: string | null
  refundEvidenceReference: string | null
  automaticRefundPerformed: false
  customerMessageSent: false
  providerCalled: false
}

export type EcommerceSupportIntent = {
  schema: typeof ECOMMERCE_SUPPORT_INTENT_SCHEMA
  state: 'pending_shop_review'
  scope: string
  id: string
  idempotencyKey: string
  createdAt: string
  orderId: string
  sourceRequestId: string
  category: EcommerceSupportCategory
  description: string
  externalMessageSent: false
  refundStarted: false
  evidenceReference: string
}

export type EcommerceSupportOutcome = {
  schema: typeof ECOMMERCE_SUPPORT_OUTCOME_SCHEMA
  state: 'open' | 'resolved'
  scope: string
  intentId: string
  orderId: string
  sourceRequestId: string
  caseId: string
  category: EcommerceSupportCategory
  openedAt: string
  openedBy: string
  owner: string
  priority: CommerceSupportPriority
  dueAt: string
  resolutionOutcome: CommerceSupportResolutionOutcome | null
  resolvedAt: string | null
  resolvedBy: string | null
  resolutionEvidenceReference: string | null
  externalMessageSent: false
  refundStarted: false
  providerCalled: false
}

export type EcommerceCorrectionIntent = {
  schema: typeof ECOMMERCE_CORRECTION_INTENT_SCHEMA
  state: 'pending_shop_review'
  scope: string
  id: string
  idempotencyKey: string
  createdAt: string
  orderId: string
  sourceRequestId: string
  sourceCalculationDigest: string
  sourceCorrectionCount: number
  originalBalanceMmk: number
  paymentStatus: 'reconciled'
  refundStatus: 'none' | 'due' | 'settled'
  requestedKind: CommerceCorrectionKind
  reasonCode: CommerceCorrectionReasonCode
  listedAmountMmk: number
  reason: string
  orderChanged: false
  paymentChanged: false
  refundStarted: false
  ledgerPosted: false
  taxFiled: false
  customerMessageSent: false
  providerCalled: false
  evidenceReference: string
}

export type EcommerceCorrectionOutcome = {
  schema: typeof ECOMMERCE_CORRECTION_OUTCOME_SCHEMA
  state: 'review_required'
  scope: string
  intentId: string
  orderId: string
  sourceRequestId: string
  reviewedAt: string
  reviewedBy: string
  correctionActionId: string
  kind: CommerceCorrectionKind
  reasonCode: CommerceCorrectionReasonCode
  listedAmountMmk: number
  adjustmentTotalMmk: number
  balanceAfterMmk: number
  financialStatus: 'review_required'
  postingAuthority: 'none'
  externalPostingPerformed: false
  automaticPaymentPerformed: false
  automaticRefundPerformed: false
  customerMessageSent: false
  providerCalled: false
}

export type EcommerceCancellationIntent = {
  schema: typeof ECOMMERCE_CANCELLATION_INTENT_SCHEMA
  state: 'pending_shop_review'
  scope: string
  id: string
  idempotencyKey: string
  createdAt: string
  orderId: string
  sourceRequestId: string
  sourceAcknowledgementDigest: string
  orderStatus: 'confirmed' | 'preparing' | 'ready'
  paymentStatus: 'pending' | 'reconciled'
  refundStatus: 'none'
  totalMmk: number
  reasonCode: EcommerceCancellationReasonCode
  reason: string
  customerMessageSent: false
  orderCancelled: false
  refundStarted: false
  evidenceReference: string
}

export type EcommerceCancellationDecision = {
  schema: typeof ECOMMERCE_CANCELLATION_DECISION_SCHEMA
  state: 'kept_by_shop'
  scope: string
  id: string
  idempotencyKey: string
  createdAt: string
  intentId: string
  intentDigest: string
  orderId: string
  sourceRequestId: string
  sourceAcknowledgementDigest: string
  orderStatus: 'confirmed' | 'preparing' | 'ready'
  paymentStatus: 'pending' | 'reconciled'
  refundStatus: 'none'
  totalMmk: number
  actor: string
  reason: string
  evidenceReference: string
  customerMessageSent: false
  orderCancelled: false
  refundStarted: false
  providerCalled: false
}

export type EcommerceOrderAmendmentLineChange = {
  sku: string
  name: string
  fromQuantity: number
  toQuantity: number
}

export type EcommerceOrderAmendmentIntent = {
  schema: typeof ECOMMERCE_ORDER_AMENDMENT_INTENT_SCHEMA
  state: 'pending_shop_review'
  scope: string
  id: string
  idempotencyKey: string
  createdAt: string
  orderId: string
  sourceRequestId: string
  sourceAcknowledgementDigest: string
  orderStatus: 'confirmed'
  paymentStatus: 'pending'
  refundStatus: 'none'
  originalTotalMmk: number
  replacementRequestId: string
  replacementRequestDigest: string
  lineChanges: EcommerceOrderAmendmentLineChange[]
  fromFulfilment: EcommerceFulfilment
  toFulfilment: EcommerceFulfilment
  reason: string
  customerMessageSent: false
  orderChanged: false
  stockChanged: false
  paymentChanged: false
  refundStarted: false
  providerCalled: false
  evidenceReference: string
}

export type EcommerceOrderRescheduleIntent = {
  schema: typeof ECOMMERCE_ORDER_RESCHEDULE_INTENT_SCHEMA
  state: 'pending_shop_review'
  scope: string
  id: string
  idempotencyKey: string
  createdAt: string
  orderId: string
  sourceRequestId: string
  sourceAcknowledgementDigest: string
  orderStatus: 'confirmed'
  paymentStatus: 'pending'
  refundStatus: 'none'
  originalTotalMmk: number
  originalPromisedAt: string
  replacementRequestId: string
  replacementRequestDigest: string
  requestedPromisedAt: string
  fulfilment: EcommerceFulfilment
  reason: string
  customerMessageSent: false
  orderChanged: false
  stockChanged: false
  paymentChanged: false
  refundStarted: false
  riderBooked: false
  providerCalled: false
  evidenceReference: string
}

export type EcommerceBuyingEvent = {
  schema: typeof ECOMMERCE_BUYING_EVENT_SCHEMA
  sequence: number
  action: 'request_recorded' | 'return_intent_recorded' | 'support_intent_recorded' | 'correction_intent_recorded' | 'cancellation_intent_recorded' | 'cancellation_decision_recorded' | 'order_amendment_intent_recorded' | 'order_reschedule_intent_recorded'
  subjectId: string
  idempotencyKey: string
  payloadDigest: string
  previousDigest: string
  eventDigest: string
}

export type EcommerceBuyingState = {
  schema: typeof ECOMMERCE_BUYING_STATE_SCHEMA
  scope: string
  revision: number
  headDigest: string
  requests: EcommerceOrderRequestV2[]
  returnIntents: EcommerceReturnIntent[]
  supportIntents: EcommerceSupportIntent[]
  correctionIntents: EcommerceCorrectionIntent[]
  cancellationIntents: EcommerceCancellationIntent[]
  cancellationDecisions: EcommerceCancellationDecision[]
  amendmentIntents: EcommerceOrderAmendmentIntent[]
  rescheduleIntents: EcommerceOrderRescheduleIntent[]
  events: EcommerceBuyingEvent[]
}

export type EcommerceBuyingReadResult = {
  status: 'empty' | 'ready' | 'invalid' | 'unavailable'
  state: EcommerceBuyingState | null
  error: string
}

export type EcommerceBuyingStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type EcommerceBuyingLocks = {
  request: <T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => T | Promise<T>,
  ) => Promise<T>
}

function replacementIdentityIsBound(
  source: EcommerceOrderRequestV2,
  replacement: EcommerceOrderRequestV2,
) {
  const sourceProfile = source.customerProfile ?? null
  const replacementProfile = replacement.customerProfile ?? null
  const profileSame = canonicalJson(sourceProfile) === canonicalJson(replacementProfile)
  const profileAdvanced = Boolean(sourceProfile
    && replacementProfile
    && replacementProfile.id === sourceProfile.id
    && replacementProfile.revision === sourceProfile.revision + 1
    && replacementProfile.previousDigest === sourceProfile.profileDigest
    && replacementProfile.profileDigest !== sourceProfile.profileDigest)
  const sourceAddress = source.deliveryAddress ?? null
  const replacementAddress = replacement.deliveryAddress ?? null
  const addressSame = canonicalJson(sourceAddress) === canonicalJson(replacementAddress)
  const addressAdvanced = Boolean(sourceAddress
    && replacementAddress
    && replacementAddress.id === sourceAddress.id
    && replacementAddress.revision === sourceAddress.revision + 1
    && replacementAddress.previousDigest === sourceAddress.addressDigest
    && replacementAddress.addressDigest !== sourceAddress.addressDigest)
  const addressCreatedForDelivery = Boolean(!sourceAddress
    && replacement.fulfilment === 'delivery'
    && replacementAddress
    && replacementAddress.revision === 1
    && replacementAddress.previousDigest === null)
  const addressClearedForPickup = Boolean(sourceAddress
    && replacement.fulfilment === 'pickup'
    && !replacementAddress)
  const replacementReference = replacementProfile
    ? `${replacementProfile.name} · ${replacementProfile.phone}`
    : replacement.customerReference
  return (profileSame || profileAdvanced)
    && (addressSame || addressAdvanced || addressCreatedForDelivery || addressClearedForPickup)
    && replacement.customerReference === replacementReference
}

function replacementIdentityChanged(
  source: EcommerceOrderRequestV2,
  replacement: EcommerceOrderRequestV2,
) {
  return source.customerReference !== replacement.customerReference
    || canonicalJson(source.customerProfile ?? null) !== canonicalJson(replacement.customerProfile ?? null)
    || canonicalJson(source.deliveryAddress ?? null) !== canonicalJson(replacement.deliveryAddress ?? null)
}

const digestPattern = /^sha256:[0-9a-f]{64}$/
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,179}$/
const uuidPattern = '[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}'
const quoteIdPattern = new RegExp(`^ECQ-${uuidPattern}$`)
const requestIdPattern = new RegExp(`^ECR-${uuidPattern}$`)
const checkoutKeyPattern = new RegExp(`^ECI-${uuidPattern}$`)
const customerIdPattern = new RegExp(`^CUS-${uuidPattern}$`)
const addressIdPattern = new RegExp(`^ADR-${uuidPattern}$`)
const returnIdPattern = new RegExp(`^ERR-${uuidPattern}$`)
const returnKeyPattern = new RegExp(`^ERI-${uuidPattern}$`)
const supportIdPattern = new RegExp(`^ESR-${uuidPattern}$`)
const supportKeyPattern = new RegExp(`^ESI-${uuidPattern}$`)
const correctionIdPattern = new RegExp(`^ECO-${uuidPattern}$`)
const correctionKeyPattern = new RegExp(`^COI-${uuidPattern}$`)
const cancellationIdPattern = new RegExp(`^ECN-${uuidPattern}$`)
const cancellationKeyPattern = new RegExp(`^CNI-${uuidPattern}$`)
const cancellationDecisionIdPattern = new RegExp(`^ECD-${uuidPattern}$`)
const cancellationDecisionKeyPattern = new RegExp(`^CDI-${uuidPattern}$`)
const amendmentIdPattern = new RegExp(`^EAM-${uuidPattern}$`)
const amendmentKeyPattern = new RegExp(`^AMI-${uuidPattern}$`)
const rescheduleIdPattern = new RegExp(`^ERS-${uuidPattern}$`)
const rescheduleKeyPattern = new RegExp(`^RSI-${uuidPattern}$`)
const timestampPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$/
const paymentAdapters: EcommercePaymentAdapter[] = ['cash_on_delivery', 'kbzpay_manual', 'pay_on_pickup']
const fulfilmentMethods: EcommerceFulfilment[] = ['delivery', 'pickup']
const returnDispositions: EcommerceReturnDisposition[] = ['not_restocked', 'restock']
const supportCategories: EcommerceSupportCategory[] = ['delivery_issue', 'item_issue', 'order_status', 'other', 'payment_question']
const supportResolutionOutcomes: CommerceSupportResolutionOutcome[] = ['information_provided', 'replacement_review_required', 'refund_review_required', 'no_action']
const correctionKinds: CommerceCorrectionKind[] = ['credit', 'debit']
const correctionReasonCodes: CommerceCorrectionReasonCode[] = ['pricing_error', 'service_recovery', 'fee_adjustment', 'other']
const cancellationReasonCodes: EcommerceCancellationReasonCode[] = ['changed_mind', 'delivery_too_slow', 'duplicate_order', 'order_error', 'other']
const maxSafeInteger = Number.MAX_SAFE_INTEGER
const maxLines = 20
const maxQuantity = 99
const maxRecords = 100
const phonePattern = /^\+?[0-9][0-9 ()-]{5,31}$/

export function ecommercePaymentMatchesFulfilment(
  fulfilment: EcommerceFulfilment,
  paymentAdapter: EcommercePaymentAdapter,
) {
  return paymentAdapter === 'kbzpay_manual'
    || (fulfilment === 'pickup' ? paymentAdapter === 'pay_on_pickup' : paymentAdapter === 'cash_on_delivery')
}

export function ecommerceAvailablePaymentAdapters(
  policies: readonly CommercePaymentPolicy[],
  fulfilment: EcommerceFulfilment,
  orderAmountMmk: number,
  reviewedAt: string,
) {
  if (!Number.isSafeInteger(orderAmountMmk) || orderAmountMmk < 1) return []
  const preferred: EcommercePaymentAdapter[] = fulfilment === 'pickup'
    ? ['pay_on_pickup', 'kbzpay_manual']
    : ['cash_on_delivery', 'kbzpay_manual']
  return preferred.filter((adapter) => commercePaymentDecision(
    policies,
    adapter,
    fulfilment,
    orderAmountMmk,
    reviewedAt,
  )?.status === 'approved')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactObject(value: unknown, field: string, keys: string[]) {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`)
  const actual = Object.keys(value)
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) {
    throw new Error(`${field} fields do not match the contract.`)
  }
  return value
}

function canonicalText(value: unknown, field: string, maximum = 240, allowBlank = false) {
  if (typeof value !== 'string'
    || value !== value.trim()
    || (!allowBlank && !value)
    || value.normalize('NFC') !== value
    || Array.from(value).some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
    || value.length > maximum) {
    throw new Error(`${field} must be canonical visible text of at most ${maximum} characters.`)
  }
  return value
}

function optionalText(value: unknown, field: string, maximum: number) {
  return value === null ? null : canonicalText(value, field, maximum)
}

function canonicalToken(value: unknown, field: string) {
  const candidate = canonicalText(value, field, 180)
  if (!tokenPattern.test(candidate)) throw new Error(`${field} must be a canonical token.`)
  return candidate
}

function safeInteger(value: unknown, field: string, minimum = 0, maximum = maxSafeInteger) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${field} must be a supported integer.`)
  }
  return Number(value)
}

function canonicalDigest(value: unknown, field: string) {
  const candidate = canonicalText(value, field, 71)
  if (!digestPattern.test(candidate)) throw new Error(`${field} must be a SHA-256 digest.`)
  return candidate
}

function canonicalTimestamp(value: unknown, field: string) {
  const candidate = canonicalText(value, field, 40)
  if (!timestampPattern.test(candidate) || !Number.isFinite(Date.parse(candidate))) {
    throw new Error(`${field} must be a real ISO timestamp with an explicit offset.`)
  }
  return candidate
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    )
  }
  return value
}

function canonicalJson(value: unknown) {
  const serialized = JSON.stringify(canonicalValue(value))
  if (typeof serialized !== 'string') throw new Error('Ecommerce lifecycle evidence is not canonical JSON.')
  return serialized
}

function canonicalCopy<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T
}

export async function ecommerceLifecycleDigest(value: unknown) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure SHA-256 is unavailable.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function browserStorage(): EcommerceBuyingStorage | undefined {
  try {
    return globalThis.localStorage as EcommerceBuyingStorage | undefined
  } catch {
    return undefined
  }
}

function browserLocks(): EcommerceBuyingLocks | undefined {
  try {
    const locks = globalThis.navigator?.locks as EcommerceBuyingLocks | undefined
    return typeof locks?.request === 'function' ? locks : undefined
  } catch {
    return undefined
  }
}

export function ecommerceBuyingStateStorageKey(scope: string) {
  return `${ECOMMERCE_BUYING_STATE_KEY_PREFIX}${encodeURIComponent(canonicalToken(scope, 'scope'))}`
}

function pimItem(value: unknown, field: string): EcommercePimItem {
  const source = exactObject(value, field, ['sku', 'name', 'variant', 'unitPriceMmk', 'availability'])
  if (source.availability !== 'available' && source.availability !== 'sold_out') {
    throw new Error(`${field}.availability is unsupported.`)
  }
  return {
    sku: canonicalToken(source.sku, `${field}.sku`),
    name: canonicalText(source.name, `${field}.name`, 180),
    variant: optionalText(source.variant, `${field}.variant`, 180),
    unitPriceMmk: safeInteger(source.unitPriceMmk, `${field}.unitPriceMmk`, 1),
    availability: source.availability,
  }
}

export async function buildEcommercePimProjection(
  scope: string,
  sourcePreviewDigest: string,
  previewValue: StorefrontPreview,
): Promise<EcommercePimProjection> {
  const preview = validateStorefrontPreview(previewValue)
  const canonicalSourceDigest = canonicalDigest(sourcePreviewDigest, 'sourcePreviewDigest')
  if (await storefrontPreviewDigest(preview) !== canonicalSourceDigest) {
    throw new Error('Storefront preview digest is stale or invalid.')
  }
  const core = {
    schema: ECOMMERCE_PIM_SCHEMA,
    scope: canonicalToken(scope, 'scope'),
    sourcePreviewDigest: canonicalSourceDigest,
    items: preview.items.map((item) => pimItem({
      sku: item.sku,
      name: item.name,
      variant: item.variant,
      unitPriceMmk: item.unitPriceMmk,
      availability: item.availability,
    }, `items.${item.sku}`)).sort((left, right) => left.sku.localeCompare(right.sku)),
  }
  if (new Set(core.items.map((item) => item.sku)).size !== core.items.length) {
    throw new Error('PIM item SKUs must be unique.')
  }
  return { ...core, pimDigest: await ecommerceLifecycleDigest(core) }
}

export async function validateEcommercePimProjection(value: unknown): Promise<EcommercePimProjection> {
  const source = exactObject(value, 'PIM projection', ['schema', 'scope', 'sourcePreviewDigest', 'items', 'pimDigest'])
  if (source.schema !== ECOMMERCE_PIM_SCHEMA || !Array.isArray(source.items) || source.items.length < 1 || source.items.length > 100) {
    throw new Error('PIM projection contract is invalid.')
  }
  const items = source.items.map((item, index) => pimItem(item, `PIM projection.items[${index}]`))
  if (items.some((item, index) => index > 0 && items[index - 1].sku >= item.sku)) {
    throw new Error('PIM projection items must use unique canonical SKU order.')
  }
  const core = {
    schema: ECOMMERCE_PIM_SCHEMA,
    scope: canonicalToken(source.scope, 'PIM projection.scope'),
    sourcePreviewDigest: canonicalDigest(source.sourcePreviewDigest, 'PIM projection.sourcePreviewDigest'),
    items,
  }
  const digest = canonicalDigest(source.pimDigest, 'PIM projection.pimDigest')
  if (await ecommerceLifecycleDigest(core) !== digest) throw new Error('PIM projection digest is invalid.')
  return { ...core, pimDigest: digest }
}

function customerPhone(value: unknown, field: string) {
  const phone = canonicalText(value, field, 32)
  const digitCount = phone.replace(/\D/g, '').length
  if (!phonePattern.test(phone) || digitCount < 6 || digitCount > 15) {
    throw new Error(`${field} must be a usable phone number.`)
  }
  return phone
}

function customerProfileSnapshotShape(value: unknown, field = 'customer profile'): EcommerceCustomerProfileSnapshot {
  const source = exactObject(value, field, [
    'schema', 'id', 'revision', 'name', 'phone', 'savedAt', 'previousDigest', 'profileDigest',
  ])
  const id = canonicalText(source.id, `${field}.id`, 40)
  if (source.schema !== ECOMMERCE_CUSTOMER_PROFILE_SCHEMA || !customerIdPattern.test(id)) {
    throw new Error(`${field} identity is invalid.`)
  }
  const core = {
    schema: ECOMMERCE_CUSTOMER_PROFILE_SCHEMA,
    id,
    revision: safeInteger(source.revision, `${field}.revision`, 1),
    name: canonicalText(source.name, `${field}.name`, 80),
    phone: customerPhone(source.phone, `${field}.phone`),
    savedAt: canonicalTimestamp(source.savedAt, `${field}.savedAt`),
    previousDigest: source.previousDigest === null ? null : canonicalDigest(source.previousDigest, `${field}.previousDigest`),
  }
  const profileDigest = canonicalDigest(source.profileDigest, `${field}.profileDigest`)
  return { ...core, profileDigest }
}

async function customerProfileSnapshot(value: unknown, field = 'customer profile'): Promise<EcommerceCustomerProfileSnapshot> {
  const profile = customerProfileSnapshotShape(value, field)
  const { profileDigest, ...core } = profile
  if (await ecommerceLifecycleDigest(core) !== profileDigest) throw new Error(`${field} digest is invalid.`)
  return profile
}

function deliveryAddressSnapshotShape(value: unknown, field = 'delivery address'): EcommerceDeliveryAddressSnapshot {
  const source = exactObject(value, field, [
    'schema', 'id', 'revision', 'line1', 'township', 'city', 'instructions',
    'savedAt', 'previousDigest', 'addressDigest',
  ])
  const id = canonicalText(source.id, `${field}.id`, 40)
  if (source.schema !== ECOMMERCE_DELIVERY_ADDRESS_SCHEMA || !addressIdPattern.test(id)) {
    throw new Error(`${field} identity is invalid.`)
  }
  const core = {
    schema: ECOMMERCE_DELIVERY_ADDRESS_SCHEMA,
    id,
    revision: safeInteger(source.revision, `${field}.revision`, 1),
    line1: canonicalText(source.line1, `${field}.line1`, 120),
    township: canonicalText(source.township, `${field}.township`, 80),
    city: canonicalText(source.city, `${field}.city`, 80),
    instructions: source.instructions === null ? null : canonicalText(source.instructions, `${field}.instructions`, 160),
    savedAt: canonicalTimestamp(source.savedAt, `${field}.savedAt`),
    previousDigest: source.previousDigest === null ? null : canonicalDigest(source.previousDigest, `${field}.previousDigest`),
  }
  const addressDigest = canonicalDigest(source.addressDigest, `${field}.addressDigest`)
  return { ...core, addressDigest }
}

async function deliveryAddressSnapshot(value: unknown, field = 'delivery address'): Promise<EcommerceDeliveryAddressSnapshot> {
  const address = deliveryAddressSnapshotShape(value, field)
  const { addressDigest, ...core } = address
  if (await ecommerceLifecycleDigest(core) !== addressDigest) throw new Error(`${field} digest is invalid.`)
  return address
}

export async function buildEcommerceCustomerProfileSnapshot(input: {
  name: string
  phone: string
  savedAt: string
  idempotencyKey: string
  previous?: EcommerceCustomerProfileSnapshot | null
}) {
  const key = canonicalText(input.idempotencyKey, 'customer profile.idempotencyKey', 40)
  if (!checkoutKeyPattern.test(key)) throw new Error('Customer profile checkout identity is invalid.')
  const name = canonicalText(input.name, 'customer profile.name', 80)
  const phone = customerPhone(input.phone, 'customer profile.phone')
  const savedAt = canonicalTimestamp(input.savedAt, 'customer profile.savedAt')
  const previous = input.previous ? await customerProfileSnapshot(input.previous) : null
  if (previous && previous.name === name && previous.phone === phone) return previous
  const core = {
    schema: ECOMMERCE_CUSTOMER_PROFILE_SCHEMA,
    id: previous?.id ?? `CUS-${key.slice(4)}`,
    revision: (previous?.revision ?? 0) + 1,
    name,
    phone,
    savedAt,
    previousDigest: previous?.profileDigest ?? null,
  }
  return customerProfileSnapshot({ ...core, profileDigest: await ecommerceLifecycleDigest(core) })
}

export async function buildEcommerceDeliveryAddressSnapshot(input: {
  line1: string
  township: string
  city: string
  instructions: string | null
  savedAt: string
  idempotencyKey: string
  previous?: EcommerceDeliveryAddressSnapshot | null
}) {
  const key = canonicalText(input.idempotencyKey, 'delivery address.idempotencyKey', 40)
  if (!checkoutKeyPattern.test(key)) throw new Error('Delivery address checkout identity is invalid.')
  const values = {
    line1: canonicalText(input.line1, 'delivery address.line1', 120),
    township: canonicalText(input.township, 'delivery address.township', 80),
    city: canonicalText(input.city, 'delivery address.city', 80),
    instructions: input.instructions === null ? null : canonicalText(input.instructions, 'delivery address.instructions', 160),
  }
  const savedAt = canonicalTimestamp(input.savedAt, 'delivery address.savedAt')
  const previous = input.previous ? await deliveryAddressSnapshot(input.previous) : null
  if (previous
    && previous.line1 === values.line1
    && previous.township === values.township
    && previous.city === values.city
    && previous.instructions === values.instructions) return previous
  const core = {
    schema: ECOMMERCE_DELIVERY_ADDRESS_SCHEMA,
    id: previous?.id ?? `ADR-${key.slice(4)}`,
    revision: (previous?.revision ?? 0) + 1,
    ...values,
    savedAt,
    previousDigest: previous?.addressDigest ?? null,
  }
  return deliveryAddressSnapshot({ ...core, addressDigest: await ecommerceLifecycleDigest(core) })
}

function quoteLine(value: unknown, field: string): EcommerceQuoteLine {
  const source = exactObject(value, field, ['sku', 'name', 'variant', 'quantity', 'unitPriceMmk', 'lineTotalMmk'])
  const quantity = safeInteger(source.quantity, `${field}.quantity`, 1, maxQuantity)
  const unitPriceMmk = safeInteger(source.unitPriceMmk, `${field}.unitPriceMmk`, 1)
  const lineTotalMmk = safeInteger(source.lineTotalMmk, `${field}.lineTotalMmk`, 1)
  if (lineTotalMmk !== quantity * unitPriceMmk) throw new Error(`${field}.lineTotalMmk is invalid.`)
  return {
    sku: canonicalToken(source.sku, `${field}.sku`),
    name: canonicalText(source.name, `${field}.name`, 180),
    variant: optionalText(source.variant, `${field}.variant`, 180),
    quantity,
    unitPriceMmk,
    lineTotalMmk,
  }
}

async function quoteCore(value: unknown): Promise<Omit<EcommerceCheckoutQuote, 'quoteDigest'>> {
  const baseFields = [
    'schema', 'scope', 'quoteId', 'idempotencyKey', 'quotedAt', 'expiresAt',
    'sourcePreviewDigest', 'pimDigest', 'currency', 'customerReference', 'fulfilment',
    'lines', 'subtotalMmk', 'promotion', 'tax', 'shipping', 'payment', 'totalMmk',
  ]
  const structuredFields = ['customerProfile', 'deliveryAddress']
  const structured = isRecord(value) && structuredFields.some((field) => field in value)
  const source = exactObject(value, 'checkout quote', structured ? [...baseFields, ...structuredFields] : baseFields)
  const quoteId = canonicalText(source.quoteId, 'checkout quote.quoteId', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'checkout quote.idempotencyKey', 40)
  if (!quoteIdPattern.test(quoteId)
    || !checkoutKeyPattern.test(idempotencyKey)
    || quoteId.slice(4) !== idempotencyKey.slice(4)) throw new Error('Checkout quote identity is invalid.')
  const quotedAt = canonicalTimestamp(source.quotedAt, 'checkout quote.quotedAt')
  const expiresAt = canonicalTimestamp(source.expiresAt, 'checkout quote.expiresAt')
  const duration = Date.parse(expiresAt) - Date.parse(quotedAt)
  if (duration <= 0 || duration > 30 * 60 * 1000) throw new Error('Checkout quote expiry is invalid.')
  if (!fulfilmentMethods.includes(source.fulfilment as EcommerceFulfilment)) throw new Error('Checkout fulfilment is unsupported.')
  if (!Array.isArray(source.lines) || source.lines.length < 1 || source.lines.length > maxLines) {
    throw new Error('Checkout quote lines are invalid.')
  }
  const lines = source.lines.map((line, index) => quoteLine(line, `checkout quote.lines[${index}]`))
  if (lines.some((line, index) => index > 0 && lines[index - 1].sku >= line.sku)) {
    throw new Error('Checkout quote lines must use unique canonical SKU order.')
  }
  const subtotalMmk = safeInteger(source.subtotalMmk, 'checkout quote.subtotalMmk', 1)
  if (subtotalMmk !== lines.reduce((total, line) => total + line.lineTotalMmk, 0)) {
    throw new Error('Checkout quote subtotal is invalid.')
  }
  const promotion = exactObject(source.promotion, 'checkout quote.promotion', ['adapter', 'status', 'code', 'amountMmk'])
  const promotionCode = optionalText(promotion.code, 'checkout quote.promotion.code', 40)
  const promotionStatus = promotionCode ? 'pending_shop_review' : 'not_requested'
  if (promotion.adapter !== 'shop_promotion_review' || promotion.status !== promotionStatus || promotion.amountMmk !== 0) {
    throw new Error('Checkout promotion boundary is invalid.')
  }
  const tax = exactObject(source.tax, 'checkout quote.tax', ['adapter', 'status', 'amountMmk'])
  if (tax.adapter !== 'price_inclusive' || tax.status !== 'included' || tax.amountMmk !== 0) {
    throw new Error('Checkout tax boundary is invalid.')
  }
  const fulfilment = source.fulfilment as EcommerceFulfilment
  const customerProfile = structured
    ? await customerProfileSnapshot(source.customerProfile, 'checkout quote.customerProfile')
    : undefined
  const deliveryAddress = structured
    ? source.deliveryAddress === null
      ? null
      : await deliveryAddressSnapshot(source.deliveryAddress, 'checkout quote.deliveryAddress')
    : undefined
  if (structured
    && (Date.parse(customerProfile!.savedAt) > Date.parse(quotedAt)
      || (deliveryAddress && Date.parse(deliveryAddress.savedAt) > Date.parse(quotedAt))
      || (fulfilment === 'delivery') !== Boolean(deliveryAddress))) {
    throw new Error('Checkout customer and delivery identity are inconsistent.')
  }
  const shipping = exactObject(source.shipping, 'checkout quote.shipping', ['adapter', 'status', 'amountMmk'])
  const expectedShipping = fulfilment === 'pickup'
    ? { adapter: 'pickup', status: 'included', amountMmk: 0 }
    : { adapter: 'shop_delivery_review', status: 'pending_shop_review', amountMmk: 0 }
  if (canonicalJson(shipping) !== canonicalJson(expectedShipping)) throw new Error('Checkout shipping boundary is invalid.')
  const payment = exactObject(source.payment, 'checkout quote.payment', ['adapter', 'status', 'amountMmk'])
  if (!paymentAdapters.includes(payment.adapter as EcommercePaymentAdapter)
    || payment.status !== 'not_authorized'
    || payment.amountMmk !== 0) throw new Error('Checkout payment boundary is invalid.')
  if (!ecommercePaymentMatchesFulfilment(fulfilment, payment.adapter as EcommercePaymentAdapter)) {
    throw new Error('Checkout payment does not match how the customer receives the order.')
  }
  const totalMmk = safeInteger(source.totalMmk, 'checkout quote.totalMmk', 1)
  if (totalMmk !== subtotalMmk) throw new Error('Checkout total must remain the product subtotal until Shop review.')
  if (source.currency !== 'MMK') throw new Error('Checkout currency must be MMK.')
  return {
    schema: ECOMMERCE_QUOTE_SCHEMA,
    scope: canonicalToken(source.scope, 'checkout quote.scope'),
    quoteId,
    idempotencyKey,
    quotedAt,
    expiresAt,
    sourcePreviewDigest: canonicalDigest(source.sourcePreviewDigest, 'checkout quote.sourcePreviewDigest'),
    pimDigest: canonicalDigest(source.pimDigest, 'checkout quote.pimDigest'),
    currency: 'MMK',
    customerReference: canonicalText(source.customerReference, 'checkout quote.customerReference', 80),
    ...(customerProfile ? { customerProfile, deliveryAddress: deliveryAddress ?? null } : {}),
    fulfilment,
    lines,
    subtotalMmk,
    promotion: {
      adapter: 'shop_promotion_review',
      status: promotionStatus,
      code: promotionCode,
      amountMmk: 0,
    },
    tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
    shipping: expectedShipping as EcommerceCheckoutQuote['shipping'],
    payment: {
      adapter: payment.adapter as EcommercePaymentAdapter,
      status: 'not_authorized',
      amountMmk: 0,
    },
    totalMmk,
  }
}

export async function buildEcommerceCheckoutQuote(input: {
  pim: EcommercePimProjection
  cart: EcommerceCartLine[]
  customerReference: string
  customerProfile?: { name: string; phone: string; previous?: EcommerceCustomerProfileSnapshot | null }
  deliveryAddress?: { line1: string; township: string; city: string; instructions: string | null; previous?: EcommerceDeliveryAddressSnapshot | null } | null
  fulfilment: EcommerceFulfilment
  paymentAdapter: EcommercePaymentAdapter
  promotionCode: string | null
  idempotencyKey: string
  quotedAt: string
  expiresAt: string
}): Promise<EcommerceCheckoutQuote> {
  const pim = await validateEcommercePimProjection(input.pim)
  const key = canonicalText(input.idempotencyKey, 'idempotencyKey', 40)
  if (!checkoutKeyPattern.test(key)) throw new Error('Checkout idempotency key is invalid.')
  if (!fulfilmentMethods.includes(input.fulfilment)) throw new Error('Checkout fulfilment is unsupported.')
  if (!paymentAdapters.includes(input.paymentAdapter)) throw new Error('Checkout payment adapter is unsupported.')
  if (!ecommercePaymentMatchesFulfilment(input.fulfilment, input.paymentAdapter)) {
    throw new Error('Checkout payment does not match how the customer receives the order.')
  }
  const code = optionalText(input.promotionCode, 'promotionCode', 40)
  if (!Array.isArray(input.cart) || input.cart.length < 1 || input.cart.length > maxLines) throw new Error('Cart is empty or too large.')
  const quantities = new Map<string, number>()
  input.cart.forEach((candidate, index) => {
    const row = exactObject(candidate, `cart[${index}]`, ['sku', 'quantity'])
    const sku = canonicalToken(row.sku, `cart[${index}].sku`)
    if (quantities.has(sku)) throw new Error('Cart SKUs must be unique.')
    quantities.set(sku, safeInteger(row.quantity, `cart[${index}].quantity`, 1, maxQuantity))
  })
  const itemBySku = new Map(pim.items.map((item) => [item.sku, item]))
  const lines = [...quantities.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([sku, quantity]) => {
    const item = itemBySku.get(sku)
    if (!item) throw new Error(`Cart SKU ${sku} is not in the PIM projection.`)
    if (item.availability !== 'available') throw new Error(`Cart SKU ${sku} is sold out.`)
    const lineTotalMmk = item.unitPriceMmk * quantity
    if (!Number.isSafeInteger(lineTotalMmk)) throw new Error('Cart line exceeds the supported whole-MMK range.')
    return {
      sku,
      name: item.name,
      variant: item.variant,
      quantity,
      unitPriceMmk: item.unitPriceMmk,
      lineTotalMmk,
    }
  })
  const subtotalMmk = lines.reduce((total, line) => total + line.lineTotalMmk, 0)
  if (!Number.isSafeInteger(subtotalMmk)) throw new Error('Cart exceeds the supported whole-MMK range.')
  const customerProfile = input.customerProfile
    ? await buildEcommerceCustomerProfileSnapshot({
        ...input.customerProfile,
        savedAt: input.quotedAt,
        idempotencyKey: key,
      })
    : undefined
  const deliveryAddress = input.customerProfile
    ? input.fulfilment === 'delivery'
      ? await buildEcommerceDeliveryAddressSnapshot({
          ...(input.deliveryAddress ?? { line1: '', township: '', city: '', instructions: null }),
          savedAt: input.quotedAt,
          idempotencyKey: key,
        })
      : null
    : undefined
  const core = await quoteCore({
    schema: ECOMMERCE_QUOTE_SCHEMA,
    scope: pim.scope,
    quoteId: `ECQ-${key.slice(4)}`,
    idempotencyKey: key,
    quotedAt: input.quotedAt,
    expiresAt: input.expiresAt,
    sourcePreviewDigest: pim.sourcePreviewDigest,
    pimDigest: pim.pimDigest,
    currency: 'MMK',
    customerReference: input.customerReference,
    ...(customerProfile ? { customerProfile, deliveryAddress } : {}),
    fulfilment: input.fulfilment,
    lines,
    subtotalMmk,
    promotion: {
      adapter: 'shop_promotion_review',
      status: code ? 'pending_shop_review' : 'not_requested',
      code,
      amountMmk: 0,
    },
    tax: { adapter: 'price_inclusive', status: 'included', amountMmk: 0 },
    shipping: input.fulfilment === 'pickup'
      ? { adapter: 'pickup', status: 'included', amountMmk: 0 }
      : { adapter: 'shop_delivery_review', status: 'pending_shop_review', amountMmk: 0 },
    payment: { adapter: input.paymentAdapter, status: 'not_authorized', amountMmk: 0 },
    totalMmk: subtotalMmk,
  })
  return { ...core, quoteDigest: await ecommerceLifecycleDigest(core) }
}

export async function validateEcommerceCheckoutQuote(value: unknown): Promise<EcommerceCheckoutQuote> {
  const baseFields = [
    'schema', 'scope', 'quoteId', 'idempotencyKey', 'quotedAt', 'expiresAt',
    'sourcePreviewDigest', 'pimDigest', 'currency', 'customerReference', 'fulfilment',
    'lines', 'subtotalMmk', 'promotion', 'tax', 'shipping', 'payment', 'totalMmk', 'quoteDigest',
  ]
  const structuredFields = ['customerProfile', 'deliveryAddress']
  const structured = isRecord(value) && structuredFields.some((field) => field in value)
  const source = exactObject(value, 'checkout quote', structured ? [...baseFields, ...structuredFields] : baseFields)
  const { quoteDigest: rawDigest, ...rawCore } = source
  const core = await quoteCore(rawCore)
  const quoteDigest = canonicalDigest(rawDigest, 'checkout quote.quoteDigest')
  if (await ecommerceLifecycleDigest(core) !== quoteDigest) throw new Error('Checkout quote digest is invalid.')
  return { ...core, quoteDigest }
}

export async function buildEcommerceOrderRequestV2(
  quoteValue: EcommerceCheckoutQuote,
  sourceStorefront: { revision: number; actionId: string } | null = null,
): Promise<EcommerceOrderRequestV2> {
  const quote = await validateEcommerceCheckoutQuote(quoteValue)
  const request: EcommerceOrderRequestV2 = {
    schema: ECOMMERCE_REQUEST_SCHEMA_V2,
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: quote.scope,
    id: `ECR-${quote.idempotencyKey.slice(4)}`,
    idempotencyKey: quote.idempotencyKey,
    createdAt: quote.quotedAt,
    sourcePreviewDigest: quote.sourcePreviewDigest,
    sourceStorefrontRevision: sourceStorefront ? safeInteger(sourceStorefront.revision, 'sourceStorefront.revision', 1) : null,
    sourceStorefrontActionId: sourceStorefront ? canonicalToken(sourceStorefront.actionId, 'sourceStorefront.actionId') : null,
    customerReference: quote.customerReference,
    ...(quote.customerProfile ? {
      customerProfile: canonicalCopy(quote.customerProfile),
      deliveryAddress: quote.deliveryAddress ? canonicalCopy(quote.deliveryAddress) : null,
    } : {}),
    fulfilment: quote.fulfilment,
    currency: 'MMK',
    lines: canonicalCopy(quote.lines),
    quote,
    totalMmk: quote.totalMmk,
  }
  return validateEcommerceOrderRequestV2(request)
}

export async function validateEcommerceOrderRequestV2(value: unknown): Promise<EcommerceOrderRequestV2> {
  const baseFields = [
    'schema', 'mode', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt',
    'sourcePreviewDigest', 'sourceStorefrontRevision', 'sourceStorefrontActionId',
    'customerReference', 'fulfilment', 'currency', 'lines', 'quote', 'totalMmk',
  ]
  const structuredFields = ['customerProfile', 'deliveryAddress']
  const structured = isRecord(value) && structuredFields.some((field) => field in value)
  const source = exactObject(value, 'Ecommerce request', structured ? [...baseFields, ...structuredFields] : baseFields)
  if (source.schema !== ECOMMERCE_REQUEST_SCHEMA_V2
    || source.mode !== 'browser-local-request'
    || source.state !== 'pending_shop_review') throw new Error('Ecommerce request boundary is invalid.')
  const id = canonicalText(source.id, 'Ecommerce request.id', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'Ecommerce request.idempotencyKey', 40)
  if (!requestIdPattern.test(id)
    || !checkoutKeyPattern.test(idempotencyKey)
    || id.slice(4) !== idempotencyKey.slice(4)) throw new Error('Ecommerce request identity is invalid.')
  const quote = await validateEcommerceCheckoutQuote(source.quote)
  if (!Array.isArray(source.lines) || source.lines.length < 1 || source.lines.length > maxLines) throw new Error('Ecommerce request lines are invalid.')
  const lines = source.lines.map((line, index) => quoteLine(line, `Ecommerce request.lines[${index}]`))
  const revision = source.sourceStorefrontRevision === null
    ? null
    : safeInteger(source.sourceStorefrontRevision, 'sourceStorefrontRevision', 1)
  const actionId = source.sourceStorefrontActionId === null
    ? null
    : canonicalToken(source.sourceStorefrontActionId, 'sourceStorefrontActionId')
  if ((revision === null) !== (actionId === null)) throw new Error('Ecommerce request storefront provenance is incomplete.')
  const customerProfile = structured
    ? await customerProfileSnapshot(source.customerProfile, 'Ecommerce request.customerProfile')
    : undefined
  const deliveryAddress = structured
    ? source.deliveryAddress === null
      ? null
      : await deliveryAddressSnapshot(source.deliveryAddress, 'Ecommerce request.deliveryAddress')
    : undefined
  const request: EcommerceOrderRequestV2 = {
    schema: ECOMMERCE_REQUEST_SCHEMA_V2,
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: canonicalToken(source.scope, 'Ecommerce request.scope'),
    id,
    idempotencyKey,
    createdAt: canonicalTimestamp(source.createdAt, 'Ecommerce request.createdAt'),
    sourcePreviewDigest: canonicalDigest(source.sourcePreviewDigest, 'Ecommerce request.sourcePreviewDigest'),
    sourceStorefrontRevision: revision,
    sourceStorefrontActionId: actionId,
    customerReference: canonicalText(source.customerReference, 'Ecommerce request.customerReference', 80),
    ...(customerProfile ? { customerProfile, deliveryAddress: deliveryAddress ?? null } : {}),
    fulfilment: source.fulfilment as EcommerceFulfilment,
    currency: source.currency as 'MMK',
    lines,
    quote,
    totalMmk: safeInteger(source.totalMmk, 'Ecommerce request.totalMmk', 1),
  }
  if (request.scope !== quote.scope
    || request.createdAt !== quote.quotedAt
    || request.idempotencyKey !== quote.idempotencyKey
    || request.sourcePreviewDigest !== quote.sourcePreviewDigest
    || request.customerReference !== quote.customerReference
    || canonicalJson(request.customerProfile ?? null) !== canonicalJson(quote.customerProfile ?? null)
    || canonicalJson(request.deliveryAddress ?? null) !== canonicalJson(quote.deliveryAddress ?? null)
    || request.fulfilment !== quote.fulfilment
    || request.currency !== 'MMK'
    || canonicalJson(request.lines) !== canonicalJson(quote.lines)
    || request.totalMmk !== quote.totalMmk) throw new Error('Ecommerce request does not preserve its exact quote.')
  return request
}

export function createEmptyEcommerceBuyingState(scope: string): EcommerceBuyingState {
  return {
    schema: ECOMMERCE_BUYING_STATE_SCHEMA,
    scope: canonicalToken(scope, 'scope'),
    revision: 0,
    headDigest: EMPTY_ECOMMERCE_BUYING_DIGEST,
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

async function validateBuyingEvent(value: unknown, field: string): Promise<EcommerceBuyingEvent> {
  const source = exactObject(value, field, [
    'schema', 'sequence', 'action', 'subjectId', 'idempotencyKey', 'payloadDigest',
    'previousDigest', 'eventDigest',
  ])
  if (source.schema !== ECOMMERCE_BUYING_EVENT_SCHEMA
    || !['request_recorded', 'return_intent_recorded', 'support_intent_recorded', 'correction_intent_recorded', 'cancellation_intent_recorded', 'cancellation_decision_recorded', 'order_amendment_intent_recorded', 'order_reschedule_intent_recorded'].includes(String(source.action))) {
    throw new Error(`${field} boundary is invalid.`)
  }
  const core = {
    schema: ECOMMERCE_BUYING_EVENT_SCHEMA,
    sequence: safeInteger(source.sequence, `${field}.sequence`, 1),
    action: source.action,
    subjectId: canonicalToken(source.subjectId, `${field}.subjectId`),
    idempotencyKey: canonicalText(source.idempotencyKey, `${field}.idempotencyKey`, 40),
    payloadDigest: canonicalDigest(source.payloadDigest, `${field}.payloadDigest`),
    previousDigest: canonicalDigest(source.previousDigest, `${field}.previousDigest`),
  } as Omit<EcommerceBuyingEvent, 'eventDigest'>
  const eventDigest = canonicalDigest(source.eventDigest, `${field}.eventDigest`)
  if (await ecommerceLifecycleDigest(core) !== eventDigest) throw new Error(`${field}.eventDigest is invalid.`)
  return { ...core, eventDigest }
}

export async function validateEcommerceBuyingState(value: unknown, expectedScope?: string): Promise<EcommerceBuyingState> {
  if (!isRecord(value)) throw new Error('Buying state must be an object.')
  const legacyKeys = ['schema', 'scope', 'revision', 'headDigest', 'requests', 'returnIntents', 'events']
  const currentKeys = [...legacyKeys.slice(0, 6), 'supportIntents', 'events']
  const cancellationKeys = [...legacyKeys.slice(0, 6), 'supportIntents', 'cancellationIntents', 'events']
  const decisionKeys = [...legacyKeys.slice(0, 6), 'supportIntents', 'cancellationIntents', 'cancellationDecisions', 'events']
  const amendmentKeys = [...legacyKeys.slice(0, 6), 'supportIntents', 'cancellationIntents', 'cancellationDecisions', 'amendmentIntents', 'events']
  const rescheduleKeys = [...legacyKeys.slice(0, 6), 'supportIntents', 'cancellationIntents', 'cancellationDecisions', 'amendmentIntents', 'rescheduleIntents', 'events']
  const latestKeys = [...legacyKeys.slice(0, 6), 'supportIntents', 'correctionIntents', 'cancellationIntents', 'cancellationDecisions', 'amendmentIntents', 'rescheduleIntents', 'events']
  const actualKeys = Object.keys(value)
  const hasExactShape = (keys: string[]) => actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key))
  if (!hasExactShape(legacyKeys) && !hasExactShape(currentKeys) && !hasExactShape(cancellationKeys) && !hasExactShape(decisionKeys) && !hasExactShape(amendmentKeys) && !hasExactShape(rescheduleKeys) && !hasExactShape(latestKeys)) throw new Error('Buying state fields do not match the contract.')
  const source = value
  if (source.schema !== ECOMMERCE_BUYING_STATE_SCHEMA
    || !Array.isArray(source.requests)
    || !Array.isArray(source.returnIntents)
    || source.supportIntents !== undefined && !Array.isArray(source.supportIntents)
    || source.correctionIntents !== undefined && !Array.isArray(source.correctionIntents)
    || source.cancellationIntents !== undefined && !Array.isArray(source.cancellationIntents)
    || source.cancellationDecisions !== undefined && !Array.isArray(source.cancellationDecisions)
    || source.amendmentIntents !== undefined && !Array.isArray(source.amendmentIntents)
    || source.rescheduleIntents !== undefined && !Array.isArray(source.rescheduleIntents)
    || !Array.isArray(source.events)
    || source.requests.length > maxRecords
    || source.returnIntents.length > maxRecords
    || (source.supportIntents?.length ?? 0) > maxRecords
    || (source.correctionIntents?.length ?? 0) > maxRecords
    || (source.cancellationIntents?.length ?? 0) > maxRecords
    || (source.cancellationDecisions?.length ?? 0) > maxRecords
    || (source.amendmentIntents?.length ?? 0) > maxRecords
    || (source.rescheduleIntents?.length ?? 0) > maxRecords
    || source.events.length > maxRecords * 8) throw new Error('Buying state contract is invalid.')
  const scope = canonicalToken(source.scope, 'buying state.scope')
  if (expectedScope && scope !== canonicalToken(expectedScope, 'expectedScope')) throw new Error('Buying state belongs to a different workspace.')
  const requests = await Promise.all(source.requests.map((request) => validateEcommerceOrderRequestV2(request)))
  const returnIntents = source.returnIntents.map((intent) => validateEcommerceReturnIntent(intent))
  const supportIntents = (source.supportIntents ?? []).map((intent) => validateEcommerceSupportIntent(intent))
  const correctionIntents = (source.correctionIntents ?? []).map((intent) => validateEcommerceCorrectionIntent(intent))
  const cancellationIntents = (source.cancellationIntents ?? []).map((intent) => validateEcommerceCancellationIntent(intent))
  const cancellationDecisions = (source.cancellationDecisions ?? []).map((decision) => validateEcommerceCancellationDecision(decision))
  const amendmentIntents = (source.amendmentIntents ?? []).map((intent) => validateEcommerceOrderAmendmentIntent(intent))
  const rescheduleIntents = (source.rescheduleIntents ?? []).map((intent) => validateEcommerceOrderRescheduleIntent(intent))
  const events = await Promise.all(source.events.map((event, index) => validateBuyingEvent(event, `buying state.events[${index}]`)))
  const revision = safeInteger(source.revision, 'buying state.revision')
  if (revision !== events.length) throw new Error('Buying state revision does not match its history.')
  let previousDigest = EMPTY_ECOMMERCE_BUYING_DIGEST
  events.forEach((event, index) => {
    if (event.sequence !== index + 1 || event.previousDigest !== previousDigest) throw new Error('Buying state event chain is invalid.')
    previousDigest = event.eventDigest
  })
  const headDigest = canonicalDigest(source.headDigest, 'buying state.headDigest')
  if (headDigest !== previousDigest) throw new Error('Buying state head digest is invalid.')
  const records: EcommerceBuyingRecord[] = [...requests, ...returnIntents, ...supportIntents, ...correctionIntents, ...cancellationIntents, ...cancellationDecisions, ...amendmentIntents, ...rescheduleIntents]
  if (records.some((record) => record.scope !== scope)
    || new Set(records.map((record) => record.id)).size !== records.length
    || new Set(records.map((record) => record.idempotencyKey)).size !== records.length
    || events.length !== records.length) throw new Error('Buying state records are not unique and scope-bound.')
  const requestIds = new Set(requests.map((request) => request.id))
  if (returnIntents.some((intent) => !requestIds.has(intent.sourceRequestId))) {
    throw new Error('Return intent is not attributable to one recovered Ecommerce request.')
  }
  if (supportIntents.some((intent) => !requestIds.has(intent.sourceRequestId))) {
    throw new Error('Support intent is not attributable to one recovered Ecommerce request.')
  }
  if (correctionIntents.some((intent) => !requestIds.has(intent.sourceRequestId))) {
    throw new Error('Correction intent is not attributable to one recovered Ecommerce request.')
  }
  if (cancellationIntents.some((intent) => !requestIds.has(intent.sourceRequestId))) {
    throw new Error('Cancellation intent is not attributable to one recovered Ecommerce request.')
  }
  if (new Set(cancellationIntents.map((intent) => intent.orderId)).size !== cancellationIntents.length) {
    throw new Error('Only one cancellation request may exist for an Ecommerce order.')
  }
  const cancellationIntentById = new Map(cancellationIntents.map((intent) => [intent.id, intent]))
  if (new Set(cancellationDecisions.map((decision) => decision.intentId)).size !== cancellationDecisions.length) {
    throw new Error('Only one Shop decision may exist for an Ecommerce cancellation request.')
  }
  for (const decision of cancellationDecisions) {
    const intent = cancellationIntentById.get(decision.intentId)
    if (!intent
      || decision.scope !== intent.scope
      || decision.orderId !== intent.orderId
      || decision.sourceRequestId !== intent.sourceRequestId
      || decision.sourceAcknowledgementDigest !== intent.sourceAcknowledgementDigest
      || decision.orderStatus !== intent.orderStatus
      || decision.paymentStatus !== intent.paymentStatus
      || decision.refundStatus !== intent.refundStatus
      || decision.totalMmk !== intent.totalMmk
      || decision.evidenceReference !== intent.evidenceReference
      || decision.intentDigest !== await ecommerceLifecycleDigest(intent)) {
      throw new Error('Cancellation decision is not bound to its exact recovered request.')
    }
  }
  if (new Set(amendmentIntents.map((intent) => intent.orderId)).size !== amendmentIntents.length) {
    throw new Error('Only one amendment request may exist for an Ecommerce order.')
  }
  const requestById = new Map(requests.map((request) => [request.id, request]))
  for (const intent of amendmentIntents) {
    const sourceRequest = requestById.get(intent.sourceRequestId)
    const replacementRequest = requestById.get(intent.replacementRequestId)
    if (!sourceRequest
      || !replacementRequest
      || sourceRequest.id === replacementRequest.id
      || intent.replacementRequestDigest !== await ecommerceLifecycleDigest(replacementRequest)
      || replacementRequest.scope !== intent.scope
      || sourceRequest.scope !== intent.scope
      || !replacementIdentityIsBound(sourceRequest, replacementRequest)
      || sourceRequest.fulfilment !== intent.fromFulfilment
      || replacementRequest.fulfilment !== intent.toFulfilment) {
      throw new Error('Order amendment is not bound to its original and replacement Ecommerce requests.')
    }
  }
  if (new Set(rescheduleIntents.map((intent) => intent.orderId)).size !== rescheduleIntents.length) {
    throw new Error('Only one reschedule request may exist for an Ecommerce order.')
  }
  if (new Set([...amendmentIntents, ...rescheduleIntents].map((intent) => intent.orderId)).size !== amendmentIntents.length + rescheduleIntents.length) {
    throw new Error('Only one replacement workflow may exist for an Ecommerce order.')
  }
  if (new Set([...cancellationIntents, ...amendmentIntents, ...rescheduleIntents].map((intent) => intent.orderId)).size !== cancellationIntents.length + amendmentIntents.length + rescheduleIntents.length) {
    throw new Error('A cancellation request and a replacement workflow may not both exist for an Ecommerce order.')
  }
  for (const intent of rescheduleIntents) {
    const sourceRequest = requestById.get(intent.sourceRequestId)
    const replacementRequest = requestById.get(intent.replacementRequestId)
    if (!sourceRequest
      || !replacementRequest
      || sourceRequest.id === replacementRequest.id
      || intent.replacementRequestDigest !== await ecommerceLifecycleDigest(replacementRequest)
      || replacementRequest.scope !== intent.scope
      || sourceRequest.scope !== intent.scope
      || sourceRequest.customerReference !== replacementRequest.customerReference
      || sourceRequest.customerProfile?.phone !== replacementRequest.customerProfile?.phone
      || sourceRequest.fulfilment !== intent.fulfilment
      || replacementRequest.fulfilment !== intent.fulfilment) {
      throw new Error('Order reschedule is not bound to its original and replacement Ecommerce requests.')
    }
  }
  const byId = new Map(records.map((record) => [record.id, record]))
  for (const event of events) {
    const record = byId.get(event.subjectId)
    if (!record
      || record.idempotencyKey !== event.idempotencyKey
      || await ecommerceLifecycleDigest(record) !== event.payloadDigest) throw new Error('Buying event does not match its record.')
  }
  return { schema: ECOMMERCE_BUYING_STATE_SCHEMA, scope, revision, headDigest, requests, returnIntents, supportIntents, correctionIntents, cancellationIntents, cancellationDecisions, amendmentIntents, rescheduleIntents, events }
}

type EcommerceBuyingRecord = EcommerceOrderRequestV2 | EcommerceReturnIntent | EcommerceSupportIntent | EcommerceCorrectionIntent | EcommerceCancellationIntent | EcommerceCancellationDecision | EcommerceOrderAmendmentIntent | EcommerceOrderRescheduleIntent

async function appendBuyingRecord(
  stateValue: EcommerceBuyingState,
  record: EcommerceBuyingRecord,
  collection: 'requests' | 'returnIntents' | 'supportIntents' | 'correctionIntents' | 'cancellationIntents' | 'cancellationDecisions' | 'amendmentIntents' | 'rescheduleIntents',
  action: EcommerceBuyingEvent['action'],
  expectedHeadDigest: string,
) {
  const state = await validateEcommerceBuyingState(stateValue)
  if (canonicalDigest(expectedHeadDigest, 'expectedHeadDigest') !== state.headDigest) throw new Error('Buying state changed before this record was applied.')
  if (record.scope !== state.scope) throw new Error('Buying record belongs to a different workspace.')
  const allRecords: EcommerceBuyingRecord[] = [...state.requests, ...state.returnIntents, ...state.supportIntents, ...state.correctionIntents, ...state.cancellationIntents, ...state.cancellationDecisions, ...state.amendmentIntents, ...state.rescheduleIntents]
  const existing = allRecords.find((candidate) => candidate.id === record.id || candidate.idempotencyKey === record.idempotencyKey)
  if (existing) {
    if (canonicalJson(existing) !== canonicalJson(record)) throw new Error('Buying idempotency key conflicts with a different record.')
    return state
  }
  if (state[collection].length >= maxRecords) throw new Error('Buying record limit is reached.')
  const core: Omit<EcommerceBuyingEvent, 'eventDigest'> = {
    schema: ECOMMERCE_BUYING_EVENT_SCHEMA,
    sequence: state.revision + 1,
    action,
    subjectId: record.id,
    idempotencyKey: record.idempotencyKey,
    payloadDigest: await ecommerceLifecycleDigest(record),
    previousDigest: state.headDigest,
  }
  const event: EcommerceBuyingEvent = { ...core, eventDigest: await ecommerceLifecycleDigest(core) }
  const next = {
    ...state,
    revision: state.revision + 1,
    headDigest: event.eventDigest,
    [collection]: [record, ...state[collection]],
    events: [...state.events, event],
  } as EcommerceBuyingState
  return validateEcommerceBuyingState(next)
}

export async function recordEcommerceOrderRequestV2(
  state: EcommerceBuyingState,
  requestValue: EcommerceOrderRequestV2,
  expectedHeadDigest: string,
) {
  const request = await validateEcommerceOrderRequestV2(requestValue)
  return appendBuyingRecord(state, request, 'requests', 'request_recorded', expectedHeadDigest)
}

export function buildEcommerceReturnIntent(input: {
  scope: string
  orderSnapshot: CommerceOrder
  sku: string
  quantity: number
  disposition: EcommerceReturnDisposition
  reason: string
  idempotencyKey: string
  createdAt: string
}): EcommerceReturnIntent {
  const order = input.orderSnapshot
  if (!isRecord(order)
    || order.status !== 'completed'
    || !isRecord(order.completion)
    || !Array.isArray(order.lines)
    || order.lines.length < 1
    || order.lines.length > maxLines) {
    throw new Error('Returns require a completed Shop order with completion proof and exact sold lines.')
  }
  const orderId = canonicalToken(order.id, 'orderSnapshot.id')
  const sourceRequestId = canonicalText(order.sourceRecordId, 'orderSnapshot.sourceRecordId', 40)
  if (!requestIdPattern.test(sourceRequestId)) throw new Error('Return order is not attributable to an Ecommerce request.')
  const lines = order.lines.map((line, index) => ({
    sku: canonicalToken(line?.sku, `orderSnapshot.lines[${index}].sku`),
    quantity: safeInteger(line?.quantity, `orderSnapshot.lines[${index}].quantity`, 1, maxQuantity),
  }))
  const sku = canonicalToken(input.sku, 'sku')
  const matching = lines.filter((line) => line.sku === sku)
  if (matching.length !== 1) throw new Error('Return SKU is not one exact sold line.')
  const returned = (order.returns ?? []).reduce((total, record, index) => {
    const recordSku = canonicalToken(record?.sku, `orderSnapshot.returns[${index}].sku`)
    const recordQuantity = safeInteger(record?.quantity, `orderSnapshot.returns[${index}].quantity`, 1, maxQuantity)
    return recordSku === sku ? total + recordQuantity : total
  }, 0)
  const quantity = safeInteger(input.quantity, 'quantity', 1, maxQuantity)
  if (quantity > matching[0].quantity - returned) throw new Error('Return quantity exceeds the remaining sold quantity.')
  if (!returnDispositions.includes(input.disposition)) throw new Error('Return disposition is unsupported.')
  const idempotencyKey = canonicalText(input.idempotencyKey, 'idempotencyKey', 40)
  if (!returnKeyPattern.test(idempotencyKey)) throw new Error('Return idempotency key is invalid.')
  return validateEcommerceReturnIntent({
    schema: ECOMMERCE_RETURN_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(input.scope, 'scope'),
    id: `ERR-${idempotencyKey.slice(4)}`,
    idempotencyKey,
    createdAt: canonicalTimestamp(input.createdAt, 'createdAt'),
    orderId,
    sourceRequestId,
    sku,
    quantity,
    disposition: input.disposition,
    reason: canonicalText(input.reason, 'reason', 300),
    refundStatus: 'not_started',
    evidenceReference: `ECOMMERCE-RETURN:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}`,
  })
}

export function validateEcommerceReturnIntent(value: unknown): EcommerceReturnIntent {
  const source = exactObject(value, 'return intent', [
    'schema', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt', 'orderId',
    'sourceRequestId', 'sku', 'quantity', 'disposition', 'reason', 'refundStatus', 'evidenceReference',
  ])
  const id = canonicalText(source.id, 'return intent.id', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'return intent.idempotencyKey', 40)
  const sourceRequestId = canonicalText(source.sourceRequestId, 'return intent.sourceRequestId', 40)
  const orderId = canonicalToken(source.orderId, 'return intent.orderId')
  const evidenceReference = `ECOMMERCE-RETURN:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}`
  if (source.schema !== ECOMMERCE_RETURN_INTENT_SCHEMA
    || source.state !== 'pending_shop_review'
    || !returnIdPattern.test(id)
    || !returnKeyPattern.test(idempotencyKey)
    || id.slice(4) !== idempotencyKey.slice(4)
    || !requestIdPattern.test(sourceRequestId)
    || source.refundStatus !== 'not_started'
    || !returnDispositions.includes(source.disposition as EcommerceReturnDisposition)
    || source.evidenceReference !== evidenceReference) throw new Error('Return intent boundary is invalid.')
  return {
    schema: ECOMMERCE_RETURN_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(source.scope, 'return intent.scope'),
    id,
    idempotencyKey,
    createdAt: canonicalTimestamp(source.createdAt, 'return intent.createdAt'),
    orderId,
    sourceRequestId,
    sku: canonicalToken(source.sku, 'return intent.sku'),
    quantity: safeInteger(source.quantity, 'return intent.quantity', 1, maxQuantity),
    disposition: source.disposition as EcommerceReturnDisposition,
    reason: canonicalText(source.reason, 'return intent.reason', 300),
    refundStatus: 'not_started',
    evidenceReference,
  }
}

export function projectEcommerceReturnOutcome(
  intentValue: EcommerceReturnIntent,
  orderValue: CommerceOrder,
): EcommerceReturnOutcome | null {
  let intent: EcommerceReturnIntent
  try {
    intent = validateEcommerceReturnIntent(intentValue)
  } catch {
    return null
  }
  if (!isRecord(orderValue)
    || orderValue.id !== intent.orderId
    || orderValue.status !== 'completed'
    || !isRecord(orderValue.completion)
    || orderValue.sourceRecordId !== intent.sourceRequestId
    || !['none', 'due', 'settled'].includes(String(orderValue.refundStatus))
    || !Array.isArray(orderValue.returns)) return null
  const matchingEvidence = orderValue.returns.filter((record) => record?.evidenceReference === intent.evidenceReference)
  if (matchingEvidence.length !== 1) return null
  const record = matchingEvidence[0]
  if (record.sku !== intent.sku
    || record.quantity !== intent.quantity
    || record.disposition !== intent.disposition) return null
  let reviewedAt: string
  let reviewedBy: string
  let returnActionId: string
  try {
    reviewedAt = canonicalTimestamp(record.createdAt, 'return outcome.reviewedAt')
    reviewedBy = canonicalText(record.actor, 'return outcome.reviewedBy', 180)
    returnActionId = canonicalToken(record.actionId, 'return outcome.returnActionId')
    if (taxTimestampMicros(reviewedAt, 'return outcome.reviewedAt') < taxTimestampMicros(intent.createdAt, 'return intent.createdAt')) return null
  } catch {
    return null
  }
  const refundStatus = orderValue.refundStatus
  let refundSettledAt: string | null = null
  let refundSettledBy: string | null = null
  let refundEvidenceReference: string | null = null
  if (refundStatus === 'settled') {
    try {
      refundSettledAt = canonicalTimestamp(orderValue.refundSettledAt, 'return outcome.refundSettledAt')
      refundSettledBy = canonicalText(orderValue.refundSettledBy, 'return outcome.refundSettledBy', 180)
      refundEvidenceReference = canonicalText(orderValue.refundEvidenceReference, 'return outcome.refundEvidenceReference', 180)
      if (taxTimestampMicros(refundSettledAt, 'return outcome.refundSettledAt') < taxTimestampMicros(reviewedAt, 'return outcome.reviewedAt')) return null
    } catch {
      return null
    }
  }
  return {
    schema: ECOMMERCE_RETURN_OUTCOME_SCHEMA,
    state: 'accepted',
    scope: intent.scope,
    intentId: intent.id,
    orderId: intent.orderId,
    sourceRequestId: intent.sourceRequestId,
    sku: intent.sku,
    quantity: intent.quantity,
    disposition: intent.disposition,
    stockOutcome: intent.disposition === 'restock' ? 'restocked' : 'not_restocked',
    reviewedAt,
    reviewedBy,
    returnActionId,
    returnEvidenceReference: intent.evidenceReference,
    refundStatus,
    refundSettledAt,
    refundSettledBy,
    refundEvidenceReference,
    automaticRefundPerformed: false,
    customerMessageSent: false,
    providerCalled: false,
  }
}

export function buildEcommerceSupportIntent(input: {
  scope: string
  orderSnapshot: CommerceOrder
  category: EcommerceSupportCategory
  description: string
  idempotencyKey: string
  createdAt: string
}): EcommerceSupportIntent {
  const order = input.orderSnapshot
  if (!isRecord(order) || order.status !== 'completed' || !isRecord(order.completion)) {
    throw new Error('Support requests require a completed Shop order with completion proof.')
  }
  const orderId = canonicalToken(order.id, 'orderSnapshot.id')
  const sourceRequestId = canonicalText(order.sourceRecordId, 'orderSnapshot.sourceRecordId', 40)
  if (!requestIdPattern.test(sourceRequestId)) throw new Error('Support order is not attributable to an Ecommerce request.')
  if (!supportCategories.includes(input.category)) throw new Error('Support category is unsupported.')
  const idempotencyKey = canonicalText(input.idempotencyKey, 'idempotencyKey', 40)
  if (!supportKeyPattern.test(idempotencyKey)) throw new Error('Support idempotency key is invalid.')
  return validateEcommerceSupportIntent({
    schema: ECOMMERCE_SUPPORT_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(input.scope, 'scope'),
    id: `ESR-${idempotencyKey.slice(4)}`,
    idempotencyKey,
    createdAt: canonicalTimestamp(input.createdAt, 'createdAt'),
    orderId,
    sourceRequestId,
    category: input.category,
    description: canonicalText(input.description, 'description', 300),
    externalMessageSent: false,
    refundStarted: false,
    evidenceReference: `ECOMMERCE-SUPPORT:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}`,
  })
}

export function validateEcommerceSupportIntent(value: unknown): EcommerceSupportIntent {
  const source = exactObject(value, 'support intent', [
    'schema', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt', 'orderId',
    'sourceRequestId', 'category', 'description', 'externalMessageSent', 'refundStarted', 'evidenceReference',
  ])
  const id = canonicalText(source.id, 'support intent.id', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'support intent.idempotencyKey', 40)
  const sourceRequestId = canonicalText(source.sourceRequestId, 'support intent.sourceRequestId', 40)
  const orderId = canonicalToken(source.orderId, 'support intent.orderId')
  const evidenceReference = `ECOMMERCE-SUPPORT:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}`
  if (source.schema !== ECOMMERCE_SUPPORT_INTENT_SCHEMA
    || source.state !== 'pending_shop_review'
    || !supportIdPattern.test(id)
    || !supportKeyPattern.test(idempotencyKey)
    || id.slice(4) !== idempotencyKey.slice(4)
    || !requestIdPattern.test(sourceRequestId)
    || !supportCategories.includes(source.category as EcommerceSupportCategory)
    || source.externalMessageSent !== false
    || source.refundStarted !== false
    || source.evidenceReference !== evidenceReference) throw new Error('Support intent boundary is invalid.')
  return {
    schema: ECOMMERCE_SUPPORT_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(source.scope, 'support intent.scope'),
    id,
    idempotencyKey,
    createdAt: canonicalTimestamp(source.createdAt, 'support intent.createdAt'),
    orderId,
    sourceRequestId,
    category: source.category as EcommerceSupportCategory,
    description: canonicalText(source.description, 'support intent.description', 300),
    externalMessageSent: false,
    refundStarted: false,
    evidenceReference,
  }
}

export function projectEcommerceSupportOutcome(
  intentValue: EcommerceSupportIntent,
  orderValue: CommerceOrder,
): EcommerceSupportOutcome | null {
  let intent: EcommerceSupportIntent
  try {
    intent = validateEcommerceSupportIntent(intentValue)
  } catch {
    return null
  }
  if (!isRecord(orderValue)
    || orderValue.id !== intent.orderId
    || orderValue.status !== 'completed'
    || orderValue.sourceRecordId !== intent.sourceRequestId
    || !Array.isArray(orderValue.supportCases)) return null
  const matches = orderValue.supportCases.filter((supportCase) => supportCase?.sourceIntentId === intent.id)
  if (matches.length !== 1) return null
  const supportCase = matches[0]
  const service = commerceSupportServiceState(supportCase)
  const expectedCaseId = `CASE-${intent.id.slice(4)}`
  if (!service
    || supportCase.caseId !== expectedCaseId
    || supportCase.sourceRequestId !== intent.sourceRequestId
    || supportCase.customerRequestedAt !== intent.createdAt
    || supportCase.category !== intent.category
    || supportCase.customerDescription !== intent.description
    || supportCase.opening.evidenceReference !== intent.evidenceReference
    || supportCase.externalMessageSent !== false
    || supportCase.refundStarted !== false) return null
  let openedAt: string
  let openedBy: string
  let dueAt: string
  try {
    openedAt = canonicalTimestamp(supportCase.opening.capturedAt, 'support outcome.openedAt')
    openedBy = canonicalText(supportCase.opening.actor, 'support outcome.openedBy', 180)
    dueAt = canonicalTimestamp(service.dueAt, 'support outcome.dueAt')
    if (taxTimestampMicros(openedAt, 'support outcome.openedAt') < taxTimestampMicros(intent.createdAt, 'support intent.createdAt')) return null
  } catch {
    return null
  }
  const currentResolution = supportCase.reopen ? supportCase.followUpResolution : supportCase.resolution
  let resolutionOutcome: CommerceSupportResolutionOutcome | null = null
  let resolvedAt: string | null = null
  let resolvedBy: string | null = null
  let resolutionEvidenceReference: string | null = null
  if (supportCase.status === 'resolved') {
    if (!currentResolution || !supportResolutionOutcomes.includes(currentResolution.outcome)) return null
    try {
      resolutionOutcome = currentResolution.outcome
      resolvedAt = canonicalTimestamp(currentResolution.proof.capturedAt, 'support outcome.resolvedAt')
      resolvedBy = canonicalText(currentResolution.proof.actor, 'support outcome.resolvedBy', 180)
      resolutionEvidenceReference = canonicalText(currentResolution.proof.evidenceReference, 'support outcome.resolutionEvidenceReference', 180)
      if (taxTimestampMicros(resolvedAt, 'support outcome.resolvedAt') < taxTimestampMicros(openedAt, 'support outcome.openedAt')) return null
    } catch {
      return null
    }
  } else if (supportCase.status !== 'open' || currentResolution) return null
  return {
    schema: ECOMMERCE_SUPPORT_OUTCOME_SCHEMA,
    state: supportCase.status,
    scope: intent.scope,
    intentId: intent.id,
    orderId: intent.orderId,
    sourceRequestId: intent.sourceRequestId,
    caseId: supportCase.caseId,
    category: intent.category,
    openedAt,
    openedBy,
    owner: service.owner,
    priority: service.priority,
    dueAt,
    resolutionOutcome,
    resolvedAt,
    resolvedBy,
    resolutionEvidenceReference,
    externalMessageSent: false,
    refundStarted: false,
    providerCalled: false,
  }
}

export function buildEcommerceCorrectionIntent(input: {
  scope: string
  orderSnapshot: CommerceOrder
  requestedKind: CommerceCorrectionKind
  reasonCode: CommerceCorrectionReasonCode
  listedAmountMmk: number
  reason: string
  idempotencyKey: string
  createdAt: string
}): EcommerceCorrectionIntent {
  const order = input.orderSnapshot
  const sourceCalculationDigest = isRecord(order) ? commerceOrderCalculationDigest(order) : null
  const originalBalanceMmk = isRecord(order) ? commerceOrderAdjustedTotal(order) : null
  if (!isRecord(order)
    || order.status !== 'completed'
    || order.paymentStatus !== 'reconciled'
    || !isRecord(order.completion)
    || !sourceCalculationDigest
    || originalBalanceMmk === null) {
    throw new Error('Corrections require a calculated, reconciled, completed Shop order.')
  }
  const orderId = canonicalToken(order.id, 'orderSnapshot.id')
  const sourceRequestId = canonicalText(order.sourceRecordId, 'orderSnapshot.sourceRecordId', 40)
  if (!requestIdPattern.test(sourceRequestId)) throw new Error('Correction order is not attributable to an Ecommerce request.')
  if (!correctionKinds.includes(input.requestedKind)) throw new Error('Correction type is unsupported.')
  if (!correctionReasonCodes.includes(input.reasonCode)) throw new Error('Correction reason is unsupported.')
  const idempotencyKey = canonicalText(input.idempotencyKey, 'idempotencyKey', 40)
  if (!correctionKeyPattern.test(idempotencyKey)) throw new Error('Correction idempotency key is invalid.')
  const sourceCorrectionCount = safeInteger(order.corrections?.length ?? 0, 'orderSnapshot.corrections.length', 0, maxRecords)
  return validateEcommerceCorrectionIntent({
    schema: ECOMMERCE_CORRECTION_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(input.scope, 'scope'),
    id: `ECO-${idempotencyKey.slice(4)}`,
    idempotencyKey,
    createdAt: canonicalTimestamp(input.createdAt, 'createdAt'),
    orderId,
    sourceRequestId,
    sourceCalculationDigest,
    sourceCorrectionCount,
    originalBalanceMmk,
    paymentStatus: 'reconciled',
    refundStatus: order.refundStatus,
    requestedKind: input.requestedKind,
    reasonCode: input.reasonCode,
    listedAmountMmk: safeInteger(input.listedAmountMmk, 'listedAmountMmk', 1, maxSafeInteger),
    reason: canonicalText(input.reason, 'reason', 300),
    orderChanged: false,
    paymentChanged: false,
    refundStarted: false,
    ledgerPosted: false,
    taxFiled: false,
    customerMessageSent: false,
    providerCalled: false,
    evidenceReference: `ECOMMERCE-CORRECTION:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}:${sourceCalculationDigest.slice(7, 15)}:${sourceCorrectionCount}`,
  })
}

export function validateEcommerceCorrectionIntent(value: unknown): EcommerceCorrectionIntent {
  const source = exactObject(value, 'correction intent', [
    'schema', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt', 'orderId', 'sourceRequestId',
    'sourceCalculationDigest', 'sourceCorrectionCount', 'originalBalanceMmk', 'paymentStatus', 'refundStatus',
    'requestedKind', 'reasonCode', 'listedAmountMmk', 'reason', 'orderChanged', 'paymentChanged',
    'refundStarted', 'ledgerPosted', 'taxFiled', 'customerMessageSent', 'providerCalled', 'evidenceReference',
  ])
  const id = canonicalText(source.id, 'correction intent.id', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'correction intent.idempotencyKey', 40)
  const orderId = canonicalToken(source.orderId, 'correction intent.orderId')
  const sourceRequestId = canonicalText(source.sourceRequestId, 'correction intent.sourceRequestId', 40)
  const sourceCalculationDigest = canonicalDigest(source.sourceCalculationDigest, 'correction intent.sourceCalculationDigest')
  const sourceCorrectionCount = safeInteger(source.sourceCorrectionCount, 'correction intent.sourceCorrectionCount', 0, maxRecords)
  const evidenceReference = `ECOMMERCE-CORRECTION:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}:${sourceCalculationDigest.slice(7, 15)}:${sourceCorrectionCount}`
  if (source.schema !== ECOMMERCE_CORRECTION_INTENT_SCHEMA
    || source.state !== 'pending_shop_review'
    || !correctionIdPattern.test(id)
    || !correctionKeyPattern.test(idempotencyKey)
    || id.slice(4) !== idempotencyKey.slice(4)
    || !requestIdPattern.test(sourceRequestId)
    || source.paymentStatus !== 'reconciled'
    || !['none', 'due', 'settled'].includes(String(source.refundStatus))
    || !correctionKinds.includes(source.requestedKind as CommerceCorrectionKind)
    || !correctionReasonCodes.includes(source.reasonCode as CommerceCorrectionReasonCode)
    || source.orderChanged !== false
    || source.paymentChanged !== false
    || source.refundStarted !== false
    || source.ledgerPosted !== false
    || source.taxFiled !== false
    || source.customerMessageSent !== false
    || source.providerCalled !== false
    || source.evidenceReference !== evidenceReference) throw new Error('Correction intent boundary is invalid.')
  return {
    schema: ECOMMERCE_CORRECTION_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(source.scope, 'correction intent.scope'),
    id,
    idempotencyKey,
    createdAt: canonicalTimestamp(source.createdAt, 'correction intent.createdAt'),
    orderId,
    sourceRequestId,
    sourceCalculationDigest,
    sourceCorrectionCount,
    originalBalanceMmk: safeInteger(source.originalBalanceMmk, 'correction intent.originalBalanceMmk', 0, maxSafeInteger),
    paymentStatus: 'reconciled',
    refundStatus: source.refundStatus as EcommerceCorrectionIntent['refundStatus'],
    requestedKind: source.requestedKind as CommerceCorrectionKind,
    reasonCode: source.reasonCode as CommerceCorrectionReasonCode,
    listedAmountMmk: safeInteger(source.listedAmountMmk, 'correction intent.listedAmountMmk', 1, maxSafeInteger),
    reason: canonicalText(source.reason, 'correction intent.reason', 300),
    orderChanged: false,
    paymentChanged: false,
    refundStarted: false,
    ledgerPosted: false,
    taxFiled: false,
    customerMessageSent: false,
    providerCalled: false,
    evidenceReference,
  }
}

export function projectEcommerceCorrectionOutcome(
  intentValue: EcommerceCorrectionIntent,
  orderValue: CommerceOrder,
): EcommerceCorrectionOutcome | null {
  let intent: EcommerceCorrectionIntent
  try {
    intent = validateEcommerceCorrectionIntent(intentValue)
  } catch {
    return null
  }
  if (!isRecord(orderValue)
    || orderValue.id !== intent.orderId
    || orderValue.status !== 'completed'
    || orderValue.sourceRecordId !== intent.sourceRequestId
    || !Array.isArray(orderValue.corrections)) return null
  const matches = orderValue.corrections
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record?.evidenceReference === intent.evidenceReference)
  if (matches.length !== 1) return null
  const { record, index } = matches[0]
  if (orderValue.corrections.length - index - 1 !== intent.sourceCorrectionCount
    || record.sourceCalculationDigest !== intent.sourceCalculationDigest
    || record.kind !== intent.requestedKind
    || record.reasonCode !== intent.reasonCode
    || record.calculation?.listedAmountMmk !== intent.listedAmountMmk
    || record.financialStatus !== 'review_required'
    || record.postingAuthority !== 'none'
    || record.externalPostingPerformed !== false) return null
  const adjustmentTotalMmk = record.calculation.totalMmk
  const expectedBalance = intent.originalBalanceMmk + (intent.requestedKind === 'debit' ? adjustmentTotalMmk : -adjustmentTotalMmk)
  if (!Number.isSafeInteger(adjustmentTotalMmk)
    || adjustmentTotalMmk < 1
    || !Number.isSafeInteger(expectedBalance)
    || expectedBalance < 0
    || record.balanceAfterMmk !== expectedBalance) return null
  let reviewedAt: string
  let reviewedBy: string
  let correctionActionId: string
  try {
    reviewedAt = canonicalTimestamp(record.createdAt, 'correction outcome.reviewedAt')
    reviewedBy = canonicalText(record.actor, 'correction outcome.reviewedBy', 180)
    correctionActionId = canonicalToken(record.actionId, 'correction outcome.correctionActionId')
    if (taxTimestampMicros(reviewedAt, 'correction outcome.reviewedAt') < taxTimestampMicros(intent.createdAt, 'correction intent.createdAt')) return null
  } catch {
    return null
  }
  return {
    schema: ECOMMERCE_CORRECTION_OUTCOME_SCHEMA,
    state: 'review_required',
    scope: intent.scope,
    intentId: intent.id,
    orderId: intent.orderId,
    sourceRequestId: intent.sourceRequestId,
    reviewedAt,
    reviewedBy,
    correctionActionId,
    kind: intent.requestedKind,
    reasonCode: intent.reasonCode,
    listedAmountMmk: intent.listedAmountMmk,
    adjustmentTotalMmk,
    balanceAfterMmk: record.balanceAfterMmk,
    financialStatus: 'review_required',
    postingAuthority: 'none',
    externalPostingPerformed: false,
    automaticPaymentPerformed: false,
    automaticRefundPerformed: false,
    customerMessageSent: false,
    providerCalled: false,
  }
}

export function buildEcommerceCancellationIntent(input: {
  scope: string
  commerceState: CommerceState
  orderId: string
  reasonCode: EcommerceCancellationReasonCode
  reason: string
  idempotencyKey: string
  createdAt: string
}): EcommerceCancellationIntent {
  const orderId = canonicalToken(input.orderId, 'orderId')
  const order = input.commerceState.orders.find((candidate) => candidate.id === orderId)
  const acknowledgement = commerceOrderAcknowledgement(input.commerceState, orderId)
  if (!order
    || !acknowledgement
    || acknowledgement.schema !== COMMERCE_ORDER_ACKNOWLEDGEMENT_SCHEMA
    || !['confirmed', 'preparing', 'ready'].includes(order.status)
    || acknowledgement.status !== order.status
    || acknowledgement.cancellation.state !== 'not_cancelled'
    || acknowledgement.payment.status !== order.paymentStatus
    || acknowledgement.payment.refundStatus !== 'none'
    || acknowledgement.totalMmk !== order.total) {
    throw new Error('Cancellation requests require one attributable active Shop order acknowledgement.')
  }
  const sourceRequestId = canonicalText(acknowledgement.evidence.sourceRecordId, 'order acknowledgement sourceRecordId', 40)
  if (!requestIdPattern.test(sourceRequestId)) throw new Error('Cancellation order is not attributable to an Ecommerce request.')
  if (!cancellationReasonCodes.includes(input.reasonCode)) throw new Error('Cancellation reason code is unsupported.')
  const idempotencyKey = canonicalText(input.idempotencyKey, 'idempotencyKey', 40)
  if (!cancellationKeyPattern.test(idempotencyKey)) throw new Error('Cancellation idempotency key is invalid.')
  const createdAt = canonicalTimestamp(input.createdAt, 'createdAt')
  if (taxTimestampMicros(createdAt, 'createdAt') < taxTimestampMicros(order.createdAt, 'order.createdAt')) {
    throw new Error('Cancellation request cannot predate the Shop order.')
  }
  return validateEcommerceCancellationIntent({
    schema: ECOMMERCE_CANCELLATION_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(input.scope, 'scope'),
    id: `ECN-${idempotencyKey.slice(4)}`,
    idempotencyKey,
    createdAt,
    orderId,
    sourceRequestId,
    sourceAcknowledgementDigest: acknowledgement.digest,
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    refundStatus: 'none',
    totalMmk: acknowledgement.totalMmk,
    reasonCode: input.reasonCode,
    reason: canonicalText(input.reason, 'reason', 300),
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    evidenceReference: `ECOMMERCE-CANCELLATION:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}:${acknowledgement.digest.slice(7, 15)}`,
  })
}

export function validateEcommerceCancellationIntent(value: unknown): EcommerceCancellationIntent {
  const source = exactObject(value, 'cancellation intent', [
    'schema', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt', 'orderId',
    'sourceRequestId', 'sourceAcknowledgementDigest', 'orderStatus', 'paymentStatus',
    'refundStatus', 'totalMmk', 'reasonCode', 'reason', 'customerMessageSent',
    'orderCancelled', 'refundStarted', 'evidenceReference',
  ])
  const id = canonicalText(source.id, 'cancellation intent.id', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'cancellation intent.idempotencyKey', 40)
  const sourceRequestId = canonicalText(source.sourceRequestId, 'cancellation intent.sourceRequestId', 40)
  const orderId = canonicalToken(source.orderId, 'cancellation intent.orderId')
  const sourceAcknowledgementDigest = canonicalDigest(source.sourceAcknowledgementDigest, 'cancellation intent.sourceAcknowledgementDigest')
  const evidenceReference = `ECOMMERCE-CANCELLATION:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}:${sourceAcknowledgementDigest.slice(7, 15)}`
  if (source.schema !== ECOMMERCE_CANCELLATION_INTENT_SCHEMA
    || source.state !== 'pending_shop_review'
    || !cancellationIdPattern.test(id)
    || !cancellationKeyPattern.test(idempotencyKey)
    || id.slice(4) !== idempotencyKey.slice(4)
    || !requestIdPattern.test(sourceRequestId)
    || !['confirmed', 'preparing', 'ready'].includes(String(source.orderStatus))
    || !['pending', 'reconciled'].includes(String(source.paymentStatus))
    || source.refundStatus !== 'none'
    || !cancellationReasonCodes.includes(source.reasonCode as EcommerceCancellationReasonCode)
    || source.customerMessageSent !== false
    || source.orderCancelled !== false
    || source.refundStarted !== false
    || source.evidenceReference !== evidenceReference) throw new Error('Cancellation intent boundary is invalid.')
  return {
    schema: ECOMMERCE_CANCELLATION_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(source.scope, 'cancellation intent.scope'),
    id,
    idempotencyKey,
    createdAt: canonicalTimestamp(source.createdAt, 'cancellation intent.createdAt'),
    orderId,
    sourceRequestId,
    sourceAcknowledgementDigest,
    orderStatus: source.orderStatus as EcommerceCancellationIntent['orderStatus'],
    paymentStatus: source.paymentStatus as EcommerceCancellationIntent['paymentStatus'],
    refundStatus: 'none',
    totalMmk: safeInteger(source.totalMmk, 'cancellation intent.totalMmk', 1, maxSafeInteger),
    reasonCode: source.reasonCode as EcommerceCancellationReasonCode,
    reason: canonicalText(source.reason, 'cancellation intent.reason', 300),
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    evidenceReference,
  }
}

export function ecommerceCancellationMatchesCurrentShop(state: CommerceState, intentValue: EcommerceCancellationIntent) {
  const intent = validateEcommerceCancellationIntent(intentValue)
  const order = state.orders.find((candidate) => candidate.id === intent.orderId)
  const acknowledgement = commerceOrderAcknowledgement(state, intent.orderId)
  return Boolean(order
    && acknowledgement
    && order.sourceRecordId === intent.sourceRequestId
    && acknowledgement.digest === intent.sourceAcknowledgementDigest
    && acknowledgement.status === intent.orderStatus
    && acknowledgement.payment.status === intent.paymentStatus
    && acknowledgement.payment.refundStatus === intent.refundStatus
    && acknowledgement.totalMmk === intent.totalMmk
    && acknowledgement.cancellation.state === 'not_cancelled'
    && commerceOrderHasReleasableReservation(state, intent.orderId))
}

export async function buildEcommerceCancellationDecision(input: {
  scope: string
  commerceState: CommerceState
  intent: EcommerceCancellationIntent
  proof: CommerceActionProof
}): Promise<EcommerceCancellationDecision> {
  const intent = validateEcommerceCancellationIntent(input.intent)
  if (canonicalToken(input.scope, 'scope') !== intent.scope) throw new Error('Cancellation decision belongs to a different Ecommerce workspace.')
  if (!ecommerceCancellationMatchesCurrentShop(input.commerceState, intent)) {
    throw new Error('Cancellation decision requires the exact active Shop order reviewed by the customer request.')
  }
  const proof = exactObject(input.proof, 'cancellation decision proof', [
    'actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference',
  ])
  const createdAt = canonicalTimestamp(proof.capturedAt, 'cancellation decision proof.capturedAt')
  if (taxTimestampMicros(createdAt, 'cancellation decision proof.capturedAt') < taxTimestampMicros(intent.createdAt, 'cancellation intent.createdAt')) {
    throw new Error('Cancellation decision cannot predate the customer request.')
  }
  if (proof.evidenceReference !== intent.evidenceReference) throw new Error('Cancellation decision evidence must remain fixed to the customer request.')
  const suffix = intent.id.slice(4)
  return validateEcommerceCancellationDecision({
    schema: ECOMMERCE_CANCELLATION_DECISION_SCHEMA,
    state: 'kept_by_shop',
    scope: intent.scope,
    id: `ECD-${suffix}`,
    idempotencyKey: `CDI-${suffix}`,
    createdAt,
    intentId: intent.id,
    intentDigest: await ecommerceLifecycleDigest(intent),
    orderId: intent.orderId,
    sourceRequestId: intent.sourceRequestId,
    sourceAcknowledgementDigest: intent.sourceAcknowledgementDigest,
    orderStatus: intent.orderStatus,
    paymentStatus: intent.paymentStatus,
    refundStatus: intent.refundStatus,
    totalMmk: intent.totalMmk,
    actor: canonicalText(proof.actor, 'cancellation decision proof.actor', 120),
    reason: canonicalText(proof.reason, 'cancellation decision proof.reason', 180),
    evidenceReference: intent.evidenceReference,
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    providerCalled: false,
  })
}

export function validateEcommerceCancellationDecision(value: unknown): EcommerceCancellationDecision {
  const source = exactObject(value, 'cancellation decision', [
    'schema', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt', 'intentId',
    'intentDigest', 'orderId', 'sourceRequestId', 'sourceAcknowledgementDigest',
    'orderStatus', 'paymentStatus', 'refundStatus', 'totalMmk', 'actor', 'reason',
    'evidenceReference', 'customerMessageSent', 'orderCancelled', 'refundStarted', 'providerCalled',
  ])
  const id = canonicalText(source.id, 'cancellation decision.id', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'cancellation decision.idempotencyKey', 40)
  const intentId = canonicalText(source.intentId, 'cancellation decision.intentId', 40)
  if (source.schema !== ECOMMERCE_CANCELLATION_DECISION_SCHEMA
    || source.state !== 'kept_by_shop'
    || !cancellationDecisionIdPattern.test(id)
    || !cancellationDecisionKeyPattern.test(idempotencyKey)
    || !cancellationIdPattern.test(intentId)
    || id.slice(4) !== idempotencyKey.slice(4)
    || id.slice(4) !== intentId.slice(4)
    || !requestIdPattern.test(String(source.sourceRequestId))
    || !['confirmed', 'preparing', 'ready'].includes(String(source.orderStatus))
    || !['pending', 'reconciled'].includes(String(source.paymentStatus))
    || source.refundStatus !== 'none'
    || source.customerMessageSent !== false
    || source.orderCancelled !== false
    || source.refundStarted !== false
    || source.providerCalled !== false) throw new Error('Cancellation decision boundary is invalid.')
  return {
    schema: ECOMMERCE_CANCELLATION_DECISION_SCHEMA,
    state: 'kept_by_shop',
    scope: canonicalToken(source.scope, 'cancellation decision.scope'),
    id,
    idempotencyKey,
    createdAt: canonicalTimestamp(source.createdAt, 'cancellation decision.createdAt'),
    intentId,
    intentDigest: canonicalDigest(source.intentDigest, 'cancellation decision.intentDigest'),
    orderId: canonicalToken(source.orderId, 'cancellation decision.orderId'),
    sourceRequestId: canonicalText(source.sourceRequestId, 'cancellation decision.sourceRequestId', 40),
    sourceAcknowledgementDigest: canonicalDigest(source.sourceAcknowledgementDigest, 'cancellation decision.sourceAcknowledgementDigest'),
    orderStatus: source.orderStatus as EcommerceCancellationDecision['orderStatus'],
    paymentStatus: source.paymentStatus as EcommerceCancellationDecision['paymentStatus'],
    refundStatus: 'none',
    totalMmk: safeInteger(source.totalMmk, 'cancellation decision.totalMmk', 1, maxSafeInteger),
    actor: canonicalText(source.actor, 'cancellation decision.actor', 120),
    reason: canonicalText(source.reason, 'cancellation decision.reason', 180),
    evidenceReference: canonicalText(source.evidenceReference, 'cancellation decision.evidenceReference', 180),
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    providerCalled: false,
  }
}

export async function buildEcommerceOrderAmendmentIntent(input: {
  scope: string
  commerceState: CommerceState
  orderId: string
  replacementRequest: EcommerceOrderRequestV2
  reason: string
  idempotencyKey: string
  createdAt: string
}): Promise<EcommerceOrderAmendmentIntent> {
  const scope = canonicalToken(input.scope, 'scope')
  const orderId = canonicalToken(input.orderId, 'orderId')
  const order = input.commerceState.orders.find((candidate) => candidate.id === orderId)
  const acknowledgement = commerceOrderAcknowledgement(input.commerceState, orderId)
  const replacementRequest = await validateEcommerceOrderRequestV2(input.replacementRequest)
  if (!order
    || !acknowledgement
    || order.status !== 'confirmed'
    || order.paymentStatus !== 'pending'
    || order.refundStatus !== 'none'
    || acknowledgement.status !== order.status
    || acknowledgement.payment.status !== order.paymentStatus
    || acknowledgement.payment.refundStatus !== order.refundStatus
    || acknowledgement.cancellation.state !== 'not_cancelled'
    || acknowledgement.totalMmk !== order.total
    || !commerceOrderHasReleasableReservation(input.commerceState, orderId)) {
    throw new Error('Order changes require one confirmed, unpaid, uncancelled Ecommerce order with exact reserved stock.')
  }
  const sourceRequestId = canonicalText(acknowledgement.evidence.sourceRecordId, 'order acknowledgement sourceRecordId', 40)
  if (!requestIdPattern.test(sourceRequestId)
    || replacementRequest.scope !== scope
    || replacementRequest.id === sourceRequestId) throw new Error('Order change is not attributable to distinct Ecommerce requests in one workspace.')
  const originalLines = acknowledgement.lines.map((line) => ({ sku: line.sku, name: line.name, quantity: line.quantity })).sort((left, right) => left.sku.localeCompare(right.sku))
  const replacementLines = replacementRequest.lines.map((line) => ({ sku: line.sku, name: line.name, quantity: line.quantity })).sort((left, right) => left.sku.localeCompare(right.sku))
  if (originalLines.length !== replacementLines.length
    || originalLines.some((line, index) => line.sku !== replacementLines[index]?.sku)) {
    throw new Error('This amendment version can change quantities or fulfilment, but cannot add or remove SKUs.')
  }
  const lineChanges = originalLines.flatMap((line, index): EcommerceOrderAmendmentLineChange[] => {
    const replacement = replacementLines[index]
    return replacement && replacement.quantity !== line.quantity
      ? [{ sku: line.sku, name: line.name, fromQuantity: line.quantity, toQuantity: replacement.quantity }]
      : []
  })
  const sourceRequest = input.commerceState.storefrontRequests?.find((request) => request.id === sourceRequestId)
  const fromFulfilment = sourceRequest?.schema === ECOMMERCE_REQUEST_SCHEMA_V2
    ? sourceRequest.fulfilment
    : order.fulfilment as EcommerceFulfilment
  const identityChanged = sourceRequest?.schema === ECOMMERCE_REQUEST_SCHEMA_V2
    ? replacementIdentityChanged(sourceRequest, replacementRequest)
    : false
  if (sourceRequest?.schema === ECOMMERCE_REQUEST_SCHEMA_V2
    && !replacementIdentityIsBound(sourceRequest, replacementRequest)) {
    throw new Error('Contact or delivery corrections must advance the exact prior customer and address snapshots.')
  }
  if (!fulfilmentMethods.includes(fromFulfilment)
    || (!lineChanges.length && fromFulfilment === replacementRequest.fulfilment && !identityChanged)) {
    throw new Error('Change a quantity, fulfilment method, contact, or delivery detail before Shop review.')
  }
  const idempotencyKey = canonicalText(input.idempotencyKey, 'idempotencyKey', 40)
  if (!amendmentKeyPattern.test(idempotencyKey)) throw new Error('Order amendment idempotency key is invalid.')
  const createdAt = canonicalTimestamp(input.createdAt, 'createdAt')
  if (taxTimestampMicros(createdAt, 'createdAt') < taxTimestampMicros(order.createdAt, 'order.createdAt')
    || taxTimestampMicros(createdAt, 'createdAt') < taxTimestampMicros(replacementRequest.createdAt, 'replacementRequest.createdAt')) {
    throw new Error('Order amendment cannot predate its order or replacement request.')
  }
  const replacementRequestDigest = await ecommerceLifecycleDigest(replacementRequest)
  return validateEcommerceOrderAmendmentIntent({
    schema: ECOMMERCE_ORDER_AMENDMENT_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope,
    id: `EAM-${idempotencyKey.slice(4)}`,
    idempotencyKey,
    createdAt,
    orderId,
    sourceRequestId,
    sourceAcknowledgementDigest: acknowledgement.digest,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: acknowledgement.totalMmk,
    replacementRequestId: replacementRequest.id,
    replacementRequestDigest,
    lineChanges,
    fromFulfilment,
    toFulfilment: replacementRequest.fulfilment,
    reason: canonicalText(input.reason, 'reason', 300),
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference: `ECOMMERCE-AMENDMENT:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}:${replacementRequest.id}:${replacementRequestDigest.slice(7, 15)}`,
  })
}

export function validateEcommerceOrderAmendmentIntent(value: unknown): EcommerceOrderAmendmentIntent {
  const source = exactObject(value, 'order amendment intent', [
    'schema', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt', 'orderId',
    'sourceRequestId', 'sourceAcknowledgementDigest', 'orderStatus', 'paymentStatus',
    'refundStatus', 'originalTotalMmk', 'replacementRequestId', 'replacementRequestDigest',
    'lineChanges', 'fromFulfilment', 'toFulfilment', 'reason', 'customerMessageSent',
    'orderChanged', 'stockChanged', 'paymentChanged', 'refundStarted', 'providerCalled',
    'evidenceReference',
  ])
  const id = canonicalText(source.id, 'order amendment intent.id', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'order amendment intent.idempotencyKey', 40)
  const orderId = canonicalToken(source.orderId, 'order amendment intent.orderId')
  const sourceRequestId = canonicalText(source.sourceRequestId, 'order amendment intent.sourceRequestId', 40)
  const replacementRequestId = canonicalText(source.replacementRequestId, 'order amendment intent.replacementRequestId', 40)
  const replacementRequestDigest = canonicalDigest(source.replacementRequestDigest, 'order amendment intent.replacementRequestDigest')
  if (!Array.isArray(source.lineChanges) || source.lineChanges.length > maxLines) throw new Error('Order amendment line changes are invalid.')
  const lineChanges = source.lineChanges.map((candidate, index): EcommerceOrderAmendmentLineChange => {
    const line = exactObject(candidate, `order amendment intent.lineChanges[${index}]`, ['sku', 'name', 'fromQuantity', 'toQuantity'])
    const fromQuantity = safeInteger(line.fromQuantity, `order amendment intent.lineChanges[${index}].fromQuantity`, 1, maxQuantity)
    const toQuantity = safeInteger(line.toQuantity, `order amendment intent.lineChanges[${index}].toQuantity`, 1, maxQuantity)
    if (fromQuantity === toQuantity) throw new Error('Order amendment line change must alter quantity.')
    return {
      sku: canonicalToken(line.sku, `order amendment intent.lineChanges[${index}].sku`),
      name: canonicalText(line.name, `order amendment intent.lineChanges[${index}].name`, 180),
      fromQuantity,
      toQuantity,
    }
  }).sort((left, right) => left.sku.localeCompare(right.sku))
  const fromFulfilment = source.fromFulfilment as EcommerceFulfilment
  const toFulfilment = source.toFulfilment as EcommerceFulfilment
  const evidenceReference = `ECOMMERCE-AMENDMENT:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}:${replacementRequestId}:${replacementRequestDigest.slice(7, 15)}`
  if (source.schema !== ECOMMERCE_ORDER_AMENDMENT_INTENT_SCHEMA
    || source.state !== 'pending_shop_review'
    || !amendmentIdPattern.test(id)
    || !amendmentKeyPattern.test(idempotencyKey)
    || id.slice(4) !== idempotencyKey.slice(4)
    || !requestIdPattern.test(sourceRequestId)
    || !requestIdPattern.test(replacementRequestId)
    || sourceRequestId === replacementRequestId
    || source.orderStatus !== 'confirmed'
    || source.paymentStatus !== 'pending'
    || source.refundStatus !== 'none'
    || !fulfilmentMethods.includes(fromFulfilment)
    || !fulfilmentMethods.includes(toFulfilment)
    || new Set(lineChanges.map((line) => line.sku)).size !== lineChanges.length
    || source.customerMessageSent !== false
    || source.orderChanged !== false
    || source.stockChanged !== false
    || source.paymentChanged !== false
    || source.refundStarted !== false
    || source.providerCalled !== false
    || source.evidenceReference !== evidenceReference) throw new Error('Order amendment intent boundary is invalid.')
  return {
    schema: ECOMMERCE_ORDER_AMENDMENT_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(source.scope, 'order amendment intent.scope'),
    id,
    idempotencyKey,
    createdAt: canonicalTimestamp(source.createdAt, 'order amendment intent.createdAt'),
    orderId,
    sourceRequestId,
    sourceAcknowledgementDigest: canonicalDigest(source.sourceAcknowledgementDigest, 'order amendment intent.sourceAcknowledgementDigest'),
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: safeInteger(source.originalTotalMmk, 'order amendment intent.originalTotalMmk', 1, maxSafeInteger),
    replacementRequestId,
    replacementRequestDigest,
    lineChanges,
    fromFulfilment,
    toFulfilment,
    reason: canonicalText(source.reason, 'order amendment intent.reason', 300),
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference,
  }
}

export async function recordEcommerceOrderAmendment(
  state: EcommerceBuyingState,
  replacementRequestValue: EcommerceOrderRequestV2,
  intentValue: EcommerceOrderAmendmentIntent,
  expectedHeadDigest: string,
) {
  const replacementRequest = await validateEcommerceOrderRequestV2(replacementRequestValue)
  const intent = validateEcommerceOrderAmendmentIntent(intentValue)
  if (intent.replacementRequestId !== replacementRequest.id
    || intent.replacementRequestDigest !== await ecommerceLifecycleDigest(replacementRequest)) {
    throw new Error('Order amendment does not match its replacement request.')
  }
  const withRequest = await appendBuyingRecord(state, replacementRequest, 'requests', 'request_recorded', expectedHeadDigest)
  return appendBuyingRecord(withRequest, intent, 'amendmentIntents', 'order_amendment_intent_recorded', withRequest.headDigest)
}

export async function buildEcommerceOrderRescheduleIntent(input: {
  scope: string
  commerceState: CommerceState
  orderId: string
  replacementRequest: EcommerceOrderRequestV2
  requestedPromisedAt: string
  reason: string
  idempotencyKey: string
  createdAt: string
}): Promise<EcommerceOrderRescheduleIntent> {
  const scope = canonicalToken(input.scope, 'scope')
  const orderId = canonicalToken(input.orderId, 'orderId')
  const order = input.commerceState.orders.find((candidate) => candidate.id === orderId)
  const acknowledgement = commerceOrderAcknowledgement(input.commerceState, orderId)
  const replacementRequest = await validateEcommerceOrderRequestV2(input.replacementRequest)
  if (!order
    || !acknowledgement
    || order.status !== 'confirmed'
    || order.paymentStatus !== 'pending'
    || order.refundStatus !== 'none'
    || acknowledgement.status !== order.status
    || acknowledgement.payment.status !== order.paymentStatus
    || acknowledgement.payment.refundStatus !== order.refundStatus
    || acknowledgement.cancellation.state !== 'not_cancelled'
    || acknowledgement.totalMmk !== order.total
    || !order.promisedAt
    || !commerceOrderHasReleasableReservation(input.commerceState, orderId)) {
    throw new Error('Rescheduling requires one confirmed, unpaid, uncancelled Ecommerce order with exact reserved stock and promise evidence.')
  }
  const sourceRequestId = canonicalText(acknowledgement.evidence.sourceRecordId, 'order acknowledgement sourceRecordId', 40)
  if (!requestIdPattern.test(sourceRequestId)
    || replacementRequest.scope !== scope
    || replacementRequest.id === sourceRequestId) throw new Error('Order reschedule is not attributable to distinct Ecommerce requests in one workspace.')
  const originalLines = acknowledgement.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })).sort((left, right) => left.sku.localeCompare(right.sku))
  const replacementLines = replacementRequest.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })).sort((left, right) => left.sku.localeCompare(right.sku))
  if (canonicalJson(originalLines) !== canonicalJson(replacementLines)
    || replacementRequest.fulfilment !== order.fulfilment) {
    throw new Error('A reschedule must preserve every SKU, quantity, and fulfilment method; use Change order for other corrections.')
  }
  const idempotencyKey = canonicalText(input.idempotencyKey, 'idempotencyKey', 40)
  if (!rescheduleKeyPattern.test(idempotencyKey)) throw new Error('Order reschedule idempotency key is invalid.')
  const createdAt = canonicalTimestamp(input.createdAt, 'createdAt')
  const originalPromisedAt = canonicalTimestamp(order.promisedAt, 'order.promisedAt')
  const requestedPromisedAt = canonicalTimestamp(input.requestedPromisedAt, 'requestedPromisedAt')
  if (taxTimestampMicros(createdAt, 'createdAt') < taxTimestampMicros(order.createdAt, 'order.createdAt')
    || taxTimestampMicros(createdAt, 'createdAt') < taxTimestampMicros(replacementRequest.createdAt, 'replacementRequest.createdAt')
    || taxTimestampMicros(requestedPromisedAt, 'requestedPromisedAt') <= taxTimestampMicros(createdAt, 'createdAt')
    || requestedPromisedAt === originalPromisedAt) {
    throw new Error('Requested promise must be a different future time and the request cannot predate its order or replacement quote.')
  }
  const replacementRequestDigest = await ecommerceLifecycleDigest(replacementRequest)
  return validateEcommerceOrderRescheduleIntent({
    schema: ECOMMERCE_ORDER_RESCHEDULE_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope,
    id: `ERS-${idempotencyKey.slice(4)}`,
    idempotencyKey,
    createdAt,
    orderId,
    sourceRequestId,
    sourceAcknowledgementDigest: acknowledgement.digest,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: acknowledgement.totalMmk,
    originalPromisedAt,
    replacementRequestId: replacementRequest.id,
    replacementRequestDigest,
    requestedPromisedAt,
    fulfilment: replacementRequest.fulfilment,
    reason: canonicalText(input.reason, 'reason', 300),
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    riderBooked: false,
    providerCalled: false,
    evidenceReference: `ECOMMERCE-RESCHEDULE:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}:${replacementRequest.id}:${replacementRequestDigest.slice(7, 15)}:${requestedPromisedAt}`,
  })
}

export function validateEcommerceOrderRescheduleIntent(value: unknown): EcommerceOrderRescheduleIntent {
  const source = exactObject(value, 'order reschedule intent', [
    'schema', 'state', 'scope', 'id', 'idempotencyKey', 'createdAt', 'orderId',
    'sourceRequestId', 'sourceAcknowledgementDigest', 'orderStatus', 'paymentStatus',
    'refundStatus', 'originalTotalMmk', 'originalPromisedAt', 'replacementRequestId',
    'replacementRequestDigest', 'requestedPromisedAt', 'fulfilment', 'reason',
    'customerMessageSent', 'orderChanged', 'stockChanged', 'paymentChanged',
    'refundStarted', 'riderBooked', 'providerCalled', 'evidenceReference',
  ])
  const id = canonicalText(source.id, 'order reschedule intent.id', 40)
  const idempotencyKey = canonicalText(source.idempotencyKey, 'order reschedule intent.idempotencyKey', 40)
  const orderId = canonicalToken(source.orderId, 'order reschedule intent.orderId')
  const sourceRequestId = canonicalText(source.sourceRequestId, 'order reschedule intent.sourceRequestId', 40)
  const replacementRequestId = canonicalText(source.replacementRequestId, 'order reschedule intent.replacementRequestId', 40)
  const replacementRequestDigest = canonicalDigest(source.replacementRequestDigest, 'order reschedule intent.replacementRequestDigest')
  const createdAt = canonicalTimestamp(source.createdAt, 'order reschedule intent.createdAt')
  const originalPromisedAt = canonicalTimestamp(source.originalPromisedAt, 'order reschedule intent.originalPromisedAt')
  const requestedPromisedAt = canonicalTimestamp(source.requestedPromisedAt, 'order reschedule intent.requestedPromisedAt')
  const fulfilment = source.fulfilment as EcommerceFulfilment
  if (taxTimestampMicros(requestedPromisedAt, 'order reschedule intent.requestedPromisedAt') <= taxTimestampMicros(createdAt, 'order reschedule intent.createdAt')) {
    throw new Error('Order reschedule requested promise must remain after its request.')
  }
  const evidenceReference = `ECOMMERCE-RESCHEDULE:${idempotencyKey.slice(4)}:${orderId}:${sourceRequestId}:${replacementRequestId}:${replacementRequestDigest.slice(7, 15)}:${requestedPromisedAt}`
  if (source.schema !== ECOMMERCE_ORDER_RESCHEDULE_INTENT_SCHEMA
    || source.state !== 'pending_shop_review'
    || !rescheduleIdPattern.test(id)
    || !rescheduleKeyPattern.test(idempotencyKey)
    || id.slice(4) !== idempotencyKey.slice(4)
    || !requestIdPattern.test(sourceRequestId)
    || !requestIdPattern.test(replacementRequestId)
    || sourceRequestId === replacementRequestId
    || source.orderStatus !== 'confirmed'
    || source.paymentStatus !== 'pending'
    || source.refundStatus !== 'none'
    || !fulfilmentMethods.includes(fulfilment)
    || requestedPromisedAt === originalPromisedAt
    || source.customerMessageSent !== false
    || source.orderChanged !== false
    || source.stockChanged !== false
    || source.paymentChanged !== false
    || source.refundStarted !== false
    || source.riderBooked !== false
    || source.providerCalled !== false
    || source.evidenceReference !== evidenceReference) throw new Error('Order reschedule intent boundary is invalid.')
  return {
    schema: ECOMMERCE_ORDER_RESCHEDULE_INTENT_SCHEMA,
    state: 'pending_shop_review',
    scope: canonicalToken(source.scope, 'order reschedule intent.scope'),
    id,
    idempotencyKey,
    createdAt,
    orderId,
    sourceRequestId,
    sourceAcknowledgementDigest: canonicalDigest(source.sourceAcknowledgementDigest, 'order reschedule intent.sourceAcknowledgementDigest'),
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: safeInteger(source.originalTotalMmk, 'order reschedule intent.originalTotalMmk', 1, maxSafeInteger),
    originalPromisedAt,
    replacementRequestId,
    replacementRequestDigest,
    requestedPromisedAt,
    fulfilment,
    reason: canonicalText(source.reason, 'order reschedule intent.reason', 300),
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    riderBooked: false,
    providerCalled: false,
    evidenceReference,
  }
}

export async function recordEcommerceOrderReschedule(
  state: EcommerceBuyingState,
  replacementRequestValue: EcommerceOrderRequestV2,
  intentValue: EcommerceOrderRescheduleIntent,
  expectedHeadDigest: string,
) {
  const replacementRequest = await validateEcommerceOrderRequestV2(replacementRequestValue)
  const intent = validateEcommerceOrderRescheduleIntent(intentValue)
  if (intent.replacementRequestId !== replacementRequest.id
    || intent.replacementRequestDigest !== await ecommerceLifecycleDigest(replacementRequest)) {
    throw new Error('Order reschedule does not match its replacement request.')
  }
  const withRequest = await appendBuyingRecord(state, replacementRequest, 'requests', 'request_recorded', expectedHeadDigest)
  return appendBuyingRecord(withRequest, intent, 'rescheduleIntents', 'order_reschedule_intent_recorded', withRequest.headDigest)
}

export async function recordEcommerceReturnIntent(
  state: EcommerceBuyingState,
  intentValue: EcommerceReturnIntent,
  expectedHeadDigest: string,
) {
  return appendBuyingRecord(state, validateEcommerceReturnIntent(intentValue), 'returnIntents', 'return_intent_recorded', expectedHeadDigest)
}

export async function readEcommerceBuyingState(
  scope: string,
  storage = browserStorage(),
): Promise<EcommerceBuyingReadResult> {
  const canonicalScope = canonicalToken(scope, 'scope')
  if (!storage) return { status: 'unavailable', state: null, error: 'Browser recovery is unavailable.' }
  let raw: string | null
  try {
    raw = storage.getItem(ecommerceBuyingStateStorageKey(canonicalScope))
  } catch {
    return { status: 'unavailable', state: null, error: 'Saved checkout recovery could not be read.' }
  }
  if (raw === null) return { status: 'empty', state: createEmptyEcommerceBuyingState(canonicalScope), error: '' }
  try {
    return { status: 'ready', state: await validateEcommerceBuyingState(JSON.parse(raw), canonicalScope), error: '' }
  } catch {
    return { status: 'invalid', state: null, error: 'Saved checkout recovery is invalid and was left unchanged.' }
  }
}

export async function saveEcommerceOrderRequestV2(
  scope: string,
  request: EcommerceOrderRequestV2,
  expectedHeadDigest: string,
  options: { storage?: EcommerceBuyingStorage; locks?: EcommerceBuyingLocks } = {},
) {
  const canonicalScope = canonicalToken(scope, 'scope')
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser recovery is unavailable. The quote receipt was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The quote receipt was not saved.')
  const storageKey = ecommerceBuyingStateStorageKey(canonicalScope)
  return locks.request(`supermega:ecommerce:buying-lifecycle:${encodeURIComponent(canonicalScope)}`, { mode: 'exclusive' }, async () => {
    const currentRead = await readEcommerceBuyingState(canonicalScope, storage)
    if (!currentRead.state || currentRead.status === 'invalid' || currentRead.status === 'unavailable') {
      throw new Error(currentRead.error || 'Saved checkout recovery cannot be updated safely.')
    }
    const next = await recordEcommerceOrderRequestV2(currentRead.state, request, expectedHeadDigest)
    if (next === currentRead.state || canonicalJson(next) === canonicalJson(currentRead.state)) return next
    const previousRaw = storage.getItem(storageKey)
    const nextRaw = canonicalJson(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) throw new Error('Checkout recovery write could not be confirmed.')
      return next
    } catch (error) {
      try {
        if (previousRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, previousRaw)
        if (storage.getItem(storageKey) !== previousRaw) throw new Error('rollback confirmation failed', { cause: error })
      } catch (rollbackError) {
        throw new Error('Checkout recovery write failed and rollback could not be confirmed. Stop and export local evidence.', { cause: rollbackError })
      }
      throw error instanceof Error
        ? error
        : new Error('Checkout recovery write failed. The previous value was restored.', { cause: error })
    }
  })
}

export async function recordEcommerceCancellationIntent(
  state: EcommerceBuyingState,
  intentValue: EcommerceCancellationIntent,
  expectedHeadDigest: string,
) {
  return appendBuyingRecord(state, validateEcommerceCancellationIntent(intentValue), 'cancellationIntents', 'cancellation_intent_recorded', expectedHeadDigest)
}

export async function recordEcommerceCancellationDecision(
  state: EcommerceBuyingState,
  decisionValue: EcommerceCancellationDecision,
  expectedHeadDigest: string,
) {
  return appendBuyingRecord(state, validateEcommerceCancellationDecision(decisionValue), 'cancellationDecisions', 'cancellation_decision_recorded', expectedHeadDigest)
}

export async function recordEcommerceSupportIntent(
  state: EcommerceBuyingState,
  intentValue: EcommerceSupportIntent,
  expectedHeadDigest: string,
) {
  return appendBuyingRecord(state, validateEcommerceSupportIntent(intentValue), 'supportIntents', 'support_intent_recorded', expectedHeadDigest)
}

export async function recordEcommerceCorrectionIntent(
  state: EcommerceBuyingState,
  intentValue: EcommerceCorrectionIntent,
  expectedHeadDigest: string,
) {
  return appendBuyingRecord(state, validateEcommerceCorrectionIntent(intentValue), 'correctionIntents', 'correction_intent_recorded', expectedHeadDigest)
}

export async function saveEcommerceReturnIntent(
  scope: string,
  intent: EcommerceReturnIntent,
  expectedHeadDigest: string,
  options: { storage?: EcommerceBuyingStorage; locks?: EcommerceBuyingLocks } = {},
) {
  const canonicalScope = canonicalToken(scope, 'scope')
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser recovery is unavailable. The return request was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The return request was not saved.')
  const storageKey = ecommerceBuyingStateStorageKey(canonicalScope)
  return locks.request(`supermega:ecommerce:buying-lifecycle:${encodeURIComponent(canonicalScope)}`, { mode: 'exclusive' }, async () => {
    const currentRead = await readEcommerceBuyingState(canonicalScope, storage)
    if (!currentRead.state || currentRead.status === 'invalid' || currentRead.status === 'unavailable') {
      throw new Error(currentRead.error || 'Saved Ecommerce recovery cannot be updated safely.')
    }
    const next = await recordEcommerceReturnIntent(currentRead.state, intent, expectedHeadDigest)
    if (next === currentRead.state || canonicalJson(next) === canonicalJson(currentRead.state)) return next
    const previousRaw = storage.getItem(storageKey)
    const nextRaw = canonicalJson(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) throw new Error('Return request recovery write could not be confirmed.')
      return next
    } catch (error) {
      try {
        if (previousRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, previousRaw)
        if (storage.getItem(storageKey) !== previousRaw) throw new Error('rollback confirmation failed', { cause: error })
      } catch (rollbackError) {
        throw new Error('Return request recovery write failed and rollback could not be confirmed. Stop and export local evidence.', { cause: rollbackError })
      }
      throw error instanceof Error
        ? error
        : new Error('Return request recovery write failed. The previous value was restored.', { cause: error })
    }
  })
}

export async function saveEcommerceSupportIntent(
  scope: string,
  intent: EcommerceSupportIntent,
  expectedHeadDigest: string,
  options: { storage?: EcommerceBuyingStorage; locks?: EcommerceBuyingLocks } = {},
) {
  const canonicalScope = canonicalToken(scope, 'scope')
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser recovery is unavailable. The support request was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The support request was not saved.')
  const storageKey = ecommerceBuyingStateStorageKey(canonicalScope)
  return locks.request(`supermega:ecommerce:buying-lifecycle:${encodeURIComponent(canonicalScope)}`, { mode: 'exclusive' }, async () => {
    const currentRead = await readEcommerceBuyingState(canonicalScope, storage)
    if (!currentRead.state || currentRead.status === 'invalid' || currentRead.status === 'unavailable') {
      throw new Error(currentRead.error || 'Saved Ecommerce recovery cannot be updated safely.')
    }
    const next = await recordEcommerceSupportIntent(currentRead.state, intent, expectedHeadDigest)
    if (next === currentRead.state || canonicalJson(next) === canonicalJson(currentRead.state)) return next
    const previousRaw = storage.getItem(storageKey)
    const nextRaw = canonicalJson(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) throw new Error('Support request recovery write could not be confirmed.')
      return next
    } catch (error) {
      try {
        if (previousRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, previousRaw)
        if (storage.getItem(storageKey) !== previousRaw) throw new Error('rollback confirmation failed', { cause: error })
      } catch (rollbackError) {
        throw new Error('Support request recovery write failed and rollback could not be confirmed. Stop and export local evidence.', { cause: rollbackError })
      }
      throw error instanceof Error
        ? error
        : new Error('Support request recovery write failed. The previous value was restored.', { cause: error })
    }
  })
}

export async function saveEcommerceCorrectionIntent(
  scope: string,
  intent: EcommerceCorrectionIntent,
  expectedHeadDigest: string,
  options: { storage?: EcommerceBuyingStorage; locks?: EcommerceBuyingLocks } = {},
) {
  const canonicalScope = canonicalToken(scope, 'scope')
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser recovery is unavailable. The correction request was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The correction request was not saved.')
  const storageKey = ecommerceBuyingStateStorageKey(canonicalScope)
  return locks.request(`supermega:ecommerce:buying-lifecycle:${encodeURIComponent(canonicalScope)}`, { mode: 'exclusive' }, async () => {
    const currentRead = await readEcommerceBuyingState(canonicalScope, storage)
    if (!currentRead.state || currentRead.status === 'invalid' || currentRead.status === 'unavailable') {
      throw new Error(currentRead.error || 'Saved Ecommerce recovery cannot be updated safely.')
    }
    const next = await recordEcommerceCorrectionIntent(currentRead.state, intent, expectedHeadDigest)
    if (next === currentRead.state || canonicalJson(next) === canonicalJson(currentRead.state)) return next
    const previousRaw = storage.getItem(storageKey)
    const nextRaw = canonicalJson(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) throw new Error('Correction request recovery write could not be confirmed.')
      return next
    } catch (error) {
      try {
        if (previousRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, previousRaw)
        if (storage.getItem(storageKey) !== previousRaw) throw new Error('rollback confirmation failed', { cause: error })
      } catch (rollbackError) {
        throw new Error('Correction request recovery failed and rollback could not be confirmed. Stop and export local evidence.', { cause: rollbackError })
      }
      throw error instanceof Error
        ? error
        : new Error('Correction request recovery failed. The previous value was restored.', { cause: error })
    }
  })
}

export async function saveEcommerceCancellationIntent(
  scope: string,
  intent: EcommerceCancellationIntent,
  expectedHeadDigest: string,
  options: { storage?: EcommerceBuyingStorage; locks?: EcommerceBuyingLocks } = {},
) {
  const canonicalScope = canonicalToken(scope, 'scope')
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser recovery is unavailable. The cancellation request was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The cancellation request was not saved.')
  const storageKey = ecommerceBuyingStateStorageKey(canonicalScope)
  return locks.request(`supermega:ecommerce:buying-lifecycle:${encodeURIComponent(canonicalScope)}`, { mode: 'exclusive' }, async () => {
    const currentRead = await readEcommerceBuyingState(canonicalScope, storage)
    if (!currentRead.state || currentRead.status === 'invalid' || currentRead.status === 'unavailable') {
      throw new Error(currentRead.error || 'Saved Ecommerce recovery cannot be updated safely.')
    }
    const next = await recordEcommerceCancellationIntent(currentRead.state, intent, expectedHeadDigest)
    if (next === currentRead.state || canonicalJson(next) === canonicalJson(currentRead.state)) return next
    const previousRaw = storage.getItem(storageKey)
    const nextRaw = canonicalJson(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) throw new Error('Cancellation request recovery write could not be confirmed.')
      return next
    } catch (error) {
      try {
        if (previousRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, previousRaw)
        if (storage.getItem(storageKey) !== previousRaw) throw new Error('rollback confirmation failed', { cause: error })
      } catch (rollbackError) {
        throw new Error('Cancellation request recovery write failed and rollback could not be confirmed. Stop and export local evidence.', { cause: rollbackError })
      }
      throw error instanceof Error
        ? error
        : new Error('Cancellation request recovery write failed. The previous value was restored.', { cause: error })
    }
  })
}

export async function saveEcommerceCancellationDecision(
  scope: string,
  decision: EcommerceCancellationDecision,
  expectedHeadDigest: string,
  options: { storage?: EcommerceBuyingStorage; locks?: EcommerceBuyingLocks } = {},
) {
  const canonicalScope = canonicalToken(scope, 'scope')
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser recovery is unavailable. The cancellation decision was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The cancellation decision was not saved.')
  const storageKey = ecommerceBuyingStateStorageKey(canonicalScope)
  return locks.request(`supermega:ecommerce:buying-lifecycle:${encodeURIComponent(canonicalScope)}`, { mode: 'exclusive' }, async () => {
    const currentRead = await readEcommerceBuyingState(canonicalScope, storage)
    if (!currentRead.state || currentRead.status === 'invalid' || currentRead.status === 'unavailable') {
      throw new Error(currentRead.error || 'Saved Ecommerce recovery cannot be updated safely.')
    }
    const next = await recordEcommerceCancellationDecision(currentRead.state, decision, expectedHeadDigest)
    if (next === currentRead.state || canonicalJson(next) === canonicalJson(currentRead.state)) return next
    const previousRaw = storage.getItem(storageKey)
    const nextRaw = canonicalJson(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) throw new Error('Cancellation decision recovery write could not be confirmed.')
      return next
    } catch (error) {
      try {
        if (previousRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, previousRaw)
        if (storage.getItem(storageKey) !== previousRaw) throw new Error('rollback confirmation failed', { cause: error })
      } catch (rollbackError) {
        throw new Error('Cancellation decision recovery write failed and rollback could not be confirmed. Stop and export local evidence.', { cause: rollbackError })
      }
      throw error instanceof Error
        ? error
        : new Error('Cancellation decision recovery write failed. The previous value was restored.', { cause: error })
    }
  })
}

export async function saveEcommerceOrderAmendment(
  scope: string,
  replacementRequest: EcommerceOrderRequestV2,
  intent: EcommerceOrderAmendmentIntent,
  expectedHeadDigest: string,
  options: { storage?: EcommerceBuyingStorage; locks?: EcommerceBuyingLocks } = {},
) {
  const canonicalScope = canonicalToken(scope, 'scope')
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser recovery is unavailable. The order change was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The order change was not saved.')
  const storageKey = ecommerceBuyingStateStorageKey(canonicalScope)
  return locks.request(`supermega:ecommerce:buying-lifecycle:${encodeURIComponent(canonicalScope)}`, { mode: 'exclusive' }, async () => {
    const currentRead = await readEcommerceBuyingState(canonicalScope, storage)
    if (!currentRead.state || currentRead.status === 'invalid' || currentRead.status === 'unavailable') {
      throw new Error(currentRead.error || 'Saved Ecommerce recovery cannot be updated safely.')
    }
    const next = await recordEcommerceOrderAmendment(currentRead.state, replacementRequest, intent, expectedHeadDigest)
    const previousRaw = storage.getItem(storageKey)
    const nextRaw = canonicalJson(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) throw new Error('Order amendment recovery write could not be confirmed.')
      return next
    } catch (error) {
      try {
        if (previousRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, previousRaw)
        if (storage.getItem(storageKey) !== previousRaw) throw new Error('rollback confirmation failed', { cause: error })
      } catch (rollbackError) {
        throw new Error('Order amendment recovery write failed and rollback could not be confirmed. Stop and export local evidence.', { cause: rollbackError })
      }
      throw error instanceof Error
        ? error
        : new Error('Order amendment recovery write failed. The previous value was restored.', { cause: error })
    }
  })
}

export async function saveEcommerceOrderReschedule(
  scope: string,
  replacementRequest: EcommerceOrderRequestV2,
  intent: EcommerceOrderRescheduleIntent,
  expectedHeadDigest: string,
  options: { storage?: EcommerceBuyingStorage; locks?: EcommerceBuyingLocks } = {},
) {
  const canonicalScope = canonicalToken(scope, 'scope')
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser recovery is unavailable. The reschedule request was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The reschedule request was not saved.')
  const storageKey = ecommerceBuyingStateStorageKey(canonicalScope)
  return locks.request(`supermega:ecommerce:buying-lifecycle:${encodeURIComponent(canonicalScope)}`, { mode: 'exclusive' }, async () => {
    const currentRead = await readEcommerceBuyingState(canonicalScope, storage)
    if (!currentRead.state || currentRead.status === 'invalid' || currentRead.status === 'unavailable') {
      throw new Error(currentRead.error || 'Saved Ecommerce recovery cannot be updated safely.')
    }
    const next = await recordEcommerceOrderReschedule(currentRead.state, replacementRequest, intent, expectedHeadDigest)
    const previousRaw = storage.getItem(storageKey)
    const nextRaw = canonicalJson(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) throw new Error('Order reschedule recovery write could not be confirmed.')
      return next
    } catch (error) {
      try {
        if (previousRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, previousRaw)
        if (storage.getItem(storageKey) !== previousRaw) throw new Error('rollback confirmation failed', { cause: error })
      } catch (rollbackError) {
        throw new Error('Order reschedule recovery write failed and rollback could not be confirmed. Stop and export local evidence.', { cause: rollbackError })
      }
      throw error instanceof Error
        ? error
        : new Error('Order reschedule recovery write failed. The previous value was restored.', { cause: error })
    }
  })
}

export function ecommerceBuyingStateContains(state: EcommerceBuyingState, request: EcommerceOrderRequestV2) {
  const matches = state.requests.filter((candidate) => candidate.id === request.id && candidate.idempotencyKey === request.idempotencyKey)
  return matches.length === 1 && canonicalJson(matches[0]) === canonicalJson(request)
}

function currentCatalogItem(value: CommerceItem) {
  return {
    sku: canonicalToken(value.sku, 'catalog.sku'),
    name: canonicalText(value.name, 'catalog.name', 180),
    variant: optionalText(value.variant ?? null, 'catalog.variant', 180),
    price: safeInteger(value.price, 'catalog.price', 1),
    onHand: safeInteger(value.onHand, 'catalog.onHand'),
  }
}

export async function prepareEcommerceShopDraftV2(input: {
  request: EcommerceOrderRequestV2
  state: EcommerceBuyingState
  currentCatalog: CommerceItem[]
  currentPromotionPolicies: readonly CommercePromotionPolicy[]
  currentShippingPolicies: readonly CommerceShippingPolicy[]
  currentPaymentPolicies: readonly CommercePaymentPolicy[]
  currentTaxConfigurations: readonly CommerceTaxConfiguration[]
  catalogRevision: number
  confirmedAt: string
}): Promise<EcommerceShopDraftV2> {
  const request = await validateEcommerceOrderRequestV2(input.request)
  const state = await validateEcommerceBuyingState(input.state, request.scope)
  if (!ecommerceBuyingStateContains(state, request)) throw new Error('The quote receipt is not the exact recovered Ecommerce record.')
  const confirmedAt = canonicalTimestamp(input.confirmedAt, 'confirmedAt')
  if (Date.parse(confirmedAt) < Date.parse(request.createdAt)) throw new Error('Shop handoff confirmation precedes the request.')
  if (Date.parse(confirmedAt) > Date.parse(request.quote.expiresAt)) throw new Error('Checkout quote expired before Shop review.')
  const catalog = input.currentCatalog.map(currentCatalogItem)
  const bySku = new Map(catalog.map((item) => [item.sku, item]))
  if (bySku.size !== catalog.length) throw new Error('Current Shop catalog SKUs must be unique.')
  request.lines.forEach((line) => {
    const item = bySku.get(line.sku)
    if (!item
      || item.name !== line.name
      || item.variant !== line.variant
      || item.price !== line.unitPriceMmk
      || item.onHand < line.quantity) throw new Error('A quoted item, variant, price, or availability changed.')
  })
  const promotion = commercePromotionDecision(
    input.currentPromotionPolicies,
    request.quote.promotion.code,
    request.quote.subtotalMmk,
    confirmedAt,
  )
  if (!promotion) throw new Error('The Shop promotion decision is invalid.')
  const shipping = commerceShippingDecision(
    input.currentShippingPolicies,
    request.fulfilment,
    request.deliveryAddress?.township ?? null,
    confirmedAt,
  )
  if (!shipping) throw new Error('The Shop shipping decision is invalid.')
  if (shipping.status === 'rejected') throw new Error(`Shop delivery is unavailable for ${shipping.township ?? 'this township'} (${shipping.reason}).`)
  const listedSubtotalMmk = promotion.netSubtotalMmk + shipping.feeMmk
  if (!Number.isSafeInteger(listedSubtotalMmk) || listedSubtotalMmk < 1) throw new Error('The Shop total exceeds the safe MMK boundary.')
  const tax = reviewEcommerceTax(
    input.currentTaxConfigurations,
    listedSubtotalMmk,
    confirmedAt,
    input.catalogRevision,
  )
  const totalMmk = tax.totalMmk
  const payment = commercePaymentDecision(
    input.currentPaymentPolicies,
    request.quote.payment.adapter,
    request.fulfilment,
    totalMmk,
    confirmedAt,
  )
  if (!payment) throw new Error('The Shop payment decision is invalid.')
  if (payment.status === 'rejected') throw new Error(`Shop payment method is unavailable (${payment.reason}).`)
  return {
    schema: ECOMMERCE_SHOP_DRAFT_SCHEMA_V7,
    mode: 'browser-memory-shop-draft',
    state: 'review_required',
    id: `ESD-${request.id.slice(4)}`,
    sourceRequestId: request.id,
    sourcePreviewDigest: request.sourcePreviewDigest,
    quoteDigest: request.quote.quoteDigest,
    quoteExpiresAt: request.quote.expiresAt,
    createdAt: request.createdAt,
    confirmedAt,
    customerReference: request.customerReference,
    ...(request.customerProfile ? {
      customerProfile: canonicalCopy(request.customerProfile),
      deliveryAddress: request.deliveryAddress ? canonicalCopy(request.deliveryAddress) : null,
    } : {}),
    fulfilment: request.fulfilment,
    currency: 'MMK',
    operatingContext: {
      organizationScope: request.scope,
      operatingUnitLocationId: 'LOC-MAIN',
      sourceAuthority: 'ecommerce',
      targetAuthority: 'commerce',
      recordType: 'order_request',
      writePolicy: 'human_review_required',
    },
    lines: canonicalCopy(request.lines),
    pricing: {
      subtotalMmk: request.quote.subtotalMmk,
      promotion,
      tax,
      shipping,
      payment,
      totalMmk,
    },
    totalMmk,
    evidenceReference: `ECOMMERCE:${request.id}:${request.sourcePreviewDigest}:${request.quote.quoteDigest}:${request.scope}:LOC-MAIN:ecommerce>commerce:human_review_required:${promotion.status}:${promotion.policyRevision ?? 'none'}:${promotion.discountMmk}:shipping:${shipping.status}:${shipping.policyRevision ?? 'none'}:${shipping.feeMmk}:tax:${tax.status}:${tax.taxConfigurationRevision ?? 'none'}:${tax.policyActionId ?? 'none'}:${tax.taxMode}:${tax.taxMmk}:${tax.totalMmk}:payment:${payment.status}:${payment.policyRevision ?? 'none'}:${payment.adapter}`,
  }
}

export async function prepareManagedEcommerceShopDraftV2(input: {
  request: EcommerceOrderRequestV2
  currentCatalog: CommerceItem[]
  currentPromotionPolicies: readonly CommercePromotionPolicy[]
  currentShippingPolicies: readonly CommerceShippingPolicy[]
  currentPaymentPolicies: readonly CommercePaymentPolicy[]
  currentTaxConfigurations: readonly CommerceTaxConfiguration[]
  catalogRevision: number
  confirmedAt: string
}) {
  const request = await validateEcommerceOrderRequestV2(input.request)
  const empty = createEmptyEcommerceBuyingState(request.scope)
  const retained = await recordEcommerceOrderRequestV2(empty, request, empty.headDigest)
  return prepareEcommerceShopDraftV2({ ...input, request, state: retained })
}

export function ecommerceShopDraftV2MatchesCatalog(value: unknown, catalogValue: CommerceItem[]): value is EcommerceShopDraftV2 {
  try {
    const draft = validateEcommerceShopDraftV2(value)
    const catalog = catalogValue.map(currentCatalogItem)
    const bySku = new Map(catalog.map((item) => [item.sku, item]))
    if (bySku.size !== catalog.length) return false
    return draft.lines.every((line) => {
        const item = bySku.get(line.sku)
        return Boolean(item
          && item.name === line.name
          && item.variant === line.variant
          && item.price === line.unitPriceMmk
          && item.onHand >= line.quantity)
      })
  } catch {
    return false
  }
}

export function validateEcommerceShopDraftV2(value: unknown): EcommerceShopDraftV2 {
  const baseFields = [
    'schema', 'mode', 'state', 'id', 'sourceRequestId', 'sourcePreviewDigest',
    'quoteDigest', 'quoteExpiresAt', 'createdAt', 'confirmedAt', 'customerReference',
    'fulfilment', 'currency', 'operatingContext', 'lines', 'pricing', 'totalMmk', 'evidenceReference',
  ]
  const structuredFields = ['customerProfile', 'deliveryAddress']
  const structured = isRecord(value) && structuredFields.some((field) => field in value)
  const source = exactObject(value, 'Shop draft', structured ? [...baseFields, ...structuredFields] : baseFields)
  if (source.schema !== ECOMMERCE_SHOP_DRAFT_SCHEMA_V7
    || source.mode !== 'browser-memory-shop-draft'
    || source.state !== 'review_required'
    || !Array.isArray(source.lines)
    || source.lines.length < 1
    || source.lines.length > maxLines) throw new Error('Shop draft boundary is invalid.')
  const sourceRequestId = canonicalText(source.sourceRequestId, 'Shop draft.sourceRequestId', 40)
  const id = canonicalText(source.id, 'Shop draft.id', 40)
  if (!requestIdPattern.test(sourceRequestId) || id !== `ESD-${sourceRequestId.slice(4)}`) {
    throw new Error('Shop draft identity is invalid.')
  }
  const sourcePreviewDigest = canonicalDigest(source.sourcePreviewDigest, 'Shop draft.sourcePreviewDigest')
  const quoteDigest = canonicalDigest(source.quoteDigest, 'Shop draft.quoteDigest')
  const createdAt = canonicalTimestamp(source.createdAt, 'Shop draft.createdAt')
  const confirmedAt = canonicalTimestamp(source.confirmedAt, 'Shop draft.confirmedAt')
  const quoteExpiresAt = canonicalTimestamp(source.quoteExpiresAt, 'Shop draft.quoteExpiresAt')
  if (Date.parse(createdAt) > Date.parse(confirmedAt) || Date.parse(confirmedAt) > Date.parse(quoteExpiresAt)) {
    throw new Error('Shop draft timing is invalid.')
  }
  const fulfilment = source.fulfilment
  if (!fulfilmentMethods.includes(fulfilment as EcommerceFulfilment)) throw new Error('Shop draft fulfilment is invalid.')
  const customerProfile = structured
    ? customerProfileSnapshotShape(source.customerProfile, 'Shop draft.customerProfile')
    : undefined
  const deliveryAddress = structured
    ? source.deliveryAddress === null
      ? null
      : deliveryAddressSnapshotShape(source.deliveryAddress, 'Shop draft.deliveryAddress')
    : undefined
  if (structured && (fulfilment === 'delivery') !== Boolean(deliveryAddress)) {
    throw new Error('Shop draft customer and delivery identity are invalid.')
  }
  if (source.currency !== 'MMK') throw new Error('Shop draft currency is invalid.')
  const operatingContext = exactObject(source.operatingContext, 'Shop draft.operatingContext', [
    'organizationScope', 'operatingUnitLocationId', 'sourceAuthority', 'targetAuthority', 'recordType', 'writePolicy',
  ])
  const organizationScope = canonicalToken(operatingContext.organizationScope, 'Shop draft.operatingContext.organizationScope')
  if (operatingContext.operatingUnitLocationId !== 'LOC-MAIN'
    || operatingContext.sourceAuthority !== 'ecommerce'
    || operatingContext.targetAuthority !== 'commerce'
    || operatingContext.recordType !== 'order_request'
    || operatingContext.writePolicy !== 'human_review_required') throw new Error('Shop draft operating authority is invalid.')
  const lines = source.lines.map((line, index) => quoteLine(line, `Shop draft.lines[${index}]`))
  if (lines.some((line, index) => index > 0 && lines[index - 1].sku >= line.sku)) {
    throw new Error('Shop draft lines must use unique canonical SKU order.')
  }
  const productTotal = lines.reduce((total, line) => total + line.lineTotalMmk, 0)
  const pricing = exactObject(source.pricing, 'Shop draft.pricing', [
    'subtotalMmk', 'promotion', 'tax', 'shipping', 'payment', 'totalMmk',
  ])
  const subtotalMmk = safeInteger(pricing.subtotalMmk, 'Shop draft.pricing.subtotalMmk', 1)
  const totalMmk = safeInteger(source.totalMmk, 'Shop draft.totalMmk', 1)
  const pricingTotal = safeInteger(pricing.totalMmk, 'Shop draft.pricing.totalMmk', 1)
  if (subtotalMmk !== productTotal) throw new Error('Shop draft pricing subtotal is invalid.')
  const promotion = exactObject(pricing.promotion, 'Shop draft.pricing.promotion', [
    'schema', 'status', 'code', 'policyRevision', 'policyActionId', 'discountBasisPoints',
    'grossSubtotalMmk', 'discountMmk', 'netSubtotalMmk', 'reviewedAt', 'reason',
  ])
  const promotionCode = optionalText(promotion.code, 'Shop draft.pricing.promotion.code', 40)
  const policyRevision = promotion.policyRevision === null ? null : safeInteger(promotion.policyRevision, 'Shop draft.pricing.promotion.policyRevision', 1)
  const policyActionId = promotion.policyActionId === null ? null : canonicalText(promotion.policyActionId, 'Shop draft.pricing.promotion.policyActionId', 160)
  const discountBasisPoints = safeInteger(promotion.discountBasisPoints, 'Shop draft.pricing.promotion.discountBasisPoints')
  const grossSubtotalMmk = safeInteger(promotion.grossSubtotalMmk, 'Shop draft.pricing.promotion.grossSubtotalMmk', 1)
  const discountMmk = safeInteger(promotion.discountMmk, 'Shop draft.pricing.promotion.discountMmk')
  const netSubtotalMmk = safeInteger(promotion.netSubtotalMmk, 'Shop draft.pricing.promotion.netSubtotalMmk', 1)
  const reviewedAt = canonicalTimestamp(promotion.reviewedAt, 'Shop draft.pricing.promotion.reviewedAt')
  const promotionStatus = promotion.status
  const promotionReason = promotion.reason
  const approved = promotionStatus === 'approved'
    && promotionReason === 'approved'
    && promotionCode !== null
    && policyRevision !== null
    && policyActionId !== null
    && discountBasisPoints >= 1
    && discountBasisPoints <= 10_000
    && discountMmk >= 1
  const notRequested = promotionStatus === 'not_requested'
    && promotionReason === 'not_requested'
    && promotionCode === null
    && policyRevision === null
    && policyActionId === null
    && discountBasisPoints === 0
    && discountMmk === 0
  const rejected = promotionStatus === 'rejected'
    && ['not_found', 'inactive', 'not_effective', 'minimum_not_met'].includes(String(promotionReason))
    && promotionCode !== null
    && discountMmk === 0
  if (promotion.schema !== 'supermega.commerce.promotion-decision.v1'
    || (!approved && !notRequested && !rejected)
    || grossSubtotalMmk !== subtotalMmk
    || netSubtotalMmk !== grossSubtotalMmk - discountMmk
    || reviewedAt !== confirmedAt
    ) throw new Error('Shop draft promotion boundary is invalid.')
  const tax = validateEcommerceTaxDecision(pricing.tax)
  const shipping = exactObject(pricing.shipping, 'Shop draft.pricing.shipping', [
    'schema', 'status', 'reason', 'township', 'zoneCode', 'policyRevision', 'policyActionId', 'feeMmk', 'promiseMinutes', 'reviewedAt',
  ])
  const shippingTownship = shipping.township === null ? null : canonicalText(shipping.township, 'Shop draft.pricing.shipping.township', 80)
  const shippingZoneCode = shipping.zoneCode === null ? null : canonicalText(shipping.zoneCode, 'Shop draft.pricing.shipping.zoneCode', 40)
  const shippingPolicyRevision = shipping.policyRevision === null ? null : safeInteger(shipping.policyRevision, 'Shop draft.pricing.shipping.policyRevision', 1)
  const shippingPolicyActionId = shipping.policyActionId === null ? null : canonicalText(shipping.policyActionId, 'Shop draft.pricing.shipping.policyActionId', 160)
  const shippingFeeMmk = safeInteger(shipping.feeMmk, 'Shop draft.pricing.shipping.feeMmk')
  const shippingPromiseMinutes = shipping.promiseMinutes === null ? null : safeInteger(shipping.promiseMinutes, 'Shop draft.pricing.shipping.promiseMinutes', 15)
  const shippingReviewedAt = canonicalTimestamp(shipping.reviewedAt, 'Shop draft.pricing.shipping.reviewedAt')
  const pickupShipping = fulfilment === 'pickup'
    && shipping.status === 'pickup' && shipping.reason === 'pickup' && shippingTownship === null && shippingZoneCode === null
    && shippingPolicyRevision === null && shippingPolicyActionId === null && shippingFeeMmk === 0 && shippingPromiseMinutes === null
  const approvedShipping = fulfilment === 'delivery'
    && shipping.status === 'approved' && shipping.reason === 'approved' && shippingTownship === deliveryAddress?.township
    && shippingZoneCode !== null && shippingPolicyRevision !== null && shippingPolicyActionId !== null
    && shippingPromiseMinutes !== null && shippingPromiseMinutes <= 10_080
  if (shipping.schema !== 'supermega.commerce.shipping-decision.v1'
    || (!pickupShipping && !approvedShipping)
    || shippingReviewedAt !== confirmedAt
    || tax.listedSubtotalMmk !== netSubtotalMmk + shippingFeeMmk
    || pricingTotal !== tax.totalMmk
    || totalMmk !== pricingTotal) throw new Error('Shop draft shipping boundary is invalid.')
  const payment = exactObject(pricing.payment, 'Shop draft.pricing.payment', [
    'schema', 'status', 'reason', 'adapter', 'policyRevision', 'policyActionId', 'maximumOrderMmk', 'instructions', 'reviewedAt', 'authorized',
  ])
  if (!paymentAdapters.includes(payment.adapter as EcommercePaymentAdapter)) throw new Error('Shop draft payment boundary is invalid.')
  const paymentPolicyRevision = payment.policyRevision === null ? null : safeInteger(payment.policyRevision, 'Shop draft.pricing.payment.policyRevision', 1)
  const paymentPolicyActionId = payment.policyActionId === null ? null : canonicalText(payment.policyActionId, 'Shop draft.pricing.payment.policyActionId', 160)
  const paymentMaximumOrderMmk = payment.maximumOrderMmk === null ? null : safeInteger(payment.maximumOrderMmk, 'Shop draft.pricing.payment.maximumOrderMmk', 1)
  const paymentInstructions = payment.instructions === null ? null : canonicalText(payment.instructions, 'Shop draft.pricing.payment.instructions', 240)
  const paymentReviewedAt = canonicalTimestamp(payment.reviewedAt, 'Shop draft.pricing.payment.reviewedAt')
  if (payment.schema !== 'supermega.commerce.payment-decision.v1'
    || payment.status !== 'approved' || payment.reason !== 'approved'
    || paymentPolicyRevision === null || paymentPolicyActionId === null || paymentInstructions === null
    || paymentReviewedAt !== confirmedAt || payment.authorized !== false
    || !ecommercePaymentMatchesFulfilment(fulfilment as EcommerceFulfilment, payment.adapter as EcommercePaymentAdapter)
    || paymentMaximumOrderMmk !== null && totalMmk > paymentMaximumOrderMmk) throw new Error('Shop draft payment boundary is invalid.')
  if (tax.reviewedAt !== confirmedAt) throw new Error('Shop draft tax review time is invalid.')
  const evidenceReference = `ECOMMERCE:${sourceRequestId}:${sourcePreviewDigest}:${quoteDigest}:${organizationScope}:LOC-MAIN:ecommerce>commerce:human_review_required:${promotionStatus}:${policyRevision ?? 'none'}:${discountMmk}:shipping:${shipping.status}:${shippingPolicyRevision ?? 'none'}:${shippingFeeMmk}:tax:${tax.status}:${tax.taxConfigurationRevision ?? 'none'}:${tax.policyActionId ?? 'none'}:${tax.taxMode}:${tax.taxMmk}:${tax.totalMmk}:payment:${payment.status}:${paymentPolicyRevision}:${payment.adapter}`
  if (source.evidenceReference !== evidenceReference) throw new Error('Shop draft evidence reference is invalid.')
  return {
    schema: ECOMMERCE_SHOP_DRAFT_SCHEMA_V7,
    mode: 'browser-memory-shop-draft',
    state: 'review_required',
    id,
    sourceRequestId,
    sourcePreviewDigest,
    quoteDigest,
    quoteExpiresAt,
    createdAt,
    confirmedAt,
    customerReference: canonicalText(source.customerReference, 'Shop draft.customerReference', 80),
    ...(customerProfile ? { customerProfile, deliveryAddress: deliveryAddress ?? null } : {}),
    fulfilment: fulfilment as EcommerceFulfilment,
    currency: 'MMK',
    operatingContext: {
      organizationScope,
      operatingUnitLocationId: 'LOC-MAIN',
      sourceAuthority: 'ecommerce',
      targetAuthority: 'commerce',
      recordType: 'order_request',
      writePolicy: 'human_review_required',
    },
    lines,
    pricing: {
      subtotalMmk,
      promotion: {
        schema: 'supermega.commerce.promotion-decision.v1',
        status: promotionStatus as CommercePromotionDecision['status'],
        code: promotionCode,
        policyRevision,
        policyActionId,
        discountBasisPoints,
        grossSubtotalMmk,
        discountMmk,
        netSubtotalMmk,
        reviewedAt,
        reason: promotionReason as CommercePromotionDecision['reason'],
      },
      tax,
      shipping: {
        schema: 'supermega.commerce.shipping-decision.v1',
        status: shipping.status as CommerceShippingDecision['status'],
        reason: shipping.reason as CommerceShippingDecision['reason'],
        township: shippingTownship,
        zoneCode: shippingZoneCode,
        policyRevision: shippingPolicyRevision,
        policyActionId: shippingPolicyActionId,
        feeMmk: shippingFeeMmk,
        promiseMinutes: shippingPromiseMinutes,
        reviewedAt: shippingReviewedAt,
      },
      payment: {
        schema: 'supermega.commerce.payment-decision.v1',
        status: 'approved',
        reason: 'approved',
        adapter: payment.adapter as EcommercePaymentAdapter,
        policyRevision: paymentPolicyRevision,
        policyActionId: paymentPolicyActionId,
        maximumOrderMmk: paymentMaximumOrderMmk,
        instructions: paymentInstructions,
        reviewedAt: paymentReviewedAt,
        authorized: false,
      } as CommercePaymentDecision,
      totalMmk: pricingTotal,
    },
    totalMmk,
    evidenceReference,
  }
}

export function ecommercePaymentLabel(adapter: EcommercePaymentAdapter) {
  if (adapter === 'cash_on_delivery') return 'Cash on delivery'
  if (adapter === 'kbzpay_manual') return 'KBZPay'
  return 'Cash'
}
