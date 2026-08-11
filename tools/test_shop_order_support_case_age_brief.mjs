// Shop order support case age brief: customerRequestedAt min/max tracking by status.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderSupportCaseAgeBrief } from './shop-order-support-case-age-brief.ts'`,
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

const { projectShopOrderSupportCaseAgeBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let caseId = 0
function supportCase({ status = 'open', customerRequestedAt = '2026-08-01T10:00:00Z' } = {}) {
  caseId++
  return {
    caseId: `case-${caseId}`,
    sourceIntentId: `intent-${caseId}`,
    sourceRequestId: `req-${caseId}`,
    customerRequestedAt,
    category: 'product_quality',
    customerDescription: 'Issue with order.',
    status,
    opening: { actor: 'staff-01', at: customerRequestedAt, proofKind: 'manual' },
    externalMessageSent: false,
    refundStarted: false,
  }
}

let orderId = 0
function order(supportCases = []) {
  orderId++
  return {
    id: `order-${orderId}`,
    createdAt: '2026-08-01T08:00:00Z',
    customer: `cust-${orderId}`,
    channel: 'walk-in',
    item: 'Item',
    quantity: 1,
    unitPriceMmk: 5000,
    totalMmk: 5000,
    status: 'confirmed',
    total: 5000,
    ...(supportCases.length > 0 && { supportCases }),
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

// 1. Empty → all zeros, all nulls
{
  const r = projectShopOrderSupportCaseAgeBrief(state([]))
  check(r.totalCases === 0, 'empty: totalCases 0')
  check(r.openCases === 0, 'empty: openCases 0')
  check(r.resolvedCases === 0, 'empty: resolvedCases 0')
  check(r.earliestOpenCaseRequestedAt === null, 'empty: earliestOpen null')
  check(r.latestOpenCaseRequestedAt === null, 'empty: latestOpen null')
  check(r.earliestResolvedCaseRequestedAt === null, 'empty: earliestResolved null')
  check(r.latestResolvedCaseRequestedAt === null, 'empty: latestResolved null')
}

// 2. Order with no support cases
{
  const r = projectShopOrderSupportCaseAgeBrief(state([order([])]))
  check(r.totalCases === 0, 'no-cases: totalCases 0')
}

// 3. Single open case
{
  const r = projectShopOrderSupportCaseAgeBrief(state([order([
    supportCase({ status: 'open', customerRequestedAt: '2026-07-01T10:00:00Z' }),
  ])]))
  check(r.totalCases === 1, 'single-open: totalCases 1')
  check(r.openCases === 1, 'single-open: openCases 1')
  check(r.resolvedCases === 0, 'single-open: resolvedCases 0')
  check(r.earliestOpenCaseRequestedAt === '2026-07-01T10:00:00Z', 'single-open: earliestOpen')
  check(r.latestOpenCaseRequestedAt === '2026-07-01T10:00:00Z', 'single-open: latestOpen same as earliest')
  check(r.earliestResolvedCaseRequestedAt === null, 'single-open: earliestResolved null')
}

// 4. Single resolved case
{
  const r = projectShopOrderSupportCaseAgeBrief(state([order([
    supportCase({ status: 'resolved', customerRequestedAt: '2026-07-15T08:00:00Z' }),
  ])]))
  check(r.resolvedCases === 1, 'single-resolved: resolvedCases 1')
  check(r.earliestResolvedCaseRequestedAt === '2026-07-15T08:00:00Z', 'single-resolved: earliestResolved')
  check(r.earliestOpenCaseRequestedAt === null, 'single-resolved: earliestOpen null')
}

// 5. Two open cases: earliest and latest correctly identified
{
  const r = projectShopOrderSupportCaseAgeBrief(state([order([
    supportCase({ status: 'open', customerRequestedAt: '2026-07-01T10:00:00Z' }),
    supportCase({ status: 'open', customerRequestedAt: '2026-08-05T14:00:00Z' }),
  ])]))
  check(r.openCases === 2, 'two-open: openCases 2')
  check(r.earliestOpenCaseRequestedAt === '2026-07-01T10:00:00Z', 'two-open: earliest is older')
  check(r.latestOpenCaseRequestedAt === '2026-08-05T14:00:00Z', 'two-open: latest is newer')
}

// 6. Mixed open and resolved
{
  const r = projectShopOrderSupportCaseAgeBrief(state([order([
    supportCase({ status: 'open', customerRequestedAt: '2026-07-10T08:00:00Z' }),
    supportCase({ status: 'resolved', customerRequestedAt: '2026-07-05T08:00:00Z' }),
    supportCase({ status: 'open', customerRequestedAt: '2026-08-01T12:00:00Z' }),
    supportCase({ status: 'resolved', customerRequestedAt: '2026-07-20T16:00:00Z' }),
  ])]))
  check(r.totalCases === 4, 'mixed: totalCases 4')
  check(r.openCases === 2, 'mixed: openCases 2')
  check(r.resolvedCases === 2, 'mixed: resolvedCases 2')
  check(r.earliestOpenCaseRequestedAt === '2026-07-10T08:00:00Z', 'mixed: earliestOpen')
  check(r.latestOpenCaseRequestedAt === '2026-08-01T12:00:00Z', 'mixed: latestOpen')
  check(r.earliestResolvedCaseRequestedAt === '2026-07-05T08:00:00Z', 'mixed: earliestResolved')
  check(r.latestResolvedCaseRequestedAt === '2026-07-20T16:00:00Z', 'mixed: latestResolved')
}

// 7. Across multiple orders
{
  const r = projectShopOrderSupportCaseAgeBrief(state([
    order([supportCase({ status: 'open', customerRequestedAt: '2026-06-01T08:00:00Z' })]),
    order([
      supportCase({ status: 'open', customerRequestedAt: '2026-08-10T08:00:00Z' }),
      supportCase({ status: 'resolved', customerRequestedAt: '2026-07-01T08:00:00Z' }),
    ]),
  ]))
  check(r.totalCases === 3, 'multi-order: totalCases 3')
  check(r.openCases === 2, 'multi-order: openCases 2')
  check(r.earliestOpenCaseRequestedAt === '2026-06-01T08:00:00Z', 'multi-order: oldest open is from first order')
  check(r.latestOpenCaseRequestedAt === '2026-08-10T08:00:00Z', 'multi-order: newest open is from second order')
}

console.log(JSON.stringify({ ok: true, checks }))
