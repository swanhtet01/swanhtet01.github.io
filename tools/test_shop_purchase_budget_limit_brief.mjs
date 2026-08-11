// Shop purchase budget limit brief: perRequisitionLimitMmk aggregates.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPurchaseBudgetLimitBrief } from './shop-purchase-budget-limit-brief.ts'`,
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

const { projectShopPurchaseBudgetLimitBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let envelopeId = 0
function envelope({ perRequisitionLimitMmk = 100000, ceilingMmk = 500000 } = {}) {
  envelopeId++
  return {
    id: `env-${envelopeId}`,
    createdAt: '2026-08-11T08:00:00Z',
    budgetCode: `BUDGET-${envelopeId}`,
    label: `Budget ${envelopeId}`,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    ceilingMmk,
    perRequisitionLimitMmk,
    approval: { actionId: `act-${envelopeId}`, savedAt: '2026-08-11T08:00:00Z', savedBy: 'finance-01' },
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

// 1. No envelopes (undefined) → all zeros, nulls
{
  const r = projectShopPurchaseBudgetLimitBrief({ ...state([]), purchaseBudgetEnvelopes: undefined })
  check(r.totalEnvelopes === 0, 'no-envelopes: total 0')
  check(r.totalPerRequisitionLimitMmk === 0, 'no-envelopes: totalLimit 0')
  check(r.averagePerRequisitionLimitMmk === 0, 'no-envelopes: avg 0')
  check(r.minPerRequisitionLimitMmk === null, 'no-envelopes: min null')
  check(r.maxPerRequisitionLimitMmk === null, 'no-envelopes: max null')
}

// 2. Empty array → all zeros, nulls
{
  const r = projectShopPurchaseBudgetLimitBrief(state([]))
  check(r.totalEnvelopes === 0, 'empty: total 0')
  check(r.minPerRequisitionLimitMmk === null, 'empty: min null')
  check(r.maxPerRequisitionLimitMmk === null, 'empty: max null')
}

// 3. Single envelope
{
  const r = projectShopPurchaseBudgetLimitBrief(state([envelope({ perRequisitionLimitMmk: 50000 })]))
  check(r.totalEnvelopes === 1, 'single: total 1')
  check(r.totalPerRequisitionLimitMmk === 50000, 'single: totalLimit 50000')
  check(r.averagePerRequisitionLimitMmk === 50000, 'single: avg 50000')
  check(r.minPerRequisitionLimitMmk === 50000, 'single: min 50000')
  check(r.maxPerRequisitionLimitMmk === 50000, 'single: max 50000')
}

// 4. Two envelopes, same limit
{
  const r = projectShopPurchaseBudgetLimitBrief(state([
    envelope({ perRequisitionLimitMmk: 100000 }),
    envelope({ perRequisitionLimitMmk: 100000 }),
  ]))
  check(r.totalEnvelopes === 2, 'same-limit: total 2')
  check(r.totalPerRequisitionLimitMmk === 200000, 'same-limit: total 200000')
  check(r.averagePerRequisitionLimitMmk === 100000, 'same-limit: avg 100000')
  check(r.minPerRequisitionLimitMmk === 100000, 'same-limit: min 100000')
  check(r.maxPerRequisitionLimitMmk === 100000, 'same-limit: max 100000')
}

// 5. Two envelopes, different limits — min/max tracking
{
  const r = projectShopPurchaseBudgetLimitBrief(state([
    envelope({ perRequisitionLimitMmk: 50000 }),
    envelope({ perRequisitionLimitMmk: 200000 }),
  ]))
  check(r.minPerRequisitionLimitMmk === 50000, 'min-max: min 50000')
  check(r.maxPerRequisitionLimitMmk === 200000, 'min-max: max 200000')
  check(r.totalPerRequisitionLimitMmk === 250000, 'min-max: total 250000')
  check(r.averagePerRequisitionLimitMmk === 125000, 'min-max: avg 125000')
}

// 6. Three envelopes — min from first, max from last
{
  const r = projectShopPurchaseBudgetLimitBrief(state([
    envelope({ perRequisitionLimitMmk: 100000 }),
    envelope({ perRequisitionLimitMmk: 200000 }),
    envelope({ perRequisitionLimitMmk: 50000 }),
  ]))
  check(r.minPerRequisitionLimitMmk === 50000, 'three: min 50000 (third)')
  check(r.maxPerRequisitionLimitMmk === 200000, 'three: max 200000 (second)')
  check(r.totalPerRequisitionLimitMmk === 350000, 'three: total 350000')
}

// 7. Average rounds — 100000 + 200001 = 300001 / 2 = 150000.5 → 150001
{
  const r = projectShopPurchaseBudgetLimitBrief(state([
    envelope({ perRequisitionLimitMmk: 100000 }),
    envelope({ perRequisitionLimitMmk: 200001 }),
  ]))
  check(r.averagePerRequisitionLimitMmk === 150001, 'round: avg 150001 (Math.round(150000.5))')
}

// 8. Large set
{
  const envs = [10000, 20000, 30000, 40000, 50000].map(lim => envelope({ perRequisitionLimitMmk: lim }))
  const r = projectShopPurchaseBudgetLimitBrief(state(envs))
  check(r.totalEnvelopes === 5, 'large: total 5')
  check(r.totalPerRequisitionLimitMmk === 150000, 'large: total 150000')
  check(r.averagePerRequisitionLimitMmk === 30000, 'large: avg 30000')
  check(r.minPerRequisitionLimitMmk === 10000, 'large: min 10000')
  check(r.maxPerRequisitionLimitMmk === 50000, 'large: max 50000')
}

console.log(JSON.stringify({ ok: true, checks }))
