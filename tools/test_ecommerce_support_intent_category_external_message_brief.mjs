import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentCategoryExternalMessageBrief } from './ecommerce-support-intent-category-external-message-brief.ts'`,
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

const { projectEcommerceSupportIntentCategoryExternalMessageBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function supportIntent(category = 'order_status', externalMessageSent = false) {
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
    externalMessageSent,
    refundStarted: false,
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
  const r = projectEcommerceSupportIntentCategoryExternalMessageBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.orderStatusSentCount === 0, 'empty: orderStatusSentCount 0')
  check(r.otherNotSentCount === 0, 'empty: otherNotSentCount 0')
}

// 2. order_status sent
{
  const r = projectEcommerceSupportIntentCategoryExternalMessageBrief(state([
    supportIntent('order_status', true),
  ]))
  check(r.totalIntents === 1, 'order-status-sent: totalIntents 1')
  check(r.orderStatusSentCount === 1, 'order-status-sent: orderStatusSentCount 1')
  check(r.orderStatusNotSentCount === 0, 'order-status-sent: orderStatusNotSentCount 0')
}

// 3. delivery_issue not sent
{
  const r = projectEcommerceSupportIntentCategoryExternalMessageBrief(state([
    supportIntent('delivery_issue', false),
  ]))
  check(r.deliveryIssueNotSentCount === 1, 'delivery-issue-notSent: deliveryIssueNotSentCount 1')
  check(r.deliveryIssueSentCount === 0, 'delivery-issue-notSent: deliveryIssueSentCount 0')
  check(r.totalIntents === 1, 'delivery-issue-notSent: totalIntents 1')
}

// 4. payment_question sent
{
  const r = projectEcommerceSupportIntentCategoryExternalMessageBrief(state([
    supportIntent('payment_question', true),
  ]))
  check(r.paymentQuestionSentCount === 1, 'payment-question-sent: paymentQuestionSentCount 1')
  check(r.paymentQuestionNotSentCount === 0, 'payment-question-sent: paymentQuestionNotSentCount 0')
  check(r.totalIntents === 1, 'payment-question-sent: totalIntents 1')
}

// 5. item_issue not sent
{
  const r = projectEcommerceSupportIntentCategoryExternalMessageBrief(state([
    supportIntent('item_issue', false),
  ]))
  check(r.itemIssueNotSentCount === 1, 'item-issue-notSent: itemIssueNotSentCount 1')
  check(r.itemIssueSentCount === 0, 'item-issue-notSent: itemIssueSentCount 0')
  check(r.totalIntents === 1, 'item-issue-notSent: totalIntents 1')
}

// 6. All 5 categories: order_status-sent, delivery_issue-notSent, payment_question-sent, item_issue-notSent, other-sent
{
  const r = projectEcommerceSupportIntentCategoryExternalMessageBrief(state([
    supportIntent('order_status', true),
    supportIntent('delivery_issue', false),
    supportIntent('payment_question', true),
    supportIntent('item_issue', false),
    supportIntent('other', true),
  ]))
  check(r.totalIntents === 5, 'all-cats: totalIntents 5')
  check(r.orderStatusSentCount === 1, 'all-cats: orderStatusSentCount 1')
  check(r.deliveryIssueNotSentCount === 1, 'all-cats: deliveryIssueNotSentCount 1')
  check(r.paymentQuestionSentCount === 1, 'all-cats: paymentQuestionSentCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceSupportIntentCategoryExternalMessageBrief(state([
    supportIntent('order_status', true),
    supportIntent('delivery_issue', false),
    supportIntent('payment_question', true),
    supportIntent('item_issue', false),
    supportIntent('other', true),
  ]))
  check(r.itemIssueNotSentCount === 1, 'sub-buckets: itemIssueNotSentCount 1')
  check(r.otherSentCount === 1, 'sub-buckets: otherSentCount 1')
  check(r.otherNotSentCount === 0, 'sub-buckets: otherNotSentCount 0')
  check(r.itemIssueSentCount === 0, 'sub-buckets: itemIssueSentCount 0')
}

console.log(`ecommerce-support-intent-category-external-message-brief: ${checks} checks passed`)
