import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentPromiseDateBrief } from './ecommerce-reschedule-intent-promise-date-brief.ts'`,
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

const { projectEcommerceRescheduleIntentPromiseDateBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function rescheduleIntent({ originalPromisedAt = '2026-08-01T12:00:00Z', requestedPromisedAt = '2026-08-02T12:00:00Z' } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `RSI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 18500,
    originalPromisedAt,
    replacementRequestId: `RRP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    requestedPromisedAt,
    fulfilment: 'pickup',
    reason: 'Need more time',
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    riderBooked: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(rescheduleIntents) {
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

// 1. Empty state
{
  const r = projectEcommerceRescheduleIntentPromiseDateBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.averageDeltaHours === 0, 'empty: averageDeltaHours 0')
  check(r.minDeltaHours === null, 'empty: minDeltaHours null')
  check(r.maxDeltaHours === null, 'empty: maxDeltaHours null')
  check(r.earlierCount === 0, 'empty: earlierCount 0')
  check(r.sameDayCount === 0, 'empty: sameDayCount 0')
  check(r.laterCount === 0, 'empty: laterCount 0')
  check(r.oneDayLaterCount === 0, 'empty: oneDayLaterCount 0')
  check(r.twoThreeDaysLaterCount === 0, 'empty: twoThreeDaysLaterCount 0')
  check(r.fourPlusDaysLaterCount === 0, 'empty: fourPlusDaysLaterCount 0')
}

// 2. Single 24h delay — oneDayLater
{
  const r = projectEcommerceRescheduleIntentPromiseDateBrief(state([
    rescheduleIntent({ originalPromisedAt: '2026-08-01T12:00:00Z', requestedPromisedAt: '2026-08-02T12:00:00Z' }),
  ]))
  check(r.totalIntents === 1, 'one-day: totalIntents 1')
  check(r.averageDeltaHours === 24, 'one-day: averageDeltaHours 24')
  check(r.minDeltaHours === 24, 'one-day: minDeltaHours 24')
  check(r.maxDeltaHours === 24, 'one-day: maxDeltaHours 24')
  check(r.laterCount === 1, 'one-day: laterCount 1')
  check(r.oneDayLaterCount === 1, 'one-day: oneDayLaterCount 1')
  check(r.twoThreeDaysLaterCount === 0, 'one-day: twoThreeDaysLaterCount 0')
  check(r.earlierCount === 0, 'one-day: earlierCount 0')
}

// 3. Earlier — customer wants it sooner (-24h)
{
  const r = projectEcommerceRescheduleIntentPromiseDateBrief(state([
    rescheduleIntent({ originalPromisedAt: '2026-08-02T12:00:00Z', requestedPromisedAt: '2026-08-01T12:00:00Z' }),
  ]))
  check(r.earlierCount === 1, 'earlier: earlierCount 1')
  check(r.laterCount === 0, 'earlier: laterCount 0')
  check(r.minDeltaHours === -24, 'earlier: minDeltaHours -24')
  check(r.averageDeltaHours === -24, 'earlier: averageDeltaHours -24')
}

// 4. Same day (delta = 0)
{
  const r = projectEcommerceRescheduleIntentPromiseDateBrief(state([
    rescheduleIntent({ originalPromisedAt: '2026-08-01T12:00:00Z', requestedPromisedAt: '2026-08-01T12:00:00Z' }),
  ]))
  check(r.sameDayCount === 1, 'same: sameDayCount 1')
  check(r.earlierCount === 0, 'same: earlierCount 0')
  check(r.laterCount === 0, 'same: laterCount 0')
  check(r.averageDeltaHours === 0, 'same: averageDeltaHours 0')
}

// 5. twoThreeDaysLater (36h)
{
  const r = projectEcommerceRescheduleIntentPromiseDateBrief(state([
    rescheduleIntent({ originalPromisedAt: '2026-08-01T00:00:00Z', requestedPromisedAt: '2026-08-02T12:00:00Z' }),
  ]))
  check(r.twoThreeDaysLaterCount === 1, 'two-three: twoThreeDaysLaterCount 1')
  check(r.oneDayLaterCount === 0, 'two-three: oneDayLaterCount 0')
  check(r.fourPlusDaysLaterCount === 0, 'two-three: fourPlusDaysLaterCount 0')
}

// 6. fourPlusDaysLater (96h)
{
  const r = projectEcommerceRescheduleIntentPromiseDateBrief(state([
    rescheduleIntent({ originalPromisedAt: '2026-08-01T00:00:00Z', requestedPromisedAt: '2026-08-05T00:00:00Z' }),
  ]))
  check(r.fourPlusDaysLaterCount === 1, 'four-plus: fourPlusDaysLaterCount 1')
  check(r.twoThreeDaysLaterCount === 0, 'four-plus: twoThreeDaysLaterCount 0')
  check(r.maxDeltaHours === 96, 'four-plus: maxDeltaHours 96')
}

// 7. Mixed: earlier + oneDayLater + fourPlusDays → averageDelta = (-24 + 24 + 96) / 3 = 32
{
  const r = projectEcommerceRescheduleIntentPromiseDateBrief(state([
    rescheduleIntent({ originalPromisedAt: '2026-08-02T12:00:00Z', requestedPromisedAt: '2026-08-01T12:00:00Z' }), // -24
    rescheduleIntent({ originalPromisedAt: '2026-08-01T12:00:00Z', requestedPromisedAt: '2026-08-02T12:00:00Z' }), // +24
    rescheduleIntent({ originalPromisedAt: '2026-08-01T00:00:00Z', requestedPromisedAt: '2026-08-05T00:00:00Z' }), // +96
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.earlierCount === 1, 'mixed: earlierCount 1')
  check(r.laterCount === 2, 'mixed: laterCount 2')
  check(r.oneDayLaterCount === 1, 'mixed: oneDayLaterCount 1')
  check(r.fourPlusDaysLaterCount === 1, 'mixed: fourPlusDaysLaterCount 1')
  check(r.minDeltaHours === -24, 'mixed: minDeltaHours -24')
  check(r.maxDeltaHours === 96, 'mixed: maxDeltaHours 96')
  check(r.averageDeltaHours === Math.round((-24 + 24 + 96) / 3), 'mixed: averageDeltaHours 32')
}

console.log(`ecommerce-reschedule-intent-promise-date-brief: ${checks} checks passed`)
