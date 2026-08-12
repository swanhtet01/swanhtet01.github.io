import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentCustomerMessageOrderCancelledBrief } from './ecommerce-cancellation-intent-customer-message-order-cancelled-brief.ts'`,
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

const { projectEcommerceCancellationIntentCustomerMessageOrderCancelledBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(customerMessageSent = false, orderCancelled = false) {
  intentId++
  return {
    schema: 'supermega.ecommerce.cancellation_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 10000,
    reasonCode: 'changed_mind',
    reason: 'Cancellation reason',
    customerMessageSent,
    orderCancelled,
    refundStarted: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(cancellationIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents,
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderCancelledBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + cancelled
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderCancelledBrief(state([
    cancellationIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'msg-cancelled: totalIntents 1')
  check(r.messageSentCancelledCount === 1, 'msg-cancelled: messageSentCancelledCount 1')
  check(r.messageSentNotCancelledCount === 0, 'msg-cancelled: messageSentNotCancelledCount 0')
  check(r.noMessageCancelledCount === 0, 'msg-cancelled: noMessageCancelledCount 0')
}

// 3. Message sent + not cancelled
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderCancelledBrief(state([
    cancellationIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'msg-notcancelled: totalIntents 1')
  check(r.messageSentNotCancelledCount === 1, 'msg-notcancelled: messageSentNotCancelledCount 1')
  check(r.messageSentCancelledCount === 0, 'msg-notcancelled: messageSentCancelledCount 0')
  check(r.noMessageNotCancelledCount === 0, 'msg-notcancelled: noMessageNotCancelledCount 0')
}

// 4. No message + cancelled
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderCancelledBrief(state([
    cancellationIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'nomsg-cancelled: totalIntents 1')
  check(r.noMessageCancelledCount === 1, 'nomsg-cancelled: noMessageCancelledCount 1')
  check(r.messageSentCancelledCount === 0, 'nomsg-cancelled: messageSentCancelledCount 0')
}

// 5. No message + not cancelled
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderCancelledBrief(state([
    cancellationIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'nomsg-notcancelled: totalIntents 1')
  check(r.noMessageNotCancelledCount === 1, 'nomsg-notcancelled: noMessageNotCancelledCount 1')
  check(r.messageSentNotCancelledCount === 0, 'nomsg-notcancelled: messageSentNotCancelledCount 0')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderCancelledBrief(state([
    cancellationIntent(true, true),
    cancellationIntent(true, false),
    cancellationIntent(false, true),
    cancellationIntent(false, false),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.messageSentCancelledCount === 1, 'all-cells: messageSentCancelledCount 1')
  check(r.noMessageCancelledCount === 1, 'all-cells: noMessageCancelledCount 1')
  check(r.messageSentCount === 2, 'all-cells: messageSentCount 2')
}

// 7. Row totals for case 6
{
  const r = projectEcommerceCancellationIntentCustomerMessageOrderCancelledBrief(state([
    cancellationIntent(true, true),
    cancellationIntent(true, false),
    cancellationIntent(false, true),
    cancellationIntent(false, false),
  ]))
  check(r.noMessageNotCancelledCount === 1, 'row-totals: noMessageNotCancelledCount 1')
  check(r.noMessageCount === 2, 'row-totals: noMessageCount 2')
}

console.log(`ecommerce-cancellation-intent-customer-message-order-cancelled-brief: ${checks} checks passed`)
