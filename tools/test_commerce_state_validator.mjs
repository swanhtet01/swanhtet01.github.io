// Contract guard for validateCommerceState -- the backstop the rest of the workspace leans on.
//
// Mutation-testing the other guards in this branch kept producing the same result: delete a
// clause from a business function and the operation is STILL refused, because this validator
// catches the resulting state. Over-receiving, a receipt predating its purchase order, a
// total edited away from its calculation, a half-filled reconciliation -- all of them fail
// here even when the function-level check is gone.
//
// That makes this the single most load-bearing function in the workspace, and nothing tested
// it directly. If it quietly stopped enforcing one of these, several other guards would go
// green while the invariant they describe was no longer held anywhere.
//
// Each case below corrupts ONE field of a state the seed produced and asserts the validator
// rejects it. The seed itself must pass, or every rejection below would be meaningless.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { createSeedCommerce, validateCommerceState } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/validator-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { createSeedCommerce, validateCommerceState } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}
function rejects(mutate, label) {
  checks += 1
  const corrupted = structuredClone(createSeedCommerce())
  mutate(corrupted)
  assert.throws(() => validateCommerceState(corrupted), undefined, label)
}

// --- the baseline must pass, or nothing below means anything -----------------
const seed = createSeedCommerce()
check(Boolean(validateCommerceState(seed)), 'the seeded workspace validates cleanly')
check(
  validateCommerceState(seed).orders.length === seed.orders.length,
  'and comes back with its orders intact rather than emptied',
)

// --- schema and shape --------------------------------------------------------
rejects((state) => { state.schema = 'supermega.commerce.workspace.v1' }, 'a workspace on the wrong schema is rejected')
rejects((state) => { delete state.orders }, 'a workspace missing its orders collection is rejected')
rejects((state) => { state.items = 'not an array' }, 'a non-array items collection is rejected')
rejects((state) => { state.taxConfigurations = {} }, 'a non-array taxConfigurations is rejected')

// --- the money invariants this validator backstops ---------------------------
// Each of these is a corruption that a business function ALSO guards against. These
// assertions are what make those guards redundant rather than the only line of defence.
rejects(
  (state) => { state.orders[0].total += 1_000 },
  'an order total edited away from its own calculation is rejected',
)
rejects(
  (state) => { state.orders[0].calculation.taxMmk += 500 },
  'a calculation whose parts no longer sum to its total is rejected',
)
rejects(
  (state) => { state.orders[0].paymentStatus = 'settled' },
  'an unsupported paymentStatus value is rejected',
)
rejects(
  (state) => { state.orders[0].refundStatus = 'requested' },
  'an unsupported refundStatus value is rejected',
)
rejects(
  (state) => {
    const order = state.orders.find((candidate) => candidate.paymentStatus === 'reconciled')
    if (order) delete order.paymentReconciledAt
    else state.orders[0].paymentStatus = 'reconciled'
  },
  'a reconciliation missing its timestamp is rejected -- the record is all-or-nothing',
)
rejects(
  (state) => {
    const order = state.orders.find((candidate) => candidate.completion)
    order.completion = { ...order.completion, capturedAt: '2020-01-01T00:00:00.000Z' }
  },
  'a completion dated before the order it completes is rejected as out of chronology',
)

// --- stock and identity ------------------------------------------------------
rejects((state) => { state.items[0].onHand = -1 }, 'negative stock is rejected')
rejects((state) => { state.items[0].price = 0 }, 'a zero price is rejected')
rejects((state) => { state.items[0].price = 1.5 }, 'a fractional price is rejected')
rejects(
  (state) => { state.items.push({ ...state.items[0] }) },
  'a duplicated catalog SKU is rejected -- stock would be ambiguous',
)
rejects(
  (state) => { state.orders.push({ ...state.orders[0] }) },
  'a duplicated order id is rejected',
)

// --- the validator does not silently repair ----------------------------------
// A validator that returns a CLEANED copy instead of throwing would make every "rejected"
// assertion above pass while the corrupt value flowed onward. Confirm it returns the same
// values it was given for a state that is legitimately valid.
const returned = validateCommerceState(seed)
check(
  returned.orders[0].total === seed.orders[0].total,
  'a valid state comes back with its totals unchanged, not normalised',
)
check(
  returned.items.length === seed.items.length,
  'and its full catalog, not a filtered subset',
)

// --- and it is a PREDICATE, not a normaliser ---------------------------------
// The whole read side of the workspace leans on this. A state that is validated once and then
// read many times over -- which is what commerceOrderAcknowledgementReader does, and what
// commerceDailyCloseExportFrom has done for the archive since it was split out -- is only
// equivalent to validating on every read if validating an unchanged state is a no-op on that
// state. Two things have to be true for that, and neither is obvious from the call site:
//
//   1. the value that comes back IS the value that went in, not a structural copy. A copy
//      would mean the first read and the thousandth read were looking at different objects,
//      and a caller holding the original would be reading something never checked; and
//   2. validating leaves the subject untouched, so the second validation is being asked about
//      exactly the state the first one approved.
//
// A "cleaning" validator would fail both, and the hoists above it would become silent
// behaviour changes rather than the pure repetition-removal they are sold as.
check(validateCommerceState(seed) === seed, 'a valid state comes back as the SAME object, not a structural copy of it')
const beforeValidation = JSON.stringify(seed)
validateCommerceState(seed)
validateCommerceState(seed)
check(JSON.stringify(seed) === beforeValidation, 'and validating it -- twice -- leaves it byte for byte as it was found')

console.log(`commerce state validator contract: ${checks} checks passed`)
