// Shop purchase requisition delivery brief: expectedAt date range + supplier distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseRequisitionDeliveryBrief } from './shop-purchase-requisition-delivery-brief.ts'`,
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

const { projectShopPurchaseRequisitionDeliveryBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function requisition({ supplier = 'SUP-A', expectedAt = '2026-09-01' } = {}) {
  seq++
  return {
    id: `pr-${seq}`,
    createdAt: '2026-08-11T08:00:00Z',
    expectedAt,
    supplier,
    sku: 'SKU-01',
    quantityRequested: 10,
    unitCostMmk: 5000,
    totalMmk: 50000,
    sourceDecisionDigest: 'digest',
    sourceReplenishmentDigest: 'digest',
    approval: { actionId: `act-${seq}`, capturedAt: '2026-08-11T08:00:00Z', actor: 'buyer-01' },
  }
}

function state(purchaseRequisitions) {
  return {
    items: [],
    orders: [],
    movements: [],
    purchaseRequisitions: purchaseRequisitions ?? [],
  }
}

// 1. Empty → all zeros / nulls
{
  const r = projectShopPurchaseRequisitionDeliveryBrief(state([]))
  check(r.totalRequisitions === 0, 'empty: totalRequisitions 0')
  check(r.earliestExpectedAt === null, 'empty: earliestExpectedAt null')
  check(r.latestExpectedAt === null, 'empty: latestExpectedAt null')
  check(r.uniqueSuppliers === 0, 'empty: uniqueSuppliers 0')
  check(r.topSuppliersByCount.length === 0, 'empty: topSuppliers empty')
}

// 2. Null guard: undefined purchaseRequisitions
{
  const r = projectShopPurchaseRequisitionDeliveryBrief({ items: [], orders: [], movements: [], purchaseRequisitions: undefined })
  check(r.totalRequisitions === 0, 'null-guard: totalRequisitions 0')
}

// 3. Single requisition
{
  const r = projectShopPurchaseRequisitionDeliveryBrief(state([requisition({ supplier: 'SUP-X', expectedAt: '2026-09-15' })]))
  check(r.totalRequisitions === 1, 'single: totalRequisitions 1')
  check(r.earliestExpectedAt === '2026-09-15', 'single: earliest 2026-09-15')
  check(r.latestExpectedAt === '2026-09-15', 'single: latest 2026-09-15')
  check(r.uniqueSuppliers === 1, 'single: uniqueSuppliers 1')
  check(r.topSuppliersByCount[0].supplier === 'SUP-X', 'single: SUP-X in top')
  check(r.topSuppliersByCount[0].count === 1, 'single: count 1')
}

// 4. Date range: earliest and latest
{
  const r = projectShopPurchaseRequisitionDeliveryBrief(state([
    requisition({ expectedAt: '2026-10-01' }),
    requisition({ expectedAt: '2026-08-15' }),
    requisition({ expectedAt: '2026-09-20' }),
  ]))
  check(r.totalRequisitions === 3, 'date-range: total 3')
  check(r.earliestExpectedAt === '2026-08-15', 'date-range: earliest 2026-08-15')
  check(r.latestExpectedAt === '2026-10-01', 'date-range: latest 2026-10-01')
}

// 5. Supplier sort by count desc
{
  const r = projectShopPurchaseRequisitionDeliveryBrief(state([
    requisition({ supplier: 'SUP-A' }),
    requisition({ supplier: 'SUP-B' }),
    requisition({ supplier: 'SUP-B' }),
  ]))
  check(r.topSuppliersByCount[0].supplier === 'SUP-B', 'sort: SUP-B first (count 2)')
  check(r.topSuppliersByCount[1].supplier === 'SUP-A', 'sort: SUP-A second (count 1)')
}

// 6. Secondary supplier sort: same count → alphabetical
{
  const r = projectShopPurchaseRequisitionDeliveryBrief(state([
    requisition({ supplier: 'ZZ-SUP' }),
    requisition({ supplier: 'AA-SUP' }),
  ]))
  check(r.topSuppliersByCount[0].supplier === 'AA-SUP', 'secondary: AA before ZZ')
}

// 7. 6 suppliers → top 5
{
  const reqs = ['A', 'B', 'C', 'D', 'E', 'F'].map(s => requisition({ supplier: `SUP-${s}` }))
  const r = projectShopPurchaseRequisitionDeliveryBrief(state(reqs))
  check(r.uniqueSuppliers === 6, 'top-5: unique 6')
  check(r.topSuppliersByCount.length === 5, 'top-5: capped at 5')
}

// 8. Same supplier, date range still tracked
{
  const r = projectShopPurchaseRequisitionDeliveryBrief(state([
    requisition({ supplier: 'SUP-A', expectedAt: '2026-07-01' }),
    requisition({ supplier: 'SUP-A', expectedAt: '2026-11-30' }),
  ]))
  check(r.uniqueSuppliers === 1, 'same-sup: uniqueSuppliers 1')
  check(r.earliestExpectedAt === '2026-07-01', 'same-sup: earliest 2026-07-01')
  check(r.latestExpectedAt === '2026-11-30', 'same-sup: latest 2026-11-30')
  check(r.topSuppliersByCount[0].count === 2, 'same-sup: count 2')
}

console.log(JSON.stringify({ ok: true, checks }))
