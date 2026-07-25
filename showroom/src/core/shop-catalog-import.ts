import type { CommerceItem } from './commerce-workspace'

export const SHOP_CATALOG_IMPORT_SCHEMA = 'supermega.shop.catalog_import.v1' as const
export const SHOP_CATALOG_IMPORT_MAX_BYTES = 512 * 1024
export const SHOP_CATALOG_IMPORT_MAX_ROWS = 500
export const SHOP_CATALOG_IMPORT_TEMPLATE = `sku,item_name,opening_stock,reorder_at,price_mmk
SKU-001,Green tea,24,8,4500
SKU-002,မြန်မာ ကော်ဖီ,12,5,7000
`

export const shopCatalogImportFields = ['sku', 'name', 'onHand', 'reorderAt', 'price'] as const

export type ShopCatalogImportField = typeof shopCatalogImportFields[number]
export type ShopCatalogImportMapping = Record<ShopCatalogImportField, string>
export type ShopCatalogImportRowStatus = 'ready' | 'invalid' | 'duplicate' | 'conflict' | 'already_exists'

export type ShopCatalogImportIssue = {
  code: string
  field: ShopCatalogImportField | 'file' | 'row'
  message: string
}

export type ShopCatalogImportSuggestion = {
  field: ShopCatalogImportField
  header: string
  basis: 'exact' | 'alias' | 'ambiguous' | 'unmapped'
}

export type ShopCatalogImportRow = {
  rowNumber: number
  status: ShopCatalogImportRowStatus
  source: Record<string, string>
  item: CommerceItem | null
  issues: ShopCatalogImportIssue[]
}

export type ShopCatalogImportPreview = {
  schema: typeof SHOP_CATALOG_IMPORT_SCHEMA
  sourceName: string
  sourceDigest: string
  previewDigest: string
  catalogDigest: string
  catalogSignature: string
  headers: string[]
  mapping: ShopCatalogImportMapping
  suggestions: ShopCatalogImportSuggestion[]
  fileIssues: ShopCatalogImportIssue[]
  rows: ShopCatalogImportRow[]
  totals: {
    rows: number
    ready: number
    invalid: number
    duplicates: number
    conflicts: number
    alreadyExists: number
    issueRows: number
  }
}

type ParsedCsvRow = {
  rowNumber: number
  cells: string[]
}

const fieldLabels: Record<ShopCatalogImportField, string> = {
  sku: 'SKU',
  name: 'Item name',
  onHand: 'Opening stock',
  reorderAt: 'Reorder at',
  price: 'Price (MMK)',
}

const fieldAliases: Record<ShopCatalogImportField, string[]> = {
  sku: ['sku', 'item_sku', 'product_sku', 'stock_code', 'item_code', 'product_code'],
  name: ['item_name', 'name', 'product_name', 'title', 'description'],
  onHand: ['opening_stock', 'on_hand', 'available_stock', 'stock', 'quantity', 'qty', 'opening_quantity'],
  reorderAt: ['reorder_at', 'reorder_level', 'reorder_point', 'low_stock_at', 'minimum_stock', 'min_stock'],
  price: ['price_mmk', 'price', 'unit_price', 'selling_price', 'mmk_price'],
}

const formulaPrefix = /^[=+\-@]/

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) as number
    return codePoint <= 31 || codePoint === 127
  })
}

export function shopCatalogImportFieldLabel(field: ShopCatalogImportField) {
  return fieldLabels[field]
}

export function emptyShopCatalogImportMapping(): ShopCatalogImportMapping {
  return { sku: '', name: '', onHand: '', reorderAt: '', price: '' }
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
}

function compareCodePoints(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) as number)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) as number)
  const shared = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < shared; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index]
  }
  return leftPoints.length - rightPoints.length
}

export function shopCatalogImportCatalogSignature(catalog: CommerceItem[]) {
  return JSON.stringify([...catalog]
    .map((item) => ({
      sku: item.sku,
      name: item.name,
      variant: item.variant ?? null,
      onHand: item.onHand,
      reorderAt: item.reorderAt,
      price: item.price,
    }))
    .sort((left, right) => compareCodePoints(left.sku, right.sku)))
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

async function sha256(value: string) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure import fingerprinting is unavailable in this browser.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function parseCsv(input: string) {
  if (byteLength(input) > SHOP_CATALOG_IMPORT_MAX_BYTES) {
    throw new Error(`Choose a CSV smaller than ${SHOP_CATALOG_IMPORT_MAX_BYTES / 1024} KB.`)
  }
  if (input.includes('\0')) throw new Error('The CSV contains a null byte and was rejected.')
  const source = input.startsWith('\uFEFF') ? input.slice(1) : input
  if (!source.trim()) throw new Error('The CSV is empty.')

  const rows: ParsedCsvRow[] = []
  let cells: string[] = []
  let field = ''
  let inQuotes = false
  let quotedFieldClosed = false
  let line = 1
  let rowStart = 1

  const pushRow = () => {
    cells.push(field)
    rows.push({ rowNumber: rowStart, cells })
    cells = []
    field = ''
    quotedFieldClosed = false
    rowStart = line + 1
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
          quotedFieldClosed = true
        }
      } else {
        field += character
        if (character === '\n') line += 1
      }
      continue
    }

    if (quotedFieldClosed && character !== ',' && character !== '\n' && character !== '\r') {
      throw new Error(`CSV row ${rowStart} has text after a closing quote.`)
    }

    if (character === '"') {
      if (field.length) throw new Error(`CSV row ${rowStart} has a quote inside an unquoted value.`)
      inQuotes = true
    } else if (character === ',') {
      cells.push(field)
      field = ''
      quotedFieldClosed = false
    } else if (character === '\n') {
      pushRow()
      line += 1
    } else if (character === '\r') {
      if (source[index + 1] === '\n') continue
      pushRow()
      line += 1
    } else {
      field += character
    }
  }

  if (inQuotes) throw new Error(`CSV row ${rowStart} has an unclosed quoted value.`)
  if (field.length || cells.length) {
    cells.push(field)
    rows.push({ rowNumber: rowStart, cells })
  }
  while (rows.length > 1 && rows.at(-1)?.cells.every((cell) => !cell)) rows.pop()
  if (!rows.length) throw new Error('The CSV has no header row.')
  if (rows.length - 1 > SHOP_CATALOG_IMPORT_MAX_ROWS) {
    throw new Error(`Preview at most ${SHOP_CATALOG_IMPORT_MAX_ROWS} catalog rows at a time.`)
  }
  return rows
}

function inspectHeaders(headers: string[]) {
  if (headers.length > 50) throw new Error('The CSV has more than 50 columns.')
  if (headers.some((header) => !header.trim() || hasControlCharacter(header))) {
    throw new Error('Every CSV column needs a visible header without control characters.')
  }
  const normalized = headers.map(normalizeHeader)
  if (new Set(normalized).size !== normalized.length) throw new Error('The CSV has duplicate or equivalent column headers.')
  return normalized
}

function suggestMapping(headers: string[], normalizedHeaders: string[]) {
  const mapping = emptyShopCatalogImportMapping()
  const suggestions: ShopCatalogImportSuggestion[] = []
  for (const field of shopCatalogImportFields) {
    const aliases = fieldAliases[field]
    const ranked = normalizedHeaders.flatMap((header, index) => {
      const rank = aliases.indexOf(header)
      return rank < 0 ? [] : [{ header: headers[index], rank }]
    }).sort((left, right) => left.rank - right.rank || compareCodePoints(left.header, right.header))
    const best = ranked[0]
    const ambiguous = best && ranked.filter((candidate) => candidate.rank === best.rank).length > 1
    mapping[field] = best && !ambiguous ? best.header : ''
    suggestions.push({
      field,
      header: mapping[field],
      basis: ambiguous ? 'ambiguous' : !best ? 'unmapped' : best.rank === 0 ? 'exact' : 'alias',
    })
  }
  return { mapping, suggestions }
}

function mappingIssues(headers: string[], mapping: ShopCatalogImportMapping) {
  const issues: ShopCatalogImportIssue[] = []
  const selected: string[] = []
  for (const field of shopCatalogImportFields) {
    const header = mapping[field]
    if (!header) {
      issues.push({ code: 'mapping_required', field, message: `Map ${fieldLabels[field]} to one CSV column.` })
    } else if (!headers.includes(header)) {
      issues.push({ code: 'mapping_unknown_header', field, message: `${fieldLabels[field]} is mapped to a missing column.` })
    } else {
      selected.push(header)
    }
  }
  const duplicates = selected.filter((header, index) => selected.indexOf(header) !== index)
  for (const header of [...new Set(duplicates)]) {
    issues.push({ code: 'mapping_reused_header', field: 'file', message: `${header} cannot supply more than one catalog field.` })
  }
  return issues
}

function textIssue(field: 'sku' | 'name', value: string): ShopCatalogImportIssue | null {
  const label = fieldLabels[field]
  const maximum = field === 'sku' ? 80 : 180
  if (!value) return { code: `${field}_required`, field, message: `${label} is required.` }
  if (value !== value.trim()) return { code: `${field}_not_canonical`, field, message: `${label} has leading or trailing spaces.` }
  if (value !== value.normalize('NFC')) return { code: `${field}_unicode_normalization`, field, message: `${label} must use normalized Unicode text.` }
  if (hasControlCharacter(value)) return { code: `${field}_control_character`, field, message: `${label} contains a control character.` }
  if (formulaPrefix.test(value)) return { code: `${field}_spreadsheet_formula`, field, message: `${label} begins like a spreadsheet formula and was rejected.` }
  if (value.length > maximum) return { code: `${field}_too_long`, field, message: `${label} must be ${maximum} characters or fewer.` }
  if (field === 'sku' && value !== value.toUpperCase()) return { code: 'sku_not_uppercase', field, message: 'SKU must already be uppercase; the preview will not silently change it.' }
  return null
}

function integerIssue(field: 'onHand' | 'reorderAt' | 'price', value: string): ShopCatalogImportIssue | null {
  const label = fieldLabels[field]
  if (!/^[0-9]+$/.test(value)) return { code: `${field}_whole_number`, field, message: `${label} must use whole ASCII digits without commas or signs.` }
  const number = Number(value)
  if (!Number.isSafeInteger(number)) return { code: `${field}_unsafe_integer`, field, message: `${label} is outside the supported whole-number range.` }
  if (field === 'price' ? number < 1 : number < 0) return { code: `${field}_range`, field, message: `${label} is outside the supported range.` }
  return null
}

function sameImportedValues(existing: CommerceItem, item: CommerceItem) {
  return existing.sku === item.sku
    && existing.name === item.name
    && existing.onHand === item.onHand
    && existing.reorderAt === item.reorderAt
    && existing.price === item.price
}

function rowFromMapping(
  parsed: ParsedCsvRow,
  headers: string[],
  mapping: ShopCatalogImportMapping,
  fileIssues: ShopCatalogImportIssue[],
): ShopCatalogImportRow {
  const source = Object.fromEntries(headers.map((header, index) => [header, parsed.cells[index] ?? '']))
  const issues: ShopCatalogImportIssue[] = []
  if (parsed.cells.length !== headers.length) {
    issues.push({ code: 'column_count', field: 'row', message: `Expected ${headers.length} columns but found ${parsed.cells.length}.` })
  }
  if (parsed.cells.every((cell) => !cell)) issues.push({ code: 'empty_row', field: 'row', message: 'Remove the empty CSV row.' })
  if (fileIssues.length) issues.push({ code: 'mapping_incomplete', field: 'row', message: 'Complete the column mapping before this row can be checked.' })
  if (issues.length) return { rowNumber: parsed.rowNumber, status: 'invalid', source, item: null, issues }

  const value = (field: ShopCatalogImportField) => source[mapping[field]] ?? ''
  const sku = value('sku')
  const name = value('name')
  const onHandText = value('onHand')
  const reorderAtText = value('reorderAt')
  const priceText = value('price')
  const validations = [
    textIssue('sku', sku),
    textIssue('name', name),
    integerIssue('onHand', onHandText),
    integerIssue('reorderAt', reorderAtText),
    integerIssue('price', priceText),
  ].filter((issue): issue is ShopCatalogImportIssue => issue !== null)
  if (validations.length) return { rowNumber: parsed.rowNumber, status: 'invalid', source, item: null, issues: validations }

  return {
    rowNumber: parsed.rowNumber,
    status: 'ready',
    source,
    item: { sku, name, onHand: Number(onHandText), reorderAt: Number(reorderAtText), price: Number(priceText) },
    issues: [],
  }
}

function classifyRows(rows: ShopCatalogImportRow[], existingCatalog: CommerceItem[]) {
  const validBySku = new Map<string, ShopCatalogImportRow[]>()
  for (const row of rows) {
    if (!row.item) continue
    const matches = validBySku.get(row.item.sku) ?? []
    matches.push(row)
    validBySku.set(row.item.sku, matches)
  }
  for (const [sku, matches] of validBySku) {
    if (matches.length < 2) continue
    for (const row of matches) {
      row.status = 'duplicate'
      row.issues.push({ code: 'duplicate_file_sku', field: 'sku', message: `${sku} appears ${matches.length} times in this file.` })
    }
  }

  const existingBySku = new Map(existingCatalog.map((item) => [item.sku, item]))
  for (const row of rows) {
    if (!row.item || row.status !== 'ready') continue
    const existing = existingBySku.get(row.item.sku)
    if (!existing) continue
    if (sameImportedValues(existing, row.item)) {
      row.status = 'already_exists'
      row.issues.push({ code: 'already_exists', field: 'sku', message: `${row.item.sku} already has these exact catalog values.` })
    } else {
      row.status = 'conflict'
      row.issues.push({ code: 'existing_sku_conflict', field: 'sku', message: `${row.item.sku} already exists with different catalog values.` })
    }
  }

  let remainingCapacity = Math.max(0, SHOP_CATALOG_IMPORT_MAX_ROWS - existingCatalog.length)
  for (const row of rows) {
    if (row.status !== 'ready') continue
    if (remainingCapacity > 0) {
      remainingCapacity -= 1
      continue
    }
    row.status = 'invalid'
    row.issues.push({ code: 'catalog_capacity', field: 'row', message: `The Shop catalog supports at most ${SHOP_CATALOG_IMPORT_MAX_ROWS} attributable item baselines.` })
  }
}

function totalsFor(rows: ShopCatalogImportRow[]) {
  return {
    rows: rows.length,
    ready: rows.filter((row) => row.status === 'ready').length,
    invalid: rows.filter((row) => row.status === 'invalid').length,
    duplicates: rows.filter((row) => row.status === 'duplicate').length,
    conflicts: rows.filter((row) => row.status === 'conflict').length,
    alreadyExists: rows.filter((row) => row.status === 'already_exists').length,
    issueRows: rows.filter((row) => row.status === 'invalid' || row.status === 'duplicate' || row.status === 'conflict').length,
  }
}

export async function createShopCatalogImportPreview(
  csvText: string,
  existingCatalog: CommerceItem[],
  selectedMapping?: ShopCatalogImportMapping,
  sourceName = 'catalog.csv',
): Promise<ShopCatalogImportPreview> {
  const parsed = parseCsv(csvText)
  const headerRow = parsed[0]
  if (!headerRow) throw new Error('The CSV has no header row.')
  const headers = headerRow.cells
  const normalizedHeaders = inspectHeaders(headers)
  const suggested = suggestMapping(headers, normalizedHeaders)
  const mapping = selectedMapping ? { ...selectedMapping } : suggested.mapping
  const fileIssues = mappingIssues(headers, mapping)
  const rows = parsed.slice(1).map((row) => rowFromMapping(row, headers, mapping, fileIssues))
  classifyRows(rows, existingCatalog)
  const catalogSignature = shopCatalogImportCatalogSignature(existingCatalog)
  const source = csvText.startsWith('\uFEFF') ? csvText.slice(1) : csvText
  const [sourceDigest, catalogDigest] = await Promise.all([sha256(source), sha256(catalogSignature)])
  const previewDigest = await sha256(JSON.stringify({
    schema: SHOP_CATALOG_IMPORT_SCHEMA,
    sourceDigest,
    catalogDigest,
    mapping: Object.fromEntries(shopCatalogImportFields.map((field) => [field, mapping[field]])),
  }))
  return {
    schema: SHOP_CATALOG_IMPORT_SCHEMA,
    sourceName: sourceName.trim() || 'catalog.csv',
    sourceDigest,
    previewDigest,
    catalogDigest,
    catalogSignature,
    headers,
    mapping,
    suggestions: suggested.suggestions,
    fileIssues,
    rows,
    totals: totalsFor(rows),
  }
}

function safeSpreadsheetCell(value: string | number) {
  const text = String(value)
  const protectedText = formulaPrefix.test(text) ? `'${text}` : text
  return /[",\r\n]/.test(protectedText) ? `"${protectedText.replaceAll('"', '""')}"` : protectedText
}

export function shopCatalogImportErrorsCsv(preview: ShopCatalogImportPreview) {
  const lines = [['row', 'status', 'sku', 'issue_codes', 'issues'].map(safeSpreadsheetCell).join(',')]
  for (const issue of preview.fileIssues) {
    lines.push([0, 'file', '', issue.code, issue.message].map(safeSpreadsheetCell).join(','))
  }
  for (const row of preview.rows) {
    if (row.status === 'ready' || row.status === 'already_exists') continue
    lines.push([
      row.rowNumber,
      row.status,
      row.item?.sku ?? row.source[preview.mapping.sku] ?? '',
      row.issues.map((issue) => issue.code).join('|'),
      row.issues.map((issue) => issue.message).join(' | '),
    ].map(safeSpreadsheetCell).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}
