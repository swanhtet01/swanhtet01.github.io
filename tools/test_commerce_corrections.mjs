// Contract guard for order corrections -- refunds and adjustments, i.e. money going back
// OUT of the shop. Two properties here decide whether a shop's books survive a rate change,
// and neither was tested.
//
// 1. A correction must be taxed at the ORDER'S tax configuration, not today's. If a shop
//    raises its rate from 5% to 7%, refunding a 5% order at 7% quietly hands back money the
//    shop never collected, on every historical order.
// 2. Corrections must not drive an order's adjusted total below zero. Refunding more than
//    was ever charged is not an accounting entry, it is a leak.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedCommerce, reserveCommerceOrder,
      commerceCorrectionCalculation, commerceOrderAdjustedTotal,
    } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/corrections-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { createSeedCommerce, reserveCommerceOrder, commerceCorrectionCalculation, commerceOrderAdjustedTotal } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

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

// taxConfigurations proofs are validated with hasExactKeys -- exactly these five.
const taxProof = (actionId) => ({
  actionId,
  capturedAt: '2020-01-01T00:00:00.000Z',
  actor: OPERATOR,
  reason: 'Configure commercial tax',
  evidenceReference: 'TAX-SETUP-0001',
})

const stateTaxedAt = (rateBasisPoints, actionId) => {
  const state = createSeedCommerce()
  state.taxConfigurations = [{
    revision: 1,
    code: 'CT',
    label: 'Commercial tax',
    rateBasisPoints,
    mode: 'exclusive',
    jurisdictionCode: 'MM',
    effectiveFrom: '2020-01-01T00:00:00.000Z',
    proof: taxProof(actionId),
  }]
  return state
}

const orderFor = (item, quantity) => ({
  id: 'ORD-TEST-1',
  createdAt: CAPTURED_AT,
  customer: 'Guest',
  owner: OPERATOR,
  channel: 'Counter',
  item: item.name,
  itemSku: item.sku,
  quantity,
  payment: 'Cash',
  paymentStatus: 'pending',
  refundStatus: 'none',
  fulfilment: 'pickup',
  fulfilmentReference: 'Counter handoff #1',
  promisedAt: '2026-07-23T10:00:00.000Z',
  total: item.price * quantity,
  status: 'confirmed',
  lines: [{ sku: item.sku, name: item.name, variant: item.variant, quantity, unitPriceMmk: item.price }],
})

// --- an order placed while tax was 5% -----------------------------------------
const state = stateTaxedAt(500, 'ACT-TAX-1')
const item = state.items.find((candidate) => candidate.onHand > 2)
const reserved = reserveCommerceOrder(state, orderFor(item, 2), proof)
check(reserved !== null, 'a counter sale is accepted with tax configured')
const order = reserved.orders.find((candidate) => candidate.id === 'ORD-TEST-1')
check(order.calculation.taxRateBasisPoints === 500, 'the order records the 5% rate it was placed under')

const listed = item.price * 2
const expectedFive = Math.floor((listed * 500) / 10_000 + 0.5)
check(order.total === listed + expectedFive, 'the order total carries 5% tax')

// --- the rate changes ---------------------------------------------------------
// The correction is computed from the ORDER, not from any state, so a later rate is not
// even reachable -- but that is the property worth stating, because a future refactor
// that "helpfully" passes current state would break it silently.
const correction = commerceCorrectionCalculation(order, listed)
check(correction !== null, 'a correction can be calculated for a taxed order')
check(
  correction.taxRateBasisPoints === 500,
  `the correction uses the order's own 5% rate, got ${correction.taxRateBasisPoints}`,
)
check(correction.taxMmk === expectedFive, `the correction refunds exactly the tax that was charged, got ${correction.taxMmk}`)
check(correction.subtotalMmk + correction.taxMmk === correction.totalMmk, 'the correction balances: subtotal + tax = total')
check(correction.totalMmk === order.total, 'refunding the full listed amount returns exactly what was charged')

// The same order corrected under a workspace now taxed at 10% must not change.
const raised = stateTaxedAt(1000, 'ACT-TAX-2')
const raisedItem = raised.items.find((candidate) => candidate.sku === item.sku)
const raisedReserved = reserveCommerceOrder(raised, orderFor(raisedItem, 2), proof)
const raisedOrder = raisedReserved.orders.find((candidate) => candidate.id === 'ORD-TEST-1')
check(raisedOrder.calculation.taxRateBasisPoints === 1000, 'a NEW order under the raised rate records 10%')
check(
  commerceCorrectionCalculation(order, listed).taxMmk === expectedFive,
  'the OLD order still corrects at 5% after the rate rises -- a rate change never rewrites history',
)
check(
  commerceCorrectionCalculation(raisedOrder, listed).taxMmk === Math.floor((listed * 1000) / 10_000 + 0.5),
  'the new order corrects at 10%',
)

// --- an untaxed order stays untaxed -------------------------------------------
const plain = createSeedCommerce()
const plainItem = plain.items.find((candidate) => candidate.sku === item.sku)
const plainOrder = reserveCommerceOrder(plain, orderFor(plainItem, 2), proof).orders.find((candidate) => candidate.id === 'ORD-TEST-1')
const plainCorrection = commerceCorrectionCalculation(plainOrder, listed)
check(plainCorrection.taxMode === 'not_configured', 'a correction on an untaxed order is reported as not_configured, not 0%')
check(plainCorrection.taxMmk === 0, 'and adds no tax')
check(plainCorrection.totalMmk === listed, 'and returns exactly the listed amount')

// --- guards -------------------------------------------------------------------
for (const bad of [0, -1, 1.5, NaN, Infinity]) {
  check(commerceCorrectionCalculation(order, bad) === null, `a correction amount of ${bad} is refused`)
}
check(
  commerceCorrectionCalculation({ ...order, calculation: undefined }, listed) === null,
  'an order with no recorded calculation cannot be corrected -- there is nothing to correct against',
)

// --- adjusted total cannot go negative ----------------------------------------
const credit = (amount) => ({ kind: 'credit', calculation: { totalMmk: amount } })
const debit = (amount) => ({ kind: 'debit', calculation: { totalMmk: amount } })

check(commerceOrderAdjustedTotal({ ...order, corrections: [] }) === order.total, 'no corrections leaves the total alone')
check(
  commerceOrderAdjustedTotal({ ...order, corrections: [credit(1_000)] }) === order.total - 1_000,
  'a credit reduces the adjusted total',
)
check(
  commerceOrderAdjustedTotal({ ...order, corrections: [debit(1_000)] }) === order.total + 1_000,
  'a debit increases the adjusted total',
)
check(
  commerceOrderAdjustedTotal({ ...order, corrections: [credit(order.total + 1)] }) === null,
  'refunding more than was ever charged is refused rather than producing a negative total',
)
check(
  commerceOrderAdjustedTotal({ ...order, corrections: [credit(order.total), credit(1)] }) === null,
  'and the refusal holds when it is a SEQUENCE of credits that crosses zero, not a single one',
)
check(
  commerceOrderAdjustedTotal({ ...order, corrections: [credit(order.total)] }) === 0,
  'refunding exactly the full amount is allowed and lands on zero',
)
check(
  commerceOrderAdjustedTotal({ ...order, corrections: [debit(Number.MAX_SAFE_INTEGER)] }) === null,
  'a debit that overflows the safe integer range is refused rather than silently losing precision',
)

console.log(`commerce corrections contract: ${checks} checks passed`)
