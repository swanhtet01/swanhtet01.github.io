// Shop payment status summary: pending/reconciled payment counts, refund counts,
// pendingPaymentValueMmk, paymentReconciliationRate from non-cancelled orders.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPaymentStatusSummary } from './shop-payment-status-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/payment-status-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopPaymentStatusSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function order({ status = 'completed', paymentStatus = 'reconciled', refundStatus = 'none', total = 10000, date = '2026-08-11' } = {}) {
  seq += 1
  return {
    id: `ord-${seq}`,
    createdAt: `${date}T08:00:00Z`,
    customer: `cust-${seq}`,
    channel: 'walk-in',
    item: 'Widget',
    quantity: 1,
    payment: 'cash',
    paymentStatus,
    refundStatus,
    total,
    status,
  }
}

function state(orders = []) {
  return { schema: 'supermega.commerce.workspace.v2', items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zeros
{
  const r = projectShopPaymentStatusSummary(state())
  check(r.totalOrders === 0, 'empty: totalOrders is 0')
  check(r.pendingPaymentCount === 0, 'empty: pendingPaymentCount is 0')
  check(r.reconciledPaymentCount === 0, 'empty: reconciledPaymentCount is 0')
  check(r.pendingPaymentValueMmk === 0, 'empty: pendingPaymentValueMmk is 0')
  check(r.refundsDueCount === 0, 'empty: refundsDueCount is 0')
  check(r.refundsSettledCount === 0, 'empty: refundsSettledCount is 0')
  check(r.paymentReconciliationRate === 0, 'empty: paymentReconciliationRate is 0 (no zero-division)')
}

// 2. Cancelled orders excluded
{
  const r = projectShopPaymentStatusSummary(state([order({ status: 'cancelled', paymentStatus: 'pending', total: 50000 })]))
  check(r.totalOrders === 0, 'cancelled: excluded from totals')
  check(r.pendingPaymentCount === 0, 'cancelled: pending not counted')
  check(r.pendingPaymentValueMmk === 0, 'cancelled: value not counted')
}

// 3. All reconciled → reconciliationRate 100
{
  const r = projectShopPaymentStatusSummary(state([
    order({ paymentStatus: 'reconciled' }),
    order({ paymentStatus: 'reconciled' }),
  ]))
  check(r.totalOrders === 2, 'all-reconciled: totalOrders is 2')
  check(r.reconciledPaymentCount === 2, 'all-reconciled: reconciledPaymentCount is 2')
  check(r.pendingPaymentCount === 0, 'all-reconciled: pendingPaymentCount is 0')
  check(r.paymentReconciliationRate === 100, 'all-reconciled: reconciliationRate is 100')
}

// 4. All pending → reconciliationRate 0, value accumulated
{
  const r = projectShopPaymentStatusSummary(state([
    order({ paymentStatus: 'pending', total: 20000 }),
    order({ paymentStatus: 'pending', total: 30000 }),
  ]))
  check(r.pendingPaymentCount === 2, 'all-pending: pendingPaymentCount is 2')
  check(r.pendingPaymentValueMmk === 50000, 'all-pending: value is 50000')
  check(r.paymentReconciliationRate === 0, 'all-pending: reconciliationRate is 0')
}

// 5. Mixed: 2 reconciled out of 3 → rate = 67%
{
  const orders = [
    order({ paymentStatus: 'reconciled' }),
    order({ paymentStatus: 'reconciled' }),
    order({ paymentStatus: 'pending', total: 15000 }),
  ]
  const r = projectShopPaymentStatusSummary(state(orders))
  check(r.totalOrders === 3, 'mixed: totalOrders is 3')
  // round(2/3 * 100) = 67
  check(r.paymentReconciliationRate === 67, 'mixed: reconciliationRate is 67')
  check(r.pendingPaymentValueMmk === 15000, 'mixed: only pending order value counted')
}

// 6. Refunds due counted
{
  const r = projectShopPaymentStatusSummary(state([
    order({ refundStatus: 'due' }),
    order({ refundStatus: 'due' }),
    order({ refundStatus: 'settled' }),
    order({ refundStatus: 'none' }),
  ]))
  check(r.refundsDueCount === 2, 'refunds: refundsDueCount is 2')
  check(r.refundsSettledCount === 1, 'refunds: refundsSettledCount is 1')
  check(r.totalOrders === 4, 'refunds: totalOrders includes all non-cancelled')
}

// 7. Reconciled orders do not add to pendingPaymentValueMmk
{
  const r = projectShopPaymentStatusSummary(state([
    order({ paymentStatus: 'reconciled', total: 50000 }),
    order({ paymentStatus: 'pending', total: 10000 }),
  ]))
  check(r.pendingPaymentValueMmk === 10000, 'value: only pending orders summed')
}

// 8. Date filter
{
  const orders = [
    order({ paymentStatus: 'pending', date: '2026-08-10', total: 20000 }),
    order({ paymentStatus: 'pending', date: '2026-08-11', total: 5000 }),
  ]
  const r = projectShopPaymentStatusSummary(state(orders), '2026-08-11')
  check(r.totalOrders === 1, 'date-filter: only Aug 11 order counted')
  check(r.pendingPaymentValueMmk === 5000, 'date-filter: Aug 11 value is 5000')
}

// 9. Active non-cancelled statuses (confirmed, preparing, ready) all included
{
  const orders = [
    order({ status: 'confirmed', paymentStatus: 'pending' }),
    order({ status: 'preparing', paymentStatus: 'pending' }),
    order({ status: 'ready', paymentStatus: 'reconciled' }),
  ]
  const r = projectShopPaymentStatusSummary(state(orders))
  check(r.totalOrders === 3, 'active-statuses: all non-cancelled counted')
  check(r.pendingPaymentCount === 2, 'active-statuses: 2 pending')
  check(r.reconciledPaymentCount === 1, 'active-statuses: 1 reconciled')
}

console.log(JSON.stringify({ ok: true, checks }))
