// Shop stock movement discrepancy brief: discrepancyCode analytics on stock movements.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopStockMovementDiscrepancyBrief } from './shop-stock-movement-discrepancy-brief.ts'`,
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

const { projectShopStockMovementDiscrepancyBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let movId = 0
function movement({ discrepancyCode } = {}) {
  movId++
  return {
    id: `mov-${movId}`,
    actionId: `act-${movId}`,
    createdAt: '2026-08-11T10:00:00Z',
    actor: 'operator-1',
    reason: 'Stock adjustment',
    evidenceReference: 'ev-1',
    kind: 'receipt',
    sku: 'SKU-1',
    quantityDelta: 10,
    ...(discrepancyCode !== undefined && { discrepancyCode }),
  }
}

function state(movements) {
  return {
    schema: 'supermega.shop.commerce.v1',
    items: [],
    orders: [],
    movements: movements ?? [],
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

// 1. Empty → all zeros, no top code
{
  const r = projectShopStockMovementDiscrepancyBrief(state([]))
  check(r.totalMovements === 0, 'empty: totalMovements 0')
  check(r.movementsWithDiscrepancy === 0, 'empty: movementsWithDiscrepancy 0')
  check(r.movementsWithoutDiscrepancy === 0, 'empty: movementsWithoutDiscrepancy 0')
  check(r.discrepancyRate === 0, 'empty: discrepancyRate 0')
  check(r.byCode.damaged === 0, 'empty: byCode.damaged 0')
  check(r.byCode.wrongItem === 0, 'empty: byCode.wrongItem 0')
  check(r.byCode.qualityFailed === 0, 'empty: byCode.qualityFailed 0')
  check(r.topDiscrepancyCode === null, 'empty: topDiscrepancyCode null')
}

// 2. Movement without discrepancy
{
  const r = projectShopStockMovementDiscrepancyBrief(state([movement()]))
  check(r.totalMovements === 1, 'no-discrepancy: totalMovements 1')
  check(r.movementsWithDiscrepancy === 0, 'no-discrepancy: movementsWithDiscrepancy 0')
  check(r.movementsWithoutDiscrepancy === 1, 'no-discrepancy: movementsWithoutDiscrepancy 1')
  check(r.discrepancyRate === 0, 'no-discrepancy: discrepancyRate 0')
  check(r.topDiscrepancyCode === null, 'no-discrepancy: topDiscrepancyCode null')
}

// 3. Movement with damaged discrepancy
{
  const r = projectShopStockMovementDiscrepancyBrief(state([movement({ discrepancyCode: 'damaged' })]))
  check(r.movementsWithDiscrepancy === 1, 'damaged: movementsWithDiscrepancy 1')
  check(r.byCode.damaged === 1, 'damaged: byCode.damaged 1')
  check(r.discrepancyRate === 100, 'damaged: discrepancyRate 100')
  check(r.topDiscrepancyCode === 'damaged', 'damaged: topDiscrepancyCode damaged')
}

// 4. Movement with wrong_item discrepancy
{
  const r = projectShopStockMovementDiscrepancyBrief(state([movement({ discrepancyCode: 'wrong_item' })]))
  check(r.byCode.wrongItem === 1, 'wrong_item: byCode.wrongItem 1')
  check(r.topDiscrepancyCode === 'wrong_item', 'wrong_item: topDiscrepancyCode wrong_item')
}

// 5. Movement with quality_failed discrepancy
{
  const r = projectShopStockMovementDiscrepancyBrief(state([movement({ discrepancyCode: 'quality_failed' })]))
  check(r.byCode.qualityFailed === 1, 'quality_failed: byCode.qualityFailed 1')
  check(r.topDiscrepancyCode === 'quality_failed', 'quality_failed: topDiscrepancyCode quality_failed')
}

// 6. Mixed: 1 with discrepancy, 1 without → 50% rate
{
  const r = projectShopStockMovementDiscrepancyBrief(state([
    movement({ discrepancyCode: 'damaged' }),
    movement(),
  ]))
  check(r.movementsWithDiscrepancy === 1, 'mixed-50: movementsWithDiscrepancy 1')
  check(r.movementsWithoutDiscrepancy === 1, 'mixed-50: movementsWithoutDiscrepancy 1')
  check(r.discrepancyRate === 50, 'mixed-50: discrepancyRate 50')
}

// 7. Multiple discrepancies — top is the most common
{
  const r = projectShopStockMovementDiscrepancyBrief(state([
    movement({ discrepancyCode: 'damaged' }),
    movement({ discrepancyCode: 'damaged' }),
    movement({ discrepancyCode: 'wrong_item' }),
  ]))
  check(r.byCode.damaged === 2, 'top-code: byCode.damaged 2')
  check(r.byCode.wrongItem === 1, 'top-code: byCode.wrongItem 1')
  check(r.topDiscrepancyCode === 'damaged', 'top-code: topDiscrepancyCode damaged (most common)')
  check(r.movementsWithDiscrepancy === 3, 'top-code: movementsWithDiscrepancy 3')
  check(r.discrepancyRate === 100, 'top-code: discrepancyRate 100')
}

// 8. Tie between damaged and wrong_item → damaged wins (first in comparison)
{
  const r = projectShopStockMovementDiscrepancyBrief(state([
    movement({ discrepancyCode: 'damaged' }),
    movement({ discrepancyCode: 'wrong_item' }),
  ]))
  check(r.topDiscrepancyCode === 'damaged', 'tie: topDiscrepancyCode damaged (tie-breaks to damaged)')
}

// 9. discrepancyRate rounds — 1 of 3 = 33%
{
  const r = projectShopStockMovementDiscrepancyBrief(state([
    movement({ discrepancyCode: 'damaged' }),
    movement(),
    movement(),
  ]))
  check(r.discrepancyRate === 33, 'round-33pct: discrepancyRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
