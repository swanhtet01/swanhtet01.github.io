// Shop order credit decision summary: ordersWithCreditDecision, totalCreditExtendedMmk, totalExposureAfterMmk, byPaymentTermsDays.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderCreditDecisionSummary } from './shop-order-credit-decision-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-credit-decision-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderCreditDecisionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function creditDecision({ orderAmountMmk = 50000, exposureAfterMmk = 50000, paymentTermsDays = 7, creditLimitMmk = 100000, exposureBeforeMmk = 0, maxPaymentTermsDays = 30 } = {}) {
  return {
    policyRevision: 1, policyActionId: 'POL-1',
    creditLimitMmk, exposureBeforeMmk, orderAmountMmk, exposureAfterMmk,
    maxPaymentTermsDays, paymentTermsDays, status: 'approved',
  }
}

function order({ creditDecision: cd = undefined, id = 'ORD-1' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'credit',
    paymentStatus: 'pending', refundStatus: 'none', total: 50000, status: 'confirmed',
    ...(cd !== undefined ? { creditDecision: cd } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zero
{
  const r = projectShopOrderCreditDecisionSummary(state([]))
  check(r.ordersWithCreditDecision === 0, 'empty: ordersWithCreditDecision 0')
  check(r.totalCreditExtendedMmk === 0, 'empty: totalCreditExtendedMmk 0')
  check(r.totalExposureAfterMmk === 0, 'empty: totalExposureAfterMmk 0')
  check(r.byPaymentTermsDays['7'] === 0, 'empty: byPaymentTermsDays.7 0')
  check(r.byPaymentTermsDays['30'] === 0, 'empty: byPaymentTermsDays.30 0')
}

// 2. Orders without creditDecision
{
  const r = projectShopOrderCreditDecisionSummary(state([order({ id: 'ORD-1' }), order({ id: 'ORD-2' })]))
  check(r.ordersWithCreditDecision === 0, 'no-decision: ordersWithCreditDecision 0')
  check(r.totalCreditExtendedMmk === 0, 'no-decision: totalCreditExtendedMmk 0')
}

// 3. Single 7-day credit decision
{
  const r = projectShopOrderCreditDecisionSummary(state([
    order({ id: 'ORD-1', creditDecision: creditDecision({ orderAmountMmk: 50000, exposureAfterMmk: 50000, paymentTermsDays: 7 }) }),
  ]))
  check(r.ordersWithCreditDecision === 1, '7day: ordersWithCreditDecision 1')
  check(r.totalCreditExtendedMmk === 50000, '7day: totalCreditExtendedMmk 50000')
  check(r.totalExposureAfterMmk === 50000, '7day: totalExposureAfterMmk 50000')
  check(r.byPaymentTermsDays['7'] === 1, '7day: byPaymentTermsDays.7 1')
  check(r.byPaymentTermsDays['30'] === 0, '7day: byPaymentTermsDays.30 0')
}

// 4. Single 30-day credit decision
{
  const r = projectShopOrderCreditDecisionSummary(state([
    order({ id: 'ORD-1', creditDecision: creditDecision({ orderAmountMmk: 80000, exposureAfterMmk: 80000, paymentTermsDays: 30 }) }),
  ]))
  check(r.byPaymentTermsDays['30'] === 1, '30day: byPaymentTermsDays.30 1')
  check(r.totalCreditExtendedMmk === 80000, '30day: totalCreditExtendedMmk 80000')
}

// 5. Two orders accumulate
{
  const r = projectShopOrderCreditDecisionSummary(state([
    order({ id: 'ORD-1', creditDecision: creditDecision({ orderAmountMmk: 30000, exposureAfterMmk: 30000, paymentTermsDays: 7 }) }),
    order({ id: 'ORD-2', creditDecision: creditDecision({ orderAmountMmk: 50000, exposureAfterMmk: 80000, paymentTermsDays: 30 }) }),
  ]))
  check(r.ordersWithCreditDecision === 2, '2orders: ordersWithCreditDecision 2')
  check(r.totalCreditExtendedMmk === 80000, '2orders: totalCreditExtendedMmk 80000')
  check(r.totalExposureAfterMmk === 110000, '2orders: totalExposureAfterMmk 110000')
  check(r.byPaymentTermsDays['7'] === 1, '2orders: byPaymentTermsDays.7 1')
  check(r.byPaymentTermsDays['30'] === 1, '2orders: byPaymentTermsDays.30 1')
}

// 6. Mixed (one with, one without creditDecision)
{
  const r = projectShopOrderCreditDecisionSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', creditDecision: creditDecision({ orderAmountMmk: 20000, exposureAfterMmk: 20000, paymentTermsDays: 7 }) }),
  ]))
  check(r.ordersWithCreditDecision === 1, 'mixed: ordersWithCreditDecision 1')
  check(r.totalCreditExtendedMmk === 20000, 'mixed: totalCreditExtendedMmk 20000')
}

console.log(JSON.stringify({ ok: true, checks }))
