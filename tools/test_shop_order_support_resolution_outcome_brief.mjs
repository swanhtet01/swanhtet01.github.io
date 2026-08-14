// Shop order support resolution outcome brief: CommerceSupportResolutionOutcome distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderSupportResolutionOutcomeBrief } from './shop-order-support-resolution-outcome-brief.ts'`,
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

const { projectShopOrderSupportResolutionOutcomeBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let caseId = 0
function resolution(outcome) {
  return {
    outcome,
    note: 'Resolved.',
    proof: { actionId: `act-res-${++caseId}`, capturedAt: '2026-08-11T12:00:00Z', actor: 'staff', reason: 'Done', evidenceReference: '' },
  }
}

function supportCase({ resolvedOutcome, followUpOutcome } = {}) {
  caseId++
  return {
    caseId: `case-${caseId}`,
    sourceIntentId: `intent-${caseId}`,
    sourceRequestId: `req-${caseId}`,
    customerRequestedAt: '2026-08-11T10:00:00Z',
    category: 'order_status',
    customerDescription: 'Issue',
    status: resolvedOutcome !== undefined ? 'resolved' : 'open',
    opening: { actionId: `act-open-${caseId}`, capturedAt: '2026-08-11T10:00:00Z', summary: 'Opened', evidence: [] },
    externalMessageSent: false,
    refundStarted: false,
    ...(resolvedOutcome !== undefined && { resolution: resolution(resolvedOutcome) }),
    ...(followUpOutcome !== undefined && { followUpResolution: resolution(followUpOutcome) }),
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
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([]))
  check(r.totalCases === 0, 'empty: totalCases 0')
  check(r.resolvedCases === 0, 'empty: resolvedCases 0')
  check(r.unresolvedCases === 0, 'empty: unresolvedCases 0')
  check(r.resolutionRate === 0, 'empty: resolutionRate 0')
  check(r.byOutcome.informationProvided === 0, 'empty: informationProvided 0')
  check(r.byOutcome.replacementReviewRequired === 0, 'empty: replacementReviewRequired 0')
  check(r.byOutcome.refundReviewRequired === 0, 'empty: refundReviewRequired 0')
  check(r.byOutcome.noAction === 0, 'empty: noAction 0')
  check(r.refundReviewRate === 0, 'empty: refundReviewRate 0')
  check(r.followUpResolutionCases === 0, 'empty: followUpResolutionCases 0')
}

// 2. Order with no support cases → zero
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([order([])]))
  check(r.totalCases === 0, 'no-cases: totalCases 0')
}

// 3. Unresolved case (no resolution)
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([order([supportCase()])]))
  check(r.totalCases === 1, 'unresolved: totalCases 1')
  check(r.resolvedCases === 0, 'unresolved: resolvedCases 0')
  check(r.unresolvedCases === 1, 'unresolved: unresolvedCases 1')
  check(r.resolutionRate === 0, 'unresolved: resolutionRate 0')
}

// 4. information_provided outcome
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([order([
    supportCase({ resolvedOutcome: 'information_provided' }),
  ])]))
  check(r.byOutcome.informationProvided === 1, 'info-provided: informationProvided 1')
  check(r.resolvedCases === 1, 'info-provided: resolvedCases 1')
  check(r.resolutionRate === 100, 'info-provided: resolutionRate 100')
  check(r.refundReviewRate === 0, 'info-provided: refundReviewRate 0 (not refund)')
}

// 5. replacement_review_required outcome
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([order([
    supportCase({ resolvedOutcome: 'replacement_review_required' }),
  ])]))
  check(r.byOutcome.replacementReviewRequired === 1, 'replacement: replacementReviewRequired 1')
  check(r.refundReviewRate === 0, 'replacement: refundReviewRate 0 (not refund)')
}

// 6. refund_review_required outcome
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([order([
    supportCase({ resolvedOutcome: 'refund_review_required' }),
  ])]))
  check(r.byOutcome.refundReviewRequired === 1, 'refund: refundReviewRequired 1')
  check(r.refundReviewRate === 100, 'refund: refundReviewRate 100')
}

// 7. no_action outcome
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([order([
    supportCase({ resolvedOutcome: 'no_action' }),
  ])]))
  check(r.byOutcome.noAction === 1, 'no-action: noAction 1')
}

// 8. All four outcomes together
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([order([
    supportCase({ resolvedOutcome: 'information_provided' }),
    supportCase({ resolvedOutcome: 'replacement_review_required' }),
    supportCase({ resolvedOutcome: 'refund_review_required' }),
    supportCase({ resolvedOutcome: 'no_action' }),
  ])]))
  check(r.totalCases === 4, 'all-outcomes: totalCases 4')
  check(r.resolvedCases === 4, 'all-outcomes: resolvedCases 4')
  check(r.byOutcome.informationProvided === 1, 'all-outcomes: informationProvided 1')
  check(r.byOutcome.replacementReviewRequired === 1, 'all-outcomes: replacementReviewRequired 1')
  check(r.byOutcome.refundReviewRequired === 1, 'all-outcomes: refundReviewRequired 1')
  check(r.byOutcome.noAction === 1, 'all-outcomes: noAction 1')
  check(r.refundReviewRate === 25, 'all-outcomes: refundReviewRate 25 (1/4)')
}

// 9. Mixed resolved + unresolved → resolutionRate 50%
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([order([
    supportCase({ resolvedOutcome: 'no_action' }),
    supportCase(),
  ])]))
  check(r.resolvedCases === 1, 'mixed: resolvedCases 1')
  check(r.unresolvedCases === 1, 'mixed: unresolvedCases 1')
  check(r.resolutionRate === 50, 'mixed: resolutionRate 50')
}

// 10. followUpResolution case
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([order([
    supportCase({ resolvedOutcome: 'replacement_review_required', followUpOutcome: 'refund_review_required' }),
  ])]))
  check(r.followUpResolutionCases === 1, 'follow-up: followUpResolutionCases 1')
  check(r.resolvedCases === 1, 'follow-up: resolvedCases 1 (from resolution)')
}

// 11. followUpResolution without resolution — edge: followUp can exist independently
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([order([
    supportCase({ followUpOutcome: 'no_action' }),
  ])]))
  check(r.followUpResolutionCases === 1, 'follow-up-only: followUpResolutionCases 1')
  check(r.resolvedCases === 0, 'follow-up-only: resolvedCases 0 (no resolution)')
}

// 12. Across multiple orders
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([
    order([supportCase({ resolvedOutcome: 'information_provided' })]),
    order([supportCase({ resolvedOutcome: 'refund_review_required' }), supportCase()]),
  ]))
  check(r.totalCases === 3, 'multi-order: totalCases 3')
  check(r.resolvedCases === 2, 'multi-order: resolvedCases 2')
}

// 13. refundReviewRate rounds — 1 of 3 = 33%
{
  const r = projectShopOrderSupportResolutionOutcomeBrief(state([order([
    supportCase({ resolvedOutcome: 'refund_review_required' }),
    supportCase({ resolvedOutcome: 'no_action' }),
    supportCase({ resolvedOutcome: 'information_provided' }),
  ])]))
  check(r.refundReviewRate === 33, 'round-33pct: refundReviewRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
