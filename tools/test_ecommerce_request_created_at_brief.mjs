import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestCreatedAtBrief } from './ecommerce-request-created-at-brief.ts'`,
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

const { projectEcommerceRequestCreatedAtBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function request(createdAt = '2026-08-01T09:00:00Z') {
  reqId++
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `REQ-${reqId}`,
    idempotencyKey: `ik-${reqId}`,
    createdAt,
    sourcePreviewDigest: `spd-${reqId}`,
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
    customerReference: `cust-${reqId}`,
    fulfilment: 'pickup',
    currency: 'MMK',
    lines: [],
    quote: { subtotalMmk: 5000, taxMmk: 0, discountMmk: 0, totalMmk: 5000 },
    totalMmk: 5000,
  }
}

function state(requests = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests,
    returnIntents: [],
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
  const r = projectEcommerceRequestCreatedAtBrief(state())
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.earliestCreatedAt === null, 'empty: earliestCreatedAt null')
  check(r.latestCreatedAt === null, 'empty: latestCreatedAt null')
  check(r.spannedDays === 0, 'empty: spannedDays 0')
}

// 2. Single request — spannedDays 0
{
  const r = projectEcommerceRequestCreatedAtBrief(state([
    request('2026-08-01T09:00:00Z'),
  ]))
  check(r.totalRequests === 1, 'single: totalRequests 1')
  check(r.earliestCreatedAt === '2026-08-01T09:00:00Z', 'single: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-01T09:00:00Z', 'single: latestCreatedAt')
  check(r.spannedDays === 0, 'single: spannedDays 0')
}

// 3. Two requests same day — spannedDays 0
{
  const r = projectEcommerceRequestCreatedAtBrief(state([
    request('2026-08-05T08:00:00Z'),
    request('2026-08-05T16:00:00Z'),
  ]))
  check(r.totalRequests === 2, 'same-day: totalRequests 2')
  check(r.earliestCreatedAt === '2026-08-05T08:00:00Z', 'same-day: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-05T16:00:00Z', 'same-day: latestCreatedAt')
  check(r.spannedDays === 0, 'same-day: spannedDays 0')
}

// 4. Two requests 7 days apart
{
  const r = projectEcommerceRequestCreatedAtBrief(state([
    request('2026-07-25T00:00:00Z'),
    request('2026-08-01T00:00:00Z'),
  ]))
  check(r.totalRequests === 2, '7-days: totalRequests 2')
  check(r.earliestCreatedAt === '2026-07-25T00:00:00Z', '7-days: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-01T00:00:00Z', '7-days: latestCreatedAt')
  check(r.spannedDays === 7, '7-days: spannedDays 7')
}

// 5. Three requests out of order — earliest/latest correct
{
  const r = projectEcommerceRequestCreatedAtBrief(state([
    request('2026-08-10T08:00:00Z'),
    request('2026-08-02T12:00:00Z'),
    request('2026-08-06T15:00:00Z'),
  ]))
  check(r.totalRequests === 3, 'unsorted: totalRequests 3')
  check(r.earliestCreatedAt === '2026-08-02T12:00:00Z', 'unsorted: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-10T08:00:00Z', 'unsorted: latestCreatedAt')
  check(r.spannedDays === Math.round((Date.parse('2026-08-10T08:00:00Z') - Date.parse('2026-08-02T12:00:00Z')) / (1000 * 60 * 60 * 24)), 'unsorted: spannedDays')
}

// 6. All same timestamp — spannedDays 0, earliest equals latest
{
  const r = projectEcommerceRequestCreatedAtBrief(state([
    request('2026-08-08T00:00:00Z'),
    request('2026-08-08T00:00:00Z'),
  ]))
  check(r.totalRequests === 2, 'same-ts: totalRequests 2')
  check(r.spannedDays === 0, 'same-ts: spannedDays 0')
  check(r.earliestCreatedAt === r.latestCreatedAt, 'same-ts: earliest equals latest')
}

console.log(`ecommerce-request-created-at-brief: ${checks} checks passed`)
