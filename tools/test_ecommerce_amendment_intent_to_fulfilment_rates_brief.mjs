import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentToFulfilmentRatesBrief } from './ecommerce-amendment-intent-to-fulfilment-rates-brief.ts'`,
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

const { projectEcommerceAmendmentIntentToFulfilmentRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent({ toFulfilment = 'delivery' } = {}) {
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
    fromFulfilment: 'pickup',
    toFulfilment,
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceAmendmentIntentToFulfilmentRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.deliveryCount === 0, 'empty:deliveryCount')
  check(r.deliveryRate === 0, 'empty:deliveryRate')
  check(r.pickupCount === 0, 'empty:pickupCount')
  check(r.pickupRate === 0, 'empty:pickupRate')
}

// 2. Single to-delivery — 3 checks
{
  const r = projectEcommerceAmendmentIntentToFulfilmentRatesBrief(state([amendmentIntent()]))
  check(r.totalIntents === 1, 'delivery:total')
  check(r.deliveryCount === 1, 'delivery:count')
  check(r.deliveryRate === 1, 'delivery:rate')
}

// 3. Single to-pickup — 3 checks
{
  const r = projectEcommerceAmendmentIntentToFulfilmentRatesBrief(state([
    amendmentIntent({ toFulfilment: 'pickup' }),
  ]))
  check(r.totalIntents === 1, 'pickup:total')
  check(r.pickupCount === 1, 'pickup:count')
  check(r.pickupRate === 1, 'pickup:rate')
}

// 4. 2 to-delivery — 3 checks
{
  const r = projectEcommerceAmendmentIntentToFulfilmentRatesBrief(state([
    amendmentIntent(),
    amendmentIntent(),
  ]))
  check(r.deliveryCount === 2, 'twoDelivery:count')
  check(r.pickupCount === 0, 'twoDelivery:pickupCount')
  check(r.deliveryRate === 1, 'twoDelivery:rate')
}

// 5. 2 to-pickup — 2 checks
{
  const r = projectEcommerceAmendmentIntentToFulfilmentRatesBrief(state([
    amendmentIntent({ toFulfilment: 'pickup' }),
    amendmentIntent({ toFulfilment: 'pickup' }),
  ]))
  check(r.pickupCount === 2, 'twoPickup:count')
  check(r.deliveryCount === 0, 'twoPickup:deliveryCount')
}

// 6. 1 delivery + 1 pickup — 3 checks
{
  const r = projectEcommerceAmendmentIntentToFulfilmentRatesBrief(state([
    amendmentIntent(),
    amendmentIntent({ toFulfilment: 'pickup' }),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.deliveryRate === 0.5, 'half:deliveryRate')
  check(r.pickupRate === 0.5, 'half:pickupRate')
}

// 7. Precision: 1 delivery + 2 pickup (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceAmendmentIntentToFulfilmentRatesBrief(state([
    amendmentIntent(),
    amendmentIntent({ toFulfilment: 'pickup' }),
    amendmentIntent({ toFulfilment: 'pickup' }),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.deliveryCount === 1, 'precision:deliveryCount')
  check(r.deliveryRate === 0.3333, 'precision:deliveryRate')
  check(r.pickupRate === 0.6667, 'precision:pickupRate')
}

console.log(`ecommerce-amendment-intent-to-fulfilment-rates-brief: ${checks} checks passed`)
