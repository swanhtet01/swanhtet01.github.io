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
    id: `ECN-${intentId}`,
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
    providerCalled: false,
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
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.pendingCount === 0, 'empty: pendingCount 0')
  check(r.reconciledCount === 0, 'empty: reconciledCount 0')
}

// 2. Single pending
{
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(state([cancellationIntent('pending')]))
  check(r.totalIntents === 1, 'single-pending: totalIntents 1')
  check(r.pendingCount === 1, 'single-pending: pendingCount 1')
  check(r.reconciledCount === 0, 'single-pending: reconciledCount 0')
}

// 3. Single reconciled
{
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(state([cancellationIntent('reconciled')]))
  check(r.totalIntents === 1, 'single-reconciled: totalIntents 1')
  check(r.pendingCount === 0, 'single-reconciled: pendingCount 0')
  check(r.reconciledCount === 1, 'single-reconciled: reconciledCount 1')
}

// 4. Two pending
{
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(state([
    cancellationIntent('pending'),
    cancellationIntent('pending'),
  ]))
  check(r.totalIntents === 2, 'two-pending: totalIntents 2')
  check(r.pendingCount === 2, 'two-pending: pendingCount 2')
  check(r.reconciledCount === 0, 'two-pending: reconciledCount 0')
}

// 5. Two reconciled
{
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(state([
    cancellationIntent('reconciled'),
    cancellationIntent('reconciled'),
  ]))
  check(r.totalIntents === 2, 'two-reconciled: totalIntents 2')
  check(r.pendingCount === 0, 'two-reconciled: pendingCount 0')
  check(r.reconciledCount === 2, 'two-reconciled: reconciledCount 2')
}

// 6. Mixed: 2 pending + 1 reconciled
{
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(state([
    cancellationIntent('pending'),
    cancellationIntent('reconciled'),
    cancellationIntent('pending'),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.pendingCount === 2, 'mixed: pendingCount 2')
  check(r.reconciledCount === 1, 'mixed: reconciledCount 1')
  check(r.pendingCount + r.reconciledCount === r.totalIntents, 'mixed: counts sum to total')
}

// 7. All reconciled
{
  const r = projectEcommerceCancellationIntentPaymentStatusBrief(state([
    cancellationIntent('reconciled'),
    cancellationIntent('reconciled'),
    cancellationIntent('reconciled'),
  ]))
  check(r.totalIntents === 3, 'all-reconciled: totalIntents 3')
  check(r.pendingCount === 0, 'all-reconciled: pendingCount 0')
  check(r.reconciledCount === 3, 'all-reconciled: reconciledCount 3')
  check(r.pendingCount + r.reconciledCount === r.totalIntents, 'all-reconciled: counts sum to total')
}

console.log(`ecommerce-cancellation-intent-payment-status-brief: ${checks} checks passed`)
