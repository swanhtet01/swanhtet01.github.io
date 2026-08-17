// Shop order return reason brief: reason distribution + disposition rates on returns.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderReturnReasonBrief } from './shop-order-return-reason-brief.ts'`,
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

const { projectShopOrderReturnReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let actionId = 0
function ret({ reason = 'customer_request', disposition = 'restock' } = {}) {
  actionId++
  return {
    actionId: `act-${actionId}`,
    createdAt: '2026-08-11T08:00:00Z',
    actor: 'staff-01',
    reason,
    evidenceReference: '',
    sku: 'SKU-01',
    quantity: 1,
    disposition,
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
  const r = projectShopOrderReturnReasonBrief(state([]))
  check(r.totalReturns === 0, 'empty: totalReturns 0')
  check(r.uniqueReasons === 0, 'empty: uniqueReasons 0')
  check(r.topReasonsByCount.length === 0, 'empty: topReasons empty')
  check(r.restockedCount === 0, 'empty: restockedCount 0')
  check(r.notRestockedCount === 0, 'empty: notRestockedCount 0')
  check(r.restockedRate === 0, 'empty: restockedRate 0')
  check(r.notRestockedRate === 0, 'empty: notRestockedRate 0')
}

// 2. Order with no returns
{
  const r = projectShopOrderReturnReasonBrief(state([order([])]))
  check(r.totalReturns === 0, 'no-returns: total 0')
}

// 3. Single return with restock
{
  const r = projectShopOrderReturnReasonBrief(state([order([ret({ reason: 'wrong_item', disposition: 'restock' })])]))
  check(r.totalReturns === 1, 'single: total 1')
  check(r.uniqueReasons === 1, 'single: uniqueReasons 1')
  check(r.topReasonsByCount[0].reason === 'wrong_item', 'single: reason wrong_item')
  check(r.topReasonsByCount[0].count === 1, 'single: count 1')
  check(r.restockedCount === 1, 'single: restockedCount 1')
  check(r.notRestockedCount === 0, 'single: notRestockedCount 0')
  check(r.restockedRate === 100, 'single: restockedRate 100')
  check(r.notRestockedRate === 0, 'single: notRestockedRate 0')
}

// 4. Single return with not_restocked
{
  const r = projectShopOrderReturnReasonBrief(state([order([ret({ reason: 'damaged', disposition: 'not_restocked' })])]))
  check(r.restockedCount === 0, 'not-restocked: restockedCount 0')
  check(r.notRestockedCount === 1, 'not-restocked: notRestockedCount 1')
  check(r.notRestockedRate === 100, 'not-restocked: notRestockedRate 100')
}

// 5. Reason distribution: sort by count desc
{
  const r = projectShopOrderReturnReasonBrief(state([order([
    ret({ reason: 'reason-A' }),
    ret({ reason: 'reason-B' }),
    ret({ reason: 'reason-B' }),
  ])]))
  check(r.topReasonsByCount[0].reason === 'reason-B', 'sort: reason-B first (count 2)')
  check(r.topReasonsByCount[1].reason === 'reason-A', 'sort: reason-A second (count 1)')
}

// 6. Secondary sort: same count → alphabetical
{
  const r = projectShopOrderReturnReasonBrief(state([order([
    ret({ reason: 'zz-reason' }),
    ret({ reason: 'aa-reason' }),
  ])]))
  check(r.topReasonsByCount[0].reason === 'aa-reason', 'secondary: aa before zz')
}

// 7. 6 reasons → top 5
{
  const returns = ['A', 'B', 'C', 'D', 'E', 'F'].map(r => ret({ reason: `reason-${r}` }))
  const res = projectShopOrderReturnReasonBrief(state([order(returns)]))
  check(res.uniqueReasons === 6, 'top-5: unique 6')
  check(res.topReasonsByCount.length === 5, 'top-5: capped at 5')
}

// 8. Mixed disposition: 50/50 split
{
  const r = projectShopOrderReturnReasonBrief(state([order([
    ret({ reason: 'r1', disposition: 'restock' }),
    ret({ reason: 'r2', disposition: 'not_restocked' }),
  ])]))
  check(r.totalReturns === 2, 'mixed-disp: total 2')
  check(r.restockedCount === 1, 'mixed-disp: restockedCount 1')
  check(r.notRestockedCount === 1, 'mixed-disp: notRestockedCount 1')
  check(r.restockedRate === 50, 'mixed-disp: restockedRate 50')
  check(r.notRestockedRate === 50, 'mixed-disp: notRestockedRate 50')
}

// 9. Returns across multiple orders
{
  const r = projectShopOrderReturnReasonBrief(state([
    order([ret({ reason: 'defect', disposition: 'not_restocked' })]),
    order([ret({ reason: 'wrong_item', disposition: 'restock' }), ret({ reason: 'defect', disposition: 'not_restocked' })]),
  ]))
  check(r.totalReturns === 3, 'multi-order: total 3')
  check(r.uniqueReasons === 2, 'multi-order: uniqueReasons 2')
  check(r.topReasonsByCount[0].reason === 'defect', 'multi-order: defect top (count 2)')
  check(r.restockedCount === 1, 'multi-order: restockedCount 1')
  check(r.notRestockedCount === 2, 'multi-order: notRestockedCount 2')
}

console.log(JSON.stringify({ ok: true, checks }))
