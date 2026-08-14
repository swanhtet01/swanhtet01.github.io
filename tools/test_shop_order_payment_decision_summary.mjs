// Shop order payment decision summary: ordersWithDecision, byStatus, byAdapter.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderPaymentDecisionSummary } from './shop-order-payment-decision-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-payment-decision-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderPaymentDecisionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function paymentDecision({ status = 'approved', adapter = 'pay_on_pickup' } = {}) {
  return {
    schema: 'supermega.commerce.payment-decision.v1',
    status, reason: status, adapter,
    policyRevision: null, policyActionId: null,
    maximumOrderMmk: null, instructions: null,
    reviewedAt: '2026-01-01T00:00:00Z', authorized: false,
  }
}

function order({ paymentDecision: pd = undefined, id = 'ORD-1' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 1000, status: 'confirmed',
    ...(pd !== undefined ? { paymentDecision: pd } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zero
{
  const r = projectShopOrderPaymentDecisionSummary(state([]))
  check(r.ordersWithDecision === 0, 'empty: ordersWithDecision 0')
  check(r.byStatus.approved === 0, 'empty: byStatus.approved 0')
  check(r.byStatus.rejected === 0, 'empty: byStatus.rejected 0')
  check(r.byAdapter.pay_on_pickup === 0, 'empty: byAdapter.pay_on_pickup 0')
  check(r.byAdapter.cash_on_delivery === 0, 'empty: byAdapter.cash_on_delivery 0')
  check(r.byAdapter.kbzpay_manual === 0, 'empty: byAdapter.kbzpay_manual 0')
}

// 2. Orders without paymentDecision
{
  const r = projectShopOrderPaymentDecisionSummary(state([order({ id: 'ORD-1' }), order({ id: 'ORD-2' })]))
  check(r.ordersWithDecision === 0, 'no-decision: ordersWithDecision 0')
}

// 3. Single approved + pay_on_pickup
{
  const r = projectShopOrderPaymentDecisionSummary(state([
    order({ id: 'ORD-1', paymentDecision: paymentDecision({ status: 'approved', adapter: 'pay_on_pickup' }) }),
  ]))
  check(r.ordersWithDecision === 1, 'approved-pop: ordersWithDecision 1')
  check(r.byStatus.approved === 1, 'approved-pop: byStatus.approved 1')
  check(r.byAdapter.pay_on_pickup === 1, 'approved-pop: byAdapter.pay_on_pickup 1')
}

// 4. Approved + cash_on_delivery
{
  const r = projectShopOrderPaymentDecisionSummary(state([
    order({ id: 'ORD-1', paymentDecision: paymentDecision({ status: 'approved', adapter: 'cash_on_delivery' }) }),
  ]))
  check(r.byAdapter.cash_on_delivery === 1, 'cod: byAdapter.cash_on_delivery 1')
}

// 5. Approved + kbzpay_manual
{
  const r = projectShopOrderPaymentDecisionSummary(state([
    order({ id: 'ORD-1', paymentDecision: paymentDecision({ status: 'approved', adapter: 'kbzpay_manual' }) }),
  ]))
  check(r.byAdapter.kbzpay_manual === 1, 'kbz: byAdapter.kbzpay_manual 1')
}

// 6. Single rejected
{
  const r = projectShopOrderPaymentDecisionSummary(state([
    order({ id: 'ORD-1', paymentDecision: paymentDecision({ status: 'rejected', adapter: 'pay_on_pickup' }) }),
  ]))
  check(r.byStatus.rejected === 1, 'rejected: byStatus.rejected 1')
  check(r.byStatus.approved === 0, 'rejected: byStatus.approved 0')
}

// 7. Two orders, different adapters → accumulate
{
  const r = projectShopOrderPaymentDecisionSummary(state([
    order({ id: 'ORD-1', paymentDecision: paymentDecision({ status: 'approved', adapter: 'pay_on_pickup' }) }),
    order({ id: 'ORD-2', paymentDecision: paymentDecision({ status: 'approved', adapter: 'cash_on_delivery' }) }),
  ]))
  check(r.ordersWithDecision === 2, '2orders: ordersWithDecision 2')
  check(r.byStatus.approved === 2, '2orders: byStatus.approved 2')
  check(r.byAdapter.pay_on_pickup === 1, '2orders: byAdapter.pay_on_pickup 1')
  check(r.byAdapter.cash_on_delivery === 1, '2orders: byAdapter.cash_on_delivery 1')
}

// 8. Mixed (approved + no-decision)
{
  const r = projectShopOrderPaymentDecisionSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', paymentDecision: paymentDecision({ status: 'approved', adapter: 'pay_on_pickup' }) }),
  ]))
  check(r.ordersWithDecision === 1, 'mixed: ordersWithDecision 1')
}

// 9. Two rejected orders
{
  const r = projectShopOrderPaymentDecisionSummary(state([
    order({ id: 'ORD-1', paymentDecision: paymentDecision({ status: 'rejected', adapter: 'pay_on_pickup' }) }),
    order({ id: 'ORD-2', paymentDecision: paymentDecision({ status: 'rejected', adapter: 'cash_on_delivery' }) }),
  ]))
  check(r.byStatus.rejected === 2, '2rejected: byStatus.rejected 2')
}

console.log(JSON.stringify({ ok: true, checks }))
