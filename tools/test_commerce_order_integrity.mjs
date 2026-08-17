// Contract guard for reserveCommerceOrder -- the write boundary for every Shop sale.
//
// The counter UI computes a display total (CoreApp.tsx sums price x quantity), but
// that number is provisional. reserveCommerceOrder recomputes the calculation from
// the live catalog and overwrites order.total with it, and refuses the order outright
// if any supplied line price does not match the catalog.
//
// That is the property that keeps a shop's books honest: the stored total is derived
// from catalog prices at write time, never accepted from the caller. It had no test.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { createSeedCommerce, reserveCommerceOrder } from './commerce-workspace.ts'`,
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

const { createSeedCommerce, reserveCommerceOrder } = await import(
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

console.log(`commerce order integrity contract: ${checks} checks passed`)
