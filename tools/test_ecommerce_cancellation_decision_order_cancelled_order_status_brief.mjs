import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionOrderCancelledOrderStatusBrief } from './ecommerce-cancellation-decision-order-cancelled-order-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionOrderCancelledOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(orderCancelled = false, orderStatus = 'confirmed') {
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
    orderCancelled,
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
  const r = projectEcommerceCancellationDecisionOrderCancelledOrderStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.cancelledConfirmedCount === 0, 'empty: cancelledConfirmedCount 0')
  check(r.notCancelledConfirmedCount === 0, 'empty: notCancelledConfirmedCount 0')
}

// 2. Cancelled + confirmed
{
  const r = projectEcommerceCancellationDecisionOrderCancelledOrderStatusBrief(state([
    cancellationDecision(true, 'confirmed'),
  ]))
  check(r.totalDecisions === 1, 'cancelled-confirmed: totalDecisions 1')
  check(r.cancelledConfirmedCount === 1, 'cancelled-confirmed: cancelledConfirmedCount 1')
  check(r.cancelledPreparingCount === 0, 'cancelled-confirmed: cancelledPreparingCount 0')
  check(r.notCancelledConfirmedCount === 0, 'cancelled-confirmed: notCancelledConfirmedCount 0')
}

// 3. Cancelled + preparing
{
  const r = projectEcommerceCancellationDecisionOrderCancelledOrderStatusBrief(state([
    cancellationDecision(true, 'preparing'),
  ]))
  check(r.totalDecisions === 1, 'cancelled-preparing: totalDecisions 1')
  check(r.cancelledPreparingCount === 1, 'cancelled-preparing: cancelledPreparingCount 1')
  check(r.cancelledReadyCount === 0, 'cancelled-preparing: cancelledReadyCount 0')
  check(r.cancelledConfirmedCount === 0, 'cancelled-preparing: cancelledConfirmedCount 0')
}

// 4. Cancelled + ready
{
  const r = projectEcommerceCancellationDecisionOrderCancelledOrderStatusBrief(state([
    cancellationDecision(true, 'ready'),
  ]))
  check(r.totalDecisions === 1, 'cancelled-ready: totalDecisions 1')
  check(r.cancelledReadyCount === 1, 'cancelled-ready: cancelledReadyCount 1')
  check(r.notCancelledReadyCount === 0, 'cancelled-ready: notCancelledReadyCount 0')
}

// 5. Not cancelled + confirmed
{
  const r = projectEcommerceCancellationDecisionOrderCancelledOrderStatusBrief(state([
    cancellationDecision(false, 'confirmed'),
  ]))
  check(r.totalDecisions === 1, 'notcancelled-confirmed: totalDecisions 1')
  check(r.notCancelledConfirmedCount === 1, 'notcancelled-confirmed: notCancelledConfirmedCount 1')
  check(r.cancelledConfirmedCount === 0, 'notcancelled-confirmed: cancelledConfirmedCount 0')
}

// 6. Mixed: 2 cancelled+confirmed, 1 notCancelled+preparing, 1 notCancelled+ready
{
  const r = projectEcommerceCancellationDecisionOrderCancelledOrderStatusBrief(state([
    cancellationDecision(true, 'confirmed'),
    cancellationDecision(true, 'confirmed'),
    cancellationDecision(false, 'preparing'),
    cancellationDecision(false, 'ready'),
  ]))
  check(r.totalDecisions === 4, 'mixed: totalDecisions 4')
  check(r.cancelledConfirmedCount === 2, 'mixed: cancelledConfirmedCount 2')
  check(r.notCancelledPreparingCount === 1, 'mixed: notCancelledPreparingCount 1')
  check(r.notCancelledReadyCount === 1, 'mixed: notCancelledReadyCount 1')
}

// 7. All not cancelled + preparing
{
  const r = projectEcommerceCancellationDecisionOrderCancelledOrderStatusBrief(state([
    cancellationDecision(false, 'preparing'),
    cancellationDecision(false, 'preparing'),
    cancellationDecision(false, 'preparing'),
  ]))
  check(r.totalDecisions === 3, 'all-notcancelled-preparing: totalDecisions 3')
  check(r.notCancelledPreparingCount === 3, 'all-notcancelled-preparing: notCancelledPreparingCount 3')
}

console.log(`ecommerce-cancellation-decision-order-cancelled-order-status-brief: ${checks} checks passed`)
