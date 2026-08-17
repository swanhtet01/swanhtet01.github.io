// Shop order correction tax brief: taxJurisdictionCode coverage on correction calculations.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderCorrectionTaxBrief } from './shop-order-correction-tax-brief.ts'`,
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

const { projectShopOrderCorrectionTaxBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let docId = 0
function correction({ taxJurisdictionCode } = {}) {
  docId++
  return {
    documentId: `doc-${docId}`,
    actionId: `act-corr-${docId}`,
    createdAt: '2026-08-11T10:00:00Z',
    actor: 'staff-01',
    reason: 'Price adjustment.',
    evidenceReference: '',
    kind: 'credit',
    reasonCode: 'pricing_error',
    sourceCalculationDigest: `sha-${docId}`,
    calculation: {
      currency: 'MMK',
      taxConfigurationRevision: 1,
      taxCode: 'MMR-STD',
      taxJurisdictionCode: taxJurisdictionCode !== undefined ? taxJurisdictionCode : null,
      taxEffectiveFrom: null,
      taxRateBasisPoints: 500,
      taxMode: 'inclusive',
      listedAmountMmk: 10000,
      subtotalMmk: 9524,
      taxMmk: 476,
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
    unitPriceMmk: 5000,
    totalMmk: 5000,
    status: 'confirmed',
    total: 5000,
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

// 1. Empty → all zeros
{
  const r = projectShopOrderCorrectionTaxBrief(state([]))
  check(r.totalCorrections === 0, 'empty: totalCorrections 0')
  check(r.correctionsWithJurisdiction === 0, 'empty: correctionsWithJurisdiction 0')
  check(r.correctionsWithoutJurisdiction === 0, 'empty: correctionsWithoutJurisdiction 0')
  check(r.jurisdictionCoverage === 0, 'empty: jurisdictionCoverage 0')
  check(r.uniqueJurisdictions === 0, 'empty: uniqueJurisdictions 0')
}

// 2. Order with no corrections
{
  const r = projectShopOrderCorrectionTaxBrief(state([order([])]))
  check(r.totalCorrections === 0, 'no-corrections: totalCorrections 0')
}

// 3. Correction with null taxJurisdictionCode (not configured)
{
  const r = projectShopOrderCorrectionTaxBrief(state([order([correction()])]))
  check(r.totalCorrections === 1, 'null-code: totalCorrections 1')
  check(r.correctionsWithJurisdiction === 0, 'null-code: correctionsWithJurisdiction 0')
  check(r.correctionsWithoutJurisdiction === 1, 'null-code: correctionsWithoutJurisdiction 1')
  check(r.jurisdictionCoverage === 0, 'null-code: jurisdictionCoverage 0')
  check(r.uniqueJurisdictions === 0, 'null-code: uniqueJurisdictions 0')
}

// 4. Correction with taxJurisdictionCode set
{
  const r = projectShopOrderCorrectionTaxBrief(state([
    order([correction({ taxJurisdictionCode: 'MMR-YGN' })]),
  ]))
  check(r.correctionsWithJurisdiction === 1, 'with-code: correctionsWithJurisdiction 1')
  check(r.correctionsWithoutJurisdiction === 0, 'with-code: correctionsWithoutJurisdiction 0')
  check(r.jurisdictionCoverage === 100, 'with-code: jurisdictionCoverage 100')
  check(r.uniqueJurisdictions === 1, 'with-code: uniqueJurisdictions 1')
}

// 5. Same jurisdiction on multiple corrections → counted once in uniqueJurisdictions
{
  const r = projectShopOrderCorrectionTaxBrief(state([order([
    correction({ taxJurisdictionCode: 'MMR-YGN' }),
    correction({ taxJurisdictionCode: 'MMR-YGN' }),
  ])]))
  check(r.correctionsWithJurisdiction === 2, 'same-jurisdiction: correctionsWithJurisdiction 2')
  check(r.uniqueJurisdictions === 1, 'same-jurisdiction: uniqueJurisdictions 1 (dedup)')
}

// 6. Two different jurisdictions
{
  const r = projectShopOrderCorrectionTaxBrief(state([order([
    correction({ taxJurisdictionCode: 'MMR-YGN' }),
    correction({ taxJurisdictionCode: 'MMR-MDY' }),
  ])]))
  check(r.uniqueJurisdictions === 2, 'two-jurisdictions: uniqueJurisdictions 2')
}

// 7. Mixed null and with-code → coverage 50%
{
  const r = projectShopOrderCorrectionTaxBrief(state([order([
    correction({ taxJurisdictionCode: 'MMR-YGN' }),
    correction(),
  ])]))
  check(r.correctionsWithJurisdiction === 1, 'mixed: correctionsWithJurisdiction 1')
  check(r.correctionsWithoutJurisdiction === 1, 'mixed: correctionsWithoutJurisdiction 1')
  check(r.jurisdictionCoverage === 50, 'mixed: jurisdictionCoverage 50')
}

// 8. Across multiple orders
{
  const r = projectShopOrderCorrectionTaxBrief(state([
    order([correction({ taxJurisdictionCode: 'MMR-YGN' })]),
    order([correction(), correction({ taxJurisdictionCode: 'MMR-MDY' })]),
  ]))
  check(r.totalCorrections === 3, 'multi-order: totalCorrections 3')
  check(r.correctionsWithJurisdiction === 2, 'multi-order: correctionsWithJurisdiction 2')
  check(r.uniqueJurisdictions === 2, 'multi-order: uniqueJurisdictions 2')
}

// 9. jurisdictionCoverage rounds — 1 of 3 = 33%
{
  const r = projectShopOrderCorrectionTaxBrief(state([order([
    correction({ taxJurisdictionCode: 'MMR-YGN' }),
    correction(),
    correction(),
  ])]))
  check(r.jurisdictionCoverage === 33, 'round-33pct: jurisdictionCoverage 33')
}

console.log(JSON.stringify({ ok: true, checks }))
