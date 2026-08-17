import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentRatesBrief } from './ecommerce-correction-intent-rates-brief.ts'`,
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

const { projectEcommerceCorrectionIntentRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent({
  ledgerPosted = false,
  taxFiled = false,
  customerMessageSent = false,
  providerCalled = false,
  refundStarted = false,
  refundStatus = 'none',
} = {}) {
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
    refundStatus,
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Correction reason',
    orderChanged: false,
    paymentChanged: false,
    refundStarted,
    ledgerPosted,
    taxFiled,
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
  const r = projectEcommerceCorrectionIntentRatesBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.complianceRate === 0, 'empty: complianceRate 0')
  check(r.pendingRefundRate === 0, 'empty: pendingRefundRate 0')
}

// 2. One fully engaged intent
{
  const r = projectEcommerceCorrectionIntentRatesBrief(state([
    correctionIntent({ ledgerPosted: true, taxFiled: true, customerMessageSent: true, providerCalled: true, refundStarted: true, refundStatus: 'settled' }),
  ]))
  check(r.totalIntents === 1, 'full: totalIntents 1')
  check(r.complianceCount === 1, 'full: complianceCount 1')
  check(r.complianceRate === 1, 'full: complianceRate 1')
  check(r.customerNotificationCount === 1, 'full: customerNotificationCount 1')
  check(r.refundSettledCount === 1, 'full: refundSettledCount 1')
}

// 3. One intent with pending refund
{
  const r = projectEcommerceCorrectionIntentRatesBrief(state([
    correctionIntent({ refundStatus: 'due' }),
  ]))
  check(r.totalIntents === 1, 'due: totalIntents 1')
  check(r.pendingRefundCount === 1, 'due: pendingRefundCount 1')
  check(r.pendingRefundRate === 1, 'due: pendingRefundRate 1')
}

// 4. Two intents, one compliant
{
  const r = projectEcommerceCorrectionIntentRatesBrief(state([
    correctionIntent({ ledgerPosted: true, taxFiled: true }),
    correctionIntent(),
  ]))
  check(r.totalIntents === 2, 'half-compliant: totalIntents 2')
  check(r.complianceCount === 1, 'half-compliant: complianceCount 1')
  check(r.complianceRate === 0.5, 'half-compliant: complianceRate 0.5')
  check(r.customerNotificationCount === 0, 'half-compliant: customerNotificationCount 0')
}

// 5. Four intents mixed — compliance, notification, settlement, pending rates
{
  const r = projectEcommerceCorrectionIntentRatesBrief(state([
    correctionIntent({ ledgerPosted: true, taxFiled: true, customerMessageSent: true, refundStarted: true, refundStatus: 'settled' }),
    correctionIntent({ ledgerPosted: true, taxFiled: true, customerMessageSent: true }),
    correctionIntent({ customerMessageSent: true }),
    correctionIntent({ refundStatus: 'due' }),
  ]))
  check(r.complianceRate === 0.5, 'mixed: complianceRate 0.5')
  check(r.customerNotificationRate === 0.75, 'mixed: customerNotificationRate 0.75')
  check(r.refundSettlementRate === 0.25, 'mixed: refundSettlementRate 0.25')
  check(r.pendingRefundRate === 0.25, 'mixed: pendingRefundRate 0.25')
}

// 6. Refund initiation rate
{
  const r = projectEcommerceCorrectionIntentRatesBrief(state([
    correctionIntent({ refundStarted: true }),
    correctionIntent(),
  ]))
  check(r.refundInitiatedCount === 1, 'refund-init: refundInitiatedCount 1')
  check(r.refundInitiationRate === 0.5, 'refund-init: refundInitiationRate 0.5')
}

// 7. Provider escalation rate
{
  const r = projectEcommerceCorrectionIntentRatesBrief(state([
    correctionIntent({ providerCalled: true }),
    correctionIntent(),
  ]))
  check(r.providerEscalationCount === 1, 'escalation: providerEscalationCount 1')
  check(r.providerEscalationRate === 0.5, 'escalation: providerEscalationRate 0.5')
}

console.log(`ecommerce-correction-intent-rates-brief: ${checks} checks passed`)
