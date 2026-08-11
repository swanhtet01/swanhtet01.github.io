// Shop order correction actor brief: actor accountability on order corrections.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderCorrectionActorBrief } from './shop-order-correction-actor-brief.ts'`,
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

const { projectShopOrderCorrectionActorBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let docId = 0
function correction({ actor = 'staff-01' } = {}) {
  docId++
  return {
    documentId: `doc-${docId}`,
    actionId: `act-${docId}`,
    createdAt: '2026-08-11T10:00:00Z',
    actor,
    reason: 'Adjustment.',
    evidenceReference: '',
    kind: 'credit',
    reasonCode: 'pricing_error',
    sourceCalculationDigest: `sha-${docId}`,
    calculation: {
      currency: 'MMK',
      taxConfigurationRevision: null,
      taxCode: null,
      taxJurisdictionCode: null,
      taxEffectiveFrom: null,
      taxRateBasisPoints: null,
      taxMode: 'not_configured',
      listedAmountMmk: 10000,
      subtotalMmk: 10000,
      taxMmk: 0,
      totalMmk: 10000,
    },
    balanceAfterMmk: 0,
    financialStatus: 'review_required',
    postingAuthority: 'none',
    externalPostingPerformed: false,
  }
}

let orderId = 0
function order(corrections = []) {
  orderId++
  return {
    id: `order-${orderId}`,
    createdAt: '2026-08-11T08:00:00Z',
    customer: `cust-${orderId}`,
    channel: 'walk-in',
    item: 'Item',
    quantity: 1,
    unitPriceMmk: 10000,
    totalMmk: 10000,
    status: 'confirmed',
    total: 10000,
    ...(corrections.length > 0 && { corrections }),
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

// 1. Empty → all zeros, empty topActors
{
  const r = projectShopOrderCorrectionActorBrief(state([]))
  check(r.totalCorrections === 0, 'empty: totalCorrections 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
  check(r.topActorsByCount.length === 0, 'empty: topActors empty')
}

// 2. Order with no corrections
{
  const r = projectShopOrderCorrectionActorBrief(state([order([])]))
  check(r.totalCorrections === 0, 'no-corrections: totalCorrections 0')
}

// 3. Single correction by one actor
{
  const r = projectShopOrderCorrectionActorBrief(state([order([correction({ actor: 'mgr-01' })])]))
  check(r.totalCorrections === 1, 'single: totalCorrections 1')
  check(r.uniqueActors === 1, 'single: uniqueActors 1')
  check(r.topActorsByCount.length === 1, 'single: topActors has 1 entry')
  check(r.topActorsByCount[0].actor === 'mgr-01', 'single: actor mgr-01')
  check(r.topActorsByCount[0].count === 1, 'single: count 1')
}

// 4. Same actor makes multiple corrections → count accumulates
{
  const r = projectShopOrderCorrectionActorBrief(state([order([
    correction({ actor: 'mgr-01' }),
    correction({ actor: 'mgr-01' }),
    correction({ actor: 'mgr-01' }),
  ])]))
  check(r.uniqueActors === 1, 'same-actor: uniqueActors 1')
  check(r.topActorsByCount[0].count === 3, 'same-actor: count 3')
}

// 5. Two different actors
{
  const r = projectShopOrderCorrectionActorBrief(state([order([
    correction({ actor: 'mgr-01' }),
    correction({ actor: 'mgr-02' }),
  ])]))
  check(r.uniqueActors === 2, 'two-actors: uniqueActors 2')
}

// 6. topActorsByCount sorted by count desc, secondary localeCompare asc
{
  const r = projectShopOrderCorrectionActorBrief(state([order([
    correction({ actor: 'staff-b' }),
    correction({ actor: 'staff-a' }),
    correction({ actor: 'staff-b' }),
  ])]))
  check(r.topActorsByCount[0].actor === 'staff-b', 'sort: staff-b first (count 2)')
  check(r.topActorsByCount[0].count === 2, 'sort: staff-b count 2')
  check(r.topActorsByCount[1].actor === 'staff-a', 'sort: staff-a second (count 1)')
}

// 7. Secondary sort: same count → alphabetical by actor
{
  const r = projectShopOrderCorrectionActorBrief(state([order([
    correction({ actor: 'zeta' }),
    correction({ actor: 'alpha' }),
  ])]))
  check(r.topActorsByCount[0].actor === 'alpha', 'secondary: alpha before zeta when tie')
}

// 8. 6 actors → only top 5 returned
{
  const corrections = ['a', 'b', 'c', 'd', 'e', 'f'].map(s => correction({ actor: `actor-${s}` }))
  const r = projectShopOrderCorrectionActorBrief(state([order(corrections)]))
  check(r.uniqueActors === 6, 'top-5: uniqueActors 6')
  check(r.topActorsByCount.length === 5, 'top-5: topActorsByCount capped at 5')
}

// 9. Corrections across multiple orders aggregated by actor
{
  const r = projectShopOrderCorrectionActorBrief(state([
    order([correction({ actor: 'mgr-01' }), correction({ actor: 'mgr-02' })]),
    order([correction({ actor: 'mgr-01' })]),
  ]))
  check(r.totalCorrections === 3, 'multi-order: totalCorrections 3')
  check(r.uniqueActors === 2, 'multi-order: uniqueActors 2')
  check(r.topActorsByCount[0].actor === 'mgr-01', 'multi-order: mgr-01 top (2 corrections)')
  check(r.topActorsByCount[0].count === 2, 'multi-order: mgr-01 count 2')
}

console.log(JSON.stringify({ ok: true, checks }))
