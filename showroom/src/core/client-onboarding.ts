export const CLIENT_IMPORT_SCHEMA = 'supermega.client_import_preview.v1' as const
export const CLIENT_STAGING_SCHEMA = 'supermega.client_import_staging.v1' as const
export const CLIENT_DEMO_BLUEPRINT_SCHEMA = 'supermega.client_demo_blueprint.v1' as const
export const CLIENT_IMPORT_MAX_BYTES = 512 * 1024
export const CLIENT_IMPORT_MAX_ROWS = 500

export type ClientSolutionId = 'commerce' | 'production' | 'website' | 'ecommerce'
export type ClientImportMapping = Record<string, string>
export type ClientImportRowStatus = 'ready' | 'invalid' | 'duplicate'
export type ClientImportSuggestionBasis = 'exact' | 'alias' | 'ambiguous' | 'unmapped'
export type ClientDemoPresetId = 'social-seller' | 'retail-network' | 'food-service' | 'manufacturing' | 'service-business'

export type ClientDemoSelection = {
  product: ClientSolutionId
  templateId: string
}

export type ClientDemoPreset = {
  id: ClientDemoPresetId
  name: string
  description: string
  selections: readonly ClientDemoSelection[]
}

export type ClientDemoBlueprint = {
  schema: typeof CLIENT_DEMO_BLUEPRINT_SCHEMA
  client: {
    workspace: string
    owner: string
    presetId: ClientDemoPresetId
  }
  products: Array<{
    product: ClientSolutionId
    label: string
    templateId: string
    demoPath: string
    setupPath: string
    importObject: string
    importLabel: string
    sampleCsv: string
    checklist: ClientImportChecklistRow[]
    activationBoundary: string
  }>
  integrations: Array<{
    from: ClientSolutionId
    to: ClientSolutionId
    outcome: string
  }>
  controls: {
    localDemoOnly: true
    humanReviewRequired: true
    externalWritesPerformed: false
  }
}

type ClientImportFieldKind = 'boolean' | 'date' | 'integer' | 'slug' | 'sku' | 'text' | 'url'

export type ClientImportField = {
  id: string
  label: string
  required: boolean
  kind: ClientImportFieldKind
  aliases: readonly string[]
  maximum?: number
  minimum?: number
}

export type ClientImportObject = {
  id: string
  label: string
  description: string
  keyField: string
  maximumRows: number
  fields: readonly ClientImportField[]
  workflowTemplates: Readonly<Record<string, string>>
  activationBoundary: string
}

export type ClientImportChecklistRow = {
  field: string
  required: boolean
  kind: ClientImportFieldKind
  acceptedHeaders: readonly string[]
  example: string
  note: string
}

export type ClientImportIssue = {
  code: string
  field: string | 'file' | 'row'
  message: string
}

export type ClientImportSuggestion = {
  field: string
  header: string
  basis: ClientImportSuggestionBasis
}

export type ClientImportRow = {
  rowNumber: number
  status: ClientImportRowStatus
  key: string
  source: Record<string, string>
  values: Record<string, string>
  issues: ClientImportIssue[]
}

export type ClientImportPreview = {
  schema: typeof CLIENT_IMPORT_SCHEMA
  product: ClientSolutionId
  object: string
  workflowTemplateId: string
  sourceName: string
  sourceDigest: string
  previewDigest: string
  headers: string[]
  fields: ClientImportField[]
  mapping: ClientImportMapping
  suggestions: ClientImportSuggestion[]
  fileIssues: ClientImportIssue[]
  rows: ClientImportRow[]
  readyForStaging: boolean
  totals: {
    rows: number
    ready: number
    invalid: number
    duplicates: number
    issueRows: number
  }
}

type ParsedCsvRow = {
  rowNumber: number
  cells: string[]
}

const formulaPrefix = /^[=+\-@]/

const objects: Record<ClientSolutionId, ClientImportObject> = {
  commerce: {
    id: 'shop_catalog',
    label: 'Shop catalog',
    description: 'Opening items, stock thresholds, and MMK selling prices.',
    keyField: 'sku',
    maximumRows: CLIENT_IMPORT_MAX_ROWS,
    activationBoundary: 'A named Shop operator must separately confirm an accountable catalog import.',
    workflowTemplates: {
      'social-commerce': 'sku,item_name,opening_stock,reorder_at,price_mmk\r\nCOFFEE-250,Myanmar coffee 250g,24,8,7000\r\nTEA-20,Green tea 20 pack,36,12,4500\r\n',
      'retail-wholesale': 'sku,item_name,opening_stock,reorder_at,price_mmk\r\nRICE-25KG,Premium rice 25kg,18,6,72000\r\nOIL-1L,Cooking oil 1L,48,16,9500\r\n',
      'restaurant-ordering': 'sku,item_name,opening_stock,reorder_at,price_mmk\r\nMENU-MOHINGA,Mohinga,80,20,3500\r\nMENU-TEA,Myanmar milk tea,120,30,1800\r\n',
    },
    fields: [
      { id: 'sku', label: 'SKU', required: true, kind: 'sku', aliases: ['sku', 'item_sku', 'product_sku', 'stock_code', 'item_code', 'product_code', 'ပစ္စည်းကုဒ်'], maximum: 80 },
      { id: 'name', label: 'Item name', required: true, kind: 'text', aliases: ['item_name', 'name', 'product_name', 'title', 'description', 'ပစ္စည်းအမည်'], maximum: 180 },
      { id: 'onHand', label: 'Opening stock', required: true, kind: 'integer', aliases: ['opening_stock', 'on_hand', 'available_stock', 'stock', 'quantity', 'qty', 'opening_quantity', 'လက်ကျန်'], minimum: 0 },
      { id: 'reorderAt', label: 'Reorder at', required: true, kind: 'integer', aliases: ['reorder_at', 'reorder_level', 'reorder_point', 'low_stock_at', 'minimum_stock', 'min_stock'], minimum: 0 },
      { id: 'price', label: 'Price (MMK)', required: true, kind: 'integer', aliases: ['price_mmk', 'price', 'unit_price', 'selling_price', 'mmk_price', 'စျေးနှုန်း'], minimum: 1 },
    ],
  },
  production: {
    id: 'plant_jobs',
    label: 'Plant jobs',
    description: 'Initial production jobs, targets, due dates, and line ownership.',
    keyField: 'jobCode',
    maximumRows: 100,
    activationBoundary: 'A Plant owner must verify capacity, material, and safety before jobs enter the live schedule.',
    workflowTemplates: {
      'production-control': 'job_code,product_name,target_quantity,due_date,production_line\r\nJOB-001,20 inch tyre,500,2026-08-15,Line A\r\nJOB-002,16 inch tyre,300,2026-08-16,Line B\r\n',
      'maintenance-downtime': 'job_code,product_name,target_quantity,due_date,production_line\r\nMAINT-001,Compressor preventive service,1,2026-08-15,Utilities\r\nMAINT-002,Mixer bearing inspection,1,2026-08-16,Compounding\r\n',
      'quality-traceability': 'job_code,product_name,target_quantity,due_date,production_line\r\nQC-001,Incoming rubber inspection,1,2026-08-15,Quality Lab\r\nQC-002,Finished tyre release check,1,2026-08-16,Final Inspection\r\n',
    },
    fields: [
      { id: 'jobCode', label: 'Job code', required: true, kind: 'sku', aliases: ['job_code', 'job_id', 'work_order', 'work_order_id', 'order_number', 'အလုပ်ကုဒ်'], maximum: 80 },
      { id: 'productName', label: 'Product', required: true, kind: 'text', aliases: ['product_name', 'product', 'item_name', 'output', 'finished_good', 'ကုန်ပစ္စည်း'], maximum: 180 },
      { id: 'targetQuantity', label: 'Target quantity', required: true, kind: 'integer', aliases: ['target_quantity', 'target', 'planned_quantity', 'plan_qty', 'quantity', 'အရေအတွက်'], minimum: 1 },
      { id: 'dueDate', label: 'Due date', required: true, kind: 'date', aliases: ['due_date', 'required_date', 'finish_date', 'planned_end', 'ရက်စွဲ'] },
      { id: 'line', label: 'Production line', required: true, kind: 'text', aliases: ['production_line', 'line', 'work_center', 'machine_group', 'လိုင်း'], maximum: 120 },
    ],
  },
  website: {
    id: 'website_pages',
    label: 'Website pages',
    description: 'Finite page structure and approved source copy for a client website.',
    keyField: 'slug',
    maximumRows: 4,
    activationBoundary: 'Imported copy remains a draft until a human reviews the responsive preview and approves the exact evidence set.',
    workflowTemplates: {
      'business-presence': 'page_slug,page_title,headline,body,contact_url\r\nhome,Home,Clear help for your customers,Explain the main service and strongest proof.,https://example.com/contact\r\nabout,About,Why customers trust us,Add the approved company story and team.,https://example.com/contact\r\n',
      'lead-generation': 'page_slug,page_title,headline,body,contact_url\r\nhome,Home,Solve one costly problem,State the offer and the next clear action.,https://example.com/contact\r\nproof,Results,See verified customer outcomes,Add approved results and supporting evidence.,https://example.com/contact\r\n',
      'catalog-showcase': 'page_slug,page_title,headline,body,contact_url\r\nhome,Home,Explore the approved collection,Introduce the catalog and one enquiry path.,https://example.com/contact\r\nproducts,Products,Find the right product,Group approved products with useful buying details.,https://example.com/contact\r\n',
    },
    fields: [
      { id: 'slug', label: 'Page slug', required: true, kind: 'slug', aliases: ['page_slug', 'slug', 'path', 'url_slug', 'စာမျက်နှာ'], maximum: 80 },
      { id: 'title', label: 'Page title', required: true, kind: 'text', aliases: ['page_title', 'title', 'seo_title', 'စာမျက်နှာခေါင်းစဉ်'], maximum: 40 },
      { id: 'headline', label: 'Headline', required: true, kind: 'text', aliases: ['headline', 'heading', 'hero_title', 'ခေါင်းစဉ်'], maximum: 140 },
      { id: 'body', label: 'Body copy', required: true, kind: 'text', aliases: ['body', 'body_copy', 'content', 'description', 'စာသား'], maximum: 360 },
      { id: 'contactUrl', label: 'Contact URL', required: false, kind: 'url', aliases: ['contact_url', 'cta_url', 'contact_link', 'call_to_action'], maximum: 160 },
    ],
  },
  ecommerce: {
    id: 'storefront_merchandising',
    label: 'Ecommerce merchandising',
    description: 'Shop SKU references, collections, and storefront display copy without duplicating stock or price.',
    keyField: 'sku',
    maximumRows: 8,
    activationBoundary: 'Every SKU must match the current Shop catalog before a storefront draft can be approved.',
    workflowTemplates: {
      'social-storefront': 'sku,featured,collection,display_name,merchandising_note\r\nCOFFEE-250,true,Best sellers,Myanmar coffee 250g,Lead with the locally sourced proof.\r\nTEA-20,false,Tea,Green tea 20 pack,Keep the Messenger order path visible.\r\n',
      'pickup-preorder': 'sku,featured,collection,display_name,merchandising_note\r\nRICE-25KG,true,Pickup this week,Premium rice 25kg,Show the pickup promise before request.\r\nOIL-1L,false,Pantry,Cooking oil 1L,Confirm availability before collection.\r\n',
      'wholesale-request': 'sku,featured,collection,display_name,merchandising_note\r\nCASE-COFFEE,true,Wholesale,Myanmar coffee case,Ask for quantity and delivery area.\r\nCASE-TEA,false,Wholesale,Green tea case,Keep trade pricing under review.\r\n',
    },
    fields: [
      { id: 'sku', label: 'Shop SKU', required: true, kind: 'sku', aliases: ['sku', 'shop_sku', 'item_sku', 'product_code', 'ပစ္စည်းကုဒ်'], maximum: 80 },
      { id: 'featured', label: 'Featured', required: true, kind: 'boolean', aliases: ['featured', 'is_featured', 'highlight', 'promoted'] },
      { id: 'collection', label: 'Collection', required: true, kind: 'text', aliases: ['collection', 'category', 'group', 'catalog_section'], maximum: 120 },
      { id: 'displayName', label: 'Display name', required: false, kind: 'text', aliases: ['display_name', 'storefront_name', 'name', 'title'], maximum: 180 },
      { id: 'note', label: 'Merchandising note', required: false, kind: 'text', aliases: ['merchandising_note', 'note', 'display_note', 'instructions'], maximum: 300 },
    ],
  },
}

const clientDemoProductOrder: readonly ClientSolutionId[] = ['commerce', 'production', 'website', 'ecommerce']

const clientDemoProductDetails: Record<ClientSolutionId, { label: string; demoPath: string; setupPath: string }> = {
  commerce: { label: 'Shop', demoPath: '/shop/?tab=counter', setupPath: '/settings/?product=shop' },
  production: { label: 'Plant', demoPath: '/plant/?tab=production', setupPath: '/settings/?product=plant' },
  website: { label: 'Website', demoPath: '/website/', setupPath: '/settings/?product=website' },
  ecommerce: { label: 'Ecommerce', demoPath: '/ecommerce/', setupPath: '/settings/?product=ecommerce' },
}

export const clientDemoPresets: readonly ClientDemoPreset[] = [
  {
    id: 'social-seller',
    name: 'Social seller',
    description: 'Chat orders, a clear website, and a Shop-backed storefront.',
    selections: [
      { product: 'commerce', templateId: 'social-commerce' },
      { product: 'website', templateId: 'lead-generation' },
      { product: 'ecommerce', templateId: 'social-storefront' },
    ],
  },
  {
    id: 'retail-network',
    name: 'Retail / wholesale',
    description: 'Stock, purchasing, catalog presentation, pickup, and wholesale requests.',
    selections: [
      { product: 'commerce', templateId: 'retail-wholesale' },
      { product: 'website', templateId: 'catalog-showcase' },
      { product: 'ecommerce', templateId: 'pickup-preorder' },
    ],
  },
  {
    id: 'food-service',
    name: 'Cafe / restaurant',
    description: 'Counter and channel orders with a menu site and preorder collection.',
    selections: [
      { product: 'commerce', templateId: 'restaurant-ordering' },
      { product: 'website', templateId: 'business-presence' },
      { product: 'ecommerce', templateId: 'pickup-preorder' },
    ],
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing',
    description: 'Demand, stock, production, catalog, and wholesale request handoffs.',
    selections: [
      { product: 'commerce', templateId: 'retail-wholesale' },
      { product: 'production', templateId: 'production-control' },
      { product: 'website', templateId: 'catalog-showcase' },
      { product: 'ecommerce', templateId: 'wholesale-request' },
    ],
  },
  {
    id: 'service-business',
    name: 'Service business',
    description: 'Service sales, lead generation, and accountable follow-up.',
    selections: [
      { product: 'commerce', templateId: 'social-commerce' },
      { product: 'website', templateId: 'lead-generation' },
    ],
  },
]

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) as number
    return codePoint <= 31 || codePoint === 127
  })
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

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

async function sha256(value: string) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure import fingerprinting is unavailable in this browser.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function parseCsv(input: string) {
  if (byteLength(input) > CLIENT_IMPORT_MAX_BYTES) throw new Error(`Choose a CSV smaller than ${CLIENT_IMPORT_MAX_BYTES / 1024} KB.`)
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
    if (quotedFieldClosed && character !== ',' && character !== '\n' && character !== '\r') throw new Error(`CSV row ${rowStart} has text after a closing quote.`)
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
  if (field.length || cells.length) rows.push({ rowNumber: rowStart, cells: [...cells, field] })
  while (rows.length > 1 && rows.at(-1)?.cells.every((cell) => !cell)) rows.pop()
  if (!rows.length) throw new Error('The CSV has no header row.')
  if (rows.length - 1 > CLIENT_IMPORT_MAX_ROWS) throw new Error(`Preview at most ${CLIENT_IMPORT_MAX_ROWS} rows at a time.`)
  return { source, rows }
}

function inspectHeaders(headers: string[]) {
  if (headers.length > 50) throw new Error('The CSV has more than 50 columns.')
  if (headers.some((header) => !header.trim() || hasControlCharacter(header))) throw new Error('Every CSV column needs a visible header without control characters.')
  const normalized = headers.map(normalizeHeader)
  if (new Set(normalized).size !== normalized.length) throw new Error('The CSV has duplicate or equivalent column headers.')
  return normalized
}

function suggestMapping(object: ClientImportObject, headers: string[], normalizedHeaders: string[]) {
  const mapping: ClientImportMapping = {}
  const suggestions: ClientImportSuggestion[] = []
  for (const field of object.fields) {
    const aliases = [...new Set([...field.aliases, field.id].map(normalizeHeader))]
    const ranked = normalizedHeaders.flatMap((header, index) => {
      const rank = aliases.indexOf(header)
      return rank < 0 ? [] : [{ header: headers[index], rank }]
    }).sort((left, right) => left.rank - right.rank || compareCodePoints(left.header, right.header))
    const best = ranked[0]
    const ambiguous = Boolean(best && ranked.filter((candidate) => candidate.rank === best.rank).length > 1)
    mapping[field.id] = best && !ambiguous ? best.header : ''
    suggestions.push({
      field: field.id,
      header: mapping[field.id],
      basis: ambiguous ? 'ambiguous' : !best ? 'unmapped' : best.rank === 0 ? 'exact' : 'alias',
    })
  }
  return { mapping, suggestions }
}

function mappingIssues(object: ClientImportObject, headers: string[], mapping: ClientImportMapping) {
  const issues: ClientImportIssue[] = []
  const selected: string[] = []
  for (const field of object.fields) {
    const header = mapping[field.id] ?? ''
    if (!header && field.required) issues.push({ code: 'mapping_required', field: field.id, message: `Map ${field.label} to one CSV column.` })
    else if (header && !headers.includes(header)) issues.push({ code: 'mapping_unknown_header', field: field.id, message: `${field.label} is mapped to a missing column.` })
    else if (header) selected.push(header)
  }
  const duplicates = selected.filter((header, index) => selected.indexOf(header) !== index)
  for (const header of [...new Set(duplicates)]) issues.push({ code: 'mapping_reused_header', field: 'file', message: `${header} cannot supply more than one target field.` })
  return issues
}

function fieldIssue(field: ClientImportField, value: string): ClientImportIssue | null {
  if (!value) return field.required ? { code: 'value_required', field: field.id, message: `${field.label} is required.` } : null
  if (value !== value.trim()) return { code: 'value_not_canonical', field: field.id, message: `${field.label} has leading or trailing spaces.` }
  if (value !== value.normalize('NFC')) return { code: 'unicode_normalization', field: field.id, message: `${field.label} must use normalized Unicode text.` }
  if (hasControlCharacter(value)) return { code: 'control_character', field: field.id, message: `${field.label} contains a control character.` }
  if (formulaPrefix.test(value)) return { code: 'spreadsheet_formula', field: field.id, message: `${field.label} begins like a spreadsheet formula and was rejected.` }
  if (field.maximum && value.length > field.maximum) return { code: 'value_too_long', field: field.id, message: `${field.label} must be ${field.maximum} characters or fewer.` }

  if (field.kind === 'integer') {
    if (!/^[0-9]+$/.test(value)) return { code: 'whole_number_required', field: field.id, message: `${field.label} must use whole ASCII digits without commas or signs.` }
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed < (field.minimum ?? 0)) return { code: 'number_out_of_range', field: field.id, message: `${field.label} is outside the supported range.` }
  } else if (field.kind === 'sku') {
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(value)) return { code: 'identifier_not_canonical', field: field.id, message: `${field.label} must use uppercase letters, digits, dots, slashes, underscores, or hyphens.` }
  } else if (field.kind === 'slug') {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return { code: 'slug_not_canonical', field: field.id, message: `${field.label} must be a lowercase URL slug such as about-us.` }
  } else if (field.kind === 'date') {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return { code: 'date_not_canonical', field: field.id, message: `${field.label} must use a real YYYY-MM-DD date.` }
  } else if (field.kind === 'boolean') {
    if (value !== 'true' && value !== 'false') return { code: 'boolean_not_canonical', field: field.id, message: `${field.label} must be true or false.` }
  } else if (field.kind === 'url') {
    try {
      const parsed = new URL(value)
      if (!['https:', 'mailto:', 'tel:'].includes(parsed.protocol)) throw new Error('protocol')
    } catch {
      return { code: 'url_not_allowed', field: field.id, message: `${field.label} must be an HTTPS, mailto, or tel URL.` }
    }
  }
  return null
}

function rowFromMapping(parsed: ParsedCsvRow, object: ClientImportObject, headers: string[], mapping: ClientImportMapping, fileIssues: ClientImportIssue[]) {
  const source = Object.fromEntries(headers.map((header, index) => [header, parsed.cells[index] ?? '']))
  const issues: ClientImportIssue[] = []
  if (parsed.cells.length !== headers.length) issues.push({ code: 'column_count', field: 'row', message: `Expected ${headers.length} columns but found ${parsed.cells.length}.` })
  if (parsed.cells.every((cell) => !cell)) issues.push({ code: 'empty_row', field: 'row', message: 'Remove the empty CSV row.' })
  if (fileIssues.length) issues.push({ code: 'mapping_incomplete', field: 'row', message: 'Complete the column mapping before this row can be checked.' })
  const values = Object.fromEntries(object.fields.map((field) => [field.id, mapping[field.id] ? source[mapping[field.id]] ?? '' : '']))
  if (!issues.length) {
    for (const field of object.fields) {
      const issue = fieldIssue(field, values[field.id] ?? '')
      if (issue) issues.push(issue)
    }
  }
  return {
    rowNumber: parsed.rowNumber,
    status: issues.length ? 'invalid' as const : 'ready' as const,
    key: values[object.keyField] ?? '',
    source,
    values,
    issues,
  }
}

function classifyDuplicates(rows: ClientImportRow[]) {
  const byKey = new Map<string, ClientImportRow[]>()
  for (const row of rows) {
    if (row.status !== 'ready' || !row.key) continue
    const matches = byKey.get(row.key) ?? []
    matches.push(row)
    byKey.set(row.key, matches)
  }
  for (const [key, matches] of byKey) {
    if (matches.length < 2) continue
    for (const row of matches) {
      row.status = 'duplicate'
      row.issues.push({ code: 'duplicate_object_key', field: 'row', message: `${key} appears ${matches.length} times in this file.` })
    }
  }
}

function totalsFor(rows: ClientImportRow[]) {
  return {
    rows: rows.length,
    ready: rows.filter((row) => row.status === 'ready').length,
    invalid: rows.filter((row) => row.status === 'invalid').length,
    duplicates: rows.filter((row) => row.status === 'duplicate').length,
    issueRows: rows.filter((row) => row.status !== 'ready').length,
  }
}

function safeSourceName(sourceName: string) {
  const value = sourceName.trim() || 'client-data.csv'
  if (value.length > 180 || hasControlCharacter(value)) throw new Error('The source filename is invalid.')
  return value
}

export function clientImportObject(product: ClientSolutionId) {
  return objects[product]
}

export function clientImportWorkflowTemplateIds(product: ClientSolutionId) {
  return Object.keys(objects[product].workflowTemplates)
}

function resolveWorkflowTemplateId(product: ClientSolutionId, workflowTemplateId?: string) {
  const templates = objects[product].workflowTemplates
  const requested = workflowTemplateId?.trim() || Object.keys(templates)[0]
  if (!requested || !Object.hasOwn(templates, requested)) {
    throw new Error(`Choose a supported ${objects[product].label} workflow template before importing data.`)
  }
  return requested
}

export function clientImportTemplate(product: ClientSolutionId, workflowTemplateId?: string) {
  return objects[product].workflowTemplates[resolveWorkflowTemplateId(product, workflowTemplateId)]
}

function exampleRows(product: ClientSolutionId, workflowTemplateId?: string) {
  const template = clientImportTemplate(product, workflowTemplateId)
  const parsed = parseCsv(template)
  const headers = parsed.rows[0]?.cells ?? []
  const sample = parsed.rows[1]?.cells ?? []
  return { headers, sample }
}

function checklistNote(field: ClientImportField) {
  if (field.kind === 'sku') return 'Use stable uppercase codes. Do not reuse one code for two records.'
  if (field.kind === 'integer') return `Whole number${field.minimum !== undefined ? `, minimum ${field.minimum}` : ''}. No decimals or formulas.`
  if (field.kind === 'date') return 'Use YYYY-MM-DD so schedules and approvals stay deterministic.'
  if (field.kind === 'boolean') return 'Use true/false, yes/no, 1/0, or on/off.'
  if (field.kind === 'slug') return 'Use lowercase URL-safe slugs, for example home or products.'
  if (field.kind === 'url') return 'Use https:// links, /relative paths, or leave blank when optional.'
  return `Text${field.maximum ? ` up to ${field.maximum} characters` : ''}. No spreadsheet formulas.`
}

export function clientImportChecklist(product: ClientSolutionId, workflowTemplateId?: string) {
  const object = objects[product]
  const { headers, sample } = exampleRows(product, workflowTemplateId)
  return object.fields.map((field): ClientImportChecklistRow => {
    const normalizedAliases = new Set([...field.aliases, field.id].map(normalizeHeader))
    const templateHeader = headers.find((header) => normalizedAliases.has(normalizeHeader(header)))
    const sampleIndex = templateHeader ? headers.indexOf(templateHeader) : -1
    return {
      field: field.label,
      required: field.required,
      kind: field.kind,
      acceptedHeaders: [templateHeader || field.id, ...field.aliases].filter((value, index, source) => source.indexOf(value) === index).slice(0, 4),
      example: sampleIndex >= 0 ? sample[sampleIndex] ?? '' : '',
      note: checklistNote(field),
    }
  })
}

export async function createClientImportPreview(
  csvText: string,
  product: ClientSolutionId,
  selectedMapping?: ClientImportMapping,
  sourceName = 'client-data.csv',
  workflowTemplateId?: string,
): Promise<ClientImportPreview> {
  const object = objects[product]
  const resolvedWorkflowTemplateId = resolveWorkflowTemplateId(product, workflowTemplateId)
  const parsed = parseCsv(csvText)
  const headerRow = parsed.rows[0]
  if (!headerRow) throw new Error('The CSV has no header row.')
  const headers = headerRow.cells
  const normalizedHeaders = inspectHeaders(headers)
  const suggested = suggestMapping(object, headers, normalizedHeaders)
  const mapping = selectedMapping ? { ...selectedMapping } : suggested.mapping
  const fileIssues = mappingIssues(object, headers, mapping)
  const rows = parsed.rows.slice(1).map((row) => rowFromMapping(row, object, headers, mapping, fileIssues))
  if (!rows.length) fileIssues.push({ code: 'data_rows_required', field: 'file', message: 'Add at least one data row below the header.' })
  if (rows.length > object.maximumRows) fileIssues.push({ code: 'object_row_limit', field: 'file', message: `${object.label} accepts at most ${object.maximumRows} rows in one accountable import.` })
  classifyDuplicates(rows)
  const totals = totalsFor(rows)
  const normalizedMapping = Object.fromEntries(object.fields.map((field) => [field.id, mapping[field.id] ?? '']))
  const sourceDigest = await sha256(parsed.source)
  const previewDigest = await sha256(JSON.stringify({ schema: CLIENT_IMPORT_SCHEMA, product, object: object.id, workflowTemplateId: resolvedWorkflowTemplateId, sourceDigest, mapping: normalizedMapping }))
  return {
    schema: CLIENT_IMPORT_SCHEMA,
    product,
    object: object.id,
    workflowTemplateId: resolvedWorkflowTemplateId,
    sourceName: safeSourceName(sourceName),
    sourceDigest,
    previewDigest,
    headers,
    fields: object.fields.map((field) => ({ ...field, aliases: [...field.aliases] })),
    mapping: normalizedMapping,
    suggestions: suggested.suggestions,
    fileIssues,
    rows,
    readyForStaging: fileIssues.length === 0 && totals.rows > 0 && totals.ready === totals.rows,
    totals,
  }
}

function boundedContext(value: string, label: string, maximum = 120) {
  const normalized = value.trim()
  if (!normalized || hasControlCharacter(normalized)) throw new Error(`${label} is required before staging.`)
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`)
  return normalized
}

export function clientDemoPreset(id: ClientDemoPresetId) {
  const preset = clientDemoPresets.find((candidate) => candidate.id === id)
  if (!preset) throw new Error('Choose a supported client business type.')
  return preset
}

export function buildClientDemoBlueprint(input: {
  workspace: string
  owner: string
  presetId: ClientDemoPresetId
  selections: readonly ClientDemoSelection[]
}): ClientDemoBlueprint {
  const workspace = boundedContext(input.workspace, 'Client name', 60)
  const owner = boundedContext(input.owner, 'Responsible owner', 80)
  const preset = clientDemoPreset(input.presetId)
  if (input.selections.length < 1 || input.selections.length > clientDemoProductOrder.length) {
    throw new Error('Choose between one and four products for this client demo.')
  }
  const byProduct = new Map<ClientSolutionId, string>()
  for (const selection of input.selections) {
    if (!clientDemoProductOrder.includes(selection.product)) throw new Error('Choose a supported SuperMega product.')
    if (byProduct.has(selection.product)) throw new Error(`Choose ${clientDemoProductDetails[selection.product].label} only once.`)
    byProduct.set(selection.product, resolveWorkflowTemplateId(selection.product, selection.templateId))
  }
  const products = clientDemoProductOrder.flatMap((product) => {
    const templateId = byProduct.get(product)
    if (!templateId) return []
    const object = clientImportObject(product)
    const details = clientDemoProductDetails[product]
    return [{
      product,
      label: details.label,
      templateId,
      demoPath: details.demoPath,
      setupPath: details.setupPath,
      importObject: object.id,
      importLabel: object.label,
      sampleCsv: clientImportTemplate(product, templateId),
      checklist: clientImportChecklist(product, templateId),
      activationBoundary: object.activationBoundary,
    }]
  })
  const selected = new Set(products.map((product) => product.product))
  const integrations: ClientDemoBlueprint['integrations'] = []
  if (selected.has('website') && selected.has('ecommerce')) integrations.push({ from: 'website', to: 'ecommerce', outcome: 'Approved site content and catalog presentation stay aligned.' })
  if (selected.has('ecommerce') && selected.has('commerce')) integrations.push({ from: 'ecommerce', to: 'commerce', outcome: 'Storefront requests enter Shop review before any order or stock change.' })
  if (selected.has('production') && selected.has('commerce')) integrations.push({ from: 'commerce', to: 'production', outcome: 'Demand and material evidence connect Shop stock with Plant execution.' })
  return {
    schema: CLIENT_DEMO_BLUEPRINT_SCHEMA,
    client: { workspace, owner, presetId: preset.id },
    products,
    integrations,
    controls: {
      localDemoOnly: true,
      humanReviewRequired: true,
      externalWritesPerformed: false,
    },
  }
}

export function buildClientImportStagingPackage(preview: ClientImportPreview, context: {
  workflowTemplateId: string
  workspace: string
  owner: string
}) {
  if (preview.schema !== CLIENT_IMPORT_SCHEMA || !preview.readyForStaging || preview.rows.some((row) => row.status !== 'ready')) {
    throw new Error('Resolve every mapping and row issue before creating a staging package.')
  }
  const workflowTemplateId = boundedContext(context.workflowTemplateId, 'Workflow template')
  if (workflowTemplateId !== preview.workflowTemplateId) {
    throw new Error('The workflow template changed after this data preview. Preview the CSV again before staging.')
  }
  const workspace = boundedContext(context.workspace, 'Workspace name', preview.product === 'website' ? 60 : 120)
  const owner = boundedContext(context.owner, 'Responsible owner')
  return {
    contract: CLIENT_STAGING_SCHEMA,
    product: preview.product,
    object: preview.object,
    workflowTemplateId,
    workspace,
    owner,
    source: {
      name: preview.sourceName,
      digest: preview.sourceDigest,
      previewDigest: preview.previewDigest,
    },
    mapping: preview.mapping,
    rows: preview.rows.map((row) => ({ sourceRow: row.rowNumber, key: row.key, values: row.values })),
    controls: {
      rowCount: preview.totals.rows,
      humanReviewRequired: true,
      externalWritesPerformed: false,
      activationStatus: 'staged_not_applied',
    },
  }
}
