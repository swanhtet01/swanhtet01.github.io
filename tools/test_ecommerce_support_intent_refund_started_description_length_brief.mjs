import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentRefundStartedDescriptionLengthBrief } from './ecommerce-support-intent-refund-started-description-length-brief.ts'`,
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

const { projectEcommerceSupportIntentRefundStartedDescriptionLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SHORT_DESC = 'Short description'
const DETAILED_DESC = 'Very detailed description of the support issue encountered with this order here'

let intentId = 0
function supportIntent(refundStarted = false, description = SHORT_DESC) {
  intentId++
  return {
    schema: 'supermega.ecommerce.support_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ESI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    category: 'order_status',
    description,
    refundStarted,
    customerMessageSent: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(supportIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents,
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
  const r = projectEcommerceSupportIntentRefundStartedDescriptionLengthBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.refundStartedShortCount === 0, 'empty: refundStartedShortCount 0')
  check(r.noRefundDetailedCount === 0, 'empty: noRefundDetailedCount 0')
}

// 2. No refund + short description
{
  const r = projectEcommerceSupportIntentRefundStartedDescriptionLengthBrief(state([
    supportIntent(false, SHORT_DESC),
  ]))
  check(r.totalIntents === 1, 'no-refund-short: totalIntents 1')
  check(r.noRefundShortCount === 1, 'no-refund-short: noRefundShortCount 1')
  check(r.noRefundDetailedCount === 0, 'no-refund-short: noRefundDetailedCount 0')
  check(r.refundStartedShortCount === 0, 'no-refund-short: refundStartedShortCount 0')
}

// 3. Refund started + detailed
{
  const r = projectEcommerceSupportIntentRefundStartedDescriptionLengthBrief(state([
    supportIntent(true, DETAILED_DESC),
  ]))
  check(r.refundStartedDetailedCount === 1, 'refund-detailed: refundStartedDetailedCount 1')
  check(r.refundStartedShortCount === 0, 'refund-detailed: refundStartedShortCount 0')
  check(r.totalIntents === 1, 'refund-detailed: totalIntents 1')
  check(r.noRefundDetailedCount === 0, 'refund-detailed: noRefundDetailedCount 0')
}

// 4. No refund + detailed
{
  const r = projectEcommerceSupportIntentRefundStartedDescriptionLengthBrief(state([
    supportIntent(false, DETAILED_DESC),
  ]))
  check(r.noRefundDetailedCount === 1, 'no-refund-detailed: noRefundDetailedCount 1')
  check(r.noRefundShortCount === 0, 'no-refund-detailed: noRefundShortCount 0')
  check(r.totalIntents === 1, 'no-refund-detailed: totalIntents 1')
}

// 5. Refund started + short
{
  const r = projectEcommerceSupportIntentRefundStartedDescriptionLengthBrief(state([
    supportIntent(true, SHORT_DESC),
  ]))
  check(r.refundStartedShortCount === 1, 'refund-short: refundStartedShortCount 1')
  check(r.refundStartedDetailedCount === 0, 'refund-short: refundStartedDetailedCount 0')
  check(r.totalIntents === 1, 'refund-short: totalIntents 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceSupportIntentRefundStartedDescriptionLengthBrief(state([
    supportIntent(false, SHORT_DESC),
    supportIntent(false, DETAILED_DESC),
    supportIntent(true, SHORT_DESC),
    supportIntent(true, DETAILED_DESC),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.refundStartedShortCount === 1, 'all-cells: refundStartedShortCount 1')
  check(r.noRefundDetailedCount === 1, 'all-cells: noRefundDetailedCount 1')
  check(r.refundStartedCount === 2, 'all-cells: refundStartedCount 2')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceSupportIntentRefundStartedDescriptionLengthBrief(state([
    supportIntent(false, SHORT_DESC),
    supportIntent(false, DETAILED_DESC),
    supportIntent(true, SHORT_DESC),
    supportIntent(true, DETAILED_DESC),
  ]))
  check(r.noRefundShortCount === 1, 'sub-buckets: noRefundShortCount 1')
  check(r.refundStartedDetailedCount === 1, 'sub-buckets: refundStartedDetailedCount 1')
}

console.log(`ecommerce-support-intent-refund-started-description-length-brief: ${checks} checks passed`)
