// Ecommerce correction intent summary: totalCorrections, uniqueOrders,
// totalListedAmountMmk, totalOriginalBalanceMmk, byRefundStatus, byKind, topReasonCode.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentSummary } from './ecommerce-correction-intent-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/correction-intent-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceCorrectionIntentSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function intent({ orderId = 'ORD-1', listedAmountMmk = 5_000, originalBalanceMmk = 10_000, refundStatus = 'none', requestedKind = 'credit', reasonCode = 'pricing_error' } = {}) {
  seq++
  return {
    id: `ci-${seq}`,
    idempotencyKey: `ik-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    orderId,
    sourceRequestId: 'REQ-1',
    sourceCalculationDigest: 'digest',
    sourceCorrectionCount: 0,
    originalBalanceMmk,
    paymentStatus: 'reconciled',
    refundStatus,
    requestedKind,
    reasonCode,
    listedAmountMmk,
    reason: 'test',
    orderChanged: false,
    paymentChanged: false,
    refundStarted: false,
    ledgerPosted: false,
    taxFiled: false,
    customerMessageSent: false,
    providerCalled: false,
    evidenceReference: 'EVD-1',
  }
}

function state(correctionIntents = []) {
  return {
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents,
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty → all zeros, topReasonCode null
{
  const r = projectEcommerceCorrectionIntentSummary(state())
  check(r.totalCorrections === 0, 'empty: totalCorrections 0')
  check(r.uniqueOrders === 0, 'empty: uniqueOrders 0')
  check(r.totalListedAmountMmk === 0, 'empty: totalListedAmountMmk 0')
  check(r.totalOriginalBalanceMmk === 0, 'empty: totalOriginalBalanceMmk 0')
  check(r.byRefundStatus.none === 0, 'empty: byRefundStatus.none 0')
  check(r.topReasonCode === null, 'empty: topReasonCode null')
}

// 2. Single credit intent, pricing_error, refundStatus none
{
  const r = projectEcommerceCorrectionIntentSummary(state([
    intent({ orderId: 'ORD-A', listedAmountMmk: 5_000, originalBalanceMmk: 10_000, refundStatus: 'none', requestedKind: 'credit', reasonCode: 'pricing_error' }),
  ]))
  check(r.totalCorrections === 1, 'single: totalCorrections 1')
  check(r.uniqueOrders === 1, 'single: uniqueOrders 1')
  check(r.totalListedAmountMmk === 5_000, 'single: totalListedAmountMmk 5000')
  check(r.totalOriginalBalanceMmk === 10_000, 'single: totalOriginalBalanceMmk 10000')
  check(r.byRefundStatus.none === 1, 'single: byRefundStatus.none 1')
  check(r.byRefundStatus.due === 0, 'single: byRefundStatus.due 0')
  check(r.byRefundStatus.settled === 0, 'single: byRefundStatus.settled 0')
  check(r.byKind.credit === 1, 'single: byKind.credit 1')
  check(r.byKind.debit === 0, 'single: byKind.debit 0')
  check(r.topReasonCode === 'pricing_error', 'single: topReasonCode pricing_error')
}

// 3. refundStatus 'due'
{
  const r = projectEcommerceCorrectionIntentSummary(state([
    intent({ refundStatus: 'due' }),
  ]))
  check(r.byRefundStatus.due === 1, 'due: byRefundStatus.due 1')
}

// 4. refundStatus 'settled'
{
  const r = projectEcommerceCorrectionIntentSummary(state([
    intent({ refundStatus: 'settled' }),
  ]))
  check(r.byRefundStatus.settled === 1, 'settled: byRefundStatus.settled 1')
}

// 5. requestedKind 'debit'
{
  const r = projectEcommerceCorrectionIntentSummary(state([
    intent({ requestedKind: 'debit' }),
  ]))
  check(r.byKind.debit === 1, 'debit: byKind.debit 1')
  check(r.byKind.credit === 0, 'debit: byKind.credit 0')
}

// 6. uniqueOrders: same orderId counted once
{
  const r = projectEcommerceCorrectionIntentSummary(state([
    intent({ orderId: 'ORD-X' }),
    intent({ orderId: 'ORD-X' }),
  ]))
  check(r.uniqueOrders === 1, 'dedup: uniqueOrders 1 for same orderId')
  check(r.totalCorrections === 2, 'dedup: totalCorrections 2')
}

// 7. totalListedAmountMmk and totalOriginalBalanceMmk accumulate
{
  const r = projectEcommerceCorrectionIntentSummary(state([
    intent({ listedAmountMmk: 5_000, originalBalanceMmk: 10_000 }),
    intent({ listedAmountMmk: 3_000, originalBalanceMmk: 7_000 }),
  ]))
  check(r.totalListedAmountMmk === 8_000, 'accum: totalListedAmountMmk 5k+3k=8k')
  check(r.totalOriginalBalanceMmk === 17_000, 'accum: totalOriginalBalanceMmk 10k+7k=17k')
}

// 8. topReasonCode: most frequent wins
{
  const r = projectEcommerceCorrectionIntentSummary(state([
    intent({ reasonCode: 'pricing_error' }),
    intent({ reasonCode: 'service_recovery' }),
    intent({ reasonCode: 'service_recovery' }),
  ]))
  check(r.topReasonCode === 'service_recovery', 'top-freq: service_recovery (2) wins over pricing_error (1)')
}

// 9. topReasonCode: alpha tie-break ('fee_adjustment' < 'other')
{
  const r = projectEcommerceCorrectionIntentSummary(state([
    intent({ reasonCode: 'other' }),
    intent({ reasonCode: 'fee_adjustment' }),
  ]))
  check(r.topReasonCode === 'fee_adjustment', 'tie: fee_adjustment < other')
}

// 10. All three refundStatus values together
{
  const r = projectEcommerceCorrectionIntentSummary(state([
    intent({ refundStatus: 'none' }),
    intent({ refundStatus: 'due' }),
    intent({ refundStatus: 'settled' }),
  ]))
  check(r.byRefundStatus.none === 1, 'all-status: none 1')
  check(r.byRefundStatus.due === 1, 'all-status: due 1')
  check(r.byRefundStatus.settled === 1, 'all-status: settled 1')
}

// 11. byKind accumulates across multiple intents
{
  const r = projectEcommerceCorrectionIntentSummary(state([
    intent({ requestedKind: 'credit' }),
    intent({ requestedKind: 'credit' }),
    intent({ requestedKind: 'debit' }),
  ]))
  check(r.byKind.credit === 2, 'byKind: credit 2')
  check(r.byKind.debit === 1, 'byKind: debit 1')
}

console.log(JSON.stringify({ ok: true, checks }))
