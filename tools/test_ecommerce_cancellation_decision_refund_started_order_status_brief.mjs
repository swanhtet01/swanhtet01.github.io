import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionRefundStartedOrderStatusBrief } from './ecommerce-cancellation-decision-refund-started-order-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionRefundStartedOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(refundStarted = false, orderStatus = 'confirmed') {
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
    orderStatus,
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 10000,
    actor: 'staff-1',
    reason: 'Keeping the order',
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

// 1. Empty state
{
  const r = projectEcommerceCancellationDecisionRefundStartedOrderStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.refundStartedConfirmedCount === 0, 'empty: refundStartedConfirmedCount 0')
  check(r.noRefundConfirmedCount === 0, 'empty: noRefundConfirmedCount 0')
}

// 2. Refund started + confirmed
{
  const r = projectEcommerceCancellationDecisionRefundStartedOrderStatusBrief(state([
    cancellationDecision(true, 'confirmed'),
  ]))
  check(r.totalDecisions === 1, 'refund-confirmed: totalDecisions 1')
  check(r.refundStartedConfirmedCount === 1, 'refund-confirmed: refundStartedConfirmedCount 1')
  check(r.refundStartedPreparingCount === 0, 'refund-confirmed: refundStartedPreparingCount 0')
  check(r.noRefundConfirmedCount === 0, 'refund-confirmed: noRefundConfirmedCount 0')
}

// 3. Refund started + preparing
{
  const r = projectEcommerceCancellationDecisionRefundStartedOrderStatusBrief(state([
    cancellationDecision(true, 'preparing'),
  ]))
  check(r.totalDecisions === 1, 'refund-preparing: totalDecisions 1')
  check(r.refundStartedPreparingCount === 1, 'refund-preparing: refundStartedPreparingCount 1')
  check(r.refundStartedReadyCount === 0, 'refund-preparing: refundStartedReadyCount 0')
  check(r.refundStartedConfirmedCount === 0, 'refund-preparing: refundStartedConfirmedCount 0')
}

// 4. Refund started + ready
{
  const r = projectEcommerceCancellationDecisionRefundStartedOrderStatusBrief(state([
    cancellationDecision(true, 'ready'),
  ]))
  check(r.totalDecisions === 1, 'refund-ready: totalDecisions 1')
  check(r.refundStartedReadyCount === 1, 'refund-ready: refundStartedReadyCount 1')
  check(r.noRefundReadyCount === 0, 'refund-ready: noRefundReadyCount 0')
}

// 5. No refund + confirmed
{
  const r = projectEcommerceCancellationDecisionRefundStartedOrderStatusBrief(state([
    cancellationDecision(false, 'confirmed'),
  ]))
  check(r.totalDecisions === 1, 'norefund-confirmed: totalDecisions 1')
  check(r.noRefundConfirmedCount === 1, 'norefund-confirmed: noRefundConfirmedCount 1')
  check(r.refundStartedConfirmedCount === 0, 'norefund-confirmed: refundStartedConfirmedCount 0')
}

// 6. Mixed: 2 refund+confirmed, 1 noRefund+preparing, 1 noRefund+ready
{
  const r = projectEcommerceCancellationDecisionRefundStartedOrderStatusBrief(state([
    cancellationDecision(true, 'confirmed'),
    cancellationDecision(true, 'confirmed'),
    cancellationDecision(false, 'preparing'),
    cancellationDecision(false, 'ready'),
  ]))
  check(r.totalDecisions === 4, 'mixed: totalDecisions 4')
  check(r.refundStartedConfirmedCount === 2, 'mixed: refundStartedConfirmedCount 2')
  check(r.noRefundPreparingCount === 1, 'mixed: noRefundPreparingCount 1')
  check(r.noRefundReadyCount === 1, 'mixed: noRefundReadyCount 1')
}

// 7. All noRefund + preparing
{
  const r = projectEcommerceCancellationDecisionRefundStartedOrderStatusBrief(state([
    cancellationDecision(false, 'preparing'),
    cancellationDecision(false, 'preparing'),
    cancellationDecision(false, 'preparing'),
  ]))
  check(r.totalDecisions === 3, 'all-norefund-preparing: totalDecisions 3')
  check(r.noRefundPreparingCount === 3, 'all-norefund-preparing: noRefundPreparingCount 3')
}

console.log(`ecommerce-cancellation-decision-refund-started-order-status-brief: ${checks} checks passed`)
