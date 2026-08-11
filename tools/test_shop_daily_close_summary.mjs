// Shop daily close summary: totalCloses, totalRevenueMmk, totalOrdersClosed,
// averageRevenuePerClose, highestCloseMmk, closesWithSettlement, closesWithVariance,
// totalSettlementVarianceMmk from CommerceState.closes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopDailyCloseSummary } from './shop-daily-close-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/daily-close-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopDailyCloseSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function close({ total, orders, settlement = undefined }) {
  seq++
  return {
    id: `close-${seq}`,
    createdAt: '2026-08-11T20:00:00.000Z',
    total,
    orders,
    ...(settlement !== undefined ? { settlement } : {}),
  }
}

function matched(expected, counted) {
  const variance = counted - expected
  return {
    schema: 'supermega.commerce.close_settlement.v1',
    status: 'matched',
    totalExpectedMmk: expected,
    totalCountedMmk: counted,
    totalVarianceMmk: variance,
    lines: [],
  }
}

function variance(expected, counted) {
  const v = counted - expected
  return {
    schema: 'supermega.commerce.close_settlement.v1',
    status: 'variance_review',
    totalExpectedMmk: expected,
    totalCountedMmk: counted,
    totalVarianceMmk: v,
    lines: [],
  }
}

function state(closes = []) {
  return { items: [], orders: [], movements: [], closes, catalogBaselines: [], catalogChanges: [], promotionPolicies: [], shippingPolicies: [], paymentPolicies: [], websiteIntakes: [], storefrontRequests: [], purchaseBudgetEnvelopes: [], supplierSourcingDecisions: [], purchaseOrders: [] }
}

// 1. Empty state → all zeros
{
  const r = projectShopDailyCloseSummary(state())
  check(r.totalCloses === 0, 'empty: totalCloses 0')
  check(r.totalRevenueMmk === 0, 'empty: totalRevenueMmk 0')
  check(r.totalOrdersClosed === 0, 'empty: totalOrdersClosed 0')
  check(r.averageRevenuePerClose === 0, 'empty: averageRevenuePerClose 0 (no zero-division)')
  check(r.highestCloseMmk === 0, 'empty: highestCloseMmk 0')
  check(r.closesWithSettlement === 0, 'empty: closesWithSettlement 0')
  check(r.closesWithVariance === 0, 'empty: closesWithVariance 0')
  check(r.totalSettlementVarianceMmk === 0, 'empty: totalSettlementVarianceMmk 0')
}

// 2. Single close without settlement
{
  const r = projectShopDailyCloseSummary(state([close({ total: 500_000, orders: 10 })]))
  check(r.totalCloses === 1, 'single: totalCloses 1')
  check(r.totalRevenueMmk === 500_000, 'single: totalRevenueMmk 500000')
  check(r.totalOrdersClosed === 10, 'single: totalOrdersClosed 10')
  check(r.averageRevenuePerClose === 500_000, 'single: averageRevenuePerClose 500000')
  check(r.highestCloseMmk === 500_000, 'single: highestCloseMmk 500000')
  check(r.closesWithSettlement === 0, 'single: no settlement')
  check(r.closesWithVariance === 0, 'single: no variance')
}

// 3. Multiple closes: revenue and orders accumulate
{
  const closes = [
    close({ total: 300_000, orders: 5 }),
    close({ total: 700_000, orders: 15 }),
    close({ total: 200_000, orders: 4 }),
  ]
  const r = projectShopDailyCloseSummary(state(closes))
  check(r.totalCloses === 3, 'multi: totalCloses 3')
  check(r.totalRevenueMmk === 1_200_000, 'multi: totalRevenueMmk 1200000')
  check(r.totalOrdersClosed === 24, 'multi: totalOrdersClosed 24')
  check(r.averageRevenuePerClose === 400_000, 'multi: averageRevenuePerClose 400000')
}

// 4. highestCloseMmk picks the maximum
{
  const closes = [
    close({ total: 300_000, orders: 5 }),
    close({ total: 900_000, orders: 20 }),
    close({ total: 100_000, orders: 2 }),
  ]
  const r = projectShopDailyCloseSummary(state(closes))
  check(r.highestCloseMmk === 900_000, 'highest: 900000')
}

// 5. Close with matched settlement: closesWithSettlement++, closesWithVariance unchanged
{
  const r = projectShopDailyCloseSummary(state([
    close({ total: 500_000, orders: 10, settlement: matched(500_000, 500_000) }),
  ]))
  check(r.closesWithSettlement === 1, 'matched: closesWithSettlement 1')
  check(r.closesWithVariance === 0, 'matched: closesWithVariance 0')
  check(r.totalSettlementVarianceMmk === 0, 'matched: totalSettlementVarianceMmk 0')
}

// 6. Close with variance settlement
{
  const r = projectShopDailyCloseSummary(state([
    close({ total: 500_000, orders: 10, settlement: variance(500_000, 490_000) }),
  ]))
  check(r.closesWithSettlement === 1, 'variance: closesWithSettlement 1')
  check(r.closesWithVariance === 1, 'variance: closesWithVariance 1')
  check(r.totalSettlementVarianceMmk === -10_000, 'variance: totalSettlementVarianceMmk -10000')
}

// 7. Mixed: some settled, some not, some with variance
{
  const closes = [
    close({ total: 300_000, orders: 5 }),                                      // no settlement
    close({ total: 400_000, orders: 8, settlement: matched(400_000, 400_000) }), // matched
    close({ total: 500_000, orders: 10, settlement: variance(500_000, 480_000) }), // -20k variance
  ]
  const r = projectShopDailyCloseSummary(state(closes))
  check(r.totalCloses === 3, 'mixed: totalCloses 3')
  check(r.closesWithSettlement === 2, 'mixed: closesWithSettlement 2')
  check(r.closesWithVariance === 1, 'mixed: closesWithVariance 1')
  check(r.totalSettlementVarianceMmk === -20_000, 'mixed: totalSettlementVarianceMmk -20000')
}

// 8. Multiple variances accumulate (signed sum)
{
  const closes = [
    close({ total: 300_000, orders: 5, settlement: variance(300_000, 310_000) }), // +10k
    close({ total: 400_000, orders: 8, settlement: variance(400_000, 380_000) }), // -20k
  ]
  const r = projectShopDailyCloseSummary(state(closes))
  check(r.totalSettlementVarianceMmk === -10_000, 'multi-variance: signed sum = -10000')
  check(r.closesWithVariance === 2, 'multi-variance: 2 closes with variance')
}

// 9. averageRevenuePerClose rounding: 1,000,000 / 3 ≈ 333,333
{
  const closes = [
    close({ total: 333_333, orders: 5 }),
    close({ total: 333_333, orders: 5 }),
    close({ total: 333_334, orders: 5 }),
  ]
  const r = projectShopDailyCloseSummary(state(closes))
  // total = 1_000_000 / 3 = 333,333.33 → rounds to 333,333
  check(r.averageRevenuePerClose === 333_333, 'avg-rounding: 333333')
}

console.log(JSON.stringify({ ok: true, checks }))
