// Shop order lifecycle summary: cross-field coverage across all decision/audit/advancement fields.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderLifecycleSummary } from './shop-order-lifecycle-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-lifecycle-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderLifecycleSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

const PAYMENT_DECISION = {
  schema: 'supermega.commerce.payment-decision.v1', status: 'approved', reason: 'approved',
  adapter: 'pay_on_pickup', policyRevision: null, policyActionId: null,
  maximumOrderMmk: null, instructions: null, reviewedAt: '2026-01-01T00:00:00Z', authorized: false,
}
const SHIPPING_DECISION = {
  schema: 'supermega.commerce.shipping-decision.v1', status: 'pickup', reason: 'pickup',
  township: null, zoneCode: null, policyRevision: null, policyActionId: null,
  feeMmk: 0, promiseMinutes: null, reviewedAt: '2026-01-01T00:00:00Z',
}
const TAX_DECISION = {
  schema: 'supermega.ecommerce.tax-decision.v1', status: 'not_configured', catalogRevision: 1,
  taxConfigurationRevision: null, taxCode: null, taxJurisdictionCode: null, taxEffectiveFrom: null,
  taxRateBasisPoints: 0, taxMode: 'not_configured', listedSubtotalMmk: 10000,
  subtotalMmk: 10000, taxMmk: 0, totalMmk: 10000, policyActionId: null, reviewedAt: '2026-01-01T00:00:00Z',
}
const CREDIT_DECISION = {
  policyRevision: 1, policyActionId: 'POL-1', creditLimitMmk: 100000,
  exposureBeforeMmk: 0, orderAmountMmk: 50000, exposureAfterMmk: 50000,
  maxPaymentTermsDays: 30, paymentTermsDays: 7, status: 'approved',
}
const CALCULATION = {
  schema: 'supermega.commerce.order-calculation.v1', currency: 'MMK', catalogRevision: 1,
  subtotalMmk: 10000, taxMode: 'not_configured', taxMmk: 0, totalMmk: 10000,
}
const COMPLETION = {
  actionId: 'DONE-1', capturedAt: '2026-01-10T00:00:00Z', actor: 'ops',
  reason: 'completed', evidenceReference: 'ref-1',
}

function order({ id = 'ORD-1', fields = {} } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 10000, status: 'confirmed',
    ...fields,
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state
{
  const r = projectShopOrderLifecycleSummary(state([]))
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.withPaymentDecision === 0, 'empty: withPaymentDecision 0')
  check(r.withShippingDecision === 0, 'empty: withShippingDecision 0')
  check(r.withTaxDecision === 0, 'empty: withTaxDecision 0')
  check(r.withCreditExtension === 0, 'empty: withCreditExtension 0')
  check(r.withCalculation === 0, 'empty: withCalculation 0')
  check(r.withAdvancement === 0, 'empty: withAdvancement 0')
  check(r.withCompletion === 0, 'empty: withCompletion 0')
  check(r.withReconciliation === 0, 'empty: withReconciliation 0')
}

// 2. Minimal order (no optional fields)
{
  const r = projectShopOrderLifecycleSummary(state([order({ id: 'ORD-1' })]))
  check(r.totalOrders === 1, 'min: totalOrders 1')
  check(r.withPaymentDecision === 0, 'min: withPaymentDecision 0')
  check(r.withCompletion === 0, 'min: withCompletion 0')
}

// 3. Fully-decorated order (all lifecycle fields)
{
  const r = projectShopOrderLifecycleSummary(state([
    order({ id: 'ORD-1', fields: {
      paymentDecision: PAYMENT_DECISION,
      shippingDecision: SHIPPING_DECISION,
      taxDecision: TAX_DECISION,
      creditDecision: CREDIT_DECISION,
      calculation: CALCULATION,
      advancementActionIds: ['ACT-1', 'ACT-2'],
      completion: COMPLETION,
      paymentReconciledAt: '2026-01-10T00:00:00Z',
    }}),
  ]))
  check(r.totalOrders === 1, 'full: totalOrders 1')
  check(r.withPaymentDecision === 1, 'full: withPaymentDecision 1')
  check(r.withShippingDecision === 1, 'full: withShippingDecision 1')
  check(r.withTaxDecision === 1, 'full: withTaxDecision 1')
  check(r.withCreditExtension === 1, 'full: withCreditExtension 1')
  check(r.withCalculation === 1, 'full: withCalculation 1')
  check(r.withAdvancement === 1, 'full: withAdvancement 1')
  check(r.withCompletion === 1, 'full: withCompletion 1')
  check(r.withReconciliation === 1, 'full: withReconciliation 1')
}

// 4. Three orders, mix of lifecycle stages
{
  const r = projectShopOrderLifecycleSummary(state([
    order({ id: 'ORD-1', fields: { paymentDecision: PAYMENT_DECISION, calculation: CALCULATION } }),
    order({ id: 'ORD-2', fields: { paymentDecision: PAYMENT_DECISION, shippingDecision: SHIPPING_DECISION, completion: COMPLETION, paymentReconciledAt: '2026-01-10T00:00:00Z' } }),
    order({ id: 'ORD-3', fields: { taxDecision: TAX_DECISION, advancementActionIds: ['ACT-1'] } }),
  ]))
  check(r.totalOrders === 3, 'mix: totalOrders 3')
  check(r.withPaymentDecision === 2, 'mix: withPaymentDecision 2')
  check(r.withShippingDecision === 1, 'mix: withShippingDecision 1')
  check(r.withTaxDecision === 1, 'mix: withTaxDecision 1')
  check(r.withCalculation === 1, 'mix: withCalculation 1')
  check(r.withAdvancement === 1, 'mix: withAdvancement 1')
  check(r.withCompletion === 1, 'mix: withCompletion 1')
  check(r.withReconciliation === 1, 'mix: withReconciliation 1')
  check(r.withCreditExtension === 0, 'mix: withCreditExtension 0 (none have credit)')
}

console.log(JSON.stringify({ ok: true, checks }))
