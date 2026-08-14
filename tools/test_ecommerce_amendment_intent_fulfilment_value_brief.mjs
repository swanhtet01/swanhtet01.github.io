// Ecommerce amendment intent fulfilment switch + original value brief.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentFulfilmentValueBrief } from './ecommerce-amendment-intent-fulfilment-value-brief.ts'`,
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

const { projectEcommerceAmendmentIntentFulfilmentValueBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent({ fromFulfilment = 'pickup', toFulfilment = 'pickup', originalTotalMmk = 5000 } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `AMI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk,
    replacementRequestId: `RPL-${intentId}`,
    replacementRequestDigest: `rpd-${intentId}`,
    lineChanges: [],
    fromFulfilment,
    toFulfilment,
    reason: 'Customer request',
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(amendmentIntents) {
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
  const r = projectEcommerceAmendmentIntentFulfilmentValueBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.pickupToPickupCount === 0, 'empty: p2p 0')
  check(r.deliveryToPickupCount === 0, 'empty: d2p 0')
  check(r.minOriginalValueMmk === null, 'empty: min null')
  check(r.maxOriginalValueMmk === null, 'empty: max null')
  check(r.averageOriginalValueMmk === 0, 'empty: avg 0')
}

// 2. All pickup-to-pickup
{
  const r = projectEcommerceAmendmentIntentFulfilmentValueBrief(
    state([amendmentIntent({ fromFulfilment: 'pickup', toFulfilment: 'pickup' })]),
  )
  check(r.pickupToPickupCount === 1, 'p2p: count 1')
  check(r.pickupToPickupRate === 100, 'p2p: rate 100')
  check(r.deliveryToPickupRate === 0, 'd2p: rate 0')
}

// 3. All delivery-to-delivery
{
  const r = projectEcommerceAmendmentIntentFulfilmentValueBrief(
    state([amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'delivery' })]),
  )
  check(r.deliveryToDeliveryCount === 1, 'd2d: count 1')
  check(r.deliveryToDeliveryRate === 100, 'd2d: rate 100')
}

// 4. pickup-to-delivery switch
{
  const r = projectEcommerceAmendmentIntentFulfilmentValueBrief(
    state([amendmentIntent({ fromFulfilment: 'pickup', toFulfilment: 'delivery' })]),
  )
  check(r.pickupToDeliveryCount === 1, 'p2d: count 1')
  check(r.pickupToDeliveryRate === 100, 'p2d: rate 100')
}

// 5. delivery-to-pickup switch (backing out of delivery)
{
  const r = projectEcommerceAmendmentIntentFulfilmentValueBrief(
    state([amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'pickup' })]),
  )
  check(r.deliveryToPickupCount === 1, 'd2p: count 1')
  check(r.deliveryToPickupRate === 100, 'd2p: rate 100')
}

// 6. All 4 combos (1 each)
{
  const r = projectEcommerceAmendmentIntentFulfilmentValueBrief(
    state([
      amendmentIntent({ fromFulfilment: 'pickup', toFulfilment: 'pickup' }),
      amendmentIntent({ fromFulfilment: 'pickup', toFulfilment: 'delivery' }),
      amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'pickup' }),
      amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'delivery' }),
    ]),
  )
  check(r.totalIntents === 4, 'all-4: totalIntents 4')
  check(r.pickupToPickupCount === 1, 'all-4: p2p 1')
  check(r.pickupToDeliveryCount === 1, 'all-4: p2d 1')
  check(r.deliveryToPickupCount === 1, 'all-4: d2p 1')
  check(r.deliveryToDeliveryCount === 1, 'all-4: d2d 1')
  check(r.pickupToPickupRate === 25, 'all-4: p2p rate 25')
}

// 7. Counts sum to total invariant
{
  const r = projectEcommerceAmendmentIntentFulfilmentValueBrief(
    state([
      amendmentIntent({ fromFulfilment: 'pickup', toFulfilment: 'delivery' }),
      amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'pickup' }),
      amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'pickup' }),
    ]),
  )
  check(
    r.pickupToPickupCount + r.pickupToDeliveryCount + r.deliveryToPickupCount + r.deliveryToDeliveryCount === r.totalIntents,
    'invariant: counts sum to total',
  )
  check(r.deliveryToPickupRate === 67, 'sum: d2p rate 67')
}

// 8. Value min/max/avg
{
  const r = projectEcommerceAmendmentIntentFulfilmentValueBrief(
    state([
      amendmentIntent({ originalTotalMmk: 2000 }),
      amendmentIntent({ originalTotalMmk: 8000 }),
      amendmentIntent({ originalTotalMmk: 5000 }),
    ]),
  )
  check(r.minOriginalValueMmk === 2000, 'value: min 2000')
  check(r.maxOriginalValueMmk === 8000, 'value: max 8000')
  check(r.totalOriginalValueMmk === 15000, 'value: total 15000')
  check(r.averageOriginalValueMmk === 5000, 'value: avg 5000')
}

// 9. Avg rounding: (1000 + 2000 + 2000) / 3 = 1667
{
  const r = projectEcommerceAmendmentIntentFulfilmentValueBrief(
    state([
      amendmentIntent({ originalTotalMmk: 1000 }),
      amendmentIntent({ originalTotalMmk: 2000 }),
      amendmentIntent({ originalTotalMmk: 2000 }),
    ]),
  )
  check(r.averageOriginalValueMmk === 1667, 'round: avg 1667')
}

console.log(JSON.stringify({ ok: true, checks }))
