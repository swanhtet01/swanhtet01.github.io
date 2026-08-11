// Shop order tax decision summary: ordersWithTaxDecision, byStatus, totalTaxMmk, uniqueTaxCodes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderTaxDecisionSummary } from './shop-order-tax-decision-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-tax-decision-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderTaxDecisionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function taxDecision({ status = 'configured', taxMmk = 0, taxCode = null, taxRateBasisPoints = 0 } = {}) {
  return {
    schema: 'supermega.ecommerce.tax-decision.v1',
    status, catalogRevision: 1,
    taxConfigurationRevision: status === 'configured' ? 1 : null,
    taxCode, taxJurisdictionCode: null, taxEffectiveFrom: null,
    taxRateBasisPoints, taxMode: status === 'configured' ? 'exclusive' : 'not_configured',
    listedSubtotalMmk: 10000, subtotalMmk: 10000, taxMmk,
    totalMmk: 10000 + taxMmk,
    policyActionId: null, reviewedAt: '2026-01-01T00:00:00Z',
  }
}

function order({ taxDecision: td = undefined, id = 'ORD-1' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 10000, status: 'confirmed',
    ...(td !== undefined ? { taxDecision: td } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zero
{
  const r = projectShopOrderTaxDecisionSummary(state([]))
  check(r.ordersWithTaxDecision === 0, 'empty: ordersWithTaxDecision 0')
  check(r.byStatus.configured === 0, 'empty: byStatus.configured 0')
  check(r.byStatus.not_configured === 0, 'empty: byStatus.not_configured 0')
  check(r.totalTaxMmk === 0, 'empty: totalTaxMmk 0')
  check(r.uniqueTaxCodes === 0, 'empty: uniqueTaxCodes 0')
}

// 2. Orders without taxDecision
{
  const r = projectShopOrderTaxDecisionSummary(state([order({ id: 'ORD-1' }), order({ id: 'ORD-2' })]))
  check(r.ordersWithTaxDecision === 0, 'no-decision: ordersWithTaxDecision 0')
}

// 3. Single configured decision with tax code and taxMmk
{
  const r = projectShopOrderTaxDecisionSummary(state([
    order({ id: 'ORD-1', taxDecision: taxDecision({ status: 'configured', taxCode: 'VAT-5', taxMmk: 500, taxRateBasisPoints: 500 }) }),
  ]))
  check(r.ordersWithTaxDecision === 1, 'configured: ordersWithTaxDecision 1')
  check(r.byStatus.configured === 1, 'configured: byStatus.configured 1')
  check(r.totalTaxMmk === 500, 'configured: totalTaxMmk 500')
  check(r.uniqueTaxCodes === 1, 'configured: uniqueTaxCodes 1')
}

// 4. not_configured status, no tax code
{
  const r = projectShopOrderTaxDecisionSummary(state([
    order({ id: 'ORD-1', taxDecision: taxDecision({ status: 'not_configured', taxCode: null, taxMmk: 0 }) }),
  ]))
  check(r.byStatus.not_configured === 1, 'not-cfg: byStatus.not_configured 1')
  check(r.uniqueTaxCodes === 0, 'not-cfg: uniqueTaxCodes 0 (null code)')
  check(r.totalTaxMmk === 0, 'not-cfg: totalTaxMmk 0')
}

// 5. Two orders accumulate
{
  const r = projectShopOrderTaxDecisionSummary(state([
    order({ id: 'ORD-1', taxDecision: taxDecision({ status: 'configured', taxCode: 'VAT-5', taxMmk: 300 }) }),
    order({ id: 'ORD-2', taxDecision: taxDecision({ status: 'configured', taxCode: 'VAT-10', taxMmk: 700 }) }),
  ]))
  check(r.ordersWithTaxDecision === 2, '2orders: ordersWithTaxDecision 2')
  check(r.totalTaxMmk === 1000, '2orders: totalTaxMmk 1000')
  check(r.byStatus.configured === 2, '2orders: byStatus.configured 2')
  check(r.uniqueTaxCodes === 2, '2orders: uniqueTaxCodes 2')
}

// 6. Same tax code in two orders → dedup
{
  const r = projectShopOrderTaxDecisionSummary(state([
    order({ id: 'ORD-1', taxDecision: taxDecision({ status: 'configured', taxCode: 'VAT-5', taxMmk: 200 }) }),
    order({ id: 'ORD-2', taxDecision: taxDecision({ status: 'configured', taxCode: 'VAT-5', taxMmk: 400 }) }),
  ]))
  check(r.uniqueTaxCodes === 1, 'code-dedup: uniqueTaxCodes 1')
  check(r.totalTaxMmk === 600, 'code-dedup: totalTaxMmk 600')
}

// 7. Mixed (one with, one without taxDecision)
{
  const r = projectShopOrderTaxDecisionSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', taxDecision: taxDecision({ status: 'configured', taxCode: 'VAT-5', taxMmk: 100 }) }),
  ]))
  check(r.ordersWithTaxDecision === 1, 'mixed: ordersWithTaxDecision 1')
}

console.log(JSON.stringify({ ok: true, checks }))
