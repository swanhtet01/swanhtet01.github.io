import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionPaymentStatusRatesBrief } from './ecommerce-cancellation-decision-payment-status-rates-brief.ts'`,
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

const { projectEcommerceCancellationDecisionPaymentStatusRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision({ paymentStatus = 'pending' } = {}) {
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
    paymentStatus,
    refundStatus: 'none',
    totalMmk: 10000,
    actor: 'staff-1',
    reason: 'Keeping the order',
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceCancellationDecisionPaymentStatusRatesBrief(state())
  check(r.totalDecisions === 0, 'empty:totalDecisions')
  check(r.pendingCount === 0, 'empty:pendingCount')
  check(r.pendingRate === 0, 'empty:pendingRate')
  check(r.reconciledCount === 0, 'empty:reconciledCount')
  check(r.reconciledRate === 0, 'empty:reconciledRate')
}

// 2. Single pending — 3 checks
{
  const r = projectEcommerceCancellationDecisionPaymentStatusRatesBrief(state([cancellationDecision()]))
  check(r.totalDecisions === 1, 'pending:total')
  check(r.pendingCount === 1, 'pending:count')
  check(r.pendingRate === 1, 'pending:rate')
}

// 3. Single reconciled — 3 checks
{
  const r = projectEcommerceCancellationDecisionPaymentStatusRatesBrief(state([
    cancellationDecision({ paymentStatus: 'reconciled' }),
  ]))
  check(r.totalDecisions === 1, 'reconciled:total')
  check(r.reconciledCount === 1, 'reconciled:count')
  check(r.reconciledRate === 1, 'reconciled:rate')
}

// 4. 2 pending — 3 checks
{
  const r = projectEcommerceCancellationDecisionPaymentStatusRatesBrief(state([
    cancellationDecision(),
    cancellationDecision(),
  ]))
  check(r.pendingCount === 2, 'twoPending:count')
  check(r.reconciledCount === 0, 'twoPending:reconciledCount')
  check(r.pendingRate === 1, 'twoPending:rate')
}

// 5. 2 reconciled — 2 checks
{
  const r = projectEcommerceCancellationDecisionPaymentStatusRatesBrief(state([
    cancellationDecision({ paymentStatus: 'reconciled' }),
    cancellationDecision({ paymentStatus: 'reconciled' }),
  ]))
  check(r.reconciledCount === 2, 'twoReconciled:count')
  check(r.pendingCount === 0, 'twoReconciled:pendingCount')
}

// 6. 1 pending + 1 reconciled — 3 checks
{
  const r = projectEcommerceCancellationDecisionPaymentStatusRatesBrief(state([
    cancellationDecision(),
    cancellationDecision({ paymentStatus: 'reconciled' }),
  ]))
  check(r.totalDecisions === 2, 'half:total')
  check(r.pendingRate === 0.5, 'half:pendingRate')
  check(r.reconciledRate === 0.5, 'half:reconciledRate')
}

// 7. Precision: 1 pending + 2 reconciled (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceCancellationDecisionPaymentStatusRatesBrief(state([
    cancellationDecision(),
    cancellationDecision({ paymentStatus: 'reconciled' }),
    cancellationDecision({ paymentStatus: 'reconciled' }),
  ]))
  check(r.totalDecisions === 3, 'precision:total')
  check(r.pendingCount === 1, 'precision:pendingCount')
  check(r.pendingRate === 0.3333, 'precision:pendingRate')
  check(r.reconciledRate === 0.6667, 'precision:reconciledRate')
}

console.log(`ecommerce-cancellation-decision-payment-status-rates-brief: ${checks} checks passed`)
