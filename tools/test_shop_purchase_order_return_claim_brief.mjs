// Shop purchase order return claim brief: supplier return claim analytics on POs.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseOrderReturnClaimBrief } from './shop-purchase-order-return-claim-brief.ts'`,
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

const { projectShopPurchaseOrderReturnClaimBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let claimId = 0
function returnClaim({ reasonCode, claimAmountMmk, creditNotes = [] } = {}) {
  claimId++
  return {
    id: `claim-${claimId}`,
    createdAt: '2026-08-11T10:00:00Z',
    receiptMovementId: `mvt-${claimId}`,
    quantityRejected: 2,
    reasonCode: reasonCode ?? 'damaged',
    claimAmountMmk: claimAmountMmk ?? 10000,
    internalReturnReference: `REF-${claimId}`,
    physicalReturnStatus: 'not_dispatched',
    supplierContacted: false,
    accountingPosted: false,
    authorization: { actionId: `auth-${claimId}`, capturedAt: '2026-08-11T10:00:00Z', actor: 'staff', reason: 'Authorized', evidenceReference: '' },
    creditNotes,
  }
}

function creditNote(amountMmk) {
  claimId++
  return {
    id: `cn-${claimId}`,
    supplierReference: `SUP-CN-${claimId}`,
    issuedAt: '2026-08-11T14:00:00Z',
    amountMmk,
    recording: { actionId: `rec-${claimId}`, capturedAt: '2026-08-11T14:00:00Z', actor: 'staff', reason: 'Recorded', evidenceReference: '' },
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

function state(purchaseOrders = []) {
  return {
    schema: 'supermega.shop.commerce.v1',
    items: [],
    orders: [],
    movements: [],
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
    purchaseOrders,
  }
}

// 1. Empty → all zeros
{
  const r = projectShopPurchaseOrderReturnClaimBrief(state([]))
  check(r.totalClaims === 0, 'empty: totalClaims 0')
  check(r.ordersWithReturnClaims === 0, 'empty: ordersWithReturnClaims 0')
  check(r.totalClaimAmountMmk === 0, 'empty: totalClaimAmountMmk 0')
  check(r.byStatus.awaitingCredit === 0, 'empty: awaitingCredit 0')
  check(r.byStatus.partiallyCredited === 0, 'empty: partiallyCredited 0')
  check(r.byStatus.credited === 0, 'empty: credited 0')
  check(r.byReasonCode.damaged === 0, 'empty: damaged 0')
  check(r.byReasonCode.wrongItem === 0, 'empty: wrongItem 0')
  check(r.byReasonCode.qualityFailed === 0, 'empty: qualityFailed 0')
  check(r.totalCreditedMmk === 0, 'empty: totalCreditedMmk 0')
  check(r.pendingClaimAmountMmk === 0, 'empty: pendingClaimAmountMmk 0')
}

// 2. PO with no supplier returns
{
  const r = projectShopPurchaseOrderReturnClaimBrief(state([purchaseOrder([])]))
  check(r.totalClaims === 0, 'no-returns: totalClaims 0')
  check(r.ordersWithReturnClaims === 0, 'no-returns: ordersWithReturnClaims 0')
}

// 3. awaiting_credit — no credit notes
{
  const r = projectShopPurchaseOrderReturnClaimBrief(state([
    purchaseOrder([returnClaim({ claimAmountMmk: 10000 })]),
  ]))
  check(r.totalClaims === 1, 'awaiting: totalClaims 1')
  check(r.byStatus.awaitingCredit === 1, 'awaiting: awaitingCredit 1')
  check(r.byStatus.credited === 0, 'awaiting: credited 0')
  check(r.totalClaimAmountMmk === 10000, 'awaiting: totalClaimAmountMmk 10000')
  check(r.totalCreditedMmk === 0, 'awaiting: totalCreditedMmk 0')
  check(r.pendingClaimAmountMmk === 10000, 'awaiting: pendingClaimAmountMmk 10000')
  check(r.ordersWithReturnClaims === 1, 'awaiting: ordersWithReturnClaims 1')
}

// 4. credited — fully covered by credit notes
{
  const r = projectShopPurchaseOrderReturnClaimBrief(state([
    purchaseOrder([returnClaim({ claimAmountMmk: 10000, creditNotes: [creditNote(10000)] })]),
  ]))
  check(r.byStatus.credited === 1, 'credited: credited 1')
  check(r.byStatus.awaitingCredit === 0, 'credited: awaitingCredit 0')
  check(r.totalCreditedMmk === 10000, 'credited: totalCreditedMmk 10000')
  check(r.pendingClaimAmountMmk === 0, 'credited: pendingClaimAmountMmk 0')
}

// 5. partially_credited — partial credit notes
{
  const r = projectShopPurchaseOrderReturnClaimBrief(state([
    purchaseOrder([returnClaim({ claimAmountMmk: 10000, creditNotes: [creditNote(6000)] })]),
  ]))
  check(r.byStatus.partiallyCredited === 1, 'partial: partiallyCredited 1')
  check(r.totalCreditedMmk === 6000, 'partial: totalCreditedMmk 6000')
  check(r.pendingClaimAmountMmk === 4000, 'partial: pendingClaimAmountMmk 4000')
}

// 6. reasonCode: damaged
{
  const r = projectShopPurchaseOrderReturnClaimBrief(state([
    purchaseOrder([returnClaim({ reasonCode: 'damaged' })]),
  ]))
  check(r.byReasonCode.damaged === 1, 'damaged: damaged 1')
  check(r.byReasonCode.wrongItem === 0, 'damaged: wrongItem 0')
}

// 7. reasonCode: wrong_item
{
  const r = projectShopPurchaseOrderReturnClaimBrief(state([
    purchaseOrder([returnClaim({ reasonCode: 'wrong_item' })]),
  ]))
  check(r.byReasonCode.wrongItem === 1, 'wrong-item: wrongItem 1')
}

// 8. reasonCode: quality_failed
{
  const r = projectShopPurchaseOrderReturnClaimBrief(state([
    purchaseOrder([returnClaim({ reasonCode: 'quality_failed' })]),
  ]))
  check(r.byReasonCode.qualityFailed === 1, 'quality-failed: qualityFailed 1')
}

// 9. Two claims on one PO → ordersWithReturnClaims = 1
{
  const r = projectShopPurchaseOrderReturnClaimBrief(state([
    purchaseOrder([returnClaim({ reasonCode: 'damaged' }), returnClaim({ reasonCode: 'wrong_item' })]),
  ]))
  check(r.totalClaims === 2, 'two-claims-one-po: totalClaims 2')
  check(r.ordersWithReturnClaims === 1, 'two-claims-one-po: ordersWithReturnClaims 1 (same PO)')
  check(r.byReasonCode.damaged === 1, 'two-claims-one-po: damaged 1')
  check(r.byReasonCode.wrongItem === 1, 'two-claims-one-po: wrongItem 1')
}

// 10. Claims across multiple POs → ordersWithReturnClaims counts distinct POs
{
  const r = projectShopPurchaseOrderReturnClaimBrief(state([
    purchaseOrder([returnClaim({ claimAmountMmk: 5000 })]),
    purchaseOrder([returnClaim({ claimAmountMmk: 3000 })]),
    purchaseOrder([]),
  ]))
  check(r.totalClaims === 2, 'multi-po: totalClaims 2')
  check(r.ordersWithReturnClaims === 2, 'multi-po: ordersWithReturnClaims 2')
  check(r.totalClaimAmountMmk === 8000, 'multi-po: totalClaimAmountMmk 8000')
}

// 11. pendingClaimAmountMmk = sum of uncredited amounts across mixed status
{
  const r = projectShopPurchaseOrderReturnClaimBrief(state([
    purchaseOrder([
      returnClaim({ claimAmountMmk: 10000 }),                        // awaiting, pending = 10000
      returnClaim({ claimAmountMmk: 8000, creditNotes: [creditNote(8000)] }),  // credited, pending = 0
      returnClaim({ claimAmountMmk: 6000, creditNotes: [creditNote(2000)] }),  // partial, pending = 4000
    ]),
  ]))
  check(r.byStatus.awaitingCredit === 1, 'mixed-status: awaitingCredit 1')
  check(r.byStatus.credited === 1, 'mixed-status: credited 1')
  check(r.byStatus.partiallyCredited === 1, 'mixed-status: partiallyCredited 1')
  check(r.totalClaimAmountMmk === 24000, 'mixed-status: totalClaimAmountMmk 24000')
  check(r.totalCreditedMmk === 10000, 'mixed-status: totalCreditedMmk 10000')
  check(r.pendingClaimAmountMmk === 14000, 'mixed-status: pendingClaimAmountMmk 14000')
}

console.log(JSON.stringify({ ok: true, checks }))
