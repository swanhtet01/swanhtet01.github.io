// Ledger period lock: a business date with a close is a locked period. Events
// proved after that close post into the current OPEN period, carrying
// sourcePeriod back to the locked period they economically belong to -- the
// close entry itself is never rewritten. Mirrors how corrections already work.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { buildShopLedgerJournal } from './shop-ledger-journal.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ledger-lock-entry.ts',
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

const DIGEST = `sha256:${'c'.repeat(64)}`
const cal = (subtotalMmk, taxMmk) => ({ schema: 'supermega.commerce.order-calculation.v2', currency: 'MMK', subtotalMmk, taxMmk, totalMmk: subtotalMmk + taxMmk })

// A credit sale closed in July, then paid AND corrected in August (after the
// July period locked).
function stateWithLateEvents() {
  return {
    orders: [
      { id: 'ORD-CREDIT', customer: 'Daw Hla', payment: 'KBZPay', paymentDueAt: '2026-08-10T00:00:00.000Z', total: 20000, paymentStatus: 'reconciled', refundStatus: 'none', status: 'completed', createdAt: '2026-07-15T03:00:00.000Z',
        paymentReconciledAt: '2026-08-05T02:00:00.000Z', paymentReconciliationActionId: 'ACT-RECON-1', paymentReconciledBy: 'Swan', paymentEvidenceReference: 'EV-RECON-1',
        calculation: cal(20000, 0),
        corrections: [{ documentId: 'CORR-LATE', kind: 'debit', createdAt: '2026-08-06T03:00:00.000Z', actor: 'Swan', evidenceReference: 'EV-CORR-LATE', sourceCalculationDigest: DIGEST, calculation: { subtotalMmk: 1000, taxMmk: 0, totalMmk: 1000 } }] },
    ],
    closes: [
      { id: 'CLOSE-JUL', businessDate: '2026-07-15', orderIds: ['ORD-CREDIT'], total: 20000, actionId: 'ACT-CLOSE-JUL', operator: 'Swan', evidenceReference: 'EV-CLOSE-JUL' },
    ],
    purchaseOrders: [],
  }
}

const journal = buildShopLedgerJournal(stateWithLateEvents())
check(journal !== null, 'journal builds with late events')

const close = journal.entries.find((e) => e.source.kind === 'daily_close')
const reconciliation = journal.entries.find((e) => e.source.kind === 'payment_reconciliation')
const correction = journal.entries.find((e) => e.source.kind === 'order_correction')

// 1. The July close posts to the July period. It is a locked period.
check(close.businessDate === '2026-07-15', 'close carries its July business date')
check(close.postedPeriod === '2026-07', 'close posts to the July period')
check(close.sourcePeriod === undefined, 'a close has no sourcePeriod -- it IS the period')

// 2. The August reconciliation lands in the OPEN August period, linked back to July.
check(reconciliation.postedPeriod === '2026-08', 'post-close reconciliation posts into the open August period')
check(reconciliation.sourcePeriod === '2026-07', 'reconciliation carries sourcePeriod back to the locked July period')
check(reconciliation.businessDate === '2026-08-05', 'reconciliation business date is when the payment was proved')

// 3. The August correction also lands in August, linked to July, as a reversal.
check(correction.postedPeriod === '2026-08', 'post-close correction posts into the open August period')
check(correction.sourcePeriod === '2026-07', 'correction carries sourcePeriod back to July')
check(correction.reversalOfEntryId === close.entryId, 'correction links to the close it reverses, never edits it')

// 4. The locked close entry is untouched by the later events: still the pure sale.
check(close.lines.length === 2, 'close entry still has exactly its original two lines')
const closeReceivable = close.lines.find((l) => l.accountRole === 'accounts_receivable')
check(closeReceivable && closeReceivable.amountMmk === 20000, 'close still debits the full 20000 receivable, unmodified by the later payment or correction')
const closeRevenue = close.lines.find((l) => l.accountRole === 'sales_revenue')
check(closeRevenue && closeRevenue.amountMmk === 20000, 'close still credits the original revenue')

// 5. Same-period events do NOT carry a sourcePeriod (only cross-period ones do).
{
  const samePeriod = buildShopLedgerJournal({
    orders: [
      { id: 'ORD-SAME', customer: 'U Ba', payment: 'KBZPay', paymentDueAt: '2026-07-20T00:00:00.000Z', total: 10000, paymentStatus: 'reconciled', refundStatus: 'none', status: 'completed', createdAt: '2026-07-15T03:00:00.000Z', paymentReconciledAt: '2026-07-16T02:00:00.000Z', paymentReconciliationActionId: 'ACT-R', paymentReconciledBy: 'Swan', paymentEvidenceReference: 'EV-R', calculation: cal(10000, 0) },
    ],
    closes: [{ id: 'CLOSE-SAME', businessDate: '2026-07-15', orderIds: ['ORD-SAME'], total: 10000, actionId: 'ACT-CS', operator: 'Swan', evidenceReference: 'EV-CS' }],
    purchaseOrders: [],
  })
  const recon = samePeriod.entries.find((e) => e.source.kind === 'payment_reconciliation')
  check(recon.postedPeriod === '2026-07', 'same-period reconciliation posts to July')
  check(recon.sourcePeriod === undefined, 'same-period reconciliation carries no sourcePeriod')
}

console.log(JSON.stringify({ ok: true, checks }))
