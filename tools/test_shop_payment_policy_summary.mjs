// Shop payment policy summary: totalPolicies, activePolicies, inactivePolicies,
// byAdapter (pay_on_pickup/cash_on_delivery/kbzpay_manual), policiesAllowingPickup,
// policiesAllowingDelivery, policiesWithNoExpiry.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopPaymentPolicySummary } from './shop-payment-policy-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/payment-policy-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopPaymentPolicySummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1' }
let rev = 0

function policy({ adapter = 'pay_on_pickup', allowedFulfilments = ['pickup'], maximumOrderMmk = null, status = 'active', effectiveUntil = null } = {}) {
  return {
    revision: ++rev,
    adapter,
    allowedFulfilments,
    maximumOrderMmk,
    instructions: 'pay at counter',
    status,
    effectiveFrom: '2026-08-01',
    effectiveUntil,
    proof: PROOF,
  }
}

function state(paymentPolicies = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(paymentPolicies !== undefined ? { paymentPolicies } : {}),
  }
}

// 1. Empty state (no field) → all zeros
{
  const r = projectShopPaymentPolicySummary(state())
  check(r.totalPolicies === 0, 'empty: totalPolicies 0')
  check(r.activePolicies === 0, 'empty: activePolicies 0')
  check(r.byAdapter.pay_on_pickup === 0, 'empty: byAdapter.pay_on_pickup 0')
  check(r.policiesAllowingPickup === 0, 'empty: policiesAllowingPickup 0')
  check(r.policiesAllowingDelivery === 0, 'empty: policiesAllowingDelivery 0')
  check(r.policiesWithNoExpiry === 0, 'empty: policiesWithNoExpiry 0')
}

// 2. Empty array → totalPolicies 0
{
  const r = projectShopPaymentPolicySummary(state([]))
  check(r.totalPolicies === 0, 'empty-array: totalPolicies 0')
}

// 3. Single active, pay_on_pickup, pickup only, no expiry
{
  const r = projectShopPaymentPolicySummary(state([
    policy({ adapter: 'pay_on_pickup', allowedFulfilments: ['pickup'], effectiveUntil: null, status: 'active' }),
  ]))
  check(r.totalPolicies === 1, 'single: totalPolicies 1')
  check(r.activePolicies === 1, 'single: activePolicies 1')
  check(r.inactivePolicies === 0, 'single: inactivePolicies 0')
  check(r.byAdapter.pay_on_pickup === 1, 'single: byAdapter.pay_on_pickup 1')
  check(r.byAdapter.cash_on_delivery === 0, 'single: byAdapter.cash_on_delivery 0')
  check(r.byAdapter.kbzpay_manual === 0, 'single: byAdapter.kbzpay_manual 0')
  check(r.policiesAllowingPickup === 1, 'single: policiesAllowingPickup 1')
  check(r.policiesAllowingDelivery === 0, 'single: policiesAllowingDelivery 0')
  check(r.policiesWithNoExpiry === 1, 'single: policiesWithNoExpiry 1')
}

// 4. cash_on_delivery adapter
{
  const r = projectShopPaymentPolicySummary(state([
    policy({ adapter: 'cash_on_delivery' }),
  ]))
  check(r.byAdapter.cash_on_delivery === 1, 'cod: byAdapter.cash_on_delivery 1')
}

// 5. kbzpay_manual adapter
{
  const r = projectShopPaymentPolicySummary(state([
    policy({ adapter: 'kbzpay_manual' }),
  ]))
  check(r.byAdapter.kbzpay_manual === 1, 'kbz: byAdapter.kbzpay_manual 1')
}

// 6. Policy allowing both pickup and delivery → both counters increment
{
  const r = projectShopPaymentPolicySummary(state([
    policy({ allowedFulfilments: ['pickup', 'delivery'] }),
  ]))
  check(r.policiesAllowingPickup === 1, 'both: policiesAllowingPickup 1')
  check(r.policiesAllowingDelivery === 1, 'both: policiesAllowingDelivery 1')
}

// 7. Delivery-only policy
{
  const r = projectShopPaymentPolicySummary(state([
    policy({ allowedFulfilments: ['delivery'] }),
  ]))
  check(r.policiesAllowingPickup === 0, 'delivery-only: policiesAllowingPickup 0')
  check(r.policiesAllowingDelivery === 1, 'delivery-only: policiesAllowingDelivery 1')
}

// 8. Single inactive policy
{
  const r = projectShopPaymentPolicySummary(state([
    policy({ status: 'inactive' }),
  ]))
  check(r.inactivePolicies === 1, 'inactive: inactivePolicies 1')
  check(r.activePolicies === 0, 'inactive: activePolicies 0')
}

// 9. Policy with effectiveUntil set → policiesWithNoExpiry 0
{
  const r = projectShopPaymentPolicySummary(state([
    policy({ effectiveUntil: '2026-12-31' }),
  ]))
  check(r.policiesWithNoExpiry === 0, 'expiry-set: policiesWithNoExpiry 0')
}

// 10. byAdapter accumulates: 2 pay_on_pickup, 1 cash_on_delivery
{
  const r = projectShopPaymentPolicySummary(state([
    policy({ adapter: 'pay_on_pickup' }),
    policy({ adapter: 'pay_on_pickup' }),
    policy({ adapter: 'cash_on_delivery' }),
  ]))
  check(r.byAdapter.pay_on_pickup === 2, 'accum: pay_on_pickup 2')
  check(r.byAdapter.cash_on_delivery === 1, 'accum: cash_on_delivery 1')
}

// 11. Mixed active/inactive
{
  const r = projectShopPaymentPolicySummary(state([
    policy({ status: 'active' }),
    policy({ status: 'active' }),
    policy({ status: 'inactive' }),
  ]))
  check(r.activePolicies === 2, 'mixed: activePolicies 2')
  check(r.inactivePolicies === 1, 'mixed: inactivePolicies 1')
}

// 12. policiesWithNoExpiry accumulates
{
  const r = projectShopPaymentPolicySummary(state([
    policy({ effectiveUntil: null }),
    policy({ effectiveUntil: null }),
    policy({ effectiveUntil: '2026-12-31' }),
  ]))
  check(r.policiesWithNoExpiry === 2, 'no-expiry: policiesWithNoExpiry 2')
}

console.log(JSON.stringify({ ok: true, checks }))
