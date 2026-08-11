// Ecommerce support intent description brief: length bands + min/max/avg.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentDescriptionBrief } from './ecommerce-support-intent-description-brief.ts'`,
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

const { projectEcommerceSupportIntentDescriptionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function supportIntent(description = 'Where is my order?') {
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
    category: 'order_status',
    description,
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
  const r = projectEcommerceSupportIntentDescriptionBrief(state([]))
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.shortDescriptionCount === 0, 'empty: short 0')
  check(r.mediumDescriptionCount === 0, 'empty: medium 0')
  check(r.longDescriptionCount === 0, 'empty: long 0')
  check(r.averageDescriptionLength === 0, 'empty: avg 0')
  check(r.minDescriptionLength === null, 'empty: min null')
  check(r.maxDescriptionLength === null, 'empty: max null')
}

// 2. Short description (≤40 chars)
{
  const desc = 'Hi' // 2 chars
  const r = projectEcommerceSupportIntentDescriptionBrief(state([supportIntent(desc)]))
  check(r.totalIntents === 1, 'short: totalIntents 1')
  check(r.shortDescriptionCount === 1, 'short: shortDescriptionCount 1')
  check(r.mediumDescriptionCount === 0, 'short: mediumDescriptionCount 0')
  check(r.longDescriptionCount === 0, 'short: longDescriptionCount 0')
  check(r.minDescriptionLength === 2, 'short: min 2')
  check(r.maxDescriptionLength === 2, 'short: max 2')
  check(r.averageDescriptionLength === 2, 'short: avg 2')
}

// 3. Medium description (41–120 chars)
{
  const desc = 'A'.repeat(80) // 80 chars
  const r = projectEcommerceSupportIntentDescriptionBrief(state([supportIntent(desc)]))
  check(r.mediumDescriptionCount === 1, 'medium: mediumDescriptionCount 1')
  check(r.shortDescriptionCount === 0, 'medium: shortDescriptionCount 0')
  check(r.longDescriptionCount === 0, 'medium: longDescriptionCount 0')
}

// 4. Long description (>120 chars)
{
  const desc = 'B'.repeat(150) // 150 chars
  const r = projectEcommerceSupportIntentDescriptionBrief(state([supportIntent(desc)]))
  check(r.longDescriptionCount === 1, 'long: longDescriptionCount 1')
  check(r.shortDescriptionCount === 0, 'long: shortDescriptionCount 0')
  check(r.mediumDescriptionCount === 0, 'long: mediumDescriptionCount 0')
}

// 5. Exactly 40 chars → short
{
  const desc = 'C'.repeat(40)
  const r = projectEcommerceSupportIntentDescriptionBrief(state([supportIntent(desc)]))
  check(r.shortDescriptionCount === 1, 'boundary-40: short')
}

// 6. Exactly 41 chars → medium
{
  const desc = 'D'.repeat(41)
  const r = projectEcommerceSupportIntentDescriptionBrief(state([supportIntent(desc)]))
  check(r.mediumDescriptionCount === 1, 'boundary-41: medium')
}

// 7. Exactly 120 chars → medium
{
  const desc = 'E'.repeat(120)
  const r = projectEcommerceSupportIntentDescriptionBrief(state([supportIntent(desc)]))
  check(r.mediumDescriptionCount === 1, 'boundary-120: medium')
}

// 8. Exactly 121 chars → long
{
  const desc = 'F'.repeat(121)
  const r = projectEcommerceSupportIntentDescriptionBrief(state([supportIntent(desc)]))
  check(r.longDescriptionCount === 1, 'boundary-121: long')
}

// 9. Mixed: short + medium + long
{
  const r = projectEcommerceSupportIntentDescriptionBrief(
    state([
      supportIntent('Short'),             // 5 → short
      supportIntent('A'.repeat(60)),      // 60 → medium
      supportIntent('B'.repeat(130)),     // 130 → long
    ]),
  )
  check(r.totalIntents === 3, 'mixed: totalIntents 3')
  check(r.shortDescriptionCount === 1, 'mixed: short 1')
  check(r.mediumDescriptionCount === 1, 'mixed: medium 1')
  check(r.longDescriptionCount === 1, 'mixed: long 1')
  check(r.minDescriptionLength === 5, 'mixed: min 5')
  check(r.maxDescriptionLength === 130, 'mixed: max 130')
}

// 10. Average rounds: (5 + 60 + 130) = 195 / 3 = 65
{
  const r = projectEcommerceSupportIntentDescriptionBrief(
    state([
      supportIntent('Short'),
      supportIntent('A'.repeat(60)),
      supportIntent('B'.repeat(130)),
    ]),
  )
  check(r.averageDescriptionLength === 65, 'avg: averageDescriptionLength 65')
}

console.log(JSON.stringify({ ok: true, checks }))
