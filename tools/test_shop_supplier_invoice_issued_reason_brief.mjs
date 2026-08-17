// Supplier invoice issued/reason brief: issuedAt date range + recording.reason text distribution across PO supplier invoices.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSupplierInvoiceIssuedReasonBrief } from './shop-supplier-invoice-issued-reason-brief.ts'`,
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

const { projectShopSupplierInvoiceIssuedReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function proof(actor, reason) {
  return { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor, reason, evidenceReference: 'EVD-1' }
}

let invId = 0
function inv(issuedAt, reason) {
  invId++
  return {
    id: `INV-${invId}`,
    supplierReference: `SUP-REF-${invId}`,
    issuedAt,
    dueAt: '2026-09-01',
    quantityInvoiced: 100,
    unitCostMmk: 5000,
    totalMmk: 500000,
    recording: proof('accountant-1', reason),
  }
}

let poId = 0
function po(supplierInvoice) {
  poId++
  const obj = {
    id: `PO-${poId}`,
    createdAt: '2026-08-01T09:00:00Z',
    supplier: 'SUP-1',
    sku: 'SKU-1',
    quantityOrdered: 100,
    unitCostMmk: 5000,
    totalMmk: 500000,
    creation: proof('mgr-1', 'Created PO.'),
  }
  if (supplierInvoice !== undefined) obj.supplierInvoice = supplierInvoice
  return obj
}

function state(purchaseOrders) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseOrders !== undefined) base.purchaseOrders = purchaseOrders
  return base
}

// 1. No purchase orders → all zeros / nulls
{
  const r = projectShopSupplierInvoiceIssuedReasonBrief(state(undefined))
  check(r.totalInvoices === 0, 'empty: totalInvoices 0')
  check(r.earliestIssuedAt === null, 'empty: earliestIssuedAt null')
  check(r.latestIssuedAt === null, 'empty: latestIssuedAt null')
  check(r.uniqueRecordingReasons === 0, 'empty: uniqueRecordingReasons 0')
  check(r.topRecordingReasonsByCount.length === 0, 'empty: topRecordingReasonsByCount empty')
}

// 2. PO with no supplier invoice → skipped
{
  const r = projectShopSupplierInvoiceIssuedReasonBrief(state([po(undefined)]))
  check(r.totalInvoices === 0, 'no-invoice: totalInvoices 0')
}

// 3. Single invoice → all fields populated
{
  const r = projectShopSupplierInvoiceIssuedReasonBrief(
    state([po(inv('2026-08-05', 'Invoice matched to PO.'))]),
  )
  check(r.totalInvoices === 1, 'single: totalInvoices 1')
  check(r.earliestIssuedAt === '2026-08-05', 'single: earliestIssuedAt')
  check(r.latestIssuedAt === '2026-08-05', 'single: latestIssuedAt')
  check(r.uniqueRecordingReasons === 1, 'single: uniqueRecordingReasons 1')
  check(r.topRecordingReasonsByCount[0]?.reason === 'Invoice matched to PO.', 'single: top reason')
}

// 4. Date ordering
{
  const r = projectShopSupplierInvoiceIssuedReasonBrief(
    state([
      po(inv('2026-08-10', 'Matched.')),
      po(inv('2026-08-01', 'Matched.')),
      po(inv('2026-08-05', 'Matched.')),
    ]),
  )
  check(r.earliestIssuedAt === '2026-08-01', 'dates: earliestIssuedAt')
  check(r.latestIssuedAt === '2026-08-10', 'dates: latestIssuedAt')
}

// 5. Multiple reasons → distribution
{
  const r = projectShopSupplierInvoiceIssuedReasonBrief(
    state([
      po(inv('2026-08-01', 'Matched.')),
      po(inv('2026-08-02', 'Matched.')),
      po(inv('2026-08-03', 'Partial delivery.')),
    ]),
  )
  check(r.uniqueRecordingReasons === 2, 'multi-reason: uniqueRecordingReasons 2')
  check(r.topRecordingReasonsByCount[0]?.reason === 'Matched.', 'multi-reason: top Matched.')
  check(r.topRecordingReasonsByCount[0]?.count === 2, 'multi-reason: top count 2')
}

// 6. Top-5 cap + tiebreak
{
  const reasons = ['Z-reason', 'A-reason', 'C-reason', 'B-reason', 'D-reason', 'E-reason']
  const r = projectShopSupplierInvoiceIssuedReasonBrief(
    state(reasons.map(reason => po(inv('2026-08-01', reason)))),
  )
  check(r.topRecordingReasonsByCount.length === 5, 'top5: capped at 5')
  check(r.topRecordingReasonsByCount[0]?.reason === 'A-reason', 'top5: tiebreak A-reason first')
}

console.log(JSON.stringify({ ok: true, checks }))
