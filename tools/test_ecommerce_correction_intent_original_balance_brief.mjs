import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentOriginalBalanceBrief } from './ecommerce-correction-intent-original-balance-brief.ts'`,
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

const { projectEcommerceCorrectionIntentOriginalBalanceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(originalBalanceMmk = 10000) {
  intentId++
  return {
    schema: 'supermega.ecommerce.correction_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `CRI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceCalculationDigest: `scd-${intentId}`,
    sourceCorrectionCount: 0,
    originalBalanceMmk,
    paymentStatus: 'reconciled',
    refundStatus: 'none',
    requestedKind: 'price_adjustment',
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Price correction',
    orderChanged: false,
    paymentChanged: false,
    refundStarted: false,
    ledgerPosted: false,
    taxFiled: false,
    customerMessageSent: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(correctionIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
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

// 1. Empty state
{
  const r = projectEcommerceCorrectionIntentOriginalBalanceBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.minOriginalBalanceMmk === null, 'empty: minOriginalBalanceMmk null')
  check(r.maxOriginalBalanceMmk === null, 'empty: maxOriginalBalanceMmk null')
  check(r.sumOriginalBalanceMmk === 0, 'empty: sumOriginalBalanceMmk 0')
}

// 2. Single intent
{
  const r = projectEcommerceCorrectionIntentOriginalBalanceBrief(state([correctionIntent(20000)]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.minOriginalBalanceMmk === 20000, 'single: min 20000')
  check(r.maxOriginalBalanceMmk === 20000, 'single: max 20000')
  check(r.sumOriginalBalanceMmk === 20000, 'single: sum 20000')
}

// 3. Two intents — min, max, sum correct
{
  const r = projectEcommerceCorrectionIntentOriginalBalanceBrief(state([
    correctionIntent(8000),
    correctionIntent(15000),
  ]))
  check(r.totalIntents === 2, 'two: totalIntents 2')
  check(r.minOriginalBalanceMmk === 8000, 'two: min 8000')
  check(r.maxOriginalBalanceMmk === 15000, 'two: max 15000')
  check(r.sumOriginalBalanceMmk === 23000, 'two: sum 23000')
}

// 4. Three intents out of order
{
  const r = projectEcommerceCorrectionIntentOriginalBalanceBrief(state([
    correctionIntent(25000),
    correctionIntent(5000),
    correctionIntent(12000),
  ]))
  check(r.totalIntents === 3, 'unsorted: totalIntents 3')
  check(r.minOriginalBalanceMmk === 5000, 'unsorted: min 5000')
  check(r.maxOriginalBalanceMmk === 25000, 'unsorted: max 25000')
  check(r.sumOriginalBalanceMmk === 42000, 'unsorted: sum 42000')
}

// 5. All same value
{
  const r = projectEcommerceCorrectionIntentOriginalBalanceBrief(state([
    correctionIntent(10000),
    correctionIntent(10000),
    correctionIntent(10000),
  ]))
  check(r.totalIntents === 3, 'same: totalIntents 3')
  check(r.minOriginalBalanceMmk === 10000, 'same: min 10000')
  check(r.maxOriginalBalanceMmk === 10000, 'same: max 10000')
  check(r.sumOriginalBalanceMmk === 30000, 'same: sum 30000')
}

// 6. Single large value
{
  const r = projectEcommerceCorrectionIntentOriginalBalanceBrief(state([correctionIntent(500000)]))
  check(r.minOriginalBalanceMmk === r.maxOriginalBalanceMmk, 'large: min equals max')
  check(r.sumOriginalBalanceMmk === 500000, 'large: sum 500000')
  check(r.totalIntents === 1, 'large: totalIntents 1')
}

console.log(`ecommerce-correction-intent-original-balance-brief: ${checks} checks passed`)
