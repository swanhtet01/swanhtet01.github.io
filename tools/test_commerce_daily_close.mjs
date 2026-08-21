// Contract guard for the Shop daily close -- the moment a trading day becomes a fixed
// accounting record.
//
// The rule that carries the most weight is that a close cannot be saved against a stale
// review. saveCommerceClose recomputes the expectation from the live state and compares it
// to the one the operator actually reviewed; if anything moved in between -- another sale
// completed, a payment reconciled, stock dropped below its reorder point -- the close is
// refused rather than recorded against figures nobody saw.
//
// The rest is eligibility: only completed AND reconciled orders close, an order cannot be
// closed twice, a business date cannot be closed twice, and an order whose close basis is
// later than the close itself cannot be swept into it.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedCommerce, commerceCloseExpectation, saveCommerceClose,
      commerceDailyCloseExport, commerceDailyCloseCsv, commerceOrderAdjustedTotal,
    } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/close-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createSeedCommerce, commerceCloseExpectation, saveCommerceClose,
  commerceDailyCloseExport, commerceDailyCloseCsv, commerceOrderAdjustedTotal,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const CAPTURED_AT = '2026-07-24T14:00:00.000Z'
const CLOSE_ID = 'CLOSE-8CAC808D-92A2-4FE4-89E8-D3C980B0F3C5'
const ACTION_ID = 'ACT-1D2E3F40-5A6B-4C7D-8E9F-A0B1C2D3E4F5'
const proof = (overrides = {}) => ({
  actionId: ACTION_ID,
  capturedAt: CAPTURED_AT,
  actor: 'Swan Htet',
  reason: 'End of trading day',
  evidenceReference: 'CLOSE-0001',
  ...overrides,
})

const seed = createSeedCommerce()

// --- the expectation describes exactly what will be closed -------------------
const expectation = commerceCloseExpectation(seed, CAPTURED_AT)
check(Boolean(expectation), 'an expectation can be computed for the seed state')
check(Boolean(expectation.businessDate), `it names a Myanmar business date, got ${expectation.businessDate}`)

const eligible = seed.orders.filter((order) => order.status === 'completed' && order.paymentStatus === 'reconciled')
check(
  expectation.orderIds.length === eligible.length,
  `only completed AND reconciled orders are eligible (${expectation.orderIds.length} vs ${eligible.length})`,
)
check(
  seed.orders.some((order) => order.status !== 'completed' || order.paymentStatus !== 'reconciled'),
  'and the seed does contain ineligible orders, so that assertion is not vacuous',
)
check(
  expectation.orderIds.every((id) => eligible.some((order) => order.id === id)),
  'every id in the expectation is one of the eligible orders',
)

const expectedTotal = expectation.orderIds
  .map((id) => commerceOrderAdjustedTotal(seed.orders.find((order) => order.id === id)))
  .reduce((sum, value) => sum + value, 0)
check(expectation.total === expectedTotal, 'the total is the sum of ADJUSTED order totals, so corrections are included')

// Exceptions are surfaced rather than silently folded into the total.
check(Array.isArray(expectation.paymentExceptionOrderIds), 'payment exceptions are listed')
check(Array.isArray(expectation.stockExceptionSkus), 'stock exceptions are listed')
check(
  expectation.stockExceptionSkus.every((sku) => {
    const item = seed.items.find((candidate) => candidate.sku === sku)
    return item && item.onHand <= item.reorderAt
  }),
  'every listed stock exception is genuinely at or below its reorder point',
)

// --- saving the close --------------------------------------------------------
const closed = saveCommerceClose(seed, CLOSE_ID, proof(), expectation)
check(Boolean(closed), 'a close saves when the reviewed expectation still matches the live state')
const saved = closed.closes.find((close) => close.id === CLOSE_ID)
check(Boolean(saved), 'the close is recorded')
check(saved.operator === 'Swan Htet', 'and records who closed the day')
check(saved.businessDate === expectation.businessDate, 'against the reviewed business date')

// --- a stale review is refused ----------------------------------------------
// This is the property the guard exists for. Each of these is a state that moved after the
// operator looked at the numbers.
// Note on what is NOT simulated here: promoting a seeded order to completed+reconciled to
// stand in for "another sale landed" cannot be done by editing status fields. The workspace
// validator requires the full reconciliation record AND enforces order chronology -- a
// completion cannot predate the order it completes. Both refusals are correct, and faking
// timestamps to get around them would test a state the product cannot reach. The staleness
// guard is proven below with states that ARE reachable.

const withStockDrop = structuredClone(seed)
withStockDrop.items[0].onHand = 0
check(
  saveCommerceClose(withStockDrop, CLOSE_ID, proof(), expectation) === null,
  'a close is refused when stock fell below its reorder point after the review',
)

check(
  saveCommerceClose(seed, CLOSE_ID, proof(), { ...expectation, total: expectation.total + 1 }) === null,
  'a close is refused when the reviewed TOTAL does not match what the state produces',
)
check(
  saveCommerceClose(seed, CLOSE_ID, proof(), { ...expectation, orderIds: [] }) === null,
  'a close is refused when the reviewed ORDER SET does not match',
)

// --- one close per day, one close per order ---------------------------------
const secondExpectation = commerceCloseExpectation(closed, CAPTURED_AT)
check(
  secondExpectation === null,
  'a second close on the same business date is refused at the expectation stage',
)

// --- an order already closed is never closed again ---------------------------
// Needs a SECOND business date, because the same-day guard refuses before the
// already-closed filter is ever consulted. Without this, deleting that filter changes
// nothing observable and the test would pass against a double-count.
const NEXT_DAY = '2026-07-25T14:00:00.000Z'
const nextDay = commerceCloseExpectation(closed, NEXT_DAY)
check(nextDay !== null, 'a close can be computed for the following business date')
check(
  nextDay.businessDate !== expectation.businessDate,
  'and it is a different business date from the first close',
)
check(
  nextDay.orderIds.length === 0,
  `the already-closed order is NOT eligible again (got ${nextDay.orderIds.length} orders)`,
)
check(
  nextDay.total === 0,
  'so the following day opens at zero rather than re-counting yesterday takings',
)
check(
  expectation.orderIds.length > 0,
  'and the first close did cover at least one order, so that zero is meaningful',
)

// --- malformed proofs and ids -----------------------------------------------
for (const [label, args] of [
  ['a non-canonical close id', ['CLOSE-not-a-uuid', proof()]],
  ['a non-canonical action id', [CLOSE_ID, proof({ actionId: 'ACT-nope' })]],
  ['an untrimmed actor', [CLOSE_ID, proof({ actor: '  Swan Htet  ' })]],
  ['a blank evidence reference', [CLOSE_ID, proof({ evidenceReference: '' })]],
]) {
  check(saveCommerceClose(seed, args[0], args[1], expectation) === null, `a close with ${label} is refused`)
}

// --- the exported artifact ---------------------------------------------------
const exported = commerceDailyCloseExport(closed, CLOSE_ID)
check(Boolean(exported), 'the saved close exports an accounting artifact')
check(exported.closeId === CLOSE_ID, 'the artifact names its close')
check(exported.businessDate === expectation.businessDate, 'and its business date')
check(exported.orders.length === expectation.orderIds.length, 'with one entry per closed order')
check(exported.orderCount === expectation.orderIds.length, 'and an orderCount that agrees with the entries')
check(exported.totalMmk === expectation.total, 'and a total that matches the reviewed expectation')
check(typeof exported.digest === 'string' && exported.digest.length > 0, 'and a digest over the artifact')
check(
  exported.orders.every((entry) => entry.calculationStatus === 'accepted'),
  'every entry is calculation-accepted, because every seeded order carries a calculation',
)
check(commerceDailyCloseExport(closed, 'CLOSE-does-not-exist') === null, 'exporting an unknown close returns null')

const csv = commerceDailyCloseCsv(exported)
check(typeof csv === 'string' && csv.includes(CLOSE_ID), 'the CSV names the close')
check(csv.split('\n').filter((line) => line.trim()).length >= exported.orders.length + 1, 'and has a header plus a row per entry')

// --- one filter this fixture cannot exercise ---------------------------------
// commerceCloseExpectation requires orders to be completed AND reconciled. The seed has no
// completed-but-unreconciled order, so deleting the `paymentStatus === 'reconciled'` clause
// changes nothing here and this file stays green -- confirmed by mutation. Constructing one
// is not possible by editing status fields: the workspace validator demands the full
// reconciliation record and enforces order chronology. Recorded rather than papered over, so
// the count is not mistaken for coverage of that clause.

console.log(`commerce daily close contract: ${checks} checks passed`)

// The anomaly-flag projection reads nothing but closes, so its executable
// contract belongs to this gate step. It cannot be its own step -- every step is
// an npm script in package.json's app:verify chain and package.json is
// digest-bound (rehearsal cascade) -- so it is imported here rather than left as
// a file no gate runs. It asserts and prints its own count, and throws on
// failure, which fails this step.
await import('./test_shop_close_anomaly.mjs')

// The workspace archive is built entirely out of the close export this file guards: it walks
// every close through commerceDailyCloseExport rather than re-projecting the same records,
// and asserts the two agree. Its contract rides on this gate step for the same reason the
// anomaly projection above does -- a step of its own would mean a new npm script, and
// package.json is digest-bound. It stays in its own file because its subject is the archive
// and not the close, and it asserts and prints its own count, throwing on failure.
await import('./test_shop_workspace_archive.mjs')
