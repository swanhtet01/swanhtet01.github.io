// Explicit .ts extension: verify_app_build.mjs imports this module directly under node, where an
// extensionless specifier does not resolve. Vite tolerates either, so the omission only shows in CI.
import { isShopServiceSku, type ShopBusinessTemplateId } from '../shop/business-templates.ts'
import { ecommerceTradeStorefront } from './ecommerce-trade-storefront.ts'
import {
  COMMERCE_KEY,
  commerceWorkingSampleSkus,
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
import {
  createEmptyEcommerceBuyingState,
  ecommerceBuyingStateStorageKey,
  recordEcommerceOrderRequestV2,
  validateEcommerceBuyingState,
} from './ecommerce-buying-lifecycle.ts'
import { buildGuidedSampleOrderRequest, isGuidedSampleBuyingState } from './guided-sample-order.ts'
// Same recovery Website uses (WebsiteProduct.tsx, via readLocalShopBusinessTemplateId) -- the
// trade is already recorded from Shop onboarding, so it does not need asking again here. No
// import cycle: product-onboarding-runtime.ts does not import anything under products/ecommerce.
import { readLocalShopBusinessTemplateId } from '../../core/product-onboarding-runtime.ts'

const LOCAL_ECOMMERCE_BUYING_SCOPE = 'ecommerce:local'

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

function workingSamplePlan(
  catalog: CommerceItem[],
  input: Pick<EcommerceWorkingSampleInput, 'templateId' | 'businessName'>,
  preferredSkus: readonly string[] = [],
  trade: ShopBusinessTemplateId | null = null,
) {
  if (!workingSampleTemplateIds.includes(input.templateId)) throw new Error('Choose a supported Ecommerce working sample.')
  // trade is a second, orthogonal axis on top of the workflow template id above -- see
  // ecommerce-trade-storefront.ts's file header. null (no trade, or a trade with no copy written
  // yet) MUST reproduce today's exact generic wording below, byte for byte: an owner who imported
  // their own CSV, where the trade cannot be determined, gets unchanged behavior.
  const tradeCopy = ecommerceTradeStorefront(trade)
  // The client's own working-sample products come before the generic Shop seed items, so a
  // storefront shows that business rather than demo household goods left over from Shop's seed.
  // A trade's own hero SKUs (e.g. bread and cakes over a bakery's bottled water) rank ABOVE that,
  // as a second tier rather than folded into the same set: a business-template Shop catalog is
  // ENTIRELY working-sample SKUs, so preferredSkus alone would already contain everything and
  // stop discriminating at all -- exactly the "bottled water" bug this exists to fix. Ties within
  // a tier (including no trade, where the top tier is always empty) fall through unchanged to the
  // onHand/price ranking below, so a null trade reproduces the old single-tier behavior exactly.
  const tradePreferred = new Set(tradeCopy?.preferredSkus ?? [])
  const clientPreferred = new Set(preferredSkus)
  const preferenceRank = (sku: string) => tradePreferred.has(sku) ? 2 : clientPreferred.has(sku) ? 1 : 0
  // Bookable services carry onHand 999 to mean "always available", not deep stock, so every
  // onHand-based sort put them first: a tea shop's storefront led with "Catering consultation"
  // ahead of the tea. Demote them behind real goods rather than excluding them, because a spa has
  // nothing BUT services and must still get a storefront.
  const ranked = catalog.filter((item) => item.onHand > 0).sort((left, right) => (
    preferenceRank(right.sku) - preferenceRank(left.sku)
  ) || (
    Number(isShopServiceSku(left.sku)) - Number(isShopServiceSku(right.sku))
  ) || (
    input.templateId === 'pickup-preorder'
      ? left.price - right.price || right.onHand - left.onHand
      : right.onHand - left.onHand || right.price - left.price
  ) || left.sku.localeCompare(right.sku, 'en'))
  if (!ranked.length) throw new Error('Add an in-stock Shop product before opening Ecommerce.')
  const selected = ranked.slice(0, input.templateId === 'wholesale-request' ? 6 : 4).sort((left, right) => left.sku.localeCompare(right.sku, 'en'))
  const summary = tradeCopy
    ? tradeCopy.summary(input.businessName)
    : input.templateId === 'social-storefront'
      ? `Browse ${input.businessName}'s featured products and send one order request for Shop review.`
      : input.templateId === 'pickup-preorder'
        ? `Choose available items from ${input.businessName} for pickup or preorder confirmation.`
        : `Browse ${input.businessName}'s trade assortment and request quantities for manager review.`
  const rows = selected.map((item, index) => {
    const featured = index < (input.templateId === 'social-storefront' ? 2 : 1)
    return {
      sku: item.sku,
      featured,
      collection: tradeCopy
        ? featured ? tradeCopy.collections.featured : tradeCopy.collections.rest
        : input.templateId === 'social-storefront'
          ? index < 2 ? 'Featured today' : 'More to browse'
          : input.templateId === 'pickup-preorder' ? 'Pickup menu' : 'Trade assortment',
      displayName: item.name,
      note: tradeCopy
        ? tradeCopy.note
        : input.templateId === 'social-storefront'
          ? 'Demo social listing: confirm campaign copy and availability before launch.'
          : input.templateId === 'pickup-preorder'
            ? 'Demo pickup listing: confirm collection time and availability before launch.'
            : 'Demo trade listing: confirm quantities, pricing, and delivery terms before launch.',
    }
  })
  return { rows, summary }
}

async function matchesWorkingSample(
  current: NonNullable<ReturnType<typeof readStorefrontDraft>['draft']>,
  catalog: CommerceItem[],
  preferredSkus: readonly string[] = [],
  trade: ShopBusinessTemplateId | null = null,
) {
  if (!('sourcePreviewDigest' in current)) return false
  // Try the resolved trade first, then null (no trade / generic). A device whose Shop trade only
  // became determinable AFTER a storefront was already installed under the generic copy must
  // still recognize its own working sample under the trade it now resolves to -- and a draft
  // installed with a trade must still be recognized once trade support for it is removed or the
  // trade stops resolving. Skipping the duplicate null pass when trade is already null keeps this
  // a strict superset of the old one-axis loop, not a behavior change for the no-trade case.
  const candidateTrades = trade ? ([trade, null] as const) : ([null] as const)
  for (const candidateTrade of candidateTrades) {
    for (const templateId of workingSampleTemplateIds) {
      const plan = workingSamplePlan(catalog, { templateId, businessName: current.storeName }, preferredSkus, candidateTrade)
      const preview = buildStorefrontPreview(catalog, {
        storeName: current.storeName,
        summary: plan.summary,
        selectedSkus: plan.rows.map((row) => row.sku),
        merchandising: plan.rows,
      })
      if (await storefrontPreviewDigest(preview) === current.sourcePreviewDigest) return true
    }
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
    const commerceRaw = storage.getItem(COMMERCE_KEY)
    const workingSampleSkus = commerceRaw === null
      ? []
      : commerceWorkingSampleSkus(validateCommerceState(JSON.parse(commerceRaw)))
    // Read through the SAME storage the rest of this function uses (not window.localStorage,
    // which readLocalShopBusinessTemplateId would otherwise default to) so a caller-supplied fake
    // store -- every runtime test in this file's history uses one -- is what gets consulted, and
    // so this resolves consistently with the commerceRaw read just above. null (no Shop yet, a
    // hand-imported catalog, or a trade with no Ecommerce copy) always falls through unchanged.
    //
    // Guarded on commerceRaw !== null: readLocalShopBusinessTemplateId reads through
    // loadCommerceWorkspace, which -- on a storage with no Shop data yet -- SEEDS one as a side
    // effect of the "read" (persistInitialState's 'seed' path). Ecommerce provisioning must stay
    // read-only with respect to Shop when Shop has never been set up; commerceRaw === null is
    // exactly that case, and the trade it would resolve to is null either way (a freshly seeded
    // generic commerce state carries no working-sample template id), so skipping the call changes
    // no outcome and avoids fabricating a Shop workspace an Ecommerce-only device never asked for.
    const trade = commerceRaw === null ? null : readLocalShopBusinessTemplateId(storage)
    if (current && !await matchesWorkingSample(current, catalog.items, workingSampleSkus, trade)) {
      throw new Error('Existing Ecommerce edits were preserved.')
    }
    const buyingRaw = storage.getItem(LOCAL_ECOMMERCE_BUYING_STATE_KEY)
    // A previous guided sample may be replaced; any real customer evidence is preserved.
    const buyingStateIsReplaceable = buyingRaw === null || await (async () => {
      try {
        const parsed = await validateEcommerceBuyingState(JSON.parse(buyingRaw), LOCAL_ECOMMERCE_BUYING_SCOPE)
        return isGuidedSampleBuyingState(parsed)
      } catch {
        return false
      }
    })()
    if (!buyingStateIsReplaceable
      || commerceRaw !== null && (validateCommerceState(JSON.parse(commerceRaw)).storefrontRequests ?? []).length) {
      throw new Error('Existing Ecommerce order evidence was preserved.')
    }
    if (buyingRaw !== null) storage.removeItem(LOCAL_ECOMMERCE_BUYING_STATE_KEY)
    const plan = workingSamplePlan(catalog.items, input, workingSampleSkus, trade)
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
    // Seed one pending customer request so the demo opens mid-funnel. It stops at
    // pending_shop_review: confirming it in Shop is the live demo moment and is
    // what earns the Ecommerce proof, so a sample must never perform it.
    const guidedRequest = await buildGuidedSampleOrderRequest({
      scope: LOCAL_ECOMMERCE_BUYING_SCOPE,
      preview,
      sourcePreviewDigest: sourceDigest,
      capturedAt: input.capturedAt,
      storefrontRevision: result.revision,
      storefrontActionId: 'demo-working-sample',
      trade,
    })
    if (guidedRequest) {
      try {
        const empty = createEmptyEcommerceBuyingState(LOCAL_ECOMMERCE_BUYING_SCOPE)
        const seeded = await recordEcommerceOrderRequestV2(empty, guidedRequest, empty.headDigest)
        storage.setItem(ecommerceBuyingStateStorageKey(LOCAL_ECOMMERCE_BUYING_SCOPE), JSON.stringify(seeded))
      } catch {
        // The storefront stays installed even if the sample request cannot be seeded.
      }
    }
    return { ok: true as const, status: result.revision === beforeRevision ? 'current' as const : 'installed' as const, ...result }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'The Ecommerce working sample was not changed.' }
  }
}
