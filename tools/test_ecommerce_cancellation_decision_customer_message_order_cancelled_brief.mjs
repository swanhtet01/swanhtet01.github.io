import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionCustomerMessageOrderCancelledBrief } from './ecommerce-cancellation-decision-customer-message-order-cancelled-brief.ts'`,
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

const { projectEcommerceCancellationDecisionCustomerMessageOrderCancelledBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(customerMessageSent = false, orderCancelled = false) {
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
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderCancelledBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + cancelled
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderCancelledBrief(state([
    cancellationDecision(true, true),
  ]))
  check(r.totalDecisions === 1, 'msg-cancelled: totalDecisions 1')
  check(r.messageSentCancelledCount === 1, 'msg-cancelled: messageSentCancelledCount 1')
  check(r.messageSentNotCancelledCount === 0, 'msg-cancelled: messageSentNotCancelledCount 0')
  check(r.noMessageCancelledCount === 0, 'msg-cancelled: noMessageCancelledCount 0')
}

// 3. Message sent + not cancelled
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderCancelledBrief(state([
    cancellationDecision(true, false),
  ]))
  check(r.totalDecisions === 1, 'msg-notcancelled: totalDecisions 1')
  check(r.messageSentNotCancelledCount === 1, 'msg-notcancelled: messageSentNotCancelledCount 1')
  check(r.messageSentCancelledCount === 0, 'msg-notcancelled: messageSentCancelledCount 0')
  check(r.noMessageNotCancelledCount === 0, 'msg-notcancelled: noMessageNotCancelledCount 0')
}

// 4. No message + cancelled
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderCancelledBrief(state([
    cancellationDecision(false, true),
  ]))
  check(r.totalDecisions === 1, 'nomsg-cancelled: totalDecisions 1')
  check(r.noMessageCancelledCount === 1, 'nomsg-cancelled: noMessageCancelledCount 1')
  check(r.messageSentCancelledCount === 0, 'nomsg-cancelled: messageSentCancelledCount 0')
}

// 5. No message + not cancelled
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderCancelledBrief(state([
    cancellationDecision(false, false),
  ]))
  check(r.totalDecisions === 1, 'nomsg-notcancelled: totalDecisions 1')
  check(r.noMessageNotCancelledCount === 1, 'nomsg-notcancelled: noMessageNotCancelledCount 1')
  check(r.messageSentNotCancelledCount === 0, 'nomsg-notcancelled: messageSentNotCancelledCount 0')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderCancelledBrief(state([
    cancellationDecision(true, true),
    cancellationDecision(true, false),
    cancellationDecision(false, true),
    cancellationDecision(false, false),
  ]))
  check(r.totalDecisions === 4, 'all-cells: totalDecisions 4')
  check(r.messageSentCancelledCount === 1, 'all-cells: messageSentCancelledCount 1')
  check(r.noMessageCancelledCount === 1, 'all-cells: noMessageCancelledCount 1')
  check(r.messageSentCount === 2, 'all-cells: messageSentCount 2')
}

// 7. Row totals for case 6
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderCancelledBrief(state([
    cancellationDecision(true, true),
    cancellationDecision(true, false),
    cancellationDecision(false, true),
    cancellationDecision(false, false),
  ]))
  check(r.noMessageNotCancelledCount === 1, 'row-totals: noMessageNotCancelledCount 1')
  check(r.noMessageCount === 2, 'row-totals: noMessageCount 2')
}

console.log(`ecommerce-cancellation-decision-customer-message-order-cancelled-brief: ${checks} checks passed`)
