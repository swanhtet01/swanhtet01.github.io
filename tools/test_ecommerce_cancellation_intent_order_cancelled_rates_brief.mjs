import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentOrderCancelledRatesBrief } from './ecommerce-cancellation-intent-order-cancelled-rates-brief.ts'`,
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

const { projectEcommerceCancellationIntentOrderCancelledRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent({ orderCancelled = false } = {}) {
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
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    reasonCode: 'customer_request',
    reason: 'Cancellation reason',
    totalMmk: 5000,
    refundStarted: false,
    customerMessageSent: false,
    orderCancelled,
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
  const r = projectEcommerceCancellationIntentOrderCancelledRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.orderCancelledCount === 0, 'empty:orderCancelledCount')
  check(r.orderCancelledRate === 0, 'empty:orderCancelledRate')
  check(r.notOrderCancelledCount === 0, 'empty:notOrderCancelledCount')
  check(r.notOrderCancelledRate === 0, 'empty:notOrderCancelledRate')
}

// 2. Single cancelled — 3 checks
{
  const r = projectEcommerceCancellationIntentOrderCancelledRatesBrief(state([
    cancellationIntent({ orderCancelled: true }),
  ]))
  check(r.totalIntents === 1, 'cancelled:total')
  check(r.orderCancelledCount === 1, 'cancelled:count')
  check(r.orderCancelledRate === 1, 'cancelled:rate')
}

// 3. Single not cancelled — 3 checks
{
  const r = projectEcommerceCancellationIntentOrderCancelledRatesBrief(state([cancellationIntent()]))
  check(r.totalIntents === 1, 'notCancelled:total')
  check(r.notOrderCancelledCount === 1, 'notCancelled:count')
  check(r.notOrderCancelledRate === 1, 'notCancelled:rate')
}

// 4. 2 cancelled — 3 checks
{
  const r = projectEcommerceCancellationIntentOrderCancelledRatesBrief(state([
    cancellationIntent({ orderCancelled: true }),
    cancellationIntent({ orderCancelled: true }),
  ]))
  check(r.orderCancelledCount === 2, 'twoCancelled:count')
  check(r.notOrderCancelledCount === 0, 'twoCancelled:notCount')
  check(r.orderCancelledRate === 1, 'twoCancelled:rate')
}

// 5. 2 not cancelled — 2 checks
{
  const r = projectEcommerceCancellationIntentOrderCancelledRatesBrief(state([
    cancellationIntent(),
    cancellationIntent(),
  ]))
  check(r.notOrderCancelledCount === 2, 'twoNotCancelled:count')
  check(r.orderCancelledCount === 0, 'twoNotCancelled:cancelledCount')
}

// 6. 1 cancelled + 1 not cancelled — 3 checks
{
  const r = projectEcommerceCancellationIntentOrderCancelledRatesBrief(state([
    cancellationIntent({ orderCancelled: true }),
    cancellationIntent(),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.orderCancelledRate === 0.5, 'half:cancelledRate')
  check(r.notOrderCancelledRate === 0.5, 'half:notCancelledRate')
}

// 7. Precision: 1 cancelled + 2 not cancelled (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceCancellationIntentOrderCancelledRatesBrief(state([
    cancellationIntent({ orderCancelled: true }),
    cancellationIntent(),
    cancellationIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.orderCancelledCount === 1, 'precision:cancelledCount')
  check(r.orderCancelledRate === 0.3333, 'precision:cancelledRate')
  check(r.notOrderCancelledRate === 0.6667, 'precision:notCancelledRate')
}

console.log(`ecommerce-cancellation-intent-order-cancelled-rates-brief: ${checks} checks passed`)
