import {
  COMMERCE_KEY,
  validateCommerceState,
  type CommerceItem,
  type CommerceStorefrontMerchandising,
} from '../../core/commerce-workspace.ts'
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
  summary?: string
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
const LOCAL_ECOMMERCE_BUYING_STATE_KEY = 'supermega.ecommerce.buying_lifecycle.v1.ecommerce%3Alocal'
const workingSampleTemplateIds = ['social-storefront', 'pickup-preorder', 'wholesale-request'] as const
type EcommerceWorkingSampleTemplateId = typeof workingSampleTemplateIds[number]

type EcommerceWorkingSampleInput = {
  templateId: EcommerceWorkingSampleTemplateId
  businessName: string
  capturedAt: string
}

function workingSamplePlan(catalog: CommerceItem[], input: Pick<EcommerceWorkingSampleInput, 'templateId' | 'businessName'>) {
  if (!workingSampleTemplateIds.includes(input.templateId)) throw new Error('Choose a supported Ecommerce working sample.')
  const ranked = catalog.filter((item) => item.onHand > 0).sort((left, right) => (
    input.templateId === 'pickup-preorder'
      ? left.price - right.price || right.onHand - left.onHand
      : right.onHand - left.onHand || right.price - left.price
  ) || left.sku.localeCompare(right.sku, 'en'))
  if (!ranked.length) throw new Error('Add an in-stock Shop product before opening Ecommerce.')
  const selected = ranked.slice(0, input.templateId === 'wholesale-request' ? 6 : 4).sort((left, right) => left.sku.localeCompare(right.sku, 'en'))
  const summary = input.templateId === 'social-storefront'
    ? `Browse ${input.businessName}'s featured products and send one order request for Shop review.`
    : input.templateId === 'pickup-preorder'
      ? `Choose available items from ${input.businessName} for pickup or preorder confirmation.`
      : `Browse ${input.businessName}'s trade assortment and request quantities for manager review.`
  const rows = selected.map((item, index) => ({
    sku: item.sku,
    featured: index < (input.templateId === 'social-storefront' ? 2 : 1),
    collection: input.templateId === 'social-storefront'
      ? index < 2 ? 'Featured today' : 'More to browse'
      : input.templateId === 'pickup-preorder' ? 'Pickup menu' : 'Trade assortment',
    displayName: item.name,
    note: input.templateId === 'social-storefront'
      ? 'Demo social listing: confirm campaign copy and availability before launch.'
      : input.templateId === 'pickup-preorder'
        ? 'Demo pickup listing: confirm collection time and availability before launch.'
        : 'Demo trade listing: confirm quantities, pricing, and delivery terms before launch.',
  }))
  return { rows, summary }
}

async function matchesWorkingSample(current: NonNullable<ReturnType<typeof readStorefrontDraft>['draft']>, catalog: CommerceItem[]) {
  if (!('sourcePreviewDigest' in current)) return false
  for (const templateId of workingSampleTemplateIds) {
    const plan = workingSamplePlan(catalog, { templateId, businessName: current.storeName })
    const preview = buildStorefrontPreview(catalog, {
      storeName: current.storeName,
      summary: plan.summary,
      selectedSkus: plan.rows.map((row) => row.sku),
      merchandising: plan.rows,
    })
    if (await storefrontPreviewDigest(preview) === current.sourcePreviewDigest) return true
  }
  return false
}

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
  const summary = current && !options.replaceExistingDraft ? current.summary : input.summary ?? defaultStorefrontSummary
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

export async function activateLocalEcommerceWorkingSample(
  input: EcommerceWorkingSampleInput,
  options: LocalEcommerceMerchandisingImportOptions = {},
) {
  try {
    if (new Date(input.capturedAt).toISOString() !== input.capturedAt) throw new Error('Working sample time is invalid.')
    const storage = options.storage ?? globalThis.localStorage
    const catalog = options.catalog ? { items: options.catalog, error: '' } : readStorefrontCatalog(storage)
    if (catalog.error || !catalog.items.length) throw new Error(catalog.error || 'Create the Shop catalog before opening Ecommerce.')
    const currentResult = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, storage)
    if (currentResult.status === 'invalid' || currentResult.status === 'unavailable') throw new Error(currentResult.error)
    const current = currentResult.draft
    if (current && !await matchesWorkingSample(current, catalog.items)) throw new Error('Existing Ecommerce edits were preserved.')
    const commerceRaw = storage.getItem(COMMERCE_KEY)
    if (storage.getItem(LOCAL_ECOMMERCE_BUYING_STATE_KEY) !== null
      || commerceRaw !== null && (validateCommerceState(JSON.parse(commerceRaw)).storefrontRequests ?? []).length) {
      throw new Error('Existing Ecommerce order evidence was preserved.')
    }
    const plan = workingSamplePlan(catalog.items, input)
    const preview = buildStorefrontPreview(catalog.items, {
      storeName: input.businessName,
      summary: plan.summary,
      selectedSkus: plan.rows.map((row) => row.sku),
      merchandising: plan.rows,
    })
    const sourceDigest = await storefrontPreviewDigest(preview)
    const beforeRevision = current?.revision ?? 0
    const result = await activateLocalEcommerceMerchandising({
      storeName: input.businessName,
      summary: plan.summary,
      rows: plan.rows,
      sourceDigest,
    }, { ...options, storage, replaceExistingDraft: true, now: () => input.capturedAt })
    return { ok: true as const, status: result.revision === beforeRevision ? 'current' as const : 'installed' as const, ...result }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'The Ecommerce working sample was not changed.' }
  }
}
