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
  check(r.fromDeliveryConfirmedCount === 0, 'empty: fromDeliveryConfirmedCount 0')
  check(r.fromPickupReadyCount === 0, 'empty: fromPickupReadyCount 0')
}

// 2. From delivery + confirmed
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'delivery-confirmed: totalIntents 1')
  check(r.fromDeliveryConfirmedCount === 1, 'delivery-confirmed: fromDeliveryConfirmedCount 1')
  check(r.fromDeliveryPreparingCount === 0, 'delivery-confirmed: fromDeliveryPreparingCount 0')
  check(r.fromPickupConfirmedCount === 0, 'delivery-confirmed: fromPickupConfirmedCount 0')
}

// 3. From pickup + preparing
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('pickup', 'preparing'),
  ]))
  check(r.fromPickupPreparingCount === 1, 'pickup-preparing: fromPickupPreparingCount 1')
  check(r.fromPickupConfirmedCount === 0, 'pickup-preparing: fromPickupConfirmedCount 0')
  check(r.totalIntents === 1, 'pickup-preparing: totalIntents 1')
  check(r.fromDeliveryPreparingCount === 0, 'pickup-preparing: fromDeliveryPreparingCount 0')
}

// 4. From delivery + ready
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'ready'),
  ]))
  check(r.fromDeliveryReadyCount === 1, 'delivery-ready: fromDeliveryReadyCount 1')
  check(r.fromDeliveryConfirmedCount === 0, 'delivery-ready: fromDeliveryConfirmedCount 0')
  check(r.totalIntents === 1, 'delivery-ready: totalIntents 1')
}

// 5. From pickup + confirmed
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('pickup', 'confirmed'),
  ]))
  check(r.fromPickupConfirmedCount === 1, 'pickup-confirmed: fromPickupConfirmedCount 1')
  check(r.fromPickupPreparingCount === 0, 'pickup-confirmed: fromPickupPreparingCount 0')
  check(r.totalIntents === 1, 'pickup-confirmed: totalIntents 1')
}

// 6. All 6 cells
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'confirmed'),
    amendmentIntent('delivery', 'preparing'),
    amendmentIntent('delivery', 'ready'),
    amendmentIntent('pickup', 'confirmed'),
    amendmentIntent('pickup', 'preparing'),
    amendmentIntent('pickup', 'ready'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.fromDeliveryConfirmedCount === 1, 'all-cells: fromDeliveryConfirmedCount 1')
  check(r.fromPickupPreparingCount === 1, 'all-cells: fromPickupPreparingCount 1')
  check(r.fromDeliveryReadyCount === 1, 'all-cells: fromDeliveryReadyCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(state([
    amendmentIntent('delivery', 'confirmed'),
    amendmentIntent('delivery', 'preparing'),
    amendmentIntent('delivery', 'ready'),
    amendmentIntent('pickup', 'confirmed'),
    amendmentIntent('pickup', 'preparing'),
    amendmentIntent('pickup', 'ready'),
  ]))
  check(r.fromDeliveryPreparingCount === 1, 'sub-buckets: fromDeliveryPreparingCount 1')
  check(r.fromPickupReadyCount === 1, 'sub-buckets: fromPickupReadyCount 1')
}

console.log(`ecommerce-amendment-intent-from-fulfilment-order-status-brief: ${checks} checks passed`)
