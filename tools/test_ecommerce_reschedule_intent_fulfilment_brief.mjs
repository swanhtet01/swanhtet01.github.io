import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentFulfilmentBrief } from './ecommerce-reschedule-intent-fulfilment-brief.ts'`,
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

const { projectEcommerceRescheduleIntentFulfilmentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function rescheduleIntent(fulfilment = 'delivery') {
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
  const r = projectEcommerceRescheduleIntentFulfilmentBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.pickupCount === 0, 'empty: pickupCount 0')
  check(r.deliveryCount === 0, 'empty: deliveryCount 0')
}

// 2. Single pickup
{
  const r = projectEcommerceRescheduleIntentFulfilmentBrief(state([rescheduleIntent('pickup')]))
  check(r.totalIntents === 1, 'single-pickup: totalIntents 1')
  check(r.pickupCount === 1, 'single-pickup: pickupCount 1')
  check(r.deliveryCount === 0, 'single-pickup: deliveryCount 0')
}

// 3. Single delivery
{
  const r = projectEcommerceRescheduleIntentFulfilmentBrief(state([rescheduleIntent('delivery')]))
  check(r.totalIntents === 1, 'single-delivery: totalIntents 1')
  check(r.pickupCount === 0, 'single-delivery: pickupCount 0')
  check(r.deliveryCount === 1, 'single-delivery: deliveryCount 1')
}

// 4. Two pickup
{
  const r = projectEcommerceRescheduleIntentFulfilmentBrief(state([
    rescheduleIntent('pickup'),
    rescheduleIntent('pickup'),
  ]))
  check(r.totalIntents === 2, 'two-pickup: totalIntents 2')
  check(r.pickupCount === 2, 'two-pickup: pickupCount 2')
  check(r.deliveryCount === 0, 'two-pickup: deliveryCount 0')
}

// 5. Two delivery
{
  const r = projectEcommerceRescheduleIntentFulfilmentBrief(state([
    rescheduleIntent('delivery'),
    rescheduleIntent('delivery'),
  ]))
  check(r.totalIntents === 2, 'two-delivery: totalIntents 2')
  check(r.pickupCount === 0, 'two-delivery: pickupCount 0')
  check(r.deliveryCount === 2, 'two-delivery: deliveryCount 2')
}

// 6. Mixed: 2 delivery + 1 pickup
{
  const r = projectEcommerceRescheduleIntentFulfilmentBrief(state([
    rescheduleIntent('delivery'),
    rescheduleIntent('pickup'),
    rescheduleIntent('delivery'),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.pickupCount === 1, 'mixed: pickupCount 1')
  check(r.deliveryCount === 2, 'mixed: deliveryCount 2')
  check(r.pickupCount + r.deliveryCount === r.totalIntents, 'mixed: counts sum to total')
}

// 7. All pickup
{
  const r = projectEcommerceRescheduleIntentFulfilmentBrief(state([
    rescheduleIntent('pickup'),
    rescheduleIntent('pickup'),
    rescheduleIntent('pickup'),
  ]))
  check(r.totalIntents === 3, 'all-pickup: totalIntents 3')
  check(r.pickupCount === 3, 'all-pickup: pickupCount 3')
  check(r.deliveryCount === 0, 'all-pickup: deliveryCount 0')
  check(r.pickupCount + r.deliveryCount === r.totalIntents, 'all-pickup: counts sum to total')
}

console.log(`ecommerce-reschedule-intent-fulfilment-brief: ${checks} checks passed`)
