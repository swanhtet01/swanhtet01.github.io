import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionProviderCalledRatesBrief } from './ecommerce-cancellation-decision-provider-called-rates-brief.ts'`,
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

const { projectEcommerceCancellationDecisionProviderCalledRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision({ providerCalled = false } = {}) {
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceCancellationDecisionProviderCalledRatesBrief(state())
  check(r.totalDecisions === 0, 'empty:totalDecisions')
  check(r.providerCalledCount === 0, 'empty:providerCalledCount')
  check(r.providerCalledRate === 0, 'empty:providerCalledRate')
  check(r.notProviderCalledCount === 0, 'empty:notProviderCalledCount')
  check(r.notProviderCalledRate === 0, 'empty:notProviderCalledRate')
}

// 2. Single provider called — 3 checks
{
  const r = projectEcommerceCancellationDecisionProviderCalledRatesBrief(state([
    cancellationDecision({ providerCalled: true }),
  ]))
  check(r.totalDecisions === 1, 'called:total')
  check(r.providerCalledCount === 1, 'called:count')
  check(r.providerCalledRate === 1, 'called:rate')
}

// 3. Single not called — 3 checks
{
  const r = projectEcommerceCancellationDecisionProviderCalledRatesBrief(state([cancellationDecision()]))
  check(r.totalDecisions === 1, 'notCalled:total')
  check(r.notProviderCalledCount === 1, 'notCalled:count')
  check(r.notProviderCalledRate === 1, 'notCalled:rate')
}

// 4. 2 called — 3 checks
{
  const r = projectEcommerceCancellationDecisionProviderCalledRatesBrief(state([
    cancellationDecision({ providerCalled: true }),
    cancellationDecision({ providerCalled: true }),
  ]))
  check(r.providerCalledCount === 2, 'twoCalled:count')
  check(r.notProviderCalledCount === 0, 'twoCalled:notCount')
  check(r.providerCalledRate === 1, 'twoCalled:rate')
}

// 5. 2 not called — 2 checks
{
  const r = projectEcommerceCancellationDecisionProviderCalledRatesBrief(state([
    cancellationDecision(),
    cancellationDecision(),
  ]))
  check(r.notProviderCalledCount === 2, 'twoNotCalled:count')
  check(r.providerCalledCount === 0, 'twoNotCalled:calledCount')
}

// 6. 1 called + 1 not called — 3 checks
{
  const r = projectEcommerceCancellationDecisionProviderCalledRatesBrief(state([
    cancellationDecision({ providerCalled: true }),
    cancellationDecision(),
  ]))
  check(r.totalDecisions === 2, 'half:total')
  check(r.providerCalledRate === 0.5, 'half:calledRate')
  check(r.notProviderCalledRate === 0.5, 'half:notCalledRate')
}

// 7. Precision: 1 called + 2 not called (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceCancellationDecisionProviderCalledRatesBrief(state([
    cancellationDecision({ providerCalled: true }),
    cancellationDecision(),
    cancellationDecision(),
  ]))
  check(r.totalDecisions === 3, 'precision:total')
  check(r.providerCalledCount === 1, 'precision:calledCount')
  check(r.providerCalledRate === 0.3333, 'precision:calledRate')
  check(r.notProviderCalledRate === 0.6667, 'precision:notCalledRate')
}

console.log(`ecommerce-cancellation-decision-provider-called-rates-brief: ${checks} checks passed`)
