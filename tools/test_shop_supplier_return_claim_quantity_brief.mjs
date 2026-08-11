// Shop supplier return claim quantity brief: quantityRejected stats on return claims.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierReturnClaimQuantityBrief } from './shop-supplier-return-claim-quantity-brief.ts'`,
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

const { projectShopSupplierReturnClaimQuantityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let claimId = 0
function returnClaim({ quantityRejected = 2 } = {}) {
  claimId++
  return {
    id: `claim-${claimId}`,
    createdAt: '2026-08-11T10:00:00Z',
    receiptMovementId: `mvt-${claimId}`,
    quantityRejected,
    reasonCode: 'damaged',
    claimAmountMmk: 10000,
    internalReturnReference: `REF-${claimId}`,
    physicalReturnStatus: 'not_dispatched',
    supplierContacted: false,
    accountingPosted: false,
    authorization: { actionId: `auth-${claimId}`, capturedAt: '2026-08-11T10:00:00Z', actor: 'staff', reason: 'Auth', evidenceReference: '' },
    creditNotes: [],
  }
}

let poId = 0
function purchaseOrder(supplierReturns = []) {
  poId++
  return {
    id: `po-${poId}`,
    creation: { actionId: `create-${poId}`, capturedAt: '2026-08-10T09:00:00Z', actor: 'staff', reason: 'Ordered', evidenceReference: '' },
    ...(supplierReturns.length > 0 && { supplierReturns }),
  }
}

function state(purchaseOrders) {
  return {
    schema: 'supermega.shop.commerce.v1',
    items: [],
    orders: [],
    movements: [],
    closes: [],
    purchaseOrders: purchaseOrders ?? [],
  }
}

// 1. Empty → all zeros / nulls
{
  const r = projectShopSupplierReturnClaimQuantityBrief(state([]))
  check(r.totalClaims === 0, 'empty: totalClaims 0')
  check(r.totalQuantityRejected === 0, 'empty: totalQty 0')
  check(r.averageQuantityRejected === 0, 'empty: avgQty 0')
  check(r.minQuantityRejected === null, 'empty: minQty null')
  check(r.maxQuantityRejected === null, 'empty: maxQty null')
}

// 2. PO with no returns
{
  const r = projectShopSupplierReturnClaimQuantityBrief(state([purchaseOrder([])]))
  check(r.totalClaims === 0, 'no-returns: totalClaims 0')
}

// 3. Single claim
{
  const r = projectShopSupplierReturnClaimQuantityBrief(state([purchaseOrder([returnClaim({ quantityRejected: 5 })])]))
  check(r.totalClaims === 1, 'single: totalClaims 1')
  check(r.totalQuantityRejected === 5, 'single: totalQty 5')
  check(r.averageQuantityRejected === 5, 'single: avgQty 5')
  check(r.minQuantityRejected === 5, 'single: minQty 5')
  check(r.maxQuantityRejected === 5, 'single: maxQty 5')
}

// 4. Two claims: min/max/avg
{
  const r = projectShopSupplierReturnClaimQuantityBrief(state([
    purchaseOrder([
      returnClaim({ quantityRejected: 3 }),
      returnClaim({ quantityRejected: 7 }),
    ]),
  ]))
  check(r.totalClaims === 2, 'two: totalClaims 2')
  check(r.totalQuantityRejected === 10, 'two: totalQty 10')
  check(r.averageQuantityRejected === 5, 'two: avgQty 5')
  check(r.minQuantityRejected === 3, 'two: minQty 3')
  check(r.maxQuantityRejected === 7, 'two: maxQty 7')
}

// 5. Claims across multiple POs
{
  const r = projectShopSupplierReturnClaimQuantityBrief(state([
    purchaseOrder([returnClaim({ quantityRejected: 1 })]),
    purchaseOrder([returnClaim({ quantityRejected: 9 }), returnClaim({ quantityRejected: 5 })]),
  ]))
  check(r.totalClaims === 3, 'multi-po: totalClaims 3')
  check(r.totalQuantityRejected === 15, 'multi-po: totalQty 15')
  check(r.averageQuantityRejected === 5, 'multi-po: avgQty 5')
  check(r.minQuantityRejected === 1, 'multi-po: minQty 1')
  check(r.maxQuantityRejected === 9, 'multi-po: maxQty 9')
}

// 6. Rounding: 10/3 → 3
{
  const r = projectShopSupplierReturnClaimQuantityBrief(state([purchaseOrder([
    returnClaim({ quantityRejected: 2 }),
    returnClaim({ quantityRejected: 4 }),
    returnClaim({ quantityRejected: 4 }),
  ])]))
  check(r.totalClaims === 3, 'rounding: total 3')
  check(r.totalQuantityRejected === 10, 'rounding: totalQty 10')
  check(r.averageQuantityRejected === 3, 'rounding: avgQty 3 (Math.round(10/3))')
}

console.log(JSON.stringify({ ok: true, checks }))
