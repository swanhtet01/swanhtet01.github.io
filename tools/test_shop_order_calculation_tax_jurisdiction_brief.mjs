// Shop order calculation tax jurisdiction brief: taxJurisdictionCode + taxEffectiveFrom.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderCalculationTaxJurisdictionBrief } from './shop-order-calculation-tax-jurisdiction-brief.ts'`,
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

const { projectShopOrderCalculationTaxJurisdictionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let orderId = 0
function order({ taxJurisdictionCode, taxEffectiveFrom, hasCalculation = true } = {}) {
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
  if (hasCalculation) {
    const calc = { schema: 'supermega.commerce.order-calculation.v2', taxMode: 'inclusive', taxMmk: 0, currency: 'MMK', catalogRevision: 1, taxConfigurationRevision: 1, taxCode: 'STANDARD', taxRateBasisPoints: 500, listedSubtotalMmk: 1000, subtotalMmk: 1000, totalMmk: 1050 }
    if (taxJurisdictionCode !== undefined) calc.taxJurisdictionCode = taxJurisdictionCode
    if (taxEffectiveFrom !== undefined) calc.taxEffectiveFrom = taxEffectiveFrom
    obj.calculation = calc
  }
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
  const r = projectShopOrderCalculationTaxJurisdictionBrief(state([]))
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.ordersWithCalculation === 0, 'empty: ordersWithCalculation 0')
  check(r.ordersWithJurisdictionCode === 0, 'empty: ordersWithJurisdictionCode 0')
  check(r.jurisdictionCodePresenceRate === 0, 'empty: jurisdictionCodePresenceRate 0')
  check(r.uniqueJurisdictionCodes === 0, 'empty: uniqueJurisdictionCodes 0')
  check(r.topJurisdictionCodesByCount.length === 0, 'empty: top empty')
  check(r.ordersWithTaxEffectiveFrom === 0, 'empty: ordersWithTaxEffectiveFrom 0')
  check(r.taxEffectiveFromPresenceRate === 0, 'empty: taxEffectiveFromPresenceRate 0')
  check(r.earliestTaxEffectiveFrom === null, 'empty: earliest null')
  check(r.latestTaxEffectiveFrom === null, 'empty: latest null')
}

// 2. Orders without calculation → ordersWithCalculation 0
{
  const r = projectShopOrderCalculationTaxJurisdictionBrief(
    state([order({ hasCalculation: false }), order({ hasCalculation: false })]),
  )
  check(r.totalOrders === 2, 'no-calc: totalOrders 2')
  check(r.ordersWithCalculation === 0, 'no-calc: ordersWithCalculation 0')
  check(r.jurisdictionCodePresenceRate === 0, 'no-calc: rate 0')
}

// 3. Orders with calculation but no jurisdiction/effectiveFrom fields
{
  const r = projectShopOrderCalculationTaxJurisdictionBrief(
    state([order(), order()]),
  )
  check(r.totalOrders === 2, 'calc-empty: totalOrders 2')
  check(r.ordersWithCalculation === 2, 'calc-empty: ordersWithCalculation 2')
  check(r.ordersWithJurisdictionCode === 0, 'calc-empty: ordersWithJurisdictionCode 0')
  check(r.ordersWithTaxEffectiveFrom === 0, 'calc-empty: ordersWithTaxEffectiveFrom 0')
}

// 4. Single order with jurisdictionCode
{
  const r = projectShopOrderCalculationTaxJurisdictionBrief(
    state([order({ taxJurisdictionCode: 'MM-YGN' })]),
  )
  check(r.ordersWithJurisdictionCode === 1, 'single-jur: ordersWithJurisdictionCode 1')
  check(r.jurisdictionCodePresenceRate === 100, 'single-jur: rate 100')
  check(r.uniqueJurisdictionCodes === 1, 'single-jur: uniqueJurisdictionCodes 1')
  check(r.topJurisdictionCodesByCount[0]?.code === 'MM-YGN', 'single-jur: top code')
}

// 5. Jurisdiction code distribution
{
  const r = projectShopOrderCalculationTaxJurisdictionBrief(
    state([
      order({ taxJurisdictionCode: 'MM-YGN' }),
      order({ taxJurisdictionCode: 'MM-YGN' }),
      order({ taxJurisdictionCode: 'MM-MDY' }),
    ]),
  )
  check(r.uniqueJurisdictionCodes === 2, 'jur-dist: uniqueJurisdictionCodes 2')
  check(r.topJurisdictionCodesByCount[0]?.code === 'MM-YGN', 'jur-dist: top MM-YGN')
  check(r.topJurisdictionCodesByCount[0]?.count === 2, 'jur-dist: count 2')
}

// 6. taxEffectiveFrom date range
{
  const r = projectShopOrderCalculationTaxJurisdictionBrief(
    state([
      order({ taxEffectiveFrom: '2026-03-01' }),
      order({ taxEffectiveFrom: '2026-01-01' }),
      order({ taxEffectiveFrom: '2026-06-01' }),
    ]),
  )
  check(r.ordersWithTaxEffectiveFrom === 3, 'eff-date: ordersWithTaxEffectiveFrom 3')
  check(r.taxEffectiveFromPresenceRate === 100, 'eff-date: rate 100')
  check(r.earliestTaxEffectiveFrom === '2026-01-01', 'eff-date: earliest')
  check(r.latestTaxEffectiveFrom === '2026-06-01', 'eff-date: latest')
}

// 7. Mixed — some with code, some without; some with effectiveFrom, some without
{
  const r = projectShopOrderCalculationTaxJurisdictionBrief(
    state([
      order({ taxJurisdictionCode: 'MM-YGN', taxEffectiveFrom: '2026-01-01' }),
      order(),
      order({ taxJurisdictionCode: 'MM-MDY' }),
      order({ taxEffectiveFrom: '2026-06-01' }),
    ]),
  )
  check(r.ordersWithCalculation === 4, 'mixed: ordersWithCalculation 4')
  check(r.ordersWithJurisdictionCode === 2, 'mixed: ordersWithJurisdictionCode 2')
  check(r.jurisdictionCodePresenceRate === 50, 'mixed: jurisdictionCodePresenceRate 50')
  check(r.ordersWithTaxEffectiveFrom === 2, 'mixed: ordersWithTaxEffectiveFrom 2')
  check(r.taxEffectiveFromPresenceRate === 50, 'mixed: taxEffectiveFromPresenceRate 50')
}

// 8. Top-5 cap + tiebreak on jurisdiction codes
{
  const codes = ['Z-JUR', 'A-JUR', 'C-JUR', 'B-JUR', 'D-JUR', 'E-JUR']
  const r = projectShopOrderCalculationTaxJurisdictionBrief(
    state(codes.map(c => order({ taxJurisdictionCode: c }))),
  )
  check(r.topJurisdictionCodesByCount.length === 5, 'top5: capped at 5')
  check(r.topJurisdictionCodesByCount[0]?.code === 'A-JUR', 'top5: tiebreak A-JUR first')
}

// 9. Presence rate rounds: 1 of 3 → 33%
{
  const r = projectShopOrderCalculationTaxJurisdictionBrief(
    state([order({ taxJurisdictionCode: 'MM-YGN' }), order(), order()]),
  )
  check(r.jurisdictionCodePresenceRate === 33, 'round: rate 33')
}

// 10. Single taxEffectiveFrom — earliest = latest
{
  const r = projectShopOrderCalculationTaxJurisdictionBrief(
    state([order({ taxEffectiveFrom: '2026-04-01' })]),
  )
  check(r.earliestTaxEffectiveFrom === '2026-04-01', 'single-eff: earliest')
  check(r.latestTaxEffectiveFrom === '2026-04-01', 'single-eff: latest equals earliest')
}

console.log(JSON.stringify({ ok: true, checks }))
