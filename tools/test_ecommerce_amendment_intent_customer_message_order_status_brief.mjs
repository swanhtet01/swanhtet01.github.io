import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentCustomerMessageOrderStatusBrief } from './ecommerce-amendment-intent-customer-message-order-status-brief.ts'`,
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

const { projectEcommerceAmendmentIntentCustomerMessageOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(customerMessageSent = false, orderStatus = 'confirmed') {
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
    toFulfilment: 'pickup',
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
  const r = projectEcommerceAmendmentIntentCustomerMessageOrderStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentConfirmedCount === 0, 'empty: messageSentConfirmedCount 0')
  check(r.noMessageReadyCount === 0, 'empty: noMessageReadyCount 0')
}

// 2. Message sent + confirmed
{
  const r = projectEcommerceAmendmentIntentCustomerMessageOrderStatusBrief(state([
    amendmentIntent(true, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'msg-confirmed: totalIntents 1')
  check(r.messageSentConfirmedCount === 1, 'msg-confirmed: messageSentConfirmedCount 1')
  check(r.messageSentPreparingCount === 0, 'msg-confirmed: messageSentPreparingCount 0')
  check(r.noMessageConfirmedCount === 0, 'msg-confirmed: noMessageConfirmedCount 0')
}

// 3. Message sent + preparing
{
  const r = projectEcommerceAmendmentIntentCustomerMessageOrderStatusBrief(state([
    amendmentIntent(true, 'preparing'),
  ]))
  check(r.totalIntents === 1, 'msg-preparing: totalIntents 1')
  check(r.messageSentPreparingCount === 1, 'msg-preparing: messageSentPreparingCount 1')
  check(r.messageSentConfirmedCount === 0, 'msg-preparing: messageSentConfirmedCount 0')
  check(r.noMessagePreparingCount === 0, 'msg-preparing: noMessagePreparingCount 0')
}

// 4. No message + confirmed
{
  const r = projectEcommerceAmendmentIntentCustomerMessageOrderStatusBrief(state([
    amendmentIntent(false, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'nomsg-confirmed: totalIntents 1')
  check(r.noMessageConfirmedCount === 1, 'nomsg-confirmed: noMessageConfirmedCount 1')
  check(r.messageSentConfirmedCount === 0, 'nomsg-confirmed: messageSentConfirmedCount 0')
}

// 5. No message + preparing
{
  const r = projectEcommerceAmendmentIntentCustomerMessageOrderStatusBrief(state([
    amendmentIntent(false, 'preparing'),
  ]))
  check(r.totalIntents === 1, 'nomsg-preparing: totalIntents 1')
  check(r.noMessagePreparingCount === 1, 'nomsg-preparing: noMessagePreparingCount 1')
  check(r.messageSentPreparingCount === 0, 'nomsg-preparing: messageSentPreparingCount 0')
}

// 6. All 6 cells
{
  const r = projectEcommerceAmendmentIntentCustomerMessageOrderStatusBrief(state([
    amendmentIntent(true, 'confirmed'),
    amendmentIntent(true, 'preparing'),
    amendmentIntent(true, 'ready'),
    amendmentIntent(false, 'confirmed'),
    amendmentIntent(false, 'preparing'),
    amendmentIntent(false, 'ready'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.messageSentConfirmedCount === 1, 'all-cells: messageSentConfirmedCount 1')
  check(r.noMessageConfirmedCount === 1, 'all-cells: noMessageConfirmedCount 1')
  check(r.messageSentReadyCount === 1, 'all-cells: messageSentReadyCount 1')
}

// 7. Remaining sub-buckets for case 6
{
  const r = projectEcommerceAmendmentIntentCustomerMessageOrderStatusBrief(state([
    amendmentIntent(true, 'confirmed'),
    amendmentIntent(true, 'preparing'),
    amendmentIntent(true, 'ready'),
    amendmentIntent(false, 'confirmed'),
    amendmentIntent(false, 'preparing'),
    amendmentIntent(false, 'ready'),
  ]))
  check(r.noMessagePreparingCount === 1, 'sub-buckets: noMessagePreparingCount 1')
  check(r.noMessageReadyCount === 1, 'sub-buckets: noMessageReadyCount 1')
}

console.log(`ecommerce-amendment-intent-customer-message-order-status-brief: ${checks} checks passed`)
