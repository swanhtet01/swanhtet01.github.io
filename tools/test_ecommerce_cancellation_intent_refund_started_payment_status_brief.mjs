import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentRefundStartedPaymentStatusBrief } from './ecommerce-cancellation-intent-refund-started-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentRefundStartedPaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(refundStarted = false, paymentStatus = 'pending') {
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
  const r = projectEcommerceCancellationIntentRefundStartedPaymentStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.refundStartedCount === 0, 'empty: refundStartedCount 0')
  check(r.noRefundCount === 0, 'empty: noRefundCount 0')
}

// 2. Refund started + pending
{
  const r = projectEcommerceCancellationIntentRefundStartedPaymentStatusBrief(state([
    cancellationIntent(true, 'pending'),
  ]))
  check(r.totalIntents === 1, 'refund-pending: totalIntents 1')
  check(r.refundStartedPendingCount === 1, 'refund-pending: refundStartedPendingCount 1')
  check(r.refundStartedCount === 1, 'refund-pending: refundStartedCount 1')
  check(r.noRefundCount === 0, 'refund-pending: noRefundCount 0')
}

// 3. Refund started + reconciled
{
  const r = projectEcommerceCancellationIntentRefundStartedPaymentStatusBrief(state([
    cancellationIntent(true, 'reconciled'),
  ]))
  check(r.totalIntents === 1, 'refund-reconciled: totalIntents 1')
  check(r.refundStartedReconciledCount === 1, 'refund-reconciled: refundStartedReconciledCount 1')
  check(r.refundStartedCount === 1, 'refund-reconciled: refundStartedCount 1')
  check(r.noRefundCount === 0, 'refund-reconciled: noRefundCount 0')
}

// 4. No refund + pending
{
  const r = projectEcommerceCancellationIntentRefundStartedPaymentStatusBrief(state([
    cancellationIntent(false, 'pending'),
  ]))
  check(r.totalIntents === 1, 'no-refund-pending: totalIntents 1')
  check(r.noRefundPendingCount === 1, 'no-refund-pending: noRefundPendingCount 1')
  check(r.noRefundCount === 1, 'no-refund-pending: noRefundCount 1')
}

// 5. No refund + reconciled
{
  const r = projectEcommerceCancellationIntentRefundStartedPaymentStatusBrief(state([
    cancellationIntent(false, 'reconciled'),
  ]))
  check(r.totalIntents === 1, 'no-refund-reconciled: totalIntents 1')
  check(r.noRefundReconciledCount === 1, 'no-refund-reconciled: noRefundReconciledCount 1')
  check(r.noRefundCount === 1, 'no-refund-reconciled: noRefundCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationIntentRefundStartedPaymentStatusBrief(state([
    cancellationIntent(true, 'pending'),
    cancellationIntent(true, 'reconciled'),
    cancellationIntent(false, 'pending'),
    cancellationIntent(false, 'reconciled'),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.refundStartedPendingCount === 1, 'all-cells: refundStartedPendingCount 1')
  check(r.noRefundPendingCount === 1, 'all-cells: noRefundPendingCount 1')
  check(r.refundStartedReconciledCount === 1, 'all-cells: refundStartedReconciledCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentRefundStartedPaymentStatusBrief(state([
    cancellationIntent(true, 'pending'),
    cancellationIntent(true, 'reconciled'),
    cancellationIntent(false, 'pending'),
    cancellationIntent(false, 'reconciled'),
  ]))
  check(r.refundStartedCount === 2, 'sub-buckets: refundStartedCount 2')
  check(r.noRefundCount === 2, 'sub-buckets: noRefundCount 2')
}

console.log(`ecommerce-cancellation-intent-refund-started-payment-status-brief: ${checks} checks passed`)
