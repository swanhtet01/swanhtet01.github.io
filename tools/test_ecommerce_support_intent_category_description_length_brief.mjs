import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentCategoryDescriptionLengthBrief } from './ecommerce-support-intent-category-description-length-brief.ts'`,
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

const { projectEcommerceSupportIntentCategoryDescriptionLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SHORT_DESCRIPTION = 'Short description'                                      // 17 chars ≤ 40
const DETAILED_DESCRIPTION = 'This is a very detailed support description.'       // 44 chars > 40

let intentId = 0
function supportIntent(category = 'order_status', description = SHORT_DESCRIPTION) {
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
    description,
    externalMessageSent: false,
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
  const r = projectEcommerceSupportIntentCategoryDescriptionLengthBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.orderStatusShortCount === 0, 'empty: orderStatusShortCount 0')
  check(r.otherDetailedCount === 0, 'empty: otherDetailedCount 0')
}

// 2. order_status short
{
  const r = projectEcommerceSupportIntentCategoryDescriptionLengthBrief(state([
    supportIntent('order_status', SHORT_DESCRIPTION),
  ]))
  check(r.totalIntents === 1, 'order-status-short: totalIntents 1')
  check(r.orderStatusShortCount === 1, 'order-status-short: orderStatusShortCount 1')
  check(r.orderStatusDetailedCount === 0, 'order-status-short: orderStatusDetailedCount 0')
}

// 3. delivery_issue detailed
{
  const r = projectEcommerceSupportIntentCategoryDescriptionLengthBrief(state([
    supportIntent('delivery_issue', DETAILED_DESCRIPTION),
  ]))
  check(r.deliveryIssueDetailedCount === 1, 'delivery-issue-detailed: deliveryIssueDetailedCount 1')
  check(r.deliveryIssueShortCount === 0, 'delivery-issue-detailed: deliveryIssueShortCount 0')
  check(r.totalIntents === 1, 'delivery-issue-detailed: totalIntents 1')
}

// 4. payment_question short
{
  const r = projectEcommerceSupportIntentCategoryDescriptionLengthBrief(state([
    supportIntent('payment_question', SHORT_DESCRIPTION),
  ]))
  check(r.paymentQuestionShortCount === 1, 'payment-question-short: paymentQuestionShortCount 1')
  check(r.paymentQuestionDetailedCount === 0, 'payment-question-short: paymentQuestionDetailedCount 0')
  check(r.totalIntents === 1, 'payment-question-short: totalIntents 1')
}

// 5. item_issue detailed
{
  const r = projectEcommerceSupportIntentCategoryDescriptionLengthBrief(state([
    supportIntent('item_issue', DETAILED_DESCRIPTION),
  ]))
  check(r.itemIssueDetailedCount === 1, 'item-issue-detailed: itemIssueDetailedCount 1')
  check(r.itemIssueShortCount === 0, 'item-issue-detailed: itemIssueShortCount 0')
  check(r.totalIntents === 1, 'item-issue-detailed: totalIntents 1')
}

// 6. All 5 categories: order_status-short, delivery_issue-detailed, payment_question-short, item_issue-detailed, other-short
{
  const r = projectEcommerceSupportIntentCategoryDescriptionLengthBrief(state([
    supportIntent('order_status', SHORT_DESCRIPTION),
    supportIntent('delivery_issue', DETAILED_DESCRIPTION),
    supportIntent('payment_question', SHORT_DESCRIPTION),
    supportIntent('item_issue', DETAILED_DESCRIPTION),
    supportIntent('other', SHORT_DESCRIPTION),
  ]))
  check(r.totalIntents === 5, 'all-cats: totalIntents 5')
  check(r.orderStatusShortCount === 1, 'all-cats: orderStatusShortCount 1')
  check(r.deliveryIssueDetailedCount === 1, 'all-cats: deliveryIssueDetailedCount 1')
  check(r.paymentQuestionShortCount === 1, 'all-cats: paymentQuestionShortCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceSupportIntentCategoryDescriptionLengthBrief(state([
    supportIntent('order_status', SHORT_DESCRIPTION),
    supportIntent('delivery_issue', DETAILED_DESCRIPTION),
    supportIntent('payment_question', SHORT_DESCRIPTION),
    supportIntent('item_issue', DETAILED_DESCRIPTION),
    supportIntent('other', SHORT_DESCRIPTION),
  ]))
  check(r.itemIssueDetailedCount === 1, 'sub-buckets: itemIssueDetailedCount 1')
  check(r.otherShortCount === 1, 'sub-buckets: otherShortCount 1')
  check(r.otherDetailedCount === 0, 'sub-buckets: otherDetailedCount 0')
  check(r.itemIssueShortCount === 0, 'sub-buckets: itemIssueShortCount 0')
}

console.log(`ecommerce-support-intent-category-description-length-brief: ${checks} checks passed`)
