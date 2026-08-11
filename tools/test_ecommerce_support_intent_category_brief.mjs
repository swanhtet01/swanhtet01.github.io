// Ecommerce support intent category brief: 5-value enum distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentCategoryBrief } from './ecommerce-support-intent-category-brief.ts'`,
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

const { projectEcommerceSupportIntentCategoryBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function supportIntent(category = 'order_status') {
  intentId++
  return {
    schema: 'supermega.ecommerce.support_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `SI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    category,
    description: 'Test support request',
    externalMessageSent: false,
    refundStarted: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(supportIntents) {
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
  const r = projectEcommerceSupportIntentCategoryBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.orderStatusCount === 0, 'empty: orderStatusCount 0')
  check(r.deliveryIssueCount === 0, 'empty: deliveryIssueCount 0')
  check(r.paymentQuestionCount === 0, 'empty: paymentQuestionCount 0')
  check(r.itemIssueCount === 0, 'empty: itemIssueCount 0')
  check(r.otherCount === 0, 'empty: otherCount 0')
  check(r.orderStatusRate === 0, 'empty: orderStatusRate 0')
}

// 2. Single intent — order_status
{
  const r = projectEcommerceSupportIntentCategoryBrief(state([supportIntent('order_status')]))
  check(r.totalIntents === 1, 'single-os: totalIntents 1')
  check(r.orderStatusCount === 1, 'single-os: orderStatusCount 1')
  check(r.orderStatusRate === 100, 'single-os: orderStatusRate 100')
  check(r.deliveryIssueRate === 0, 'single-os: deliveryIssueRate 0')
}

// 3. All delivery_issue
{
  const r = projectEcommerceSupportIntentCategoryBrief(
    state([supportIntent('delivery_issue'), supportIntent('delivery_issue')]),
  )
  check(r.deliveryIssueCount === 2, 'all-di: deliveryIssueCount 2')
  check(r.deliveryIssueRate === 100, 'all-di: deliveryIssueRate 100')
  check(r.orderStatusRate === 0, 'all-di: orderStatusRate 0')
}

// 4. All payment_question
{
  const r = projectEcommerceSupportIntentCategoryBrief(state([supportIntent('payment_question')]))
  check(r.paymentQuestionCount === 1, 'pq: paymentQuestionCount 1')
  check(r.paymentQuestionRate === 100, 'pq: paymentQuestionRate 100')
}

// 5. All item_issue
{
  const r = projectEcommerceSupportIntentCategoryBrief(state([supportIntent('item_issue')]))
  check(r.itemIssueCount === 1, 'ii: itemIssueCount 1')
  check(r.itemIssueRate === 100, 'ii: itemIssueRate 100')
}

// 6. All other
{
  const r = projectEcommerceSupportIntentCategoryBrief(state([supportIntent('other')]))
  check(r.otherCount === 1, 'other: otherCount 1')
  check(r.otherRate === 100, 'other: otherRate 100')
}

// 7. Mixed: one of each (5 total) → 20% each
{
  const r = projectEcommerceSupportIntentCategoryBrief(
    state([
      supportIntent('order_status'),
      supportIntent('delivery_issue'),
      supportIntent('payment_question'),
      supportIntent('item_issue'),
      supportIntent('other'),
    ]),
  )
  check(r.totalIntents === 5, 'mixed: totalIntents 5')
  check(r.orderStatusRate === 20, 'mixed: orderStatusRate 20')
  check(r.deliveryIssueRate === 20, 'mixed: deliveryIssueRate 20')
  check(r.paymentQuestionRate === 20, 'mixed: paymentQuestionRate 20')
  check(r.itemIssueRate === 20, 'mixed: itemIssueRate 20')
  check(r.otherRate === 20, 'mixed: otherRate 20')
}

// 8. Counts sum to totalIntents
{
  const r = projectEcommerceSupportIntentCategoryBrief(
    state([supportIntent('order_status'), supportIntent('delivery_issue'), supportIntent('other')]),
  )
  check(
    r.orderStatusCount + r.deliveryIssueCount + r.paymentQuestionCount + r.itemIssueCount + r.otherCount === r.totalIntents,
    'invariant: counts sum to total',
  )
}

// 9. Rounding: 1/3 → 33%, 2/3 → 67%
{
  const r = projectEcommerceSupportIntentCategoryBrief(
    state([supportIntent('delivery_issue'), supportIntent('order_status'), supportIntent('order_status')]),
  )
  check(r.orderStatusRate === 67, 'round: orderStatusRate 67')
  check(r.deliveryIssueRate === 33, 'round: deliveryIssueRate 33')
}

// 10. Dominant category: 3 order_status + 1 other → 75%/25%
{
  const r = projectEcommerceSupportIntentCategoryBrief(
    state([
      supportIntent('order_status'),
      supportIntent('order_status'),
      supportIntent('order_status'),
      supportIntent('other'),
    ]),
  )
  check(r.orderStatusRate === 75, 'dominant: orderStatusRate 75')
  check(r.otherRate === 25, 'dominant: otherRate 25')
  check(r.deliveryIssueRate === 0, 'dominant: deliveryIssueRate 0')
}

console.log(JSON.stringify({ ok: true, checks }))
