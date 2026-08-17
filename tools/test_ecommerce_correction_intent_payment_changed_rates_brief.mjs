import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentPaymentChangedRatesBrief } from './ecommerce-correction-intent-payment-changed-rates-brief.ts'`,
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

const { projectEcommerceCorrectionIntentPaymentChangedRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent({ paymentChanged = false } = {}) {
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
    paymentChanged,
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.paymentChangedCount === 0, 'empty:paymentChangedCount')
  check(r.paymentChangedRate === 0, 'empty:paymentChangedRate')
  check(r.notPaymentChangedCount === 0, 'empty:notPaymentChangedCount')
  check(r.notPaymentChangedRate === 0, 'empty:notPaymentChangedRate')
}

// 2. Single payment changed — 3 checks
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRatesBrief(state([
    correctionIntent({ paymentChanged: true }),
  ]))
  check(r.totalIntents === 1, 'changed:total')
  check(r.paymentChangedCount === 1, 'changed:count')
  check(r.paymentChangedRate === 1, 'changed:rate')
}

// 3. Single not changed — 3 checks
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRatesBrief(state([correctionIntent()]))
  check(r.totalIntents === 1, 'notChanged:total')
  check(r.notPaymentChangedCount === 1, 'notChanged:count')
  check(r.notPaymentChangedRate === 1, 'notChanged:rate')
}

// 4. 2 changed — 3 checks
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRatesBrief(state([
    correctionIntent({ paymentChanged: true }),
    correctionIntent({ paymentChanged: true }),
  ]))
  check(r.paymentChangedCount === 2, 'twoChanged:count')
  check(r.notPaymentChangedCount === 0, 'twoChanged:notCount')
  check(r.paymentChangedRate === 1, 'twoChanged:rate')
}

// 5. 2 not changed — 2 checks
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRatesBrief(state([
    correctionIntent(),
    correctionIntent(),
  ]))
  check(r.notPaymentChangedCount === 2, 'twoNotChanged:count')
  check(r.paymentChangedCount === 0, 'twoNotChanged:changedCount')
}

// 6. 1 changed + 1 not changed — 3 checks
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRatesBrief(state([
    correctionIntent({ paymentChanged: true }),
    correctionIntent(),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.paymentChangedRate === 0.5, 'half:changedRate')
  check(r.notPaymentChangedRate === 0.5, 'half:notChangedRate')
}

// 7. Precision: 1 changed + 2 not changed (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceCorrectionIntentPaymentChangedRatesBrief(state([
    correctionIntent({ paymentChanged: true }),
    correctionIntent(),
    correctionIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.paymentChangedCount === 1, 'precision:changedCount')
  check(r.paymentChangedRate === 0.3333, 'precision:changedRate')
  check(r.notPaymentChangedRate === 0.6667, 'precision:notChangedRate')
}

console.log(`ecommerce-correction-intent-payment-changed-rates-brief: ${checks} checks passed`)
