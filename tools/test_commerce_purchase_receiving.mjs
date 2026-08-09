// Contract guard for purchase orders and receiving -- stock coming IN and money owed OUT.
//
// The rule that costs real money is that you cannot receive more than was ordered. A shop
// that over-receives against a purchase order has stock it did not order and an invoice it
// cannot reconcile. Receiving also has to increase on-hand by exactly what arrived, refuse a
// receipt dated before the order existed, and treat a replayed action as the same receipt
// rather than a second delivery.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedCommerce, createCommercePurchaseOrder, receiveCommercePurchaseOrder,
      commercePurchaseOrders,
    } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/purchasing-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createSeedCommerce, createCommercePurchaseOrder, receiveCommercePurchaseOrder, commercePurchaseOrders,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const seed = createSeedCommerce()
const item = seed.items[0]
check(Boolean(item), 'the seed has a catalog item to order')

const PO_ID = 'PO-8CAC808D-92A2-4FE4-89E8-D3C980B0F3C5'
const ORDERED = 20
const CREATED_AT = '2026-07-24T09:00:00.000Z'

const proof = (actionId, capturedAt = CREATED_AT) => ({
  actionId,
  capturedAt,
  actor: 'Swan Htet',
  reason: 'Weekly replenishment from the usual supplier',
  evidenceReference: `PO-DOC-${actionId}`,
})

// --- raising the order -------------------------------------------------------
const ordered = createCommercePurchaseOrder(seed, {
  id: PO_ID,
  sku: item.sku,
  supplier: 'Yangon Parts Supply',
  quantityOrdered: ORDERED,
  unitCostMmk: 5_000,
  expectedAt: '2026-07-31T09:00:00.000Z',
}, proof('ACT-PO-1'))
check(Boolean(ordered), 'a purchase order can be raised against a catalog item')

const purchaseOrder = commercePurchaseOrders(ordered).find((entry) => entry.id === PO_ID)
check(Boolean(purchaseOrder), 'the order is recorded')
check(purchaseOrder.quantityOrdered === ORDERED, 'for the quantity requested')
check(purchaseOrder.supplier === 'Yangon Parts Supply', 'against the named supplier')
check(
  ordered.items.find((candidate) => candidate.sku === item.sku).onHand === item.onHand,
  'raising an order does NOT change stock -- nothing has arrived yet',
)

// An order whose expected date is not after it was raised makes no sense.
check(
  createCommercePurchaseOrder(seed, {
    id: PO_ID, sku: item.sku, supplier: 'Yangon Parts Supply', quantityOrdered: ORDERED,
    unitCostMmk: 5_000, expectedAt: CREATED_AT,
  }, proof('ACT-PO-BAD')) === null,
  'an order expected at or before the moment it was raised is refused',
)
check(
  createCommercePurchaseOrder(seed, {
    id: 'PO-not-a-uuid', sku: item.sku, supplier: 'Yangon Parts Supply', quantityOrdered: ORDERED,
    unitCostMmk: 5_000, expectedAt: '2026-07-31T09:00:00.000Z',
  }, proof('ACT-PO-BAD2')) === null,
  'a non-canonical purchase order id is refused',
)

// --- receiving ---------------------------------------------------------------
const RECEIVE_AT = '2026-07-25T09:00:00.000Z'
const partial = receiveCommercePurchaseOrder(ordered, PO_ID, 8, proof('ACT-RCV-1', RECEIVE_AT))
check(Boolean(partial), 'a partial delivery can be received')
check(
  partial.items.find((candidate) => candidate.sku === item.sku).onHand === item.onHand + 8,
  'on-hand increases by exactly what arrived',
)

// --- you cannot receive more than was ordered --------------------------------
// 8 of 20 are in, so 12 remain. Asking for 13 must be refused.
check(
  receiveCommercePurchaseOrder(partial, PO_ID, 13, proof('ACT-RCV-OVER', RECEIVE_AT)) === null,
  'receiving more than the outstanding quantity is refused',
)
check(
  Boolean(receiveCommercePurchaseOrder(partial, PO_ID, 12, proof('ACT-RCV-EXACT', RECEIVE_AT))),
  'receiving exactly the remaining quantity is allowed',
)
check(
  receiveCommercePurchaseOrder(ordered, PO_ID, ORDERED + 1, proof('ACT-RCV-OVER2', RECEIVE_AT)) === null,
  'and a single delivery larger than the whole order is refused outright',
)

for (const bad of [0, -1, 1.5]) {
  check(
    receiveCommercePurchaseOrder(ordered, PO_ID, bad, proof(`ACT-RCV-${bad}`, RECEIVE_AT)) === null,
    `a delivery of ${bad} units is refused`,
  )
}

// --- a receipt cannot predate the order --------------------------------------
check(
  receiveCommercePurchaseOrder(ordered, PO_ID, 5, proof('ACT-RCV-EARLY', '2026-07-23T09:00:00.000Z')) === null,
  'a delivery dated before the purchase order existed is refused',
)

// --- replay is the same receipt, not a second delivery -----------------------
const replayed = receiveCommercePurchaseOrder(partial, PO_ID, 8, proof('ACT-RCV-1', RECEIVE_AT))
check(Boolean(replayed), 'replaying the identical receipt is accepted rather than erroring')
check(
  replayed.items.find((candidate) => candidate.sku === item.sku).onHand
    === partial.items.find((candidate) => candidate.sku === item.sku).onHand,
  'and does NOT add the stock a second time -- a retried click is not a second delivery',
)

// The same action id used for a different quantity is a different event, and refused.
check(
  receiveCommercePurchaseOrder(partial, PO_ID, 3, proof('ACT-RCV-1', RECEIVE_AT)) === null,
  'reusing that action id for a different quantity is refused',
)

// --- unknown orders and malformed proofs -------------------------------------
check(
  receiveCommercePurchaseOrder(ordered, 'PO-1D2E3F40-5A6B-4C7D-8E9F-A0B1C2D3E4F5', 5, proof('ACT-RCV-UNKNOWN', RECEIVE_AT)) === null,
  'receiving against a purchase order that does not exist is refused',
)
check(
  receiveCommercePurchaseOrder(ordered, PO_ID, 5, { ...proof('ACT-RCV-X', RECEIVE_AT), actor: '' }) === null,
  'a receipt with no named operator is refused',
)

// --- layered guards, noted so the count is not over-read ---------------------
// Two of the three source guards these checks name are defended twice, so deleting either
// alone leaves this file green. Verified by running the mutated code, not inferred:
//
//   over-receiving  -- also caught by validateCommerceState
//                      ("movements[1] exceeds its purchase order quantity")
//   receipt predating the order -- also caught by validateCommerceState
//                      ("movements[0] does not match its purchase order")
//   expectedAt <= createdAt -- the createCommercePurchaseOrder check can be removed and the
//                      order is STILL refused, at or before createdAt, by state validation.
//
// The behaviour is correct in every case and these tests assert behaviour, so they pass
// either way. What they do not do is prove any single one of those clauses is load-bearing.

console.log(`commerce purchasing contract: ${checks} checks passed`)
