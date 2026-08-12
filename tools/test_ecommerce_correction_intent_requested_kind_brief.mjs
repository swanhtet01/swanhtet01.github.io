import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentRequestedKindBrief } from './ecommerce-correction-intent-requested-kind-brief.ts'`,
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

const { projectEcommerceCorrectionIntentRequestedKindBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(requestedKind = 'credit') {
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

// 1. Empty state
{
  const r = projectEcommerceCorrectionIntentRequestedKindBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.creditCount === 0, 'empty: creditCount 0')
  check(r.debitCount === 0, 'empty: debitCount 0')
}

// 2. Single credit
{
  const r = projectEcommerceCorrectionIntentRequestedKindBrief(state([correctionIntent('credit')]))
  check(r.totalIntents === 1, 'single-credit: totalIntents 1')
  check(r.creditCount === 1, 'single-credit: creditCount 1')
  check(r.debitCount === 0, 'single-credit: debitCount 0')
}

// 3. Single debit
{
  const r = projectEcommerceCorrectionIntentRequestedKindBrief(state([correctionIntent('debit')]))
  check(r.totalIntents === 1, 'single-debit: totalIntents 1')
  check(r.creditCount === 0, 'single-debit: creditCount 0')
  check(r.debitCount === 1, 'single-debit: debitCount 1')
}

// 4. Two credits
{
  const r = projectEcommerceCorrectionIntentRequestedKindBrief(state([
    correctionIntent('credit'),
    correctionIntent('credit'),
  ]))
  check(r.totalIntents === 2, 'two-credit: totalIntents 2')
  check(r.creditCount === 2, 'two-credit: creditCount 2')
  check(r.debitCount === 0, 'two-credit: debitCount 0')
}

// 5. Two debits
{
  const r = projectEcommerceCorrectionIntentRequestedKindBrief(state([
    correctionIntent('debit'),
    correctionIntent('debit'),
  ]))
  check(r.totalIntents === 2, 'two-debit: totalIntents 2')
  check(r.creditCount === 0, 'two-debit: creditCount 0')
  check(r.debitCount === 2, 'two-debit: debitCount 2')
}

// 6. Mixed: 2 credits + 1 debit
{
  const r = projectEcommerceCorrectionIntentRequestedKindBrief(state([
    correctionIntent('credit'),
    correctionIntent('debit'),
    correctionIntent('credit'),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.creditCount === 2, 'mixed: creditCount 2')
  check(r.debitCount === 1, 'mixed: debitCount 1')
  check(r.creditCount + r.debitCount === r.totalIntents, 'mixed: counts sum to total')
}

// 7. All debit
{
  const r = projectEcommerceCorrectionIntentRequestedKindBrief(state([
    correctionIntent('debit'),
    correctionIntent('debit'),
    correctionIntent('debit'),
  ]))
  check(r.totalIntents === 3, 'all-debit: totalIntents 3')
  check(r.creditCount === 0, 'all-debit: creditCount 0')
  check(r.debitCount === 3, 'all-debit: debitCount 3')
  check(r.creditCount + r.debitCount === r.totalIntents, 'all-debit: counts sum to total')
}

console.log(`ecommerce-correction-intent-requested-kind-brief: ${checks} checks passed`)
