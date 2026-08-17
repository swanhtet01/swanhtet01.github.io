// AR aging summary: groups outstanding orders by days-past-due bucket.
// Tests bucket boundaries, exclusion rules, totalOutstanding, overdue aggregates,
// mostOverdueCustomer, due-date priority, and multi-bucket scenarios.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopArAgingSummary } from './shop-ar-aging-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ar-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopArAgingSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ASOF = '2026-08-11T12:00:00.000Z'
const ASOF_MS = Date.parse(ASOF)
const DAY_MS = 86_400_000

function daysAgo(n) {
  return new Date(ASOF_MS - n * DAY_MS).toISOString()
}

function daysFromNow(n) {
  return new Date(ASOF_MS + n * DAY_MS).toISOString()
}

function makeOrder({ status = 'preparing', paymentStatus = 'pending', total = 10000, customer = 'Test', paymentDueAt, promisedAt, createdAt } = {}) {
  return { id: 'ORD-1', createdAt: createdAt ?? ASOF, customer, channel: 'Test', item: 'Item', quantity: 1, payment: 'Cash', paymentStatus, refundStatus: 'none', total, status, paymentDueAt, promisedAt }
}

function makeState(orders = []) {
  return { orders }
}

// 1. Empty state
{
  const r = projectShopArAgingSummary(makeState(), ASOF)
  check(r.asOf === ASOF, 'asOf is passed through')
  check(r.outstandingOrders === 0, 'empty state: outstandingOrders = 0')
  check(r.totalOutstandingMmk === 0, 'empty state: totalOutstandingMmk = 0')
  check(r.overdueOrders === 0, 'empty state: overdueOrders = 0')
  check(r.overdueMmk === 0, 'empty state: overdueMmk = 0')
  check(r.mostOverdueCustomer === undefined, 'empty state: mostOverdueCustomer undefined')
  check(r.byBucket.current.orders === 0, 'empty state: current bucket orders = 0')
}

// 2. Cancelled order excluded
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ status: 'cancelled' })]), ASOF)
  check(r.outstandingOrders === 0, 'cancelled order excluded from outstanding')
}

// 3. Reconciled (paid) order excluded
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ paymentStatus: 'reconciled' })]), ASOF)
  check(r.outstandingOrders === 0, 'reconciled order excluded from outstanding')
}

// 4. Current bucket: due in future
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ paymentDueAt: daysFromNow(5), total: 20000 })]), ASOF)
  check(r.outstandingOrders === 1, 'current order is outstanding')
  check(r.byBucket.current.orders === 1, 'future due date → current bucket')
  check(r.byBucket.current.totalMmk === 20000, 'current bucket totalMmk correct')
  check(r.overdueOrders === 0, 'future due date → not overdue')
  check(r.mostOverdueCustomer === undefined, 'no overdue → mostOverdueCustomer undefined')
}

// 5. Boundary: due exactly today (0 days past due) → current
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ paymentDueAt: ASOF })]), ASOF)
  check(r.byBucket.current.orders === 1, 'due today (0 days) → current bucket')
  check(r.overdueOrders === 0, 'due today → not overdue')
}

// 6. 1-7 days overdue → '1_7' bucket
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ paymentDueAt: daysAgo(4), total: 15000, customer: 'Alice' })]), ASOF)
  check(r.byBucket['1_7'].orders === 1, '4 days overdue → 1_7 bucket')
  check(r.byBucket['1_7'].totalMmk === 15000, '1_7 bucket totalMmk correct')
  check(r.overdueOrders === 1, '4 days overdue → overdueOrders = 1')
  check(r.overdueMmk === 15000, 'overdueMmk matches 1_7 order')
  check(r.mostOverdueCustomer === 'Alice', 'mostOverdueCustomer = Alice')
}

// 7. Boundary: exactly 7 days overdue → '1_7'
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ paymentDueAt: daysAgo(7) })]), ASOF)
  check(r.byBucket['1_7'].orders === 1, 'exactly 7 days overdue → 1_7 bucket')
}

// 8. Boundary: exactly 8 days overdue → '8_30'
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ paymentDueAt: daysAgo(8) })]), ASOF)
  check(r.byBucket['8_30'].orders === 1, 'exactly 8 days overdue → 8_30 bucket')
}

// 9. Boundary: exactly 30 days overdue → '8_30'
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ paymentDueAt: daysAgo(30) })]), ASOF)
  check(r.byBucket['8_30'].orders === 1, 'exactly 30 days overdue → 8_30 bucket')
}

// 10. Boundary: exactly 31 days overdue → '31_60'
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ paymentDueAt: daysAgo(31) })]), ASOF)
  check(r.byBucket['31_60'].orders === 1, 'exactly 31 days overdue → 31_60 bucket')
}

// 11. Boundary: exactly 60 days overdue → '31_60'
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ paymentDueAt: daysAgo(60) })]), ASOF)
  check(r.byBucket['31_60'].orders === 1, 'exactly 60 days overdue → 31_60 bucket')
}

// 12. Boundary: exactly 61 days overdue → 'over_60'
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ paymentDueAt: daysAgo(61) })]), ASOF)
  check(r.byBucket['over_60'].orders === 1, 'exactly 61 days overdue → over_60 bucket')
}

// 13. 90 days overdue → 'over_60'
{
  const r = projectShopArAgingSummary(makeState([makeOrder({ paymentDueAt: daysAgo(90), total: 50000, customer: 'Bob' })]), ASOF)
  check(r.byBucket['over_60'].orders === 1, '90 days overdue → over_60 bucket')
  check(r.byBucket['over_60'].totalMmk === 50000, 'over_60 bucket totalMmk correct')
}

// 14. Multi-bucket scenario
{
  const orders = [
    makeOrder({ paymentDueAt: daysFromNow(3), total: 10000, customer: 'Current', status: 'preparing' }),
    makeOrder({ paymentDueAt: daysAgo(5), total: 20000, customer: 'A', status: 'preparing' }),
    makeOrder({ paymentDueAt: daysAgo(20), total: 30000, customer: 'B', status: 'preparing' }),
    makeOrder({ paymentDueAt: daysAgo(45), total: 40000, customer: 'C', status: 'preparing' }),
    makeOrder({ paymentDueAt: daysAgo(90), total: 50000, customer: 'D', status: 'preparing' }),
  ].map((o, i) => ({ ...o, id: `ORD-${i}` }))
  const r = projectShopArAgingSummary(makeState(orders), ASOF)
  check(r.outstandingOrders === 5, 'multi-bucket: 5 outstanding orders')
  check(r.totalOutstandingMmk === 150000, 'multi-bucket: totalOutstandingMmk = 150000')
  check(r.overdueOrders === 4, 'multi-bucket: 4 overdue orders')
  check(r.overdueMmk === 140000, 'multi-bucket: overdueMmk = 140000')
  check(r.byBucket.current.orders === 1, 'multi-bucket: current bucket = 1')
  check(r.byBucket['1_7'].orders === 1, 'multi-bucket: 1_7 bucket = 1')
  check(r.byBucket['8_30'].orders === 1, 'multi-bucket: 8_30 bucket = 1')
  check(r.byBucket['31_60'].orders === 1, 'multi-bucket: 31_60 bucket = 1')
  check(r.byBucket['over_60'].orders === 1, 'multi-bucket: over_60 bucket = 1')
  check(r.mostOverdueCustomer === 'D', 'multi-bucket: mostOverdueCustomer = D (90 days)')
}

// 15. mostOverdueCustomer: tie on daysPastDue → highest totalMmk wins
{
  const orders = [
    { ...makeOrder({ paymentDueAt: daysAgo(10), total: 30000, customer: 'Cheaper' }), id: 'ORD-0' },
    { ...makeOrder({ paymentDueAt: daysAgo(10), total: 50000, customer: 'Pricier' }), id: 'ORD-1' },
  ]
  const r = projectShopArAgingSummary(makeState(orders), ASOF)
  check(r.mostOverdueCustomer === 'Pricier', 'tie on days: higher totalMmk wins for mostOverdueCustomer')
}

// 16. paymentDueAt takes priority over promisedAt
{
  const order = { ...makeOrder({ paymentDueAt: daysAgo(2), promisedAt: daysFromNow(10) }), id: 'ORD-0' }
  const r = projectShopArAgingSummary(makeState([order]), ASOF)
  check(r.byBucket['1_7'].orders === 1, 'paymentDueAt takes priority over promisedAt')
}

// 17. promisedAt used when paymentDueAt absent
{
  const order = { ...makeOrder({ promisedAt: daysAgo(15) }), id: 'ORD-0', paymentDueAt: undefined }
  const r = projectShopArAgingSummary(makeState([order]), ASOF)
  check(r.byBucket['8_30'].orders === 1, 'promisedAt used when paymentDueAt absent')
}

// 18. createdAt used when both paymentDueAt and promisedAt absent
{
  const order = { ...makeOrder({ createdAt: daysAgo(35) }), id: 'ORD-0', paymentDueAt: undefined, promisedAt: undefined }
  const r = projectShopArAgingSummary(makeState([order]), ASOF)
  check(r.byBucket['31_60'].orders === 1, 'createdAt used when paymentDueAt and promisedAt both absent')
}

// 19. totalOutstandingMmk = sum across all buckets
{
  const orders = [
    { ...makeOrder({ paymentDueAt: daysFromNow(1), total: 5000 }), id: 'ORD-0' },
    { ...makeOrder({ paymentDueAt: daysAgo(3), total: 7000 }), id: 'ORD-1' },
  ]
  const r = projectShopArAgingSummary(makeState(orders), ASOF)
  check(r.totalOutstandingMmk === 12000, 'totalOutstandingMmk = sum of all outstanding orders')
  check(r.byBucket.current.totalMmk + r.byBucket['1_7'].totalMmk === r.totalOutstandingMmk, 'totalOutstandingMmk = sum of bucket totals')
}

console.log(`AR aging summary: ${checks} checks passed`)
