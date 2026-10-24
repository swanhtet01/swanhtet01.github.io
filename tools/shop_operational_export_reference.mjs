import { createHash } from 'node:crypto'

// REFERENCE CONTRACT ONLY. This does not implement the native Shop export UI.
export const REFERENCE_CONTRACT = 'supermega.shop.operational-csv.reference.v1'
export const DATA_SCOPE = 'device_local_closed_shift_event_window'
export const SOURCE_SCHEMA_MAP = Object.freeze({
  shift: 'shop_cash_shifts', shiftSales: 'shop_cash_shift_sales',
  sales: 'shop_sales', saleLines: 'shop_sale_lines',
  stockMovements: 'shop_stock_movements', reversals: 'shop_sale_reversals',
  reversalLines: 'shop_sale_reversal_lines',
  walletReconciliations: 'shop_wallet_reversal_reconciliations',
})
export const SELECTION_RULES = Object.freeze({
  sales: 'shop_cash_shift_sales linkage',
  shiftCloseTotals: 'persisted shop_cash_shifts snapshot',
  corrections: 'created_at_millis within closed shift window',
  stock: 'created_at_millis within closed shift window',
  walletOutcome: 'reconciliation created_at_millis at or before shift close',
})

export const CSV_HEADERS = Object.freeze([
  'contract_version', 'data_scope', 'row_type', 'shift_id',
  'shift_opened_at_epoch_ms', 'shift_opened_at_yangon',
  'shift_closed_at_epoch_ms', 'shift_closed_at_yangon',
  'event_id', 'occurred_at_epoch_ms', 'occurred_at_yangon',
  'sale_id', 'payment_method', 'product_id', 'product_name',
  'quantity', 'unit_price_mmk', 'amount_mmk', 'stock_delta',
  'reason', 'actor_label', 'restock_quantity', 'wallet_state',
  'evidence_reference', 'opening_float_mmk', 'cash_sales_count',
  'cash_sales_total_mmk', 'wallet_sales_count', 'wallet_sales_total_mmk',
  'cash_reversal_count', 'cash_reversal_total_mmk',
  'gross_sales_mmk', 'reversal_total_mmk', 'net_sales_mmk',
  'cash_drawer_outflow_mmk', 'expected_cash_mmk', 'counted_cash_mmk',
  'difference_mmk', 'pending_wallet_count', 'pending_wallet_mmk',
])

const ROW_RANK = Object.freeze({ sale: 10, sale_line: 20, reversal: 30, reversal_line: 40, wallet_reconciliation: 50, stock_movement: 60 })
const INTEGER_FIELDS = new Set(CSV_HEADERS.filter(header => header.endsWith('_mmk') || header.endsWith('_count') || header.endsWith('_quantity') || header.endsWith('_delta') || header.endsWith('_epoch_ms')).concat(['quantity', 'unit_price_mmk', 'stock_delta']))
const MONEY_FIELDS = new Set(CSV_HEADERS.filter(header => header.endsWith('_mmk')))
const SIGNED_MONEY_FIELDS = new Set(['difference_mmk', 'net_sales_mmk'])
const MAX_MMK = 200_000_000_000_000

function integer(value, label, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`reference_${label}_invalid`)
  return value
}
function money(value, label, minimum = 0) { return integer(value, label, minimum, MAX_MMK) }
function text(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) throw new Error(`reference_${label}_invalid`)
  return value
}

export function yangonTimestamp(epochMillis) {
  integer(epochMillis, 'timestamp', 0)
  return new Date(epochMillis + 390 * 60_000).toISOString().replace('Z', '+06:30')
}

export function spreadsheetSafeText(value) {
  const source = String(value)
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(source)) throw new Error('reference_text_control_invalid')
  if (/^[\t\r\n]/u.test(source) || /^\s*[=+\-@]/u.test(source) || /^0\d+$/u.test(source)) return `'${source}`
  return source
}

function csvCell(value, header) {
  if (value === undefined || value === null || value === '') return '""'
  const source = INTEGER_FIELDS.has(header)
    ? String(integer(value, header, MONEY_FIELDS.has(header) && !SIGNED_MONEY_FIELDS.has(header) ? 0 : Number.MIN_SAFE_INTEGER, MONEY_FIELDS.has(header) ? MAX_MMK : Number.MAX_SAFE_INTEGER))
    : spreadsheetSafeText(value)
  return `"${source.replaceAll('"', '""')}"`
}

function baseRow(shift, rowType, eventId, occurredAtMillis) {
  return {
    contract_version: REFERENCE_CONTRACT, data_scope: DATA_SCOPE, row_type: rowType,
    shift_id: shift.id, shift_opened_at_epoch_ms: shift.openedAtMillis,
    shift_opened_at_yangon: yangonTimestamp(shift.openedAtMillis),
    shift_closed_at_epoch_ms: shift.closedAtMillis,
    shift_closed_at_yangon: yangonTimestamp(shift.closedAtMillis),
    event_id: eventId, occurred_at_epoch_ms: occurredAtMillis,
    occurred_at_yangon: yangonTimestamp(occurredAtMillis),
  }
}

function isEventInWindow(shift, millis) {
  integer(millis, 'event_timestamp', 0)
  return millis >= shift.openedAtMillis && millis <= shift.closedAtMillis
}

export function buildReferenceRows(fixture) {
  if (!fixture || typeof fixture !== 'object') throw new Error('reference_fixture_invalid')
  const shift = fixture.shift
  if (!shift || shift.state !== 'closed') throw new Error('reference_closed_shift_required')
  text(shift.id, 'shift_id'); text(shift.operatorLabel, 'operator_label')
  integer(shift.openedAtMillis, 'shift_opened_at', 0); integer(shift.closedAtMillis, 'shift_closed_at', shift.openedAtMillis)
  for (const field of ['openingFloatMmk', 'cashSalesTotalMmk', 'walletSalesTotalMmk', 'expectedCashMmk', 'countedCashMmk', 'cashDrawerOutflowMmk']) money(shift[field], `shift_${field}`)
  integer(shift.differenceMmk, 'shift_difference', -MAX_MMK, MAX_MMK)
  integer(shift.cashSalesCount, 'shift_cash_count', 0); integer(shift.walletSalesCount, 'shift_wallet_count', 0)
  integer(shift.cashReversalCount, 'shift_cash_reversal_count', 0); money(shift.cashReversalTotalMmk, 'shift_cash_reversal_total')

  const events = [], sales = fixture.sales ?? [], reversals = fixture.reversals ?? [], movements = fixture.stockMovements ?? [], walletReconciliations = fixture.walletReconciliations ?? []
  let gross = 0
  for (const sale of sales) {
    text(sale.id, 'sale_id')
    if (!isEventInWindow(shift, sale.createdAtMillis)) throw new Error('reference_linked_sale_outside_shift_window')
    if (!['cash', 'kbzpay', 'wavepay'].includes(sale.paymentMethod)) throw new Error('reference_payment_method_invalid')
    money(sale.totalMmk, 'sale_total')
    const lineTotal = (sale.lines ?? []).reduce((sum, line) => {
      text(line.id, 'sale_line_id'); text(line.productId, 'sale_line_product_id'); text(line.productName, 'sale_line_product_name')
      integer(line.quantity, 'sale_line_quantity', 1, 1000); money(line.unitPriceMmk, 'sale_line_price', 0)
      money(line.lineTotalMmk, 'sale_line_total', 0)
      if (line.lineTotalMmk !== line.quantity * line.unitPriceMmk) throw new Error('reference_sale_line_arithmetic_invalid')
      return sum + line.lineTotalMmk
    }, 0)
    if (lineTotal !== sale.totalMmk) throw new Error('reference_sale_total_invalid')
    gross += sale.totalMmk
    events.push({ ...baseRow(shift, 'sale', sale.id, sale.createdAtMillis), sale_id: sale.id, payment_method: sale.paymentMethod, amount_mmk: sale.totalMmk })
    for (const line of sale.lines ?? []) events.push({ ...baseRow(shift, 'sale_line', line.id, sale.createdAtMillis), sale_id: sale.id, payment_method: sale.paymentMethod, product_id: line.productId, product_name: line.productName, quantity: line.quantity, unit_price_mmk: line.unitPriceMmk, amount_mmk: line.lineTotalMmk })
  }

  let reversalTotal = 0, cashDrawerOutflow = 0, pendingWalletCount = 0, pendingWalletMmk = 0
  const reversalById = new Map()
  const reconciliationIds = new Set(), reconciliationByReversal = new Map()
  for (const reconciliation of walletReconciliations) {
    text(reconciliation.id, 'wallet_reconciliation_id'); text(reconciliation.reversalId, 'wallet_reconciliation_reversal_id')
    text(reconciliation.evidenceReference, 'wallet_reconciliation_evidence'); text(reconciliation.actorLabel, 'wallet_reconciliation_actor')
    integer(reconciliation.createdAtMillis, 'wallet_reconciliation_created_at', 0)
    if (!['money_returned', 'payment_not_received'].includes(reconciliation.outcome)) throw new Error('reference_wallet_outcome_invalid')
    if (reconciliationIds.has(reconciliation.id)) throw new Error('reference_wallet_reconciliation_id_duplicate')
    if (reconciliationByReversal.has(reconciliation.reversalId)) throw new Error('reference_wallet_reversal_duplicate')
    reconciliationIds.add(reconciliation.id); reconciliationByReversal.set(reconciliation.reversalId, reconciliation)
  }
  for (const reversal of reversals) {
    text(reversal.id, 'reversal_id'); text(reversal.saleId, 'reversal_sale_id'); text(reversal.reason, 'reversal_reason'); text(reversal.authorizedActorLabel, 'reversal_actor_label')
    if (reversalById.has(reversal.id)) throw new Error('reference_reversal_id_duplicate')
    reversalById.set(reversal.id, reversal)
    integer(reversal.createdAtMillis, 'reversal_created_at', 0); money(reversal.originalTotalMmk, 'reversal_total')
    integer(reversal.cashDrawerDeltaMmk, 'cash_drawer_delta', -MAX_MMK, 0)
    if (!['cash', 'kbzpay', 'wavepay'].includes(reversal.originalPaymentMethod)) throw new Error('reference_reversal_payment_invalid')
    if ((reversal.originalPaymentMethod === 'cash' && reversal.cashDrawerDeltaMmk !== -reversal.originalTotalMmk) || (reversal.originalPaymentMethod !== 'cash' && reversal.cashDrawerDeltaMmk !== 0)) throw new Error('reference_reversal_cash_effect_invalid')
    const lineTotal = (reversal.lines ?? []).reduce((sum, line) => {
      text(line.id, 'reversal_line_id'); text(line.productId, 'reversal_line_product_id'); text(line.productName, 'reversal_line_product_name')
      integer(line.quantity, 'reversal_line_quantity', 1, 1000); money(line.unitPriceMmk, 'reversal_line_price'); integer(line.restockQuantity, 'reversal_line_restock', 0, line.quantity)
      money(line.lineTotalMmk, 'reversal_line_total')
      if (line.lineTotalMmk !== line.quantity * line.unitPriceMmk) throw new Error('reference_reversal_line_arithmetic_invalid')
      if (line.restockQuantity !== 0 && line.restockQuantity !== line.quantity) throw new Error('reference_reversal_restock_invalid')
      return sum + line.lineTotalMmk
    }, 0)
    if (lineTotal !== reversal.originalTotalMmk) throw new Error('reference_reversal_total_invalid')
    if (!isEventInWindow(shift, reversal.createdAtMillis)) continue
    reversalTotal += reversal.originalTotalMmk; cashDrawerOutflow += -reversal.cashDrawerDeltaMmk
    events.push({ ...baseRow(shift, 'reversal', reversal.id, reversal.createdAtMillis), sale_id: reversal.saleId, payment_method: reversal.originalPaymentMethod, amount_mmk: reversal.originalTotalMmk, reason: reversal.reason, actor_label: reversal.authorizedActorLabel })
    for (const line of reversal.lines ?? []) events.push({ ...baseRow(shift, 'reversal_line', line.id, reversal.createdAtMillis), sale_id: reversal.saleId, payment_method: reversal.originalPaymentMethod, product_id: line.productId, product_name: line.productName, quantity: line.quantity, unit_price_mmk: line.unitPriceMmk, amount_mmk: line.lineTotalMmk, restock_quantity: line.restockQuantity })
    const recordedReconciliation = reconciliationByReversal.get(reversal.id)
    if (recordedReconciliation && recordedReconciliation.createdAtMillis < reversal.createdAtMillis) throw new Error('reference_wallet_reconciliation_time_invalid')
    if (reversal.originalPaymentMethod !== 'cash' && (!recordedReconciliation || recordedReconciliation.createdAtMillis > shift.closedAtMillis)) {
      pendingWalletCount += 1; pendingWalletMmk += reversal.originalTotalMmk
      events.push({ ...baseRow(shift, 'wallet_reconciliation', `${reversal.id}:wallet-pending`, reversal.createdAtMillis), sale_id: reversal.saleId, payment_method: reversal.originalPaymentMethod, amount_mmk: reversal.originalTotalMmk, wallet_state: 'external_reconciliation_pending' })
    }
  }

  for (const reconciliation of walletReconciliations) {
    const reversal = reversalById.get(reconciliation.reversalId)
    if (!reversal || reversal.originalPaymentMethod === 'cash') throw new Error('reference_wallet_reversal_missing')
    if (reconciliation.createdAtMillis < reversal.createdAtMillis) throw new Error('reference_wallet_reconciliation_time_invalid')
    if (!isEventInWindow(shift, reconciliation.createdAtMillis)) continue
    const walletState = reconciliation.outcome === 'money_returned' ? 'merchant_recorded_money_returned' : 'merchant_recorded_payment_not_received'
    events.push({ ...baseRow(shift, 'wallet_reconciliation', reconciliation.id, reconciliation.createdAtMillis), sale_id: reversal.saleId, payment_method: reversal.originalPaymentMethod, amount_mmk: reversal.originalTotalMmk, actor_label: reconciliation.actorLabel, wallet_state: walletState, evidence_reference: reconciliation.evidenceReference })
  }

  for (const movement of movements) {
    text(movement.id, 'stock_movement_id'); text(movement.productId, 'stock_movement_product_id'); text(movement.reason, 'stock_movement_reason')
    if (!isEventInWindow(shift, movement.createdAtMillis)) throw new Error('reference_stock_movement_outside_shift_window')
    events.push({ ...baseRow(shift, 'stock_movement', movement.id, movement.createdAtMillis), sale_id: movement.saleId ?? '', product_id: movement.productId, stock_delta: integer(movement.quantityDelta, 'stock_delta'), reason: movement.reason })
  }

  const cashSales = sales.filter(sale => sale.paymentMethod === 'cash'), walletSales = sales.filter(sale => sale.paymentMethod !== 'cash')
  const cashReversals = reversals.filter(reversal => isEventInWindow(shift, reversal.createdAtMillis) && reversal.originalPaymentMethod === 'cash')
  const cashTotal = cashSales.reduce((sum, sale) => sum + sale.totalMmk, 0), walletTotal = walletSales.reduce((sum, sale) => sum + sale.totalMmk, 0)
  const cashReversalTotal = cashReversals.reduce((sum, reversal) => sum + reversal.originalTotalMmk, 0)
  const expectedCash = shift.openingFloatMmk + cashTotal - cashDrawerOutflow
  if (cashSales.length !== shift.cashSalesCount || walletSales.length !== shift.walletSalesCount || cashTotal !== shift.cashSalesTotalMmk || walletTotal !== shift.walletSalesTotalMmk || cashReversals.length !== shift.cashReversalCount || cashReversalTotal !== shift.cashReversalTotalMmk || cashDrawerOutflow !== shift.cashDrawerOutflowMmk || expectedCash !== shift.expectedCashMmk || shift.countedCashMmk - shift.expectedCashMmk !== shift.differenceMmk) throw new Error('reference_shift_reconciliation_invalid')

  const summary = { ...baseRow(shift, 'shift_summary', shift.id, shift.closedAtMillis), actor_label: shift.operatorLabel, opening_float_mmk: shift.openingFloatMmk, cash_sales_count: shift.cashSalesCount, cash_sales_total_mmk: cashTotal, wallet_sales_count: shift.walletSalesCount, wallet_sales_total_mmk: walletTotal, cash_reversal_count: shift.cashReversalCount, cash_reversal_total_mmk: shift.cashReversalTotalMmk, gross_sales_mmk: gross, reversal_total_mmk: reversalTotal, net_sales_mmk: gross - reversalTotal, cash_drawer_outflow_mmk: cashDrawerOutflow, expected_cash_mmk: shift.expectedCashMmk, counted_cash_mmk: shift.countedCashMmk, difference_mmk: shift.differenceMmk, pending_wallet_count: pendingWalletCount, pending_wallet_mmk: pendingWalletMmk }
  events.sort((left, right) => left.occurred_at_epoch_ms - right.occurred_at_epoch_ms || ROW_RANK[left.row_type] - ROW_RANK[right.row_type] || (String(left.event_id) < String(right.event_id) ? -1 : String(left.event_id) > String(right.event_id) ? 1 : 0))
  const eventKeys = new Set()
  for (const event of events) {
    const key = `${event.row_type}\0${event.event_id}`
    if (eventKeys.has(key)) throw new Error('reference_event_id_duplicate')
    eventKeys.add(key)
  }
  return [summary, ...events]
}

export function encodeReferenceCsv(fixture) {
  const rows = buildReferenceRows(fixture)
  const header = CSV_HEADERS.map(value => `"${value}"`).join(',')
  const body = rows.map(row => CSV_HEADERS.map(headerName => csvCell(row[headerName], headerName)).join(','))
  const bytes = Buffer.from(`\uFEFF${[header, ...body].join('\r\n')}\r\n`, 'utf8')
  return { bytes, rows, sha256: createHash('sha256').update(bytes).digest('hex') }
}

const PREVIEW_LABELS = Object.freeze({
  en: Object.freeze({ title: 'Closed shift', gross: 'Gross sales', reversals: 'Corrections', net: 'Net sales', expected: 'Expected cash', counted: 'Counted cash', difference: 'Cash difference', pendingWallet: 'Pending wallet follow-up', warning: 'Readable local file — not encrypted.' }),
  my: Object.freeze({ title: 'ပိတ်ပြီး ငွေစာရင်းချိန်', gross: 'ရောင်းရငွေ စုစုပေါင်း', reversals: 'ပြင်ဆင်မှုများ', net: 'အသားတင် ရောင်းရငွေ', expected: 'ရှိသင့်သော ငွေသား', counted: 'ရေတွက်ထားသော ငွေသား', difference: 'ငွေသား ကွာဟချက်', pendingWallet: 'ဆက်လက်စစ်ဆေးရန် အီလက်ထရွန်နစ် ငွေပေးချေမှု', warning: 'ဖတ်ရှုနိုင်သော စက်တွင်းဖိုင် — စာဝှက်မထားပါ။' }),
})

export function buildReferencePreview(fixture, locale) {
  const labels = PREVIEW_LABELS[locale]
  if (!labels) throw new Error('reference_preview_locale_invalid')
  const summary = buildReferenceRows(fixture)[0]
  return { locale, labels, values: { grossMmk: summary.gross_sales_mmk, reversalMmk: summary.reversal_total_mmk, netMmk: summary.net_sales_mmk, cashReversalCount: summary.cash_reversal_count, cashReversalMmk: summary.cash_reversal_total_mmk, expectedCashMmk: summary.expected_cash_mmk, countedCashMmk: summary.counted_cash_mmk, differenceMmk: summary.difference_mmk, pendingWalletCount: summary.pending_wallet_count, pendingWalletMmk: summary.pending_wallet_mmk } }
}
