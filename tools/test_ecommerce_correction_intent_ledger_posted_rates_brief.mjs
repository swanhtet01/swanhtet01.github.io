import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentLedgerPostedRatesBrief } from './ecommerce-correction-intent-ledger-posted-rates-brief.ts'`,
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

const { projectEcommerceCorrectionIntentLedgerPostedRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent({ ledgerPosted = false } = {}) {
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
    ledgerPosted,
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
  const r = projectEcommerceCorrectionIntentLedgerPostedRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.ledgerPostedCount === 0, 'empty:ledgerPostedCount')
  check(r.ledgerPostedRate === 0, 'empty:ledgerPostedRate')
  check(r.notLedgerPostedCount === 0, 'empty:notLedgerPostedCount')
  check(r.notLedgerPostedRate === 0, 'empty:notLedgerPostedRate')
}

// 2. Single ledger posted — 3 checks
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRatesBrief(state([
    correctionIntent({ ledgerPosted: true }),
  ]))
  check(r.totalIntents === 1, 'posted:total')
  check(r.ledgerPostedCount === 1, 'posted:count')
  check(r.ledgerPostedRate === 1, 'posted:rate')
}

// 3. Single not posted — 3 checks
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRatesBrief(state([correctionIntent()]))
  check(r.totalIntents === 1, 'notPosted:total')
  check(r.notLedgerPostedCount === 1, 'notPosted:count')
  check(r.notLedgerPostedRate === 1, 'notPosted:rate')
}

// 4. 2 posted — 3 checks
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRatesBrief(state([
    correctionIntent({ ledgerPosted: true }),
    correctionIntent({ ledgerPosted: true }),
  ]))
  check(r.ledgerPostedCount === 2, 'twoPosted:count')
  check(r.notLedgerPostedCount === 0, 'twoPosted:notCount')
  check(r.ledgerPostedRate === 1, 'twoPosted:rate')
}

// 5. 2 not posted — 2 checks
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRatesBrief(state([
    correctionIntent(),
    correctionIntent(),
  ]))
  check(r.notLedgerPostedCount === 2, 'twoNotPosted:count')
  check(r.ledgerPostedCount === 0, 'twoNotPosted:postedCount')
}

// 6. 1 posted + 1 not posted — 3 checks
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRatesBrief(state([
    correctionIntent({ ledgerPosted: true }),
    correctionIntent(),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.ledgerPostedRate === 0.5, 'half:postedRate')
  check(r.notLedgerPostedRate === 0.5, 'half:notPostedRate')
}

// 7. Precision: 1 posted + 2 not posted (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceCorrectionIntentLedgerPostedRatesBrief(state([
    correctionIntent({ ledgerPosted: true }),
    correctionIntent(),
    correctionIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.ledgerPostedCount === 1, 'precision:postedCount')
  check(r.ledgerPostedRate === 0.3333, 'precision:postedRate')
  check(r.notLedgerPostedRate === 0.6667, 'precision:notPostedRate')
}

console.log(`ecommerce-correction-intent-ledger-posted-rates-brief: ${checks} checks passed`)
