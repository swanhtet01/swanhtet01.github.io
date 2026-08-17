import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionRefundStartedPaymentStatusBrief } from './ecommerce-cancellation-decision-refund-started-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionRefundStartedPaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(refundStarted = false, paymentStatus = 'pending') {
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
    orderCancelled: false,
    refundStarted,
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
  const r = projectEcommerceCancellationDecisionRefundStartedPaymentStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.refundStartedCount === 0, 'empty: refundStartedCount 0')
  check(r.noRefundCount === 0, 'empty: noRefundCount 0')
}

// 2. Refund started + pending
{
  const r = projectEcommerceCancellationDecisionRefundStartedPaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
  ]))
  check(r.totalDecisions === 1, 'refund-pending: totalDecisions 1')
  check(r.refundStartedPendingCount === 1, 'refund-pending: refundStartedPendingCount 1')
  check(r.refundStartedReconciledCount === 0, 'refund-pending: refundStartedReconciledCount 0')
  check(r.refundStartedCount === 1, 'refund-pending: refundStartedCount 1')
}

// 3. Refund started + reconciled
{
  const r = projectEcommerceCancellationDecisionRefundStartedPaymentStatusBrief(state([
    cancellationDecision(true, 'reconciled'),
  ]))
  check(r.totalDecisions === 1, 'refund-reconciled: totalDecisions 1')
  check(r.refundStartedReconciledCount === 1, 'refund-reconciled: refundStartedReconciledCount 1')
  check(r.refundStartedCount === 1, 'refund-reconciled: refundStartedCount 1')
  check(r.noRefundCount === 0, 'refund-reconciled: noRefundCount 0')
}

// 4. No refund + pending
{
  const r = projectEcommerceCancellationDecisionRefundStartedPaymentStatusBrief(state([
    cancellationDecision(false, 'pending'),
  ]))
  check(r.totalDecisions === 1, 'norefund-pending: totalDecisions 1')
  check(r.noRefundPendingCount === 1, 'norefund-pending: noRefundPendingCount 1')
  check(r.noRefundCount === 1, 'norefund-pending: noRefundCount 1')
}

// 5. No refund + reconciled
{
  const r = projectEcommerceCancellationDecisionRefundStartedPaymentStatusBrief(state([
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.totalDecisions === 1, 'norefund-reconciled: totalDecisions 1')
  check(r.noRefundReconciledCount === 1, 'norefund-reconciled: noRefundReconciledCount 1')
  check(r.noRefundCount === 1, 'norefund-reconciled: noRefundCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationDecisionRefundStartedPaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
    cancellationDecision(true, 'reconciled'),
    cancellationDecision(false, 'pending'),
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.totalDecisions === 4, 'all-cells: totalDecisions 4')
  check(r.refundStartedPendingCount === 1, 'all-cells: refundStartedPendingCount 1')
  check(r.noRefundReconciledCount === 1, 'all-cells: noRefundReconciledCount 1')
  check(r.refundStartedCount === 2, 'all-cells: refundStartedCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceCancellationDecisionRefundStartedPaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
    cancellationDecision(true, 'reconciled'),
    cancellationDecision(false, 'pending'),
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.noRefundCount === 2, 'row-totals: noRefundCount 2')
  check(r.refundStartedReconciledCount === 1, 'row-totals: refundStartedReconciledCount 1')
}

console.log(`ecommerce-cancellation-decision-refund-started-payment-status-brief: ${checks} checks passed`)
