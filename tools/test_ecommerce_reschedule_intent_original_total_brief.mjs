import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentOriginalTotalBrief } from './ecommerce-reschedule-intent-original-total-brief.ts'`,
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

const { projectEcommerceRescheduleIntentOriginalTotalBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function rescheduleIntent(originalTotalMmk = 18500) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `RSI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk,
    originalPromisedAt: '2026-08-01T12:00:00Z',
    replacementRequestId: `RRP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    requestedPromisedAt: '2026-08-02T12:00:00Z',
    fulfilment: 'pickup',
    reason: 'Need more time',
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    riderBooked: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(rescheduleIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents,
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceRescheduleIntentOriginalTotalBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.totalOriginalMmk === 0, 'empty: totalOriginalMmk 0')
  check(r.averageOriginalMmk === 0, 'empty: averageOriginalMmk 0')
  check(r.minOriginalMmk === null, 'empty: minOriginalMmk null')
  check(r.maxOriginalMmk === null, 'empty: maxOriginalMmk null')
}

// 2. Single intent with default value
{
  const r = projectEcommerceRescheduleIntentOriginalTotalBrief(state([rescheduleIntent(18500)]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.totalOriginalMmk === 18500, 'single: totalOriginalMmk 18500')
  check(r.averageOriginalMmk === 18500, 'single: averageOriginalMmk 18500')
  check(r.minOriginalMmk === 18500, 'single: minOriginalMmk 18500')
  check(r.maxOriginalMmk === 18500, 'single: maxOriginalMmk 18500')
}

// 3. Two intents same value
{
  const r = projectEcommerceRescheduleIntentOriginalTotalBrief(state([
    rescheduleIntent(12000),
    rescheduleIntent(12000),
  ]))
  check(r.totalIntents === 2, 'two-same: totalIntents 2')
  check(r.totalOriginalMmk === 24000, 'two-same: totalOriginalMmk 24000')
  check(r.averageOriginalMmk === 12000, 'two-same: averageOriginalMmk 12000')
  check(r.minOriginalMmk === 12000, 'two-same: minOriginalMmk 12000')
  check(r.maxOriginalMmk === 12000, 'two-same: maxOriginalMmk 12000')
}

// 4. Multiple intents with varying values
{
  const r = projectEcommerceRescheduleIntentOriginalTotalBrief(state([
    rescheduleIntent(5000),
    rescheduleIntent(20000),
    rescheduleIntent(10000),
    rescheduleIntent(5000),
  ]))
  check(r.totalIntents === 4, 'varied: totalIntents 4')
  check(r.totalOriginalMmk === 40000, 'varied: totalOriginalMmk 40000')
  check(r.averageOriginalMmk === 10000, 'varied: averageOriginalMmk 10000')
  check(r.minOriginalMmk === 5000, 'varied: minOriginalMmk 5000')
  check(r.maxOriginalMmk === 20000, 'varied: maxOriginalMmk 20000')
}

// 5. High-value single intent
{
  const r = projectEcommerceRescheduleIntentOriginalTotalBrief(state([rescheduleIntent(500000)]))
  check(r.maxOriginalMmk === 500000, 'high-value: maxOriginalMmk 500000')
  check(r.minOriginalMmk === 500000, 'high-value: minOriginalMmk 500000')
  check(r.totalIntents === 1, 'high-value: totalIntents 1')
}

// 6. Average rounds correctly
{
  const r = projectEcommerceRescheduleIntentOriginalTotalBrief(state([
    rescheduleIntent(10000),
    rescheduleIntent(20000),
    rescheduleIntent(30000),
  ]))
  // 60000 / 3 = 20000
  check(r.averageOriginalMmk === 20000, 'avg-three: averageOriginalMmk 20000')
  check(r.totalOriginalMmk === 60000, 'avg-three: totalOriginalMmk 60000')
}

console.log(`ecommerce-reschedule-intent-original-total-brief: ${checks} checks passed`)
