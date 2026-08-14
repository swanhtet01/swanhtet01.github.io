// Ecommerce cancellation intent reason/orderStatus brief: 5-value + 3-value enum distributions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentReasonOrderStatusBrief } from './ecommerce-cancellation-intent-reason-order-status-brief.ts'`,
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

const { projectEcommerceCancellationIntentReasonOrderStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent({ reasonCode = 'changed_mind', orderStatus = 'confirmed' } = {}) {
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
    orderStatus,
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 5000,
    reasonCode,
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
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.changedMindCount === 0, 'empty: changedMindCount 0')
  check(r.changedMindRate === 0, 'empty: changedMindRate 0')
  check(r.confirmedOrderStatusCount === 0, 'empty: confirmedOrderStatusCount 0')
}

// 2. All changed_mind
{
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(
    state([cancellationIntent({ reasonCode: 'changed_mind' }), cancellationIntent({ reasonCode: 'changed_mind' })]),
  )
  check(r.changedMindCount === 2, 'all-cm: changedMindCount 2')
  check(r.changedMindRate === 100, 'all-cm: changedMindRate 100')
  check(r.duplicateOrderRate === 0, 'all-cm: duplicateOrderRate 0')
}

// 3. All duplicate_order
{
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(
    state([cancellationIntent({ reasonCode: 'duplicate_order' })]),
  )
  check(r.duplicateOrderCount === 1, 'dup: duplicateOrderCount 1')
  check(r.duplicateOrderRate === 100, 'dup: duplicateOrderRate 100')
}

// 4. All order_error
{
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(
    state([cancellationIntent({ reasonCode: 'order_error' })]),
  )
  check(r.orderErrorCount === 1, 'oe: orderErrorCount 1')
  check(r.orderErrorRate === 100, 'oe: orderErrorRate 100')
}

// 5. All delivery_too_slow
{
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(
    state([cancellationIntent({ reasonCode: 'delivery_too_slow' })]),
  )
  check(r.deliveryTooSlowCount === 1, 'dts: deliveryTooSlowCount 1')
  check(r.deliveryTooSlowRate === 100, 'dts: deliveryTooSlowRate 100')
}

// 6. All other
{
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(
    state([cancellationIntent({ reasonCode: 'other' })]),
  )
  check(r.otherReasonCount === 1, 'other: otherReasonCount 1')
  check(r.otherReasonRate === 100, 'other: otherReasonRate 100')
}

// 7. All confirmed orderStatus
{
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(
    state([cancellationIntent({ orderStatus: 'confirmed' }), cancellationIntent({ orderStatus: 'confirmed' })]),
  )
  check(r.confirmedOrderStatusCount === 2, 'conf: confirmedOrderStatusCount 2')
  check(r.confirmedOrderStatusRate === 100, 'conf: confirmedOrderStatusRate 100')
  check(r.preparingOrderStatusRate === 0, 'conf: preparingOrderStatusRate 0')
  check(r.readyOrderStatusRate === 0, 'conf: readyOrderStatusRate 0')
}

// 8. All preparing orderStatus
{
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(
    state([cancellationIntent({ orderStatus: 'preparing' })]),
  )
  check(r.preparingOrderStatusCount === 1, 'prep: preparingOrderStatusCount 1')
  check(r.preparingOrderStatusRate === 100, 'prep: preparingOrderStatusRate 100')
}

// 9. All ready orderStatus
{
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(
    state([cancellationIntent({ orderStatus: 'ready' })]),
  )
  check(r.readyOrderStatusCount === 1, 'ready: readyOrderStatusCount 1')
  check(r.readyOrderStatusRate === 100, 'ready: readyOrderStatusRate 100')
}

// 10. Mixed reason codes — counts sum to total
{
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(
    state([
      cancellationIntent({ reasonCode: 'changed_mind' }),
      cancellationIntent({ reasonCode: 'duplicate_order' }),
      cancellationIntent({ reasonCode: 'other' }),
    ]),
  )
  check(
    r.changedMindCount + r.duplicateOrderCount + r.orderErrorCount + r.deliveryTooSlowCount + r.otherReasonCount === r.totalIntents,
    'invariant: reason counts sum to total',
  )
}

// 11. Mixed orderStatus — counts sum to total
{
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(
    state([
      cancellationIntent({ orderStatus: 'confirmed' }),
      cancellationIntent({ orderStatus: 'preparing' }),
      cancellationIntent({ orderStatus: 'ready' }),
    ]),
  )
  check(
    r.confirmedOrderStatusCount + r.preparingOrderStatusCount + r.readyOrderStatusCount === r.totalIntents,
    'invariant: orderStatus counts sum to total',
  )
  check(r.confirmedOrderStatusRate === 33, 'mixed-os: confirmedRate 33')
  check(r.preparingOrderStatusRate === 33, 'mixed-os: preparingRate 33')
  check(r.readyOrderStatusRate === 33, 'mixed-os: readyRate 33')
}

// 12. Rounding: 2/3 → 67%, 1/3 → 33%
{
  const r = projectEcommerceCancellationIntentReasonOrderStatusBrief(
    state([
      cancellationIntent({ reasonCode: 'changed_mind' }),
      cancellationIntent({ reasonCode: 'changed_mind' }),
      cancellationIntent({ reasonCode: 'other' }),
    ]),
  )
  check(r.changedMindRate === 67, 'round: changedMindRate 67')
  check(r.otherReasonRate === 33, 'round: otherReasonRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
