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

let intentId = 0
function supportIntent(customerMessageSent = false, externalMessageSent = false) {
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

// 2. Message sent + external sent
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'msg-external: totalIntents 1')
  check(r.messageSentExternalSentCount === 1, 'msg-external: messageSentExternalSentCount 1')
  check(r.messageSentNoExternalCount === 0, 'msg-external: messageSentNoExternalCount 0')
  check(r.messageSentCount === 1, 'msg-external: messageSentCount 1')
}

// 3. Message sent + no external
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'msg-noexternal: totalIntents 1')
  check(r.messageSentNoExternalCount === 1, 'msg-noexternal: messageSentNoExternalCount 1')
  check(r.messageSentCount === 1, 'msg-noexternal: messageSentCount 1')
  check(r.noMessageCount === 0, 'msg-noexternal: noMessageCount 0')
}

// 4. No message + external sent
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'nomsg-external: totalIntents 1')
  check(r.noMessageExternalSentCount === 1, 'nomsg-external: noMessageExternalSentCount 1')
  check(r.noMessageCount === 1, 'nomsg-external: noMessageCount 1')
}

// 5. No message + no external
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'nomsg-noexternal: totalIntents 1')
  check(r.noMessageNoExternalCount === 1, 'nomsg-noexternal: noMessageNoExternalCount 1')
  check(r.noMessageCount === 1, 'nomsg-noexternal: noMessageCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent(true, true),
    supportIntent(true, false),
    supportIntent(false, true),
    supportIntent(false, false),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.messageSentExternalSentCount === 1, 'all-cells: messageSentExternalSentCount 1')
  check(r.noMessageNoExternalCount === 1, 'all-cells: noMessageNoExternalCount 1')
  check(r.messageSentCount === 2, 'all-cells: messageSentCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceSupportIntentCustomerMessageExternalMessageBrief(state([
    supportIntent(true, true),
    supportIntent(true, false),
    supportIntent(false, true),
    supportIntent(false, false),
  ]))
  check(r.noMessageCount === 2, 'row-totals: noMessageCount 2')
  check(r.messageSentNoExternalCount === 1, 'row-totals: messageSentNoExternalCount 1')
}

console.log(`ecommerce-support-intent-customer-message-external-message-brief: ${checks} checks passed`)
