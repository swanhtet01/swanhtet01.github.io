// Ecommerce cancellation decision summary: totalDecisions, uniqueOrders,
// totalOrderValueMmk, byOrderStatus, byPaymentStatus, uniqueActors.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCancellationDecisionSummary } from './ecommerce-cancellation-decision-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/cancellation-decision-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceCancellationDecisionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function decision({ orderId = 'ORD-1', totalMmk = 10_000, orderStatus = 'confirmed', paymentStatus = 'pending', actor = 'staff-1' } = {}) {
  seq++
  return {
    id: `cd-${seq}`,
    idempotencyKey: `ik-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    intentId: `ci-${seq}`,
    intentDigest: 'digest',
    orderId,
    sourceRequestId: 'REQ-1',
    sourceAcknowledgementDigest: 'ack-digest',
    orderStatus,
    paymentStatus,
    refundStatus: 'none',
    totalMmk,
    actor,
    reason: 'order is valid',
    evidenceReference: 'EVD-1',
    customerMessageSent: false,
    orderCancelled: false,
    refundStarted: false,
    providerCalled: false,
  }
}

function state(cancellationDecisions = []) {
  return {
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

// 1. Empty → all zeros
{
  const r = projectEcommerceCancellationDecisionSummary(state())
  check(r.totalDecisions === 0, 'empty: totalDecisions 0')
  check(r.uniqueOrders === 0, 'empty: uniqueOrders 0')
  check(r.totalOrderValueMmk === 0, 'empty: totalOrderValueMmk 0')
  check(r.byOrderStatus.confirmed === 0, 'empty: byOrderStatus.confirmed 0')
  check(r.byPaymentStatus.pending === 0, 'empty: byPaymentStatus.pending 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
}

// 2. Single decision: confirmed, pending, actor staff-1
{
  const r = projectEcommerceCancellationDecisionSummary(state([
    decision({ orderId: 'ORD-A', totalMmk: 10_000, orderStatus: 'confirmed', paymentStatus: 'pending', actor: 'staff-1' }),
  ]))
  check(r.totalDecisions === 1, 'single: totalDecisions 1')
  check(r.uniqueOrders === 1, 'single: uniqueOrders 1')
  check(r.totalOrderValueMmk === 10_000, 'single: totalOrderValueMmk 10000')
  check(r.byOrderStatus.confirmed === 1, 'single: byOrderStatus.confirmed 1')
  check(r.byOrderStatus.preparing === 0, 'single: byOrderStatus.preparing 0')
  check(r.byOrderStatus.ready === 0, 'single: byOrderStatus.ready 0')
  check(r.byPaymentStatus.pending === 1, 'single: byPaymentStatus.pending 1')
  check(r.byPaymentStatus.reconciled === 0, 'single: byPaymentStatus.reconciled 0')
  check(r.uniqueActors === 1, 'single: uniqueActors 1')
}

// 3. orderStatus 'preparing'
{
  const r = projectEcommerceCancellationDecisionSummary(state([
    decision({ orderStatus: 'preparing' }),
  ]))
  check(r.byOrderStatus.preparing === 1, 'preparing: byOrderStatus.preparing 1')
}

// 4. orderStatus 'ready'
{
  const r = projectEcommerceCancellationDecisionSummary(state([
    decision({ orderStatus: 'ready' }),
  ]))
  check(r.byOrderStatus.ready === 1, 'ready: byOrderStatus.ready 1')
}

// 5. paymentStatus 'reconciled'
{
  const r = projectEcommerceCancellationDecisionSummary(state([
    decision({ paymentStatus: 'reconciled' }),
  ]))
  check(r.byPaymentStatus.reconciled === 1, 'reconciled: byPaymentStatus.reconciled 1')
}

// 6. uniqueOrders dedup: same orderId, two decisions → uniqueOrders 1
{
  const r = projectEcommerceCancellationDecisionSummary(state([
    decision({ orderId: 'ORD-X' }),
    decision({ orderId: 'ORD-X' }),
  ]))
  check(r.uniqueOrders === 1, 'dedup: uniqueOrders 1')
  check(r.totalDecisions === 2, 'dedup: totalDecisions 2')
}

// 7. uniqueActors dedup: same actor twice → uniqueActors 1
{
  const r = projectEcommerceCancellationDecisionSummary(state([
    decision({ actor: 'mgr-1' }),
    decision({ actor: 'mgr-1' }),
  ]))
  check(r.uniqueActors === 1, 'actor-dedup: uniqueActors 1')
}

// 8. totalOrderValueMmk accumulates
{
  const r = projectEcommerceCancellationDecisionSummary(state([
    decision({ totalMmk: 10_000 }),
    decision({ totalMmk: 7_000 }),
  ]))
  check(r.totalOrderValueMmk === 17_000, 'accum: totalOrderValueMmk 10k+7k=17k')
}

// 9. Multiple distinct actors: uniqueActors 2
{
  const r = projectEcommerceCancellationDecisionSummary(state([
    decision({ actor: 'staff-A' }),
    decision({ actor: 'staff-B' }),
  ]))
  check(r.uniqueActors === 2, 'actors: uniqueActors 2')
}

// 10. All three orderStatus values together
{
  const r = projectEcommerceCancellationDecisionSummary(state([
    decision({ orderStatus: 'confirmed' }),
    decision({ orderStatus: 'preparing' }),
    decision({ orderStatus: 'ready' }),
  ]))
  check(r.byOrderStatus.confirmed === 1, 'all-status: confirmed 1')
  check(r.byOrderStatus.preparing === 1, 'all-status: preparing 1')
  check(r.byOrderStatus.ready === 1, 'all-status: ready 1')
}

// 11. Both paymentStatus values together
{
  const r = projectEcommerceCancellationDecisionSummary(state([
    decision({ paymentStatus: 'pending' }),
    decision({ paymentStatus: 'reconciled' }),
  ]))
  check(r.byPaymentStatus.pending === 1, 'both-payment: pending 1')
  check(r.byPaymentStatus.reconciled === 1, 'both-payment: reconciled 1')
}

// 12. Multi-decision accumulation
{
  const r = projectEcommerceCancellationDecisionSummary(state([
    decision({ orderId: 'ORD-1', totalMmk: 5_000 }),
    decision({ orderId: 'ORD-2', totalMmk: 8_000 }),
    decision({ orderId: 'ORD-1', totalMmk: 3_000 }),
  ]))
  check(r.totalDecisions === 3, 'multi: totalDecisions 3')
  check(r.uniqueOrders === 2, 'multi: uniqueOrders 2')
  check(r.totalOrderValueMmk === 16_000, 'multi: totalOrderValueMmk 5k+8k+3k=16k')
}

console.log(JSON.stringify({ ok: true, checks }))
