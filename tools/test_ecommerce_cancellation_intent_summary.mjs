// Ecommerce cancellation intent summary: totalIntents, uniqueOrders, totalOrderValueMmk,
// byReasonCode (5 kinds), byOrderStatus (3 kinds), topReasonCode (alpha tie-break; null if empty).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentSummary } from './ecommerce-cancellation-intent-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/cancellation-intent-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceCancellationIntentSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1' }
let seq = 0

function intent({ orderId = 'ORD-1', totalMmk = 10_000, orderStatus = 'confirmed', paymentStatus = 'pending', reasonCode = 'changed_mind' } = {}) {
  seq++
  return {
    id: `ci-${seq}`,
    idempotencyKey: `ik-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    orderId,
    sourceRequestId: 'REQ-1',
    sourceAcknowledgementDigest: 'ack',
    orderStatus,
    paymentStatus,
    refundStatus: 'none',
    totalMmk,
    reasonCode,
    reason: 'test',
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    evidenceReference: 'EVD-1',
  }
}

function state(cancellationIntents = []) {
  return {
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

// 1. Empty → all zeros, topReasonCode null
{
  const r = projectEcommerceCancellationIntentSummary(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.uniqueOrders === 0, 'empty: uniqueOrders 0')
  check(r.totalOrderValueMmk === 0, 'empty: totalOrderValueMmk 0')
  check(r.byReasonCode.changed_mind === 0, 'empty: byReasonCode.changed_mind 0')
  check(r.byOrderStatus.confirmed === 0, 'empty: byOrderStatus.confirmed 0')
  check(r.topReasonCode === null, 'empty: topReasonCode null')
}

// 2. Single: changed_mind, confirmed
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ orderId: 'ORD-A', totalMmk: 10_000, orderStatus: 'confirmed', reasonCode: 'changed_mind' }),
  ]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.uniqueOrders === 1, 'single: uniqueOrders 1')
  check(r.totalOrderValueMmk === 10_000, 'single: totalOrderValueMmk 10000')
  check(r.byReasonCode.changed_mind === 1, 'single: byReasonCode.changed_mind 1')
  check(r.byReasonCode.duplicate_order === 0, 'single: byReasonCode.duplicate_order 0')
  check(r.byOrderStatus.confirmed === 1, 'single: byOrderStatus.confirmed 1')
  check(r.byOrderStatus.preparing === 0, 'single: byOrderStatus.preparing 0')
  check(r.topReasonCode === 'changed_mind', 'single: topReasonCode changed_mind')
}

// 3. reasonCode 'duplicate_order'
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ reasonCode: 'duplicate_order' }),
  ]))
  check(r.byReasonCode.duplicate_order === 1, 'dup-order: byReasonCode.duplicate_order 1')
}

// 4. reasonCode 'delivery_too_slow'
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ reasonCode: 'delivery_too_slow' }),
  ]))
  check(r.byReasonCode.delivery_too_slow === 1, 'slow: byReasonCode.delivery_too_slow 1')
}

// 5. reasonCode 'order_error'
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ reasonCode: 'order_error' }),
  ]))
  check(r.byReasonCode.order_error === 1, 'err: byReasonCode.order_error 1')
}

// 6. reasonCode 'other'
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ reasonCode: 'other' }),
  ]))
  check(r.byReasonCode.other === 1, 'other: byReasonCode.other 1')
}

// 7. byOrderStatus 'preparing'
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ orderStatus: 'preparing' }),
  ]))
  check(r.byOrderStatus.preparing === 1, 'preparing: byOrderStatus.preparing 1')
}

// 8. byOrderStatus 'ready'
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ orderStatus: 'ready' }),
  ]))
  check(r.byOrderStatus.ready === 1, 'ready: byOrderStatus.ready 1')
}

// 9. uniqueOrders dedup: same orderId → 1
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ orderId: 'ORD-X' }),
    intent({ orderId: 'ORD-X' }),
  ]))
  check(r.uniqueOrders === 1, 'dedup: uniqueOrders 1')
  check(r.totalIntents === 2, 'dedup: totalIntents 2')
}

// 10. totalOrderValueMmk accumulates
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ totalMmk: 10_000 }),
    intent({ totalMmk: 7_000 }),
  ]))
  check(r.totalOrderValueMmk === 17_000, 'accum: totalOrderValueMmk 10k+7k=17k')
}

// 11. topReasonCode: most frequent wins
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ reasonCode: 'changed_mind' }),
    intent({ reasonCode: 'delivery_too_slow' }),
    intent({ reasonCode: 'delivery_too_slow' }),
  ]))
  check(r.topReasonCode === 'delivery_too_slow', 'top-freq: delivery_too_slow (2) wins')
}

// 12. topReasonCode: alpha tie-break ('changed_mind' < 'other')
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ reasonCode: 'other' }),
    intent({ reasonCode: 'changed_mind' }),
  ]))
  check(r.topReasonCode === 'changed_mind', 'tie: changed_mind < other')
}

// 13. All three orderStatus values
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ orderStatus: 'confirmed' }),
    intent({ orderStatus: 'preparing' }),
    intent({ orderStatus: 'ready' }),
  ]))
  check(r.byOrderStatus.confirmed === 1, 'all-status: confirmed 1')
  check(r.byOrderStatus.preparing === 1, 'all-status: preparing 1')
  check(r.byOrderStatus.ready === 1, 'all-status: ready 1')
}

// 14. byReasonCode accumulates
{
  const r = projectEcommerceCancellationIntentSummary(state([
    intent({ reasonCode: 'changed_mind' }),
    intent({ reasonCode: 'changed_mind' }),
    intent({ reasonCode: 'other' }),
  ]))
  check(r.byReasonCode.changed_mind === 2, 'accum-rc: changed_mind 2')
  check(r.byReasonCode.other === 1, 'accum-rc: other 1')
}

console.log(JSON.stringify({ ok: true, checks }))
