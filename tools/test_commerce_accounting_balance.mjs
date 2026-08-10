// Guard: the accounting handoff must balance, and must not claim to have posted anything.
//
// This is the artifact a shop hands its accountant. Two properties matter more than anything
// else in it, and neither was covered:
//
//   1. Debits equal credits. A double-entry document that does not balance cannot be posted
//      at all -- the accountant either rejects it or, worse, plugs the difference. The daily
//      close guard checks 37 things and none of them is this.
//   2. It does not claim to have posted. The handoff carries postingAuthority and
//      externalPostingPerformed, and this product has no ledger integration. A document
//      asserting it had already been posted would invite double entry of the same takings.
//
// The debit side is grouped by payment method and the credit side by account role, so the two
// are computed by genuinely different paths over the same orders. That is exactly the shape
// where a drift shows up as an unbalanced document rather than as an error.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedCommerce, reserveCommerceOrder, advanceCommerceOrder, reconcileCommercePayment,
      commerceCloseExpectation, saveCommerceClose, commerceAccountingHandoff,
      commerceDailyCloseExport,
    } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/accounting-balance-entry.ts',
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
  commerceCloseExpectation, saveCommerceClose, commerceAccountingHandoff, commerceDailyCloseExport,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Swan Htet'
const at = (hour) => `2026-07-24T${String(hour).padStart(2, '0')}:00:00.000Z`
const proof = (suffix, hour) => ({
  actionId: `ACT-ACCT-${suffix}`,
  capturedAt: at(hour),
  actor: OPERATOR,
  reason: `Accounting balance scenario ${suffix}`,
  evidenceReference: `ACCT-${suffix}`,
})

// Drive one order all the way to completed and reconciled, using product functions only.
function sell(state, { id, sku, name, variant, price, quantity, payment, suffix }) {
  let next = reserveCommerceOrder(state, {
    id, createdAt: at(9), customer: 'Ma Thida', owner: OPERATOR, channel: 'Counter',
    item: name, itemSku: sku, quantity, payment,
    paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'pickup',
    fulfilmentReference: `Counter handoff ${suffix}`, promisedAt: at(18),
    total: price * quantity, status: 'confirmed',
    lines: [{ sku, name, variant, quantity, unitPriceMmk: price }],
  }, proof(`${suffix}-RESERVE`, 9))
  assert.ok(next, `${suffix}: the sale reserves`)
  next = advanceCommerceOrder(next, id, 'confirmed', proof(`${suffix}-PREP`, 10))
  next = advanceCommerceOrder(next, id, 'preparing', proof(`${suffix}-READY`, 11))
  next = reconcileCommercePayment(next, id, proof(`${suffix}-RECONCILE`, 12))
  next = advanceCommerceOrder(next, id, 'ready', proof(`${suffix}-COMPLETE`, 13))
  assert.ok(next, `${suffix}: the sale completes`)
  return next
}

const seed = createSeedCommerce()
const sellable = seed.items.filter((item) => item.onHand > 4).slice(0, 2)
check(sellable.length === 2, 'the seed carries two items with enough stock to sell')

// Two payment methods on purpose: the debit side groups by method, so a single method would
// leave the grouping untested and any grouping bug invisible.
let state = sell(seed, {
  id: 'ORD-ACCT-1', sku: sellable[0].sku, name: sellable[0].name, variant: sellable[0].variant,
  price: sellable[0].price, quantity: 2, payment: 'KBZPay', suffix: 'A',
})
state = sell(state, {
  id: 'ORD-ACCT-2', sku: sellable[1].sku, name: sellable[1].name, variant: sellable[1].variant,
  price: sellable[1].price, quantity: 1, payment: 'Cash', suffix: 'B',
})

const expectation = commerceCloseExpectation(state, at(14))
check(Boolean(expectation), 'a close expectation can be computed')
check(expectation.orderIds.length >= 2, `it covers both new sales, got ${expectation.orderIds.length}`)

const CLOSE_ID = 'CLOSE-7F3A9B21-4C5D-4E6F-8A9B-0C1D2E3F4A5B'
const closed = saveCommerceClose(state, CLOSE_ID, {
  // The close proof is stricter than the order proofs above: its actionId must be a UUID.
  actionId: 'ACT-2B4C6D8E-1F3A-4B5C-9D7E-8F0A1B2C3D4E',
  capturedAt: at(14),
  actor: OPERATOR,
  reason: 'End of trading day',
  evidenceReference: 'ACCT-CLOSE-1',
}, expectation)
check(Boolean(closed), 'the close saves')

const handoff = commerceAccountingHandoff(closed, CLOSE_ID)
check(Boolean(handoff), 'the accounting handoff is produced for that close')

// --- the property that makes the document postable ----------------------------
const debits = handoff.entries.filter((entry) => entry.side === 'debit')
const credits = handoff.entries.filter((entry) => entry.side === 'credit')
const total = (entries) => entries.reduce((sum, entry) => sum + entry.amountMmk, 0)

check(debits.length > 0, `the handoff has debit lines, got ${debits.length}`)
check(credits.length > 0, `the handoff has credit lines, got ${credits.length}`)
check(
  total(debits) === total(credits),
  `IT BALANCES: debits ${total(debits)} equal credits ${total(credits)}`,
)
check(
  total(credits) === expectation.total,
  `and the credit side equals the reviewed close total (${expectation.total})`,
)
for (const entry of handoff.entries) {
  check(
    Number.isSafeInteger(entry.amountMmk) && entry.amountMmk > 0,
    `every line carries a whole positive amount -- ${entry.lineId} is ${entry.amountMmk}`,
  )
}

// Two payment methods must produce two debit lines. A single lumped line would still balance,
// which is why this is asserted separately from the balance itself.
const methods = new Set(debits.map((entry) => entry.paymentMethod))
check(methods.size === 2, `the debit side is split by payment method, got ${[...methods].join(', ')}`)
check(methods.has('KBZPay') && methods.has('Cash'), 'naming both methods actually used')
for (const method of methods) {
  const forMethod = debits.filter((entry) => entry.paymentMethod === method)
  check(forMethod.length === 1, `${method} appears as exactly one debit line, not ${forMethod.length}`)
}

// --- the document must not claim to have posted anything ----------------------
// There is no ledger integration in this product. A handoff asserting otherwise would invite
// the same takings being entered twice.
check(handoff.externalPostingPerformed === false, 'the handoff states no external posting was performed')
check(handoff.postingAuthority === 'none', `and claims no posting authority, got ${handoff.postingAuthority}`)
check(
  handoff.status === 'review_required',
  `and asks for review rather than presenting itself as final, got ${handoff.status}`,
)
for (const entry of handoff.entries) {
  check(
    entry.mappingStatus === 'unmapped' || Boolean(entry.externalAccountCode),
    `${entry.lineId}: an unmapped line says so rather than inventing an account code`,
  )
}

// --- the handoff is bound to the close it came from ---------------------------
// A balanced document attached to the wrong day is still wrong.
check(handoff.closeId === CLOSE_ID, 'the handoff names the close it was built from')
check(
  /^sha256:[0-9a-f]{64}$/.test(handoff.sourceCloseDigest),
  `and carries that close's digest, got ${handoff.sourceCloseDigest}`,
)
const closeExport = commerceDailyCloseExport(closed, CLOSE_ID)
check(Boolean(closeExport), 'the close export is produced too')
check(
  handoff.sourceCloseDigest === closeExport.digest,
  'and the digest matches the close export exactly, so the two artifacts describe one day',
)
check(
  commerceAccountingHandoff(closed, 'CLOSE-00000000-0000-4000-8000-000000000000') === null,
  'a handoff for a close that does not exist is refused rather than invented',
)

// --- the same close always produces the same document -------------------------
// An accountant re-downloading must not get a different set of numbers.
const again = commerceAccountingHandoff(closed, CLOSE_ID)
assert.deepEqual(again, handoff, 'the handoff is deterministic for a given close')
checks += 1

console.log(`commerce accounting balance contract: ${checks} checks passed`)
