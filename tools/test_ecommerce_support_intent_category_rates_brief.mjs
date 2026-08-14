import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentCategoryRatesBrief } from './ecommerce-support-intent-category-rates-brief.ts'`,
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

const { projectEcommerceSupportIntentCategoryRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function supportIntent({ category = 'order_status' } = {}) {
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
    sourceAcknowledgementDigest: `sad-${intentId}`,
    category,
    description: 'Support description',
    customerMessageSent: false,
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

// 1. Empty state — 11 checks
{
  const r = projectEcommerceSupportIntentCategoryRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.orderStatusCount === 0, 'empty:orderStatusCount')
  check(r.orderStatusRate === 0, 'empty:orderStatusRate')
  check(r.deliveryIssueCount === 0, 'empty:deliveryIssueCount')
  check(r.deliveryIssueRate === 0, 'empty:deliveryIssueRate')
  check(r.paymentQuestionCount === 0, 'empty:paymentQuestionCount')
  check(r.paymentQuestionRate === 0, 'empty:paymentQuestionRate')
  check(r.itemIssueCount === 0, 'empty:itemIssueCount')
  check(r.itemIssueRate === 0, 'empty:itemIssueRate')
  check(r.otherCategoryCount === 0, 'empty:otherCategoryCount')
  check(r.otherCategoryRate === 0, 'empty:otherCategoryRate')
}

// 2. Single order_status — 2 checks
{
  const r = projectEcommerceSupportIntentCategoryRatesBrief(state([supportIntent()]))
  check(r.totalIntents === 1, 'orderStatus:total')
  check(r.orderStatusCount === 1, 'orderStatus:count')
}

// 3. Single delivery_issue — 2 checks
{
  const r = projectEcommerceSupportIntentCategoryRatesBrief(state([
    supportIntent({ category: 'delivery_issue' }),
  ]))
  check(r.totalIntents === 1, 'deliveryIssue:total')
  check(r.deliveryIssueCount === 1, 'deliveryIssue:count')
}

// 4. Single payment_question — 2 checks
{
  const r = projectEcommerceSupportIntentCategoryRatesBrief(state([
    supportIntent({ category: 'payment_question' }),
  ]))
  check(r.totalIntents === 1, 'paymentQuestion:total')
  check(r.paymentQuestionCount === 1, 'paymentQuestion:count')
}

// 5. Single item_issue — 2 checks
{
  const r = projectEcommerceSupportIntentCategoryRatesBrief(state([
    supportIntent({ category: 'item_issue' }),
  ]))
  check(r.totalIntents === 1, 'itemIssue:total')
  check(r.itemIssueCount === 1, 'itemIssue:count')
}

// 6. Single other category — 2 checks
{
  const r = projectEcommerceSupportIntentCategoryRatesBrief(state([
    supportIntent({ category: 'other' }),
  ]))
  check(r.totalIntents === 1, 'other:total')
  check(r.otherCategoryCount === 1, 'other:count')
}

// 7. Precision: 2 order_status + 1 each other (total=6, orderStatusRate=0.3333) — 2 checks
{
  const r = projectEcommerceSupportIntentCategoryRatesBrief(state([
    supportIntent(),
    supportIntent(),
    supportIntent({ category: 'delivery_issue' }),
    supportIntent({ category: 'payment_question' }),
    supportIntent({ category: 'item_issue' }),
    supportIntent({ category: 'other' }),
  ]))
  check(r.orderStatusCount === 2, 'precision:orderStatusCount')
  check(r.orderStatusRate === 0.3333, 'precision:orderStatusRate')
}

console.log(`ecommerce-support-intent-category-rates-brief: ${checks} checks passed`)
