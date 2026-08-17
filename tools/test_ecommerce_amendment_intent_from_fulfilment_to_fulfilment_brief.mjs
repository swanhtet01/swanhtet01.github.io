import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief } from './ecommerce-amendment-intent-from-fulfilment-to-fulfilment-brief.ts'`,
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

const { projectEcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(fromFulfilment = 'delivery', toFulfilment = 'delivery') {
  intentId++
  return {
    schema: 'supermega.ecommerce.amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `EAI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    fromFulfilment,
    toFulfilment,
    lineChanges: [{ sku: 'SKU-1', fromQuantity: 1, toQuantity: 2 }],
    originalTotalMmk: 10000,
    reason: 'Reason',
    customerMessageSent: false,
    replacementRequestId: null,
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
  const r = projectEcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.fromDeliveryCount === 0, 'empty: fromDeliveryCount 0')
  check(r.fromPickupCount === 0, 'empty: fromPickupCount 0')
}

// 2. Delivery to delivery
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief(state([
    amendmentIntent('delivery', 'delivery'),
  ]))
  check(r.totalIntents === 1, 'del-del: totalIntents 1')
  check(r.deliveryToDeliveryCount === 1, 'del-del: deliveryToDeliveryCount 1')
  check(r.deliveryToPickupCount === 0, 'del-del: deliveryToPickupCount 0')
  check(r.pickupToDeliveryCount === 0, 'del-del: pickupToDeliveryCount 0')
}

// 3. Delivery to pickup
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief(state([
    amendmentIntent('delivery', 'pickup'),
  ]))
  check(r.totalIntents === 1, 'del-pick: totalIntents 1')
  check(r.deliveryToPickupCount === 1, 'del-pick: deliveryToPickupCount 1')
  check(r.deliveryToDeliveryCount === 0, 'del-pick: deliveryToDeliveryCount 0')
  check(r.pickupToPickupCount === 0, 'del-pick: pickupToPickupCount 0')
}

// 4. Pickup to delivery
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief(state([
    amendmentIntent('pickup', 'delivery'),
  ]))
  check(r.totalIntents === 1, 'pick-del: totalIntents 1')
  check(r.pickupToDeliveryCount === 1, 'pick-del: pickupToDeliveryCount 1')
  check(r.deliveryToDeliveryCount === 0, 'pick-del: deliveryToDeliveryCount 0')
}

// 5. Pickup to pickup
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief(state([
    amendmentIntent('pickup', 'pickup'),
  ]))
  check(r.totalIntents === 1, 'pick-pick: totalIntents 1')
  check(r.pickupToPickupCount === 1, 'pick-pick: pickupToPickupCount 1')
  check(r.deliveryToPickupCount === 0, 'pick-pick: deliveryToPickupCount 0')
}

// 6. All 4 cells
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief(state([
    amendmentIntent('delivery', 'delivery'),
    amendmentIntent('delivery', 'pickup'),
    amendmentIntent('pickup', 'delivery'),
    amendmentIntent('pickup', 'pickup'),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.deliveryToDeliveryCount === 1, 'all-cells: deliveryToDeliveryCount 1')
  check(r.pickupToDeliveryCount === 1, 'all-cells: pickupToDeliveryCount 1')
  check(r.fromDeliveryCount === 2, 'all-cells: fromDeliveryCount 2')
}

// 7. Row totals for case 6
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief(state([
    amendmentIntent('delivery', 'delivery'),
    amendmentIntent('delivery', 'pickup'),
    amendmentIntent('pickup', 'delivery'),
    amendmentIntent('pickup', 'pickup'),
  ]))
  check(r.pickupToPickupCount === 1, 'row-totals: pickupToPickupCount 1')
  check(r.fromPickupCount === 2, 'row-totals: fromPickupCount 2')
}

console.log(`ecommerce-amendment-intent-from-fulfilment-to-fulfilment-brief: ${checks} checks passed`)
