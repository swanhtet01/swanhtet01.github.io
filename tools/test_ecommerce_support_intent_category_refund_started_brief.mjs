import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentCategoryRefundStartedBrief } from './ecommerce-support-intent-category-refund-started-brief.ts'`,
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

const { projectEcommerceSupportIntentCategoryRefundStartedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function supportIntent(category = 'order_status', refundStarted = false) {
  intentId++
  return {
    schema: 'supermega.ecommerce.support_intent.v1',
    state: 'open',
    scope: 'scope-1',
    id: `ESI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    category,
    description: 'Support description',
    externalMessageSent: false,
    refundStarted,
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
  const r = projectEcommerceSupportIntentCategoryRefundStartedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.orderStatusStartedCount === 0, 'empty: orderStatusStartedCount 0')
  check(r.otherNotStartedCount === 0, 'empty: otherNotStartedCount 0')
}

// 2. order_status refund started
{
  const r = projectEcommerceSupportIntentCategoryRefundStartedBrief(state([
    supportIntent('order_status', true),
  ]))
  check(r.totalIntents === 1, 'order-status-started: totalIntents 1')
  check(r.orderStatusStartedCount === 1, 'order-status-started: orderStatusStartedCount 1')
  check(r.orderStatusNotStartedCount === 0, 'order-status-started: orderStatusNotStartedCount 0')
}

// 3. delivery_issue refund not started
{
  const r = projectEcommerceSupportIntentCategoryRefundStartedBrief(state([
    supportIntent('delivery_issue', false),
  ]))
  check(r.deliveryIssueNotStartedCount === 1, 'delivery-issue-not: deliveryIssueNotStartedCount 1')
  check(r.deliveryIssueStartedCount === 0, 'delivery-issue-not: deliveryIssueStartedCount 0')
  check(r.totalIntents === 1, 'delivery-issue-not: totalIntents 1')
}

// 4. payment_question refund started
{
  const r = projectEcommerceSupportIntentCategoryRefundStartedBrief(state([
    supportIntent('payment_question', true),
  ]))
  check(r.paymentQuestionStartedCount === 1, 'payment-question-started: paymentQuestionStartedCount 1')
  check(r.paymentQuestionNotStartedCount === 0, 'payment-question-started: paymentQuestionNotStartedCount 0')
  check(r.totalIntents === 1, 'payment-question-started: totalIntents 1')
}

// 5. item_issue refund not started
{
  const r = projectEcommerceSupportIntentCategoryRefundStartedBrief(state([
    supportIntent('item_issue', false),
  ]))
  check(r.itemIssueNotStartedCount === 1, 'item-issue-not: itemIssueNotStartedCount 1')
  check(r.itemIssueStartedCount === 0, 'item-issue-not: itemIssueStartedCount 0')
  check(r.totalIntents === 1, 'item-issue-not: totalIntents 1')
}

// 6. All 5 categories: order_status-started, delivery_issue-not, payment_question-started, item_issue-not, other-started
{
  const r = projectEcommerceSupportIntentCategoryRefundStartedBrief(state([
    supportIntent('order_status', true),
    supportIntent('delivery_issue', false),
    supportIntent('payment_question', true),
    supportIntent('item_issue', false),
    supportIntent('other', true),
  ]))
  check(r.totalIntents === 5, 'all-cats: totalIntents 5')
  check(r.orderStatusStartedCount === 1, 'all-cats: orderStatusStartedCount 1')
  check(r.deliveryIssueNotStartedCount === 1, 'all-cats: deliveryIssueNotStartedCount 1')
  check(r.paymentQuestionStartedCount === 1, 'all-cats: paymentQuestionStartedCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceSupportIntentCategoryRefundStartedBrief(state([
    supportIntent('order_status', true),
    supportIntent('delivery_issue', false),
    supportIntent('payment_question', true),
    supportIntent('item_issue', false),
    supportIntent('other', true),
  ]))
  check(r.itemIssueNotStartedCount === 1, 'sub-buckets: itemIssueNotStartedCount 1')
  check(r.otherStartedCount === 1, 'sub-buckets: otherStartedCount 1')
  check(r.otherNotStartedCount === 0, 'sub-buckets: otherNotStartedCount 0')
  check(r.itemIssueStartedCount === 0, 'sub-buckets: itemIssueStartedCount 0')
}

console.log(`ecommerce-support-intent-category-refund-started-brief: ${checks} checks passed`)
