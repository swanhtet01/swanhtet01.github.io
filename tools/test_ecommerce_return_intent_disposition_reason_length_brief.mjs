import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentDispositionReasonLengthBrief } from './ecommerce-return-intent-disposition-reason-length-brief.ts'`,
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

const { projectEcommerceReturnIntentDispositionReasonLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SHORT_REASON = 'Short reason'                                          // 12 chars ≤ 40
const DETAILED_REASON = 'This is a very detailed explanation that exceeds forty characters' // 65 chars > 40

let intentId = 0
function returnIntent(disposition = 'restock', reason = SHORT_REASON) {
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
    quantity: 1,
    disposition,
    reason,
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
  const r = projectEcommerceReturnIntentDispositionReasonLengthBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.restockShortCount === 0, 'empty: restockShortCount 0')
  check(r.notRestockedShortCount === 0, 'empty: notRestockedShortCount 0')
}

// 2. Restock short (reason ≤ 40 chars)
{
  const r = projectEcommerceReturnIntentDispositionReasonLengthBrief(state([
    returnIntent('restock', SHORT_REASON),
  ]))
  check(r.totalIntents === 1, 'restock-short: totalIntents 1')
  check(r.restockShortCount === 1, 'restock-short: restockShortCount 1')
  check(r.restockCount === 1, 'restock-short: restockCount 1')
  check(r.notRestockedCount === 0, 'restock-short: notRestockedCount 0')
}

// 3. Restock detailed (reason > 40 chars)
{
  const r = projectEcommerceReturnIntentDispositionReasonLengthBrief(state([
    returnIntent('restock', DETAILED_REASON),
  ]))
  check(r.restockDetailedCount === 1, 'restock-detailed: restockDetailedCount 1')
  check(r.restockCount === 1, 'restock-detailed: restockCount 1')
  check(r.restockShortCount === 0, 'restock-detailed: restockShortCount 0')
  check(r.totalIntents === 1, 'restock-detailed: totalIntents 1')
}

// 4. Not-restocked short
{
  const r = projectEcommerceReturnIntentDispositionReasonLengthBrief(state([
    returnIntent('not_restocked', SHORT_REASON),
  ]))
  check(r.notRestockedShortCount === 1, 'notRestock-short: notRestockedShortCount 1')
  check(r.notRestockedCount === 1, 'notRestock-short: notRestockedCount 1')
  check(r.restockCount === 0, 'notRestock-short: restockCount 0')
}

// 5. Not-restocked detailed
{
  const r = projectEcommerceReturnIntentDispositionReasonLengthBrief(state([
    returnIntent('not_restocked', DETAILED_REASON),
  ]))
  check(r.notRestockedDetailedCount === 1, 'notRestock-detailed: notRestockedDetailedCount 1')
  check(r.notRestockedCount === 1, 'notRestock-detailed: notRestockedCount 1')
  check(r.restockShortCount === 0, 'notRestock-detailed: restockShortCount 0')
}

// 6. All 4 cells: restock-short, restock-detailed, notRestocked-short, notRestocked-detailed
{
  const r = projectEcommerceReturnIntentDispositionReasonLengthBrief(state([
    returnIntent('restock', SHORT_REASON),
    returnIntent('restock', DETAILED_REASON),
    returnIntent('not_restocked', SHORT_REASON),
    returnIntent('not_restocked', DETAILED_REASON),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.restockShortCount === 1, 'all-cells: restockShortCount 1')
  check(r.notRestockedShortCount === 1, 'all-cells: notRestockedShortCount 1')
  check(r.restockDetailedCount === 1, 'all-cells: restockDetailedCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceReturnIntentDispositionReasonLengthBrief(state([
    returnIntent('restock', SHORT_REASON),
    returnIntent('restock', DETAILED_REASON),
    returnIntent('not_restocked', SHORT_REASON),
    returnIntent('not_restocked', DETAILED_REASON),
  ]))
  check(r.notRestockedDetailedCount === 1, 'sub-buckets: notRestockedDetailedCount 1')
  check(r.notRestockedCount === 2, 'sub-buckets: notRestockedCount 2')
}

console.log(`ecommerce-return-intent-disposition-reason-length-brief: ${checks} checks passed`)
