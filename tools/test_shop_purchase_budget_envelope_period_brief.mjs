// Shop purchase budget envelope period brief: ceilingMmk stats + label distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseBudgetEnvelopePeriodBrief } from './shop-purchase-budget-envelope-period-brief.ts'`,
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

const { projectShopPurchaseBudgetEnvelopePeriodBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let envId = 0
function envelope({ label = 'Operations', ceilingMmk = 500000 } = {}) {
  envId++
  return {
    id: `env-${envId}`,
    createdAt: '2026-08-11T08:00:00Z',
    budgetCode: `BUDGET-${envId}`,
    label,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    ceilingMmk,
    perRequisitionLimitMmk: 100000,
    approval: { actionId: `act-${envId}`, savedAt: '2026-08-11T08:00:00Z', savedBy: 'finance-01' },
  }
}

function state(envelopes) {
  return {
    schema: 'supermega.commerce.workspace.v3',
    revision: 1,
    orders: [],
    purchaseOrders: [],
    movements: [],
    taxConfigurations: [],
    customerCreditPolicies: [],
    promotionPolicies: [],
    shippingPolicies: [],
    paymentPolicies: [],
    catalogChanges: [],
    purchaseBudgetEnvelopes: envelopes ?? [],
    purchaseRequisitions: [],
    supplierSourcingDecisions: [],
    websiteIntakes: [],
  }
}

// 1. Empty → all zeros / nulls
{
  const r = projectShopPurchaseBudgetEnvelopePeriodBrief(state([]))
  check(r.totalEnvelopes === 0, 'empty: totalEnvelopes 0')
  check(r.totalCeilingMmk === 0, 'empty: totalCeilingMmk 0')
  check(r.averageCeilingMmk === 0, 'empty: avgCeiling 0')
  check(r.minCeilingMmk === null, 'empty: minCeiling null')
  check(r.maxCeilingMmk === null, 'empty: maxCeiling null')
  check(r.uniqueLabels === 0, 'empty: uniqueLabels 0')
  check(r.topLabelsByCount.length === 0, 'empty: topLabels empty')
}

// 2. Single envelope
{
  const r = projectShopPurchaseBudgetEnvelopePeriodBrief(state([envelope({ label: 'Maintenance', ceilingMmk: 200000 })]))
  check(r.totalEnvelopes === 1, 'single: totalEnvelopes 1')
  check(r.totalCeilingMmk === 200000, 'single: totalCeiling 200000')
  check(r.averageCeilingMmk === 200000, 'single: avgCeiling 200000')
  check(r.minCeilingMmk === 200000, 'single: minCeiling 200000')
  check(r.maxCeilingMmk === 200000, 'single: maxCeiling 200000')
  check(r.uniqueLabels === 1, 'single: uniqueLabels 1')
  check(r.topLabelsByCount[0].label === 'Maintenance', 'single: label Maintenance')
  check(r.topLabelsByCount[0].count === 1, 'single: count 1')
}

// 3. Two envelopes: min/max/avg ceiling
{
  const r = projectShopPurchaseBudgetEnvelopePeriodBrief(state([
    envelope({ label: 'Ops', ceilingMmk: 100000 }),
    envelope({ label: 'Maint', ceilingMmk: 300000 }),
  ]))
  check(r.totalEnvelopes === 2, 'two: totalEnvelopes 2')
  check(r.totalCeilingMmk === 400000, 'two: totalCeiling 400000')
  check(r.averageCeilingMmk === 200000, 'two: avgCeiling 200000')
  check(r.minCeilingMmk === 100000, 'two: minCeiling 100000')
  check(r.maxCeilingMmk === 300000, 'two: maxCeiling 300000')
  check(r.uniqueLabels === 2, 'two: uniqueLabels 2')
}

// 4. Same label on multiple envelopes
{
  const r = projectShopPurchaseBudgetEnvelopePeriodBrief(state([
    envelope({ label: 'Operations' }),
    envelope({ label: 'Operations' }),
    envelope({ label: 'Maintenance' }),
  ]))
  check(r.uniqueLabels === 2, 'same-label: uniqueLabels 2')
  check(r.topLabelsByCount[0].label === 'Operations', 'same-label: Operations top (count 2)')
  check(r.topLabelsByCount[0].count === 2, 'same-label: count 2')
  check(r.topLabelsByCount[1].label === 'Maintenance', 'same-label: Maintenance second')
}

// 5. Label secondary sort: same count → alphabetical
{
  const r = projectShopPurchaseBudgetEnvelopePeriodBrief(state([
    envelope({ label: 'zz-label' }),
    envelope({ label: 'aa-label' }),
  ]))
  check(r.topLabelsByCount[0].label === 'aa-label', 'secondary: aa before zz')
}

// 6. 6 labels → top 5
{
  const envelopes = ['A', 'B', 'C', 'D', 'E', 'F'].map(l => envelope({ label: `label-${l}` }))
  const r = projectShopPurchaseBudgetEnvelopePeriodBrief(state(envelopes))
  check(r.uniqueLabels === 6, 'top-5: unique 6')
  check(r.topLabelsByCount.length === 5, 'top-5: capped at 5')
}

// 7. Ceiling rounding: 1000/3 → 333
{
  const r = projectShopPurchaseBudgetEnvelopePeriodBrief(state([
    envelope({ ceilingMmk: 100 }),
    envelope({ ceilingMmk: 300 }),
    envelope({ ceilingMmk: 600 }),
  ]))
  check(r.totalCeilingMmk === 1000, 'rounding: total 1000')
  check(r.averageCeilingMmk === 333, 'rounding: avg 333 (Math.round(1000/3))')
}

console.log(JSON.stringify({ ok: true, checks }))
