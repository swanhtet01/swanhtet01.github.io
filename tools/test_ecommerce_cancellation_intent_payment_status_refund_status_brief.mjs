import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentPaymentStatusRefundStatusBrief } from './ecommerce-cancellation-intent-payment-status-refund-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentPaymentStatusRefundStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(paymentStatus = 'pending', refundStatus = 'none') {
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
    refundStatus,
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
  const r = projectEcommerceCancellationIntentPaymentStatusRefundStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.pendingNoneCount === 0, 'empty: pendingNoneCount 0')
  check(r.reconciledSettledCount === 0, 'empty: reconciledSettledCount 0')
}

// 2. Pending + none
{
  const r = projectEcommerceCancellationIntentPaymentStatusRefundStatusBrief(state([
    cancellationIntent('pending', 'none'),
  ]))
  check(r.totalIntents === 1, 'pending-none: totalIntents 1')
  check(r.pendingNoneCount === 1, 'pending-none: pendingNoneCount 1')
  check(r.pendingDueCount === 0, 'pending-none: pendingDueCount 0')
  check(r.reconciledNoneCount === 0, 'pending-none: reconciledNoneCount 0')
}

// 3. Reconciled + due
{
  const r = projectEcommerceCancellationIntentPaymentStatusRefundStatusBrief(state([
    cancellationIntent('reconciled', 'due'),
  ]))
  check(r.reconciledDueCount === 1, 'reconciled-due: reconciledDueCount 1')
  check(r.reconciledNoneCount === 0, 'reconciled-due: reconciledNoneCount 0')
  check(r.totalIntents === 1, 'reconciled-due: totalIntents 1')
  check(r.pendingDueCount === 0, 'reconciled-due: pendingDueCount 0')
}

// 4. Pending + settled
{
  const r = projectEcommerceCancellationIntentPaymentStatusRefundStatusBrief(state([
    cancellationIntent('pending', 'settled'),
  ]))
  check(r.pendingSettledCount === 1, 'pending-settled: pendingSettledCount 1')
  check(r.pendingNoneCount === 0, 'pending-settled: pendingNoneCount 0')
  check(r.totalIntents === 1, 'pending-settled: totalIntents 1')
}

// 5. Reconciled + none
{
  const r = projectEcommerceCancellationIntentPaymentStatusRefundStatusBrief(state([
    cancellationIntent('reconciled', 'none'),
  ]))
  check(r.reconciledNoneCount === 1, 'reconciled-none: reconciledNoneCount 1')
  check(r.reconciledDueCount === 0, 'reconciled-none: reconciledDueCount 0')
  check(r.totalIntents === 1, 'reconciled-none: totalIntents 1')
}

// 6. All major cells populated
{
  const r = projectEcommerceCancellationIntentPaymentStatusRefundStatusBrief(state([
    cancellationIntent('pending', 'none'),
    cancellationIntent('pending', 'due'),
    cancellationIntent('pending', 'settled'),
    cancellationIntent('reconciled', 'none'),
    cancellationIntent('reconciled', 'due'),
    cancellationIntent('reconciled', 'settled'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.pendingNoneCount === 1, 'all-cells: pendingNoneCount 1')
  check(r.reconciledDueCount === 1, 'all-cells: reconciledDueCount 1')
  check(r.pendingSettledCount === 1, 'all-cells: pendingSettledCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentPaymentStatusRefundStatusBrief(state([
    cancellationIntent('pending', 'none'),
    cancellationIntent('pending', 'due'),
    cancellationIntent('pending', 'settled'),
    cancellationIntent('reconciled', 'none'),
    cancellationIntent('reconciled', 'due'),
    cancellationIntent('reconciled', 'settled'),
  ]))
  check(r.pendingDueCount === 1, 'sub-buckets: pendingDueCount 1')
  check(r.reconciledSettledCount === 1, 'sub-buckets: reconciledSettledCount 1')
}

console.log(`ecommerce-cancellation-intent-payment-status-refund-status-brief: ${checks} checks passed`)
