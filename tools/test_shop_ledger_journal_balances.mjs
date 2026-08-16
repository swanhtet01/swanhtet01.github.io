// Ledger journal: every entry balances, the whole journal balances, and an
// imbalance fails closed -- naming the offending source id, emitting no partial
// ledger. A double-entry projection that does not balance cannot be handed to an
// accountant; this is the guard that refuses to build one.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      buildShopLedgerJournal, buildShopLedgerJournalEntries,
      finalizeShopLedgerJournal, ledgerJournalControlTotalSourceId,
    } from './shop-ledger-journal.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ledger-balances-entry.ts',
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
})

const {
  buildShopLedgerJournal, buildShopLedgerJournalEntries,
  finalizeShopLedgerJournal, ledgerJournalControlTotalSourceId,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const DIGEST = `sha256:${'a'.repeat(64)}`
const cal = (subtotalMmk, taxMmk) => ({ schema: 'supermega.commerce.order-calculation.v2', currency: 'MMK', subtotalMmk, taxMmk, totalMmk: subtotalMmk + taxMmk })

// A state that exercises all seven source kinds at once.
function richState() {
  return {
    orders: [
      { id: 'ORD-CASH', customer: 'Ma Thida', payment: 'Cash', total: 12000, paymentStatus: 'reconciled', refundStatus: 'none', status: 'completed', createdAt: '2026-07-15T03:00:00.000Z', calculation: cal(10000, 2000),
        corrections: [{ documentId: 'CORR-1', kind: 'credit', createdAt: '2026-07-16T03:00:00.000Z', actor: 'Swan', evidenceReference: 'EV-CORR-1', sourceCalculationDigest: DIGEST, calculation: { subtotalMmk: 1000, taxMmk: 200, totalMmk: 1200 } }] },
      { id: 'ORD-KBZ', customer: 'Ko Aung', payment: 'KBZPay', total: 22000, paymentStatus: 'reconciled', refundStatus: 'none', status: 'completed', createdAt: '2026-07-15T03:10:00.000Z', calculation: cal(20000, 2000) },
      { id: 'ORD-CREDIT-OPEN', customer: 'Daw Hla', payment: 'Cash', paymentDueAt: '2026-08-01T00:00:00.000Z', total: 30000, paymentStatus: 'pending', refundStatus: 'none', status: 'preparing', createdAt: '2026-07-15T03:20:00.000Z', calculation: cal(28000, 2000) },
      { id: 'ORD-CREDIT-PAID', customer: 'U Ba', payment: 'KBZPay', paymentDueAt: '2026-07-20T00:00:00.000Z', total: 15000, paymentStatus: 'reconciled', refundStatus: 'none', status: 'completed', createdAt: '2026-07-15T03:30:00.000Z', paymentReconciledAt: '2026-07-16T02:00:00.000Z', paymentReconciliationActionId: 'ACT-RECON-1', paymentReconciledBy: 'Swan', paymentEvidenceReference: 'EV-RECON-1', calculation: cal(15000, 0) },
      { id: 'ORD-REFUND', customer: 'Ma Nu', payment: 'Cash', total: 5000, paymentStatus: 'reconciled', refundStatus: 'settled', refundSettledAt: '2026-07-16T04:00:00.000Z', refundSettlementActionId: 'ACT-REFUND-1', refundSettledBy: 'Swan', refundEvidenceReference: 'EV-REFUND-1', status: 'completed', createdAt: '2026-07-15T03:40:00.000Z', calculation: cal(5000, 0) },
    ],
    closes: [
      { id: 'CLOSE-1', businessDate: '2026-07-15', orderIds: ['ORD-CASH', 'ORD-KBZ', 'ORD-CREDIT-OPEN', 'ORD-CREDIT-PAID', 'ORD-REFUND'], total: 84000, actionId: 'ACT-CLOSE-1', operator: 'Swan', evidenceReference: 'EV-CLOSE-1',
        settlement: { schema: 'supermega.commerce.close-settlement.v1', status: 'variance_review', totalExpectedMmk: 17000, totalCountedMmk: 16500, totalVarianceMmk: -500, lines: [{ paymentMethod: 'Cash', expectedMmk: 17000, countedMmk: 16500, varianceMmk: -500, status: 'variance_review', varianceOwner: 'Ma Thida', varianceReason: 'short till' }] } },
    ],
    purchaseOrders: [
      { id: 'PO-1', supplier: 'Yangon Supply', sku: 'SKU-1', createdAt: '2026-07-10T03:00:00.000Z', quantityOrdered: 10, creation: { actionId: 'ACT-PO-1', capturedAt: '2026-07-10T03:00:00.000Z', actor: 'Swan', reason: 'restock', evidenceReference: 'EV-PO-1' },
        supplierInvoice: { id: 'INV-1', supplierReference: 'S-INV-1', issuedAt: '2026-07-12T03:00:00.000Z', dueAt: '2026-08-12T00:00:00.000Z', quantityInvoiced: 10, unitCostMmk: 4000, totalMmk: 40000, recording: { actionId: 'ACT-INV-1', capturedAt: '2026-07-12T03:00:00.000Z', actor: 'Swan', reason: 'invoice', evidenceReference: 'EV-INV-1' }, payableReview: { actionId: 'ACT-PAY-1', capturedAt: '2026-07-13T03:00:00.000Z', actor: 'Swan', reason: 'payable', evidenceReference: 'EV-PAY-1' } },
        supplierReturns: [{ id: 'RET-1', createdAt: '2026-07-14T03:00:00.000Z', receiptMovementId: 'MOV-1', quantityRejected: 1, reasonCode: 'damaged', claimAmountMmk: 5000, internalReturnReference: 'IR-1', physicalReturnStatus: 'not_dispatched', supplierContacted: false, accountingPosted: false, authorization: { actionId: 'ACT-RET-1', capturedAt: '2026-07-14T03:00:00.000Z', actor: 'Swan', reason: 'return', evidenceReference: 'EV-RET-1' }, creditNotes: [{ id: 'SCN-1', supplierReference: 'S-CN-1', issuedAt: '2026-07-15T03:00:00.000Z', amountMmk: 5000, accountingPosted: false, recording: { actionId: 'ACT-SCN-1', capturedAt: '2026-07-15T03:00:00.000Z', actor: 'Swan', reason: 'credit note', evidenceReference: 'EV-SCN-1' } }] }] },
    ],
  }
}

function entryDebit(entry) { return entry.lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amountMmk, 0) }
function entryCredit(entry) { return entry.lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amountMmk, 0) }

// 1. Empty state → an empty but valid journal, never null.
{
  const journal = buildShopLedgerJournal({ orders: [], closes: [], purchaseOrders: [] })
  check(journal !== null, 'empty state yields a journal, not null')
  check(journal.entries.length === 0, 'empty state has no entries')
  check(journal.totalDebitMmk === 0 && journal.totalCreditMmk === 0, 'empty totals are zero')
  check(/^sha256:[0-9a-f]{64}$/.test(journal.digest), 'empty journal is still digest-sealed')
}

// 2. Every entry balances, and the whole journal balances.
{
  const journal = buildShopLedgerJournal(richState())
  check(journal !== null, 'rich state builds a journal')
  check(journal.entries.length >= 7, `all seven source kinds produce entries, got ${journal.entries.length}`)
  for (const entry of journal.entries) {
    check(entryDebit(entry) === entryCredit(entry), `${entry.entryId} balances (${entryDebit(entry)} = ${entryCredit(entry)})`)
    check(entry.lines.every((l) => Number.isSafeInteger(l.amountMmk) && l.amountMmk > 0), `${entry.entryId}: every line is a whole positive MMK amount`)
  }
  check(journal.totalDebitMmk === journal.totalCreditMmk, `journal balances: ${journal.totalDebitMmk} = ${journal.totalCreditMmk}`)
  check(journal.currency === 'MMK', 'currency is MMK')
  check(ledgerJournalControlTotalSourceId(journal.entries) === null, 'control total finds no imbalance in a good journal')
}

// 3. Deterministic: same state → identical journal.
{
  const a = buildShopLedgerJournal(richState())
  const b = buildShopLedgerJournal(richState())
  assert.deepEqual(a, b, 'the journal is deterministic for a given state')
  checks += 1
}

// 4. Imbalance fails closed and names the offending source id.
{
  const entries = buildShopLedgerJournalEntries(richState())
  check(finalizeShopLedgerJournal(entries) !== null, 'the untampered entry set finalizes')
  const tampered = JSON.parse(JSON.stringify(entries))
  const victim = tampered.find((e) => e.source.kind === 'daily_close')
  check(Boolean(victim), 'there is a daily_close entry to tamper')
  victim.lines[0].amountMmk += 1 // break the balance
  check(ledgerJournalControlTotalSourceId(tampered) === victim.source.id, 'control total names the offending source id')
  check(finalizeShopLedgerJournal(tampered) === null, 'an imbalanced entry set refuses to emit -- no partial ledger')
}

// 5. Corrections and settlement variance keep their own paired shape balanced.
{
  const journal = buildShopLedgerJournal(richState())
  const correction = journal.entries.find((e) => e.source.kind === 'order_correction')
  check(entryDebit(correction) === entryCredit(correction), 'credit correction reversal pair balances')
  const settlement = journal.entries.find((e) => e.source.kind === 'close_settlement')
  check(entryDebit(settlement) === entryCredit(settlement), 'settlement variance pair balances')
}

console.log(JSON.stringify({ ok: true, checks }))
