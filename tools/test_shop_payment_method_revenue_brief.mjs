// Shop payment method revenue brief: per-method revenue/volume split, top methods.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPaymentMethodRevenueBrief } from './shop-payment-method-revenue-brief.ts'`,
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

const { projectShopPaymentMethodRevenueBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v1'

function order({ id = 'ORD-1', payment = 'cash', status = 'delivered', total = 10000 } = {}) {
  return {
    id, payment, status, total,
    paymentStatus: 'reconciled',
    refundStatus: 'none',
    customerId: 'C-1',
    lineItems: [],
    createdAt: '2026-01-01T08:00:00Z',
  }
}

function state(orders = []) {
  return {
    schema: SCHEMA, revision: 1,
    orders, items: [], movements: [], closes: [],
  }
}

// 1. Empty state
{
  const r = projectShopPaymentMethodRevenueBrief(state([]))
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.uniquePaymentMethods === 0, 'empty: uniquePaymentMethods 0')
  check(r.byPaymentMethod.length === 0, 'empty: byPaymentMethod empty')
  check(r.topMethodByRevenue === null, 'empty: topMethodByRevenue null')
  check(r.topMethodByVolume === null, 'empty: topMethodByVolume null')
}

// 2. Single order cash
{
  const r = projectShopPaymentMethodRevenueBrief(state([order({ payment: 'cash', total: 5000 })]))
  check(r.totalOrders === 1, 'single: totalOrders 1')
  check(r.uniquePaymentMethods === 1, 'single: uniquePaymentMethods 1')
  check(r.byPaymentMethod[0].paymentMethod === 'cash', 'single: method is cash')
  check(r.byPaymentMethod[0].orderCount === 1, 'single: orderCount 1')
  check(r.byPaymentMethod[0].totalRevenueMmk === 5000, 'single: totalRevenueMmk 5000')
  check(r.byPaymentMethod[0].cancelledCount === 0, 'single: cancelledCount 0')
  check(r.topMethodByRevenue === 'cash', 'single: topMethodByRevenue cash')
  check(r.topMethodByVolume === 'cash', 'single: topMethodByVolume cash')
}

// 3. Cancelled order excluded from revenue
{
  const r = projectShopPaymentMethodRevenueBrief(state([
    order({ id: 'ORD-1', payment: 'kbzpay', status: 'cancelled', total: 20000 }),
    order({ id: 'ORD-2', payment: 'kbzpay', status: 'delivered', total: 10000 }),
  ]))
  const kbz = r.byPaymentMethod[0]
  check(kbz.totalRevenueMmk === 10000, 'cancelled: revenue excludes cancelled order')
  check(kbz.orderCount === 2, 'cancelled: orderCount includes cancelled')
  check(kbz.cancelledCount === 1, 'cancelled: cancelledCount 1')
}

// 4. Multiple methods sorted by revenue desc
{
  const r = projectShopPaymentMethodRevenueBrief(state([
    order({ id: 'ORD-1', payment: 'cash', total: 5000 }),
    order({ id: 'ORD-2', payment: 'kbzpay', total: 30000 }),
    order({ id: 'ORD-3', payment: 'wave', total: 15000 }),
  ]))
  check(r.byPaymentMethod[0].paymentMethod === 'kbzpay', 'sort: first by revenue is kbzpay')
  check(r.byPaymentMethod[1].paymentMethod === 'wave', 'sort: second by revenue is wave')
  check(r.byPaymentMethod[2].paymentMethod === 'cash', 'sort: third by revenue is cash')
  check(r.topMethodByRevenue === 'kbzpay', 'sort: topMethodByRevenue kbzpay')
}

// 5. Top by volume differs from top by revenue
{
  const r = projectShopPaymentMethodRevenueBrief(state([
    order({ id: 'ORD-1', payment: 'cash', total: 1000 }),
    order({ id: 'ORD-2', payment: 'cash', total: 1000 }),
    order({ id: 'ORD-3', payment: 'cash', total: 1000 }),
    order({ id: 'ORD-4', payment: 'kbzpay', total: 50000 }),
  ]))
  check(r.topMethodByRevenue === 'kbzpay', 'volume-vs-revenue: topMethodByRevenue kbzpay')
  check(r.topMethodByVolume === 'cash', 'volume-vs-revenue: topMethodByVolume cash')
}

// 6. Unique payment method count
{
  const r = projectShopPaymentMethodRevenueBrief(state([
    order({ id: 'ORD-1', payment: 'cash' }),
    order({ id: 'ORD-2', payment: 'kbzpay' }),
    order({ id: 'ORD-3', payment: 'wave' }),
    order({ id: 'ORD-4', payment: 'cash' }),
  ]))
  check(r.uniquePaymentMethods === 3, 'unique: uniquePaymentMethods 3')
  check(r.totalOrders === 4, 'unique: totalOrders 4')
}

// 7. All orders cancelled → all revenue is 0 but methods still tracked
{
  const r = projectShopPaymentMethodRevenueBrief(state([
    order({ id: 'ORD-1', payment: 'cash', status: 'cancelled', total: 10000 }),
    order({ id: 'ORD-2', payment: 'cash', status: 'cancelled', total: 10000 }),
  ]))
  check(r.byPaymentMethod[0].totalRevenueMmk === 0, 'all-cancelled: totalRevenueMmk 0')
  check(r.byPaymentMethod[0].cancelledCount === 2, 'all-cancelled: cancelledCount 2')
  check(r.topMethodByRevenue === 'cash', 'all-cancelled: topMethodByRevenue still cash')
}

console.log(JSON.stringify({ ok: true, checks }))
