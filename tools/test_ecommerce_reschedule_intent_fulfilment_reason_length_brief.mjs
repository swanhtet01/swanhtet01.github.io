import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentFulfilmentReasonLengthBrief } from './ecommerce-reschedule-intent-fulfilment-reason-length-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceRescheduleIntentFulfilmentReasonLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SHORT_REASON = 'Short reason'                                          // 12 chars ≤ 40
const DETAILED_REASON = 'This is a very detailed explanation that exceeds forty characters' // 65 chars > 40

let intentId = 0
function rescheduleIntent(fulfilment = 'delivery', reason = SHORT_REASON) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ERS-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 15000,
    originalPromisedAt: '2026-08-05T10:00:00Z',
    replacementRequestId: `REP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    requestedPromisedAt: '2026-08-07T10:00:00Z',
    fulfilment,
    reason,
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    riderBooked: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(rescheduleIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents,
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceRescheduleIntentFulfilmentReasonLengthBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.pickupShortCount === 0, 'empty: pickupShortCount 0')
  check(r.deliveryDetailedCount === 0, 'empty: deliveryDetailedCount 0')
}

// 2. Pickup short
{
  const r = projectEcommerceRescheduleIntentFulfilmentReasonLengthBrief(state([
    rescheduleIntent('pickup', SHORT_REASON),
  ]))
  check(r.totalIntents === 1, 'pickup-short: totalIntents 1')
  check(r.pickupShortCount === 1, 'pickup-short: pickupShortCount 1')
  check(r.pickupCount === 1, 'pickup-short: pickupCount 1')
  check(r.deliveryShortCount === 0, 'pickup-short: deliveryShortCount 0')
}

// 3. Delivery detailed
{
  const r = projectEcommerceRescheduleIntentFulfilmentReasonLengthBrief(state([
    rescheduleIntent('delivery', DETAILED_REASON),
  ]))
  check(r.deliveryDetailedCount === 1, 'delivery-detailed: deliveryDetailedCount 1')
  check(r.deliveryCount === 1, 'delivery-detailed: deliveryCount 1')
  check(r.pickupDetailedCount === 0, 'delivery-detailed: pickupDetailedCount 0')
  check(r.totalIntents === 1, 'delivery-detailed: totalIntents 1')
}

// 4. Delivery short
{
  const r = projectEcommerceRescheduleIntentFulfilmentReasonLengthBrief(state([
    rescheduleIntent('delivery', SHORT_REASON),
  ]))
  check(r.deliveryShortCount === 1, 'delivery-short: deliveryShortCount 1')
  check(r.deliveryCount === 1, 'delivery-short: deliveryCount 1')
  check(r.pickupCount === 0, 'delivery-short: pickupCount 0')
}

// 5. Pickup detailed
{
  const r = projectEcommerceRescheduleIntentFulfilmentReasonLengthBrief(state([
    rescheduleIntent('pickup', DETAILED_REASON),
  ]))
  check(r.pickupDetailedCount === 1, 'pickup-detailed: pickupDetailedCount 1')
  check(r.pickupCount === 1, 'pickup-detailed: pickupCount 1')
  check(r.deliveryCount === 0, 'pickup-detailed: deliveryCount 0')
}

// 6. All 4 cells: pickup-short, pickup-detailed, delivery-short, delivery-detailed
{
  const r = projectEcommerceRescheduleIntentFulfilmentReasonLengthBrief(state([
    rescheduleIntent('pickup', SHORT_REASON),
    rescheduleIntent('pickup', DETAILED_REASON),
    rescheduleIntent('delivery', SHORT_REASON),
    rescheduleIntent('delivery', DETAILED_REASON),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.pickupShortCount === 1, 'all-cells: pickupShortCount 1')
  check(r.deliveryDetailedCount === 1, 'all-cells: deliveryDetailedCount 1')
  check(r.deliveryShortCount === 1, 'all-cells: deliveryShortCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceRescheduleIntentFulfilmentReasonLengthBrief(state([
    rescheduleIntent('pickup', SHORT_REASON),
    rescheduleIntent('pickup', DETAILED_REASON),
    rescheduleIntent('delivery', SHORT_REASON),
    rescheduleIntent('delivery', DETAILED_REASON),
  ]))
  check(r.pickupDetailedCount === 1, 'sub-buckets: pickupDetailedCount 1')
  check(r.pickupCount === 2, 'sub-buckets: pickupCount 2')
}

console.log(`ecommerce-reschedule-intent-fulfilment-reason-length-brief: ${checks} checks passed`)
