import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentSkuBrief } from './ecommerce-return-intent-sku-brief.ts'`,
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

const { projectEcommerceReturnIntentSkuBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function returnIntent(sku = 'SKU-DEFAULT') {
  intentId++
  return {
    schema: 'supermega.ecommerce.return_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `RTI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sku,
    quantity: 1,
    disposition: { action: 'refund', notes: null },
    reason: 'Item not as described',
    refundStatus: 'not_started',
    evidenceReference: `ev-${intentId}`,
  }
}

function state(returnIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents,
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceReturnIntentSkuBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
  check(r.topSku === null, 'empty: topSku null')
  check(r.topSkuCount === 0, 'empty: topSkuCount 0')
}

// 2. Single intent — one unique SKU
{
  const r = projectEcommerceReturnIntentSkuBrief(state([returnIntent('SKU-TYRE-001')]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.uniqueSkus === 1, 'single: uniqueSkus 1')
  check(r.topSku === 'SKU-TYRE-001', 'single: topSku')
  check(r.topSkuCount === 1, 'single: topSkuCount 1')
}

// 3. Two intents with same SKU — uniqueSkus 1, topCount 2
{
  const r = projectEcommerceReturnIntentSkuBrief(state([
    returnIntent('SKU-TYRE-002'),
    returnIntent('SKU-TYRE-002'),
  ]))
  check(r.totalIntents === 2, 'same-sku: totalIntents 2')
  check(r.uniqueSkus === 1, 'same-sku: uniqueSkus 1')
  check(r.topSku === 'SKU-TYRE-002', 'same-sku: topSku')
  check(r.topSkuCount === 2, 'same-sku: topSkuCount 2')
}

// 4. Two intents different SKUs — uniqueSkus 2, topCount 1
{
  const r = projectEcommerceReturnIntentSkuBrief(state([
    returnIntent('SKU-TYRE-003'),
    returnIntent('SKU-TYRE-004'),
  ]))
  check(r.totalIntents === 2, 'two-diff: totalIntents 2')
  check(r.uniqueSkus === 2, 'two-diff: uniqueSkus 2')
  check(r.topSkuCount === 1, 'two-diff: topSkuCount 1')
  check(r.topSku !== null, 'two-diff: topSku set')
}

// 5. Three intents: one SKU appears twice — dominant topSku
{
  const r = projectEcommerceReturnIntentSkuBrief(state([
    returnIntent('SKU-TYRE-005'),
    returnIntent('SKU-TYRE-006'),
    returnIntent('SKU-TYRE-005'),
  ]))
  check(r.totalIntents === 3, 'dominant: totalIntents 3')
  check(r.uniqueSkus === 2, 'dominant: uniqueSkus 2')
  check(r.topSku === 'SKU-TYRE-005', 'dominant: topSku')
  check(r.topSkuCount === 2, 'dominant: topSkuCount 2')
}

// 6. Three intents all different SKUs — uniqueSkus 3, topCount 1
{
  const r = projectEcommerceReturnIntentSkuBrief(state([
    returnIntent('SKU-TYRE-007'),
    returnIntent('SKU-TYRE-008'),
    returnIntent('SKU-TYRE-009'),
  ]))
  check(r.totalIntents === 3, 'all-diff: totalIntents 3')
  check(r.uniqueSkus === 3, 'all-diff: uniqueSkus 3')
  check(r.topSkuCount === 1, 'all-diff: topSkuCount 1')
}

console.log(`ecommerce-return-intent-sku-brief: ${checks} checks passed`)
