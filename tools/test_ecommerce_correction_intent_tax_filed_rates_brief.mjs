import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentTaxFiledRatesBrief } from './ecommerce-correction-intent-tax-filed-rates-brief.ts'`,
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

const { projectEcommerceCorrectionIntentTaxFiledRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent({ taxFiled = false } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.correction_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceCalculationDigest: `scd-${intentId}`,
    sourceCorrectionCount: 0,
    originalBalanceMmk: 10000,
    paymentStatus: 'reconciled',
    refundStatus: 'none',
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Correction reason',
    orderChanged: false,
    paymentChanged: false,
    refundStarted: false,
    ledgerPosted: false,
    taxFiled,
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceCorrectionIntentTaxFiledRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.taxFiledCount === 0, 'empty:taxFiledCount')
  check(r.taxFiledRate === 0, 'empty:taxFiledRate')
  check(r.notTaxFiledCount === 0, 'empty:notTaxFiledCount')
  check(r.notTaxFiledRate === 0, 'empty:notTaxFiledRate')
}

// 2. Single tax filed — 3 checks
{
  const r = projectEcommerceCorrectionIntentTaxFiledRatesBrief(state([
    correctionIntent({ taxFiled: true }),
  ]))
  check(r.totalIntents === 1, 'filed:total')
  check(r.taxFiledCount === 1, 'filed:count')
  check(r.taxFiledRate === 1, 'filed:rate')
}

// 3. Single not filed — 3 checks
{
  const r = projectEcommerceCorrectionIntentTaxFiledRatesBrief(state([correctionIntent()]))
  check(r.totalIntents === 1, 'notFiled:total')
  check(r.notTaxFiledCount === 1, 'notFiled:count')
  check(r.notTaxFiledRate === 1, 'notFiled:rate')
}

// 4. 2 filed — 3 checks
{
  const r = projectEcommerceCorrectionIntentTaxFiledRatesBrief(state([
    correctionIntent({ taxFiled: true }),
    correctionIntent({ taxFiled: true }),
  ]))
  check(r.taxFiledCount === 2, 'twoFiled:count')
  check(r.notTaxFiledCount === 0, 'twoFiled:notCount')
  check(r.taxFiledRate === 1, 'twoFiled:rate')
}

// 5. 2 not filed — 2 checks
{
  const r = projectEcommerceCorrectionIntentTaxFiledRatesBrief(state([
    correctionIntent(),
    correctionIntent(),
  ]))
  check(r.notTaxFiledCount === 2, 'twoNotFiled:count')
  check(r.taxFiledCount === 0, 'twoNotFiled:filedCount')
}

// 6. 1 filed + 1 not filed — 3 checks
{
  const r = projectEcommerceCorrectionIntentTaxFiledRatesBrief(state([
    correctionIntent({ taxFiled: true }),
    correctionIntent(),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.taxFiledRate === 0.5, 'half:filedRate')
  check(r.notTaxFiledRate === 0.5, 'half:notFiledRate')
}

// 7. Precision: 1 filed + 2 not filed (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceCorrectionIntentTaxFiledRatesBrief(state([
    correctionIntent({ taxFiled: true }),
    correctionIntent(),
    correctionIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.taxFiledCount === 1, 'precision:filedCount')
  check(r.taxFiledRate === 0.3333, 'precision:filedRate')
  check(r.notTaxFiledRate === 0.6667, 'precision:notFiledRate')
}

console.log(`ecommerce-correction-intent-tax-filed-rates-brief: ${checks} checks passed`)
