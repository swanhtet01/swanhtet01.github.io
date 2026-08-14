import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentTotalMmkBrief } from './ecommerce-cancellation-intent-total-mmk-brief.ts'`,
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

const { projectEcommerceCancellationIntentTotalMmkBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(totalMmk = 10000) {
  intentId++
  return {
    schema: 'supermega.ecommerce.cancellation_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `CXI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk,
    reasonCode: 'changed_mind',
    reason: 'Customer changed mind',
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(cancellationIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents,
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCancellationIntentTotalMmkBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.minTotalMmk === null, 'empty: minTotalMmk null')
  check(r.maxTotalMmk === null, 'empty: maxTotalMmk null')
  check(r.sumTotalMmk === 0, 'empty: sumTotalMmk 0')
}

// 2. Single intent
{
  const r = projectEcommerceCancellationIntentTotalMmkBrief(state([cancellationIntent(5000)]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.minTotalMmk === 5000, 'single: minTotalMmk 5000')
  check(r.maxTotalMmk === 5000, 'single: maxTotalMmk 5000')
  check(r.sumTotalMmk === 5000, 'single: sumTotalMmk 5000')
}

// 3. Two intents — min, max, sum correct
{
  const r = projectEcommerceCancellationIntentTotalMmkBrief(state([
    cancellationIntent(3000),
    cancellationIntent(8000),
  ]))
  check(r.totalIntents === 2, 'two: totalIntents 2')
  check(r.minTotalMmk === 3000, 'two: minTotalMmk 3000')
  check(r.maxTotalMmk === 8000, 'two: maxTotalMmk 8000')
  check(r.sumTotalMmk === 11000, 'two: sumTotalMmk 11000')
}

// 4. Three intents out of order — correct min/max
{
  const r = projectEcommerceCancellationIntentTotalMmkBrief(state([
    cancellationIntent(12000),
    cancellationIntent(4000),
    cancellationIntent(7500),
  ]))
  check(r.totalIntents === 3, 'unsorted: totalIntents 3')
  check(r.minTotalMmk === 4000, 'unsorted: minTotalMmk 4000')
  check(r.maxTotalMmk === 12000, 'unsorted: maxTotalMmk 12000')
  check(r.sumTotalMmk === 23500, 'unsorted: sumTotalMmk 23500')
}

// 5. All same value
{
  const r = projectEcommerceCancellationIntentTotalMmkBrief(state([
    cancellationIntent(6000),
    cancellationIntent(6000),
    cancellationIntent(6000),
  ]))
  check(r.totalIntents === 3, 'same: totalIntents 3')
  check(r.minTotalMmk === 6000, 'same: minTotalMmk 6000')
  check(r.maxTotalMmk === 6000, 'same: maxTotalMmk 6000')
  check(r.sumTotalMmk === 18000, 'same: sumTotalMmk 18000')
}

// 6. Single large value — sum equals value
{
  const r = projectEcommerceCancellationIntentTotalMmkBrief(state([cancellationIntent(99999)]))
  check(r.minTotalMmk === r.maxTotalMmk, 'large: min equals max')
  check(r.sumTotalMmk === 99999, 'large: sumTotalMmk 99999')
  check(r.totalIntents === 1, 'large: totalIntents 1')
}

console.log(`ecommerce-cancellation-intent-total-mmk-brief: ${checks} checks passed`)
