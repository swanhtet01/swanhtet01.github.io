// Shop purchase order quantity brief: quantityOrdered and unitCostMmk numeric stats.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseOrderQuantityBrief } from './shop-purchase-order-quantity-brief.ts'`,
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

const { projectShopPurchaseOrderQuantityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'buyer-1', reason: 'Restock.', evidenceReference: 'EVD-1' }

let poId = 0
function po(quantityOrdered, unitCostMmk) {
  poId++
  const p = { id: `PO-${poId}`, sku: 'SKU-A', supplier: 'SUP-1', quantityOrdered, creation: PROOF }
  if (unitCostMmk !== undefined) p.unitCostMmk = unitCostMmk
  return p
}

function state(purchaseOrders) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseOrders !== undefined) base.purchaseOrders = purchaseOrders
  return base
}

// 1. No POs (undefined) → all zeros, min/max null
{
  const r = projectShopPurchaseOrderQuantityBrief(state(undefined))
  check(r.totalPurchaseOrders === 0, 'empty: totalPurchaseOrders 0')
  check(r.totalQuantityOrdered === 0, 'empty: totalQuantityOrdered 0')
  check(r.averageQuantityOrdered === 0, 'empty: averageQuantityOrdered 0')
  check(r.minQuantityOrdered === null, 'empty: minQuantityOrdered null')
  check(r.maxQuantityOrdered === null, 'empty: maxQuantityOrdered null')
  check(r.ordersWithUnitCost === 0, 'empty: ordersWithUnitCost 0')
  check(r.totalUnitCostMmk === 0, 'empty: totalUnitCostMmk 0')
  check(r.averageUnitCostMmk === 0, 'empty: averageUnitCostMmk 0')
}

// 2. Single PO, no unit cost
{
  const r = projectShopPurchaseOrderQuantityBrief(state([po(100)]))
  check(r.totalPurchaseOrders === 1, 'single-no-cost: totalPurchaseOrders 1')
  check(r.totalQuantityOrdered === 100, 'single-no-cost: totalQuantityOrdered 100')
  check(r.averageQuantityOrdered === 100, 'single-no-cost: averageQuantityOrdered 100')
  check(r.minQuantityOrdered === 100, 'single-no-cost: minQuantityOrdered 100')
  check(r.maxQuantityOrdered === 100, 'single-no-cost: maxQuantityOrdered 100')
  check(r.ordersWithUnitCost === 0, 'single-no-cost: ordersWithUnitCost 0')
  check(r.averageUnitCostMmk === 0, 'single-no-cost: averageUnitCostMmk 0')
}

// 3. Single PO with unit cost
{
  const r = projectShopPurchaseOrderQuantityBrief(state([po(50, 5000)]))
  check(r.ordersWithUnitCost === 1, 'with-cost: ordersWithUnitCost 1')
  check(r.totalUnitCostMmk === 5000, 'with-cost: totalUnitCostMmk 5000')
  check(r.averageUnitCostMmk === 5000, 'with-cost: averageUnitCostMmk 5000')
}

// 4. Multiple POs, mixed unit cost
{
  const r = projectShopPurchaseOrderQuantityBrief(state([po(100, 3000), po(200), po(50, 7000)]))
  check(r.totalPurchaseOrders === 3, 'mixed: totalPurchaseOrders 3')
  check(r.totalQuantityOrdered === 350, 'mixed: totalQuantityOrdered 350')
  check(r.ordersWithUnitCost === 2, 'mixed: ordersWithUnitCost 2')
  check(r.totalUnitCostMmk === 10000, 'mixed: totalUnitCostMmk 10000')
  check(r.averageUnitCostMmk === 5000, 'mixed: averageUnitCostMmk 5000')
}

// 5. Min/max tracking
{
  const r = projectShopPurchaseOrderQuantityBrief(state([po(10), po(500), po(100)]))
  check(r.minQuantityOrdered === 10, 'minmax: minQuantityOrdered 10')
  check(r.maxQuantityOrdered === 500, 'minmax: maxQuantityOrdered 500')
}

// 6. Math.round average: 100+200 = 300 / 2 = 150
{
  const r = projectShopPurchaseOrderQuantityBrief(state([po(100), po(200)]))
  check(r.averageQuantityOrdered === 150, 'avg: averageQuantityOrdered 150')
}

// 7. Math.round with fractional: 100+201 = 301 / 2 = 150.5 → 151
{
  const r = projectShopPurchaseOrderQuantityBrief(state([po(100), po(201)]))
  check(r.averageQuantityOrdered === 151, 'round: averageQuantityOrdered round(150.5)=151')
}

console.log(JSON.stringify({ ok: true, checks }))
