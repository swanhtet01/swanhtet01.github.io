import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentFromFulfilmentBrief } from './ecommerce-amendment-intent-from-fulfilment-brief.ts'`,
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

const { projectEcommerceAmendmentIntentFromFulfilmentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(fromFulfilment = 'pickup') {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `EAM-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 15000,
    replacementRequestId: `REP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    lineChanges: [],
    fromFulfilment,
    toFulfilment: 'delivery',
    reason: 'Amendment reason',
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(amendmentIntents = []) {
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
    amendmentIntents,
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.pickupCount === 0, 'empty: pickupCount 0')
  check(r.deliveryCount === 0, 'empty: deliveryCount 0')
}

// 2. Single pickup
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentBrief(state([amendmentIntent('pickup')]))
  check(r.totalIntents === 1, 'single-pickup: totalIntents 1')
  check(r.pickupCount === 1, 'single-pickup: pickupCount 1')
  check(r.deliveryCount === 0, 'single-pickup: deliveryCount 0')
}

// 3. Single delivery
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentBrief(state([amendmentIntent('delivery')]))
  check(r.totalIntents === 1, 'single-delivery: totalIntents 1')
  check(r.pickupCount === 0, 'single-delivery: pickupCount 0')
  check(r.deliveryCount === 1, 'single-delivery: deliveryCount 1')
}

// 4. Two pickup
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentBrief(state([
    amendmentIntent('pickup'),
    amendmentIntent('pickup'),
  ]))
  check(r.totalIntents === 2, 'two-pickup: totalIntents 2')
  check(r.pickupCount === 2, 'two-pickup: pickupCount 2')
  check(r.deliveryCount === 0, 'two-pickup: deliveryCount 0')
}

// 5. Two delivery
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentBrief(state([
    amendmentIntent('delivery'),
    amendmentIntent('delivery'),
  ]))
  check(r.totalIntents === 2, 'two-delivery: totalIntents 2')
  check(r.pickupCount === 0, 'two-delivery: pickupCount 0')
  check(r.deliveryCount === 2, 'two-delivery: deliveryCount 2')
}

// 6. Mixed: 2 pickup + 1 delivery
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentBrief(state([
    amendmentIntent('pickup'),
    amendmentIntent('delivery'),
    amendmentIntent('pickup'),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.pickupCount === 2, 'mixed: pickupCount 2')
  check(r.deliveryCount === 1, 'mixed: deliveryCount 1')
  check(r.pickupCount + r.deliveryCount === r.totalIntents, 'mixed: counts sum to total')
}

// 7. All delivery
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentBrief(state([
    amendmentIntent('delivery'),
    amendmentIntent('delivery'),
    amendmentIntent('delivery'),
  ]))
  check(r.totalIntents === 3, 'all-delivery: totalIntents 3')
  check(r.pickupCount === 0, 'all-delivery: pickupCount 0')
  check(r.deliveryCount === 3, 'all-delivery: deliveryCount 3')
  check(r.pickupCount + r.deliveryCount === r.totalIntents, 'all-delivery: counts sum to total')
}

console.log(`ecommerce-amendment-intent-from-fulfilment-brief: ${checks} checks passed`)
