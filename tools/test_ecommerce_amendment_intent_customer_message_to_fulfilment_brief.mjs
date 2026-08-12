import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentCustomerMessageToFulfilmentBrief } from './ecommerce-amendment-intent-customer-message-to-fulfilment-brief.ts'`,
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

const { projectEcommerceAmendmentIntentCustomerMessageToFulfilmentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(customerMessageSent = false, toFulfilment = 'delivery') {
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
    fromFulfilment: 'delivery',
    toFulfilment,
    lineChanges: [{ sku: 'SKU-1', fromQuantity: 1, toQuantity: 2 }],
    originalTotalMmk: 10000,
    reason: 'Reason',
    customerMessageSent,
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
  const r = projectEcommerceAmendmentIntentCustomerMessageToFulfilmentBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + to delivery
{
  const r = projectEcommerceAmendmentIntentCustomerMessageToFulfilmentBrief(state([
    amendmentIntent(true, 'delivery'),
  ]))
  check(r.totalIntents === 1, 'msg-delivery: totalIntents 1')
  check(r.messageSentDeliveryCount === 1, 'msg-delivery: messageSentDeliveryCount 1')
  check(r.messageSentPickupCount === 0, 'msg-delivery: messageSentPickupCount 0')
  check(r.noMessageDeliveryCount === 0, 'msg-delivery: noMessageDeliveryCount 0')
}

// 3. Message sent + to pickup
{
  const r = projectEcommerceAmendmentIntentCustomerMessageToFulfilmentBrief(state([
    amendmentIntent(true, 'pickup'),
  ]))
  check(r.totalIntents === 1, 'msg-pickup: totalIntents 1')
  check(r.messageSentPickupCount === 1, 'msg-pickup: messageSentPickupCount 1')
  check(r.messageSentDeliveryCount === 0, 'msg-pickup: messageSentDeliveryCount 0')
  check(r.noMessagePickupCount === 0, 'msg-pickup: noMessagePickupCount 0')
}

// 4. No message + to delivery
{
  const r = projectEcommerceAmendmentIntentCustomerMessageToFulfilmentBrief(state([
    amendmentIntent(false, 'delivery'),
  ]))
  check(r.totalIntents === 1, 'nomsg-delivery: totalIntents 1')
  check(r.noMessageDeliveryCount === 1, 'nomsg-delivery: noMessageDeliveryCount 1')
  check(r.messageSentDeliveryCount === 0, 'nomsg-delivery: messageSentDeliveryCount 0')
}

// 5. No message + to pickup
{
  const r = projectEcommerceAmendmentIntentCustomerMessageToFulfilmentBrief(state([
    amendmentIntent(false, 'pickup'),
  ]))
  check(r.totalIntents === 1, 'nomsg-pickup: totalIntents 1')
  check(r.noMessagePickupCount === 1, 'nomsg-pickup: noMessagePickupCount 1')
  check(r.messageSentPickupCount === 0, 'nomsg-pickup: messageSentPickupCount 0')
}

// 6. All 4 cells
{
  const r = projectEcommerceAmendmentIntentCustomerMessageToFulfilmentBrief(state([
    amendmentIntent(true, 'delivery'),
    amendmentIntent(true, 'pickup'),
    amendmentIntent(false, 'delivery'),
    amendmentIntent(false, 'pickup'),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.messageSentDeliveryCount === 1, 'all-cells: messageSentDeliveryCount 1')
  check(r.noMessageDeliveryCount === 1, 'all-cells: noMessageDeliveryCount 1')
  check(r.messageSentCount === 2, 'all-cells: messageSentCount 2')
}

// 7. Row totals for case 6
{
  const r = projectEcommerceAmendmentIntentCustomerMessageToFulfilmentBrief(state([
    amendmentIntent(true, 'delivery'),
    amendmentIntent(true, 'pickup'),
    amendmentIntent(false, 'delivery'),
    amendmentIntent(false, 'pickup'),
  ]))
  check(r.noMessagePickupCount === 1, 'row-totals: noMessagePickupCount 1')
  check(r.noMessageCount === 2, 'row-totals: noMessageCount 2')
}

console.log(`ecommerce-amendment-intent-customer-message-to-fulfilment-brief: ${checks} checks passed`)
