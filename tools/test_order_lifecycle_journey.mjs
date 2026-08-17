// Composition guard: the full order lifecycle, reserve to returnable.
//
// The return guard in this branch builds its completed order BY HAND. That proves the return
// rules, but it does not prove that an order the product actually produces satisfies them.
// If reserveCommerceOrder and buildEcommerceReturnIntent ever drift apart -- a field one
// stops writing that the other still requires -- every unit guard stays green while no real
// order in the system can be returned.
//
// So this drives one order through every stage the product does, using only product
// functions: reserve, advance to preparing, advance to ready, reconcile the payment, advance
// to completed, then raise a return against it. Each step's output is the next step's input.
//
// The ordering constraint is real and worth pinning: ready cannot become completed until the
// payment is reconciled. That is the rule that stops a shop handing goods over and losing
// track of whether it was paid.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export {
        createSeedCommerce, reserveCommerceOrder, advanceCommerceOrder, reconcileCommercePayment,
      } from './commerce-workspace.ts'
      export { buildEcommerceReturnIntent } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/lifecycle-test-entry.ts',
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
  buildEcommerceReturnIntent,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Swan Htet'
const ORDER_ID = 'ORD-LIFECYCLE-1'
const SOURCE_REQUEST = 'ECR-459AAB25-5BDD-4687-BABA-82FD4E6A1578'
const at = (hour) => `2026-07-24T${String(hour).padStart(2, '0')}:00:00.000Z`
const proof = (suffix, hour) => ({
  actionId: `ACT-LIFECYCLE-${suffix}`,
  capturedAt: at(hour),
  actor: OPERATOR,
  reason: `Lifecycle step ${suffix}`,
  evidenceReference: `LIFECYCLE-${suffix}`,
})

const seed = createSeedCommerce()
const item = seed.items.find((candidate) => candidate.onHand > 3)
check(Boolean(item), 'the seed has a sellable item')

const QUANTITY = 2
const orderOf = (state) => state.orders.find((candidate) => candidate.id === ORDER_ID)

// --- reserve ------------------------------------------------------------------
let state = reserveCommerceOrder(seed, {
  id: ORDER_ID,
  createdAt: at(9),
  customer: 'Ma Thida',
  owner: OPERATOR,
  channel: 'Counter',
  item: item.name,
  itemSku: item.sku,
  quantity: QUANTITY,
  payment: 'KBZPay',
  paymentStatus: 'pending',
  refundStatus: 'none',
  fulfilment: 'delivery',
  fulfilmentReference: 'Delivery handoff #1',
  promisedAt: at(18),
  total: item.price * QUANTITY,
  status: 'confirmed',
  lines: [{ sku: item.sku, name: item.name, variant: item.variant, quantity: QUANTITY, unitPriceMmk: item.price }],
}, proof('RESERVE', 9))
check(state !== null, 'the order reserves')
check(orderOf(state).status === 'confirmed', 'and starts confirmed')

// --- ready cannot complete before the payment is reconciled ------------------
let toPreparing = advanceCommerceOrder(state, ORDER_ID, 'confirmed', proof('PREPARING', 10))
check(toPreparing !== null, 'confirmed advances to preparing')
state = toPreparing
check(orderOf(state).status === 'preparing', 'and the status moves')

state = advanceCommerceOrder(state, ORDER_ID, 'preparing', proof('READY', 11))
check(state !== null, 'preparing advances to ready')
check(orderOf(state).status === 'ready', 'and the status moves again')

check(
  advanceCommerceOrder(state, ORDER_ID, 'ready', proof('EARLY-COMPLETE', 12)) === null,
  'a READY order cannot be completed while its payment is still pending -- goods do not leave unpaid',
)
check(orderOf(state).paymentStatus === 'pending', 'and the payment really is still pending, so that refusal is meaningful')

// --- reconcile, then complete ------------------------------------------------
state = reconcileCommercePayment(state, ORDER_ID, proof('RECONCILE', 12))
check(state !== null, 'the payment reconciles')
check(orderOf(state).paymentStatus === 'reconciled', 'and the order records it')

state = advanceCommerceOrder(state, ORDER_ID, 'ready', proof('COMPLETE', 13))
check(state !== null, 'a reconciled ready order completes')
const completed = orderOf(state)
check(completed.status === 'completed', 'and reaches completed')
check(Boolean(completed.completion), 'carrying completion proof, which the return path requires')
check(Boolean(completed.calculation), 'and its calculation, which the daily close requires')

// --- the return path against a REAL completed order --------------------------
// An order carrying sourceRecordId cannot be reserved unless a matching Ecommerce request
// exists in state, and the seed has none -- claiming an order came from a request that does
// not exist is correctly refused. So this lifecycle produces a walk-in Counter order, and
// what that proves is the other half of the attribution rule: the Ecommerce return path must
// REFUSE it, because it is not attributable to any Ecommerce request.
let walkInReturn = null
try {
  walkInReturn = buildEcommerceReturnIntent({
    scope: 'demo', orderSnapshot: completed, sku: item.sku, quantity: 1,
    disposition: 'restock', reason: 'Customer returned one unit unopened',
    idempotencyKey: 'ERI-8CAC808D-92A2-4FE4-89E8-D3C980B0F3C5', createdAt: at(14),
  })
} catch { walkInReturn = 'refused' }
check(
  walkInReturn === 'refused',
  'a completed WALK-IN order is not returnable through the Ecommerce path -- attribution is required, not assumed',
)

// The same order with an Ecommerce attribution grafted on IS accepted, which shows the
// refusal above is about attribution specifically rather than something else the lifecycle
// failed to write. Grafted rather than reserved, because reserving it needs a storefront
// request the seed does not carry -- recorded so this is not mistaken for a full path test.
const attributed = { ...completed, sourceRecordId: SOURCE_REQUEST }
const intent = buildEcommerceReturnIntent({
  scope: 'demo', orderSnapshot: attributed, sku: item.sku, quantity: 1,
  disposition: 'restock', reason: 'Customer returned one unit unopened',
  idempotencyKey: 'ERI-8CAC808D-92A2-4FE4-89E8-D3C980B0F3C5', createdAt: at(14),
})
check(
  Boolean(intent),
  'THE SEAM HOLDS: everything else the lifecycle wrote -- completion proof, lines, quantities -- satisfies the return path',
)
check(intent.orderId === ORDER_ID, 'the return names that order')
check(intent.quantity === 1, 'for the quantity being returned')

let overReturn = null
try {
  overReturn = buildEcommerceReturnIntent({
    scope: 'demo', orderSnapshot: attributed, sku: item.sku, quantity: QUANTITY + 1,
    disposition: 'restock', reason: 'Returning more than was ever sold',
    idempotencyKey: 'ERI-1D2E3F40-5A6B-4C7D-8E9F-A0B1C2D3E4F5', createdAt: at(14),
  })
} catch { overReturn = 'refused' }
check(overReturn === 'refused', `returning more than the ${QUANTITY} actually sold is refused, using the quantity the LIFECYCLE wrote`)

// --- stock moved exactly once ------------------------------------------------
check(
  state.items.find((candidate) => candidate.sku === item.sku).onHand === item.onHand - QUANTITY,
  'stock fell by the order quantity exactly once across the whole lifecycle, not once per stage',
)

console.log(`order lifecycle journey contract: ${checks} checks passed`)
