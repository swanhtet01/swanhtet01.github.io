// Ledger journal: every line traces to a real event. A line with no source
// event cannot be constructed -- the type has no optional source -- so this
// pins that every entry carries a source kind + id, that close and correction
// sources are digest-sealed, and that all seven v1 sources actually appear.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { buildShopLedgerJournal } from './shop-ledger-journal.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ledger-sources-entry.ts',
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
})

const { buildShopLedgerJournal } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const DIGEST = `sha256:${'b'.repeat(64)}`
const cal = (subtotalMmk, taxMmk) => ({ schema: 'supermega.commerce.order-calculation.v2', currency: 'MMK', subtotalMmk, taxMmk, totalMmk: subtotalMmk + taxMmk })

const state = {
  orders: [
    { id: 'ORD-CASH', customer: 'Ma Thida', payment: 'Cash', total: 12000, paymentStatus: 'reconciled', refundStatus: 'none', status: 'completed', createdAt: '2026-07-15T03:00:00.000Z', calculation: cal(10000, 2000),
      corrections: [{ documentId: 'CORR-1', kind: 'credit', createdAt: '2026-07-16T03:00:00.000Z', actor: 'Swan', evidenceReference: 'EV-CORR-1', sourceCalculationDigest: DIGEST, calculation: { subtotalMmk: 1000, taxMmk: 200, totalMmk: 1200 } }] },
    { id: 'ORD-CREDIT-PAID', customer: 'U Ba', payment: 'KBZPay', paymentDueAt: '2026-07-20T00:00:00.000Z', total: 15000, paymentStatus: 'reconciled', refundStatus: 'none', status: 'completed', createdAt: '2026-07-15T03:30:00.000Z', paymentReconciledAt: '2026-07-16T02:00:00.000Z', paymentReconciliationActionId: 'ACT-RECON-1', paymentReconciledBy: 'Swan', paymentEvidenceReference: 'EV-RECON-1', calculation: cal(15000, 0) },
    { id: 'ORD-REFUND', customer: 'Ma Nu', payment: 'Cash', total: 5000, paymentStatus: 'reconciled', refundStatus: 'settled', refundSettledAt: '2026-07-16T04:00:00.000Z', refundSettlementActionId: 'ACT-REFUND-1', refundSettledBy: 'Swan', refundEvidenceReference: 'EV-REFUND-1', status: 'completed', createdAt: '2026-07-15T03:40:00.000Z', calculation: cal(5000, 0) },
  ],
  closes: [
    { id: 'CLOSE-1', businessDate: '2026-07-15', orderIds: ['ORD-CASH', 'ORD-CREDIT-PAID', 'ORD-REFUND'], total: 32000, actionId: 'ACT-CLOSE-1', operator: 'Swan', evidenceReference: 'EV-CLOSE-1',
      settlement: { schema: 'supermega.commerce.close-settlement.v1', status: 'variance_review', totalExpectedMmk: 17000, totalCountedMmk: 17300, totalVarianceMmk: 300, lines: [{ paymentMethod: 'Cash', expectedMmk: 17000, countedMmk: 17300, varianceMmk: 300, status: 'variance_review', varianceOwner: 'Ma Thida', varianceReason: 'over' }] } },
  ],
  purchaseOrders: [
    { id: 'PO-1', supplier: 'Yangon Supply', sku: 'SKU-1', createdAt: '2026-07-10T03:00:00.000Z', quantityOrdered: 10, creation: { actionId: 'ACT-PO-1', capturedAt: '2026-07-10T03:00:00.000Z', actor: 'Swan', reason: 'restock', evidenceReference: 'EV-PO-1' },
      supplierInvoice: { id: 'INV-1', supplierReference: 'S-INV-1', issuedAt: '2026-07-12T03:00:00.000Z', dueAt: '2026-08-12T00:00:00.000Z', quantityInvoiced: 10, unitCostMmk: 4000, totalMmk: 40000, recording: { actionId: 'ACT-INV-1', capturedAt: '2026-07-12T03:00:00.000Z', actor: 'Swan', reason: 'invoice', evidenceReference: 'EV-INV-1' }, payableReview: { actionId: 'ACT-PAY-1', capturedAt: '2026-07-13T03:00:00.000Z', actor: 'Swan', reason: 'payable', evidenceReference: 'EV-PAY-1' } },
      supplierReturns: [{ id: 'RET-1', createdAt: '2026-07-14T03:00:00.000Z', receiptMovementId: 'MOV-1', quantityRejected: 1, reasonCode: 'damaged', claimAmountMmk: 5000, internalReturnReference: 'IR-1', physicalReturnStatus: 'not_dispatched', supplierContacted: false, accountingPosted: false, authorization: { actionId: 'ACT-RET-1', capturedAt: '2026-07-14T03:00:00.000Z', actor: 'Swan', reason: 'return', evidenceReference: 'EV-RET-1' }, creditNotes: [{ id: 'SCN-1', supplierReference: 'S-CN-1', issuedAt: '2026-07-15T03:00:00.000Z', amountMmk: 5000, accountingPosted: false, recording: { actionId: 'ACT-SCN-1', capturedAt: '2026-07-15T03:00:00.000Z', actor: 'Swan', reason: 'credit note', evidenceReference: 'EV-SCN-1' } }] }] },
  ],
}

const KINDS = new Set(['daily_close', 'close_settlement', 'order_correction', 'refund_settlement', 'payment_reconciliation', 'supplier_invoice', 'supplier_credit_note'])
const journal = buildShopLedgerJournal(state)
check(journal !== null, 'journal builds')

// 1. Every entry carries a real source; every line carries account + role + memo.
const seenKinds = new Set()
for (const entry of journal.entries) {
  check(KINDS.has(entry.source.kind), `${entry.entryId}: source kind is one of the seven (${entry.source.kind})`)
  check(typeof entry.source.id === 'string' && entry.source.id.length > 0, `${entry.entryId}: source id is present`)
  check(typeof entry.actor === 'string' && entry.actor.length > 0, `${entry.entryId}: names an accountable actor`)
  check(typeof entry.evidenceReference === 'string', `${entry.entryId}: carries an evidence reference`)
  seenKinds.add(entry.source.kind)
  check(entry.lines.length > 0, `${entry.entryId}: has at least one line`)
  for (const line of entry.lines) {
    check(typeof line.accountCode === 'string' && line.accountCode.length > 0, `${line.lineId}: has an account code`)
    check(typeof line.accountRole === 'string' && line.accountRole.length > 0, `${line.lineId}: has an account role`)
    check(line.side === 'debit' || line.side === 'credit', `${line.lineId}: has a side`)
    check(typeof line.memo === 'string' && line.memo.length > 0, `${line.lineId}: carries a memo`)
    // Every line id is namespaced under its entry id -- no line exists outside an entry (which carries the source).
    check(line.lineId.startsWith(entry.entryId), `${line.lineId}: is bound to its entry ${entry.entryId}`)
  }
}

// 2. All seven v1 sources actually appear.
for (const kind of KINDS) check(seenKinds.has(kind), `source kind present: ${kind}`)

// 3. Close and correction sources are digest-sealed; their digests are real sha256.
for (const entry of journal.entries) {
  if (entry.source.kind === 'daily_close' || entry.source.kind === 'order_correction') {
    check(/^sha256:[0-9a-f]{64}$/.test(entry.source.artifactDigest ?? ''), `${entry.entryId}: digest-sealed source (${entry.source.artifactDigest})`)
  } else {
    check(entry.source.artifactDigest === null, `${entry.entryId}: non-sealed source declares a null digest rather than inventing one`)
  }
}

// 4. The correction entry's digest is exactly the source calculation digest it came from.
{
  const correction = journal.entries.find((e) => e.source.kind === 'order_correction')
  check(correction.source.id === 'CORR-1', 'correction source id is the correction document id')
  check(correction.source.artifactDigest === DIGEST, 'correction carries the exact source calculation digest')
}

// 5. The daily_close source id is the close id it was promoted from.
{
  const close = journal.entries.find((e) => e.source.kind === 'daily_close')
  check(close.source.id === 'CLOSE-1', 'daily_close source id is the close id')
}

console.log(JSON.stringify({ ok: true, checks }))
