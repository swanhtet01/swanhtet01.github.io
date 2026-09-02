// Ecommerce-to-Shop exception evidence dry-run verifier.
//
// This is intentionally a projection, not a mutator. It proves that Ecommerce
// exception intents can be reviewed by Shop from retained local evidence while
// every external-effect flag remains false.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceShopExceptionEvidence } from './ecommerce-shop-exception-evidence.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ecommerce-shop-exception-evidence-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceShopExceptionEvidence } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`,
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SOURCE_REQUEST_ID = 'ECR-459AAB25-5BDD-4687-BABA-82FD4E6A1578'
const REPLACEMENT_REQUEST_ID = 'ECR-5B600C08-A8C2-469F-B6EA-222BB38D9483'
const SECOND_SOURCE_REQUEST_ID = 'ECR-6C711D19-B9D3-47A0-87FB-333CC49EA594'
const ORDER_ID = 'ord-ecommerce-1'
const SECOND_ORDER_ID = 'ord-ecommerce-2'
const ECOM_REVIEW = `sha256:${'a'.repeat(64)}`
const SHOP_REVIEW = `sha256:${'b'.repeat(64)}`

function sourceRequest(id = SOURCE_REQUEST_ID) {
  return {
    id,
    scope: 'demo',
    sourcePreviewDigest: `sha256:${'c'.repeat(64)}`,
  }
}

function shopOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    createdAt: '2026-08-25T08:00:00.000Z',
    customer: 'Private Customer',
    channel: 'ecommerce',
    item: 'Demo item',
    quantity: 1,
    payment: 'pay_on_pickup',
    paymentStatus: 'pending',
    refundStatus: 'none',
    sourceRecordId: SOURCE_REQUEST_ID,
    total: 12000,
    status: 'confirmed',
    ...overrides,
  }
}

function supportIntent(overrides = {}) {
  const idempotencyKey = 'ESI-1D2E3F40-5A6B-4C7D-8E9F-A0B1C2D3E4F5'
  return {
    schema: 'supermega.ecommerce.support_intent.v1',
    state: 'pending_shop_review',
    scope: 'demo',
    id: `ESR-${idempotencyKey.slice(4)}`,
    idempotencyKey,
    createdAt: '2026-08-25T09:00:00.000Z',
    orderId: ORDER_ID,
    sourceRequestId: SOURCE_REQUEST_ID,
    category: 'delivery_issue',
    description: 'Operator review required',
    externalMessageSent: false,
    refundStarted: false,
    evidenceReference: `ECOMMERCE-SUPPORT:${idempotencyKey.slice(4)}:${ORDER_ID}:${SOURCE_REQUEST_ID}`,
    ...overrides,
  }
}

function secondSupportIntent() {
  const idempotencyKey = 'ESI-2E3F4051-6B7C-4D8E-9F0A-B1C2D3E4F506'
  return supportIntent({
    id: `ESR-${idempotencyKey.slice(4)}`,
    idempotencyKey,
    orderId: SECOND_ORDER_ID,
    sourceRequestId: SECOND_SOURCE_REQUEST_ID,
    evidenceReference: `ECOMMERCE-SUPPORT:${idempotencyKey.slice(4)}:${SECOND_ORDER_ID}:${SECOND_SOURCE_REQUEST_ID}`,
  })
}

function amendmentIntent(overrides = {}) {
  const idempotencyKey = 'EAI-6DA2B7F3-7CE1-42F2-94C7-F61079F1A322'
  return {
    schema: 'supermega.ecommerce.order_amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'demo',
    id: `EAM-${idempotencyKey.slice(4)}`,
    idempotencyKey,
    createdAt: '2026-08-25T09:05:00.000Z',
    orderId: ORDER_ID,
    sourceRequestId: SOURCE_REQUEST_ID,
    sourceAcknowledgementDigest: `sha256:${'d'.repeat(64)}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 12000,
    replacementRequestId: REPLACEMENT_REQUEST_ID,
    replacementRequestDigest: `sha256:${'e'.repeat(64)}`,
    lineChanges: [{ sku: 'SKU-1', name: 'Demo item', fromQuantity: 1, toQuantity: 2 }],
    fromFulfilment: 'pickup',
    toFulfilment: 'delivery',
    reason: 'Customer wants delivery instead of pickup',
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference: `ECOMMERCE-AMENDMENT:${idempotencyKey.slice(4)}:${ORDER_ID}:${SOURCE_REQUEST_ID}:${REPLACEMENT_REQUEST_ID}:eeeeeeee`,
    ...overrides,
  }
}

function buying(overrides = {}) {
  return {
    schema: 'supermega.ecommerce.buying_state.v1',
    scope: 'demo',
    revision: 2,
    headDigest: `sha256:${'f'.repeat(64)}`,
    requests: [sourceRequest(), sourceRequest(REPLACEMENT_REQUEST_ID)],
    returnIntents: [],
    supportIntents: [supportIntent()],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [amendmentIntent()],
    rescheduleIntents: [],
    events: [],
    ...overrides,
  }
}

function commerce(overrides = {}) {
  return {
    schema: 'supermega.commerce.workspace.v2',
    items: [],
    orders: [shopOrder()],
    movements: [],
    closes: [],
    ...overrides,
  }
}

function project(state = buying(), shop = commerce(), input = {}) {
  return projectEcommerceShopExceptionEvidence(state, shop, {
    reviewWindowId: 'W10-DRY-RUN',
    capturedAt: '2026-08-25T10:00:00.000Z',
    ecommerceOperatorReviewDigest: ECOM_REVIEW,
    shopOperatorReviewDigest: SHOP_REVIEW,
    ...input,
  })
}

function gate(result, id) {
  return result.gates.find((candidate) => candidate.id === id)
}

// 1. Happy path: support plus amendment review, all evidence retained, no effects.
{
  const result = project()
  check(result.contract === 'supermega.ecommerce-shop-exception-evidence.v1', 'contract is stable')
  check(result.readyForPilotExceptionReview === true, 'happy path is ready for pilot exception review')
  check(result.blockingCount === 0, 'happy path has no blockers')
  check(result.metrics.exceptionIntentCount === 2, 'happy path counts both exception intents')
  check(result.metrics.replacementReviewIntentCount === 1, 'happy path counts the replacement review intent')
  check(result.metrics.coveredIntentCount === 2, 'happy path covers both intents')
  check(result.metrics.externalEffectCount === 0, 'happy path has no external effects')
  check(result.metrics.appliedShopActionCount === 0, 'happy path has not applied Shop actions')
  check(/^sha256:[0-9a-f]{64}$/.test(result.exceptionEvidenceDigest), 'evidence digest is sha256')
  check(JSON.stringify(result).includes('Private Customer') === false, 'projection does not expose customer identity')
}

// 2. Empty exception set fails closed.
{
  const result = project(buying({ supportIntents: [], amendmentIntents: [] }))
  check(result.readyForPilotExceptionReview === false, 'empty exception set is not ready')
  check(gate(result, 'ecommerce_exception_intents_present').passed === false, 'missing exception gate fails')
  check(gate(result, 'replacement_review_intent_present').passed === false, 'missing replacement gate fails')
}

// 2a. Every commercially relevant linked-order field is digest-bound without disclosure.
{
  const baseline = project()
  const mutations = [
    ['total', shopOrder({ total: 13000 })],
    ['lines', shopOrder({ lines: [{ sku: 'SKU-PRIVATE', name: 'Private line item', quantity: 2, unitPriceMmk: 6500 }] })],
    ['payment', shopOrder({ payment: 'kbzpay_manual' })],
    ['customer', shopOrder({ customer: 'Private Customer Changed' })],
  ]
  for (const [label, order] of mutations) {
    const changed = project(undefined, commerce({ orders: [order] }))
    check(changed.evidence.shopStateDigest !== baseline.evidence.shopStateDigest, `${label} mutation changes Shop state digest`)
    check(changed.exceptionEvidenceDigest !== baseline.exceptionEvidenceDigest, `${label} mutation changes final evidence digest`)
  }

  const privateProjection = project(undefined, commerce({ orders: [shopOrder({
    customer: 'Private Customer Changed',
    lines: [{ sku: 'SKU-PRIVATE', name: 'Private line item', quantity: 2, unitPriceMmk: 6500 }],
  })] }))
  const serialized = JSON.stringify(privateProjection)
  check(!serialized.includes('Private line item'), 'linked line identity is not exposed')
  check(!serialized.includes('Private Customer Changed'), 'linked customer identity is not exposed')
}

// 2b. Equivalent linked-order and intent sets digest identically regardless of source ordering.
{
  const firstOrder = shopOrder()
  const secondOrder = shopOrder({
    id: SECOND_ORDER_ID,
    customer: 'Second Private Customer',
    sourceRecordId: SECOND_SOURCE_REQUEST_ID,
    total: 9000,
  })
  const firstSupport = supportIntent()
  const secondSupport = secondSupportIntent()
  const requests = [sourceRequest(), sourceRequest(REPLACEMENT_REQUEST_ID), sourceRequest(SECOND_SOURCE_REQUEST_ID)]
  const forward = project(
    buying({ requests, supportIntents: [firstSupport, secondSupport] }),
    commerce({ orders: [firstOrder, secondOrder] }),
  )
  const reversed = project(
    buying({ requests: [...requests].reverse(), supportIntents: [secondSupport, firstSupport] }),
    commerce({ orders: [secondOrder, firstOrder] }),
  )
  check(forward.evidence.shopStateDigest === reversed.evidence.shopStateDigest, 'Shop state digest is order deterministic')
  check(forward.evidence.exceptionIntentSetDigest === reversed.evidence.exceptionIntentSetDigest, 'intent set digest is order deterministic')
  check(forward.exceptionEvidenceDigest === reversed.exceptionEvidenceDigest, 'final evidence digest is order deterministic')
}

// 3. Missing replacement request fails the replacement retention gate.
{
  const result = project(buying({ requests: [sourceRequest()] }))
  check(result.readyForPilotExceptionReview === false, 'missing replacement request is not ready')
  check(result.metrics.missingReplacementRequestCount === 1, 'missing replacement request is counted')
  check(gate(result, 'replacement_requests_retained').passed === false, 'replacement retention gate fails')
}

// 4. External-effect flags fail closed.
{
  const result = project(buying({
    amendmentIntents: [amendmentIntent({ providerCalled: true })],
  }))
  check(result.readyForPilotExceptionReview === false, 'provider call flag is not ready')
  check(result.metrics.externalEffectCount === 1, 'provider call flag increments effect count')
  check(gate(result, 'external_effect_controls_false').passed === false, 'external effect gate fails')
}

// 5. Shop order must be attributed to the Ecommerce source request.
{
  const result = project(undefined, commerce({ orders: [shopOrder({ sourceRecordId: 'ECR-00000000-0000-4000-8000-000000000000' })] }))
  check(result.readyForPilotExceptionReview === false, 'unattributed Shop order is not ready')
  check(result.metrics.unattributedShopOrderCount === 2, 'both intents see the unattributed Shop order')
  check(gate(result, 'shop_orders_ecommerce_attributed').passed === false, 'attribution gate fails')
}

// 6. Review digests are required and must be independent.
{
  const missing = project(undefined, undefined, { ecommerceOperatorReviewDigest: undefined })
  check(missing.readyForPilotExceptionReview === false, 'missing Ecommerce review digest is not ready')
  check(gate(missing, 'ecommerce_operator_review_digest_present').passed === false, 'Ecommerce review gate fails')

  const same = project(undefined, undefined, { shopOperatorReviewDigest: ECOM_REVIEW })
  check(same.readyForPilotExceptionReview === false, 'non-independent review digests are not ready')
  check(gate(same, 'independent_review_digests').passed === false, 'independent digest gate fails')
}

// 7. Applied Shop actions fail the dry-run boundary.
{
  const result = project(undefined, commerce({ orders: [shopOrder({ status: 'cancelled' })] }))
  check(result.readyForPilotExceptionReview === false, 'applied Shop action is not ready')
  check(result.metrics.appliedShopActionCount === 1, 'applied Shop action is counted once per linked order')
  check(gate(result, 'shop_actions_not_applied').passed === false, 'Shop action gate fails')
}

// 8. Evidence references must still bind to order/request identifiers.
{
  const result = project(buying({
    supportIntents: [supportIntent({ evidenceReference: 'ECOMMERCE-SUPPORT:stale' })],
  }))
  check(result.readyForPilotExceptionReview === false, 'stale evidence reference is not ready')
  check(result.metrics.unboundEvidenceReferenceCount === 1, 'stale evidence reference is counted')
  check(gate(result, 'intent_evidence_references_bound').passed === false, 'evidence reference gate fails')
}

// 9. Review timestamp must be canonical ISO.
{
  const result = project(undefined, undefined, { capturedAt: '2026-08-25 10:00' })
  check(result.readyForPilotExceptionReview === false, 'non-canonical timestamp is not ready')
  check(gate(result, 'review_window_timestamp_valid').passed === false, 'timestamp gate fails')
}

console.log(JSON.stringify({ ok: true, checks }))
