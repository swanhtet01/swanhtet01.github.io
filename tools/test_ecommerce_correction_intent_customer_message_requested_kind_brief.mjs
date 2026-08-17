import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentCustomerMessageRequestedKindBrief } from './ecommerce-correction-intent-customer-message-requested-kind-brief.ts'`,
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

const { projectEcommerceCorrectionIntentCustomerMessageRequestedKindBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent(customerMessageSent = false, requestedKind = 'credit') {
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
    requestedKind,
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Correction reason',
    orderChanged: false,
    paymentChanged: false,
    refundStarted: false,
    ledgerPosted: false,
    taxFiled: false,
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
  const r = projectEcommerceCorrectionIntentCustomerMessageRequestedKindBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.messageSentCreditCount === 0, 'empty: messageSentCreditCount 0')
  check(r.noMessageCreditCount === 0, 'empty: noMessageCreditCount 0')
}

// 2. Message sent + credit
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
  ]))
  check(r.totalIntents === 1, 'msg-credit: totalIntents 1')
  check(r.messageSentCreditCount === 1, 'msg-credit: messageSentCreditCount 1')
  check(r.messageSentDebitCount === 0, 'msg-credit: messageSentDebitCount 0')
  check(r.noMessageCreditCount === 0, 'msg-credit: noMessageCreditCount 0')
}

// 3. Message sent + debit
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRequestedKindBrief(state([
    correctionIntent(true, 'debit'),
  ]))
  check(r.totalIntents === 1, 'msg-debit: totalIntents 1')
  check(r.messageSentDebitCount === 1, 'msg-debit: messageSentDebitCount 1')
  check(r.noMessageDebitCount === 0, 'msg-debit: noMessageDebitCount 0')
  check(r.messageSentCreditCount === 0, 'msg-debit: messageSentCreditCount 0')
}

// 4. No message + credit
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRequestedKindBrief(state([
    correctionIntent(false, 'credit'),
  ]))
  check(r.totalIntents === 1, 'nomsg-credit: totalIntents 1')
  check(r.noMessageCreditCount === 1, 'nomsg-credit: noMessageCreditCount 1')
  check(r.messageSentCreditCount === 0, 'nomsg-credit: messageSentCreditCount 0')
}

// 5. No message + debit
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRequestedKindBrief(state([
    correctionIntent(false, 'debit'),
  ]))
  check(r.totalIntents === 1, 'nomsg-debit: totalIntents 1')
  check(r.noMessageDebitCount === 1, 'nomsg-debit: noMessageDebitCount 1')
  check(r.messageSentDebitCount === 0, 'nomsg-debit: messageSentDebitCount 0')
}

// 6. Mixed: 2 msg+credit, 1 msg+debit, 1 noMsg+debit
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'debit'),
    correctionIntent(false, 'debit'),
  ]))
  check(r.totalIntents === 4, 'mixed: totalIntents 4')
  check(r.messageSentCreditCount === 2, 'mixed: messageSentCreditCount 2')
  check(r.messageSentDebitCount === 1, 'mixed: messageSentDebitCount 1')
  check(r.noMessageDebitCount === 1, 'mixed: noMessageDebitCount 1')
}

// 7. Row totals
{
  const r = projectEcommerceCorrectionIntentCustomerMessageRequestedKindBrief(state([
    correctionIntent(true, 'credit'),
    correctionIntent(true, 'debit'),
    correctionIntent(false, 'credit'),
  ]))
  check(r.messageSentCount === 2, 'row-totals: messageSentCount 2')
  check(r.noMessageCount === 1, 'row-totals: noMessageCount 1')
}

console.log(`ecommerce-correction-intent-customer-message-requested-kind-brief: ${checks} checks passed`)
