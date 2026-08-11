// Shop order support case owner brief: owner/dueAt triage coverage analytics.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderSupportCaseOwnerBrief } from './shop-order-support-case-owner-brief.ts'`,
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

const { projectShopOrderSupportCaseOwnerBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let caseId = 0
function supportCase({ owner, dueAt, status = 'open' } = {}) {
  caseId++
  return {
    caseId: `case-${caseId}`,
    sourceIntentId: `intent-${caseId}`,
    sourceRequestId: `req-${caseId}`,
    customerRequestedAt: '2026-08-11T10:00:00Z',
    category: 'order_status',
    customerDescription: 'Issue',
    status,
    opening: { actionId: `act-open-${caseId}`, capturedAt: '2026-08-11T10:00:00Z', summary: 'Opened', evidence: [] },
    externalMessageSent: false,
    refundStarted: false,
    ...(owner !== undefined && { owner }),
    ...(dueAt !== undefined && { dueAt }),
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
  const r = projectShopOrderSupportCaseOwnerBrief(state([]))
  check(r.totalCases === 0, 'empty: totalCases 0')
  check(r.casesWithOwner === 0, 'empty: casesWithOwner 0')
  check(r.casesWithoutOwner === 0, 'empty: casesWithoutOwner 0')
  check(r.ownershipCoverage === 0, 'empty: ownershipCoverage 0')
  check(r.openCasesWithoutOwner === 0, 'empty: openCasesWithoutOwner 0')
  check(r.casesWithDueAt === 0, 'empty: casesWithDueAt 0')
  check(r.casesWithoutDueAt === 0, 'empty: casesWithoutDueAt 0')
}

// 2. Case with no owner, no dueAt (open) → unassigned open backlog
{
  const r = projectShopOrderSupportCaseOwnerBrief(state([order([supportCase()])]))
  check(r.totalCases === 1, 'unassigned-open: totalCases 1')
  check(r.casesWithOwner === 0, 'unassigned-open: casesWithOwner 0')
  check(r.casesWithoutOwner === 1, 'unassigned-open: casesWithoutOwner 1')
  check(r.openCasesWithoutOwner === 1, 'unassigned-open: openCasesWithoutOwner 1')
  check(r.ownershipCoverage === 0, 'unassigned-open: ownershipCoverage 0')
}

// 3. Resolved case without owner → NOT counted in openCasesWithoutOwner
{
  const r = projectShopOrderSupportCaseOwnerBrief(state([
    order([supportCase({ status: 'resolved' })]),
  ]))
  check(r.openCasesWithoutOwner === 0, 'resolved-no-owner: openCasesWithoutOwner 0 (not open)')
  check(r.casesWithoutOwner === 1, 'resolved-no-owner: casesWithoutOwner 1')
}

// 4. Case with owner set
{
  const r = projectShopOrderSupportCaseOwnerBrief(state([
    order([supportCase({ owner: 'staff-01' })]),
  ]))
  check(r.casesWithOwner === 1, 'with-owner: casesWithOwner 1')
  check(r.casesWithoutOwner === 0, 'with-owner: casesWithoutOwner 0')
  check(r.openCasesWithoutOwner === 0, 'with-owner: openCasesWithoutOwner 0 (has owner)')
  check(r.ownershipCoverage === 100, 'with-owner: ownershipCoverage 100')
}

// 5. Case with dueAt set
{
  const r = projectShopOrderSupportCaseOwnerBrief(state([
    order([supportCase({ dueAt: '2026-08-12T12:00:00Z' })]),
  ]))
  check(r.casesWithDueAt === 1, 'with-due-at: casesWithDueAt 1')
  check(r.casesWithoutDueAt === 0, 'with-due-at: casesWithoutDueAt 0')
}

// 6. Case with both owner and dueAt
{
  const r = projectShopOrderSupportCaseOwnerBrief(state([
    order([supportCase({ owner: 'staff-01', dueAt: '2026-08-12T12:00:00Z' })]),
  ]))
  check(r.casesWithOwner === 1, 'both: casesWithOwner 1')
  check(r.casesWithDueAt === 1, 'both: casesWithDueAt 1')
}

// 7. ownershipCoverage rounds — 2 of 3 = 67%
{
  const r = projectShopOrderSupportCaseOwnerBrief(state([order([
    supportCase({ owner: 'staff-01' }),
    supportCase({ owner: 'staff-02' }),
    supportCase(),
  ])]))
  check(r.ownershipCoverage === 67, 'round-67pct: ownershipCoverage 67 (2/3)')
  check(r.totalCases === 3, 'round-67pct: totalCases 3')
}

// 8. Mixed open/resolved without owner
{
  const r = projectShopOrderSupportCaseOwnerBrief(state([order([
    supportCase({ status: 'open' }),
    supportCase({ status: 'resolved' }),
  ])]))
  check(r.openCasesWithoutOwner === 1, 'mixed-status: openCasesWithoutOwner 1 (only open)')
  check(r.casesWithoutOwner === 2, 'mixed-status: casesWithoutOwner 2 (both)')
}

// 9. Across multiple orders
{
  const r = projectShopOrderSupportCaseOwnerBrief(state([
    order([supportCase({ owner: 'staff-01', dueAt: '2026-08-12T12:00:00Z' })]),
    order([supportCase(), supportCase({ dueAt: '2026-08-13T12:00:00Z' })]),
  ]))
  check(r.totalCases === 3, 'multi-order: totalCases 3')
  check(r.casesWithOwner === 1, 'multi-order: casesWithOwner 1')
  check(r.casesWithDueAt === 2, 'multi-order: casesWithDueAt 2')
  check(r.openCasesWithoutOwner === 2, 'multi-order: openCasesWithoutOwner 2')
}

console.log(JSON.stringify({ ok: true, checks }))
