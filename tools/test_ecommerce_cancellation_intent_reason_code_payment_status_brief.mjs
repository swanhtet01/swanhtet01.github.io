import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentReasonCodePaymentStatusBrief } from './ecommerce-cancellation-intent-reason-code-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentReasonCodePaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(reasonCode = 'changed_mind', paymentStatus = 'pending') {
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
    reasonCode,
    reason: 'Cancellation reason',
    customerMessageSent: false,
    orderCancelled: false,
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
  const r = projectEcommerceCancellationIntentReasonCodePaymentStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.changedMindPendingCount === 0, 'empty: changedMindPendingCount 0')
  check(r.otherReconciledCount === 0, 'empty: otherReconciledCount 0')
}

// 2. changed_mind + pending
{
  const r = projectEcommerceCancellationIntentReasonCodePaymentStatusBrief(state([
    cancellationIntent('changed_mind', 'pending'),
  ]))
  check(r.totalIntents === 1, 'changed-mind-pending: totalIntents 1')
  check(r.changedMindPendingCount === 1, 'changed-mind-pending: changedMindPendingCount 1')
  check(r.changedMindReconciledCount === 0, 'changed-mind-pending: changedMindReconciledCount 0')
}

// 3. delivery_too_slow + reconciled
{
  const r = projectEcommerceCancellationIntentReasonCodePaymentStatusBrief(state([
    cancellationIntent('delivery_too_slow', 'reconciled'),
  ]))
  check(r.deliveryTooSlowReconciledCount === 1, 'delivery-too-slow-recon: deliveryTooSlowReconciledCount 1')
  check(r.deliveryTooSlowPendingCount === 0, 'delivery-too-slow-recon: deliveryTooSlowPendingCount 0')
  check(r.totalIntents === 1, 'delivery-too-slow-recon: totalIntents 1')
}

// 4. duplicate_order + pending
{
  const r = projectEcommerceCancellationIntentReasonCodePaymentStatusBrief(state([
    cancellationIntent('duplicate_order', 'pending'),
  ]))
  check(r.duplicateOrderPendingCount === 1, 'duplicate-order-pending: duplicateOrderPendingCount 1')
  check(r.duplicateOrderReconciledCount === 0, 'duplicate-order-pending: duplicateOrderReconciledCount 0')
  check(r.totalIntents === 1, 'duplicate-order-pending: totalIntents 1')
}

// 5. order_error + reconciled
{
  const r = projectEcommerceCancellationIntentReasonCodePaymentStatusBrief(state([
    cancellationIntent('order_error', 'reconciled'),
  ]))
  check(r.orderErrorReconciledCount === 1, 'order-error-recon: orderErrorReconciledCount 1')
  check(r.orderErrorPendingCount === 0, 'order-error-recon: orderErrorPendingCount 0')
  check(r.totalIntents === 1, 'order-error-recon: totalIntents 1')
}

// 6. All 5 categories (one each, mixed payment status)
{
  const r = projectEcommerceCancellationIntentReasonCodePaymentStatusBrief(state([
    cancellationIntent('changed_mind', 'pending'),
    cancellationIntent('delivery_too_slow', 'reconciled'),
    cancellationIntent('duplicate_order', 'pending'),
    cancellationIntent('order_error', 'reconciled'),
    cancellationIntent('other', 'pending'),
  ]))
  check(r.totalIntents === 5, 'all-cats: totalIntents 5')
  check(r.changedMindPendingCount === 1, 'all-cats: changedMindPendingCount 1')
  check(r.deliveryTooSlowReconciledCount === 1, 'all-cats: deliveryTooSlowReconciledCount 1')
  check(r.duplicateOrderPendingCount === 1, 'all-cats: duplicateOrderPendingCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentReasonCodePaymentStatusBrief(state([
    cancellationIntent('changed_mind', 'pending'),
    cancellationIntent('delivery_too_slow', 'reconciled'),
    cancellationIntent('duplicate_order', 'pending'),
    cancellationIntent('order_error', 'reconciled'),
    cancellationIntent('other', 'pending'),
  ]))
  check(r.orderErrorReconciledCount === 1, 'sub-buckets: orderErrorReconciledCount 1')
  check(r.otherPendingCount === 1, 'sub-buckets: otherPendingCount 1')
  check(r.otherReconciledCount === 0, 'sub-buckets: otherReconciledCount 0')
  check(r.changedMindReconciledCount === 0, 'sub-buckets: changedMindReconciledCount 0')
}

console.log(`ecommerce-cancellation-intent-reason-code-payment-status-brief: ${checks} checks passed`)
