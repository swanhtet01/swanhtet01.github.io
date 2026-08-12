import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionIntentIdBrief } from './ecommerce-cancellation-decision-intent-id-brief.ts'`,
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

const { projectEcommerceCancellationDecisionIntentIdBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(intentId = 'ECN-DEFAULT') {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `ECD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId,
    intentDigest: `idig-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
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
  const r = projectEcommerceCancellationDecisionIntentIdBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.uniqueIntents === 0, 'empty: uniqueIntents 0')
  check(r.topIntent === null, 'empty: topIntent null')
  check(r.topIntentCount === 0, 'empty: topIntentCount 0')
}

// 2. Single decision — one unique intent
{
  const r = projectEcommerceCancellationDecisionIntentIdBrief(state([cancellationDecision('ECN-001')]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.uniqueIntents === 1, 'single: uniqueIntents 1')
  check(r.topIntent === 'ECN-001', 'single: topIntent')
  check(r.topIntentCount === 1, 'single: topIntentCount 1')
}

// 3. Two decisions same intent — uniqueIntents 1, topCount 2
{
  const r = projectEcommerceCancellationDecisionIntentIdBrief(state([
    cancellationDecision('ECN-002'),
    cancellationDecision('ECN-002'),
  ]))
  check(r.totalDecisions === 2, 'same-intent: totalDecisions 2')
  check(r.uniqueIntents === 1, 'same-intent: uniqueIntents 1')
  check(r.topIntent === 'ECN-002', 'same-intent: topIntent')
  check(r.topIntentCount === 2, 'same-intent: topIntentCount 2')
}

// 4. Two decisions different intents — uniqueIntents 2
{
  const r = projectEcommerceCancellationDecisionIntentIdBrief(state([
    cancellationDecision('ECN-003'),
    cancellationDecision('ECN-004'),
  ]))
  check(r.totalDecisions === 2, 'two-diff: totalDecisions 2')
  check(r.uniqueIntents === 2, 'two-diff: uniqueIntents 2')
  check(r.topIntentCount === 1, 'two-diff: topIntentCount 1')
  check(r.topIntent !== null, 'two-diff: topIntent set')
}

// 5. Three decisions: one intent appears twice — dominant top
{
  const r = projectEcommerceCancellationDecisionIntentIdBrief(state([
    cancellationDecision('ECN-005'),
    cancellationDecision('ECN-006'),
    cancellationDecision('ECN-005'),
  ]))
  check(r.totalDecisions === 3, 'dominant: totalDecisions 3')
  check(r.uniqueIntents === 2, 'dominant: uniqueIntents 2')
  check(r.topIntent === 'ECN-005', 'dominant: topIntent')
  check(r.topIntentCount === 2, 'dominant: topIntentCount 2')
}

// 6. Three decisions all different — uniqueIntents 3, topCount 1
{
  const r = projectEcommerceCancellationDecisionIntentIdBrief(state([
    cancellationDecision('ECN-007'),
    cancellationDecision('ECN-008'),
    cancellationDecision('ECN-009'),
  ]))
  check(r.totalDecisions === 3, 'all-diff: totalDecisions 3')
  check(r.uniqueIntents === 3, 'all-diff: uniqueIntents 3')
  check(r.topIntentCount === 1, 'all-diff: topIntentCount 1')
}

console.log(`ecommerce-cancellation-decision-intent-id-brief: ${checks} checks passed`)
