import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentPaymentStatusRatesBrief } from './ecommerce-cancellation-intent-payment-status-rates-brief.ts'`,
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

const { projectEcommerceCancellationIntentPaymentStatusRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent({ paymentStatus = 'pending' } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.cancellation_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus,
    refundStatus: 'none',
    totalMmk: 10000,
    reasonCode: 'changed_mind',
    reason: 'Cancellation reason',
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(cancellationIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents,
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state — 5 checks
{
  const r = projectEcommerceCancellationIntentPaymentStatusRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.pendingCount === 0, 'empty:pendingCount')
  check(r.pendingRate === 0, 'empty:pendingRate')
  check(r.reconciledCount === 0, 'empty:reconciledCount')
  check(r.reconciledRate === 0, 'empty:reconciledRate')
}

// 2. Single pending — 3 checks
{
  const r = projectEcommerceCancellationIntentPaymentStatusRatesBrief(state([cancellationIntent()]))
  check(r.totalIntents === 1, 'pending:total')
  check(r.pendingCount === 1, 'pending:count')
  check(r.pendingRate === 1, 'pending:rate')
}

// 3. Single reconciled — 3 checks
{
  const r = projectEcommerceCancellationIntentPaymentStatusRatesBrief(state([
    cancellationIntent({ paymentStatus: 'reconciled' }),
  ]))
  check(r.totalIntents === 1, 'reconciled:total')
  check(r.reconciledCount === 1, 'reconciled:count')
  check(r.reconciledRate === 1, 'reconciled:rate')
}

// 4. 2 pending — 3 checks
{
  const r = projectEcommerceCancellationIntentPaymentStatusRatesBrief(state([
    cancellationIntent(),
    cancellationIntent(),
  ]))
  check(r.pendingCount === 2, 'twoPending:count')
  check(r.reconciledCount === 0, 'twoPending:reconciledCount')
  check(r.pendingRate === 1, 'twoPending:rate')
}

// 5. 2 reconciled — 2 checks
{
  const r = projectEcommerceCancellationIntentPaymentStatusRatesBrief(state([
    cancellationIntent({ paymentStatus: 'reconciled' }),
    cancellationIntent({ paymentStatus: 'reconciled' }),
  ]))
  check(r.reconciledCount === 2, 'twoReconciled:count')
  check(r.pendingCount === 0, 'twoReconciled:pendingCount')
}

// 6. 1 pending + 1 reconciled — 3 checks
{
  const r = projectEcommerceCancellationIntentPaymentStatusRatesBrief(state([
    cancellationIntent(),
    cancellationIntent({ paymentStatus: 'reconciled' }),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.pendingRate === 0.5, 'half:pendingRate')
  check(r.reconciledRate === 0.5, 'half:reconciledRate')
}

// 7. Precision: 1 pending + 2 reconciled (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceCancellationIntentPaymentStatusRatesBrief(state([
    cancellationIntent(),
    cancellationIntent({ paymentStatus: 'reconciled' }),
    cancellationIntent({ paymentStatus: 'reconciled' }),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.pendingCount === 1, 'precision:pendingCount')
  check(r.pendingRate === 0.3333, 'precision:pendingRate')
  check(r.reconciledRate === 0.6667, 'precision:reconciledRate')
}

console.log(`ecommerce-cancellation-intent-payment-status-rates-brief: ${checks} checks passed`)
