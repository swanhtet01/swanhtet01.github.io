import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  RECONCILIATION_LIMITS,
  buildDecisionBrief,
  buildEvidence,
  buildExceptionsCsv,
  buildReconciliationCsv,
  parseCsv,
  parseDataset,
  parseDate,
  parseMoney,
  reconcileDatasets,
  suggestMappings,
} from './public-workcells/payment-reconciler.mjs'

let checks = 0
function check(condition, message) {
  assert.ok(condition, message)
  checks += 1
}

function sampleRun() {
  const invoices = parseDataset('invoice_no,customer_name,invoice_date,amount\r\nINV-1001,Aye Aye,2026-07-10,125000\r\nINV-1002,Ko Min,2026-07-11,88000\r\nINV-1003,May Store,2026-07-12,220000\r\nINV-1004,Lotus Cafe,2026-07-12,54000\r\nINV-1005,Shwe Mart,2026-07-13,150000\r\n', 'invoices.csv')
  const payments = parseDataset('invoice_ref,payer_name,payment_date,paid_amount\r\nINV-1001,Aye Aye,2026-07-10,125000\r\nINV-1002,Ko Min,2026-07-11,80000\r\n,May Store,2026-07-13,220000\r\nTX-889,Lotus Cafe,2026-07-12,54000\r\nEXTRA-77,Walk in,2026-07-13,45000\r\n', 'payments.csv')
  return reconcileDatasets(invoices, payments, {
    tolerance: 0,
    dateWindowDays: 3,
    dateOrder: 'day-first',
    invoiceMapping: suggestMappings(invoices, 'invoice'),
    paymentMapping: suggestMappings(payments, 'payment'),
  })
}

check(RECONCILIATION_LIMITS.maxFileBytes === 10 * 1024 * 1024, 'file size limit drifted')
check(RECONCILIATION_LIMITS.maxRowsPerFile === 50000, 'row limit drifted')

const quoted = parseCsv('reference,note\r\nINV-1,"line one\r\nline two"\r\n')
check(quoted.length === 2, 'quoted multiline CSV changed row count')
check(quoted[1][1] === 'line one\r\nline two'.replace(/\r\n?/g, '\n'), 'quoted multiline CSV did not preserve the field')

const duplicateHeaders = parseDataset('Amount,Amount\r\n1,2\r\n', 'duplicate.csv')
check(duplicateHeaders.headers.map((header) => header.name).join(',') === 'amount,amount_2', 'duplicate headers were not made unique')

const json = parseDataset('{"payments":[{"Reference":"TX-1","Amount":10}]}', 'payments.json')
check(json.kind === 'json' && json.rows.length === 1, 'JSON envelope was not parsed')
check(json.headers.some((header) => header.name === 'reference'), 'JSON headers were not normalized')

check(parseMoney('Ks 1,250').number === 1250, 'MMK amount parsing failed')
check(parseMoney('(500)').number === -500, 'parenthesized negative parsing failed')
check(parseMoney('1O0').valid === false, 'invalid amount was accepted')
check(parseDate('07/08/2026', 'day-first').iso === '2026-08-07', 'day-first date parsing failed')
check(parseDate('07/08/2026', 'month-first').iso === '2026-07-08', 'month-first date parsing failed')

const result = sampleRun()
check(result.summary.invoiceRows === 5 && result.summary.paymentRows === 5, 'sample source counts changed')
check(result.summary.exactMatches === 1, 'exact reference matching failed')
check(result.summary.suggestedMatches === 2, 'mutual-unique suggestions failed')
check(result.summary.amountMismatches === 1, 'amount mismatch was not isolated')
check(result.summary.unmatchedInvoices === 1 && result.summary.unmatchedPayments === 1, 'unmatched rows were not retained')
check(result.summary.invoiceTotal === 637000 && result.summary.paymentTotal === 524000, 'source totals are wrong')
check(result.summary.exactMatchedTotal === 125000 && result.summary.suggestedTotal === 274000, 'match totals are wrong')
check(result.reconciliationRows.length === 6, 'a source row disappeared or was duplicated in reconciliation output')
check(result.actions.length <= 5 && result.actions[0].priority === 'high', 'ranked review is not bounded or prioritized')

const ambiguousInvoices = parseDataset('ref,customer,date,amount\r\nA,One,2026-07-10,100\r\nB,Two,2026-07-10,100\r\n', 'invoices.csv')
const ambiguousPayments = parseDataset('ref,payer,date,amount\r\n,Unknown,2026-07-10,100\r\n', 'payments.csv')
const ambiguous = reconcileDatasets(ambiguousInvoices, ambiguousPayments, {
  invoiceMapping: { reference: 'ref', party: 'customer', date: 'date', amount: 'amount' },
  paymentMapping: { reference: 'ref', party: 'payer', date: 'date', amount: 'amount' },
  tolerance: 0,
  dateWindowDays: 3,
  dateOrder: 'day-first',
})
check(ambiguous.summary.suggestedMatches === 0, 'ambiguous candidate was auto-suggested')
check(ambiguous.summary.unmatchedInvoices === 2 && ambiguous.summary.unmatchedPayments === 1, 'ambiguous rows were not retained')

const duplicateInvoices = parseDataset('ref,amount\r\nDUP,10\r\nDUP,10\r\n', 'invoices.csv')
const duplicatePayments = parseDataset('ref,amount\r\nDUP,10\r\n', 'payments.csv')
const duplicates = reconcileDatasets(duplicateInvoices, duplicatePayments, {
  invoiceMapping: { reference: 'ref', amount: 'amount' },
  paymentMapping: { reference: 'ref', amount: 'amount' },
})
check(duplicates.summary.exactMatches === 0, 'duplicate invoice reference entered exact matching')
check(duplicates.summary.duplicateReferences === 1, 'duplicate reference group was not surfaced')

const formulaInvoices = parseDataset('ref,amount\r\n=2+2,10\r\n', 'invoices.csv')
const formulaPayments = parseDataset('ref,amount\r\n=2+2,10\r\n', 'payments.csv')
const formulaResult = reconcileDatasets(formulaInvoices, formulaPayments, {
  invoiceMapping: { reference: 'ref', amount: 'amount' },
  paymentMapping: { reference: 'ref', amount: 'amount' },
})
check(buildReconciliationCsv(formulaResult).includes("'=2+2"), 'spreadsheet formula was not neutralized')

const context = {
  runId: 'REC-TEST-001',
  generatedAt: '2026-07-15T00:00:00.000Z',
  sourceFiles: [
    { role: 'invoice', name: 'invoices.csv', sha256: 'a'.repeat(64), rows: 5, columns: 4 },
    { role: 'payment', name: 'payments.csv', sha256: 'b'.repeat(64), rows: 5, columns: 4 },
  ],
}
const approval = { name: 'Owner', note: 'Reviewed exceptions.', approvedAt: '2026-07-15T00:10:00.000Z', disposition: 'reviewed_with_exceptions' }
const brief = buildDecisionBrief(result, context, approval)
check(brief.includes('no payment, invoice, message, or books entry was changed'), 'decision brief lost the no-write boundary')
check(brief.includes('Reviewed by: Owner'), 'decision brief lost named approval')
check(buildExceptionsCsv(result).split('\r\n').length > 2, 'exceptions export is empty')

const evidence = buildEvidence(result, context, approval)
check(evidence.boundaries.source_upload === false && evidence.boundaries.payment_or_books_write === false, 'evidence boundary drifted')
check(!JSON.stringify(evidence).includes('Aye Aye'), 'source rows leaked into metadata-only evidence')
check(evidence.source_files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)), 'source hashes are malformed')

const html = readFileSync(resolve(process.cwd(), 'tools', 'public-workcells', 'payment-reconciler.html'), 'utf8')
for (const required of [
  '<title>Payment Reconciler | SuperMega AI Agent Solutions</title>',
  'Zero source upload or money movement',
  'id="invoiceFile"',
  'id="paymentFile"',
  'id="approveButton"',
  'id="downloadReconciliation"',
  'src="/reconcile/payment-reconciler.mjs"',
]) check(html.includes(required), `workcell HTML is missing ${required}`)
for (const forbidden of ['target="_blank"', 'window.open(', 'MegaOS', 'DeskPOS', 'automatically posts', 'connect your bank']) check(!html.includes(forbidden), `workcell HTML contains forbidden content: ${forbidden}`)

console.log(JSON.stringify({ status: 'ok', contract: 'payment_reconciliation_workcell', checks }))
