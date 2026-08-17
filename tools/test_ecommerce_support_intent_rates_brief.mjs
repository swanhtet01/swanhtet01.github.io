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
function supportIntent({ externalMessageSent = false, refundStarted = false } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.support_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ESR-${intentId}`,
    idempotencyKey: `ESI-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    category: 'order_status',
    description: 'Support description',
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
  check(r.externalMessageRate === 0, 'empty: externalMessageRate 0')
  check(r.refundStartedRate === 0, 'empty: refundStartedRate 0')
}

// 2. One intent with external message sent
{
  const r = projectEcommerceSupportIntentRatesBrief(state([
    supportIntent({ externalMessageSent: true }),
  ]))
  check(r.totalIntents === 1, 'external: totalIntents 1')
  check(r.externalMessageCount === 1, 'external: externalMessageCount 1')
  check(r.externalMessageRate === 1, 'external: externalMessageRate 1')
  check(r.refundStartedCount === 0, 'external: refundStartedCount 0')
}

// 3. One intent with refund started
{
  const r = projectEcommerceSupportIntentRatesBrief(state([
    supportIntent({ refundStarted: true }),
  ]))
  check(r.refundStartedCount === 1, 'refund: refundStartedCount 1')
  check(r.refundStartedRate === 1, 'refund: refundStartedRate 1')
  check(r.externalMessageCount === 0, 'refund: externalMessageCount 0')
}

// 4. One intent with both true
{
  const r = projectEcommerceSupportIntentRatesBrief(state([
    supportIntent({ externalMessageSent: true, refundStarted: true }),
  ]))
  check(r.externalMessageCount === 1, 'both: externalMessageCount 1')
  check(r.refundStartedCount === 1, 'both: refundStartedCount 1')
}

// 5. Two intents — one external only, one refund only
{
  const r = projectEcommerceSupportIntentRatesBrief(state([
    supportIntent({ externalMessageSent: true }),
    supportIntent({ refundStarted: true }),
  ]))
  check(r.totalIntents === 2, 'mixed: totalIntents 2')
  check(r.externalMessageRate === 0.5, 'mixed: externalMessageRate 0.5')
  check(r.refundStartedRate === 0.5, 'mixed: refundStartedRate 0.5')
}

// 6. Four intents mixed
{
  const r = projectEcommerceSupportIntentRatesBrief(state([
    supportIntent({ externalMessageSent: true, refundStarted: true }),
    supportIntent({ externalMessageSent: true }),
    supportIntent({ refundStarted: true }),
    supportIntent(),
  ]))
  check(r.totalIntents === 4, 'four: totalIntents 4')
  check(r.externalMessageCount === 2, 'four: externalMessageCount 2')
  check(r.externalMessageRate === 0.5, 'four: externalMessageRate 0.5')
  check(r.refundStartedCount === 2, 'four: refundStartedCount 2')
  check(r.refundStartedRate === 0.5, 'four: refundStartedRate 0.5')
}

console.log(`ecommerce-support-intent-rates-brief: ${checks} checks passed`)
