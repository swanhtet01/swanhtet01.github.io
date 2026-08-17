// Contract guard for the Ecommerce cancellation intent.
//
// Cancelling an order releases reserved stock and stops money that was going to be
// collected, so the guard around it is deliberately strict: the request must carry an
// acknowledgement snapshot that still AGREES with the live order on status, payment status,
// refund status and total. If any of those has drifted, the customer is cancelling something
// other than what they think they are looking at, and the request is refused rather than
// applied to the newer state.
//
// Nothing tested that. These checks pin the drift rules specifically, because they are the
// ones that are invisible until two people act on the same order at once.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { buildEcommerceCancellationIntent, validateEcommerceCancellationIntent } from './ecommerce-buying-lifecycle.ts'
      export { createSeedCommerce, reserveCommerceOrder, commerceOrderAcknowledgement } from '../../core/commerce-workspace.ts'
    `,
    resolveDir: 'showroom/src/products/ecommerce',
    sourcefile: 'showroom/src/products/ecommerce/cancel-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  buildEcommerceCancellationIntent, validateEcommerceCancellationIntent,
  createSeedCommerce, reserveCommerceOrder, commerceOrderAcknowledgement,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}
function rejects(run, label) {
  checks += 1
  assert.throws(run, undefined, label)
}

// The seed's orders are walk-in sales with no Ecommerce attribution, and cancellation
// deliberately requires an order traceable to a request. The acknowledgement derives
// sourceRecordId from the order, so attributing one seeded active order is enough to build
// a genuine fixture -- everything else about it stays exactly as the seed produced it.
const state = createSeedCommerce()
const cancellable = state.orders.find((order) => ['confirmed', 'preparing', 'ready'].includes(order.status))
check(Boolean(cancellable), 'the seed contains an active order to cancel against')
cancellable.sourceRecordId = 'ECR-459AAB25-5BDD-4687-BABA-82FD4E6A1578'
check(
  Boolean(commerceOrderAcknowledgement(state, cancellable.id)),
  'attributing it to an Ecommerce request yields a usable acknowledgement',
)

const acknowledgement = commerceOrderAcknowledgement(state, cancellable.id)
check(Boolean(acknowledgement), 'that order has an acknowledgement')
check(acknowledgement.totalMmk === cancellable.total, 'the acknowledgement agrees with the order total to begin with')
check(acknowledgement.cancellation.state === 'not_cancelled', 'and records the order as not yet cancelled')

const KEY = 'CNI-8CAC808D-92A2-4FE4-89E8-D3C980B0F3C5'
const intentFor = (overrides = {}) => buildEcommerceCancellationIntent({
  scope: 'demo',
  commerceState: state,
  orderId: cancellable.id,
  reasonCode: 'changed_mind',
  reason: 'Customer no longer needs the delivery',
  idempotencyKey: KEY,
  createdAt: '2026-07-23T12:00:00.000Z',
  ...overrides,
})

// --- happy path --------------------------------------------------------------
const intent = intentFor()
check(Boolean(intent), 'a cancellation against an active acknowledged order is accepted')
check(intent.orderId === cancellable.id, 'the intent names the order it cancels')
check(intent.state === 'pending_shop_review', 'and is queued for Shop review rather than self-approving')
check(
  JSON.stringify(validateEcommerceCancellationIntent(intent)) === JSON.stringify(intent),
  'a built cancellation round-trips through its validator unchanged',
)
check(intentFor().id === intent.id, 'the same idempotency key yields the same id, so a retry is not a second cancellation')

// --- a malformed or advanced order cannot be cancelled ----------------------
// Worth being precise about what these prove. The acknowledgement is DERIVED from the state
// on every call, not stored, so the source's four "acknowledgement disagrees with order"
// conditions (totalMmk, payment.status, refundStatus, status) compare a freshly-derived
// snapshot against the very order it came from. They cannot fail as the function is
// currently called, and removing any of them individually leaves these checks passing --
// confirmed by mutation. They are defensive code for a future in which an acknowledgement
// is persisted and replayed; they are not what stops the cases below.
//
// What actually stops them is the workspace validator, which refuses the malformed state
// outright, and the active-status requirement. Both are real protections, so they are worth
// pinning -- under labels that say which one is doing the work.
const withOrder = (mutate) => {
  const next = structuredClone(state)
  const target = next.orders.find((order) => order.id === cancellable.id)
  mutate(target)
  return next
}

rejects(
  () => intentFor({ commerceState: withOrder((order) => { order.total += 1000 }) }),
  'a total edited out of agreement with its own calculation is refused by the workspace validator',
)
rejects(
  () => intentFor({ commerceState: withOrder((order) => { order.paymentStatus = 'settled' }) }),
  'an unsupported paymentStatus value is refused by the workspace validator',
)
rejects(
  () => intentFor({ commerceState: withOrder((order) => { order.refundStatus = 'requested' }) }),
  'an unsupported refundStatus value is refused by the workspace validator',
)
rejects(
  () => intentFor({ commerceState: withOrder((order) => { order.status = 'completed' }) }),
  'a completed order cannot be cancelled -- this one IS the cancellation guard, and the state stays valid',
)

// --- attribution and ordering ------------------------------------------------
rejects(() => intentFor({ orderId: 'ORD-DOES-NOT-EXIST' }), 'cancelling an order that does not exist is refused')
rejects(
  () => intentFor({ createdAt: '2020-01-01T00:00:00.000Z' }),
  'a cancellation dated BEFORE the order it cancels is refused',
)
rejects(() => intentFor({ reasonCode: 'because_i_said_so' }), 'an unsupported reason code is refused')
rejects(() => intentFor({ idempotencyKey: 'nope' }), 'a malformed idempotency key is refused')

// --- validator tampering -----------------------------------------------------
for (const [field, value] of [
  ['orderId', 'ORD-9999'],
  ['state', 'approved'],
  ['schema', 'supermega.ecommerce.cancellation_intent.v2'],
]) {
  rejects(
    () => validateEcommerceCancellationIntent({ ...intent, [field]: value }),
    `a tampered ${field} is rejected by the validator`,
  )
}
rejects(
  () => validateEcommerceCancellationIntent({ ...intent, extra: 'smuggled' }),
  'an unexpected extra field is rejected rather than ignored',
)

console.log(`ecommerce cancellation intent contract: ${checks} checks passed`)
