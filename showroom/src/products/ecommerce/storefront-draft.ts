export const STOREFRONT_DRAFT_SCHEMA = 'supermega.ecommerce.storefront_draft.v2' as const
export const LEGACY_STOREFRONT_DRAFT_SCHEMA = 'supermega.ecommerce.storefront_draft.v1' as const
export const STOREFRONT_DRAFT_KEY_PREFIX = 'supermega.ecommerce.storefront_draft.v2.'
export const LEGACY_STOREFRONT_DRAFT_KEY_PREFIX = 'supermega.ecommerce.storefront_draft.v1.'
export const LOCAL_STOREFRONT_DRAFT_SCOPE = 'local'
const STOREFRONT_DRAFT_LOCK_PREFIX = 'supermega:ecommerce:storefront-draft:'

export type StorefrontDraftInput = {
  storeName: string
  summary: string
  selectedSkus: string[]
  sourcePreviewDigest: string
}

export type StorefrontDraft = StorefrontDraftInput & {
  schema: typeof STOREFRONT_DRAFT_SCHEMA
  scope: string
  revision: number
  savedAt: string
}

export type LegacyStorefrontDraft = Omit<StorefrontDraft, 'schema' | 'sourcePreviewDigest'> & {
  schema: typeof LEGACY_STOREFRONT_DRAFT_SCHEMA
}

export type StorefrontDraftReadResult = {
  status: 'empty' | 'ready' | 'legacy' | 'invalid' | 'unavailable'
  draft: StorefrontDraft | LegacyStorefrontDraft | null
  error: string
}

export type StorefrontDraftStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type StorefrontDraftLockManager = {
  request: <T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => Promise<T> | T,
  ) => Promise<T>
}

type SaveStorefrontDraftOptions = {
  storage?: StorefrontDraftStorage
  locks?: StorefrontDraftLockManager
  now?: () => string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
}

function canonicalText(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || value !== value.trim() || !value || value.length > maximum) {
    throw new Error(`${field} must be visible canonical text of at most ${maximum} characters.`)
  }
  return value
}

function canonicalScope(value: unknown) {
  return canonicalText(value, 'Storefront scope', 180)
}

export function storefrontDraftStorageKey(scope: string) {
  return `${STOREFRONT_DRAFT_KEY_PREFIX}${encodeURIComponent(canonicalScope(scope))}`
}

export function legacyStorefrontDraftStorageKey(scope: string) {
  return `${LEGACY_STOREFRONT_DRAFT_KEY_PREFIX}${encodeURIComponent(canonicalScope(scope))}`
}

function canonicalTimestamp(value: unknown) {
  if (typeof value !== 'string'
    || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error('Saved storefront timestamp must use canonical UTC milliseconds.')
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error('Saved storefront timestamp must be a real canonical UTC instant.')
  }
  return value
}

function canonicalFields(value: Omit<StorefrontDraftInput, 'sourcePreviewDigest'>) {
  const storeName = canonicalText(value.storeName, 'Store name', 60)
  const summary = canonicalText(value.summary, 'Store summary', 180)
  if (!Array.isArray(value.selectedSkus) || value.selectedSkus.length < 1 || value.selectedSkus.length > 8) {
    throw new Error('Choose between 1 and 8 Shop items before saving.')
  }
  const selectedSkus = value.selectedSkus
    .map((sku, index) => canonicalText(sku, `Selected SKU ${index + 1}`, 80))
    .sort((left, right) => left.localeCompare(right))
  if (new Set(selectedSkus).size !== selectedSkus.length) {
    throw new Error('Selected Shop SKUs must be unique.')
  }
  return { storeName, summary, selectedSkus }
}

function canonicalPreviewDigest(value: unknown) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error('Saved storefront preview fingerprint must be a canonical SHA-256 digest.')
  }
  return value
}

function canonicalInput(value: StorefrontDraftInput): StorefrontDraftInput {
  return {
    ...canonicalFields(value),
    sourcePreviewDigest: canonicalPreviewDigest(value.sourcePreviewDigest),
  }
}

export function reconcileStorefrontSelection(savedSkus: string[], catalogSkus: string[]) {
  const saved = canonicalFields({
    storeName: 'Reconciliation',
    summary: 'Validate one saved storefront selection against the authoritative Shop catalog.',
    selectedSkus: savedSkus,
  }).selectedSkus
  if (!Array.isArray(catalogSkus) || catalogSkus.length > 100) {
    throw new Error('Authoritative Shop catalog SKUs are invalid.')
  }
  const catalog = catalogSkus.map((sku, index) => canonicalText(sku, `Catalog SKU ${index + 1}`, 80))
  if (new Set(catalog).size !== catalog.length) throw new Error('Authoritative Shop catalog SKUs must be unique.')
  const catalogSet = new Set(catalog)
  return {
    selectedSkus: saved.filter((sku) => catalogSet.has(sku)),
    missingSkus: saved.filter((sku) => !catalogSet.has(sku)),
  }
}

function browserStorage(): StorefrontDraftStorage | undefined {
  try {
    return globalThis.localStorage as StorefrontDraftStorage | undefined
  } catch {
    return undefined
  }
}

function browserLocks(): StorefrontDraftLockManager | undefined {
  try {
    const locks = globalThis.navigator?.locks
    return typeof locks?.request === 'function'
      ? locks as unknown as StorefrontDraftLockManager
      : undefined
  } catch {
    return undefined
  }
}

function sameDraftInput(left: StorefrontDraft, right: StorefrontDraftInput) {
  return left.storeName === right.storeName
    && left.summary === right.summary
    && left.sourcePreviewDigest === right.sourcePreviewDigest
    && left.selectedSkus.length === right.selectedSkus.length
    && left.selectedSkus.every((sku, index) => sku === right.selectedSkus[index])
}

export function validateStorefrontDraft(value: unknown, expectedScope?: string): StorefrontDraft {
  if (!isRecord(value)
    || !hasExactKeys(value, ['schema', 'scope', 'revision', 'savedAt', 'storeName', 'summary', 'selectedSkus', 'sourcePreviewDigest'])
    || value.schema !== STOREFRONT_DRAFT_SCHEMA
    || !Number.isSafeInteger(value.revision)
    || Number(value.revision) < 1) {
    throw new Error('Saved storefront setup is invalid.')
  }
  const input = canonicalInput({
    storeName: value.storeName as string,
    summary: value.summary as string,
    selectedSkus: value.selectedSkus as string[],
    sourcePreviewDigest: value.sourcePreviewDigest as string,
  })
  const scope = canonicalScope(value.scope)
  if (expectedScope !== undefined && scope !== canonicalScope(expectedScope)) {
    throw new Error('Saved storefront setup belongs to a different workspace scope.')
  }
  return {
    schema: STOREFRONT_DRAFT_SCHEMA,
    scope,
    revision: Number(value.revision),
    savedAt: canonicalTimestamp(value.savedAt),
    ...input,
  }
}

export function validateLegacyStorefrontDraft(value: unknown, expectedScope?: string): LegacyStorefrontDraft {
  if (!isRecord(value)
    || !hasExactKeys(value, ['schema', 'scope', 'revision', 'savedAt', 'storeName', 'summary', 'selectedSkus'])
    || value.schema !== LEGACY_STOREFRONT_DRAFT_SCHEMA
    || !Number.isSafeInteger(value.revision)
    || Number(value.revision) < 1) {
    throw new Error('Legacy saved storefront setup is invalid.')
  }
  const input = canonicalFields({
    storeName: value.storeName as string,
    summary: value.summary as string,
    selectedSkus: value.selectedSkus as string[],
  })
  const scope = canonicalScope(value.scope)
  if (expectedScope !== undefined && scope !== canonicalScope(expectedScope)) {
    throw new Error('Legacy saved storefront setup belongs to a different workspace scope.')
  }
  return {
    schema: LEGACY_STOREFRONT_DRAFT_SCHEMA,
    scope,
    revision: Number(value.revision),
    savedAt: canonicalTimestamp(value.savedAt),
    ...input,
  }
}

export function readStorefrontDraft(
  scope = LOCAL_STOREFRONT_DRAFT_SCOPE,
  storage = browserStorage(),
): StorefrontDraftReadResult {
  const canonicalDraftScope = canonicalScope(scope)
  const storageKey = storefrontDraftStorageKey(canonicalDraftScope)
  const legacyStorageKey = legacyStorefrontDraftStorageKey(canonicalDraftScope)
  if (!storage) {
    return {
      status: 'unavailable',
      draft: null,
      error: 'Browser storage is unavailable. The storefront remains preview-only.',
    }
  }
  let raw: string | null
  let legacyRaw: string | null = null
  try {
    raw = storage.getItem(storageKey)
    if (raw === null) legacyRaw = storage.getItem(legacyStorageKey)
  } catch {
    return {
      status: 'unavailable',
      draft: null,
      error: 'Saved storefront setup could not be read. Nothing was replaced.',
    }
  }
  if (raw === null && legacyRaw === null) return { status: 'empty', draft: null, error: '' }
  try {
    if (raw !== null) {
      return { status: 'ready', draft: validateStorefrontDraft(JSON.parse(raw), canonicalDraftScope), error: '' }
    }
    return {
      status: 'legacy',
      draft: validateLegacyStorefrontDraft(JSON.parse(legacyRaw as string), canonicalDraftScope),
      error: 'Saved storefront setup needs one fingerprint upgrade before it can receive requests.',
    }
  } catch {
    return {
      status: 'invalid',
      draft: null,
      error: 'Saved storefront setup is malformed. It was left unchanged.',
    }
  }
}

export async function saveStorefrontDraft(
  input: StorefrontDraftInput,
  expectedRevision: number,
  scope = LOCAL_STOREFRONT_DRAFT_SCOPE,
  options: SaveStorefrontDraftOptions = {},
) {
  const candidate = canonicalInput(input)
  const canonicalDraftScope = canonicalScope(scope)
  const storageKey = storefrontDraftStorageKey(canonicalDraftScope)
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error('Expected storefront revision is invalid.')
  }
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser storage is unavailable. Nothing was saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. Nothing was saved.')

  return locks.request(`${STOREFRONT_DRAFT_LOCK_PREFIX}${encodeURIComponent(canonicalDraftScope)}`, { mode: 'exclusive' }, async () => {
    const currentResult = readStorefrontDraft(canonicalDraftScope, storage)
    if (currentResult.status === 'invalid' || currentResult.status === 'unavailable') {
      throw new Error(currentResult.error)
    }
    const current = currentResult.draft
    const currentRevision = current?.revision ?? 0
    if (currentRevision !== expectedRevision) {
      throw new Error('Saved storefront setup changed in another session. Review the latest saved version before retrying.')
    }
    if (current?.schema === STOREFRONT_DRAFT_SCHEMA && sameDraftInput(current, candidate)) return current
    if (currentRevision >= Number.MAX_SAFE_INTEGER) throw new Error('Saved storefront revision cannot advance safely.')

    const next = validateStorefrontDraft({
      schema: STOREFRONT_DRAFT_SCHEMA,
      scope: canonicalDraftScope,
      revision: currentRevision + 1,
      savedAt: (options.now ?? (() => new Date().toISOString()))(),
      ...candidate,
    })
    const beforeRaw = storage.getItem(storageKey)
    const nextRaw = JSON.stringify(next)
    try {
      storage.setItem(storageKey, nextRaw)
      if (storage.getItem(storageKey) !== nextRaw) {
        throw new Error('Saved storefront write could not be confirmed.')
      }
    } catch {
      let restored = false
      try {
        if (beforeRaw === null) storage.removeItem(storageKey)
        else storage.setItem(storageKey, beforeRaw)
        restored = storage.getItem(storageKey) === beforeRaw
      } catch {
        // The caller receives a fail-closed result below.
      }
      throw new Error(restored
        ? 'Storefront setup was not saved. The previous saved value was restored.'
        : 'Storefront setup could not be confirmed or restored. Inspect local data before retrying.')
    }
    return next
  })
}
