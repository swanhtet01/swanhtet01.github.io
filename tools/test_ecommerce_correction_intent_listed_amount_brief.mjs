import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentListedAmountBrief } from './ecommerce-correction-intent-listed-amount-brief.ts'`,
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

const { projectEcommerceCorrectionIntentListedAmountBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(listedAmountMmk = 500) {
  intentId++
  return {
    schema: 'supermega.ecommerce.correction_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECO-${intentId}`,
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
    listedAmountMmk,
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
  const r = projectEcommerceCorrectionIntentListedAmountBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.minListedAmountMmk === null, 'empty: min null')
  check(r.maxListedAmountMmk === null, 'empty: max null')
  check(r.sumListedAmountMmk === 0, 'empty: sum 0')
}

// 2. Single intent
{
  const r = projectEcommerceCorrectionIntentListedAmountBrief(state([correctionIntent(500)]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.minListedAmountMmk === 500, 'single: min 500')
  check(r.maxListedAmountMmk === 500, 'single: max 500')
  check(r.sumListedAmountMmk === 500, 'single: sum 500')
}

// 3. Two ascending (500, 1500)
{
  const r = projectEcommerceCorrectionIntentListedAmountBrief(state([
    correctionIntent(500),
    correctionIntent(1500),
  ]))
  check(r.totalIntents === 2, 'asc: totalIntents 2')
  check(r.minListedAmountMmk === 500, 'asc: min 500')
  check(r.maxListedAmountMmk === 1500, 'asc: max 1500')
  check(r.sumListedAmountMmk === 2000, 'asc: sum 2000')
}

// 4. Two same value (1000, 1000)
{
  const r = projectEcommerceCorrectionIntentListedAmountBrief(state([
    correctionIntent(1000),
    correctionIntent(1000),
  ]))
  check(r.totalIntents === 2, 'same: totalIntents 2')
  check(r.minListedAmountMmk === 1000, 'same: min 1000')
  check(r.maxListedAmountMmk === 1000, 'same: max 1000')
  check(r.sumListedAmountMmk === 2000, 'same: sum 2000')
}

// 5. Three ascending (100, 200, 300) — sum 600
{
  const r = projectEcommerceCorrectionIntentListedAmountBrief(state([
    correctionIntent(100),
    correctionIntent(200),
    correctionIntent(300),
  ]))
  check(r.totalIntents === 3, 'three-asc: totalIntents 3')
  check(r.minListedAmountMmk === 100, 'three-asc: min 100')
  check(r.maxListedAmountMmk === 300, 'three-asc: max 300')
  check(r.sumListedAmountMmk === 600, 'three-asc: sum 600')
}

// 6. Three descending (800, 500, 200) — sum 1500
{
  const r = projectEcommerceCorrectionIntentListedAmountBrief(state([
    correctionIntent(800),
    correctionIntent(500),
    correctionIntent(200),
  ]))
  check(r.minListedAmountMmk === 200, 'three-desc: min 200')
  check(r.maxListedAmountMmk === 800, 'three-desc: max 800')
  check(r.sumListedAmountMmk === 1500, 'three-desc: sum 1500')
}

console.log(`ecommerce-correction-intent-listed-amount-brief: ${checks} checks passed`)
