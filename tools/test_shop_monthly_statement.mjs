// Monthly statement: owner language, and it TIES. "Customers owe you" equals the
// AR aging brief; "You owe suppliers" equals the AP aging brief; the ledger
// trial balance balances and its role balances back the statement. The kept
// line is "kept before other costs", never "profit".
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { buildShopLedgerJournal, computeLedgerTrialBalance, ledgerRoleBalanceMmk } from './shop-ledger-journal.ts'
      export { projectShopMonthlyStatement } from './shop-monthly-statement.ts'
      export { projectShopArAgingSummary } from './shop-ar-aging-summary.ts'
      export { projectShopApAgingSummary } from './shop-ap-aging-summary.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/monthly-statement-entry.ts',
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
})

const {
  buildShopLedgerJournal, computeLedgerTrialBalance, ledgerRoleBalanceMmk,
  projectShopMonthlyStatement, projectShopArAgingSummary, projectShopApAgingSummary,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ASOF = '2026-07-31T12:00:00.000Z'
const DIGEST = `sha256:${'f'.repeat(64)}`
const cal = (subtotalMmk, taxMmk) => ({ schema: 'supermega.commerce.order-calculation.v2', currency: 'MMK', subtotalMmk, taxMmk, totalMmk: subtotalMmk + taxMmk })

// Cash sale (with a credit correction), an OPEN credit sale (stays in AR), a
// PAID credit sale (AR cleared), a refund, and one reviewed supplier invoice.
const state = {
  orders: [
    { id: 'ORD-CASH', customer: 'Ma Thida', payment: 'Cash', total: 12000, paymentStatus: 'reconciled', refundStatus: 'none', status: 'completed', createdAt: '2026-07-15T03:00:00.000Z', calculation: cal(10000, 2000),
      corrections: [{ documentId: 'CORR-1', kind: 'credit', createdAt: '2026-07-16T03:00:00.000Z', actor: 'Swan', evidenceReference: 'EV-CORR-1', sourceCalculationDigest: DIGEST, calculation: { subtotalMmk: 1000, taxMmk: 200, totalMmk: 1200 } }] },
    { id: 'ORD-CREDIT-OPEN', customer: 'Daw Hla', payment: 'KBZPay', paymentDueAt: '2026-08-10T00:00:00.000Z', total: 30000, paymentStatus: 'pending', refundStatus: 'none', status: 'preparing', createdAt: '2026-07-15T03:20:00.000Z', calculation: cal(30000, 0) },
    { id: 'ORD-CREDIT-PAID', customer: 'U Ba', payment: 'Cash', paymentDueAt: '2026-07-20T00:00:00.000Z', total: 15000, paymentStatus: 'reconciled', refundStatus: 'none', status: 'completed', createdAt: '2026-07-15T03:30:00.000Z', paymentReconciledAt: '2026-07-18T02:00:00.000Z', paymentReconciliationActionId: 'ACT-RECON-1', paymentReconciledBy: 'Swan', paymentEvidenceReference: 'EV-RECON-1', calculation: cal(15000, 0) },
    { id: 'ORD-REFUND', customer: 'Ma Nu', payment: 'Cash', total: 5000, paymentStatus: 'reconciled', refundStatus: 'settled', refundSettledAt: '2026-07-19T04:00:00.000Z', refundSettlementActionId: 'ACT-REFUND-1', refundSettledBy: 'Swan', refundEvidenceReference: 'EV-REFUND-1', status: 'completed', createdAt: '2026-07-15T03:40:00.000Z', calculation: cal(5000, 0) },
  ],
  closes: [
    { id: 'CLOSE-1', businessDate: '2026-07-15', orderIds: ['ORD-CASH', 'ORD-CREDIT-OPEN', 'ORD-CREDIT-PAID', 'ORD-REFUND'], total: 62000, actionId: 'ACT-CLOSE-1', operator: 'Swan', evidenceReference: 'EV-CLOSE-1' },
  ],
  purchaseOrders: [
    { id: 'PO-1', supplier: 'Yangon Supply', sku: 'SKU-1', createdAt: '2026-07-10T03:00:00.000Z', quantityOrdered: 10, creation: { actionId: 'ACT-PO-1', capturedAt: '2026-07-10T03:00:00.000Z', actor: 'Swan', reason: 'restock', evidenceReference: 'EV-PO-1' },
      supplierInvoice: { id: 'INV-1', supplierReference: 'S-INV-1', issuedAt: '2026-07-12T03:00:00.000Z', dueAt: '2026-08-12T00:00:00.000Z', quantityInvoiced: 10, unitCostMmk: 4000, totalMmk: 40000, recording: { actionId: 'ACT-INV-1', capturedAt: '2026-07-12T03:00:00.000Z', actor: 'Swan', reason: 'invoice', evidenceReference: 'EV-INV-1' }, payableReview: { actionId: 'ACT-PAY-1', capturedAt: '2026-07-13T03:00:00.000Z', actor: 'Swan', reason: 'payable', evidenceReference: 'EV-PAY-1' } } },
  ],
}

const journal = buildShopLedgerJournal(state)
check(journal !== null, 'journal builds')
const arAging = projectShopArAgingSummary(state, ASOF)
const apAging = projectShopApAgingSummary(state, ASOF)
const statement = projectShopMonthlyStatement(journal, arAging, apAging, { asOf: ASOF })

// 1. The balance snapshot ties to the AR and AP aging briefs exactly.
check(arAging.totalOutstandingMmk === 30000, `AR brief totals the one open credit sale, got ${arAging.totalOutstandingMmk}`)
check(apAging.totalPayableMmk === 40000, `AP brief totals the reviewed invoice, got ${apAging.totalPayableMmk}`)
check(statement.balance.customersOweYouMmk === arAging.totalOutstandingMmk, '"Customers owe you" ties to the AR aging brief')
check(statement.balance.youOweSuppliersMmk === apAging.totalPayableMmk, '"You owe suppliers" ties to the AP aging brief')
check(statement.tiesToAgingBriefs === true, 'the statement reports that it ties to the briefs')

// 2. The trial balance balances and its role balances back the statement.
{
  const tb = computeLedgerTrialBalance(journal)
  check(tb.totalDebitMmk === tb.totalCreditMmk, `trial balance balances: ${tb.totalDebitMmk} = ${tb.totalCreditMmk}`)
  check(ledgerRoleBalanceMmk(tb, 'accounts_receivable') === statement.balance.customersOweYouMmk, 'AR trial-balance role backs the statement')
  check(ledgerRoleBalanceMmk(tb, 'accounts_payable') === statement.balance.youOweSuppliersMmk, 'AP trial-balance role backs the statement')
}

// 3. Owner-language P&L arithmetic.
{
  const { pnl } = statement
  check(pnl.soldMmk === 60000, `what you sold = 60000, got ${pnl.soldMmk}`)
  check(pnl.gaveBackMmk === 6000, `what you gave back = refund 5000 + credit correction 1000 = 6000, got ${pnl.gaveBackMmk}`)
  check(pnl.boughtMmk === 40000, `what you bought = 40000, got ${pnl.boughtMmk}`)
  check(pnl.tillDifferencesMmk === 0, 'no settlement variance → zero till differences')
  check(pnl.keptBeforeOtherCostsMmk === 60000 - 6000 - 40000, `kept before other costs = 14000, got ${pnl.keptBeforeOtherCostsMmk}`)
  // The field is named "keptBeforeOtherCosts" -- there is deliberately no "profit" field.
  check(!('profitMmk' in pnl) && !('profit' in pnl), 'the statement never presents a "profit" figure')
}

// 4. Balance snapshot details.
{
  check(statement.balance.taxCollectedNotPaidMmk === 1800, `tax collected (2000) net of the correction reversal (200) = 1800, got ${statement.balance.taxCollectedNotPaidMmk}`)
  check(statement.balance.cashAndWalletsTotalMmk === 27000, `cash and wallets = drawer 17000 + credit paid 15000 - refund 5000 = 27000, got ${statement.balance.cashAndWalletsTotalMmk}`)
  check(statement.balance.cashAndWallets.every((row) => typeof row.name === 'string' && row.name.length > 0), 'each cash account has an owner-readable name')
  check(statement.hasActivity === true, 'the statement reports activity')
  check(statement.currency === 'MMK', 'MMK only')
}

// 5. A statement whose ledger disagrees with the briefs says so (tie is checked, not assumed).
{
  const wrongAr = { ...arAging, totalOutstandingMmk: 999 }
  const untied = projectShopMonthlyStatement(journal, wrongAr, apAging, { asOf: ASOF })
  check(untied.tiesToAgingBriefs === false, 'a mismatch against the AR brief is reported as untied, never hidden')
}

// 6. Empty ledger → an honest "nothing yet" statement, no crash.
{
  const empty = buildShopLedgerJournal({ orders: [], closes: [], purchaseOrders: [] })
  const emptyStatement = projectShopMonthlyStatement(empty, projectShopArAgingSummary({ orders: [] }, ASOF), projectShopApAgingSummary({ orders: [], purchaseOrders: [] }, ASOF), { asOf: ASOF })
  check(emptyStatement.hasActivity === false, 'empty ledger → hasActivity false')
  check(emptyStatement.pnl.keptBeforeOtherCostsMmk === 0, 'empty ledger → kept before other costs is zero')
  check(emptyStatement.balance.customersOweYouMmk === 0 && emptyStatement.balance.youOweSuppliersMmk === 0, 'empty ledger → nothing owed either way')
  check(emptyStatement.tiesToAgingBriefs === true, 'empty ledger trivially ties (0 = 0)')
}

console.log(JSON.stringify({ ok: true, checks }))
