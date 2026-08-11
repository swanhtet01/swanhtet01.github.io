// Ecommerce cancellation decision order-status/actor brief.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionOrderStatusActorBrief } from './ecommerce-cancellation-decision-order-status-actor-brief.ts'`,
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

const { projectEcommerceCancellationDecisionOrderStatusActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision({ orderStatus = 'confirmed', actor = 'user-1' } = {}) {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `CD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `CI-${decisionId}`,
    intentDigest: `cid-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus,
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 10000,
    actor,
    reason: 'Shop decided to keep order',
    evidenceReference: `ev-${decisionId}`,
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    providerCalled: false,
  }
}

function state(cancellationDecisions) {
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
  const r = projectEcommerceCancellationDecisionOrderStatusActorBrief(state([]))
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.confirmedCount === 0, 'empty: confirmedCount 0')
  check(r.preparingCount === 0, 'empty: preparingCount 0')
  check(r.readyCount === 0, 'empty: readyCount 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.topActorsByCount.length === 0, 'empty: topActors empty')
}

// 2. All confirmed
{
  const r = projectEcommerceCancellationDecisionOrderStatusActorBrief(
    state([cancellationDecision({ orderStatus: 'confirmed' }), cancellationDecision({ orderStatus: 'confirmed' })]),
  )
  check(r.confirmedCount === 2, 'all-confirmed: confirmedCount 2')
  check(r.confirmedRate === 100, 'all-confirmed: confirmedRate 100')
  check(r.preparingRate === 0, 'all-confirmed: preparingRate 0')
}

// 3. All preparing
{
  const r = projectEcommerceCancellationDecisionOrderStatusActorBrief(
    state([cancellationDecision({ orderStatus: 'preparing' })]),
  )
  check(r.preparingCount === 1, 'all-preparing: preparingCount 1')
  check(r.preparingRate === 100, 'all-preparing: preparingRate 100')
}

// 4. All ready
{
  const r = projectEcommerceCancellationDecisionOrderStatusActorBrief(
    state([cancellationDecision({ orderStatus: 'ready' })]),
  )
  check(r.readyCount === 1, 'all-ready: readyCount 1')
  check(r.readyRate === 100, 'all-ready: readyRate 100')
}

// 5. Order status counts sum to total
{
  const r = projectEcommerceCancellationDecisionOrderStatusActorBrief(
    state([
      cancellationDecision({ orderStatus: 'confirmed' }),
      cancellationDecision({ orderStatus: 'preparing' }),
      cancellationDecision({ orderStatus: 'ready' }),
    ]),
  )
  check(r.confirmedCount + r.preparingCount + r.readyCount === r.totalDecisions, 'invariant: counts sum')
}

// 6. Actor distribution — unique actors
{
  const r = projectEcommerceCancellationDecisionOrderStatusActorBrief(
    state([
      cancellationDecision({ actor: 'alice' }),
      cancellationDecision({ actor: 'alice' }),
      cancellationDecision({ actor: 'bob' }),
    ]),
  )
  check(r.uniqueActors === 2, 'actor: uniqueActors 2')
  check(r.topActorsByCount[0]?.actor === 'alice', 'actor: top is alice')
  check(r.topActorsByCount[0]?.count === 2, 'actor: alice count 2')
}

// 7. Actor top-5 cap + alpha tiebreak
{
  const actors = ['zebra', 'alpha', 'charlie', 'bravo', 'delta', 'echo']
  const r = projectEcommerceCancellationDecisionOrderStatusActorBrief(
    state(actors.map(a => cancellationDecision({ actor: a }))),
  )
  check(r.topActorsByCount.length === 5, 'top5: capped at 5')
  check(r.topActorsByCount[0]?.actor === 'alpha', 'top5: alpha first (tiebreak)')
}

// 8. Rounding: 2/3 → 67%
{
  const r = projectEcommerceCancellationDecisionOrderStatusActorBrief(
    state([
      cancellationDecision({ orderStatus: 'confirmed' }),
      cancellationDecision({ orderStatus: 'confirmed' }),
      cancellationDecision({ orderStatus: 'preparing' }),
    ]),
  )
  check(r.confirmedRate === 67, 'round: confirmedRate 67')
  check(r.preparingRate === 33, 'round: preparingRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
