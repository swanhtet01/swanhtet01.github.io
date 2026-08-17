import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionPaymentStatusBrief } from './ecommerce-cancellation-decision-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionPaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(paymentStatus = 'pending') {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `ECD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `ECN-${decisionId}`,
    intentDigest: `idig-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus,
    refundStatus: 'none',
    totalMmk: 12000,
    actor: 'staff-001',
    reason: 'Order kept',
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
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.pendingCount === 0, 'empty: pendingCount 0')
  check(r.reconciledCount === 0, 'empty: reconciledCount 0')
}

// 2. Single pending
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state([cancellationDecision('pending')]))
  check(r.totalDecisions === 1, 'single-pending: totalDecisions 1')
  check(r.pendingCount === 1, 'single-pending: pendingCount 1')
  check(r.reconciledCount === 0, 'single-pending: reconciledCount 0')
}

// 3. Single reconciled
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state([cancellationDecision('reconciled')]))
  check(r.totalDecisions === 1, 'single-reconciled: totalDecisions 1')
  check(r.pendingCount === 0, 'single-reconciled: pendingCount 0')
  check(r.reconciledCount === 1, 'single-reconciled: reconciledCount 1')
}

// 4. Two pending
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state([
    cancellationDecision('pending'),
    cancellationDecision('pending'),
  ]))
  check(r.totalDecisions === 2, 'two-pending: totalDecisions 2')
  check(r.pendingCount === 2, 'two-pending: pendingCount 2')
  check(r.reconciledCount === 0, 'two-pending: reconciledCount 0')
}

// 5. Two reconciled
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state([
    cancellationDecision('reconciled'),
    cancellationDecision('reconciled'),
  ]))
  check(r.totalDecisions === 2, 'two-reconciled: totalDecisions 2')
  check(r.pendingCount === 0, 'two-reconciled: pendingCount 0')
  check(r.reconciledCount === 2, 'two-reconciled: reconciledCount 2')
}

// 6. Mixed: 2 pending + 1 reconciled
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state([
    cancellationDecision('pending'),
    cancellationDecision('reconciled'),
    cancellationDecision('pending'),
  ]))
  check(r.totalDecisions === 3, 'mixed: totalDecisions 3')
  check(r.pendingCount === 2, 'mixed: pendingCount 2')
  check(r.reconciledCount === 1, 'mixed: reconciledCount 1')
  check(r.pendingCount + r.reconciledCount === r.totalDecisions, 'mixed: counts sum to total')
}

// 7. All reconciled
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state([
    cancellationDecision('reconciled'),
    cancellationDecision('reconciled'),
    cancellationDecision('reconciled'),
  ]))
  check(r.totalDecisions === 3, 'all-reconciled: totalDecisions 3')
  check(r.pendingCount === 0, 'all-reconciled: pendingCount 0')
  check(r.reconciledCount === 3, 'all-reconciled: reconciledCount 3')
  check(r.pendingCount + r.reconciledCount === r.totalDecisions, 'all-reconciled: counts sum to total')
}

console.log(`ecommerce-cancellation-decision-payment-status-brief: ${checks} checks passed`)
