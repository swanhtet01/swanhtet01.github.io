import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief } from './ecommerce-amendment-intent-from-fulfilment-order-status-brief.ts'`,
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

const { projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(fromFulfilment = 'delivery', orderStatus = 'confirmed') {
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
    fromFulfilment,
    toFulfilment: 'delivery',
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
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.deliveryConfirmedCount === 0, 'empty: deliveryConfirmedCount 0')
  check(r.pickupConfirmedCount === 0, 'empty: pickupConfirmedCount 0')
}

// 2. Delivery + confirmed
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'delivery-confirmed: totalIntents 1')
  check(r.deliveryConfirmedCount === 1, 'delivery-confirmed: deliveryConfirmedCount 1')
  check(r.deliveryPreparingCount === 0, 'delivery-confirmed: deliveryPreparingCount 0')
  check(r.pickupConfirmedCount === 0, 'delivery-confirmed: pickupConfirmedCount 0')
}

// 3. Delivery + preparing
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'preparing'),
  ]))
  check(r.totalIntents === 1, 'delivery-preparing: totalIntents 1')
  check(r.deliveryPreparingCount === 1, 'delivery-preparing: deliveryPreparingCount 1')
  check(r.deliveryReadyCount === 0, 'delivery-preparing: deliveryReadyCount 0')
  check(r.deliveryConfirmedCount === 0, 'delivery-preparing: deliveryConfirmedCount 0')
}

// 4. Delivery + ready
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'ready'),
  ]))
  check(r.totalIntents === 1, 'delivery-ready: totalIntents 1')
  check(r.deliveryReadyCount === 1, 'delivery-ready: deliveryReadyCount 1')
  check(r.pickupReadyCount === 0, 'delivery-ready: pickupReadyCount 0')
}

// 5. Pickup + confirmed
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('pickup', 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'pickup-confirmed: totalIntents 1')
  check(r.pickupConfirmedCount === 1, 'pickup-confirmed: pickupConfirmedCount 1')
  check(r.deliveryConfirmedCount === 0, 'pickup-confirmed: deliveryConfirmedCount 0')
}

// 6. Mixed: 2 delivery+confirmed, 1 pickup+preparing, 1 pickup+ready
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'confirmed'),
    amendmentIntent('delivery', 'confirmed'),
    amendmentIntent('pickup', 'preparing'),
    amendmentIntent('pickup', 'ready'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.deliveryConfirmedCount === 2, 'mixed: deliveryConfirmedCount 2')
  check(r.pickupPreparingCount === 1, 'mixed: pickupPreparingCount 1')
  check(r.pickupReadyCount === 1, 'mixed: pickupReadyCount 1')
}

// 7. All pickup + preparing
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('pickup', 'preparing'),
    amendmentIntent('pickup', 'preparing'),
    amendmentIntent('pickup', 'preparing'),
  ]))
  check(r.totalIntents === 3, 'all-pickup-preparing: totalIntents 3')
  check(r.pickupPreparingCount === 3, 'all-pickup-preparing: pickupPreparingCount 3')
}

console.log(`ecommerce-amendment-intent-from-fulfilment-order-status-brief: ${checks} checks passed`)
