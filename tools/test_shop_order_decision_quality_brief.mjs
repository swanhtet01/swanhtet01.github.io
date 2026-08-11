// Shop order decision quality brief: approval rates + financial totals across all decision types.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderDecisionQualityBrief } from './shop-order-decision-quality-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-decision-quality-brief-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderDecisionQualityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function pd(status) {
  return { schema: 'supermega.commerce.payment-decision.v1', status, reason: status, adapter: 'pay_on_pickup', policyRevision: null, policyActionId: null, maximumOrderMmk: null, instructions: null, reviewedAt: '2026-01-01T00:00:00Z', authorized: false }
}
function sd(status, feeMmk = 0) {
  return { schema: 'supermega.commerce.shipping-decision.v1', status, reason: status, township: null, zoneCode: null, policyRevision: null, policyActionId: null, feeMmk, promiseMinutes: null, reviewedAt: '2026-01-01T00:00:00Z' }
}
function prom(status, discountMmk = 0) {
  return { schema: 'supermega.commerce.promotion-decision.v1', status, code: status === 'approved' ? 'P10' : null, reason: status, policyRevision: null, policyActionId: null, discountBasisPoints: 500, grossSubtotalMmk: 10000, discountMmk, netSubtotalMmk: 10000 - discountMmk, reviewedAt: '2026-01-01T00:00:00Z' }
}
function cd(orderAmountMmk = 50000) {
  return { policyRevision: 1, policyActionId: 'POL-1', creditLimitMmk: 100000, exposureBeforeMmk: 0, orderAmountMmk, exposureAfterMmk: orderAmountMmk, maxPaymentTermsDays: 30, paymentTermsDays: 7, status: 'approved' }
}
function calc(taxMmk = 0) {
  return { schema: 'supermega.commerce.order-calculation.v1', currency: 'MMK', catalogRevision: 1, subtotalMmk: 10000, taxMode: 'not_configured', taxMmk, totalMmk: 10000 + taxMmk }
}

function order({ id = 'ORD-1', fields = {} } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 10000, status: 'confirmed',
    ...fields,
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zero/0 rate
{
  const r = projectShopOrderDecisionQualityBrief(state([]))
  check(r.paymentApprovalRate === 0, 'empty: paymentApprovalRate 0')
  check(r.shippingApprovalRate === 0, 'empty: shippingApprovalRate 0')
  check(r.promotionApprovalRate === 0, 'empty: promotionApprovalRate 0')
  check(r.totalShippingFeeMmk === 0, 'empty: totalShippingFeeMmk 0')
  check(r.totalDiscountMmk === 0, 'empty: totalDiscountMmk 0')
  check(r.totalCreditExtendedMmk === 0, 'empty: totalCreditExtendedMmk 0')
  check(r.totalTaxFromCalculationMmk === 0, 'empty: totalTaxFromCalculationMmk 0')
}

// 2. Single order, all approved, with fees/discount/credit/tax
{
  const r = projectShopOrderDecisionQualityBrief(state([
    order({ id: 'ORD-1', fields: {
      paymentDecision: pd('approved'),
      shippingDecision: sd('approved', 3000),
      promotionDecision: prom('approved', 500),
      creditDecision: cd(50000),
      calculation: calc(250),
    }}),
  ]))
  check(r.paymentApprovalRate === 100, 'all-approved: paymentApprovalRate 100')
  check(r.shippingApprovalRate === 100, 'all-approved: shippingApprovalRate 100')
  check(r.promotionApprovalRate === 100, 'all-approved: promotionApprovalRate 100')
  check(r.totalShippingFeeMmk === 3000, 'all-approved: totalShippingFeeMmk 3000')
  check(r.totalDiscountMmk === 500, 'all-approved: totalDiscountMmk 500')
  check(r.totalCreditExtendedMmk === 50000, 'all-approved: totalCreditExtendedMmk 50000')
  check(r.totalTaxFromCalculationMmk === 250, 'all-approved: totalTaxFromCalculationMmk 250')
}

// 3. Single order, all rejected (where applicable)
{
  const r = projectShopOrderDecisionQualityBrief(state([
    order({ id: 'ORD-1', fields: {
      paymentDecision: pd('rejected'),
      shippingDecision: sd('rejected'),
      promotionDecision: prom('rejected'),
    }}),
  ]))
  check(r.paymentApprovalRate === 0, 'all-rejected: paymentApprovalRate 0')
  check(r.shippingApprovalRate === 0, 'all-rejected: shippingApprovalRate 0')
  check(r.promotionApprovalRate === 0, 'all-rejected: promotionApprovalRate 0')
  check(r.totalShippingFeeMmk === 0, 'all-rejected: totalShippingFeeMmk 0 (fee only on approved)')
}

// 4. 50% approval rate (1 approved, 1 rejected)
{
  const r = projectShopOrderDecisionQualityBrief(state([
    order({ id: 'ORD-1', fields: { paymentDecision: pd('approved') } }),
    order({ id: 'ORD-2', fields: { paymentDecision: pd('rejected') } }),
  ]))
  check(r.paymentApprovalRate === 50, '50pct: paymentApprovalRate 50')
}

// 5. not_requested promotions excluded from promotionApprovalRate
{
  const r = projectShopOrderDecisionQualityBrief(state([
    order({ id: 'ORD-1', fields: { promotionDecision: prom('not_requested') } }),
    order({ id: 'ORD-2', fields: { promotionDecision: prom('approved', 200) } }),
  ]))
  check(r.promotionApprovalRate === 100, 'promo-excl: promotionApprovalRate 100 (not_req excluded)')
  check(r.totalDiscountMmk === 200, 'promo-excl: totalDiscountMmk 200')
}

// 6. Pickup shipping excluded from shippingApprovalRate
{
  const r = projectShopOrderDecisionQualityBrief(state([
    order({ id: 'ORD-1', fields: { shippingDecision: { ...sd('pickup'), feeMmk: 0 } } }),
    order({ id: 'ORD-2', fields: { shippingDecision: sd('approved', 2000) } }),
  ]))
  check(r.shippingApprovalRate === 100, 'pickup-excl: shippingApprovalRate 100 (pickup not counted)')
  check(r.totalShippingFeeMmk === 2000, 'pickup-excl: totalShippingFeeMmk 2000 (approved only)')
}

// 7. Two orders accumulate financial totals
{
  const r = projectShopOrderDecisionQualityBrief(state([
    order({ id: 'ORD-1', fields: { creditDecision: cd(30000), calculation: calc(150) } }),
    order({ id: 'ORD-2', fields: { creditDecision: cd(50000), calculation: calc(250) } }),
  ]))
  check(r.totalCreditExtendedMmk === 80000, '2orders: totalCreditExtendedMmk 80000')
  check(r.totalTaxFromCalculationMmk === 400, '2orders: totalTaxFromCalculationMmk 400')
}

console.log(JSON.stringify({ ok: true, checks }))
