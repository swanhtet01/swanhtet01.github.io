import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief } from './ecommerce-amendment-intent-to-fulfilment-order-status-brief.ts'`,
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

const { projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(toFulfilment = 'delivery', orderStatus = 'confirmed') {
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
    orderStatus,
    paymentStatus: 'pending',
    fromFulfilment: 'delivery',
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
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.deliveryConfirmedCount === 0, 'empty: deliveryConfirmedCount 0')
  check(r.pickupReadyCount === 0, 'empty: pickupReadyCount 0')
}

// 2. Delivery + confirmed
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'delivery-confirmed: totalIntents 1')
  check(r.deliveryConfirmedCount === 1, 'delivery-confirmed: deliveryConfirmedCount 1')
  check(r.deliveryPreparingCount === 0, 'delivery-confirmed: deliveryPreparingCount 0')
  check(r.pickupConfirmedCount === 0, 'delivery-confirmed: pickupConfirmedCount 0')
}

// 3. Pickup + preparing
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('pickup', 'preparing'),
  ]))
  check(r.pickupPreparingCount === 1, 'pickup-preparing: pickupPreparingCount 1')
  check(r.pickupConfirmedCount === 0, 'pickup-preparing: pickupConfirmedCount 0')
  check(r.totalIntents === 1, 'pickup-preparing: totalIntents 1')
  check(r.deliveryPreparingCount === 0, 'pickup-preparing: deliveryPreparingCount 0')
}

// 4. Delivery + ready
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'ready'),
  ]))
  check(r.deliveryReadyCount === 1, 'delivery-ready: deliveryReadyCount 1')
  check(r.deliveryConfirmedCount === 0, 'delivery-ready: deliveryConfirmedCount 0')
  check(r.totalIntents === 1, 'delivery-ready: totalIntents 1')
}

// 5. Pickup + confirmed
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('pickup', 'confirmed'),
  ]))
  check(r.pickupConfirmedCount === 1, 'pickup-confirmed: pickupConfirmedCount 1')
  check(r.pickupPreparingCount === 0, 'pickup-confirmed: pickupPreparingCount 0')
  check(r.totalIntents === 1, 'pickup-confirmed: totalIntents 1')
}

// 6. All 6 cells
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'confirmed'),
    amendmentIntent('delivery', 'preparing'),
    amendmentIntent('delivery', 'ready'),
    amendmentIntent('pickup', 'confirmed'),
    amendmentIntent('pickup', 'preparing'),
    amendmentIntent('pickup', 'ready'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.deliveryConfirmedCount === 1, 'all-cells: deliveryConfirmedCount 1')
  check(r.pickupPreparingCount === 1, 'all-cells: pickupPreparingCount 1')
  check(r.deliveryReadyCount === 1, 'all-cells: deliveryReadyCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'confirmed'),
    amendmentIntent('delivery', 'preparing'),
    amendmentIntent('delivery', 'ready'),
    amendmentIntent('pickup', 'confirmed'),
    amendmentIntent('pickup', 'preparing'),
    amendmentIntent('pickup', 'ready'),
  ]))
  check(r.deliveryPreparingCount === 1, 'sub-buckets: deliveryPreparingCount 1')
  check(r.pickupReadyCount === 1, 'sub-buckets: pickupReadyCount 1')
}

console.log(`ecommerce-amendment-intent-to-fulfilment-order-status-brief: ${checks} checks passed`)
