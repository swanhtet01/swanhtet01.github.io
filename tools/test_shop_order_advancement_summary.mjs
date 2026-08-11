// Shop order advancement summary: ordersWithAdvancements, totalAdvancementActions, averageAdvancementDepth, maxAdvancementDepth.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderAdvancementSummary } from './shop-order-advancement-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-advancement-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderAdvancementSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function order({ id = 'ORD-1', advancementActionIds = undefined } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 10000, status: 'confirmed',
    ...(advancementActionIds !== undefined ? { advancementActionIds } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zero
{
  const r = projectShopOrderAdvancementSummary(state([]))
  check(r.ordersWithAdvancements === 0, 'empty: ordersWithAdvancements 0')
  check(r.totalAdvancementActions === 0, 'empty: totalAdvancementActions 0')
  check(r.averageAdvancementDepth === 0, 'empty: averageAdvancementDepth 0')
  check(r.maxAdvancementDepth === 0, 'empty: maxAdvancementDepth 0')
}

// 2. Orders without advancementActionIds field
{
  const r = projectShopOrderAdvancementSummary(state([order({ id: 'ORD-1' }), order({ id: 'ORD-2' })]))
  check(r.ordersWithAdvancements === 0, 'no-field: ordersWithAdvancements 0')
}

// 3. Orders with explicit empty array
{
  const r = projectShopOrderAdvancementSummary(state([
    order({ id: 'ORD-1', advancementActionIds: [] }),
  ]))
  check(r.ordersWithAdvancements === 0, 'empty-arr: ordersWithAdvancements 0')
}

// 4. Single order, one advancement
{
  const r = projectShopOrderAdvancementSummary(state([
    order({ id: 'ORD-1', advancementActionIds: ['ACT-1'] }),
  ]))
  check(r.ordersWithAdvancements === 1, 'one-adv: ordersWithAdvancements 1')
  check(r.totalAdvancementActions === 1, 'one-adv: totalAdvancementActions 1')
  check(r.averageAdvancementDepth === 1, 'one-adv: averageAdvancementDepth 1')
  check(r.maxAdvancementDepth === 1, 'one-adv: maxAdvancementDepth 1')
}

// 5. Single order, three advancements
{
  const r = projectShopOrderAdvancementSummary(state([
    order({ id: 'ORD-1', advancementActionIds: ['ACT-1', 'ACT-2', 'ACT-3'] }),
  ]))
  check(r.ordersWithAdvancements === 1, 'three-adv: ordersWithAdvancements 1')
  check(r.totalAdvancementActions === 3, 'three-adv: totalAdvancementActions 3')
  check(r.averageAdvancementDepth === 3, 'three-adv: averageAdvancementDepth 3')
  check(r.maxAdvancementDepth === 3, 'three-adv: maxAdvancementDepth 3')
}

// 6. Two orders, different depths → max and avg
{
  const r = projectShopOrderAdvancementSummary(state([
    order({ id: 'ORD-1', advancementActionIds: ['ACT-1'] }),
    order({ id: 'ORD-2', advancementActionIds: ['ACT-2', 'ACT-3', 'ACT-4'] }),
  ]))
  check(r.ordersWithAdvancements === 2, '2orders: ordersWithAdvancements 2')
  check(r.totalAdvancementActions === 4, '2orders: totalAdvancementActions 4')
  check(r.maxAdvancementDepth === 3, '2orders: maxAdvancementDepth 3')
  check(r.averageAdvancementDepth === 2, '2orders: averageAdvancementDepth 2 (4/2=2)')
}

// 7. averageAdvancementDepth rounds correctly (3/2 = 1.5 → 2)
{
  const r = projectShopOrderAdvancementSummary(state([
    order({ id: 'ORD-1', advancementActionIds: ['ACT-1'] }),
    order({ id: 'ORD-2', advancementActionIds: ['ACT-2', 'ACT-3'] }),
  ]))
  check(r.averageAdvancementDepth === 2, 'rounding: averageAdvancementDepth 2 (round(3/2))')
}

// 8. Mixed (one advanced, one not)
{
  const r = projectShopOrderAdvancementSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', advancementActionIds: ['ACT-1', 'ACT-2'] }),
  ]))
  check(r.ordersWithAdvancements === 1, 'mixed: ordersWithAdvancements 1')
  check(r.totalAdvancementActions === 2, 'mixed: totalAdvancementActions 2')
}

console.log(JSON.stringify({ ok: true, checks }))
