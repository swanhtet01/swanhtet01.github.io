// Shop revenue summary: projection from CommerceState orders and closes.
// Tests channel breakdown, SKU ranking, date filtering, and close summary.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopRevenueSummary } from './shop-revenue-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/revenue-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopRevenueSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// --- Helpers ---

function makeCommerce(orders = [], closes = []) {
  return { schema: 'supermega.commerce.workspace.v2', items: [], orders, movements: [], closes }
}

function makeOrder(id, status, total, channel = 'counter', extra = {}) {
  return { id, createdAt: '2026-08-11T08:00:00.000Z', customer: 'Test', item: 'Widget', quantity: 1, payment: 'Cash', paymentStatus: 'unpaid', refundStatus: 'none', channel, status, total, ...extra }
}

function makeClose(id, total, orders, extra = {}) {
  return { id, createdAt: '2026-08-11T16:00:00.000Z', total, orders, businessDate: '2026-08-11', ...extra }
}

// 1. Empty state → all zeros and empty collections
{
  const result = projectShopRevenueSummary(makeCommerce())
  check(result.totalRevenue === 0, 'totalRevenue is 0 for empty state')
  check(result.orderCount === 0, 'orderCount is 0 for empty state')
  check(result.cancelledCount === 0, 'cancelledCount is 0 for empty state')
  check(result.averageOrderValue === 0, 'averageOrderValue is 0 for empty state')
  check(Object.keys(result.byChannel).length === 0, 'byChannel is empty for empty state')
  check(result.topSkus.length === 0, 'topSkus is empty for empty state')
  check(result.closeSummary.length === 0, 'closeSummary is empty for empty state')
}

// 2. Single completed order contributes to both totalRevenue and completedRevenue
{
  const result = projectShopRevenueSummary(makeCommerce([makeOrder('C-001', 'completed', 5000)]))
  check(result.totalRevenue === 5000, 'totalRevenue includes completed order')
  check(result.completedRevenue === 5000, 'completedRevenue includes completed order')
  check(result.orderCount === 1, 'orderCount is 1')
  check(result.completedCount === 1, 'completedCount is 1')
}

// 3. Confirmed/preparing/ready orders count in total but not completed
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'confirmed', 3000),
    makeOrder('C-002', 'preparing', 2000),
    makeOrder('C-003', 'ready', 1000),
  ]))
  check(result.totalRevenue === 6000, 'non-cancelled statuses count in totalRevenue')
  check(result.completedRevenue === 0, 'pending orders not in completedRevenue')
  check(result.completedCount === 0, 'completedCount is 0 for pending orders')
  check(result.orderCount === 3, 'orderCount is 3')
}

// 4. Cancelled orders excluded from totalRevenue
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'completed', 5000),
    makeOrder('C-002', 'cancelled', 3000),
  ]))
  check(result.totalRevenue === 5000, 'cancelled order excluded from totalRevenue')
  check(result.cancelledCount === 1, 'cancelledCount is 1')
  check(result.orderCount === 1, 'orderCount excludes cancelled')
}

// 5. averageOrderValue is rounded totalRevenue / orderCount
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'completed', 1000),
    makeOrder('C-002', 'completed', 2000),
    makeOrder('C-003', 'completed', 3000),
  ]))
  check(result.averageOrderValue === 2000, 'averageOrderValue is mean of order totals')
}

// 6. averageOrderValue rounds fractional result
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'completed', 1000),
    makeOrder('C-002', 'completed', 2000),
  ]))
  check(result.averageOrderValue === 1500, 'averageOrderValue 1500 for 1000+2000/2')
}

// 7. byChannel aggregates revenue and count per channel
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'completed', 3000, 'counter'),
    makeOrder('C-002', 'completed', 2000, 'counter'),
    makeOrder('C-003', 'completed', 5000, 'ecommerce'),
  ]))
  check(result.byChannel['counter']?.revenue === 5000, 'counter channel revenue sums correctly')
  check(result.byChannel['counter']?.count === 2, 'counter channel count is 2')
  check(result.byChannel['ecommerce']?.revenue === 5000, 'ecommerce channel revenue correct')
}

// 8. Cancelled orders excluded from byChannel
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'cancelled', 5000, 'counter'),
  ]))
  check(!result.byChannel['counter'], 'cancelled orders not counted in byChannel')
}

// 9. topSkus ranked by revenue, capped at 5
{
  const orders = [
    makeOrder('C-001', 'completed', 5000, 'counter', { itemSku: 'SKU-A' }),
    makeOrder('C-002', 'completed', 3000, 'counter', { itemSku: 'SKU-B' }),
    makeOrder('C-003', 'completed', 4000, 'counter', { itemSku: 'SKU-C' }),
    makeOrder('C-004', 'completed', 2000, 'counter', { itemSku: 'SKU-D' }),
    makeOrder('C-005', 'completed', 1000, 'counter', { itemSku: 'SKU-E' }),
    makeOrder('C-006', 'completed', 500, 'counter', { itemSku: 'SKU-F' }),
  ]
  const result = projectShopRevenueSummary(makeCommerce(orders))
  check(result.topSkus.length === 5, 'topSkus capped at 5')
  check(result.topSkus[0].sku === 'SKU-A', 'top SKU is highest revenue')
  check(result.topSkus[0].revenue === 5000, 'top SKU revenue is correct')
  check(result.topSkus[1].sku === 'SKU-C', 'second SKU is second highest')
}

// 10. topSkus accumulates across multiple orders for same SKU
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'completed', 2000, 'counter', { itemSku: 'SKU-A' }),
    makeOrder('C-002', 'completed', 3000, 'counter', { itemSku: 'SKU-A' }),
  ]))
  check(result.topSkus[0].revenue === 5000, 'same SKU revenue accumulates')
  check(result.topSkus[0].count === 2, 'same SKU count is 2')
}

// 11. Orders without itemSku not included in topSkus
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'completed', 5000, 'counter'),
    makeOrder('C-002', 'completed', 3000, 'counter', { itemSku: 'SKU-A' }),
  ]))
  check(result.topSkus.length === 1, 'orders without itemSku excluded from topSkus')
  check(result.topSkus[0].sku === 'SKU-A', 'only SKU-A in topSkus')
}

// 12. Date filter includes same-day orders
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'completed', 5000, 'counter'),
  ]), '2026-08-11')
  check(result.totalRevenue === 5000, 'same-day order included with date filter')
}

// 13. Date filter excludes other-day orders
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'completed', 5000, 'counter'),
  ]), '2026-08-10')
  check(result.totalRevenue === 0, 'different-day order excluded by date filter')
}

// 14. No date filter includes all orders regardless of date
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'completed', 1000, 'counter'),
    makeOrder('C-002', 'completed', 2000, 'counter', { createdAt: '2026-08-10T08:00:00.000Z' }),
  ]))
  check(result.totalRevenue === 3000, 'all dates included without filter')
  check(result.orderCount === 2, 'all orders counted without filter')
}

// 15. closeSummary populated from CommerceClose records
{
  const result = projectShopRevenueSummary(makeCommerce([], [makeClose('CL-001', 15000, 3)]))
  check(result.closeSummary.length === 1, 'one close → one closeSummary entry')
  check(result.closeSummary[0].total === 15000, 'close total carried through')
  check(result.closeSummary[0].orders === 3, 'close order count carried through')
  check(result.closeSummary[0].businessDate === '2026-08-11', 'close businessDate carried through')
}

// 16. closeSummary falls back to createdAt slice when businessDate absent
{
  const result = projectShopRevenueSummary(makeCommerce([], [makeClose('CL-001', 10000, 2, { businessDate: undefined })]))
  check(result.closeSummary[0].businessDate === '2026-08-11', 'businessDate falls back to createdAt prefix')
}

// 17. Date filter applied to closeSummary via businessDate
{
  const cl1 = makeClose('CL-001', 10000, 2)
  const cl2 = makeClose('CL-002', 8000, 1, { businessDate: '2026-08-10', createdAt: '2026-08-10T16:00:00.000Z' })
  const result = projectShopRevenueSummary(makeCommerce([], [cl1, cl2]), '2026-08-11')
  check(result.closeSummary.length === 1, 'date filter applied to closeSummary')
  check(result.closeSummary[0].total === 10000, 'only same-day close in summary')
}

// 18. completedRevenue and totalRevenue track separately
{
  const result = projectShopRevenueSummary(makeCommerce([
    makeOrder('C-001', 'completed', 3000),
    makeOrder('C-002', 'confirmed', 2000),
  ]))
  check(result.totalRevenue === 5000, 'totalRevenue includes all non-cancelled')
  check(result.completedRevenue === 3000, 'completedRevenue only includes completed')
}

console.log(`shop revenue summary: ${checks} checks passed`)
