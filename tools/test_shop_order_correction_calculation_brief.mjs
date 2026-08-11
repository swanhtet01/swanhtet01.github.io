// Shop order correction calculation brief: taxMode distribution + amount aggregates.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderCorrectionCalculationBrief } from './shop-order-correction-calculation-brief.ts'`,
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

const { projectShopOrderCorrectionCalculationBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let docId = 0
function correction({ taxMode = 'not_configured', listedAmountMmk = 1000, subtotalMmk = 1000, taxMmk = 0, totalMmk = 1000 } = {}) {
  docId++
  return {
    documentId: `doc-${docId}`,
    actionId: `act-${docId}`,
    createdAt: '2026-08-11T08:00:00Z',
    actor: 'staff-01',
    reason: 'Correction reason.',
    evidenceReference: '',
    kind: 'discount',
    reasonCode: 'price_adjustment',
    sourceCalculationDigest: `digest-${docId}`,
    calculation: {
      currency: 'MMK',
      taxConfigurationRevision: null,
      taxCode: null,
      taxRateBasisPoints: null,
      taxMode,
      listedAmountMmk,
      subtotalMmk,
      taxMmk,
      totalMmk,
    },
    balanceAfterMmk: 5000,
    financialStatus: 'review_required',
  }
}

let orderId = 0
function order(corrections) {
  orderId++
  return {
    id: `order-${orderId}`,
    reference: `ref-${orderId}`,
    createdAt: '2026-08-11T08:00:00Z',
    customer: 'cust-01',
    calculation: null,
    items: [],
    ...(corrections !== undefined && corrections.length > 0 && { corrections }),
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
  const r = projectShopOrderCorrectionCalculationBrief(state([]))
  check(r.totalCorrections === 0, 'empty: totalCorrections 0')
  check(r.taxModeNotConfiguredCount === 0, 'empty: notConfigured 0')
  check(r.taxModeExclusiveCount === 0, 'empty: exclusive 0')
  check(r.taxModeInclusiveCount === 0, 'empty: inclusive 0')
  check(r.taxModeNotConfiguredRate === 0, 'empty: notConfiguredRate 0')
  check(r.taxModeExclusiveRate === 0, 'empty: exclusiveRate 0')
  check(r.taxModeInclusiveRate === 0, 'empty: inclusiveRate 0')
  check(r.totalListedAmountMmk === 0, 'empty: totalListed 0')
  check(r.totalSubtotalMmk === 0, 'empty: totalSubtotal 0')
  check(r.totalTaxMmk === 0, 'empty: totalTax 0')
  check(r.totalTotalMmk === 0, 'empty: totalTotal 0')
  check(r.averageCorrectiveTotalMmk === 0, 'empty: avg 0')
}

// 2. Order with no corrections
{
  const r = projectShopOrderCorrectionCalculationBrief(state([order([])]))
  check(r.totalCorrections === 0, 'no-corrections: total 0')
}

// 3. Single not_configured correction
{
  const r = projectShopOrderCorrectionCalculationBrief(state([
    order([correction({ taxMode: 'not_configured', listedAmountMmk: 2000, subtotalMmk: 2000, taxMmk: 0, totalMmk: 2000 })]),
  ]))
  check(r.totalCorrections === 1, 'not-configured: total 1')
  check(r.taxModeNotConfiguredCount === 1, 'not-configured: count 1')
  check(r.taxModeExclusiveCount === 0, 'not-configured: exclusive 0')
  check(r.taxModeInclusiveCount === 0, 'not-configured: inclusive 0')
  check(r.taxModeNotConfiguredRate === 100, 'not-configured: rate 100')
  check(r.totalListedAmountMmk === 2000, 'not-configured: listed 2000')
  check(r.totalTotalMmk === 2000, 'not-configured: total 2000')
  check(r.averageCorrectiveTotalMmk === 2000, 'not-configured: avg 2000')
}

// 4. Single exclusive correction with tax
{
  const r = projectShopOrderCorrectionCalculationBrief(state([
    order([correction({ taxMode: 'exclusive', listedAmountMmk: 1000, subtotalMmk: 1000, taxMmk: 50, totalMmk: 1050 })]),
  ]))
  check(r.taxModeExclusiveCount === 1, 'exclusive: count 1')
  check(r.taxModeExclusiveRate === 100, 'exclusive: rate 100')
  check(r.totalTaxMmk === 50, 'exclusive: tax 50')
  check(r.totalTotalMmk === 1050, 'exclusive: total 1050')
}

// 5. Single inclusive correction
{
  const r = projectShopOrderCorrectionCalculationBrief(state([
    order([correction({ taxMode: 'inclusive', listedAmountMmk: 1000, subtotalMmk: 833, taxMmk: 167, totalMmk: 1000 })]),
  ]))
  check(r.taxModeInclusiveCount === 1, 'inclusive: count 1')
  check(r.taxModeInclusiveRate === 100, 'inclusive: rate 100')
}

// 6. All three taxModes — 1 each
{
  const r = projectShopOrderCorrectionCalculationBrief(state([
    order([
      correction({ taxMode: 'not_configured' }),
      correction({ taxMode: 'exclusive' }),
      correction({ taxMode: 'inclusive' }),
    ]),
  ]))
  check(r.totalCorrections === 3, 'all-three: total 3')
  check(r.taxModeNotConfiguredCount === 1, 'all-three: notConfigured 1')
  check(r.taxModeExclusiveCount === 1, 'all-three: exclusive 1')
  check(r.taxModeInclusiveCount === 1, 'all-three: inclusive 1')
  check(r.taxModeNotConfiguredRate === 33, 'all-three: notConfiguredRate 33')
  check(r.taxModeExclusiveRate === 33, 'all-three: exclusiveRate 33')
  check(r.taxModeInclusiveRate === 33, 'all-three: inclusiveRate 33')
}

// 7. Amounts sum across multiple corrections
{
  const r = projectShopOrderCorrectionCalculationBrief(state([
    order([
      correction({ taxMode: 'exclusive', listedAmountMmk: 1000, subtotalMmk: 1000, taxMmk: 100, totalMmk: 1100 }),
      correction({ taxMode: 'exclusive', listedAmountMmk: 2000, subtotalMmk: 2000, taxMmk: 200, totalMmk: 2200 }),
    ]),
  ]))
  check(r.totalListedAmountMmk === 3000, 'sums: listed 3000')
  check(r.totalSubtotalMmk === 3000, 'sums: subtotal 3000')
  check(r.totalTaxMmk === 300, 'sums: tax 300')
  check(r.totalTotalMmk === 3300, 'sums: total 3300')
  check(r.averageCorrectiveTotalMmk === 1650, 'sums: avg 1650')
}

// 8. Average rounds — 1000 + 2000 = 3000, avg of 2 = 1500 (exact, no rounding needed)
{
  const r = projectShopOrderCorrectionCalculationBrief(state([
    order([
      correction({ totalMmk: 1000 }),
      correction({ totalMmk: 2000 }),
    ]),
  ]))
  check(r.averageCorrectiveTotalMmk === 1500, 'avg-exact: 1500')
}

// 9. Average rounds — 1000 + 1001 = 2001, avg of 2 = 1000 (Math.round(2001/2) = Math.round(1000.5) = 1001)
{
  const r = projectShopOrderCorrectionCalculationBrief(state([
    order([
      correction({ totalMmk: 1000 }),
      correction({ totalMmk: 1001 }),
    ]),
  ]))
  check(r.averageCorrectiveTotalMmk === 1001, 'avg-round-up: 1001 (Math.round(1000.5))')
}

// 10. Amounts sum across multiple orders
{
  const r = projectShopOrderCorrectionCalculationBrief(state([
    order([correction({ totalMmk: 500 })]),
    order([correction({ totalMmk: 500 })]),
  ]))
  check(r.totalCorrections === 2, 'multi-order: total 2')
  check(r.totalTotalMmk === 1000, 'multi-order: totalMmk 1000')
}

// 11. Rate when dominant mode — 2 exclusive of 3 = 67%
{
  const r = projectShopOrderCorrectionCalculationBrief(state([
    order([
      correction({ taxMode: 'exclusive' }),
      correction({ taxMode: 'exclusive' }),
      correction({ taxMode: 'not_configured' }),
    ]),
  ]))
  check(r.taxModeExclusiveRate === 67, 'dominant-rate: exclusiveRate 67')
  check(r.taxModeNotConfiguredRate === 33, 'dominant-rate: notConfiguredRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
