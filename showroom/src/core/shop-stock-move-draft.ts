import type { CommerceItem } from './commerce-workspace.ts'
import {
  shopInventoryEvidenceDigest,
  type ShopInventoryProjection,
  type ShopInventoryState,
} from './shop-inventory-foundation.ts'

export const SHOP_STOCK_MOVE_SOURCE_SCHEMA = 'supermega.shop.stock_move_source.v1' as const
export const SHOP_STOCK_MOVE_OPENING_CONTRACT = 'supermega.shop.stock_move_opening.v1' as const
export const SHOP_CLOSED_STOCK_MOVE_DRAFT_CONTRACT = 'supermega.shop.closed_stock_move_draft.v1' as const

export type ShopStockMoveDraft = Readonly<{
  balanceKey: string
  quantity: string
}>

type ShopStockMoveSource = Readonly<{
  schema: typeof SHOP_STOCK_MOVE_SOURCE_SCHEMA
  inventoryRevision: number
  inventoryHeadDigest: string
  projectionEvidence: string
  catalogEvidence: string
}>

export type ShopStockMoveOpening = Readonly<{
  contract: typeof SHOP_STOCK_MOVE_OPENING_CONTRACT
  source: ShopStockMoveSource
  draft: ShopStockMoveDraft
}>

export type ShopClosedStockMoveDraft = Readonly<{
  contract: typeof SHOP_CLOSED_STOCK_MOVE_DRAFT_CONTRACT
  source: ShopStockMoveSource
  openedDraft: ShopStockMoveDraft
  draft: ShopStockMoveDraft
}>

export type ShopStockMoveDraftRecovery =
  | Readonly<{ ok: true; draft: ShopStockMoveDraft; opening: ShopStockMoveOpening }>
  | Readonly<{
      ok: false
      reason: 'already_editing' | 'invalid_recovery' | 'inventory_unavailable' | 'inventory_changed' | 'stock_unavailable'
    }>

const digestPattern = /^sha256:[0-9a-f]{64}$/

function exactKeys(value: object, keys: readonly string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function validDraft(value: unknown): value is ShopStockMoveDraft {
  if (!value || typeof value !== 'object' || !exactKeys(value, ['balanceKey', 'quantity'])) return false
  const draft = value as Partial<ShopStockMoveDraft>
  return typeof draft.balanceKey === 'string'
    && draft.balanceKey.length <= 320
    && typeof draft.quantity === 'string'
    && draft.quantity.length <= 32
}

function validSource(value: unknown): value is ShopStockMoveSource {
  if (!value || typeof value !== 'object' || !exactKeys(value, [
    'schema',
    'inventoryRevision',
    'inventoryHeadDigest',
    'projectionEvidence',
    'catalogEvidence',
  ])) return false
  const source = value as Partial<ShopStockMoveSource>
  return source.schema === SHOP_STOCK_MOVE_SOURCE_SCHEMA
    && Number.isSafeInteger(source.inventoryRevision)
    && Number(source.inventoryRevision) >= 1
    && typeof source.inventoryHeadDigest === 'string'
    && source.inventoryHeadDigest.length > 0
    && source.inventoryHeadDigest.length <= 128
    && typeof source.projectionEvidence === 'string'
    && digestPattern.test(source.projectionEvidence)
    && typeof source.catalogEvidence === 'string'
    && digestPattern.test(source.catalogEvidence)
}

function createSource(
  state: ShopInventoryState,
  projection: ShopInventoryProjection,
  catalog: readonly Pick<CommerceItem, 'sku' | 'onHand'>[],
): ShopStockMoveSource | null {
  if (!state
    || !projection
    || !Array.isArray(catalog)
    || !Number.isSafeInteger(state.revision)
    || state.revision < 1
    || typeof state.headDigest !== 'string'
    || !state.headDigest
    || state.headDigest.length > 128
    || projection.revision !== state.revision
    || projection.headDigest !== state.headDigest
    || catalog.some((item) => !item
      || typeof item.sku !== 'string'
      || !item.sku
      || item.sku.length > 120
      || !Number.isSafeInteger(item.onHand)
      || item.onHand < 0)) return null
  try {
    return {
      schema: SHOP_STOCK_MOVE_SOURCE_SCHEMA,
      inventoryRevision: state.revision,
      inventoryHeadDigest: state.headDigest,
      projectionEvidence: shopInventoryEvidenceDigest(projection),
      catalogEvidence: shopInventoryEvidenceDigest(catalog
        .map((item) => ({ sku: item.sku, onHand: item.onHand }))
        .sort((left, right) => left.sku.localeCompare(right.sku) || left.onHand - right.onHand)),
    }
  } catch {
    return null
  }
}

function sourceEqual(left: ShopStockMoveSource, right: ShopStockMoveSource) {
  return left.schema === right.schema
    && left.inventoryRevision === right.inventoryRevision
    && left.inventoryHeadDigest === right.inventoryHeadDigest
    && left.projectionEvidence === right.projectionEvidence
    && left.catalogEvidence === right.catalogEvidence
}

function draftChanged(left: ShopStockMoveDraft, right: ShopStockMoveDraft) {
  return left.balanceKey !== right.balanceKey || left.quantity !== right.quantity
}

function validOpening(value: unknown): value is ShopStockMoveOpening {
  return Boolean(value
    && typeof value === 'object'
    && exactKeys(value, ['contract', 'source', 'draft'])
    && (value as ShopStockMoveOpening).contract === SHOP_STOCK_MOVE_OPENING_CONTRACT
    && validSource((value as ShopStockMoveOpening).source)
    && validDraft((value as ShopStockMoveOpening).draft))
}

export function createShopStockMoveOpening(
  draft: ShopStockMoveDraft,
  state: ShopInventoryState,
  projection: ShopInventoryProjection,
  catalog: readonly Pick<CommerceItem, 'sku' | 'onHand'>[],
): ShopStockMoveOpening | null {
  const source = createSource(state, projection, catalog)
  if (!validDraft(draft) || !source) return null
  return {
    contract: SHOP_STOCK_MOVE_OPENING_CONTRACT,
    source: { ...source },
    draft: { ...draft },
  }
}

export function closeShopStockMoveDraft(
  draft: ShopStockMoveDraft,
  opening: ShopStockMoveOpening | null,
): ShopClosedStockMoveDraft | null {
  if (!validDraft(draft) || !validOpening(opening) || !draftChanged(draft, opening.draft)) return null
  return {
    contract: SHOP_CLOSED_STOCK_MOVE_DRAFT_CONTRACT,
    source: { ...opening.source },
    openedDraft: { ...opening.draft },
    draft: { ...draft },
  }
}

export function recoverShopStockMoveDraft(
  currentDraft: ShopStockMoveDraft | null,
  closed: ShopClosedStockMoveDraft,
  state: ShopInventoryState,
  projection: ShopInventoryProjection,
  catalog: readonly Pick<CommerceItem, 'sku' | 'onHand'>[],
  inventoryReady: boolean,
): ShopStockMoveDraftRecovery {
  if (currentDraft) return { ok: false, reason: 'already_editing' }
  if (!closed
    || typeof closed !== 'object'
    || !exactKeys(closed, ['contract', 'source', 'openedDraft', 'draft'])
    || closed.contract !== SHOP_CLOSED_STOCK_MOVE_DRAFT_CONTRACT
    || !validSource(closed.source)
    || !validDraft(closed.openedDraft)
    || !validDraft(closed.draft)
    || !draftChanged(closed.draft, closed.openedDraft)) return { ok: false, reason: 'invalid_recovery' }
  if (!inventoryReady) return { ok: false, reason: 'inventory_unavailable' }
  const currentSource = createSource(state, projection, catalog)
  if (!currentSource || !sourceEqual(currentSource, closed.source)) return { ok: false, reason: 'inventory_changed' }
  if (closed.draft.balanceKey && !projection.balances.some((balance) => (
    `${balance.stockUnitId}|${balance.locationId}` === closed.draft.balanceKey
      && balance.availableToPromise > 0
  ))) return { ok: false, reason: 'stock_unavailable' }
  const draft = { ...closed.draft }
  return {
    ok: true,
    draft,
    opening: {
      contract: SHOP_STOCK_MOVE_OPENING_CONTRACT,
      source: { ...currentSource },
      draft: { ...draft },
    },
  }
}
