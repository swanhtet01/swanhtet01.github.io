import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentPaymentReasonBrief } from './ecommerce-cancellation-intent-payment-reason-brief.ts'`,
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

const { projectEcommerceCancellationIntentPaymentReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(paymentStatus = 'pending', reasonCode = 'changed_mind') {
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
    reasonCode,
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

// 1. Empty state
{
  const r = projectEcommerceCancellationIntentPaymentReasonBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.pendingTopReasonCode === null, 'empty: pendingTopReasonCode null')
  check(r.reconciledTopReasonCode === null, 'empty: reconciledTopReasonCode null')
}

// 2. Single pending changed_mind
{
  const r = projectEcommerceCancellationIntentPaymentReasonBrief(state([
    cancellationIntent('pending', 'changed_mind'),
  ]))
  check(r.totalIntents === 1, 'single-pending: totalIntents 1')
  check(r.pendingCount === 1, 'single-pending: pendingCount 1')
  check(r.pendingTopReasonCode === 'changed_mind', 'single-pending: pendingTopReasonCode changed_mind')
  check(r.pendingTopReasonCodeCount === 1, 'single-pending: pendingTopReasonCodeCount 1')
}

// 3. Single reconciled delivery_too_slow
{
  const r = projectEcommerceCancellationIntentPaymentReasonBrief(state([
    cancellationIntent('reconciled', 'delivery_too_slow'),
  ]))
  check(r.totalIntents === 1, 'single-reconciled: totalIntents 1')
  check(r.reconciledCount === 1, 'single-reconciled: reconciledCount 1')
  check(r.reconciledTopReasonCode === 'delivery_too_slow', 'single-reconciled: reconciledTopReasonCode delivery_too_slow')
  check(r.reconciledTopReasonCodeCount === 1, 'single-reconciled: reconciledTopReasonCodeCount 1')
}

// 4. Two pending same reasonCode — order_error wins
{
  const r = projectEcommerceCancellationIntentPaymentReasonBrief(state([
    cancellationIntent('pending', 'order_error'),
    cancellationIntent('pending', 'order_error'),
  ]))
  check(r.pendingCount === 2, 'two-pending-same: pendingCount 2')
  check(r.pendingTopReasonCode === 'order_error', 'two-pending-same: pendingTopReasonCode order_error')
  check(r.pendingTopReasonCodeCount === 2, 'two-pending-same: pendingTopReasonCodeCount 2')
  check(r.reconciledCount === 0, 'two-pending-same: reconciledCount 0')
}

// 5. Three reconciled, other (×2) beats duplicate_order (×1)
{
  const r = projectEcommerceCancellationIntentPaymentReasonBrief(state([
    cancellationIntent('reconciled', 'other'),
    cancellationIntent('reconciled', 'other'),
    cancellationIntent('reconciled', 'duplicate_order'),
  ]))
  check(r.reconciledCount === 3, 'reconciled-top: reconciledCount 3')
  check(r.reconciledTopReasonCode === 'other', 'reconciled-top: reconciledTopReasonCode other')
  check(r.pendingTopReasonCode === null, 'reconciled-top: pendingTopReasonCode null')
}

// 6. Mixed: 2 pending (changed_mind ×2) + 2 reconciled (other, delivery_too_slow)
{
  const r = projectEcommerceCancellationIntentPaymentReasonBrief(state([
    cancellationIntent('pending', 'changed_mind'),
    cancellationIntent('pending', 'changed_mind'),
    cancellationIntent('reconciled', 'other'),
    cancellationIntent('reconciled', 'delivery_too_slow'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.pendingCount === 2, 'mixed: pendingCount 2')
  check(r.reconciledCount === 2, 'mixed: reconciledCount 2')
  check(r.pendingTopReasonCode === 'changed_mind', 'mixed: pendingTopReasonCode changed_mind')
}

// 7. All reconciled — pendingTopReasonCode stays null
{
  const r = projectEcommerceCancellationIntentPaymentReasonBrief(state([
    cancellationIntent('reconciled', 'order_error'),
  ]))
  check(r.pendingTopReasonCode === null, 'all-reconciled: pendingTopReasonCode null')
}

console.log(`ecommerce-cancellation-intent-payment-reason-brief: ${checks} checks passed`)
