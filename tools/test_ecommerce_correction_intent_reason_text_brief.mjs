import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentReasonTextBrief } from './ecommerce-correction-intent-reason-text-brief.ts'`,
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

const { projectEcommerceCorrectionIntentReasonTextBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent({ reason = 'Test reason' } = {}) {
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
    sourceCorrectionCount: 0,
    originalBalanceMmk: 10000,
    paymentStatus: 'reconciled',
    refundStatus: 'none',
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk: 1000,
    reason,
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
  const r = projectEcommerceCorrectionIntentReasonTextBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.shortCount === 0, 'empty: shortCount 0')
  check(r.mediumCount === 0, 'empty: mediumCount 0')
  check(r.longCount === 0, 'empty: longCount 0')
  check(r.shortRate === 0, 'empty: shortRate 0')
  check(r.mediumRate === 0, 'empty: mediumRate 0')
  check(r.longRate === 0, 'empty: longRate 0')
  check(r.minReasonLength === null, 'empty: minReasonLength null')
  check(r.maxReasonLength === null, 'empty: maxReasonLength null')
  check(r.averageReasonLength === 0, 'empty: averageReasonLength 0')
}

// 2. Single short reason (≤40 chars)
{
  const r = projectEcommerceCorrectionIntentReasonTextBrief(state([
    correctionIntent({ reason: 'Price was wrong' }), // 15 chars
  ]))
  check(r.totalIntents === 1, 'single-short: totalIntents 1')
  check(r.shortCount === 1, 'single-short: shortCount 1')
  check(r.shortRate === 100, 'single-short: shortRate 100')
  check(r.minReasonLength === 15, 'single-short: minReasonLength 15')
  check(r.maxReasonLength === 15, 'single-short: maxReasonLength 15')
  check(r.averageReasonLength === 15, 'single-short: averageReasonLength 15')
}

// 3. Boundary: exactly 40 chars = short
{
  const r = projectEcommerceCorrectionIntentReasonTextBrief(state([
    correctionIntent({ reason: 'A'.repeat(40) }),
  ]))
  check(r.shortCount === 1, 'boundary-40: shortCount 1')
  check(r.mediumCount === 0, 'boundary-40: mediumCount 0')
}

// 4. Boundary: exactly 41 chars = medium
{
  const r = projectEcommerceCorrectionIntentReasonTextBrief(state([
    correctionIntent({ reason: 'A'.repeat(41) }),
  ]))
  check(r.shortCount === 0, 'boundary-41: shortCount 0')
  check(r.mediumCount === 1, 'boundary-41: mediumCount 1')
}

// 5. Boundary: 120 = medium, 121 = long
{
  const r120 = projectEcommerceCorrectionIntentReasonTextBrief(state([correctionIntent({ reason: 'B'.repeat(120) })]))
  check(r120.mediumCount === 1, 'boundary-120: mediumCount 1')
  check(r120.longCount === 0, 'boundary-120: longCount 0')

  const r121 = projectEcommerceCorrectionIntentReasonTextBrief(state([correctionIntent({ reason: 'C'.repeat(121) })]))
  check(r121.longCount === 1, 'boundary-121: longCount 1')
  check(r121.longRate === 100, 'boundary-121: longRate 100')
}

// 6. Mixed bands + rates + avg
{
  const s = 'Short' // 5 chars
  const m = 'D'.repeat(80)  // 80 chars
  const l = 'E'.repeat(200) // 200 chars
  const r = projectEcommerceCorrectionIntentReasonTextBrief(state([
    correctionIntent({ reason: s }),
    correctionIntent({ reason: m }),
    correctionIntent({ reason: l }),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.shortCount === 1, 'mixed: shortCount 1')
  check(r.mediumCount === 1, 'mixed: mediumCount 1')
  check(r.longCount === 1, 'mixed: longCount 1')
  check(r.shortRate === 33, 'mixed: shortRate 33')
  check(r.mediumRate === 33, 'mixed: mediumRate 33')
  check(r.longRate === 33, 'mixed: longRate 33')
  check(r.minReasonLength === 5, 'mixed: minReasonLength 5')
  check(r.maxReasonLength === 200, 'mixed: maxReasonLength 200')
  check(r.averageReasonLength === Math.round((5 + 80 + 200) / 3), 'mixed: averageReasonLength')
}

console.log(`ecommerce-correction-intent-reason-text-brief: ${checks} checks passed`)
