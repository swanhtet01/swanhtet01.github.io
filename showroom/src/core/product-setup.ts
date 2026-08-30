// The explicit JSON attribute and file extension let Node load this module
// directly, so the client setup registry can be exercised by a test rather
// than only pinned as source text.
import siteManifest from '../../../site-manifest.json' with { type: 'json' }
import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_ECOMMERCE_HANDOFF_KEY,
  WEBSITE_STORAGE_KEY,
} from '../products/product-storage-keys.ts'
import type { ClientSolutionId } from './client-onboarding'

export type SetupProductId = ClientSolutionId

export type WorkflowTemplate = {
  id: string
  name: string
  outcome: string
  workflow: string[]
  entryPoints: string[]
  metric: string
}

export type ProductContract = {
  id: SetupProductId
  slug: string
  name: string
  status: string
  headline: string
  templates: WorkflowTemplate[]
}

export type SetupState = {
  product: SetupProductId
  templateId: string
  workspace: string
  owner: string
  entryPoint: string
  currentRecord: string
  baseline: string
  targetOutcome: string
  authorityBoundary: string
  acceptanceEvidence: string
  startedAt?: string
  savedAt?: string
}

export const APPROVAL_KEY = 'supermega.approvals.v3'
export const SETUP_KEY = 'supermega.setup.v3'
export const PRODUCT_SETUP_REGISTRY_KEY = 'supermega.product_setups.v1'
export const SETUP_SYNC_EVENT = 'supermega:setup-updated'
export const ACTION_KEY = 'supermega.accountable.actions.v1'
export const STOREFRONT_DRAFT_RESET_PREFIX = 'supermega.ecommerce.storefront_draft.v2.'
export const LEGACY_STOREFRONT_DRAFT_RESET_PREFIX = 'supermega.ecommerce.storefront_draft.v1.'
export const LEGACY_STOREFRONT_DRAFT_RESET_KEY = 'supermega.ecommerce.storefront_draft.v1'
export const SHOP_ORDER_DRAFT_RESET_PREFIX = 'supermega.shop.order_draft.v1.'
export const SHOP_ORDER_DRAFT_RESET_EPOCH_KEY = 'supermega.shop.order_draft_reset.v1'
export const WEBSITE_RECOVERY_EXPORT_PREFIX = 'supermega.website.workspace.recovery.v1.'
export const LEGACY_APPROVAL_KEYS = ['supermega.approvals.v2']
export const LEGACY_SETUP_KEYS = ['supermega.setup.v2']

function requireProductContract(id: SetupProductId): ProductContract {
  const product = siteManifest.customerProducts.find((candidate) => candidate.runtimeId === id)
  if (!product) throw new Error(`Missing ${id} product contract.`)
  return {
    id,
    slug: product.id,
    name: product.name,
    status: product.status,
    headline: product.headline,
    templates: product.templates,
  }
}

export const productContracts: Record<SetupProductId, ProductContract> = {
  commerce: requireProductContract('commerce'),
  production: requireProductContract('production'),
  website: requireProductContract('website'),
  ecommerce: requireProductContract('ecommerce'),
}

export function productDisplayName(product: SetupProductId) {
  return productContracts[product].name
}

export function setupProductPreviewPath(product: SetupProductId) {
  if (product === 'commerce') return '/shop/'
  if (product === 'production') return '/plant/'
  if (product === 'website') return '/website/'
  return '/ecommerce/'
}

export function templatesFor(product: SetupProductId) {
  return productContracts[product].templates
}

export function templateFor(product: SetupProductId, name: string) {
  const templates = templatesFor(product)
  const fallback = templates[0]
  if (!fallback) throw new Error(`Missing ${product} workflow templates.`)
  return templates.find((template) => template.id === name || template.name === name) ?? fallback
}

export type SetupTemplateDoorSelection = {
  activeTemplate: WorkflowTemplate
  requestedTemplate: WorkflowTemplate | null
  choiceRequired: boolean
}

// A public template door is a request, never permission to replace saved setup state. New
// product setup starts on the requested canonical id; a returning product stays on its saved
// template until the owner explicitly resolves the mismatch in ProductOnboardingPage.
export function resolveSetupTemplateDoor(
  product: SetupProductId,
  setup: SetupState,
  requestedTemplateId: string | null | undefined,
): SetupTemplateDoorSelection {
  const templates = templatesFor(product)
  const requestedTemplate = templates.find((template) => template.id === requestedTemplateId) ?? null
  const savedTemplate = setup.product === product ? templateFor(product, setup.templateId) : null
  return {
    activeTemplate: savedTemplate ?? requestedTemplate ?? templateFor(product, ''),
    requestedTemplate,
    choiceRequired: Boolean(savedTemplate && requestedTemplate && savedTemplate.id !== requestedTemplate.id),
  }
}

export type SetupVariantDoorSelection<T extends string> = {
  activeId: T
  requestedId: T | null
  choiceRequired: boolean
}

// Some public doors share one workflow template but carry a second validated setup
// dimension (Plant's industry pack is the first example). That dimension must make
// the same saved-versus-requested distinction as the workflow template: a URL may
// propose a value, but it cannot silently replace the value attached to a returning
// setup. Callers validate the ids against their source-owned registry before use.
export function resolveSetupVariantDoor<T extends string>(
  savedId: T,
  requestedId: T | null | undefined,
  hasSavedSetup: boolean,
): SetupVariantDoorSelection<T> {
  const requested = requestedId ?? null
  return {
    activeId: hasSavedSetup ? savedId : requested ?? savedId,
    requestedId: requested,
    choiceRequired: Boolean(hasSavedSetup && requested && requested !== savedId),
  }
}

// A public Shop trade is not evidence that an existing managed catalog has that
// shape. A ready company workspace therefore needs an explicit review boundary;
// unprovisioned workspaces keep using their existing reviewed creation form.
export function managedTemplateDoorRequiresReview(
  hasManagedIdentity: boolean,
  workspaceMode: string,
  requestedTemplateId: string | null | undefined,
) {
  return hasManagedIdentity && workspaceMode === 'managed-ready' && Boolean(requestedTemplateId)
}

export function seedSetupForProduct(product: SetupProductId, templateId = ''): SetupState {
  const template = templateFor(product, templateId)
  return {
    product,
    templateId: template.id,
    workspace: '',
    owner: '',
    entryPoint: template.entryPoints[0] ?? '',
    currentRecord: '',
    baseline: '',
    targetOutcome: '',
    authorityBoundary: '',
    acceptanceEvidence: '',
  }
}

export const seedSetup: SetupState = seedSetupForProduct('commerce')

const pilotRequiredFields = ['workspace', 'owner', 'entryPoint', 'currentRecord', 'baseline', 'targetOutcome', 'authorityBoundary', 'acceptanceEvidence'] as const
const setupProductIds: SetupProductId[] = ['commerce', 'production', 'website', 'ecommerce']
const PRODUCT_SETUP_REGISTRY_MAX_BYTES = 64 * 1024
type ProductSetupStorage = Pick<Storage, 'getItem' | 'setItem'>
type ProductSetupRegistry = Partial<Record<SetupProductId, SetupState>>

export function normalizeSetup(value: SetupState) {
  const source = (value && typeof value === 'object' ? value : seedSetup) as Omit<Partial<SetupState>, 'product'> & { product?: string; template?: string }
  const product: SetupProductId = source.product === 'production' || source.product === 'plant'
    ? 'production'
    : source.product === 'website'
      ? 'website'
      : source.product === 'ecommerce'
        ? 'ecommerce'
        : 'commerce'
  const template = templateFor(product, String(source.templateId || source.template || ''))
  const sourceEntryPoint = String(source.entryPoint || '')
  const normalized: SetupState = {
    product,
    templateId: template.id,
    workspace: typeof source.workspace === 'string' ? source.workspace : '',
    owner: typeof source.owner === 'string' ? source.owner : '',
    entryPoint: template.entryPoints.includes(sourceEntryPoint) ? sourceEntryPoint : template.entryPoints[0] ?? '',
    currentRecord: typeof source.currentRecord === 'string' ? source.currentRecord : '',
    baseline: typeof source.baseline === 'string' ? source.baseline : '',
    targetOutcome: typeof source.targetOutcome === 'string' ? source.targetOutcome : '',
    authorityBoundary: typeof source.authorityBoundary === 'string' ? source.authorityBoundary : '',
    acceptanceEvidence: typeof source.acceptanceEvidence === 'string' ? source.acceptanceEvidence : '',
    ...(typeof source.startedAt === 'string' && source.startedAt ? { startedAt: source.startedAt } : {}),
    ...(typeof source.savedAt === 'string' && source.savedAt ? { savedAt: source.savedAt } : {}),
  }
  return JSON.stringify(normalized) === JSON.stringify(value) ? value : normalized
}

function readProductSetupRegistry(storage: Pick<ProductSetupStorage, 'getItem'>): ProductSetupRegistry {
  try {
    const raw = storage.getItem(PRODUCT_SETUP_REGISTRY_KEY)
    if (!raw || raw.length > PRODUCT_SETUP_REGISTRY_MAX_BYTES) return {}
    const source = JSON.parse(raw) as unknown
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
    const registry: ProductSetupRegistry = {}
    for (const product of setupProductIds) {
      const candidate = (source as Record<string, unknown>)[product]
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
      const normalized = normalizeSetup(candidate as SetupState)
      if (normalized.product === product) registry[product] = normalized
    }
    return registry
  } catch {
    return {}
  }
}

export function readProductSetup(storage: Pick<ProductSetupStorage, 'getItem'>, product: SetupProductId) {
  return readProductSetupRegistry(storage)[product] ?? null
}

export type StartedProductOwner = { product: SetupProductId; owner: string }

// A client who changes who is accountable in one product leaves the others
// naming someone else. Report the first such product so the difference can be
// shown; correcting it is the client's decision, not an automatic rewrite.
export function conflictingOwnerRecord(
  startedElsewhere: StartedProductOwner[],
  accountableOwner: string,
): StartedProductOwner | null {
  const owner = accountableOwner.trim()
  if (!owner) return null
  return startedElsewhere.find((entry) => entry.owner.trim() && entry.owner.trim() !== owner) ?? null
}

export function rememberProductSetup(storage: ProductSetupStorage, setup: SetupState) {
  try {
    const normalized = normalizeSetup(setup)
    const registry = readProductSetupRegistry(storage)
    registry[normalized.product] = normalized
    const encoded = JSON.stringify(registry)
    if (encoded.length > PRODUCT_SETUP_REGISTRY_MAX_BYTES) return false
    storage.setItem(PRODUCT_SETUP_REGISTRY_KEY, encoded)
    return true
  } catch {
    return false
  }
}

export function setupProductFromQuery(value: string | null): SetupProductId | null {
  if (!value) return null
  return Object.values(productContracts).find((product) => product.slug === value || product.id === value)?.id ?? null
}

export function clientSetupPath(product: SetupProductId) {
  return `/settings/?product=${encodeURIComponent(productContracts[product].slug)}`
}

export function managedTrialRequestUrl(product: SetupProductId, templateId: string) {
  const query = new URLSearchParams({
    product: productContracts[product].slug,
    template: templateId,
    utm_source: 'app',
    utm_medium: 'guided_trial',
  })
  return `https://supermega.dev/contact/?${query.toString()}`
}

export function productFromPathname(pathname: string): SetupProductId | null {
  if (pathname.startsWith('/shop/')) return 'commerce'
  if (pathname.startsWith('/plant/')) return 'production'
  if (pathname.startsWith('/website/')) return 'website'
  if (pathname.startsWith('/ecommerce/')) return 'ecommerce'
  return null
}

export function pilotProgress(setup: SetupState) {
  const complete = pilotRequiredFields.filter((field) => setup[field].trim()).length
  return Math.round((complete / pilotRequiredFields.length) * 100)
}

export function pilotReady(setup: SetupState) {
  return pilotProgress(setup) === 100 && Boolean(setup.savedAt)
}

export function collectLocalProductRecords(storage: Pick<Storage, 'getItem' | 'key' | 'length'>) {
  const exactKeys = new Set([
    WEBSITE_STORAGE_KEY,
    LEGACY_WEBSITE_STORAGE_KEY,
    WEBSITE_ECOMMERCE_HANDOFF_KEY,
    LEGACY_STOREFRONT_DRAFT_RESET_KEY,
  ])
  const records: Record<string, string> = {}
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key
        || (!exactKeys.has(key)
          && !key.startsWith(STOREFRONT_DRAFT_RESET_PREFIX)
          && !key.startsWith(LEGACY_STOREFRONT_DRAFT_RESET_PREFIX)
          && !key.startsWith(SHOP_ORDER_DRAFT_RESET_PREFIX)
          && !key.startsWith(WEBSITE_RECOVERY_EXPORT_PREFIX))) continue
      const value = storage.getItem(key)
      if (value !== null) records[key] = value
    }
  } catch {
    return {}
  }
  return records
}
