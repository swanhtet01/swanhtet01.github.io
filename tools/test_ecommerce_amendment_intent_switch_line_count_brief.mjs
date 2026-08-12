import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentSwitchLineCountBrief } from './ecommerce-amendment-intent-switch-line-count-brief.ts'`,
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

const { projectEcommerceAmendmentIntentSwitchLineCountBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(fromFulfilment = 'delivery', toFulfilment = 'delivery', lineCount = 1) {
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
    lineChanges: Array.from({ length: lineCount }, (_, i) => ({
      sku: `SKU-${i + 1}`,
      name: `Item ${i + 1}`,
      fromQuantity: 2,
      toQuantity: 1,
    })),
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
  const r = projectEcommerceAmendmentIntentSwitchLineCountBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.sameModeCount === 0, 'empty: sameModeCount 0')
  check(r.switchModeCount === 0, 'empty: switchModeCount 0')
}

// 2. Same mode, single line
{
  const r = projectEcommerceAmendmentIntentSwitchLineCountBrief(state([
    amendmentIntent('delivery', 'delivery', 1),
  ]))
  check(r.totalIntents === 1, 'same-single: totalIntents 1')
  check(r.sameModeCount === 1, 'same-single: sameModeCount 1')
  check(r.sameModeSingleLineCount === 1, 'same-single: sameModeSingleLineCount 1')
  check(r.sameModeMultiLineCount === 0, 'same-single: sameModeMultiLineCount 0')
}

// 3. Same mode, multi line
{
  const r = projectEcommerceAmendmentIntentSwitchLineCountBrief(state([
    amendmentIntent('pickup', 'pickup', 3),
  ]))
  check(r.sameModeCount === 1, 'same-multi: sameModeCount 1')
  check(r.sameModeMultiLineCount === 1, 'same-multi: sameModeMultiLineCount 1')
  check(r.sameModeSingleLineCount === 0, 'same-multi: sameModeSingleLineCount 0')
}

// 4. Mode switch, single line
{
  const r = projectEcommerceAmendmentIntentSwitchLineCountBrief(state([
    amendmentIntent('delivery', 'pickup', 1),
  ]))
  check(r.switchModeCount === 1, 'switch-single: switchModeCount 1')
  check(r.switchModeSingleLineCount === 1, 'switch-single: switchModeSingleLineCount 1')
  check(r.switchModeMultiLineCount === 0, 'switch-single: switchModeMultiLineCount 0')
}

// 5. Mode switch, multi line
{
  const r = projectEcommerceAmendmentIntentSwitchLineCountBrief(state([
    amendmentIntent('pickup', 'delivery', 2),
  ]))
  check(r.switchModeCount === 1, 'switch-multi: switchModeCount 1')
  check(r.switchModeMultiLineCount === 1, 'switch-multi: switchModeMultiLineCount 1')
  check(r.sameModeSingleLineCount === 0, 'switch-multi: sameModeSingleLineCount 0')
}

// 6. All 4 cells: same-single, same-multi, switch-single, switch-multi
{
  const r = projectEcommerceAmendmentIntentSwitchLineCountBrief(state([
    amendmentIntent('delivery', 'delivery', 1),
    amendmentIntent('pickup', 'pickup', 2),
    amendmentIntent('delivery', 'pickup', 1),
    amendmentIntent('pickup', 'delivery', 3),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.sameModeCount === 2, 'all-cells: sameModeCount 2')
  check(r.switchModeCount === 2, 'all-cells: switchModeCount 2')
  check(r.sameModeSingleLineCount === 1, 'all-cells: sameModeSingleLineCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceAmendmentIntentSwitchLineCountBrief(state([
    amendmentIntent('delivery', 'delivery', 1),
    amendmentIntent('pickup', 'pickup', 2),
    amendmentIntent('delivery', 'pickup', 1),
    amendmentIntent('pickup', 'delivery', 3),
  ]))
  check(r.sameModeMultiLineCount === 1, 'sub-buckets: sameModeMultiLineCount 1')
  check(r.switchModeSingleLineCount === 1, 'sub-buckets: switchModeSingleLineCount 1')
  check(r.switchModeMultiLineCount === 1, 'sub-buckets: switchModeMultiLineCount 1')
}

console.log(`ecommerce-amendment-intent-switch-line-count-brief: ${checks} checks passed`)
