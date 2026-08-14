import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentOrderStatusPaymentStatusBrief } from './ecommerce-cancellation-intent-order-status-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentOrderStatusPaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(orderStatus = 'confirmed', paymentStatus = 'pending') {
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
    orderStatus,
    paymentStatus,
    refundStatus: 'none',
    totalMmk: 10000,
    reasonCode: 'changed_mind',
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
  const r = projectEcommerceCancellationIntentOrderStatusPaymentStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.confirmedPendingCount === 0, 'empty: confirmedPendingCount 0')
  check(r.readyReconciledCount === 0, 'empty: readyReconciledCount 0')
}

// 2. Confirmed + pending
{
  const r = projectEcommerceCancellationIntentOrderStatusPaymentStatusBrief(state([
    cancellationIntent('confirmed', 'pending'),
  ]))
  check(r.totalIntents === 1, 'confirmed-pending: totalIntents 1')
  check(r.confirmedPendingCount === 1, 'confirmed-pending: confirmedPendingCount 1')
  check(r.confirmedReconciledCount === 0, 'confirmed-pending: confirmedReconciledCount 0')
  check(r.preparingPendingCount === 0, 'confirmed-pending: preparingPendingCount 0')
}

// 3. Confirmed + reconciled
{
  const r = projectEcommerceCancellationIntentOrderStatusPaymentStatusBrief(state([
    cancellationIntent('confirmed', 'reconciled'),
  ]))
  check(r.confirmedReconciledCount === 1, 'confirmed-recon: confirmedReconciledCount 1')
  check(r.confirmedPendingCount === 0, 'confirmed-recon: confirmedPendingCount 0')
  check(r.totalIntents === 1, 'confirmed-recon: totalIntents 1')
  check(r.preparingReconciledCount === 0, 'confirmed-recon: preparingReconciledCount 0')
}

// 4. Preparing + pending
{
  const r = projectEcommerceCancellationIntentOrderStatusPaymentStatusBrief(state([
    cancellationIntent('preparing', 'pending'),
  ]))
  check(r.preparingPendingCount === 1, 'preparing-pending: preparingPendingCount 1')
  check(r.preparingReconciledCount === 0, 'preparing-pending: preparingReconciledCount 0')
  check(r.totalIntents === 1, 'preparing-pending: totalIntents 1')
}

// 5. Ready + reconciled
{
  const r = projectEcommerceCancellationIntentOrderStatusPaymentStatusBrief(state([
    cancellationIntent('ready', 'reconciled'),
  ]))
  check(r.readyReconciledCount === 1, 'ready-recon: readyReconciledCount 1')
  check(r.readyPendingCount === 0, 'ready-recon: readyPendingCount 0')
  check(r.totalIntents === 1, 'ready-recon: totalIntents 1')
}

// 6. All 6 cells: one of each order-status × payment-status combination
{
  const r = projectEcommerceCancellationIntentOrderStatusPaymentStatusBrief(state([
    cancellationIntent('confirmed', 'pending'),
    cancellationIntent('confirmed', 'reconciled'),
    cancellationIntent('preparing', 'pending'),
    cancellationIntent('preparing', 'reconciled'),
    cancellationIntent('ready', 'pending'),
    cancellationIntent('ready', 'reconciled'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.confirmedPendingCount === 1, 'all-cells: confirmedPendingCount 1')
  check(r.preparingReconciledCount === 1, 'all-cells: preparingReconciledCount 1')
  check(r.readyPendingCount === 1, 'all-cells: readyPendingCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentOrderStatusPaymentStatusBrief(state([
    cancellationIntent('confirmed', 'pending'),
    cancellationIntent('confirmed', 'reconciled'),
    cancellationIntent('preparing', 'pending'),
    cancellationIntent('preparing', 'reconciled'),
    cancellationIntent('ready', 'pending'),
    cancellationIntent('ready', 'reconciled'),
  ]))
  check(r.confirmedReconciledCount === 1, 'sub-buckets: confirmedReconciledCount 1')
  check(r.preparingPendingCount === 1, 'sub-buckets: preparingPendingCount 1')
}

console.log(`ecommerce-cancellation-intent-order-status-payment-status-brief: ${checks} checks passed`)
