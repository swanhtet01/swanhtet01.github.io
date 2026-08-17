import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentExternalMessageSentRatesBrief } from './ecommerce-support-intent-external-message-sent-rates-brief.ts'`,
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

const { projectEcommerceSupportIntentExternalMessageSentRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function supportIntent({ externalMessageSent = false } = {}) {
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
    description: 'Support request description',
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

// 1. Empty state — 5 checks
{
  const r = projectEcommerceSupportIntentExternalMessageSentRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.externalMessageSentCount === 0, 'empty:externalMessageSentCount')
  check(r.externalMessageSentRate === 0, 'empty:externalMessageSentRate')
  check(r.notExternalMessageSentCount === 0, 'empty:notExternalMessageSentCount')
  check(r.notExternalMessageSentRate === 0, 'empty:notExternalMessageSentRate')
}

// 2. Single sent — 3 checks
{
  const r = projectEcommerceSupportIntentExternalMessageSentRatesBrief(state([
    supportIntent({ externalMessageSent: true }),
  ]))
  check(r.totalIntents === 1, 'sent:total')
  check(r.externalMessageSentCount === 1, 'sent:count')
  check(r.externalMessageSentRate === 1, 'sent:rate')
}

// 3. Single not sent — 3 checks
{
  const r = projectEcommerceSupportIntentExternalMessageSentRatesBrief(state([supportIntent()]))
  check(r.totalIntents === 1, 'notSent:total')
  check(r.notExternalMessageSentCount === 1, 'notSent:count')
  check(r.notExternalMessageSentRate === 1, 'notSent:rate')
}

// 4. 2 sent — 3 checks
{
  const r = projectEcommerceSupportIntentExternalMessageSentRatesBrief(state([
    supportIntent({ externalMessageSent: true }),
    supportIntent({ externalMessageSent: true }),
  ]))
  check(r.externalMessageSentCount === 2, 'twoSent:count')
  check(r.notExternalMessageSentCount === 0, 'twoSent:notCount')
  check(r.externalMessageSentRate === 1, 'twoSent:rate')
}

// 5. 2 not sent — 2 checks
{
  const r = projectEcommerceSupportIntentExternalMessageSentRatesBrief(state([
    supportIntent(),
    supportIntent(),
  ]))
  check(r.notExternalMessageSentCount === 2, 'twoNotSent:count')
  check(r.externalMessageSentCount === 0, 'twoNotSent:sentCount')
}

// 6. 1 sent + 1 not sent — 3 checks
{
  const r = projectEcommerceSupportIntentExternalMessageSentRatesBrief(state([
    supportIntent({ externalMessageSent: true }),
    supportIntent(),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.externalMessageSentRate === 0.5, 'half:sentRate')
  check(r.notExternalMessageSentRate === 0.5, 'half:notSentRate')
}

// 7. Precision: 1 sent + 2 not sent (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceSupportIntentExternalMessageSentRatesBrief(state([
    supportIntent({ externalMessageSent: true }),
    supportIntent(),
    supportIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.externalMessageSentCount === 1, 'precision:sentCount')
  check(r.externalMessageSentRate === 0.3333, 'precision:sentRate')
  check(r.notExternalMessageSentRate === 0.6667, 'precision:notSentRate')
}

console.log(`ecommerce-support-intent-external-message-sent-rates-brief: ${checks} checks passed`)
