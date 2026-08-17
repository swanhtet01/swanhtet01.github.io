// Shop purchase order SKU brief: sku distribution across purchase orders.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseOrderSkuBrief } from './shop-purchase-order-sku-brief.ts'`,
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

const { projectShopPurchaseOrderSkuBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-12T09:00:00Z', actor: 'buyer-1', reason: 'Restock.', evidenceReference: 'EVD-1' }

let poId = 0

function po(sku) {
  poId++
  return {
    id: `PO-${poId}`,
    sku,
    supplierId: 'SUP-1',
    quantityOrdered: 10,
    expectedAt: '2026-09-01',
    creation: PROOF,
  }
}

function state(purchaseOrders) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseOrders !== undefined) base.purchaseOrders = purchaseOrders
  return base
}

// 1. No purchase orders → zeros
{
  const r = projectShopPurchaseOrderSkuBrief(state(undefined))
  check(r.totalPurchaseOrders === 0, 'empty: totalPurchaseOrders 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.topSkusByCount.length === 0, 'empty: topSkusByCount empty')
}

// 2. Single PO
{
  const r = projectShopPurchaseOrderSkuBrief(state([po('SKU-A')]))
  check(r.totalPurchaseOrders === 1, 'single: totalPurchaseOrders 1')
  check(r.uniqueSkus === 1, 'single: uniqueSkus 1')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'single: top sku')
  check(r.topSkusByCount[0]?.count === 1, 'single: top sku count 1')
}

// 3. Multiple POs with same SKU
{
  const r = projectShopPurchaseOrderSkuBrief(state([po('SKU-A'), po('SKU-A'), po('SKU-B')]))
  check(r.totalPurchaseOrders === 3, 'shared: totalPurchaseOrders 3')
  check(r.uniqueSkus === 2, 'shared: uniqueSkus 2')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'shared: top sku SKU-A')
  check(r.topSkusByCount[0]?.count === 2, 'shared: top sku count 2')
}

// 4. Top-5 cap: 6 distinct SKUs → capped at 5 with tiebreak
{
  const skus = ['SKU-F', 'SKU-A', 'SKU-C', 'SKU-B', 'SKU-D', 'SKU-E']
  const r = projectShopPurchaseOrderSkuBrief(state(skus.map(s => po(s))))
  check(r.uniqueSkus === 6, 'top5: uniqueSkus 6')
  check(r.topSkusByCount.length === 5, 'top5: capped at 5')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'top5: tiebreak alphabetic SKU-A first')
}

console.log(JSON.stringify({ ok: true, checks }))
