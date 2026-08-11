// Ecommerce cancellation intent payment status brief: pending vs reconciled distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentPaymentStatusBrief } from './ecommerce-cancellation-intent-payment-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentPaymentStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(paymentStatus = 'pending') {
  intentId++
  return {
    schema: 'supermega.ecommerce.cancellation_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `CI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus,
    refundStatus: 'none',
    totalMmk: 5000,
    reasonCode: 'changed_mind',
    reason: 'No longer needed',
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(cancellationIntents) {
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
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(state([]))
  check(r.totalCancellationIntents === 0, 'empty: total 0')
  check(r.pendingPaymentCount === 0, 'empty: pending 0')
  check(r.reconciledPaymentCount === 0, 'empty: reconciled 0')
  check(r.pendingPaymentRate === 0, 'empty: pendingRate 0')
  check(r.reconciledPaymentRate === 0, 'empty: reconciledRate 0')
}

// 2. All pending
{
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(
    state([cancellationIntent('pending'), cancellationIntent('pending'), cancellationIntent('pending')]),
  )
  check(r.totalCancellationIntents === 3, 'all-pend: total 3')
  check(r.pendingPaymentCount === 3, 'all-pend: pending 3')
  check(r.reconciledPaymentCount === 0, 'all-pend: reconciled 0')
  check(r.pendingPaymentRate === 100, 'all-pend: pendingRate 100')
  check(r.reconciledPaymentRate === 0, 'all-pend: reconciledRate 0')
}

// 3. All reconciled
{
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(
    state([cancellationIntent('reconciled'), cancellationIntent('reconciled')]),
  )
  check(r.totalCancellationIntents === 2, 'all-rec: total 2')
  check(r.pendingPaymentCount === 0, 'all-rec: pending 0')
  check(r.reconciledPaymentCount === 2, 'all-rec: reconciled 2')
  check(r.pendingPaymentRate === 0, 'all-rec: pendingRate 0')
  check(r.reconciledPaymentRate === 100, 'all-rec: reconciledRate 100')
}

// 4. 50/50 split
{
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(
    state([cancellationIntent('pending'), cancellationIntent('reconciled')]),
  )
  check(r.pendingPaymentRate === 50, 'split: pendingRate 50')
  check(r.reconciledPaymentRate === 50, 'split: reconciledRate 50')
}

// 5. Rounding: 1 reconciled out of 3 → 33%
{
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(
    state([
      cancellationIntent('pending'),
      cancellationIntent('pending'),
      cancellationIntent('reconciled'),
    ]),
  )
  check(r.pendingPaymentRate === 67, 'round: pendingRate 67')
  check(r.reconciledPaymentRate === 33, 'round: reconciledRate 33')
}

// 6. Counts sum to total
{
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(
    state([
      cancellationIntent('pending'),
      cancellationIntent('reconciled'),
      cancellationIntent('pending'),
      cancellationIntent('reconciled'),
    ]),
  )
  check(
    r.pendingPaymentCount + r.reconciledPaymentCount === r.totalCancellationIntents,
    'invariant: counts sum to total',
  )
  check(r.pendingPaymentCount === 2, 'invariant: pending 2')
  check(r.reconciledPaymentCount === 2, 'invariant: reconciled 2')
}

console.log(JSON.stringify({ ok: true, checks }))
