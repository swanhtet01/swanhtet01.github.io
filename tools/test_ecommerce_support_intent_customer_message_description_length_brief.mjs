import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentCustomerMessageDescriptionLengthBrief } from './ecommerce-support-intent-customer-message-description-length-brief.ts'`,
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

const { projectEcommerceSupportIntentCustomerMessageDescriptionLengthBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SHORT_DESC = 'Short description'
const DETAILED_DESC = 'Very detailed description of the support issue encountered with this order'

let intentId = 0
function supportIntent(customerMessageSent = false, description = SHORT_DESC) {
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
    sourceAcknowledgementDigest: `sad-${intentId}`,
    category: 'order_status',
    description,
    refundStarted: false,
    customerMessageSent,
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
  const r = projectEcommerceSupportIntentCustomerMessageDescriptionLengthBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentCount === 0, 'empty: messageSentCount 0')
  check(r.noMessageCount === 0, 'empty: noMessageCount 0')
}

// 2. Message sent + short description
{
  const r = projectEcommerceSupportIntentCustomerMessageDescriptionLengthBrief(state([
    supportIntent(true, SHORT_DESC),
  ]))
  check(r.totalIntents === 1, 'msg-short: totalIntents 1')
  check(r.messageSentShortCount === 1, 'msg-short: messageSentShortCount 1')
  check(r.messageSentCount === 1, 'msg-short: messageSentCount 1')
  check(r.noMessageCount === 0, 'msg-short: noMessageCount 0')
}

// 3. Message sent + detailed description
{
  const r = projectEcommerceSupportIntentCustomerMessageDescriptionLengthBrief(state([
    supportIntent(true, DETAILED_DESC),
  ]))
  check(r.totalIntents === 1, 'msg-detailed: totalIntents 1')
  check(r.messageSentDetailedCount === 1, 'msg-detailed: messageSentDetailedCount 1')
  check(r.messageSentCount === 1, 'msg-detailed: messageSentCount 1')
  check(r.noMessageCount === 0, 'msg-detailed: noMessageCount 0')
}

// 4. No message + short description
{
  const r = projectEcommerceSupportIntentCustomerMessageDescriptionLengthBrief(state([
    supportIntent(false, SHORT_DESC),
  ]))
  check(r.totalIntents === 1, 'no-msg-short: totalIntents 1')
  check(r.noMessageShortCount === 1, 'no-msg-short: noMessageShortCount 1')
  check(r.noMessageCount === 1, 'no-msg-short: noMessageCount 1')
}

// 5. No message + detailed description
{
  const r = projectEcommerceSupportIntentCustomerMessageDescriptionLengthBrief(state([
    supportIntent(false, DETAILED_DESC),
  ]))
  check(r.totalIntents === 1, 'no-msg-detailed: totalIntents 1')
  check(r.noMessageDetailedCount === 1, 'no-msg-detailed: noMessageDetailedCount 1')
  check(r.noMessageCount === 1, 'no-msg-detailed: noMessageCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceSupportIntentCustomerMessageDescriptionLengthBrief(state([
    supportIntent(true, SHORT_DESC),
    supportIntent(true, DETAILED_DESC),
    supportIntent(false, SHORT_DESC),
    supportIntent(false, DETAILED_DESC),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.messageSentShortCount === 1, 'all-cells: messageSentShortCount 1')
  check(r.noMessageShortCount === 1, 'all-cells: noMessageShortCount 1')
  check(r.messageSentDetailedCount === 1, 'all-cells: messageSentDetailedCount 1')
}

// 7. Remaining sub-bucket counts for case 6
{
  const r = projectEcommerceSupportIntentCustomerMessageDescriptionLengthBrief(state([
    supportIntent(true, SHORT_DESC),
    supportIntent(true, DETAILED_DESC),
    supportIntent(false, SHORT_DESC),
    supportIntent(false, DETAILED_DESC),
  ]))
  check(r.messageSentCount === 2, 'sub-buckets: messageSentCount 2')
  check(r.noMessageCount === 2, 'sub-buckets: noMessageCount 2')
}

console.log(`ecommerce-support-intent-customer-message-description-length-brief: ${checks} checks passed`)
