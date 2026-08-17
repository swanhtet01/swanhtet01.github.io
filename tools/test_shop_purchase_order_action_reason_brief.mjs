// Shop purchase order action reason brief: creation.reason and cancellation.reason distributions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseOrderActionReasonBrief } from './shop-purchase-order-action-reason-brief.ts'`,
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

const { projectShopPurchaseOrderActionReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

let poId = 0

function proof(reason) {
  return {
    actionId: 'ACT-1',
    capturedAt: '2026-08-12T09:00:00Z',
    actor: 'buyer-1',
    reason,
    evidenceReference: 'EVD-1',
  }
}

function po({ creationReason, cancellationReason } = {}) {
  poId++
  const base = {
    id: `PO-${poId}`,
    sku: 'SKU-1',
    supplierId: 'SUP-1',
    quantityOrdered: 10,
    expectedAt: '2026-09-01',
    creation: proof(creationReason ?? 'Stock replenishment.'),
  }
  if (cancellationReason !== undefined) base.cancellation = proof(cancellationReason)
  return base
}

function state(purchaseOrders) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseOrders !== undefined) base.purchaseOrders = purchaseOrders
  return base
}

// 1. No purchase orders → all zeros
{
  const r = projectShopPurchaseOrderActionReasonBrief(state(undefined))
  check(r.totalPurchaseOrders === 0, 'empty: totalPurchaseOrders 0')
  check(r.uniqueCreationReasons === 0, 'empty: uniqueCreationReasons 0')
  check(r.purchaseOrdersWithCancellation === 0, 'empty: purchaseOrdersWithCancellation 0')
  check(r.cancellationRate === 0, 'empty: cancellationRate 0')
  check(r.uniqueCancellationReasons === 0, 'empty: uniqueCancellationReasons 0')
}

// 2. Single PO no cancellation
{
  const r = projectShopPurchaseOrderActionReasonBrief(state([po({ creationReason: 'Urgent restock.' })]))
  check(r.totalPurchaseOrders === 1, 'single-no-cancel: totalPurchaseOrders 1')
  check(r.uniqueCreationReasons === 1, 'single-no-cancel: uniqueCreationReasons 1')
  check(r.topCreationReasonsByCount[0]?.reason === 'Urgent restock.', 'single-no-cancel: top creation reason')
  check(r.purchaseOrdersWithCancellation === 0, 'single-no-cancel: purchaseOrdersWithCancellation 0')
}

// 3. PO with cancellation
{
  const r = projectShopPurchaseOrderActionReasonBrief(state([
    po({ cancellationReason: 'Supplier unable to fulfill.' }),
  ]))
  check(r.purchaseOrdersWithCancellation === 1, 'with-cancel: purchaseOrdersWithCancellation 1')
  check(r.cancellationRate === 100, 'with-cancel: cancellationRate 100')
  check(r.uniqueCancellationReasons === 1, 'with-cancel: uniqueCancellationReasons 1')
  check(r.topCancellationReasonsByCount[0]?.reason === 'Supplier unable to fulfill.', 'with-cancel: top cancellation reason')
}

// 4. Shared creation reason across POs
{
  const r = projectShopPurchaseOrderActionReasonBrief(state([
    po({ creationReason: 'Stock replenishment.' }),
    po({ creationReason: 'Stock replenishment.' }),
    po({ creationReason: 'Special order.' }),
  ]))
  check(r.totalPurchaseOrders === 3, 'shared-creation: totalPurchaseOrders 3')
  check(r.uniqueCreationReasons === 2, 'shared-creation: uniqueCreationReasons 2')
  check(r.topCreationReasonsByCount[0]?.reason === 'Stock replenishment.', 'shared-creation: top reason')
  check(r.topCreationReasonsByCount[0]?.count === 2, 'shared-creation: top reason count 2')
}

// 5. Mixed: some with cancellation, some without → 50% rate
{
  const r = projectShopPurchaseOrderActionReasonBrief(state([
    po({ cancellationReason: 'Price dispute.' }),
    po(),
  ]))
  check(r.purchaseOrdersWithCancellation === 1, 'mixed: purchaseOrdersWithCancellation 1')
  check(r.cancellationRate === 50, 'mixed: cancellationRate 50')
}

// 6. Top-5 cap for creation reasons: 6 distinct → capped at 5
{
  const reasons = ['F reason', 'A reason', 'C reason', 'B reason', 'D reason', 'E reason']
  const r = projectShopPurchaseOrderActionReasonBrief(state(
    reasons.map(r => po({ creationReason: r })),
  ))
  check(r.uniqueCreationReasons === 6, 'top5: uniqueCreationReasons 6')
  check(r.topCreationReasonsByCount.length === 5, 'top5: capped at 5')
  check(r.topCreationReasonsByCount[0]?.reason === 'A reason', 'top5: tiebreak alphabetic first')
}

console.log(JSON.stringify({ ok: true, checks }))
