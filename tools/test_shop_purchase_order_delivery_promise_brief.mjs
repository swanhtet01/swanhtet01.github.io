// Shop purchase order delivery promise brief: expectedAt coverage and open-order risk.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseOrderDeliveryPromiseBrief } from './shop-purchase-order-delivery-promise-brief.ts'`,
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

const { projectShopPurchaseOrderDeliveryPromiseBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let poId = 0
function po({ expectedAt, withInvoice = false, withCancellation = false } = {}) {
  poId++
  return {
    id: `po-${poId}`,
    createdAt: '2026-08-01T08:00:00Z',
    ...(expectedAt !== undefined && { expectedAt }),
    supplier: 'Supplier A',
    sku: 'SKU-001',
    quantityOrdered: 10,
    unitCostMmk: 5000,
    creation: { actor: 'buyer-01', at: '2026-08-01T08:00:00Z', proofKind: 'manual' },
    ...(withInvoice && {
      supplierInvoice: {
        invoiceReference: `INV-${poId}`,
        invoiceDate: '2026-08-10T00:00:00Z',
        totalMmk: 50000,
        paymentStatus: 'unpaid',
      },
    }),
    ...(withCancellation && {
      cancellation: { actor: 'buyer-01', at: '2026-08-05T08:00:00Z', proofKind: 'manual' },
    }),
  }
}

function state(purchaseOrders) {
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
    purchaseOrders: purchaseOrders ?? [],
  }
}

// 1. Empty → all zeros
{
  const r = projectShopPurchaseOrderDeliveryPromiseBrief(state([]))
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.ordersWithDeliveryPromise === 0, 'empty: ordersWithDeliveryPromise 0')
  check(r.ordersWithoutDeliveryPromise === 0, 'empty: ordersWithoutDeliveryPromise 0')
  check(r.deliveryPromiseCoverage === 0, 'empty: deliveryPromiseCoverage 0')
  check(r.openOrdersWithDeliveryPromise === 0, 'empty: openOrdersWithDeliveryPromise 0')
  check(r.openOrdersWithoutDeliveryPromise === 0, 'empty: openOrdersWithoutDeliveryPromise 0')
}

// 2. Open PO with no expectedAt (risk: no delivery promise)
{
  const r = projectShopPurchaseOrderDeliveryPromiseBrief(state([po()]))
  check(r.totalOrders === 1, 'no-promise: totalOrders 1')
  check(r.ordersWithDeliveryPromise === 0, 'no-promise: ordersWithDeliveryPromise 0')
  check(r.ordersWithoutDeliveryPromise === 1, 'no-promise: ordersWithoutDeliveryPromise 1')
  check(r.deliveryPromiseCoverage === 0, 'no-promise: deliveryPromiseCoverage 0')
  check(r.openOrdersWithDeliveryPromise === 0, 'no-promise: openOrdersWithDeliveryPromise 0')
  check(r.openOrdersWithoutDeliveryPromise === 1, 'no-promise: openOrdersWithoutDeliveryPromise 1')
}

// 3. Open PO with expectedAt (tracked delivery)
{
  const r = projectShopPurchaseOrderDeliveryPromiseBrief(state([po({ expectedAt: '2026-08-20T00:00:00Z' })]))
  check(r.ordersWithDeliveryPromise === 1, 'with-promise: ordersWithDeliveryPromise 1')
  check(r.ordersWithoutDeliveryPromise === 0, 'with-promise: ordersWithoutDeliveryPromise 0')
  check(r.deliveryPromiseCoverage === 100, 'with-promise: deliveryPromiseCoverage 100')
  check(r.openOrdersWithDeliveryPromise === 1, 'with-promise: openOrdersWithDeliveryPromise 1')
  check(r.openOrdersWithoutDeliveryPromise === 0, 'with-promise: openOrdersWithoutDeliveryPromise 0')
}

// 4. PO with expectedAt + supplierInvoice (fulfilled — not open)
{
  const r = projectShopPurchaseOrderDeliveryPromiseBrief(state([
    po({ expectedAt: '2026-08-10T00:00:00Z', withInvoice: true }),
  ]))
  check(r.ordersWithDeliveryPromise === 1, 'invoiced: ordersWithDeliveryPromise 1')
  check(r.openOrdersWithDeliveryPromise === 0, 'invoiced: openOrdersWithDeliveryPromise 0 (fulfilled)')
}

// 5. PO with expectedAt + cancellation (not open)
{
  const r = projectShopPurchaseOrderDeliveryPromiseBrief(state([
    po({ expectedAt: '2026-08-15T00:00:00Z', withCancellation: true }),
  ]))
  check(r.ordersWithDeliveryPromise === 1, 'cancelled: ordersWithDeliveryPromise 1')
  check(r.openOrdersWithDeliveryPromise === 0, 'cancelled: openOrdersWithDeliveryPromise 0 (cancelled)')
}

// 6. Open PO without promise + cancelled PO without promise → only open counts in risk
{
  const r = projectShopPurchaseOrderDeliveryPromiseBrief(state([
    po(),
    po({ withCancellation: true }),
  ]))
  check(r.openOrdersWithoutDeliveryPromise === 1, 'risk: only open counts in openWithoutPromise')
  check(r.ordersWithoutDeliveryPromise === 2, 'risk: both counted in total without promise')
}

// 7. deliveryPromiseCoverage rounds — 1 of 3 = 33%
{
  const r = projectShopPurchaseOrderDeliveryPromiseBrief(state([
    po({ expectedAt: '2026-08-20T00:00:00Z' }),
    po(),
    po(),
  ]))
  check(r.deliveryPromiseCoverage === 33, 'round-33pct: deliveryPromiseCoverage 33')
}

// 8. All with promise → 100% coverage
{
  const r = projectShopPurchaseOrderDeliveryPromiseBrief(state([
    po({ expectedAt: '2026-08-20T00:00:00Z' }),
    po({ expectedAt: '2026-08-21T00:00:00Z' }),
  ]))
  check(r.deliveryPromiseCoverage === 100, 'full-coverage: deliveryPromiseCoverage 100')
  check(r.openOrdersWithoutDeliveryPromise === 0, 'full-coverage: no open without promise')
}

// 9. Mixed: open-no-promise, open-with-promise, fulfilled-with-promise, cancelled-no-promise
{
  const r = projectShopPurchaseOrderDeliveryPromiseBrief(state([
    po(),                                                             // open, no promise
    po({ expectedAt: '2026-08-20T00:00:00Z' }),                      // open, with promise
    po({ expectedAt: '2026-08-10T00:00:00Z', withInvoice: true }),   // fulfilled, with promise
    po({ withCancellation: true }),                                   // cancelled, no promise
  ]))
  check(r.totalOrders === 4, 'mixed: totalOrders 4')
  check(r.ordersWithDeliveryPromise === 2, 'mixed: ordersWithDeliveryPromise 2')
  check(r.ordersWithoutDeliveryPromise === 2, 'mixed: ordersWithoutDeliveryPromise 2')
  check(r.deliveryPromiseCoverage === 50, 'mixed: deliveryPromiseCoverage 50')
  check(r.openOrdersWithDeliveryPromise === 1, 'mixed: openOrdersWithDeliveryPromise 1')
  check(r.openOrdersWithoutDeliveryPromise === 1, 'mixed: openOrdersWithoutDeliveryPromise 1')
}

console.log(JSON.stringify({ ok: true, checks }))
