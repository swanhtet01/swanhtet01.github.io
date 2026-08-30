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
      commerceOrderAcknowledgementReader, receiveCommerceStock,
      commerceOrderHasReleasableReservation, advanceCommerceOrder, reconcileCommercePayment,
      commerceOrderCorrectionExpectation, recordCommerceOrderCorrection,
      commerceStorefrontOrderTimeline, validateCommerceState,
    } from './commerce-workspace.ts'
    export {
      ecommerceCancellationMatchesCurrentShop, buildEcommerceCancellationIntent,
      createEmptyEcommerceBuyingState, recordEcommerceOrderRequestV2, recordEcommerceCancellationIntent,
      buildEcommercePimProjection, buildEcommerceCheckoutQuote, buildEcommerceOrderRequestV2,
    } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
    export { buildStorefrontPreview, storefrontPreviewDigest } from '../products/ecommerce/storefront-model.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/order-coexistence-entry.ts',
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
})

const {
  createSeedCommerce, reserveCommerceOrder, cancelCommerceOrder, commerceOrderAcknowledgement,
  commerceOrderAcknowledgementReader, receiveCommerceStock,
  commerceOrderHasReleasableReservation, advanceCommerceOrder, reconcileCommercePayment,
  commerceOrderCorrectionExpectation, recordCommerceOrderCorrection,
  commerceStorefrontOrderTimeline, validateCommerceState,
  ecommerceCancellationMatchesCurrentShop, buildEcommerceCancellationIntent,
  createEmptyEcommerceBuyingState, recordEcommerceOrderRequestV2, recordEcommerceCancellationIntent,
  buildEcommercePimProjection, buildEcommerceCheckoutQuote, buildEcommerceOrderRequestV2,
  buildStorefrontPreview, storefrontPreviewDigest,
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

// --- 5. how many of these intents can coexist, and what one screen of them costs ---
//
// Sections 1-4 ask whether two intents on one order can corrupt each other. This one asks
// the question the buyer screen makes urgent: how MANY can exist at once, and what does
// reading them cost?
//
// The count is bounded by the buying contract itself, not by anything the screen does.
// validateEcommerceBuyingState (ecommerce-buying-lifecycle.ts) holds every collection to
// maxRecords = 100, requires every intent's sourceRequestId to name a request the buyer
// actually holds, and refuses a second cancellation, a second amendment, a second reschedule,
// two replacement workflows, or a cancellation alongside a replacement workflow on the SAME
// order. So every acknowledgement the screen's three loops ask for belongs to a distinct
// order, orders come from requests, and requests stop at 100. One hundred is the ceiling for
// all three loops together -- and amendments and reschedules each consume a second request
// slot for their replacement, so a mixed screen reaches it sooner in orders and never
// exceeds it in intents.
//
// That is not "a handful", which is why this is measured rather than waved through:
// EcommerceBuyingWorkspace's loops are not in a memo at all -- they are in the component
// body, so they re-run on every keystroke in the customer name, phone and address fields.
// Measured 2026-08-21 at this ceiling against a workspace at its own 2 MiB storage ceiling
// (2,192 orders, 2,096,352 bytes): 100 validations and 5.8 s per render as shipped, 56.8 s
// over ten renders. One reader, memoized on the workspace, is one validation and 0.07 s.
//
// The three properties below are what make that safe, and each is asserted against a fixture
// this file drives rather than one written by hand. Cost is COUNTED, not timed: a millisecond
// threshold on a shared runner stops discriminating the moment the runner gets faster.
{
  const SCOPE = 'test-scope'
  const hex8 = (n) => n.toString(16).toUpperCase().padStart(8, '0')
  let state = createSeedCommerce()
  const sellable = state.items.filter((candidate) => candidate.onHand > 2).slice(0, 3)
  check(sellable.length > 0, 'the seed carries a sellable item for the ceiling fixture')
  const item = sellable[0]
  state = receiveCommerceStock(state, item.sku, 200000, {
    actor: OPERATOR, reason: 'Stock for the ceiling fixture',
    evidenceReference: 'CEILING-RESTOCK', actionId: 'ACT-CEILING-RESTOCK',
    capturedAt: '2026-07-23T08:00:00.000Z',
  })
  check(state !== null, 'the ceiling fixture can restock, or there is nothing to sell 100 times')

  const preview = buildStorefrontPreview(state.items, {
    storeName: 'Ceiling fixture storefront',
    summary: 'One SKU, ordered until the buying contract says stop.',
    selectedSkus: sellable.map((candidate) => candidate.sku),
  })
  const pim = await buildEcommercePimProjection(SCOPE, await storefrontPreviewDigest(preview), preview)
  const CUSTOMER = { name: 'Ma Thida', phone: '09 123 456' }

  async function requestNumber(index) {
    const at = new Date(Date.parse('2026-07-24T09:00:00.000Z') + index * 3600000).toISOString()
    const quote = await buildEcommerceCheckoutQuote({
      pim,
      cart: [{ sku: item.sku, quantity: 1 }],
      customerReference: `${CUSTOMER.name} ${CUSTOMER.phone}`,
      fulfilment: 'pickup',
      paymentAdapter: 'pay_on_pickup',
      promotionCode: null,
      customerProfile: { name: CUSTOMER.name, phone: CUSTOMER.phone, previous: null },
      idempotencyKey: `ECI-${hex8(index)}-1234-4ABC-8ABC-1234567890AB`,
      quotedAt: at,
      expiresAt: new Date(Date.parse(at) + 900000).toISOString(),
    })
    return buildEcommerceOrderRequestV2(quote, { revision: 1, actionId: 'ACT-STOREFRONT-R1' })
  }

  // --- the ceiling, driven until the contract refuses --------------------------
  let buying = createEmptyEcommerceBuyingState(SCOPE)
  const requests = []
  let requestRefusal = null
  for (let index = 0; index < 110; index += 1) {
    const request = await requestNumber(index)
    try {
      buying = await recordEcommerceOrderRequestV2(buying, request, buying.headDigest)
    } catch (error) { requestRefusal = error; break }
    requests.push(request)
  }
  check(requests.length === 100, `the buying contract holds exactly 100 order requests (recorded ${requests.length})`)
  check(
    Boolean(requestRefusal) && /limit is reached/.test(requestRefusal.message),
    'and refuses the 101st outright rather than growing without bound like the Shop order list',
  )

  const ceilingOrderId = (index) => `ORD-CEIL-${String(index).padStart(3, '0')}`
  requests.forEach((request, index) => {
    const at = new Date(Date.parse('2026-07-24T10:00:00.000Z') + index * 3600000).toISOString()
    const evidenceReference = `ECOMMERCE:${request.id}:${request.sourcePreviewDigest}`
    const next = reserveCommerceOrder(state, {
      id: ceilingOrderId(index), createdAt: at, customer: CUSTOMER.name, owner: OPERATOR,
      channel: 'Ecommerce', item: item.name, itemSku: item.sku, quantity: 1, payment: 'Cash',
      paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'pickup',
      fulfilmentReference: `Ecommerce pickup ${index}`,
      promisedAt: new Date(Date.parse(at) + 3600000).toISOString(),
      total: item.price, status: 'confirmed',
      lines: [{ sku: item.sku, name: item.name, variant: item.variant, quantity: 1, unitPriceMmk: item.price }],
      sourceRecordId: request.id, evidenceReference,
    }, {
      actor: OPERATOR, reason: 'Ecommerce order accepted', evidenceReference,
      actionId: `ACT-CEILING-ORD-${index}`, capturedAt: at,
    })
    check(next !== null, `${ceilingOrderId(index)}: the Shop reserves the request`)
    state = next
  })

  const ceilingIntents = []
  let buyingWithOneIntent = null
  for (let index = 0; index < requests.length; index += 1) {
    const intent = buildEcommerceCancellationIntent({
      scope: SCOPE, commerceState: state, orderId: ceilingOrderId(index),
      reasonCode: 'changed_mind', reason: 'Customer no longer needs this order',
      idempotencyKey: `CNI-${hex8(index)}-92A2-4FE4-89E8-D3C980B0F3C5`,
      createdAt: '2026-08-20T12:00:00.000Z',
    })
    buying = await recordEcommerceCancellationIntent(buying, intent, buying.headDigest)
    ceilingIntents.push(intent)
    if (index === 0) buyingWithOneIntent = buying
  }
  check(buying.cancellationIntents.length === 100, `one screen can hold 100 pending cancellation intents (held ${buying.cancellationIntents.length})`)

  // A second cancellation on an order that already has one is refused, so 100 intents means
  // 100 DISTINCT orders -- the fact that makes the request cap the whole screen's ceiling.
  // Asked against the state that holds ONE intent, so the refusal has to come from the
  // per-order rule and cannot be the record limit answering first.
  let secondOnSameOrder = null
  try {
    await recordEcommerceCancellationIntent(buyingWithOneIntent, buildEcommerceCancellationIntent({
      scope: SCOPE, commerceState: state, orderId: ceilingOrderId(0),
      reasonCode: 'changed_mind', reason: 'Customer changed their mind again',
      idempotencyKey: 'CNI-FFFFFFFF-92A2-4FE4-89E8-D3C980B0F3C5',
      createdAt: '2026-08-20T13:00:00.000Z',
    }), buyingWithOneIntent.headDigest)
  } catch (error) { secondOnSameOrder = error }
  check(
    Boolean(secondOnSameOrder) && /one cancellation request/i.test(secondOnSameOrder.message),
    'a second cancellation on the same order is refused, so intents and orders stay one to one',
  )
  check(
    new Set(buying.cancellationIntents.map((intent) => intent.orderId)).size === buying.cancellationIntents.length,
    'sanity control: every recorded intent names a different order',
  )

  // Cancel some of them for real, so the branch the screen's loop actually reads -- an
  // acknowledgement reporting cancellation.state === 'cancelled' -- is exercised rather than
  // compared over a branch that never fires.
  const cancelledOrderIds = []
  for (const index of [0, 7, 42, 99]) {
    const intent = ceilingIntents[index]
    const next = cancelCommerceOrder(state, ceilingOrderId(index), {
      actor: OPERATOR, reason: 'Shop approved the cancellation',
      evidenceReference: intent.evidenceReference,
      actionId: `ACT-CEILING-CANCEL-${index}`, capturedAt: '2026-08-20T14:00:00.000Z',
    })
    check(next !== null, `${ceilingOrderId(index)}: the Shop applies the cancellation`)
    state = next
    cancelledOrderIds.push(ceilingOrderId(index))
  }

  // The screen's loop over its intents, in the shape EcommerceBuyingWorkspace.tsx uses:
  // one acknowledgement per intent, out of ONE reader. `read` is the only difference between
  // the two calls below, which is the whole point of comparing them.
  const timeline = state.orders.filter((order) => order.sourceRecordId)
    .map((order) => ({ request: { id: order.sourceRecordId }, order }))
  function cancellationOutcomes(read, intents) {
    return intents.reduce((outcomes, intent) => {
      const entry = timeline.find((candidate) => candidate.order?.id === intent.orderId)
      const acknowledgement = entry?.order ? read(entry.order.id) : null
      if (acknowledgement?.cancellation.state === 'cancelled'
        && acknowledgement.evidence.sourceRecordId === intent.sourceRequestId
        && acknowledgement.cancellation.evidenceReference === intent.evidenceReference) {
        outcomes.push({ intent, kind: 'cancelled', refundStatus: acknowledgement.payment.refundStatus })
      }
      return outcomes
    }, [])
  }

  // --- 5a. the outcomes did not change -----------------------------------------
  // Both paths are RUN and their results compared: the per-call entry point, which validates
  // every time, against the reader, which validates once. Nothing is written down here, so
  // there is no side for a hardcoded expectation to hide on. Asked twice and asked in
  // reverse, because the reader remembers what it built -- a cache keyed on the wrong thing
  // would hand back another order's document, and one forward pass would never notice.
  const eager = (orderId) => commerceOrderAcknowledgement(state, orderId)
  const reversed = [...buying.cancellationIntents].reverse()
  const eagerOutcomes = JSON.stringify(cancellationOutcomes(eager, buying.cancellationIntents))
  const readerOnce = commerceOrderAcknowledgementReader(state)
  check(
    JSON.stringify(cancellationOutcomes(readerOnce, buying.cancellationIntents)) === eagerOutcomes,
    'one reader produces the same cancellation outcomes as one validation per intent',
  )
  check(
    JSON.stringify(cancellationOutcomes(readerOnce, buying.cancellationIntents)) === eagerOutcomes,
    'and again from the same reader, so a remembered document is the same document',
  )
  check(
    JSON.stringify(cancellationOutcomes(readerOnce, reversed))
      === JSON.stringify(cancellationOutcomes(eager, reversed)),
    'and in reverse order, so a cache keyed on the wrong thing cannot pass unnoticed',
  )
  // Not a tautology: the expected count is read back off the WORKSPACE -- orders the Shop
  // actually cancelled -- rather than off the list this file cancelled from, and it has to be
  // more than none. Without this, a fixture that cancelled nothing would compare both paths
  // over a branch that never fires and still pass.
  const cancelledInWorkspace = state.orders.filter((order) => order.status === 'cancelled' && order.sourceRecordId).length
  check(cancelledInWorkspace > 0, 'the fixture actually reaches the cancelled branch at all')
  check(
    cancellationOutcomes(eager, buying.cancellationIntents).length === cancelledInWorkspace,
    `every cancelled order in the workspace resolves one intent (${cancelledInWorkspace} of ${buying.cancellationIntents.length})`,
  )
  check(cancelledInWorkspace === cancelledOrderIds.length, 'sanity control: the Shop cancelled exactly what this file asked it to')
  const documents = buying.cancellationIntents.map((intent) => [
    JSON.stringify(eager(intent.orderId)), JSON.stringify(readerOnce(intent.orderId)),
  ])
  check(
    documents.every(([left, right]) => left === right),
    'and every one of the 100 documents underneath is byte for byte what the per-call path builds',
  )

  // --- 5b. one screen of intents costs ONE validation ---------------------------
  // Counted through a getter on the state's own schema field: validateCommerceState reads it
  // once, first thing, and nothing else on this path touches it. Exact on any machine, with
  // no clock involved. A count of zero would mean nothing was validated at all, which is what
  // 5c exists to make loud.
  function countValidations(subject) {
    const value = subject.schema
    let reads = 0
    Object.defineProperty(subject, 'schema', { configurable: true, enumerable: true, get() { reads += 1; return value } })
    return () => reads
  }
  {
    const counted = structuredClone(state)
    const validations = countValidations(counted)
    cancellationOutcomes((orderId) => commerceOrderAcknowledgement(counted, orderId), buying.cancellationIntents)
    const perIntent = validations()
    check(
      perIntent === buying.cancellationIntents.length,
      `the per-call entry point validates the whole workspace once per intent (expected ${buying.cancellationIntents.length}, counted ${perIntent})`,
    )
    const read = commerceOrderAcknowledgementReader(counted)
    check(validations() - perIntent === 1, `the reader validates once, at construction (counted ${validations() - perIntent})`)
    cancellationOutcomes(read, buying.cancellationIntents)
    cancellationOutcomes(read, buying.cancellationIntents)
    check(
      validations() === perIntent + 1,
      `and never again, over 100 intents read twice (counted ${validations() - perIntent - 1} more)`,
    )
  }

  // --- 5c. and it still cannot come from a workspace nobody validated ------------
  // What changed is how many times the same state is checked, never whether it is.
  //
  // The corruption is a duplicated order id, chosen because the validator catches it
  // ('Order ID values must be unique.') and the acknowledgement builder genuinely does not
  // look at it -- it reaches for the order with .find() and would happily build from the
  // first match. So only the validation can be refusing this, which is the property being
  // pinned. (A first draft here deleted the reserve movements instead; the validator accepts
  // that on its own, and it only failed in this fixture because the cancelled orders left
  // releases behind. A mutation run caught it.)
  {
    const corrupted = structuredClone(state)
    corrupted.orders.push({ ...corrupted.orders[0] })
    let readerRefused = null
    try { commerceOrderAcknowledgementReader(corrupted) } catch (error) { readerRefused = error }
    check(Boolean(readerRefused), 'the reader refuses to be built over a workspace carrying a duplicated order id')
    let perCallRefused = null
    try { commerceOrderAcknowledgement(corrupted, ceilingOrderId(0)) } catch (error) { perCallRefused = error }
    check(Boolean(perCallRefused), 'and the per-call entry point refuses the same corruption, so neither route hands out an unchecked document')
  }

  // --- 5d. the OTHER reader on this screen: the storefront order timeline --------
  //
  // commerceStorefrontOrderTimeline is the second thing this screen reads out of the same
  // workspace, and it opened by deep-copying the whole thing before validating the copy:
  // validateCommerceState(structuredClone(state)). At the 2 MiB write ceiling that copy is
  // ~11 ms of the ~129 ms the call costs, paid once per workspace change -- which is once
  // per sale -- and, at the unmemoized call site in EcommerceProduct.tsx, once per keystroke.
  //
  // The copy bought nothing. validateCommerceState is a PREDICATE, not a normaliser: it
  // returns its argument by reference and leaves it byte for byte as it found it (pinned in
  // test_commerce_state_validator.mjs), so there was no mutation for the caller to be
  // defended against. Everything this function hands back is cloned individually on its way
  // out -- the order at the `structuredClone(matchingOrders[0])` line and the request at the
  // `structuredClone(request)` line -- so the copy was not what kept callers unaliased
  // either. 5d pins all of those claims at once, against the ceiling fixture above.
  //
  // Cost is COUNTED, not timed, on the same terms as 5b: a millisecond threshold stops
  // discriminating the moment the runner gets faster.
  {
    const beforeCall = JSON.stringify(state)

    // (i) how many times one call deep-copies the WHOLE workspace. Counted by identity
    // against the state object itself, so a per-order or per-request clone -- which this
    // function legitimately makes, and which is what keeps the result unaliased -- is never
    // miscounted as the whole-workspace copy. `everyClone` is the control: if the
    // interception below ever stopped seeing anything at all, a count of zero
    // whole-workspace copies would otherwise pass while proving nothing.
    const realClone = globalThis.structuredClone
    let wholeWorkspaceCopies = 0
    let everyClone = 0
    globalThis.structuredClone = function (value, ...rest) {
      everyClone += 1
      if (value === state) wholeWorkspaceCopies += 1
      return realClone.call(this, value, ...rest)
    }
    let entries
    try { entries = commerceStorefrontOrderTimeline(state, requests) }
    finally { globalThis.structuredClone = realClone }
    check(entries.length === requests.length, `the timeline projects every request on the screen (${entries.length} of ${requests.length})`)
    check(everyClone > 0, 'control: the clone counter is actually seeing this function clone things')
    check(
      wholeWorkspaceCopies === 0,
      `reading the timeline never deep-copies the whole workspace (copied it ${wholeWorkspaceCopies} times)`,
    )

    // (ii) the projection did not change. Both paths are RUN: the timeline over the state as
    // held, against the timeline over a state deep-copied first -- which is precisely what
    // the removed line used to compute. Nothing is written down, so there is no side for a
    // hardcoded expectation to hide on.
    check(
      JSON.stringify(commerceStorefrontOrderTimeline(state, requests))
        === JSON.stringify(commerceStorefrontOrderTimeline(realClone(state), requests)),
      'and projects the same timeline, byte for byte, as it does over a workspace copied first',
    )

    // (iii) reading does not write. The screen re-reads this on every workspace change, so a
    // reader that edited the workspace underneath itself would compound silently.
    check(JSON.stringify(state) === beforeCall, 'reading the timeline leaves the workspace byte for byte as it found it')

    // (iv) the caller still cannot reach into the workspace through the result. This is the
    // property the whole-workspace copy could plausibly have been holding up, so it is
    // asserted rather than argued: every order and request handed back is written through
    // and the workspace is checked for the damage.
    const held = new Set()
    for (const order of state.orders) held.add(order)
    for (const request of requests) held.add(request)
    const aliased = entries.filter((entry) => held.has(entry.order) || held.has(entry.request))
    check(aliased.length === 0, `no entry hands back an object the workspace or the request list still holds (${aliased.length} aliased)`)
    const withOrder = entries.filter((entry) => entry.order)
    check(withOrder.length > 0, 'control: the fixture produces entries that actually carry an order to alias')
    for (const entry of withOrder) entry.order.total = -1
    for (const entry of entries) entry.request.customerReference = 'OVERWRITTEN'
    check(
      JSON.stringify(state) === beforeCall,
      'and writing through every order and request the timeline returned reaches nothing in the workspace',
    )

    // (v) and it still refuses a workspace nobody validated. What changed is how many copies
    // of one state are made, never whether it is checked.
    //
    // The corruption is an order total edited away from its own calculation, chosen for two
    // reasons: the validator rejects it (asserted first, so this cannot be vacuous), and the
    // timeline itself never looks at it -- it filters orders by sourceRecordId and reads
    // status, paymentStatus, refundStatus and returns, never the total. So only the
    // validation can be refusing this. A duplicated order id would NOT do: the timeline
    // carries its own 'multiple Shop orders' check and would throw on its own, proving
    // nothing about whether the state was validated.
    const corruptedTimeline = realClone(state)
    const editable = corruptedTimeline.orders.find((order) => order.calculation && order.sourceRecordId)
    check(Boolean(editable), 'control: the ceiling fixture carries a request-linked order with a calculation to corrupt')
    editable.total += 1
    let validatorRefused = null
    try { validateCommerceState(corruptedTimeline) } catch (error) { validatorRefused = error }
    check(Boolean(validatorRefused), 'the validator rejects an order total edited away from its calculation, or (v) proves nothing')
    let timelineRefused = null
    try { commerceStorefrontOrderTimeline(corruptedTimeline, requests) } catch (error) { timelineRefused = error }
    check(Boolean(timelineRefused), 'and the timeline refuses to project from that workspace, so dropping the copy did not drop the check')
  }
}

console.log(`ecommerce order coexistence contract: ${checks} checks passed`)
