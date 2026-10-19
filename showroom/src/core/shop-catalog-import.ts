import { commerceCatalogImportDifferences, type CommerceItem } from './commerce-workspace.ts'
import {
  CLIENT_IMPORT_MAX_BYTES,
  CLIENT_IMPORT_MAX_ROWS,
  clientImportSha256,
  createClientImportPreview,
  normalizeClientImportHeader,
  validateClientImportFieldValue,
  type ClientImportIssue,
  type ClientImportField,
  type ClientImportMapping,
  type ClientImportPreview,
} from './client-onboarding.ts'

export const SHOP_CATALOG_IMPORT_SCHEMA = 'supermega.shop.catalog_import.v1' as const
export const SHOP_CATALOG_IMPORT_MAX_BYTES = CLIENT_IMPORT_MAX_BYTES
export const SHOP_CATALOG_IMPORT_MAX_ROWS = CLIENT_IMPORT_MAX_ROWS
// Keep the compact, backwards-compatible Shop download stable. The guided
// client-onboarding template adds the optional name_my column for Myanmar catalogs.
export const SHOP_CATALOG_IMPORT_TEMPLATE = 'sku,barcode,item_name,category,opening_stock,reorder_at,price_mmk\r\nCOFFEE-250,,Myanmar coffee 250g,,24,8,7000\r\nTEA-20,,Green tea 20 pack,,36,12,4500\r\n'

export const shopCatalogImportFields = ['sku', 'barcode', 'name', 'category', 'onHand', 'reorderAt', 'price'] as const

export type ShopCatalogImportField = typeof shopCatalogImportFields[number]
export type ShopCatalogImportMapping = Record<ShopCatalogImportField, string> & { nameMy?: string }
export type ShopCatalogImportRowStatus = 'ready' | 'invalid' | 'duplicate' | 'conflict' | 'already_exists'

export type ShopCatalogImportIssue = {
  code: string
  field: ShopCatalogImportField | 'nameMy' | 'variant' | 'file' | 'row'
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

export type ShopCatalogImportReviewKind = 'new' | 'possible_match' | 'conflict' | 'unchanged' | 'capacity'

export function summarizeShopCatalogImportReview(
  readyRows: number,
  reviewRows: readonly { kind: ShopCatalogImportReviewKind }[],
) {
  const blockingRowCount = reviewRows.filter((row) => row.kind === 'conflict' || row.kind === 'capacity').length
  const unchangedRowCount = reviewRows.filter((row) => row.kind === 'unchanged').length
  const readyRowCount = Math.max(0, readyRows - blockingRowCount - unchangedRowCount)
  return {
    readyRowCount,
    unchangedRowCount,
    blockingRowCount,
    unchangedOnly: readyRows > 0 && readyRowCount === 0 && unchangedRowCount > 0 && blockingRowCount === 0,
  }
}

export type ShopCatalogImportPreview = {
  schema: typeof SHOP_CATALOG_IMPORT_SCHEMA
  sourceName: string
  sourceDigest: string
  previewDigest: string
  catalogDigest: string
  catalogSignature: string
  headers: string[]
  variantHeader: string
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
const shopFieldSet = new Set<string>([...shopCatalogImportFields, 'nameMy'])
const shopVariantAliases = new Set(['variant', 'product_variant', 'size', 'product_size', 'flavor', 'option', 'color', 'colour', 'product_color', 'product_colour', 'အရောင်', 'အရွယ်အစား'].map(normalizeClientImportHeader))
const shopVariantField: ClientImportField = { id: 'variant', label: 'Variant', required: false, kind: 'text', aliases: [], maximum: 120 }

function shopVariantCandidates(headers: string[]) {
  return headers.filter((header) => shopVariantAliases.has(normalizeClientImportHeader(header)))
}

export class ShopCatalogImportVariantChoiceRequiredError extends Error {
  readonly code = 'human_choice_required'
  readonly candidates: string[]

  constructor(candidates: string[]) {
    super(`Choose one variant column from this file: ${candidates.join(', ')}.`)
    this.name = 'ShopCatalogImportVariantChoiceRequiredError'
    this.candidates = candidates
  }
}

function shopVariantHeader(headers: string[], selectedVariantHeader?: string) {
  const candidates = shopVariantCandidates(headers)
  if (selectedVariantHeader !== undefined) {
    if (selectedVariantHeader && !headers.includes(selectedVariantHeader)) {
      throw new Error('Choose a variant column from this file.')
    }
    return selectedVariantHeader
  }
  if (candidates.length > 1) throw new ShopCatalogImportVariantChoiceRequiredError(candidates)
  return candidates[0] ?? ''
}

function suggestedShopVariantHeader(headers: string[]) {
  const candidates = headers.filter((header) => shopVariantAliases.has(normalizeClientImportHeader(header)))
  return candidates.length === 1 ? candidates[0] : ''
}

function shopVariantIssue(value: string): ShopCatalogImportIssue | null {
  if (!value) return null
  const issue = validateClientImportFieldValue(shopVariantField, value)
  return issue ? { code: issue.code, field: 'variant', message: issue.message } : null
}

export function shopCatalogImportFieldLabel(field: ShopCatalogImportField) {
  return {
    sku: 'SKU',
    barcode: 'Barcode (optional)',
    name: 'Item name',
    nameMy: 'Myanmar item name (optional)',
    category: 'Category (optional)',
    onHand: 'Opening stock',
    reorderAt: 'Reorder at',
    price: 'Price (MMK)',
  }[field]
}

export function emptyShopCatalogImportMapping(): ShopCatalogImportMapping {
  return { sku: '', barcode: '', name: '', category: '', onHand: '', reorderAt: '', price: '' }
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
      barcode: item.barcode ?? null,
      name: item.name,
      nameMy: item.nameMy ?? null,
      category: item.category ?? null,
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
    : shopFieldSet.has(issue.field) ? issue.field as ShopCatalogImportIssue['field'] : issue.field === 'row' ? 'row' : 'file'
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
    ...(values.nameMy ? { nameMy: values.nameMy } : {}),
    ...(values.category ? { category: values.category } : {}),
    ...(values.variant ? { variant: values.variant } : {}),
    ...(values.barcode ? { barcode: values.barcode } : {}),
    onHand: Number(values.onHand),
    reorderAt: Number(values.reorderAt),
    price: Number(values.price),
  }
}

function sameImportedValues(existing: CommerceItem, item: CommerceItem) {
  return existing.sku === item.sku
    && existing.name === item.name
    && existing.nameMy === (item.nameMy || existing.nameMy)
    && existing.category === (item.category || existing.category)
    && existing.variant === (item.variant || existing.variant)
    && existing.barcode === (item.barcode || existing.barcode)
    && existing.onHand === item.onHand
    && existing.reorderAt === item.reorderAt
    && existing.price === item.price
}

function existingCatalogConflictIssues(existing: CommerceItem, item: CommerceItem): ShopCatalogImportIssue[] {
  const issues: ShopCatalogImportIssue[] = []
  if (existing.onHand !== item.onHand) {
    issues.push({
      code: 'existing_stock_count_mismatch',
      field: 'onHand',
      message: `${item.sku}: Shop currently has ${existing.onHand} on hand; this file says ${item.onHand}. Catalog import does not update existing stock. Reconcile the count in Shop first.`,
    })
  }

  const changedCatalogFields = [
    existing.name !== item.name ? 'item name' : '',
    item.nameMy && existing.nameMy !== item.nameMy ? 'Myanmar item name' : '',
    item.category && existing.category !== item.category ? 'category' : '',
    item.variant && existing.variant !== item.variant ? 'variant' : '',
    item.barcode && existing.barcode !== item.barcode ? 'barcode' : '',
    existing.reorderAt !== item.reorderAt ? 'reorder level' : '',
    existing.price !== item.price ? 'price' : '',
  ].filter(Boolean)
  if (changedCatalogFields.length) {
    issues.push({
      code: 'existing_sku_conflict',
      field: 'sku',
      message: `${item.sku} already exists with different ${changedCatalogFields.join(', ')}. Catalog import does not replace existing items.`,
    })
  }
  return issues
}

function normalizedCatalogCode(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function catalogScanCodeConflictIssues(item: CommerceItem, existingCatalog: CommerceItem[]): ShopCatalogImportIssue[] {
  const itemCode = normalizedCatalogCode(item.sku)
  const barcode = normalizedCatalogCode(item.barcode)
  const issues: ShopCatalogImportIssue[] = []
  for (const existing of existingCatalog) {
    if (existing.sku === item.sku) continue
    if (barcode && barcode === normalizedCatalogCode(existing.sku)) {
      issues.push({
        code: 'catalog_scan_code_conflict',
        field: 'barcode',
        message: `Barcode ${item.barcode} is already used as the item code for ${existing.sku}. Choose a different barcode.`,
      })
    }
    if (barcode && barcode === normalizedCatalogCode(existing.barcode)) {
      issues.push({
        code: 'catalog_scan_code_conflict',
        field: 'barcode',
        message: `Barcode ${item.barcode} is already assigned to ${existing.sku}. Choose a different barcode.`,
      })
    }
    if (itemCode && itemCode === normalizedCatalogCode(existing.barcode)) {
      issues.push({
        code: 'catalog_scan_code_conflict',
        field: 'sku',
        message: `Item code ${item.sku} is already used as a barcode for ${existing.sku}. Choose a different item code.`,
      })
    }
  }
  return issues
}

export function commerceCatalogImportReview(existing: CommerceItem, incoming: CommerceItem) {
  const existingNameMy = existing.nameMy?.trim() || undefined
  const incomingNameMy = incoming.nameMy?.trim() || undefined
  const preserveExistingNameMy = !incomingNameMy && Boolean(existingNameMy)
  const existingVariant = existing.variant?.trim() || undefined
  const incomingVariant = incoming.variant?.trim() ? incoming.variant : undefined
  const preserveExistingVariant = !incomingVariant && Boolean(existingVariant)
  const existingBarcode = existing.barcode?.trim() || undefined
  const incomingBarcode = incoming.barcode?.trim() ? incoming.barcode : undefined
  const preserveExistingBarcode = !incomingBarcode && Boolean(existingBarcode)
  const existingCategory = existing.category?.trim() || undefined
  const incomingCategory = incoming.category?.trim() ? incoming.category : undefined
  const preserveExistingCategory = !incomingCategory && Boolean(existingCategory)
  const current = { ...existing, nameMy: existingNameMy, category: existingCategory, variant: existingVariant, barcode: existingBarcode }
  const comparable = { ...incoming, nameMy: incomingNameMy ?? existingNameMy, category: incomingCategory ?? existingCategory, variant: incomingVariant ?? existingVariant, barcode: incomingBarcode ?? existingBarcode }
  const differences = [
    ...commerceCatalogImportDifferences(current, comparable),
    ...(current.nameMy !== comparable.nameMy ? ['nameMy' as const] : []),
  ]
  const labels: Record<ShopCatalogImportField | 'nameMy' | 'variant' | 'barcode', string> = {
    sku: 'SKU',
    name: 'name',
    nameMy: 'Myanmar item name',
    category: 'category',
    onHand: 'stock',
    reorderAt: 'reorder level',
    price: 'price',
    variant: 'variant',
    barcode: 'barcode',
  }
  const details = differences.map((field) => {
    if (field === 'onHand') return `stock (Shop has ${existing.onHand} on hand; file says ${incoming.onHand})`
    const currentValue = JSON.stringify(current[field]) ?? '—'
    const incomingValue = JSON.stringify(comparable[field]) ?? '—'
    return `${labels[field]} (Shop: ${currentValue}; file: ${incomingValue})`
  })
  return {
    conflict: differences.length > 0,
    message: differences.length
      ? `Already exists with different ${details.join(', ')}. Update the existing product separately.`
      : preserveExistingVariant
        ? 'Already current. The saved variant is preserved because this file does not provide one.'
        : preserveExistingBarcode
          ? 'Already current. The saved barcode is preserved because this file does not provide one.'
          : preserveExistingCategory
            ? 'Already current. The saved category is preserved because this file does not provide one.'
            : preserveExistingNameMy
              ? 'Already current. The saved Myanmar name is preserved because this file does not provide one.'
              : 'Already current. No change needed.',
  }
}

export async function addShopVariantColumnToClientImportPreview(preview: ClientImportPreview, selectedVariantHeader?: string) {
  const variantCandidates = shopVariantCandidates(preview.headers)
  const variantChoiceRequired = selectedVariantHeader === undefined && variantCandidates.length > 1
  const variantHeader = selectedVariantHeader === undefined
    ? suggestedShopVariantHeader(preview.headers)
    : selectedVariantHeader
  if (variantHeader && !preview.headers.includes(variantHeader)) throw new Error('Choose a variant column from this file.')
  const reusedHeader = variantHeader
    ? Object.entries(preview.mapping).find(([field, header]) => field !== 'variant' && header === variantHeader)
    : undefined
  const mappingIssue: ClientImportIssue | null = reusedHeader
    ? { code: 'mapping_reused_header', field: 'variant', message: `${variantHeader} cannot supply more than one target field.` }
    : null
  const choiceIssue: ClientImportIssue | null = variantChoiceRequired
    ? { code: 'variant_choice_required', field: 'variant', message: `Multiple possible variant columns were found: ${variantCandidates.join(', ')}. Choose one or explicitly select “Do not import”.` }
    : null
  const rows = preview.rows.map((row) => {
    const variant = variantHeader ? row.source[variantHeader] ?? '' : ''
    const valueIssue = variantHeader ? shopVariantIssue(variant) : null
    const issues = [
      ...row.issues,
      ...(valueIssue ? [valueIssue as ClientImportIssue] : []),
      ...(mappingIssue ? [mappingIssue] : []),
    ]
    return {
      ...row,
      status: valueIssue || mappingIssue ? 'invalid' as const : row.status,
      values: { ...row.values, variant },
      issues,
    }
  })
  const mapping = {
    ...preview.mapping,
    ...(variantChoiceRequired ? {} : { variant: variantHeader }),
  }
  const fileIssues = [
    ...preview.fileIssues,
    ...(mappingIssue ? [mappingIssue] : []),
    ...(choiceIssue ? [choiceIssue] : []),
  ]
  const totals = {
    ...preview.totals,
    ready: rows.filter((row) => row.status === 'ready').length,
    invalid: rows.filter((row) => row.status === 'invalid').length,
    duplicates: rows.filter((row) => row.status === 'duplicate').length,
    issueRows: rows.filter((row) => row.status === 'invalid' || row.status === 'duplicate').length,
  }
  const previewDigest = await clientImportSha256(JSON.stringify({
    schema: preview.schema,
    product: preview.product,
    object: preview.object,
    workflowTemplateId: preview.workflowTemplateId,
    sourceDigest: preview.sourceDigest,
    mapping,
  }))
  return {
    variantHeader,
    variantChoiceRequired,
    preview: {
      ...preview,
      fields: preview.fields.some((field) => field.id === 'nameMy')
        ? preview.fields
        : [...preview.fields.slice(0, 3), {
          id: 'nameMy',
          label: 'Myanmar item name (optional)',
          required: false,
          kind: 'text' as const,
          aliases: ['name_my', 'item_name_my', 'product_name_my', 'myanmar_name', 'burmese_name', 'name_burmese', 'my_name', 'mm_name', 'မြန်မာအမည်', 'ပစ္စည်းအမည်မြန်မာ'],
          maximum: 180,
        }, ...preview.fields.slice(3)],
      mapping,
      fileIssues,
      rows,
      totals,
      previewDigest,
      readyForStaging: fileIssues.length === 0 && rows.length > 0 && totals.ready === rows.length,
    },
  }
}

function classifyAgainstCatalog(rows: ShopCatalogImportRow[], existingCatalog: CommerceItem[]) {
  const existingBySku = new Map(existingCatalog.map((item) => [item.sku, item]))
  for (const row of rows) {
    if (!row.item || row.status !== 'ready') continue
    const scanCodeConflicts = catalogScanCodeConflictIssues(row.item, existingCatalog)
    if (scanCodeConflicts.length) {
      row.status = 'conflict'
      row.issues.push(...scanCodeConflicts)
      continue
    }
    const existing = existingBySku.get(row.item.sku)
    if (!existing) continue
    if (sameImportedValues(existing, row.item)) {
      row.status = 'already_exists'
      row.issues.push({ code: 'already_exists', field: 'sku', message: `${row.item.sku} already has these exact catalog values.` })
    } else {
      row.status = 'conflict'
      row.issues.push(...existingCatalogConflictIssues(existing, row.item))
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

export function classifyShopCatalogImportRows(
  preview: ClientImportPreview,
  existingCatalog: CommerceItem[],
): ShopCatalogImportRow[] {
  const rows: ShopCatalogImportRow[] = preview.rows.map((row) => ({
    rowNumber: row.rowNumber,
    status: row.status,
    source: row.source,
    item: row.status === 'invalid' ? null : itemFromValues(row.values),
    issues: row.issues.map(shopIssue),
  }))
  classifyAgainstCatalog(rows, existingCatalog)
  return rows
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
  selectedVariantHeader?: string,
): Promise<ShopCatalogImportPreview> {
  const detected = await createClientImportPreview(csvText, 'commerce', undefined, sourceName, 'social-commerce')
  const variantHeader = shopVariantHeader(detected.headers, selectedVariantHeader)
  const shared = selectedMapping
    ? await createClientImportPreview(csvText, 'commerce', selectedMapping as ClientImportMapping, sourceName, 'social-commerce')
    : detected
  const reusedHeader = variantHeader
    ? Object.entries(shared.mapping).find(([, header]) => header === variantHeader)
    : undefined
  const mappingIssue: ShopCatalogImportIssue | null = reusedHeader
    ? { code: 'mapping_reused_header', field: 'variant', message: `${variantHeader} cannot supply more than one target field.` }
    : null
  const rows: ShopCatalogImportRow[] = shared.rows.map((row) => {
    const variant = variantHeader ? row.source[variantHeader] ?? '' : ''
    const variantIssue = shopVariantIssue(variant)
    const status = (variantIssue || mappingIssue) && row.status !== 'invalid' ? 'invalid' : row.status
    return {
      rowNumber: row.rowNumber,
      status,
      source: row.source,
      item: status === 'invalid' ? null : itemFromValues({ ...row.values, ...(variant ? { variant } : {}) }),
      issues: [...row.issues.map(shopIssue), ...(variantIssue ? [variantIssue] : []), ...(mappingIssue ? [mappingIssue] : [])],
    }
  })
  classifyAgainstCatalog(rows, existingCatalog)
  const catalogSignature = shopCatalogImportCatalogSignature(existingCatalog)
  const catalogDigest = await sha256(catalogSignature)
  const previewDigest = await sha256(JSON.stringify({
    schema: SHOP_CATALOG_IMPORT_SCHEMA,
    sharedPreviewDigest: shared.previewDigest,
    catalogDigest,
    variantHeader,
  }))
  return {
    schema: SHOP_CATALOG_IMPORT_SCHEMA,
    sourceName: shared.sourceName,
    sourceDigest: shared.sourceDigest,
    previewDigest,
    catalogDigest,
    catalogSignature,
    headers: shared.headers,
    variantHeader,
    mapping: {
      sku: shared.mapping.sku,
      barcode: shared.mapping.barcode ?? '',
      name: shared.mapping.name,
      category: shared.mapping.category ?? '',
      onHand: shared.mapping.onHand,
      reorderAt: shared.mapping.reorderAt,
      price: shared.mapping.price,
    },
    suggestions: shared.suggestions.map((suggestion) => ({
      ...suggestion,
      field: suggestion.field as ShopCatalogImportField,
    })),
    fileIssues: [...shared.fileIssues.map(shopIssue), ...(mappingIssue ? [mappingIssue] : [])],
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
