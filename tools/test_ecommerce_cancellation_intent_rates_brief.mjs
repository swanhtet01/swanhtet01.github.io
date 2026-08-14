import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentRatesBrief } from './ecommerce-cancellation-intent-rates-brief.ts'`,
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

const { projectEcommerceCancellationIntentRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent({ orderCancelled = false, customerMessageSent = false, refundStarted = false } = {}) {
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
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 10000,
    reasonCode: 'changed_mind',
    reason: 'Cancellation reason',
    customerMessageSent,
    orderCancelled,
    refundStarted,
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

// 1. Empty state — 9 checks
{
  const r = projectEcommerceCancellationIntentRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.orderCancelledCount === 0, 'empty:orderCancelledCount')
  check(r.orderCancelledRate === 0, 'empty:orderCancelledRate')
  check(r.customerNotificationCount === 0, 'empty:customerNotificationCount')
  check(r.customerNotificationRate === 0, 'empty:customerNotificationRate')
  check(r.refundStartedCount === 0, 'empty:refundStartedCount')
  check(r.refundStartedRate === 0, 'empty:refundStartedRate')
}

// 2. Single intent, all false — 5 checks
{
  const r = projectEcommerceCancellationIntentRatesBrief(state([cancellationIntent()]))
  check(r.totalIntents === 1, 'single:total')
  check(r.orderCancelledCount === 0, 'single:orderCancelledCount')
  check(r.customerNotificationCount === 0, 'single:customerNotificationCount')
  check(r.refundStartedCount === 0, 'single:refundStartedCount')
}

// 3. orderCancelled only — 2 checks
{
  const r = projectEcommerceCancellationIntentRatesBrief(state([cancellationIntent({ orderCancelled: true })]))
  check(r.orderCancelledCount === 1, 'cancelled:count')
  check(r.orderCancelledRate === 1, 'cancelled:rate')
}

// 4. customerMessageSent only — 2 checks
{
  const r = projectEcommerceCancellationIntentRatesBrief(state([cancellationIntent({ customerMessageSent: true })]))
  check(r.customerNotificationCount === 1, 'notified:count')
  check(r.customerNotificationRate === 1, 'notified:rate')
}

// 5. refundStarted only — 2 checks
{
  const r = projectEcommerceCancellationIntentRatesBrief(state([cancellationIntent({ refundStarted: true })]))
  check(r.refundStartedCount === 1, 'refund:count')
  check(r.refundStartedRate === 1, 'refund:rate')
}

// 6. 2 intents mixed: one all-true, one all-false — 3 checks
{
  const r = projectEcommerceCancellationIntentRatesBrief(state([
    cancellationIntent({ orderCancelled: true, customerMessageSent: true, refundStarted: true }),
    cancellationIntent(),
  ]))
  check(r.totalIntents === 2, 'mixed:total')
  check(r.orderCancelledCount === 1, 'mixed:orderCancelledCount')
  check(r.orderCancelledRate === 0.5, 'mixed:orderCancelledRate')
}

// 7. Precision: 1 of 3 = 0.3333 — 3 checks
{
  const r = projectEcommerceCancellationIntentRatesBrief(state([
    cancellationIntent({ customerMessageSent: true }),
    cancellationIntent(),
    cancellationIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.customerNotificationCount === 1, 'precision:count')
  check(r.customerNotificationRate === 0.3333, 'precision:rate')
}

console.log(`ecommerce-cancellation-intent-rates-brief: ${checks} checks passed`)
