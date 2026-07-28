import type { CommerceItem, CommerceStorefrontMerchandising } from '../../core/commerce-workspace.ts'
import {
  LOCAL_STOREFRONT_DRAFT_SCOPE,
  readStorefrontDraft,
  saveStorefrontDraft,
  type StorefrontDraftLockManager,
  type StorefrontDraftStorage,
} from './storefront-draft.ts'
import { buildStorefrontPreview, readStorefrontCatalog, storefrontPreviewDigest } from './storefront-model.ts'

export type LocalEcommerceMerchandisingImport = {
  created: number
  alreadyPresent: number
  revision: number
  sourceDigest: string
}

type LocalEcommerceMerchandisingImportInput = {
  storeName: string
  rows: CommerceStorefrontMerchandising[]
  sourceDigest: string
}

type LocalEcommerceMerchandisingImportOptions = {
  catalog?: CommerceItem[]
  storage?: StorefrontDraftStorage
  locks?: StorefrontDraftLockManager
  now?: () => string
  replaceExistingDraft?: boolean
}

const defaultStorefrontSummary = 'Browse this reviewed collection with clear local pricing and availability from Shop.'

export async function activateLocalEcommerceMerchandising(
  input: LocalEcommerceMerchandisingImportInput,
  options: LocalEcommerceMerchandisingImportOptions = {},
): Promise<LocalEcommerceMerchandisingImport> {
  if (!/^sha256:[0-9a-f]{64}$/.test(input.sourceDigest)) {
    throw new Error('The reviewed Ecommerce import fingerprint is invalid.')
  }
  if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 8) {
    throw new Error('Choose between 1 and 8 reviewed Ecommerce display rows.')
  }
  const catalog = options.catalog
    ? { source: 'provided' as const, items: options.catalog, error: '' }
    : readStorefrontCatalog()
  if (catalog.error || catalog.items.length === 0) {
    throw new Error(catalog.error || 'Create the Shop catalog before applying Ecommerce display details.')
  }
  const currentResult = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, options.storage)
  if (currentResult.status === 'invalid' || currentResult.status === 'unavailable') {
    throw new Error(currentResult.error)
  }
  const selectedSkus = input.rows.map((row) => row.sku).sort((left, right) => left.localeCompare(right, 'en'))
  const current = currentResult.draft
  if (current && (current.selectedSkus.length !== selectedSkus.length
    || current.selectedSkus.some((sku, index) => sku !== selectedSkus[index]))
    && !options.replaceExistingDraft) {
    throw new Error('These display rows do not match the saved Ecommerce product selection. Select the same Shop SKUs in Ecommerce, save, and retry.')
  }
  const storeName = current && !options.replaceExistingDraft ? current.storeName : input.storeName
  const summary = current && !options.replaceExistingDraft ? current.summary : defaultStorefrontSummary
  const preview = buildStorefrontPreview(catalog.items, {
    storeName,
    summary,
    selectedSkus,
    merchandising: input.rows,
  })
  const sourcePreviewDigest = await storefrontPreviewDigest(preview)
  const saved = await saveStorefrontDraft(
    { storeName, summary, selectedSkus, sourcePreviewDigest, merchandising: input.rows },
    current?.revision ?? 0,
    LOCAL_STOREFRONT_DRAFT_SCOPE,
    { storage: options.storage, locks: options.locks, now: options.now },
  )
  const unchanged = current?.schema === saved.schema && current.revision === saved.revision
  return {
    created: unchanged ? 0 : input.rows.length,
    alreadyPresent: unchanged ? input.rows.length : 0,
    revision: saved.revision,
    sourceDigest: input.sourceDigest,
  }
}
