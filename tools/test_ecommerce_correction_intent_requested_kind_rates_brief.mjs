import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentRequestedKindRatesBrief } from './ecommerce-correction-intent-requested-kind-rates-brief.ts'`,
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

const { projectEcommerceCorrectionIntentRequestedKindRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent({ requestedKind = 'credit' } = {}) {
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
    requestedKind,
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Correction reason',
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceCorrectionIntentRequestedKindRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.creditCount === 0, 'empty:creditCount')
  check(r.creditRate === 0, 'empty:creditRate')
  check(r.debitCount === 0, 'empty:debitCount')
  check(r.debitRate === 0, 'empty:debitRate')
}

// 2. Single credit — 3 checks
{
  const r = projectEcommerceCorrectionIntentRequestedKindRatesBrief(state([correctionIntent()]))
  check(r.totalIntents === 1, 'credit:total')
  check(r.creditCount === 1, 'credit:count')
  check(r.creditRate === 1, 'credit:rate')
}

// 3. Single debit — 3 checks
{
  const r = projectEcommerceCorrectionIntentRequestedKindRatesBrief(state([
    correctionIntent({ requestedKind: 'debit' }),
  ]))
  check(r.totalIntents === 1, 'debit:total')
  check(r.debitCount === 1, 'debit:count')
  check(r.debitRate === 1, 'debit:rate')
}

// 4. 2 credit — 3 checks
{
  const r = projectEcommerceCorrectionIntentRequestedKindRatesBrief(state([
    correctionIntent(),
    correctionIntent(),
  ]))
  check(r.creditCount === 2, 'twoCredit:count')
  check(r.debitCount === 0, 'twoCredit:debitCount')
  check(r.creditRate === 1, 'twoCredit:rate')
}

// 5. 2 debit — 2 checks
{
  const r = projectEcommerceCorrectionIntentRequestedKindRatesBrief(state([
    correctionIntent({ requestedKind: 'debit' }),
    correctionIntent({ requestedKind: 'debit' }),
  ]))
  check(r.debitCount === 2, 'twoDebit:count')
  check(r.creditCount === 0, 'twoDebit:creditCount')
}

// 6. 1 credit + 1 debit — 3 checks
{
  const r = projectEcommerceCorrectionIntentRequestedKindRatesBrief(state([
    correctionIntent(),
    correctionIntent({ requestedKind: 'debit' }),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.creditRate === 0.5, 'half:creditRate')
  check(r.debitRate === 0.5, 'half:debitRate')
}

// 7. Precision: 1 credit + 2 debit (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceCorrectionIntentRequestedKindRatesBrief(state([
    correctionIntent(),
    correctionIntent({ requestedKind: 'debit' }),
    correctionIntent({ requestedKind: 'debit' }),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.creditCount === 1, 'precision:creditCount')
  check(r.creditRate === 0.3333, 'precision:creditRate')
  check(r.debitRate === 0.6667, 'precision:debitRate')
}

console.log(`ecommerce-correction-intent-requested-kind-rates-brief: ${checks} checks passed`)
