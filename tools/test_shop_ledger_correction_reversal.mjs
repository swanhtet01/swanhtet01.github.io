// Ledger corrections are reversals, never edits. A credit correction posts
// DR sales_adjustment (+ tax reversal) / CR correction_payable; a debit
// correction posts DR correction_receivable / CR sales_adjustment (+ tax). Each
// is its own balanced entry linked to the close it reverses -- the original
// close entry is never mutated.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { buildShopLedgerJournal } from './shop-ledger-journal.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ledger-correction-entry.ts',
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

const D1 = `sha256:${'d'.repeat(64)}`
const D2 = `sha256:${'e'.repeat(64)}`
const cal = (subtotalMmk, taxMmk) => ({ schema: 'supermega.commerce.order-calculation.v2', currency: 'MMK', subtotalMmk, taxMmk, totalMmk: subtotalMmk + taxMmk })

const state = {
  orders: [
    { id: 'ORD-1', customer: 'Ma Thida', payment: 'Cash', total: 12000, paymentStatus: 'reconciled', refundStatus: 'none', status: 'completed', createdAt: '2026-07-15T03:00:00.000Z', calculation: cal(10000, 2000),
      corrections: [
        { documentId: 'CORR-CREDIT', kind: 'credit', createdAt: '2026-07-16T03:00:00.000Z', actor: 'Swan', evidenceReference: 'EV-CR', sourceCalculationDigest: D1, calculation: { subtotalMmk: 1000, taxMmk: 200, totalMmk: 1200 } },
        { documentId: 'CORR-DEBIT', kind: 'debit', createdAt: '2026-07-17T03:00:00.000Z', actor: 'Swan', evidenceReference: 'EV-DR', sourceCalculationDigest: D2, calculation: { subtotalMmk: 500, taxMmk: 100, totalMmk: 600 } },
      ] },
  ],
  closes: [
    { id: 'CLOSE-1', businessDate: '2026-07-15', orderIds: ['ORD-1'], total: 12000, actionId: 'ACT-CLOSE-1', operator: 'Swan', evidenceReference: 'EV-CLOSE-1' },
  ],
  purchaseOrders: [],
}

const journal = buildShopLedgerJournal(state)
check(journal !== null, 'journal builds')

const close = journal.entries.find((e) => e.source.kind === 'daily_close')
const corrections = journal.entries.filter((e) => e.source.kind === 'order_correction')
check(corrections.length === 2, 'both corrections produce their own entries')

function line(entry, role, side) { return entry.lines.find((l) => l.accountRole === role && l.side === side) }

// 1. Credit correction: reversal shape.
{
  const credit = corrections.find((e) => e.source.id === 'CORR-CREDIT')
  check(Boolean(line(credit, 'sales_adjustment', 'debit')), 'credit correction debits sales_adjustment')
  check(line(credit, 'sales_adjustment', 'debit').amountMmk === 1000, 'sales_adjustment debit is the subtotal')
  check(line(credit, 'tax_payable', 'debit').amountMmk === 200, 'tax is reversed on the debit side')
  check(line(credit, 'correction_payable', 'credit').amountMmk === 1200, 'correction_payable credit is the full corrected total')
  check(credit.reversalOfEntryId === close.entryId, 'credit correction links to the close it reverses')
  check(credit.source.artifactDigest === D1, 'credit correction carries its source calculation digest')
}

// 2. Debit correction: opposite reversal shape.
{
  const debit = corrections.find((e) => e.source.id === 'CORR-DEBIT')
  check(line(debit, 'correction_receivable', 'debit').amountMmk === 600, 'debit correction debits correction_receivable for the total')
  check(line(debit, 'sales_adjustment', 'credit').amountMmk === 500, 'sales_adjustment credit is the subtotal')
  check(line(debit, 'tax_payable', 'credit').amountMmk === 100, 'tax is added back on the credit side')
  check(debit.reversalOfEntryId === close.entryId, 'debit correction links to the close it reverses')
}

// 3. The corrections NEVER edit the close entry: it is still the pure original sale.
{
  check(close.lines.length === 3, 'close entry keeps exactly its three original lines')
  check(line(close, 'payment_clearing', 'debit').amountMmk === 12000, 'close still debits the full original 12000 cash')
  check(line(close, 'sales_revenue', 'credit').amountMmk === 10000, 'close still credits the original revenue')
  check(line(close, 'tax_payable', 'credit').amountMmk === 2000, 'close still credits the original tax')
  // No correction_payable / correction_receivable ever appears inside the close entry.
  check(!close.lines.some((l) => l.accountRole === 'correction_payable' || l.accountRole === 'correction_receivable'), 'close entry never absorbs a correction line')
}

// 4. Every correction entry balances on its own.
for (const entry of corrections) {
  const debit = entry.lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amountMmk, 0)
  const credit = entry.lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amountMmk, 0)
  check(debit === credit, `${entry.entryId} balances (${debit} = ${credit})`)
}

console.log(JSON.stringify({ ok: true, checks }))
