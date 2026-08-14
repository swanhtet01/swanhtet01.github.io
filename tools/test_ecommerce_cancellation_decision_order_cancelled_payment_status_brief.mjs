import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionOrderCancelledPaymentStatusBrief } from './ecommerce-cancellation-decision-order-cancelled-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionOrderCancelledPaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(orderCancelled = false, paymentStatus = 'pending') {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `ECD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `ECI-${decisionId}`,
    intentDigest: `eid-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus,
    refundStatus: 'none',
    totalMmk: 10000,
    actor: 'staff-1',
    reason: 'Keeping the order',
    evidenceReference: `ev-${decisionId}`,
    customerMessageSent: false,
    orderCancelled,
    refundStarted: false,
    providerCalled: false,
  }
}

function state(cancellationDecisions = []) {
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
    cancellationDecisions,
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCancellationDecisionOrderCancelledPaymentStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.cancelledCount === 0, 'empty: cancelledCount 0')
  check(r.notCancelledCount === 0, 'empty: notCancelledCount 0')
}

// 2. Cancelled + pending
{
  const r = projectEcommerceCancellationDecisionOrderCancelledPaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
  ]))
  check(r.totalDecisions === 1, 'cancelled-pending: totalDecisions 1')
  check(r.cancelledPendingCount === 1, 'cancelled-pending: cancelledPendingCount 1')
  check(r.cancelledReconciledCount === 0, 'cancelled-pending: cancelledReconciledCount 0')
  check(r.cancelledCount === 1, 'cancelled-pending: cancelledCount 1')
}

// 3. Cancelled + reconciled
{
  const r = projectEcommerceCancellationDecisionOrderCancelledPaymentStatusBrief(state([
    cancellationDecision(true, 'reconciled'),
  ]))
  check(r.totalDecisions === 1, 'cancelled-reconciled: totalDecisions 1')
  check(r.cancelledReconciledCount === 1, 'cancelled-reconciled: cancelledReconciledCount 1')
  check(r.cancelledCount === 1, 'cancelled-reconciled: cancelledCount 1')
  check(r.notCancelledCount === 0, 'cancelled-reconciled: notCancelledCount 0')
}

// 4. Not cancelled + pending
{
  const r = projectEcommerceCancellationDecisionOrderCancelledPaymentStatusBrief(state([
    cancellationDecision(false, 'pending'),
  ]))
  check(r.totalDecisions === 1, 'notcancelled-pending: totalDecisions 1')
  check(r.notCancelledPendingCount === 1, 'notcancelled-pending: notCancelledPendingCount 1')
  check(r.notCancelledCount === 1, 'notcancelled-pending: notCancelledCount 1')
}

// 5. Not cancelled + reconciled
{
  const r = projectEcommerceCancellationDecisionOrderCancelledPaymentStatusBrief(state([
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.totalDecisions === 1, 'notcancelled-reconciled: totalDecisions 1')
  check(r.notCancelledReconciledCount === 1, 'notcancelled-reconciled: notCancelledReconciledCount 1')
  check(r.notCancelledCount === 1, 'notcancelled-reconciled: notCancelledCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationDecisionOrderCancelledPaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
    cancellationDecision(true, 'reconciled'),
    cancellationDecision(false, 'pending'),
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.totalDecisions === 4, 'all-cells: totalDecisions 4')
  check(r.cancelledPendingCount === 1, 'all-cells: cancelledPendingCount 1')
  check(r.notCancelledReconciledCount === 1, 'all-cells: notCancelledReconciledCount 1')
  check(r.cancelledCount === 2, 'all-cells: cancelledCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceCancellationDecisionOrderCancelledPaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
    cancellationDecision(true, 'reconciled'),
    cancellationDecision(false, 'pending'),
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.notCancelledCount === 2, 'row-totals: notCancelledCount 2')
  check(r.cancelledReconciledCount === 1, 'row-totals: cancelledReconciledCount 1')
}

console.log(`ecommerce-cancellation-decision-order-cancelled-payment-status-brief: ${checks} checks passed`)
