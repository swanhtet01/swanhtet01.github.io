// Ecommerce correction intent amounts brief: listedAmountMmk + originalBalanceMmk + sourceCorrectionCount.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentAmountsBrief } from './ecommerce-correction-intent-amounts-brief.ts'`,
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

const { projectEcommerceCorrectionIntentAmountsBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent({ listedAmountMmk = 1000, originalBalanceMmk = 10000, sourceCorrectionCount = 0 } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.correction_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `COR-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceCalculationDigest: `scd-${intentId}`,
    sourceCorrectionCount,
    originalBalanceMmk,
    paymentStatus: 'reconciled',
    refundStatus: 'none',
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk,
    reason: 'Test reason',
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

function state(correctionIntents) {
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
  const r = projectEcommerceCorrectionIntentAmountsBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.totalListedAmountMmk === 0, 'empty: totalListedAmount 0')
  check(r.minListedAmountMmk === null, 'empty: minListed null')
  check(r.maxListedAmountMmk === null, 'empty: maxListed null')
  check(r.averageListedAmountMmk === 0, 'empty: avgListed 0')
  check(r.minOriginalBalanceMmk === null, 'empty: minBalance null')
  check(r.maxOriginalBalanceMmk === null, 'empty: maxBalance null')
  check(r.minSourceCorrectionCount === null, 'empty: minCount null')
  check(r.maxSourceCorrectionCount === null, 'empty: maxCount null')
}

// 2. Single intent — all fields
{
  const r = projectEcommerceCorrectionIntentAmountsBrief(
    state([correctionIntent({ listedAmountMmk: 2000, originalBalanceMmk: 15000, sourceCorrectionCount: 1 })]),
  )
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.totalListedAmountMmk === 2000, 'single: totalListed 2000')
  check(r.minListedAmountMmk === 2000, 'single: minListed 2000')
  check(r.maxListedAmountMmk === 2000, 'single: maxListed 2000')
  check(r.averageListedAmountMmk === 2000, 'single: avgListed 2000')
  check(r.minOriginalBalanceMmk === 15000, 'single: minBalance 15000')
  check(r.maxOriginalBalanceMmk === 15000, 'single: maxBalance 15000')
  check(r.minSourceCorrectionCount === 1, 'single: minCount 1')
  check(r.maxSourceCorrectionCount === 1, 'single: maxCount 1')
}

// 3. Listed amount min/max detection
{
  const r = projectEcommerceCorrectionIntentAmountsBrief(
    state([
      correctionIntent({ listedAmountMmk: 500 }),
      correctionIntent({ listedAmountMmk: 3000 }),
      correctionIntent({ listedAmountMmk: 1500 }),
    ]),
  )
  check(r.minListedAmountMmk === 500, 'listed: min 500')
  check(r.maxListedAmountMmk === 3000, 'listed: max 3000')
  check(r.totalListedAmountMmk === 5000, 'listed: total 5000')
  check(r.averageListedAmountMmk === 1667, 'listed: avg 1667')
}

// 4. Original balance min/max
{
  const r = projectEcommerceCorrectionIntentAmountsBrief(
    state([
      correctionIntent({ originalBalanceMmk: 5000 }),
      correctionIntent({ originalBalanceMmk: 20000 }),
    ]),
  )
  check(r.minOriginalBalanceMmk === 5000, 'balance: min 5000')
  check(r.maxOriginalBalanceMmk === 20000, 'balance: max 20000')
  check(r.averageOriginalBalanceMmk === 12500, 'balance: avg 12500')
}

// 5. sourceCorrectionCount: track orders with repeat corrections
{
  const r = projectEcommerceCorrectionIntentAmountsBrief(
    state([
      correctionIntent({ sourceCorrectionCount: 0 }),
      correctionIntent({ sourceCorrectionCount: 1 }),
      correctionIntent({ sourceCorrectionCount: 3 }),
    ]),
  )
  check(r.minSourceCorrectionCount === 0, 'count: min 0')
  check(r.maxSourceCorrectionCount === 3, 'count: max 3')
  check(r.averageSourceCorrectionCount === 1, 'count: avg 1 (round(4/3))')
}

// 6. Avg rounding: 1001 + 1002 = 2003 / 2 = 1002 (exact)
{
  const r = projectEcommerceCorrectionIntentAmountsBrief(
    state([correctionIntent({ listedAmountMmk: 1001 }), correctionIntent({ listedAmountMmk: 1002 })]),
  )
  check(r.averageListedAmountMmk === 1002, 'avg-exact: avgListed 1002 (floor(1001.5))')
}

console.log(JSON.stringify({ ok: true, checks }))
