// Shop order reconciliation summary: ordersReconciled, uniqueReconcilers, ordersWithRefundSettled, uniqueRefundSettlers.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderReconciliationSummary } from './shop-order-reconciliation-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-reconciliation-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderReconciliationSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function order({
  id = 'ORD-1',
  paymentReconciledAt = undefined,
  paymentReconciledBy = undefined,
  refundSettledAt = undefined,
  refundSettledBy = undefined,
} = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: paymentReconciledAt !== undefined ? 'reconciled' : 'pending',
    refundStatus: refundSettledAt !== undefined ? 'settled' : 'none',
    total: 10000, status: 'confirmed',
    ...(paymentReconciledAt !== undefined ? { paymentReconciledAt, paymentReconciliationActionId: 'ACT-1', paymentReconciliationReason: 'paid' } : {}),
    ...(paymentReconciledBy !== undefined ? { paymentReconciledBy } : {}),
    ...(refundSettledAt !== undefined ? { refundSettledAt, refundSettlementActionId: 'ACT-2', refundSettlementReason: 'refunded' } : {}),
    ...(refundSettledBy !== undefined ? { refundSettledBy } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zero
{
  const r = projectShopOrderReconciliationSummary(state([]))
  check(r.ordersReconciled === 0, 'empty: ordersReconciled 0')
  check(r.uniqueReconcilers === 0, 'empty: uniqueReconcilers 0')
  check(r.ordersWithRefundSettled === 0, 'empty: ordersWithRefundSettled 0')
  check(r.uniqueRefundSettlers === 0, 'empty: uniqueRefundSettlers 0')
}

// 2. Unreconciled orders
{
  const r = projectShopOrderReconciliationSummary(state([order({ id: 'ORD-1' }), order({ id: 'ORD-2' })]))
  check(r.ordersReconciled === 0, 'no-rec: ordersReconciled 0')
}

// 3. Single reconciled order with reconciler
{
  const r = projectShopOrderReconciliationSummary(state([
    order({ id: 'ORD-1', paymentReconciledAt: '2026-01-02T00:00:00Z', paymentReconciledBy: 'alice' }),
  ]))
  check(r.ordersReconciled === 1, 'one-rec: ordersReconciled 1')
  check(r.uniqueReconcilers === 1, 'one-rec: uniqueReconcilers 1')
  check(r.ordersWithRefundSettled === 0, 'one-rec: ordersWithRefundSettled 0 (no refund)')
  check(r.uniqueRefundSettlers === 0, 'one-rec: uniqueRefundSettlers 0')
}

// 4. Two reconciled orders, same reconciler
{
  const r = projectShopOrderReconciliationSummary(state([
    order({ id: 'ORD-1', paymentReconciledAt: '2026-01-02T00:00:00Z', paymentReconciledBy: 'alice' }),
    order({ id: 'ORD-2', paymentReconciledAt: '2026-01-03T00:00:00Z', paymentReconciledBy: 'alice' }),
  ]))
  check(r.ordersReconciled === 2, 'same-rec: ordersReconciled 2')
  check(r.uniqueReconcilers === 1, 'same-rec: uniqueReconcilers 1 (dedup)')
}

// 5. Two reconciled orders, different reconcilers
{
  const r = projectShopOrderReconciliationSummary(state([
    order({ id: 'ORD-1', paymentReconciledAt: '2026-01-02T00:00:00Z', paymentReconciledBy: 'alice' }),
    order({ id: 'ORD-2', paymentReconciledAt: '2026-01-03T00:00:00Z', paymentReconciledBy: 'bob' }),
  ]))
  check(r.ordersReconciled === 2, 'diff-rec: ordersReconciled 2')
  check(r.uniqueReconcilers === 2, 'diff-rec: uniqueReconcilers 2')
}

// 6. Single refund settled
{
  const r = projectShopOrderReconciliationSummary(state([
    order({ id: 'ORD-1', refundSettledAt: '2026-01-02T00:00:00Z', refundSettledBy: 'carol' }),
  ]))
  check(r.ordersWithRefundSettled === 1, 'refund: ordersWithRefundSettled 1')
  check(r.uniqueRefundSettlers === 1, 'refund: uniqueRefundSettlers 1')
  check(r.ordersReconciled === 0, 'refund: ordersReconciled 0 (not reconciled)')
}

// 7. Two refund settled, same settler
{
  const r = projectShopOrderReconciliationSummary(state([
    order({ id: 'ORD-1', refundSettledAt: '2026-01-02T00:00:00Z', refundSettledBy: 'carol' }),
    order({ id: 'ORD-2', refundSettledAt: '2026-01-03T00:00:00Z', refundSettledBy: 'carol' }),
  ]))
  check(r.uniqueRefundSettlers === 1, 'same-settler: uniqueRefundSettlers 1 (dedup)')
}

// 8. Both reconciled and refund settled on one order
{
  const r = projectShopOrderReconciliationSummary(state([
    order({
      id: 'ORD-1',
      paymentReconciledAt: '2026-01-02T00:00:00Z', paymentReconciledBy: 'alice',
      refundSettledAt: '2026-01-03T00:00:00Z', refundSettledBy: 'bob',
    }),
  ]))
  check(r.ordersReconciled === 1, 'both: ordersReconciled 1')
  check(r.uniqueReconcilers === 1, 'both: uniqueReconcilers 1')
  check(r.ordersWithRefundSettled === 1, 'both: ordersWithRefundSettled 1')
  check(r.uniqueRefundSettlers === 1, 'both: uniqueRefundSettlers 1')
}

// 9. Mixed (one reconciled, one not)
{
  const r = projectShopOrderReconciliationSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', paymentReconciledAt: '2026-01-02T00:00:00Z', paymentReconciledBy: 'alice' }),
  ]))
  check(r.ordersReconciled === 1, 'mixed: ordersReconciled 1')
}

console.log(JSON.stringify({ ok: true, checks }))
