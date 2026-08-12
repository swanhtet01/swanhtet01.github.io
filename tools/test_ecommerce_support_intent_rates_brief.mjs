import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentRatesBrief } from './ecommerce-support-intent-rates-brief.ts'`,
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

const { projectEcommerceSupportIntentRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function supportIntent(customerMessageSent = false, externalMessageSent = false, refundStarted = false) {
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
    category: 'order_status',
    description: 'Support description',
    customerMessageSent,
    externalMessageSent,
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
  const r = projectEcommerceSupportIntentRatesBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.customerNotificationRate === 0, 'empty: customerNotificationRate 0')
  check(r.refundStartedRate === 0, 'empty: refundStartedRate 0')
}

// 2. One intent with customer notification
{
  const r = projectEcommerceSupportIntentRatesBrief(state([
    supportIntent(true),
  ]))
  check(r.totalIntents === 1, 'notified: totalIntents 1')
  check(r.customerNotificationCount === 1, 'notified: customerNotificationCount 1')
  check(r.customerNotificationRate === 1, 'notified: customerNotificationRate 1')
}

// 3. One intent with external message only
{
  const r = projectEcommerceSupportIntentRatesBrief(state([
    supportIntent(false, true),
  ]))
  check(r.externalMessageCount === 1, 'external: externalMessageCount 1')
  check(r.externalMessageRate === 1, 'external: externalMessageRate 1')
  check(r.customerNotificationCount === 0, 'external: customerNotificationCount 0')
}

// 4. One intent with refund started
{
  const r = projectEcommerceSupportIntentRatesBrief(state([
    supportIntent(false, false, true),
  ]))
  check(r.refundStartedCount === 1, 'refund: refundStartedCount 1')
  check(r.refundStartedRate === 1, 'refund: refundStartedRate 1')
  check(r.externalMessageCount === 0, 'refund: externalMessageCount 0')
}

// 5. Two intents, one customer notified
{
  const r = projectEcommerceSupportIntentRatesBrief(state([
    supportIntent(true),
    supportIntent(false),
  ]))
  check(r.totalIntents === 2, 'half-notified: totalIntents 2')
  check(r.customerNotificationRate === 0.5, 'half-notified: customerNotificationRate 0.5')
  check(r.externalMessageRate === 0, 'half-notified: externalMessageRate 0')
}

// 6. Four intents mixed
{
  const r = projectEcommerceSupportIntentRatesBrief(state([
    supportIntent(true, true, true),
    supportIntent(true, false, true),
    supportIntent(true, false, false),
    supportIntent(false, false, false),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.customerNotificationRate === 0.75, 'mixed: customerNotificationRate 0.75')
  check(r.externalMessageRate === 0.25, 'mixed: externalMessageRate 0.25')
  check(r.refundStartedRate === 0.5, 'mixed: refundStartedRate 0.5')
  check(r.refundStartedCount === 2, 'mixed: refundStartedCount 2')
}

// 7. Two intents, one with all true
{
  const r = projectEcommerceSupportIntentRatesBrief(state([
    supportIntent(true, true, true),
    supportIntent(false, false, false),
  ]))
  check(r.customerNotificationRate === 0.5, 'half-full: customerNotificationRate 0.5')
  check(r.externalMessageRate === 0.5, 'half-full: externalMessageRate 0.5')
  check(r.refundStartedRate === 0.5, 'half-full: refundStartedRate 0.5')
}

console.log(`ecommerce-support-intent-rates-brief: ${checks} checks passed`)
