import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentFulfilmentSwitchRatesBrief } from './ecommerce-amendment-intent-fulfilment-switch-rates-brief.ts'`,
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

const { projectEcommerceAmendmentIntentFulfilmentSwitchRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent({ fromFulfilment = 'pickup', toFulfilment = 'delivery' } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `EAM-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 15000,
    replacementRequestId: `REP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    lineChanges: [],
    fromFulfilment,
    toFulfilment,
    reason: 'Amendment reason',
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.switchedCount === 0, 'empty:switchedCount')
  check(r.switchedRate === 0, 'empty:switchedRate')
  check(r.notSwitchedCount === 0, 'empty:notSwitchedCount')
  check(r.notSwitchedRate === 0, 'empty:notSwitchedRate')
}

// 2. Single switched (pickup → delivery) — 3 checks
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchRatesBrief(state([amendmentIntent()]))
  check(r.totalIntents === 1, 'switched:total')
  check(r.switchedCount === 1, 'switched:count')
  check(r.switchedRate === 1, 'switched:rate')
}

// 3. Single not switched (pickup → pickup) — 3 checks
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchRatesBrief(state([
    amendmentIntent({ fromFulfilment: 'pickup', toFulfilment: 'pickup' }),
  ]))
  check(r.totalIntents === 1, 'notSwitched:total')
  check(r.notSwitchedCount === 1, 'notSwitched:count')
  check(r.notSwitchedRate === 1, 'notSwitched:rate')
}

// 4. 2 switched — 3 checks
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchRatesBrief(state([
    amendmentIntent(),
    amendmentIntent(),
  ]))
  check(r.switchedCount === 2, 'twoSwitched:count')
  check(r.notSwitchedCount === 0, 'twoSwitched:notSwitchedCount')
  check(r.switchedRate === 1, 'twoSwitched:rate')
}

// 5. 2 not switched — 2 checks
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchRatesBrief(state([
    amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'delivery' }),
    amendmentIntent({ fromFulfilment: 'pickup', toFulfilment: 'pickup' }),
  ]))
  check(r.notSwitchedCount === 2, 'twoNotSwitched:count')
  check(r.switchedCount === 0, 'twoNotSwitched:switchedCount')
}

// 6. 1 switched + 1 not switched — 3 checks
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchRatesBrief(state([
    amendmentIntent(),
    amendmentIntent({ fromFulfilment: 'pickup', toFulfilment: 'pickup' }),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.switchedRate === 0.5, 'half:switchedRate')
  check(r.notSwitchedRate === 0.5, 'half:notSwitchedRate')
}

// 7. Precision: 1 switched + 2 not switched (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchRatesBrief(state([
    amendmentIntent(),
    amendmentIntent({ fromFulfilment: 'delivery', toFulfilment: 'delivery' }),
    amendmentIntent({ fromFulfilment: 'pickup', toFulfilment: 'pickup' }),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.switchedCount === 1, 'precision:switchedCount')
  check(r.switchedRate === 0.3333, 'precision:switchedRate')
  check(r.notSwitchedRate === 0.6667, 'precision:notSwitchedRate')
}

console.log(`ecommerce-amendment-intent-fulfilment-switch-rates-brief: ${checks} checks passed`)
