// Shop purchase order lifecycle brief: requisitionId link rate + createdAt date range + expectedAt presence/range + cancellation rate.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseOrderLifecycleBrief } from './shop-purchase-order-lifecycle-brief.ts'`,
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

const { projectShopPurchaseOrderLifecycleBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'buyer-1', reason: 'Created.', evidenceReference: 'EVD-1' }
const CANCEL_PROOF = { actionId: 'ACT-2', capturedAt: '2026-08-05T09:00:00Z', actor: 'buyer-1', reason: 'Cancelled.', evidenceReference: 'EVD-2' }

let poId = 0
function po({ createdAt = '2026-08-01T09:00:00Z', expectedAt, requisitionId, cancelled = false } = {}) {
  poId++
  const p = {
    id: `PO-${poId}`,
    createdAt,
    supplier: 'SUP-1',
    sku: 'SKU-1',
    quantityOrdered: 10,
    creation: PROOF,
  }
  if (requisitionId !== undefined) p.requisitionId = requisitionId
  if (expectedAt !== undefined) p.expectedAt = expectedAt
  if (cancelled) p.cancellation = CANCEL_PROOF
  return p
}

function state(purchaseOrders) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseOrders !== undefined) base.purchaseOrders = purchaseOrders
  return base
}

// 1. No purchase orders → all zeros / nulls
{
  const r = projectShopPurchaseOrderLifecycleBrief(state(undefined))
  check(r.totalPurchaseOrders === 0, 'empty: totalPurchaseOrders 0')
  check(r.ordersLinkedToRequisition === 0, 'empty: ordersLinkedToRequisition 0')
  check(r.requisitionLinkRate === 0, 'empty: requisitionLinkRate 0')
  check(r.earliestCreatedAt === null, 'empty: earliestCreatedAt null')
  check(r.latestCreatedAt === null, 'empty: latestCreatedAt null')
  check(r.ordersWithExpectedAt === 0, 'empty: ordersWithExpectedAt 0')
  check(r.expectedAtRate === 0, 'empty: expectedAtRate 0')
  check(r.earliestExpectedAt === null, 'empty: earliestExpectedAt null')
  check(r.latestExpectedAt === null, 'empty: latestExpectedAt null')
  check(r.cancelledOrders === 0, 'empty: cancelledOrders 0')
  check(r.cancellationRate === 0, 'empty: cancellationRate 0')
}

// 2. Single PO, no optional fields → dates populated, optional zeros
{
  const r = projectShopPurchaseOrderLifecycleBrief(state([po({ createdAt: '2026-08-03T09:00:00Z' })]))
  check(r.totalPurchaseOrders === 1, 'single: totalPurchaseOrders 1')
  check(r.requisitionLinkRate === 0, 'single: requisitionLinkRate 0')
  check(r.earliestCreatedAt === '2026-08-03T09:00:00Z', 'single: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-03T09:00:00Z', 'single: latestCreatedAt')
  check(r.ordersWithExpectedAt === 0, 'single: ordersWithExpectedAt 0')
  check(r.cancelledOrders === 0, 'single: cancelledOrders 0')
}

// 3. PO with requisitionId → counted + 100% rate
{
  const r = projectShopPurchaseOrderLifecycleBrief(state([po({ requisitionId: 'REQ-1' })]))
  check(r.ordersLinkedToRequisition === 1, 'req-link: ordersLinkedToRequisition 1')
  check(r.requisitionLinkRate === 100, 'req-link: requisitionLinkRate 100')
}

// 4. PO with expectedAt → presence, rate, date range
{
  const r = projectShopPurchaseOrderLifecycleBrief(
    state([po({ expectedAt: '2026-09-15' })]),
  )
  check(r.ordersWithExpectedAt === 1, 'expected: ordersWithExpectedAt 1')
  check(r.expectedAtRate === 100, 'expected: expectedAtRate 100')
  check(r.earliestExpectedAt === '2026-09-15', 'expected: earliestExpectedAt')
  check(r.latestExpectedAt === '2026-09-15', 'expected: latestExpectedAt')
}

// 5. Cancelled PO → counted + 100% rate
{
  const r = projectShopPurchaseOrderLifecycleBrief(state([po({ cancelled: true })]))
  check(r.cancelledOrders === 1, 'cancelled: cancelledOrders 1')
  check(r.cancellationRate === 100, 'cancelled: cancellationRate 100')
}

// 6. Date ordering across multiple POs
{
  const r = projectShopPurchaseOrderLifecycleBrief(
    state([
      po({ createdAt: '2026-08-10T09:00:00Z' }),
      po({ createdAt: '2026-08-01T09:00:00Z' }),
      po({ createdAt: '2026-08-05T09:00:00Z' }),
    ]),
  )
  check(r.earliestCreatedAt === '2026-08-01T09:00:00Z', 'dates: earliestCreatedAt')
  check(r.latestCreatedAt === '2026-08-10T09:00:00Z', 'dates: latestCreatedAt')
}

// 7. Partial rates → 50%
{
  const r = projectShopPurchaseOrderLifecycleBrief(
    state([
      po({ requisitionId: 'REQ-1', expectedAt: '2026-09-01', cancelled: true }),
      po(),
    ]),
  )
  check(r.requisitionLinkRate === 50, 'partial: requisitionLinkRate 50')
  check(r.expectedAtRate === 50, 'partial: expectedAtRate 50')
  check(r.cancellationRate === 50, 'partial: cancellationRate 50')
}

console.log(JSON.stringify({ ok: true, checks }))
