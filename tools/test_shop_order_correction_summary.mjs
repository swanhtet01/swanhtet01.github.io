// Shop order correction summary: ordersWithCorrections, totalCorrections, byKind, byReasonCode.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderCorrectionSummary } from './shop-order-correction-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-correction-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderCorrectionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function correction({ documentId = 'DOC-1', kind = 'credit', reasonCode = 'pricing_error' } = {}) {
  return {
    documentId, actionId: 'ACT-1', createdAt: '2026-01-01T00:00:00Z', actor: 'alice',
    reason: 'test', evidenceReference: 'ref-1', kind, reasonCode,
    sourceCalculationDigest: 'digest', balanceAfterMmk: 0,
    calculation: { currency: 'MMK', taxConfigurationRevision: null, taxCode: null, taxRateBasisPoints: null, taxMode: 'not_configured', listedAmountMmk: 1000, subtotalMmk: 1000, taxMmk: 0, totalMmk: 1000 },
    financialStatus: 'review_required', postingAuthority: 'none', externalPostingPerformed: false,
  }
}

function order({ corrections = undefined, id = 'ORD-1' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 1000, status: 'confirmed',
    ...(corrections !== undefined ? { corrections } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. No orders → all defaults
{
  const r = projectShopOrderCorrectionSummary(state([]))
  check(r.ordersWithCorrections === 0, 'empty: ordersWithCorrections 0')
  check(r.totalCorrections === 0, 'empty: totalCorrections 0')
  check(r.byKind.credit === 0, 'empty: byKind.credit 0')
  check(r.byKind.debit === 0, 'empty: byKind.debit 0')
  check(r.byReasonCode.pricing_error === 0, 'empty: pricing_error 0')
  check(r.byReasonCode.service_recovery === 0, 'empty: service_recovery 0')
  check(r.byReasonCode.fee_adjustment === 0, 'empty: fee_adjustment 0')
  check(r.byReasonCode.other === 0, 'empty: other 0')
}

// 2. Orders without corrections
{
  const r = projectShopOrderCorrectionSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2' }),
  ]))
  check(r.ordersWithCorrections === 0, 'no-corr: ordersWithCorrections 0')
  check(r.totalCorrections === 0, 'no-corr: totalCorrections 0')
}

// 3. Single credit / pricing_error correction
{
  const r = projectShopOrderCorrectionSummary(state([
    order({ id: 'ORD-1', corrections: [correction({ kind: 'credit', reasonCode: 'pricing_error' })] }),
  ]))
  check(r.ordersWithCorrections === 1, 'one-corr: ordersWithCorrections 1')
  check(r.totalCorrections === 1, 'one-corr: totalCorrections 1')
  check(r.byKind.credit === 1, 'one-corr: byKind.credit 1')
  check(r.byReasonCode.pricing_error === 1, 'one-corr: pricing_error 1')
}

// 4. Debit + service_recovery
{
  const r = projectShopOrderCorrectionSummary(state([
    order({ id: 'ORD-1', corrections: [correction({ kind: 'debit', reasonCode: 'service_recovery' })] }),
  ]))
  check(r.byKind.debit === 1, 'debit: byKind.debit 1')
  check(r.byReasonCode.service_recovery === 1, 'debit: service_recovery 1')
}

// 5. fee_adjustment
{
  const r = projectShopOrderCorrectionSummary(state([
    order({ id: 'ORD-1', corrections: [correction({ reasonCode: 'fee_adjustment' })] }),
  ]))
  check(r.byReasonCode.fee_adjustment === 1, 'fee: fee_adjustment 1')
}

// 6. other
{
  const r = projectShopOrderCorrectionSummary(state([
    order({ id: 'ORD-1', corrections: [correction({ reasonCode: 'other' })] }),
  ]))
  check(r.byReasonCode.other === 1, 'other: byReasonCode.other 1')
}

// 7. Two orders accumulate byKind
{
  const r = projectShopOrderCorrectionSummary(state([
    order({ id: 'ORD-1', corrections: [
      correction({ documentId: 'D1', kind: 'credit', reasonCode: 'pricing_error' }),
      correction({ documentId: 'D2', kind: 'debit', reasonCode: 'other' }),
    ]}),
    order({ id: 'ORD-2', corrections: [
      correction({ documentId: 'D3', kind: 'credit', reasonCode: 'service_recovery' }),
    ]}),
  ]))
  check(r.ordersWithCorrections === 2, '2orders: ordersWithCorrections 2')
  check(r.totalCorrections === 3, '2orders: totalCorrections 3')
  check(r.byKind.credit === 2, '2orders: byKind.credit 2')
}

// 8. Mixed orders with and without corrections
{
  const r = projectShopOrderCorrectionSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', corrections: [correction({ kind: 'credit', reasonCode: 'fee_adjustment' })] }),
  ]))
  check(r.ordersWithCorrections === 1, 'mixed: ordersWithCorrections 1')
  check(r.byReasonCode.fee_adjustment === 1, 'mixed: fee_adjustment 1')
}

console.log(JSON.stringify({ ok: true, checks }))
