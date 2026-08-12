import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionOrderCancelledProviderCalledBrief } from './ecommerce-cancellation-decision-order-cancelled-provider-called-brief.ts'`,
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

const { projectEcommerceCancellationDecisionOrderCancelledProviderCalledBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(orderCancelled = false, providerCalled = false) {
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
    orderCancelled,
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
  const r = projectEcommerceCancellationDecisionOrderCancelledProviderCalledBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.cancelledCount === 0, 'empty: cancelledCount 0')
  check(r.notCancelledCount === 0, 'empty: notCancelledCount 0')
}

// 2. Cancelled + provider called
{
  const r = projectEcommerceCancellationDecisionOrderCancelledProviderCalledBrief(state([
    cancellationDecision(true, true),
  ]))
  check(r.totalDecisions === 1, 'cancelled-provider: totalDecisions 1')
  check(r.cancelledProviderCalledCount === 1, 'cancelled-provider: cancelledProviderCalledCount 1')
  check(r.cancelledNoProviderCount === 0, 'cancelled-provider: cancelledNoProviderCount 0')
  check(r.cancelledCount === 1, 'cancelled-provider: cancelledCount 1')
}

// 3. Cancelled + no provider
{
  const r = projectEcommerceCancellationDecisionOrderCancelledProviderCalledBrief(state([
    cancellationDecision(true, false),
  ]))
  check(r.totalDecisions === 1, 'cancelled-noprovider: totalDecisions 1')
  check(r.cancelledNoProviderCount === 1, 'cancelled-noprovider: cancelledNoProviderCount 1')
  check(r.cancelledCount === 1, 'cancelled-noprovider: cancelledCount 1')
  check(r.notCancelledCount === 0, 'cancelled-noprovider: notCancelledCount 0')
}

// 4. Not cancelled + provider called
{
  const r = projectEcommerceCancellationDecisionOrderCancelledProviderCalledBrief(state([
    cancellationDecision(false, true),
  ]))
  check(r.totalDecisions === 1, 'notcancelled-provider: totalDecisions 1')
  check(r.notCancelledProviderCalledCount === 1, 'notcancelled-provider: notCancelledProviderCalledCount 1')
  check(r.notCancelledCount === 1, 'notcancelled-provider: notCancelledCount 1')
}

// 5. Not cancelled + no provider
{
  const r = projectEcommerceCancellationDecisionOrderCancelledProviderCalledBrief(state([
    cancellationDecision(false, false),
  ]))
  check(r.totalDecisions === 1, 'notcancelled-noprovider: totalDecisions 1')
  check(r.notCancelledNoProviderCount === 1, 'notcancelled-noprovider: notCancelledNoProviderCount 1')
  check(r.notCancelledCount === 1, 'notcancelled-noprovider: notCancelledCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationDecisionOrderCancelledProviderCalledBrief(state([
    cancellationDecision(true, true),
    cancellationDecision(true, false),
    cancellationDecision(false, true),
    cancellationDecision(false, false),
  ]))
  check(r.totalDecisions === 4, 'all-cells: totalDecisions 4')
  check(r.cancelledProviderCalledCount === 1, 'all-cells: cancelledProviderCalledCount 1')
  check(r.notCancelledNoProviderCount === 1, 'all-cells: notCancelledNoProviderCount 1')
  check(r.cancelledCount === 2, 'all-cells: cancelledCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceCancellationDecisionOrderCancelledProviderCalledBrief(state([
    cancellationDecision(true, true),
    cancellationDecision(true, false),
    cancellationDecision(false, true),
    cancellationDecision(false, false),
  ]))
  check(r.notCancelledCount === 2, 'row-totals: notCancelledCount 2')
  check(r.cancelledNoProviderCount === 1, 'row-totals: cancelledNoProviderCount 1')
}

console.log(`ecommerce-cancellation-decision-order-cancelled-provider-called-brief: ${checks} checks passed`)
