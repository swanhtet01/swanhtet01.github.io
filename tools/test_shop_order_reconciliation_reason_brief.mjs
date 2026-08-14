// Shop order reconciliation reason brief: paymentReconciliationReason + refundSettlementReason distributions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderReconciliationReasonBrief } from './shop-order-reconciliation-reason-brief.ts'`,
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

const { projectShopOrderReconciliationReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

let orderId = 0
function order({ paymentReconciledAt, paymentReconciliationReason, refundSettledAt, refundSettlementReason } = {}) {
  orderId++
  const obj = {
    id: `ORD-${orderId}`,
    createdAt: '2026-08-01T09:00:00Z',
    customer: 'CUST-1',
    quantity: 10,
    payment: 'cash',
    paymentStatus: 'completed',
    refundStatus: 'none',
  }
  if (paymentReconciledAt !== undefined) obj.paymentReconciledAt = paymentReconciledAt
  if (paymentReconciliationReason !== undefined) obj.paymentReconciliationReason = paymentReconciliationReason
  if (refundSettledAt !== undefined) obj.refundSettledAt = refundSettledAt
  if (refundSettlementReason !== undefined) obj.refundSettlementReason = refundSettlementReason
  return obj
}

function state(orders) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. No orders → all zeros
{
  const r = projectShopOrderReconciliationReasonBrief(state([]))
  check(r.totalReconciledOrders === 0, 'empty: totalReconciledOrders 0')
  check(r.uniqueReconciliationReasons === 0, 'empty: uniqueReconciliationReasons 0')
  check(r.topReconciliationReasonsByCount.length === 0, 'empty: topReconciliationReasonsByCount empty')
  check(r.totalSettledOrders === 0, 'empty: totalSettledOrders 0')
  check(r.uniqueSettlementReasons === 0, 'empty: uniqueSettlementReasons 0')
  check(r.topSettlementReasonsByCount.length === 0, 'empty: topSettlementReasonsByCount empty')
}

// 2. Reconciled order without reason → counted in total, not in reason map
{
  const r = projectShopOrderReconciliationReasonBrief(
    state([order({ paymentReconciledAt: '2026-08-05T09:00:00Z' })]),
  )
  check(r.totalReconciledOrders === 1, 'no-reason reconciled: totalReconciledOrders 1')
  check(r.uniqueReconciliationReasons === 0, 'no-reason reconciled: uniqueReconciliationReasons 0')
  check(r.topReconciliationReasonsByCount.length === 0, 'no-reason reconciled: top empty')
}

// 3. Single reconciled order with reason
{
  const r = projectShopOrderReconciliationReasonBrief(
    state([order({ paymentReconciledAt: '2026-08-05T09:00:00Z', paymentReconciliationReason: 'Matched counter.' })]),
  )
  check(r.totalReconciledOrders === 1, 'single-reason: totalReconciledOrders 1')
  check(r.uniqueReconciliationReasons === 1, 'single-reason: uniqueReconciliationReasons 1')
  check(r.topReconciliationReasonsByCount[0]?.reason === 'Matched counter.', 'single-reason: top reason')
  check(r.topReconciliationReasonsByCount[0]?.count === 1, 'single-reason: count 1')
}

// 4. Multiple orders with same reconciliation reason → count 2
{
  const r = projectShopOrderReconciliationReasonBrief(
    state([
      order({ paymentReconciledAt: '2026-08-01T09:00:00Z', paymentReconciliationReason: 'Matched counter.' }),
      order({ paymentReconciledAt: '2026-08-02T09:00:00Z', paymentReconciliationReason: 'Matched counter.' }),
      order({ paymentReconciledAt: '2026-08-03T09:00:00Z', paymentReconciliationReason: 'Manual review.' }),
    ]),
  )
  check(r.totalReconciledOrders === 3, 'multi: totalReconciledOrders 3')
  check(r.uniqueReconciliationReasons === 2, 'multi: uniqueReconciliationReasons 2')
  check(r.topReconciliationReasonsByCount[0]?.reason === 'Matched counter.', 'multi: top reason Matched counter.')
  check(r.topReconciliationReasonsByCount[0]?.count === 2, 'multi: top count 2')
}

// 5. Settled order without reason → counted in total
{
  const r = projectShopOrderReconciliationReasonBrief(
    state([order({ refundSettledAt: '2026-08-05T09:00:00Z' })]),
  )
  check(r.totalSettledOrders === 1, 'no-settle-reason: totalSettledOrders 1')
  check(r.uniqueSettlementReasons === 0, 'no-settle-reason: uniqueSettlementReasons 0')
}

// 6. Single settled order with reason
{
  const r = projectShopOrderReconciliationReasonBrief(
    state([order({ refundSettledAt: '2026-08-05T09:00:00Z', refundSettlementReason: 'Customer requested.' })]),
  )
  check(r.totalSettledOrders === 1, 'single-settle: totalSettledOrders 1')
  check(r.uniqueSettlementReasons === 1, 'single-settle: uniqueSettlementReasons 1')
  check(r.topSettlementReasonsByCount[0]?.reason === 'Customer requested.', 'single-settle: top reason')
  check(r.topSettlementReasonsByCount[0]?.count === 1, 'single-settle: count 1')
}

// 7. Unreconciled/unsettled orders not counted
{
  const r = projectShopOrderReconciliationReasonBrief(state([order(), order()]))
  check(r.totalReconciledOrders === 0, 'unreconciled: not counted')
  check(r.totalSettledOrders === 0, 'unsettled: not counted')
}

// 8. Top-5 cap + tiebreak for reconciliation reasons
{
  const reasons = ['Z-reason', 'A-reason', 'C-reason', 'B-reason', 'D-reason', 'E-reason']
  const r = projectShopOrderReconciliationReasonBrief(
    state(
      reasons.map(rn =>
        order({ paymentReconciledAt: '2026-08-01T09:00:00Z', paymentReconciliationReason: rn }),
      ),
    ),
  )
  check(r.topReconciliationReasonsByCount.length === 5, 'top5-recon: capped at 5')
  check(r.topReconciliationReasonsByCount[0]?.reason === 'A-reason', 'top5-recon: tiebreak A-reason first')
}

// 9. Top-5 cap + tiebreak for settlement reasons
{
  const reasons = ['Z-reason', 'A-reason', 'C-reason', 'B-reason', 'D-reason', 'E-reason']
  const r = projectShopOrderReconciliationReasonBrief(
    state(
      reasons.map(rn =>
        order({ refundSettledAt: '2026-08-01T09:00:00Z', refundSettlementReason: rn }),
      ),
    ),
  )
  check(r.topSettlementReasonsByCount.length === 5, 'top5-settle: capped at 5')
  check(r.topSettlementReasonsByCount[0]?.reason === 'A-reason', 'top5-settle: tiebreak A-reason first')
}

// 10. Order reconciled AND settled → counted in both
{
  const r = projectShopOrderReconciliationReasonBrief(
    state([
      order({
        paymentReconciledAt: '2026-08-01T09:00:00Z',
        paymentReconciliationReason: 'Matched.',
        refundSettledAt: '2026-08-02T09:00:00Z',
        refundSettlementReason: 'Approved.',
      }),
    ]),
  )
  check(r.totalReconciledOrders === 1, 'both: totalReconciledOrders 1')
  check(r.totalSettledOrders === 1, 'both: totalSettledOrders 1')
  check(r.uniqueReconciliationReasons === 1, 'both: uniqueReconciliationReasons 1')
  check(r.uniqueSettlementReasons === 1, 'both: uniqueSettlementReasons 1')
}

console.log(JSON.stringify({ ok: true, checks }))
