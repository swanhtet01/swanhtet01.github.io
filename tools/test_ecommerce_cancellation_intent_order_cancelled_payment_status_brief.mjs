import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentOrderCancelledPaymentStatusBrief } from './ecommerce-cancellation-intent-order-cancelled-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentOrderCancelledPaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(orderCancelled = false, paymentStatus = 'pending') {
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
    paymentStatus,
    refundStatus: 'none',
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
  const r = projectEcommerceCancellationIntentOrderCancelledPaymentStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.cancelledCount === 0, 'empty: cancelledCount 0')
  check(r.notCancelledCount === 0, 'empty: notCancelledCount 0')
}

// 2. Cancelled + pending
{
  const r = projectEcommerceCancellationIntentOrderCancelledPaymentStatusBrief(state([
    cancellationIntent(true, 'pending'),
  ]))
  check(r.totalIntents === 1, 'cancelled-pending: totalIntents 1')
  check(r.cancelledPendingCount === 1, 'cancelled-pending: cancelledPendingCount 1')
  check(r.cancelledCount === 1, 'cancelled-pending: cancelledCount 1')
  check(r.notCancelledCount === 0, 'cancelled-pending: notCancelledCount 0')
}

// 3. Cancelled + reconciled
{
  const r = projectEcommerceCancellationIntentOrderCancelledPaymentStatusBrief(state([
    cancellationIntent(true, 'reconciled'),
  ]))
  check(r.totalIntents === 1, 'cancelled-reconciled: totalIntents 1')
  check(r.cancelledReconciledCount === 1, 'cancelled-reconciled: cancelledReconciledCount 1')
  check(r.cancelledCount === 1, 'cancelled-reconciled: cancelledCount 1')
  check(r.notCancelledCount === 0, 'cancelled-reconciled: notCancelledCount 0')
}

// 4. Not cancelled + pending
{
  const r = projectEcommerceCancellationIntentOrderCancelledPaymentStatusBrief(state([
    cancellationIntent(false, 'pending'),
  ]))
  check(r.totalIntents === 1, 'not-cancelled-pending: totalIntents 1')
  check(r.notCancelledPendingCount === 1, 'not-cancelled-pending: notCancelledPendingCount 1')
  check(r.notCancelledCount === 1, 'not-cancelled-pending: notCancelledCount 1')
}

// 5. Not cancelled + reconciled
{
  const r = projectEcommerceCancellationIntentOrderCancelledPaymentStatusBrief(state([
    cancellationIntent(false, 'reconciled'),
  ]))
  check(r.totalIntents === 1, 'not-cancelled-reconciled: totalIntents 1')
  check(r.notCancelledReconciledCount === 1, 'not-cancelled-reconciled: notCancelledReconciledCount 1')
  check(r.notCancelledCount === 1, 'not-cancelled-reconciled: notCancelledCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationIntentOrderCancelledPaymentStatusBrief(state([
    cancellationIntent(true, 'pending'),
    cancellationIntent(true, 'reconciled'),
    cancellationIntent(false, 'pending'),
    cancellationIntent(false, 'reconciled'),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.cancelledPendingCount === 1, 'all-cells: cancelledPendingCount 1')
  check(r.notCancelledPendingCount === 1, 'all-cells: notCancelledPendingCount 1')
  check(r.cancelledReconciledCount === 1, 'all-cells: cancelledReconciledCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentOrderCancelledPaymentStatusBrief(state([
    cancellationIntent(true, 'pending'),
    cancellationIntent(true, 'reconciled'),
    cancellationIntent(false, 'pending'),
    cancellationIntent(false, 'reconciled'),
  ]))
  check(r.cancelledCount === 2, 'sub-buckets: cancelledCount 2')
  check(r.notCancelledCount === 2, 'sub-buckets: notCancelledCount 2')
}

console.log(`ecommerce-cancellation-intent-order-cancelled-payment-status-brief: ${checks} checks passed`)
