// Shop stock movement actor summary: actor diversity, linkage classification.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopStockMovementActorSummary } from './shop-stock-movement-actor-summary.ts'`,
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

const { projectShopStockMovementActorSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function movement({ actor = 'ops-1', kind = 'receipt', sku = 'SKU-A', quantityDelta = 10, orderId, purchaseOrderId, productionJobId } = {}) {
  const base = {
    id: `MOV-${Math.random()}`, actionId: `ACT-${Math.random()}`,
    createdAt: '2026-01-01T00:00:00Z', actor, reason: 'operational', evidenceReference: 'EV-1',
    kind, sku, quantityDelta,
  }
  if (orderId !== undefined) base.orderId = orderId
  if (purchaseOrderId !== undefined) base.purchaseOrderId = purchaseOrderId
  if (productionJobId !== undefined) base.productionJobId = productionJobId
  return base
}

function state(movements = []) {
  return { schema: SCHEMA, items: [], orders: [], movements, closes: [] }
}

// 1. Empty state
{
  const r = projectShopStockMovementActorSummary(state([]))
  check(r.totalMovements === 0, 'empty: totalMovements 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.topActors.length === 0, 'empty: topActors empty')
  check(r.orderLinked === 0, 'empty: orderLinked 0')
  check(r.purchaseOrderLinked === 0, 'empty: purchaseOrderLinked 0')
  check(r.productionLinked === 0, 'empty: productionLinked 0')
  check(r.unlinked === 0, 'empty: unlinked 0')
}

// 2. Single unlinked movement
{
  const r = projectShopStockMovementActorSummary(state([movement({ actor: 'ops-1' })]))
  check(r.totalMovements === 1, 'single: totalMovements 1')
  check(r.uniqueActors === 1, 'single: uniqueActors 1')
  check(r.unlinked === 1, 'single: unlinked 1')
  check(r.orderLinked === 0, 'single: orderLinked 0')
  check(r.topActors[0].actor === 'ops-1', 'single: topActors[0] ops-1')
  check(r.topActors[0].movementCount === 1, 'single: topActors[0].movementCount 1')
}

// 3. Order-linked movement
{
  const r = projectShopStockMovementActorSummary(state([
    movement({ actor: 'sys', orderId: 'ORD-1' }),
  ]))
  check(r.orderLinked === 1, 'order-linked: orderLinked 1')
  check(r.unlinked === 0, 'order-linked: unlinked 0')
}

// 4. Purchase-order-linked movement
{
  const r = projectShopStockMovementActorSummary(state([
    movement({ actor: 'sys', purchaseOrderId: 'PO-1' }),
  ]))
  check(r.purchaseOrderLinked === 1, 'po-linked: purchaseOrderLinked 1')
  check(r.unlinked === 0, 'po-linked: unlinked 0')
}

// 5. Production-linked movement
{
  const r = projectShopStockMovementActorSummary(state([
    movement({ actor: 'sys', productionJobId: 'JOB-1', kind: 'production_issue' }),
  ]))
  check(r.productionLinked === 1, 'prod-linked: productionLinked 1')
  check(r.unlinked === 0, 'prod-linked: unlinked 0')
}

// 6. Multiple actors, topActors ranked by count
{
  const r = projectShopStockMovementActorSummary(state([
    movement({ actor: 'ops-1' }),
    movement({ actor: 'ops-2' }),
    movement({ actor: 'ops-1' }),
    movement({ actor: 'ops-1' }),
  ]))
  check(r.uniqueActors === 2, 'multi-actor: uniqueActors 2')
  check(r.topActors[0].actor === 'ops-1', 'multi-actor: ops-1 first (3 movements)')
  check(r.topActors[0].movementCount === 3, 'multi-actor: ops-1 count 3')
  check(r.topActors[1].actor === 'ops-2', 'multi-actor: ops-2 second')
}

// 7. topActors capped at 5
{
  const actors = ['a', 'b', 'c', 'd', 'e', 'f']
  const movements = actors.map(a => movement({ actor: a }))
  const r = projectShopStockMovementActorSummary(state(movements))
  check(r.topActors.length === 5, 'cap5: topActors capped at 5')
  check(r.uniqueActors === 6, 'cap5: uniqueActors still 6')
}

// 8. Mixed linkage: counts are independent
{
  const r = projectShopStockMovementActorSummary(state([
    movement({ actor: 'sys', orderId: 'ORD-1' }),
    movement({ actor: 'sys', purchaseOrderId: 'PO-1' }),
    movement({ actor: 'sys', productionJobId: 'JOB-1', kind: 'production_issue' }),
    movement({ actor: 'ops-1' }),
  ]))
  check(r.totalMovements === 4, 'mixed: totalMovements 4')
  check(r.orderLinked === 1, 'mixed: orderLinked 1')
  check(r.purchaseOrderLinked === 1, 'mixed: purchaseOrderLinked 1')
  check(r.productionLinked === 1, 'mixed: productionLinked 1')
  check(r.unlinked === 1, 'mixed: unlinked 1')
}

console.log(JSON.stringify({ ok: true, checks }))
