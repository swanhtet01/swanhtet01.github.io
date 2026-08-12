import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionActorBrief } from './ecommerce-cancellation-decision-actor-brief.ts'`,
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

const { projectEcommerceCancellationDecisionActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(actor = 'staff-default') {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `ECD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `ECN-${decisionId}`,
    intentDigest: `id-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 12000,
    actor,
    reason: 'Order kept as shop policy',
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
  const r = projectEcommerceCancellationDecisionActorBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.topActor === null, 'empty: topActor null')
  check(r.topActorCount === 0, 'empty: topActorCount 0')
}

// 2. Single decision — one unique actor
{
  const r = projectEcommerceCancellationDecisionActorBrief(state([cancellationDecision('staff-001')]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.uniqueActors === 1, 'single: uniqueActors 1')
  check(r.topActor === 'staff-001', 'single: topActor')
  check(r.topActorCount === 1, 'single: topActorCount 1')
}

// 3. Two decisions same actor — uniqueActors 1, topCount 2
{
  const r = projectEcommerceCancellationDecisionActorBrief(state([
    cancellationDecision('staff-002'),
    cancellationDecision('staff-002'),
  ]))
  check(r.totalDecisions === 2, 'same-actor: totalDecisions 2')
  check(r.uniqueActors === 1, 'same-actor: uniqueActors 1')
  check(r.topActor === 'staff-002', 'same-actor: topActor')
  check(r.topActorCount === 2, 'same-actor: topActorCount 2')
}

// 4. Two decisions different actors — uniqueActors 2
{
  const r = projectEcommerceCancellationDecisionActorBrief(state([
    cancellationDecision('staff-003'),
    cancellationDecision('staff-004'),
  ]))
  check(r.totalDecisions === 2, 'two-diff: totalDecisions 2')
  check(r.uniqueActors === 2, 'two-diff: uniqueActors 2')
  check(r.topActorCount === 1, 'two-diff: topActorCount 1')
  check(r.topActor !== null, 'two-diff: topActor set')
}

// 5. Three decisions: one actor appears twice — dominant top
{
  const r = projectEcommerceCancellationDecisionActorBrief(state([
    cancellationDecision('staff-005'),
    cancellationDecision('staff-006'),
    cancellationDecision('staff-005'),
  ]))
  check(r.totalDecisions === 3, 'dominant: totalDecisions 3')
  check(r.uniqueActors === 2, 'dominant: uniqueActors 2')
  check(r.topActor === 'staff-005', 'dominant: topActor')
  check(r.topActorCount === 2, 'dominant: topActorCount 2')
}

// 6. Three decisions all different — uniqueActors 3, topCount 1
{
  const r = projectEcommerceCancellationDecisionActorBrief(state([
    cancellationDecision('staff-007'),
    cancellationDecision('staff-008'),
    cancellationDecision('staff-009'),
  ]))
  check(r.totalDecisions === 3, 'all-diff: totalDecisions 3')
  check(r.uniqueActors === 3, 'all-diff: uniqueActors 3')
  check(r.topActorCount === 1, 'all-diff: topActorCount 1')
}

console.log(`ecommerce-cancellation-decision-actor-brief: ${checks} checks passed`)
