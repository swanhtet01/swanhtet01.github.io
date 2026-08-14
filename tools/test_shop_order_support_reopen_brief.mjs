// Shop order support reopen brief: case reopen analytics with priority distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderSupportReopenBrief } from './shop-order-support-reopen-brief.ts'`,
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

const { projectShopOrderSupportReopenBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function proof() {
  eventId++
  return { actionId: `act-${eventId}`, capturedAt: '2026-08-11T11:00:00Z', actor: 'staff', reason: 'Action', evidenceReference: '' }
}

function reopen(priority) {
  return {
    sourceResolutionActionId: `res-act-${++eventId}`,
    owner: `staff-${eventId}`,
    priority,
    dueAt: '2026-08-12T12:00:00Z',
    note: 'Reopening due to follow-up.',
    proof: proof(),
  }
}

function resolution(outcome = 'information_provided') {
  return { outcome, note: 'Resolved.', proof: proof() }
}

let caseId = 0
function supportCase({ reopen: reopenData, followUpResolution: followUpRes } = {}) {
  caseId++
  return {
    caseId: `case-${caseId}`,
    sourceIntentId: `intent-${caseId}`,
    sourceRequestId: `req-${caseId}`,
    customerRequestedAt: '2026-08-11T10:00:00Z',
    category: 'order_status',
    customerDescription: 'Issue',
    status: 'open',
    opening: { actionId: `act-open-${caseId}`, capturedAt: '2026-08-11T10:00:00Z', summary: 'Opened', evidence: [] },
    externalMessageSent: false,
    refundStarted: false,
    ...(reopenData !== undefined && { reopen: reopenData }),
    ...(followUpRes !== undefined && { followUpResolution: followUpRes }),
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
    item: 'Item',
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
  const r = projectShopOrderSupportReopenBrief(state([]))
  check(r.totalCases === 0, 'empty: totalCases 0')
  check(r.reopenedCases === 0, 'empty: reopenedCases 0')
  check(r.notReopenedCases === 0, 'empty: notReopenedCases 0')
  check(r.reopenRate === 0, 'empty: reopenRate 0')
  check(r.byReopenPriority.urgent === 0, 'empty: urgent 0')
  check(r.byReopenPriority.high === 0, 'empty: high 0')
  check(r.byReopenPriority.normal === 0, 'empty: normal 0')
  check(r.byReopenPriority.low === 0, 'empty: low 0')
  check(r.casesWithFollowUpResolution === 0, 'empty: casesWithFollowUpResolution 0')
  check(r.casesOpenAfterReopen === 0, 'empty: casesOpenAfterReopen 0')
}

// 2. Case with no reopen
{
  const r = projectShopOrderSupportReopenBrief(state([order([supportCase()])]))
  check(r.totalCases === 1, 'no-reopen: totalCases 1')
  check(r.reopenedCases === 0, 'no-reopen: reopenedCases 0')
  check(r.notReopenedCases === 1, 'no-reopen: notReopenedCases 1')
  check(r.reopenRate === 0, 'no-reopen: reopenRate 0')
}

// 3. Reopened with urgent priority
{
  const r = projectShopOrderSupportReopenBrief(state([order([
    supportCase({ reopen: reopen('urgent') }),
  ])]))
  check(r.reopenedCases === 1, 'urgent: reopenedCases 1')
  check(r.byReopenPriority.urgent === 1, 'urgent: urgent 1')
  check(r.reopenRate === 100, 'urgent: reopenRate 100')
  check(r.casesOpenAfterReopen === 1, 'urgent: casesOpenAfterReopen 1 (no followUpResolution)')
  check(r.casesWithFollowUpResolution === 0, 'urgent: casesWithFollowUpResolution 0')
}

// 4. Reopened with high priority
{
  const r = projectShopOrderSupportReopenBrief(state([order([
    supportCase({ reopen: reopen('high') }),
  ])]))
  check(r.byReopenPriority.high === 1, 'high: high 1')
}

// 5. Reopened with normal priority
{
  const r = projectShopOrderSupportReopenBrief(state([order([
    supportCase({ reopen: reopen('normal') }),
  ])]))
  check(r.byReopenPriority.normal === 1, 'normal: normal 1')
}

// 6. Reopened with low priority
{
  const r = projectShopOrderSupportReopenBrief(state([order([
    supportCase({ reopen: reopen('low') }),
  ])]))
  check(r.byReopenPriority.low === 1, 'low: low 1')
}

// 7. Reopened AND has followUpResolution → casesWithFollowUpResolution
{
  const r = projectShopOrderSupportReopenBrief(state([order([
    supportCase({ reopen: reopen('urgent'), followUpResolution: resolution() }),
  ])]))
  check(r.casesWithFollowUpResolution === 1, 'with-followup: casesWithFollowUpResolution 1')
  check(r.casesOpenAfterReopen === 0, 'with-followup: casesOpenAfterReopen 0 (resolved)')
}

// 8. All four priorities in one order
{
  const r = projectShopOrderSupportReopenBrief(state([order([
    supportCase({ reopen: reopen('urgent') }),
    supportCase({ reopen: reopen('high') }),
    supportCase({ reopen: reopen('normal') }),
    supportCase({ reopen: reopen('low') }),
  ])]))
  check(r.byReopenPriority.urgent === 1, 'all-priorities: urgent 1')
  check(r.byReopenPriority.high === 1, 'all-priorities: high 1')
  check(r.byReopenPriority.normal === 1, 'all-priorities: normal 1')
  check(r.byReopenPriority.low === 1, 'all-priorities: low 1')
  check(r.reopenedCases === 4, 'all-priorities: reopenedCases 4')
}

// 9. Mixed reopened and not-reopened
{
  const r = projectShopOrderSupportReopenBrief(state([order([
    supportCase({ reopen: reopen('urgent') }),
    supportCase(),
    supportCase(),
  ])]))
  check(r.reopenedCases === 1, 'mixed: reopenedCases 1')
  check(r.notReopenedCases === 2, 'mixed: notReopenedCases 2')
  check(r.reopenRate === 33, 'mixed: reopenRate 33 (1/3)')
}

// 10. Across multiple orders
{
  const r = projectShopOrderSupportReopenBrief(state([
    order([supportCase({ reopen: reopen('urgent') })]),
    order([supportCase(), supportCase({ reopen: reopen('high'), followUpResolution: resolution() })]),
  ]))
  check(r.totalCases === 3, 'multi-order: totalCases 3')
  check(r.reopenedCases === 2, 'multi-order: reopenedCases 2')
  check(r.casesOpenAfterReopen === 1, 'multi-order: casesOpenAfterReopen 1')
  check(r.casesWithFollowUpResolution === 1, 'multi-order: casesWithFollowUpResolution 1')
}

// 11. reopenRate rounds — 1 of 3 = 33%
{
  const r = projectShopOrderSupportReopenBrief(state([order([
    supportCase({ reopen: reopen('normal') }),
    supportCase(),
    supportCase(),
  ])]))
  check(r.reopenRate === 33, 'round-33pct: reopenRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
