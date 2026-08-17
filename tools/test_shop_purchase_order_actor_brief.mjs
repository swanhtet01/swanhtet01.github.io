// Shop purchase order actor brief: creation.actor + cancellation.actor text distributions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseOrderActorBrief } from './shop-purchase-order-actor-brief.ts'`,
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

const { projectShopPurchaseOrderActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function proof(actor, actionId = 'ACT-1') {
  return { actionId, capturedAt: '2026-08-01T09:00:00Z', actor, reason: 'Done.', evidenceReference: 'EVD-1' }
}

let poId = 0
function po(creationActor, cancellationActor) {
  poId++
  const p = {
    id: `PO-${poId}`,
    createdAt: '2026-08-01T09:00:00Z',
    supplier: 'SUP-1',
    sku: 'SKU-1',
    quantityOrdered: 10,
    creation: proof(creationActor, `ACT-C${poId}`),
  }
  if (cancellationActor !== undefined) {
    p.cancellation = proof(cancellationActor, `ACT-X${poId}`)
  }
  return p
}

function state(purchaseOrders) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseOrders !== undefined) base.purchaseOrders = purchaseOrders
  return base
}

// 1. No purchase orders → all zeros
{
  const r = projectShopPurchaseOrderActorBrief(state(undefined))
  check(r.totalPurchaseOrders === 0, 'empty: totalPurchaseOrders 0')
  check(r.uniqueCreationActors === 0, 'empty: uniqueCreationActors 0')
  check(r.topCreationActorsByCount.length === 0, 'empty: topCreationActorsByCount empty')
  check(r.cancelledOrders === 0, 'empty: cancelledOrders 0')
  check(r.uniqueCancellationActors === 0, 'empty: uniqueCancellationActors 0')
  check(r.topCancellationActorsByCount.length === 0, 'empty: topCancellationActorsByCount empty')
}

// 2. Single PO, no cancellation → creation actor captured
{
  const r = projectShopPurchaseOrderActorBrief(state([po('buyer-1')]))
  check(r.totalPurchaseOrders === 1, 'single: totalPurchaseOrders 1')
  check(r.uniqueCreationActors === 1, 'single: uniqueCreationActors 1')
  check(r.topCreationActorsByCount[0]?.actor === 'buyer-1', 'single: creation actor buyer-1')
  check(r.cancelledOrders === 0, 'single: cancelledOrders 0')
}

// 3. PO with cancellation → cancellation actor captured
{
  const r = projectShopPurchaseOrderActorBrief(state([po('buyer-1', 'manager-1')]))
  check(r.cancelledOrders === 1, 'cancelled: cancelledOrders 1')
  check(r.uniqueCancellationActors === 1, 'cancelled: uniqueCancellationActors 1')
  check(r.topCancellationActorsByCount[0]?.actor === 'manager-1', 'cancelled: cancellation actor manager-1')
  check(r.topCancellationActorsByCount[0]?.count === 1, 'cancelled: cancellation count 1')
}

// 4. Multiple POs, creation actor distribution
{
  const r = projectShopPurchaseOrderActorBrief(
    state([po('buyer-1'), po('buyer-1'), po('buyer-2')]),
  )
  check(r.uniqueCreationActors === 2, 'multi-create: uniqueCreationActors 2')
  check(r.topCreationActorsByCount[0]?.actor === 'buyer-1', 'multi-create: top actor buyer-1')
  check(r.topCreationActorsByCount[0]?.count === 2, 'multi-create: count 2')
}

// 5. Multiple cancellations, actor distribution
{
  const r = projectShopPurchaseOrderActorBrief(
    state([po('buyer-1', 'manager-1'), po('buyer-1', 'manager-1'), po('buyer-1', 'manager-2')]),
  )
  check(r.uniqueCancellationActors === 2, 'multi-cancel: uniqueCancellationActors 2')
  check(r.topCancellationActorsByCount[0]?.actor === 'manager-1', 'multi-cancel: top manager-1')
}

// 6. Top-5 cap on creation actors
{
  const actors = ['actor-F', 'actor-A', 'actor-C', 'actor-B', 'actor-D', 'actor-E']
  const r = projectShopPurchaseOrderActorBrief(state(actors.map(a => po(a))))
  check(r.topCreationActorsByCount.length === 5, 'top5: capped at 5')
}

// 7. Alphabetical tiebreak
{
  const r = projectShopPurchaseOrderActorBrief(state([po('Z-buyer'), po('A-buyer')]))
  check(r.topCreationActorsByCount[0]?.actor === 'A-buyer', 'tiebreak: A-buyer before Z-buyer')
}

console.log(JSON.stringify({ ok: true, checks }))
