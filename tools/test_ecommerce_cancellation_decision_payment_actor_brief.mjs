import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionPaymentActorBrief } from './ecommerce-cancellation-decision-payment-actor-brief.ts'`,
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

const { projectEcommerceCancellationDecisionPaymentActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(paymentStatus = 'pending', actor = 'staff-1') {
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
    actor,
    reason: 'Keeping the order',
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
  const r = projectEcommerceCancellationDecisionPaymentActorBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.pendingCount === 0, 'empty: pendingCount 0')
  check(r.reconciledCount === 0, 'empty: reconciledCount 0')
}

// 2. Single pending — actor-a
{
  const r = projectEcommerceCancellationDecisionPaymentActorBrief(state([
    cancellationDecision('pending', 'actor-a'),
  ]))
  check(r.totalDecisions === 1, 'single-pending: totalDecisions 1')
  check(r.pendingCount === 1, 'single-pending: pendingCount 1')
  check(r.pendingTopActor === 'actor-a', 'single-pending: pendingTopActor actor-a')
  check(r.pendingTopActorCount === 1, 'single-pending: pendingTopActorCount 1')
}

// 3. Single reconciled — actor-b
{
  const r = projectEcommerceCancellationDecisionPaymentActorBrief(state([
    cancellationDecision('reconciled', 'actor-b'),
  ]))
  check(r.totalDecisions === 1, 'single-reconciled: totalDecisions 1')
  check(r.reconciledCount === 1, 'single-reconciled: reconciledCount 1')
  check(r.reconciledTopActor === 'actor-b', 'single-reconciled: reconciledTopActor actor-b')
  check(r.reconciledTopActorCount === 1, 'single-reconciled: reconciledTopActorCount 1')
}

// 4. Two pending same actor — actor-a wins top
{
  const r = projectEcommerceCancellationDecisionPaymentActorBrief(state([
    cancellationDecision('pending', 'actor-a'),
    cancellationDecision('pending', 'actor-a'),
  ]))
  check(r.pendingCount === 2, 'two-pending-same: pendingCount 2')
  check(r.pendingTopActor === 'actor-a', 'two-pending-same: pendingTopActor actor-a')
  check(r.pendingTopActorCount === 2, 'two-pending-same: pendingTopActorCount 2')
  check(r.reconciledCount === 0, 'two-pending-same: reconciledCount 0')
}

// 5. Two reconciled, actor-c more frequent than actor-d
{
  const r = projectEcommerceCancellationDecisionPaymentActorBrief(state([
    cancellationDecision('reconciled', 'actor-c'),
    cancellationDecision('reconciled', 'actor-c'),
    cancellationDecision('reconciled', 'actor-d'),
  ]))
  check(r.reconciledCount === 3, 'reconciled-top: reconciledCount 3')
  check(r.reconciledTopActor === 'actor-c', 'reconciled-top: reconciledTopActor actor-c')
  check(r.reconciledTopActorCount === 2, 'reconciled-top: reconciledTopActorCount 2')
  check(r.pendingTopActor === null, 'reconciled-top: pendingTopActor null')
}

// 6. Mixed: 2 pending (actor-a) + 2 reconciled (actor-b, actor-c)
{
  const r = projectEcommerceCancellationDecisionPaymentActorBrief(state([
    cancellationDecision('pending', 'actor-a'),
    cancellationDecision('pending', 'actor-a'),
    cancellationDecision('reconciled', 'actor-b'),
    cancellationDecision('reconciled', 'actor-c'),
  ]))
  check(r.totalDecisions === 4, 'mixed: totalDecisions 4')
  check(r.pendingCount === 2, 'mixed: pendingCount 2')
  check(r.reconciledCount === 2, 'mixed: reconciledCount 2')
  check(r.pendingTopActor === 'actor-a', 'mixed: pendingTopActor actor-a')
}

console.log(`ecommerce-cancellation-decision-payment-actor-brief: ${checks} checks passed`)
