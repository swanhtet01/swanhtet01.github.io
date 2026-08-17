// Contract guard for the remaining two customer-initiated intents: corrections (which move
// an order's balance) and support requests (which do not).
//
// A correction is the one that touches money after the fact, and it is bound to the order's
// calculation DIGEST. That binding is what makes it tamper-evident: if the order's
// calculation changes after the customer asked for the correction, the request no longer
// matches what it was raised against.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export {
        buildEcommerceCorrectionIntent, validateEcommerceCorrectionIntent,
        buildEcommerceSupportIntent, validateEcommerceSupportIntent,
      } from './ecommerce-buying-lifecycle.ts'
      export { createSeedCommerce, commerceOrderCalculationDigest } from '../../core/commerce-workspace.ts'
    `,
    resolveDir: 'showroom/src/products/ecommerce',
    sourcefile: 'showroom/src/products/ecommerce/correction-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  buildEcommerceCorrectionIntent, validateEcommerceCorrectionIntent,
  buildEcommerceSupportIntent, validateEcommerceSupportIntent,
  createSeedCommerce, commerceOrderCalculationDigest,
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

// The seed's completed order is already reconciled and calculated, which is what corrections
// require. It has no Ecommerce attribution (it is a walk-in), so one is added -- the same
// approach the cancellation guard uses, and the only field changed.
const state = createSeedCommerce()
const order = state.orders.find((candidate) => candidate.status === 'completed' && candidate.paymentStatus === 'reconciled')
check(Boolean(order), 'the seed contains a completed, reconciled order to correct against')
order.sourceRecordId = 'ECR-459AAB25-5BDD-4687-BABA-82FD4E6A1578'
check(Boolean(commerceOrderCalculationDigest(order)), 'that order carries a calculation digest to bind the correction to')

const CORRECTION_KEY = 'COI-8CAC808D-92A2-4FE4-89E8-D3C980B0F3C5'
const correctionFor = (overrides = {}) => buildEcommerceCorrectionIntent({
  scope: 'demo',
  orderSnapshot: order,
  requestedKind: 'credit',
  reasonCode: 'pricing_error',
  listedAmountMmk: 1_000,
  reason: 'Customer was charged for one basket too many',
  idempotencyKey: CORRECTION_KEY,
  createdAt: '2026-07-23T12:00:00.000Z',
  ...overrides,
})

// --- correction happy path ---------------------------------------------------
const correction = correctionFor()
check(Boolean(correction), 'a correction against a completed reconciled order is accepted')
check(correction.orderId === order.id, 'the correction names the order it adjusts')
check(
  correction.sourceCalculationDigest === commerceOrderCalculationDigest(order),
  'and is bound to that order calculation digest, so a later recalculation is detectable',
)
check(
  JSON.stringify(validateEcommerceCorrectionIntent(correction)) === JSON.stringify(correction),
  'a built correction round-trips through its validator unchanged',
)
check(correctionFor().id === correction.id, 'a repeated idempotency key yields the same correction id')

// --- the order must be finished and settled ----------------------------------
for (const [field, value, label] of [
  ['status', 'preparing', 'an unfinished order cannot be corrected'],
  ['paymentStatus', 'pending', 'an unreconciled order cannot be corrected'],
  ['completion', undefined, 'an order with no completion proof cannot be corrected'],
  ['calculation', undefined, 'an order with no calculation has no digest to bind to, and is refused'],
]) {
  rejects(() => correctionFor({ orderSnapshot: { ...order, [field]: value } }), label)
}

// --- amount guards -----------------------------------------------------------
for (const bad of [0, -1, 1.5, NaN, Infinity]) {
  rejects(() => correctionFor({ listedAmountMmk: bad }), `a correction amount of ${bad} is refused`)
}
rejects(() => correctionFor({ reasonCode: 'felt_like_it' }), 'an unsupported correction reason code is refused')
rejects(() => correctionFor({ idempotencyKey: 'nope' }), 'a malformed correction idempotency key is refused')

// --- the digest binding is what makes it tamper-evident ----------------------
// Re-raising the same correction against an order whose calculation has moved must produce
// a DIFFERENT digest, so a stored correction cannot be silently reused against new figures.
const repriced = { ...order, calculation: { ...order.calculation, totalMmk: order.calculation.totalMmk + 500 } }
const repricedDigest = commerceOrderCalculationDigest(repriced)
check(
  repricedDigest !== correction.sourceCalculationDigest,
  'changing the order calculation changes its digest, so the binding actually detects drift',
)

// --- support intents ---------------------------------------------------------
const SUPPORT_KEY = 'ESI-1D2E3F40-5A6B-4C7D-8E9F-A0B1C2D3E4F5'
const supportFor = (overrides = {}) => buildEcommerceSupportIntent({
  scope: 'demo',
  orderSnapshot: order,
  category: 'delivery_issue',
  description: 'Delivery arrived at the wrong shop entrance',
  idempotencyKey: SUPPORT_KEY,
  createdAt: '2026-07-23T12:00:00.000Z',
  ...overrides,
})

const support = supportFor()
check(Boolean(support), 'a support request against a completed order is accepted')
check(support.orderId === order.id, 'the support request names its order')
check(
  JSON.stringify(validateEcommerceSupportIntent(support)) === JSON.stringify(support),
  'a built support request round-trips through its validator unchanged',
)
check(supportFor().id === support.id, 'a repeated idempotency key yields the same support id')

// Support does NOT move money, so it is deliberately less restricted than a correction:
// it needs a completed order with completion proof, but not a reconciled payment.
rejects(
  () => supportFor({ orderSnapshot: { ...order, status: 'preparing' } }),
  'a support request against an unfinished order is refused',
)
rejects(
  () => supportFor({ orderSnapshot: { ...order, completion: undefined } }),
  'a support request against an order with no completion proof is refused',
)
check(
  Boolean(supportFor({ orderSnapshot: { ...order, paymentStatus: 'pending' } })),
  'but an unreconciled payment does NOT block support -- it moves no money, unlike a correction',
)
rejects(() => supportFor({ category: 'existential_dread' }), 'an unsupported support category is refused')

// --- validators reject tampering ---------------------------------------------
rejects(
  () => validateEcommerceCorrectionIntent({ ...correction, extra: 'smuggled' }),
  'an extra field on a correction is rejected rather than ignored',
)
rejects(
  () => validateEcommerceCorrectionIntent({ ...correction, sourceCalculationDigest: 'sha256:' + '0'.repeat(64) }),
  'a correction whose digest binding has been swapped is rejected',
)
rejects(
  () => validateEcommerceSupportIntent({ ...support, extra: 'smuggled' }),
  'an extra field on a support request is rejected rather than ignored',
)

console.log(`ecommerce correction and support contract: ${checks} checks passed`)
