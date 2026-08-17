import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionProviderCalledPaymentStatusBrief } from './ecommerce-cancellation-decision-provider-called-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionProviderCalledPaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(providerCalled = false, paymentStatus = 'pending') {
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
    refundStarted: false,
    providerCalled,
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
  const r = projectEcommerceCancellationDecisionProviderCalledPaymentStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.providerCalledCount === 0, 'empty: providerCalledCount 0')
  check(r.noProviderCount === 0, 'empty: noProviderCount 0')
}

// 2. Provider called + pending
{
  const r = projectEcommerceCancellationDecisionProviderCalledPaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
  ]))
  check(r.totalDecisions === 1, 'provider-pending: totalDecisions 1')
  check(r.providerCalledPendingCount === 1, 'provider-pending: providerCalledPendingCount 1')
  check(r.providerCalledReconciledCount === 0, 'provider-pending: providerCalledReconciledCount 0')
  check(r.providerCalledCount === 1, 'provider-pending: providerCalledCount 1')
}

// 3. Provider called + reconciled
{
  const r = projectEcommerceCancellationDecisionProviderCalledPaymentStatusBrief(state([
    cancellationDecision(true, 'reconciled'),
  ]))
  check(r.totalDecisions === 1, 'provider-reconciled: totalDecisions 1')
  check(r.providerCalledReconciledCount === 1, 'provider-reconciled: providerCalledReconciledCount 1')
  check(r.providerCalledCount === 1, 'provider-reconciled: providerCalledCount 1')
  check(r.noProviderCount === 0, 'provider-reconciled: noProviderCount 0')
}

// 4. No provider + pending
{
  const r = projectEcommerceCancellationDecisionProviderCalledPaymentStatusBrief(state([
    cancellationDecision(false, 'pending'),
  ]))
  check(r.totalDecisions === 1, 'noprovider-pending: totalDecisions 1')
  check(r.noProviderPendingCount === 1, 'noprovider-pending: noProviderPendingCount 1')
  check(r.noProviderCount === 1, 'noprovider-pending: noProviderCount 1')
}

// 5. No provider + reconciled
{
  const r = projectEcommerceCancellationDecisionProviderCalledPaymentStatusBrief(state([
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.totalDecisions === 1, 'noprovider-reconciled: totalDecisions 1')
  check(r.noProviderReconciledCount === 1, 'noprovider-reconciled: noProviderReconciledCount 1')
  check(r.noProviderCount === 1, 'noprovider-reconciled: noProviderCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationDecisionProviderCalledPaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
    cancellationDecision(true, 'reconciled'),
    cancellationDecision(false, 'pending'),
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.totalDecisions === 4, 'all-cells: totalDecisions 4')
  check(r.providerCalledPendingCount === 1, 'all-cells: providerCalledPendingCount 1')
  check(r.noProviderReconciledCount === 1, 'all-cells: noProviderReconciledCount 1')
  check(r.providerCalledCount === 2, 'all-cells: providerCalledCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceCancellationDecisionProviderCalledPaymentStatusBrief(state([
    cancellationDecision(true, 'pending'),
    cancellationDecision(true, 'reconciled'),
    cancellationDecision(false, 'pending'),
    cancellationDecision(false, 'reconciled'),
  ]))
  check(r.noProviderCount === 2, 'row-totals: noProviderCount 2')
  check(r.providerCalledReconciledCount === 1, 'row-totals: providerCalledReconciledCount 1')
}

console.log(`ecommerce-cancellation-decision-provider-called-payment-status-brief: ${checks} checks passed`)
