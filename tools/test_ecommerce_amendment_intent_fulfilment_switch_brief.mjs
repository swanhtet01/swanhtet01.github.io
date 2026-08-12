import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentFulfilmentSwitchBrief } from './ecommerce-amendment-intent-fulfilment-switch-brief.ts'`,
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

const { projectEcommerceAmendmentIntentFulfilmentSwitchBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(fromFulfilment = 'delivery', toFulfilment = 'delivery') {
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
    lineChanges: [{ sku: 'SKU-001', name: 'Item 001', fromQuantity: 2, toQuantity: 1 }],
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

// 1. Empty state
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.sameModeCount === 0, 'empty: sameModeCount 0')
  check(r.modeSwitchCount === 0, 'empty: modeSwitchCount 0')
}

// 2. Same mode: delivery → delivery
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchBrief(state([
    amendmentIntent('delivery', 'delivery'),
  ]))
  check(r.totalIntents === 1, 'same-del: totalIntents 1')
  check(r.sameModeCount === 1, 'same-del: sameModeCount 1')
  check(r.modeSwitchCount === 0, 'same-del: modeSwitchCount 0')
}

// 3. Mode switch: delivery → pickup
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchBrief(state([
    amendmentIntent('delivery', 'pickup'),
  ]))
  check(r.totalIntents === 1, 'switch-del-pick: totalIntents 1')
  check(r.sameModeCount === 0, 'switch-del-pick: sameModeCount 0')
  check(r.modeSwitchCount === 1, 'switch-del-pick: modeSwitchCount 1')
}

// 4. Same mode: pickup → pickup
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchBrief(state([
    amendmentIntent('pickup', 'pickup'),
    amendmentIntent('pickup', 'pickup'),
  ]))
  check(r.totalIntents === 2, 'same-pick: totalIntents 2')
  check(r.sameModeCount === 2, 'same-pick: sameModeCount 2')
  check(r.modeSwitchCount === 0, 'same-pick: modeSwitchCount 0')
}

// 5. Mode switch: pickup → delivery
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchBrief(state([
    amendmentIntent('pickup', 'delivery'),
    amendmentIntent('pickup', 'delivery'),
  ]))
  check(r.totalIntents === 2, 'switch-pick-del: totalIntents 2')
  check(r.sameModeCount === 0, 'switch-pick-del: sameModeCount 0')
  check(r.modeSwitchCount === 2, 'switch-pick-del: modeSwitchCount 2')
}

// 6. Mixed: 2 same + 1 switch
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchBrief(state([
    amendmentIntent('delivery', 'delivery'),
    amendmentIntent('pickup', 'delivery'),
    amendmentIntent('pickup', 'pickup'),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.sameModeCount === 2, 'mixed: sameModeCount 2')
  check(r.modeSwitchCount === 1, 'mixed: modeSwitchCount 1')
  check(r.sameModeCount + r.modeSwitchCount === r.totalIntents, 'mixed: counts sum to total')
}

// 7. All mode switches
{
  const r = projectEcommerceAmendmentIntentFulfilmentSwitchBrief(state([
    amendmentIntent('delivery', 'pickup'),
    amendmentIntent('pickup', 'delivery'),
    amendmentIntent('delivery', 'pickup'),
  ]))
  check(r.totalIntents === 3, 'all-switch: totalIntents 3')
  check(r.sameModeCount === 0, 'all-switch: sameModeCount 0')
  check(r.modeSwitchCount === 3, 'all-switch: modeSwitchCount 3')
  check(r.sameModeCount + r.modeSwitchCount === r.totalIntents, 'all-switch: counts sum to total')
}

console.log(`ecommerce-amendment-intent-fulfilment-switch-brief: ${checks} checks passed`)
