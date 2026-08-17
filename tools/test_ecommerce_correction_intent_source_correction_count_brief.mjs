import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentSourceCorrectionCountBrief } from './ecommerce-correction-intent-source-correction-count-brief.ts'`,
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

const { projectEcommerceCorrectionIntentSourceCorrectionCountBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(sourceCorrectionCount = 0) {
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
    sourceCorrectionCount,
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
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.firstCorrectionCount === 0, 'empty: firstCorrectionCount 0')
  check(r.repeatCorrectionCount === 0, 'empty: repeatCorrectionCount 0')
}

// 2. Single first correction (sourceCorrectionCount === 0)
{
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state([correctionIntent(0)]))
  check(r.totalIntents === 1, 'single-first: totalIntents 1')
  check(r.firstCorrectionCount === 1, 'single-first: firstCorrectionCount 1')
  check(r.repeatCorrectionCount === 0, 'single-first: repeatCorrectionCount 0')
}

// 3. Single repeat correction (sourceCorrectionCount === 1)
{
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state([correctionIntent(1)]))
  check(r.totalIntents === 1, 'single-repeat: totalIntents 1')
  check(r.firstCorrectionCount === 0, 'single-repeat: firstCorrectionCount 0')
  check(r.repeatCorrectionCount === 1, 'single-repeat: repeatCorrectionCount 1')
}

// 4. Two first corrections
{
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state([
    correctionIntent(0),
    correctionIntent(0),
  ]))
  check(r.totalIntents === 2, 'two-first: totalIntents 2')
  check(r.firstCorrectionCount === 2, 'two-first: firstCorrectionCount 2')
  check(r.repeatCorrectionCount === 0, 'two-first: repeatCorrectionCount 0')
}

// 5. Two repeat corrections (different counts)
{
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state([
    correctionIntent(2),
    correctionIntent(3),
  ]))
  check(r.totalIntents === 2, 'two-repeat: totalIntents 2')
  check(r.firstCorrectionCount === 0, 'two-repeat: firstCorrectionCount 0')
  check(r.repeatCorrectionCount === 2, 'two-repeat: repeatCorrectionCount 2')
}

// 6. Mixed: 2 first + 1 repeat
{
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state([
    correctionIntent(0),
    correctionIntent(1),
    correctionIntent(0),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.firstCorrectionCount === 2, 'mixed: firstCorrectionCount 2')
  check(r.repeatCorrectionCount === 1, 'mixed: repeatCorrectionCount 1')
  check(r.firstCorrectionCount + r.repeatCorrectionCount === r.totalIntents, 'mixed: counts sum to total')
}

// 7. All repeat
{
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state([
    correctionIntent(1),
    correctionIntent(2),
    correctionIntent(4),
  ]))
  check(r.totalIntents === 3, 'all-repeat: totalIntents 3')
  check(r.firstCorrectionCount === 0, 'all-repeat: firstCorrectionCount 0')
  check(r.repeatCorrectionCount === 3, 'all-repeat: repeatCorrectionCount 3')
  check(r.firstCorrectionCount + r.repeatCorrectionCount === r.totalIntents, 'all-repeat: counts sum to total')
}

console.log(`ecommerce-correction-intent-source-correction-count-brief: ${checks} checks passed`)
