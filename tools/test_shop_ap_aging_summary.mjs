// AP aging summary: groups reviewed supplier invoices by days-until/past-due bucket.
// Tests bucket assignment, exclusion rules (cancelled POs, missing invoices, pending review),
// totals, mostOverdueSupplier, and empty/mixed state scenarios.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopApAgingSummary } from './shop-ap-aging-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ap-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopApAgingSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ASOF = '2026-08-11T12:00:00.000Z'
const ASOF_MS = Date.parse(ASOF)
const DAY_MS = 86_400_000

function daysAgo(n) { return new Date(ASOF_MS - n * DAY_MS).toISOString() }
function daysFromNow(n) { return new Date(ASOF_MS + n * DAY_MS).toISOString() }

const PROOF = { actionId: 'ACT-TEST-001', capturedAt: ASOF, actor: 'Test', reason: 'Test', evidenceReference: 'REF-001' }

function makePo({ id = 'PO-001', supplier = 'Supplier A', cancelled = false, invoice = null } = {}) {
  return {
    id,
    createdAt: ASOF,
    supplier,
    sku: 'SKU-001',
    quantityOrdered: 10,
    creation: PROOF,
    ...(cancelled ? { cancellation: PROOF } : {}),
    ...(invoice ? { supplierInvoice: invoice } : {}),
  }
}

function makeInvoice({ dueAt, totalMmk = 50000, reviewed = true } = {}) {
  return {
    id: 'INV-001',
    supplierReference: 'INV-SUP-001',
    issuedAt: ASOF,
    dueAt,
    quantityInvoiced: 10,
    unitCostMmk: totalMmk / 10,
    totalMmk,
    recording: PROOF,
    ...(reviewed ? { payableReview: PROOF } : {}),
  }
}

function makeState(purchaseOrders = []) {
  return { orders: [], purchaseOrders }
}

// 1. Empty state
{
  const r = projectShopApAgingSummary(makeState(), ASOF)
  check(r.asOf === ASOF, 'asOf is passed through')
  check(r.totalInvoices === 0, 'empty state: totalInvoices = 0')
  check(r.pendingReviewInvoices === 0, 'empty state: pendingReviewInvoices = 0')
  check(r.readyInvoices === 0, 'empty state: readyInvoices = 0')
  check(r.overdueInvoices === 0, 'empty state: overdueInvoices = 0')
  check(r.dueWithin7DaysInvoices === 0, 'empty state: dueWithin7DaysInvoices = 0')
  check(r.totalPayableMmk === 0, 'empty state: totalPayableMmk = 0')
  check(r.overduePayableMmk === 0, 'empty state: overduePayableMmk = 0')
  check(r.mostOverdueSupplier === undefined, 'empty state: mostOverdueSupplier undefined')
}

// 2. Cancelled PO excluded
{
  const po = makePo({ cancelled: true, invoice: makeInvoice({ dueAt: daysAgo(5) }) })
  const r = projectShopApAgingSummary(makeState([po]), ASOF)
  check(r.totalInvoices === 0, 'cancelled PO: excluded from totalInvoices')
}

// 3. PO without invoice: no contribution
{
  const po = makePo({ invoice: null })
  const r = projectShopApAgingSummary(makeState([po]), ASOF)
  check(r.totalInvoices === 0, 'PO without invoice excluded')
}

// 4. Invoice without payableReview → pendingReviewInvoices
{
  const po = makePo({ invoice: makeInvoice({ dueAt: daysAgo(5), reviewed: false }) })
  const r = projectShopApAgingSummary(makeState([po]), ASOF)
  check(r.totalInvoices === 1, 'unreviewed invoice counts in totalInvoices')
  check(r.pendingReviewInvoices === 1, 'unreviewed invoice → pendingReviewInvoices = 1')
  check(r.readyInvoices === 0, 'unreviewed invoice not counted in readyInvoices')
  check(r.totalPayableMmk === 0, 'unreviewed invoice not counted in totalPayableMmk')
}

// 5. Overdue invoice (past due date) → 'overdue' bucket
{
  const po = makePo({ invoice: makeInvoice({ dueAt: daysAgo(10), totalMmk: 80000 }), supplier: 'Late Supplier' })
  const r = projectShopApAgingSummary(makeState([po]), ASOF)
  check(r.overdueInvoices === 1, 'overdue invoice: overdueInvoices = 1')
  check(r.byBucket.overdue.invoices === 1, 'overdue invoice in overdue bucket')
  check(r.byBucket.overdue.totalMmk === 80000, 'overdue bucket totalMmk correct')
  check(r.overduePayableMmk === 80000, 'overduePayableMmk = 80000')
  check(r.mostOverdueSupplier === 'Late Supplier', 'mostOverdueSupplier = Late Supplier')
}

// 6. Due within 7 days → 'due_7_days' bucket
{
  const po = makePo({ invoice: makeInvoice({ dueAt: daysFromNow(5), totalMmk: 60000 }) })
  const r = projectShopApAgingSummary(makeState([po]), ASOF)
  check(r.byBucket.due_7_days.invoices === 1, 'due in 5 days → due_7_days bucket')
  check(r.byBucket.due_7_days.totalMmk === 60000, 'due_7_days bucket totalMmk correct')
  check(r.dueWithin7DaysInvoices === 1, 'dueWithin7DaysInvoices = 1')
  check(r.overdueInvoices === 0, 'due_7_days not overdue')
}

// 7. Boundary: exactly 7 days from now → 'due_7_days'
{
  const po = makePo({ invoice: makeInvoice({ dueAt: daysFromNow(7) }) })
  const r = projectShopApAgingSummary(makeState([po]), ASOF)
  check(r.byBucket.due_7_days.invoices === 1, 'due exactly 7 days from now → due_7_days bucket')
}

// 8. Boundary: 8 days from now → 'scheduled'
{
  const po = makePo({ invoice: makeInvoice({ dueAt: daysFromNow(8) }) })
  const r = projectShopApAgingSummary(makeState([po]), ASOF)
  check(r.byBucket.scheduled.invoices === 1, 'due 8 days from now → scheduled bucket')
}

// 9. Scheduled invoice (due in future beyond 7 days)
{
  const po = makePo({ invoice: makeInvoice({ dueAt: daysFromNow(30), totalMmk: 100000 }) })
  const r = projectShopApAgingSummary(makeState([po]), ASOF)
  check(r.byBucket.scheduled.invoices === 1, 'invoice due in 30 days → scheduled bucket')
  check(r.byBucket.scheduled.totalMmk === 100000, 'scheduled bucket totalMmk correct')
}

// 10. Multi-bucket scenario
{
  const pos = [
    { ...makePo({ id: 'PO-001', supplier: 'Overdue Corp', invoice: makeInvoice({ dueAt: daysAgo(15), totalMmk: 120000 }) }), id: 'PO-001' },
    { ...makePo({ id: 'PO-002', supplier: 'Soon Due Ltd', invoice: makeInvoice({ dueAt: daysFromNow(3), totalMmk: 80000 }) }), id: 'PO-002' },
    { ...makePo({ id: 'PO-003', supplier: 'Future Supplier', invoice: makeInvoice({ dueAt: daysFromNow(20), totalMmk: 50000 }) }), id: 'PO-003' },
    { ...makePo({ id: 'PO-004', supplier: 'Pending Supplier', invoice: makeInvoice({ dueAt: daysAgo(5), reviewed: false, totalMmk: 30000 }) }), id: 'PO-004' },
    { ...makePo({ id: 'PO-005', cancelled: true, invoice: makeInvoice({ dueAt: daysAgo(2), totalMmk: 40000 }) }), id: 'PO-005' },
  ]
  const r = projectShopApAgingSummary(makeState(pos), ASOF)
  check(r.totalInvoices === 4, 'multi-bucket: totalInvoices = 4 (3 ready + 1 pending, cancelled excluded)')
  check(r.pendingReviewInvoices === 1, 'multi-bucket: pendingReviewInvoices = 1')
  check(r.readyInvoices === 3, 'multi-bucket: readyInvoices = 3')
  check(r.overdueInvoices === 1, 'multi-bucket: overdueInvoices = 1')
  check(r.dueWithin7DaysInvoices === 1, 'multi-bucket: dueWithin7DaysInvoices = 1')
  check(r.totalPayableMmk === 250000, 'multi-bucket: totalPayableMmk = 250000 (120k+80k+50k ready)')
  check(r.overduePayableMmk === 120000, 'multi-bucket: overduePayableMmk = 120000')
  check(r.byBucket.overdue.invoices === 1, 'multi-bucket: overdue bucket = 1')
  check(r.byBucket.due_7_days.invoices === 1, 'multi-bucket: due_7_days bucket = 1')
  check(r.byBucket.scheduled.invoices === 1, 'multi-bucket: scheduled bucket = 1')
  check(r.mostOverdueSupplier === 'Overdue Corp', 'multi-bucket: mostOverdueSupplier = Overdue Corp')
}

// 11. mostOverdueSupplier: tie on daysPastDue → highest totalMmk wins
{
  const pos = [
    { ...makePo({ id: 'PO-001', supplier: 'Cheaper Supplier', invoice: makeInvoice({ dueAt: daysAgo(10), totalMmk: 30000 }) }), id: 'PO-001' },
    { ...makePo({ id: 'PO-002', supplier: 'Pricier Supplier', invoice: makeInvoice({ dueAt: daysAgo(10), totalMmk: 70000 }) }), id: 'PO-002' },
  ]
  const r = projectShopApAgingSummary(makeState(pos), ASOF)
  check(r.mostOverdueSupplier === 'Pricier Supplier', 'tie on days: higher totalMmk wins for mostOverdueSupplier')
}

// 12. No overdue → mostOverdueSupplier undefined
{
  const po = makePo({ invoice: makeInvoice({ dueAt: daysFromNow(15) }) })
  const r = projectShopApAgingSummary(makeState([po]), ASOF)
  check(r.mostOverdueSupplier === undefined, 'no overdue invoices: mostOverdueSupplier undefined')
}

// 13. purchaseOrders absent (undefined) → treated as empty
{
  const r = projectShopApAgingSummary({ orders: [] }, ASOF)
  check(r.totalInvoices === 0, 'purchaseOrders absent: totalInvoices = 0')
}

console.log(`AP aging summary: ${checks} checks passed`)
