import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionCustomerMessageProviderCalledBrief } from './ecommerce-cancellation-decision-customer-message-provider-called-brief.ts'`,
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

const { projectEcommerceCancellationDecisionCustomerMessageProviderCalledBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(customerMessageSent = false, providerCalled = false) {
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
    refundStarted: false,
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

// 1. Empty state
{
  const r = projectEcommerceCancellationDecisionCustomerMessageProviderCalledBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + provider called
{
  const r = projectEcommerceCancellationDecisionCustomerMessageProviderCalledBrief(state([
    cancellationDecision(true, true),
  ]))
  check(r.totalDecisions === 1, 'msg-provider: totalDecisions 1')
  check(r.messageSentProviderCalledCount === 1, 'msg-provider: messageSentProviderCalledCount 1')
  check(r.messageSentNoProviderCount === 0, 'msg-provider: messageSentNoProviderCount 0')
  check(r.messageSentCount === 1, 'msg-provider: messageSentCount 1')
}

// 3. Message sent + no provider
{
  const r = projectEcommerceCancellationDecisionCustomerMessageProviderCalledBrief(state([
    cancellationDecision(true, false),
  ]))
  check(r.totalDecisions === 1, 'msg-noprovider: totalDecisions 1')
  check(r.messageSentNoProviderCount === 1, 'msg-noprovider: messageSentNoProviderCount 1')
  check(r.messageSentCount === 1, 'msg-noprovider: messageSentCount 1')
  check(r.noMessageCount === 0, 'msg-noprovider: noMessageCount 0')
}

// 4. No message + provider called
{
  const r = projectEcommerceCancellationDecisionCustomerMessageProviderCalledBrief(state([
    cancellationDecision(false, true),
  ]))
  check(r.totalDecisions === 1, 'nomsg-provider: totalDecisions 1')
  check(r.noMessageProviderCalledCount === 1, 'nomsg-provider: noMessageProviderCalledCount 1')
  check(r.noMessageCount === 1, 'nomsg-provider: noMessageCount 1')
}

// 5. No message + no provider
{
  const r = projectEcommerceCancellationDecisionCustomerMessageProviderCalledBrief(state([
    cancellationDecision(false, false),
  ]))
  check(r.totalDecisions === 1, 'nomsg-noprovider: totalDecisions 1')
  check(r.noMessageNoProviderCount === 1, 'nomsg-noprovider: noMessageNoProviderCount 1')
  check(r.noMessageCount === 1, 'nomsg-noprovider: noMessageCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceCancellationDecisionCustomerMessageProviderCalledBrief(state([
    cancellationDecision(true, true),
    cancellationDecision(true, false),
    cancellationDecision(false, true),
    cancellationDecision(false, false),
  ]))
  check(r.totalDecisions === 4, 'all-cells: totalDecisions 4')
  check(r.messageSentProviderCalledCount === 1, 'all-cells: messageSentProviderCalledCount 1')
  check(r.noMessageNoProviderCount === 1, 'all-cells: noMessageNoProviderCount 1')
  check(r.messageSentCount === 2, 'all-cells: messageSentCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceCancellationDecisionCustomerMessageProviderCalledBrief(state([
    cancellationDecision(true, true),
    cancellationDecision(true, false),
    cancellationDecision(false, true),
    cancellationDecision(false, false),
  ]))
  check(r.noMessageCount === 2, 'row-totals: noMessageCount 2')
  check(r.messageSentNoProviderCount === 1, 'row-totals: messageSentNoProviderCount 1')
}

console.log(`ecommerce-cancellation-decision-customer-message-provider-called-brief: ${checks} checks passed`)
