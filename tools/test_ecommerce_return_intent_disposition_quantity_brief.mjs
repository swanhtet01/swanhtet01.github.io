import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentDispositionQuantityBrief } from './ecommerce-return-intent-disposition-quantity-brief.ts'`,
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

const { projectEcommerceReturnIntentDispositionQuantityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function returnIntent(disposition = 'restock', quantity = 1) {
  intentId++
  return {
    schema: 'supermega.ecommerce.return_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ERI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sku: `SKU-${intentId}`,
    quantity,
    disposition,
    reason: 'Return reason',
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
  const r = projectEcommerceReturnIntentDispositionQuantityBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.restockSingleCount === 0, 'empty: restockSingleCount 0')
  check(r.notRestockedMultiCount === 0, 'empty: notRestockedMultiCount 0')
}

// 2. Restock + single (quantity=1)
{
  const r = projectEcommerceReturnIntentDispositionQuantityBrief(state([
    returnIntent('restock', 1),
  ]))
  check(r.totalIntents === 1, 'restock-single: totalIntents 1')
  check(r.restockSingleCount === 1, 'restock-single: restockSingleCount 1')
  check(r.restockMultiCount === 0, 'restock-single: restockMultiCount 0')
  check(r.notRestockedSingleCount === 0, 'restock-single: notRestockedSingleCount 0')
}

// 3. Restock + multi (quantity=3)
{
  const r = projectEcommerceReturnIntentDispositionQuantityBrief(state([
    returnIntent('restock', 3),
  ]))
  check(r.restockMultiCount === 1, 'restock-multi: restockMultiCount 1')
  check(r.restockSingleCount === 0, 'restock-multi: restockSingleCount 0')
  check(r.totalIntents === 1, 'restock-multi: totalIntents 1')
  check(r.notRestockedMultiCount === 0, 'restock-multi: notRestockedMultiCount 0')
}

// 4. Not restocked + single
{
  const r = projectEcommerceReturnIntentDispositionQuantityBrief(state([
    returnIntent('not_restocked', 1),
  ]))
  check(r.notRestockedSingleCount === 1, 'not-restocked-single: notRestockedSingleCount 1')
  check(r.notRestockedMultiCount === 0, 'not-restocked-single: notRestockedMultiCount 0')
  check(r.totalIntents === 1, 'not-restocked-single: totalIntents 1')
}

// 5. Not restocked + multi
{
  const r = projectEcommerceReturnIntentDispositionQuantityBrief(state([
    returnIntent('not_restocked', 5),
  ]))
  check(r.notRestockedMultiCount === 1, 'not-restocked-multi: notRestockedMultiCount 1')
  check(r.notRestockedSingleCount === 0, 'not-restocked-multi: notRestockedSingleCount 0')
  check(r.totalIntents === 1, 'not-restocked-multi: totalIntents 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceReturnIntentDispositionQuantityBrief(state([
    returnIntent('restock', 1),
    returnIntent('restock', 2),
    returnIntent('not_restocked', 1),
    returnIntent('not_restocked', 4),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.restockSingleCount === 1, 'all-cells: restockSingleCount 1')
  check(r.notRestockedMultiCount === 1, 'all-cells: notRestockedMultiCount 1')
  check(r.restockCount === 2, 'all-cells: restockCount 2')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceReturnIntentDispositionQuantityBrief(state([
    returnIntent('restock', 1),
    returnIntent('restock', 2),
    returnIntent('not_restocked', 1),
    returnIntent('not_restocked', 4),
  ]))
  check(r.restockMultiCount === 1, 'sub-buckets: restockMultiCount 1')
  check(r.notRestockedSingleCount === 1, 'sub-buckets: notRestockedSingleCount 1')
}

console.log(`ecommerce-return-intent-disposition-quantity-brief: ${checks} checks passed`)
