import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionPaymentStatusBrief } from './ecommerce-cancellation-decision-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationDecisionPaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(paymentStatus = 'pending') {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `CXD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `CXI-${decisionId}`,
    intentDigest: `id-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus,
    refundStatus: 'none',
    totalMmk: 8000,
    actor: `actor-${decisionId}`,
    reason: 'Order is valid',
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

// 1. Empty state — all zeros
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.pending === 0, 'empty: pending 0')
  check(r.reconciled === 0, 'empty: reconciled 0')
  check(r.pendingRate === 0, 'empty: pendingRate 0')
  check(r.reconciledRate === 0, 'empty: reconciledRate 0')
}

// 2. Single pending — rate 100
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state([cancellationDecision('pending')]))
  check(r.totalDecisions === 1, 'all-pending: totalDecisions 1')
  check(r.pending === 1, 'all-pending: pending 1')
  check(r.pendingRate === 100, 'all-pending: pendingRate 100')
  check(r.reconciledRate === 0, 'all-pending: reconciledRate 0')
}

// 3. Single reconciled — rate 100
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state([cancellationDecision('reconciled')]))
  check(r.reconciled === 1, 'all-reconciled: reconciled 1')
  check(r.reconciledRate === 100, 'all-reconciled: reconciledRate 100')
  check(r.pendingRate === 0, 'all-reconciled: pendingRate 0')
}

// 4. Two decisions: 1 pending + 1 reconciled — 50/50
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state([
    cancellationDecision('pending'),
    cancellationDecision('reconciled'),
  ]))
  check(r.totalDecisions === 2, 'half-half: totalDecisions 2')
  check(r.pendingRate === 50, 'half-half: pendingRate 50')
  check(r.reconciledRate === 50, 'half-half: reconciledRate 50')
}

// 5. Three decisions: 2 pending + 1 reconciled — 67/33
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state([
    cancellationDecision('pending'),
    cancellationDecision('pending'),
    cancellationDecision('reconciled'),
  ]))
  check(r.totalDecisions === 3, 'two-thirds: totalDecisions 3')
  check(r.pending === 2, 'two-thirds: pending 2')
  check(r.reconciled === 1, 'two-thirds: reconciled 1')
  check(r.pendingRate === 67, 'two-thirds: pendingRate 67')
  check(r.reconciledRate === 33, 'two-thirds: reconciledRate 33')
}

// 6. Four decisions: all reconciled — rates check
{
  const r = projectEcommerceCancellationDecisionPaymentStatusBrief(state([
    cancellationDecision('reconciled'),
    cancellationDecision('reconciled'),
    cancellationDecision('reconciled'),
    cancellationDecision('reconciled'),
  ]))
  check(r.totalDecisions === 4, 'all-recon: totalDecisions 4')
  check(r.reconciledRate === 100, 'all-recon: reconciledRate 100')
  check(r.pendingRate === 0, 'all-recon: pendingRate 0')
}

console.log(`ecommerce-cancellation-decision-payment-status-brief: ${checks} checks passed`)
