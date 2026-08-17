// Customer journey summary: CRM-style projection from CommerceState orders.
// Tests repeat vs new customers, top customers by revenue, date filtering.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectCustomerJourneySummary } from './customer-journey-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/crm-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectCustomerJourneySummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function makeCommerce(orders = []) {
  return { schema: 'supermega.commerce.workspace.v2', items: [], orders, movements: [], closes: [] }
}

function makeOrder(id, customer, status, total, extra = {}) {
  return { id, createdAt: '2026-08-11T09:00:00.000Z', customer, item: 'Widget', quantity: 1, payment: 'Cash', paymentStatus: 'unpaid', refundStatus: 'none', channel: 'counter', status, total, ...extra }
}

// 1. Empty state → all zeros
{
  const r = projectCustomerJourneySummary(makeCommerce())
  check(r.uniqueCustomers === 0, 'uniqueCustomers = 0 for empty state')
  check(r.repeatCustomers === 0, 'repeatCustomers = 0 for empty state')
  check(r.newCustomers === 0, 'newCustomers = 0 for empty state')
  check(r.topCustomers.length === 0, 'topCustomers is empty for empty state')
  check(r.averageOrdersPerCustomer === 0, 'averageOrdersPerCustomer = 0 for empty state')
}

// 2. Single customer, single order
{
  const r = projectCustomerJourneySummary(makeCommerce([makeOrder('O-001', 'Alice', 'completed', 5000)]))
  check(r.uniqueCustomers === 1, 'uniqueCustomers = 1')
  check(r.newCustomers === 1, 'newCustomers = 1 for single-order customer')
  check(r.repeatCustomers === 0, 'repeatCustomers = 0 for single-order customer')
  check(r.topCustomers[0]?.customer === 'Alice', 'top customer is Alice')
  check(r.topCustomers[0]?.totalRevenue === 5000, 'top customer revenue = 5000')
}

// 3. Repeat customer detection
{
  const r = projectCustomerJourneySummary(makeCommerce([
    makeOrder('O-001', 'Bob', 'completed', 3000),
    makeOrder('O-002', 'Bob', 'completed', 2000),
  ]))
  check(r.uniqueCustomers === 1, 'uniqueCustomers = 1 for same customer')
  check(r.repeatCustomers === 1, 'Bob is a repeat customer')
  check(r.newCustomers === 0, 'no new customers')
  check(r.topCustomers[0]?.orderCount === 2, 'Bob has 2 orders')
  check(r.topCustomers[0]?.totalRevenue === 5000, 'Bob total revenue = 5000')
}

// 4. Cancelled orders excluded from orderCount and revenue but tracked separately
{
  const r = projectCustomerJourneySummary(makeCommerce([
    makeOrder('O-001', 'Carol', 'completed', 5000),
    makeOrder('O-002', 'Carol', 'cancelled', 3000),
  ]))
  check(r.uniqueCustomers === 1, 'one unique customer')
  check(r.topCustomers[0]?.orderCount === 1, 'cancelled order not in orderCount')
  check(r.topCustomers[0]?.totalRevenue === 5000, 'cancelled order not in totalRevenue')
  check(r.topCustomers[0]?.cancelledOrders === 1, 'cancelled order tracked in cancelledOrders')
  check(r.newCustomers === 1, 'Carol is new (only 1 non-cancelled order)')
}

// 5. All-cancelled customer excluded from uniqueCustomers
{
  const r = projectCustomerJourneySummary(makeCommerce([
    makeOrder('O-001', 'Dave', 'cancelled', 3000),
  ]))
  check(r.uniqueCustomers === 0, 'all-cancelled customer not counted in uniqueCustomers')
  check(r.topCustomers.length === 0, 'no top customers when all are cancelled')
}

// 6. Multiple customers — revenue ranking for topCustomers
{
  const r = projectCustomerJourneySummary(makeCommerce([
    makeOrder('O-001', 'Alice', 'completed', 5000),
    makeOrder('O-002', 'Bob', 'completed', 8000),
    makeOrder('O-003', 'Carol', 'completed', 2000),
  ]))
  check(r.topCustomers[0]?.customer === 'Bob', 'Bob is top customer by revenue')
  check(r.topCustomers[1]?.customer === 'Alice', 'Alice is second by revenue')
  check(r.topCustomers[2]?.customer === 'Carol', 'Carol is third by revenue')
}

// 7. topCustomers capped at 5
{
  const orders = ['A', 'B', 'C', 'D', 'E', 'F'].map((c, i) =>
    makeOrder(`O-${i}`, `Customer ${c}`, 'completed', (6 - i) * 1000)
  )
  const r = projectCustomerJourneySummary(makeCommerce(orders))
  check(r.uniqueCustomers === 6, 'uniqueCustomers = 6')
  check(r.topCustomers.length === 5, 'topCustomers capped at 5')
  check(r.topCustomers[0]?.customer === 'Customer A', 'Customer A is top')
}

// 8. averageOrdersPerCustomer calculation
{
  const r = projectCustomerJourneySummary(makeCommerce([
    makeOrder('O-001', 'Alice', 'completed', 1000),
    makeOrder('O-002', 'Bob', 'completed', 2000),
    makeOrder('O-003', 'Bob', 'completed', 3000),
  ]))
  check(r.averageOrdersPerCustomer === 1.5, 'averageOrdersPerCustomer = 1.5 for 3 orders / 2 customers')
}

// 9. completedOrders tracked per customer
{
  const r = projectCustomerJourneySummary(makeCommerce([
    makeOrder('O-001', 'Alice', 'completed', 5000),
    makeOrder('O-002', 'Alice', 'confirmed', 3000),
  ]))
  check(r.topCustomers[0]?.completedOrders === 1, 'completedOrders = 1 for Alice')
  check(r.topCustomers[0]?.orderCount === 2, 'orderCount includes non-completed non-cancelled')
}

// 10. lastOrderDate set to most recent order
{
  const r = projectCustomerJourneySummary(makeCommerce([
    makeOrder('O-001', 'Alice', 'completed', 1000, { createdAt: '2026-08-10T09:00:00.000Z' }),
    makeOrder('O-002', 'Alice', 'completed', 2000, { createdAt: '2026-08-11T09:00:00.000Z' }),
  ]))
  check(r.topCustomers[0]?.lastOrderDate === '2026-08-11T09:00:00.000Z', 'lastOrderDate is most recent')
}

// 11. Date filter includes same-day orders
{
  const r = projectCustomerJourneySummary(makeCommerce([
    makeOrder('O-001', 'Alice', 'completed', 5000),
  ]), '2026-08-11')
  check(r.uniqueCustomers === 1, 'same-day order included by date filter')
}

// 12. Date filter excludes different-day orders
{
  const r = projectCustomerJourneySummary(makeCommerce([
    makeOrder('O-001', 'Alice', 'completed', 5000),
  ]), '2026-08-10')
  check(r.uniqueCustomers === 0, 'different-day order excluded by date filter')
}

// 13. No date filter includes all orders
{
  const r = projectCustomerJourneySummary(makeCommerce([
    makeOrder('O-001', 'Alice', 'completed', 1000),
    makeOrder('O-002', 'Alice', 'completed', 2000, { createdAt: '2026-08-10T09:00:00.000Z' }),
  ]))
  check(r.uniqueCustomers === 1, 'all orders included without date filter')
  check(r.topCustomers[0]?.orderCount === 2, 'both orders counted without date filter')
}

// 14. repeat vs new classification boundary
{
  const r = projectCustomerJourneySummary(makeCommerce([
    makeOrder('O-001', 'Alice', 'completed', 1000),
    makeOrder('O-002', 'Bob', 'completed', 2000),
    makeOrder('O-003', 'Bob', 'completed', 3000),
  ]))
  check(r.uniqueCustomers === 2, 'uniqueCustomers = 2')
  check(r.newCustomers === 1, 'Alice is new (1 order)')
  check(r.repeatCustomers === 1, 'Bob is repeat (2 orders)')
}

console.log(`customer journey summary: ${checks} checks passed`)
