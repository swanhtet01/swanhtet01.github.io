// Shop order support case priority brief: priority distribution on support cases.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderSupportCasePriorityBrief } from './shop-order-support-case-priority-brief.ts'`,
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

const { projectShopOrderSupportCasePriorityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let caseId = 0
function supportCase({ priority, status = 'open' } = {}) {
  caseId++
  return {
    caseId: `case-${caseId}`,
    sourceIntentId: `intent-${caseId}`,
    sourceRequestId: `req-${caseId}`,
    customerRequestedAt: '2026-08-11T10:00:00Z',
    category: 'order_status',
    customerDescription: 'Issue',
    status,
    ...(priority !== undefined && { priority }),
    opening: { actionId: `act-${caseId}`, capturedAt: '2026-08-11T10:00:00Z', summary: 'Opened', evidence: [] },
    externalMessageSent: false,
    refundStarted: false,
  }
}

let orderId = 0
function order(supportCases = []) {
  orderId++
  return {
    id: `order-${orderId}`,
    createdAt: '2026-08-11T08:00:00Z',
    customer: `cust-${orderId}`,
    channel: 'walk-in',
    item: 'Item A',
    quantity: 1,
    unitPriceMmk: 5000,
    totalMmk: 5000,
    status: 'confirmed',
    supportCases,
  }
}

function state(orders) {
  return {
    schema: 'supermega.shop.commerce.v1',
    items: [],
    orders: orders ?? [],
    movements: [],
    closes: [],
    catalogBaselines: [],
    catalogChanges: [],
    promotionPolicies: [],
    shippingPolicies: [],
    paymentPolicies: [],
    websiteIntakes: [],
    storefrontRequests: [],
    purchaseBudgetEnvelopes: [],
    supplierSourcingDecisions: [],
    purchaseOrders: [],
  }
}

// 1. Empty → all zeros
{
  const r = projectShopOrderSupportCasePriorityBrief(state([]))
  check(r.totalCases === 0, 'empty: totalCases 0')
  check(r.casesWithPriority === 0, 'empty: casesWithPriority 0')
  check(r.casesWithoutPriority === 0, 'empty: casesWithoutPriority 0')
  check(r.priorityCoverage === 0, 'empty: priorityCoverage 0')
  check(r.byPriority.urgent === 0, 'empty: urgent 0')
  check(r.byPriority.high === 0, 'empty: high 0')
  check(r.byPriority.normal === 0, 'empty: normal 0')
  check(r.byPriority.low === 0, 'empty: low 0')
  check(r.urgentOpenCases === 0, 'empty: urgentOpenCases 0')
}

// 2. Order with no support cases → still zero
{
  const r = projectShopOrderSupportCasePriorityBrief(state([order([])]))
  check(r.totalCases === 0, 'no-cases: totalCases 0')
}

// 3. Support case without priority
{
  const r = projectShopOrderSupportCasePriorityBrief(state([order([supportCase()])]))
  check(r.totalCases === 1, 'no-priority: totalCases 1')
  check(r.casesWithPriority === 0, 'no-priority: casesWithPriority 0')
  check(r.casesWithoutPriority === 1, 'no-priority: casesWithoutPriority 1')
  check(r.priorityCoverage === 0, 'no-priority: priorityCoverage 0')
}

// 4. Urgent open case
{
  const r = projectShopOrderSupportCasePriorityBrief(state([order([
    supportCase({ priority: 'urgent', status: 'open' }),
  ])]))
  check(r.byPriority.urgent === 1, 'urgent-open: urgent 1')
  check(r.urgentOpenCases === 1, 'urgent-open: urgentOpenCases 1')
  check(r.priorityCoverage === 100, 'urgent-open: priorityCoverage 100')
}

// 5. Urgent resolved case → not in urgentOpenCases
{
  const r = projectShopOrderSupportCasePriorityBrief(state([order([
    supportCase({ priority: 'urgent', status: 'resolved' }),
  ])]))
  check(r.byPriority.urgent === 1, 'urgent-resolved: urgent 1')
  check(r.urgentOpenCases === 0, 'urgent-resolved: urgentOpenCases 0 (resolved)')
}

// 6. High priority case
{
  const r = projectShopOrderSupportCasePriorityBrief(state([order([
    supportCase({ priority: 'high' }),
  ])]))
  check(r.byPriority.high === 1, 'high: byPriority.high 1')
  check(r.urgentOpenCases === 0, 'high: urgentOpenCases 0 (not urgent)')
}

// 7. All four priority levels
{
  const r = projectShopOrderSupportCasePriorityBrief(state([order([
    supportCase({ priority: 'urgent' }),
    supportCase({ priority: 'high' }),
    supportCase({ priority: 'normal' }),
    supportCase({ priority: 'low' }),
  ])]))
  check(r.byPriority.urgent === 1, 'all-priorities: urgent 1')
  check(r.byPriority.high === 1, 'all-priorities: high 1')
  check(r.byPriority.normal === 1, 'all-priorities: normal 1')
  check(r.byPriority.low === 1, 'all-priorities: low 1')
  check(r.totalCases === 4, 'all-priorities: totalCases 4')
  check(r.casesWithPriority === 4, 'all-priorities: casesWithPriority 4')
  check(r.priorityCoverage === 100, 'all-priorities: priorityCoverage 100')
}

// 8. Cases across multiple orders
{
  const r = projectShopOrderSupportCasePriorityBrief(state([
    order([supportCase({ priority: 'urgent' })]),
    order([supportCase({ priority: 'high' }), supportCase()]),
  ]))
  check(r.totalCases === 3, 'multi-order: totalCases 3')
  check(r.casesWithPriority === 2, 'multi-order: casesWithPriority 2')
  check(r.casesWithoutPriority === 1, 'multi-order: casesWithoutPriority 1')
}

// 9. priorityCoverage rounds — 2 of 3 = 67%
{
  const r = projectShopOrderSupportCasePriorityBrief(state([order([
    supportCase({ priority: 'urgent' }),
    supportCase({ priority: 'high' }),
    supportCase(),
  ])]))
  check(r.priorityCoverage === 67, 'round-67pct: priorityCoverage 67')
}

console.log(JSON.stringify({ ok: true, checks }))
