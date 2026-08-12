import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionRefundStartedRatesBrief } from './ecommerce-cancellation-decision-refund-started-rates-brief.ts'`,
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

const { projectEcommerceCancellationDecisionRefundStartedRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision({ refundStarted = false } = {}) {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `ECD-${decisionId}`,
    idempotencyKey: `CDI-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `ECI-${decisionId}`,
    intentDigest: `id-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 5000,
    actor: `actor-${decisionId}`,
    reason: 'Decision reason',
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceCancellationDecisionRefundStartedRatesBrief(state())
  check(r.totalDecisions === 0, 'empty:totalDecisions')
  check(r.refundStartedCount === 0, 'empty:refundStartedCount')
  check(r.refundStartedRate === 0, 'empty:refundStartedRate')
  check(r.notRefundStartedCount === 0, 'empty:notRefundStartedCount')
  check(r.notRefundStartedRate === 0, 'empty:notRefundStartedRate')
}

// 2. Single started — 3 checks
{
  const r = projectEcommerceCancellationDecisionRefundStartedRatesBrief(state([
    cancellationDecision({ refundStarted: true }),
  ]))
  check(r.totalDecisions === 1, 'started:total')
  check(r.refundStartedCount === 1, 'started:count')
  check(r.refundStartedRate === 1, 'started:rate')
}

// 3. Single not started — 3 checks
{
  const r = projectEcommerceCancellationDecisionRefundStartedRatesBrief(state([cancellationDecision()]))
  check(r.totalDecisions === 1, 'notStarted:total')
  check(r.notRefundStartedCount === 1, 'notStarted:count')
  check(r.notRefundStartedRate === 1, 'notStarted:rate')
}

// 4. 2 started — 3 checks
{
  const r = projectEcommerceCancellationDecisionRefundStartedRatesBrief(state([
    cancellationDecision({ refundStarted: true }),
    cancellationDecision({ refundStarted: true }),
  ]))
  check(r.refundStartedCount === 2, 'twoStarted:count')
  check(r.notRefundStartedCount === 0, 'twoStarted:notCount')
  check(r.refundStartedRate === 1, 'twoStarted:rate')
}

// 5. 2 not started — 2 checks
{
  const r = projectEcommerceCancellationDecisionRefundStartedRatesBrief(state([
    cancellationDecision(),
    cancellationDecision(),
  ]))
  check(r.notRefundStartedCount === 2, 'twoNotStarted:count')
  check(r.refundStartedCount === 0, 'twoNotStarted:startedCount')
}

// 6. 1 started + 1 not started — 3 checks
{
  const r = projectEcommerceCancellationDecisionRefundStartedRatesBrief(state([
    cancellationDecision({ refundStarted: true }),
    cancellationDecision(),
  ]))
  check(r.totalDecisions === 2, 'half:total')
  check(r.refundStartedRate === 0.5, 'half:startedRate')
  check(r.notRefundStartedRate === 0.5, 'half:notStartedRate')
}

// 7. Precision: 1 started + 2 not started (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceCancellationDecisionRefundStartedRatesBrief(state([
    cancellationDecision({ refundStarted: true }),
    cancellationDecision(),
    cancellationDecision(),
  ]))
  check(r.totalDecisions === 3, 'precision:total')
  check(r.refundStartedCount === 1, 'precision:startedCount')
  check(r.refundStartedRate === 0.3333, 'precision:startedRate')
  check(r.notRefundStartedRate === 0.6667, 'precision:notStartedRate')
}

console.log(`ecommerce-cancellation-decision-refund-started-rates-brief: ${checks} checks passed`)
