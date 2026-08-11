// Shop order correction balance brief: balanceAfterMmk (remaining receivable) on corrections.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderCorrectionBalanceBrief } from './shop-order-correction-balance-brief.ts'`,
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

const { projectShopOrderCorrectionBalanceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let docId = 0
function correction({ balanceAfterMmk = 0 } = {}) {
  docId++
  return {
    documentId: `doc-${docId}`,
    actionId: `act-${docId}`,
    createdAt: '2026-08-11T10:00:00Z',
    actor: 'staff-01',
    reason: 'Adjustment.',
    evidenceReference: '',
    kind: 'credit',
    reasonCode: 'pricing_error',
    sourceCalculationDigest: `sha-${docId}`,
    calculation: {
      currency: 'MMK',
      taxConfigurationRevision: null,
      taxCode: null,
      taxJurisdictionCode: null,
      taxEffectiveFrom: null,
      taxRateBasisPoints: null,
      taxMode: 'not_configured',
      listedAmountMmk: 10000,
      subtotalMmk: 10000,
      taxMmk: 0,
      totalMmk: 10000,
    },
    balanceAfterMmk,
    financialStatus: 'review_required',
    postingAuthority: 'none',
    externalPostingPerformed: false,
  }
}

let orderId = 0
function order(corrections = []) {
  orderId++
  return {
    id: `order-${orderId}`,
    createdAt: '2026-08-11T08:00:00Z',
    customer: `cust-${orderId}`,
    channel: 'walk-in',
    item: 'Item',
    quantity: 1,
    unitPriceMmk: 10000,
    totalMmk: 10000,
    status: 'confirmed',
    total: 10000,
    ...(corrections.length > 0 && { corrections }),
  }
}

function state(orders) {
  return {
    schema: 'supermega.shop.commerce.v1',
    items: [],
    orders: orders ?? [],
    movements: [],
    closes: [],
    catalogBaselines: [],
    catalogChanges: [],
    promotionPolicies: [],
    shippingPolicies: [],
    paymentPolicies: [],
    websiteIntakes: [],
    storefrontRequests: [],
    purchaseBudgetEnvelopes: [],
    supplierSourcingDecisions: [],
    purchaseOrders: [],
  }
}

// 1. Empty → all zeros
{
  const r = projectShopOrderCorrectionBalanceBrief(state([]))
  check(r.totalCorrections === 0, 'empty: totalCorrections 0')
  check(r.correctionsToZeroBalance === 0, 'empty: correctionsToZeroBalance 0')
  check(r.correctionsToPositiveBalance === 0, 'empty: correctionsToPositiveBalance 0')
  check(r.zeroBalanceRate === 0, 'empty: zeroBalanceRate 0')
  check(r.totalPostCorrectionBalanceMmk === 0, 'empty: totalPostCorrectionBalanceMmk 0')
  check(r.averagePostCorrectionBalanceMmk === 0, 'empty: averagePostCorrectionBalanceMmk 0')
}

// 2. Order with no corrections
{
  const r = projectShopOrderCorrectionBalanceBrief(state([order([])]))
  check(r.totalCorrections === 0, 'no-corrections: totalCorrections 0')
}

// 3. Full write-off (balanceAfterMmk = 0)
{
  const r = projectShopOrderCorrectionBalanceBrief(state([order([correction({ balanceAfterMmk: 0 })])]))
  check(r.totalCorrections === 1, 'write-off: totalCorrections 1')
  check(r.correctionsToZeroBalance === 1, 'write-off: correctionsToZeroBalance 1')
  check(r.correctionsToPositiveBalance === 0, 'write-off: correctionsToPositiveBalance 0')
  check(r.zeroBalanceRate === 100, 'write-off: zeroBalanceRate 100')
  check(r.totalPostCorrectionBalanceMmk === 0, 'write-off: totalPostCorrectionBalanceMmk 0')
  check(r.averagePostCorrectionBalanceMmk === 0, 'write-off: averagePostCorrectionBalanceMmk 0')
}

// 4. Partial adjustment (positive balance remaining)
{
  const r = projectShopOrderCorrectionBalanceBrief(state([order([correction({ balanceAfterMmk: 5000 })])]))
  check(r.correctionsToZeroBalance === 0, 'partial: correctionsToZeroBalance 0')
  check(r.correctionsToPositiveBalance === 1, 'partial: correctionsToPositiveBalance 1')
  check(r.zeroBalanceRate === 0, 'partial: zeroBalanceRate 0')
  check(r.totalPostCorrectionBalanceMmk === 5000, 'partial: totalPostCorrectionBalanceMmk 5000')
  check(r.averagePostCorrectionBalanceMmk === 5000, 'partial: averagePostCorrectionBalanceMmk 5000')
}

// 5. Two corrections, both zero (all write-offs)
{
  const r = projectShopOrderCorrectionBalanceBrief(state([order([
    correction({ balanceAfterMmk: 0 }),
    correction({ balanceAfterMmk: 0 }),
  ])]))
  check(r.correctionsToZeroBalance === 2, 'all-zero: correctionsToZeroBalance 2')
  check(r.zeroBalanceRate === 100, 'all-zero: zeroBalanceRate 100')
}

// 6. Mixed: one zero, one positive
{
  const r = projectShopOrderCorrectionBalanceBrief(state([order([
    correction({ balanceAfterMmk: 0 }),
    correction({ balanceAfterMmk: 3000 }),
  ])]))
  check(r.correctionsToZeroBalance === 1, 'mixed: correctionsToZeroBalance 1')
  check(r.correctionsToPositiveBalance === 1, 'mixed: correctionsToPositiveBalance 1')
  check(r.zeroBalanceRate === 50, 'mixed: zeroBalanceRate 50')
  check(r.totalPostCorrectionBalanceMmk === 3000, 'mixed: totalPostCorrectionBalanceMmk 3000')
  check(r.averagePostCorrectionBalanceMmk === 1500, 'mixed: averagePostCorrectionBalanceMmk 1500')
}

// 7. zeroBalanceRate rounds — 1 of 3 = 33%
{
  const r = projectShopOrderCorrectionBalanceBrief(state([order([
    correction({ balanceAfterMmk: 0 }),
    correction({ balanceAfterMmk: 2000 }),
    correction({ balanceAfterMmk: 4000 }),
  ])]))
  check(r.zeroBalanceRate === 33, 'round-33pct: zeroBalanceRate 33')
}

// 8. averagePostCorrectionBalanceMmk rounds — 10000+10001 / 2 = 10000.5 → 10001
{
  const r = projectShopOrderCorrectionBalanceBrief(state([order([
    correction({ balanceAfterMmk: 10000 }),
    correction({ balanceAfterMmk: 10001 }),
  ])]))
  check(r.averagePostCorrectionBalanceMmk === 10001, 'round-avg: averagePostCorrectionBalanceMmk 10001')
}

// 9. Across multiple orders
{
  const r = projectShopOrderCorrectionBalanceBrief(state([
    order([correction({ balanceAfterMmk: 0 })]),
    order([correction({ balanceAfterMmk: 6000 }), correction({ balanceAfterMmk: 0 })]),
  ]))
  check(r.totalCorrections === 3, 'multi-order: totalCorrections 3')
  check(r.correctionsToZeroBalance === 2, 'multi-order: correctionsToZeroBalance 2')
  check(r.totalPostCorrectionBalanceMmk === 6000, 'multi-order: totalPostCorrectionBalanceMmk 6000')
  check(r.averagePostCorrectionBalanceMmk === 2000, 'multi-order: averagePostCorrectionBalanceMmk 2000')
}

console.log(JSON.stringify({ ok: true, checks }))
