// Shop purchase requisition cost brief: quantityRequested, unitCostMmk, totalMmk numeric stats.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseRequisitionCostBrief } from './shop-purchase-requisition-cost-brief.ts'`,
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

const { projectShopPurchaseRequisitionCostBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'buyer-1', reason: 'Budget req.', evidenceReference: 'EVD-1' }
const DIGEST = 'sha256:' + 'a'.repeat(64)

let reqId = 0
function req(quantityRequested, unitCostMmk) {
  reqId++
  const totalMmk = quantityRequested * unitCostMmk
  return {
    id: `REQ-${reqId}`,
    createdAt: '2026-08-01T09:00:00Z',
    expectedAt: '2026-09-01',
    supplier: 'SUP-1',
    sku: 'SKU-A',
    quantityRequested,
    unitCostMmk,
    totalMmk,
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

// 1. No requisitions (undefined) → all zeros
{
  const r = projectShopPurchaseRequisitionCostBrief(state(undefined))
  check(r.totalRequisitions === 0, 'empty: totalRequisitions 0')
  check(r.totalQuantityRequested === 0, 'empty: totalQuantityRequested 0')
  check(r.averageQuantityRequested === 0, 'empty: averageQuantityRequested 0')
  check(r.totalUnitCostMmk === 0, 'empty: totalUnitCostMmk 0')
  check(r.averageUnitCostMmk === 0, 'empty: averageUnitCostMmk 0')
  check(r.totalRequisitionValueMmk === 0, 'empty: totalRequisitionValueMmk 0')
  check(r.averageRequisitionValueMmk === 0, 'empty: averageRequisitionValueMmk 0')
}

// 2. Single requisition
{
  const r = projectShopPurchaseRequisitionCostBrief(state([req(100, 5000)]))
  check(r.totalRequisitions === 1, 'single: totalRequisitions 1')
  check(r.totalQuantityRequested === 100, 'single: totalQuantityRequested 100')
  check(r.averageQuantityRequested === 100, 'single: averageQuantityRequested 100')
  check(r.totalUnitCostMmk === 5000, 'single: totalUnitCostMmk 5000')
  check(r.averageUnitCostMmk === 5000, 'single: averageUnitCostMmk 5000')
  check(r.totalRequisitionValueMmk === 500000, 'single: totalRequisitionValueMmk 500000')
  check(r.averageRequisitionValueMmk === 500000, 'single: averageRequisitionValueMmk 500000')
}

// 3. Multiple requisitions — accumulation
{
  const r = projectShopPurchaseRequisitionCostBrief(state([req(100, 5000), req(200, 3000)]))
  check(r.totalRequisitions === 2, 'multi: totalRequisitions 2')
  check(r.totalQuantityRequested === 300, 'multi: totalQuantityRequested 300')
  check(r.averageQuantityRequested === 150, 'multi: averageQuantityRequested 150')
  check(r.totalUnitCostMmk === 8000, 'multi: totalUnitCostMmk 8000')
  check(r.averageUnitCostMmk === 4000, 'multi: averageUnitCostMmk 4000')
  check(r.totalRequisitionValueMmk === 1100000, 'multi: totalRequisitionValueMmk 1100000')
  check(r.averageRequisitionValueMmk === 550000, 'multi: averageRequisitionValueMmk 550000')
}

// 4. Math.round: 3 reqs with odd total → round
{
  const r = projectShopPurchaseRequisitionCostBrief(state([req(100, 1000), req(200, 2000), req(100, 1000)]))
  check(r.totalRequisitions === 3, 'round: totalRequisitions 3')
  check(r.averageQuantityRequested === 133, 'round: averageQuantityRequested round(400/3)=133')
}

console.log(JSON.stringify({ ok: true, checks }))
