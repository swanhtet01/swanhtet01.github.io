// Shop order collection action summary: ordersWithCollectionActions, totalActions, uniqueActors, byKind.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderCollectionActionSummary } from './shop-order-collection-action-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-collection-action-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderCollectionActionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function proof({ actor = 'alice', actionId = 'ACT-1' } = {}) {
  return { actionId, capturedAt: '2026-01-01T00:00:00Z', actor, reason: 'test', evidenceReference: 'ref-1' }
}

function collectionAction({ kind = 'customer_contact', actor = 'alice', actionId = 'ACT-1' } = {}) {
  return { kind, proof: proof({ actor, actionId }) }
}

function order({ collectionActions = undefined, id = 'ORD-1' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 1000, status: 'confirmed',
    ...(collectionActions !== undefined ? { collectionActions } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. No orders → all zero
{
  const r = projectShopOrderCollectionActionSummary(state([]))
  check(r.ordersWithCollectionActions === 0, 'empty: ordersWithCollectionActions 0')
  check(r.totalActions === 0, 'empty: totalActions 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.byKind.customer_contact === 0, 'empty: byKind.customer_contact 0')
}

// 2. Orders without collectionActions field
{
  const r = projectShopOrderCollectionActionSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2' }),
  ]))
  check(r.ordersWithCollectionActions === 0, 'no-action: ordersWithCollectionActions 0')
  check(r.totalActions === 0, 'no-action: totalActions 0')
}

// 3. Explicit empty array skipped
{
  const r = projectShopOrderCollectionActionSummary(state([
    order({ id: 'ORD-1', collectionActions: [] }),
  ]))
  check(r.ordersWithCollectionActions === 0, 'empty-arr: ordersWithCollectionActions 0')
}

// 4. Single action, single actor
{
  const r = projectShopOrderCollectionActionSummary(state([
    order({ id: 'ORD-1', collectionActions: [collectionAction({ actor: 'alice' })] }),
  ]))
  check(r.ordersWithCollectionActions === 1, 'single: ordersWithCollectionActions 1')
  check(r.totalActions === 1, 'single: totalActions 1')
  check(r.byKind.customer_contact === 1, 'single: byKind.customer_contact 1')
  check(r.uniqueActors === 1, 'single: uniqueActors 1')
}

// 5. Two actions in one order, same actor
{
  const r = projectShopOrderCollectionActionSummary(state([
    order({ id: 'ORD-1', collectionActions: [
      collectionAction({ actor: 'alice', actionId: 'ACT-1' }),
      collectionAction({ actor: 'alice', actionId: 'ACT-2' }),
    ]}),
  ]))
  check(r.totalActions === 2, 'same-actor: totalActions 2')
  check(r.uniqueActors === 1, 'same-actor: uniqueActors 1 (dedup)')
  check(r.byKind.customer_contact === 2, 'same-actor: byKind.customer_contact 2')
}

// 6. Two actions, different actors
{
  const r = projectShopOrderCollectionActionSummary(state([
    order({ id: 'ORD-1', collectionActions: [
      collectionAction({ actor: 'alice', actionId: 'ACT-1' }),
      collectionAction({ actor: 'bob', actionId: 'ACT-2' }),
    ]}),
  ]))
  check(r.totalActions === 2, 'diff-actors: totalActions 2')
  check(r.uniqueActors === 2, 'diff-actors: uniqueActors 2')
}

// 7. Two orders accumulate
{
  const r = projectShopOrderCollectionActionSummary(state([
    order({ id: 'ORD-1', collectionActions: [
      collectionAction({ actor: 'alice', actionId: 'ACT-1' }),
      collectionAction({ actor: 'bob', actionId: 'ACT-2' }),
    ]}),
    order({ id: 'ORD-2', collectionActions: [
      collectionAction({ actor: 'carol', actionId: 'ACT-3' }),
    ]}),
  ]))
  check(r.ordersWithCollectionActions === 2, '2orders: ordersWithCollectionActions 2')
  check(r.totalActions === 3, '2orders: totalActions 3')
  check(r.byKind.customer_contact === 3, '2orders: byKind.customer_contact 3')
}

// 8. Mixed orders (one with, one without)
{
  const r = projectShopOrderCollectionActionSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', collectionActions: [collectionAction({ actor: 'alice' })] }),
  ]))
  check(r.ordersWithCollectionActions === 1, 'mixed: ordersWithCollectionActions 1')
  check(r.totalActions === 1, 'mixed: totalActions 1')
}

// 9. Same actor across two orders → deduped
{
  const r = projectShopOrderCollectionActionSummary(state([
    order({ id: 'ORD-1', collectionActions: [collectionAction({ actor: 'alice', actionId: 'ACT-1' })] }),
    order({ id: 'ORD-2', collectionActions: [collectionAction({ actor: 'alice', actionId: 'ACT-2' })] }),
  ]))
  check(r.uniqueActors === 1, 'cross-order-dedup: uniqueActors 1')
}

console.log(JSON.stringify({ ok: true, checks }))
