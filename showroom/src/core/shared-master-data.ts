import {
  commercePurchaseOrders,
  commerceStorefrontRequests,
  type CommerceState,
} from './commerce-workspace.ts'
import { projectPlantOrder } from './plant-order-foundation.ts'
import { createEmptyShopInventoryState, projectShopInventory } from './shop-inventory-foundation.ts'
import type { ProductionState } from './production-workspace.ts'
import type { WebsiteWorkspace } from '../products/website/website-model.ts'

export const SHARED_MASTER_DATA_CONTRACT = 'supermega.shared_master_data_registry.v1' as const

export const sharedMasterDataProducts = ['commerce', 'production', 'website', 'ecommerce'] as const
export const sharedMasterDataKinds = ['customer', 'supplier', 'item', 'unit', 'currency', 'tax', 'account', 'location', 'lot', 'serial', 'document'] as const
export type SharedMasterDataProduct = typeof sharedMasterDataProducts[number]
export type SharedMasterDataKind = typeof sharedMasterDataKinds[number]
export type SharedMasterDataAuthority = 'shop_inventory_command_chain' | 'commerce_workspace' | 'plant_workspace' | 'website_workspace'

export type SharedMasterDataRecord = {
  id: string
  kind: SharedMasterDataKind
  ownerProduct: SharedMasterDataProduct
  consumers: SharedMasterDataProduct[]
  sourceAuthority: SharedMasterDataAuthority
  sourceRevision: number | null
}

export type SharedMasterDataRegistry = {
  contract: typeof SHARED_MASTER_DATA_CONTRACT
  allowedProducts: SharedMasterDataProduct[]
  records: SharedMasterDataRecord[]
  summary: {
    totalRecords: number
    byKind: Record<SharedMasterDataKind, number>
    byOwner: Partial<Record<SharedMasterDataProduct, number>>
  }
  controls: {
    canonicalIds: true
    sourceBacked: true
    permissionFiltered: true
    recordValuesExcluded: true
    readOnly: true
    externalWritesPerformed: false
  }
}

type SharedMasterDataInput = {
  allowedProducts: readonly SharedMasterDataProduct[]
  commerce?: CommerceState
  production?: ProductionState
  website?: WebsiteWorkspace
}

const productConsumers: Record<string, readonly SharedMasterDataProduct[]> = {
  'commerce:customer': ['ecommerce'],
  'commerce:supplier': ['production'],
  'commerce:item': ['production', 'website', 'ecommerce'],
  'commerce:unit': ['production'],
  'commerce:currency': ['production', 'website', 'ecommerce'],
  'commerce:tax': ['ecommerce'],
  'commerce:account': ['production'],
  'commerce:location': ['production', 'ecommerce'],
  'commerce:lot': ['production'],
  'commerce:serial': ['production'],
  'commerce:document': ['production'],
  'production:unit': ['commerce'],
  'production:document': ['commerce'],
  'website:document': ['ecommerce'],
  'ecommerce:document': ['commerce'],
}

const recordIdPattern = /^(commerce|production|website|ecommerce):(customer|supplier|item|unit|currency|tax|account|location|lot|serial|document):[A-Za-z0-9._~%+-]{1,240}$/
const authorityContract: Record<SharedMasterDataAuthority, { owners: readonly SharedMasterDataProduct[]; kinds: readonly SharedMasterDataKind[]; revision: 'required' | 'absent' }> = {
  shop_inventory_command_chain: { owners: ['commerce'], kinds: ['customer', 'supplier', 'location', 'lot', 'serial'], revision: 'required' },
  commerce_workspace: { owners: ['commerce', 'ecommerce'], kinds: ['item', 'currency', 'tax', 'account', 'document'], revision: 'absent' },
  plant_workspace: { owners: ['production'], kinds: ['unit', 'document'], revision: 'required' },
  website_workspace: { owners: ['website'], kinds: ['document'], revision: 'required' },
}

function exactKeys(value: unknown, keys: readonly string[]) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value as Record<string, unknown>).sort()) === JSON.stringify([...keys].sort()))
}

function canonicalProducts(value: readonly SharedMasterDataProduct[]) {
  return sharedMasterDataProducts.filter((product) => value.includes(product))
}

function recordId(owner: SharedMasterDataProduct, kind: SharedMasterDataKind, sourceId: unknown) {
  if (typeof sourceId !== 'string' || !sourceId || sourceId !== sourceId.trim() || sourceId.normalize('NFC') !== sourceId || sourceId.length > 180) {
    throw new Error('Shared master-data source identity is invalid.')
  }
  const id = `${owner}:${kind}:${encodeURIComponent(sourceId)}`
  if (!recordIdPattern.test(id)) throw new Error('Shared master-data record identity is invalid.')
  return id
}

function addRecord(
  records: SharedMasterDataRecord[],
  allowedProducts: readonly SharedMasterDataProduct[],
  ownerProduct: SharedMasterDataProduct,
  kind: SharedMasterDataKind,
  sourceId: string,
  sourceAuthority: SharedMasterDataAuthority,
  sourceRevision: number | null,
) {
  records.push({
    id: recordId(ownerProduct, kind, sourceId),
    kind,
    ownerProduct,
    consumers: sharedMasterDataProducts.filter((product) => allowedProducts.includes(product) && productConsumers[`${ownerProduct}:${kind}`]?.includes(product)),
    sourceAuthority,
    sourceRevision,
  })
}

function compareRecord(left: SharedMasterDataRecord, right: SharedMasterDataRecord) {
  return sharedMasterDataProducts.indexOf(left.ownerProduct) - sharedMasterDataProducts.indexOf(right.ownerProduct)
    || sharedMasterDataKinds.indexOf(left.kind) - sharedMasterDataKinds.indexOf(right.kind)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
}

export function validateSharedMasterDataRegistry(value: unknown): SharedMasterDataRegistry {
  if (!exactKeys(value, ['contract', 'allowedProducts', 'records', 'summary', 'controls'])) throw new Error('Shared master-data registry is invalid.')
  const registry = value as SharedMasterDataRegistry
  if (registry.contract !== SHARED_MASTER_DATA_CONTRACT
    || !Array.isArray(registry.allowedProducts) || !registry.allowedProducts.length
    || JSON.stringify(registry.allowedProducts) !== JSON.stringify(canonicalProducts(registry.allowedProducts))
    || new Set(registry.allowedProducts).size !== registry.allowedProducts.length
    || !Array.isArray(registry.records) || registry.records.length > 20_000
    || !exactKeys(registry.summary, ['totalRecords', 'byKind', 'byOwner'])
    || !exactKeys(registry.summary.byKind, sharedMasterDataKinds)
    || !exactKeys(registry.summary.byOwner, registry.allowedProducts)
    || !exactKeys(registry.controls, ['canonicalIds', 'sourceBacked', 'permissionFiltered', 'recordValuesExcluded', 'readOnly', 'externalWritesPerformed'])
    || registry.controls.canonicalIds !== true || registry.controls.sourceBacked !== true || registry.controls.permissionFiltered !== true
    || registry.controls.recordValuesExcluded !== true || registry.controls.readOnly !== true || registry.controls.externalWritesPerformed !== false) {
    throw new Error('Shared master-data registry contract is invalid.')
  }
  const ids = new Set<string>()
  for (const [index, record] of registry.records.entries()) {
    const authority = authorityContract[record.sourceAuthority]
    if (!exactKeys(record, ['id', 'kind', 'ownerProduct', 'consumers', 'sourceAuthority', 'sourceRevision'])
      || !recordIdPattern.test(record.id) || !sharedMasterDataKinds.includes(record.kind) || !registry.allowedProducts.includes(record.ownerProduct)
      || !['shop_inventory_command_chain', 'commerce_workspace', 'plant_workspace', 'website_workspace'].includes(record.sourceAuthority)
      || !authority || !authority.owners.includes(record.ownerProduct) || !authority.kinds.includes(record.kind)
      || authority.revision === 'required' && record.sourceRevision === null || authority.revision === 'absent' && record.sourceRevision !== null
      || record.sourceRevision !== null && (!Number.isSafeInteger(record.sourceRevision) || record.sourceRevision < 0)
      || !Array.isArray(record.consumers)
      || JSON.stringify(record.consumers) !== JSON.stringify(sharedMasterDataProducts.filter((product) => registry.allowedProducts.includes(product) && productConsumers[`${record.ownerProduct}:${record.kind}`]?.includes(product)))
      || ids.has(record.id) || index && compareRecord(registry.records[index - 1], record) >= 0) {
      throw new Error('Shared master-data record is invalid.')
    }
    ids.add(record.id)
  }
  const expectedByKind = Object.fromEntries(sharedMasterDataKinds.map((kind) => [kind, registry.records.filter((record) => record.kind === kind).length]))
  const expectedByOwner = Object.fromEntries(registry.allowedProducts.map((product) => [product, registry.records.filter((record) => record.ownerProduct === product).length]))
  if (registry.summary.totalRecords !== registry.records.length
    || JSON.stringify(registry.summary.byKind) !== JSON.stringify(expectedByKind)
    || JSON.stringify(registry.summary.byOwner) !== JSON.stringify(expectedByOwner)) {
    throw new Error('Shared master-data registry summary is invalid.')
  }
  return structuredClone(registry)
}

export function buildSharedMasterDataRegistry(input: SharedMasterDataInput): SharedMasterDataRegistry {
  const allowedProducts = canonicalProducts(input.allowedProducts)
  if (!allowedProducts.length || allowedProducts.length !== input.allowedProducts.length || new Set(input.allowedProducts).size !== input.allowedProducts.length
    || JSON.stringify(allowedProducts) !== JSON.stringify(input.allowedProducts)) throw new Error('Shared master-data permissions are invalid.')
  const records: SharedMasterDataRecord[] = []
  if (allowedProducts.includes('commerce') && input.commerce) {
    const catalog = input.commerce.items.map((item) => item.sku)
    const inventory = projectShopInventory(input.commerce.inventoryFoundation ?? createEmptyShopInventoryState(), catalog)
    inventory.clients.forEach((master) => addRecord(records, allowedProducts, 'commerce', 'customer', master.id, 'shop_inventory_command_chain', inventory.revision))
    inventory.vendors.forEach((master) => addRecord(records, allowedProducts, 'commerce', 'supplier', master.id, 'shop_inventory_command_chain', inventory.revision))
    inventory.locations.forEach((master) => addRecord(records, allowedProducts, 'commerce', 'location', master.id, 'shop_inventory_command_chain', inventory.revision))
    inventory.stockUnits.forEach((unit) => addRecord(records, allowedProducts, 'commerce', unit.tracking, unit.id, 'shop_inventory_command_chain', inventory.revision))
    input.commerce.items.forEach((item) => addRecord(records, allowedProducts, 'commerce', 'item', item.sku, 'commerce_workspace', null))
    addRecord(records, allowedProducts, 'commerce', 'currency', 'MMK', 'commerce_workspace', null)
    const taxCodes = [...new Set((input.commerce.taxConfigurations ?? []).map((configuration) => configuration.code))]
    taxCodes.forEach((code) => addRecord(records, allowedProducts, 'commerce', 'tax', code, 'commerce_workspace', null))
    const accountCodes = [...new Set((input.commerce.accountMappingConfigurations ?? []).flatMap((configuration) => configuration.mappings.map((mapping) => mapping.externalAccountCode)))]
    accountCodes.forEach((code) => addRecord(records, allowedProducts, 'commerce', 'account', code, 'commerce_workspace', null))
    input.commerce.orders.forEach((order) => addRecord(records, allowedProducts, 'commerce', 'document', `order-${order.id}`, 'commerce_workspace', null))
    commercePurchaseOrders(input.commerce).forEach((order) => addRecord(records, allowedProducts, 'commerce', 'document', `purchase-${order.id}`, 'commerce_workspace', null))
  }
  if (allowedProducts.includes('production') && input.production) {
    input.production.jobs.forEach((job) => addRecord(records, allowedProducts, 'production', 'document', `job-${job.id}`, 'plant_workspace', input.production?.revision ?? null))
    if (input.production.orderExecution) {
      const plan = projectPlantOrder(input.production.orderExecution).plan
      const units = [...new Set(plan?.materials.map((material) => material.unit) ?? [])]
      units.forEach((unit) => addRecord(records, allowedProducts, 'production', 'unit', unit, 'plant_workspace', input.production?.revision ?? null))
    }
  }
  if (allowedProducts.includes('website') && input.website) {
    input.website.pages.forEach((page) => addRecord(records, allowedProducts, 'website', 'document', `page-${page.id}`, 'website_workspace', input.website?.revision ?? null))
    input.website.localPublishes.forEach((publish) => addRecord(records, allowedProducts, 'website', 'document', `release-${publish.id}`, 'website_workspace', input.website?.revision ?? null))
  }
  if (allowedProducts.includes('ecommerce') && input.commerce) {
    if (input.commerce.storefrontConfiguration) addRecord(records, allowedProducts, 'ecommerce', 'document', `storefront-${input.commerce.storefrontConfiguration.revision}`, 'commerce_workspace', null)
    commerceStorefrontRequests(input.commerce).forEach((request) => addRecord(records, allowedProducts, 'ecommerce', 'document', `request-${request.id}`, 'commerce_workspace', null))
  }
  records.sort(compareRecord)
  const registry: SharedMasterDataRegistry = {
    contract: SHARED_MASTER_DATA_CONTRACT,
    allowedProducts: [...allowedProducts],
    records,
    summary: {
      totalRecords: records.length,
      byKind: Object.fromEntries(sharedMasterDataKinds.map((kind) => [kind, records.filter((record) => record.kind === kind).length])) as Record<SharedMasterDataKind, number>,
      byOwner: Object.fromEntries(allowedProducts.map((product) => [product, records.filter((record) => record.ownerProduct === product).length])),
    },
    controls: { canonicalIds: true, sourceBacked: true, permissionFiltered: true, recordValuesExcluded: true, readOnly: true, externalWritesPerformed: false },
  }
  return validateSharedMasterDataRegistry(registry)
}
