import { sha256Hex } from './managed-trial-proof.ts'
import type { CommerceOrder, CommerceState } from './commerce-workspace.ts'
import type {
  EcommerceBuyingState,
  EcommerceCancellationIntent,
  EcommerceCorrectionIntent,
  EcommerceOrderAmendmentIntent,
  EcommerceOrderRescheduleIntent,
} from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export const ECOMMERCE_SHOP_EXCEPTION_EVIDENCE_CONTRACT = 'supermega.ecommerce-shop-exception-evidence.v1' as const

export type EcommerceShopExceptionEvidenceInput = {
  reviewWindowId: string
  capturedAt: string
  ecommerceOperatorReviewDigest?: string
  shopOperatorReviewDigest?: string
}

export type EcommerceShopExceptionEvidenceGateId =
  | 'review_window_timestamp_valid'
  | 'ecommerce_exception_intents_present'
  | 'replacement_review_intent_present'
  | 'source_requests_retained'
  | 'replacement_requests_retained'
  | 'shop_orders_present'
  | 'shop_orders_ecommerce_attributed'
  | 'intents_pending_shop_review'
  | 'intent_evidence_references_bound'
  | 'external_effect_controls_false'
  | 'shop_actions_not_applied'
  | 'ecommerce_operator_review_digest_present'
  | 'shop_operator_review_digest_present'
  | 'independent_review_digests'

export type EcommerceShopExceptionEvidenceGate = {
  id: EcommerceShopExceptionEvidenceGateId
  passed: boolean
  reason: string
}

export type EcommerceShopExceptionEvidenceMetrics = {
  ecommerceRevision: number
  sourceRequestCount: number
  shopOrderCount: number
  exceptionIntentCount: number
  replacementReviewIntentCount: number
  returnIntentCount: number
  supportIntentCount: number
  correctionIntentCount: number
  cancellationIntentCount: number
  cancellationDecisionCount: number
  amendmentIntentCount: number
  rescheduleIntentCount: number
  coveredIntentCount: number
  missingSourceRequestCount: number
  missingReplacementRequestCount: number
  missingShopOrderCount: number
  unattributedShopOrderCount: number
  nonReviewStateCount: number
  unboundEvidenceReferenceCount: number
  externalEffectCount: number
  appliedShopActionCount: number
}

export type EcommerceShopExceptionEvidenceProof = {
  reviewWindowId: string
  capturedAt: string
  ecommerceStateDigest: string
  shopStateDigest: string
  exceptionIntentSetDigest: string
  sourceRequestSetDigest: string
  ecommerceOperatorReviewDigest: string | null
  shopOperatorReviewDigest: string | null
}

export type EcommerceShopExceptionEvidence = {
  contract: typeof ECOMMERCE_SHOP_EXCEPTION_EVIDENCE_CONTRACT
  readyForPilotExceptionReview: boolean
  blockingCount: number
  gates: EcommerceShopExceptionEvidenceGate[]
  metrics: EcommerceShopExceptionEvidenceMetrics
  evidence: EcommerceShopExceptionEvidenceProof
  exceptionEvidenceDigest: string
}

type EcommerceShopExceptionKind =
  | 'return'
  | 'support'
  | 'correction'
  | 'cancellation'
  | 'cancellation_decision'
  | 'amendment'
  | 'reschedule'

type EcommerceShopExceptionRecord = {
  kind: EcommerceShopExceptionKind
  id: string
  state: string
  idempotencyKey: string
  orderId: string
  sourceRequestId: string
  evidenceReference: string
  replacementRequestId: string | null
  sourceIntentId: string | null
  externalEffectCount: number
}

const digestPattern = /^sha256:[0-9a-f]{64}$/i

function digest(value: unknown) {
  return `sha256:${sha256Hex(JSON.stringify(value))}`
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value

  const source = value as Record<string, unknown>
  return Object.keys(source)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = canonicalize(source[key])
      return result
    }, {})
}

function canonicalSet(values: unknown[]) {
  return values
    .map(canonicalize)
    .sort((left, right) => {
      const leftJson = JSON.stringify(left)
      const rightJson = JSON.stringify(right)
      return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0
    })
}

function safeTimestamp(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function reviewDigest(value: string | undefined) {
  return value && digestPattern.test(value) ? value.toLowerCase() : null
}

function boolEffect(value: unknown) {
  return value === true ? 1 : 0
}

function collectExceptionRecords(buying: EcommerceBuyingState): EcommerceShopExceptionRecord[] {
  const records: EcommerceShopExceptionRecord[] = []

  for (const intent of buying.returnIntents) {
    records.push({
      kind: 'return',
      id: intent.id,
      state: intent.state,
      idempotencyKey: intent.idempotencyKey,
      orderId: intent.orderId,
      sourceRequestId: intent.sourceRequestId,
      evidenceReference: intent.evidenceReference,
      replacementRequestId: null,
      sourceIntentId: null,
      externalEffectCount: intent.refundStatus === 'not_started' ? 0 : 1,
    })
  }

  for (const intent of buying.supportIntents) {
    records.push({
      kind: 'support',
      id: intent.id,
      state: intent.state,
      idempotencyKey: intent.idempotencyKey,
      orderId: intent.orderId,
      sourceRequestId: intent.sourceRequestId,
      evidenceReference: intent.evidenceReference,
      replacementRequestId: null,
      sourceIntentId: null,
      externalEffectCount: boolEffect(intent.externalMessageSent) + boolEffect(intent.refundStarted),
    })
  }

  for (const intent of buying.correctionIntents) {
    records.push({
      kind: 'correction',
      id: intent.id,
      state: intent.state,
      idempotencyKey: intent.idempotencyKey,
      orderId: intent.orderId,
      sourceRequestId: intent.sourceRequestId,
      evidenceReference: intent.evidenceReference,
      replacementRequestId: null,
      sourceIntentId: null,
      externalEffectCount: correctionExternalEffectCount(intent),
    })
  }

  for (const intent of buying.cancellationIntents) {
    records.push({
      kind: 'cancellation',
      id: intent.id,
      state: intent.state,
      idempotencyKey: intent.idempotencyKey,
      orderId: intent.orderId,
      sourceRequestId: intent.sourceRequestId,
      evidenceReference: intent.evidenceReference,
      replacementRequestId: null,
      sourceIntentId: null,
      externalEffectCount: boolEffect(intent.customerMessageSent) + boolEffect(intent.orderCancelled) + boolEffect(intent.refundStarted),
    })
  }

  for (const decision of buying.cancellationDecisions) {
    records.push({
      kind: 'cancellation_decision',
      id: decision.id,
      state: decision.state,
      idempotencyKey: decision.idempotencyKey,
      orderId: decision.orderId,
      sourceRequestId: decision.sourceRequestId,
      evidenceReference: decision.evidenceReference,
      replacementRequestId: null,
      sourceIntentId: decision.intentId,
      externalEffectCount: boolEffect(decision.customerMessageSent)
        + boolEffect(decision.orderCancelled)
        + boolEffect(decision.refundStarted)
        + boolEffect(decision.providerCalled),
    })
  }

  for (const intent of buying.amendmentIntents) {
    records.push({
      kind: 'amendment',
      id: intent.id,
      state: intent.state,
      idempotencyKey: intent.idempotencyKey,
      orderId: intent.orderId,
      sourceRequestId: intent.sourceRequestId,
      evidenceReference: intent.evidenceReference,
      replacementRequestId: intent.replacementRequestId,
      sourceIntentId: null,
      externalEffectCount: replacementExternalEffectCount(intent),
    })
  }

  for (const intent of buying.rescheduleIntents) {
    records.push({
      kind: 'reschedule',
      id: intent.id,
      state: intent.state,
      idempotencyKey: intent.idempotencyKey,
      orderId: intent.orderId,
      sourceRequestId: intent.sourceRequestId,
      evidenceReference: intent.evidenceReference,
      replacementRequestId: intent.replacementRequestId,
      sourceIntentId: null,
      externalEffectCount: replacementExternalEffectCount(intent) + boolEffect(intent.riderBooked),
    })
  }

  return records
}

function correctionExternalEffectCount(intent: EcommerceCorrectionIntent) {
  return boolEffect(intent.orderChanged)
    + boolEffect(intent.paymentChanged)
    + boolEffect(intent.refundStarted)
    + boolEffect(intent.ledgerPosted)
    + boolEffect(intent.taxFiled)
    + boolEffect(intent.customerMessageSent)
    + boolEffect(intent.providerCalled)
}

function replacementExternalEffectCount(intent: EcommerceOrderAmendmentIntent | EcommerceOrderRescheduleIntent) {
  return boolEffect(intent.customerMessageSent)
    + boolEffect(intent.orderChanged)
    + boolEffect(intent.stockChanged)
    + boolEffect(intent.paymentChanged)
    + boolEffect(intent.refundStarted)
    + boolEffect(intent.providerCalled)
}

function evidenceReferenceBound(record: EcommerceShopExceptionRecord, cancellationsById: Map<string, EcommerceCancellationIntent>) {
  const suffix = record.idempotencyKey.slice(4)
  if (record.kind === 'return') return record.evidenceReference.startsWith(`ECOMMERCE-RETURN:${suffix}:${record.orderId}:${record.sourceRequestId}`)
  if (record.kind === 'support') return record.evidenceReference.startsWith(`ECOMMERCE-SUPPORT:${suffix}:${record.orderId}:${record.sourceRequestId}`)
  if (record.kind === 'correction') return record.evidenceReference.startsWith(`ECOMMERCE-CORRECTION:${suffix}:${record.orderId}:${record.sourceRequestId}`)
  if (record.kind === 'cancellation') return record.evidenceReference.startsWith(`ECOMMERCE-CANCELLATION:${suffix}:${record.orderId}:${record.sourceRequestId}`)
  if (record.kind === 'amendment') {
    return !!record.replacementRequestId
      && record.evidenceReference.startsWith(`ECOMMERCE-AMENDMENT:${suffix}:${record.orderId}:${record.sourceRequestId}:${record.replacementRequestId}`)
  }
  if (record.kind === 'reschedule') {
    return !!record.replacementRequestId
      && record.evidenceReference.startsWith(`ECOMMERCE-RESCHEDULE:${suffix}:${record.orderId}:${record.sourceRequestId}:${record.replacementRequestId}`)
  }
  if (!record.sourceIntentId) return false
  const intent = cancellationsById.get(record.sourceIntentId)
  return !!intent
    && record.evidenceReference === intent.evidenceReference
    && intent.orderId === record.orderId
    && intent.sourceRequestId === record.sourceRequestId
  return false
}

function shopActionAlreadyApplied(order: CommerceOrder | undefined) {
  if (!order) return false
  return order.status === 'cancelled'
    || (order.returns?.length ?? 0) > 0
    || (order.supportCases?.length ?? 0) > 0
    || (order.corrections?.length ?? 0) > 0
}

function uniqueOrders(records: EcommerceShopExceptionRecord[], ordersById: Map<string, CommerceOrder>) {
  const seen = new Set<string>()
  const orders: CommerceOrder[] = []
  for (const record of records) {
    if (seen.has(record.orderId)) continue
    seen.add(record.orderId)
    const order = ordersById.get(record.orderId)
    if (order) orders.push(order)
  }
  return orders
}

export function projectEcommerceShopExceptionEvidence(
  buying: EcommerceBuyingState,
  commerce: CommerceState,
  input: EcommerceShopExceptionEvidenceInput,
): EcommerceShopExceptionEvidence {
  const records = collectExceptionRecords(buying)
  const sourceRequestIds = new Set(buying.requests.map((request) => request.id))
  const shopOrdersById = new Map(commerce.orders.map((order) => [order.id, order]))
  const cancellationsById = new Map(buying.cancellationIntents.map((intent) => [intent.id, intent]))
  const replacementRecords = records.filter((record) => !!record.replacementRequestId)
  const linkedShopOrders = uniqueOrders(records, shopOrdersById)

  const missingSourceRequestCount = records.filter((record) => !sourceRequestIds.has(record.sourceRequestId)).length
  const missingReplacementRequestCount = replacementRecords
    .filter((record) => !record.replacementRequestId || !sourceRequestIds.has(record.replacementRequestId))
    .length
  const missingShopOrderCount = records.filter((record) => !shopOrdersById.has(record.orderId)).length
  const unattributedShopOrderCount = records.filter((record) => {
    const order = shopOrdersById.get(record.orderId)
    return !order || order.sourceRecordId !== record.sourceRequestId
  }).length
  const nonReviewStateCount = records.filter((record) => (
    record.kind === 'cancellation_decision'
      ? record.state !== 'kept_by_shop'
      : record.state !== 'pending_shop_review'
  )).length
  const unboundEvidenceReferenceCount = records.filter((record) => !evidenceReferenceBound(record, cancellationsById)).length
  const externalEffectCount = records.reduce((total, record) => total + record.externalEffectCount, 0)
  const appliedShopActionCount = linkedShopOrders.filter(shopActionAlreadyApplied).length
  const coveredIntentCount = records.filter((record) => {
    const order = shopOrdersById.get(record.orderId)
    const stateOk = record.kind === 'cancellation_decision' ? record.state === 'kept_by_shop' : record.state === 'pending_shop_review'
    return sourceRequestIds.has(record.sourceRequestId)
      && (!record.replacementRequestId || sourceRequestIds.has(record.replacementRequestId))
      && !!order
      && order.sourceRecordId === record.sourceRequestId
      && stateOk
      && evidenceReferenceBound(record, cancellationsById)
      && record.externalEffectCount === 0
  }).length
  const ecommerceOperatorReviewDigest = reviewDigest(input.ecommerceOperatorReviewDigest)
  const shopOperatorReviewDigest = reviewDigest(input.shopOperatorReviewDigest)

  const metrics: EcommerceShopExceptionEvidenceMetrics = {
    ecommerceRevision: buying.revision,
    sourceRequestCount: buying.requests.length,
    shopOrderCount: commerce.orders.length,
    exceptionIntentCount: records.length,
    replacementReviewIntentCount: replacementRecords.length,
    returnIntentCount: buying.returnIntents.length,
    supportIntentCount: buying.supportIntents.length,
    correctionIntentCount: buying.correctionIntents.length,
    cancellationIntentCount: buying.cancellationIntents.length,
    cancellationDecisionCount: buying.cancellationDecisions.length,
    amendmentIntentCount: buying.amendmentIntents.length,
    rescheduleIntentCount: buying.rescheduleIntents.length,
    coveredIntentCount,
    missingSourceRequestCount,
    missingReplacementRequestCount,
    missingShopOrderCount,
    unattributedShopOrderCount,
    nonReviewStateCount,
    unboundEvidenceReferenceCount,
    externalEffectCount,
    appliedShopActionCount,
  }

  const gates: EcommerceShopExceptionEvidenceGate[] = [
    {
      id: 'review_window_timestamp_valid',
      passed: safeTimestamp(input.capturedAt),
      reason: safeTimestamp(input.capturedAt) ? 'Review evidence timestamp is canonical.' : 'Review evidence timestamp must be canonical ISO.',
    },
    {
      id: 'ecommerce_exception_intents_present',
      passed: records.length > 0,
      reason: records.length > 0 ? 'At least one Ecommerce exception intent is present.' : 'No Ecommerce exception intent is present.',
    },
    {
      id: 'replacement_review_intent_present',
      passed: replacementRecords.length > 0,
      reason: replacementRecords.length > 0
        ? 'At least one amendment or reschedule replacement review is present.'
        : 'No Ecommerce replacement review intent is present.',
    },
    {
      id: 'source_requests_retained',
      passed: missingSourceRequestCount === 0,
      reason: missingSourceRequestCount === 0 ? 'Every exception intent is bound to a retained source request.' : `${missingSourceRequestCount} exception intent(s) lack retained source request evidence.`,
    },
    {
      id: 'replacement_requests_retained',
      passed: missingReplacementRequestCount === 0,
      reason: missingReplacementRequestCount === 0 ? 'Every replacement workflow has retained replacement request evidence.' : `${missingReplacementRequestCount} replacement request(s) are missing.`,
    },
    {
      id: 'shop_orders_present',
      passed: missingShopOrderCount === 0,
      reason: missingShopOrderCount === 0 ? 'Every exception intent references an existing Shop order.' : `${missingShopOrderCount} exception intent(s) reference a missing Shop order.`,
    },
    {
      id: 'shop_orders_ecommerce_attributed',
      passed: unattributedShopOrderCount === 0,
      reason: unattributedShopOrderCount === 0
        ? 'Every referenced Shop order is attributed to the Ecommerce source request.'
        : `${unattributedShopOrderCount} referenced Shop order(s) are not attributed to their Ecommerce request.`,
    },
    {
      id: 'intents_pending_shop_review',
      passed: nonReviewStateCount === 0,
      reason: nonReviewStateCount === 0 ? 'Every exception record is still in Shop review state.' : `${nonReviewStateCount} exception record(s) have moved beyond review state.`,
    },
    {
      id: 'intent_evidence_references_bound',
      passed: unboundEvidenceReferenceCount === 0,
      reason: unboundEvidenceReferenceCount === 0
        ? 'Every exception evidence reference is bound to its source order/request record.'
        : `${unboundEvidenceReferenceCount} exception evidence reference(s) are stale or unbound.`,
    },
    {
      id: 'external_effect_controls_false',
      passed: externalEffectCount === 0,
      reason: externalEffectCount === 0 ? 'All Ecommerce external-effect controls remain false.' : `${externalEffectCount} external-effect control(s) are no longer false.`,
    },
    {
      id: 'shop_actions_not_applied',
      passed: appliedShopActionCount === 0,
      reason: appliedShopActionCount === 0
        ? 'Referenced Shop orders have not been changed by exception review.'
        : `${appliedShopActionCount} referenced Shop order(s) already show applied exception actions.`,
    },
    {
      id: 'ecommerce_operator_review_digest_present',
      passed: !!ecommerceOperatorReviewDigest,
      reason: ecommerceOperatorReviewDigest ? 'Ecommerce operator review digest is present.' : 'Ecommerce operator review digest is missing or invalid.',
    },
    {
      id: 'shop_operator_review_digest_present',
      passed: !!shopOperatorReviewDigest,
      reason: shopOperatorReviewDigest ? 'Shop operator review digest is present.' : 'Shop operator review digest is missing or invalid.',
    },
    {
      id: 'independent_review_digests',
      passed: !!ecommerceOperatorReviewDigest && !!shopOperatorReviewDigest && ecommerceOperatorReviewDigest !== shopOperatorReviewDigest,
      reason: ecommerceOperatorReviewDigest && shopOperatorReviewDigest && ecommerceOperatorReviewDigest !== shopOperatorReviewDigest
        ? 'Ecommerce and Shop reviews are independently digested.'
        : 'Ecommerce and Shop review digests must both be present and different.',
    },
  ]

  const evidence: EcommerceShopExceptionEvidenceProof = {
    reviewWindowId: input.reviewWindowId,
    capturedAt: input.capturedAt,
    ecommerceStateDigest: digest({
      schema: buying.schema,
      scope: buying.scope,
      revision: buying.revision,
      headDigest: buying.headDigest,
      requestCount: buying.requests.length,
      exceptionIntentCount: records.length,
    }),
    shopStateDigest: digest(canonicalize({
      schema: commerce.schema,
      orderCount: commerce.orders.length,
      linkedOrderCount: linkedShopOrders.length,
      linkedOrders: canonicalSet(linkedShopOrders),
    })),
    exceptionIntentSetDigest: digest(canonicalSet(records.map((record) => ({
      kind: record.kind,
      state: record.state,
      hasReplacement: !!record.replacementRequestId,
      externalEffectCount: record.externalEffectCount,
    })))),
    sourceRequestSetDigest: digest(Array.from(sourceRequestIds).sort()),
    ecommerceOperatorReviewDigest,
    shopOperatorReviewDigest,
  }
  const blockingCount = gates.filter((gate) => !gate.passed).length
  const projection = {
    contract: ECOMMERCE_SHOP_EXCEPTION_EVIDENCE_CONTRACT,
    evidence,
    metrics,
    gates: gates.map((gate) => ({ id: gate.id, passed: gate.passed })),
  }

  return {
    contract: ECOMMERCE_SHOP_EXCEPTION_EVIDENCE_CONTRACT,
    readyForPilotExceptionReview: blockingCount === 0,
    blockingCount,
    gates,
    metrics,
    evidence,
    exceptionEvidenceDigest: digest(projection),
  }
}
