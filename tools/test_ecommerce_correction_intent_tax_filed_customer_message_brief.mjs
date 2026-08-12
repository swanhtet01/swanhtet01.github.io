import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentTaxFiledCustomerMessageBrief } from './ecommerce-correction-intent-tax-filed-customer-message-brief.ts'`,
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

const { projectEcommerceCorrectionIntentTaxFiledCustomerMessageBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(taxFiled = false, customerMessageSent = false) {
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
    taxFiled,
    customerMessageSent,
    providerCalled: false,
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
  const r = projectEcommerceCorrectionIntentTaxFiledCustomerMessageBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.taxFiledMessageSentCount === 0, 'empty: taxFiledMessageSentCount 0')
  check(r.noTaxFiledNoMessageCount === 0, 'empty: noTaxFiledNoMessageCount 0')
}

// 2. Both true
{
  const r = projectEcommerceCorrectionIntentTaxFiledCustomerMessageBrief(state([
    correctionIntent(true, true),
  ]))
  check(r.totalIntents === 1, 'both-true: totalIntents 1')
  check(r.taxFiledMessageSentCount === 1, 'both-true: taxFiledMessageSentCount 1')
  check(r.taxFiledNoMessageCount === 0, 'both-true: taxFiledNoMessageCount 0')
  check(r.noTaxFiledMessageSentCount === 0, 'both-true: noTaxFiledMessageSentCount 0')
}

// 3. Tax filed, no message
{
  const r = projectEcommerceCorrectionIntentTaxFiledCustomerMessageBrief(state([
    correctionIntent(true, false),
  ]))
  check(r.totalIntents === 1, 'tax-nomessage: totalIntents 1')
  check(r.taxFiledNoMessageCount === 1, 'tax-nomessage: taxFiledNoMessageCount 1')
  check(r.taxFiledMessageSentCount === 0, 'tax-nomessage: taxFiledMessageSentCount 0')
  check(r.noTaxFiledNoMessageCount === 0, 'tax-nomessage: noTaxFiledNoMessageCount 0')
}

// 4. No tax filed, message sent
{
  const r = projectEcommerceCorrectionIntentTaxFiledCustomerMessageBrief(state([
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 1, 'notax-message: totalIntents 1')
  check(r.noTaxFiledMessageSentCount === 1, 'notax-message: noTaxFiledMessageSentCount 1')
  check(r.taxFiledMessageSentCount === 0, 'notax-message: taxFiledMessageSentCount 0')
}

// 5. Both false
{
  const r = projectEcommerceCorrectionIntentTaxFiledCustomerMessageBrief(state([
    correctionIntent(false, false),
  ]))
  check(r.totalIntents === 1, 'both-false: totalIntents 1')
  check(r.noTaxFiledNoMessageCount === 1, 'both-false: noTaxFiledNoMessageCount 1')
  check(r.taxFiledNoMessageCount === 0, 'both-false: taxFiledNoMessageCount 0')
}

// 6. Mixed: 2×(T,T), 1×(T,F), 1×(F,T)
{
  const r = projectEcommerceCorrectionIntentTaxFiledCustomerMessageBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, true),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.taxFiledMessageSentCount === 2, 'mixed: taxFiledMessageSentCount 2')
  check(r.taxFiledNoMessageCount === 1, 'mixed: taxFiledNoMessageCount 1')
  check(r.noTaxFiledMessageSentCount === 1, 'mixed: noTaxFiledMessageSentCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentTaxFiledCustomerMessageBrief(state([
    correctionIntent(true, true),
    correctionIntent(true, false),
    correctionIntent(false, false),
  ]))
  check(r.taxFiledCount === 2, 'row-totals: taxFiledCount 2')
  check(r.noTaxFiledCount === 1, 'row-totals: noTaxFiledCount 1')
}

console.log(`ecommerce-correction-intent-tax-filed-customer-message-brief: ${checks} checks passed`)
