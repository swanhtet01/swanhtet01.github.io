// Shop order owner brief: per-owner order/revenue breakdown from CommerceState.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderOwnerBrief } from './shop-order-owner-brief.ts'`,
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

const { projectShopOrderOwnerBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let orderId = 0
function order(owner, status, total) {
  orderId++
  const o = { id: `ord-${orderId}`, payment: 'cash', status, total }
  if (owner !== null) o.owner = owner
  return o
}

function state(...orders) {
  return { schema: 'supermega.commerce.workspace.v1', revision: 1, orders, closes: [], purchaseOrders: [] }
}

// 1. Empty → all zeros
{
  const r = projectShopOrderOwnerBrief(state())
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.ordersWithOwner === 0, 'empty: ordersWithOwner 0')
  check(r.ordersWithoutOwner === 0, 'empty: ordersWithoutOwner 0')
  check(r.uniqueOwners === 0, 'empty: uniqueOwners 0')
  check(r.topOwners.length === 0, 'empty: topOwners []')
  check(r.topOwnerByVolume === null, 'empty: topOwnerByVolume null')
}

// 2. Single owned order
{
  const r = projectShopOrderOwnerBrief(state(order('alice', 'completed', 5000)))
  check(r.ordersWithOwner === 1, 'single: ordersWithOwner 1')
  check(r.ordersWithoutOwner === 0, 'single: ordersWithoutOwner 0')
  check(r.uniqueOwners === 1, 'single: uniqueOwners 1')
  check(r.topOwners[0].owner === 'alice', 'single: topOwners[0] alice')
  check(r.topOwners[0].orderCount === 1, 'single: orderCount 1')
  check(r.topOwners[0].totalRevenueMmk === 5000, 'single: revenue 5000')
  check(r.topOwners[0].cancelledCount === 0, 'single: cancelledCount 0')
  check(r.topOwnerByVolume === 'alice', 'single: topOwnerByVolume alice')
}

// 3. No owner → ordersWithoutOwner
{
  const r = projectShopOrderOwnerBrief(state(order(null, 'completed', 3000)))
  check(r.ordersWithoutOwner === 1, 'no-owner: ordersWithoutOwner 1')
  check(r.ordersWithOwner === 0, 'no-owner: ordersWithOwner 0')
  check(r.topOwners.length === 0, 'no-owner: topOwners empty')
}

// 4. Cancelled order excluded from revenue
{
  const r = projectShopOrderOwnerBrief(state(order('bob', 'cancelled', 2000)))
  check(r.topOwners[0].totalRevenueMmk === 0, 'cancelled: revenue 0')
  check(r.topOwners[0].cancelledCount === 1, 'cancelled: cancelledCount 1')
  check(r.topOwners[0].orderCount === 1, 'cancelled: orderCount 1')
}

// 5. Sort by revenue — higher revenue owner first
{
  const r = projectShopOrderOwnerBrief(state(
    order('alice', 'completed', 2000),
    order('bob', 'completed', 8000),
  ))
  check(r.topOwners[0].owner === 'bob', 'sort-revenue: bob first')
  check(r.topOwners[1].owner === 'alice', 'sort-revenue: alice second')
}

// 6. Volume vs revenue divergence
{
  const r = projectShopOrderOwnerBrief(state(
    order('alice', 'completed', 100),
    order('alice', 'completed', 100),
    order('alice', 'completed', 100),
    order('bob', 'completed', 5000),
  ))
  check(r.topOwners[0].owner === 'bob', 'diverge: topOwners[0] bob by revenue')
  check(r.topOwnerByVolume === 'alice', 'diverge: topOwnerByVolume alice')
}

// 7. Top-5 cap
{
  const r = projectShopOrderOwnerBrief(state(
    order('o1', 'completed', 1000),
    order('o2', 'completed', 900),
    order('o3', 'completed', 800),
    order('o4', 'completed', 700),
    order('o5', 'completed', 600),
    order('o6', 'completed', 500),
  ))
  check(r.topOwners.length === 5, 'top5-cap: topOwners capped at 5')
  check(r.uniqueOwners === 6, 'top5-cap: uniqueOwners 6')
}

// 8. ordersWithOwner + ordersWithoutOwner = totalOrders
{
  const r = projectShopOrderOwnerBrief(state(
    order('alice', 'completed', 3000),
    order(null, 'preparing', 1000),
  ))
  check(r.totalOrders === 2, 'identity: totalOrders 2')
  check(r.ordersWithOwner + r.ordersWithoutOwner === r.totalOrders, 'identity: with + without = total')
}

console.log(JSON.stringify({ ok: true, checks }))
