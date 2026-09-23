// Contract guard for a Shop order's integrity, on both sides of the record.
//
// WRITE -- reserveCommerceOrder, the boundary every Shop sale crosses.
//
// The counter UI computes a display total (CoreApp.tsx sums price x quantity), but
// that number is provisional. reserveCommerceOrder recomputes the calculation from
// the live catalog and overwrites order.total with it, and refuses the order outright
// if any supplied line price does not match the catalog.
//
// That is the property that keeps a shop's books honest: the stored total is derived
// from catalog prices at write time, never accepted from the caller. It had no test.
//
// READ -- commerceOrderAcknowledgement, the sealed document that order becomes. Its integrity
// rests on the same validator the write side does: a shop must never be handed a document
// derived from a workspace nobody checked. The last section of this file pins that the
// document is unchanged, that it still cannot be produced from an unvalidated state, and how
// many times one state is validated to produce a screen full of them.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedCommerce, reserveCommerceOrder, reconcileCommercePayment, advanceCommerceOrder,
      cancelCommerceOrder, receiveCommerceStock, validateCommerceState,
      commerceOrderAcknowledgement, commerceOrderAcknowledgementReader,
    } from './commerce-workspace.ts'
    export {
      commerceOrderDraftResetEpoch, readCommerceOrderDraft, saveCommerceOrderDraft,
      discardCommerceOrderDraft, resetCommerceOrderDraftRecovery, commerceOrderDraftStorageKey,
    } from './commerce-order-draft.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/order-integrity-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createSeedCommerce, reserveCommerceOrder, reconcileCommercePayment, advanceCommerceOrder,
  cancelCommerceOrder, receiveCommerceStock, validateCommerceState,
  commerceOrderAcknowledgement, commerceOrderAcknowledgementReader,
  commerceOrderDraftResetEpoch, readCommerceOrderDraft, saveCommerceOrderDraft,
  discardCommerceOrderDraft, resetCommerceOrderDraftRecovery, commerceOrderDraftStorageKey,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Swan Htet'
const CAPTURED_AT = '2026-07-23T09:00:00.000Z'
const proof = {
  actor: OPERATOR,
  reason: 'Walk-in counter sale',
  evidenceReference: 'COUNTER-0001',
  actionId: 'ACT-ORDER-1',
  commandId: 'CMD-ORDER-1',
  capturedAt: CAPTURED_AT,
}

const state = createSeedCommerce()
const item = state.items.find((candidate) => candidate.onHand > 2)
assert.ok(item, 'the seed must contain a sellable item for this test to mean anything')

const orderFor = (lines, overrides = {}) => ({
  id: 'ORD-TEST-1',
  createdAt: CAPTURED_AT,
  customer: 'Guest',
  owner: OPERATOR,
  channel: 'Counter',
  item: lines[0].name,
  ...(lines.length === 1 ? { itemSku: lines[0].sku } : {}),
  quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  payment: 'Cash',
  paymentStatus: 'pending',
  refundStatus: 'none',
  fulfilment: 'pickup',
  fulfilmentReference: 'Counter handoff #1',
  promisedAt: '2026-07-23T10:00:00.000Z',
  total: lines.reduce((sum, line) => sum + line.unitPriceMmk * line.quantity, 0),
  status: 'confirmed',
  lines,
  ...overrides,
})

const honestLines = [{ sku: item.sku, name: item.name, variant: item.variant, quantity: 2, unitPriceMmk: item.price }]

// --- the happy path must actually work ---------------------------------------
// Without this the rejection tests below would pass against a function that
// refuses everything, which would prove nothing.
const accepted = reserveCommerceOrder(state, orderFor(honestLines), proof)
check(accepted !== null, 'an honest counter sale at catalog prices is accepted')
const stored = accepted.orders.find((candidate) => candidate.id === 'ORD-TEST-1')
check(Boolean(stored), 'the accepted order is persisted')
check(stored.total === item.price * 2, 'the stored total is the catalog price times quantity')
check(Boolean(stored.calculation), 'the stored order carries its calculation, so the daily close can verify it')
check(stored.calculation.totalMmk === stored.total, 'the stored total and its calculation agree')

// --- the caller does not get to name the price -------------------------------
// A tampered or stale client that claims a lower unit price must be refused
// outright, not silently repriced and not accepted at the claimed number.
const underpriced = reserveCommerceOrder(
  state,
  orderFor([{ ...honestLines[0], unitPriceMmk: 1 }]),
  proof,
)
check(underpriced === null, 'a line priced below the catalog is refused, not repriced and not accepted')

const overpriced = reserveCommerceOrder(
  state,
  orderFor([{ ...honestLines[0], unitPriceMmk: item.price + 1 }]),
  proof,
)
check(overpriced === null, 'a line priced above the catalog is refused too -- the catalog is the only source of price')

// --- a lying total is refused ------------------------------------------------
const lyingTotal = reserveCommerceOrder(state, orderFor(honestLines, { total: 1 }), proof)
check(lyingTotal === null, 'a caller-supplied total that disagrees with its own lines is refused')

// --- the stored total is RECOMPUTED, not copied ------------------------------
// A recompute and a copy are indistinguishable while the two agree, and with no tax
// configured they always agree. Exclusive tax is what separates them: the caller
// supplies the pre-tax line sum as order.total, and the stored total must come out
// higher. Without this case, an implementation that simply copied order.total would
// pass every other check in this file.
const taxed = createSeedCommerce()
taxed.taxConfigurations = [{
  revision: 1,
  code: 'CT',
  label: 'Commercial tax',
  rateBasisPoints: 500,
  mode: 'exclusive',
  jurisdictionCode: 'MM',
  effectiveFrom: '2020-01-01T00:00:00.000Z',
  // Exactly these five keys: the state validator uses hasExactKeys, so an extra field
  // (commandId, say) makes the whole configuration invalid and pauses writes.
  proof: {
    actionId: 'ACT-TAX-1',
    capturedAt: '2020-01-01T00:00:00.000Z',
    actor: OPERATOR,
    reason: 'Configure commercial tax for counter sales',
    evidenceReference: 'TAX-SETUP-0001',
  },
}]
const taxedItem = taxed.items.find((candidate) => candidate.sku === item.sku)
const taxedLines = [{ sku: taxedItem.sku, name: taxedItem.name, variant: taxedItem.variant, quantity: 2, unitPriceMmk: taxedItem.price }]
const listed = taxedItem.price * 2
const expectedTax = Math.floor((listed * 500) / 10_000 + 0.5)

const taxedResult = reserveCommerceOrder(taxed, orderFor(taxedLines), proof)
check(taxedResult !== null, 'a counter sale is still accepted once a tax schedule is configured')
const taxedOrder = taxedResult.orders.find((candidate) => candidate.id === 'ORD-TEST-1')
check(
  taxedOrder.total === listed + expectedTax,
  `the stored total is recomputed to include tax (expected ${listed + expectedTax}, got ${taxedOrder.total})`,
)
check(taxedOrder.total !== listed, 'and it differs from the pre-tax total the caller supplied, which is what proves a recompute')
check(taxedOrder.calculation.taxMmk === expectedTax, 'the recorded tax amount is the configured rate applied to the catalog price')

// --- stock is not oversold ---------------------------------------------------
const oversold = reserveCommerceOrder(
  state,
  orderFor([{ ...honestLines[0], quantity: item.onHand + 1 }]),
  proof,
)
check(oversold === null, 'an order for more units than are on hand is refused')

// --- an unknown SKU cannot be invented ---------------------------------------
const unknownSku = reserveCommerceOrder(
  state,
  orderFor([{ ...honestLines[0], sku: 'SM-NOT-A-REAL-SKU' }]),
  proof,
)
check(unknownSku === null, 'a line for a SKU that is not in the catalog is refused')

// --- the operator on the order must be the one who signed the action ---------
const wrongOwner = reserveCommerceOrder(state, orderFor(honestLines, { owner: 'Someone Else' }), proof)
check(wrongOwner === null, 'an order attributed to someone other than the acting operator is refused')

// --- reserving does not mutate the state it was given ------------------------
const onHandBefore = item.onHand
reserveCommerceOrder(state, orderFor(honestLines), proof)
const itemAfter = state.items.find((candidate) => candidate.sku === item.sku)
check(itemAfter.onHand === onHandBefore, 'reserving returns a new state rather than mutating the caller\'s')

// --- the one-review settle composition (design phase 2 item 1) ---------------
// "Paid & handed over" composes reconcileCommercePayment + three
// advanceCommerceOrder steps inside ONE transition so the everyday cash sale is
// a single atomic write. The contract this pins: the composition reaches
// completed+reconciled through the SAME individual transitions (nothing skips
// the lifecycle), each inner step must carry its own unique actionId (the
// attribution ledger refuses reuse), and composing never mutates the input.
const settleBase = reserveCommerceOrder(createSeedCommerce(), orderFor(honestLines), proof)
check(settleBase !== null, 'settle composition test starts from an accepted counter order')

function composeSettle(startState, baseProof) {
  let composed = reconcileCommercePayment(startState, 'ORD-TEST-1', baseProof)
  if (!composed) return null
  for (let step = 0; step < 3; step += 1) {
    const live = composed.orders.find((candidate) => candidate.id === 'ORD-TEST-1')
    if (!live || live.status === 'cancelled') return null
    if (live.status === 'completed') return composed
    const advanced = advanceCommerceOrder(
      composed,
      'ORD-TEST-1',
      live.status,
      { ...baseProof, actionId: `${baseProof.actionId}:advance-${live.status}` },
      'client',
    )
    if (!advanced) return null
    composed = advanced
  }
  const settled = composed.orders.find((candidate) => candidate.id === 'ORD-TEST-1')
  return settled?.status === 'completed' ? composed : null
}

// Exactly the five canonical proof keys, matching what commerceActionProof
// produces in the app — the stored completion record is hasExactKeys-validated,
// so a stray commandId would invalidate the whole composed state.
const settleProof = { actionId: 'ACT-SETTLE-1', capturedAt: CAPTURED_AT, actor: OPERATOR, reason: 'Cash received and the customer took the order.', evidenceReference: 'COUNTER-0001' }
const settled = composeSettle(settleBase, settleProof)
check(settled !== null, 'the composed settle reaches a valid state')
const settledOrder = settled.orders.find((candidate) => candidate.id === 'ORD-TEST-1')
check(settledOrder.status === 'completed', 'the composed settle completes the order')
check(settledOrder.paymentStatus === 'reconciled', 'and reconciles its payment')
check(settledOrder.paymentReconciliationActionId === 'ACT-SETTLE-1', 'payment reconciliation is attributed to the base action')

// Derived actionIds are REQUIRED, not decorative: reusing the base id for the
// first advance must be refused by the attribution ledger, failing the whole
// composition closed rather than recording two transitions under one id.
const reusedId = (() => {
  const reconciled = reconcileCommercePayment(settleBase, 'ORD-TEST-1', settleProof)
  if (!reconciled) return 'reconcile-failed'
  return advanceCommerceOrder(reconciled, 'ORD-TEST-1', 'confirmed', settleProof, 'client')
})()
check(reusedId === null, 'reusing one actionId across composed transitions is refused — each step stays individually attributable')

// Composing returns new states; the accepted-order snapshot it started from is untouched.
const baseOrderAfter = settleBase.orders.find((candidate) => candidate.id === 'ORD-TEST-1')
check(baseOrderAfter.status === 'confirmed' && baseOrderAfter.paymentStatus === 'pending', 'the composition does not mutate the state it was given')

// --- direct counter review: default completion versus explicit open order ----
// The counter now creates and settles a routine walk-in inside one local recovery
// intent. This mirrors the exact branch in CoreApp: reserve uses the reviewed action
// id, payment and fulfilment use derived ids, while the opt-in pay-later branch stops
// immediately after reserve. Both begin from the same untouched workspace fixture.
function composeCounterReview(startState, outcome, reviewedOrder, baseProof) {
  let composed = reserveCommerceOrder(startState, reviewedOrder, baseProof)
  if (!composed || outcome === 'open_order') return composed
  composed = reconcileCommercePayment(composed, reviewedOrder.id, { ...baseProof, actionId: `${baseProof.actionId}:payment` })
  if (!composed) return null
  for (let step = 0; step < 3; step += 1) {
    const live = composed.orders.find((candidate) => candidate.id === reviewedOrder.id)
    if (!live || live.status === 'cancelled') return null
    if (live.status === 'completed') break
    const advanced = advanceCommerceOrder(
      composed,
      reviewedOrder.id,
      live.status,
      { ...baseProof, actionId: `${baseProof.actionId}:advance-${live.status}` },
      'client',
    )
    if (!advanced) return null
    composed = advanced
  }
  const completed = composed.orders.find((candidate) => candidate.id === reviewedOrder.id)
  return completed?.status === 'completed' && completed.paymentStatus === 'reconciled' ? composed : null
}

const counterStart = createSeedCommerce()
const counterItem = counterStart.items.find((candidate) => candidate.onHand > 0)
assert.ok(counterItem, 'direct counter review needs one sellable catalog item')
const counterLines = [{ sku: counterItem.sku, name: counterItem.name, variant: counterItem.variant, quantity: 1, unitPriceMmk: counterItem.price }]
const counterOrder = orderFor(counterLines, { id: 'ORD-DIRECT-1', fulfilmentReference: 'Counter ORD-DIRECT-1' })
const counterProof = { ...settleProof, actionId: 'ACT-DIRECT-1', evidenceReference: 'Counter order DIRECT-1' }

const openCounter = composeCounterReview(counterStart, 'open_order', counterOrder, counterProof)
check(openCounter !== null, 'explicit open-order counter review is accepted')
const openCounterOrder = openCounter.orders.find((candidate) => candidate.id === counterOrder.id)
check(openCounterOrder.status === 'confirmed' && openCounterOrder.paymentStatus === 'pending', 'open-order review stops at reserved and payment-pending')
check(openCounterOrder.paymentReconciliationActionId === undefined, 'open-order review records no payment proof')

const paidCounter = composeCounterReview(counterStart, 'paid_handoff', counterOrder, counterProof)
check(paidCounter !== null, 'default paid-and-handoff counter review is accepted')
const paidCounterOrder = paidCounter.orders.find((candidate) => candidate.id === counterOrder.id)
check(paidCounterOrder.status === 'completed' && paidCounterOrder.paymentStatus === 'reconciled', 'default counter review reaches completed and reconciled')
check(paidCounterOrder.paymentReconciliationActionId === 'ACT-DIRECT-1:payment', 'direct counter payment has its own derived proof id')
check(paidCounterOrder.completion?.actionId === 'ACT-DIRECT-1:advance-ready', 'direct counter handoff completion has its own derived proof id')
check(Boolean(commerceOrderAcknowledgement(paidCounter, counterOrder.id)), 'completed direct counter review produces a sealed receipt')
check(counterStart.orders.every((candidate) => candidate.id !== counterOrder.id), 'neither direct counter outcome mutates the starting workspace')

// --- READ: the sealed document, and how many times a workspace is checked to make one ----
//
// commerceOrderAcknowledgement validated the ENTIRE workspace once per order. The Shop screen
// holds one acknowledgement per order and rebuilds them from a state that is a new object
// after every sale, so a till at the byte ceiling paid that validation 1,262 times after every
// sale: about 50 seconds, of which 97% was the repeated validation (measured 2026-08-21 on a
// workspace driven to its enforced 2 MiB ceiling through these same transitions).
//
// The fix is not to validate less. It is to validate one state ONCE and read many documents
// out of it, which is what commerceOrderAcknowledgementReader does, and which is only sound
// because validateCommerceState is a predicate rather than a normaliser -- pinned next door in
// test_commerce_state_validator.mjs. Three properties have to hold together, and each is
// asserted here against transitions this file drove rather than against a fixture written by
// hand:
//
//   1. the document did not change;
//   2. it still cannot be produced from a state nobody validated; and
//   3. one screenful of documents costs ONE validation, not one per document.
//
// (3) is counted, not timed. A millisecond threshold on a shared CI runner is a guard that
// cries wolf; a count of how many times the validator was entered is exact on any machine.

const ACK_PROOF = {
  actor: OPERATOR,
  reason: 'Acknowledgement fixture',
  evidenceReference: 'ACK-EV-0001',
  actionId: 'ACT-ACK-BASE',
  capturedAt: '2026-07-23T09:05:00.000Z',
}
const ackProof = (label, minute) => ({
  ...ACK_PROOF,
  actionId: `ACT-ACK-${label}`,
  evidenceReference: `ACK-EV-${label}`,
  capturedAt: `2026-07-23T09:${String(minute).padStart(2, '0')}:00.000Z`,
})

// Every branch the acknowledgement builder has: an order at each open stage, a completed and
// reconciled one, and a cancelled one (the only branch that reads release movements and the
// only one that can report a cancellation state). A fixture of completed orders alone would
// compare the two paths across half the code.
let ackState = createSeedCommerce()
const ackItem = ackState.items.find((candidate) => candidate.onHand > 2)
ackState = receiveCommerceStock(ackState, ackItem.sku, 60, ackProof('RESTOCK', 1))
check(Boolean(ackState), 'the acknowledgement fixture can restock, or there is nothing to sell')
const ACK_SHAPES = ['confirmed', 'preparing', 'ready', 'completed', 'cancelled']
const ackOrderIds = []
for (let index = 0; index < 15; index += 1) {
  const id = `ORD-ACK-${index}`
  const minute = 10 + index
  const shape = ACK_SHAPES[index % ACK_SHAPES.length]
  let next = reserveCommerceOrder(ackState, {
    ...orderFor([{ sku: ackItem.sku, name: ackItem.name, variant: ackItem.variant, quantity: 1 + (index % 3), unitPriceMmk: ackItem.price }]),
    id,
    createdAt: `2026-07-23T09:${String(minute).padStart(2, '0')}:00.000Z`,
    customer: index % 2 ? 'Ma Thida' : 'Guest',
    payment: index % 2 ? 'KBZPay' : 'Cash',
    fulfilmentReference: `Counter handoff ${id}`,
    promisedAt: `2026-07-23T1${index % 5}:30:00.000Z`,
  }, ackProof(`RESERVE-${index}`, minute))
  check(Boolean(next), `${id}: the fixture sale reserves`)
  if (shape === 'preparing' || shape === 'ready' || shape === 'completed') {
    next = advanceCommerceOrder(next, id, 'confirmed', ackProof(`PREP-${index}`, minute))
  }
  if (shape === 'ready' || shape === 'completed') {
    next = advanceCommerceOrder(next, id, 'preparing', ackProof(`READY-${index}`, minute))
  }
  if (shape === 'completed') {
    next = reconcileCommercePayment(next, id, ackProof(`RECON-${index}`, minute))
    next = advanceCommerceOrder(next, id, 'ready', ackProof(`DONE-${index}`, minute))
  }
  if (shape === 'cancelled') {
    next = cancelCommerceOrder(next, id, ackProof(`CANCEL-${index}`, minute))
  }
  check(Boolean(next), `${id}: the fixture sale reaches ${shape}`)
  ackState = next
  ackOrderIds.push(id)
}
const ackAllIds = ackState.orders.map((order) => order.id)
check(Boolean(validateCommerceState(ackState)), 'the driven acknowledgement fixture is itself a valid workspace')

// The fixture must actually exercise the branches, or (1) below compares two paths over one.
const ackShapesPresent = new Set(ackState.orders
  .filter((order) => ackOrderIds.includes(order.id))
  .map((order) => order.status))
check(ackShapesPresent.has('cancelled'), 'the fixture carries a cancelled order -- the only branch that reads release movements')
check(ackShapesPresent.has('completed'), 'and a completed one')
check(ackShapesPresent.size >= 4, `the fixture carries at least four order shapes (has: ${[...ackShapesPresent].sort().join(', ')})`)

// --- 1. the document did not change ------------------------------------------
// Both paths are RUN and their output compared: the single-order entry point, which validates
// on every call, against the reader, which validates once. Nothing here is written down, so
// there is no side for a mistake to hide on.
//
// Asked twice, and asked in reverse, because the reader remembers what it built: a cache keyed
// on the wrong thing would hand back another order's document, and a fixture that asked once
// in list order would never notice.
const ackEager = new Map(ackAllIds.map((id) => [id, JSON.stringify(commerceOrderAcknowledgement(ackState, id) ?? null)]))
const ackReadOnce = commerceOrderAcknowledgementReader(ackState)
const ackShuffled = [...ackAllIds].reverse()
const ackLazy = new Map(ackShuffled.map((id) => [id, JSON.stringify(ackReadOnce(id) ?? null)]))
const ackLazyAgain = new Map(ackAllIds.map((id) => [id, JSON.stringify(ackReadOnce(id) ?? null)]))
const ackProduced = ackAllIds.filter((id) => ackEager.get(id) !== 'null')
check(ackProduced.length >= 10, `the fixture produces enough acknowledgements to compare (produced ${ackProduced.length} from ${ackAllIds.length} orders)`)
const ackDiverged = ackAllIds.filter((id) => ackLazy.get(id) !== ackEager.get(id) || ackLazyAgain.get(id) !== ackEager.get(id))
check(
  ackDiverged.length === 0,
  `every acknowledgement is byte-identical whether the workspace was validated once or once per order (diverged: ${ackDiverged.join(', ')})`,
)
// The digest is the document's own seal over its own projection, so an artifact that changed
// anywhere changes here too. Compared in order, so a reader handing back the right documents
// against the wrong ids fails.
check(
  JSON.stringify(ackProduced.map((id) => JSON.parse(ackLazy.get(id)).digest))
    === JSON.stringify(ackProduced.map((id) => JSON.parse(ackEager.get(id)).digest)),
  'and carries the same seal, against the same order, as the document the per-order path produced',
)
// An order the state does not hold is absent, not an error: the screen asks for whatever it is
// rendering and expects nothing back for an order that cannot produce a document.
check(ackReadOnce('ORD-NOT-IN-THIS-WORKSPACE') === null, 'the reader returns nothing for an order the validated state does not hold')

// --- 2. it cannot be produced from a state nobody validated -------------------
// Each corruption below is one the VALIDATOR catches and the acknowledgement builder does not
// look at -- an order total edited away from its own calculation is copied nowhere into the
// document, so a builder reading a state directly would seal and hand over a document for a
// workspace whose books do not add up. Both ways in must refuse, and the reader must refuse at
// construction, so there is no reader to ask in the first place.
function refusesUnvalidated(mutate, label) {
  const corrupted = structuredClone(ackState)
  mutate(corrupted)
  checks += 1
  assert.throws(() => validateCommerceState(corrupted), undefined, `${label}: the validator must reject this, or the case proves nothing`)
  const target = corrupted.orders.find((order) => order.status === 'completed') ?? corrupted.orders[0]
  checks += 1
  assert.throws(
    () => commerceOrderAcknowledgement(corrupted, target.id),
    undefined,
    `${label}: an acknowledgement was produced from a state the validator rejects`,
  )
  checks += 1
  assert.throws(
    () => commerceOrderAcknowledgementReader(corrupted),
    undefined,
    `${label}: a reader was handed out for a state the validator rejects`,
  )
}
refusesUnvalidated(
  (state) => { state.orders.find((candidate) => candidate.calculation).total += 1 },
  'an order total edited away from its calculation',
)
refusesUnvalidated(
  (state) => { state.orders.push({ ...state.orders[0] }) },
  'a duplicated order id',
)
refusesUnvalidated(
  (state) => { state.movements = state.movements.filter((movement) => movement.kind !== 'reserve') },
  'a workspace whose reservations have been deleted from under its orders',
)
refusesUnvalidated(
  (state) => { state.schema = 'supermega.commerce.workspace.v1' },
  'a workspace on a schema this build does not understand',
)

// --- 3. one screenful costs one validation ------------------------------------
// Counted by giving the state's own `schema` field a getter. validateCommerceState reads it
// once, first thing, before it can reject anything, and nothing else on the read path touches
// it -- so this counts entries into the validator exactly, on any machine, with no clock
// involved. A count of zero would mean the validator was never entered at all, which is the
// failure the second assertion below exists to make loud.
function countValidations(subject) {
  const value = subject.schema
  let reads = 0
  Object.defineProperty(subject, 'schema', { configurable: true, enumerable: true, get() { reads += 1; return value } })
  return () => reads
}
{
  const counted = structuredClone(ackState)
  const validations = countValidations(counted)
  ackAllIds.forEach((id) => commerceOrderAcknowledgement(counted, id))
  const perOrder = validations()
  check(
    perOrder === ackAllIds.length,
    `the single-order entry point validates the whole workspace once per order (expected ${ackAllIds.length}, counted ${perOrder})`,
  )
  const readAll = commerceOrderAcknowledgementReader(counted)
  const atConstruction = validations() - perOrder
  check(atConstruction === 1, `the reader validates once, at construction (counted ${atConstruction})`)
  ackAllIds.forEach((id) => readAll(id))
  check(
    validations() === perOrder + 1,
    `and never again, however many documents are read out of it (counted ${validations() - perOrder - 1} more over ${ackAllIds.length} orders)`,
  )
}

// --- RECOVERY: two-tab order drafts fail closed -------------------------------
//
// The pilot asks an operator to start an order, reload, retry, and sometimes keep another
// screen open while the counter is in use. That is not the same boundary as the final order
// write above: this one protects the unfinished order before it becomes a sale. Two properties
// matter for the day-one till:
//
//   1. a stale tab cannot overwrite a newer draft or discard it; and
//   2. an explicit recovery reset makes old screens stop writing until they reload.
//
// The test uses one shared storage map and one lock manager, which is the same origin/profile
// sharing model localStorage and Web Locks give two browser tabs.
class DraftMemoryStorage {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed))
  }
  get length() { return this.map.size }
  key(index) { return [...this.map.keys()][index] ?? null }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null }
  setItem(key, value) { this.map.set(key, String(value)) }
  removeItem(key) { this.map.delete(key) }
}

const recordingLocks = () => {
  const calls = []
  return {
    calls,
    async request(name, options, callback) {
      calls.push({ name, options })
      return callback()
    },
  }
}

async function rejectsAsync(action, pattern, label) {
  checks += 1
  await assert.rejects(action, pattern, label)
}

const draftInput = (customer, quantity = 1) => ({
  customer,
  channel: 'Walk-in',
  payment: 'Cash',
  fulfilment: 'pickup',
  fulfilmentReference: `Counter handoff for ${customer}`,
  promisedAt: '2026-07-23T10:30:00.000Z',
  paymentTermsDays: 0,
  lines: [{
    sku: item.sku,
    quantity,
    unitPriceMmk: item.price,
    availableAtSave: item.onHand,
  }],
})

{
  const storage = new DraftMemoryStorage()
  const locks = recordingLocks()
  const scope = 'local'
  const initialEpoch = commerceOrderDraftResetEpoch(storage)
  check(initialEpoch === 0, 'new Shop draft recovery storage starts at reset epoch zero')

  const first = await saveCommerceOrderDraft(draftInput('First tab customer'), 0, scope, {
    storage,
    locks,
    now: () => '2026-07-23T09:10:00.000Z',
    expectedResetEpoch: initialEpoch,
  })
  check(first.revision === 1, 'first tab saves the initial unfinished order at revision one')
  const tabA = readCommerceOrderDraft(scope, storage)
  check(tabA.status === 'ready' && tabA.draft?.revision === 1, 'tab A reads a recoverable draft before another tab edits it')

  const second = await saveCommerceOrderDraft(draftInput('Second tab customer', 2), 1, scope, {
    storage,
    locks,
    now: () => '2026-07-23T09:11:00.000Z',
    expectedResetEpoch: initialEpoch,
  })
  check(second.revision === 2, 'tab B can advance the shared unfinished order to revision two')

  await rejectsAsync(
    () => saveCommerceOrderDraft(draftInput('Stale tab customer', 3), tabA.draft.revision, scope, {
      storage,
      locks,
      now: () => '2026-07-23T09:12:00.000Z',
      expectedResetEpoch: initialEpoch,
    }),
    /changed in another tab/,
    'a stale tab cannot overwrite the newer order draft',
  )
  const afterStaleSave = readCommerceOrderDraft(scope, storage)
  check(
    afterStaleSave.status === 'ready'
      && afterStaleSave.draft?.revision === 2
      && afterStaleSave.draft.customer === 'Second tab customer',
    'the newer order draft survives the stale save attempt unchanged',
  )

  const retry = await saveCommerceOrderDraft(draftInput('Second tab customer', 2), 2, scope, {
    storage,
    locks,
    now: () => '2026-07-23T09:13:00.000Z',
    expectedResetEpoch: initialEpoch,
  })
  check(retry.revision === 2 && retry.savedAt === second.savedAt, 'retrying the same unfinished order is idempotent and does not advance revision')

  await rejectsAsync(
    () => discardCommerceOrderDraft(scope, tabA.draft.revision, { storage, locks, expectedResetEpoch: initialEpoch }),
    /changed in another tab/,
    'a stale tab cannot discard a newer order draft',
  )
  check(readCommerceOrderDraft(scope, storage).status === 'ready', 'the newer order draft remains recoverable after the stale discard attempt')

  const resetEpoch = await resetCommerceOrderDraftRecovery({ storage, locks })
  check(resetEpoch === initialEpoch + 1, 'explicit local reset advances the recovery epoch')
  check(readCommerceOrderDraft(scope, storage).status === 'empty', 'explicit local reset removes unfinished Shop order drafts')
  await rejectsAsync(
    () => saveCommerceOrderDraft(draftInput('Old screen after reset'), 0, scope, {
      storage,
      locks,
      now: () => '2026-07-23T09:14:00.000Z',
      expectedResetEpoch: initialEpoch,
    }),
    /reset while this order was open/,
    'an old screen cannot save after local recovery was reset',
  )

  const lockNames = locks.calls.map((call) => call.name)
  check(lockNames.includes('supermega:shop:order-draft:reset'), 'draft writes use the shared reset lock')
  check(
    lockNames.includes(`supermega:shop:order-draft:${encodeURIComponent(scope)}`),
    'draft writes use the scope-specific order lock',
  )
  check(
    storage.getItem(commerceOrderDraftStorageKey(scope)) === null,
    'the tested storage key is empty after reset and stale write refusal',
  )
}

console.log(`commerce order integrity contract: ${checks} checks passed`)
