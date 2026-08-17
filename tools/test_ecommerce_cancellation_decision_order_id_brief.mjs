import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionOrderIdBrief } from './ecommerce-cancellation-decision-order-id-brief.ts'`,
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

const { projectEcommerceCancellationDecisionOrderIdBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(orderId = 'ORD-DEFAULT') {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `ECD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `ECN-${decisionId}`,
    intentDigest: `ind-${decisionId}`,
    orderId,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 15000,
    actor: 'shop-owner',
    reason: 'Order is already in progress',
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
  const r = projectEcommerceCancellationDecisionOrderIdBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.uniqueOrders === 0, 'empty: uniqueOrders 0')
  check(r.topOrder === null, 'empty: topOrder null')
  check(r.topOrderCount === 0, 'empty: topOrderCount 0')
}

// 2. Single decision — one unique order
{
  const r = projectEcommerceCancellationDecisionOrderIdBrief(state([cancellationDecision('ORD-001')]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.uniqueOrders === 1, 'single: uniqueOrders 1')
  check(r.topOrder === 'ORD-001', 'single: topOrder')
  check(r.topOrderCount === 1, 'single: topOrderCount 1')
}

// 3. Two decisions same order — uniqueOrders 1, topCount 2
{
  const r = projectEcommerceCancellationDecisionOrderIdBrief(state([
    cancellationDecision('ORD-002'),
    cancellationDecision('ORD-002'),
  ]))
  check(r.totalDecisions === 2, 'same-order: totalDecisions 2')
  check(r.uniqueOrders === 1, 'same-order: uniqueOrders 1')
  check(r.topOrder === 'ORD-002', 'same-order: topOrder')
  check(r.topOrderCount === 2, 'same-order: topOrderCount 2')
}

// 4. Two decisions different orders — uniqueOrders 2
{
  const r = projectEcommerceCancellationDecisionOrderIdBrief(state([
    cancellationDecision('ORD-003'),
    cancellationDecision('ORD-004'),
  ]))
  check(r.totalDecisions === 2, 'two-diff: totalDecisions 2')
  check(r.uniqueOrders === 2, 'two-diff: uniqueOrders 2')
  check(r.topOrderCount === 1, 'two-diff: topOrderCount 1')
  check(r.topOrder !== null, 'two-diff: topOrder set')
}

// 5. Three decisions: one order appears twice — dominant topOrder
{
  const r = projectEcommerceCancellationDecisionOrderIdBrief(state([
    cancellationDecision('ORD-005'),
    cancellationDecision('ORD-006'),
    cancellationDecision('ORD-005'),
  ]))
  check(r.totalDecisions === 3, 'dominant: totalDecisions 3')
  check(r.uniqueOrders === 2, 'dominant: uniqueOrders 2')
  check(r.topOrder === 'ORD-005', 'dominant: topOrder')
  check(r.topOrderCount === 2, 'dominant: topOrderCount 2')
}

// 6. Three decisions all different — uniqueOrders 3, topCount 1
{
  const r = projectEcommerceCancellationDecisionOrderIdBrief(state([
    cancellationDecision('ORD-007'),
    cancellationDecision('ORD-008'),
    cancellationDecision('ORD-009'),
  ]))
  check(r.totalDecisions === 3, 'all-diff: totalDecisions 3')
  check(r.uniqueOrders === 3, 'all-diff: uniqueOrders 3')
  check(r.topOrderCount === 1, 'all-diff: topOrderCount 1')
}

console.log(`ecommerce-cancellation-decision-order-id-brief: ${checks} checks passed`)
