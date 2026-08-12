import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentCustomerMessageRefundStartedBrief } from './ecommerce-support-intent-customer-message-refund-started-brief.ts'`,
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

const { projectEcommerceSupportIntentCustomerMessageRefundStartedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function supportIntent(customerMessageSent = false, refundStarted = false) {
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
    description: 'A support description',
    refundStarted,
    customerMessageSent,
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
  const r = projectEcommerceSupportIntentCustomerMessageRefundStartedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + refund started
{
  const r = projectEcommerceSupportIntentCustomerMessageRefundStartedBrief(state([
    supportIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'msg-refund: totalIntents 1')
  check(r.messageSentRefundStartedCount === 1, 'msg-refund: messageSentRefundStartedCount 1')
  check(r.messageSentCount === 1, 'msg-refund: messageSentCount 1')
  check(r.noMessageCount === 0, 'msg-refund: noMessageCount 0')
}

// 3. Message sent + no refund
{
  const r = projectEcommerceSupportIntentCustomerMessageRefundStartedBrief(state([
    supportIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'msg-no-refund: totalIntents 1')
  check(r.messageSentNoRefundCount === 1, 'msg-no-refund: messageSentNoRefundCount 1')
  check(r.messageSentCount === 1, 'msg-no-refund: messageSentCount 1')
  check(r.noMessageCount === 0, 'msg-no-refund: noMessageCount 0')
}

// 4. No message + refund started
{
  const r = projectEcommerceSupportIntentCustomerMessageRefundStartedBrief(state([
    supportIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'no-msg-refund: totalIntents 1')
  check(r.noMessageRefundStartedCount === 1, 'no-msg-refund: noMessageRefundStartedCount 1')
  check(r.noMessageCount === 1, 'no-msg-refund: noMessageCount 1')
}

// 5. No message + no refund
{
  const r = projectEcommerceSupportIntentCustomerMessageRefundStartedBrief(state([
    supportIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'no-msg-no-refund: totalIntents 1')
  check(r.noMessageNoRefundCount === 1, 'no-msg-no-refund: noMessageNoRefundCount 1')
  check(r.noMessageCount === 1, 'no-msg-no-refund: noMessageCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceSupportIntentCustomerMessageRefundStartedBrief(state([
    supportIntent(true, true),
    supportIntent(true, false),
    supportIntent(false, true),
    supportIntent(false, false),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.messageSentRefundStartedCount === 1, 'all-cells: messageSentRefundStartedCount 1')
  check(r.noMessageRefundStartedCount === 1, 'all-cells: noMessageRefundStartedCount 1')
  check(r.messageSentNoRefundCount === 1, 'all-cells: messageSentNoRefundCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceSupportIntentCustomerMessageRefundStartedBrief(state([
    supportIntent(true, true),
    supportIntent(true, false),
    supportIntent(false, true),
    supportIntent(false, false),
  ]))
  check(r.messageSentCount === 2, 'sub-buckets: messageSentCount 2')
  check(r.noMessageCount === 2, 'sub-buckets: noMessageCount 2')
}

console.log(`ecommerce-support-intent-customer-message-refund-started-brief: ${checks} checks passed`)
