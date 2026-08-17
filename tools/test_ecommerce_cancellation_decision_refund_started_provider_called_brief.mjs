import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionRefundStartedProviderCalledBrief } from './ecommerce-cancellation-decision-refund-started-provider-called-brief.ts'`,
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

const { projectEcommerceCancellationDecisionRefundStartedProviderCalledBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(refundStarted = false, providerCalled = false) {
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
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 10000,
    actor: 'staff-1',
    reason: 'Keeping the order',
    evidenceReference: `ev-${decisionId}`,
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted,
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
  const r = projectEcommerceCancellationDecisionRefundStartedProviderCalledBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.refundStartedCount === 0, 'empty: refundStartedCount 0')
  check(r.noRefundCount === 0, 'empty: noRefundCount 0')
}

// 2. Refund started + provider called
{
  const r = projectEcommerceCancellationDecisionRefundStartedProviderCalledBrief(state([
    cancellationDecision(true, true),
  ]))
  check(r.totalDecisions === 1, 'refund-provider: totalDecisions 1')
  check(r.refundStartedProviderCalledCount === 1, 'refund-provider: refundStartedProviderCalledCount 1')
  check(r.refundStartedNoProviderCount === 0, 'refund-provider: refundStartedNoProviderCount 0')
  check(r.refundStartedCount === 1, 'refund-provider: refundStartedCount 1')
}

// 3. Refund started + no provider
{
  const r = projectEcommerceCancellationDecisionRefundStartedProviderCalledBrief(state([
    cancellationDecision(true, false),
  ]))
  check(r.totalDecisions === 1, 'refund-noprovider: totalDecisions 1')
  check(r.refundStartedNoProviderCount === 1, 'refund-noprovider: refundStartedNoProviderCount 1')
  check(r.refundStartedCount === 1, 'refund-noprovider: refundStartedCount 1')
  check(r.noRefundCount === 0, 'refund-noprovider: noRefundCount 0')
}

// 4. No refund + provider called
{
  const r = projectEcommerceCancellationDecisionRefundStartedProviderCalledBrief(state([
    cancellationDecision(false, true),
  ]))
  check(r.totalDecisions === 1, 'norefund-provider: totalDecisions 1')
  check(r.noRefundProviderCalledCount === 1, 'norefund-provider: noRefundProviderCalledCount 1')
  check(r.noRefundCount === 1, 'norefund-provider: noRefundCount 1')
}

// 5. No refund + no provider
{
  const r = projectEcommerceCancellationDecisionRefundStartedProviderCalledBrief(state([
    cancellationDecision(false, false),
  ]))
  check(r.totalDecisions === 1, 'norefund-noprovider: totalDecisions 1')
  check(r.noRefundNoProviderCount === 1, 'norefund-noprovider: noRefundNoProviderCount 1')
  check(r.noRefundCount === 1, 'norefund-noprovider: noRefundCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationDecisionRefundStartedProviderCalledBrief(state([
    cancellationDecision(true, true),
    cancellationDecision(true, false),
    cancellationDecision(false, true),
    cancellationDecision(false, false),
  ]))
  check(r.totalDecisions === 4, 'all-cells: totalDecisions 4')
  check(r.refundStartedProviderCalledCount === 1, 'all-cells: refundStartedProviderCalledCount 1')
  check(r.noRefundNoProviderCount === 1, 'all-cells: noRefundNoProviderCount 1')
  check(r.refundStartedCount === 2, 'all-cells: refundStartedCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceCancellationDecisionRefundStartedProviderCalledBrief(state([
    cancellationDecision(true, true),
    cancellationDecision(true, false),
    cancellationDecision(false, true),
    cancellationDecision(false, false),
  ]))
  check(r.noRefundCount === 2, 'row-totals: noRefundCount 2')
  check(r.refundStartedNoProviderCount === 1, 'row-totals: refundStartedNoProviderCount 1')
}

console.log(`ecommerce-cancellation-decision-refund-started-provider-called-brief: ${checks} checks passed`)
