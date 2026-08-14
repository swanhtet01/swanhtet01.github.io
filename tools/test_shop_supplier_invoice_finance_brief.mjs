// Shop supplier invoice finance brief: supplierReference, issuedAt, unitCostMmk, quantityInvoiced.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierInvoiceFinanceBrief } from './shop-supplier-invoice-finance-brief.ts'`,
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

const { projectShopSupplierInvoiceFinanceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', actorId: 'user-1', timestamp: '2026-08-12T08:00:00Z' }

let poSeq = 0
let invSeq = 0

function inv({
  supplierReference = 'INV-REF-1',
  issuedAt = '2026-08-01T00:00:00Z',
  unitCostMmk = 10000,
  quantityInvoiced = 10,
} = {}) {
  invSeq++
  return {
    id: `INV-${invSeq}`,
    supplierReference,
    issuedAt,
    dueAt: '2026-09-01T00:00:00Z',
    quantityInvoiced,
    unitCostMmk,
    totalMmk: unitCostMmk * quantityInvoiced,
    recording: PROOF,
  }
}

function po({ invoice } = {}) {
  poSeq++
  const base = {
    id: `PO-${poSeq}`,
    createdAt: '2026-08-01T00:00:00Z',
    supplier: 'supp-1',
    sku: 'SKU-A',
    quantityOrdered: 10,
    creation: PROOF,
  }
  if (invoice !== undefined) base.supplierInvoice = invoice
  return base
}

function state(purchaseOrders = []) {
  return { schema: SCHEMA, items: [], orders: [], movements: [], closes: [], purchaseOrders }
}

// 1. No purchase orders → zeros/nulls
{
  const r = projectShopSupplierInvoiceFinanceBrief(state([]))
  check(r.totalInvoices === 0, 'empty: totalInvoices 0')
  check(r.uniqueSupplierReferences === 0, 'empty: uniqueSupplierReferences 0')
  check(r.topSupplierReferencesByCount.length === 0, 'empty: topRefs empty')
  check(r.earliestIssuedAt === null, 'empty: earliestIssuedAt null')
  check(r.latestIssuedAt === null, 'empty: latestIssuedAt null')
  check(r.totalQuantityInvoiced === 0, 'empty: totalQuantityInvoiced 0')
  check(r.averageQuantityInvoiced === 0, 'empty: averageQuantityInvoiced 0')
  check(r.minUnitCostMmk === null, 'empty: minUnitCostMmk null')
  check(r.maxUnitCostMmk === null, 'empty: maxUnitCostMmk null')
  check(r.averageUnitCostMmk === 0, 'empty: averageUnitCostMmk 0')
}

// 2. PO without invoice → zero
{
  const r = projectShopSupplierInvoiceFinanceBrief(state([po()]))
  check(r.totalInvoices === 0, 'no-invoice: totalInvoices 0')
  check(r.minUnitCostMmk === null, 'no-invoice: minUnitCostMmk null')
}

// 3. Single invoice
{
  const r = projectShopSupplierInvoiceFinanceBrief(state([
    po({ invoice: inv({ supplierReference: 'SUP-INV-001', issuedAt: '2026-03-01T00:00:00Z', unitCostMmk: 5000, quantityInvoiced: 20 }) }),
  ]))
  check(r.totalInvoices === 1, 'single: totalInvoices 1')
  check(r.uniqueSupplierReferences === 1, 'single: uniqueSupplierReferences 1')
  check(r.topSupplierReferencesByCount[0].reference === 'SUP-INV-001', 'single: top ref')
  check(r.earliestIssuedAt === '2026-03-01T00:00:00Z', 'single: earliestIssuedAt')
  check(r.latestIssuedAt === '2026-03-01T00:00:00Z', 'single: latestIssuedAt')
  check(r.totalQuantityInvoiced === 20, 'single: totalQuantityInvoiced 20')
  check(r.averageQuantityInvoiced === 20, 'single: averageQuantityInvoiced 20')
  check(r.minUnitCostMmk === 5000, 'single: minUnitCostMmk 5000')
  check(r.maxUnitCostMmk === 5000, 'single: maxUnitCostMmk 5000')
  check(r.averageUnitCostMmk === 5000, 'single: averageUnitCostMmk 5000')
}

// 4. Multiple invoices: date range, cost min/max, quantity totals
{
  const r = projectShopSupplierInvoiceFinanceBrief(state([
    po({ invoice: inv({ supplierReference: 'REF-A', issuedAt: '2026-01-01T00:00:00Z', unitCostMmk: 2000, quantityInvoiced: 5 }) }),
    po({ invoice: inv({ supplierReference: 'REF-B', issuedAt: '2026-06-15T00:00:00Z', unitCostMmk: 8000, quantityInvoiced: 15 }) }),
    po({ invoice: inv({ supplierReference: 'REF-A', issuedAt: '2026-03-20T00:00:00Z', unitCostMmk: 4000, quantityInvoiced: 10 }) }),
    po(),
  ]))
  check(r.totalInvoices === 3, 'multi: totalInvoices 3')
  check(r.uniqueSupplierReferences === 2, 'multi: uniqueSupplierReferences 2')
  check(r.topSupplierReferencesByCount[0].reference === 'REF-A', 'multi: REF-A first')
  check(r.topSupplierReferencesByCount[0].count === 2, 'multi: REF-A count 2')
  check(r.earliestIssuedAt === '2026-01-01T00:00:00Z', 'multi: earliestIssuedAt')
  check(r.latestIssuedAt === '2026-06-15T00:00:00Z', 'multi: latestIssuedAt')
  check(r.totalQuantityInvoiced === 30, 'multi: totalQuantityInvoiced 30')
  check(r.averageQuantityInvoiced === 10, 'multi: averageQuantityInvoiced 10')
  check(r.minUnitCostMmk === 2000, 'multi: minUnitCostMmk 2000')
  check(r.maxUnitCostMmk === 8000, 'multi: maxUnitCostMmk 8000')
  check(r.averageUnitCostMmk === 4667, 'multi: averageUnitCostMmk 4667 (14000/3)')
}

// 5. Rounding: averageQuantityInvoiced rounds
{
  const r = projectShopSupplierInvoiceFinanceBrief(state([
    po({ invoice: inv({ quantityInvoiced: 1 }) }),
    po({ invoice: inv({ quantityInvoiced: 1 }) }),
    po({ invoice: inv({ quantityInvoiced: 2 }) }),
  ]))
  check(r.totalQuantityInvoiced === 4, 'rounding: totalQuantityInvoiced 4')
  check(r.averageQuantityInvoiced === 1, 'rounding: averageQuantityInvoiced 1 (4/3 rounds to 1)')
}

console.log(JSON.stringify({ ok: true, checks }))
