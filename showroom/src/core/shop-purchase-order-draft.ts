import type { CommercePurchaseOrderDiscrepancyCode, CommerceState } from './commerce-workspace.ts'

export const SHOP_PURCHASE_ORDER_SOURCE_SCHEMA = 'supermega.shop.purchase_order_source.v1' as const
export const SHOP_PURCHASE_ORDER_OPENING_CONTRACT = 'supermega.shop.purchase_order_opening.v1' as const
export const SHOP_CLOSED_PURCHASE_ORDER_DRAFT_CONTRACT = 'supermega.shop.closed_purchase_order_draft.v1' as const

export type ShopPurchaseOrderDraft =
  | Readonly<{ mode: 'create'; requisitionId?: string; sku: string; supplier: string; expectedAt: string; quantity: string; unitCostMmk: string }>
  | Readonly<{ mode: 'receive'; purchaseOrderId: string; quantity: string; rejectedQuantity: string; discrepancyCode: CommercePurchaseOrderDiscrepancyCode; locationId: string; trackingCode: string }>

type ShopPurchaseOrderSource = Readonly<{
  schema: typeof SHOP_PURCHASE_ORDER_SOURCE_SCHEMA
  mode: ShopPurchaseOrderDraft['mode']
  targetId: string
  targetEvidence: string
}>

export type ShopPurchaseOrderOpening = Readonly<{
  contract: typeof SHOP_PURCHASE_ORDER_OPENING_CONTRACT
  source: ShopPurchaseOrderSource
  draft: ShopPurchaseOrderDraft
}>

export type ShopClosedPurchaseOrderDraft = Readonly<{
  contract: typeof SHOP_CLOSED_PURCHASE_ORDER_DRAFT_CONTRACT
  source: ShopPurchaseOrderSource
  openedDraft: ShopPurchaseOrderDraft
  draft: ShopPurchaseOrderDraft
}>

export type ShopPurchaseOrderDraftRecovery =
  | Readonly<{ ok: true; draft: ShopPurchaseOrderDraft; opening: ShopPurchaseOrderOpening }>
  | Readonly<{ ok: false; reason: 'already_editing' | 'invalid_recovery' | 'target_unavailable' | 'source_changed' }>

const discrepancyCodes = new Set<CommercePurchaseOrderDiscrepancyCode>(['damaged', 'wrong_item', 'quality_failed'])

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}

function text(value: unknown, maximum: number, required = false): value is string {
  return typeof value === 'string' && value.length <= maximum && (!required || Boolean(value.trim()))
}

function cloneDraft(value: unknown): ShopPurchaseOrderDraft | null {
  if (!record(value)) return null
  if (value.mode === 'create') {
    const keys = ['expectedAt', 'mode', 'quantity', 'sku', 'supplier', 'unitCostMmk', ...(value.requisitionId === undefined ? [] : ['requisitionId'])]
    if (!exact(value, keys) || !text(value.sku, 80, true) || !text(value.supplier, 120) || !text(value.expectedAt, 40)
      || !text(value.quantity, 32) || !text(value.unitCostMmk, 32)
      || (value.requisitionId !== undefined && !text(value.requisitionId, 80, true))) return null
    return { mode: 'create', ...(value.requisitionId === undefined ? {} : { requisitionId: value.requisitionId }), sku: value.sku, supplier: value.supplier, expectedAt: value.expectedAt, quantity: value.quantity, unitCostMmk: value.unitCostMmk }
  }
  if (value.mode !== 'receive'
    || !exact(value, ['discrepancyCode', 'locationId', 'mode', 'purchaseOrderId', 'quantity', 'rejectedQuantity', 'trackingCode'])
    || !text(value.purchaseOrderId, 80, true) || !text(value.quantity, 32) || !text(value.rejectedQuantity, 32)
    || !discrepancyCodes.has(value.discrepancyCode as CommercePurchaseOrderDiscrepancyCode)
    || !text(value.locationId, 120) || !text(value.trackingCode, 80)) return null
  return { mode: 'receive', purchaseOrderId: value.purchaseOrderId, quantity: value.quantity, rejectedQuantity: value.rejectedQuantity, discrepancyCode: value.discrepancyCode as CommercePurchaseOrderDiscrepancyCode, locationId: value.locationId, trackingCode: value.trackingCode }
}

function progress(state: CommerceState, purchaseOrderId: string, ordered: number) {
  const receipts = state.movements.filter((movement) => movement.kind === 'receipt' && movement.purchaseOrderId === purchaseOrderId)
  const received = receipts.reduce((total, movement) => total + movement.quantityDelta, 0)
  const rejected = receipts.reduce((total, movement) => total + (movement.rejectedQuantity ?? 0), 0)
  return { receipts, received, rejected, remaining: ordered - received - rejected }
}

function source(draft: ShopPurchaseOrderDraft, state: CommerceState): ShopPurchaseOrderSource | null {
  const orders = state.purchaseOrders ?? []
  const requisitions = state.purchaseRequisitions ?? []
  let targetEvidence = ''
  if (draft.mode === 'create') {
    const items = state.items.filter((item) => item.sku === draft.sku)
    const requisition = draft.requisitionId ? requisitions.find((row) => row.id === draft.requisitionId) : undefined
    const skuOrders = orders.filter((order) => order.sku === draft.sku)
    if (items.length !== 1 || (draft.requisitionId && (!requisition || orders.some((order) => order.requisitionId === draft.requisitionId)))
      || skuOrders.some((order) => !order.cancellation && progress(state, order.id, order.quantityOrdered).remaining > 0)) return null
    targetEvidence = JSON.stringify([items[0], state.inventoryFoundation?.headDigest ?? null, state.purchaseBudgetEnvelopes ?? [],
      (state.supplierSourcingDecisions ?? []).filter((row) => row.sku === draft.sku), requisitions.filter((row) => row.sku === draft.sku), skuOrders, requisition ?? null])
  } else {
    const purchaseOrder = orders.find((order) => order.id === draft.purchaseOrderId)
    const items = purchaseOrder ? state.items.filter((item) => item.sku === purchaseOrder.sku) : []
    const receiptProgress = purchaseOrder ? progress(state, purchaseOrder.id, purchaseOrder.quantityOrdered) : null
    if (!purchaseOrder || items.length !== 1 || purchaseOrder.cancellation || !receiptProgress || receiptProgress.remaining < 1) return null
    targetEvidence = JSON.stringify([purchaseOrder, items[0], receiptProgress, state.inventoryFoundation?.headDigest ?? null])
  }
  if (!targetEvidence || targetEvidence.length > 500_000) return null
  return { schema: SHOP_PURCHASE_ORDER_SOURCE_SCHEMA, mode: draft.mode, targetId: draft.mode === 'create' ? draft.sku : draft.purchaseOrderId, targetEvidence }
}

function cloneSource(value: unknown): ShopPurchaseOrderSource | null {
  if (!record(value) || !exact(value, ['mode', 'schema', 'targetEvidence', 'targetId']) || value.schema !== SHOP_PURCHASE_ORDER_SOURCE_SCHEMA
    || (value.mode !== 'create' && value.mode !== 'receive') || !text(value.targetId, 80, true) || !text(value.targetEvidence, 500_000, true)) return null
  return { schema: value.schema, mode: value.mode, targetId: value.targetId, targetEvidence: value.targetEvidence }
}

function targetId(draft: ShopPurchaseOrderDraft) {
  return draft.mode === 'create' ? draft.sku : draft.purchaseOrderId
}

export function createShopPurchaseOrderOpening(draftValue: ShopPurchaseOrderDraft, state: CommerceState): ShopPurchaseOrderOpening | null {
  const draft = cloneDraft(draftValue)
  const boundSource = draft ? source(draft, state) : null
  return draft && boundSource ? { contract: SHOP_PURCHASE_ORDER_OPENING_CONTRACT, source: boundSource, draft } : null
}

export function closeShopPurchaseOrderDraft(draftValue: ShopPurchaseOrderDraft, opening: ShopPurchaseOrderOpening | null): ShopClosedPurchaseOrderDraft | null {
  const draft = cloneDraft(draftValue)
  const openedDraft = cloneDraft(opening?.draft)
  const boundSource = cloneSource(opening?.source)
  if (!draft || !openedDraft || !boundSource || opening?.contract !== SHOP_PURCHASE_ORDER_OPENING_CONTRACT
    || draft.mode !== boundSource.mode || targetId(draft) !== boundSource.targetId || JSON.stringify(draft) === JSON.stringify(openedDraft)) return null
  return { contract: SHOP_CLOSED_PURCHASE_ORDER_DRAFT_CONTRACT, source: boundSource, openedDraft, draft }
}

export function recoverShopPurchaseOrderDraft(currentDraft: ShopPurchaseOrderDraft | null, closed: ShopClosedPurchaseOrderDraft, state: CommerceState): ShopPurchaseOrderDraftRecovery {
  if (currentDraft) return { ok: false, reason: 'already_editing' }
  if (!record(closed) || !exact(closed, ['contract', 'draft', 'openedDraft', 'source']) || closed.contract !== SHOP_CLOSED_PURCHASE_ORDER_DRAFT_CONTRACT) return { ok: false, reason: 'invalid_recovery' }
  const draft = cloneDraft(closed.draft)
  const openedDraft = cloneDraft(closed.openedDraft)
  const boundSource = cloneSource(closed.source)
  if (!draft || !openedDraft || !boundSource || draft.mode !== boundSource.mode || targetId(draft) !== boundSource.targetId
    || openedDraft.mode !== draft.mode || JSON.stringify(draft) === JSON.stringify(openedDraft)) return { ok: false, reason: 'invalid_recovery' }
  const currentSource = source(draft, state)
  if (!currentSource) return { ok: false, reason: 'target_unavailable' }
  if (currentSource.targetEvidence !== boundSource.targetEvidence) return { ok: false, reason: 'source_changed' }
  const restored = cloneDraft(draft) as ShopPurchaseOrderDraft
  return { ok: true, draft: restored, opening: { contract: SHOP_PURCHASE_ORDER_OPENING_CONTRACT, source: currentSource, draft: cloneDraft(restored) as ShopPurchaseOrderDraft } }
}
