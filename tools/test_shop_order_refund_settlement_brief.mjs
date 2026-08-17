// Shop order refund settlement brief: refundSettledAt date range + refundSettledBy distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderRefundSettlementBrief } from './shop-order-refund-settlement-brief.ts'`,
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

const { projectShopOrderRefundSettlementBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

let orderId = 0
function order({ refundSettledAt, refundSettledBy } = {}) {
  orderId++
  const obj = {
    id: `ORD-${orderId}`,
    createdAt: '2026-08-01T09:00:00Z',
    customer: 'CUST-1',
    quantity: 10,
    payment: 'cash',
    paymentStatus: 'completed',
    refundStatus: 'none',
  }
  if (refundSettledAt !== undefined) obj.refundSettledAt = refundSettledAt
  if (refundSettledBy !== undefined) obj.refundSettledBy = refundSettledBy
  return obj
}

function state(orders) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. No orders → all zeros / nulls
{
  const r = projectShopOrderRefundSettlementBrief(state([]))
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.settledOrders === 0, 'empty: settledOrders 0')
  check(r.settlementRate === 0, 'empty: settlementRate 0')
  check(r.earliestSettledAt === null, 'empty: earliestSettledAt null')
  check(r.latestSettledAt === null, 'empty: latestSettledAt null')
  check(r.uniqueSettledByActors === 0, 'empty: uniqueSettledByActors 0')
  check(r.topSettledByActorsByCount.length === 0, 'empty: topSettledByActorsByCount empty')
}

// 2. Orders without refundSettledAt → not counted
{
  const r = projectShopOrderRefundSettlementBrief(state([order(), order()]))
  check(r.totalOrders === 2, 'unsettled: totalOrders 2')
  check(r.settledOrders === 0, 'unsettled: settledOrders 0')
  check(r.settlementRate === 0, 'unsettled: settlementRate 0')
}

// 3. Single settled order → all fields populated
{
  const r = projectShopOrderRefundSettlementBrief(
    state([order({ refundSettledAt: '2026-08-05T09:00:00Z', refundSettledBy: 'cashier-1' })]),
  )
  check(r.totalOrders === 1, 'single: totalOrders 1')
  check(r.settledOrders === 1, 'single: settledOrders 1')
  check(r.settlementRate === 100, 'single: settlementRate 100')
  check(r.earliestSettledAt === '2026-08-05T09:00:00Z', 'single: earliestSettledAt')
  check(r.latestSettledAt === '2026-08-05T09:00:00Z', 'single: latestSettledAt')
  check(r.uniqueSettledByActors === 1, 'single: uniqueSettledByActors 1')
  check(r.topSettledByActorsByCount[0]?.actor === 'cashier-1', 'single: top actor')
}

// 4. Date ordering
{
  const r = projectShopOrderRefundSettlementBrief(
    state([
      order({ refundSettledAt: '2026-08-10T09:00:00Z' }),
      order({ refundSettledAt: '2026-08-01T09:00:00Z' }),
      order({ refundSettledAt: '2026-08-05T09:00:00Z' }),
    ]),
  )
  check(r.earliestSettledAt === '2026-08-01T09:00:00Z', 'dates: earliest')
  check(r.latestSettledAt === '2026-08-10T09:00:00Z', 'dates: latest')
}

// 5. Mixed settled/unsettled → rate
{
  const r = projectShopOrderRefundSettlementBrief(
    state([
      order({ refundSettledAt: '2026-08-01T09:00:00Z', refundSettledBy: 'cashier-1' }),
      order(),
      order(),
      order(),
    ]),
  )
  check(r.totalOrders === 4, 'mixed: totalOrders 4')
  check(r.settledOrders === 1, 'mixed: settledOrders 1')
  check(r.settlementRate === 25, 'mixed: settlementRate 25')
}

// 6. Actor distribution
{
  const r = projectShopOrderRefundSettlementBrief(
    state([
      order({ refundSettledAt: '2026-08-01T09:00:00Z', refundSettledBy: 'cashier-1' }),
      order({ refundSettledAt: '2026-08-02T09:00:00Z', refundSettledBy: 'cashier-1' }),
      order({ refundSettledAt: '2026-08-03T09:00:00Z', refundSettledBy: 'cashier-2' }),
    ]),
  )
  check(r.uniqueSettledByActors === 2, 'actor-dist: uniqueSettledByActors 2')
  check(r.topSettledByActorsByCount[0]?.actor === 'cashier-1', 'actor-dist: top cashier-1')
  check(r.topSettledByActorsByCount[0]?.count === 2, 'actor-dist: count 2')
}

// 7. Top-5 cap + tiebreak
{
  const actors = ['Z-cshr', 'A-cshr', 'C-cshr', 'B-cshr', 'D-cshr', 'E-cshr']
  const r = projectShopOrderRefundSettlementBrief(
    state(actors.map(a => order({ refundSettledAt: '2026-08-01T09:00:00Z', refundSettledBy: a }))),
  )
  check(r.topSettledByActorsByCount.length === 5, 'top5: capped at 5')
  check(r.topSettledByActorsByCount[0]?.actor === 'A-cshr', 'top5: tiebreak A-cshr first')
}

console.log(JSON.stringify({ ok: true, checks }))
