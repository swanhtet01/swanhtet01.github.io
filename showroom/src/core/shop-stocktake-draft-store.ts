import type { StockCountDraft } from './CoreApp'

export type ShopStocktakeSnapshot = { current: StockCountDraft | null; lines: StockCountDraft[] }
export type ShopStocktakeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type ShopStocktakeRead = { status: 'missing' | 'invalid' | 'unavailable' }
  | { status: 'valid'; snapshot: ShopStocktakeSnapshot }
export type ShopStocktakeRecovery = { status: 'idle' | 'unavailable' }
  | { status: 'saved'; snapshot: ShopStocktakeSnapshot }

const version = 1

export function shopStocktakeSessionStorage(): ShopStocktakeStorage | null {
  try { return sessionStorage } catch { return null }
}

export function shopStocktakeDraftKey(scopeKey: string) {
  return `supermega.shop.stocktake.draft.v1:${scopeKey}`
}

function isDraft(value: unknown): value is StockCountDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<StockCountDraft>
  return typeof draft.sku === 'string' && draft.sku.length <= 120
    && typeof draft.stockUnitId === 'string' && draft.stockUnitId.length <= 180
    && typeof draft.locationId === 'string' && draft.locationId.length <= 180
    && typeof draft.quantity === 'string' && /^\d{0,16}$/.test(draft.quantity)
    && (!draft.quantity || Number.isSafeInteger(Number(draft.quantity)))
    && Number.isSafeInteger(draft.expectedOnHand) && (draft.expectedOnHand ?? -1) >= 0
    && Number.isSafeInteger(draft.expectedPhysicalQuantity) && (draft.expectedPhysicalQuantity ?? -1) >= 0
    && (draft.expectedHeadDigest === null || (typeof draft.expectedHeadDigest === 'string' && draft.expectedHeadDigest.length <= 100))
}

function parseSnapshot(raw: string): ShopStocktakeSnapshot | null {
  try {
    const value = JSON.parse(raw) as { version?: unknown; current?: unknown; lines?: unknown }
    if (value.version !== version || !Array.isArray(value.lines) || value.lines.length > 200
      || (value.current !== null && !isDraft(value.current))
      || !value.lines.every((line) => isDraft(line) && line.quantity.length > 0)
      || (!value.current && value.lines.length > 0)) return null
    const current = value.current as StockCountDraft | null
    const lines = value.lines as StockCountDraft[]
    const drafts = current ? [current, ...lines] : lines
    const keys = drafts.map((draft) => `${draft.sku}\u0000${draft.stockUnitId}\u0000${draft.locationId}`)
    if (new Set(keys).size !== keys.length) return null
    return { current, lines }
  } catch { return null }
}

export function readShopStocktakeDraft(storage: ShopStocktakeStorage | null, key: string): ShopStocktakeRead {
  if (!storage) return { status: 'unavailable' }
  try {
    const raw = storage.getItem(key)
    if (raw === null) return { status: 'missing' }
    const snapshot = parseSnapshot(raw)
    return snapshot ? { status: 'valid', snapshot } : { status: 'invalid' }
  } catch { return { status: 'unavailable' } }
}

export function shopStocktakeDraftRecovery(read: ShopStocktakeRead): ShopStocktakeRecovery {
  if (read.status === 'valid') return { status: 'saved', snapshot: read.snapshot }
  return { status: read.status === 'missing' ? 'idle' : 'unavailable' }
}

export function persistShopStocktakeDraft(storage: ShopStocktakeStorage | null, key: string, snapshot: ShopStocktakeSnapshot): boolean {
  if (!storage) return false
  try {
    storage.setItem(key, JSON.stringify({ version, ...snapshot }))
    const readback = readShopStocktakeDraft(storage, key)
    return readback.status === 'valid' && JSON.stringify(readback.snapshot) === JSON.stringify(snapshot)
  } catch { return false }
}

export function clearShopStocktakeDraft(storage: ShopStocktakeStorage | null, key: string): boolean {
  if (!storage) return false
  try { storage.removeItem(key); return true } catch { return false }
}
