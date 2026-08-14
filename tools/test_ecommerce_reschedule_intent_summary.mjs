// Ecommerce reschedule intent summary: totalReschedules, uniqueOrders,
// totalOriginalValueMmk, byFulfilment delivery/pickup, averageShiftDays (Math.round).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentSummary } from './ecommerce-reschedule-intent-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/reschedule-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceRescheduleIntentSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function reschedule({ orderId = 'ord-1', originalTotalMmk = 100_000, fulfilment = 'pickup', originalPromisedAt, requestedPromisedAt }) {
  seq++
  return {
    schema: 'supermega.ecommerce.order_reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope1',
    id: `ri-${seq}`,
    idempotencyKey: `key-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    orderId,
    sourceRequestId: `req-${seq}`,
    sourceAcknowledgementDigest: `digest-${seq}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk,
    originalPromisedAt,
    replacementRequestId: `rep-${seq}`,
    replacementRequestDigest: `rdigest-${seq}`,
    requestedPromisedAt,
    fulfilment,
    reason: `Reschedule reason ${seq}`,
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    riderBooked: false,
    providerCalled: false,
    evidenceReference: `ev-${seq}`,
  }
}

function state(rescheduleIntents = []) {
  return { requests: [], returnIntents: [], supportIntents: [], correctionIntents: [], cancellationIntents: [], cancellationDecisions: [], amendmentIntents: [], rescheduleIntents }
}

// 1. Empty state → all zeros
{
  const r = projectEcommerceRescheduleIntentSummary(state())
  check(r.totalReschedules === 0, 'empty: totalReschedules 0')
  check(r.uniqueOrders === 0, 'empty: uniqueOrders 0')
  check(r.totalOriginalValueMmk === 0, 'empty: totalOriginalValueMmk 0')
  check(r.byFulfilment.delivery === 0, 'empty: byFulfilment.delivery 0')
  check(r.byFulfilment.pickup === 0, 'empty: byFulfilment.pickup 0')
  check(r.averageShiftDays === 0, 'empty: averageShiftDays 0')
}

// 2. Single reschedule: +1 day shift (same date + 1 day)
{
  const r = projectEcommerceRescheduleIntentSummary(state([
    reschedule({
      orderId: 'ord-1',
      originalTotalMmk: 200_000,
      fulfilment: 'pickup',
      originalPromisedAt: '2026-08-15T10:00:00.000Z',
      requestedPromisedAt: '2026-08-16T10:00:00.000Z',
    }),
  ]))
  check(r.totalReschedules === 1, 'single: totalReschedules 1')
  check(r.uniqueOrders === 1, 'single: uniqueOrders 1')
  check(r.totalOriginalValueMmk === 200_000, 'single: totalOriginalValueMmk 200000')
  check(r.byFulfilment.pickup === 1, 'single: byFulfilment.pickup 1')
  check(r.byFulfilment.delivery === 0, 'single: byFulfilment.delivery 0')
  check(r.averageShiftDays === 1, 'single: averageShiftDays 1 (one day later)')
}

// 3. Reschedule earlier: negative shift (−2 days)
{
  const r = projectEcommerceRescheduleIntentSummary(state([
    reschedule({
      originalPromisedAt: '2026-08-15T10:00:00.000Z',
      requestedPromisedAt: '2026-08-13T10:00:00.000Z',
    }),
  ]))
  check(r.averageShiftDays === -2, 'negative-shift: averageShiftDays -2 (two days earlier)')
}

// 4. byFulfilment: delivery and pickup accumulate independently
{
  const r = projectEcommerceRescheduleIntentSummary(state([
    reschedule({ fulfilment: 'delivery', originalPromisedAt: '2026-08-15T00:00:00.000Z', requestedPromisedAt: '2026-08-16T00:00:00.000Z' }),
    reschedule({ fulfilment: 'delivery', originalPromisedAt: '2026-08-15T00:00:00.000Z', requestedPromisedAt: '2026-08-16T00:00:00.000Z' }),
    reschedule({ fulfilment: 'pickup', originalPromisedAt: '2026-08-15T00:00:00.000Z', requestedPromisedAt: '2026-08-17T00:00:00.000Z' }),
  ]))
  check(r.byFulfilment.delivery === 2, 'by-fulfilment: delivery 2')
  check(r.byFulfilment.pickup === 1, 'by-fulfilment: pickup 1')
}

// 5. averageShiftDays: average of multiple shifts
{
  // +1 day, +3 days → avg = 2 days
  const r = projectEcommerceRescheduleIntentSummary(state([
    reschedule({ originalPromisedAt: '2026-08-15T00:00:00.000Z', requestedPromisedAt: '2026-08-16T00:00:00.000Z' }),
    reschedule({ originalPromisedAt: '2026-08-15T00:00:00.000Z', requestedPromisedAt: '2026-08-18T00:00:00.000Z' }),
  ]))
  check(r.averageShiftDays === 2, 'avg-shift: (1+3)/2=2 days')
}

// 6. averageShiftDays rounds: +1 +2 days → 1.5 → Math.round → 2
{
  const r = projectEcommerceRescheduleIntentSummary(state([
    reschedule({ originalPromisedAt: '2026-08-15T00:00:00.000Z', requestedPromisedAt: '2026-08-16T00:00:00.000Z' }),
    reschedule({ originalPromisedAt: '2026-08-15T00:00:00.000Z', requestedPromisedAt: '2026-08-17T00:00:00.000Z' }),
  ]))
  check(r.averageShiftDays === 2, 'avg-round: Math.round(1.5)=2')
}

// 7. uniqueOrders: same orderId counted once
{
  const r = projectEcommerceRescheduleIntentSummary(state([
    reschedule({ orderId: 'ord-A', originalPromisedAt: '2026-08-15T00:00:00.000Z', requestedPromisedAt: '2026-08-16T00:00:00.000Z' }),
    reschedule({ orderId: 'ord-A', originalPromisedAt: '2026-08-16T00:00:00.000Z', requestedPromisedAt: '2026-08-17T00:00:00.000Z' }),
    reschedule({ orderId: 'ord-B', originalPromisedAt: '2026-08-15T00:00:00.000Z', requestedPromisedAt: '2026-08-16T00:00:00.000Z' }),
  ]))
  check(r.uniqueOrders === 2, 'unique-orders: ord-A and ord-B → 2')
  check(r.totalReschedules === 3, 'unique-orders: totalReschedules 3')
}

// 8. totalOriginalValueMmk accumulates
{
  const r = projectEcommerceRescheduleIntentSummary(state([
    reschedule({ originalTotalMmk: 100_000, originalPromisedAt: '2026-08-15T00:00:00.000Z', requestedPromisedAt: '2026-08-16T00:00:00.000Z' }),
    reschedule({ originalTotalMmk: 300_000, originalPromisedAt: '2026-08-15T00:00:00.000Z', requestedPromisedAt: '2026-08-16T00:00:00.000Z' }),
  ]))
  check(r.totalOriginalValueMmk === 400_000, 'value-accum: 100k+300k=400k')
}

console.log(JSON.stringify({ ok: true, checks }))
