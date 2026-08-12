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
  const r = projectEcommerceSupportIntentCategoryBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.uniqueCategories === 0, 'empty: uniqueCategories 0')
  check(r.topCategory === null, 'empty: topCategory null')
  check(r.topCategoryCount === 0, 'empty: topCategoryCount 0')
}

// 2. Single intent — order_status
{
  const r = projectEcommerceSupportIntentCategoryBrief(state([supportIntent('order_status')]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.uniqueCategories === 1, 'single: uniqueCategories 1')
  check(r.topCategory === 'order_status', 'single: topCategory')
  check(r.topCategoryCount === 1, 'single: topCategoryCount 1')
}

// 3. Two intents same category — uniqueCategories 1, topCount 2
{
  const r = projectEcommerceSupportIntentCategoryBrief(state([
    supportIntent('delivery_issue'),
    supportIntent('delivery_issue'),
  ]))
  check(r.totalIntents === 2, 'same-cat: totalIntents 2')
  check(r.uniqueCategories === 1, 'same-cat: uniqueCategories 1')
  check(r.topCategory === 'delivery_issue', 'same-cat: topCategory')
  check(r.topCategoryCount === 2, 'same-cat: topCategoryCount 2')
}

// 4. Two intents different categories — uniqueCategories 2
{
  const r = projectEcommerceSupportIntentCategoryBrief(state([
    supportIntent('payment_question'),
    supportIntent('item_issue'),
  ]))
  check(r.totalIntents === 2, 'two-diff: totalIntents 2')
  check(r.uniqueCategories === 2, 'two-diff: uniqueCategories 2')
  check(r.topCategoryCount === 1, 'two-diff: topCategoryCount 1')
  check(r.topCategory !== null, 'two-diff: topCategory set')
}

// 5. Three intents: one category dominant
{
  const r = projectEcommerceSupportIntentCategoryBrief(state([
    supportIntent('other'),
    supportIntent('order_status'),
    supportIntent('other'),
  ]))
  check(r.totalIntents === 3, 'dominant: totalIntents 3')
  check(r.uniqueCategories === 2, 'dominant: uniqueCategories 2')
  check(r.topCategory === 'other', 'dominant: topCategory')
  check(r.topCategoryCount === 2, 'dominant: topCategoryCount 2')
}

// 6. Five intents all different categories
{
  const r = projectEcommerceSupportIntentCategoryBrief(state([
    supportIntent('order_status'),
    supportIntent('delivery_issue'),
    supportIntent('payment_question'),
  ]))
  check(r.totalIntents === 3, 'all-diff: totalIntents 3')
  check(r.uniqueCategories === 3, 'all-diff: uniqueCategories 3')
  check(r.topCategoryCount === 1, 'all-diff: topCategoryCount 1')
}

console.log(`ecommerce-support-intent-category-brief: ${checks} checks passed`)
