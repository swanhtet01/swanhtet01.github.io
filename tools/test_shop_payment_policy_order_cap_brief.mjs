// Shop payment policy order cap brief: maximumOrderMmk coverage and aggregates.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPaymentPolicyOrderCapBrief } from './shop-payment-policy-order-cap-brief.ts'`,
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

const { projectShopPaymentPolicyOrderCapBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let rev = 0
function policy({ maximumOrderMmk = null, status = 'active' } = {}) {
  rev++
  return {
    revision: rev,
    adapter: 'cash_on_delivery',
    allowedFulfilments: ['delivery'],
    maximumOrderMmk,
    instructions: 'Pay on delivery.',
    status,
    effectiveFrom: '2026-08-01',
    effectiveUntil: null,
    proof: { actionId: `act-${rev}`, savedAt: '2026-08-11T08:00:00Z', savedBy: 'admin-01' },
  }
}

function state(policies) {
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
    paymentPolicies: policies ?? [],
    catalogChanges: [],
    purchaseBudgetEnvelopes: [],
    purchaseRequisitions: [],
    supplierSourcingDecisions: [],
    websiteIntakes: [],
  }
}

// 1. No policies → all zeros, nulls
{
  const r = projectShopPaymentPolicyOrderCapBrief({ ...state([]), paymentPolicies: undefined })
  check(r.totalPolicies === 0, 'no-policies: total 0')
  check(r.policiesWithOrderCap === 0, 'no-policies: withCap 0')
  check(r.orderCapRate === 0, 'no-policies: rate 0')
  check(r.totalMaximumOrderMmk === 0, 'no-policies: totalCap 0')
  check(r.averageMaximumOrderMmk === 0, 'no-policies: avg 0')
  check(r.minMaximumOrderMmk === null, 'no-policies: min null')
  check(r.maxMaximumOrderMmk === null, 'no-policies: max null')
}

// 2. Policy with null cap → not counted for cap metrics
{
  const r = projectShopPaymentPolicyOrderCapBrief(state([policy({ maximumOrderMmk: null })]))
  check(r.totalPolicies === 1, 'null-cap: total 1')
  check(r.policiesWithOrderCap === 0, 'null-cap: withCap 0')
  check(r.orderCapRate === 0, 'null-cap: rate 0')
  check(r.averageMaximumOrderMmk === 0, 'null-cap: avg 0')
  check(r.minMaximumOrderMmk === null, 'null-cap: min null')
}

// 3. Policy with cap
{
  const r = projectShopPaymentPolicyOrderCapBrief(state([policy({ maximumOrderMmk: 100000 })]))
  check(r.totalPolicies === 1, 'with-cap: total 1')
  check(r.policiesWithOrderCap === 1, 'with-cap: withCap 1')
  check(r.orderCapRate === 100, 'with-cap: rate 100')
  check(r.totalMaximumOrderMmk === 100000, 'with-cap: totalCap 100000')
  check(r.averageMaximumOrderMmk === 100000, 'with-cap: avg 100000')
  check(r.minMaximumOrderMmk === 100000, 'with-cap: min 100000')
  check(r.maxMaximumOrderMmk === 100000, 'with-cap: max 100000')
}

// 4. Mixed: one with cap, one without
{
  const r = projectShopPaymentPolicyOrderCapBrief(state([
    policy({ maximumOrderMmk: 200000 }),
    policy({ maximumOrderMmk: null }),
  ]))
  check(r.totalPolicies === 2, 'mixed: total 2')
  check(r.policiesWithOrderCap === 1, 'mixed: withCap 1')
  check(r.orderCapRate === 50, 'mixed: rate 50')
  check(r.totalMaximumOrderMmk === 200000, 'mixed: totalCap 200000')
  check(r.averageMaximumOrderMmk === 200000, 'mixed: avg only counts capped policies')
}

// 5. Two capped policies — min/max tracking
{
  const r = projectShopPaymentPolicyOrderCapBrief(state([
    policy({ maximumOrderMmk: 50000 }),
    policy({ maximumOrderMmk: 500000 }),
  ]))
  check(r.minMaximumOrderMmk === 50000, 'min-max: min 50000')
  check(r.maxMaximumOrderMmk === 500000, 'min-max: max 500000')
  check(r.totalMaximumOrderMmk === 550000, 'min-max: total 550000')
  check(r.averageMaximumOrderMmk === 275000, 'min-max: avg 275000')
}

// 6. Rate rounds — 1 of 3 with cap = 33%
{
  const r = projectShopPaymentPolicyOrderCapBrief(state([
    policy({ maximumOrderMmk: 100000 }),
    policy({ maximumOrderMmk: null }),
    policy({ maximumOrderMmk: null }),
  ]))
  check(r.orderCapRate === 33, 'rate-33: orderCapRate 33')
}

// 7. Average rounds — 100000 + 100001 = 200001 / 2 = 100000.5 → 100001
{
  const r = projectShopPaymentPolicyOrderCapBrief(state([
    policy({ maximumOrderMmk: 100000 }),
    policy({ maximumOrderMmk: 100001 }),
  ]))
  check(r.averageMaximumOrderMmk === 100001, 'round: avg 100001 (Math.round(100000.5))')
}

// 8. Three caps: 100000 added in middle order
{
  const r = projectShopPaymentPolicyOrderCapBrief(state([
    policy({ maximumOrderMmk: 300000 }),
    policy({ maximumOrderMmk: 100000 }),
    policy({ maximumOrderMmk: 200000 }),
  ]))
  check(r.minMaximumOrderMmk === 100000, 'three: min 100000 (middle)')
  check(r.maxMaximumOrderMmk === 300000, 'three: max 300000 (first)')
}

console.log(JSON.stringify({ ok: true, checks }))
