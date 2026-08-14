import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionOrderStatusPaymentStatusBrief } from './ecommerce-cancellation-decision-order-status-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionOrderStatusPaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(orderStatus = 'confirmed', paymentStatus = 'pending') {
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
    orderStatus,
    paymentStatus,
    refundStatus: 'none',
    totalMmk: 10000,
    actor: 'staff-1',
    reason: 'Keeping the order',
    evidenceReference: `ev-${decisionId}`,
    customerMessageSent: false,
    orderCancelled: false,
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
  const r = projectEcommerceCancellationDecisionOrderStatusPaymentStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.confirmedPendingCount === 0, 'empty: confirmedPendingCount 0')
  check(r.readyReconciledCount === 0, 'empty: readyReconciledCount 0')
}

// 2. Confirmed + pending
{
  const r = projectEcommerceCancellationDecisionOrderStatusPaymentStatusBrief(state([
    cancellationDecision('confirmed', 'pending'),
  ]))
  check(r.totalDecisions === 1, 'confirmed-pending: totalDecisions 1')
  check(r.confirmedPendingCount === 1, 'confirmed-pending: confirmedPendingCount 1')
  check(r.confirmedReconciledCount === 0, 'confirmed-pending: confirmedReconciledCount 0')
  check(r.preparingPendingCount === 0, 'confirmed-pending: preparingPendingCount 0')
}

// 3. Confirmed + reconciled
{
  const r = projectEcommerceCancellationDecisionOrderStatusPaymentStatusBrief(state([
    cancellationDecision('confirmed', 'reconciled'),
  ]))
  check(r.confirmedReconciledCount === 1, 'confirmed-recon: confirmedReconciledCount 1')
  check(r.confirmedPendingCount === 0, 'confirmed-recon: confirmedPendingCount 0')
  check(r.totalDecisions === 1, 'confirmed-recon: totalDecisions 1')
  check(r.preparingReconciledCount === 0, 'confirmed-recon: preparingReconciledCount 0')
}

// 4. Preparing + pending
{
  const r = projectEcommerceCancellationDecisionOrderStatusPaymentStatusBrief(state([
    cancellationDecision('preparing', 'pending'),
  ]))
  check(r.preparingPendingCount === 1, 'preparing-pending: preparingPendingCount 1')
  check(r.preparingReconciledCount === 0, 'preparing-pending: preparingReconciledCount 0')
  check(r.totalDecisions === 1, 'preparing-pending: totalDecisions 1')
}

// 5. Ready + reconciled
{
  const r = projectEcommerceCancellationDecisionOrderStatusPaymentStatusBrief(state([
    cancellationDecision('ready', 'reconciled'),
  ]))
  check(r.readyReconciledCount === 1, 'ready-recon: readyReconciledCount 1')
  check(r.readyPendingCount === 0, 'ready-recon: readyPendingCount 0')
  check(r.totalDecisions === 1, 'ready-recon: totalDecisions 1')
}

// 6. All 6 cells: one of each order-status × payment-status combination
{
  const r = projectEcommerceCancellationDecisionOrderStatusPaymentStatusBrief(state([
    cancellationDecision('confirmed', 'pending'),
    cancellationDecision('confirmed', 'reconciled'),
    cancellationDecision('preparing', 'pending'),
    cancellationDecision('preparing', 'reconciled'),
    cancellationDecision('ready', 'pending'),
    cancellationDecision('ready', 'reconciled'),
  ]))
  check(r.totalDecisions === 6, 'all-cells: totalDecisions 6')
  check(r.confirmedPendingCount === 1, 'all-cells: confirmedPendingCount 1')
  check(r.preparingReconciledCount === 1, 'all-cells: preparingReconciledCount 1')
  check(r.readyPendingCount === 1, 'all-cells: readyPendingCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationDecisionOrderStatusPaymentStatusBrief(state([
    cancellationDecision('confirmed', 'pending'),
    cancellationDecision('confirmed', 'reconciled'),
    cancellationDecision('preparing', 'pending'),
    cancellationDecision('preparing', 'reconciled'),
    cancellationDecision('ready', 'pending'),
    cancellationDecision('ready', 'reconciled'),
  ]))
  check(r.confirmedReconciledCount === 1, 'sub-buckets: confirmedReconciledCount 1')
  check(r.preparingPendingCount === 1, 'sub-buckets: preparingPendingCount 1')
}

console.log(`ecommerce-cancellation-decision-order-status-payment-status-brief: ${checks} checks passed`)
