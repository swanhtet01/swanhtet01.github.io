import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionSourceRequestIdBrief } from './ecommerce-cancellation-decision-source-request-id-brief.ts'`,
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

const { projectEcommerceCancellationDecisionSourceRequestIdBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(sourceRequestId = 'REQ-DEFAULT') {
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
    sourceRequestId,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 12000,
    actor: `staff-${decisionId}`,
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
  const r = projectEcommerceCancellationDecisionSourceRequestIdBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.uniqueSourceRequests === 0, 'empty: uniqueSourceRequests 0')
  check(r.topSourceRequest === null, 'empty: topSourceRequest null')
  check(r.topSourceRequestCount === 0, 'empty: topSourceRequestCount 0')
}

// 2. Single decision — one unique source request
{
  const r = projectEcommerceCancellationDecisionSourceRequestIdBrief(state([cancellationDecision('REQ-001')]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.uniqueSourceRequests === 1, 'single: uniqueSourceRequests 1')
  check(r.topSourceRequest === 'REQ-001', 'single: topSourceRequest')
  check(r.topSourceRequestCount === 1, 'single: topSourceRequestCount 1')
}

// 3. Two decisions same source request — uniqueSourceRequests 1, topCount 2
{
  const r = projectEcommerceCancellationDecisionSourceRequestIdBrief(state([
    cancellationDecision('REQ-002'),
    cancellationDecision('REQ-002'),
  ]))
  check(r.totalDecisions === 2, 'same-req: totalDecisions 2')
  check(r.uniqueSourceRequests === 1, 'same-req: uniqueSourceRequests 1')
  check(r.topSourceRequest === 'REQ-002', 'same-req: topSourceRequest')
  check(r.topSourceRequestCount === 2, 'same-req: topSourceRequestCount 2')
}

// 4. Two decisions different source requests — uniqueSourceRequests 2
{
  const r = projectEcommerceCancellationDecisionSourceRequestIdBrief(state([
    cancellationDecision('REQ-003'),
    cancellationDecision('REQ-004'),
  ]))
  check(r.totalDecisions === 2, 'two-diff: totalDecisions 2')
  check(r.uniqueSourceRequests === 2, 'two-diff: uniqueSourceRequests 2')
  check(r.topSourceRequestCount === 1, 'two-diff: topSourceRequestCount 1')
  check(r.topSourceRequest !== null, 'two-diff: topSourceRequest set')
}

// 5. Three decisions: one source request appears twice — dominant top
{
  const r = projectEcommerceCancellationDecisionSourceRequestIdBrief(state([
    cancellationDecision('REQ-005'),
    cancellationDecision('REQ-006'),
    cancellationDecision('REQ-005'),
  ]))
  check(r.totalDecisions === 3, 'dominant: totalDecisions 3')
  check(r.uniqueSourceRequests === 2, 'dominant: uniqueSourceRequests 2')
  check(r.topSourceRequest === 'REQ-005', 'dominant: topSourceRequest')
  check(r.topSourceRequestCount === 2, 'dominant: topSourceRequestCount 2')
}

// 6. Three decisions all different — uniqueSourceRequests 3, topCount 1
{
  const r = projectEcommerceCancellationDecisionSourceRequestIdBrief(state([
    cancellationDecision('REQ-007'),
    cancellationDecision('REQ-008'),
    cancellationDecision('REQ-009'),
  ]))
  check(r.totalDecisions === 3, 'all-diff: totalDecisions 3')
  check(r.uniqueSourceRequests === 3, 'all-diff: uniqueSourceRequests 3')
  check(r.topSourceRequestCount === 1, 'all-diff: topSourceRequestCount 1')
}

console.log(`ecommerce-cancellation-decision-source-request-id-brief: ${checks} checks passed`)
