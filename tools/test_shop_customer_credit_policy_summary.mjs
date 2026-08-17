// Shop customer credit policy summary: totalPolicies, uniqueCustomers, byStatus, byPaymentTerms,
// totalCreditLimitMmk, averageCreditLimitMmk.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopCustomerCreditPolicySummary } from './shop-customer-credit-policy-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/customer-credit-policy-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopCustomerCreditPolicySummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1', reason: 'r', evidenceReference: 'e' }
let seq = 0

function policy({
  customer = 'CUST-A',
  creditLimitMmk = 500_000,
  maxPaymentTermsDays = 30,
  status = 'active',
} = {}) {
  seq++
  return { revision: seq, customer, creditLimitMmk, maxPaymentTermsDays, status, proof: PROOF }
}

function state(customerCreditPolicies = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(customerCreditPolicies !== undefined ? { customerCreditPolicies } : {}),
  }
}

// 1. Empty state (no field) → all zeros
{
  const r = projectShopCustomerCreditPolicySummary(state())
  check(r.totalPolicies === 0, 'empty: totalPolicies 0')
  check(r.uniqueCustomers === 0, 'empty: uniqueCustomers 0')
  check(r.byStatus.active === 0, 'empty: byStatus.active 0')
  check(r.byStatus.hold === 0, 'empty: byStatus.hold 0')
  check(r.byPaymentTerms.d0 === 0, 'empty: byPaymentTerms.d0 0')
  check(r.byPaymentTerms.d7 === 0, 'empty: byPaymentTerms.d7 0')
  check(r.byPaymentTerms.d30 === 0, 'empty: byPaymentTerms.d30 0')
  check(r.totalCreditLimitMmk === 0, 'empty: totalCreditLimitMmk 0')
  check(r.averageCreditLimitMmk === 0, 'empty: averageCreditLimitMmk 0')
}

// 2. Empty array → totalPolicies 0
{
  const r = projectShopCustomerCreditPolicySummary(state([]))
  check(r.totalPolicies === 0, 'empty-array: totalPolicies 0')
}

// 3. Single active policy, d30, linked customer
{
  const r = projectShopCustomerCreditPolicySummary(state([
    policy({ customer: 'CUST-A', creditLimitMmk: 1_000_000, maxPaymentTermsDays: 30, status: 'active' }),
  ]))
  check(r.totalPolicies === 1, 'single: totalPolicies 1')
  check(r.uniqueCustomers === 1, 'single: uniqueCustomers 1')
  check(r.byStatus.active === 1, 'single: byStatus.active 1')
  check(r.byStatus.hold === 0, 'single: byStatus.hold 0')
  check(r.byPaymentTerms.d30 === 1, 'single: byPaymentTerms.d30 1')
  check(r.byPaymentTerms.d7 === 0, 'single: byPaymentTerms.d7 0')
  check(r.byPaymentTerms.d0 === 0, 'single: byPaymentTerms.d0 0')
  check(r.totalCreditLimitMmk === 1_000_000, 'single: totalCreditLimitMmk 1M')
  check(r.averageCreditLimitMmk === 1_000_000, 'single: averageCreditLimitMmk 1M')
}

// 4. hold status increments hold
{
  const r = projectShopCustomerCreditPolicySummary(state([
    policy({ status: 'hold' }),
  ]))
  check(r.byStatus.hold === 1, 'hold: byStatus.hold 1')
  check(r.byStatus.active === 0, 'hold: byStatus.active 0')
}

// 5. uniqueCustomers dedup: same customer 2 revisions → 1
{
  const r = projectShopCustomerCreditPolicySummary(state([
    policy({ customer: 'CUST-X' }),
    policy({ customer: 'CUST-X' }),
  ]))
  check(r.uniqueCustomers === 1, 'dedup-cust: uniqueCustomers 1')
  check(r.totalPolicies === 2, 'dedup-cust: totalPolicies 2')
}

// 6. byPaymentTerms: d0, d7, d30 each incremented
{
  const r = projectShopCustomerCreditPolicySummary(state([
    policy({ customer: 'CUST-1', maxPaymentTermsDays: 0 }),
    policy({ customer: 'CUST-2', maxPaymentTermsDays: 7 }),
    policy({ customer: 'CUST-3', maxPaymentTermsDays: 30 }),
  ]))
  check(r.byPaymentTerms.d0 === 1, 'terms: d0 1')
  check(r.byPaymentTerms.d7 === 1, 'terms: d7 1')
  check(r.byPaymentTerms.d30 === 1, 'terms: d30 1')
}

// 7. totalCreditLimitMmk accumulates
{
  const r = projectShopCustomerCreditPolicySummary(state([
    policy({ creditLimitMmk: 500_000 }),
    policy({ creditLimitMmk: 300_000 }),
  ]))
  check(r.totalCreditLimitMmk === 800_000, 'limit-accum: 500k+300k=800k')
}

// 8. averageCreditLimitMmk rounds: (500001 + 500000) / 2 = 500000.5 → 500001
{
  const r = projectShopCustomerCreditPolicySummary(state([
    policy({ creditLimitMmk: 500_001 }),
    policy({ creditLimitMmk: 500_000 }),
  ]))
  check(r.averageCreditLimitMmk === 500_001, 'avg-round: Math.round(500000.5)=500001')
}

// 9. byStatus: 2 active, 1 hold
{
  const r = projectShopCustomerCreditPolicySummary(state([
    policy({ status: 'active' }),
    policy({ status: 'active' }),
    policy({ status: 'hold' }),
  ]))
  check(r.byStatus.active === 2, 'status-mix: active 2')
  check(r.byStatus.hold === 1, 'status-mix: hold 1')
}

console.log(JSON.stringify({ ok: true, checks }))
