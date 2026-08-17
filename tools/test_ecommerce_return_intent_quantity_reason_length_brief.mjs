import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceReturnIntentQuantityReasonLengthBrief } from './ecommerce-return-intent-quantity-reason-length-brief.ts'`,
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

const { projectEcommerceReturnIntentQuantityReasonLengthBrief } = await import(
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
function returnIntent(quantity = 1, reason = SHORT_REASON) {
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
    disposition: 'restock',
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
  const r = projectEcommerceReturnIntentQuantityReasonLengthBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.singleShortCount === 0, 'empty: singleShortCount 0')
  check(r.multiDetailedCount === 0, 'empty: multiDetailedCount 0')
}

// 2. Single-item short (qty=1, reason ≤ 40)
{
  const r = projectEcommerceReturnIntentQuantityReasonLengthBrief(state([
    returnIntent(1, SHORT_REASON),
  ]))
  check(r.totalIntents === 1, 'single-short: totalIntents 1')
  check(r.singleShortCount === 1, 'single-short: singleShortCount 1')
  check(r.singleCount === 1, 'single-short: singleCount 1')
  check(r.multiCount === 0, 'single-short: multiCount 0')
}

// 3. Multi-item detailed (qty=3, reason > 40)
{
  const r = projectEcommerceReturnIntentQuantityReasonLengthBrief(state([
    returnIntent(3, DETAILED_REASON),
  ]))
  check(r.multiDetailedCount === 1, 'multi-detailed: multiDetailedCount 1')
  check(r.multiCount === 1, 'multi-detailed: multiCount 1')
  check(r.singleDetailedCount === 0, 'multi-detailed: singleDetailedCount 0')
  check(r.totalIntents === 1, 'multi-detailed: totalIntents 1')
}

// 4. Multi-item short (qty=2, reason ≤ 40)
{
  const r = projectEcommerceReturnIntentQuantityReasonLengthBrief(state([
    returnIntent(2, SHORT_REASON),
  ]))
  check(r.multiShortCount === 1, 'multi-short: multiShortCount 1')
  check(r.multiCount === 1, 'multi-short: multiCount 1')
  check(r.singleCount === 0, 'multi-short: singleCount 0')
}

// 5. Single-item detailed (qty=1, reason > 40)
{
  const r = projectEcommerceReturnIntentQuantityReasonLengthBrief(state([
    returnIntent(1, DETAILED_REASON),
  ]))
  check(r.singleDetailedCount === 1, 'single-detailed: singleDetailedCount 1')
  check(r.singleCount === 1, 'single-detailed: singleCount 1')
  check(r.multiCount === 0, 'single-detailed: multiCount 0')
}

// 6. All 4 cells: single-short, single-detailed, multi-short, multi-detailed
{
  const r = projectEcommerceReturnIntentQuantityReasonLengthBrief(state([
    returnIntent(1, SHORT_REASON),
    returnIntent(1, DETAILED_REASON),
    returnIntent(2, SHORT_REASON),
    returnIntent(3, DETAILED_REASON),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.singleShortCount === 1, 'all-cells: singleShortCount 1')
  check(r.multiDetailedCount === 1, 'all-cells: multiDetailedCount 1')
  check(r.multiShortCount === 1, 'all-cells: multiShortCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceReturnIntentQuantityReasonLengthBrief(state([
    returnIntent(1, SHORT_REASON),
    returnIntent(1, DETAILED_REASON),
    returnIntent(2, SHORT_REASON),
    returnIntent(3, DETAILED_REASON),
  ]))
  check(r.singleDetailedCount === 1, 'sub-buckets: singleDetailedCount 1')
  check(r.multiCount === 2, 'sub-buckets: multiCount 2')
}

console.log(`ecommerce-return-intent-quantity-reason-length-brief: ${checks} checks passed`)
