import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionProviderCalledOrderStatusBrief } from './ecommerce-cancellation-decision-provider-called-order-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionProviderCalledOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(providerCalled = false, orderStatus = 'confirmed') {
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
  const r = projectEcommerceCancellationDecisionProviderCalledOrderStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.providerCalledConfirmedCount === 0, 'empty: providerCalledConfirmedCount 0')
  check(r.noProviderConfirmedCount === 0, 'empty: noProviderConfirmedCount 0')
}

// 2. Provider called + confirmed
{
  const r = projectEcommerceCancellationDecisionProviderCalledOrderStatusBrief(state([
    cancellationDecision(true, 'confirmed'),
  ]))
  check(r.totalDecisions === 1, 'provider-confirmed: totalDecisions 1')
  check(r.providerCalledConfirmedCount === 1, 'provider-confirmed: providerCalledConfirmedCount 1')
  check(r.providerCalledPreparingCount === 0, 'provider-confirmed: providerCalledPreparingCount 0')
  check(r.noProviderConfirmedCount === 0, 'provider-confirmed: noProviderConfirmedCount 0')
}

// 3. Provider called + preparing
{
  const r = projectEcommerceCancellationDecisionProviderCalledOrderStatusBrief(state([
    cancellationDecision(true, 'preparing'),
  ]))
  check(r.totalDecisions === 1, 'provider-preparing: totalDecisions 1')
  check(r.providerCalledPreparingCount === 1, 'provider-preparing: providerCalledPreparingCount 1')
  check(r.providerCalledReadyCount === 0, 'provider-preparing: providerCalledReadyCount 0')
  check(r.providerCalledConfirmedCount === 0, 'provider-preparing: providerCalledConfirmedCount 0')
}

// 4. Provider called + ready
{
  const r = projectEcommerceCancellationDecisionProviderCalledOrderStatusBrief(state([
    cancellationDecision(true, 'ready'),
  ]))
  check(r.totalDecisions === 1, 'provider-ready: totalDecisions 1')
  check(r.providerCalledReadyCount === 1, 'provider-ready: providerCalledReadyCount 1')
  check(r.noProviderReadyCount === 0, 'provider-ready: noProviderReadyCount 0')
}

// 5. No provider + confirmed
{
  const r = projectEcommerceCancellationDecisionProviderCalledOrderStatusBrief(state([
    cancellationDecision(false, 'confirmed'),
  ]))
  check(r.totalDecisions === 1, 'noprovider-confirmed: totalDecisions 1')
  check(r.noProviderConfirmedCount === 1, 'noprovider-confirmed: noProviderConfirmedCount 1')
  check(r.providerCalledConfirmedCount === 0, 'noprovider-confirmed: providerCalledConfirmedCount 0')
}

// 6. Mixed: 2 provider+confirmed, 1 noProvider+preparing, 1 noProvider+ready
{
  const r = projectEcommerceCancellationDecisionProviderCalledOrderStatusBrief(state([
    cancellationDecision(true, 'confirmed'),
    cancellationDecision(true, 'confirmed'),
    cancellationDecision(false, 'preparing'),
    cancellationDecision(false, 'ready'),
  ]))
  check(r.totalDecisions === 4, 'mixed: totalDecisions 4')
  check(r.providerCalledConfirmedCount === 2, 'mixed: providerCalledConfirmedCount 2')
  check(r.noProviderPreparingCount === 1, 'mixed: noProviderPreparingCount 1')
  check(r.noProviderReadyCount === 1, 'mixed: noProviderReadyCount 1')
}

// 7. All noProvider + preparing
{
  const r = projectEcommerceCancellationDecisionProviderCalledOrderStatusBrief(state([
    cancellationDecision(false, 'preparing'),
    cancellationDecision(false, 'preparing'),
    cancellationDecision(false, 'preparing'),
  ]))
  check(r.totalDecisions === 3, 'all-noprovider-preparing: totalDecisions 3')
  check(r.noProviderPreparingCount === 3, 'all-noprovider-preparing: noProviderPreparingCount 3')
}

console.log(`ecommerce-cancellation-decision-provider-called-order-status-brief: ${checks} checks passed`)
