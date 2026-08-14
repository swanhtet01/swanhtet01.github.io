import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentOriginalTotalBrief } from './ecommerce-amendment-intent-original-total-brief.ts'`,
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

const { projectEcommerceAmendmentIntentOriginalTotalBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(originalTotalMmk = 5000) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `AMI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk,
    replacementRequestId: `RPL-${intentId}`,
    replacementRequestDigest: `rpd-${intentId}`,
    lineChanges: [],
    fromFulfilment: 'pickup',
    toFulfilment: 'pickup',
    reason: 'Customer request',
    customerMessageSent: false,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(amendmentIntents = []) {
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
    amendmentIntents,
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceAmendmentIntentOriginalTotalBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.totalOriginalMmk === 0, 'empty: totalOriginalMmk 0')
  check(r.averageOriginalMmk === 0, 'empty: averageOriginalMmk 0')
  check(r.minOriginalMmk === null, 'empty: minOriginalMmk null')
  check(r.maxOriginalMmk === null, 'empty: maxOriginalMmk null')
}

// 2. Single intent
{
  const r = projectEcommerceAmendmentIntentOriginalTotalBrief(state([amendmentIntent(5000)]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.totalOriginalMmk === 5000, 'single: totalOriginalMmk 5000')
  check(r.averageOriginalMmk === 5000, 'single: averageOriginalMmk 5000')
  check(r.minOriginalMmk === 5000, 'single: minOriginalMmk 5000')
  check(r.maxOriginalMmk === 5000, 'single: maxOriginalMmk 5000')
}

// 3. Two intents same value
{
  const r = projectEcommerceAmendmentIntentOriginalTotalBrief(state([
    amendmentIntent(8000),
    amendmentIntent(8000),
  ]))
  check(r.totalIntents === 2, 'two-same: totalIntents 2')
  check(r.totalOriginalMmk === 16000, 'two-same: totalOriginalMmk 16000')
  check(r.averageOriginalMmk === 8000, 'two-same: averageOriginalMmk 8000')
  check(r.minOriginalMmk === 8000, 'two-same: minOriginalMmk 8000')
  check(r.maxOriginalMmk === 8000, 'two-same: maxOriginalMmk 8000')
}

// 4. Multiple intents with varying values
{
  const r = projectEcommerceAmendmentIntentOriginalTotalBrief(state([
    amendmentIntent(3000),
    amendmentIntent(7000),
    amendmentIntent(5000),
    amendmentIntent(1000),
  ]))
  check(r.totalIntents === 4, 'varied: totalIntents 4')
  check(r.totalOriginalMmk === 16000, 'varied: totalOriginalMmk 16000')
  check(r.averageOriginalMmk === 4000, 'varied: averageOriginalMmk 4000')
  check(r.minOriginalMmk === 1000, 'varied: minOriginalMmk 1000')
  check(r.maxOriginalMmk === 7000, 'varied: maxOriginalMmk 7000')
}

// 5. Single high-value intent
{
  const r = projectEcommerceAmendmentIntentOriginalTotalBrief(state([amendmentIntent(250000)]))
  check(r.maxOriginalMmk === 250000, 'high-value: maxOriginalMmk 250000')
  check(r.minOriginalMmk === 250000, 'high-value: minOriginalMmk 250000')
  check(r.totalIntents === 1, 'high-value: totalIntents 1')
}

// 6. Average rounds correctly for non-integer result
{
  const r = projectEcommerceAmendmentIntentOriginalTotalBrief(state([
    amendmentIntent(1000),
    amendmentIntent(2000),
  ]))
  // 3000 / 2 = 1500 exact
  check(r.averageOriginalMmk === 1500, 'avg-round: averageOriginalMmk 1500')
  check(r.totalOriginalMmk === 3000, 'avg-round: totalOriginalMmk 3000')
}

console.log(`ecommerce-amendment-intent-original-total-brief: ${checks} checks passed`)
