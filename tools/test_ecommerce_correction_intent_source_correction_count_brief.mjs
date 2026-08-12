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
    id: `CRI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceCalculationDigest: `scd-${intentId}`,
    sourceCorrectionCount,
    originalBalanceMmk: 10000,
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
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.minSourceCorrectionCount === null, 'empty: min null')
  check(r.maxSourceCorrectionCount === null, 'empty: max null')
  check(r.firstCorrections === 0, 'empty: firstCorrections 0')
}

// 2. Single first correction (count = 0)
{
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state([correctionIntent(0)]))
  check(r.totalIntents === 1, 'first: totalIntents 1')
  check(r.minSourceCorrectionCount === 0, 'first: min 0')
  check(r.maxSourceCorrectionCount === 0, 'first: max 0')
  check(r.firstCorrections === 1, 'first: firstCorrections 1')
}

// 3. Single repeat correction (count = 2)
{
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state([correctionIntent(2)]))
  check(r.totalIntents === 1, 'repeat: totalIntents 1')
  check(r.minSourceCorrectionCount === 2, 'repeat: min 2')
  check(r.maxSourceCorrectionCount === 2, 'repeat: max 2')
  check(r.firstCorrections === 0, 'repeat: firstCorrections 0')
}

// 4. Two intents: first + repeat
{
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state([
    correctionIntent(0),
    correctionIntent(3),
  ]))
  check(r.totalIntents === 2, 'mixed: totalIntents 2')
  check(r.minSourceCorrectionCount === 0, 'mixed: min 0')
  check(r.maxSourceCorrectionCount === 3, 'mixed: max 3')
  check(r.firstCorrections === 1, 'mixed: firstCorrections 1')
}

// 5. Three intents: 2 firsts + 1 repeat — firstCorrections 2
{
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state([
    correctionIntent(0),
    correctionIntent(0),
    correctionIntent(1),
  ]))
  check(r.totalIntents === 3, 'two-first: totalIntents 3')
  check(r.minSourceCorrectionCount === 0, 'two-first: min 0')
  check(r.maxSourceCorrectionCount === 1, 'two-first: max 1')
  check(r.firstCorrections === 2, 'two-first: firstCorrections 2')
}

// 6. Three all repeats — firstCorrections 0
{
  const r = projectEcommerceCorrectionIntentSourceCorrectionCountBrief(state([
    correctionIntent(1),
    correctionIntent(4),
    correctionIntent(2),
  ]))
  check(r.totalIntents === 3, 'all-repeat: totalIntents 3')
  check(r.minSourceCorrectionCount === 1, 'all-repeat: min 1')
  check(r.maxSourceCorrectionCount === 4, 'all-repeat: max 4')
}

console.log(`ecommerce-correction-intent-source-correction-count-brief: ${checks} checks passed`)
