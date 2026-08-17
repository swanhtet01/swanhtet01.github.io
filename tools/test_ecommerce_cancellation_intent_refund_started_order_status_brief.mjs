import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentRefundStartedOrderStatusBrief } from './ecommerce-cancellation-intent-refund-started-order-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentRefundStartedOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(refundStarted = false, orderStatus = 'confirmed') {
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
    orderCancelled: false,
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

// 1. Empty state
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.refundStartedConfirmedCount === 0, 'empty: refundStartedConfirmedCount 0')
  check(r.noRefundConfirmedCount === 0, 'empty: noRefundConfirmedCount 0')
}

// 2. Refund started + confirmed
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderStatusBrief(state([
    cancellationIntent(true, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'refund-confirmed: totalIntents 1')
  check(r.refundStartedConfirmedCount === 1, 'refund-confirmed: refundStartedConfirmedCount 1')
  check(r.refundStartedPreparingCount === 0, 'refund-confirmed: refundStartedPreparingCount 0')
  check(r.noRefundConfirmedCount === 0, 'refund-confirmed: noRefundConfirmedCount 0')
}

// 3. Refund started + preparing
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderStatusBrief(state([
    cancellationIntent(true, 'preparing'),
  ]))
  check(r.totalIntents === 1, 'refund-preparing: totalIntents 1')
  check(r.refundStartedPreparingCount === 1, 'refund-preparing: refundStartedPreparingCount 1')
  check(r.refundStartedConfirmedCount === 0, 'refund-preparing: refundStartedConfirmedCount 0')
  check(r.noRefundPreparingCount === 0, 'refund-preparing: noRefundPreparingCount 0')
}

// 4. Refund started + ready
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderStatusBrief(state([
    cancellationIntent(true, 'ready'),
  ]))
  check(r.totalIntents === 1, 'refund-ready: totalIntents 1')
  check(r.refundStartedReadyCount === 1, 'refund-ready: refundStartedReadyCount 1')
  check(r.noRefundReadyCount === 0, 'refund-ready: noRefundReadyCount 0')
}

// 5. No refund + confirmed
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderStatusBrief(state([
    cancellationIntent(false, 'confirmed'),
  ]))
  check(r.totalIntents === 1, 'no-refund-confirmed: totalIntents 1')
  check(r.noRefundConfirmedCount === 1, 'no-refund-confirmed: noRefundConfirmedCount 1')
  check(r.refundStartedConfirmedCount === 0, 'no-refund-confirmed: refundStartedConfirmedCount 0')
}

// 6. All 6 cells
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderStatusBrief(state([
    cancellationIntent(true, 'confirmed'),
    cancellationIntent(true, 'preparing'),
    cancellationIntent(true, 'ready'),
    cancellationIntent(false, 'confirmed'),
    cancellationIntent(false, 'preparing'),
    cancellationIntent(false, 'ready'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.refundStartedConfirmedCount === 1, 'all-cells: refundStartedConfirmedCount 1')
  check(r.refundStartedPreparingCount === 1, 'all-cells: refundStartedPreparingCount 1')
  check(r.noRefundConfirmedCount === 1, 'all-cells: noRefundConfirmedCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceCancellationIntentRefundStartedOrderStatusBrief(state([
    cancellationIntent(true, 'confirmed'),
    cancellationIntent(true, 'preparing'),
    cancellationIntent(true, 'ready'),
    cancellationIntent(false, 'confirmed'),
    cancellationIntent(false, 'preparing'),
    cancellationIntent(false, 'ready'),
  ]))
  check(r.noRefundPreparingCount === 1, 'sub-buckets: noRefundPreparingCount 1')
  check(r.noRefundReadyCount === 1, 'sub-buckets: noRefundReadyCount 1')
}

console.log(`ecommerce-cancellation-intent-refund-started-order-status-brief: ${checks} checks passed`)
