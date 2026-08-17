// Shop order channel mix summary: revenue and volume by order channel.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderChannelMixSummary } from './shop-order-channel-mix-summary.ts'`,
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

const { projectShopOrderChannelMixSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function order({ id = 'ORD-1', channel = 'counter', total = 10000, status = 'confirmed' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'C1', channel,
    item: 'SKU-A', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total, status,
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty
{
  const r = projectShopOrderChannelMixSummary(state([]))
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.uniqueChannels === 0, 'empty: uniqueChannels 0')
  check(r.byChannel.length === 0, 'empty: byChannel empty')
  check(r.topChannelByRevenue === null, 'empty: topChannelByRevenue null')
  check(r.topChannelByVolume === null, 'empty: topChannelByVolume null')
}

// 2. Single order, single channel
{
  const r = projectShopOrderChannelMixSummary(state([order({ channel: 'counter', total: 20000 })]))
  check(r.totalOrders === 1, 'single: totalOrders 1')
  check(r.uniqueChannels === 1, 'single: uniqueChannels 1')
  check(r.byChannel[0].channel === 'counter', 'single: byChannel[0] counter')
  check(r.byChannel[0].orderCount === 1, 'single: orderCount 1')
  check(r.byChannel[0].totalRevenueMmk === 20000, 'single: totalRevenueMmk 20000')
  check(r.topChannelByRevenue === 'counter', 'single: topChannelByRevenue counter')
}

// 3. Cancelled orders excluded from revenue but counted in orderCount and cancelledCount
{
  const r = projectShopOrderChannelMixSummary(state([
    order({ id: 'ORD-1', channel: 'counter', total: 10000, status: 'confirmed' }),
    order({ id: 'ORD-2', channel: 'counter', total: 5000, status: 'cancelled' }),
  ]))
  check(r.byChannel[0].orderCount === 2, 'cancelled: orderCount includes cancelled (2)')
  check(r.byChannel[0].totalRevenueMmk === 10000, 'cancelled: revenue excludes cancelled (10000)')
  check(r.byChannel[0].cancelledCount === 1, 'cancelled: cancelledCount 1')
}

// 4. Two channels, byChannel sorted by revenue
{
  const r = projectShopOrderChannelMixSummary(state([
    order({ id: 'ORD-1', channel: 'counter', total: 5000 }),
    order({ id: 'ORD-2', channel: 'ecommerce', total: 30000 }),
  ]))
  check(r.uniqueChannels === 2, 'two-channels: uniqueChannels 2')
  check(r.byChannel[0].channel === 'ecommerce', 'two-channels: ecommerce first by revenue')
  check(r.topChannelByRevenue === 'ecommerce', 'two-channels: topChannelByRevenue ecommerce')
}

// 5. topChannelByVolume picks by order count, not revenue
{
  const r = projectShopOrderChannelMixSummary(state([
    order({ id: 'ORD-1', channel: 'counter', total: 1000 }),
    order({ id: 'ORD-2', channel: 'counter', total: 1000 }),
    order({ id: 'ORD-3', channel: 'ecommerce', total: 100000 }),
  ]))
  check(r.topChannelByRevenue === 'ecommerce', 'vol-vs-rev: topChannelByRevenue ecommerce (100k)')
  check(r.topChannelByVolume === 'counter', 'vol-vs-rev: topChannelByVolume counter (2 orders)')
}

// 6. Same channel accumulates across orders
{
  const r = projectShopOrderChannelMixSummary(state([
    order({ id: 'ORD-1', channel: 'counter', total: 10000 }),
    order({ id: 'ORD-2', channel: 'counter', total: 20000 }),
    order({ id: 'ORD-3', channel: 'counter', total: 15000 }),
  ]))
  check(r.byChannel[0].totalRevenueMmk === 45000, 'accum: totalRevenueMmk 45000')
  check(r.byChannel[0].orderCount === 3, 'accum: orderCount 3')
}

console.log(JSON.stringify({ ok: true, checks }))
