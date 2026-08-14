import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionCustomerMessageRefundStartedBrief } from './ecommerce-cancellation-decision-customer-message-refund-started-brief.ts'`,
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

const { projectEcommerceCancellationDecisionCustomerMessageRefundStartedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(customerMessageSent = false, refundStarted = false) {
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
  const r = projectEcommerceCancellationDecisionCustomerMessageRefundStartedBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + refund started
{
  const r = projectEcommerceCancellationDecisionCustomerMessageRefundStartedBrief(state([
    cancellationDecision(true, true),
  ]))
  check(r.totalDecisions === 1, 'msg-refund: totalDecisions 1')
  check(r.messageSentRefundStartedCount === 1, 'msg-refund: messageSentRefundStartedCount 1')
  check(r.messageSentNoRefundCount === 0, 'msg-refund: messageSentNoRefundCount 0')
  check(r.messageSentCount === 1, 'msg-refund: messageSentCount 1')
}

// 3. Message sent + no refund
{
  const r = projectEcommerceCancellationDecisionCustomerMessageRefundStartedBrief(state([
    cancellationDecision(true, false),
  ]))
  check(r.totalDecisions === 1, 'msg-norefund: totalDecisions 1')
  check(r.messageSentNoRefundCount === 1, 'msg-norefund: messageSentNoRefundCount 1')
  check(r.messageSentCount === 1, 'msg-norefund: messageSentCount 1')
  check(r.noMessageCount === 0, 'msg-norefund: noMessageCount 0')
}

// 4. No message + refund started
{
  const r = projectEcommerceCancellationDecisionCustomerMessageRefundStartedBrief(state([
    cancellationDecision(false, true),
  ]))
  check(r.totalDecisions === 1, 'nomsg-refund: totalDecisions 1')
  check(r.noMessageRefundStartedCount === 1, 'nomsg-refund: noMessageRefundStartedCount 1')
  check(r.noMessageCount === 1, 'nomsg-refund: noMessageCount 1')
}

// 5. No message + no refund
{
  const r = projectEcommerceCancellationDecisionCustomerMessageRefundStartedBrief(state([
    cancellationDecision(false, false),
  ]))
  check(r.totalDecisions === 1, 'nomsg-norefund: totalDecisions 1')
  check(r.noMessageNoRefundCount === 1, 'nomsg-norefund: noMessageNoRefundCount 1')
  check(r.noMessageCount === 1, 'nomsg-norefund: noMessageCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationDecisionCustomerMessageRefundStartedBrief(state([
    cancellationDecision(true, true),
    cancellationDecision(true, false),
    cancellationDecision(false, true),
    cancellationDecision(false, false),
  ]))
  check(r.totalDecisions === 4, 'all-cells: totalDecisions 4')
  check(r.messageSentRefundStartedCount === 1, 'all-cells: messageSentRefundStartedCount 1')
  check(r.noMessageNoRefundCount === 1, 'all-cells: noMessageNoRefundCount 1')
  check(r.messageSentCount === 2, 'all-cells: messageSentCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceCancellationDecisionCustomerMessageRefundStartedBrief(state([
    cancellationDecision(true, true),
    cancellationDecision(true, false),
    cancellationDecision(false, true),
    cancellationDecision(false, false),
  ]))
  check(r.noMessageCount === 2, 'row-totals: noMessageCount 2')
  check(r.noMessageRefundStartedCount === 1, 'row-totals: noMessageRefundStartedCount 1')
}

console.log(`ecommerce-cancellation-decision-customer-message-refund-started-brief: ${checks} checks passed`)
