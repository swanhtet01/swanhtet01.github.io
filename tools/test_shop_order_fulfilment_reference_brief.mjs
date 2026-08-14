// Shop order fulfilment reference brief: fulfilmentReference distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderFulfilmentReferenceBrief } from './shop-order-fulfilment-reference-brief.ts'`,
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

const { projectShopOrderFulfilmentReferenceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let orderId = 0
function order(fulfilmentReference) {
  orderId++
  const obj = {
    id: `ORD-${orderId}`,
    orderRef: `REF-${orderId}`,
    createdAt: '2026-08-01T09:00:00Z',
    customer: { ref: `CUST-${orderId}`, name: `Customer ${orderId}` },
    channel: 'counter',
    status: 'confirmed',
    lines: [],
    payment: { method: 'cash', status: 'paid' },
    fulfilment: { method: 'counter' },
  }
  if (fulfilmentReference !== undefined) obj.fulfilmentReference = fulfilmentReference
  return obj
}

function state(orders) {
  return {
    schema: 'supermega.commerce.workspace.v2',
    revision: 0,
    orders,
    catalog: [],
    inventory: [],
  }
}

// 1. No orders → all zeros
{
  const r = projectShopOrderFulfilmentReferenceBrief(state([]))
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.ordersWithFulfilmentReference === 0, 'empty: ordersWithFulfilmentReference 0')
  check(r.fulfilmentReferencePresenceRate === 0, 'empty: fulfilmentReferencePresenceRate 0')
  check(r.uniqueFulfilmentReferences === 0, 'empty: uniqueFulfilmentReferences 0')
  check(r.topFulfilmentReferencesByCount.length === 0, 'empty: top empty')
}

// 2. Orders without fulfilmentReference
{
  const r = projectShopOrderFulfilmentReferenceBrief(state([order(), order()]))
  check(r.totalOrders === 2, 'no-ref: totalOrders 2')
  check(r.ordersWithFulfilmentReference === 0, 'no-ref: ordersWithFulfilmentReference 0')
  check(r.fulfilmentReferencePresenceRate === 0, 'no-ref: fulfilmentReferencePresenceRate 0')
}

// 3. Single order with fulfilmentReference
{
  const r = projectShopOrderFulfilmentReferenceBrief(state([order('TICKET-001')]))
  check(r.totalOrders === 1, 'single: totalOrders 1')
  check(r.ordersWithFulfilmentReference === 1, 'single: ordersWithFulfilmentReference 1')
  check(r.fulfilmentReferencePresenceRate === 100, 'single: fulfilmentReferencePresenceRate 100')
  check(r.uniqueFulfilmentReferences === 1, 'single: uniqueFulfilmentReferences 1')
  check(r.topFulfilmentReferencesByCount[0]?.reference === 'TICKET-001', 'single: top reference')
  check(r.topFulfilmentReferencesByCount[0]?.count === 1, 'single: top count 1')
}

// 4. Reference distribution
{
  const r = projectShopOrderFulfilmentReferenceBrief(
    state([order('RIDER-1'), order('RIDER-1'), order('RIDER-2')]),
  )
  check(r.uniqueFulfilmentReferences === 2, 'dist: uniqueFulfilmentReferences 2')
  check(r.topFulfilmentReferencesByCount[0]?.reference === 'RIDER-1', 'dist: top RIDER-1')
  check(r.topFulfilmentReferencesByCount[0]?.count === 2, 'dist: count 2')
}

// 5. Mixed — some with reference, some without
{
  const r = projectShopOrderFulfilmentReferenceBrief(
    state([order('TICKET-001'), order(), order('TICKET-002'), order()]),
  )
  check(r.totalOrders === 4, 'mixed: totalOrders 4')
  check(r.ordersWithFulfilmentReference === 2, 'mixed: ordersWithFulfilmentReference 2')
  check(r.fulfilmentReferencePresenceRate === 50, 'mixed: fulfilmentReferencePresenceRate 50')
}

// 6. Top-5 cap + tiebreak
{
  const refs = ['Z-REF', 'A-REF', 'C-REF', 'B-REF', 'D-REF', 'E-REF']
  const r = projectShopOrderFulfilmentReferenceBrief(
    state(refs.map(ref => order(ref))),
  )
  check(r.topFulfilmentReferencesByCount.length === 5, 'top5: capped at 5')
  check(r.topFulfilmentReferencesByCount[0]?.reference === 'A-REF', 'top5: tiebreak A-REF first')
}

// 7. Presence rate rounds: 1 of 3 → 33%
{
  const r = projectShopOrderFulfilmentReferenceBrief(
    state([order('TICKET-001'), order(), order()]),
  )
  check(r.fulfilmentReferencePresenceRate === 33, 'round: presenceRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
