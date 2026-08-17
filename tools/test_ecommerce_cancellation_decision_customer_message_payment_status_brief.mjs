import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionCustomerMessagePaymentStatusBrief } from './ecommerce-cancellation-decision-customer-message-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionCustomerMessagePaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(customerMessageSent = false, paymentStatus = 'pending') {
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
    customerMessageSent,
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
  const r = projectEcommerceCancellationDecisionCustomerMessagePaymentStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + pending
{
  const r = projectEcommerceCancellationDecisionCustomerMessagePaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
  ]))
  check(r.totalDecisions === 1, 'msg-pending: totalDecisions 1')
  check(r.messageSentPendingCount === 1, 'msg-pending: messageSentPendingCount 1')
  check(r.messageSentReconciledCount === 0, 'msg-pending: messageSentReconciledCount 0')
  check(r.messageSentCount === 1, 'msg-pending: messageSentCount 1')
}

// 3. Message sent + reconciled
{
  const r = projectEcommerceCancellationDecisionCustomerMessagePaymentStatusBrief(state([
    cancellationDecision(true, 'reconciled'),
  ]))
  check(r.totalDecisions === 1, 'msg-reconciled: totalDecisions 1')
  check(r.messageSentReconciledCount === 1, 'msg-reconciled: messageSentReconciledCount 1')
  check(r.messageSentCount === 1, 'msg-reconciled: messageSentCount 1')
  check(r.noMessageCount === 0, 'msg-reconciled: noMessageCount 0')
}

// 4. No message + pending
{
  const r = projectEcommerceCancellationDecisionCustomerMessagePaymentStatusBrief(state([
    cancellationDecision(false, 'pending'),
  ]))
  check(r.totalDecisions === 1, 'nomsg-pending: totalDecisions 1')
  check(r.noMessagePendingCount === 1, 'nomsg-pending: noMessagePendingCount 1')
  check(r.noMessageCount === 1, 'nomsg-pending: noMessageCount 1')
}

// 5. No message + reconciled
{
  const r = projectEcommerceCancellationDecisionCustomerMessagePaymentStatusBrief(state([
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.totalDecisions === 1, 'nomsg-reconciled: totalDecisions 1')
  check(r.noMessageReconciledCount === 1, 'nomsg-reconciled: noMessageReconciledCount 1')
  check(r.noMessageCount === 1, 'nomsg-reconciled: noMessageCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationDecisionCustomerMessagePaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
    cancellationDecision(true, 'reconciled'),
    cancellationDecision(false, 'pending'),
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.totalDecisions === 4, 'all-cells: totalDecisions 4')
  check(r.messageSentPendingCount === 1, 'all-cells: messageSentPendingCount 1')
  check(r.noMessageReconciledCount === 1, 'all-cells: noMessageReconciledCount 1')
  check(r.messageSentCount === 2, 'all-cells: messageSentCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceCancellationDecisionCustomerMessagePaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
    cancellationDecision(true, 'reconciled'),
    cancellationDecision(false, 'pending'),
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.noMessageCount === 2, 'row-totals: noMessageCount 2')
  check(r.messageSentReconciledCount === 1, 'row-totals: messageSentReconciledCount 1')
}

console.log(`ecommerce-cancellation-decision-customer-message-payment-status-brief: ${checks} checks passed`)
