import { shopIndustryPack, type ShopIndustryPackId } from './shop-service-scheduling.ts'
import { plantIndustryPack, type PlantIndustryPackId } from './plant-industry-packs.ts'
import {
  isShopServiceSku,
  shopBusinessTemplate,
  shopBusinessTemplateCatalogCsv,
  type ShopBusinessTemplate,
  type ShopBusinessTemplateId,
} from '../products/shop/business-templates.ts'
import {
  plantBusinessTemplateForShopTemplateId,
  type PlantBusinessTemplate,
} from '../products/plant/business-templates.ts'
import { websiteTradeBrief } from '../products/website/website-trade-brief.ts'

export const CLIENT_IMPORT_SCHEMA = 'supermega.client_import_preview.v1' as const
export const CLIENT_STAGING_SCHEMA = 'supermega.client_import_staging.v1' as const
export const CLIENT_DEMO_BLUEPRINT_SCHEMA = 'supermega.client_demo_blueprint.v3' as const
export const CLIENT_DEMO_KIT_SCHEMA = 'supermega.client_demo_kit.v3' as const
export const CLIENT_DEMO_WORKSPACE_SCHEMA = 'supermega.client_demo_workspace.v4' as const
export const CLIENT_DEMO_RUNBOOK_SCHEMA = 'supermega.client_demo_runbook.v1' as const
export const CLIENT_DEMO_PREPARATION_SCHEMA = 'supermega.client_demo_preparation.v3' as const
export const CLIENT_OPERATING_FOUNDATION_SCHEMA = 'supermega.client_operating_foundation.v1' as const
export const CLIENT_OPERATIONAL_TOPOLOGY_SCHEMA = 'supermega.client_operational_topology.v1' as const
export const CLIENT_CSV_STARTER_PACK_SCHEMA = 'supermega.client_csv_starter_pack.v1' as const
const LEGACY_CLIENT_DEMO_BLUEPRINT_SCHEMA = 'supermega.client_demo_blueprint.v1' as const
const LEGACY_V2_CLIENT_DEMO_BLUEPRINT_SCHEMA = 'supermega.client_demo_blueprint.v2' as const
const LEGACY_CLIENT_DEMO_KIT_SCHEMA = 'supermega.client_demo_kit.v1' as const
const LEGACY_V2_CLIENT_DEMO_KIT_SCHEMA = 'supermega.client_demo_kit.v2' as const
const LEGACY_CLIENT_DEMO_WORKSPACE_SCHEMA = 'supermega.client_demo_workspace.v1' as const
const LEGACY_V2_CLIENT_DEMO_WORKSPACE_SCHEMA = 'supermega.client_demo_workspace.v2' as const
const LEGACY_V3_CLIENT_DEMO_WORKSPACE_SCHEMA = 'supermega.client_demo_workspace.v3' as const
export const CLIENT_DEMO_WORKSPACE_STORAGE_KEY = 'supermega.client-demo-workspace.v1'
export const CLIENT_DEMO_KIT_MAX_BYTES = 128 * 1024
export const CLIENT_DEMO_PREPARATION_MAX_BYTES = 5 * 1024 * 1024
export const CLIENT_IMPORT_MAX_BYTES = 512 * 1024
export const CLIENT_IMPORT_MAX_ROWS = 500

export type ClientSolutionId = 'commerce' | 'production' | 'website' | 'ecommerce'
export type ClientImportMapping = Record<string, string>
export type ClientImportRowStatus = 'ready' | 'invalid' | 'duplicate'
export type ClientImportSuggestionBasis = 'exact' | 'alias' | 'ambiguous' | 'unmapped'
export type ClientDemoPresetId = 'social-seller' | 'retail-network' | 'food-service' | 'manufacturing' | 'bakery' | 'fashion' | 'service-business'

export type ClientDemoSelection = {
  product: ClientSolutionId
  templateId: string
}

export type ClientImportTemplateContext = {
  shopIndustryPackId?: ShopIndustryPackId
  plantIndustryPackId?: PlantIndustryPackId
  planningDate?: string
}

export type ClientDemoPreset = {
  id: ClientDemoPresetId
  name: string
  description: string
  shopIndustryPackId: ShopIndustryPackId
  plantIndustryPackId: PlantIndustryPackId
  shopBusinessTemplateId?: ShopBusinessTemplateId
  selections: readonly ClientDemoSelection[]
}

export type ClientOperatingUnitKind = 'digital-commerce' | 'retail' | 'food-service' | 'plant' | 'service'

export type ClientOperatingFoundation = {
  schema: typeof CLIENT_OPERATING_FOUNDATION_SCHEMA
  organization: {
    displayName: string
    verification: 'client_review_required'
  }
  operatingUnit: {
    code: 'MAIN'
    name: 'Main operating unit'
    kind: ClientOperatingUnitKind
  }
  localization: {
    countryCode: 'MM'
    currency: 'MMK'
    locale: 'my-MM'
    timeZone: 'Asia/Yangon'
  }
  controls: {
    sharedAcrossProducts: true
    clientReviewRequired: true
    externalRegistryChecked: false
    managedIdentityRequiredBeforeActivation: true
  }
}

export type ClientChannelKind = 'assisted-sales' | 'production-execution' | 'lead-capture' | 'digital-sales'

export type ClientOperationalTopology = {
  schema: typeof CLIENT_OPERATIONAL_TOPOLOGY_SCHEMA
  locations: Array<{
    id: 'LOC-MAIN'
    code: 'MAIN'
    name: 'Main operating unit'
    kind: ClientOperatingUnitKind
    timeZone: 'Asia/Yangon'
    active: true
  }>
  channels: Array<{
    id: string
    label: string
    kind: ClientChannelKind
    locationId: 'LOC-MAIN'
    owningProduct: ClientSolutionId
  }>
  recordAuthorities: Array<{
    product: ClientSolutionId
    label: string
    locationIds: ['LOC-MAIN']
    owns: string[]
    consumesFrom: ClientSolutionId[]
    writePolicy: 'human_review_required'
  }>
  controls: {
    canonicalLocationRequired: true
    crossProductReferencesRequired: true
    unmanagedWritesAllowed: false
  }
}

export type ClientDemoBlueprint = {
  schema: typeof CLIENT_DEMO_BLUEPRINT_SCHEMA
  client: {
    workspace: string
    owner: string
    presetId: ClientDemoPresetId
    shopIndustryPackId: ShopIndustryPackId
    plantIndustryPackId: PlantIndustryPackId
  }
  foundation: ClientOperatingFoundation
  topology: ClientOperationalTopology
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

export type ClientCsvStarterPack = {
  schema: typeof CLIENT_CSV_STARTER_PACK_SCHEMA
  filename: string
  bytes: Uint8Array
}

const clientCsvFilename: Readonly<Record<ClientSolutionId, string>> = {
  commerce: 'shop.csv',
  production: 'plant.csv',
  website: 'website.csv',
  ecommerce: 'ecommerce.csv',
}

const crc32Table = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff
  for (const byte of bytes) value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function writeZipUint16(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff)
}

function writeZipUint32(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
}

function appendZipBytes(target: number[], bytes: Uint8Array) {
  for (const byte of bytes) target.push(byte)
}

function workspaceFilenameSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'client'
}

function zipStore(entries: Array<{ filename: string; bytes: Uint8Array }>) {
  const encoder = new TextEncoder()
  const archive: number[] = []
  const centralDirectory: number[] = []
  const utf8Flag = 0x0800
  const dosDate = 0x0021 // 1980-01-01; fixed so the starter pack is deterministic.

  for (const entry of entries) {
    const filename = encoder.encode(entry.filename)
    const checksum = crc32(entry.bytes)
    const localOffset = archive.length
    writeZipUint32(archive, 0x04034b50)
    writeZipUint16(archive, 20)
    writeZipUint16(archive, utf8Flag)
    writeZipUint16(archive, 0)
    writeZipUint16(archive, 0)
    writeZipUint16(archive, dosDate)
    writeZipUint32(archive, checksum)
    writeZipUint32(archive, entry.bytes.length)
    writeZipUint32(archive, entry.bytes.length)
    writeZipUint16(archive, filename.length)
    writeZipUint16(archive, 0)
    appendZipBytes(archive, filename)
    appendZipBytes(archive, entry.bytes)

    writeZipUint32(centralDirectory, 0x02014b50)
    writeZipUint16(centralDirectory, 20)
    writeZipUint16(centralDirectory, 20)
    writeZipUint16(centralDirectory, utf8Flag)
    writeZipUint16(centralDirectory, 0)
    writeZipUint16(centralDirectory, 0)
    writeZipUint16(centralDirectory, dosDate)
    writeZipUint32(centralDirectory, checksum)
    writeZipUint32(centralDirectory, entry.bytes.length)
    writeZipUint32(centralDirectory, entry.bytes.length)
    writeZipUint16(centralDirectory, filename.length)
    writeZipUint16(centralDirectory, 0)
    writeZipUint16(centralDirectory, 0)
    writeZipUint16(centralDirectory, 0)
    writeZipUint16(centralDirectory, 0)
    writeZipUint32(centralDirectory, 0)
    writeZipUint32(centralDirectory, localOffset)
    appendZipBytes(centralDirectory, filename)
  }

  const centralOffset = archive.length
  appendZipBytes(archive, Uint8Array.from(centralDirectory))
  writeZipUint32(archive, 0x06054b50)
  writeZipUint16(archive, 0)
  writeZipUint16(archive, 0)
  writeZipUint16(archive, entries.length)
  writeZipUint16(archive, entries.length)
  writeZipUint32(archive, centralDirectory.length)
  writeZipUint32(archive, centralOffset)
  writeZipUint16(archive, 0)
  return Uint8Array.from(archive)
}

export function buildClientCsvStarterPack(blueprintValue: unknown): ClientCsvStarterPack {
  const blueprint = canonicalClientDemoBlueprint(blueprintValue)
  if (!blueprint) throw new Error('Create a valid client demo before downloading its CSV starter pack.')
  const encoder = new TextEncoder()
  const entries = blueprint.products.map((product) => ({
    product: product.product,
    filename: clientCsvFilename[product.product],
    bytes: encoder.encode(product.sampleCsv),
  }))
  const bytes = zipStore(entries)
  return {
    schema: CLIENT_CSV_STARTER_PACK_SCHEMA,
    filename: `supermega-${workspaceFilenameSlug(blueprint.client.workspace)}-csv-starter-pack.zip`,
    bytes,
  }
}

export function clientCsvStarterPackHref(pack: ClientCsvStarterPack) {
  if (pack.schema !== CLIENT_CSV_STARTER_PACK_SCHEMA || !pack.bytes.length) {
    throw new Error('The client CSV starter pack is invalid.')
  }
  return `data:application/zip;base64,${btoa(String.fromCharCode(...pack.bytes))}`
}

export type ClientDemoProductProgressStatus = 'not_started' | 'needs_fix' | 'data_ready' | 'workspace_checked' | 'applied'

export type ClientDemoProductProgress = {
  product: ClientSolutionId
  status: ClientDemoProductProgressStatus
  rows: number
  readyRows: number
  issueRows: number
  updatedAt: string | null
}

export type ClientDemoWorkspace = {
  schema: typeof CLIENT_DEMO_WORKSPACE_SCHEMA
  blueprint: ClientDemoBlueprint
  products: ClientDemoProductProgress[]
  proofBaselineAt: string
  updatedAt: string
}

export type ClientDemoKit = {
  schema: typeof CLIENT_DEMO_KIT_SCHEMA
  blueprint: ClientDemoBlueprint
  exportedAt: string
  controls: {
    clientRecordsIncluded: false
    productProgressIncluded: false
    humanReviewRequired: true
  }
}

export type ClientDemoOperationalEvidence = {
  commerce: { completedOrders: number; reconciledOrders: number; latestAccountableSaleAt: string | null }
  production: { releasedBatches: number; latestReleasedAt: string | null }
  website: { approvedReleases: number; latestApprovedAt: string | null }
  ecommerce: {
    savedStorefronts: number
    reviewedRequests: number
    latestSavedStorefrontAt: string | null
    latestReviewedRequestAt: string | null
  }
}

export type ClientDemoRunbookStatus = 'prepare_data' | 'needs_fix' | 'ready_to_run' | 'proven'

export type ClientDemoRunbook = {
  schema: typeof CLIENT_DEMO_RUNBOOK_SCHEMA
  workspace: string
  owner: string
  provenCount: number
  nextProduct: ClientSolutionId | null
  products: Array<{
    product: ClientSolutionId
    label: string
    scenario: string
    startPath: string
    steps: readonly string[]
    evidenceRequirement: string
    evidenceObserved: string
    status: ClientDemoRunbookStatus
    importStatus: ClientDemoProductProgressStatus
    actionLabel: string
    actionPath: string
  }>
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

export type ParsedCsvRow = {
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
      'production-control': 'job_code,product_name,target_quantity,due_date,production_line\r\nJOB-001,20 inch tyre,500,{{dueDate14}},Line A\r\nJOB-002,16 inch tyre,300,{{dueDate21}},Line B\r\n',
      'maintenance-downtime': 'job_code,product_name,target_quantity,due_date,production_line\r\nMAINT-001,Compressor preventive service,1,{{dueDate14}},Utilities\r\nMAINT-002,Mixer bearing inspection,1,{{dueDate21}},Compounding\r\n',
      'quality-traceability': 'job_code,product_name,target_quantity,due_date,production_line\r\nQC-001,Incoming rubber inspection,1,{{dueDate14}},Quality Lab\r\nQC-002,Finished tyre release check,1,{{dueDate21}},Final Inspection\r\n',
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
      'social-storefront': 'sku,featured,collection,display_name,merchandising_note\r\nCOFFEE-250,true,Best sellers,Myanmar coffee 250g,Lead with everyday value and the Messenger order path.\r\nTEA-20,false,Tea,Green tea 20 pack,Keep local availability visible before checkout.\r\n',
      'pickup-preorder': 'sku,featured,collection,display_name,merchandising_note\r\nMENU-MOHINGA,true,Pickup this week,Mohinga,Show the pickup promise before request.\r\nMENU-TEA,false,Drinks,Myanmar milk tea,Confirm availability before collection.\r\n',
      'wholesale-request': 'sku,featured,collection,display_name,merchandising_note\r\nRICE-25KG,true,Trade essentials,Premium rice 25kg,Ask for quantity and delivery area.\r\nOIL-1L,false,Trade essentials,Cooking oil 1L,Keep trade pricing under review.\r\n',
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

export type ClientImportStagingPackage = {
  contract: typeof CLIENT_STAGING_SCHEMA
  product: ClientSolutionId
  object: string
  workflowTemplateId: string
  plantIndustryPackId?: PlantIndustryPackId
  workspace: string
  owner: string
  source: {
    name: string
    digest: string
    previewDigest: string
  }
  mapping: ClientImportMapping
  rows: Array<{
    sourceRow: number
    key: string
    values: Record<string, string>
  }>
  controls: {
    rowCount: number
    humanReviewRequired: true
    externalWritesPerformed: false
    activationStatus: 'staged_not_applied'
  }
}

export type ClientDemoPreparationArtifact = {
  contract: typeof CLIENT_DEMO_PREPARATION_SCHEMA
  preparedAt: string
  kit: {
    schema: typeof CLIENT_DEMO_KIT_SCHEMA
    digest: string
    exportedAt: string
  }
  client: ClientDemoBlueprint['client']
  foundation: ClientOperatingFoundation
  topology: ClientOperationalTopology
  products: Array<{
    product: ClientSolutionId
    label: string
    templateId: string
    sourceMode: 'client_csv' | 'kit_sample_fixture'
    sourceName: string
    rowCount: number
    previewDigest: string
    packageDigest: string
    demoPath: string
    setupPath: string
    stagingPackage: ClientImportStagingPackage
  }>
  integrations: ClientDemoBlueprint['integrations']
  checks: {
    ecommerceCatalogAligned: true
    websiteHomePresent: true
    plantLinesPresent: true
    oneWorkspaceAndOwner: true
  }
  controls: {
    localArtifactOnly: true
    containsNormalizedClientData: boolean
    containsSampleFixtures: boolean
    safeToShareExternally: false
    humanReviewRequired: true
    externalWritesPerformed: false
    hostedWritesPerformed: false
    connectorCallsPerformed: false
    modelCallsPerformed: false
    activationStatus: 'not_applied'
  }
  bundleDigest: string
  review: {
    status: 'awaiting_founder_review'
    confirmation: string
    checklist: string[]
  }
}

export type ClientDemoPreparationSource = {
  product: ClientSolutionId
  sourceName: string
  csvText: string
}

const clientDemoProductOrder: readonly ClientSolutionId[] = ['commerce', 'production', 'website', 'ecommerce']

const clientDemoProductDetails: Record<ClientSolutionId, { label: string; demoPath: string; setupPath: string }> = {
  commerce: { label: 'Shop', demoPath: '/shop/?tab=counter', setupPath: '/settings/?product=shop' },
  production: { label: 'Plant', demoPath: '/plant/?tab=production', setupPath: '/settings/?product=plant' },
  website: { label: 'Website', demoPath: '/website/', setupPath: '/settings/?product=website' },
  ecommerce: { label: 'Ecommerce', demoPath: '/ecommerce/', setupPath: '/settings/?product=ecommerce' },
}

const clientDemoPreparationReviewChecklist = [
  'Confirm the workspace, owner, selected templates, and industry packs.',
  'Review every normalized source row and resolve client-data corrections.',
  'Open each product demo path and complete its operational proof scenario.',
  'Confirm Shop, Plant, Website, and Ecommerce cross-product checks.',
  'Approve this exact bundle digest before any managed activation.',
] as const

const sha256Pattern = /^sha256:[0-9a-f]{64}$/

const clientDemoRunbookContracts: Record<ClientSolutionId, {
  scenario: string
  steps: readonly string[]
  evidenceRequirement: string
}> = {
  commerce: {
    scenario: 'Complete one accountable customer sale.',
    steps: ['Add a real item and customer', 'Confirm and reconcile payment', 'Complete the order'],
    evidenceRequirement: 'At least one completed order with a reconciled payment.',
  },
  production: {
    scenario: 'Release one controlled batch to stock.',
    steps: ['Plan and check availability', 'Run and inspect the batch', 'Authorize release to stock'],
    evidenceRequirement: 'A Plant batch projection in released-to-stock state.',
  },
  website: {
    scenario: 'Approve one responsive client website release.',
    steps: ['Review pages and approved copy', 'Attach content, link, and responsive evidence', 'Approve and record the local release'],
    evidenceRequirement: 'A current Website publish bound to its approval and evidence set.',
  },
  ecommerce: {
    scenario: 'Turn one storefront visit into a Shop-reviewed request.',
    steps: ['Save the Shop-backed storefront', 'Build and review one customer quote', 'Send the request to Shop for confirmation'],
    evidenceRequirement: 'A saved storefront configuration and at least one request confirmed into a Shop order.',
  },
}

export const clientDemoPresets: readonly ClientDemoPreset[] = [
  {
    id: 'social-seller',
    name: 'Social seller',
    description: 'Chat orders, a clear website, and a Shop-backed storefront.',
    shopIndustryPackId: 'retail',
    plantIndustryPackId: 'general-manufacturing',
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
    shopIndustryPackId: 'retail',
    plantIndustryPackId: 'assembly',
    selections: [
      { product: 'commerce', templateId: 'retail-wholesale' },
      { product: 'website', templateId: 'catalog-showcase' },
      { product: 'ecommerce', templateId: 'wholesale-request' },
    ],
  },
  {
    id: 'food-service',
    name: 'Cafe / restaurant',
    description: 'Counter and channel orders with a menu site and preorder collection.',
    shopIndustryPackId: 'cafe',
    plantIndustryPackId: 'food-beverage',
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
    shopIndustryPackId: 'retail',
    plantIndustryPackId: 'general-manufacturing',
    selections: [
      { product: 'commerce', templateId: 'retail-wholesale' },
      { product: 'production', templateId: 'production-control' },
      { product: 'website', templateId: 'catalog-showcase' },
      { product: 'ecommerce', templateId: 'wholesale-request' },
    ],
  },
  {
    id: 'bakery',
    name: 'Bakery & patisserie',
    description: 'Counter sales, production jobs, a bakery website, and Shop-backed online ordering.',
    shopIndustryPackId: 'cafe',
    plantIndustryPackId: 'food-beverage',
    shopBusinessTemplateId: 'bakery',
    selections: [
      { product: 'commerce', templateId: 'restaurant-ordering' },
      { product: 'production', templateId: 'production-control' },
      { product: 'website', templateId: 'lead-generation' },
      { product: 'ecommerce', templateId: 'pickup-preorder' },
    ],
  },
  {
    id: 'fashion',
    name: 'Fashion & clothing',
    description: 'Size-level stock, cut-and-sew production, a collection website, and Shop-backed ordering.',
    shopIndustryPackId: 'retail',
    plantIndustryPackId: 'apparel',
    shopBusinessTemplateId: 'fashion',
    selections: [
      { product: 'commerce', templateId: 'retail-wholesale' },
      { product: 'production', templateId: 'production-control' },
      { product: 'website', templateId: 'catalog-showcase' },
      { product: 'ecommerce', templateId: 'social-storefront' },
    ],
  },
  {
    id: 'service-business',
    name: 'Beauty & spa',
    description: 'Appointments, treatments, counter sales, a client website, and Shop-reviewed home-care pickup requests.',
    shopIndustryPackId: 'spa',
    plantIndustryPackId: 'general-manufacturing',
    shopBusinessTemplateId: 'beauty-spa',
    selections: [
      { product: 'commerce', templateId: 'social-commerce' },
      { product: 'website', templateId: 'lead-generation' },
      { product: 'ecommerce', templateId: 'social-storefront' },
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

export {
  normalizeHeader as normalizeClientImportHeader,
  parseCsv as parseClientCsv,
  sha256 as clientImportSha256,
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

function fieldIssue(field: ClientImportField, value: string, minimumProductionDueDate?: string): ClientImportIssue | null {
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
    if (minimumProductionDueDate && value <= minimumProductionDueDate) return { code: 'date_not_future', field: field.id, message: `${field.label} must be after ${minimumProductionDueDate} in Asia/Yangon.` }
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

function rowFromMapping(parsed: ParsedCsvRow, object: ClientImportObject, headers: string[], mapping: ClientImportMapping, fileIssues: ClientImportIssue[], minimumProductionDueDate?: string) {
  const source = Object.fromEntries(headers.map((header, index) => [header, parsed.cells[index] ?? '']))
  const issues: ClientImportIssue[] = []
  if (parsed.cells.length !== headers.length) issues.push({ code: 'column_count', field: 'row', message: `Expected ${headers.length} columns but found ${parsed.cells.length}.` })
  if (parsed.cells.every((cell) => !cell)) issues.push({ code: 'empty_row', field: 'row', message: 'Remove the empty CSV row.' })
  if (fileIssues.length) issues.push({ code: 'mapping_incomplete', field: 'row', message: 'Complete the column mapping before this row can be checked.' })
  const values = Object.fromEntries(object.fields.map((field) => [field.id, mapping[field.id] ? source[mapping[field.id]] ?? '' : '']))
  if (!issues.length) {
    for (const field of object.fields) {
      const issue = fieldIssue(field, values[field.id] ?? '', minimumProductionDueDate)
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

const shopIndustrySampleCsv: Readonly<Record<ShopIndustryPackId, string>> = {
  // Every pack's bookable services carry a price, and the model forbids a zero-price service, so
  // a service an owner cannot ring up is money the product told them to charge and then gave
  // them no way to collect. These SVC rows are not invented pricing -- each one is the price the
  // pack already declares in shop-service-scheduling.ts. reorder_at 0 keeps them out of stock
  // alerts and close stock-exceptions, because an hour of someone's time is not a stock unit.
  retail: 'sku,item_name,opening_stock,reorder_at,price_mmk\r\nRETAIL-SVC-SHOPPING,Personal shopping 30 min,999,0,15000\r\nRETAIL-SVC-PICKUP,Pickup window 15 min,999,0,5000\r\nRICE-25KG,Premium rice 25kg,18,6,72000\r\nOIL-1L,Cooking oil 1L,48,16,9500\r\n',
  cafe: 'sku,item_name,opening_stock,reorder_at,price_mmk\r\nCAFE-SVC-CATERING,Catering consultation 30 min,999,0,20000\r\nCAFE-SVC-COLLECTION,Preorder collection 15 min,999,0,5000\r\nMENU-MOHINGA,Mohinga,80,20,3500\r\nMENU-TEA,Myanmar milk tea,120,30,1800\r\n',
  // The restaurant pack's own stated first workflow is "Record an order and hold one accountable
  // table reservation", so a deposit it cannot collect breaks the pack's headline promise.
  restaurant: 'sku,item_name,opening_stock,reorder_at,price_mmk\r\nREST-SVC-DEPOSIT,Table reservation deposit,999,0,10000\r\nREST-SVC-EVENT,Private event consultation 45 min,999,0,25000\r\nMENU-CURRY,Chicken curry set,60,15,8500\r\nMENU-RICE,Steamed rice,120,30,1200\r\n',
  // Treatments first, then the retail add-ons. A spa's money comes from the treatment, so it has
  // to be sellable at the counter: the appointment book records WHEN a massage happens, but
  // shop-service-scheduling.ts has zero references to commerce and commerce-workspace.ts has zero
  // references to bookings, so a completed appointment reaches no order, no daily close and no
  // accounting handoff. Its expectedRevenueMmk is a display projection, not a ledger entry. A
  // treatment that is not a catalog item therefore cannot be paid for at all.
  //
  // opening_stock is high and reorder_at is 0 on purpose -- a therapist-hour is not a stock unit,
  // and at reorderAt 0 it never raises a stock alert or a close stock-exception. Prices match the
  // scheduling pack exactly so the counter and the appointment book cannot quote different
  // numbers for the same treatment.
  //
  // SPA-SVC-DEPOSIT is the restaurant pack's REST-SVC-DEPOSIT pattern rather than a new
  // mechanism, down to the name shape. paymentStatus is binary, so an order cannot be part-paid;
  // a deposit taken as a counter sale is an ordinary order that the daily close already
  // understands. It is a 10,000 MMK UNIT and quantity carries the amount, but the amount stays
  // OUT of the name: price_mmk is the only source of truth for it, and a name repeating it goes
  // stale the moment a shop changes its deposit. Mirrors packServiceRows in
  // products/shop/business-templates.ts, which the pairing guard pins to this file.
  spa: 'sku,item_name,opening_stock,reorder_at,price_mmk\r\nSPA-SVC-DEPOSIT,Treatment package deposit,999,0,10000\r\nSPA-PACK-MASSAGE-5,Five session massage package,999,0,200000\r\nSPA-PACK-FACIAL-3,Three session facial package,999,0,100000\r\nSPA-SVC-CONSULT,Consultation 30 min,999,0,20000\r\nSPA-SVC-MASSAGE,Traditional Myanmar massage 60 min,999,0,45000\r\nSPA-SVC-OIL,Aromatic oil massage 90 min,999,0,65000\r\nSPA-SVC-FOOT,Foot massage 45 min,999,0,28000\r\nSPA-SVC-FACIAL,Facial treatment 45 min,999,0,38000\r\nSPA-SVC-SCRUB,Body scrub 60 min,999,0,42000\r\nSPA-SVC-STEAM,Herbal steam 30 min,999,0,18000\r\nSPA-OIL-100ML,Aromatic massage oil 100ml,36,12,15000\r\nSPA-COMPRESS,Herbal compress ball,24,8,7000\r\n',
  // Same reasoning as spa above: a gym sells the session, not the shaker bottle. Prices mirror
  // the scheduling pack so a booked class and a counter sale cannot disagree.
  gym: 'sku,item_name,opening_stock,reorder_at,price_mmk\r\nGYM-SVC-DEPOSIT,Training package deposit,999,0,10000\r\nGYM-SVC-CONSULT,Fitness consultation 30 min,999,0,15000\r\nGYM-SVC-PT,Personal training 60 min,999,0,30000\r\nGYM-SVC-COMPOSITION,Body composition check 20 min,999,0,8000\r\nGYM-SVC-CLASS,Group class 60 min,999,0,12000\r\nGYM-SVC-YOGA,Yoga session 60 min,999,0,15000\r\nGYM-SVC-NUTRITION,Nutrition plan review 30 min,999,0,20000\r\nGYM-WHEY-1KG,Whey protein 1kg,18,6,145000\r\nGYM-SHAKER,Shaker bottle 700ml,40,12,9000\r\n',
  // School is the one pack carrying an extra contract, so its lessons are APPENDED rather than
  // listed first: the integrated demo blueprint requires the shop catalog SKUs to EQUAL the
  // ecommerce storefront SKUs in order, AND the SKU checklist example to stay SCHOOL-ENGLISH
  // (verify_app_build.mjs, client_demo_school_pack_did_not_align_shop_website_and_ecommerce_
  // samples). That example is read from the FIRST data row, so appending keeps SCHOOL-ENGLISH
  // while still making every bookable lesson sellable. The same SKUs are appended to the school
  // storefront sample below, in the same order, to hold the pairing.
  school: 'sku,item_name,opening_stock,reorder_at,price_mmk\r\nSCHOOL-ENGLISH,English coursebook Level 1,60,15,15000\r\nSCHOOL-EXERCISE-80,Exercise book 80 pages,300,80,1200\r\nSCHOOL-SVC-ENROLL,Enrollment consultation 30 min,999,0,10000\r\nSCHOOL-SVC-PLACEMENT,Placement test 45 min,999,0,5000\r\nSCHOOL-SVC-ENGLISH,English class session 60 min,999,0,20000\r\nSCHOOL-SVC-MATHS,Maths class session 60 min,999,0,20000\r\nSCHOOL-SVC-TUTORING,Private tutoring 60 min,999,0,35000\r\nSCHOOL-SVC-EXAM,Exam preparation session 90 min,999,0,30000\r\n',
}

const ecommerceIndustrySampleCsv: Readonly<Record<ShopIndustryPackId, string>> = {
  retail: 'sku,featured,collection,display_name,merchandising_note\r\nRICE-25KG,true,Trade essentials,Premium rice 25kg,Ask for quantity and delivery area.\r\nOIL-1L,false,Trade essentials,Cooking oil 1L,Keep trade pricing under review.\r\n',
  cafe: 'sku,featured,collection,display_name,merchandising_note\r\nMENU-MOHINGA,true,Pickup this week,Mohinga,Show the pickup promise before request.\r\nMENU-TEA,false,Drinks,Myanmar milk tea,Confirm availability before collection.\r\n',
  restaurant: 'sku,featured,collection,display_name,merchandising_note\r\nMENU-CURRY,true,Popular meals,Chicken curry set,Show preparation and pickup timing.\r\nMENU-RICE,false,Sides,Steamed rice,Confirm quantity with the meal request.\r\n',
  spa: 'sku,featured,collection,display_name,merchandising_note\r\nSPA-OIL-100ML,true,Home care,Aromatic massage oil 100ml,Offer it after a treatment for home care.\r\nSPA-COMPRESS,false,Home care,Herbal compress ball,Confirm counter stock before promising collection.\r\n',
  gym: 'sku,featured,collection,display_name,merchandising_note\r\nGYM-WHEY-1KG,true,Supplements,Whey protein 1kg,Show the flavour in stock before confirming.\r\nGYM-SHAKER,false,Accessories,Shaker bottle 700ml,Bundle it with a first protein purchase.\r\n',
  // Order must match the school shop sample above exactly -- the integrated demo blueprint pairs
  // the two row-for-row. Lessons are listed as enquiry-led enrollments, not add-to-cart items.
  school: 'sku,featured,collection,display_name,merchandising_note\r\nSCHOOL-ENGLISH,true,Course books,English coursebook Level 1,Confirm the class level before collection.\r\nSCHOOL-EXERCISE-80,false,Stationery,Exercise book 80 pages,Sold singly or by the ten pack at reception.\r\nSCHOOL-SVC-ENROLL,true,Enrollment,Enrollment consultation 30 min,Book before the term starts to confirm a place.\r\nSCHOOL-SVC-PLACEMENT,false,Enrollment,Placement test 45 min,Sets the right level before the first class.\r\nSCHOOL-SVC-ENGLISH,false,Classes,English class session 60 min,Quote the full term when the parent enquires.\r\nSCHOOL-SVC-MATHS,false,Classes,Maths class session 60 min,Quote the full term when the parent enquires.\r\nSCHOOL-SVC-TUTORING,false,Classes,Private tutoring 60 min,Agree the tutor and schedule before payment.\r\nSCHOOL-SVC-EXAM,false,Classes,Exam preparation session 90 min,Confirm the exam date before enrolling.\r\n',
}

const websiteIndustrySampleCsv: Readonly<Record<ShopIndustryPackId, string>> = {
  retail: 'page_slug,page_title,headline,body,contact_url\r\nhome,Home,Shop trusted everyday essentials,Show current products and one clear enquiry path.,https://example.com/contact\r\nproducts,Products,Find the right product,Group products with useful buying details.,https://example.com/contact\r\n',
  cafe: 'page_slug,page_title,headline,body,contact_url\r\nhome,Home,Fresh local favourites ready for pickup,Show today’s menu location and opening hours.,https://example.com/contact\r\nmenu,Menu,Choose food and drinks,Explain pickup timing and how to request an order.,https://example.com/contact\r\n',
  restaurant: 'page_slug,page_title,headline,body,contact_url\r\nhome,Home,A clear place to eat well,Show signature meals location and reservation details.,https://example.com/contact\r\nmenu,Menu,Explore the approved menu,Explain table and pickup options before enquiry.,https://example.com/contact\r\n',
  spa: 'page_slug,page_title,headline,body,contact_url\r\nhome,Home,Massage and beauty treatments by appointment,Choose a treatment then contact us to request a time that works for you.,https://example.com/contact\r\nservices,Treatments,Treatments with clear times and prices,Traditional massage oil massage facials body scrub foot massage and herbal steam are available by appointment.,https://example.com/contact\r\n',
  gym: 'page_slug,page_title,headline,body,contact_url\r\nhome,Home,Train with a clear plan,Show coaching facilities and one trial path.,https://example.com/contact\r\nclasses,Classes,Find the right session,Explain schedules levels and what to bring.,https://example.com/contact\r\n',
  school: 'page_slug,page_title,headline,body,contact_url\r\nhome,Home,Learn with a clear next step,Show courses teachers proof and one enquiry path.,https://example.com/contact\r\ncourses,Courses,Choose the right class,Explain level schedule fees and enrollment clearly.,https://example.com/contact\r\n',
}

const plantIndustrySampleCsv: Readonly<Record<PlantIndustryPackId, string>> = {
  'general-manufacturing': 'job_code,product_name,target_quantity,due_date,production_line\r\nJOB-001,Finished product A,500,{{dueDate14}},Line A\r\nJOB-002,Finished product B,300,{{dueDate21}},Line B\r\n',
  'batch-process': 'job_code,product_name,target_quantity,due_date,production_line\r\nJOB-BATCH-001,Process batch A,100,{{dueDate14}},Process Line 1\r\nJOB-BATCH-002,Process batch B,120,{{dueDate21}},Process Line 2\r\n',
  'food-beverage': 'job_code,product_name,target_quantity,due_date,production_line\r\nJOB-FOOD-001,Chili sauce batch,200,{{dueDate14}},Batch Kitchen\r\nJOB-FOOD-002,Juice batch,300,{{dueDate21}},Filling Line\r\n',
  apparel: 'job_code,product_name,target_quantity,due_date,production_line\r\nJOB-STYLE-001,Cotton shirt style,400,{{dueDate14}},Sewing Line 1\r\nJOB-STYLE-002,Work trouser style,250,{{dueDate21}},Sewing Line 2\r\n',
  assembly: 'job_code,product_name,target_quantity,due_date,production_line\r\nJOB-BUILD-001,Assembly model A,120,{{dueDate14}},Assembly Cell 1\r\nJOB-BUILD-002,Assembly model B,80,{{dueDate21}},Assembly Cell 2\r\n',
}

function currentYangonDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function clientImportPlanningDate(value = currentYangonDate()) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Planning date must use a real YYYY-MM-DD date.')
  }
  return value
}

function planningDateAfter(value: string, days: number) {
  const parsed = new Date(`${clientImportPlanningDate(value)}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  const result = parsed.toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error('Planning date is outside the supported range.')
  return result
}

function materializePlantTemplate(source: string, planningDate?: string) {
  const resolvedPlanningDate = clientImportPlanningDate(planningDate)
  return source
    .replaceAll('{{dueDate14}}', planningDateAfter(resolvedPlanningDate, 14))
    .replaceAll('{{dueDate21}}', planningDateAfter(resolvedPlanningDate, 21))
}

export function clientImportTemplate(product: ClientSolutionId, workflowTemplateId?: string, context: ClientImportTemplateContext = {}) {
  const resolvedWorkflowTemplateId = resolveWorkflowTemplateId(product, workflowTemplateId)
  if (product === 'production' && context.plantIndustryPackId) {
    return materializePlantTemplate(plantIndustrySampleCsv[plantIndustryPack(context.plantIndustryPackId).id], context.planningDate)
  }
  if (context.shopIndustryPackId) {
    const industryPackId = shopIndustryPack(context.shopIndustryPackId).id
    if (product === 'commerce') return shopIndustrySampleCsv[industryPackId]
    if (product === 'website') return websiteIndustrySampleCsv[industryPackId]
    if (product === 'ecommerce') return ecommerceIndustrySampleCsv[industryPackId]
  }
  const source = objects[product].workflowTemplates[resolvedWorkflowTemplateId]
  return product === 'production' ? materializePlantTemplate(source, context.planningDate) : source
}

function exampleRows(product: ClientSolutionId, workflowTemplateId?: string, context: ClientImportTemplateContext = {}) {
  const template = clientImportTemplate(product, workflowTemplateId, context)
  const parsed = parseCsv(template)
  const headers = parsed.rows[0]?.cells ?? []
  const sample = parsed.rows[1]?.cells ?? []
  return { headers, sample }
}

function checklistNote(field: ClientImportField) {
  if (field.kind === 'sku') return 'Use stable uppercase codes. Do not reuse one code for two records.'
  if (field.kind === 'integer') return `Whole number${field.minimum !== undefined ? `, minimum ${field.minimum}` : ''}. No decimals or formulas.`
  if (field.kind === 'date') return 'Use YYYY-MM-DD and a date after today in Asia/Yangon.'
  if (field.kind === 'boolean') return 'Use true/false, yes/no, 1/0, or on/off.'
  if (field.kind === 'slug') return 'Use lowercase URL-safe slugs, for example home or products.'
  if (field.kind === 'url') return 'Use https:// links, /relative paths, or leave blank when optional.'
  return `Text${field.maximum ? ` up to ${field.maximum} characters` : ''}. No spreadsheet formulas.`
}

export function clientImportChecklist(product: ClientSolutionId, workflowTemplateId?: string, context: ClientImportTemplateContext = {}) {
  const object = objects[product]
  const { headers, sample } = exampleRows(product, workflowTemplateId, context)
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
  planningDate?: string,
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
  const minimumProductionDueDate = product === 'production' ? clientImportPlanningDate(planningDate) : undefined
  const rows = parsed.rows.slice(1).map((row) => rowFromMapping(row, object, headers, mapping, fileIssues, minimumProductionDueDate))
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

const operatingUnitKindByPreset: Readonly<Record<ClientDemoPresetId, ClientOperatingUnitKind>> = {
  'social-seller': 'digital-commerce',
  'retail-network': 'retail',
  'food-service': 'food-service',
  manufacturing: 'plant',
  bakery: 'food-service',
  fashion: 'plant',
  'service-business': 'service',
}

function clientCsvField(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function businessTemplateWebsiteCsv(template: ShopBusinessTemplate, businessName: string) {
  const brief = websiteTradeBrief({ tradeId: template.id, businessName })
  if (!brief) throw new Error(`The ${template.name.en} template needs a reviewed Website brief.`)
  const lines = [
    ['home', 'Home', `${template.name.en} for ${brief.audience}`, brief.offer, 'https://example.com/contact'],
    ['proof', 'Why us', 'How we keep our promise', brief.proof, 'https://example.com/contact'],
  ].map((row) => row.map(clientCsvField).join(','))
  return `page_slug,page_title,headline,body,contact_url\r\n${lines.join('\r\n')}\r\n`
}

function businessTemplateStorefrontCsv(template: ShopBusinessTemplate) {
  const merchandise = template.catalog.filter((item) => !isShopServiceSku(item.sku)).slice(0, 6)
  if (merchandise.length < 2) throw new Error(`The ${template.name.en} template needs at least two storefront products.`)
  const lines = merchandise.map((item, index) => [
    item.sku,
    index < 2 ? 'true' : 'false',
    clientCsvField(index < 2 ? 'Featured today' : 'More to browse'),
    clientCsvField(item.name),
    clientCsvField('Confirm current availability before accepting the order request.'),
  ].join(','))
  return `sku,featured,collection,display_name,merchandising_note\r\n${lines.join('\r\n')}\r\n`
}

function plantBusinessTemplateCsv(template: PlantBusinessTemplate, planningDate = currentYangonDate()) {
  const lines = template.jobs.map((job) => [
    job.jobCode,
    clientCsvField(job.product),
    String(job.target),
    planningDateAfter(planningDate, job.dueInDays),
    clientCsvField(job.line),
  ].join(','))
  return `job_code,product_name,target_quantity,due_date,production_line\r\n${lines.join('\r\n')}\r\n`
}

const clientChannelByProduct: Readonly<Record<ClientSolutionId, {
  id: string
  label: string
  kind: ClientChannelKind
}>> = {
  commerce: { id: 'shop-counter', label: 'Counter and assisted orders', kind: 'assisted-sales' },
  production: { id: 'plant-execution', label: 'Production execution', kind: 'production-execution' },
  website: { id: 'website-inquiry', label: 'Website inquiries', kind: 'lead-capture' },
  ecommerce: { id: 'ecommerce-storefront', label: 'Digital storefront', kind: 'digital-sales' },
}

const clientRecordsOwnedByProduct: Readonly<Record<ClientSolutionId, readonly string[]>> = {
  commerce: ['catalog', 'inventory', 'orders', 'payments', 'customer_accounts'],
  production: ['materials', 'work_orders', 'quality', 'maintenance', 'released_stock'],
  website: ['pages', 'content', 'releases', 'lead_intake'],
  ecommerce: ['storefront', 'collections', 'carts', 'quotes', 'order_requests'],
}

function clientProductDependencies(product: ClientSolutionId, selected: ReadonlySet<ClientSolutionId>) {
  const dependencies: ClientSolutionId[] = []
  if (product === 'commerce' && selected.has('production')) dependencies.push('production')
  if (product === 'production' && selected.has('commerce')) dependencies.push('commerce')
  if (product === 'ecommerce' && selected.has('commerce')) dependencies.push('commerce')
  if (product === 'ecommerce' && selected.has('website')) dependencies.push('website')
  return clientDemoProductOrder.filter((candidate) => dependencies.includes(candidate))
}

export function buildClientOperatingFoundation(workspaceValue: string, presetId: ClientDemoPresetId): ClientOperatingFoundation {
  const workspace = boundedContext(workspaceValue, 'Client name', 60)
  clientDemoPreset(presetId)
  return {
    schema: CLIENT_OPERATING_FOUNDATION_SCHEMA,
    organization: { displayName: workspace, verification: 'client_review_required' },
    operatingUnit: { code: 'MAIN', name: 'Main operating unit', kind: operatingUnitKindByPreset[presetId] },
    localization: { countryCode: 'MM', currency: 'MMK', locale: 'my-MM', timeZone: 'Asia/Yangon' },
    controls: {
      sharedAcrossProducts: true,
      clientReviewRequired: true,
      externalRegistryChecked: false,
      managedIdentityRequiredBeforeActivation: true,
    },
  }
}

export function buildClientOperationalTopology(
  presetId: ClientDemoPresetId,
  productsValue: readonly ClientSolutionId[],
): ClientOperationalTopology {
  clientDemoPreset(presetId)
  const products = clientDemoProductOrder.filter((product) => productsValue.includes(product))
  if (products.length !== productsValue.length || new Set(productsValue).size !== productsValue.length || products.length < 1) {
    throw new Error('Choose a canonical set of products before building the operating topology.')
  }
  const selected = new Set(products)
  return {
    schema: CLIENT_OPERATIONAL_TOPOLOGY_SCHEMA,
    locations: [{
      id: 'LOC-MAIN',
      code: 'MAIN',
      name: 'Main operating unit',
      kind: operatingUnitKindByPreset[presetId],
      timeZone: 'Asia/Yangon',
      active: true,
    }],
    channels: products.map((product) => ({
      ...clientChannelByProduct[product],
      locationId: 'LOC-MAIN' as const,
      owningProduct: product,
    })),
    recordAuthorities: products.map((product) => ({
      product,
      label: clientDemoProductDetails[product].label,
      locationIds: ['LOC-MAIN'] as ['LOC-MAIN'],
      owns: [...clientRecordsOwnedByProduct[product]],
      consumesFrom: clientProductDependencies(product, selected),
      writePolicy: 'human_review_required' as const,
    })),
    controls: {
      canonicalLocationRequired: true,
      crossProductReferencesRequired: true,
      unmanagedWritesAllowed: false,
    },
  }
}

function canonicalClientOperatingFoundation(value: unknown, workspace: string, presetId: ClientDemoPresetId) {
  const expected = buildClientOperatingFoundation(workspace, presetId)
  return JSON.stringify(value) === JSON.stringify(expected) ? expected : null
}

function canonicalClientOperationalTopology(value: unknown, presetId: ClientDemoPresetId, products: readonly ClientSolutionId[]) {
  const expected = buildClientOperationalTopology(presetId, products)
  return JSON.stringify(value) === JSON.stringify(expected) ? expected : null
}

export function buildClientDemoBlueprint(input: {
  workspace: string
  owner: string
  presetId: ClientDemoPresetId
  shopIndustryPackId?: ShopIndustryPackId
  plantIndustryPackId?: PlantIndustryPackId
  selections: readonly ClientDemoSelection[]
}): ClientDemoBlueprint {
  const workspace = boundedContext(input.workspace, 'Client name', 60)
  const owner = boundedContext(input.owner, 'Responsible owner', 80)
  const preset = clientDemoPreset(input.presetId)
  const industryPack = shopIndustryPack(input.shopIndustryPackId ?? preset.shopIndustryPackId)
  const plantPack = plantIndustryPack(input.plantIndustryPackId ?? preset.plantIndustryPackId)
  const businessTemplate = preset.shopBusinessTemplateId
    ? shopBusinessTemplate(preset.shopBusinessTemplateId)
    : null
  const plantBusinessTemplate = businessTemplate
    ? plantBusinessTemplateForShopTemplateId(businessTemplate.id)
    : null
  const presetBusinessCatalog = businessTemplate?.industryPackId === industryPack.id
    ? shopBusinessTemplateCatalogCsv(businessTemplate.id)
    : null
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
      sampleCsv: product === 'commerce' && presetBusinessCatalog
        ? presetBusinessCatalog
        : product === 'production' && plantBusinessTemplate && plantBusinessTemplate.industryPackId === plantPack.id
          ? plantBusinessTemplateCsv(plantBusinessTemplate)
          : product === 'website' && businessTemplate && businessTemplate.industryPackId === industryPack.id
            ? businessTemplateWebsiteCsv(businessTemplate, workspace)
          : product === 'ecommerce' && businessTemplate && businessTemplate.industryPackId === industryPack.id
            ? businessTemplateStorefrontCsv(businessTemplate)
        : clientImportTemplate(product, templateId, {
            shopIndustryPackId: industryPack.id,
            plantIndustryPackId: plantPack.id,
          }),
      checklist: clientImportChecklist(product, templateId, {
        shopIndustryPackId: industryPack.id,
        plantIndustryPackId: plantPack.id,
      }),
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
    client: { workspace, owner, presetId: preset.id, shopIndustryPackId: industryPack.id, plantIndustryPackId: plantPack.id },
    foundation: buildClientOperatingFoundation(workspace, preset.id),
    topology: buildClientOperationalTopology(preset.id, products.map((product) => product.product)),
    products,
    integrations,
    controls: {
      localDemoOnly: true,
      humanReviewRequired: true,
      externalWritesPerformed: false,
    },
  }
}

function canonicalClientDemoBlueprint(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Partial<ClientDemoBlueprint>
  if (!source.client || !Array.isArray(source.products)) return null
  try {
    const rebuilt = buildClientDemoBlueprint({
      workspace: source.client.workspace ?? '',
      owner: source.client.owner ?? '',
      presetId: source.client.presetId as ClientDemoPresetId,
      shopIndustryPackId: source.client.shopIndustryPackId,
      plantIndustryPackId: source.client.plantIndustryPackId,
      selections: source.products.map((product) => ({ product: product.product, templateId: product.templateId })),
    })
    if (JSON.stringify(rebuilt) === JSON.stringify(value)) return rebuilt
    if ((source.schema as string | undefined) === LEGACY_V2_CLIENT_DEMO_BLUEPRINT_SCHEMA && source.topology === undefined) {
      const legacyV2 = { ...rebuilt, schema: LEGACY_V2_CLIENT_DEMO_BLUEPRINT_SCHEMA } as Record<string, unknown>
      delete legacyV2.topology
      if (JSON.stringify(legacyV2) === JSON.stringify(value)) return rebuilt
    }
    if ((source.schema as string | undefined) === LEGACY_CLIENT_DEMO_BLUEPRINT_SCHEMA && source.foundation === undefined && source.topology === undefined) {
      const legacyClientVariants = [
        rebuilt.client,
        { workspace: rebuilt.client.workspace, owner: rebuilt.client.owner, presetId: rebuilt.client.presetId, shopIndustryPackId: rebuilt.client.shopIndustryPackId },
        { workspace: rebuilt.client.workspace, owner: rebuilt.client.owner, presetId: rebuilt.client.presetId, plantIndustryPackId: rebuilt.client.plantIndustryPackId },
        { workspace: rebuilt.client.workspace, owner: rebuilt.client.owner, presetId: rebuilt.client.presetId },
      ]
      for (const client of legacyClientVariants) {
        const legacy = {
          schema: LEGACY_CLIENT_DEMO_BLUEPRINT_SCHEMA,
          client,
          products: rebuilt.products,
          integrations: rebuilt.integrations,
          controls: rebuilt.controls,
        }
        if (JSON.stringify(legacy) === JSON.stringify(value)) return rebuilt
      }
    }
    return null
  } catch {
    return null
  }
}

function canonicalTimestamp(value: unknown) {
  if (typeof value !== 'string' || value.length > 32) return null
  try { return new Date(value).toISOString() === value ? value : null } catch { return null }
}

function hasExactKeys(value: object, keys: readonly string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
}

export function buildClientDemoKit(blueprintValue: unknown, exportedAtValue: unknown): ClientDemoKit {
  const blueprint = canonicalClientDemoBlueprint(blueprintValue)
  const exportedAt = canonicalTimestamp(exportedAtValue)
  if (!blueprint || !exportedAt) throw new Error('The client demo setup kit is invalid.')
  const kit: ClientDemoKit = {
    schema: CLIENT_DEMO_KIT_SCHEMA,
    blueprint,
    exportedAt,
    controls: {
      clientRecordsIncluded: false,
      productProgressIncluded: false,
      humanReviewRequired: true,
    },
  }
  if (byteLength(JSON.stringify(kit)) > CLIENT_DEMO_KIT_MAX_BYTES) throw new Error('The client demo setup kit is too large.')
  return kit
}

export function clientDemoKitReadiness(blueprintValue: unknown, exportedAtValue: unknown) {
  try {
    return { ready: true as const, kit: buildClientDemoKit(blueprintValue, exportedAtValue), reason: null }
  } catch {
    return {
      ready: false as const,
      kit: null,
      reason: 'The saved client demo no longer matches the current setup contract. Rebuild it before downloading or preparing client files.',
    }
  }
}

export function restoreClientDemoKit(value: unknown): ClientDemoKit | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    if (byteLength(JSON.stringify(value)) > CLIENT_DEMO_KIT_MAX_BYTES) return null
  } catch { return null }
  if (!hasExactKeys(value, ['schema', 'blueprint', 'exportedAt', 'controls'])) return null
  const source = value as Partial<ClientDemoKit>
  const blueprint = canonicalClientDemoBlueprint(source.blueprint)
  const exportedAt = canonicalTimestamp(source.exportedAt)
  const sourceSchema = source.schema as string | undefined
  if ((sourceSchema !== CLIENT_DEMO_KIT_SCHEMA && sourceSchema !== LEGACY_V2_CLIENT_DEMO_KIT_SCHEMA && sourceSchema !== LEGACY_CLIENT_DEMO_KIT_SCHEMA) || !blueprint || !exportedAt || !source.controls
    || !hasExactKeys(source.controls, ['clientRecordsIncluded', 'productProgressIncluded', 'humanReviewRequired'])
    || source.controls.clientRecordsIncluded !== false
    || source.controls.productProgressIncluded !== false
    || source.controls.humanReviewRequired !== true) return null
  return { schema: CLIENT_DEMO_KIT_SCHEMA, blueprint, exportedAt, controls: { ...source.controls } }
}

function clientDemoPreparationChecks(packages: readonly ClientImportStagingPackage[]) {
  const byProduct = new Map(packages.map((entry) => [entry.product, entry]))
  const shopSkus = new Set((byProduct.get('commerce')?.rows ?? []).map((row) => row.values.sku))
  return {
    ecommerceCatalogAligned: (!byProduct.has('ecommerce') || !byProduct.has('commerce')
      || (byProduct.get('ecommerce')?.rows ?? []).every((row) => shopSkus.has(row.values.sku))),
    websiteHomePresent: (!byProduct.has('website')
      || (byProduct.get('website')?.rows ?? []).some((row) => row.values.slug === 'home')),
    plantLinesPresent: (!byProduct.has('production')
      || (byProduct.get('production')?.rows ?? []).every((row) => Boolean(row.values.line))),
    oneWorkspaceAndOwner: new Set(packages.map((entry) => `${entry.workspace}\u0000${entry.owner}`)).size === 1,
  }
}

function ecommerceFixtureFromShop(stagingPackage: ClientImportStagingPackage) {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`
  const rows = stagingPackage.rows.map((row, index) => [
    row.values.sku,
    index === 0 ? 'true' : 'false',
    'Client catalog',
    row.values.name,
    'Review before publishing.',
  ].map(cell).join(','))
  return `sku,featured,collection,display_name,merchandising_note\r\n${rows.join('\r\n')}\r\n`
}

export async function prepareClientDemoInBrowser(
  kitValue: unknown,
  sourcesValue: unknown,
  preparedAtValue: unknown = new Date().toISOString(),
): Promise<ClientDemoPreparationArtifact> {
  const kit = restoreClientDemoKit(kitValue)
  const preparedAt = canonicalTimestamp(preparedAtValue)
  if (!kit || !preparedAt) throw new Error('The client demo setup kit is invalid.')
  if (!Array.isArray(sourcesValue) || sourcesValue.length > kit.blueprint.products.length) {
    throw new Error('Choose no more than one CSV for each selected product.')
  }

  const selectedProducts = new Set(kit.blueprint.products.map((product) => product.product))
  const sources = new Map<ClientSolutionId, ClientDemoPreparationSource>()
  for (const value of sourcesValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || !hasExactKeys(value, ['product', 'sourceName', 'csvText'])) {
      throw new Error('One selected client CSV has an invalid file description.')
    }
    const source = value as Partial<ClientDemoPreparationSource>
    if (!source.product || !clientDemoProductOrder.includes(source.product)
      || !selectedProducts.has(source.product) || sources.has(source.product)
      || typeof source.sourceName !== 'string' || typeof source.csvText !== 'string') {
      throw new Error('Choose one correctly named CSV for each selected product.')
    }
    sources.set(source.product, source as ClientDemoPreparationSource)
  }

  const products: ClientDemoPreparationArtifact['products'] = []
  for (const product of kit.blueprint.products) {
    const source = sources.get(product.product)
    const sourceMode = source ? 'client_csv' as const : 'kit_sample_fixture' as const
    const shopPackage = products.find((entry) => entry.product === 'commerce')?.stagingPackage
    const sourceText = !source && product.product === 'ecommerce' && sources.has('commerce') && shopPackage
      ? ecommerceFixtureFromShop(shopPackage)
      : source?.csvText ?? product.sampleCsv
    const preview = await createClientImportPreview(
      sourceText,
      product.product,
      undefined,
      source?.sourceName ?? `sample-${product.product}.csv`,
      product.templateId,
    )
    if (!preview.readyForStaging || preview.totals.ready !== preview.totals.rows) {
      throw new Error(`${product.label} data needs correction before this demo can be prepared.`)
    }
    const stagingPackage = buildClientImportStagingPackage(preview, {
      workflowTemplateId: product.templateId,
      workspace: kit.blueprint.client.workspace,
      owner: kit.blueprint.client.owner,
      plantIndustryPackId: kit.blueprint.client.plantIndustryPackId,
    })
    const details = clientDemoProductDetails[product.product]
    products.push({
      product: product.product,
      label: details.label,
      templateId: product.templateId,
      sourceMode,
      sourceName: stagingPackage.source.name,
      rowCount: stagingPackage.rows.length,
      previewDigest: stagingPackage.source.previewDigest,
      packageDigest: await sha256(JSON.stringify(stagingPackage)),
      demoPath: details.demoPath,
      setupPath: details.setupPath,
      stagingPackage,
    })
  }

  const checks = clientDemoPreparationChecks(products.map((product) => product.stagingPackage))
  if (Object.values(checks).some((check) => check !== true)) {
    throw new Error('The selected files do not yet form one connected four-product demo.')
  }
  const verifiedChecks: ClientDemoPreparationArtifact['checks'] = {
    ecommerceCatalogAligned: true,
    websiteHomePresent: true,
    plantLinesPresent: true,
    oneWorkspaceAndOwner: true,
  }
  const customSourceCount = products.filter((product) => product.sourceMode === 'client_csv').length
  const payload = {
    contract: CLIENT_DEMO_PREPARATION_SCHEMA,
    preparedAt,
    kit: { schema: kit.schema, digest: await sha256(JSON.stringify(kit)), exportedAt: kit.exportedAt },
    client: kit.blueprint.client,
    foundation: kit.blueprint.foundation,
    topology: kit.blueprint.topology,
    products,
    integrations: kit.blueprint.integrations,
    checks: verifiedChecks,
    controls: {
      localArtifactOnly: true as const,
      containsNormalizedClientData: customSourceCount > 0,
      containsSampleFixtures: customSourceCount < products.length,
      safeToShareExternally: false as const,
      humanReviewRequired: true as const,
      externalWritesPerformed: false as const,
      hostedWritesPerformed: false as const,
      connectorCallsPerformed: false as const,
      modelCallsPerformed: false as const,
      activationStatus: 'not_applied' as const,
    },
  }
  const bundleDigest = await sha256(JSON.stringify(payload))
  const artifact: ClientDemoPreparationArtifact = {
    ...payload,
    bundleDigest,
    review: {
      status: 'awaiting_founder_review',
      confirmation: `APPROVE CLIENT DEMO ${bundleDigest}`,
      checklist: [...clientDemoPreparationReviewChecklist],
    },
  }
  if (byteLength(JSON.stringify(artifact)) > CLIENT_DEMO_PREPARATION_MAX_BYTES) {
    throw new Error('The prepared client demo is larger than 5 MB.')
  }
  const restored = await restoreClientDemoPreparationArtifact(artifact)
  if (!restored) throw new Error('The client demo failed its final local integrity check.')
  return restored
}

function clientDemoPreparationBlueprintFromSource(source: ClientDemoPreparationArtifact) {
  return buildClientDemoBlueprint({
    workspace: source.client.workspace,
    owner: source.client.owner,
    presetId: source.client.presetId,
    shopIndustryPackId: source.client.shopIndustryPackId,
    plantIndustryPackId: source.client.plantIndustryPackId,
    selections: source.products.map((product) => ({ product: product.product, templateId: product.templateId })),
  })
}

export function clientDemoPreparationBlueprint(source: ClientDemoPreparationArtifact) {
  return clientDemoPreparationBlueprintFromSource(source)
}

export function clientDemoPreparationConfirmationMatches(source: ClientDemoPreparationArtifact, confirmation: string) {
  return confirmation === source.review.confirmation
}

export async function restoreClientDemoPreparationArtifact(value: unknown): Promise<ClientDemoPreparationArtifact | null> {
  let source: ClientDemoPreparationArtifact
  try {
    const serialized = JSON.stringify(value)
    if (!serialized || byteLength(serialized) > CLIENT_DEMO_PREPARATION_MAX_BYTES) return null
    source = JSON.parse(serialized) as ClientDemoPreparationArtifact
  } catch { return null }
  if (!source || typeof source !== 'object' || Array.isArray(source)
    || !hasExactKeys(source, ['contract', 'preparedAt', 'kit', 'client', 'foundation', 'topology', 'products', 'integrations', 'checks', 'controls', 'bundleDigest', 'review'])
    || source.contract !== CLIENT_DEMO_PREPARATION_SCHEMA
    || !canonicalTimestamp(source.preparedAt)
    || !source.kit || typeof source.kit !== 'object' || Array.isArray(source.kit)
    || !hasExactKeys(source.kit, ['schema', 'digest', 'exportedAt'])
    || source.kit.schema !== CLIENT_DEMO_KIT_SCHEMA
    || !sha256Pattern.test(source.kit.digest)
    || !canonicalTimestamp(source.kit.exportedAt)
    || !source.client || typeof source.client !== 'object' || Array.isArray(source.client)
    || !hasExactKeys(source.client, ['workspace', 'owner', 'presetId', 'shopIndustryPackId', 'plantIndustryPackId'])
    || !canonicalClientOperatingFoundation(source.foundation, source.client.workspace, source.client.presetId)
    || !Array.isArray(source.products) || source.products.length < 1 || source.products.length > clientDemoProductOrder.length
    || !Array.isArray(source.integrations)
    || !source.checks || typeof source.checks !== 'object' || Array.isArray(source.checks)
    || !hasExactKeys(source.checks, ['ecommerceCatalogAligned', 'websiteHomePresent', 'plantLinesPresent', 'oneWorkspaceAndOwner'])
    || !source.controls || typeof source.controls !== 'object' || Array.isArray(source.controls)
    || !hasExactKeys(source.controls, ['localArtifactOnly', 'containsNormalizedClientData', 'containsSampleFixtures', 'safeToShareExternally', 'humanReviewRequired', 'externalWritesPerformed', 'hostedWritesPerformed', 'connectorCallsPerformed', 'modelCallsPerformed', 'activationStatus'])
    || !sha256Pattern.test(source.bundleDigest)
    || !source.review || typeof source.review !== 'object' || Array.isArray(source.review)
    || !hasExactKeys(source.review, ['status', 'confirmation', 'checklist'])) return null

  const selectedProducts = source.products.map((product) => product?.product)
  if (JSON.stringify(selectedProducts) !== JSON.stringify(clientDemoProductOrder.filter((product) => selectedProducts.includes(product)))) return null

  let blueprint: ClientDemoBlueprint
  try { blueprint = clientDemoPreparationBlueprintFromSource(source) } catch { return null }
  if (JSON.stringify(source.foundation) !== JSON.stringify(blueprint.foundation)) return null
  if (!canonicalClientOperationalTopology(source.topology, source.client.presetId, selectedProducts)
    || JSON.stringify(source.topology) !== JSON.stringify(blueprint.topology)) return null
  const packages: ClientImportStagingPackage[] = []
  for (let index = 0; index < source.products.length; index += 1) {
    const product = source.products[index]
    const productId = selectedProducts[index]
    const details = clientDemoProductDetails[productId]
    const blueprintProduct = blueprint.products[index]
    const stagingPackage = product?.stagingPackage
    if (!product || typeof product !== 'object' || Array.isArray(product)
      || !hasExactKeys(product, ['product', 'label', 'templateId', 'sourceMode', 'sourceName', 'rowCount', 'previewDigest', 'packageDigest', 'demoPath', 'setupPath', 'stagingPackage'])
      || !details || !blueprintProduct || blueprintProduct.product !== productId
      || product.label !== details.label || product.templateId !== blueprintProduct.templateId
      || !['client_csv', 'kit_sample_fixture'].includes(product.sourceMode)
      || product.demoPath !== details.demoPath || product.setupPath !== details.setupPath
      || !Number.isSafeInteger(product.rowCount) || product.rowCount < 1
      || !sha256Pattern.test(product.previewDigest) || !sha256Pattern.test(product.packageDigest)
      || !stagingPackage || typeof stagingPackage !== 'object' || Array.isArray(stagingPackage)) return null

    const object = clientImportObject(productId)
    const stagingKeys = ['contract', 'product', 'object', 'workflowTemplateId', 'workspace', 'owner', 'source', 'mapping', 'rows', 'controls']
    if (productId === 'production') stagingKeys.push('plantIndustryPackId')
    if (!hasExactKeys(stagingPackage, stagingKeys)
      || stagingPackage.contract !== CLIENT_STAGING_SCHEMA
      || stagingPackage.product !== productId || stagingPackage.object !== object.id
      || stagingPackage.workflowTemplateId !== product.templateId
      || stagingPackage.workspace !== source.client.workspace || stagingPackage.owner !== source.client.owner
      || (productId === 'production' && stagingPackage.plantIndustryPackId !== source.client.plantIndustryPackId)
      || (productId !== 'production' && stagingPackage.plantIndustryPackId !== undefined)
      || !stagingPackage.source || typeof stagingPackage.source !== 'object' || Array.isArray(stagingPackage.source)
      || !hasExactKeys(stagingPackage.source, ['name', 'digest', 'previewDigest'])
      || typeof stagingPackage.source.name !== 'string' || stagingPackage.source.name !== product.sourceName
      || !stagingPackage.source.name.trim() || stagingPackage.source.name !== stagingPackage.source.name.trim()
      || stagingPackage.source.name.length > 180 || hasControlCharacter(stagingPackage.source.name)
      || !sha256Pattern.test(stagingPackage.source.digest)
      || stagingPackage.source.previewDigest !== product.previewDigest
      || !stagingPackage.mapping || typeof stagingPackage.mapping !== 'object' || Array.isArray(stagingPackage.mapping)
      || !hasExactKeys(stagingPackage.mapping, object.fields.map((field) => field.id))
      || !Array.isArray(stagingPackage.rows) || stagingPackage.rows.length !== product.rowCount
      || product.rowCount > object.maximumRows
      || !stagingPackage.controls || typeof stagingPackage.controls !== 'object' || Array.isArray(stagingPackage.controls)
      || !hasExactKeys(stagingPackage.controls, ['rowCount', 'humanReviewRequired', 'externalWritesPerformed', 'activationStatus'])
      || stagingPackage.controls.rowCount !== product.rowCount
      || stagingPackage.controls.humanReviewRequired !== true
      || stagingPackage.controls.externalWritesPerformed !== false
      || stagingPackage.controls.activationStatus !== 'staged_not_applied') return null

    const mappedHeaders = object.fields.map((field) => stagingPackage.mapping[field.id])
    if (mappedHeaders.some((header, fieldIndex) => typeof header !== 'string'
      || (object.fields[fieldIndex].required && !header)
      || Boolean(header && (header !== header.trim() || hasControlCharacter(header))))
      || new Set(mappedHeaders.filter(Boolean)).size !== mappedHeaders.filter(Boolean).length) return null

    const seenKeys = new Set<string>()
    for (let rowIndex = 0; rowIndex < stagingPackage.rows.length; rowIndex += 1) {
      const row = stagingPackage.rows[rowIndex]
      if (!row || typeof row !== 'object' || Array.isArray(row)
        || !hasExactKeys(row, ['sourceRow', 'key', 'values'])
        || row.sourceRow !== rowIndex + 2
        || !row.values || typeof row.values !== 'object' || Array.isArray(row.values)
        || !hasExactKeys(row.values, object.fields.map((field) => field.id))
        || row.key !== row.values[object.keyField] || seenKeys.has(row.key)) return null
      seenKeys.add(row.key)
      if (object.fields.some((field) => typeof row.values[field.id] !== 'string' || fieldIssue(field, row.values[field.id]) !== null)) return null
    }
    const expectedPreviewDigest = await sha256(JSON.stringify({
      schema: CLIENT_IMPORT_SCHEMA,
      product: productId,
      object: object.id,
      workflowTemplateId: product.templateId,
      sourceDigest: stagingPackage.source.digest,
      mapping: stagingPackage.mapping,
    }))
    if (expectedPreviewDigest !== product.previewDigest
      || await sha256(JSON.stringify(stagingPackage)) !== product.packageDigest) return null
    packages.push(stagingPackage)
  }

  if (JSON.stringify(source.integrations) !== JSON.stringify(blueprint.integrations)) return null
  const expectedChecks = clientDemoPreparationChecks(packages)
  if (Object.values(expectedChecks).some((check) => check !== true)
    || JSON.stringify(source.checks) !== JSON.stringify(expectedChecks)) return null
  const customSourceCount = source.products.filter((product) => product.sourceMode === 'client_csv').length
  const expectedControls: ClientDemoPreparationArtifact['controls'] = {
    localArtifactOnly: true,
    containsNormalizedClientData: customSourceCount > 0,
    containsSampleFixtures: customSourceCount < source.products.length,
    safeToShareExternally: false,
    humanReviewRequired: true,
    externalWritesPerformed: false,
    hostedWritesPerformed: false,
    connectorCallsPerformed: false,
    modelCallsPerformed: false,
    activationStatus: 'not_applied',
  }
  if (JSON.stringify(source.controls) !== JSON.stringify(expectedControls)) return null
  const payload = {
    contract: source.contract,
    preparedAt: source.preparedAt,
    kit: source.kit,
    client: source.client,
    foundation: source.foundation,
    topology: source.topology,
    products: source.products,
    integrations: source.integrations,
    checks: source.checks,
    controls: source.controls,
  }
  if (await sha256(JSON.stringify(payload)) !== source.bundleDigest
    || source.review.status !== 'awaiting_founder_review'
    || source.review.confirmation !== `APPROVE CLIENT DEMO ${source.bundleDigest}`
    || JSON.stringify(source.review.checklist) !== JSON.stringify(clientDemoPreparationReviewChecklist)) return null
  return source
}

function canonicalProgress(value: unknown, product: ClientSolutionId): ClientDemoProductProgress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (!hasExactKeys(value, ['product', 'status', 'rows', 'readyRows', 'issueRows', 'updatedAt'])) return null
  const source = value as Partial<ClientDemoProductProgress>
  const statuses: readonly ClientDemoProductProgressStatus[] = ['not_started', 'needs_fix', 'data_ready', 'workspace_checked', 'applied']
  const integers = [source.rows, source.readyRows, source.issueRows]
  if (source.product !== product || !statuses.includes(source.status as ClientDemoProductProgressStatus)
    || integers.some((entry) => !Number.isSafeInteger(entry) || Number(entry) < 0 || Number(entry) > CLIENT_IMPORT_MAX_ROWS)
    || Number(source.readyRows) > Number(source.rows) || Number(source.issueRows) > Number(source.rows)) return null
  const updatedAt = source.updatedAt === null ? null : canonicalTimestamp(source.updatedAt)
  if (source.updatedAt !== null && !updatedAt) return null
  return {
    product,
    status: source.status as ClientDemoProductProgressStatus,
    rows: Number(source.rows),
    readyRows: Number(source.readyRows),
    issueRows: Number(source.issueRows),
    updatedAt,
  }
}

export function createClientDemoWorkspace(blueprintValue: unknown, updatedAtValue: unknown): ClientDemoWorkspace {
  const blueprint = canonicalClientDemoBlueprint(blueprintValue)
  const updatedAt = canonicalTimestamp(updatedAtValue)
  if (!blueprint || !updatedAt) throw new Error('The client demo workspace package is invalid.')
  return {
    schema: CLIENT_DEMO_WORKSPACE_SCHEMA,
    blueprint,
    products: blueprint.products.map(({ product }) => ({ product, status: 'not_started', rows: 0, readyRows: 0, issueRows: 0, updatedAt: null })),
    proofBaselineAt: updatedAt,
    updatedAt,
  }
}

export function restoreClientDemoWorkspace(value: unknown): ClientDemoWorkspace | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Partial<ClientDemoWorkspace>
  const sourceSchema = source.schema as string | undefined
  const currentSchema = sourceSchema === CLIENT_DEMO_WORKSPACE_SCHEMA
  const legacySchema = sourceSchema === LEGACY_V3_CLIENT_DEMO_WORKSPACE_SCHEMA
    || sourceSchema === LEGACY_V2_CLIENT_DEMO_WORKSPACE_SCHEMA
    || sourceSchema === LEGACY_CLIENT_DEMO_WORKSPACE_SCHEMA
  if ((!currentSchema && !legacySchema)
    || !hasExactKeys(value, currentSchema
      ? ['schema', 'blueprint', 'products', 'proofBaselineAt', 'updatedAt']
      : ['schema', 'blueprint', 'products', 'updatedAt'])) return null
  const blueprint = canonicalClientDemoBlueprint(source.blueprint)
  const updatedAt = canonicalTimestamp(source.updatedAt)
  const proofBaselineAt = currentSchema ? canonicalTimestamp(source.proofBaselineAt) : updatedAt
  if (!blueprint || !updatedAt || !proofBaselineAt || Date.parse(proofBaselineAt) > Date.parse(updatedAt) || !Array.isArray(source.products)
    || source.products.length !== blueprint.products.length) return null
  const products = blueprint.products.map(({ product }, index) => canonicalProgress(source.products?.[index], product))
  if (products.some((product) => !product)) return null
  return { schema: CLIENT_DEMO_WORKSPACE_SCHEMA, blueprint, products: products as ClientDemoProductProgress[], proofBaselineAt, updatedAt }
}

export function reconcileClientDemoWorkspace(
  blueprintValue: unknown,
  currentWorkspaceValue: unknown,
  updatedAtValue: unknown,
): ClientDemoWorkspace {
  const nextWorkspace = createClientDemoWorkspace(blueprintValue, updatedAtValue)
  const currentWorkspace = restoreClientDemoWorkspace(currentWorkspaceValue)
  return currentWorkspace && JSON.stringify(currentWorkspace.blueprint) === JSON.stringify(nextWorkspace.blueprint)
    ? currentWorkspace
    : nextWorkspace
}

export function updateClientDemoWorkspaceProgress(
  workspaceValue: unknown,
  progressValue: unknown,
  updatedAtValue: unknown,
): ClientDemoWorkspace {
  const workspace = restoreClientDemoWorkspace(workspaceValue)
  if (!workspace || !progressValue || typeof progressValue !== 'object' || Array.isArray(progressValue)) {
    throw new Error('The client demo workspace progress is invalid.')
  }
  const product = (progressValue as Partial<ClientDemoProductProgress>).product as ClientSolutionId
  const index = workspace.products.findIndex((candidate) => candidate.product === product)
  const progress = index >= 0 ? canonicalProgress(progressValue, product) : null
  const updatedAt = canonicalTimestamp(updatedAtValue)
  if (!progress || !updatedAt) throw new Error('The client demo workspace progress is invalid.')
  return {
    ...workspace,
    products: workspace.products.map((candidate, candidateIndex) => candidateIndex === index ? { ...progress, updatedAt } : candidate),
    updatedAt,
  }
}

function clientDemoEvidenceCount(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 100_000) {
    throw new Error(`Client demo evidence ${field} is invalid.`)
  }
  return Number(value)
}

function clientDemoEvidenceTimestamp(value: unknown, field: string) {
  if (value === null) return null
  const timestamp = canonicalTimestamp(value)
  if (!timestamp) throw new Error(`Client demo evidence ${field} is invalid.`)
  return timestamp
}

function canonicalClientDemoEvidence(value: unknown): ClientDemoOperationalEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !hasExactKeys(value, ['commerce', 'production', 'website', 'ecommerce'])) {
    throw new Error('The client demo operational evidence is invalid.')
  }
  const source = value as Partial<ClientDemoOperationalEvidence>
  if (!source.commerce || !source.production || !source.website || !source.ecommerce
    || !hasExactKeys(source.commerce, ['completedOrders', 'reconciledOrders', 'latestAccountableSaleAt'])
    || !hasExactKeys(source.production, ['releasedBatches', 'latestReleasedAt'])
    || !hasExactKeys(source.website, ['approvedReleases', 'latestApprovedAt'])
    || !hasExactKeys(source.ecommerce, ['savedStorefronts', 'reviewedRequests', 'latestSavedStorefrontAt', 'latestReviewedRequestAt'])) {
    throw new Error('The client demo operational evidence is invalid.')
  }
  return {
    commerce: {
      completedOrders: clientDemoEvidenceCount(source.commerce.completedOrders, 'completed orders'),
      reconciledOrders: clientDemoEvidenceCount(source.commerce.reconciledOrders, 'reconciled orders'),
      latestAccountableSaleAt: clientDemoEvidenceTimestamp(source.commerce.latestAccountableSaleAt, 'latest accountable sale'),
    },
    production: {
      releasedBatches: clientDemoEvidenceCount(source.production.releasedBatches, 'released batches'),
      latestReleasedAt: clientDemoEvidenceTimestamp(source.production.latestReleasedAt, 'latest released batch'),
    },
    website: {
      approvedReleases: clientDemoEvidenceCount(source.website.approvedReleases, 'approved releases'),
      latestApprovedAt: clientDemoEvidenceTimestamp(source.website.latestApprovedAt, 'latest approved release'),
    },
    ecommerce: {
      savedStorefronts: clientDemoEvidenceCount(source.ecommerce.savedStorefronts, 'saved storefronts'),
      reviewedRequests: clientDemoEvidenceCount(source.ecommerce.reviewedRequests, 'reviewed requests'),
      latestSavedStorefrontAt: clientDemoEvidenceTimestamp(source.ecommerce.latestSavedStorefrontAt, 'latest saved storefront'),
      latestReviewedRequestAt: clientDemoEvidenceTimestamp(source.ecommerce.latestReviewedRequestAt, 'latest reviewed request'),
    },
  }
}

function evidenceFollowsBaseline(value: string | null, baseline: string) {
  return value !== null && Date.parse(value) > Date.parse(baseline)
}

export function buildClientDemoRunbook(workspaceValue: unknown, evidenceValue: unknown): ClientDemoRunbook {
  const workspace = restoreClientDemoWorkspace(workspaceValue)
  if (!workspace) throw new Error('The client demo workspace is invalid.')
  const evidence = canonicalClientDemoEvidence(evidenceValue)
  const proofByProduct: Record<ClientSolutionId, { ready: boolean; observed: string }> = {
    commerce: {
      ready: evidence.commerce.completedOrders > 0
        && evidence.commerce.reconciledOrders > 0
        && evidenceFollowsBaseline(evidence.commerce.latestAccountableSaleAt, workspace.proofBaselineAt),
      observed: `${evidence.commerce.completedOrders} completed · ${evidence.commerce.reconciledOrders} payment reconciled`,
    },
    production: {
      ready: evidence.production.releasedBatches > 0
        && evidenceFollowsBaseline(evidence.production.latestReleasedAt, workspace.proofBaselineAt),
      observed: `${evidence.production.releasedBatches} batch${evidence.production.releasedBatches === 1 ? '' : 'es'} released to stock`,
    },
    website: {
      ready: evidence.website.approvedReleases > 0
        && evidenceFollowsBaseline(evidence.website.latestApprovedAt, workspace.proofBaselineAt),
      observed: `${evidence.website.approvedReleases} approved local release${evidence.website.approvedReleases === 1 ? '' : 's'}`,
    },
    ecommerce: {
      ready: evidence.ecommerce.savedStorefronts > 0
        && evidence.ecommerce.reviewedRequests > 0
        && evidenceFollowsBaseline(evidence.ecommerce.latestSavedStorefrontAt, workspace.proofBaselineAt)
        && evidenceFollowsBaseline(evidence.ecommerce.latestReviewedRequestAt, workspace.proofBaselineAt),
      observed: `${evidence.ecommerce.savedStorefronts} saved storefront · ${evidence.ecommerce.reviewedRequests} Shop-confirmed request${evidence.ecommerce.reviewedRequests === 1 ? '' : 's'}`,
    },
  }
  const products = workspace.blueprint.products.map((product) => {
    const progress = workspace.products.find((candidate) => candidate.product === product.product)
    if (!progress) throw new Error(`The ${product.label} demo progress is missing.`)
    const proof = proofByProduct[product.product]
    const status: ClientDemoRunbookStatus = proof.ready
      ? 'proven'
      : progress.status === 'needs_fix'
        ? 'needs_fix'
        : ['data_ready', 'workspace_checked', 'applied'].includes(progress.status)
          ? 'ready_to_run'
          : 'prepare_data'
    const contract = clientDemoRunbookContracts[product.product]
    return {
      product: product.product,
      label: product.label,
      scenario: contract.scenario,
      startPath: product.demoPath,
      steps: contract.steps,
      evidenceRequirement: contract.evidenceRequirement,
      evidenceObserved: proof.observed,
      status,
      importStatus: progress.status,
      actionLabel: status === 'proven' ? `Review ${product.label}` : status === 'ready_to_run' ? `Run ${product.label} scenario` : `Prepare ${product.label} data`,
      actionPath: status === 'prepare_data' || status === 'needs_fix' ? product.setupPath : product.demoPath,
    }
  })
  return {
    schema: CLIENT_DEMO_RUNBOOK_SCHEMA,
    workspace: workspace.blueprint.client.workspace,
    owner: workspace.blueprint.client.owner,
    provenCount: products.filter((product) => product.status === 'proven').length,
    nextProduct: products.find((product) => product.status !== 'proven')?.product ?? null,
    products,
  }
}

export function buildClientImportStagingPackage(preview: ClientImportPreview, context: {
  workflowTemplateId: string
  workspace: string
  owner: string
  plantIndustryPackId?: PlantIndustryPackId
}): ClientImportStagingPackage {
  if (preview.schema !== CLIENT_IMPORT_SCHEMA || !preview.readyForStaging || preview.rows.some((row) => row.status !== 'ready')) {
    throw new Error('Resolve every mapping and row issue before creating a staging package.')
  }
  const workflowTemplateId = boundedContext(context.workflowTemplateId, 'Workflow template')
  if (workflowTemplateId !== preview.workflowTemplateId) {
    throw new Error('The workflow template changed after this data preview. Preview the CSV again before staging.')
  }
  const workspace = boundedContext(context.workspace, 'Workspace name', preview.product === 'website' ? 60 : 120)
  const owner = boundedContext(context.owner, 'Responsible owner')
  const plantPackId = preview.product === 'production'
    ? plantIndustryPack(context.plantIndustryPackId ?? 'general-manufacturing').id
    : undefined
  return {
    contract: CLIENT_STAGING_SCHEMA,
    product: preview.product,
    object: preview.object,
    workflowTemplateId,
    ...(plantPackId ? { plantIndustryPackId: plantPackId } : {}),
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
