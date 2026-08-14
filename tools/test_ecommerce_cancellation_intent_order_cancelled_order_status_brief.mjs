import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentOrderCancelledOrderStatusBrief } from './ecommerce-cancellation-intent-order-cancelled-order-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentOrderCancelledOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(orderCancelled = false, orderStatus = 'confirmed') {
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
    orderStatus,
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 10000,
    reasonCode: 'changed_mind',
    reason: 'Cancellation reason',
    customerMessageSent: false,
    orderCancelled,
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

// 1. Empty state
{
  const r = projectEcommerceCancellationIntentOrderCancelledOrderStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.cancelledConfirmedCount === 0, 'empty: cancelledConfirmedCount 0')
  check(r.notCancelledConfirmedCount === 0, 'empty: notCancelledConfirmedCount 0')
}

// 2. Cancelled + confirmed
{
  const r = projectEcommerceCancellationIntentOrderCancelledOrderStatusBrief(state([
    cancellationIntent(true, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'cancelled-confirmed: totalIntents 1')
  check(r.cancelledConfirmedCount === 1, 'cancelled-confirmed: cancelledConfirmedCount 1')
  check(r.cancelledPreparingCount === 0, 'cancelled-confirmed: cancelledPreparingCount 0')
  check(r.notCancelledConfirmedCount === 0, 'cancelled-confirmed: notCancelledConfirmedCount 0')
}

// 3. Cancelled + preparing
{
  const r = projectEcommerceCancellationIntentOrderCancelledOrderStatusBrief(state([
    cancellationIntent(true, 'preparing'),
  ]))
  check(r.totalIntents === 1, 'cancelled-preparing: totalIntents 1')
  check(r.cancelledPreparingCount === 1, 'cancelled-preparing: cancelledPreparingCount 1')
  check(r.cancelledConfirmedCount === 0, 'cancelled-preparing: cancelledConfirmedCount 0')
  check(r.notCancelledPreparingCount === 0, 'cancelled-preparing: notCancelledPreparingCount 0')
}

// 4. Cancelled + ready
{
  const r = projectEcommerceCancellationIntentOrderCancelledOrderStatusBrief(state([
    cancellationIntent(true, 'ready'),
  ]))
  check(r.totalIntents === 1, 'cancelled-ready: totalIntents 1')
  check(r.cancelledReadyCount === 1, 'cancelled-ready: cancelledReadyCount 1')
  check(r.notCancelledReadyCount === 0, 'cancelled-ready: notCancelledReadyCount 0')
}

// 5. Not cancelled + confirmed
{
  const r = projectEcommerceCancellationIntentOrderCancelledOrderStatusBrief(state([
    cancellationIntent(false, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'not-cancelled-confirmed: totalIntents 1')
  check(r.notCancelledConfirmedCount === 1, 'not-cancelled-confirmed: notCancelledConfirmedCount 1')
  check(r.cancelledConfirmedCount === 0, 'not-cancelled-confirmed: cancelledConfirmedCount 0')
}

// 6. All 6 cells
{
  const r = projectEcommerceCancellationIntentOrderCancelledOrderStatusBrief(state([
    cancellationIntent(true, 'confirmed'),
    cancellationIntent(true, 'preparing'),
    cancellationIntent(true, 'ready'),
    cancellationIntent(false, 'confirmed'),
    cancellationIntent(false, 'preparing'),
    cancellationIntent(false, 'ready'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.cancelledConfirmedCount === 1, 'all-cells: cancelledConfirmedCount 1')
  check(r.cancelledPreparingCount === 1, 'all-cells: cancelledPreparingCount 1')
  check(r.notCancelledConfirmedCount === 1, 'all-cells: notCancelledConfirmedCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentOrderCancelledOrderStatusBrief(state([
    cancellationIntent(true, 'confirmed'),
    cancellationIntent(true, 'preparing'),
    cancellationIntent(true, 'ready'),
    cancellationIntent(false, 'confirmed'),
    cancellationIntent(false, 'preparing'),
    cancellationIntent(false, 'ready'),
  ]))
  check(r.notCancelledPreparingCount === 1, 'sub-buckets: notCancelledPreparingCount 1')
  check(r.notCancelledReadyCount === 1, 'sub-buckets: notCancelledReadyCount 1')
}

console.log(`ecommerce-cancellation-intent-order-cancelled-order-status-brief: ${checks} checks passed`)
