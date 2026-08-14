import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentCustomerMessageRefundStartedBrief } from './ecommerce-cancellation-intent-customer-message-refund-started-brief.ts'`,
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

const { projectEcommerceCancellationIntentCustomerMessageRefundStartedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(customerMessageSent = false, refundStarted = false) {
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
    orderCancelled: false,
    refundStarted,
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
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStartedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + refund started
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStartedBrief(state([
    cancellationIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'msg-refund: totalIntents 1')
  check(r.messageSentRefundStartedCount === 1, 'msg-refund: messageSentRefundStartedCount 1')
  check(r.messageSentNoRefundCount === 0, 'msg-refund: messageSentNoRefundCount 0')
  check(r.noMessageRefundStartedCount === 0, 'msg-refund: noMessageRefundStartedCount 0')
}

// 3. Message sent + no refund
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStartedBrief(state([
    cancellationIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'msg-norefund: totalIntents 1')
  check(r.messageSentNoRefundCount === 1, 'msg-norefund: messageSentNoRefundCount 1')
  check(r.messageSentRefundStartedCount === 0, 'msg-norefund: messageSentRefundStartedCount 0')
  check(r.noMessageNoRefundCount === 0, 'msg-norefund: noMessageNoRefundCount 0')
}

// 4. No message + refund started
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStartedBrief(state([
    cancellationIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'nomsg-refund: totalIntents 1')
  check(r.noMessageRefundStartedCount === 1, 'nomsg-refund: noMessageRefundStartedCount 1')
  check(r.messageSentRefundStartedCount === 0, 'nomsg-refund: messageSentRefundStartedCount 0')
}

// 5. No message + no refund
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStartedBrief(state([
    cancellationIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'nomsg-norefund: totalIntents 1')
  check(r.noMessageNoRefundCount === 1, 'nomsg-norefund: noMessageNoRefundCount 1')
  check(r.messageSentNoRefundCount === 0, 'nomsg-norefund: messageSentNoRefundCount 0')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStartedBrief(state([
    cancellationIntent(true, true),
    cancellationIntent(true, false),
    cancellationIntent(false, true),
    cancellationIntent(false, false),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.messageSentRefundStartedCount === 1, 'all-cells: messageSentRefundStartedCount 1')
  check(r.noMessageRefundStartedCount === 1, 'all-cells: noMessageRefundStartedCount 1')
  check(r.messageSentCount === 2, 'all-cells: messageSentCount 2')
}

// 7. Row totals for case 6
{
  const r = projectEcommerceCancellationIntentCustomerMessageRefundStartedBrief(state([
    cancellationIntent(true, true),
    cancellationIntent(true, false),
    cancellationIntent(false, true),
    cancellationIntent(false, false),
  ]))
  check(r.noMessageNoRefundCount === 1, 'row-totals: noMessageNoRefundCount 1')
  check(r.noMessageCount === 2, 'row-totals: noMessageCount 2')
}

console.log(`ecommerce-cancellation-intent-customer-message-refund-started-brief: ${checks} checks passed`)
