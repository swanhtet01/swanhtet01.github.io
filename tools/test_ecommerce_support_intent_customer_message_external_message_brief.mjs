import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentCustomerMessageExternalMessageBrief } from './ecommerce-support-intent-customer-message-external-message-brief.ts'`,
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

const { projectEcommerceSupportIntentCustomerMessageExternalMessageBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// After the rename, customerMessageSent became externalMessageSent. This brief now
// cross-tabs externalMessageSent with itself (degenerate). Semantics:
//   externalMessageSent=true  -> messageSentExternalSentCount (messageSentCount)
//   externalMessageSent=false -> noMessageNoExternalCount (noMessageCount)
//   messageSentNoExternalCount and noMessageExternalSentCount are always 0.

let intentId = 0
function supportIntent({ externalMessageSent = false } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.support_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ESI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    category: 'order_status',
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
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. externalMessageSent=true -> messageSentExternalSentCount
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent({ externalMessageSent: true }),
  ]))
  check(r.totalIntents === 1, 'sent: totalIntents 1')
  check(r.messageSentExternalSentCount === 1, 'sent: messageSentExternalSentCount 1')
  check(r.messageSentNoExternalCount === 0, 'sent: messageSentNoExternalCount 0')
  check(r.messageSentCount === 1, 'sent: messageSentCount 1')
}

// 3. externalMessageSent=false -> noMessageNoExternalCount
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent(),
  ]))
  check(r.totalIntents === 1, 'notsent: totalIntents 1')
  check(r.noMessageNoExternalCount === 1, 'notsent: noMessageNoExternalCount 1')
  check(r.noMessageExternalSentCount === 0, 'notsent: noMessageExternalSentCount 0')
  check(r.noMessageCount === 1, 'notsent: noMessageCount 1')
}

// 4. Two sent -> messageSentExternalSentCount 2
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent({ externalMessageSent: true }),
    supportIntent({ externalMessageSent: true }),
  ]))
  check(r.messageSentExternalSentCount === 2, 'twosent: messageSentExternalSentCount 2')
  check(r.noMessageNoExternalCount === 0, 'twosent: noMessageNoExternalCount 0')
  check(r.messageSentCount === 2, 'twosent: messageSentCount 2')
}

// 5. Two not sent -> noMessageNoExternalCount 2
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent(),
    supportIntent(),
  ]))
  check(r.noMessageNoExternalCount === 2, 'twonotsent: noMessageNoExternalCount 2')
  check(r.messageSentExternalSentCount === 0, 'twonotsent: messageSentExternalSentCount 0')
}

// 6. One sent + one not sent -> split counts
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent({ externalMessageSent: true }),
    supportIntent(),
  ]))
  check(r.totalIntents === 2, 'mixed: totalIntents 2')
  check(r.messageSentExternalSentCount === 1, 'mixed: messageSentExternalSentCount 1')
  check(r.noMessageNoExternalCount === 1, 'mixed: noMessageNoExternalCount 1')
  check(r.messageSentCount === 1, 'mixed: messageSentCount 1')
  check(r.noMessageCount === 1, 'mixed: noMessageCount 1')
}

// 7. Degenerate cells always 0
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent({ externalMessageSent: true }),
    supportIntent(),
  ]))
  check(r.messageSentNoExternalCount === 0, 'degenerate: messageSentNoExternalCount always 0')
  check(r.noMessageExternalSentCount === 0, 'degenerate: noMessageExternalSentCount always 0')
}

console.log(`ecommerce-support-intent-customer-message-external-message-brief: ${checks} checks passed`)
