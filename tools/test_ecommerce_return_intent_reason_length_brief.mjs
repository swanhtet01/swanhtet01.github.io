// Ecommerce return intent reason length brief: short/medium/long bands + min/max/avg.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentReasonLengthBrief } from './ecommerce-return-intent-reason-length-brief.ts'`,
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

const { projectEcommerceReturnIntentReasonLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function returnIntent({ reason = 'Item broken' } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.return_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `RI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sku: 'SKU-001',
    quantity: 1,
    disposition: 'restock',
    reason,
    refundStatus: 'not_started',
    evidenceReference: `ev-${intentId}`,
  }
}

function state(returnIntents) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents,
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

const SHORT = 'Bad'                       // 3 chars
const MEDIUM = 'A'.repeat(50)             // 50 chars — medium (41–120)
const LONG = 'B'.repeat(150)              // 150 chars — long (>120)
const EXACT_40 = 'C'.repeat(40)           // boundary short
const EXACT_41 = 'D'.repeat(41)           // boundary medium
const EXACT_120 = 'E'.repeat(120)         // boundary medium
const EXACT_121 = 'F'.repeat(121)         // boundary long

// 1. Empty state
{
  const r = projectEcommerceReturnIntentReasonLengthBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.shortCount === 0, 'empty: shortCount 0')
  check(r.minReasonLength === null, 'empty: min null')
  check(r.maxReasonLength === null, 'empty: max null')
  check(r.averageReasonLength === 0, 'empty: avg 0')
}

// 2. Boundary checks
{
  check(
    projectEcommerceReturnIntentReasonLengthBrief(state([returnIntent({ reason: EXACT_40 })])).shortCount === 1,
    'bound: ≤40 is short',
  )
  check(
    projectEcommerceReturnIntentReasonLengthBrief(state([returnIntent({ reason: EXACT_41 })])).mediumCount === 1,
    'bound: 41 is medium',
  )
  check(
    projectEcommerceReturnIntentReasonLengthBrief(state([returnIntent({ reason: EXACT_120 })])).mediumCount === 1,
    'bound: 120 is medium',
  )
  check(
    projectEcommerceReturnIntentReasonLengthBrief(state([returnIntent({ reason: EXACT_121 })])).longCount === 1,
    'bound: 121 is long',
  )
}

// 3. Band counts sum to total
{
  const r = projectEcommerceReturnIntentReasonLengthBrief(
    state([returnIntent({ reason: SHORT }), returnIntent({ reason: MEDIUM }), returnIntent({ reason: LONG })]),
  )
  check(r.shortCount + r.mediumCount + r.longCount === r.totalIntents, 'invariant: bands sum to total')
}

// 4. Min/max detection
{
  const r = projectEcommerceReturnIntentReasonLengthBrief(
    state([returnIntent({ reason: SHORT }), returnIntent({ reason: LONG }), returnIntent({ reason: MEDIUM })]),
  )
  check(r.minReasonLength === SHORT.length, 'min-max: min is SHORT.length')
  check(r.maxReasonLength === LONG.length, 'min-max: max is LONG.length')
}

// 5. Average rounding: (2 + 3) / 2 = 2.5 → 3
{
  const r = projectEcommerceReturnIntentReasonLengthBrief(
    state([returnIntent({ reason: 'AB' }), returnIntent({ reason: 'ABC' })]),
  )
  check(r.averageReasonLength === 3, 'round: avg 3')
}

// 6. Rate rounding 1/3 → 33%
{
  const r = projectEcommerceReturnIntentReasonLengthBrief(
    state([returnIntent({ reason: SHORT }), returnIntent({ reason: MEDIUM }), returnIntent({ reason: LONG })]),
  )
  check(r.shortRate === 33, 'rate: shortRate 33')
  check(r.mediumRate === 33, 'rate: mediumRate 33')
  check(r.longRate === 33, 'rate: longRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
