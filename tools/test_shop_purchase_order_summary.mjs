// Shop purchase order summary: totalPurchaseOrders, activePurchaseOrders,
// cancelledPurchaseOrders, invoicedPurchaseOrders, totalQuantityOrdered,
// totalCommittedCostMmk, totalInvoicedMmk, bySupplier sorted desc.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseOrderSummary } from './shop-purchase-order-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/po-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopPurchaseOrderSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1' }

function po({ supplier, sku = 'SKU-A', qty, unitCostMmk = undefined, cancelled = false, invoice = undefined }) {
  seq++
  return {
    id: `PO-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    supplier,
    sku,
    quantityOrdered: qty,
    creation: PROOF,
    ...(unitCostMmk !== undefined ? { unitCostMmk } : {}),
    ...(cancelled ? { cancellation: PROOF } : {}),
    ...(invoice !== undefined ? { supplierInvoice: invoice } : {}),
  }
}

function inv(totalMmk) {
  return {
    id: `INV-${seq}`,
    supplierReference: `INV-REF-${seq}`,
    issuedAt: '2026-08-10T08:00:00.000Z',
    dueAt: '2026-09-10T08:00:00.000Z',
    quantityInvoiced: 10,
    unitCostMmk: totalMmk / 10,
    totalMmk,
    recording: PROOF,
  }
}

function state(purchaseOrders = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(purchaseOrders !== undefined ? { purchaseOrders } : {}),
  }
}

// 1. Empty state (no purchaseOrders field) → all zeros
{
  const r = projectShopPurchaseOrderSummary(state())
  check(r.totalPurchaseOrders === 0, 'empty: totalPurchaseOrders 0')
  check(r.activePurchaseOrders === 0, 'empty: activePurchaseOrders 0')
  check(r.cancelledPurchaseOrders === 0, 'empty: cancelledPurchaseOrders 0')
  check(r.invoicedPurchaseOrders === 0, 'empty: invoicedPurchaseOrders 0')
  check(r.totalQuantityOrdered === 0, 'empty: totalQuantityOrdered 0')
  check(r.totalCommittedCostMmk === 0, 'empty: totalCommittedCostMmk 0')
  check(r.totalInvoicedMmk === 0, 'empty: totalInvoicedMmk 0')
  check(r.bySupplier.length === 0, 'empty: bySupplier empty')
}

// 2. Empty purchaseOrders array → same result
{
  const r = projectShopPurchaseOrderSummary(state([]))
  check(r.totalPurchaseOrders === 0, 'empty-array: totalPurchaseOrders 0')
}

// 3. Single active PO without cost
{
  const r = projectShopPurchaseOrderSummary(state([
    po({ supplier: 'Sup-A', qty: 50 }),
  ]))
  check(r.totalPurchaseOrders === 1, 'single: totalPurchaseOrders 1')
  check(r.activePurchaseOrders === 1, 'single: activePurchaseOrders 1')
  check(r.cancelledPurchaseOrders === 0, 'single: cancelledPurchaseOrders 0')
  check(r.totalQuantityOrdered === 50, 'single: totalQuantityOrdered 50')
  check(r.totalCommittedCostMmk === 0, 'single: no unitCostMmk → committed 0')
  check(r.bySupplier.length === 1, 'single: bySupplier 1 entry')
  check(r.bySupplier[0].supplier === 'Sup-A', 'single: supplier name')
  check(r.bySupplier[0].activePoCount === 1, 'single: activePoCount 1')
}

// 4. Cancelled PO excluded from active/quantity/bySupplier
{
  const r = projectShopPurchaseOrderSummary(state([
    po({ supplier: 'Sup-A', qty: 50, cancelled: true }),
  ]))
  check(r.totalPurchaseOrders === 1, 'cancelled: totalPurchaseOrders 1')
  check(r.activePurchaseOrders === 0, 'cancelled: activePurchaseOrders 0')
  check(r.cancelledPurchaseOrders === 1, 'cancelled: cancelledPurchaseOrders 1')
  check(r.totalQuantityOrdered === 0, 'cancelled: totalQuantityOrdered 0')
  check(r.bySupplier.length === 0, 'cancelled: bySupplier empty (only active POs)')
}

// 5. totalCommittedCostMmk: qty * unitCostMmk for active POs
{
  const r = projectShopPurchaseOrderSummary(state([
    po({ supplier: 'Sup-A', qty: 10, unitCostMmk: 5_000 }),
    po({ supplier: 'Sup-A', qty: 20, unitCostMmk: 3_000 }),
  ]))
  // 10*5000 + 20*3000 = 50,000 + 60,000 = 110,000
  check(r.totalCommittedCostMmk === 110_000, 'committed: 10*5k+20*3k=110k')
}

// 6. PO with no unitCostMmk doesn't affect totalCommittedCostMmk
{
  const r = projectShopPurchaseOrderSummary(state([
    po({ supplier: 'Sup-A', qty: 10, unitCostMmk: 5_000 }),
    po({ supplier: 'Sup-A', qty: 20 }), // no unitCostMmk
  ]))
  check(r.totalCommittedCostMmk === 50_000, 'no-cost: only costed PO contributes')
  check(r.totalQuantityOrdered === 30, 'no-cost: qty of both POs counted')
}

// 7. invoicedPurchaseOrders and totalInvoicedMmk (includes cancelled POs with invoice)
{
  const r = projectShopPurchaseOrderSummary(state([
    po({ supplier: 'Sup-A', qty: 10, invoice: inv(100_000) }),
    po({ supplier: 'Sup-B', qty: 5 }),
  ]))
  check(r.invoicedPurchaseOrders === 1, 'invoice: invoicedPurchaseOrders 1')
  check(r.totalInvoicedMmk === 100_000, 'invoice: totalInvoicedMmk 100000')
}

// 8. Multiple invoices accumulated
{
  const r = projectShopPurchaseOrderSummary(state([
    po({ supplier: 'Sup-A', qty: 10, invoice: inv(100_000) }),
    po({ supplier: 'Sup-B', qty: 20, invoice: inv(200_000) }),
  ]))
  check(r.invoicedPurchaseOrders === 2, 'multi-invoice: invoicedPurchaseOrders 2')
  check(r.totalInvoicedMmk === 300_000, 'multi-invoice: totalInvoicedMmk 300000')
}

// 9. bySupplier sorted by activePoCount desc
{
  const r = projectShopPurchaseOrderSummary(state([
    po({ supplier: 'Sup-A', qty: 10 }),
    po({ supplier: 'Sup-B', qty: 5 }),
    po({ supplier: 'Sup-B', qty: 5 }),
    po({ supplier: 'Sup-B', qty: 5 }),
  ]))
  check(r.bySupplier[0].supplier === 'Sup-B', 'sort: Sup-B first (3 POs)')
  check(r.bySupplier[0].activePoCount === 3, 'sort: Sup-B count 3')
  check(r.bySupplier[1].supplier === 'Sup-A', 'sort: Sup-A second')
}

// 10. Tie-break: same activePoCount → alphabetical supplier
{
  const r = projectShopPurchaseOrderSummary(state([
    po({ supplier: 'Zebra-Corp', qty: 10 }),
    po({ supplier: 'Alpha-Corp', qty: 10 }),
  ]))
  check(r.bySupplier[0].supplier === 'Alpha-Corp', 'tie: Alpha-Corp before Zebra-Corp')
}

// 11. Mixed: active + cancelled + invoiced
{
  const r = projectShopPurchaseOrderSummary(state([
    po({ supplier: 'Sup-A', qty: 100 }),                        // active
    po({ supplier: 'Sup-A', qty: 50, cancelled: true }),        // cancelled
    po({ supplier: 'Sup-B', qty: 30, invoice: inv(150_000) }),  // active+invoiced
  ]))
  check(r.totalPurchaseOrders === 3, 'mixed: totalPurchaseOrders 3')
  check(r.activePurchaseOrders === 2, 'mixed: activePurchaseOrders 2')
  check(r.cancelledPurchaseOrders === 1, 'mixed: cancelledPurchaseOrders 1')
  check(r.invoicedPurchaseOrders === 1, 'mixed: invoicedPurchaseOrders 1')
  check(r.totalQuantityOrdered === 130, 'mixed: 100+30=130 (cancelled excluded)')
}

console.log(JSON.stringify({ ok: true, checks }))
