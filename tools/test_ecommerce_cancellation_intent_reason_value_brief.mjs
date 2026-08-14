import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentReasonValueBrief } from './ecommerce-cancellation-intent-reason-value-brief.ts'`,
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

const { projectEcommerceCancellationIntentReasonValueBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(reasonCode = 'changed_mind', totalMmk = 10000) {
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
    totalMmk,
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
  const r = projectEcommerceCancellationIntentReasonValueBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.totalMmk === 0, 'empty: totalMmk 0')
  check(r.averageMmk === 0, 'empty: averageMmk 0')
}

// 2. Single changed_mind (8000 MMK)
{
  const r = projectEcommerceCancellationIntentReasonValueBrief(state([
    cancellationIntent('changed_mind', 8000),
  ]))
  check(r.totalIntents === 1, 'changed-mind: totalIntents 1')
  check(r.changedMindCount === 1, 'changed-mind: changedMindCount 1')
  check(r.totalMmk === 8000, 'changed-mind: totalMmk 8000')
}

// 3. Single delivery_too_slow (12000 MMK)
{
  const r = projectEcommerceCancellationIntentReasonValueBrief(state([
    cancellationIntent('delivery_too_slow', 12000),
  ]))
  check(r.deliveryTooSlowCount === 1, 'too-slow: deliveryTooSlowCount 1')
  check(r.duplicateOrderCount === 0, 'too-slow: duplicateOrderCount 0')
  check(r.totalMmk === 12000, 'too-slow: totalMmk 12000')
}

// 4. duplicate_order + order_error (5000 + 15000)
{
  const r = projectEcommerceCancellationIntentReasonValueBrief(state([
    cancellationIntent('duplicate_order', 5000),
    cancellationIntent('order_error', 15000),
  ]))
  check(r.totalIntents === 2, 'dup-err: totalIntents 2')
  check(r.duplicateOrderCount === 1, 'dup-err: duplicateOrderCount 1')
  check(r.orderErrorCount === 1, 'dup-err: orderErrorCount 1')
  check(r.totalMmk === 20000, 'dup-err: totalMmk 20000')
}

// 5. Single 'other' (6000 MMK)
{
  const r = projectEcommerceCancellationIntentReasonValueBrief(state([
    cancellationIntent('other', 6000),
  ]))
  check(r.otherCount === 1, 'other: otherCount 1')
  check(r.averageMmk === 6000, 'other: averageMmk 6000')
  check(r.changedMindCount === 0, 'other: changedMindCount 0')
}

// 6. All 5 reasons: 8k, 12k, 5k, 15k, 10k
{
  const r = projectEcommerceCancellationIntentReasonValueBrief(state([
    cancellationIntent('changed_mind', 8000),
    cancellationIntent('delivery_too_slow', 12000),
    cancellationIntent('duplicate_order', 5000),
    cancellationIntent('order_error', 15000),
    cancellationIntent('other', 10000),
  ]))
  check(r.totalIntents === 5, 'all-reasons: totalIntents 5')
  check(r.changedMindCount === 1, 'all-reasons: changedMindCount 1')
  check(r.deliveryTooSlowCount === 1, 'all-reasons: deliveryTooSlowCount 1')
  check(r.duplicateOrderCount === 1, 'all-reasons: duplicateOrderCount 1')
  check(r.orderErrorCount === 1, 'all-reasons: orderErrorCount 1')
  check(r.otherCount === 1, 'all-reasons: otherCount 1')
  check(r.totalMmk === 50000, 'all-reasons: totalMmk 50000')
}

console.log(`ecommerce-cancellation-intent-reason-value-brief: ${checks} checks passed`)
