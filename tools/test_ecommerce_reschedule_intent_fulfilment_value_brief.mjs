// Ecommerce reschedule intent fulfilment + originalTotalMmk brief.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentFulfilmentValueBrief } from './ecommerce-reschedule-intent-fulfilment-value-brief.ts'`,
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

const { projectEcommerceRescheduleIntentFulfilmentValueBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function rescheduleIntent({ fulfilment = 'delivery', originalTotalMmk = 5000 } = {}) {
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
    originalPromisedAt: '2026-08-03T10:00:00Z',
    replacementRequestId: `RPL-${intentId}`,
    replacementRequestDigest: `rpd-${intentId}`,
    requestedPromisedAt: '2026-08-05T10:00:00Z',
    fulfilment,
    reason: 'Not available on original date',
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

function state(rescheduleIntents) {
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
  const r = projectEcommerceRescheduleIntentFulfilmentValueBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.pickupCount === 0, 'empty: pickupCount 0')
  check(r.deliveryCount === 0, 'empty: deliveryCount 0')
  check(r.minOriginalValueMmk === null, 'empty: min null')
  check(r.maxOriginalValueMmk === null, 'empty: max null')
  check(r.averageOriginalValueMmk === 0, 'empty: avg 0')
}

// 2. All pickup
{
  const r = projectEcommerceRescheduleIntentFulfilmentValueBrief(
    state([rescheduleIntent({ fulfilment: 'pickup' }), rescheduleIntent({ fulfilment: 'pickup' })]),
  )
  check(r.pickupCount === 2, 'all-pickup: pickupCount 2')
  check(r.deliveryCount === 0, 'all-pickup: deliveryCount 0')
  check(r.pickupRate === 100, 'all-pickup: pickupRate 100')
  check(r.deliveryRate === 0, 'all-pickup: deliveryRate 0')
}

// 3. All delivery
{
  const r = projectEcommerceRescheduleIntentFulfilmentValueBrief(
    state([rescheduleIntent({ fulfilment: 'delivery' })]),
  )
  check(r.deliveryCount === 1, 'all-delivery: deliveryCount 1')
  check(r.deliveryRate === 100, 'all-delivery: deliveryRate 100')
}

// 4. 50/50 split
{
  const r = projectEcommerceRescheduleIntentFulfilmentValueBrief(
    state([rescheduleIntent({ fulfilment: 'pickup' }), rescheduleIntent({ fulfilment: 'delivery' })]),
  )
  check(r.pickupRate === 50, 'split: pickupRate 50')
  check(r.deliveryRate === 50, 'split: deliveryRate 50')
}

// 5. Counts sum to total invariant
{
  const r = projectEcommerceRescheduleIntentFulfilmentValueBrief(
    state([
      rescheduleIntent({ fulfilment: 'pickup' }),
      rescheduleIntent({ fulfilment: 'delivery' }),
      rescheduleIntent({ fulfilment: 'delivery' }),
    ]),
  )
  check(r.pickupCount + r.deliveryCount === r.totalIntents, 'invariant: counts sum to total')
  check(r.deliveryRate === 67, 'round: deliveryRate 67')
}

// 6. Value min/max/avg
{
  const r = projectEcommerceRescheduleIntentFulfilmentValueBrief(
    state([
      rescheduleIntent({ originalTotalMmk: 1000 }),
      rescheduleIntent({ originalTotalMmk: 5000 }),
      rescheduleIntent({ originalTotalMmk: 3000 }),
    ]),
  )
  check(r.minOriginalValueMmk === 1000, 'value: min 1000')
  check(r.maxOriginalValueMmk === 5000, 'value: max 5000')
  check(r.totalOriginalValueMmk === 9000, 'value: total 9000')
  check(r.averageOriginalValueMmk === 3000, 'value: avg 3000')
}

// 7. Avg rounding: (1000 + 2000 + 2000) / 3 = 1667
{
  const r = projectEcommerceRescheduleIntentFulfilmentValueBrief(
    state([
      rescheduleIntent({ originalTotalMmk: 1000 }),
      rescheduleIntent({ originalTotalMmk: 2000 }),
      rescheduleIntent({ originalTotalMmk: 2000 }),
    ]),
  )
  check(r.averageOriginalValueMmk === 1667, 'round: avg 1667')
}

console.log(JSON.stringify({ ok: true, checks }))
