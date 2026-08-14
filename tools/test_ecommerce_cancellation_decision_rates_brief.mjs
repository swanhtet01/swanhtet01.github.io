import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionRatesBrief } from './ecommerce-cancellation-decision-rates-brief.ts'`,
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

const { projectEcommerceCancellationDecisionRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision({
  customerMessageSent = false,
  orderCancelled = false,
  refundStarted = false,
  providerCalled = false,
} = {}) {
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
    customerMessageSent,
    orderCancelled,
    refundStarted,
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

// 1. Empty state — 9 checks
{
  const r = projectEcommerceCancellationDecisionRatesBrief(state())
  check(r.totalDecisions === 0, 'empty:totalDecisions')
  check(r.orderCancelledCount === 0, 'empty:orderCancelledCount')
  check(r.orderCancelledRate === 0, 'empty:orderCancelledRate')
  check(r.customerNotificationCount === 0, 'empty:customerNotificationCount')
  check(r.customerNotificationRate === 0, 'empty:customerNotificationRate')
  check(r.refundStartedCount === 0, 'empty:refundStartedCount')
  check(r.refundStartedRate === 0, 'empty:refundStartedRate')
  check(r.providerEscalationCount === 0, 'empty:providerEscalationCount')
  check(r.providerEscalationRate === 0, 'empty:providerEscalationRate')
}

// 2. Single decision, all false — 5 checks
{
  const r = projectEcommerceCancellationDecisionRatesBrief(state([cancellationDecision()]))
  check(r.totalDecisions === 1, 'single:total')
  check(r.orderCancelledCount === 0, 'single:orderCancelledCount')
  check(r.customerNotificationCount === 0, 'single:customerNotificationCount')
  check(r.refundStartedCount === 0, 'single:refundStartedCount')
  check(r.providerEscalationCount === 0, 'single:providerEscalationCount')
}

// 3. orderCancelled only — 2 checks
{
  const r = projectEcommerceCancellationDecisionRatesBrief(state([cancellationDecision({ orderCancelled: true })]))
  check(r.orderCancelledCount === 1, 'cancelled:count')
  check(r.orderCancelledRate === 1, 'cancelled:rate')
}

// 4. customerMessageSent only — 2 checks
{
  const r = projectEcommerceCancellationDecisionRatesBrief(state([cancellationDecision({ customerMessageSent: true })]))
  check(r.customerNotificationCount === 1, 'notified:count')
  check(r.customerNotificationRate === 1, 'notified:rate')
}

// 5. refundStarted only — 2 checks
{
  const r = projectEcommerceCancellationDecisionRatesBrief(state([cancellationDecision({ refundStarted: true })]))
  check(r.refundStartedCount === 1, 'refund:count')
  check(r.refundStartedRate === 1, 'refund:rate')
}

// 6. providerCalled only — 1 check
{
  const r = projectEcommerceCancellationDecisionRatesBrief(state([cancellationDecision({ providerCalled: true })]))
  check(r.providerEscalationCount === 1, 'provider:count')
}

// 7. 2 decisions mixed — 2 checks
{
  const r = projectEcommerceCancellationDecisionRatesBrief(state([
    cancellationDecision({ orderCancelled: true, customerMessageSent: true, refundStarted: true, providerCalled: true }),
    cancellationDecision(),
  ]))
  check(r.totalDecisions === 2, 'mixed:total')
  check(r.providerEscalationRate === 0.5, 'mixed:providerEscalationRate')
}

console.log(`ecommerce-cancellation-decision-rates-brief: ${checks} checks passed`)
