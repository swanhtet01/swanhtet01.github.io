// Shop supplier credit note meta brief: supplierReference and issuedAt coverage.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierCreditNoteMetaBrief } from './shop-supplier-credit-note-meta-brief.ts'`,
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

const { projectShopSupplierCreditNoteMetaBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let noteId = 0
function creditNote({ supplierReference = 'REF-001', issuedAt = '2026-08-01T10:00:00Z', amountMmk = 10000 } = {}) {
  noteId++
  return {
    id: `note-${noteId}`,
    supplierReference,
    issuedAt,
    amountMmk,
    accountingPosted: false,
    recording: { actionId: `rec-${noteId}`, capturedAt: '2026-08-01T10:00:00Z', actor: 'staff', reason: 'recorded', evidenceReference: '' },
  }
}

let claimId = 0
function returnClaim(creditNotes = []) {
  claimId++
  return {
    id: `claim-${claimId}`,
    createdAt: '2026-08-01T09:00:00Z',
    receiptMovementId: `mvt-${claimId}`,
    quantityRejected: 2,
    reasonCode: 'damaged',
    claimAmountMmk: 50000,
    internalReturnReference: `REF-${claimId}`,
    physicalReturnStatus: 'not_dispatched',
    supplierContacted: false,
    accountingPosted: false,
    authorization: { actionId: `auth-${claimId}`, capturedAt: '2026-08-01T09:00:00Z', actor: 'staff', reason: 'Auth', evidenceReference: '' },
    creditNotes,
  }
}

let poId = 0
function purchaseOrder(supplierReturns = []) {
  poId++
  return {
    id: `po-${poId}`,
    creation: { actionId: `create-${poId}`, capturedAt: '2026-08-01T08:00:00Z', actor: 'staff', reason: 'Ordered', evidenceReference: '' },
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
  const r = projectShopSupplierCreditNoteMetaBrief(state([]))
  check(r.totalNotes === 0, 'empty: totalNotes 0')
  check(r.totalAmountMmk === 0, 'empty: totalAmountMmk 0')
  check(r.averageAmountMmk === 0, 'empty: avgAmount 0')
  check(r.uniqueSupplierReferences === 0, 'empty: uniqueRefs 0')
  check(r.topSupplierReferencesByCount.length === 0, 'empty: topRefs empty')
  check(r.earliestIssuedAt === null, 'empty: earliest null')
  check(r.latestIssuedAt === null, 'empty: latest null')
}

// 2. PO with no returns → zero
{
  const r = projectShopSupplierCreditNoteMetaBrief(state([purchaseOrder([])]))
  check(r.totalNotes === 0, 'no-returns: totalNotes 0')
}

// 3. Claim with no credit notes → zero
{
  const r = projectShopSupplierCreditNoteMetaBrief(state([purchaseOrder([returnClaim([])])]))
  check(r.totalNotes === 0, 'no-notes: totalNotes 0')
}

// 4. Single credit note
{
  const r = projectShopSupplierCreditNoteMetaBrief(state([
    purchaseOrder([returnClaim([creditNote({ supplierReference: 'SUP-A', issuedAt: '2026-07-10T00:00:00Z', amountMmk: 8000 })])]),
  ]))
  check(r.totalNotes === 1, 'single: totalNotes 1')
  check(r.totalAmountMmk === 8000, 'single: totalAmountMmk 8000')
  check(r.averageAmountMmk === 8000, 'single: avgAmount 8000')
  check(r.uniqueSupplierReferences === 1, 'single: uniqueRefs 1')
  check(r.topSupplierReferencesByCount[0].reference === 'SUP-A', 'single: topRef name')
  check(r.topSupplierReferencesByCount[0].count === 1, 'single: topRef count 1')
  check(r.earliestIssuedAt === '2026-07-10T00:00:00Z', 'single: earliest')
  check(r.latestIssuedAt === '2026-07-10T00:00:00Z', 'single: latest')
}

// 5. Multiple notes: date range + unique refs + avg
{
  const r = projectShopSupplierCreditNoteMetaBrief(state([
    purchaseOrder([returnClaim([
      creditNote({ supplierReference: 'SUP-A', issuedAt: '2026-06-01T00:00:00Z', amountMmk: 4000 }),
      creditNote({ supplierReference: 'SUP-B', issuedAt: '2026-08-15T00:00:00Z', amountMmk: 6000 }),
    ])]),
  ]))
  check(r.totalNotes === 2, 'multi: totalNotes 2')
  check(r.totalAmountMmk === 10000, 'multi: totalAmountMmk 10000')
  check(r.averageAmountMmk === 5000, 'multi: avgAmount 5000')
  check(r.uniqueSupplierReferences === 2, 'multi: uniqueRefs 2')
  check(r.earliestIssuedAt === '2026-06-01T00:00:00Z', 'multi: earliest')
  check(r.latestIssuedAt === '2026-08-15T00:00:00Z', 'multi: latest')
}

// 6. Repeated supplier reference → count accumulates
{
  const r = projectShopSupplierCreditNoteMetaBrief(state([
    purchaseOrder([
      returnClaim([creditNote({ supplierReference: 'SUP-X' })]),
      returnClaim([creditNote({ supplierReference: 'SUP-X' }), creditNote({ supplierReference: 'SUP-Y' })]),
    ]),
  ]))
  check(r.totalNotes === 3, 'repeat-ref: totalNotes 3')
  check(r.uniqueSupplierReferences === 2, 'repeat-ref: uniqueRefs 2')
  const topRef = r.topSupplierReferencesByCount[0]
  check(topRef.reference === 'SUP-X', 'repeat-ref: top ref is SUP-X')
  check(topRef.count === 2, 'repeat-ref: SUP-X count 2')
}

// 7. Rounding: 7/3 → 2 (Math.round)
{
  const r = projectShopSupplierCreditNoteMetaBrief(state([
    purchaseOrder([returnClaim([
      creditNote({ amountMmk: 1 }),
      creditNote({ amountMmk: 2 }),
      creditNote({ amountMmk: 4 }),
    ])]),
  ]))
  check(r.totalNotes === 3, 'rounding: totalNotes 3')
  check(r.totalAmountMmk === 7, 'rounding: totalAmountMmk 7')
  check(r.averageAmountMmk === 2, 'rounding: avgAmount 2 (Math.round(7/3))')
}

console.log(JSON.stringify({ ok: true, checks }))
