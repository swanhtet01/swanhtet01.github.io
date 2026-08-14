import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentLineCountSwitchBrief } from './ecommerce-amendment-intent-line-count-switch-brief.ts'`,
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

const { projectEcommerceAmendmentIntentLineCountSwitchBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(lineCount = 1, fromFulfilment = 'delivery', toFulfilment = 'delivery') {
  intentId++
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    sku: `SKU-${i + 1}`,
    name: `Item ${i + 1}`,
    fromQuantity: 2,
    toQuantity: 1,
  }))
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
    lineChanges: lines,
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
  const r = projectEcommerceAmendmentIntentLineCountSwitchBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.singleSameCount === 0, 'empty: singleSameCount 0')
  check(r.multiSwitchCount === 0, 'empty: multiSwitchCount 0')
}

// 2. Single line + same fulfilment (no switch)
{
  const r = projectEcommerceAmendmentIntentLineCountSwitchBrief(state([
    amendmentIntent(1, 'delivery', 'delivery'),
  ]))
  check(r.totalIntents === 1, 'single-same: totalIntents 1')
  check(r.singleSameCount === 1, 'single-same: singleSameCount 1')
  check(r.singleSwitchCount === 0, 'single-same: singleSwitchCount 0')
  check(r.multiSameCount === 0, 'single-same: multiSameCount 0')
}

// 3. Single line + switch fulfilment
{
  const r = projectEcommerceAmendmentIntentLineCountSwitchBrief(state([
    amendmentIntent(1, 'delivery', 'pickup'),
  ]))
  check(r.singleSwitchCount === 1, 'single-switch: singleSwitchCount 1')
  check(r.singleSameCount === 0, 'single-switch: singleSameCount 0')
  check(r.totalIntents === 1, 'single-switch: totalIntents 1')
  check(r.multiSwitchCount === 0, 'single-switch: multiSwitchCount 0')
}

// 4. Multi line + same fulfilment
{
  const r = projectEcommerceAmendmentIntentLineCountSwitchBrief(state([
    amendmentIntent(3, 'pickup', 'pickup'),
  ]))
  check(r.multiSameCount === 1, 'multi-same: multiSameCount 1')
  check(r.multiSwitchCount === 0, 'multi-same: multiSwitchCount 0')
  check(r.totalIntents === 1, 'multi-same: totalIntents 1')
}

// 5. Multi line + switch fulfilment
{
  const r = projectEcommerceAmendmentIntentLineCountSwitchBrief(state([
    amendmentIntent(2, 'pickup', 'delivery'),
  ]))
  check(r.multiSwitchCount === 1, 'multi-switch: multiSwitchCount 1')
  check(r.multiSameCount === 0, 'multi-switch: multiSameCount 0')
  check(r.totalIntents === 1, 'multi-switch: totalIntents 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceAmendmentIntentLineCountSwitchBrief(state([
    amendmentIntent(1, 'delivery', 'delivery'),
    amendmentIntent(1, 'delivery', 'pickup'),
    amendmentIntent(2, 'pickup', 'pickup'),
    amendmentIntent(3, 'pickup', 'delivery'),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.singleSameCount === 1, 'all-cells: singleSameCount 1')
  check(r.multiSwitchCount === 1, 'all-cells: multiSwitchCount 1')
  check(r.singleCount === 2, 'all-cells: singleCount 2')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceAmendmentIntentLineCountSwitchBrief(state([
    amendmentIntent(1, 'delivery', 'delivery'),
    amendmentIntent(1, 'delivery', 'pickup'),
    amendmentIntent(2, 'pickup', 'pickup'),
    amendmentIntent(3, 'pickup', 'delivery'),
  ]))
  check(r.singleSwitchCount === 1, 'sub-buckets: singleSwitchCount 1')
  check(r.multiSameCount === 1, 'sub-buckets: multiSameCount 1')
}

console.log(`ecommerce-amendment-intent-line-count-switch-brief: ${checks} checks passed`)
