import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationIntentReasonCodeBrief } from './ecommerce-cancellation-intent-reason-code-brief.ts'`,
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

const { projectEcommerceCancellationIntentReasonCodeBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function cancellationIntent(reasonCode = 'changed_mind') {
  intentId++
  return {
    schema: 'supermega.ecommerce.cancellation_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECN-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    totalMmk: 12000,
    reasonCode,
    reason: 'Cancellation reason',
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(cancellationIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents,
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state
{
  const r = projectEcommerceCancellationIntentReasonCodeBrief(state())
  check(r.totalIntents === 0, 'empty: totalIntents 0')
  check(r.uniqueReasonCodes === 0, 'empty: uniqueReasonCodes 0')
  check(r.topReasonCode === null, 'empty: topReasonCode null')
  check(r.topReasonCodeCount === 0, 'empty: topReasonCodeCount 0')
}

// 2. Single intent — one reason code
{
  const r = projectEcommerceCancellationIntentReasonCodeBrief(state([cancellationIntent('changed_mind')]))
  check(r.totalIntents === 1, 'single: totalIntents 1')
  check(r.uniqueReasonCodes === 1, 'single: uniqueReasonCodes 1')
  check(r.topReasonCode === 'changed_mind', 'single: topReasonCode')
  check(r.topReasonCodeCount === 1, 'single: topReasonCodeCount 1')
}

// 3. Two intents same reason — uniqueReasonCodes 1, topCount 2
{
  const r = projectEcommerceCancellationIntentReasonCodeBrief(state([
    cancellationIntent('order_error'),
    cancellationIntent('order_error'),
  ]))
  check(r.totalIntents === 2, 'same-reason: totalIntents 2')
  check(r.uniqueReasonCodes === 1, 'same-reason: uniqueReasonCodes 1')
  check(r.topReasonCode === 'order_error', 'same-reason: topReasonCode')
  check(r.topReasonCodeCount === 2, 'same-reason: topReasonCodeCount 2')
}

// 4. Two intents different reasons — uniqueReasonCodes 2
{
  const r = projectEcommerceCancellationIntentReasonCodeBrief(state([
    cancellationIntent('changed_mind'),
    cancellationIntent('delivery_too_slow'),
  ]))
  check(r.totalIntents === 2, 'two-diff: totalIntents 2')
  check(r.uniqueReasonCodes === 2, 'two-diff: uniqueReasonCodes 2')
  check(r.topReasonCodeCount === 1, 'two-diff: topReasonCodeCount 1')
  check(r.topReasonCode !== null, 'two-diff: topReasonCode set')
}

// 5. Three intents: one reason dominant
{
  const r = projectEcommerceCancellationIntentReasonCodeBrief(state([
    cancellationIntent('duplicate_order'),
    cancellationIntent('other'),
    cancellationIntent('duplicate_order'),
  ]))
  check(r.totalIntents === 3, 'dominant: totalIntents 3')
  check(r.uniqueReasonCodes === 2, 'dominant: uniqueReasonCodes 2')
  check(r.topReasonCode === 'duplicate_order', 'dominant: topReasonCode')
  check(r.topReasonCodeCount === 2, 'dominant: topReasonCodeCount 2')
}

// 6. Three intents all different reasons
{
  const r = projectEcommerceCancellationIntentReasonCodeBrief(state([
    cancellationIntent('changed_mind'),
    cancellationIntent('order_error'),
    cancellationIntent('delivery_too_slow'),
  ]))
  check(r.totalIntents === 3, 'all-diff: totalIntents 3')
  check(r.uniqueReasonCodes === 3, 'all-diff: uniqueReasonCodes 3')
  check(r.topReasonCodeCount === 1, 'all-diff: topReasonCodeCount 1')
}

console.log(`ecommerce-cancellation-intent-reason-code-brief: ${checks} checks passed`)
