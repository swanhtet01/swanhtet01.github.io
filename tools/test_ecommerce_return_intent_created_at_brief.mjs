import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentCreatedAtBrief } from './ecommerce-return-intent-created-at-brief.ts'`,
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

const { projectEcommerceReturnIntentCreatedAtBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function returnIntent(createdAt = '2026-08-01T09:00:00Z') {
  intentId++
  return {
    schema: 'supermega.ecommerce.return_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `RI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt,
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sku: `SKU-${intentId}`,
    quantity: 1,
    disposition: 'return_to_stock',
    reason: 'Defective item',
    refundStatus: 'not_started',
    evidenceReference: `ev-${intentId}`,
  }
}

function state(returnIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents,
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceReturnIntentCreatedAtBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.earliestCreatedAt === null, 'empty: earliestCreatedAt null')
  check(r.latestCreatedAt === null, 'empty: latestCreatedAt null')
  check(r.spannedDays === 0, 'empty: spannedDays 0')
}

// 2. Single intent — spannedDays 0
{
  const r = projectEcommerceReturnIntentCreatedAtBrief(state([
    returnIntent('2026-08-01T09:00:00Z'),
  ]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.earliestCreatedAt === '2026-08-01T09:00:00Z', 'single: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-01T09:00:00Z', 'single: latestCreatedAt')
  check(r.spannedDays === 0, 'single: spannedDays 0')
}

// 3. Two intents same day — spannedDays 0
{
  const r = projectEcommerceReturnIntentCreatedAtBrief(state([
    returnIntent('2026-08-05T08:00:00Z'),
    returnIntent('2026-08-05T16:00:00Z'),
  ]))
  check(r.totalIntents === 2, 'same-day: totalIntents 2')
  check(r.earliestCreatedAt === '2026-08-05T08:00:00Z', 'same-day: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-05T16:00:00Z', 'same-day: latestCreatedAt')
  check(r.spannedDays === 0, 'same-day: spannedDays 0')
}

// 4. Two intents 7 days apart
{
  const r = projectEcommerceReturnIntentCreatedAtBrief(state([
    returnIntent('2026-07-25T00:00:00Z'),
    returnIntent('2026-08-01T00:00:00Z'),
  ]))
  check(r.totalIntents === 2, '7-days: totalIntents 2')
  check(r.earliestCreatedAt === '2026-07-25T00:00:00Z', '7-days: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-01T00:00:00Z', '7-days: latestCreatedAt')
  check(r.spannedDays === 7, '7-days: spannedDays 7')
}

// 5. Three intents out of order — earliest/latest correct
{
  const r = projectEcommerceReturnIntentCreatedAtBrief(state([
    returnIntent('2026-08-10T08:00:00Z'),
    returnIntent('2026-08-02T12:00:00Z'),
    returnIntent('2026-08-06T15:00:00Z'),
  ]))
  check(r.totalIntents === 3, 'unsorted: totalIntents 3')
  check(r.earliestCreatedAt === '2026-08-02T12:00:00Z', 'unsorted: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-10T08:00:00Z', 'unsorted: latestCreatedAt')
  check(r.spannedDays === Math.round((Date.parse('2026-08-10T08:00:00Z') - Date.parse('2026-08-02T12:00:00Z')) / (1000 * 60 * 60 * 24)), 'unsorted: spannedDays')
}

// 6. All same timestamp — spannedDays 0, earliest equals latest
{
  const r = projectEcommerceReturnIntentCreatedAtBrief(state([
    returnIntent('2026-08-08T00:00:00Z'),
    returnIntent('2026-08-08T00:00:00Z'),
  ]))
  check(r.totalIntents === 2, 'same-ts: totalIntents 2')
  check(r.spannedDays === 0, 'same-ts: spannedDays 0')
  check(r.earliestCreatedAt === r.latestCreatedAt, 'same-ts: earliest equals latest')
}

console.log(`ecommerce-return-intent-created-at-brief: ${checks} checks passed`)
