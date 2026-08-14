// Shop order refund exposure brief: refund obligations from cancelled-but-paid orders.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderRefundExposureBrief } from './shop-order-refund-exposure-brief.ts'`,
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

const { projectShopOrderRefundExposureBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v1'

function order({ id = 'ORD-1', status = 'delivered', paymentStatus = 'pending', refundStatus = 'none', total = 10000 } = {}) {
  return {
    id, status, paymentStatus, refundStatus, total,
    payment: 'cash', customerId: 'C-1', lineItems: [],
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
  const r = projectShopOrderRefundExposureBrief(state([]))
  check(r.totalCancelledOrders === 0, 'empty: totalCancelledOrders 0')
  check(r.cancelledWithPaymentReconciled === 0, 'empty: cancelledWithPaymentReconciled 0')
  check(r.refundsDue === 0, 'empty: refundsDue 0')
  check(r.refundsSettled === 0, 'empty: refundsSettled 0')
  check(r.totalRefundExposureMmk === 0, 'empty: totalRefundExposureMmk 0')
  check(r.totalRefundSettledMmk === 0, 'empty: totalRefundSettledMmk 0')
  check(r.refundSettlementRate === 0, 'empty: refundSettlementRate 0')
}

// 2. Non-cancelled orders are excluded
{
  const r = projectShopOrderRefundExposureBrief(state([
    order({ id: 'ORD-1', status: 'delivered', paymentStatus: 'reconciled' }),
    order({ id: 'ORD-2', status: 'confirmed', paymentStatus: 'pending' }),
  ]))
  check(r.totalCancelledOrders === 0, 'non-cancelled: excluded')
  check(r.refundsDue === 0, 'non-cancelled: refundsDue 0')
}

// 3. Cancelled with pending payment — no refund obligation
{
  const r = projectShopOrderRefundExposureBrief(state([
    order({ id: 'ORD-1', status: 'cancelled', paymentStatus: 'pending', refundStatus: 'none', total: 5000 }),
  ]))
  check(r.totalCancelledOrders === 1, 'pending-cancel: totalCancelledOrders 1')
  check(r.cancelledWithPaymentReconciled === 0, 'pending-cancel: cancelledWithPaymentReconciled 0')
  check(r.refundsDue === 0, 'pending-cancel: refundsDue 0')
  check(r.totalRefundExposureMmk === 0, 'pending-cancel: totalRefundExposureMmk 0')
}

// 4. Cancelled + reconciled + due = refund obligation
{
  const r = projectShopOrderRefundExposureBrief(state([
    order({ id: 'ORD-1', status: 'cancelled', paymentStatus: 'reconciled', refundStatus: 'due', total: 15000 }),
  ]))
  check(r.totalCancelledOrders === 1, 'due: totalCancelledOrders 1')
  check(r.cancelledWithPaymentReconciled === 1, 'due: cancelledWithPaymentReconciled 1')
  check(r.refundsDue === 1, 'due: refundsDue 1')
  check(r.totalRefundExposureMmk === 15000, 'due: totalRefundExposureMmk 15000')
  check(r.refundSettlementRate === 0, 'due: refundSettlementRate 0 (none settled)')
}

// 5. Cancelled + reconciled + settled = resolved refund
{
  const r = projectShopOrderRefundExposureBrief(state([
    order({ id: 'ORD-1', status: 'cancelled', paymentStatus: 'reconciled', refundStatus: 'settled', total: 20000 }),
  ]))
  check(r.refundsSettled === 1, 'settled: refundsSettled 1')
  check(r.totalRefundSettledMmk === 20000, 'settled: totalRefundSettledMmk 20000')
  check(r.refundSettlementRate === 100, 'settled: refundSettlementRate 100')
  check(r.totalRefundExposureMmk === 0, 'settled: totalRefundExposureMmk 0 (no due)')
}

// 6. Mixed: 1 due, 1 settled → 50% settlement rate
{
  const r = projectShopOrderRefundExposureBrief(state([
    order({ id: 'ORD-1', status: 'cancelled', paymentStatus: 'reconciled', refundStatus: 'due', total: 10000 }),
    order({ id: 'ORD-2', status: 'cancelled', paymentStatus: 'reconciled', refundStatus: 'settled', total: 8000 }),
  ]))
  check(r.refundsDue === 1, 'mixed: refundsDue 1')
  check(r.refundsSettled === 1, 'mixed: refundsSettled 1')
  check(r.totalRefundExposureMmk === 10000, 'mixed: exposure 10000')
  check(r.totalRefundSettledMmk === 8000, 'mixed: settled 8000')
  check(r.refundSettlementRate === 50, 'mixed: refundSettlementRate 50')
}

// 7. 1 due, 2 settled → 67% (rounds down)
{
  const r = projectShopOrderRefundExposureBrief(state([
    order({ id: 'ORD-1', status: 'cancelled', paymentStatus: 'reconciled', refundStatus: 'due', total: 5000 }),
    order({ id: 'ORD-2', status: 'cancelled', paymentStatus: 'reconciled', refundStatus: 'settled', total: 5000 }),
    order({ id: 'ORD-3', status: 'cancelled', paymentStatus: 'reconciled', refundStatus: 'settled', total: 5000 }),
  ]))
  check(r.refundSettlementRate === 67, 'round: refundSettlementRate 67 (2/3×100)')
}

// 8. Mix of all statuses
{
  const r = projectShopOrderRefundExposureBrief(state([
    order({ id: 'ORD-1', status: 'delivered', paymentStatus: 'reconciled' }),
    order({ id: 'ORD-2', status: 'cancelled', paymentStatus: 'pending', total: 3000 }),
    order({ id: 'ORD-3', status: 'cancelled', paymentStatus: 'reconciled', refundStatus: 'due', total: 7000 }),
    order({ id: 'ORD-4', status: 'cancelled', paymentStatus: 'reconciled', refundStatus: 'settled', total: 4000 }),
  ]))
  check(r.totalCancelledOrders === 3, 'all-mix: totalCancelledOrders 3')
  check(r.cancelledWithPaymentReconciled === 2, 'all-mix: cancelledWithPaymentReconciled 2')
  check(r.refundsDue === 1, 'all-mix: refundsDue 1')
  check(r.refundsSettled === 1, 'all-mix: refundsSettled 1')
  check(r.totalRefundExposureMmk === 7000, 'all-mix: exposure 7000')
}

console.log(JSON.stringify({ ok: true, checks }))
