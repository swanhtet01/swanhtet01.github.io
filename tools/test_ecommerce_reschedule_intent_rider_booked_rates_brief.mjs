import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentRiderBookedRatesBrief } from './ecommerce-reschedule-intent-rider-booked-rates-brief.ts'`,
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

const { projectEcommerceRescheduleIntentRiderBookedRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function rescheduleIntent({ riderBooked = false } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ERI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 10000,
    originalPromisedAt: '2026-08-05T10:00:00Z',
    replacementRequestId: `REP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    requestedPromisedAt: '2026-08-07T10:00:00Z',
    fulfilment: 'delivery',
    reason: 'Reschedule reason',
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    riderBooked,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(rescheduleIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents,
    events: [],
  }
}

// 1. Empty state — 5 checks
{
  const r = projectEcommerceRescheduleIntentRiderBookedRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.riderBookedCount === 0, 'empty:riderBookedCount')
  check(r.riderBookedRate === 0, 'empty:riderBookedRate')
  check(r.notRiderBookedCount === 0, 'empty:notRiderBookedCount')
  check(r.notRiderBookedRate === 0, 'empty:notRiderBookedRate')
}

// 2. Single booked — 3 checks
{
  const r = projectEcommerceRescheduleIntentRiderBookedRatesBrief(state([
    rescheduleIntent({ riderBooked: true }),
  ]))
  check(r.totalIntents === 1, 'booked:total')
  check(r.riderBookedCount === 1, 'booked:count')
  check(r.riderBookedRate === 1, 'booked:rate')
}

// 3. Single not booked — 3 checks
{
  const r = projectEcommerceRescheduleIntentRiderBookedRatesBrief(state([rescheduleIntent()]))
  check(r.totalIntents === 1, 'notBooked:total')
  check(r.notRiderBookedCount === 1, 'notBooked:count')
  check(r.notRiderBookedRate === 1, 'notBooked:rate')
}

// 4. 2 booked — 3 checks
{
  const r = projectEcommerceRescheduleIntentRiderBookedRatesBrief(state([
    rescheduleIntent({ riderBooked: true }),
    rescheduleIntent({ riderBooked: true }),
  ]))
  check(r.riderBookedCount === 2, 'twoBooked:count')
  check(r.notRiderBookedCount === 0, 'twoBooked:notCount')
  check(r.riderBookedRate === 1, 'twoBooked:rate')
}

// 5. 2 not booked — 2 checks
{
  const r = projectEcommerceRescheduleIntentRiderBookedRatesBrief(state([
    rescheduleIntent(),
    rescheduleIntent(),
  ]))
  check(r.notRiderBookedCount === 2, 'twoNotBooked:count')
  check(r.riderBookedCount === 0, 'twoNotBooked:bookedCount')
}

// 6. 1 booked + 1 not booked — 3 checks
{
  const r = projectEcommerceRescheduleIntentRiderBookedRatesBrief(state([
    rescheduleIntent({ riderBooked: true }),
    rescheduleIntent(),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.riderBookedRate === 0.5, 'half:bookedRate')
  check(r.notRiderBookedRate === 0.5, 'half:notBookedRate')
}

// 7. Precision: 1 booked + 2 not booked (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceRescheduleIntentRiderBookedRatesBrief(state([
    rescheduleIntent({ riderBooked: true }),
    rescheduleIntent(),
    rescheduleIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.riderBookedCount === 1, 'precision:bookedCount')
  check(r.riderBookedRate === 0.3333, 'precision:bookedRate')
  check(r.notRiderBookedRate === 0.6667, 'precision:notBookedRate')
}

console.log(`ecommerce-reschedule-intent-rider-booked-rates-brief: ${checks} checks passed`)
