export const COMMERCE_ORDER_DRAFT_SCHEMA = 'supermega.shop.order_draft.v1' as const
export const COMMERCE_ORDER_DRAFT_KEY_PREFIX = 'supermega.shop.order_draft.v1.'
export const COMMERCE_ORDER_DRAFT_RESET_EPOCH_KEY = 'supermega.shop.order_draft_reset.v1'
const COMMERCE_ORDER_DRAFT_LOCK_PREFIX = 'supermega:shop:order-draft:'
const COMMERCE_ORDER_DRAFT_RESET_LOCK = 'supermega:shop:order-draft:reset'
const COMMERCE_ORDER_DRAFT_MAX_BYTES = 16_384

export const commerceOrderDraftChannels = ['Messenger', 'Viber', 'Phone', 'Website', 'Ecommerce', 'Walk-in'] as const
export const commerceOrderDraftPayments = ['KBZPay', 'WavePay', 'AYA Pay', 'MMQR', 'Cash on delivery', 'Cash', 'Card'] as const

export type CommerceOrderDraftChannel = typeof commerceOrderDraftChannels[number]
export type CommerceOrderDraftPayment = '' | typeof commerceOrderDraftPayments[number]
export type CommerceOrderDraftFulfilment = '' | 'pickup' | 'delivery'
export type CommerceOrderDraftPaymentTermsDays = 0 | 7 | 30

export type CommerceOrderDraftLine = {
  sku: string
  quantity: number
  unitPriceMmk: number
  availableAtSave: number
}

export type CommerceOrderDraftInput = {
  customer: string
  channel: CommerceOrderDraftChannel
  payment: CommerceOrderDraftPayment
  fulfilment: CommerceOrderDraftFulfilment
  fulfilmentReference: string
  promisedAt: string
  paymentTermsDays: CommerceOrderDraftPaymentTermsDays
  lines: CommerceOrderDraftLine[]
}

export type CommerceOrderDraft = CommerceOrderDraftInput & {
  schema: typeof COMMERCE_ORDER_DRAFT_SCHEMA
  scope: string
  revision: number
  savedAt: string
}

export type CommerceOrderDraftReadResult = {
  status: 'empty' | 'ready' | 'invalid' | 'unavailable'
  draft: CommerceOrderDraft | null
  error: string
  invalidFingerprint?: string
}

type CommerceOrderDraftCatalogItem = {
  sku: string
  price: number
  onHand: number
}

export type CommerceOrderDraftCatalogState = {
  current: boolean
  canRebind: boolean
  changedSkus: string[]
  missingSkus: string[]
  insufficientSkus: string[]
}

export type CommerceOrderDraftStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type CommerceOrderDraftEnumerableStorage = CommerceOrderDraftStorage & {
  readonly length: number
  key: (index: number) => string | null
}

export type CommerceOrderDraftLockManager = {
  request: <T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => Promise<T>,
  ) => Promise<T>
}

export type CommerceOrderDraftMutationOptions = {
  storage?: CommerceOrderDraftStorage
  locks?: CommerceOrderDraftLockManager
  now?: () => string
  expectedResetEpoch?: number
  expectedInvalidFingerprint?: string
}

export type CommerceOrderDraftResetOptions = {
  storage?: CommerceOrderDraftEnumerableStorage
  locks?: CommerceOrderDraftLockManager
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function canonicalScope(value: unknown) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160 || value.trim() !== value) {
    throw new Error('Order draft scope is invalid.')
  }
  return value
}

function canonicalText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string' || value.length > maxLength || value.trim() !== value) {
    throw new Error(`${label} is invalid.`)
  }
  return value
}

function canonicalTimestamp(value: unknown) {
  if (typeof value !== 'string'
    || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error('Order draft timestamp must use canonical UTC milliseconds.')
  }
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== value) {
    throw new Error('Order draft timestamp is invalid.')
  }
  return value
}

export function commerceOrderDraftUtf8Bytes(value: string) {
  if (typeof value !== 'string' || typeof TextEncoder !== 'function') {
    throw new Error('UTF-8 size verification is unavailable.')
  }
  return new TextEncoder().encode(value).byteLength
}

function unreadableDraftFingerprint(value: string) {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ (code + index), 0x85ebca6b)
  }
  return `${value.length}:${(first >>> 0).toString(16).padStart(8, '0')}:${(second >>> 0).toString(16).padStart(8, '0')}`
}

function canonicalLine(value: unknown): CommerceOrderDraftLine {
  if (!isRecord(value)
    || !hasExactKeys(value, ['sku', 'quantity', 'unitPriceMmk', 'availableAtSave'])) {
    throw new Error('Order draft line is invalid.')
  }
  const sku = canonicalText(value.sku, 'Order draft SKU', 80)
  const quantity = Number(value.quantity)
  const unitPriceMmk = Number(value.unitPriceMmk)
  const availableAtSave = Number(value.availableAtSave)
  if (!sku
    || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9_999
    || !Number.isSafeInteger(unitPriceMmk) || unitPriceMmk < 1
    || !Number.isSafeInteger(availableAtSave) || availableAtSave < 0) {
    throw new Error('Order draft line values are invalid.')
  }
  return { sku, quantity, unitPriceMmk, availableAtSave }
}

function canonicalInput(value: CommerceOrderDraftInput): CommerceOrderDraftInput {
  const customer = canonicalText(value.customer, 'Order draft customer', 80)
  const fulfilmentReference = canonicalText(value.fulfilmentReference, 'Order draft handoff reference', 160)
  const promisedAt = value.promisedAt === '' ? '' : canonicalTimestamp(value.promisedAt)
  const paymentTermsDays = Number(value.paymentTermsDays)
  if (!commerceOrderDraftChannels.includes(value.channel)) throw new Error('Order draft channel is invalid.')
  if (value.payment !== '' && !commerceOrderDraftPayments.includes(value.payment)) {
    throw new Error('Order draft payment is invalid.')
  }
  if (!['', 'pickup', 'delivery'].includes(value.fulfilment)) throw new Error('Order draft fulfilment is invalid.')
  if (![0, 7, 30].includes(paymentTermsDays)) throw new Error('Order draft payment terms are invalid.')
  if (!Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 20) {
    throw new Error('Order draft must contain between 1 and 20 item lines.')
  }
  const lines = value.lines.map(canonicalLine)
  if (new Set(lines.map((line) => line.sku)).size !== lines.length) {
    throw new Error('Order draft item lines must use unique SKUs.')
  }
  return {
    customer,
    channel: value.channel,
    payment: value.payment,
    fulfilment: value.fulfilment,
    fulfilmentReference,
    promisedAt,
    paymentTermsDays: paymentTermsDays as CommerceOrderDraftPaymentTermsDays,
    lines,
  }
}

function browserStorage(): CommerceOrderDraftStorage | undefined {
  try {
    return globalThis.localStorage as CommerceOrderDraftStorage | undefined
  } catch {
    return undefined
  }
}

function browserLocks(): CommerceOrderDraftLockManager | undefined {
  try {
    const locks = globalThis.navigator?.locks
    return typeof locks?.request === 'function'
      ? locks as unknown as CommerceOrderDraftLockManager
      : undefined
  } catch {
    return undefined
  }
}

export function commerceOrderDraftMatchesInput(left: CommerceOrderDraft, right: CommerceOrderDraftInput) {
  return left.customer === right.customer
    && left.channel === right.channel
    && left.payment === right.payment
    && left.fulfilment === right.fulfilment
    && left.fulfilmentReference === right.fulfilmentReference
    && left.promisedAt === right.promisedAt
    && left.paymentTermsDays === right.paymentTermsDays
    && left.lines.length === right.lines.length
    && left.lines.every((line, index) => {
      const candidate = right.lines[index]
      return line.sku === candidate.sku
        && line.quantity === candidate.quantity
        && line.unitPriceMmk === candidate.unitPriceMmk
        && line.availableAtSave === candidate.availableAtSave
    })
}

function canonicalResetEpoch(value: unknown) {
  if (value === null) return 0
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error('Order draft reset marker is invalid.')
  }
  const epoch = Number(value)
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error('Order draft reset marker is invalid.')
  return epoch
}

export function commerceOrderDraftResetEpoch(storage = browserStorage()) {
  if (!storage) throw new Error('Browser storage is unavailable. Order recovery cannot be coordinated safely.')
  return canonicalResetEpoch(storage.getItem(COMMERCE_ORDER_DRAFT_RESET_EPOCH_KEY))
}

export function commerceOrderDraftScope(workspaceId?: string) {
  return workspaceId ? `managed:${canonicalScope(workspaceId)}` : 'local'
}

export function commerceOrderDraftStorageKey(scope: string) {
  return `${COMMERCE_ORDER_DRAFT_KEY_PREFIX}${encodeURIComponent(canonicalScope(scope))}`
}

export function validateCommerceOrderDraft(value: unknown, expectedScope?: string): CommerceOrderDraft {
  const legacyFields = [
    'schema',
    'scope',
    'revision',
    'savedAt',
    'customer',
    'channel',
    'payment',
    'fulfilment',
    'fulfilmentReference',
    'lines',
  ]
  if (!isRecord(value)
    || (!hasExactKeys(value, legacyFields)
      && !hasExactKeys(value, [...legacyFields, 'promisedAt'])
      && !hasExactKeys(value, [...legacyFields, 'promisedAt', 'paymentTermsDays']))
    || value.schema !== COMMERCE_ORDER_DRAFT_SCHEMA
    || !Number.isSafeInteger(value.revision)
    || Number(value.revision) < 1) {
    throw new Error('Saved order draft is invalid.')
  }
  const scope = canonicalScope(value.scope)
  if (expectedScope !== undefined && scope !== canonicalScope(expectedScope)) {
    throw new Error('Saved order draft belongs to a different workspace.')
  }
  return {
    schema: COMMERCE_ORDER_DRAFT_SCHEMA,
    scope,
    revision: Number(value.revision),
    savedAt: canonicalTimestamp(value.savedAt),
    ...canonicalInput({
      customer: value.customer as string,
      channel: value.channel as CommerceOrderDraftChannel,
      payment: value.payment as CommerceOrderDraftPayment,
      fulfilment: value.fulfilment as CommerceOrderDraftFulfilment,
      fulfilmentReference: value.fulfilmentReference as string,
      promisedAt: typeof value.promisedAt === 'string' ? value.promisedAt : '',
      paymentTermsDays: typeof value.paymentTermsDays === 'number' ? value.paymentTermsDays as CommerceOrderDraftPaymentTermsDays : 0,
      lines: value.lines as CommerceOrderDraftLine[],
    }),
  }
}

export function readCommerceOrderDraft(
  scope: string,
  storage = browserStorage(),
): CommerceOrderDraftReadResult {
  const canonicalDraftScope = canonicalScope(scope)
  const storageKey = commerceOrderDraftStorageKey(canonicalDraftScope)
  if (!storage) {
    return {
      status: 'unavailable',
      draft: null,
      error: 'Browser storage is unavailable. Unfinished orders cannot be recovered after reload.',
    }
  }
  let raw: string | null
  try {
    raw = storage.getItem(storageKey)
  } catch {
    return {
      status: 'unavailable',
      draft: null,
      error: 'The saved order draft could not be read. Nothing was replaced.',
    }
  }
  if (raw === null) return { status: 'empty', draft: null, error: '' }
  let rawBytes: number
  try {
    rawBytes = commerceOrderDraftUtf8Bytes(raw)
  } catch {
    return {
      status: 'unavailable',
      draft: null,
      error: 'The saved order draft size could not be verified. It was left unchanged.',
    }
  }
  if (rawBytes > COMMERCE_ORDER_DRAFT_MAX_BYTES) {
    return {
      status: 'invalid',
      draft: null,
      error: 'The saved order draft is too large. It was left unchanged for export or explicit discard.',
      invalidFingerprint: unreadableDraftFingerprint(raw),
    }
  }
  try {
    return {
      status: 'ready',
      draft: validateCommerceOrderDraft(JSON.parse(raw), canonicalDraftScope),
      error: '',
    }
  } catch {
    return {
      status: 'invalid',
      draft: null,
      error: 'The saved order draft is malformed. It was left unchanged for export or explicit discard.',
      invalidFingerprint: unreadableDraftFingerprint(raw),
    }
  }
}

export async function saveCommerceOrderDraft(
  input: CommerceOrderDraftInput,
  expectedRevision: number,
  scope: string,
  options: CommerceOrderDraftMutationOptions = {},
): Promise<CommerceOrderDraft> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error('Expected order draft revision is invalid.')
  }
  if (options.expectedResetEpoch !== undefined
    && (!Number.isSafeInteger(options.expectedResetEpoch) || options.expectedResetEpoch < 0)) {
    throw new Error('Expected order draft reset marker is invalid.')
  }
  if (options.expectedInvalidFingerprint !== undefined) {
    throw new Error('Unreadable-draft fingerprints are not valid for save operations.')
  }
  const canonicalDraftScope = canonicalScope(scope)
  const candidate = canonicalInput(input)
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser storage is unavailable. The unfinished order was not saved.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The unfinished order was not saved.')
  const storageKey = commerceOrderDraftStorageKey(canonicalDraftScope)

  const expectedResetEpoch = options.expectedResetEpoch ?? commerceOrderDraftResetEpoch(storage)
  return locks.request(COMMERCE_ORDER_DRAFT_RESET_LOCK, { mode: 'exclusive' }, async () => {
    if (commerceOrderDraftResetEpoch(storage) !== expectedResetEpoch) {
      throw new Error('Local Shop recovery was reset while this order was open. Review the current workspace before saving.')
    }
    return locks.request(`${COMMERCE_ORDER_DRAFT_LOCK_PREFIX}${encodeURIComponent(canonicalDraftScope)}`, { mode: 'exclusive' }, async () => {
      if (commerceOrderDraftResetEpoch(storage) !== expectedResetEpoch) {
        throw new Error('Local Shop recovery was reset while this order was open. Review the current workspace before saving.')
      }
      const currentResult = readCommerceOrderDraft(canonicalDraftScope, storage)
      if (currentResult.status === 'invalid' || currentResult.status === 'unavailable') {
        throw new Error(currentResult.error || 'The current order draft cannot be updated safely.')
      }
      const current = currentResult.draft
      const currentRevision = current?.revision ?? 0
      if (currentRevision !== expectedRevision) {
        throw new Error('The saved order draft changed in another tab. Review it before saving again.')
      }
      if (current && commerceOrderDraftMatchesInput(current, candidate)) return current
      if (currentRevision >= Number.MAX_SAFE_INTEGER) throw new Error('Order draft revision cannot advance safely.')
      const savedAt = canonicalTimestamp((options.now ?? (() => new Date().toISOString()))())
      const next = validateCommerceOrderDraft({
        schema: COMMERCE_ORDER_DRAFT_SCHEMA,
        scope: canonicalDraftScope,
        revision: currentRevision + 1,
        savedAt,
        ...candidate,
      }, canonicalDraftScope)
      const nextRaw = JSON.stringify(next)
      if (commerceOrderDraftUtf8Bytes(nextRaw) > COMMERCE_ORDER_DRAFT_MAX_BYTES) {
        throw new Error('The unfinished order is too large to save safely.')
      }
      const beforeRaw = storage.getItem(storageKey)
      try {
        storage.setItem(storageKey, nextRaw)
        if (storage.getItem(storageKey) !== nextRaw) throw new Error('write_not_confirmed')
        return next
      } catch {
        let restored = false
        try {
          if (beforeRaw === null) storage.removeItem(storageKey)
          else storage.setItem(storageKey, beforeRaw)
          restored = storage.getItem(storageKey) === beforeRaw
        } catch {
          // The original false value reports that rollback could not be confirmed.
        }
        throw new Error(restored
          ? 'The unfinished order was not saved. The previous recovery value was restored.'
          : 'The unfinished order write failed and recovery could not be confirmed. Stop editing and export local evidence.')
      }
    })
  })
}

export async function discardCommerceOrderDraft(
  scope: string,
  expectedRevision?: number,
  options: CommerceOrderDraftMutationOptions = {},
): Promise<void> {
  if (expectedRevision !== undefined
    && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
    throw new Error('Expected order draft revision is invalid.')
  }
  if (expectedRevision !== undefined && options.expectedInvalidFingerprint !== undefined) {
    throw new Error('Choose either a revision or an unreadable-draft fingerprint before discarding.')
  }
  if (expectedRevision === undefined
    && (typeof options.expectedInvalidFingerprint !== 'string'
      || !/^[0-9]+:[0-9a-f]{8}:[0-9a-f]{8}$/.test(options.expectedInvalidFingerprint))) {
    throw new Error('The unreadable order draft fingerprint is missing or invalid.')
  }
  if (options.expectedResetEpoch !== undefined
    && (!Number.isSafeInteger(options.expectedResetEpoch) || options.expectedResetEpoch < 0)) {
    throw new Error('Expected order draft reset marker is invalid.')
  }
  const canonicalDraftScope = canonicalScope(scope)
  const storage = options.storage ?? browserStorage()
  const locks = options.locks ?? browserLocks()
  if (!storage) throw new Error('Browser storage is unavailable. The saved order draft was not discarded.')
  if (!locks) throw new Error('Safe browser locking is unavailable. The saved order draft was not discarded.')
  const storageKey = commerceOrderDraftStorageKey(canonicalDraftScope)
  const expectedResetEpoch = options.expectedResetEpoch ?? commerceOrderDraftResetEpoch(storage)
  await locks.request(COMMERCE_ORDER_DRAFT_RESET_LOCK, { mode: 'exclusive' }, async () => {
    if (commerceOrderDraftResetEpoch(storage) !== expectedResetEpoch) {
      throw new Error('Local Shop recovery was reset while this order was open. Review the current workspace before discarding.')
    }
    await locks.request(`${COMMERCE_ORDER_DRAFT_LOCK_PREFIX}${encodeURIComponent(canonicalDraftScope)}`, { mode: 'exclusive' }, async () => {
      if (commerceOrderDraftResetEpoch(storage) !== expectedResetEpoch) {
        throw new Error('Local Shop recovery was reset while this order was open. Review the current workspace before discarding.')
      }
      if (expectedRevision !== undefined) {
        const current = readCommerceOrderDraft(canonicalDraftScope, storage)
        if (current.status !== 'ready' || current.draft?.revision !== expectedRevision) {
          throw new Error('The saved order draft changed in another tab. Review it before discarding.')
        }
      } else {
        const currentRaw = storage.getItem(storageKey)
        const current = readCommerceOrderDraft(canonicalDraftScope, storage)
        if (currentRaw === null
          || current.status !== 'invalid'
          || unreadableDraftFingerprint(currentRaw) !== options.expectedInvalidFingerprint) {
          throw new Error('The unreadable order draft changed in another tab. Review it before discarding.')
        }
      }
      storage.removeItem(storageKey)
      if (storage.getItem(storageKey) !== null) throw new Error('The saved order draft could not be discarded.')
    })
  })
}

export async function resetCommerceOrderDraftRecovery(
  options: CommerceOrderDraftResetOptions = {},
): Promise<number> {
  const storage = options.storage ?? browserStorage() as CommerceOrderDraftEnumerableStorage | undefined
  const locks = options.locks ?? browserLocks()
  if (!storage || typeof storage.key !== 'function' || !Number.isSafeInteger(storage.length)) {
    throw new Error('Browser storage cannot enumerate unfinished Shop orders safely.')
  }
  if (!locks) throw new Error('Safe browser locking is unavailable. Unfinished Shop orders were not reset.')

  return locks.request(COMMERCE_ORDER_DRAFT_RESET_LOCK, { mode: 'exclusive' }, async () => {
    let currentEpoch = 0
    try {
      currentEpoch = commerceOrderDraftResetEpoch(storage)
    } catch {
      // Explicit reset may replace a malformed marker while preserving fail-closed saves.
    }
    if (currentEpoch >= Number.MAX_SAFE_INTEGER) throw new Error('Order draft reset marker cannot advance safely.')
    const nextEpoch = currentEpoch + 1
    const beforeEpoch = storage.getItem(COMMERCE_ORDER_DRAFT_RESET_EPOCH_KEY)
    const draftKeys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(COMMERCE_ORDER_DRAFT_KEY_PREFIX)))
    const beforeDrafts = new Map(draftKeys.map((key) => [key, storage.getItem(key)]))
    try {
      storage.setItem(COMMERCE_ORDER_DRAFT_RESET_EPOCH_KEY, String(nextEpoch))
      if (storage.getItem(COMMERCE_ORDER_DRAFT_RESET_EPOCH_KEY) !== String(nextEpoch)) {
        throw new Error('reset_epoch_not_confirmed')
      }
      for (const key of draftKeys) {
        storage.removeItem(key)
        if (storage.getItem(key) !== null) throw new Error('draft_reset_not_confirmed')
      }
      return nextEpoch
    } catch {
      let restored = false
      try {
        if (beforeEpoch === null) storage.removeItem(COMMERCE_ORDER_DRAFT_RESET_EPOCH_KEY)
        else storage.setItem(COMMERCE_ORDER_DRAFT_RESET_EPOCH_KEY, beforeEpoch)
        for (const [key, value] of beforeDrafts) {
          if (value === null) storage.removeItem(key)
          else storage.setItem(key, value)
        }
        restored = storage.getItem(COMMERCE_ORDER_DRAFT_RESET_EPOCH_KEY) === beforeEpoch
          && [...beforeDrafts].every(([key, value]) => storage.getItem(key) === value)
      } catch {
        // The original false value reports that rollback could not be confirmed.
      }
      throw new Error(restored
        ? 'Unfinished Shop orders were not reset. Their previous recovery values were restored.'
        : 'Shop order reset failed and recovery could not be confirmed. Stop editing and export local evidence.')
    }
  })
}

export function commerceOrderDraftCatalogState(
  draft: CommerceOrderDraft,
  catalog: CommerceOrderDraftCatalogItem[],
): CommerceOrderDraftCatalogState {
  const validated = validateCommerceOrderDraft(draft, draft.scope)
  if (!Array.isArray(catalog) || catalog.length > 10_000) throw new Error('Shop catalog is invalid.')
  const bySku = new Map<string, CommerceOrderDraftCatalogItem>()
  for (const candidate of catalog) {
    if (!isRecord(candidate)) throw new Error('Shop catalog item is invalid.')
    const sku = canonicalText(candidate.sku, 'Shop catalog SKU', 80)
    const price = Number(candidate.price)
    const onHand = Number(candidate.onHand)
    if (!sku
      || bySku.has(sku)
      || !Number.isSafeInteger(price) || price < 1
      || !Number.isSafeInteger(onHand) || onHand < 0) {
      throw new Error('Shop catalog item is invalid.')
    }
    bySku.set(sku, { sku, price, onHand })
  }
  const changedSkus: string[] = []
  const missingSkus: string[] = []
  const insufficientSkus: string[] = []
  for (const line of validated.lines) {
    const item = bySku.get(line.sku)
    if (!item) {
      missingSkus.push(line.sku)
      continue
    }
    if (item.onHand < line.quantity) insufficientSkus.push(line.sku)
    if (item.price !== line.unitPriceMmk || item.onHand !== line.availableAtSave) changedSkus.push(line.sku)
  }
  return {
    current: changedSkus.length === 0 && missingSkus.length === 0 && insufficientSkus.length === 0,
    canRebind: missingSkus.length === 0 && insufficientSkus.length === 0,
    changedSkus,
    missingSkus,
    insufficientSkus,
  }
}

export function rebindCommerceOrderDraft(
  draft: CommerceOrderDraft,
  catalog: CommerceOrderDraftCatalogItem[],
): CommerceOrderDraftInput {
  const state = commerceOrderDraftCatalogState(draft, catalog)
  if (!state.canRebind) throw new Error('Every recovered item must exist and have enough available stock before review.')
  const bySku = new Map(catalog.map((item) => [item.sku, item]))
  return {
    customer: draft.customer,
    channel: draft.channel,
    payment: draft.payment,
    fulfilment: draft.fulfilment,
    fulfilmentReference: draft.fulfilmentReference,
    promisedAt: draft.promisedAt,
    paymentTermsDays: draft.paymentTermsDays,
    lines: draft.lines.map((line) => {
      const item = bySku.get(line.sku)
      if (!item) throw new Error('Recovered Shop item is missing.')
      return {
        sku: line.sku,
        quantity: line.quantity,
        unitPriceMmk: item.price,
        availableAtSave: item.onHand,
      }
    }),
  }
}
