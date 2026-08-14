import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentOriginalPromisedAtBrief } from './ecommerce-reschedule-intent-original-promised-at-brief.ts'`,
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

const { projectEcommerceRescheduleIntentOriginalPromisedAtBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function rescheduleIntent(originalPromisedAt = '2026-08-05T12:00:00Z') {
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
    requestedPromisedAt: '2026-08-10T12:00:00Z',
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

// 1. Empty state
{
  const r = projectEcommerceRescheduleIntentOriginalPromisedAtBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.earliestOriginalPromisedAt === null, 'empty: earliest null')
  check(r.latestOriginalPromisedAt === null, 'empty: latest null')
  check(r.spannedDays === 0, 'empty: spannedDays 0')
}

// 2. Single intent — spannedDays 0 (< 2 items)
{
  const r = projectEcommerceRescheduleIntentOriginalPromisedAtBrief(state([
    rescheduleIntent('2026-08-05T12:00:00Z'),
  ]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.earliestOriginalPromisedAt === '2026-08-05T12:00:00Z', 'single: earliest')
  check(r.latestOriginalPromisedAt === '2026-08-05T12:00:00Z', 'single: latest')
  check(r.spannedDays === 0, 'single: spannedDays 0')
}

// 3. Two same-day intents (8h gap → 0.333 days → rounds to 0)
{
  const r = projectEcommerceRescheduleIntentOriginalPromisedAtBrief(state([
    rescheduleIntent('2026-08-06T08:00:00Z'),
    rescheduleIntent('2026-08-06T16:00:00Z'),
  ]))
  check(r.totalIntents === 2, 'same-day: totalIntents 2')
  check(r.earliestOriginalPromisedAt === '2026-08-06T08:00:00Z', 'same-day: earliest')
  check(r.latestOriginalPromisedAt === '2026-08-06T16:00:00Z', 'same-day: latest')
  check(r.spannedDays === 0, 'same-day: spannedDays 0')
}

// 4. Two intents 7 days apart
{
  const r = projectEcommerceRescheduleIntentOriginalPromisedAtBrief(state([
    rescheduleIntent('2026-08-01T12:00:00Z'),
    rescheduleIntent('2026-08-08T12:00:00Z'),
  ]))
  check(r.totalIntents === 2, 'week: totalIntents 2')
  check(r.spannedDays === 7, 'week: spannedDays 7')
  check(r.earliestOriginalPromisedAt === '2026-08-01T12:00:00Z', 'week: earliest')
  check(r.latestOriginalPromisedAt === '2026-08-08T12:00:00Z', 'week: latest')
}

// 5. Three intents out of chronological order
{
  const r = projectEcommerceRescheduleIntentOriginalPromisedAtBrief(state([
    rescheduleIntent('2026-08-10T12:00:00Z'),
    rescheduleIntent('2026-08-03T12:00:00Z'),
    rescheduleIntent('2026-08-17T12:00:00Z'),
  ]))
  check(r.totalIntents === 3, 'unsorted: totalIntents 3')
  check(r.earliestOriginalPromisedAt === '2026-08-03T12:00:00Z', 'unsorted: earliest')
  check(r.latestOriginalPromisedAt === '2026-08-17T12:00:00Z', 'unsorted: latest')
  check(r.spannedDays === 14, 'unsorted: spannedDays 14')
}

// 6. Two identical dates — spannedDays 0
{
  const r = projectEcommerceRescheduleIntentOriginalPromisedAtBrief(state([
    rescheduleIntent('2026-08-12T12:00:00Z'),
    rescheduleIntent('2026-08-12T12:00:00Z'),
  ]))
  check(r.spannedDays === 0, 'identical: spannedDays 0')
  check(r.earliestOriginalPromisedAt === r.latestOriginalPromisedAt, 'identical: same date')
  check(r.totalIntents === 2, 'identical: totalIntents 2')
}

console.log(`ecommerce-reschedule-intent-original-promised-at-brief: ${checks} checks passed`)
