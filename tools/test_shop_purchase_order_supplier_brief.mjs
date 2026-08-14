// Shop purchase order supplier brief: supplier text distribution across purchase orders.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseOrderSupplierBrief } from './shop-purchase-order-supplier-brief.ts'`,
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

const { projectShopPurchaseOrderSupplierBrief } = await import(
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
function po(supplier) {
  poId++
  return { id: `PO-${poId}`, sku: 'SKU-A', supplier, quantityOrdered: 100, creation: PROOF }
}

function state(purchaseOrders) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseOrders !== undefined) base.purchaseOrders = purchaseOrders
  return base
}

// 1. No POs → zeros
{
  const r = projectShopPurchaseOrderSupplierBrief(state(undefined))
  check(r.totalPurchaseOrders === 0, 'empty: totalPurchaseOrders 0')
  check(r.uniqueSuppliers === 0, 'empty: uniqueSuppliers 0')
  check(r.topSuppliersByCount.length === 0, 'empty: topSuppliersByCount empty')
}

// 2. Single PO
{
  const r = projectShopPurchaseOrderSupplierBrief(state([po('Supplier A')]))
  check(r.totalPurchaseOrders === 1, 'single: totalPurchaseOrders 1')
  check(r.uniqueSuppliers === 1, 'single: uniqueSuppliers 1')
  check(r.topSuppliersByCount[0]?.supplier === 'Supplier A', 'single: top supplier')
  check(r.topSuppliersByCount[0]?.count === 1, 'single: count 1')
}

// 3. Multiple POs, same supplier
{
  const r = projectShopPurchaseOrderSupplierBrief(state([po('Supplier A'), po('Supplier A'), po('Supplier B')]))
  check(r.totalPurchaseOrders === 3, 'shared: totalPurchaseOrders 3')
  check(r.uniqueSuppliers === 2, 'shared: uniqueSuppliers 2')
  check(r.topSuppliersByCount[0]?.supplier === 'Supplier A', 'shared: top supplier')
  check(r.topSuppliersByCount[0]?.count === 2, 'shared: count 2')
}

// 4. Top-5 cap: 6 suppliers → capped with alphabetic tiebreak
{
  const suppliers = ['Sup F', 'Sup A', 'Sup C', 'Sup B', 'Sup D', 'Sup E']
  const r = projectShopPurchaseOrderSupplierBrief(state(suppliers.map(s => po(s))))
  check(r.uniqueSuppliers === 6, 'top5: uniqueSuppliers 6')
  check(r.topSuppliersByCount.length === 5, 'top5: capped at 5')
  check(r.topSuppliersByCount[0]?.supplier === 'Sup A', 'top5: tiebreak alphabetic Sup A first')
}

// 5. Sort order: highest count first
{
  const pos = [po('Sup X'), po('Sup Y'), po('Sup Y'), po('Sup Y')]
  const r = projectShopPurchaseOrderSupplierBrief(state(pos))
  check(r.topSuppliersByCount[0]?.supplier === 'Sup Y', 'sort: Sup Y first')
  check(r.topSuppliersByCount[0]?.count === 3, 'sort: Sup Y count 3')
}

console.log(JSON.stringify({ ok: true, checks }))
