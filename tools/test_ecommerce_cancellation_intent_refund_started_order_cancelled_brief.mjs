import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentRefundStartedOrderCancelledBrief } from './ecommerce-cancellation-intent-refund-started-order-cancelled-brief.ts'`,
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

const { projectEcommerceCancellationIntentRefundStartedOrderCancelledBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(refundStarted = false, orderCancelled = false) {
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
    customerMessageSent: false,
    orderCancelled,
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
  const r = projectEcommerceCancellationIntentRefundStartedOrderCancelledBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.refundStartedCount === 0, 'empty: refundStartedCount 0')
  check(r.noRefundCount === 0, 'empty: noRefundCount 0')
}

// 2. Refund started + cancelled
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderCancelledBrief(state([
    cancellationIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'refund-cancelled: totalIntents 1')
  check(r.refundStartedCancelledCount === 1, 'refund-cancelled: refundStartedCancelledCount 1')
  check(r.refundStartedCount === 1, 'refund-cancelled: refundStartedCount 1')
  check(r.noRefundCount === 0, 'refund-cancelled: noRefundCount 0')
}

// 3. Refund started + not cancelled
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderCancelledBrief(state([
    cancellationIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'refund-not-cancelled: totalIntents 1')
  check(r.refundStartedNotCancelledCount === 1, 'refund-not-cancelled: refundStartedNotCancelledCount 1')
  check(r.refundStartedCount === 1, 'refund-not-cancelled: refundStartedCount 1')
  check(r.noRefundCount === 0, 'refund-not-cancelled: noRefundCount 0')
}

// 4. No refund + cancelled
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderCancelledBrief(state([
    cancellationIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'no-refund-cancelled: totalIntents 1')
  check(r.noRefundCancelledCount === 1, 'no-refund-cancelled: noRefundCancelledCount 1')
  check(r.noRefundCount === 1, 'no-refund-cancelled: noRefundCount 1')
}

// 5. No refund + not cancelled
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderCancelledBrief(state([
    cancellationIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'no-refund-not-cancelled: totalIntents 1')
  check(r.noRefundNotCancelledCount === 1, 'no-refund-not-cancelled: noRefundNotCancelledCount 1')
  check(r.noRefundCount === 1, 'no-refund-not-cancelled: noRefundCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderCancelledBrief(state([
    cancellationIntent(true, true),
    cancellationIntent(true, false),
    cancellationIntent(false, true),
    cancellationIntent(false, false),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.refundStartedCancelledCount === 1, 'all-cells: refundStartedCancelledCount 1')
  check(r.noRefundCancelledCount === 1, 'all-cells: noRefundCancelledCount 1')
  check(r.refundStartedNotCancelledCount === 1, 'all-cells: refundStartedNotCancelledCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderCancelledBrief(state([
    cancellationIntent(true, true),
    cancellationIntent(true, false),
    cancellationIntent(false, true),
    cancellationIntent(false, false),
  ]))
  check(r.refundStartedCount === 2, 'sub-buckets: refundStartedCount 2')
  check(r.noRefundCount === 2, 'sub-buckets: noRefundCount 2')
}

console.log(`ecommerce-cancellation-intent-refund-started-order-cancelled-brief: ${checks} checks passed`)
