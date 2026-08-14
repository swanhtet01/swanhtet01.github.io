import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentCustomerMessageFulfilmentBrief } from './ecommerce-reschedule-intent-customer-message-fulfilment-brief.ts'`,
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

const { projectEcommerceRescheduleIntentCustomerMessageFulfilmentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function rescheduleIntent(customerMessageSent = false, fulfilment = 'delivery') {
  intentId++
  return {
    schema: 'supermega.ecommerce.reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ERI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    fulfilment,
    originalPromisedAt: '2026-08-05T10:00:00Z',
    requestedPromisedAt: '2026-08-07T10:00:00Z',
    reason: 'Reschedule reason',
    customerMessageSent,
    replacementRequestId: null,
    originalTotalMmk: 10000,
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
  const r = projectEcommerceRescheduleIntentCustomerMessageFulfilmentBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + delivery
{
  const r = projectEcommerceRescheduleIntentCustomerMessageFulfilmentBrief(state([
    rescheduleIntent(true, 'delivery'),
  ]))
  check(r.totalIntents === 1, 'msg-delivery: totalIntents 1')
  check(r.messageSentDeliveryCount === 1, 'msg-delivery: messageSentDeliveryCount 1')
  check(r.messageSentPickupCount === 0, 'msg-delivery: messageSentPickupCount 0')
  check(r.messageSentCount === 1, 'msg-delivery: messageSentCount 1')
}

// 3. Message sent + pickup
{
  const r = projectEcommerceRescheduleIntentCustomerMessageFulfilmentBrief(state([
    rescheduleIntent(true, 'pickup'),
  ]))
  check(r.totalIntents === 1, 'msg-pickup: totalIntents 1')
  check(r.messageSentPickupCount === 1, 'msg-pickup: messageSentPickupCount 1')
  check(r.messageSentDeliveryCount === 0, 'msg-pickup: messageSentDeliveryCount 0')
  check(r.messageSentCount === 1, 'msg-pickup: messageSentCount 1')
}

// 4. No message + delivery
{
  const r = projectEcommerceRescheduleIntentCustomerMessageFulfilmentBrief(state([
    rescheduleIntent(false, 'delivery'),
  ]))
  check(r.totalIntents === 1, 'nomsg-delivery: totalIntents 1')
  check(r.noMessageDeliveryCount === 1, 'nomsg-delivery: noMessageDeliveryCount 1')
  check(r.noMessageCount === 1, 'nomsg-delivery: noMessageCount 1')
}

// 5. No message + pickup
{
  const r = projectEcommerceRescheduleIntentCustomerMessageFulfilmentBrief(state([
    rescheduleIntent(false, 'pickup'),
  ]))
  check(r.totalIntents === 1, 'nomsg-pickup: totalIntents 1')
  check(r.noMessagePickupCount === 1, 'nomsg-pickup: noMessagePickupCount 1')
  check(r.noMessageCount === 1, 'nomsg-pickup: noMessageCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceRescheduleIntentCustomerMessageFulfilmentBrief(state([
    rescheduleIntent(true, 'delivery'),
    rescheduleIntent(true, 'pickup'),
    rescheduleIntent(false, 'delivery'),
    rescheduleIntent(false, 'pickup'),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.messageSentDeliveryCount === 1, 'all-cells: messageSentDeliveryCount 1')
  check(r.noMessagePickupCount === 1, 'all-cells: noMessagePickupCount 1')
  check(r.messageSentCount === 2, 'all-cells: messageSentCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceRescheduleIntentCustomerMessageFulfilmentBrief(state([
    rescheduleIntent(true, 'delivery'),
    rescheduleIntent(true, 'pickup'),
    rescheduleIntent(false, 'delivery'),
    rescheduleIntent(false, 'pickup'),
  ]))
  check(r.noMessageCount === 2, 'row-totals: noMessageCount 2')
  check(r.messageSentPickupCount === 1, 'row-totals: messageSentPickupCount 1')
}

console.log(`ecommerce-reschedule-intent-customer-message-fulfilment-brief: ${checks} checks passed`)
