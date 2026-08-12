import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentOrderStatusSwitchBrief } from './ecommerce-amendment-intent-order-status-switch-brief.ts'`,
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

const { projectEcommerceAmendmentIntentOrderStatusSwitchBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(orderStatus = 'confirmed', fromFulfilment = 'delivery', toFulfilment = 'delivery') {
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
    orderStatus,
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 15000,
    replacementRequestId: `REP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    lineChanges: [{ sku: 'SKU-1', name: 'Item 1', fromQuantity: 2, toQuantity: 1 }],
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
  const r = projectEcommerceAmendmentIntentOrderStatusSwitchBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.confirmedSameCount === 0, 'empty: confirmedSameCount 0')
  check(r.readySwitchCount === 0, 'empty: readySwitchCount 0')
}

// 2. Confirmed same-mode (fromFulfilment === toFulfilment)
{
  const r = projectEcommerceAmendmentIntentOrderStatusSwitchBrief(state([
    amendmentIntent('confirmed', 'delivery', 'delivery'),
  ]))
  check(r.totalIntents === 1, 'confirmed-same: totalIntents 1')
  check(r.confirmedSameCount === 1, 'confirmed-same: confirmedSameCount 1')
  check(r.confirmedSwitchCount === 0, 'confirmed-same: confirmedSwitchCount 0')
  check(r.preparingSameCount === 0, 'confirmed-same: preparingSameCount 0')
}

// 3. Confirmed switch-mode (fromFulfilment !== toFulfilment)
{
  const r = projectEcommerceAmendmentIntentOrderStatusSwitchBrief(state([
    amendmentIntent('confirmed', 'delivery', 'pickup'),
  ]))
  check(r.confirmedSwitchCount === 1, 'confirmed-switch: confirmedSwitchCount 1')
  check(r.confirmedSameCount === 0, 'confirmed-switch: confirmedSameCount 0')
  check(r.totalIntents === 1, 'confirmed-switch: totalIntents 1')
  check(r.preparingSwitchCount === 0, 'confirmed-switch: preparingSwitchCount 0')
}

// 4. Preparing same-mode
{
  const r = projectEcommerceAmendmentIntentOrderStatusSwitchBrief(state([
    amendmentIntent('preparing', 'pickup', 'pickup'),
  ]))
  check(r.preparingSameCount === 1, 'preparing-same: preparingSameCount 1')
  check(r.preparingSwitchCount === 0, 'preparing-same: preparingSwitchCount 0')
  check(r.totalIntents === 1, 'preparing-same: totalIntents 1')
}

// 5. Ready switch-mode
{
  const r = projectEcommerceAmendmentIntentOrderStatusSwitchBrief(state([
    amendmentIntent('ready', 'pickup', 'delivery'),
  ]))
  check(r.readySwitchCount === 1, 'ready-switch: readySwitchCount 1')
  check(r.readySameCount === 0, 'ready-switch: readySameCount 0')
  check(r.totalIntents === 1, 'ready-switch: totalIntents 1')
}

// 6. All 6 cells: confirmed-same, confirmed-switch, preparing-same, preparing-switch, ready-same, ready-switch
{
  const r = projectEcommerceAmendmentIntentOrderStatusSwitchBrief(state([
    amendmentIntent('confirmed', 'delivery', 'delivery'),
    amendmentIntent('confirmed', 'delivery', 'pickup'),
    amendmentIntent('preparing', 'pickup', 'pickup'),
    amendmentIntent('preparing', 'pickup', 'delivery'),
    amendmentIntent('ready', 'delivery', 'delivery'),
    amendmentIntent('ready', 'pickup', 'delivery'),
  ]))
  check(r.totalIntents === 6, 'all-cells: totalIntents 6')
  check(r.confirmedSameCount === 1, 'all-cells: confirmedSameCount 1')
  check(r.preparingSwitchCount === 1, 'all-cells: preparingSwitchCount 1')
  check(r.readySameCount === 1, 'all-cells: readySameCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceAmendmentIntentOrderStatusSwitchBrief(state([
    amendmentIntent('confirmed', 'delivery', 'delivery'),
    amendmentIntent('confirmed', 'delivery', 'pickup'),
    amendmentIntent('preparing', 'pickup', 'pickup'),
    amendmentIntent('preparing', 'pickup', 'delivery'),
    amendmentIntent('ready', 'delivery', 'delivery'),
    amendmentIntent('ready', 'pickup', 'delivery'),
  ]))
  check(r.confirmedSwitchCount === 1, 'sub-buckets: confirmedSwitchCount 1')
  check(r.preparingSameCount === 1, 'sub-buckets: preparingSameCount 1')
}

console.log(`ecommerce-amendment-intent-order-status-switch-brief: ${checks} checks passed`)
