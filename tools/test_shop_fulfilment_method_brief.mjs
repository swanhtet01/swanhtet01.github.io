// Shop fulfilment method brief: per-method (pickup/delivery) revenue and order breakdown.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopFulfilmentMethodBrief } from './shop-fulfilment-method-brief.ts'`,
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

const { projectShopFulfilmentMethodBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function order(fulfilment, status, total) {
  return {
    id: `ord-${checks}`,
    payment: 'cash',
    status,
    total,
    ...(fulfilment !== null ? { fulfilment } : {}),
  }
}

function state(...orders) {
  return { schema: 'supermega.commerce.workspace.v1', revision: 1, orders, closes: [], purchaseOrders: [] }
}

// 1. Empty → all zeros
{
  const r = projectShopFulfilmentMethodBrief(state())
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.ordersWithFulfilment === 0, 'empty: ordersWithFulfilment 0')
  check(r.ordersWithoutFulfilment === 0, 'empty: ordersWithoutFulfilment 0')
  check(r.uniqueMethods === 0, 'empty: uniqueMethods 0')
  check(r.byMethod.length === 0, 'empty: byMethod []')
  check(r.topMethodByRevenue === null, 'empty: topMethodByRevenue null')
  check(r.topMethodByVolume === null, 'empty: topMethodByVolume null')
}

// 2. Single pickup order
{
  const r = projectShopFulfilmentMethodBrief(state(order('pickup', 'completed', 5000)))
  check(r.totalOrders === 1, 'single-pickup: totalOrders 1')
  check(r.ordersWithFulfilment === 1, 'single-pickup: ordersWithFulfilment 1')
  check(r.ordersWithoutFulfilment === 0, 'single-pickup: ordersWithoutFulfilment 0')
  check(r.uniqueMethods === 1, 'single-pickup: uniqueMethods 1')
  check(r.byMethod.length === 1, 'single-pickup: byMethod 1 entry')
  check(r.byMethod[0].fulfilmentMethod === 'pickup', 'single-pickup: method is pickup')
  check(r.byMethod[0].orderCount === 1, 'single-pickup: orderCount 1')
  check(r.byMethod[0].totalRevenueMmk === 5000, 'single-pickup: revenue 5000')
  check(r.byMethod[0].cancelledCount === 0, 'single-pickup: cancelledCount 0')
  check(r.topMethodByRevenue === 'pickup', 'single-pickup: topMethodByRevenue pickup')
}

// 3. Cancelled order excluded from revenue
{
  const r = projectShopFulfilmentMethodBrief(state(order('delivery', 'cancelled', 3000)))
  check(r.byMethod[0].totalRevenueMmk === 0, 'cancelled: revenue 0')
  check(r.byMethod[0].cancelledCount === 1, 'cancelled: cancelledCount 1')
  check(r.byMethod[0].orderCount === 1, 'cancelled: orderCount 1 (still counted)')
}

// 4. No fulfilment → ordersWithoutFulfilment
{
  const r = projectShopFulfilmentMethodBrief(state(order(null, 'completed', 2000)))
  check(r.totalOrders === 1, 'no-fulfilment: totalOrders 1')
  check(r.ordersWithFulfilment === 0, 'no-fulfilment: ordersWithFulfilment 0')
  check(r.ordersWithoutFulfilment === 1, 'no-fulfilment: ordersWithoutFulfilment 1')
  check(r.byMethod.length === 0, 'no-fulfilment: byMethod empty')
}

// 5. Sort by revenue — higher revenue method comes first
{
  const r = projectShopFulfilmentMethodBrief(state(
    order('pickup', 'completed', 2000),
    order('delivery', 'completed', 8000),
  ))
  check(r.byMethod[0].fulfilmentMethod === 'delivery', 'sort: delivery first by revenue')
  check(r.byMethod[1].fulfilmentMethod === 'pickup', 'sort: pickup second')
}

// 6. Volume-vs-revenue divergence
{
  const r = projectShopFulfilmentMethodBrief(state(
    order('pickup', 'completed', 100),
    order('pickup', 'completed', 100),
    order('pickup', 'completed', 100),
    order('delivery', 'completed', 5000),
  ))
  check(r.topMethodByRevenue === 'delivery', 'diverge: topMethodByRevenue delivery')
  check(r.topMethodByVolume === 'pickup', 'diverge: topMethodByVolume pickup')
}

// 7. uniqueMethods count across distinct values
{
  const r = projectShopFulfilmentMethodBrief(state(
    order('pickup', 'completed', 1000),
    order('delivery', 'completed', 1000),
    order('pickup', 'completed', 500),
  ))
  check(r.uniqueMethods === 2, 'unique: uniqueMethods 2')
}

// 8. Mixed: pickup + delivery + no-fulfilment
{
  const r = projectShopFulfilmentMethodBrief(state(
    order('pickup', 'completed', 3000),
    order('pickup', 'cancelled', 1000),
    order('delivery', 'completed', 4000),
    order(null, 'completed', 2000),
  ))
  check(r.totalOrders === 4, 'mixed: totalOrders 4')
  check(r.ordersWithFulfilment === 3, 'mixed: ordersWithFulfilment 3')
  check(r.ordersWithoutFulfilment === 1, 'mixed: ordersWithoutFulfilment 1')
  const pickup = r.byMethod.find(m => m.fulfilmentMethod === 'pickup')
  const delivery = r.byMethod.find(m => m.fulfilmentMethod === 'delivery')
  check(pickup.orderCount === 2, 'mixed: pickup orderCount 2')
  check(pickup.totalRevenueMmk === 3000, 'mixed: pickup revenue 3000 (cancelled excluded)')
  check(pickup.cancelledCount === 1, 'mixed: pickup cancelledCount 1')
  check(delivery.totalRevenueMmk === 4000, 'mixed: delivery revenue 4000')
}

console.log(JSON.stringify({ ok: true, checks }))
