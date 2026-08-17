import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionPaymentValueBrief } from './ecommerce-cancellation-decision-payment-value-brief.ts'`,
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

const { projectEcommerceCancellationDecisionPaymentValueBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let decisionId = 0
function cancellationDecision(paymentStatus = 'pending', totalMmk = 10000) {
  decisionId++
  return {
    schema: 'supermega.ecommerce.cancellation_decision.v1',
    state: 'kept_by_shop',
    scope: 'scope-1',
    id: `ECD-${decisionId}`,
    idempotencyKey: `ik-${decisionId}`,
    createdAt: '2026-08-01T09:00:00Z',
    intentId: `ECI-${decisionId}`,
    intentDigest: `eid-${decisionId}`,
    orderId: `ORD-${decisionId}`,
    sourceRequestId: `REQ-${decisionId}`,
    sourceAcknowledgementDigest: `sad-${decisionId}`,
    orderStatus: 'confirmed',
    paymentStatus,
    refundStatus: 'none',
    totalMmk,
    actor: 'staff-1',
    reason: 'Keeping the order',
    evidenceReference: `ev-${decisionId}`,
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    providerCalled: false,
  }
}

function state(cancellationDecisions = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions,
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCancellationDecisionPaymentValueBrief(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.pendingTotalMmk === 0, 'empty: pendingTotalMmk 0')
  check(r.reconciledTotalMmk === 0, 'empty: reconciledTotalMmk 0')
}

// 2. Single pending 8000 MMK
{
  const r = projectEcommerceCancellationDecisionPaymentValueBrief(state([
    cancellationDecision('pending', 8000),
  ]))
  check(r.totalDecisions === 1, 'single-pending: totalDecisions 1')
  check(r.pendingCount === 1, 'single-pending: pendingCount 1')
  check(r.pendingTotalMmk === 8000, 'single-pending: pendingTotalMmk 8000')
  check(r.pendingAverageMmk === 8000, 'single-pending: pendingAverageMmk 8000')
}

// 3. Single reconciled 12000 MMK
{
  const r = projectEcommerceCancellationDecisionPaymentValueBrief(state([
    cancellationDecision('reconciled', 12000),
  ]))
  check(r.totalDecisions === 1, 'single-reconciled: totalDecisions 1')
  check(r.reconciledCount === 1, 'single-reconciled: reconciledCount 1')
  check(r.reconciledTotalMmk === 12000, 'single-reconciled: reconciledTotalMmk 12000')
  check(r.reconciledAverageMmk === 12000, 'single-reconciled: reconciledAverageMmk 12000')
}

// 4. Two pending (6000 + 14000)
{
  const r = projectEcommerceCancellationDecisionPaymentValueBrief(state([
    cancellationDecision('pending', 6000),
    cancellationDecision('pending', 14000),
  ]))
  check(r.pendingCount === 2, 'two-pending: pendingCount 2')
  check(r.pendingTotalMmk === 20000, 'two-pending: pendingTotalMmk 20000')
  check(r.pendingAverageMmk === 10000, 'two-pending: pendingAverageMmk 10000')
  check(r.reconciledCount === 0, 'two-pending: reconciledCount 0')
}

// 5. Two reconciled (4000 + 16000)
{
  const r = projectEcommerceCancellationDecisionPaymentValueBrief(state([
    cancellationDecision('reconciled', 4000),
    cancellationDecision('reconciled', 16000),
  ]))
  check(r.reconciledCount === 2, 'two-reconciled: reconciledCount 2')
  check(r.reconciledTotalMmk === 20000, 'two-reconciled: reconciledTotalMmk 20000')
  check(r.reconciledAverageMmk === 10000, 'two-reconciled: reconciledAverageMmk 10000')
  check(r.pendingCount === 0, 'two-reconciled: pendingCount 0')
}

// 6. Mixed: 2 pending + 2 reconciled
{
  const r = projectEcommerceCancellationDecisionPaymentValueBrief(state([
    cancellationDecision('pending', 5000),
    cancellationDecision('pending', 15000),
    cancellationDecision('reconciled', 8000),
    cancellationDecision('reconciled', 12000),
  ]))
  check(r.totalDecisions === 4, 'mixed: totalDecisions 4')
  check(r.pendingCount === 2, 'mixed: pendingCount 2')
  check(r.reconciledCount === 2, 'mixed: reconciledCount 2')
  check(r.pendingTotalMmk === 20000, 'mixed: pendingTotalMmk 20000')
}

console.log(`ecommerce-cancellation-decision-payment-value-brief: ${checks} checks passed`)
