import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  CSV_HEADERS, DATA_SCOPE, REFERENCE_CONTRACT, SELECTION_RULES,
  SOURCE_SCHEMA_MAP, buildReferencePreview, encodeReferenceCsv,
  spreadsheetSafeText, yangonTimestamp,
} from './shop_operational_export_reference.mjs'

const fixtureUrl = new URL('./shop_operational_export_reference.fixture.json', import.meta.url)
const goldenUrl = new URL('./shop_operational_export_reference.golden.json', import.meta.url)
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'))
const golden = JSON.parse(readFileSync(goldenUrl, 'utf8'))
const clone = value => structuredClone(value)

function parseCsv(bytes) {
  const source = bytes.toString('utf8')
  assert.equal(source.charCodeAt(0), 0xFEFF)
  const rows = [], row = []
  let field = '', quoted = false
  for (let index = 1; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index++; continue }
      if (char === '"') { quoted = false; continue }
      field += char; continue
    }
    if (char === '"') { quoted = true; continue }
    if (char === ',') { row.push(field); field = ''; continue }
    if (char === '\r' && source[index + 1] === '\n') {
      row.push(field); rows.push([...row]); row.length = 0; field = ''; index++; continue
    }
    throw new Error(`unexpected_csv_character_${JSON.stringify(char)}`)
  }
  assert.equal(quoted, false)
  assert.equal(field, '')
  assert.equal(row.length, 0)
  return rows
}

test('reference contract maps only the existing immutable operational sources', () => {
  assert.deepEqual(SOURCE_SCHEMA_MAP, {
    shift: 'shop_cash_shifts', shiftSales: 'shop_cash_shift_sales', sales: 'shop_sales',
    saleLines: 'shop_sale_lines', stockMovements: 'shop_stock_movements', reversals: 'shop_sale_reversals',
    reversalLines: 'shop_sale_reversal_lines', walletReconciliations: 'shop_wallet_reversal_reconciliations',
  })
  assert.deepEqual(SELECTION_RULES, {
    sales: 'shop_cash_shift_sales linkage', shiftCloseTotals: 'persisted shop_cash_shifts snapshot',
    corrections: 'created_at_millis within closed shift window', stock: 'created_at_millis within closed shift window',
    walletOutcome: 'reconciliation created_at_millis at or before shift close',
  })
  assert.equal(DATA_SCOPE, 'device_local_closed_shift_event_window')
})

test('closed shift fixture matches exact deterministic golden bytes and reconciliation', () => {
  const before = JSON.stringify(fixture)
  const first = encodeReferenceCsv(fixture), second = encodeReferenceCsv(fixture)
  assert.equal(JSON.stringify(fixture), before, 'reference encoding has no sale, stock, shift, retry, or outbox side effect')
  assert.deepEqual(first.bytes, second.bytes)
  assert.equal(first.sha256, second.sha256)
  assert.equal(first.sha256, golden.sha256)
  assert.equal(first.bytes.length, golden.byteLength)
  assert.equal(first.rows.length, golden.rowCount)
  assert.deepEqual(first.rows.map(row => row.row_type), golden.rowTypes)
  assert.equal(first.rows[0].contract_version, REFERENCE_CONTRACT)
  assert.deepEqual({
    grossMmk: first.rows[0].gross_sales_mmk, reversalMmk: first.rows[0].reversal_total_mmk,
    netMmk: first.rows[0].net_sales_mmk, cashReversalCount: first.rows[0].cash_reversal_count,
    cashReversalMmk: first.rows[0].cash_reversal_total_mmk, expectedCashMmk: first.rows[0].expected_cash_mmk,
    countedCashMmk: first.rows[0].counted_cash_mmk, differenceMmk: first.rows[0].difference_mmk,
    pendingWalletCount: first.rows[0].pending_wallet_count, pendingWalletMmk: first.rows[0].pending_wallet_mmk,
  }, golden.summary)
})

test('CSV is UTF-8 BOM plus quoted RFC4180 CRLF and round-trips Burmese/newlines/leading zeros', () => {
  const result = encodeReferenceCsv(fixture), decoded = result.bytes.toString('utf8')
  assert.ok(decoded.startsWith('\uFEFF"contract_version"'))
  assert.equal(decoded.endsWith('\r\n'), true)
  assert.equal((decoded.match(/\r\n/gu) ?? []).length, golden.rowCount + 1)
  const rows = parseCsv(result.bytes)
  assert.deepEqual(rows[0], CSV_HEADERS)
  assert.equal(rows.length, golden.rowCount + 1)
  const productNameIndex = CSV_HEADERS.indexOf('product_name'), productIdIndex = CSV_HEADERS.indexOf('product_id')
  assert.ok(rows.some(row => row[productNameIndex] === 'လက်ဖက်၊ "အထူး"\nထုပ်'))
  assert.ok(rows.some(row => row[productNameIndex] === '\' =SUM(1,2), "အန္တရာယ်"\nနောက်တန်း'))
  assert.ok(rows.some(row => row[productIdIndex] === "'0099999999999"))
})

test('spreadsheet formula defenses cover every dangerous prefix without changing ordinary Burmese', () => {
  for (const value of ['=SUM(1,1)', '+cmd', '-cmd', '@cmd', '  =cmd', '\t=cmd', '\r+cmd', '\n-cmd', '0099999999999']) {
    assert.equal(spreadsheetSafeText(value), `'${value}`)
  }
  assert.equal(spreadsheetSafeText('လက်ဖက်ရည်'), 'လက်ဖက်ရည်')
  assert.throws(() => spreadsheetSafeText('safe\0unsafe'), /reference_text_control_invalid/)
  assert.throws(() => spreadsheetSafeText('safe\u000bunsafe'), /reference_text_control_invalid/)
})

test('Yangon timestamps are fixed +06:30 across the UTC date boundary', () => {
  assert.equal(yangonTimestamp(1792864200000), '2026-10-25T00:20:00.000+06:30')
  assert.equal(yangonTimestamp(1792866000000), '2026-10-25T00:50:00.000+06:30')
})

test('wallet states remain merchant-recorded and late outcomes cannot rewrite a closed shift', () => {
  const reconciled = clone(fixture)
  reconciled.walletReconciliations.push({ id: '000400', reversalId: '000201', outcome: 'payment_not_received', evidenceReference: '@merchant-note', actorLabel: 'Owner', createdAtMillis: 1792865760000 })
  const rows = encodeReferenceCsv(reconciled).rows
  const wallet = rows.find(row => row.row_type === 'wallet_reconciliation')
  assert.equal(wallet.wallet_state, 'merchant_recorded_payment_not_received')
  assert.equal(wallet.evidence_reference, '@merchant-note')
  assert.equal(rows[0].pending_wallet_count, 0)
  assert.equal(rows[0].pending_wallet_mmk, 0)

  const late = clone(reconciled)
  late.walletReconciliations[0].createdAtMillis = 1792866000001
  const lateRows = encodeReferenceCsv(late).rows
  assert.equal(lateRows.find(row => row.row_type === 'wallet_reconciliation').wallet_state, 'external_reconciliation_pending')
  assert.equal(lateRows[0].pending_wallet_count, 1)
  for (const forbidden of ['provider_verified', 'settled', 'refunded']) assert.doesNotMatch(encodeReferenceCsv(reconciled).bytes.toString('utf8'), new RegExp(forbidden, 'i'))
})

test('a reconciliation can be an independent shift event for an older wallet reversal', () => {
  const independent = clone(fixture)
  independent.reversals.push({ id: '000199', saleId: '000099', originalPaymentMethod: 'wavepay', originalTotalMmk: 1200, cashDrawerDeltaMmk: 0, reason: 'earlier shift correction', authorizedActorLabel: 'Owner', createdAtMillis: independent.shift.openedAtMillis - 1000, lines: [{ id: '000199-1', productId: '000009', productName: 'Earlier item', quantity: 1, unitPriceMmk: 1200, lineTotalMmk: 1200, restockQuantity: 0 }] })
  independent.walletReconciliations.push({ id: '000399', reversalId: '000199', outcome: 'money_returned', evidenceReference: 'merchant note', actorLabel: 'Owner', createdAtMillis: 1792865300000 })
  const rows = encodeReferenceCsv(independent).rows
  const event = rows.find(row => row.event_id === '000399')
  assert.equal(event.wallet_state, 'merchant_recorded_money_returned')
  assert.equal(event.amount_mmk, 1200)
  assert.equal(rows[0].reversal_total_mmk, 8000, 'older reversal does not rewrite current event-window correction total')
})

test('current-shift correction of an older sale permits signed negative net activity', () => {
  const negative = clone(fixture)
  negative.sales = []
  negative.reversals = [negative.reversals[0]]
  negative.walletReconciliations = []
  negative.stockMovements = [negative.stockMovements[2]]
  Object.assign(negative.shift, { cashSalesCount: 0, cashSalesTotalMmk: 0, walletSalesCount: 0, walletSalesTotalMmk: 0, expectedCashMmk: 5000, countedCashMmk: 5000, differenceMmk: 0, cashDrawerOutflowMmk: 5000 })
  const result = encodeReferenceCsv(negative)
  assert.equal(result.rows[0].gross_sales_mmk, 0)
  assert.equal(result.rows[0].reversal_total_mmk, 5000)
  assert.equal(result.rows[0].net_sales_mmk, -5000)
  assert.match(result.bytes.toString('utf8'), /"-5000"/)
})

test('privacy canaries and authorization proof internals never enter headers or bytes', () => {
  const csv = encodeReferenceCsv(fixture).bytes.toString('utf8')
  for (const value of Object.values(fixture.privateExcluded)) assert.doesNotMatch(csv, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')))
  for (const value of ['PRIVATE-RECEIPT-MUST-NOT-EXPORT', 'PRIVATE-SIGNATURE-MUST-NOT-EXPORT']) assert.doesNotMatch(csv, new RegExp(value))
  for (const header of ['merchant_phone', 'official_qr_payload', 'request_fingerprint', 'payload_json', 'authorization_receipt_id', 'authorization_receipt_digest', 'authorization_command_digest', 'authorization_workspace_id', 'authorized_actor_id', 'signature', 'private_key', 'session_token', 'contact_email']) assert.ok(!CSV_HEADERS.includes(header))
})

test('MMK and quantity fields reject booleans, strings, floats, overflow and inconsistent arithmetic', () => {
  for (const value of [true, '10000', 1.5, 200_000_000_000_001]) {
    const invalid = clone(fixture); invalid.shift.openingFloatMmk = value
    assert.throws(() => encodeReferenceCsv(invalid), /reference_shift_openingFloatMmk_invalid/)
  }
  const badLine = clone(fixture); badLine.sales[0].lines[0].lineTotalMmk = 4999
  assert.throws(() => encodeReferenceCsv(badLine), /reference_sale_line_arithmetic_invalid/)
  const badShift = clone(fixture); badShift.shift.expectedCashMmk = 9999
  assert.throws(() => encodeReferenceCsv(badShift), /reference_shift_reconciliation_invalid/)
})

test('open shifts and out-of-window operational events fail closed', () => {
  const open = clone(fixture); open.shift.state = 'open'
  assert.throws(() => encodeReferenceCsv(open), /reference_closed_shift_required/)
  const outside = clone(fixture); outside.stockMovements[0].createdAtMillis = outside.shift.openedAtMillis - 1
  assert.throws(() => encodeReferenceCsv(outside), /reference_stock_movement_outside_shift_window/)
})

test('required persisted text and duplicate event identities fail closed', () => {
  const missingReason = clone(fixture); delete missingReason.reversals[0].reason
  assert.throws(() => encodeReferenceCsv(missingReason), /reference_reversal_reason_invalid/)
  const control = clone(fixture); control.sales[0].lines[0].productName = 'bad\u000bname'
  assert.throws(() => encodeReferenceCsv(control), /reference_sale_line_product_name_invalid/)
  const duplicate = clone(fixture); duplicate.stockMovements.push(clone(duplicate.stockMovements[0]))
  assert.throws(() => encodeReferenceCsv(duplicate), /reference_event_id_duplicate/)
})

test('reversal and wallet invariants match the fail-closed SQLite schema', () => {
  const partial = clone(fixture); partial.reversals[0].lines[0].restockQuantity = 1
  assert.throws(() => encodeReferenceCsv(partial), /reference_reversal_restock_invalid/)
  const arithmetic = clone(fixture); arithmetic.reversals[0].lines[0].unitPriceMmk = 2000
  assert.throws(() => encodeReferenceCsv(arithmetic), /reference_reversal_line_arithmetic_invalid/)
  const cashDelta = clone(fixture); cashDelta.reversals[0].cashDrawerDeltaMmk = -4999
  assert.throws(() => encodeReferenceCsv(cashDelta), /reference_reversal_cash_effect_invalid/)
  const walletDelta = clone(fixture); walletDelta.reversals[1].cashDrawerDeltaMmk = -1
  assert.throws(() => encodeReferenceCsv(walletDelta), /reference_reversal_cash_effect_invalid/)

  const duplicateTarget = clone(fixture)
  duplicateTarget.walletReconciliations = [
    { id: '000400', reversalId: '000201', outcome: 'money_returned', evidenceReference: 'one', actorLabel: 'Owner', createdAtMillis: 1792865760000 },
    { id: '000401', reversalId: '000201', outcome: 'payment_not_received', evidenceReference: 'two', actorLabel: 'Owner', createdAtMillis: 1792865820000 },
  ]
  assert.throws(() => encodeReferenceCsv(duplicateTarget), /reference_wallet_reversal_duplicate/)
  const duplicateId = clone(duplicateTarget); duplicateId.walletReconciliations[1].reversalId = 'different'; duplicateId.walletReconciliations[1].id = '000400'
  assert.throws(() => encodeReferenceCsv(duplicateId), /reference_wallet_reconciliation_id_duplicate/)
  const early = clone(fixture)
  early.walletReconciliations = [{ id: '000400', reversalId: '000201', outcome: 'money_returned', evidenceReference: 'early', actorLabel: 'Owner', createdAtMillis: 1792865699999 }]
  assert.throws(() => encodeReferenceCsv(early), /reference_wallet_reconciliation_time_invalid/)
})

test('English and Burmese preview expectations share exact totals and warn that CSV is unencrypted', () => {
  const en = buildReferencePreview(fixture, 'en'), my = buildReferencePreview(fixture, 'my')
  assert.deepEqual(en.values, golden.summary)
  assert.deepEqual(my.values, golden.summary)
  assert.equal(en.labels.warning, 'Readable local file — not encrypted.')
  assert.equal(my.labels.warning, 'ဖတ်ရှုနိုင်သော စက်တွင်းဖိုင် — စာဝှက်မထားပါ။')
  assert.doesNotMatch(Object.values(my.labels).join(' '), /\bwallet\b/i)
  assert.notEqual(en.labels.title, my.labels.title)
  assert.throws(() => buildReferencePreview(fixture, 'mixed'), /reference_preview_locale_invalid/)
})

test('reference module is pure and cannot save, upload, mutate a database or claim native integration', () => {
  const source = readFileSync(new URL('./shop_operational_export_reference.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /writeFile|createWriteStream|fetch\(|sqlite|drift|file_saver|path_provider/u)
  assert.doesNotMatch(source, /localeCompare/u)
  assert.match(source, /REFERENCE CONTRACT ONLY/)
  assert.equal(REFERENCE_CONTRACT, 'supermega.shop.operational-csv.reference.v1')
})
