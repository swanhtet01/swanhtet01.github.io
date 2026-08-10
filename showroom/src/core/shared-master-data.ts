import {
  commercePurchaseOrders,
  commerceStorefrontRequests,
  type CommerceState,
} from './commerce-workspace.ts'
import { projectPlantOrder } from './plant-order-foundation.ts'
import { productionOrderPortfolioEntries } from './production-order-portfolio.ts'
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

export type SharedMasterDataDuplicateCandidate = {
  id: string
  kind: 'business_partner' | 'location'
  recordIds: string[]
  ownerProducts: SharedMasterDataProduct[]
  sourceAuthorities: SharedMasterDataAuthority[]
  reason: 'normalized_identity_collision'
  reviewRequired: true
}

export type SharedMasterDataRegistry = {
  contract: typeof SHARED_MASTER_DATA_CONTRACT
  allowedProducts: SharedMasterDataProduct[]
  records: SharedMasterDataRecord[]
  duplicateReview: {
    candidates: SharedMasterDataDuplicateCandidate[]
    automaticMergeAllowed: false
    mergePerformed: false
    externalWritesPerformed: false
  }
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
const duplicateCandidateIdPattern = /^DUP-[0-9]{3,6}$/
const authorityOrder: readonly SharedMasterDataAuthority[] = ['shop_inventory_command_chain', 'commerce_workspace', 'plant_workspace', 'website_workspace']
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
  const record: SharedMasterDataRecord = {
    id: recordId(ownerProduct, kind, sourceId),
    kind,
    ownerProduct,
    consumers: sharedMasterDataProducts.filter((product) => allowedProducts.includes(product) && productConsumers[`${ownerProduct}:${kind}`]?.includes(product)),
    sourceAuthority,
    sourceRevision,
  }
  records.push(record)
  return record
}

function compareRecord(left: SharedMasterDataRecord, right: SharedMasterDataRecord) {
  return sharedMasterDataProducts.indexOf(left.ownerProduct) - sharedMasterDataProducts.indexOf(right.ownerProduct)
    || sharedMasterDataKinds.indexOf(left.kind) - sharedMasterDataKinds.indexOf(right.kind)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
}

function normalizedIdentity(value: string) {
  return value.normalize('NFC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ')
}

function buildDuplicateReview(records: readonly SharedMasterDataRecord[], seeds: readonly { kind: SharedMasterDataDuplicateCandidate['kind']; identity: string; recordId: string }[]) {
  const groups = new Map<string, { kind: SharedMasterDataDuplicateCandidate['kind']; recordIds: string[] }>()
  for (const seed of seeds) {
    const key = `${seed.kind}\u0000${seed.identity}`
    const group = groups.get(key) ?? { kind: seed.kind, recordIds: [] }
    group.recordIds.push(seed.recordId)
    groups.set(key, group)
  }
  const byId = new Map(records.map((record) => [record.id, record]))
  const candidates = [...groups.values()]
    .filter((group) => new Set(group.recordIds).size > 1)
    .map((group) => ({ ...group, recordIds: [...new Set(group.recordIds)].sort() }))
    .sort((left, right) => {
      const leftKey = `${left.kind}\u0000${left.recordIds.join('\u0000')}`
      const rightKey = `${right.kind}\u0000${right.recordIds.join('\u0000')}`
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    })
    .map((group, index): SharedMasterDataDuplicateCandidate => {
      const groupRecords = group.recordIds.map((id) => byId.get(id)).filter((record): record is SharedMasterDataRecord => Boolean(record))
      return {
        id: `DUP-${String(index + 1).padStart(3, '0')}`,
        kind: group.kind,
        recordIds: group.recordIds,
        ownerProducts: sharedMasterDataProducts.filter((product) => groupRecords.some((record) => record.ownerProduct === product)),
        sourceAuthorities: authorityOrder.filter((authority) => groupRecords.some((record) => record.sourceAuthority === authority)),
        reason: 'normalized_identity_collision',
        reviewRequired: true,
      }
    })
  return { candidates, automaticMergeAllowed: false as const, mergePerformed: false as const, externalWritesPerformed: false as const }
}

export function validateSharedMasterDataRegistry(value: unknown): SharedMasterDataRegistry {
  if (!exactKeys(value, ['contract', 'allowedProducts', 'records', 'duplicateReview', 'summary', 'controls'])) throw new Error('Shared master-data registry is invalid.')
  const registry = value as SharedMasterDataRegistry
  if (registry.contract !== SHARED_MASTER_DATA_CONTRACT
    || !Array.isArray(registry.allowedProducts) || !registry.allowedProducts.length
    || JSON.stringify(registry.allowedProducts) !== JSON.stringify(canonicalProducts(registry.allowedProducts))
    || new Set(registry.allowedProducts).size !== registry.allowedProducts.length
    || !Array.isArray(registry.records) || registry.records.length > 20_000
    || !exactKeys(registry.duplicateReview, ['candidates', 'automaticMergeAllowed', 'mergePerformed', 'externalWritesPerformed'])
    || !Array.isArray(registry.duplicateReview.candidates) || registry.duplicateReview.candidates.length > 2_000
    || registry.duplicateReview.automaticMergeAllowed !== false || registry.duplicateReview.mergePerformed !== false || registry.duplicateReview.externalWritesPerformed !== false
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
  const reviewedRecordIds = new Set<string>()
  for (const [index, candidate] of registry.duplicateReview.candidates.entries()) {
    const candidateRecords = candidate.recordIds?.map((id) => registry.records.find((record) => record.id === id)) ?? []
    if (!exactKeys(candidate, ['id', 'kind', 'recordIds', 'ownerProducts', 'sourceAuthorities', 'reason', 'reviewRequired'])
      || candidate.id !== `DUP-${String(index + 1).padStart(3, '0')}` || !duplicateCandidateIdPattern.test(candidate.id)
      || !['business_partner', 'location'].includes(candidate.kind) || candidate.reason !== 'normalized_identity_collision' || candidate.reviewRequired !== true
      || !Array.isArray(candidate.recordIds) || candidate.recordIds.length < 2 || candidate.recordIds.length > 400
      || JSON.stringify(candidate.recordIds) !== JSON.stringify([...candidate.recordIds].sort()) || new Set(candidate.recordIds).size !== candidate.recordIds.length
      || candidateRecords.some((record) => !record) || candidateRecords.some((record) => candidate.kind === 'business_partner' ? !['customer', 'supplier'].includes(record?.kind ?? '') : record?.kind !== 'location')
      || candidate.recordIds.some((id) => reviewedRecordIds.has(id))
      || JSON.stringify(candidate.ownerProducts) !== JSON.stringify(sharedMasterDataProducts.filter((product) => candidateRecords.some((record) => record?.ownerProduct === product)))
      || JSON.stringify(candidate.sourceAuthorities) !== JSON.stringify(authorityOrder.filter((authority) => candidateRecords.some((record) => record?.sourceAuthority === authority)))) {
      throw new Error('Shared master-data duplicate review is invalid.')
    }
    candidate.recordIds.forEach((id) => reviewedRecordIds.add(id))
  }
  return structuredClone(registry)
}

export function buildSharedMasterDataRegistry(input: SharedMasterDataInput): SharedMasterDataRegistry {
  const allowedProducts = canonicalProducts(input.allowedProducts)
  if (!allowedProducts.length || allowedProducts.length !== input.allowedProducts.length || new Set(input.allowedProducts).size !== input.allowedProducts.length
    || JSON.stringify(allowedProducts) !== JSON.stringify(input.allowedProducts)) throw new Error('Shared master-data permissions are invalid.')
  const records: SharedMasterDataRecord[] = []
  const duplicateSeeds: Array<{ kind: SharedMasterDataDuplicateCandidate['kind']; identity: string; recordId: string }> = []
  if (allowedProducts.includes('commerce') && input.commerce) {
    // Sorted, because projectShopInventory requires canonical SKU order. The second instance
    // of this bug: catalog order is whatever the shop imported, so any real catalog threw
    // 'catalog_skus must use canonical identifier order' once an inventory foundation
    // existed. Found by auditing every caller after fixing the first one.
    const catalog = input.commerce.items.map((item) => item.sku).sort()
    const inventory = projectShopInventory(input.commerce.inventoryFoundation ?? createEmptyShopInventoryState(), catalog)
    inventory.clients.forEach((master) => duplicateSeeds.push({ kind: 'business_partner', identity: normalizedIdentity(master.name), recordId: addRecord(records, allowedProducts, 'commerce', 'customer', master.id, 'shop_inventory_command_chain', inventory.revision).id }))
    inventory.vendors.forEach((master) => duplicateSeeds.push({ kind: 'business_partner', identity: normalizedIdentity(master.name), recordId: addRecord(records, allowedProducts, 'commerce', 'supplier', master.id, 'shop_inventory_command_chain', inventory.revision).id }))
    inventory.locations.forEach((master) => duplicateSeeds.push({ kind: 'location', identity: normalizedIdentity(master.name), recordId: addRecord(records, allowedProducts, 'commerce', 'location', master.id, 'shop_inventory_command_chain', inventory.revision).id }))
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
    const units = [...new Set(productionOrderPortfolioEntries(input.production).flatMap((entry) => projectPlantOrder(entry.execution).plan?.materials.map((material) => material.unit) ?? []))]
    units.forEach((unit) => addRecord(records, allowedProducts, 'production', 'unit', unit, 'plant_workspace', input.production?.revision ?? null))
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
    duplicateReview: buildDuplicateReview(records, duplicateSeeds),
    summary: {
      totalRecords: records.length,
      byKind: Object.fromEntries(sharedMasterDataKinds.map((kind) => [kind, records.filter((record) => record.kind === kind).length])) as Record<SharedMasterDataKind, number>,
      byOwner: Object.fromEntries(allowedProducts.map((product) => [product, records.filter((record) => record.ownerProduct === product).length])),
    },
    controls: { canonicalIds: true, sourceBacked: true, permissionFiltered: true, recordValuesExcluded: true, readOnly: true, externalWritesPerformed: false },
  }
  return validateSharedMasterDataRegistry(registry)
}
