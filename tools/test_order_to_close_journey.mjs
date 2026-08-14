// Composition guard: an order completed today must appear in today's close.
//
// The daily-close guard uses the order the SEED already contains. That proves the close
// rules, but not that an order the product just produced is eligible for one. The two have
// separate conditions -- the lifecycle decides what "completed and reconciled" means, the
// close decides what it will count -- and if they drift, a shop finishes a sale and the
// takings quietly never reach the books.
//
// Nothing would fail. The close would simply report a smaller number.
//
// So this reserves an order, drives it to completed and reconciled through product
// functions only, and then asserts the close both COUNTS it and counts it at the right
// amount.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedCommerce, reserveCommerceOrder, advanceCommerceOrder, reconcileCommercePayment,
      commerceCloseExpectation, saveCommerceClose, commerceDailyCloseExport, commerceOrderAdjustedTotal,
    } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/close-journey-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createSeedCommerce, reserveCommerceOrder, advanceCommerceOrder, reconcileCommercePayment,
  commerceCloseExpectation, saveCommerceClose, commerceDailyCloseExport, commerceOrderAdjustedTotal,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Swan Htet'
const ORDER_ID = 'ORD-CLOSE-JOURNEY-1'
const at = (hour) => `2026-07-24T${String(hour).padStart(2, '0')}:00:00.000Z`
const proof = (suffix, hour) => ({
  actionId: `ACT-CLOSEJ-${suffix}`,
  capturedAt: at(hour),
  actor: OPERATOR,
  reason: `Close journey step ${suffix}`,
  evidenceReference: `CLOSEJ-${suffix}`,
})

const seed = createSeedCommerce()
const item = seed.items.find((candidate) => candidate.onHand > 3)
const QUANTITY = 2
const orderOf = (state) => state.orders.find((candidate) => candidate.id === ORDER_ID)

// What the close would cover BEFORE this sale exists, so the delta is attributable.
const before = commerceCloseExpectation(seed, at(14))
check(Boolean(before), 'a close expectation can be computed before the new sale')

// --- one full sale ------------------------------------------------------------
let state = reserveCommerceOrder(seed, {
  id: ORDER_ID, createdAt: at(9), customer: 'Ma Thida', owner: OPERATOR, channel: 'Counter',
  item: item.name, itemSku: item.sku, quantity: QUANTITY, payment: 'KBZPay',
  paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'pickup',
  fulfilmentReference: 'Counter handoff #9', promisedAt: at(18),
  total: item.price * QUANTITY, status: 'confirmed',
  lines: [{ sku: item.sku, name: item.name, variant: item.variant, quantity: QUANTITY, unitPriceMmk: item.price }],
}, proof('RESERVE', 9))
check(state !== null, 'the sale reserves')

state = advanceCommerceOrder(state, ORDER_ID, 'confirmed', proof('PREPARING', 10))
state = advanceCommerceOrder(state, ORDER_ID, 'preparing', proof('READY', 11))
check(state !== null && orderOf(state).status === 'ready', 'and reaches ready')

state = reconcileCommercePayment(state, ORDER_ID, proof('RECONCILE', 12))
check(state !== null && orderOf(state).paymentStatus === 'reconciled', 'the payment reconciles')

state = advanceCommerceOrder(state, ORDER_ID, 'ready', proof('COMPLETE', 13))
check(state !== null && orderOf(state).status === 'completed', 'and the sale completes')

const completed = orderOf(state)
const soldFor = commerceOrderAdjustedTotal(completed)
check(Number.isSafeInteger(soldFor) && soldFor > 0, `the completed order has a countable total, got ${soldFor}`)

// --- the close must see it ----------------------------------------------------
const after = commerceCloseExpectation(state, at(14))
check(Boolean(after), 'a close expectation can still be computed with the new sale present')
check(
  after.orderIds.includes(ORDER_ID),
  'THE SEAM HOLDS: an order the product just completed IS eligible for today close',
)
check(
  after.orderIds.length === before.orderIds.length + 1,
  'and it is counted exactly once, not zero or twice',
)
check(
  after.total === before.total + soldFor,
  `the close total rises by exactly what the sale was worth (${before.total} + ${soldFor} = ${after.total})`,
)

// --- and the money survives the artifact -------------------------------------
const CLOSE_ID = 'CLOSE-8CAC808D-92A2-4FE4-89E8-D3C980B0F3C5'
const closed = saveCommerceClose(state, CLOSE_ID, {
  actionId: 'ACT-1D2E3F40-5A6B-4C7D-8E9F-A0B1C2D3E4F5',
  capturedAt: at(14), actor: OPERATOR,
  reason: 'End of trading day', evidenceReference: 'CLOSE-JOURNEY-1',
}, after)
check(closed !== null, 'the close saves against that expectation')

const exported = commerceDailyCloseExport(closed, CLOSE_ID)
check(Boolean(exported), 'and exports an accounting artifact')
check(
  exported.orders.some((entry) => entry.orderId === ORDER_ID),
  'the new sale appears in the exported artifact by id',
)
check(exported.totalMmk === after.total, 'the artifact total matches the reviewed expectation')
check(
  exported.orders.find((entry) => entry.orderId === ORDER_ID).calculationStatus === 'accepted',
  'and the sale is calculation-accepted rather than legacy_unverified -- the lifecycle wrote what the close needs',
)

// --- an incomplete sale is NOT counted ---------------------------------------
// The other half: the close must not sweep in takings that have not actually landed.
let unfinished = reserveCommerceOrder(seed, {
  id: 'ORD-CLOSE-JOURNEY-2', createdAt: at(9), customer: 'Ko Aung', owner: OPERATOR, channel: 'Counter',
  item: item.name, itemSku: item.sku, quantity: 1, payment: 'Cash',
  paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'pickup',
  fulfilmentReference: 'Counter handoff #10', promisedAt: at(18),
  total: item.price, status: 'confirmed',
  lines: [{ sku: item.sku, name: item.name, variant: item.variant, quantity: 1, unitPriceMmk: item.price }],
}, proof('RESERVE-2', 9))
check(unfinished !== null, 'a second sale reserves but is left unfinished')
const withUnfinished = commerceCloseExpectation(unfinished, at(14))
check(
  !withUnfinished.orderIds.includes('ORD-CLOSE-JOURNEY-2'),
  'a confirmed-but-unfinished sale is NOT counted -- the close reports takings, not hopes',
)
check(
  withUnfinished.total === before.total,
  'and the close total is unchanged by it',
)

// --- one close filter this journey cannot exercise, and why -------------------
// commerceCloseExpectation requires completed AND reconciled. Relaxing the RECONCILED half
// changes nothing here, because the only unfinished order this journey can build is
// confirmed -- excluded by the status half before payment is ever consulted.
//
// A completed-but-unreconciled order would discriminate, and it is unreachable through
// product functions: advanceCommerceOrder refuses ready -> completed while payment is
// pending, which tools/test_order_lifecycle_journey.mjs asserts directly. So the close's
// reconciled filter is defending a state the lifecycle already makes impossible.
//
// That is worth knowing rather than papering over: the filter is redundant TODAY, and stops
// being redundant the moment anyone relaxes the completion rule. Verified by running the
// mutated build, not inferred.

console.log(`order-to-close journey contract: ${checks} checks passed`)
