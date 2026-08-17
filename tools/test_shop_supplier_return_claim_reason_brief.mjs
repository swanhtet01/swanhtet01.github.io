// Shop supplier return claim reason brief: reasonCode enum distribution + claimAmountMmk numeric stats.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierReturnClaimReasonBrief } from './shop-supplier-return-claim-reason-brief.ts'`,
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

const { projectShopSupplierReturnClaimReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'buyer-1', reason: 'Authorized.', evidenceReference: 'EVD-1' }

let claimId = 0
function claim(reasonCode, claimAmountMmk) {
  claimId++
  return {
    id: `RC-${claimId}`,
    createdAt: '2026-08-01T09:00:00Z',
    receiptMovementId: `MOV-${claimId}`,
    quantityRejected: 5,
    reasonCode,
    claimAmountMmk,
    internalReturnReference: `REF-${claimId}`,
    physicalReturnStatus: 'not_dispatched',
    supplierContacted: false,
    accountingPosted: false,
    authorization: PROOF,
    creditNotes: [],
  }
}

let poId = 0
function po(supplierReturns) {
  poId++
  const p = {
    id: `PO-${poId}`,
    createdAt: '2026-08-01T09:00:00Z',
    supplier: 'SUP-1',
    sku: 'SKU-1',
    quantityOrdered: 10,
    creation: PROOF,
  }
  if (supplierReturns !== undefined) p.supplierReturns = supplierReturns
  return p
}

function state(purchaseOrders) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseOrders !== undefined) base.purchaseOrders = purchaseOrders
  return base
}

// 1. No purchase orders → all zeros / nulls
{
  const r = projectShopSupplierReturnClaimReasonBrief(state(undefined))
  check(r.totalClaims === 0, 'empty: totalClaims 0')
  check(r.damagedCount === 0, 'empty: damagedCount 0')
  check(r.wrongItemCount === 0, 'empty: wrongItemCount 0')
  check(r.qualityFailedCount === 0, 'empty: qualityFailedCount 0')
  check(r.damagedRate === 0, 'empty: damagedRate 0')
  check(r.wrongItemRate === 0, 'empty: wrongItemRate 0')
  check(r.qualityFailedRate === 0, 'empty: qualityFailedRate 0')
  check(r.totalClaimAmountMmk === 0, 'empty: totalClaimAmountMmk 0')
  check(r.averageClaimAmountMmk === 0, 'empty: averageClaimAmountMmk 0')
  check(r.minClaimAmountMmk === null, 'empty: minClaimAmountMmk null')
  check(r.maxClaimAmountMmk === null, 'empty: maxClaimAmountMmk null')
}

// 2. Single claim, damaged → damagedCount + rate + amount stats
{
  const r = projectShopSupplierReturnClaimReasonBrief(
    state([po([claim('damaged', 150000)])]),
  )
  check(r.totalClaims === 1, 'single-damaged: totalClaims 1')
  check(r.damagedCount === 1, 'single-damaged: damagedCount 1')
  check(r.damagedRate === 100, 'single-damaged: damagedRate 100')
  check(r.totalClaimAmountMmk === 150000, 'single-damaged: totalClaimAmountMmk 150000')
  check(r.averageClaimAmountMmk === 150000, 'single-damaged: avg 150000')
}

// 3. Enum distribution across multiple claims
{
  const r = projectShopSupplierReturnClaimReasonBrief(
    state([
      po([claim('damaged', 100000), claim('wrong_item', 200000)]),
      po([claim('quality_failed', 150000), claim('damaged', 100000)]),
    ]),
  )
  check(r.totalClaims === 4, 'multi-enum: totalClaims 4')
  check(r.damagedCount === 2, 'multi-enum: damagedCount 2')
  check(r.wrongItemCount === 1, 'multi-enum: wrongItemCount 1')
  check(r.qualityFailedCount === 1, 'multi-enum: qualityFailedCount 1')
  check(r.damagedRate === 50, 'multi-enum: damagedRate 50')
  check(r.wrongItemRate === 25, 'multi-enum: wrongItemRate 25')
}

// 4. ClaimAmountMmk numeric stats
{
  const r = projectShopSupplierReturnClaimReasonBrief(
    state([po([claim('damaged', 50000), claim('wrong_item', 200000), claim('quality_failed', 100000)])]),
  )
  check(r.totalClaimAmountMmk === 350000, 'amount: totalClaimAmountMmk 350000')
  check(r.minClaimAmountMmk === 50000, 'amount: minClaimAmountMmk 50000')
  check(r.maxClaimAmountMmk === 200000, 'amount: maxClaimAmountMmk 200000')
  check(r.averageClaimAmountMmk === 116667, 'amount: avg Math.round(350000/3)')
}

// 5. Math.round: 100000+200001 = 300001 / 2 = 150000.5 → 150001
{
  const r = projectShopSupplierReturnClaimReasonBrief(
    state([po([claim('damaged', 100000), claim('wrong_item', 200001)])]),
  )
  check(r.averageClaimAmountMmk === 150001, 'round: round(150000.5)=150001')
}

console.log(JSON.stringify({ ok: true, checks }))
