// Shop order return actor brief: who processes returns.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderReturnActorBrief } from './shop-order-return-actor-brief.ts'`,
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

const { projectShopOrderReturnActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let actionId = 0
function ret({ actor = 'staff-01' } = {}) {
  actionId++
  return {
    actionId: `act-${actionId}`,
    createdAt: '2026-08-11T08:00:00Z',
    actor,
    reason: 'Customer return.',
    evidenceReference: '',
    sku: 'SKU-01',
    quantity: 1,
    disposition: 'restock',
  }
}

let orderId = 0
function order(returns) {
  orderId++
  return {
    id: `order-${orderId}`,
    reference: `ref-${orderId}`,
    createdAt: '2026-08-11T08:00:00Z',
    customer: 'cust-01',
    calculation: null,
    items: [],
    ...(returns !== undefined && returns.length > 0 && { returns }),
  }
}

function state(orders) {
  return {
    schema: 'supermega.commerce.workspace.v3',
    revision: 1,
    orders: orders ?? [],
    purchaseOrders: [],
    movements: [],
    taxConfigurations: [],
    customerCreditPolicies: [],
    promotionPolicies: [],
    shippingPolicies: [],
    paymentPolicies: [],
    catalogChanges: [],
    purchaseBudgetEnvelopes: [],
    purchaseRequisitions: [],
    supplierSourcingDecisions: [],
    websiteIntakes: [],
  }
}

// 1. Empty → all zeros
{
  const r = projectShopOrderReturnActorBrief(state([]))
  check(r.totalReturns === 0, 'empty: totalReturns 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.topActorsByCount.length === 0, 'empty: topActors empty')
}

// 2. Order with no returns
{
  const r = projectShopOrderReturnActorBrief(state([order([])]))
  check(r.totalReturns === 0, 'no-returns: total 0')
}

// 3. Single return
{
  const r = projectShopOrderReturnActorBrief(state([order([ret({ actor: 'staff-01' })])]))
  check(r.totalReturns === 1, 'single: total 1')
  check(r.uniqueActors === 1, 'single: uniqueActors 1')
  check(r.topActorsByCount[0].actor === 'staff-01', 'single: staff-01 in top')
  check(r.topActorsByCount[0].count === 1, 'single: count 1')
}

// 4. Same actor on multiple returns — count accumulates
{
  const r = projectShopOrderReturnActorBrief(state([
    order([ret({ actor: 'staff-01' }), ret({ actor: 'staff-01' })]),
  ]))
  check(r.totalReturns === 2, 'same-actor: total 2')
  check(r.uniqueActors === 1, 'same-actor: uniqueActors 1')
  check(r.topActorsByCount[0].count === 2, 'same-actor: count 2')
}

// 5. Two actors
{
  const r = projectShopOrderReturnActorBrief(state([
    order([ret({ actor: 'staff-01' }), ret({ actor: 'staff-02' })]),
  ]))
  check(r.uniqueActors === 2, 'two-actors: uniqueActors 2')
}

// 6. Sort by count descending
{
  const r = projectShopOrderReturnActorBrief(state([
    order([ret({ actor: 'staff-A' }), ret({ actor: 'staff-B' }), ret({ actor: 'staff-B' })]),
  ]))
  check(r.topActorsByCount[0].actor === 'staff-B', 'sort: staff-B first (count 2)')
  check(r.topActorsByCount[0].count === 2, 'sort: count 2')
  check(r.topActorsByCount[1].actor === 'staff-A', 'sort: staff-A second (count 1)')
}

// 7. Secondary sort: same count → alphabetical
{
  const r = projectShopOrderReturnActorBrief(state([
    order([ret({ actor: 'zz-staff' }), ret({ actor: 'aa-staff' })]),
  ]))
  check(r.topActorsByCount[0].actor === 'aa-staff', 'secondary: aa-staff before zz-staff')
}

// 8. 6 actors → only top 5
{
  const actors = ['A', 'B', 'C', 'D', 'E', 'F'].map(a => ret({ actor: a }))
  const r = projectShopOrderReturnActorBrief(state([order(actors)]))
  check(r.uniqueActors === 6, 'top-5: uniqueActors 6')
  check(r.topActorsByCount.length === 5, 'top-5: capped at 5')
}

// 9. Cross-order accumulation — same actor across different orders
{
  const r = projectShopOrderReturnActorBrief(state([
    order([ret({ actor: 'staff-01' })]),
    order([ret({ actor: 'staff-01' })]),
  ]))
  check(r.totalReturns === 2, 'cross-order: total 2')
  check(r.uniqueActors === 1, 'cross-order: uniqueActors 1')
  check(r.topActorsByCount[0].count === 2, 'cross-order: count 2')
}

// 10. Mixed: returns on some orders, not others
{
  const r = projectShopOrderReturnActorBrief(state([
    order([ret({ actor: 'staff-01' })]),
    order([]),
    order([ret({ actor: 'staff-02' }), ret({ actor: 'staff-01' })]),
  ]))
  check(r.totalReturns === 3, 'mixed: total 3')
  check(r.uniqueActors === 2, 'mixed: uniqueActors 2')
  check(r.topActorsByCount[0].actor === 'staff-01', 'mixed: staff-01 top (count 2)')
  check(r.topActorsByCount[0].count === 2, 'mixed: staff-01 count 2')
}

console.log(JSON.stringify({ ok: true, checks }))
