const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 50000
const MAX_RENDERED_ROWS = 200

export const RECONCILIATION_LIMITS = Object.freeze({
  maxFileBytes: MAX_FILE_BYTES,
  maxRowsPerFile: MAX_ROWS,
  maxRenderedRows: MAX_RENDERED_ROWS,
})

function stringValue(value) {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function cleanText(value) {
  return stringValue(value).replace(/\r\n?/g, '\n').trim()
}

function normalizeHeader(value, index, used) {
  let base = cleanText(value)
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/%/g, ' percent ')
    .replace(/#/g, ' number ')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')

  if (!base) base = `column_${index + 1}`
  if (/^\d/.test(base)) base = `field_${base}`

  let candidate = base
  let suffix = 2
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`
    suffix += 1
  }
  used.add(candidate)
  return candidate
}

export function parseCsv(source) {
  const text = stringValue(source).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let justClosedQuote = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
        justClosedQuote = true
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      if (field.length || justClosedQuote) throw new Error(`Unexpected quote at character ${index + 1}`)
      inQuotes = true
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      justClosedQuote = false
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      justClosedQuote = false
      continue
    }
    if (justClosedQuote && !/\s/.test(char)) throw new Error(`Unexpected character after closing quote at ${index + 1}`)
    if (!justClosedQuote || !/\s/.test(char)) field += char
  }

  if (inQuotes) throw new Error('CSV contains an unclosed quoted field')
  if (field.length || row.length || (text.length && !/[\r\n]$/.test(text))) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function parseJsonRows(source) {
  let parsed
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new Error(`JSON could not be parsed: ${error.message}`)
  }

  if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
    const nested = ['rows', 'data', 'items', 'results', 'transactions', 'payments', 'invoices'].find((key) => Array.isArray(parsed[key]))
    if (nested) parsed = parsed[nested]
  }
  if (!Array.isArray(parsed)) throw new Error('JSON must be an array of records or contain a supported record array')
  if (parsed.some((record) => !record || typeof record !== 'object' || Array.isArray(record))) {
    throw new Error('Every JSON record must be an object')
  }

  const headers = []
  const seen = new Set()
  for (const record of parsed) {
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key)
        headers.push(key)
      }
    }
  }
  return {
    kind: 'json',
    headers,
    rows: parsed.map((record) => headers.map((header) => stringValue(record[header]))),
    firstSourceRow: 1,
  }
}

export function parseDataset(source, fileName = 'source.csv') {
  const text = stringValue(source)
  if (!text.trim()) throw new Error('The source file is empty')
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) throw new Error('The source is larger than 10 MB')

  const jsonLike = /\.json$/i.test(fileName) || /^[\s\uFEFF]*[\[{]/.test(text)
  let table
  if (jsonLike) {
    table = parseJsonRows(text)
  } else {
    const matrix = parseCsv(text)
    if (!matrix.length) throw new Error('The CSV has no rows')
    const width = Math.max(...matrix.map((row) => row.length))
    table = {
      kind: 'csv',
      headers: Array.from({ length: width }, (_, index) => matrix[0][index] || ''),
      rows: matrix.slice(1).map((row) => Array.from({ length: width }, (_, index) => row[index] || '')),
      firstSourceRow: 2,
    }
  }

  if (!table.headers.length) throw new Error('The source has no columns')
  if (table.rows.length > MAX_ROWS) throw new Error(`The source has more than ${MAX_ROWS.toLocaleString('en-US')} rows`)

  const used = new Set()
  const headers = table.headers.map((sourceName, index) => ({
    source: cleanText(sourceName) || `Column ${index + 1}`,
    name: normalizeHeader(sourceName, index, used),
  }))
  const rows = table.rows.map((values, index) => ({
    sourceRow: table.firstSourceRow + index,
    values: Object.fromEntries(headers.map((header, column) => [header.name, cleanText(values[column])])),
  }))
  return { kind: table.kind, headers, rows }
}

export function parseMoney(value) {
  let normalized = cleanText(value)
  let negative = false
  if (/^\(.*\)$/.test(normalized)) {
    negative = true
    normalized = normalized.slice(1, -1).trim()
  }
  normalized = normalized
    .replace(/^(?:MMK|USD|Ks)\s*/i, '')
    .replace(/\s*(?:MMK|USD|Ks)$/i, '')
    .replace(/^[$\u00A3\u00A5\u20AC\u20B9]\s*/, '')
    .replace(/,/g, '')
    .trim()
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return { valid: false, raw: cleanText(value) }
  const number = Number(normalized)
  if (!Number.isFinite(number)) return { valid: false, raw: cleanText(value) }
  return { valid: true, number: negative ? -Math.abs(number) : number }
}

function validDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isoDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseDate(value, order = 'day-first') {
  const normalized = cleanText(value)
  if (!normalized) return { valid: false, raw: '' }

  let match = normalized.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (!validDateParts(year, month, day)) return { valid: false, raw: normalized }
    const iso = isoDate(year, month, day)
    return { valid: true, iso, epochDay: Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000) }
  }

  match = normalized.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (!match) return { valid: false, raw: normalized }
  const first = Number(match[1])
  const second = Number(match[2])
  const year = Number(match[3])
  const day = order === 'month-first' ? second : first
  const month = order === 'month-first' ? first : second
  if (!validDateParts(year, month, day)) return { valid: false, raw: normalized }
  const iso = isoDate(year, month, day)
  return { valid: true, iso, epochDay: Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000) }
}

const MAPPING_ALIASES = Object.freeze({
  invoice: {
    reference: ['invoice_reference', 'invoice_ref', 'invoice_number', 'invoice_no', 'order_reference', 'order_id', 'order_number', 'receipt_number', 'reference', 'ref'],
    amount: ['invoice_amount', 'invoice_total', 'grand_total', 'sale_amount', 'net_amount', 'total', 'amount', 'balance'],
    date: ['invoice_date', 'sale_date', 'order_date', 'created_date', 'created_at', 'date'],
    party: ['customer_name', 'customer', 'client_name', 'client', 'buyer', 'account_name'],
  },
  payment: {
    reference: ['invoice_reference', 'invoice_ref', 'order_reference', 'order_id', 'transaction_reference', 'transaction_id', 'payment_reference', 'reference', 'ref'],
    amount: ['paid_amount', 'payment_amount', 'settlement_amount', 'credit_amount', 'net_amount', 'credit', 'amount', 'total'],
    date: ['payment_date', 'settlement_date', 'transaction_date', 'paid_at', 'created_at', 'date'],
    party: ['payer_name', 'payer', 'sender_name', 'sender', 'customer_name', 'customer', 'account_name'],
  },
})

export function suggestMappings(dataset, side) {
  const aliases = MAPPING_ALIASES[side]
  if (!aliases) throw new Error(`Unsupported mapping side: ${side}`)
  const names = new Set(dataset.headers.map((header) => header.name))
  return Object.fromEntries(Object.entries(aliases).map(([field, candidates]) => [field, candidates.find((candidate) => names.has(candidate)) || '']))
}

function normalizeReference(value) {
  return cleanText(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, '')
}

function normalizeParty(value) {
  return cleanText(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, '')
}

function valueFor(row, column) {
  return column ? row.values[column] || '' : ''
}

function makeRecord(row, side, mapping, dateOrder) {
  const amount = parseMoney(valueFor(row, mapping.amount))
  const date = mapping.date ? parseDate(valueFor(row, mapping.date), dateOrder) : { valid: false, raw: '' }
  const rawReference = valueFor(row, mapping.reference)
  const rawParty = valueFor(row, mapping.party)
  return {
    id: `${side}:${row.sourceRow}`,
    side,
    sourceRow: row.sourceRow,
    reference: cleanText(rawReference),
    referenceKey: normalizeReference(rawReference),
    party: cleanText(rawParty),
    partyKey: normalizeParty(rawParty),
    amount: amount.valid ? amount.number : null,
    validAmount: amount.valid,
    rawAmount: valueFor(row, mapping.amount),
    date: date.valid ? date.iso : '',
    epochDay: date.valid ? date.epochDay : null,
  }
}

function groupByReference(records) {
  const groups = new Map()
  for (const record of records) {
    if (!record.referenceKey) continue
    if (!groups.has(record.referenceKey)) groups.set(record.referenceKey, [])
    groups.get(record.referenceKey).push(record)
  }
  return groups
}

function sum(records) {
  return records.reduce((total, record) => total + (record.validAmount ? record.amount : 0), 0)
}

function amountDifference(invoice, payment) {
  return Number((payment.amount - invoice.amount).toFixed(6))
}

function createPair(invoice, payment, status, method, confidence, reason) {
  return {
    status,
    method,
    confidence,
    invoice,
    payment,
    difference: invoice?.validAmount && payment?.validAmount ? amountDifference(invoice, payment) : null,
    reviewReason: reason,
  }
}

function applyMutualUniqueSuggestions({ invoices, payments, usedInvoices, usedPayments, pairs, method, confidence, predicate }) {
  const availableInvoices = invoices.filter((record) => record.validAmount && !usedInvoices.has(record.id))
  const availablePayments = payments.filter((record) => record.validAmount && !usedPayments.has(record.id))
  const candidates = new Map()
  const reverse = new Map()

  for (const invoice of availableInvoices) {
    const matches = availablePayments.filter((payment) => predicate(invoice, payment))
    candidates.set(invoice.id, matches)
    for (const payment of matches) {
      if (!reverse.has(payment.id)) reverse.set(payment.id, [])
      reverse.get(payment.id).push(invoice)
    }
  }

  for (const invoice of availableInvoices) {
    const matches = candidates.get(invoice.id) || []
    if (matches.length !== 1) continue
    const payment = matches[0]
    if ((reverse.get(payment.id) || []).length !== 1) continue
    usedInvoices.add(invoice.id)
    usedPayments.add(payment.id)
    pairs.push(createPair(invoice, payment, 'suggested', method, confidence, 'Mutual-unique suggestion; reviewer confirmation required.'))
  }
}

function buildActions(summary) {
  const actions = []
  if (summary.invalidAmounts) actions.push({ priority: 'high', title: 'Fix invalid amounts', detail: `${summary.invalidAmounts} row${summary.invalidAmounts === 1 ? '' : 's'} cannot enter the matching pool.` })
  if (summary.amountMismatches) actions.push({ priority: 'high', title: 'Resolve amount mismatches', detail: `${summary.amountMismatches} exact reference${summary.amountMismatches === 1 ? '' : 's'} carries a different amount.` })
  if (summary.duplicateReferences) actions.push({ priority: 'high', title: 'Resolve duplicate references', detail: `${summary.duplicateReferences} repeated reference group${summary.duplicateReferences === 1 ? '' : 's'} needs a source check.` })
  if (summary.suggestedMatches) actions.push({ priority: 'medium', title: 'Confirm suggested pairs', detail: `${summary.suggestedMatches} mutual-unique match${summary.suggestedMatches === 1 ? '' : 'es'} did not share an exact reference.` })
  if (summary.unmatchedPayments) actions.push({ priority: 'medium', title: 'Trace unmatched payments', detail: `${summary.unmatchedPayments} payment row${summary.unmatchedPayments === 1 ? '' : 's'} has no safe invoice pair.` })
  if (summary.unmatchedInvoices) actions.push({ priority: 'medium', title: 'Follow up unmatched invoices', detail: `${summary.unmatchedInvoices} invoice row${summary.unmatchedInvoices === 1 ? '' : 's'} remains outside an exact or suggested pair.` })
  if (!actions.length) actions.push({ priority: 'low', title: 'Approve the reconciliation', detail: 'Every valid invoice and payment row has an exact reference and amount match.' })
  return actions.slice(0, 5)
}

export function reconcileDatasets(invoiceDataset, paymentDataset, settings) {
  const tolerance = Math.max(0, Number(settings?.tolerance || 0))
  const dateWindowDays = Math.min(30, Math.max(0, Number(settings?.dateWindowDays ?? 3)))
  const dateOrder = settings?.dateOrder === 'month-first' ? 'month-first' : 'day-first'
  const invoiceMapping = settings?.invoiceMapping || {}
  const paymentMapping = settings?.paymentMapping || {}
  if (!invoiceMapping.amount || !paymentMapping.amount) throw new Error('Map the amount column for both files')

  const invoices = invoiceDataset.rows.map((row) => makeRecord(row, 'invoice', invoiceMapping, dateOrder))
  const payments = paymentDataset.rows.map((row) => makeRecord(row, 'payment', paymentMapping, dateOrder))
  const invoiceGroups = groupByReference(invoices)
  const paymentGroups = groupByReference(payments)
  const exceptions = []
  const pairs = []
  const usedInvoices = new Set()
  const usedPayments = new Set()

  for (const record of [...invoices, ...payments]) {
    if (!record.validAmount) exceptions.push({
      severity: 'high',
      type: 'invalid_amount',
      side: record.side,
      sourceRow: record.sourceRow,
      reference: record.reference,
      amount: record.rawAmount,
      detail: 'Amount is blank or not a supported number.',
    })
  }

  for (const [reference, records] of invoiceGroups) {
    if (records.length > 1) exceptions.push({ severity: 'high', type: 'duplicate_reference', side: 'invoice', sourceRow: '', reference: records[0].reference || reference, amount: '', detail: `${records.length} invoice rows share this reference.` })
  }
  for (const [reference, records] of paymentGroups) {
    if (records.length > 1) exceptions.push({ severity: 'high', type: 'duplicate_reference', side: 'payment', sourceRow: '', reference: records[0].reference || reference, amount: '', detail: `${records.length} payment rows share this reference.` })
  }

  for (const invoice of invoices) {
    if (!invoice.validAmount || !invoice.referenceKey || usedInvoices.has(invoice.id)) continue
    const invoiceReferenceRows = invoiceGroups.get(invoice.referenceKey) || []
    const paymentReferenceRows = paymentGroups.get(invoice.referenceKey) || []
    if (invoiceReferenceRows.length !== 1 || paymentReferenceRows.length !== 1) continue
    const payment = paymentReferenceRows[0]
    if (!payment.validAmount || usedPayments.has(payment.id)) continue
    usedInvoices.add(invoice.id)
    usedPayments.add(payment.id)
    const difference = Math.abs(amountDifference(invoice, payment))
    if (difference <= tolerance) {
      pairs.push(createPair(invoice, payment, 'matched', 'exact_reference', 100, 'Exact normalized reference and amount.'))
    } else {
      pairs.push(createPair(invoice, payment, 'amount_mismatch', 'exact_reference', 100, 'Exact reference but different amount.'))
      exceptions.push({
        severity: 'high',
        type: 'amount_mismatch',
        side: 'pair',
        sourceRow: `${invoice.sourceRow} / ${payment.sourceRow}`,
        reference: invoice.reference || payment.reference,
        amount: `${invoice.amount} / ${payment.amount}`,
        detail: `Payment minus invoice = ${amountDifference(invoice, payment)}.`,
      })
    }
  }

  const amountClose = (invoice, payment) => Math.abs(amountDifference(invoice, payment)) <= tolerance
  const dateClose = (invoice, payment, window) => invoice.epochDay != null && payment.epochDay != null && Math.abs(invoice.epochDay - payment.epochDay) <= window

  applyMutualUniqueSuggestions({
    invoices,
    payments,
    usedInvoices,
    usedPayments,
    pairs,
    method: 'amount_party_date',
    confidence: 90,
    predicate: (invoice, payment) => amountClose(invoice, payment) && invoice.partyKey && invoice.partyKey === payment.partyKey && dateClose(invoice, payment, dateWindowDays),
  })
  applyMutualUniqueSuggestions({
    invoices,
    payments,
    usedInvoices,
    usedPayments,
    pairs,
    method: 'amount_date',
    confidence: 75,
    predicate: (invoice, payment) => amountClose(invoice, payment) && dateClose(invoice, payment, 1),
  })
  applyMutualUniqueSuggestions({
    invoices,
    payments,
    usedInvoices,
    usedPayments,
    pairs,
    method: 'amount_party',
    confidence: 70,
    predicate: (invoice, payment) => amountClose(invoice, payment) && invoice.partyKey && invoice.partyKey === payment.partyKey,
  })

  const unmatchedInvoices = invoices.filter((record) => !usedInvoices.has(record.id))
  const unmatchedPayments = payments.filter((record) => !usedPayments.has(record.id))

  for (const invoice of unmatchedInvoices.filter((record) => record.validAmount)) {
    exceptions.push({ severity: 'medium', type: 'unmatched_invoice', side: 'invoice', sourceRow: invoice.sourceRow, reference: invoice.reference, amount: invoice.amount, detail: 'No safe payment pair was found.' })
  }
  for (const payment of unmatchedPayments.filter((record) => record.validAmount)) {
    exceptions.push({ severity: 'medium', type: 'unmatched_payment', side: 'payment', sourceRow: payment.sourceRow, reference: payment.reference, amount: payment.amount, detail: 'No safe invoice pair was found.' })
  }

  const reconciliationRows = [
    ...pairs,
    ...unmatchedInvoices.map((invoice) => createPair(invoice, null, invoice.validAmount ? 'unmatched_invoice' : 'invalid_invoice', 'none', 0, invoice.validAmount ? 'No safe payment pair.' : 'Invalid invoice amount.')),
    ...unmatchedPayments.map((payment) => createPair(null, payment, payment.validAmount ? 'unmatched_payment' : 'invalid_payment', 'none', 0, payment.validAmount ? 'No safe invoice pair.' : 'Invalid payment amount.')),
  ].sort((left, right) => (left.invoice?.sourceRow || Number.MAX_SAFE_INTEGER) - (right.invoice?.sourceRow || Number.MAX_SAFE_INTEGER) || (left.payment?.sourceRow || Number.MAX_SAFE_INTEGER) - (right.payment?.sourceRow || Number.MAX_SAFE_INTEGER))

  const exactPairs = pairs.filter((pair) => pair.status === 'matched')
  const suggestedPairs = pairs.filter((pair) => pair.status === 'suggested')
  const mismatchPairs = pairs.filter((pair) => pair.status === 'amount_mismatch')
  const duplicateReferences = exceptions.filter((exception) => exception.type === 'duplicate_reference').length
  const invalidAmounts = exceptions.filter((exception) => exception.type === 'invalid_amount').length
  const validInvoices = invoices.filter((record) => record.validAmount)
  const validPayments = payments.filter((record) => record.validAmount)
  const reviewedInvoiceIds = new Set(exactPairs.map((pair) => pair.invoice.id))
  const reviewInvoiceTotal = validInvoices.filter((record) => !reviewedInvoiceIds.has(record.id)).reduce((total, record) => total + record.amount, 0)

  const summary = {
    invoiceRows: invoices.length,
    paymentRows: payments.length,
    validInvoices: validInvoices.length,
    validPayments: validPayments.length,
    exactMatches: exactPairs.length,
    suggestedMatches: suggestedPairs.length,
    amountMismatches: mismatchPairs.length,
    unmatchedInvoices: unmatchedInvoices.filter((record) => record.validAmount).length,
    unmatchedPayments: unmatchedPayments.filter((record) => record.validAmount).length,
    duplicateReferences,
    invalidAmounts,
    exceptionCount: exceptions.length,
    highExceptions: exceptions.filter((exception) => exception.severity === 'high').length,
    invoiceTotal: sum(validInvoices),
    paymentTotal: sum(validPayments),
    exactMatchedTotal: exactPairs.reduce((total, pair) => total + pair.invoice.amount, 0),
    suggestedTotal: suggestedPairs.reduce((total, pair) => total + pair.invoice.amount, 0),
    reviewInvoiceTotal,
    unmatchedPaymentTotal: unmatchedPayments.filter((record) => record.validAmount).reduce((total, record) => total + record.amount, 0),
  }

  return {
    settings: { tolerance, dateWindowDays, dateOrder, invoiceMapping, paymentMapping },
    invoices,
    payments,
    reconciliationRows,
    exceptions,
    summary,
    actions: buildActions(summary),
  }
}

function spreadsheetSafe(value) {
  const text = stringValue(value)
  return /^[=+@]/.test(text) || (/^-/.test(text) && !/^-\d+(?:\.\d+)?$/.test(text)) ? `'${text}` : text
}

function csvCell(value) {
  const text = spreadsheetSafe(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function rowsToCsv(headers, rows) {
  return [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? '')).join(','))].join('\r\n') + '\r\n'
}

export function buildReconciliationCsv(result) {
  const headers = ['status', 'method', 'confidence', 'invoice_source_row', 'invoice_reference', 'invoice_party', 'invoice_date', 'invoice_amount', 'payment_source_row', 'payment_reference', 'payment_party', 'payment_date', 'payment_amount', 'difference', 'review_reason']
  return rowsToCsv(headers, result.reconciliationRows.map((pair) => ({
    status: pair.status,
    method: pair.method,
    confidence: pair.confidence,
    invoice_source_row: pair.invoice?.sourceRow || '',
    invoice_reference: pair.invoice?.reference || '',
    invoice_party: pair.invoice?.party || '',
    invoice_date: pair.invoice?.date || '',
    invoice_amount: pair.invoice?.validAmount ? pair.invoice.amount : pair.invoice?.rawAmount || '',
    payment_source_row: pair.payment?.sourceRow || '',
    payment_reference: pair.payment?.reference || '',
    payment_party: pair.payment?.party || '',
    payment_date: pair.payment?.date || '',
    payment_amount: pair.payment?.validAmount ? pair.payment.amount : pair.payment?.rawAmount || '',
    difference: pair.invoice?.validAmount && pair.payment?.validAmount ? pair.difference : '',
    review_reason: pair.reviewReason,
  })))
}

export function buildExceptionsCsv(result) {
  const headers = ['severity', 'type', 'side', 'source_row', 'reference', 'amount', 'detail']
  return rowsToCsv(headers, result.exceptions.map((exception) => ({
    severity: exception.severity,
    type: exception.type,
    side: exception.side,
    source_row: exception.sourceRow,
    reference: exception.reference,
    amount: exception.amount,
    detail: exception.detail,
  })))
}

function formatPlainNumber(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export function buildDecisionBrief(result, context = {}, approval = null) {
  const summary = result.summary
  return [
    'SUPERMEGA PAYMENT RECONCILIATION BRIEF',
    `Run: ${context.runId || 'pending'}`,
    `Prepared: ${context.generatedAt || new Date().toISOString()}`,
    `Invoices: ${summary.invoiceRows} rows / ${formatPlainNumber(summary.invoiceTotal)}`,
    `Payments: ${summary.paymentRows} rows / ${formatPlainNumber(summary.paymentTotal)}`,
    `Exact matches: ${summary.exactMatches} / ${formatPlainNumber(summary.exactMatchedTotal)}`,
    `Suggested pairs: ${summary.suggestedMatches} / ${formatPlainNumber(summary.suggestedTotal)}`,
    `Amount mismatches: ${summary.amountMismatches}`,
    `Unmatched invoices: ${summary.unmatchedInvoices}`,
    `Unmatched payments: ${summary.unmatchedPayments} / ${formatPlainNumber(summary.unmatchedPaymentTotal)}`,
    `Exceptions: ${summary.exceptionCount} (${summary.highExceptions} high)`,
    '',
    'NEXT REVIEW',
    ...result.actions.map((action, index) => `${index + 1}. [${action.priority.toUpperCase()}] ${action.title}: ${action.detail}`),
    '',
    approval ? `Reviewed by: ${approval.name} at ${approval.approvedAt}` : 'Reviewed by: pending',
    approval?.note ? `Review note: ${approval.note}` : 'Review note: pending when exceptions remain',
    'Boundary: review output only; no payment, invoice, message, or books entry was changed.',
  ].join('\n')
}

export function buildEvidence(result, context = {}, approval = null) {
  return {
    contract: 'supermega_payment_reconciliation_evidence_v1',
    run_id: context.runId || 'pending',
    generated_at: context.generatedAt || new Date().toISOString(),
    source_files: context.sourceFiles || [],
    settings: result.settings,
    summary: result.summary,
    approval,
    boundaries: {
      processing: 'browser_local',
      source_upload: false,
      source_rows_in_evidence: false,
      payment_or_books_write: false,
      automatic_finalization: false,
    },
  }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value)
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(bytes).digest('hex')
}

function escapeHtml(value) {
  return stringValue(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function displayNumber(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function saveText(name, text, type) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type }))
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

function initWorkcell() {
  const state = { invoice: null, payment: null, result: null, context: null, approval: null }
  const byId = (id) => document.getElementById(id)
  const requiredIds = ['invoiceFile', 'paymentFile', 'loadSample', 'mappingSection', 'analyzeButton', 'results', 'reviewName', 'reviewNote', 'reviewCheck', 'approveButton', 'downloadReconciliation', 'downloadExceptions', 'downloadBrief', 'downloadEvidence', 'copyBrief']
  if (requiredIds.some((id) => !byId(id))) return

  const mappingIds = {
    invoice: { reference: 'invoiceReference', amount: 'invoiceAmount', date: 'invoiceDate', party: 'invoiceParty' },
    payment: { reference: 'paymentReference', amount: 'paymentAmount', date: 'paymentDate', party: 'paymentParty' },
  }

  function setStatus(message, tone = '') {
    const node = byId('runStatus')
    node.textContent = message
    node.dataset.tone = tone
  }

  function resetApproval() {
    state.approval = null
    byId('approvalState').textContent = 'Not approved'
    for (const id of ['downloadReconciliation', 'downloadExceptions', 'downloadBrief', 'downloadEvidence']) byId(id).disabled = true
    updateApprovalButton()
  }

  function updateApprovalButton() {
    const hasExceptions = Boolean(state.result?.summary.exceptionCount)
    const ready = Boolean(state.result && cleanText(byId('reviewName').value) && byId('reviewCheck').checked && (!hasExceptions || cleanText(byId('reviewNote').value)))
    byId('approveButton').disabled = !ready
  }

  function renderFile(side) {
    const item = state[side]
    const name = byId(`${side}FileName`)
    const meta = byId(`${side}FileMeta`)
    if (!item) {
      name.textContent = 'No file selected'
      meta.textContent = side === 'invoice' ? 'Sales or invoice export' : 'Bank, wallet, or settlement export'
      return
    }
    name.textContent = item.name
    meta.textContent = `${item.dataset.rows.length.toLocaleString('en-US')} rows / ${item.dataset.headers.length} columns / ${item.dataset.kind.toUpperCase()}`
  }

  function fillMappingSelect(side, field, suggested) {
    const select = byId(mappingIds[side][field])
    const dataset = state[side].dataset
    const optional = field !== 'amount'
    select.innerHTML = `${optional ? '<option value="">Not available</option>' : '<option value="">Choose amount column</option>'}${dataset.headers.map((header) => `<option value="${escapeHtml(header.name)}">${escapeHtml(header.source)}</option>`).join('')}`
    select.value = suggested[field] || ''
  }

  function renderMappings() {
    const ready = Boolean(state.invoice && state.payment)
    byId('mappingSection').hidden = !ready
    byId('analyzeButton').disabled = !ready
    if (!ready) return
    for (const side of ['invoice', 'payment']) {
      const suggested = suggestMappings(state[side].dataset, side)
      for (const field of ['reference', 'amount', 'date', 'party']) fillMappingSelect(side, field, suggested)
    }
    setStatus('Map the columns, then run the reconciliation.', 'ready')
  }

  async function setSource(side, name, raw) {
    const dataset = parseDataset(raw, name)
    state[side] = { name, raw, hash: await sha256(raw), dataset }
    state.result = null
    state.context = null
    byId('results').hidden = true
    renderFile(side)
    renderMappings()
    resetApproval()
  }

  async function loadFile(side, file) {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) throw new Error(`${side === 'invoice' ? 'Sales' : 'Payment'} file is larger than 10 MB`)
    await setSource(side, file.name, await file.text())
  }

  function currentMapping(side) {
    return Object.fromEntries(Object.entries(mappingIds[side]).map(([field, id]) => [field, byId(id).value]))
  }

  function renderResults() {
    const { result } = state
    const summary = result.summary
    byId('results').hidden = false
    byId('resultHeadline').textContent = summary.highExceptions ? 'Review before close' : summary.exceptionCount ? 'Review remaining exceptions' : 'Exact reconciliation ready'
    byId('resultState').textContent = `${summary.exactMatches} exact / ${summary.suggestedMatches} suggested / ${summary.exceptionCount} exceptions`
    byId('metricGrid').innerHTML = [
      ['Invoice total', displayNumber(summary.invoiceTotal)],
      ['Payment total', displayNumber(summary.paymentTotal)],
      ['Exact matched', displayNumber(summary.exactMatchedTotal)],
      ['Needs review', displayNumber(summary.reviewInvoiceTotal)],
      ['Unmatched money', displayNumber(summary.unmatchedPaymentTotal)],
      ['High exceptions', summary.highExceptions.toLocaleString('en-US')],
    ].map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')

    byId('actionList').innerHTML = result.actions.map((action, index) => `<li><span class="priority ${escapeHtml(action.priority)}">${index + 1} / ${escapeHtml(action.priority)}</span><div><strong>${escapeHtml(action.title)}</strong><p>${escapeHtml(action.detail)}</p></div></li>`).join('')

    const visibleRows = result.reconciliationRows.slice(0, MAX_RENDERED_ROWS)
    byId('reconciliationBody').innerHTML = visibleRows.map((pair) => `<tr><td><span class="status ${escapeHtml(pair.status)}">${escapeHtml(pair.status.replaceAll('_', ' '))}</span></td><td>${escapeHtml(pair.invoice?.reference || '—')}</td><td class="number">${escapeHtml(pair.invoice?.validAmount ? displayNumber(pair.invoice.amount) : pair.invoice?.rawAmount || '—')}</td><td>${escapeHtml(pair.payment?.reference || '—')}</td><td class="number">${escapeHtml(pair.payment?.validAmount ? displayNumber(pair.payment.amount) : pair.payment?.rawAmount || '—')}</td><td class="number">${pair.invoice?.validAmount && pair.payment?.validAmount ? escapeHtml(displayNumber(pair.difference)) : '—'}</td><td>${escapeHtml(pair.method.replaceAll('_', ' '))}</td></tr>`).join('')
    byId('rowLimitNote').textContent = result.reconciliationRows.length > MAX_RENDERED_ROWS ? `Showing the first ${MAX_RENDERED_ROWS} of ${result.reconciliationRows.length.toLocaleString('en-US')} result rows. Approved downloads include every row.` : `${result.reconciliationRows.length.toLocaleString('en-US')} result rows.`
    byId('briefPreview').textContent = buildDecisionBrief(result, state.context, state.approval)
    setStatus('Reconciliation complete. Review exceptions and record approval.', summary.highExceptions ? 'review' : 'ready')
    resetApproval()
    byId('results').scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function analyze() {
    try {
      const generatedAt = new Date().toISOString()
      const settings = {
        tolerance: byId('amountTolerance').value,
        dateWindowDays: byId('dateWindow').value,
        dateOrder: byId('dateOrder').value,
        invoiceMapping: currentMapping('invoice'),
        paymentMapping: currentMapping('payment'),
      }
      const result = reconcileDatasets(state.invoice.dataset, state.payment.dataset, settings)
      const runId = `REC-${state.invoice.hash.slice(0, 8)}-${state.payment.hash.slice(0, 8)}`.toUpperCase()
      state.context = {
        runId,
        generatedAt,
        sourceFiles: [
          { role: 'invoice', name: state.invoice.name, sha256: state.invoice.hash, rows: state.invoice.dataset.rows.length, columns: state.invoice.dataset.headers.length },
          { role: 'payment', name: state.payment.name, sha256: state.payment.hash, rows: state.payment.dataset.rows.length, columns: state.payment.dataset.headers.length },
        ],
      }
      state.result = result
      renderResults()
    } catch (error) {
      setStatus(error.message, 'error')
    }
  }

  async function loadSample() {
    try {
      const invoiceCsv = 'invoice_no,customer_name,invoice_date,amount\r\nINV-1001,Aye Aye,2026-07-10,125000\r\nINV-1002,Ko Min,2026-07-11,88000\r\nINV-1003,May Store,2026-07-12,220000\r\nINV-1004,Lotus Cafe,2026-07-12,54000\r\nINV-1005,Shwe Mart,2026-07-13,150000\r\n'
      const paymentCsv = 'invoice_ref,payer_name,payment_date,paid_amount\r\nINV-1001,Aye Aye,2026-07-10,125000\r\nINV-1002,Ko Min,2026-07-11,80000\r\n,May Store,2026-07-13,220000\r\nTX-889,Lotus Cafe,2026-07-12,54000\r\nEXTRA-77,Walk in,2026-07-13,45000\r\n'
      await setSource('invoice', 'sample-invoices.csv', invoiceCsv)
      await setSource('payment', 'sample-payments.csv', paymentCsv)
      setStatus('Sample loaded. Review the suggested mappings, then reconcile.', 'ready')
    } catch (error) {
      setStatus(error.message, 'error')
    }
  }

  async function copyBrief() {
    const text = buildDecisionBrief(state.result, state.context, state.approval)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.append(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    byId('copyBrief').textContent = 'Copied'
    window.setTimeout(() => { byId('copyBrief').textContent = 'Copy brief' }, 1400)
  }

  for (const side of ['invoice', 'payment']) {
    byId(`${side}File`).addEventListener('change', async (event) => {
      try {
        await loadFile(side, event.target.files?.[0])
      } catch (error) {
        setStatus(error.message, 'error')
      }
    })
  }
  for (const picker of document.querySelectorAll('[data-drop-side]')) {
    const side = picker.getAttribute('data-drop-side')
    for (const eventName of ['dragenter', 'dragover']) {
      picker.addEventListener(eventName, (event) => {
        event.preventDefault()
        picker.classList.add('is-dragging')
      })
    }
    for (const eventName of ['dragleave', 'drop']) {
      picker.addEventListener(eventName, (event) => {
        event.preventDefault()
        picker.classList.remove('is-dragging')
      })
    }
    picker.addEventListener('drop', async (event) => {
      try {
        await loadFile(side, event.dataTransfer?.files?.[0])
      } catch (error) {
        setStatus(error.message, 'error')
      }
    })
  }
  byId('loadSample').addEventListener('click', loadSample)
  byId('analyzeButton').addEventListener('click', analyze)
  for (const id of [...Object.values(mappingIds.invoice), ...Object.values(mappingIds.payment), 'amountTolerance', 'dateWindow', 'dateOrder']) {
    byId(id).addEventListener('change', () => {
      state.result = null
      byId('results').hidden = true
      resetApproval()
      setStatus('Mappings changed. Run the reconciliation again.', 'ready')
    })
  }
  for (const id of ['reviewName', 'reviewNote']) byId(id).addEventListener('input', updateApprovalButton)
  byId('reviewCheck').addEventListener('change', updateApprovalButton)
  byId('approveButton').addEventListener('click', () => {
    state.approval = {
      name: cleanText(byId('reviewName').value),
      note: cleanText(byId('reviewNote').value),
      approvedAt: new Date().toISOString(),
      disposition: state.result.summary.exceptionCount ? 'reviewed_with_exceptions' : 'approved_exact',
    }
    byId('approvalState').textContent = `${state.approval.disposition.replaceAll('_', ' ')} / ${state.approval.name}`
    for (const id of ['downloadReconciliation', 'downloadExceptions', 'downloadBrief', 'downloadEvidence']) byId(id).disabled = false
    byId('briefPreview').textContent = buildDecisionBrief(state.result, state.context, state.approval)
    byId('approveButton').disabled = true
  })
  byId('copyBrief').addEventListener('click', copyBrief)
  byId('downloadReconciliation').addEventListener('click', () => saveText(`${state.context.runId.toLowerCase()}-reconciliation.csv`, buildReconciliationCsv(state.result), 'text/csv;charset=utf-8'))
  byId('downloadExceptions').addEventListener('click', () => saveText(`${state.context.runId.toLowerCase()}-exceptions.csv`, buildExceptionsCsv(state.result), 'text/csv;charset=utf-8'))
  byId('downloadBrief').addEventListener('click', () => saveText(`${state.context.runId.toLowerCase()}-brief.txt`, buildDecisionBrief(state.result, state.context, state.approval), 'text/plain;charset=utf-8'))
  byId('downloadEvidence').addEventListener('click', () => saveText(`${state.context.runId.toLowerCase()}-evidence.json`, `${JSON.stringify(buildEvidence(state.result, state.context, state.approval), null, 2)}\n`, 'application/json;charset=utf-8'))
  renderFile('invoice')
  renderFile('payment')
  updateApprovalButton()
}

if (typeof document !== 'undefined') initWorkcell()
