// Shop order correction tax effective from brief: taxEffectiveFrom date range from corrections.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderCorrectionTaxEffectiveFromBrief } from './shop-order-correction-tax-effective-from-brief.ts'`,
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

const { projectShopOrderCorrectionTaxEffectiveFromBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let orderId = 0
let correctionId = 0

function correction(taxEffectiveFrom) {
  correctionId++
  const calculation = {
    currency: 'MMK',
    taxConfigurationRevision: 1,
    taxCode: 'STANDARD',
    taxJurisdictionCode: 'MM-YGN',
    taxRateBasisPoints: 500,
    taxMode: 'inclusive',
    listedAmountMmk: 1000,
    subtotalMmk: 1000,
    taxMmk: 50,
    totalMmk: 1000,
  }
  if (taxEffectiveFrom !== undefined) calculation.taxEffectiveFrom = taxEffectiveFrom
  else calculation.taxEffectiveFrom = null
  return {
    id: `CORR-${correctionId}`,
    actionId: `ACT-${correctionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'staff-1',
    reason: 'Price correction',
    calculation,
  }
}

function order(corrections) {
  orderId++
  const obj = {
    id: `ORD-${orderId}`,
    orderRef: `REF-${orderId}`,
    createdAt: '2026-08-01T09:00:00Z',
    customer: { ref: `CUST-${orderId}`, name: `Customer ${orderId}` },
    channel: 'counter',
    status: 'confirmed',
    lines: [],
    payment: { method: 'cash', status: 'paid' },
    fulfilment: { method: 'counter' },
  }
  if (corrections !== undefined) obj.corrections = corrections
  return obj
}

function state(orders) {
  return {
    schema: 'supermega.commerce.workspace.v2',
    revision: 0,
    orders,
    catalog: [],
    inventory: [],
  }
}

// 1. No orders → all zeros / nulls
{
  const r = projectShopOrderCorrectionTaxEffectiveFromBrief(state([]))
  check(r.totalCorrections === 0, 'empty: totalCorrections 0')
  check(r.correctionsWithTaxEffectiveFrom === 0, 'empty: correctionsWithTaxEffectiveFrom 0')
  check(r.taxEffectiveFromPresenceRate === 0, 'empty: presenceRate 0')
  check(r.earliestTaxEffectiveFrom === null, 'empty: earliest null')
  check(r.latestTaxEffectiveFrom === null, 'empty: latest null')
  check(r.uniqueTaxEffectiveFromDates === 0, 'empty: uniqueDates 0')
  check(r.topTaxEffectiveFromDatesByCount.length === 0, 'empty: top empty')
}

// 2. Orders without corrections skipped
{
  const r = projectShopOrderCorrectionTaxEffectiveFromBrief(state([order(), order()]))
  check(r.totalCorrections === 0, 'no-corr: totalCorrections 0')
}

// 3. Corrections with null taxEffectiveFrom
{
  const r = projectShopOrderCorrectionTaxEffectiveFromBrief(
    state([order([correction(null), correction(null)])]),
  )
  check(r.totalCorrections === 2, 'null-eff: totalCorrections 2')
  check(r.correctionsWithTaxEffectiveFrom === 0, 'null-eff: correctionsWithTaxEffectiveFrom 0')
  check(r.taxEffectiveFromPresenceRate === 0, 'null-eff: presenceRate 0')
}

// 4. Single correction with taxEffectiveFrom
{
  const r = projectShopOrderCorrectionTaxEffectiveFromBrief(
    state([order([correction('2026-01-01')])]),
  )
  check(r.totalCorrections === 1, 'single: totalCorrections 1')
  check(r.correctionsWithTaxEffectiveFrom === 1, 'single: correctionsWithTaxEffectiveFrom 1')
  check(r.taxEffectiveFromPresenceRate === 100, 'single: presenceRate 100')
  check(r.earliestTaxEffectiveFrom === '2026-01-01', 'single: earliest')
  check(r.latestTaxEffectiveFrom === '2026-01-01', 'single: latest equals earliest')
  check(r.uniqueTaxEffectiveFromDates === 1, 'single: uniqueDates 1')
  check(r.topTaxEffectiveFromDatesByCount[0]?.date === '2026-01-01', 'single: top date')
}

// 5. Date range across multiple corrections
{
  const r = projectShopOrderCorrectionTaxEffectiveFromBrief(
    state([
      order([correction('2026-03-01'), correction('2026-01-01')]),
      order([correction('2026-06-01')]),
    ]),
  )
  check(r.totalCorrections === 3, 'range: totalCorrections 3')
  check(r.correctionsWithTaxEffectiveFrom === 3, 'range: correctionsWithTaxEffectiveFrom 3')
  check(r.earliestTaxEffectiveFrom === '2026-01-01', 'range: earliest')
  check(r.latestTaxEffectiveFrom === '2026-06-01', 'range: latest')
}

// 6. Date distribution
{
  const r = projectShopOrderCorrectionTaxEffectiveFromBrief(
    state([
      order([correction('2026-01-01'), correction('2026-01-01'), correction('2026-04-01')]),
    ]),
  )
  check(r.uniqueTaxEffectiveFromDates === 2, 'dist: uniqueDates 2')
  check(r.topTaxEffectiveFromDatesByCount[0]?.date === '2026-01-01', 'dist: top date 2026-01-01')
  check(r.topTaxEffectiveFromDatesByCount[0]?.count === 2, 'dist: count 2')
}

// 7. Mixed — some with date, some null
{
  const r = projectShopOrderCorrectionTaxEffectiveFromBrief(
    state([order([correction('2026-01-01'), correction(null), correction('2026-04-01'), correction(null)])]),
  )
  check(r.totalCorrections === 4, 'mixed: totalCorrections 4')
  check(r.correctionsWithTaxEffectiveFrom === 2, 'mixed: correctionsWithTaxEffectiveFrom 2')
  check(r.taxEffectiveFromPresenceRate === 50, 'mixed: presenceRate 50')
}

// 8. Top-5 cap + tiebreak
{
  const dates = ['2026-12-01', '2026-01-01', '2026-06-01', '2026-03-01', '2026-09-01', '2026-04-01']
  const r = projectShopOrderCorrectionTaxEffectiveFromBrief(
    state([order(dates.map(d => correction(d)))]),
  )
  check(r.topTaxEffectiveFromDatesByCount.length === 5, 'top5: capped at 5')
  check(r.topTaxEffectiveFromDatesByCount[0]?.date === '2026-01-01', 'top5: tiebreak earliest date first')
}

// 9. Presence rate rounds: 1 of 3 → 33%
{
  const r = projectShopOrderCorrectionTaxEffectiveFromBrief(
    state([order([correction('2026-01-01'), correction(null), correction(null)])]),
  )
  check(r.taxEffectiveFromPresenceRate === 33, 'round: presenceRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
