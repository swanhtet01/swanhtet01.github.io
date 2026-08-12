import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentReasonCodeRatesBrief } from './ecommerce-cancellation-intent-reason-code-rates-brief.ts'`,
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

const { projectEcommerceCancellationIntentReasonCodeRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent({ reasonCode = 'changed_mind' } = {}) {
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

// 1. Empty state — 11 checks
{
  const r = projectEcommerceCancellationIntentReasonCodeRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.changedMindCount === 0, 'empty:changedMindCount')
  check(r.changedMindRate === 0, 'empty:changedMindRate')
  check(r.duplicateOrderCount === 0, 'empty:duplicateOrderCount')
  check(r.duplicateOrderRate === 0, 'empty:duplicateOrderRate')
  check(r.orderErrorCount === 0, 'empty:orderErrorCount')
  check(r.orderErrorRate === 0, 'empty:orderErrorRate')
  check(r.deliveryTooSlowCount === 0, 'empty:deliveryTooSlowCount')
  check(r.deliveryTooSlowRate === 0, 'empty:deliveryTooSlowRate')
  check(r.otherReasonCount === 0, 'empty:otherReasonCount')
  check(r.otherReasonRate === 0, 'empty:otherReasonRate')
}

// 2. Single changed_mind — 2 checks
{
  const r = projectEcommerceCancellationIntentReasonCodeRatesBrief(state([
    cancellationIntent({ reasonCode: 'changed_mind' }),
  ]))
  check(r.changedMindCount === 1, 'changedMind:count')
  check(r.changedMindRate === 1, 'changedMind:rate')
}

// 3. Single duplicate_order — 2 checks
{
  const r = projectEcommerceCancellationIntentReasonCodeRatesBrief(state([
    cancellationIntent({ reasonCode: 'duplicate_order' }),
  ]))
  check(r.duplicateOrderCount === 1, 'duplicateOrder:count')
  check(r.duplicateOrderRate === 1, 'duplicateOrder:rate')
}

// 4. Single order_error — 2 checks
{
  const r = projectEcommerceCancellationIntentReasonCodeRatesBrief(state([
    cancellationIntent({ reasonCode: 'order_error' }),
  ]))
  check(r.orderErrorCount === 1, 'orderError:count')
  check(r.orderErrorRate === 1, 'orderError:rate')
}

// 5. Single delivery_too_slow — 2 checks
{
  const r = projectEcommerceCancellationIntentReasonCodeRatesBrief(state([
    cancellationIntent({ reasonCode: 'delivery_too_slow' }),
  ]))
  check(r.deliveryTooSlowCount === 1, 'deliveryTooSlow:count')
  check(r.deliveryTooSlowRate === 1, 'deliveryTooSlow:rate')
}

// 6. Single other — 2 checks
{
  const r = projectEcommerceCancellationIntentReasonCodeRatesBrief(state([
    cancellationIntent({ reasonCode: 'other' }),
  ]))
  check(r.otherReasonCount === 1, 'other:count')
  check(r.otherReasonRate === 1, 'other:rate')
}

// 7. 2 changed_mind + 1 order_error — 2 checks
{
  const r = projectEcommerceCancellationIntentReasonCodeRatesBrief(state([
    cancellationIntent({ reasonCode: 'changed_mind' }),
    cancellationIntent({ reasonCode: 'changed_mind' }),
    cancellationIntent({ reasonCode: 'order_error' }),
  ]))
  check(r.changedMindCount === 2, 'mixed:changedMindCount')
  check(r.orderErrorRate === 0.3333, 'mixed:orderErrorRate')
}

console.log(`ecommerce-cancellation-intent-reason-code-rates-brief: ${checks} checks passed`)
