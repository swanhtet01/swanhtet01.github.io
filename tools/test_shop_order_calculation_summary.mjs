// Shop order calculation summary: ordersWithCalculation, byTaxMode, totalTaxFromCalculation.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderCalculationSummary } from './shop-order-calculation-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-calculation-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderCalculationSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const CALC_V1_SCHEMA = 'supermega.commerce.order-calculation.v1'
const CALC_V2_SCHEMA = 'supermega.commerce.order-calculation.v2'

function calcV1({ subtotalMmk = 10000, totalMmk = 10000 } = {}) {
  return { schema: CALC_V1_SCHEMA, currency: 'MMK', catalogRevision: 1, subtotalMmk, taxMode: 'not_configured', taxMmk: 0, totalMmk }
}

function calcV2({ taxMode = 'exclusive', taxMmk = 500, subtotalMmk = 10000 } = {}) {
  return {
    schema: CALC_V2_SCHEMA, currency: 'MMK', catalogRevision: 1,
    taxConfigurationRevision: 1, taxCode: 'VAT-5', taxRateBasisPoints: 500,
    taxMode, listedSubtotalMmk: subtotalMmk, subtotalMmk, taxMmk, totalMmk: subtotalMmk + taxMmk,
  }
}

function order({ id = 'ORD-1', calculation = undefined } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 10000, status: 'confirmed',
    ...(calculation !== undefined ? { calculation } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zero
{
  const r = projectShopOrderCalculationSummary(state([]))
  check(r.ordersWithCalculation === 0, 'empty: ordersWithCalculation 0')
  check(r.byTaxMode.not_configured === 0, 'empty: byTaxMode.not_configured 0')
  check(r.byTaxMode.exclusive === 0, 'empty: byTaxMode.exclusive 0')
  check(r.byTaxMode.inclusive === 0, 'empty: byTaxMode.inclusive 0')
  check(r.totalTaxFromCalculation === 0, 'empty: totalTaxFromCalculation 0')
}

// 2. Orders without calculation
{
  const r = projectShopOrderCalculationSummary(state([order({ id: 'ORD-1' }), order({ id: 'ORD-2' })]))
  check(r.ordersWithCalculation === 0, 'no-calc: ordersWithCalculation 0')
}

// 3. V1 calculation (not_configured, taxMmk 0)
{
  const r = projectShopOrderCalculationSummary(state([
    order({ id: 'ORD-1', calculation: calcV1() }),
  ]))
  check(r.ordersWithCalculation === 1, 'v1: ordersWithCalculation 1')
  check(r.byTaxMode.not_configured === 1, 'v1: byTaxMode.not_configured 1')
  check(r.totalTaxFromCalculation === 0, 'v1: totalTaxFromCalculation 0')
}

// 4. V2 exclusive calculation
{
  const r = projectShopOrderCalculationSummary(state([
    order({ id: 'ORD-1', calculation: calcV2({ taxMode: 'exclusive', taxMmk: 500 }) }),
  ]))
  check(r.byTaxMode.exclusive === 1, 'exclusive: byTaxMode.exclusive 1')
  check(r.totalTaxFromCalculation === 500, 'exclusive: totalTaxFromCalculation 500')
}

// 5. V2 inclusive calculation
{
  const r = projectShopOrderCalculationSummary(state([
    order({ id: 'ORD-1', calculation: calcV2({ taxMode: 'inclusive', taxMmk: 900 }) }),
  ]))
  check(r.byTaxMode.inclusive === 1, 'inclusive: byTaxMode.inclusive 1')
  check(r.totalTaxFromCalculation === 900, 'inclusive: totalTaxFromCalculation 900')
}

// 6. Two orders accumulate totalTaxFromCalculation and byTaxMode
{
  const r = projectShopOrderCalculationSummary(state([
    order({ id: 'ORD-1', calculation: calcV2({ taxMode: 'exclusive', taxMmk: 300 }) }),
    order({ id: 'ORD-2', calculation: calcV2({ taxMode: 'exclusive', taxMmk: 700 }) }),
  ]))
  check(r.ordersWithCalculation === 2, '2orders: ordersWithCalculation 2')
  check(r.totalTaxFromCalculation === 1000, '2orders: totalTaxFromCalculation 1000')
  check(r.byTaxMode.exclusive === 2, '2orders: byTaxMode.exclusive 2')
}

// 7. Mixed V1 and V2 in same state
{
  const r = projectShopOrderCalculationSummary(state([
    order({ id: 'ORD-1', calculation: calcV1() }),
    order({ id: 'ORD-2', calculation: calcV2({ taxMode: 'exclusive', taxMmk: 400 }) }),
  ]))
  check(r.ordersWithCalculation === 2, 'mixed-v1v2: ordersWithCalculation 2')
  check(r.byTaxMode.not_configured === 1, 'mixed-v1v2: byTaxMode.not_configured 1')
  check(r.byTaxMode.exclusive === 1, 'mixed-v1v2: byTaxMode.exclusive 1')
  check(r.totalTaxFromCalculation === 400, 'mixed-v1v2: totalTaxFromCalculation 400')
}

// 8. Mixed (one with, one without calculation)
{
  const r = projectShopOrderCalculationSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', calculation: calcV2({ taxMode: 'exclusive', taxMmk: 100 }) }),
  ]))
  check(r.ordersWithCalculation === 1, 'mixed: ordersWithCalculation 1')
}

console.log(JSON.stringify({ ok: true, checks }))
