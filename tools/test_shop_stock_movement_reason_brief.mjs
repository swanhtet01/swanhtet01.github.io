// Shop stock movement reason brief: reason distribution on stock movements.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopStockMovementReasonBrief } from './shop-stock-movement-reason-brief.ts'`,
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

const { projectShopStockMovementReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let movId = 0
function movement(reason = 'cycle_count') {
  movId++
  return {
    id: `mov-${movId}`,
    actionId: `act-${movId}`,
    createdAt: '2026-08-11T09:00:00Z',
    actor: 'ops-01',
    reason,
    evidenceReference: '',
    kind: 'receipt',
    sku: 'SKU-A',
    quantityDelta: 10,
  }
}

function state(movements) {
  return { schema: 'supermega.commerce.workspace.v2', items: [], orders: [], movements: movements ?? [], closes: [] }
}

// 1. Empty → all zeros
{
  const r = projectShopStockMovementReasonBrief(state([]))
  check(r.totalMovements === 0, 'empty: totalMovements 0')
  check(r.uniqueReasons === 0, 'empty: uniqueReasons 0')
  check(r.topReasonsByCount.length === 0, 'empty: topReasons empty')
}

// 2. Single movement
{
  const r = projectShopStockMovementReasonBrief(state([movement('delivery')]))
  check(r.totalMovements === 1, 'single: totalMovements 1')
  check(r.uniqueReasons === 1, 'single: uniqueReasons 1')
  check(r.topReasonsByCount[0].reason === 'delivery', 'single: reason delivery')
  check(r.topReasonsByCount[0].count === 1, 'single: count 1')
}

// 3. Same reason on multiple movements
{
  const r = projectShopStockMovementReasonBrief(state([
    movement('delivery'),
    movement('delivery'),
  ]))
  check(r.totalMovements === 2, 'same-reason: total 2')
  check(r.uniqueReasons === 1, 'same-reason: unique 1')
  check(r.topReasonsByCount[0].count === 2, 'same-reason: count 2')
}

// 4. Two reasons
{
  const r = projectShopStockMovementReasonBrief(state([
    movement('delivery'),
    movement('adjustment'),
  ]))
  check(r.totalMovements === 2, 'two-reasons: total 2')
  check(r.uniqueReasons === 2, 'two-reasons: unique 2')
}

// 5. Sort by count desc
{
  const r = projectShopStockMovementReasonBrief(state([
    movement('reason-A'),
    movement('reason-B'),
    movement('reason-B'),
  ]))
  check(r.topReasonsByCount[0].reason === 'reason-B', 'sort: reason-B first (count 2)')
  check(r.topReasonsByCount[1].reason === 'reason-A', 'sort: reason-A second (count 1)')
}

// 6. Secondary sort: same count → alphabetical
{
  const r = projectShopStockMovementReasonBrief(state([
    movement('zz-reason'),
    movement('aa-reason'),
  ]))
  check(r.topReasonsByCount[0].reason === 'aa-reason', 'secondary: aa before zz')
}

// 7. 6 reasons → top 5
{
  const movements = ['A', 'B', 'C', 'D', 'E', 'F'].map(r => movement(`reason-${r}`))
  const res = projectShopStockMovementReasonBrief(state(movements))
  check(res.uniqueReasons === 6, 'top-5: unique 6')
  check(res.topReasonsByCount.length === 5, 'top-5: capped at 5')
}

// 8. Multiple reasons with mixed counts
{
  const movements = [
    movement('cycle_count'),
    movement('delivery'),
    movement('delivery'),
    movement('delivery'),
    movement('adjustment'),
    movement('adjustment'),
    movement('return'),
  ]
  const r = projectShopStockMovementReasonBrief(state(movements))
  check(r.totalMovements === 7, 'mixed: total 7')
  check(r.uniqueReasons === 4, 'mixed: unique 4')
  check(r.topReasonsByCount[0].reason === 'delivery', 'mixed: delivery top (count 3)')
  check(r.topReasonsByCount[0].count === 3, 'mixed: delivery count 3')
  check(r.topReasonsByCount[1].reason === 'adjustment', 'mixed: adjustment second (count 2)')
  check(r.topReasonsByCount[2].reason === 'cycle_count', 'mixed: cycle_count third (alpha before return)')
  check(r.topReasonsByCount[3].reason === 'return', 'mixed: return fourth')
}

// 9. Null movements guard
{
  const r = projectShopStockMovementReasonBrief(state(null))
  check(r.totalMovements === 0, 'null-guard: totalMovements 0')
  check(r.uniqueReasons === 0, 'null-guard: uniqueReasons 0')
}

console.log(JSON.stringify({ ok: true, checks }))
