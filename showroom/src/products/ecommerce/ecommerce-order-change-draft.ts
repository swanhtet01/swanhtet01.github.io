import type { CommerceStorefrontOrderTimelineEntry } from '../../core/commerce-workspace'

export type EcommerceOrderChangeDraft = Readonly<{
  orderId: string
  mode: 'details' | 'items'
  fulfilment: 'pickup' | 'delivery'
  lines: ReadonlyArray<Readonly<{ sku: string; name: string; quantity: string }>>
  customerName: string
  customerPhone: string
  addressLine1: string
  addressTownship: string
  addressCity: string
  deliveryInstructions: string
  reason: string
}>

type EcommerceOrderChangeSource = Readonly<{
  schema: 'supermega.ecommerce.order_change_source.v1'
  orderId: string
  requestId: string
  entryEvidence: string
}>

export type EcommerceOrderChangeOpening = Readonly<{
  contract: 'supermega.ecommerce.order_change_opening.v1'
  source: EcommerceOrderChangeSource
  draft: EcommerceOrderChangeDraft
}>

export type EcommerceClosedOrderChangeDraft = Readonly<{
  contract: 'supermega.ecommerce.closed_order_change_draft.v1'
  source: EcommerceOrderChangeSource
  draft: EcommerceOrderChangeDraft
}>

export type EcommerceOrderChangeRecovery =
  | Readonly<{
      ok: true
      draft: EcommerceOrderChangeDraft
      opening: EcommerceOrderChangeOpening
    }>
  | Readonly<{
      ok: false
      reason: 'already_editing' | 'invalid_recovery' | 'order_inactive' | 'order_changed' | 'change_pending'
    }>

export type EcommerceOrderRescheduleDraft = Readonly<{
  orderId: string
  requestedPromisedAt: string
  reason: string
}>

export type EcommerceOrderRescheduleOpening = Readonly<{
  contract: 'supermega.ecommerce.order_reschedule_opening.v1'
  source: EcommerceOrderChangeSource
  draft: EcommerceOrderRescheduleDraft
}>

export type EcommerceClosedOrderRescheduleDraft = Readonly<{
  contract: 'supermega.ecommerce.closed_order_reschedule_draft.v1'
  source: EcommerceOrderChangeSource
  draft: EcommerceOrderRescheduleDraft
}>

export type EcommerceOrderRescheduleRecovery =
  | Readonly<{
      ok: true
      draft: EcommerceOrderRescheduleDraft
      opening: EcommerceOrderRescheduleOpening
    }>
  | Readonly<{
      ok: false
      reason: 'already_editing' | 'invalid_recovery' | 'order_inactive' | 'order_changed' | 'change_pending'
    }>

const DRAFT_KEYS = [
  'addressCity',
  'addressLine1',
  'addressTownship',
  'customerName',
  'customerPhone',
  'deliveryInstructions',
  'fulfilment',
  'lines',
  'mode',
  'orderId',
  'reason',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const current = Object.keys(value).sort()
  const expected = [...keys].sort()
  return current.length === expected.length && current.every((key, index) => key === expected[index])
}

function boundedString(value: unknown, maximum: number, requireContent = false): value is string {
  return typeof value === 'string'
    && value.length <= maximum
    && (!requireContent || Boolean(value.trim()))
}

function cloneDraft(value: unknown): EcommerceOrderChangeDraft | null {
  if (!isRecord(value)
    || !hasExactKeys(value, DRAFT_KEYS)
    || !boundedString(value.orderId, 160, true)
    || (value.mode !== 'details' && value.mode !== 'items')
    || (value.fulfilment !== 'pickup' && value.fulfilment !== 'delivery')
    || !Array.isArray(value.lines)
    || value.lines.length < 1
    || value.lines.length > 100
    || !boundedString(value.customerName, 80)
    || !boundedString(value.customerPhone, 32)
    || !boundedString(value.addressLine1, 120)
    || !boundedString(value.addressTownship, 80)
    || !boundedString(value.addressCity, 80)
    || !boundedString(value.deliveryInstructions, 160)
    || !boundedString(value.reason, 300)) return null

  const seenSkus = new Set<string>()
  const lines: Array<{ sku: string; name: string; quantity: string }> = []
  for (const candidate of value.lines) {
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, ['name', 'quantity', 'sku'])
      || !boundedString(candidate.sku, 160, true)
      || !boundedString(candidate.name, 160, true)
      || !boundedString(candidate.quantity, 16)
      || seenSkus.has(candidate.sku)) return null
    seenSkus.add(candidate.sku)
    lines.push({ sku: candidate.sku, name: candidate.name, quantity: candidate.quantity })
  }

  return {
    orderId: value.orderId,
    mode: value.mode,
    fulfilment: value.fulfilment,
    lines,
    customerName: value.customerName,
    customerPhone: value.customerPhone,
    addressLine1: value.addressLine1,
    addressTownship: value.addressTownship,
    addressCity: value.addressCity,
    deliveryInstructions: value.deliveryInstructions,
    reason: value.reason,
  }
}

function cloneRescheduleDraft(value: unknown): EcommerceOrderRescheduleDraft | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['orderId', 'reason', 'requestedPromisedAt'])
    || !boundedString(value.orderId, 160, true)
    || !boundedString(value.requestedPromisedAt, 40)
    || !boundedString(value.reason, 300)) return null
  return {
    orderId: value.orderId,
    requestedPromisedAt: value.requestedPromisedAt,
    reason: value.reason,
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry))
  if (!isRecord(value)) return value
  return Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
    if (value[key] !== undefined) result[key] = canonicalValue(value[key])
    return result
  }, {})
}

function entryEvidence(entry: CommerceStorefrontOrderTimelineEntry) {
  return JSON.stringify(canonicalValue(entry))
}

function sourceFromEntry(entry: CommerceStorefrontOrderTimelineEntry): EcommerceOrderChangeSource | null {
  const order = entry.order
  const request = entry.request
  if (!order
    || request.schema !== 'supermega.ecommerce.order_request.v2'
    || !request.customerProfile
    || order.sourceRecordId !== request.id
    || !boundedString(order.id, 160, true)
    || !boundedString(request.id, 160, true)) return null
  return {
    schema: 'supermega.ecommerce.order_change_source.v1',
    orderId: order.id,
    requestId: request.id,
    entryEvidence: entryEvidence(entry),
  }
}

function cloneSource(value: unknown): EcommerceOrderChangeSource | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['entryEvidence', 'orderId', 'requestId', 'schema'])
    || value.schema !== 'supermega.ecommerce.order_change_source.v1'
    || !boundedString(value.orderId, 160, true)
    || !boundedString(value.requestId, 160, true)
    || !boundedString(value.entryEvidence, 500_000, true)) return null
  return {
    schema: value.schema,
    orderId: value.orderId,
    requestId: value.requestId,
    entryEvidence: value.entryEvidence,
  }
}

type OrderDraft = Readonly<{ orderId: string }>
type DraftClone<T extends OrderDraft> = (value: unknown) => T | null

function cloneEnvelope<T extends OrderDraft>(value: unknown, contract: string, clone: DraftClone<T>) {
  if (!isRecord(value)
    || !hasExactKeys(value, ['contract', 'draft', 'source'])
    || value.contract !== contract) return null
  const source = cloneSource(value.source)
  const draft = clone(value.draft)
  if (!source || !draft || source.orderId !== draft.orderId) return null
  return { contract: value.contract, source, draft }
}

function createOpening<T extends OrderDraft>(
  contract: string,
  draft: T,
  entry: CommerceStorefrontOrderTimelineEntry,
  clone: DraftClone<T>,
  promisedAtRequired = false,
) {
  const safeDraft = clone(draft)
  const source = sourceFromEntry(entry)
  if (!safeDraft || !source || safeDraft.orderId !== source.orderId || (promisedAtRequired && !entry.order?.promisedAt)) return null
  return { contract, source, draft: safeDraft }
}

function closeDraft<T extends OrderDraft>(
  contract: string,
  openingContract: string,
  draft: T,
  opening: unknown,
  clone: DraftClone<T>,
) {
  const safeDraft = clone(draft)
  const safeOpening = cloneEnvelope(opening, openingContract, clone)
  if (!safeDraft || !safeOpening || safeDraft.orderId !== safeOpening.source.orderId
    || JSON.stringify(safeDraft) === JSON.stringify(safeOpening.draft)) return null
  return { contract, source: safeOpening.source, draft: safeDraft }
}

function recoverSource(
  source: EcommerceOrderChangeSource,
  currentEntries: CommerceStorefrontOrderTimelineEntry[],
  conflictingOrderIds: readonly string[],
  promisedAtRequired: boolean,
) {
  if (!Array.isArray(currentEntries) || !Array.isArray(conflictingOrderIds)) {
    return { ok: false as const, reason: 'invalid_recovery' as const }
  }
  const entry = currentEntries.find((candidate) => candidate.order?.id === source.orderId)
  const order = entry?.order
  if (!entry
    || !order
    || order.status !== 'confirmed'
    || order.paymentStatus !== 'pending'
    || order.refundStatus !== 'none'
    || !order.lines?.length
    || (promisedAtRequired && !order.promisedAt)
    || entry.request.schema !== 'supermega.ecommerce.order_request.v2'
    || !entry.request.customerProfile
    || order.sourceRecordId !== entry.request.id) return { ok: false as const, reason: 'order_inactive' as const }
  if (conflictingOrderIds.some((orderId) => orderId === order.id)) {
    return { ok: false as const, reason: 'change_pending' as const }
  }
  const currentSource = sourceFromEntry(entry)
  if (!currentSource
    || currentSource.requestId !== source.requestId
    || currentSource.entryEvidence !== source.entryEvidence) return { ok: false as const, reason: 'order_changed' as const }
  return { ok: true as const, source: currentSource }
}

function recoverDraft<T extends OrderDraft>(
  currentDraft: T | null,
  closedDraft: unknown,
  currentEntries: CommerceStorefrontOrderTimelineEntry[],
  conflictingOrderIds: readonly string[],
  closedContract: string,
  openingContract: string,
  clone: DraftClone<T>,
  promisedAtRequired = false,
) {
  if (currentDraft) return { ok: false as const, reason: 'already_editing' as const }
  const closed = cloneEnvelope(closedDraft, closedContract, clone)
  if (!closed) return { ok: false as const, reason: 'invalid_recovery' as const }
  const sourceRecovery = recoverSource(closed.source, currentEntries, conflictingOrderIds, promisedAtRequired)
  if (!sourceRecovery.ok) return sourceRecovery
  const draft = clone(closed.draft)
  if (!draft) return { ok: false as const, reason: 'invalid_recovery' as const }
  return {
    ok: true as const,
    draft,
    opening: { contract: openingContract, source: sourceRecovery.source, draft: clone(draft) as T },
  }
}

export function createEcommerceOrderChangeOpening(
  draft: EcommerceOrderChangeDraft,
  entry: CommerceStorefrontOrderTimelineEntry,
): EcommerceOrderChangeOpening | null {
  return createOpening('supermega.ecommerce.order_change_opening.v1', draft, entry, cloneDraft) as EcommerceOrderChangeOpening | null
}

export function closeEcommerceOrderChangeDraft(
  draft: EcommerceOrderChangeDraft,
  opening: EcommerceOrderChangeOpening,
): EcommerceClosedOrderChangeDraft | null {
  return closeDraft('supermega.ecommerce.closed_order_change_draft.v1', 'supermega.ecommerce.order_change_opening.v1', draft, opening, cloneDraft) as EcommerceClosedOrderChangeDraft | null
}

export function recoverEcommerceOrderChangeDraft(
  currentDraft: EcommerceOrderChangeDraft | null,
  closedDraft: EcommerceClosedOrderChangeDraft,
  currentEntries: CommerceStorefrontOrderTimelineEntry[],
  conflictingOrderIds: readonly string[],
): EcommerceOrderChangeRecovery {
  return recoverDraft(currentDraft, closedDraft, currentEntries, conflictingOrderIds, 'supermega.ecommerce.closed_order_change_draft.v1', 'supermega.ecommerce.order_change_opening.v1', cloneDraft) as EcommerceOrderChangeRecovery
}

export function createEcommerceOrderRescheduleOpening(
  draft: EcommerceOrderRescheduleDraft,
  entry: CommerceStorefrontOrderTimelineEntry,
): EcommerceOrderRescheduleOpening | null {
  return createOpening('supermega.ecommerce.order_reschedule_opening.v1', draft, entry, cloneRescheduleDraft, true) as EcommerceOrderRescheduleOpening | null
}

export function closeEcommerceOrderRescheduleDraft(
  draft: EcommerceOrderRescheduleDraft,
  opening: EcommerceOrderRescheduleOpening,
): EcommerceClosedOrderRescheduleDraft | null {
  return closeDraft('supermega.ecommerce.closed_order_reschedule_draft.v1', 'supermega.ecommerce.order_reschedule_opening.v1', draft, opening, cloneRescheduleDraft) as EcommerceClosedOrderRescheduleDraft | null
}

export function recoverEcommerceOrderRescheduleDraft(
  currentDraft: EcommerceOrderRescheduleDraft | null,
  closedDraft: EcommerceClosedOrderRescheduleDraft,
  currentEntries: CommerceStorefrontOrderTimelineEntry[],
  conflictingOrderIds: readonly string[],
): EcommerceOrderRescheduleRecovery {
  return recoverDraft(currentDraft, closedDraft, currentEntries, conflictingOrderIds, 'supermega.ecommerce.closed_order_reschedule_draft.v1', 'supermega.ecommerce.order_reschedule_opening.v1', cloneRescheduleDraft, true) as EcommerceOrderRescheduleRecovery
}
