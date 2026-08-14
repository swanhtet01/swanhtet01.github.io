import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentFulfilmentRatesBrief } from './ecommerce-reschedule-intent-fulfilment-rates-brief.ts'`,
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

const { projectEcommerceRescheduleIntentFulfilmentRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ORIGINAL = '2026-08-05T10:00:00Z'
const PUSHED_BACK = '2026-08-07T10:00:00Z'

let intentId = 0
function rescheduleIntent({ fulfilment = 'delivery' } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ERI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    fulfilment,
    originalPromisedAt: ORIGINAL,
    requestedPromisedAt: PUSHED_BACK,
    reason: 'Reschedule reason',
    customerMessageSent: false,
    replacementRequestId: null,
    originalTotalMmk: 10000,
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceRescheduleIntentFulfilmentRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.deliveryCount === 0, 'empty:deliveryCount')
  check(r.deliveryRate === 0, 'empty:deliveryRate')
  check(r.pickupCount === 0, 'empty:pickupCount')
  check(r.pickupRate === 0, 'empty:pickupRate')
}

// 2. Single delivery — 3 checks
{
  const r = projectEcommerceRescheduleIntentFulfilmentRatesBrief(state([rescheduleIntent()]))
  check(r.totalIntents === 1, 'delivery:total')
  check(r.deliveryCount === 1, 'delivery:count')
  check(r.deliveryRate === 1, 'delivery:rate')
}

// 3. Single pickup — 3 checks
{
  const r = projectEcommerceRescheduleIntentFulfilmentRatesBrief(state([
    rescheduleIntent({ fulfilment: 'pickup' }),
  ]))
  check(r.totalIntents === 1, 'pickup:total')
  check(r.pickupCount === 1, 'pickup:count')
  check(r.pickupRate === 1, 'pickup:rate')
}

// 4. 2 delivery, 0 pickup — 3 checks
{
  const r = projectEcommerceRescheduleIntentFulfilmentRatesBrief(state([rescheduleIntent(), rescheduleIntent()]))
  check(r.deliveryCount === 2, 'allDelivery:count')
  check(r.pickupCount === 0, 'allDelivery:pickupCount')
  check(r.deliveryRate === 1, 'allDelivery:rate')
}

// 5. 2 pickup, 0 delivery — 2 checks
{
  const r = projectEcommerceRescheduleIntentFulfilmentRatesBrief(state([
    rescheduleIntent({ fulfilment: 'pickup' }),
    rescheduleIntent({ fulfilment: 'pickup' }),
  ]))
  check(r.pickupCount === 2, 'allPickup:count')
  check(r.deliveryCount === 0, 'allPickup:deliveryCount')
}

// 6. 1 delivery + 1 pickup — 3 checks
{
  const r = projectEcommerceRescheduleIntentFulfilmentRatesBrief(state([
    rescheduleIntent(),
    rescheduleIntent({ fulfilment: 'pickup' }),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.deliveryRate === 0.5, 'half:deliveryRate')
  check(r.pickupRate === 0.5, 'half:pickupRate')
}

// 7. Precision: 1 delivery + 2 pickup (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceRescheduleIntentFulfilmentRatesBrief(state([
    rescheduleIntent(),
    rescheduleIntent({ fulfilment: 'pickup' }),
    rescheduleIntent({ fulfilment: 'pickup' }),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.deliveryCount === 1, 'precision:deliveryCount')
  check(r.deliveryRate === 0.3333, 'precision:deliveryRate')
  check(r.pickupRate === 0.6667, 'precision:pickupRate')
}

console.log(`ecommerce-reschedule-intent-fulfilment-rates-brief: ${checks} checks passed`)
