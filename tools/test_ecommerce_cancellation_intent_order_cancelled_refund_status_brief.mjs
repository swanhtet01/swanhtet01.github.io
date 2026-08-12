import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentOrderCancelledRefundStatusBrief } from './ecommerce-cancellation-intent-order-cancelled-refund-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentOrderCancelledRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(orderCancelled = false, refundStatus = 'none') {
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
    refundStatus,
    totalMmk: 10000,
    reasonCode: 'changed_mind',
    reason: 'Cancellation reason',
    customerMessageSent: false,
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
  const r = projectEcommerceCancellationIntentOrderCancelledRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.cancelledNoneCount === 0, 'empty: cancelledNoneCount 0')
  check(r.notCancelledNoneCount === 0, 'empty: notCancelledNoneCount 0')
}

// 2. Cancelled + none
{
  const r = projectEcommerceCancellationIntentOrderCancelledRefundStatusBrief(state([
    cancellationIntent(true, 'none'),
  ]))
  check(r.totalIntents === 1, 'cancelled-none: totalIntents 1')
  check(r.cancelledNoneCount === 1, 'cancelled-none: cancelledNoneCount 1')
  check(r.cancelledDueCount === 0, 'cancelled-none: cancelledDueCount 0')
  check(r.notCancelledNoneCount === 0, 'cancelled-none: notCancelledNoneCount 0')
}

// 3. Cancelled + due
{
  const r = projectEcommerceCancellationIntentOrderCancelledRefundStatusBrief(state([
    cancellationIntent(true, 'due'),
  ]))
  check(r.totalIntents === 1, 'cancelled-due: totalIntents 1')
  check(r.cancelledDueCount === 1, 'cancelled-due: cancelledDueCount 1')
  check(r.cancelledNoneCount === 0, 'cancelled-due: cancelledNoneCount 0')
  check(r.notCancelledDueCount === 0, 'cancelled-due: notCancelledDueCount 0')
}

// 4. Cancelled + settled
{
  const r = projectEcommerceCancellationIntentOrderCancelledRefundStatusBrief(state([
    cancellationIntent(true, 'settled'),
  ]))
  check(r.totalIntents === 1, 'cancelled-settled: totalIntents 1')
  check(r.cancelledSettledCount === 1, 'cancelled-settled: cancelledSettledCount 1')
  check(r.notCancelledSettledCount === 0, 'cancelled-settled: notCancelledSettledCount 0')
}

// 5. Not cancelled + none
{
  const r = projectEcommerceCancellationIntentOrderCancelledRefundStatusBrief(state([
    cancellationIntent(false, 'none'),
  ]))
  check(r.totalIntents === 1, 'not-cancelled-none: totalIntents 1')
  check(r.notCancelledNoneCount === 1, 'not-cancelled-none: notCancelledNoneCount 1')
  check(r.cancelledNoneCount === 0, 'not-cancelled-none: cancelledNoneCount 0')
}

// 6. All 6 cells
{
  const r = projectEcommerceCancellationIntentOrderCancelledRefundStatusBrief(state([
    cancellationIntent(true, 'none'),
    cancellationIntent(true, 'due'),
    cancellationIntent(true, 'settled'),
    cancellationIntent(false, 'none'),
    cancellationIntent(false, 'due'),
    cancellationIntent(false, 'settled'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.cancelledNoneCount === 1, 'all-cells: cancelledNoneCount 1')
  check(r.cancelledDueCount === 1, 'all-cells: cancelledDueCount 1')
  check(r.notCancelledNoneCount === 1, 'all-cells: notCancelledNoneCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentOrderCancelledRefundStatusBrief(state([
    cancellationIntent(true, 'none'),
    cancellationIntent(true, 'due'),
    cancellationIntent(true, 'settled'),
    cancellationIntent(false, 'none'),
    cancellationIntent(false, 'due'),
    cancellationIntent(false, 'settled'),
  ]))
  check(r.notCancelledDueCount === 1, 'sub-buckets: notCancelledDueCount 1')
  check(r.notCancelledSettledCount === 1, 'sub-buckets: notCancelledSettledCount 1')
}

console.log(`ecommerce-cancellation-intent-order-cancelled-refund-status-brief: ${checks} checks passed`)
