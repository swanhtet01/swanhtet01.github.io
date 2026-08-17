// Accounting handoff v4: the v3 close handoff carried through unchanged, plus a
// digest-sealed general-ledger journal + trial balance. Pins that the v3 CSV
// still verifies byte-for-byte, that the journal CSV verifies against its own
// digest and refuses to serialise a tampered journal, and that the review-only
// posture (review_required / none / false) is preserved from v3.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedCommerce, reserveCommerceOrder, advanceCommerceOrder, reconcileCommercePayment,
      commerceCloseExpectation, saveCommerceClose,
      commerceAccountingHandoff, commerceAccountingHandoffCsv, commerceAccountingHandoffV4,
    } from './commerce-workspace.ts'
    export { shopLedgerJournalCsv, computeLedgerTrialBalance } from './shop-ledger-journal.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/handoff-v4-entry.ts',
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
})

const {
  createSeedCommerce, reserveCommerceOrder, advanceCommerceOrder, reconcileCommercePayment,
  commerceCloseExpectation, saveCommerceClose,
  commerceAccountingHandoff, commerceAccountingHandoffCsv, commerceAccountingHandoffV4,
  shopLedgerJournalCsv, computeLedgerTrialBalance,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Swan Htet'
const at = (hour) => `2026-07-24T${String(hour).padStart(2, '0')}:00:00.000Z`
const proof = (suffix, hour) => ({ actionId: `ACT-V4-${suffix}`, capturedAt: at(hour), actor: OPERATOR, reason: `Ledger v4 scenario ${suffix}`, evidenceReference: `V4-${suffix}` })

// Drive two real sales to completed + reconciled using product functions only.
function sell(state, { id, sku, name, variant, price, quantity, payment, suffix }) {
  let next = reserveCommerceOrder(state, {
    id, createdAt: at(9), customer: 'Ma Thida', owner: OPERATOR, channel: 'Counter',
    item: name, itemSku: sku, quantity, payment, paymentStatus: 'pending', refundStatus: 'none',
    fulfilment: 'pickup', fulfilmentReference: `Counter handoff ${suffix}`, promisedAt: at(18),
    total: price * quantity, status: 'confirmed', lines: [{ sku, name, variant, quantity, unitPriceMmk: price }],
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
let state = sell(seed, { id: 'ORD-V4-1', sku: sellable[0].sku, name: sellable[0].name, variant: sellable[0].variant, price: sellable[0].price, quantity: 2, payment: 'KBZPay', suffix: 'A' })
state = sell(state, { id: 'ORD-V4-2', sku: sellable[1].sku, name: sellable[1].name, variant: sellable[1].variant, price: sellable[1].price, quantity: 1, payment: 'Cash', suffix: 'B' })

const expectation = commerceCloseExpectation(state, at(14))
const CLOSE_ID = 'CLOSE-1A2B3C4D-5E6F-4A7B-8C9D-0E1F2A3B4C5D'
const closed = saveCommerceClose(state, CLOSE_ID, { actionId: 'ACT-1B2C3D4E-5F6A-4B7C-8D9E-0F1A2B3C4D5E', capturedAt: at(14), actor: OPERATOR, reason: 'End of trading day', evidenceReference: 'V4-CLOSE-1' }, expectation)
check(Boolean(closed), 'the close saves')

// --- v4 is produced and preserves the v3 review-only posture ------------------
const v4 = commerceAccountingHandoffV4(closed, CLOSE_ID)
check(Boolean(v4), 'the v4 handoff is produced')
check(v4.schema === 'supermega.commerce.accounting-handoff.v4', 'schema is v4')
check(v4.status === 'review_required', 'status is review_required, as in v3')
check(v4.postingAuthority === 'none', 'postingAuthority stays none')
check(v4.externalPostingPerformed === false, 'externalPostingPerformed stays false -- the device never claims a posted book')

// --- the v3 close handoff is carried through unchanged and still verifies ------
const v3 = commerceAccountingHandoff(closed, CLOSE_ID)
assert.deepEqual(v4.closeHandoff, v3, 'the v4 carries the v3 close handoff byte-for-byte')
checks += 1
check(v4.closeHandoff.schema === 'supermega.commerce.accounting-handoff.v3', 'the embedded close handoff is still v3')
const v3Csv = commerceAccountingHandoffCsv(v4.closeHandoff)
check(typeof v3Csv === 'string' && v3Csv.includes('supermega.commerce.accounting-handoff.v3'), 'the v3 CSV still serialises and verifies against its own digest')

// --- the ledger section: digest-sealed journal + balancing trial balance ------
const journal = v4.ledger.journal
check(journal.schema === 'supermega.shop.ledger-journal.v1', 'the ledger journal schema is v1')
check(/^sha256:[0-9a-f]{64}$/.test(journal.digest), 'the journal is digest-sealed')
check(journal.totalDebitMmk === journal.totalCreditMmk, `the journal balances: ${journal.totalDebitMmk} = ${journal.totalCreditMmk}`)
check(journal.entries.some((e) => e.source.kind === 'daily_close' && e.source.id === CLOSE_ID), 'the ledger carries a daily_close entry for this close')

const tb = v4.ledger.trialBalance
check(tb.totalDebitMmk === tb.totalCreditMmk, `the trial balance balances: ${tb.totalDebitMmk} = ${tb.totalCreditMmk}`)
assert.deepEqual(computeLedgerTrialBalance(journal), tb, 'the embedded trial balance matches the journal it summarises')
checks += 1

// --- CSV integrity: it verifies, and refuses a tampered journal ---------------
const journalCsv = shopLedgerJournalCsv(journal)
check(journalCsv.includes('supermega.shop.ledger-journal.v1') && journalCsv.includes(journal.digest), 'the ledger journal CSV serialises with its sealed digest')
check(journalCsv.split('\r\n').filter(Boolean).length >= 1 + journal.entries.reduce((n, e) => n + e.lines.length, 0), 'the CSV carries a row per journal line plus a header')
{
  const tampered = { ...journal, totalDebitMmk: journal.totalDebitMmk + 1 }
  assert.throws(() => shopLedgerJournalCsv(tampered), /integrity check failed/, 'a tampered journal is refused by the CSV, never silently serialised')
  checks += 1
}

// --- v4 fails closed for a close that does not exist --------------------------
check(commerceAccountingHandoffV4(closed, 'CLOSE-00000000-0000-4000-8000-000000000000') === null, 'v4 is refused for a non-existent close, never invented')

console.log(JSON.stringify({ ok: true, checks }))
