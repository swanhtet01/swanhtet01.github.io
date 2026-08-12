import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionOrderStatusBrief } from './ecommerce-cancellation-decision-order-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(orderStatus = 'confirmed') {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `ECD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `ECN-${decisionId}`,
    intentDigest: `idig-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus,
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
  const r = projectEcommerceCancellationDecisionOrderStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.confirmedCount === 0, 'empty: confirmedCount 0')
  check(r.preparingCount === 0, 'empty: preparingCount 0')
  check(r.readyCount === 0, 'empty: readyCount 0')
}

// 2. All confirmed
{
  const r = projectEcommerceCancellationDecisionOrderStatusBrief(state([
    cancellationDecision('confirmed'),
    cancellationDecision('confirmed'),
    cancellationDecision('confirmed'),
  ]))
  check(r.totalDecisions === 3, 'all-confirmed: totalDecisions 3')
  check(r.confirmedCount === 3, 'all-confirmed: confirmedCount 3')
  check(r.preparingCount === 0, 'all-confirmed: preparingCount 0')
  check(r.confirmedCount + r.preparingCount + r.readyCount === r.totalDecisions, 'all-confirmed: sum = total')
}

// 3. All preparing
{
  const r = projectEcommerceCancellationDecisionOrderStatusBrief(state([
    cancellationDecision('preparing'),
    cancellationDecision('preparing'),
  ]))
  check(r.totalDecisions === 2, 'all-preparing: totalDecisions 2')
  check(r.confirmedCount === 0, 'all-preparing: confirmedCount 0')
  check(r.preparingCount === 2, 'all-preparing: preparingCount 2')
  check(r.readyCount === 0, 'all-preparing: readyCount 0')
}

// 4. All ready
{
  const r = projectEcommerceCancellationDecisionOrderStatusBrief(state([
    cancellationDecision('ready'),
    cancellationDecision('ready'),
  ]))
  check(r.totalDecisions === 2, 'all-ready: totalDecisions 2')
  check(r.confirmedCount === 0, 'all-ready: confirmedCount 0')
  check(r.preparingCount === 0, 'all-ready: preparingCount 0')
  check(r.readyCount === 2, 'all-ready: readyCount 2')
}

// 5. Mixed one of each
{
  const r = projectEcommerceCancellationDecisionOrderStatusBrief(state([
    cancellationDecision('confirmed'),
    cancellationDecision('preparing'),
    cancellationDecision('ready'),
  ]))
  check(r.totalDecisions === 3, 'mixed: totalDecisions 3')
  check(r.confirmedCount === 1, 'mixed: confirmedCount 1')
  check(r.preparingCount === 1, 'mixed: preparingCount 1')
  check(r.confirmedCount + r.preparingCount + r.readyCount === r.totalDecisions, 'mixed: sum = total')
}

// 6. Single confirmed
{
  const r = projectEcommerceCancellationDecisionOrderStatusBrief(state([cancellationDecision('confirmed')]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.confirmedCount === 1, 'single: confirmedCount 1')
  check(r.preparingCount === 0, 'single: preparingCount 0')
}

console.log(`ecommerce-cancellation-decision-order-status-brief: ${checks} checks passed`)
