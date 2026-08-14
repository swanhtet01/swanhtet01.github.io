import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentExternalMessageRefundStartedBrief } from './ecommerce-support-intent-external-message-refund-started-brief.ts'`,
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

const { projectEcommerceSupportIntentExternalMessageRefundStartedBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function supportIntent(externalMessageSent = false, refundStarted = false) {
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
    customerMessageSent: false,
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
  const r = projectEcommerceSupportIntentExternalMessageRefundStartedBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.externalSentCount === 0, 'empty: externalSentCount 0')
  check(r.noExternalCount === 0, 'empty: noExternalCount 0')
}

// 2. External sent + refund started
{
  const r = projectEcommerceSupportIntentExternalMessageRefundStartedBrief(state([
    supportIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'external-refund: totalIntents 1')
  check(r.externalSentRefundStartedCount === 1, 'external-refund: externalSentRefundStartedCount 1')
  check(r.externalSentNoRefundCount === 0, 'external-refund: externalSentNoRefundCount 0')
  check(r.externalSentCount === 1, 'external-refund: externalSentCount 1')
}

// 3. External sent + no refund
{
  const r = projectEcommerceSupportIntentExternalMessageRefundStartedBrief(state([
    supportIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'external-norefund: totalIntents 1')
  check(r.externalSentNoRefundCount === 1, 'external-norefund: externalSentNoRefundCount 1')
  check(r.externalSentCount === 1, 'external-norefund: externalSentCount 1')
  check(r.noExternalCount === 0, 'external-norefund: noExternalCount 0')
}

// 4. No external + refund started
{
  const r = projectEcommerceSupportIntentExternalMessageRefundStartedBrief(state([
    supportIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'noexternal-refund: totalIntents 1')
  check(r.noExternalRefundStartedCount === 1, 'noexternal-refund: noExternalRefundStartedCount 1')
  check(r.noExternalCount === 1, 'noexternal-refund: noExternalCount 1')
}

// 5. No external + no refund
{
  const r = projectEcommerceSupportIntentExternalMessageRefundStartedBrief(state([
    supportIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'noexternal-norefund: totalIntents 1')
  check(r.noExternalNoRefundCount === 1, 'noexternal-norefund: noExternalNoRefundCount 1')
  check(r.noExternalCount === 1, 'noexternal-norefund: noExternalCount 1')
}

// 6. All 4 cells
{
  const r = projectEcommerceSupportIntentExternalMessageRefundStartedBrief(state([
    supportIntent(true, true),
    supportIntent(true, false),
    supportIntent(false, true),
    supportIntent(false, false),
  ]))
  check(r.totalIntents === 4, 'all-cells: totalIntents 4')
  check(r.externalSentRefundStartedCount === 1, 'all-cells: externalSentRefundStartedCount 1')
  check(r.noExternalNoRefundCount === 1, 'all-cells: noExternalNoRefundCount 1')
  check(r.externalSentCount === 2, 'all-cells: externalSentCount 2')
}

// 7. Row totals
{
  const r = projectEcommerceSupportIntentExternalMessageRefundStartedBrief(state([
    supportIntent(true, true),
    supportIntent(true, false),
    supportIntent(false, true),
    supportIntent(false, false),
  ]))
  check(r.noExternalCount === 2, 'row-totals: noExternalCount 2')
  check(r.externalSentNoRefundCount === 1, 'row-totals: externalSentNoRefundCount 1')
}

console.log(`ecommerce-support-intent-external-message-refund-started-brief: ${checks} checks passed`)
