// Shop order promotion decision summary: ordersWithDecision, byStatus, totalDiscountMmk, ordersWithCode.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderPromotionDecisionSummary } from './shop-order-promotion-decision-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-promotion-decision-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderPromotionDecisionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function promotionDecision({ status = 'not_requested', code = null, discountMmk = 0, discountBasisPoints = 0 } = {}) {
  return {
    schema: 'supermega.commerce.promotion-decision.v1',
    status, code, reason: status,
    policyRevision: null, policyActionId: null,
    discountBasisPoints, grossSubtotalMmk: 10000,
    discountMmk, netSubtotalMmk: 10000 - discountMmk,
    reviewedAt: '2026-01-01T00:00:00Z',
  }
}

function order({ promotionDecision: pd = undefined, id = 'ORD-1' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 1000, status: 'confirmed',
    ...(pd !== undefined ? { promotionDecision: pd } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zero
{
  const r = projectShopOrderPromotionDecisionSummary(state([]))
  check(r.ordersWithDecision === 0, 'empty: ordersWithDecision 0')
  check(r.byStatus.not_requested === 0, 'empty: byStatus.not_requested 0')
  check(r.byStatus.approved === 0, 'empty: byStatus.approved 0')
  check(r.byStatus.rejected === 0, 'empty: byStatus.rejected 0')
  check(r.totalDiscountMmk === 0, 'empty: totalDiscountMmk 0')
}

// 2. Orders without promotionDecision
{
  const r = projectShopOrderPromotionDecisionSummary(state([order({ id: 'ORD-1' }), order({ id: 'ORD-2' })]))
  check(r.ordersWithDecision === 0, 'no-decision: ordersWithDecision 0')
  check(r.ordersWithCode === 0, 'no-decision: ordersWithCode 0')
}

// 3. not_requested, no code, discount 0
{
  const r = projectShopOrderPromotionDecisionSummary(state([
    order({ id: 'ORD-1', promotionDecision: promotionDecision({ status: 'not_requested', code: null, discountMmk: 0 }) }),
  ]))
  check(r.ordersWithDecision === 1, 'not-req: ordersWithDecision 1')
  check(r.byStatus.not_requested === 1, 'not-req: byStatus.not_requested 1')
  check(r.ordersWithCode === 0, 'not-req: ordersWithCode 0 (null code)')
}

// 4. Approved with code and discount
{
  const r = projectShopOrderPromotionDecisionSummary(state([
    order({ id: 'ORD-1', promotionDecision: promotionDecision({ status: 'approved', code: 'PROMO10', discountMmk: 1000, discountBasisPoints: 1000 }) }),
  ]))
  check(r.byStatus.approved === 1, 'approved: byStatus.approved 1')
  check(r.ordersWithCode === 1, 'approved: ordersWithCode 1')
  check(r.totalDiscountMmk === 1000, 'approved: totalDiscountMmk 1000')
}

// 5. Rejected
{
  const r = projectShopOrderPromotionDecisionSummary(state([
    order({ id: 'ORD-1', promotionDecision: promotionDecision({ status: 'rejected', code: 'BAD', discountMmk: 0 }) }),
  ]))
  check(r.byStatus.rejected === 1, 'rejected: byStatus.rejected 1')
}

// 6. Two approved orders accumulate
{
  const r = projectShopOrderPromotionDecisionSummary(state([
    order({ id: 'ORD-1', promotionDecision: promotionDecision({ status: 'approved', code: 'P10', discountMmk: 1000 }) }),
    order({ id: 'ORD-2', promotionDecision: promotionDecision({ status: 'approved', code: 'P20', discountMmk: 2000 }) }),
  ]))
  check(r.ordersWithDecision === 2, '2orders: ordersWithDecision 2')
  check(r.totalDiscountMmk === 3000, '2orders: totalDiscountMmk 3000')
  check(r.byStatus.approved === 2, '2orders: byStatus.approved 2')
  check(r.ordersWithCode === 2, '2orders: ordersWithCode 2')
}

// 7. One order with code, one without (not_requested) → ordersWithCode 1
{
  const r = projectShopOrderPromotionDecisionSummary(state([
    order({ id: 'ORD-1', promotionDecision: promotionDecision({ status: 'not_requested', code: null, discountMmk: 0 }) }),
    order({ id: 'ORD-2', promotionDecision: promotionDecision({ status: 'approved', code: 'SAVE5', discountMmk: 500 }) }),
  ]))
  check(r.ordersWithCode === 1, 'mixed-code: ordersWithCode 1')
}

// 8. Mixed (one with, one without decision)
{
  const r = projectShopOrderPromotionDecisionSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', promotionDecision: promotionDecision({ status: 'approved', code: 'X', discountMmk: 100 }) }),
  ]))
  check(r.ordersWithDecision === 1, 'mixed: ordersWithDecision 1')
}

console.log(JSON.stringify({ ok: true, checks }))
