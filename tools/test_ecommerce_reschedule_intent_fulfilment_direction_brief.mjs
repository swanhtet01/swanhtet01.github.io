import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentFulfilmentDirectionBrief } from './ecommerce-reschedule-intent-fulfilment-direction-brief.ts'`,
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

const { projectEcommerceRescheduleIntentFulfilmentDirectionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// originalPromisedAt is '2026-08-05T10:00:00Z' in the fixture
const FORWARD_DATE = '2026-08-03T10:00:00Z'     // < originalPromisedAt → forward
const PUSHED_BACK_DATE = '2026-08-07T10:00:00Z' // > originalPromisedAt → pushed back

let intentId = 0
function rescheduleIntent(fulfilment = 'delivery', requestedPromisedAt = PUSHED_BACK_DATE) {
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
    requestedPromisedAt,
    fulfilment,
    reason: 'Reschedule reason',
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
  const r = projectEcommerceRescheduleIntentFulfilmentDirectionBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.pickupForwardCount === 0, 'empty: pickupForwardCount 0')
  check(r.deliveryForwardCount === 0, 'empty: deliveryForwardCount 0')
}

// 2. Pickup forward (requestedPromisedAt < originalPromisedAt)
{
  const r = projectEcommerceRescheduleIntentFulfilmentDirectionBrief(state([
    rescheduleIntent('pickup', FORWARD_DATE),
  ]))
  check(r.totalIntents === 1, 'pickup-fwd: totalIntents 1')
  check(r.pickupForwardCount === 1, 'pickup-fwd: pickupForwardCount 1')
  check(r.pickupCount === 1, 'pickup-fwd: pickupCount 1')
  check(r.forwardCount === 1, 'pickup-fwd: forwardCount 1')
}

// 3. Delivery pushed back (requestedPromisedAt > originalPromisedAt)
{
  const r = projectEcommerceRescheduleIntentFulfilmentDirectionBrief(state([
    rescheduleIntent('delivery', PUSHED_BACK_DATE),
  ]))
  check(r.totalIntents === 1, 'delivery-back: totalIntents 1')
  check(r.deliveryPushedBackCount === 1, 'delivery-back: deliveryPushedBackCount 1')
  check(r.deliveryCount === 1, 'delivery-back: deliveryCount 1')
  check(r.pushedBackCount === 1, 'delivery-back: pushedBackCount 1')
}

// 4. Delivery forward
{
  const r = projectEcommerceRescheduleIntentFulfilmentDirectionBrief(state([
    rescheduleIntent('delivery', FORWARD_DATE),
  ]))
  check(r.deliveryForwardCount === 1, 'delivery-fwd: deliveryForwardCount 1')
  check(r.deliveryCount === 1, 'delivery-fwd: deliveryCount 1')
  check(r.forwardCount === 1, 'delivery-fwd: forwardCount 1')
}

// 5. Pickup pushed back
{
  const r = projectEcommerceRescheduleIntentFulfilmentDirectionBrief(state([
    rescheduleIntent('pickup', PUSHED_BACK_DATE),
  ]))
  check(r.pickupPushedBackCount === 1, 'pickup-back: pickupPushedBackCount 1')
  check(r.pickupCount === 1, 'pickup-back: pickupCount 1')
  check(r.pushedBackCount === 1, 'pickup-back: pushedBackCount 1')
}

// 6. All 4 cells: pickup-fwd, pickup-back, delivery-fwd, delivery-back
{
  const r = projectEcommerceRescheduleIntentFulfilmentDirectionBrief(state([
    rescheduleIntent('pickup', FORWARD_DATE),
    rescheduleIntent('pickup', PUSHED_BACK_DATE),
    rescheduleIntent('delivery', FORWARD_DATE),
    rescheduleIntent('delivery', PUSHED_BACK_DATE),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.pickupForwardCount === 1, 'all-cells: pickupForwardCount 1')
  check(r.deliveryForwardCount === 1, 'all-cells: deliveryForwardCount 1')
  check(r.pickupPushedBackCount === 1, 'all-cells: pickupPushedBackCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceRescheduleIntentFulfilmentDirectionBrief(state([
    rescheduleIntent('pickup', FORWARD_DATE),
    rescheduleIntent('pickup', PUSHED_BACK_DATE),
    rescheduleIntent('delivery', FORWARD_DATE),
    rescheduleIntent('delivery', PUSHED_BACK_DATE),
  ]))
  check(r.deliveryPushedBackCount === 1, 'sub-buckets: deliveryPushedBackCount 1')
  check(r.pushedBackCount === 2, 'sub-buckets: pushedBackCount 2')
}

console.log(`ecommerce-reschedule-intent-fulfilment-direction-brief: ${checks} checks passed`)
