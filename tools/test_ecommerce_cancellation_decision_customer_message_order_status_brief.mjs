import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionCustomerMessageOrderStatusBrief } from './ecommerce-cancellation-decision-customer-message-order-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionCustomerMessageOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(customerMessageSent = false, orderStatus = 'confirmed') {
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
    customerMessageSent,
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
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.messageSentConfirmedCount === 0, 'empty: messageSentConfirmedCount 0')
  check(r.noMessageReadyCount === 0, 'empty: noMessageReadyCount 0')
}

// 2. Message sent + confirmed
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderStatusBrief(state([
    cancellationDecision(true, 'confirmed'),
  ]))
  check(r.totalDecisions === 1, 'msg-confirmed: totalDecisions 1')
  check(r.messageSentConfirmedCount === 1, 'msg-confirmed: messageSentConfirmedCount 1')
  check(r.messageSentPreparingCount === 0, 'msg-confirmed: messageSentPreparingCount 0')
  check(r.noMessageConfirmedCount === 0, 'msg-confirmed: noMessageConfirmedCount 0')
}

// 3. Message sent + preparing
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderStatusBrief(state([
    cancellationDecision(true, 'preparing'),
  ]))
  check(r.totalDecisions === 1, 'msg-preparing: totalDecisions 1')
  check(r.messageSentPreparingCount === 1, 'msg-preparing: messageSentPreparingCount 1')
  check(r.messageSentConfirmedCount === 0, 'msg-preparing: messageSentConfirmedCount 0')
  check(r.noMessagePreparingCount === 0, 'msg-preparing: noMessagePreparingCount 0')
}

// 4. No message + confirmed
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderStatusBrief(state([
    cancellationDecision(false, 'confirmed'),
  ]))
  check(r.totalDecisions === 1, 'nomsg-confirmed: totalDecisions 1')
  check(r.noMessageConfirmedCount === 1, 'nomsg-confirmed: noMessageConfirmedCount 1')
  check(r.messageSentConfirmedCount === 0, 'nomsg-confirmed: messageSentConfirmedCount 0')
}

// 5. No message + preparing
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderStatusBrief(state([
    cancellationDecision(false, 'preparing'),
  ]))
  check(r.totalDecisions === 1, 'nomsg-preparing: totalDecisions 1')
  check(r.noMessagePreparingCount === 1, 'nomsg-preparing: noMessagePreparingCount 1')
  check(r.messageSentPreparingCount === 0, 'nomsg-preparing: messageSentPreparingCount 0')
}

// 6. All 6 cells
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderStatusBrief(state([
    cancellationDecision(true, 'confirmed'),
    cancellationDecision(true, 'preparing'),
    cancellationDecision(true, 'ready'),
    cancellationDecision(false, 'confirmed'),
    cancellationDecision(false, 'preparing'),
    cancellationDecision(false, 'ready'),
  ]))
  check(r.totalDecisions === 6, 'all-cells: totalDecisions 6')
  check(r.messageSentConfirmedCount === 1, 'all-cells: messageSentConfirmedCount 1')
  check(r.noMessageConfirmedCount === 1, 'all-cells: noMessageConfirmedCount 1')
  check(r.messageSentReadyCount === 1, 'all-cells: messageSentReadyCount 1')
}

// 7. Remaining sub-buckets for case 6
{
  const r = projectEcommerceCancellationDecisionCustomerMessageOrderStatusBrief(state([
    cancellationDecision(true, 'confirmed'),
    cancellationDecision(true, 'preparing'),
    cancellationDecision(true, 'ready'),
    cancellationDecision(false, 'confirmed'),
    cancellationDecision(false, 'preparing'),
    cancellationDecision(false, 'ready'),
  ]))
  check(r.noMessagePreparingCount === 1, 'sub-buckets: noMessagePreparingCount 1')
  check(r.noMessageReadyCount === 1, 'sub-buckets: noMessageReadyCount 1')
}

console.log(`ecommerce-cancellation-decision-customer-message-order-status-brief: ${checks} checks passed`)
