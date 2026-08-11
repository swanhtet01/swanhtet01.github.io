// Shop fulfillment lead time: distribution of sameDay/1-3d/4-7d/over1wk, average, median,
// fastest, slowest for completed orders with timing. Tests all bucket boundaries and stats.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopFulfillmentLeadTimeSummary } from './shop-fulfillment-lead-time-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/lead-time-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopFulfillmentLeadTimeSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function proof(capturedAt) {
  seq += 1
  return { actionId: `a-${seq}`, capturedAt, actor: 'op1', reason: 'done', evidenceReference: `e-${seq}` }
}

function order({ status = 'completed', createdAt, completedAt = undefined } = {}) {
  seq += 1
  return {
    id: `ord-${seq}`,
    createdAt,
    customer: `cust-${seq}`,
    channel: 'walk-in',
    item: 'Widget',
    quantity: 1,
    payment: 'cash',
    paymentStatus: 'reconciled',
    refundStatus: 'not_applicable',
    total: 10000,
    status,
    ...(completedAt !== undefined ? { completion: proof(completedAt) } : {}),
  }
}

function state(orders = []) {
  return { schema: 'supermega.commerce.workspace.v2', items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all nulls
{
  const r = projectShopFulfillmentLeadTimeSummary(state())
  check(r.completedWithTiming === 0, 'empty: completedWithTiming is 0')
  check(r.averageLeadTimeHours === null, 'empty: averageLeadTimeHours is null')
  check(r.medianLeadTimeHours === null, 'empty: medianLeadTimeHours is null')
  check(r.fastestLeadTimeHours === null, 'empty: fastestLeadTimeHours is null')
  check(r.slowestLeadTimeHours === null, 'empty: slowestLeadTimeHours is null')
}

// 2. Cancelled orders excluded
{
  const r = projectShopFulfillmentLeadTimeSummary(state([
    order({ status: 'cancelled', createdAt: '2026-08-10T08:00:00Z', completedAt: '2026-08-10T09:00:00Z' }),
  ]))
  check(r.completedWithTiming === 0, 'cancelled: excluded from timing')
}

// 3. Completed with no completion record → excluded
{
  const r = projectShopFulfillmentLeadTimeSummary(state([
    order({ status: 'completed', createdAt: '2026-08-10T08:00:00Z' }),
  ]))
  check(r.completedWithTiming === 0, 'no-completion: excluded from timing')
}

// 4. Same-day fulfillment (< 24h)
{
  const r = projectShopFulfillmentLeadTimeSummary(state([
    order({ createdAt: '2026-08-11T08:00:00Z', completedAt: '2026-08-11T14:00:00Z' }),  // 6h
  ]))
  check(r.completedWithTiming === 1, 'sameDay: 1 order')
  check(r.distribution.sameDay === 1, 'sameDay: sameDay bucket is 1')
  check(r.fastestLeadTimeHours === 6, 'sameDay: fastest is 6h')
  check(r.slowestLeadTimeHours === 6, 'sameDay: slowest is 6h')
  check(r.averageLeadTimeHours === 6, 'sameDay: average is 6h')
  check(r.medianLeadTimeHours === 6, 'sameDay: median is 6h')
}

// 5. Boundary: 23h → sameDay; 24h → oneToThreeDays
{
  const orders = [
    order({ createdAt: '2026-08-10T00:00:00Z', completedAt: '2026-08-10T23:00:00Z' }),  // 23h → sameDay
    order({ createdAt: '2026-08-10T00:00:00Z', completedAt: '2026-08-11T00:00:00Z' }),  // 24h → 1-3d
  ]
  const r = projectShopFulfillmentLeadTimeSummary(state(orders))
  check(r.distribution.sameDay === 1, 'boundary: 23h is sameDay')
  check(r.distribution.oneToThreeDays === 1, 'boundary: 24h is oneToThreeDays')
}

// 6. Boundary: 71h → oneToThreeDays; 72h → fourToSevenDays
{
  const orders = [
    order({ createdAt: '2026-08-08T00:00:00Z', completedAt: '2026-08-10T23:00:00Z' }),  // 71h
    order({ createdAt: '2026-08-08T00:00:00Z', completedAt: '2026-08-11T00:00:00Z' }),  // 72h
  ]
  const r = projectShopFulfillmentLeadTimeSummary(state(orders))
  check(r.distribution.oneToThreeDays === 1, 'boundary: 71h is oneToThreeDays')
  check(r.distribution.fourToSevenDays === 1, 'boundary: 72h is fourToSevenDays')
}

// 7. Boundary: 167h → fourToSevenDays; 168h → overOneWeek
{
  const orders = [
    order({ createdAt: '2026-08-04T01:00:00Z', completedAt: '2026-08-11T00:00:00Z' }),  // 167h
    order({ createdAt: '2026-08-04T00:00:00Z', completedAt: '2026-08-11T00:00:00Z' }),  // 168h
  ]
  const r = projectShopFulfillmentLeadTimeSummary(state(orders))
  check(r.distribution.fourToSevenDays === 1, 'boundary: 167h is fourToSevenDays')
  check(r.distribution.overOneWeek === 1, 'boundary: 168h is overOneWeek')
}

// 8. Average and median with multiple orders
{
  // Lead times: 4h, 12h, 48h → average = round(64/3) = 21; median = 12
  const orders = [
    order({ createdAt: '2026-08-11T00:00:00Z', completedAt: '2026-08-11T04:00:00Z' }),
    order({ createdAt: '2026-08-11T00:00:00Z', completedAt: '2026-08-11T12:00:00Z' }),
    order({ createdAt: '2026-08-11T00:00:00Z', completedAt: '2026-08-13T00:00:00Z' }),
  ]
  const r = projectShopFulfillmentLeadTimeSummary(state(orders))
  check(r.completedWithTiming === 3, 'stats: 3 orders')
  check(r.fastestLeadTimeHours === 4, 'stats: fastest is 4h')
  check(r.slowestLeadTimeHours === 48, 'stats: slowest is 48h')
  check(r.averageLeadTimeHours === 21, 'stats: average is 21 = round(64/3)')
  check(r.medianLeadTimeHours === 12, 'stats: median is 12 (middle of sorted [4, 12, 48])')
}

// 9. Even number of orders → median is average of two middle values
{
  // Lead times: 10h, 20h → median = round((10+20)/2) = 15
  const orders = [
    order({ createdAt: '2026-08-11T00:00:00Z', completedAt: '2026-08-11T10:00:00Z' }),
    order({ createdAt: '2026-08-11T00:00:00Z', completedAt: '2026-08-11T20:00:00Z' }),
  ]
  const r = projectShopFulfillmentLeadTimeSummary(state(orders))
  check(r.medianLeadTimeHours === 15, 'even-median: 2 orders median is 15')
}

// 10. Date filter
{
  const orders = [
    order({ createdAt: '2026-08-10T08:00:00Z', completedAt: '2026-08-10T20:00:00Z' }),  // Aug 10, 12h
    order({ createdAt: '2026-08-11T08:00:00Z', completedAt: '2026-08-11T10:00:00Z' }),  // Aug 11, 2h
  ]
  const r = projectShopFulfillmentLeadTimeSummary(state(orders), '2026-08-11')
  check(r.completedWithTiming === 1, 'date-filter: only Aug 11 order counted')
  check(r.fastestLeadTimeHours === 2, 'date-filter: Aug 11 fastest is 2h')
}

console.log(JSON.stringify({ ok: true, checks }))
