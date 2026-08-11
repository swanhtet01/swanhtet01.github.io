// Shop order exception rate: cancellation rate, return rate, combined exception rate, and
// per-channel breakdown over CommerceState.orders. Tests rates, value loss, returns, and filters.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderExceptionSummary } from './shop-order-exception-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/order-exception-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderExceptionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function order({
  status = 'completed',
  channel = 'walk-in',
  total = 10000,
  date = '2026-08-11',
  returns = undefined,
} = {}) {
  seq += 1
  return {
    id: `ord-${seq}`,
    createdAt: `${date}T08:00:00Z`,
    customer: `cust-${seq}`,
    channel,
    item: 'Widget',
    quantity: 1,
    payment: 'cash',
    paymentStatus: 'reconciled',
    refundStatus: 'not_applicable',
    total,
    status,
    ...(returns !== undefined ? { returns } : {}),
  }
}

function state(orders = []) {
  return { schema: 'supermega.commerce.workspace.v2', items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zeros
{
  const r = projectShopOrderExceptionSummary(state())
  check(r.totalOrders === 0, 'empty: totalOrders is 0')
  check(r.cancelledCount === 0, 'empty: cancelledCount is 0')
  check(r.ordersWithReturns === 0, 'empty: ordersWithReturns is 0')
  check(r.cancellationRate === 0, 'empty: cancellationRate is 0 (no zero-division)')
  check(r.returnRate === 0, 'empty: returnRate is 0')
  check(r.combinedExceptionRate === 0, 'empty: combinedExceptionRate is 0')
  check(r.cancelledValueLost === 0, 'empty: cancelledValueLost is 0')
  check(r.byChannel.length === 0, 'empty: byChannel is empty')
}

// 2. Single cancelled order
{
  const r = projectShopOrderExceptionSummary(state([order({ status: 'cancelled', total: 25000 })]))
  check(r.totalOrders === 1, 'cancelled: totalOrders is 1')
  check(r.cancelledCount === 1, 'cancelled: cancelledCount is 1')
  check(r.cancellationRate === 100, 'cancelled: cancellationRate is 100')
  check(r.cancelledValueLost === 25000, 'cancelled: cancelledValueLost is 25000')
  check(r.combinedExceptionRate === 100, 'cancelled: combinedExceptionRate is 100')
}

// 3. Single completed order → all exception rates are 0
{
  const r = projectShopOrderExceptionSummary(state([order({ status: 'completed' })]))
  check(r.totalOrders === 1, 'completed: totalOrders is 1')
  check(r.cancelledCount === 0, 'completed: cancelledCount is 0')
  check(r.cancellationRate === 0, 'completed: cancellationRate is 0')
  check(r.cancelledValueLost === 0, 'completed: cancelledValueLost is 0')
}

// 4. Mixed: 1 cancelled out of 3 orders → cancellationRate rounds to 33
{
  const orders = [
    order({ status: 'cancelled', total: 10000 }),
    order({ status: 'completed', total: 20000 }),
    order({ status: 'completed', total: 15000 }),
  ]
  const r = projectShopOrderExceptionSummary(state(orders))
  check(r.totalOrders === 3, 'mixed: totalOrders is 3')
  check(r.cancelledCount === 1, 'mixed: cancelledCount is 1')
  // 1/3 * 100 = 33.33 → rounds to 33
  check(r.cancellationRate === 33, 'mixed: cancellationRate is 33')
}

// 5. cancelledValueLost sums only cancelled totals
{
  const orders = [
    order({ status: 'cancelled', total: 10000 }),
    order({ status: 'cancelled', total: 20000 }),
    order({ status: 'completed', total: 99000 }),
  ]
  const r = projectShopOrderExceptionSummary(state(orders))
  check(r.cancelledValueLost === 30000, 'valueLost: only cancelled totals summed')
  check(r.cancelledCount === 2, 'valueLost: cancelledCount is 2')
}

// 6. ordersWithReturns: order with returns array length > 0
{
  const ret = { actionId: 'a1', createdAt: '2026-08-11T09:00:00Z', actor: 'op1', reason: 'defective', evidenceReference: 'e1', sku: 'SKU-1', quantity: 1, disposition: 'restock' }
  const r = projectShopOrderExceptionSummary(state([
    order({ status: 'completed', returns: [ret] }),
    order({ status: 'completed' }),
  ]))
  check(r.ordersWithReturns === 1, 'returns: ordersWithReturns is 1')
  check(r.returnRate === 50, 'returns: returnRate is 50')
  check(r.cancelledCount === 0, 'returns: cancelledCount is 0')
}

// 7. Empty returns array → not counted as return
{
  const r = projectShopOrderExceptionSummary(state([order({ status: 'completed', returns: [] })]))
  check(r.ordersWithReturns === 0, 'empty-returns: empty array is not a return')
  check(r.returnRate === 0, 'empty-returns: returnRate is 0')
}

// 8. combinedExceptionRate = cancelled + orders-with-returns
{
  const ret = { actionId: 'a1', createdAt: '2026-08-11T09:00:00Z', actor: 'op1', reason: 'defective', evidenceReference: 'e1', sku: 'SKU-1', quantity: 1, disposition: 'restock' }
  const orders = [
    order({ status: 'cancelled' }),
    order({ status: 'completed', returns: [ret] }),
    order({ status: 'completed' }),
    order({ status: 'completed' }),
  ]
  const r = projectShopOrderExceptionSummary(state(orders))
  check(r.totalOrders === 4, 'combined: totalOrders is 4')
  check(r.cancelledCount === 1, 'combined: cancelledCount is 1')
  check(r.ordersWithReturns === 1, 'combined: ordersWithReturns is 1')
  // (1 + 1) / 4 * 100 = 50
  check(r.combinedExceptionRate === 50, 'combined: combinedExceptionRate is 50')
}

// 9. byChannel counts per channel
{
  const orders = [
    order({ channel: 'walk-in' }),
    order({ channel: 'walk-in', status: 'cancelled' }),
    order({ channel: 'delivery' }),
    order({ channel: 'delivery' }),
    order({ channel: 'online', status: 'cancelled' }),
  ]
  const r = projectShopOrderExceptionSummary(state(orders))
  const walkin = r.byChannel.find(c => c.channel === 'walk-in')
  const delivery = r.byChannel.find(c => c.channel === 'delivery')
  const online = r.byChannel.find(c => c.channel === 'online')
  check(walkin.totalOrders === 2, 'byChannel: walk-in totalOrders is 2')
  check(walkin.cancelledCount === 1, 'byChannel: walk-in cancelledCount is 1')
  check(walkin.cancellationRate === 50, 'byChannel: walk-in cancellationRate is 50')
  check(delivery.totalOrders === 2, 'byChannel: delivery totalOrders is 2')
  check(delivery.cancelledCount === 0, 'byChannel: delivery cancelledCount is 0')
  check(delivery.cancellationRate === 0, 'byChannel: delivery cancellationRate is 0')
  check(online.totalOrders === 1, 'byChannel: online totalOrders is 1')
  check(online.cancelledCount === 1, 'byChannel: online cancelledCount is 1')
  check(online.cancellationRate === 100, 'byChannel: online cancellationRate is 100')
}

// 10. byChannel sorted by totalOrders descending
{
  const orders = [
    order({ channel: 'A' }),
    order({ channel: 'B' }),
    order({ channel: 'B' }),
    order({ channel: 'B' }),
    order({ channel: 'C' }),
    order({ channel: 'C' }),
  ]
  const r = projectShopOrderExceptionSummary(state(orders))
  check(r.byChannel[0].channel === 'B', 'byChannel-sort: B (3) is first')
  check(r.byChannel[1].channel === 'C', 'byChannel-sort: C (2) is second')
  check(r.byChannel[2].channel === 'A', 'byChannel-sort: A (1) is last')
}

// 11. Date filter: only orders matching prefix counted
{
  const orders = [
    order({ date: '2026-08-10', status: 'cancelled' }),
    order({ date: '2026-08-11', status: 'completed' }),
    order({ date: '2026-08-11', status: 'cancelled' }),
  ]
  const r = projectShopOrderExceptionSummary(state(orders), '2026-08-11')
  check(r.totalOrders === 2, 'date-filter: only Aug 11 orders counted')
  check(r.cancelledCount === 1, 'date-filter: only Aug 11 cancelled counted')
  check(r.cancellationRate === 50, 'date-filter: cancellationRate from Aug 11 only')
}

// 12. Confirmed/preparing/ready orders are included as non-cancelled
{
  const orders = [
    order({ status: 'confirmed' }),
    order({ status: 'preparing' }),
    order({ status: 'ready' }),
    order({ status: 'cancelled' }),
  ]
  const r = projectShopOrderExceptionSummary(state(orders))
  check(r.totalOrders === 4, 'active-statuses: all four orders counted')
  check(r.cancelledCount === 1, 'active-statuses: only cancelled status cancels')
  check(r.cancellationRate === 25, 'active-statuses: cancellationRate is 25')
}

console.log(JSON.stringify({ ok: true, checks }))
