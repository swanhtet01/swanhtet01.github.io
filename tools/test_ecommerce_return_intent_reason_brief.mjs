// Ecommerce return intent reason brief: unique reason count + top-5 distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentReasonBrief } from './ecommerce-return-intent-reason-brief.ts'`,
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

const { projectEcommerceReturnIntentReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function returnIntent(reason = 'Wrong item') {
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
    sku: `SKU-1`,
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

// 1. Empty state
{
  const r = projectEcommerceReturnIntentReasonBrief(state([]))
  check(r.totalReturnIntents === 0, 'empty: totalReturnIntents 0')
  check(r.uniqueReasons === 0, 'empty: uniqueReasons 0')
  check(r.topReasonsByCount.length === 0, 'empty: top empty')
}

// 2. Single return intent
{
  const r = projectEcommerceReturnIntentReasonBrief(state([returnIntent('Wrong size')]))
  check(r.totalReturnIntents === 1, 'single: totalReturnIntents 1')
  check(r.uniqueReasons === 1, 'single: uniqueReasons 1')
  check(r.topReasonsByCount[0]?.reason === 'Wrong size', 'single: top reason')
  check(r.topReasonsByCount[0]?.count === 1, 'single: top count 1')
}

// 3. Same reason repeated
{
  const r = projectEcommerceReturnIntentReasonBrief(
    state([returnIntent('Damaged'), returnIntent('Damaged'), returnIntent('Damaged')]),
  )
  check(r.totalReturnIntents === 3, 'repeat: totalReturnIntents 3')
  check(r.uniqueReasons === 1, 'repeat: uniqueReasons 1')
  check(r.topReasonsByCount[0]?.count === 3, 'repeat: top count 3')
}

// 4. Distribution: 2 reasons
{
  const r = projectEcommerceReturnIntentReasonBrief(
    state([
      returnIntent('Wrong item'),
      returnIntent('Wrong item'),
      returnIntent('Defective product'),
    ]),
  )
  check(r.uniqueReasons === 2, 'dist: uniqueReasons 2')
  check(r.topReasonsByCount[0]?.reason === 'Wrong item', 'dist: top reason Wrong item')
  check(r.topReasonsByCount[0]?.count === 2, 'dist: top count 2')
  check(r.topReasonsByCount[1]?.reason === 'Defective product', 'dist: second reason')
  check(r.topReasonsByCount[1]?.count === 1, 'dist: second count 1')
}

// 5. Top-5 cap
{
  const reasons = [
    'Reason A', 'Reason B', 'Reason C', 'Reason D', 'Reason E', 'Reason F',
  ]
  const r = projectEcommerceReturnIntentReasonBrief(state(reasons.map(s => returnIntent(s))))
  check(r.totalReturnIntents === 6, 'cap: totalReturnIntents 6')
  check(r.uniqueReasons === 6, 'cap: uniqueReasons 6')
  check(r.topReasonsByCount.length === 5, 'cap: top capped at 5')
}

// 6. Alphabetical tiebreak: all count=1, 6 reasons
{
  const reasons = ['Zebra reason', 'Alpha reason', 'Charlie reason', 'Beta reason', 'Delta reason', 'Echo reason']
  const r = projectEcommerceReturnIntentReasonBrief(state(reasons.map(s => returnIntent(s))))
  check(r.topReasonsByCount[0]?.reason === 'Alpha reason', 'tiebreak: Alpha first')
  check(r.topReasonsByCount[1]?.reason === 'Beta reason', 'tiebreak: Beta second')
  check(r.topReasonsByCount[2]?.reason === 'Charlie reason', 'tiebreak: Charlie third')
}

// 7. Frequency dominates over alpha
{
  const r = projectEcommerceReturnIntentReasonBrief(
    state([
      returnIntent('Zebra'),
      returnIntent('Zebra'),
      returnIntent('Zebra'),
      returnIntent('Alpha'),
    ]),
  )
  check(r.topReasonsByCount[0]?.reason === 'Zebra', 'freq: Zebra first despite Z')
  check(r.topReasonsByCount[1]?.reason === 'Alpha', 'freq: Alpha second')
}

// 8. Unicode reason strings
{
  const r = projectEcommerceReturnIntentReasonBrief(
    state([returnIntent('ပစ္စည်း မမှန်'), returnIntent('ပစ္စည်း မမှန်')]),
  )
  check(r.uniqueReasons === 1, 'unicode: uniqueReasons 1')
  check(r.topReasonsByCount[0]?.count === 2, 'unicode: count 2')
}

console.log(JSON.stringify({ ok: true, checks }))
