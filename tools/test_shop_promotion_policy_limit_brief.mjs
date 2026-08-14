// Shop promotion policy limit brief: minimumSubtotalMmk + maximumDiscountMmk coverage.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPromotionPolicyLimitBrief } from './shop-promotion-policy-limit-brief.ts'`,
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

const { projectShopPromotionPolicyLimitBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let rev = 0
function policy({ minimumSubtotalMmk = 0, maximumDiscountMmk = 0, status = 'active' } = {}) {
  rev++
  return {
    revision: rev,
    code: `PROMO-${rev}`,
    discountBasisPoints: 1000,
    minimumSubtotalMmk,
    maximumDiscountMmk,
    status,
    effectiveFrom: '2026-08-01',
    effectiveUntil: null,
    proof: { actionId: `act-${rev}`, savedAt: '2026-08-11T08:00:00Z', savedBy: 'admin-01' },
  }
}

function state(policies) {
  return {
    schema: 'supermega.commerce.workspace.v3',
    revision: 1,
    orders: [],
    purchaseOrders: [],
    movements: [],
    taxConfigurations: [],
    customerCreditPolicies: [],
    promotionPolicies: policies ?? [],
    shippingPolicies: [],
    paymentPolicies: [],
    catalogChanges: [],
    purchaseBudgetEnvelopes: [],
    purchaseRequisitions: [],
    supplierSourcingDecisions: [],
    websiteIntakes: [],
  }
}

// 1. No policies → all zeros
{
  const r = projectShopPromotionPolicyLimitBrief({ ...state([]), promotionPolicies: undefined })
  check(r.totalPolicies === 0, 'no-policies: total 0')
  check(r.policiesWithMinimumSubtotal === 0, 'no-policies: withMin 0')
  check(r.minimumSubtotalRate === 0, 'no-policies: minRate 0')
  check(r.totalMinimumSubtotalMmk === 0, 'no-policies: totalMin 0')
  check(r.averageMinimumSubtotalMmk === 0, 'no-policies: avgMin 0')
  check(r.policiesWithMaximumDiscount === 0, 'no-policies: withMax 0')
  check(r.maximumDiscountRate === 0, 'no-policies: maxRate 0')
  check(r.totalMaximumDiscountMmk === 0, 'no-policies: totalMax 0')
  check(r.averageMaximumDiscountMmk === 0, 'no-policies: avgMax 0')
}

// 2. Single policy with no minimums/caps (zeros)
{
  const r = projectShopPromotionPolicyLimitBrief(state([policy()]))
  check(r.totalPolicies === 1, 'no-limits: total 1')
  check(r.policiesWithMinimumSubtotal === 0, 'no-limits: withMin 0')
  check(r.policiesWithMaximumDiscount === 0, 'no-limits: withMax 0')
  check(r.minimumSubtotalRate === 0, 'no-limits: minRate 0')
  check(r.maximumDiscountRate === 0, 'no-limits: maxRate 0')
}

// 3. Policy with minimumSubtotalMmk > 0
{
  const r = projectShopPromotionPolicyLimitBrief(state([policy({ minimumSubtotalMmk: 50000 })]))
  check(r.policiesWithMinimumSubtotal === 1, 'with-min: count 1')
  check(r.minimumSubtotalRate === 100, 'with-min: rate 100')
  check(r.totalMinimumSubtotalMmk === 50000, 'with-min: total 50000')
  check(r.averageMinimumSubtotalMmk === 50000, 'with-min: avg 50000')
}

// 4. Policy with maximumDiscountMmk > 0
{
  const r = projectShopPromotionPolicyLimitBrief(state([policy({ maximumDiscountMmk: 10000 })]))
  check(r.policiesWithMaximumDiscount === 1, 'with-max: count 1')
  check(r.maximumDiscountRate === 100, 'with-max: rate 100')
  check(r.totalMaximumDiscountMmk === 10000, 'with-max: total 10000')
  check(r.averageMaximumDiscountMmk === 10000, 'with-max: avg 10000')
}

// 5. Both limits set
{
  const r = projectShopPromotionPolicyLimitBrief(state([
    policy({ minimumSubtotalMmk: 50000, maximumDiscountMmk: 10000 }),
  ]))
  check(r.policiesWithMinimumSubtotal === 1, 'both: withMin 1')
  check(r.policiesWithMaximumDiscount === 1, 'both: withMax 1')
}

// 6. Mix: some with limits, some without
{
  const r = projectShopPromotionPolicyLimitBrief(state([
    policy({ minimumSubtotalMmk: 50000, maximumDiscountMmk: 0 }),
    policy({ minimumSubtotalMmk: 0, maximumDiscountMmk: 5000 }),
    policy({ minimumSubtotalMmk: 0, maximumDiscountMmk: 0 }),
  ]))
  check(r.totalPolicies === 3, 'mix: total 3')
  check(r.policiesWithMinimumSubtotal === 1, 'mix: withMin 1')
  check(r.policiesWithMaximumDiscount === 1, 'mix: withMax 1')
  check(r.minimumSubtotalRate === 33, 'mix: minRate 33')
  check(r.maximumDiscountRate === 33, 'mix: maxRate 33')
  check(r.totalMinimumSubtotalMmk === 50000, 'mix: totalMin 50000')
  check(r.totalMaximumDiscountMmk === 5000, 'mix: totalMax 5000')
}

// 7. Totals accumulate
{
  const r = projectShopPromotionPolicyLimitBrief(state([
    policy({ minimumSubtotalMmk: 50000, maximumDiscountMmk: 10000 }),
    policy({ minimumSubtotalMmk: 100000, maximumDiscountMmk: 20000 }),
  ]))
  check(r.totalMinimumSubtotalMmk === 150000, 'totals: totalMin 150000')
  check(r.totalMaximumDiscountMmk === 30000, 'totals: totalMax 30000')
  check(r.averageMinimumSubtotalMmk === 75000, 'totals: avgMin 75000')
  check(r.averageMaximumDiscountMmk === 15000, 'totals: avgMax 15000')
}

// 8. Average includes zeros (all policies, not just those with limits)
{
  const r = projectShopPromotionPolicyLimitBrief(state([
    policy({ minimumSubtotalMmk: 60000 }),
    policy({ minimumSubtotalMmk: 0 }),
  ]))
  // average = 60000/2 = 30000 (zeros included in denominator)
  check(r.averageMinimumSubtotalMmk === 30000, 'avg-includes-zeros: 30000')
}

// 9. Rate rounds — 1 of 3 = 33%
{
  const r = projectShopPromotionPolicyLimitBrief(state([
    policy({ maximumDiscountMmk: 5000 }),
    policy(),
    policy(),
  ]))
  check(r.maximumDiscountRate === 33, 'round-33: maxRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
