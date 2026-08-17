// Shop supplier invoice total brief: totalMmk numeric stats + payableReview presence across invoiced purchase orders.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierInvoiceTotalBrief } from './shop-supplier-invoice-total-brief.ts'`,
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

const { projectShopSupplierInvoiceTotalBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'buyer-1', reason: 'Verified.', evidenceReference: 'EVD-1' }
const DIGEST = 'sha256:' + 'a'.repeat(64)

let poId = 0
function po(totalMmk, { withPayableReview = false } = {}) {
  poId++
  const inv = {
    id: `INV-${poId}`,
    supplierReference: `SREF-${poId}`,
    issuedAt: '2026-08-01',
    dueAt: '2026-09-01',
    quantityInvoiced: 10,
    unitCostMmk: totalMmk / 10,
    totalMmk,
    recording: PROOF,
  }
  if (withPayableReview) inv.payableReview = PROOF
  return {
    id: `PO-${poId}`,
    createdAt: '2026-08-01T08:00:00Z',
    expectedAt: '2026-09-01',
    supplier: 'SUP-1',
    sku: 'SKU-1',
    quantityOrdered: 10,
    approval: PROOF,
    receiving: PROOF,
    sourceRequisitionDigest: DIGEST,
    supplierInvoice: inv,
  }
}

function poNoInvoice() {
  poId++
  return {
    id: `PO-${poId}`,
    createdAt: '2026-08-01T08:00:00Z',
    expectedAt: '2026-09-01',
    supplier: 'SUP-1',
    sku: 'SKU-1',
    quantityOrdered: 10,
    approval: PROOF,
    receiving: PROOF,
    sourceRequisitionDigest: DIGEST,
  }
}

function state(purchaseOrders) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseOrders !== undefined) base.purchaseOrders = purchaseOrders
  return base
}

// 1. No purchase orders → all zeros / nulls
{
  const r = projectShopSupplierInvoiceTotalBrief(state(undefined))
  check(r.totalInvoices === 0, 'empty: totalInvoices 0')
  check(r.totalInvoiceValueMmk === 0, 'empty: totalInvoiceValueMmk 0')
  check(r.averageInvoiceValueMmk === 0, 'empty: averageInvoiceValueMmk 0')
  check(r.minInvoiceValueMmk === null, 'empty: minInvoiceValueMmk null')
  check(r.maxInvoiceValueMmk === null, 'empty: maxInvoiceValueMmk null')
  check(r.invoicesWithPayableReview === 0, 'empty: invoicesWithPayableReview 0')
  check(r.payableReviewRate === 0, 'empty: payableReviewRate 0')
}

// 2. POs without supplier invoices → not counted
{
  const r = projectShopSupplierInvoiceTotalBrief(state([poNoInvoice(), poNoInvoice()]))
  check(r.totalInvoices === 0, 'no-inv: totalInvoices 0')
  check(r.invoicesWithPayableReview === 0, 'no-inv: invoicesWithPayableReview 0')
}

// 3. Single invoice, no payableReview
{
  const r = projectShopSupplierInvoiceTotalBrief(state([po(500000)]))
  check(r.totalInvoices === 1, 'single: totalInvoices 1')
  check(r.totalInvoiceValueMmk === 500000, 'single: totalInvoiceValueMmk 500000')
  check(r.averageInvoiceValueMmk === 500000, 'single: averageInvoiceValueMmk 500000')
  check(r.minInvoiceValueMmk === 500000, 'single: minInvoiceValueMmk 500000')
  check(r.maxInvoiceValueMmk === 500000, 'single: maxInvoiceValueMmk 500000')
  check(r.invoicesWithPayableReview === 0, 'single: invoicesWithPayableReview 0')
  check(r.payableReviewRate === 0, 'single: payableReviewRate 0')
}

// 4. Invoice with payableReview → presence counted
{
  const r = projectShopSupplierInvoiceTotalBrief(state([po(300000, { withPayableReview: true })]))
  check(r.invoicesWithPayableReview === 1, 'payable-review: invoicesWithPayableReview 1')
  check(r.payableReviewRate === 100, 'payable-review: payableReviewRate 100')
}

// 5. Multiple invoices → sum, avg, min, max
{
  const r = projectShopSupplierInvoiceTotalBrief(state([po(100000), po(300000), po(200000)]))
  check(r.totalInvoices === 3, 'multi: totalInvoices 3')
  check(r.totalInvoiceValueMmk === 600000, 'multi: totalInvoiceValueMmk 600000')
  check(r.averageInvoiceValueMmk === 200000, 'multi: averageInvoiceValueMmk 200000')
  check(r.minInvoiceValueMmk === 100000, 'multi: minInvoiceValueMmk 100000')
  check(r.maxInvoiceValueMmk === 300000, 'multi: maxInvoiceValueMmk 300000')
}

// 6. Math.round: 100000+201000 = 301000 / 2 = 150500 → 150500 (exact)
{
  const r = projectShopSupplierInvoiceTotalBrief(state([po(100000), po(201000)]))
  check(r.averageInvoiceValueMmk === 150500, 'round: avg 150500 exact')
}

// 7. payableReviewRate: 1 of 2 → 50
{
  const r = projectShopSupplierInvoiceTotalBrief(
    state([po(100000, { withPayableReview: true }), po(200000)]),
  )
  check(r.invoicesWithPayableReview === 1, 'rate50: invoicesWithPayableReview 1')
  check(r.payableReviewRate === 50, 'rate50: payableReviewRate 50')
}

console.log(JSON.stringify({ ok: true, checks }))
