// Contract guard for the Ecommerce return intent -- the path by which a customer gets goods
// (and eventually money) back out of the shop.
//
// The rules that matter here are not about formatting. A return must be attributable to a
// COMPLETED order that carries completion proof, must name a SKU that was actually sold on
// it, and must never exceed what remains after earlier returns on the same line. Get the
// last one wrong and a shop refunds the same item repeatedly.
//
// The implementation already enforces all of this. Nothing tested it.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      buildEcommerceReturnIntent, validateEcommerceReturnIntent,
    } from './ecommerce-buying-lifecycle.ts'`,
    resolveDir: 'showroom/src/products/ecommerce',
    sourcefile: 'showroom/src/products/ecommerce/return-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { buildEcommerceReturnIntent, validateEcommerceReturnIntent } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}
function rejects(run, label) {
  checks += 1
  assert.throws(run, undefined, label)
}

const COMPLETED_ORDER = {
  id: 'ORD-1042',
  status: 'completed',
  sourceRecordId: 'ECR-459AAB25-5BDD-4687-BABA-82FD4E6A1578',
  completion: {
    actionId: 'ACT-COMPLETE-1',
    capturedAt: '2026-07-23T10:00:00.000Z',
    actor: 'Swan Htet',
    reason: 'Handed to customer',
    evidenceReference: 'HANDOFF-0001',
  },
  lines: [
    { sku: 'SM-1001', name: 'Daily essentials basket', quantity: 3, unitPriceMmk: 18_500 },
    { sku: 'SM-1003', name: 'Household refill', quantity: 1, unitPriceMmk: 12_000 },
  ],
}

const intentFor = (overrides = {}) => buildEcommerceReturnIntent({
  scope: 'demo',
  orderSnapshot: COMPLETED_ORDER,
  sku: 'SM-1001',
  quantity: 1,
  disposition: 'restock',
  reason: 'Customer returned one basket unopened',
  idempotencyKey: 'ERI-8CAC808D-92A2-4FE4-89E8-D3C980B0F3C5',
  createdAt: '2026-07-23T12:00:00.000Z',
  ...overrides,
})

// --- the happy path has to work, or every rejection below proves nothing ------
const intent = intentFor()
check(Boolean(intent), 'a well-formed return against a completed order is accepted')
check(intent.orderId === 'ORD-1042', 'the intent is bound to the order it returns against')
check(intent.sourceRequestId === 'ECR-459AAB25-5BDD-4687-BABA-82FD4E6A1578', 'and to the Ecommerce request that order came from')
check(intent.quantity === 1, 'the requested quantity is carried through')
check(intent.refundStatus === 'not_started', 'a fresh intent has not started a refund')
check(intent.state === 'pending_shop_review', 'and is queued for Shop review rather than self-approving')
check(
  intent.evidenceReference.includes('ORD-1042') && intent.evidenceReference.includes('ECR-459AAB25-5BDD-4687-BABA-82FD4E6A1578'),
  'the evidence reference names both the order and the request, so the trail is followable',
)

// A built intent must survive its own validator -- otherwise nothing downstream can trust it.
check(
  JSON.stringify(validateEcommerceReturnIntent(intent)) === JSON.stringify(intent),
  'a built intent round-trips through its validator unchanged',
)

// --- you cannot return more than was sold ------------------------------------
check(Boolean(intentFor({ quantity: 3 })), 'returning the entire sold quantity is allowed')
rejects(() => intentFor({ quantity: 4 }), 'returning MORE than was sold is refused')
rejects(() => intentFor({ quantity: 0 }), 'a zero-quantity return is refused')
rejects(() => intentFor({ quantity: -1 }), 'a negative-quantity return is refused')
rejects(() => intentFor({ quantity: 1.5 }), 'a fractional return is refused')

// ...and prior returns count against the remainder. This is the one that costs real money
// if it breaks: without it the same line can be refunded again and again.
const partiallyReturned = { ...COMPLETED_ORDER, returns: [{ sku: 'SM-1001', quantity: 2 }] }
check(
  Boolean(intentFor({ orderSnapshot: partiallyReturned, quantity: 1 })),
  'the remaining 1 of 3 can still be returned after 2 were already returned',
)
rejects(
  () => intentFor({ orderSnapshot: partiallyReturned, quantity: 2 }),
  'but returning 2 more when only 1 remains is refused -- earlier returns count against the line',
)

// --- the order has to be a real, completed, attributable sale -----------------
rejects(
  () => intentFor({ orderSnapshot: { ...COMPLETED_ORDER, status: 'preparing' } }),
  'a return against an order that is not completed is refused',
)
rejects(
  () => intentFor({ orderSnapshot: { ...COMPLETED_ORDER, completion: undefined } }),
  'a completed order with no completion proof cannot be returned against',
)
rejects(
  () => intentFor({ orderSnapshot: { ...COMPLETED_ORDER, sourceRecordId: undefined } }),
  'an order not attributable to an Ecommerce request is refused',
)
rejects(
  () => intentFor({ orderSnapshot: { ...COMPLETED_ORDER, lines: [] } }),
  'an order with no sold lines is refused',
)

// --- the SKU has to be one exact sold line -----------------------------------
rejects(() => intentFor({ sku: 'SM-9999' }), 'returning a SKU that was never on the order is refused')
rejects(
  () => intentFor({
    orderSnapshot: {
      ...COMPLETED_ORDER,
      lines: [COMPLETED_ORDER.lines[0], { ...COMPLETED_ORDER.lines[0] }],
    },
  }),
  'an ambiguous order carrying the same SKU on two lines is refused rather than guessed at',
)

// --- disposition and idempotency ---------------------------------------------
rejects(() => intentFor({ disposition: 'incinerate' }), 'an unsupported disposition is refused')
rejects(() => intentFor({ idempotencyKey: 'nope' }), 'a malformed idempotency key is refused')
check(
  intentFor({ idempotencyKey: 'ERI-1D2E3F40-5A6B-4C7D-8E9F-A0B1C2D3E4F5' }).id !== intent.id,
  'a different idempotency key yields a different intent id',
)
check(
  intentFor().id === intent.id,
  'the SAME idempotency key yields the SAME id, so a retried submission cannot become a second return',
)

// --- what the validator does and does not catch ------------------------------
// Tampering that contradicts the evidence reference is caught, because that string encodes
// idempotencyKey:orderId:sourceRequestId and is checked against the fields.
for (const [field, value] of [
  ['orderId', 'ORD-9999'],
  ['sourceRequestId', 'ECR-1D2E3F40-5A6B-4C7D-8E9F-A0B1C2D3E4F5'],
  ['evidenceReference', 'tampered'],
  ['refundStatus', 'settled'],
  ['state', 'approved'],
  ['schema', 'supermega.ecommerce.return_intent.v2'],
  ['quantity', -1],
  ['quantity', 1.5],
]) {
  rejects(
    () => validateEcommerceReturnIntent({ ...intent, [field]: value }),
    `a tampered ${field} (${JSON.stringify(value)}) is rejected by the validator`,
  )
}
rejects(
  () => validateEcommerceReturnIntent({ ...intent, extra: 'smuggled' }),
  'an unexpected extra field is rejected rather than ignored',
)
rejects(
  () => validateEcommerceReturnIntent({ ...intent, reason: undefined }),
  'a missing required field is rejected',
)

// The boundary, stated explicitly so nobody mistakes this validator for a complete check.
// quantity and sku are NOT re-verified here, because the validator receives only the intent
// -- it has no order snapshot to compare against, and neither field is encoded in the
// evidence reference. "Return 99 of a line that sold 3" is structurally valid and is caught
// at BUILD time instead. Anything that revalidates a stored intent must re-run the builder
// against the order rather than trusting this function alone.
checks += 1
assert.doesNotThrow(
  () => validateEcommerceReturnIntent({ ...intent, quantity: 99 }),
  'documented: the validator accepts an over-large quantity, since it has no order to check it against',
)
checks += 1
assert.doesNotThrow(
  () => validateEcommerceReturnIntent({ ...intent, sku: 'SM-9999' }),
  'documented: the validator accepts an unsold SKU for the same reason',
)
// ...and the builder, which DOES have the order, refuses both.
rejects(() => intentFor({ quantity: 99 }), 'the builder refuses the over-large quantity the validator cannot see')
rejects(() => intentFor({ sku: 'SM-9999' }), 'the builder refuses the unsold SKU the validator cannot see')

console.log(`ecommerce return intent contract: ${checks} checks passed`)
