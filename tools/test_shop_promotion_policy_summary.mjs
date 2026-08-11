// Shop promotion policy summary: totalPolicies, activePolicies, inactivePolicies,
// uniqueCodes, highestDiscountBasisPoints, policiesWithNoExpiry, topCode.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPromotionPolicySummary } from './shop-promotion-policy-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/promotion-policy-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopPromotionPolicySummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1' }
let rev = 0

function policy({ code = 'PROMO-A', discountBasisPoints = 500, minimumSubtotalMmk = 50_000, maximumDiscountMmk = 5_000, status = 'active', effectiveFrom = '2026-08-01', effectiveUntil = null } = {}) {
  return {
    revision: ++rev,
    code,
    discountBasisPoints,
    minimumSubtotalMmk,
    maximumDiscountMmk,
    status,
    effectiveFrom,
    effectiveUntil,
    proof: PROOF,
  }
}

function state(promotionPolicies = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(promotionPolicies !== undefined ? { promotionPolicies } : {}),
  }
}

// 1. Empty state (no field) → all zeros, topCode null
{
  const r = projectShopPromotionPolicySummary(state())
  check(r.totalPolicies === 0, 'empty: totalPolicies 0')
  check(r.activePolicies === 0, 'empty: activePolicies 0')
  check(r.inactivePolicies === 0, 'empty: inactivePolicies 0')
  check(r.uniqueCodes === 0, 'empty: uniqueCodes 0')
  check(r.highestDiscountBasisPoints === 0, 'empty: highestDiscountBasisPoints 0')
  check(r.policiesWithNoExpiry === 0, 'empty: policiesWithNoExpiry 0')
  check(r.topCode === null, 'empty: topCode null')
}

// 2. Empty array → totalPolicies 0
{
  const r = projectShopPromotionPolicySummary(state([]))
  check(r.totalPolicies === 0, 'empty-array: totalPolicies 0')
}

// 3. Single active policy with no expiry
{
  const r = projectShopPromotionPolicySummary(state([
    policy({ code: 'SAVE10', discountBasisPoints: 1_000, effectiveUntil: null, status: 'active' }),
  ]))
  check(r.totalPolicies === 1, 'single: totalPolicies 1')
  check(r.activePolicies === 1, 'single: activePolicies 1')
  check(r.inactivePolicies === 0, 'single: inactivePolicies 0')
  check(r.uniqueCodes === 1, 'single: uniqueCodes 1')
  check(r.highestDiscountBasisPoints === 1_000, 'single: highestDiscountBasisPoints 1000')
  check(r.policiesWithNoExpiry === 1, 'single: policiesWithNoExpiry 1')
  check(r.topCode === 'SAVE10', 'single: topCode SAVE10')
}

// 4. Single inactive policy
{
  const r = projectShopPromotionPolicySummary(state([
    policy({ status: 'inactive' }),
  ]))
  check(r.inactivePolicies === 1, 'inactive: inactivePolicies 1')
  check(r.activePolicies === 0, 'inactive: activePolicies 0')
}

// 5. Policy with effectiveUntil set → policiesWithNoExpiry 0
{
  const r = projectShopPromotionPolicySummary(state([
    policy({ effectiveUntil: '2026-12-31' }),
  ]))
  check(r.policiesWithNoExpiry === 0, 'expiry: policiesWithNoExpiry 0')
}

// 6. highestDiscountBasisPoints: max wins
{
  const r = projectShopPromotionPolicySummary(state([
    policy({ discountBasisPoints: 500 }),
    policy({ discountBasisPoints: 1_500 }),
    policy({ discountBasisPoints: 1_000 }),
  ]))
  check(r.highestDiscountBasisPoints === 1_500, 'highest-discount: 1500 wins')
}

// 7. uniqueCodes: same code two revisions → uniqueCodes 1, totalPolicies 2
{
  const r = projectShopPromotionPolicySummary(state([
    policy({ code: 'PROMO-X' }),
    policy({ code: 'PROMO-X' }),
  ]))
  check(r.uniqueCodes === 1, 'dedup: uniqueCodes 1')
  check(r.totalPolicies === 2, 'dedup: totalPolicies 2')
}

// 8. topCode: most revisions wins
{
  const r = projectShopPromotionPolicySummary(state([
    policy({ code: 'PROMO-A' }),
    policy({ code: 'PROMO-B' }),
    policy({ code: 'PROMO-B' }),
  ]))
  check(r.topCode === 'PROMO-B', 'top-revisions: PROMO-B (2) wins over PROMO-A (1)')
}

// 9. topCode: alpha tie-break (AAA < ZZZ)
{
  const r = projectShopPromotionPolicySummary(state([
    policy({ code: 'ZZZ' }),
    policy({ code: 'AAA' }),
  ]))
  check(r.topCode === 'AAA', 'tie: AAA < ZZZ → AAA wins')
}

// 10. Mixed active/inactive
{
  const r = projectShopPromotionPolicySummary(state([
    policy({ status: 'active' }),
    policy({ status: 'active' }),
    policy({ status: 'inactive' }),
  ]))
  check(r.activePolicies === 2, 'mixed: activePolicies 2')
  check(r.inactivePolicies === 1, 'mixed: inactivePolicies 1')
  check(r.totalPolicies === 3, 'mixed: totalPolicies 3')
}

// 11. policiesWithNoExpiry accumulates
{
  const r = projectShopPromotionPolicySummary(state([
    policy({ effectiveUntil: null }),
    policy({ effectiveUntil: null }),
    policy({ effectiveUntil: '2026-12-31' }),
  ]))
  check(r.policiesWithNoExpiry === 2, 'no-expiry: policiesWithNoExpiry 2')
}

// 12. Multiple distinct codes → uniqueCodes count
{
  const r = projectShopPromotionPolicySummary(state([
    policy({ code: 'CODE-1' }),
    policy({ code: 'CODE-2' }),
    policy({ code: 'CODE-3' }),
  ]))
  check(r.uniqueCodes === 3, 'unique-codes: 3 distinct codes')
}

// 13. highestDiscountBasisPoints includes inactive policies
{
  const r = projectShopPromotionPolicySummary(state([
    policy({ discountBasisPoints: 200, status: 'active' }),
    policy({ discountBasisPoints: 800, status: 'inactive' }),
  ]))
  check(r.highestDiscountBasisPoints === 800, 'highest-all: includes inactive (800)')
}

console.log(JSON.stringify({ ok: true, checks }))
