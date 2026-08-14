import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentCustomerMessageOrderStatusBrief } from './ecommerce-reschedule-intent-customer-message-order-status-brief.ts'`,
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

const { projectEcommerceRescheduleIntentCustomerMessageOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function rescheduleIntent(customerMessageSent = false, orderStatus = 'confirmed') {
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
    orderStatus,
    paymentStatus: 'pending',
    fulfilment: 'delivery',
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
  const r = projectEcommerceRescheduleIntentCustomerMessageOrderStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentConfirmedCount === 0, 'empty: messageSentConfirmedCount 0')
  check(r.noMessageConfirmedCount === 0, 'empty: noMessageConfirmedCount 0')
}

// 2. Message sent + confirmed
{
  const r = projectEcommerceRescheduleIntentCustomerMessageOrderStatusBrief(state([
    rescheduleIntent(true, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'msg-confirmed: totalIntents 1')
  check(r.messageSentConfirmedCount === 1, 'msg-confirmed: messageSentConfirmedCount 1')
  check(r.messageSentPreparingCount === 0, 'msg-confirmed: messageSentPreparingCount 0')
  check(r.noMessageConfirmedCount === 0, 'msg-confirmed: noMessageConfirmedCount 0')
}

// 3. Message sent + preparing
{
  const r = projectEcommerceRescheduleIntentCustomerMessageOrderStatusBrief(state([
    rescheduleIntent(true, 'preparing'),
  ]))
  check(r.totalIntents === 1, 'msg-preparing: totalIntents 1')
  check(r.messageSentPreparingCount === 1, 'msg-preparing: messageSentPreparingCount 1')
  check(r.messageSentReadyCount === 0, 'msg-preparing: messageSentReadyCount 0')
  check(r.messageSentConfirmedCount === 0, 'msg-preparing: messageSentConfirmedCount 0')
}

// 4. Message sent + ready
{
  const r = projectEcommerceRescheduleIntentCustomerMessageOrderStatusBrief(state([
    rescheduleIntent(true, 'ready'),
  ]))
  check(r.totalIntents === 1, 'msg-ready: totalIntents 1')
  check(r.messageSentReadyCount === 1, 'msg-ready: messageSentReadyCount 1')
  check(r.noMessageReadyCount === 0, 'msg-ready: noMessageReadyCount 0')
}

// 5. No message + confirmed
{
  const r = projectEcommerceRescheduleIntentCustomerMessageOrderStatusBrief(state([
    rescheduleIntent(false, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'nomsg-confirmed: totalIntents 1')
  check(r.noMessageConfirmedCount === 1, 'nomsg-confirmed: noMessageConfirmedCount 1')
  check(r.messageSentConfirmedCount === 0, 'nomsg-confirmed: messageSentConfirmedCount 0')
}

// 6. Mixed: 2 msg+confirmed, 1 msg+ready, 1 noMsg+preparing
{
  const r = projectEcommerceRescheduleIntentCustomerMessageOrderStatusBrief(state([
    rescheduleIntent(true, 'confirmed'),
    rescheduleIntent(true, 'confirmed'),
    rescheduleIntent(true, 'ready'),
    rescheduleIntent(false, 'preparing'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.messageSentConfirmedCount === 2, 'mixed: messageSentConfirmedCount 2')
  check(r.messageSentReadyCount === 1, 'mixed: messageSentReadyCount 1')
  check(r.noMessagePreparingCount === 1, 'mixed: noMessagePreparingCount 1')
}

// 7. Grand total
{
  const r = projectEcommerceRescheduleIntentCustomerMessageOrderStatusBrief(state([
    rescheduleIntent(true, 'confirmed'),
    rescheduleIntent(false, 'ready'),
    rescheduleIntent(false, 'ready'),
  ]))
  check(r.totalIntents === 3, 'grand-total: totalIntents 3')
  check(r.noMessageReadyCount === 2, 'grand-total: noMessageReadyCount 2')
}

console.log(`ecommerce-reschedule-intent-customer-message-order-status-brief: ${checks} checks passed`)
