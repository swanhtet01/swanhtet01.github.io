import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentRatesBrief } from './ecommerce-amendment-intent-rates-brief.ts'`,
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

const { projectEcommerceAmendmentIntentRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent({
  fromFulfilment = 'delivery',
  toFulfilment = 'delivery',
  customerMessageSent = false,
  lineChanges = [{ sku: 'SKU-1', fromQuantity: 1, toQuantity: 2 }],
} = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `EAI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    fromFulfilment,
    toFulfilment,
    lineChanges,
    originalTotalMmk: 10000,
    reason: 'Reason',
    customerMessageSent,
    replacementRequestId: null,
    evidenceReference: `ev-${intentId}`,
  }
}

const MULTI_LINE = [
  { sku: 'SKU-1', fromQuantity: 1, toQuantity: 2 },
  { sku: 'SKU-2', fromQuantity: 3, toQuantity: 1 },
]

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
  const r = projectEcommerceAmendmentIntentRatesBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.fulfilmentSwitchRate === 0, 'empty: fulfilmentSwitchRate 0')
  check(r.multiLineRate === 0, 'empty: multiLineRate 0')
}

// 2. One intent with fulfilment switch
{
  const r = projectEcommerceAmendmentIntentRatesBrief(state([
    amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'pickup' }),
  ]))
  check(r.totalIntents === 1, 'switch: totalIntents 1')
  check(r.fulfilmentSwitchCount === 1, 'switch: fulfilmentSwitchCount 1')
  check(r.fulfilmentSwitchRate === 1, 'switch: fulfilmentSwitchRate 1')
}

// 3. One intent, same fulfilment (no switch)
{
  const r = projectEcommerceAmendmentIntentRatesBrief(state([
    amendmentIntent({ fromFulfilment: 'pickup', toFulfilment: 'pickup' }),
  ]))
  check(r.fulfilmentSwitchCount === 0, 'no-switch: fulfilmentSwitchCount 0')
  check(r.customerNotificationCount === 0, 'no-switch: customerNotificationCount 0')
  check(r.multiLineCount === 0, 'no-switch: multiLineCount 0')
}

// 4. One intent with customer notification
{
  const r = projectEcommerceAmendmentIntentRatesBrief(state([
    amendmentIntent({ customerMessageSent: true }),
  ]))
  check(r.customerNotificationCount === 1, 'notified: customerNotificationCount 1')
  check(r.customerNotificationRate === 1, 'notified: customerNotificationRate 1')
  check(r.fulfilmentSwitchCount === 0, 'notified: fulfilmentSwitchCount 0')
}

// 5. One intent with multi-line change
{
  const r = projectEcommerceAmendmentIntentRatesBrief(state([
    amendmentIntent({ lineChanges: MULTI_LINE }),
  ]))
  check(r.multiLineCount === 1, 'multi-line: multiLineCount 1')
  check(r.multiLineRate === 1, 'multi-line: multiLineRate 1')
  check(r.customerNotificationCount === 0, 'multi-line: customerNotificationCount 0')
}

// 6. Four intents mixed
{
  const r = projectEcommerceAmendmentIntentRatesBrief(state([
    amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'pickup', customerMessageSent: true }),
    amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'pickup', customerMessageSent: true, lineChanges: MULTI_LINE }),
    amendmentIntent({ customerMessageSent: true }),
    amendmentIntent(),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.fulfilmentSwitchRate === 0.5, 'mixed: fulfilmentSwitchRate 0.5')
  check(r.customerNotificationRate === 0.75, 'mixed: customerNotificationRate 0.75')
  check(r.multiLineRate === 0.25, 'mixed: multiLineRate 0.25')
}

// 7. Two intents: switch+multi vs neither
{
  const r = projectEcommerceAmendmentIntentRatesBrief(state([
    amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'pickup', lineChanges: MULTI_LINE }),
    amendmentIntent(),
  ]))
  check(r.totalIntents === 2, 'split: totalIntents 2')
  check(r.fulfilmentSwitchRate === 0.5, 'split: fulfilmentSwitchRate 0.5')
  check(r.multiLineRate === 0.5, 'split: multiLineRate 0.5')
  check(r.customerNotificationRate === 0, 'split: customerNotificationRate 0')
}

console.log(`ecommerce-amendment-intent-rates-brief: ${checks} checks passed`)
