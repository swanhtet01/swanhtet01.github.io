import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentCustomerMessageProviderCalledBrief } from './ecommerce-correction-intent-customer-message-provider-called-brief.ts'`,
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

const { projectEcommerceCorrectionIntentCustomerMessageProviderCalledBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(customerMessageSent = false, providerCalled = false) {
  intentId++
  return {
    schema: 'supermega.ecommerce.correction_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceCalculationDigest: `scd-${intentId}`,
    sourceCorrectionCount: 0,
    originalBalanceMmk: 10000,
    paymentStatus: 'reconciled',
    refundStatus: 'none',
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Correction reason',
    orderChanged: false,
    paymentChanged: false,
    refundStarted: false,
    ledgerPosted: false,
    taxFiled: false,
    customerMessageSent,
    providerCalled,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(correctionIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents,
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCorrectionIntentCustomerMessageProviderCalledBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentProviderCalledCount === 0, 'empty: messageSentProviderCalledCount 0')
  check(r.noMessageNoProviderCount === 0, 'empty: noMessageNoProviderCount 0')
}

// 2. Message sent + provider called
{
  const r = projectEcommerceCorrectionIntentCustomerMessageProviderCalledBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'msg-prov: totalIntents 1')
  check(r.messageSentProviderCalledCount === 1, 'msg-prov: messageSentProviderCalledCount 1')
  check(r.messageSentNoProviderCount === 0, 'msg-prov: messageSentNoProviderCount 0')
  check(r.noMessageProviderCalledCount === 0, 'msg-prov: noMessageProviderCalledCount 0')
}

// 3. Message sent + no provider
{
  const r = projectEcommerceCorrectionIntentCustomerMessageProviderCalledBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'msg-noprov: totalIntents 1')
  check(r.messageSentNoProviderCount === 1, 'msg-noprov: messageSentNoProviderCount 1')
  check(r.noMessageNoProviderCount === 0, 'msg-noprov: noMessageNoProviderCount 0')
  check(r.messageSentProviderCalledCount === 0, 'msg-noprov: messageSentProviderCalledCount 0')
}

// 4. No message + provider called
{
  const r = projectEcommerceCorrectionIntentCustomerMessageProviderCalledBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'nomsg-prov: totalIntents 1')
  check(r.noMessageProviderCalledCount === 1, 'nomsg-prov: noMessageProviderCalledCount 1')
  check(r.messageSentProviderCalledCount === 0, 'nomsg-prov: messageSentProviderCalledCount 0')
}

// 5. No message + no provider
{
  const r = projectEcommerceCorrectionIntentCustomerMessageProviderCalledBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'nomsg-noprov: totalIntents 1')
  check(r.noMessageNoProviderCount === 1, 'nomsg-noprov: noMessageNoProviderCount 1')
  check(r.noMessageProviderCalledCount === 0, 'nomsg-noprov: noMessageProviderCalledCount 0')
}

// 6. Mixed: 2 msg+prov, 1 msg+noprov, 1 noMsg+prov
{
  const r = projectEcommerceCorrectionIntentCustomerMessageProviderCalledBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.messageSentProviderCalledCount === 2, 'mixed: messageSentProviderCalledCount 2')
  check(r.messageSentNoProviderCount === 1, 'mixed: messageSentNoProviderCount 1')
  check(r.noMessageProviderCalledCount === 1, 'mixed: noMessageProviderCalledCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentCustomerMessageProviderCalledBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.messageSentCount === 2, 'row-totals: messageSentCount 2')
  check(r.noMessageCount === 1, 'row-totals: noMessageCount 1')
}

console.log(`ecommerce-correction-intent-customer-message-provider-called-brief: ${checks} checks passed`)
