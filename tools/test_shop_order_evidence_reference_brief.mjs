// Shop order evidence reference brief: evidenceReference?, paymentEvidenceReference?, refundEvidenceReference?.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderEvidenceReferenceBrief } from './shop-order-evidence-reference-brief.ts'`,
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

const { projectShopOrderEvidenceReferenceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
let orderId = 0

function order({ evidenceReference, paymentEvidenceReference, refundEvidenceReference } = {}) {
  orderId++
  const base = {
    id: `ORD-${orderId}`,
    createdAt: '2026-08-12T08:00:00Z',
    customer: 'cust-1',
    channel: 'counter',
    item: 'item-1',
    quantity: 1,
    payment: 'cash',
    paymentStatus: 'pending',
    refundStatus: 'none',
    total: 1000,
    status: 'confirmed',
  }
  if (evidenceReference !== undefined) base.evidenceReference = evidenceReference
  if (paymentEvidenceReference !== undefined) base.paymentEvidenceReference = paymentEvidenceReference
  if (refundEvidenceReference !== undefined) base.refundEvidenceReference = refundEvidenceReference
  return base
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty → all zeros
{
  const r = projectShopOrderEvidenceReferenceBrief(state([]))
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.ordersWithEvidence === 0, 'empty: ordersWithEvidence 0')
  check(r.ordersWithoutEvidence === 0, 'empty: ordersWithoutEvidence 0')
  check(r.evidenceRate === 0, 'empty: evidenceRate 0')
  check(r.ordersWithPaymentEvidence === 0, 'empty: ordersWithPaymentEvidence 0')
  check(r.paymentEvidenceRate === 0, 'empty: paymentEvidenceRate 0')
  check(r.ordersWithRefundEvidence === 0, 'empty: ordersWithRefundEvidence 0')
  check(r.refundEvidenceRate === 0, 'empty: refundEvidenceRate 0')
}

// 2. Single order with no evidence fields
{
  const r = projectShopOrderEvidenceReferenceBrief(state([order()]))
  check(r.totalOrders === 1, 'no-evidence: totalOrders 1')
  check(r.ordersWithEvidence === 0, 'no-evidence: ordersWithEvidence 0')
  check(r.ordersWithoutEvidence === 1, 'no-evidence: ordersWithoutEvidence 1')
  check(r.evidenceRate === 0, 'no-evidence: evidenceRate 0')
  check(r.ordersWithPaymentEvidence === 0, 'no-evidence: ordersWithPaymentEvidence 0')
  check(r.ordersWithRefundEvidence === 0, 'no-evidence: ordersWithRefundEvidence 0')
}

// 3. Single order with all three evidence fields
{
  const r = projectShopOrderEvidenceReferenceBrief(state([order({
    evidenceReference: 'EVD-001',
    paymentEvidenceReference: 'PEVD-001',
    refundEvidenceReference: 'REVD-001',
  })]))
  check(r.ordersWithEvidence === 1, 'all-evidence: ordersWithEvidence 1')
  check(r.ordersWithoutEvidence === 0, 'all-evidence: ordersWithoutEvidence 0')
  check(r.evidenceRate === 100, 'all-evidence: evidenceRate 100')
  check(r.ordersWithPaymentEvidence === 1, 'all-evidence: ordersWithPaymentEvidence 1')
  check(r.paymentEvidenceRate === 100, 'all-evidence: paymentEvidenceRate 100')
  check(r.ordersWithRefundEvidence === 1, 'all-evidence: ordersWithRefundEvidence 1')
  check(r.refundEvidenceRate === 100, 'all-evidence: refundEvidenceRate 100')
}

// 4. Fields are independent: payment evidence only
{
  const r = projectShopOrderEvidenceReferenceBrief(state([
    order({ paymentEvidenceReference: 'PEVD-002' }),
  ]))
  check(r.ordersWithEvidence === 0, 'payment-only: ordersWithEvidence 0')
  check(r.ordersWithPaymentEvidence === 1, 'payment-only: ordersWithPaymentEvidence 1')
  check(r.ordersWithRefundEvidence === 0, 'payment-only: ordersWithRefundEvidence 0')
}

// 5. Mixed across multiple orders
{
  const r = projectShopOrderEvidenceReferenceBrief(state([
    order({ evidenceReference: 'E1' }),
    order({ evidenceReference: 'E2', paymentEvidenceReference: 'P1' }),
    order({ refundEvidenceReference: 'R1' }),
    order(),
  ]))
  check(r.totalOrders === 4, 'mixed: totalOrders 4')
  check(r.ordersWithEvidence === 2, 'mixed: ordersWithEvidence 2')
  check(r.ordersWithoutEvidence === 2, 'mixed: ordersWithoutEvidence 2')
  check(r.evidenceRate === 50, 'mixed: evidenceRate 50')
  check(r.ordersWithPaymentEvidence === 1, 'mixed: ordersWithPaymentEvidence 1')
  check(r.paymentEvidenceRate === 25, 'mixed: paymentEvidenceRate 25')
  check(r.ordersWithRefundEvidence === 1, 'mixed: ordersWithRefundEvidence 1')
  check(r.refundEvidenceRate === 25, 'mixed: refundEvidenceRate 25')
}

// 6. Rounding: 1 of 3 has evidence → 33%
{
  const r = projectShopOrderEvidenceReferenceBrief(state([
    order({ evidenceReference: 'E' }), order(), order(),
  ]))
  check(r.evidenceRate === 33, 'rounding: evidenceRate 33')
}

// 7. Rounding: 2 of 3 have payment evidence → 67%
{
  const r = projectShopOrderEvidenceReferenceBrief(state([
    order({ paymentEvidenceReference: 'P1' }),
    order({ paymentEvidenceReference: 'P2' }),
    order(),
  ]))
  check(r.paymentEvidenceRate === 67, 'rounding: paymentEvidenceRate 67')
}

console.log(JSON.stringify({ ok: true, checks }))
