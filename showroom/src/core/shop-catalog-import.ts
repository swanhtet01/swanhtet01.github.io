import type { CommerceItem } from './commerce-workspace'
import {
  CLIENT_IMPORT_MAX_BYTES,
  CLIENT_IMPORT_MAX_ROWS,
  clientImportTemplate,
  createClientImportPreview,
  type ClientImportIssue,
  type ClientImportMapping,
} from './client-onboarding.ts'

export const SHOP_CATALOG_IMPORT_SCHEMA = 'supermega.shop.catalog_import.v1' as const
export const SHOP_CATALOG_IMPORT_MAX_BYTES = CLIENT_IMPORT_MAX_BYTES
export const SHOP_CATALOG_IMPORT_MAX_ROWS = CLIENT_IMPORT_MAX_ROWS
export const SHOP_CATALOG_IMPORT_TEMPLATE = clientImportTemplate('commerce', 'social-commerce')

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

const formulaPrefix = /^[=+\-@]/
const shopFieldSet = new Set<string>(shopCatalogImportFields)

export function shopCatalogImportFieldLabel(field: ShopCatalogImportField) {
  return {
    sku: 'SKU',
    name: 'Item name',
    onHand: 'Opening stock',
    reorderAt: 'Reorder at',
    price: 'Price (MMK)',
  }[field]
}

export function emptyShopCatalogImportMapping(): ShopCatalogImportMapping {
  return { sku: '', name: '', onHand: '', reorderAt: '', price: '' }
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

async function sha256(value: string) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure import fingerprinting is unavailable in this browser.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function shopIssue(issue: ClientImportIssue): ShopCatalogImportIssue {
  const field = issue.code === 'duplicate_object_key'
    ? 'sku'
    : shopFieldSet.has(issue.field) ? issue.field as ShopCatalogImportField : issue.field === 'row' ? 'row' : 'file'
  const fieldCodes: Record<string, string> = field === 'file' || field === 'row' ? {} : {
    value_required: `${field}_required`,
    value_not_canonical: `${field}_not_canonical`,
    unicode_normalization: `${field}_unicode_normalization`,
    control_character: `${field}_control_character`,
    spreadsheet_formula: `${field}_spreadsheet_formula`,
    value_too_long: `${field}_too_long`,
    whole_number_required: `${field}_whole_number`,
    number_out_of_range: `${field}_range`,
    identifier_not_canonical: field === 'sku' ? 'sku_not_uppercase' : `${field}_not_canonical`,
    duplicate_object_key: field === 'sku' ? 'duplicate_file_sku' : issue.code,
  }
  const fieldCode = fieldCodes[issue.code] ?? issue.code
  return {
    code: issue.code === 'duplicate_object_key' ? 'duplicate_file_sku' : fieldCode,
    field,
    message: issue.message,
  }
}

function itemFromValues(values: Record<string, string>): CommerceItem {
  return {
    sku: values.sku,
    name: values.name,
    onHand: Number(values.onHand),
    reorderAt: Number(values.reorderAt),
    price: Number(values.price),
  }
}

function sameImportedValues(existing: CommerceItem, item: CommerceItem) {
  return existing.sku === item.sku
    && existing.name === item.name
    && existing.onHand === item.onHand
    && existing.reorderAt === item.reorderAt
    && existing.price === item.price
}

function classifyAgainstCatalog(rows: ShopCatalogImportRow[], existingCatalog: CommerceItem[]) {
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
  const shared = await createClientImportPreview(
    csvText,
    'commerce',
    selectedMapping as ClientImportMapping | undefined,
    sourceName,
    'social-commerce',
  )
  const rows: ShopCatalogImportRow[] = shared.rows.map((row) => ({
    rowNumber: row.rowNumber,
    status: row.status,
    source: row.source,
    item: row.status === 'invalid' ? null : itemFromValues(row.values),
    issues: row.issues.map(shopIssue),
  }))
  classifyAgainstCatalog(rows, existingCatalog)
  const catalogSignature = shopCatalogImportCatalogSignature(existingCatalog)
  const catalogDigest = await sha256(catalogSignature)
  const previewDigest = await sha256(JSON.stringify({
    schema: SHOP_CATALOG_IMPORT_SCHEMA,
    sharedPreviewDigest: shared.previewDigest,
    catalogDigest,
  }))
  return {
    schema: SHOP_CATALOG_IMPORT_SCHEMA,
    sourceName: shared.sourceName,
    sourceDigest: shared.sourceDigest,
    previewDigest,
    catalogDigest,
    catalogSignature,
    headers: shared.headers,
    mapping: shared.mapping as ShopCatalogImportMapping,
    suggestions: shared.suggestions.map((suggestion) => ({
      ...suggestion,
      field: suggestion.field as ShopCatalogImportField,
    })),
    fileIssues: shared.fileIssues.map(shopIssue),
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
