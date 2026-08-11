// Shop purchase requisition SKU brief: sku text distribution across requisitions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseRequisitionSkuBrief } from './shop-purchase-requisition-sku-brief.ts'`,
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

const { projectShopPurchaseRequisitionSkuBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'buyer-1', reason: 'Restock.', evidenceReference: 'EVD-1' }
const DIGEST = 'sha256:' + 'a'.repeat(64)

let reqId = 0
function req(sku) {
  reqId++
  return {
    id: `REQ-${reqId}`,
    createdAt: '2026-08-01T09:00:00Z',
    expectedAt: '2026-09-01',
    supplier: 'SUP-1',
    sku,
    quantityRequested: 100,
    unitCostMmk: 5000,
    totalMmk: 500000,
    sourceDecisionDigest: DIGEST,
    sourceReplenishmentDigest: DIGEST,
    approval: PROOF,
  }
}

function state(purchaseRequisitions) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseRequisitions !== undefined) base.purchaseRequisitions = purchaseRequisitions
  return base
}

// 1. No requisitions → zeros
{
  const r = projectShopPurchaseRequisitionSkuBrief(state(undefined))
  check(r.totalRequisitions === 0, 'empty: totalRequisitions 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.topSkusByCount.length === 0, 'empty: topSkusByCount empty')
}

// 2. Single requisition
{
  const r = projectShopPurchaseRequisitionSkuBrief(state([req('SKU-A')]))
  check(r.totalRequisitions === 1, 'single: totalRequisitions 1')
  check(r.uniqueSkus === 1, 'single: uniqueSkus 1')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'single: top sku')
  check(r.topSkusByCount[0]?.count === 1, 'single: count 1')
}

// 3. Multiple requisitions, same SKU
{
  const r = projectShopPurchaseRequisitionSkuBrief(state([req('SKU-A'), req('SKU-A'), req('SKU-B')]))
  check(r.totalRequisitions === 3, 'shared: totalRequisitions 3')
  check(r.uniqueSkus === 2, 'shared: uniqueSkus 2')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'shared: top sku SKU-A')
  check(r.topSkusByCount[0]?.count === 2, 'shared: count 2')
}

// 4. Top-5 cap
{
  const skus = ['SKU-F', 'SKU-A', 'SKU-C', 'SKU-B', 'SKU-D', 'SKU-E']
  const r = projectShopPurchaseRequisitionSkuBrief(state(skus.map(s => req(s))))
  check(r.topSkusByCount.length === 5, 'top5: capped at 5')
  check(r.topSkusByCount[0]?.sku === 'SKU-A', 'top5: tiebreak SKU-A first')
}

console.log(JSON.stringify({ ok: true, checks }))
