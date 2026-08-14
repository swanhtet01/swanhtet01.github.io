import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentRequestedPromisedAtBrief } from './ecommerce-reschedule-intent-requested-promised-at-brief.ts'`,
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

const { projectEcommerceRescheduleIntentRequestedPromisedAtBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function rescheduleIntent(requestedPromisedAt = '2026-08-10T12:00:00Z') {
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
    originalPromisedAt: '2026-08-05T12:00:00Z',
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
  const r = projectEcommerceRescheduleIntentRequestedPromisedAtBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.earliestRequestedPromisedAt === null, 'empty: earliest null')
  check(r.latestRequestedPromisedAt === null, 'empty: latest null')
  check(r.spannedDays === 0, 'empty: spannedDays 0')
}

// 2. Single intent — spannedDays 0
{
  const r = projectEcommerceRescheduleIntentRequestedPromisedAtBrief(state([
    rescheduleIntent('2026-08-10T12:00:00Z'),
  ]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.earliestRequestedPromisedAt === '2026-08-10T12:00:00Z', 'single: earliest')
  check(r.latestRequestedPromisedAt === '2026-08-10T12:00:00Z', 'single: latest')
  check(r.spannedDays === 0, 'single: spannedDays 0')
}

// 3. Two intents same day — spannedDays 0 (08:00/16:00 = 8h = 0.33 days → rounds to 0)
{
  const r = projectEcommerceRescheduleIntentRequestedPromisedAtBrief(state([
    rescheduleIntent('2026-08-15T08:00:00Z'),
    rescheduleIntent('2026-08-15T16:00:00Z'),
  ]))
  check(r.totalIntents === 2, 'same-day: totalIntents 2')
  check(r.earliestRequestedPromisedAt === '2026-08-15T08:00:00Z', 'same-day: earliest')
  check(r.latestRequestedPromisedAt === '2026-08-15T16:00:00Z', 'same-day: latest')
  check(r.spannedDays === 0, 'same-day: spannedDays 0')
}

// 4. Two intents 7 days apart
{
  const r = projectEcommerceRescheduleIntentRequestedPromisedAtBrief(state([
    rescheduleIntent('2026-08-10T12:00:00Z'),
    rescheduleIntent('2026-08-17T12:00:00Z'),
  ]))
  check(r.totalIntents === 2, '7-days: totalIntents 2')
  check(r.earliestRequestedPromisedAt === '2026-08-10T12:00:00Z', '7-days: earliest')
  check(r.latestRequestedPromisedAt === '2026-08-17T12:00:00Z', '7-days: latest')
  check(r.spannedDays === 7, '7-days: spannedDays 7')
}

// 5. Three intents out of order
{
  const r = projectEcommerceRescheduleIntentRequestedPromisedAtBrief(state([
    rescheduleIntent('2026-08-20T08:00:00Z'),
    rescheduleIntent('2026-08-12T12:00:00Z'),
    rescheduleIntent('2026-08-16T15:00:00Z'),
  ]))
  check(r.totalIntents === 3, 'unsorted: totalIntents 3')
  check(r.earliestRequestedPromisedAt === '2026-08-12T12:00:00Z', 'unsorted: earliest')
  check(r.latestRequestedPromisedAt === '2026-08-20T08:00:00Z', 'unsorted: latest')
  check(r.spannedDays === Math.round((Date.parse('2026-08-20T08:00:00Z') - Date.parse('2026-08-12T12:00:00Z')) / (1000 * 60 * 60 * 24)), 'unsorted: spannedDays')
}

// 6. Two intents same timestamp — spannedDays 0, earliest equals latest
{
  const r = projectEcommerceRescheduleIntentRequestedPromisedAtBrief(state([
    rescheduleIntent('2026-08-18T00:00:00Z'),
    rescheduleIntent('2026-08-18T00:00:00Z'),
  ]))
  check(r.totalIntents === 2, 'same-ts: totalIntents 2')
  check(r.spannedDays === 0, 'same-ts: spannedDays 0')
  check(r.earliestRequestedPromisedAt === r.latestRequestedPromisedAt, 'same-ts: earliest equals latest')
}

console.log(`ecommerce-reschedule-intent-requested-promised-at-brief: ${checks} checks passed`)
