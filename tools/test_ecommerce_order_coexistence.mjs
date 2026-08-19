// Regression coverage for a question the correctness backlog flagged and a dedicated
// audit (Workflow wf_7b65e2f6-c04, 2026-08-19) verified against real code: can two
// ecommerce order intents (amendment, cancellation, reschedule, correction) pending on
// the SAME order race each other into a corrupted state? Verdict for all four pairings:
// SAFE. This file locks that verdict in so a future refactor can't silently reopen it.
//
// ecommerceOrderAmendmentShopState and ecommerceOrderRescheduleShopState are private to
// CoreApp.tsx (a JSX file with a React/router/CSS dependency graph too heavy to bundle
// standalone here) and are not exported. They are reproduced VERBATIM below -- keep
// these two functions byte-identical to CoreApp.tsx:462-479 and :489-507 whenever either
// changes; a mismatch here silently invalidates every check in this file.
// ecommerceCancellationMatchesCurrentShop IS exported from ecommerce-buying-lifecycle.ts
// and is imported directly rather than copied, since CoreApp.tsx ALSO hand-maintains its
// own copy of that one (CoreApp.tsx:447-460, currently byte-identical logic) -- a second
// duplicate here would only compound that existing maintenance hazard, not reduce it.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedCommerce, reserveCommerceOrder, cancelCommerceOrder, commerceOrderAcknowledgement,
      commerceOrderHasReleasableReservation, advanceCommerceOrder, reconcileCommercePayment,
      commerceOrderCorrectionExpectation, recordCommerceOrderCorrection,
    } from './commerce-workspace.ts'
    export { ecommerceCancellationMatchesCurrentShop, buildEcommerceCancellationIntent } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/order-coexistence-entry.ts',
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
})

const {
  createSeedCommerce, reserveCommerceOrder, cancelCommerceOrder, commerceOrderAcknowledgement,
  commerceOrderHasReleasableReservation, advanceCommerceOrder, reconcileCommercePayment,
  commerceOrderCorrectionExpectation, recordCommerceOrderCorrection,
  ecommerceCancellationMatchesCurrentShop, buildEcommerceCancellationIntent,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

// Verbatim from CoreApp.tsx:462-479.
function ecommerceOrderAmendmentShopState(state, intent) {
  const order = state.orders.find((candidate) => candidate.id === intent.orderId)
  const acknowledgement = commerceOrderAcknowledgement(state, intent.orderId)
  if (!order || !acknowledgement
    || order.sourceRecordId !== intent.sourceRequestId
    || acknowledgement.evidence.sourceRecordId !== intent.sourceRequestId
    || acknowledgement.payment.status !== intent.paymentStatus
    || acknowledgement.payment.refundStatus !== intent.refundStatus) return 'stale'
  if (acknowledgement.status === intent.orderStatus
    && acknowledgement.digest === intent.sourceAcknowledgementDigest
    && acknowledgement.totalMmk === intent.originalTotalMmk
    && acknowledgement.cancellation.state === 'not_cancelled'
    && commerceOrderHasReleasableReservation(state, intent.orderId)) return 'active'
  if (acknowledgement.status === 'cancelled'
    && acknowledgement.cancellation.state === 'cancelled'
    && acknowledgement.cancellation.evidenceReference === intent.evidenceReference) return 'replacement_needed'
  return 'stale'
}

// Verbatim from CoreApp.tsx:489-507.
function ecommerceOrderRescheduleShopState(state, intent) {
  const order = state.orders.find((candidate) => candidate.id === intent.orderId)
  const acknowledgement = commerceOrderAcknowledgement(state, intent.orderId)
  if (!order || !acknowledgement
    || order.sourceRecordId !== intent.sourceRequestId
    || acknowledgement.evidence.sourceRecordId !== intent.sourceRequestId
    || acknowledgement.payment.status !== intent.paymentStatus
    || acknowledgement.payment.refundStatus !== intent.refundStatus) return 'stale'
  if (acknowledgement.status === intent.orderStatus
    && acknowledgement.digest === intent.sourceAcknowledgementDigest
    && acknowledgement.totalMmk === intent.originalTotalMmk
    && acknowledgement.delivery.promisedAt === intent.originalPromisedAt
    && acknowledgement.cancellation.state === 'not_cancelled'
    && commerceOrderHasReleasableReservation(state, intent.orderId)) return 'active'
  if (acknowledgement.status === 'cancelled'
    && acknowledgement.cancellation.state === 'cancelled'
    && acknowledgement.cancellation.evidenceReference === intent.evidenceReference) return 'replacement_needed'
  return 'stale'
}

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Swan Htet'
const CAPTURED_AT = '2026-07-23T09:00:00.000Z'
// Exactly the 5 canonical proof keys, no commandId: advanceCommerceOrder's ready->completed
// transition embeds this object verbatim as order.completion, which is hasExactKeys-validated
// against exactly these 5 fields (commerce-workspace.ts) -- a stray commandId invalidates the
// whole state, per the same lesson tools/test_commerce_order_integrity.mjs notes.
const orderProof = { actor: OPERATOR, reason: 'Walk-in counter sale', evidenceReference: 'COUNTER-0001', actionId: 'ACT-ORDER-1', capturedAt: CAPTURED_AT }

function seedConfirmedOrder(id) {
  const state = createSeedCommerce()
  const item = state.items.find((candidate) => candidate.onHand > 2)
  assert.ok(item, 'the seed must contain a sellable item for this test to mean anything')
  const lines = [{ sku: item.sku, name: item.name, variant: item.variant, quantity: 1, unitPriceMmk: item.price }]
  const order = {
    id, createdAt: CAPTURED_AT, customer: 'Guest', owner: OPERATOR, channel: 'Ecommerce',
    item: item.name, itemSku: item.sku, quantity: 1, payment: 'Cash', paymentStatus: 'pending',
    refundStatus: 'none', fulfilment: 'delivery', fulfilmentReference: 'Ecommerce delivery review',
    promisedAt: '2026-07-23T10:00:00.000Z', total: item.price, status: 'confirmed', lines,
    sourceRecordId: `ECR-${randomUUID().toUpperCase()}`, evidenceReference: 'ORDER-EV-1',
  }
  const accepted = reserveCommerceOrder(state, order, { ...orderProof, actionId: `${orderProof.actionId}:${id}`, evidenceReference: 'ORDER-EV-1' })
  check(accepted !== null, `${id}: counter sale accepted`)
  return accepted
}

function acknowledgementSnapshot(state, orderId) {
  const acknowledgement = commerceOrderAcknowledgement(state, orderId)
  check(Boolean(acknowledgement), `${orderId}: acknowledgement exists`)
  return acknowledgement
}

function amendmentIntentFrom(state, orderId, evidenceReference) {
  const acknowledgement = acknowledgementSnapshot(state, orderId)
  return {
    orderId, sourceRequestId: acknowledgement.evidence.sourceRecordId, sourceAcknowledgementDigest: acknowledgement.digest,
    orderStatus: acknowledgement.status, paymentStatus: acknowledgement.payment.status,
    refundStatus: acknowledgement.payment.refundStatus, originalTotalMmk: acknowledgement.totalMmk,
    evidenceReference,
  }
}

function rescheduleIntentFrom(state, orderId, evidenceReference) {
  const acknowledgement = acknowledgementSnapshot(state, orderId)
  return {
    orderId, sourceRequestId: acknowledgement.evidence.sourceRecordId, sourceAcknowledgementDigest: acknowledgement.digest,
    orderStatus: acknowledgement.status, paymentStatus: acknowledgement.payment.status,
    refundStatus: acknowledgement.payment.refundStatus, originalTotalMmk: acknowledgement.totalMmk,
    originalPromisedAt: acknowledgement.delivery.promisedAt, evidenceReference,
  }
}

function cancellationIntentFor(state, orderId) {
  return buildEcommerceCancellationIntent({
    scope: 'test-scope', commerceState: state, orderId, reasonCode: 'changed_mind',
    reason: 'Customer changed their mind', idempotencyKey: `CNI-${randomUUID().toUpperCase()}`, createdAt: CAPTURED_AT,
  })
}

// --- 1. amendment vs cancellation, both orderings -----------------------------
{
  const base = seedConfirmedOrder('ORD-AC-1')
  const amendmentIntent = amendmentIntentFrom(base, 'ORD-AC-1', 'AMEND-EV-1')
  const cancellationIntent = cancellationIntentFor(base, 'ORD-AC-1')
  check(ecommerceOrderAmendmentShopState(base, amendmentIntent) === 'active', 'amendment starts active before either fires')
  check(ecommerceCancellationMatchesCurrentShop(base, cancellationIntent), 'cancellation starts matching before either fires')

  const afterAmendmentCancel = cancelCommerceOrder(base, 'ORD-AC-1', { ...orderProof, actionId: 'ACT-AC-1-AMEND-CANCEL', evidenceReference: 'AMEND-EV-1' })
  check(afterAmendmentCancel !== null, 'amendment cancel step applies')
  check(!ecommerceCancellationMatchesCurrentShop(afterAmendmentCancel, cancellationIntent), 'the independent cancellation intent is now correctly stale, not silently reusable')
  check(cancelCommerceOrder(afterAmendmentCancel, 'ORD-AC-1', { ...orderProof, actionId: 'ACT-AC-1-DOUBLE', evidenceReference: cancellationIntent.evidenceReference }) === null, 'a second cancel attempt is refused outright, not silently double-applied')
}
{
  const base = seedConfirmedOrder('ORD-AC-2')
  const amendmentIntent = amendmentIntentFrom(base, 'ORD-AC-2', 'AMEND-EV-2')
  const cancellationIntent = cancellationIntentFor(base, 'ORD-AC-2')

  const afterCancellationApply = cancelCommerceOrder(base, 'ORD-AC-2', { ...orderProof, actionId: 'ACT-AC-2-CANCEL', evidenceReference: cancellationIntent.evidenceReference })
  check(afterCancellationApply !== null, 'cancellation step applies')
  check(ecommerceOrderAmendmentShopState(afterCancellationApply, amendmentIntent) === 'stale', 'the independent amendment intent reads stale, never misread as replacement_needed for someone else\'s cancel')
  check(cancelCommerceOrder(afterCancellationApply, 'ORD-AC-2', { ...orderProof, actionId: 'ACT-AC-2-DOUBLE', evidenceReference: 'AMEND-EV-2' }) === null, 'a second cancel attempt via the amendment\'s own evidence reference is still refused')
}

// --- 2. amendment vs reschedule -------------------------------------------------
{
  const base = seedConfirmedOrder('ORD-AR-1')
  const amendmentIntent = amendmentIntentFrom(base, 'ORD-AR-1', 'AMEND-EV-3')
  const rescheduleIntent = rescheduleIntentFrom(base, 'ORD-AR-1', 'RESCHED-EV-3')
  check(ecommerceOrderAmendmentShopState(base, amendmentIntent) === 'active' && ecommerceOrderRescheduleShopState(base, rescheduleIntent) === 'active', 'both intents start active on the same order snapshot')

  const afterAmendmentCancel = cancelCommerceOrder(base, 'ORD-AR-1', { ...orderProof, actionId: 'ACT-AR-1-CANCEL', evidenceReference: 'AMEND-EV-3' })
  check(ecommerceOrderRescheduleShopState(afterAmendmentCancel, rescheduleIntent) === 'stale', 'reschedule reads stale after the amendment\'s own cancel, not replacement_needed')
  check(ecommerceOrderAmendmentShopState(afterAmendmentCancel, amendmentIntent) === 'replacement_needed', 'sanity control: the amendment itself correctly reads replacement_needed for its own evidence reference')
}

// --- 3. reschedule vs cancellation -----------------------------------------------
{
  const base = seedConfirmedOrder('ORD-RC-1')
  const rescheduleIntent = rescheduleIntentFrom(base, 'ORD-RC-1', 'RESCHED-EV-4')
  const cancellationIntent = cancellationIntentFor(base, 'ORD-RC-1')
  const afterCancellation = cancelCommerceOrder(base, 'ORD-RC-1', { ...orderProof, actionId: 'ACT-RC-1-CANCEL', evidenceReference: cancellationIntent.evidenceReference })
  check(ecommerceOrderRescheduleShopState(afterCancellation, rescheduleIntent) === 'stale', 'reschedule reads stale after an unrelated cancellation, not replacement_needed')
}

// --- 4. amendment vs correction --------------------------------------------------
// A correction can only be applied to a 'completed'+reconciled order; an amendment can
// only be built against a 'confirmed' order. The two preconditions are mutually
// exclusive on commerce-workspace.ts's one-directional status machine, so by the time a
// correction is even possible, any pending amendment for that order is already stale --
// proven directly rather than assumed.
{
  const base = seedConfirmedOrder('ORD-AX-1')
  const amendmentIntent = amendmentIntentFrom(base, 'ORD-AX-1', 'AMEND-EV-5')
  check(ecommerceOrderAmendmentShopState(base, amendmentIntent) === 'active', 'amendment starts active')

  let state = advanceCommerceOrder(base, 'ORD-AX-1', 'confirmed', { ...orderProof, actionId: 'ACT-AX-1-PREP' }, 'client')
  check(state !== null, 'advances to preparing')
  check(ecommerceOrderAmendmentShopState(state, amendmentIntent) === 'stale', 'amendment is already stale the moment the order leaves confirmed -- before any correction can exist')

  state = advanceCommerceOrder(state, 'ORD-AX-1', 'preparing', { ...orderProof, actionId: 'ACT-AX-1-READY' }, 'client')
  state = reconcileCommercePayment(state, 'ORD-AX-1', { ...orderProof, actionId: 'ACT-AX-1-RECON' })
  check(state !== null, 'payment reconciled')
  state = advanceCommerceOrder(state, 'ORD-AX-1', 'ready', { ...orderProof, actionId: 'ACT-AX-1-COMPLETE' }, 'client')
  check(state !== null && state.orders.find((o) => o.id === 'ORD-AX-1').status === 'completed', 'advances to completed')

  const expectation = commerceOrderCorrectionExpectation(state, 'ORD-AX-1')
  check(expectation !== null, 'a correction is only reachable once the order is completed and reconciled')
  const corrected = recordCommerceOrderCorrection(
    state,
    { orderId: 'ORD-AX-1', kind: 'credit', reasonCode: 'pricing_error', listedAmountMmk: 500 },
    { ...orderProof, actionId: 'ACT-AX-1-CORRECT' },
    expectation,
  )
  check(corrected !== null, 'the real correction applies')
  check(ecommerceOrderAmendmentShopState(corrected, amendmentIntent) === 'stale', 'amendment remains stale after a real correction is applied -- the correction cannot resurrect it')
}

console.log(`ecommerce order coexistence contract: ${checks} checks passed`)
