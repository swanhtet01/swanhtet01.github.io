import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentLineCountBrief } from './ecommerce-amendment-intent-line-count-brief.ts'`,
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

const { projectEcommerceAmendmentIntentLineCountBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent(lineChanges = []) {
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
    lineChanges,
    fromFulfilment: 'delivery',
    toFulfilment: 'delivery',
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

function lineChange(sku = 'SKU-001', fromQuantity = 2, toQuantity = 1) {
  return { sku, name: `Item ${sku}`, fromQuantity, toQuantity }
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
  const r = projectEcommerceAmendmentIntentLineCountBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.singleLineCount === 0, 'empty: singleLineCount 0')
  check(r.multiLineCount === 0, 'empty: multiLineCount 0')
}

// 2. Single-line amendment
{
  const r = projectEcommerceAmendmentIntentLineCountBrief(state([
    amendmentIntent([lineChange('SKU-001')]),
  ]))
  check(r.totalIntents === 1, 'single-line: totalIntents 1')
  check(r.singleLineCount === 1, 'single-line: singleLineCount 1')
  check(r.multiLineCount === 0, 'single-line: multiLineCount 0')
}

// 3. Multi-line amendment (2 lines)
{
  const r = projectEcommerceAmendmentIntentLineCountBrief(state([
    amendmentIntent([lineChange('SKU-001'), lineChange('SKU-002')]),
  ]))
  check(r.totalIntents === 1, 'multi-line: totalIntents 1')
  check(r.singleLineCount === 0, 'multi-line: singleLineCount 0')
  check(r.multiLineCount === 1, 'multi-line: multiLineCount 1')
}

// 4. Two single-line amendments
{
  const r = projectEcommerceAmendmentIntentLineCountBrief(state([
    amendmentIntent([lineChange('SKU-001')]),
    amendmentIntent([lineChange('SKU-002')]),
  ]))
  check(r.totalIntents === 2, 'two-single: totalIntents 2')
  check(r.singleLineCount === 2, 'two-single: singleLineCount 2')
  check(r.multiLineCount === 0, 'two-single: multiLineCount 0')
}

// 5. Two multi-line amendments (3 and 4 lines)
{
  const r = projectEcommerceAmendmentIntentLineCountBrief(state([
    amendmentIntent([lineChange('A'), lineChange('B'), lineChange('C')]),
    amendmentIntent([lineChange('D'), lineChange('E'), lineChange('F'), lineChange('G')]),
  ]))
  check(r.totalIntents === 2, 'two-multi: totalIntents 2')
  check(r.singleLineCount === 0, 'two-multi: singleLineCount 0')
  check(r.multiLineCount === 2, 'two-multi: multiLineCount 2')
}

// 6. Mixed: 2 single + 1 multi
{
  const r = projectEcommerceAmendmentIntentLineCountBrief(state([
    amendmentIntent([lineChange('SKU-001')]),
    amendmentIntent([lineChange('SKU-002'), lineChange('SKU-003')]),
    amendmentIntent([lineChange('SKU-004')]),
  ]))
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.singleLineCount === 2, 'mixed: singleLineCount 2')
  check(r.multiLineCount === 1, 'mixed: multiLineCount 1')
  check(r.singleLineCount + r.multiLineCount === r.totalIntents, 'mixed: counts sum to total')
}

// 7. All multi-line
{
  const r = projectEcommerceAmendmentIntentLineCountBrief(state([
    amendmentIntent([lineChange('A'), lineChange('B')]),
    amendmentIntent([lineChange('C'), lineChange('D')]),
    amendmentIntent([lineChange('E'), lineChange('F'), lineChange('G')]),
  ]))
  check(r.totalIntents === 3, 'all-multi: totalIntents 3')
  check(r.singleLineCount === 0, 'all-multi: singleLineCount 0')
  check(r.multiLineCount === 3, 'all-multi: multiLineCount 3')
  check(r.singleLineCount + r.multiLineCount === r.totalIntents, 'all-multi: counts sum to total')
}

console.log(`ecommerce-amendment-intent-line-count-brief: ${checks} checks passed`)
