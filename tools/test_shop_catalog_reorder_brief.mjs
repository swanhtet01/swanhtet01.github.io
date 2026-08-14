// Shop catalog reorder brief: previousReorderAt vs nextReorderAt shifts.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopCatalogReorderBrief } from './shop-catalog-reorder-brief.ts'`,
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

const { projectShopCatalogReorderBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function change({ sku = 'SKU-01', previousReorderAt = 10, nextReorderAt = 10 } = {}) {
  return {
    sku,
    previousPrice: 5000,
    nextPrice: 5000,
    previousReorderAt,
    nextReorderAt,
    proof: { actionId: 'act-1', savedAt: '2026-08-11T08:00:00Z', savedBy: 'buyer-01' },
  }
}

function state(changes) {
  return {
    schema: 'supermega.commerce.workspace.v3',
    revision: 1,
    orders: [],
    purchaseOrders: [],
    movements: [],
    taxConfigurations: [],
    customerCreditPolicies: [],
    promotionPolicies: [],
    shippingPolicies: [],
    paymentPolicies: [],
    catalogChanges: changes ?? [],
    purchaseBudgetEnvelopes: [],
    purchaseRequisitions: [],
    supplierSourcingDecisions: [],
    websiteIntakes: [],
  }
}

// 1. No changes (undefined) → all zeros
{
  const r = projectShopCatalogReorderBrief({ ...state([]), catalogChanges: undefined })
  check(r.totalChanges === 0, 'no-changes: total 0')
  check(r.changesWithReorderAtShift === 0, 'no-changes: withShift 0')
  check(r.reorderAtShiftRate === 0, 'no-changes: rate 0')
  check(r.increasedReorderAtCount === 0, 'no-changes: increased 0')
  check(r.decreasedReorderAtCount === 0, 'no-changes: decreased 0')
  check(r.totalNextReorderAtUnits === 0, 'no-changes: totalNext 0')
  check(r.averageNextReorderAtUnits === 0, 'no-changes: avg 0')
}

// 2. Change with same reorderAt — no shift
{
  const r = projectShopCatalogReorderBrief(state([change({ previousReorderAt: 10, nextReorderAt: 10 })]))
  check(r.totalChanges === 1, 'no-shift: total 1')
  check(r.changesWithReorderAtShift === 0, 'no-shift: withShift 0')
  check(r.reorderAtShiftRate === 0, 'no-shift: rate 0')
  check(r.totalNextReorderAtUnits === 10, 'no-shift: totalNext 10')
}

// 3. Change increasing reorderAt
{
  const r = projectShopCatalogReorderBrief(state([change({ previousReorderAt: 10, nextReorderAt: 20 })]))
  check(r.changesWithReorderAtShift === 1, 'increased: withShift 1')
  check(r.reorderAtShiftRate === 100, 'increased: rate 100')
  check(r.increasedReorderAtCount === 1, 'increased: count 1')
  check(r.decreasedReorderAtCount === 0, 'increased: decreased 0')
  check(r.totalNextReorderAtUnits === 20, 'increased: totalNext 20')
}

// 4. Change decreasing reorderAt
{
  const r = projectShopCatalogReorderBrief(state([change({ previousReorderAt: 20, nextReorderAt: 5 })]))
  check(r.changesWithReorderAtShift === 1, 'decreased: withShift 1')
  check(r.decreasedReorderAtCount === 1, 'decreased: count 1')
  check(r.increasedReorderAtCount === 0, 'decreased: increased 0')
}

// 5. Mixed: increase, decrease, unchanged
{
  const r = projectShopCatalogReorderBrief(state([
    change({ sku: 'A', previousReorderAt: 5, nextReorderAt: 10 }),   // increased
    change({ sku: 'B', previousReorderAt: 20, nextReorderAt: 5 }),   // decreased
    change({ sku: 'C', previousReorderAt: 15, nextReorderAt: 15 }), // unchanged
  ]))
  check(r.totalChanges === 3, 'mixed: total 3')
  check(r.changesWithReorderAtShift === 2, 'mixed: withShift 2')
  check(r.reorderAtShiftRate === 67, 'mixed: rate 67')
  check(r.increasedReorderAtCount === 1, 'mixed: increased 1')
  check(r.decreasedReorderAtCount === 1, 'mixed: decreased 1')
  check(r.totalNextReorderAtUnits === 30, 'mixed: totalNext 30 (10+5+15)')
  check(r.averageNextReorderAtUnits === 10, 'mixed: avg 10 (30/3)')
}

// 6. Average rounds — nextReorderAt 10 + 11 = 21 / 2 = 10.5 → 11
{
  const r = projectShopCatalogReorderBrief(state([
    change({ nextReorderAt: 10 }),
    change({ sku: 'B', nextReorderAt: 11 }),
  ]))
  check(r.averageNextReorderAtUnits === 11, 'round: avg 11 (Math.round(10.5))')
}

// 7. Rate rounds — 1 of 3 = 33%
{
  const r = projectShopCatalogReorderBrief(state([
    change({ sku: 'A', previousReorderAt: 5, nextReorderAt: 10 }),
    change({ sku: 'B', previousReorderAt: 10, nextReorderAt: 10 }),
    change({ sku: 'C', previousReorderAt: 10, nextReorderAt: 10 }),
  ]))
  check(r.reorderAtShiftRate === 33, 'rate-33: rate 33')
}

// 8. Multiple all-increased
{
  const r = projectShopCatalogReorderBrief(state([
    change({ sku: 'A', previousReorderAt: 5, nextReorderAt: 15 }),
    change({ sku: 'B', previousReorderAt: 10, nextReorderAt: 25 }),
  ]))
  check(r.increasedReorderAtCount === 2, 'all-increased: count 2')
  check(r.decreasedReorderAtCount === 0, 'all-increased: decreased 0')
  check(r.totalNextReorderAtUnits === 40, 'all-increased: totalNext 40')
}

console.log(JSON.stringify({ ok: true, checks }))
