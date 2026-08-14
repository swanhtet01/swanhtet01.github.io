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
  check(r.toDeliveryConfirmedCount === 0, 'empty: toDeliveryConfirmedCount 0')
  check(r.toPickupConfirmedCount === 0, 'empty: toPickupConfirmedCount 0')
}

// 2. To delivery + confirmed
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'todelivery-confirmed: totalIntents 1')
  check(r.toDeliveryConfirmedCount === 1, 'todelivery-confirmed: toDeliveryConfirmedCount 1')
  check(r.toDeliveryPreparingCount === 0, 'todelivery-confirmed: toDeliveryPreparingCount 0')
  check(r.toPickupConfirmedCount === 0, 'todelivery-confirmed: toPickupConfirmedCount 0')
}

// 3. To delivery + preparing
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'preparing'),
  ]))
  check(r.totalIntents === 1, 'todelivery-preparing: totalIntents 1')
  check(r.toDeliveryPreparingCount === 1, 'todelivery-preparing: toDeliveryPreparingCount 1')
  check(r.toDeliveryReadyCount === 0, 'todelivery-preparing: toDeliveryReadyCount 0')
  check(r.toDeliveryConfirmedCount === 0, 'todelivery-preparing: toDeliveryConfirmedCount 0')
}

// 4. To delivery + ready
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'ready'),
  ]))
  check(r.totalIntents === 1, 'todelivery-ready: totalIntents 1')
  check(r.toDeliveryReadyCount === 1, 'todelivery-ready: toDeliveryReadyCount 1')
  check(r.toPickupReadyCount === 0, 'todelivery-ready: toPickupReadyCount 0')
}

// 5. To pickup + confirmed
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('pickup', 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'topickup-confirmed: totalIntents 1')
  check(r.toPickupConfirmedCount === 1, 'topickup-confirmed: toPickupConfirmedCount 1')
  check(r.toDeliveryConfirmedCount === 0, 'topickup-confirmed: toDeliveryConfirmedCount 0')
}

// 6. Mixed: 2 toDelivery+confirmed, 1 toPickup+preparing, 1 toPickup+ready
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'confirmed'),
    amendmentIntent('delivery', 'confirmed'),
    amendmentIntent('pickup', 'preparing'),
    amendmentIntent('pickup', 'ready'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.toDeliveryConfirmedCount === 2, 'mixed: toDeliveryConfirmedCount 2')
  check(r.toPickupPreparingCount === 1, 'mixed: toPickupPreparingCount 1')
  check(r.toPickupReadyCount === 1, 'mixed: toPickupReadyCount 1')
}

// 7. All toPickup + preparing
{
  const r = projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(state([
    amendmentIntent('pickup', 'preparing'),
    amendmentIntent('pickup', 'preparing'),
    amendmentIntent('pickup', 'preparing'),
  ]))
  check(r.totalIntents === 3, 'all-topickup-preparing: totalIntents 3')
  check(r.toPickupPreparingCount === 3, 'all-topickup-preparing: toPickupPreparingCount 3')
}

console.log(`ecommerce-amendment-intent-to-fulfilment-order-status-brief: ${checks} checks passed`)
