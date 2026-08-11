// Shop order shipping decision summary: ordersWithDecision, byStatus, totalFeeMmk, uniqueZones.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderShippingDecisionSummary } from './shop-order-shipping-decision-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-shipping-decision-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderShippingDecisionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function shippingDecision({ status = 'approved', feeMmk = 0, zoneCode = null } = {}) {
  return {
    schema: 'supermega.commerce.shipping-decision.v1',
    status, reason: status, township: null, zoneCode,
    policyRevision: null, policyActionId: null,
    feeMmk, promiseMinutes: null, reviewedAt: '2026-01-01T00:00:00Z',
  }
}

function order({ shippingDecision: sd = undefined, id = 'ORD-1' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 1000, status: 'confirmed',
    ...(sd !== undefined ? { shippingDecision: sd } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zero
{
  const r = projectShopOrderShippingDecisionSummary(state([]))
  check(r.ordersWithDecision === 0, 'empty: ordersWithDecision 0')
  check(r.byStatus.pickup === 0, 'empty: byStatus.pickup 0')
  check(r.byStatus.approved === 0, 'empty: byStatus.approved 0')
  check(r.byStatus.rejected === 0, 'empty: byStatus.rejected 0')
  check(r.totalFeeMmk === 0, 'empty: totalFeeMmk 0')
  check(r.uniqueZones === 0, 'empty: uniqueZones 0')
}

// 2. Orders without shipping decision
{
  const r = projectShopOrderShippingDecisionSummary(state([order({ id: 'ORD-1' }), order({ id: 'ORD-2' })]))
  check(r.ordersWithDecision === 0, 'no-decision: ordersWithDecision 0')
}

// 3. Single pickup decision (feeMmk 0, no zone)
{
  const r = projectShopOrderShippingDecisionSummary(state([
    order({ id: 'ORD-1', shippingDecision: shippingDecision({ status: 'pickup', feeMmk: 0, zoneCode: null }) }),
  ]))
  check(r.ordersWithDecision === 1, 'pickup: ordersWithDecision 1')
  check(r.byStatus.pickup === 1, 'pickup: byStatus.pickup 1')
  check(r.totalFeeMmk === 0, 'pickup: totalFeeMmk 0')
  check(r.uniqueZones === 0, 'pickup: uniqueZones 0 (null zone not counted)')
}

// 4. Single approved decision with zone and fee
{
  const r = projectShopOrderShippingDecisionSummary(state([
    order({ id: 'ORD-1', shippingDecision: shippingDecision({ status: 'approved', feeMmk: 5000, zoneCode: 'YGN-1' }) }),
  ]))
  check(r.byStatus.approved === 1, 'approved: byStatus.approved 1')
  check(r.totalFeeMmk === 5000, 'approved: totalFeeMmk 5000')
  check(r.uniqueZones === 1, 'approved: uniqueZones 1')
}

// 5. Single rejected decision
{
  const r = projectShopOrderShippingDecisionSummary(state([
    order({ id: 'ORD-1', shippingDecision: shippingDecision({ status: 'rejected', feeMmk: 0, zoneCode: null }) }),
  ]))
  check(r.byStatus.rejected === 1, 'rejected: byStatus.rejected 1')
}

// 6. Two orders accumulate totalFeeMmk and byStatus
{
  const r = projectShopOrderShippingDecisionSummary(state([
    order({ id: 'ORD-1', shippingDecision: shippingDecision({ status: 'approved', feeMmk: 3000, zoneCode: 'YGN-1' }) }),
    order({ id: 'ORD-2', shippingDecision: shippingDecision({ status: 'approved', feeMmk: 2000, zoneCode: 'YGN-2' }) }),
  ]))
  check(r.ordersWithDecision === 2, '2orders: ordersWithDecision 2')
  check(r.totalFeeMmk === 5000, '2orders: totalFeeMmk 5000')
  check(r.byStatus.approved === 2, '2orders: byStatus.approved 2')
}

// 7. Same zone in two orders → uniqueZones 1 (dedup)
{
  const r = projectShopOrderShippingDecisionSummary(state([
    order({ id: 'ORD-1', shippingDecision: shippingDecision({ status: 'approved', feeMmk: 1000, zoneCode: 'YGN-1' }) }),
    order({ id: 'ORD-2', shippingDecision: shippingDecision({ status: 'approved', feeMmk: 1000, zoneCode: 'YGN-1' }) }),
  ]))
  check(r.uniqueZones === 1, 'zone-dedup: uniqueZones 1')
}

// 8. Mixed orders (some with, some without decision)
{
  const r = projectShopOrderShippingDecisionSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', shippingDecision: shippingDecision({ status: 'pickup', feeMmk: 0, zoneCode: null }) }),
  ]))
  check(r.ordersWithDecision === 1, 'mixed: ordersWithDecision 1')
  check(r.byStatus.pickup === 1, 'mixed: byStatus.pickup 1')
}

console.log(JSON.stringify({ ok: true, checks }))
