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

function cloneOpening(value: unknown): EcommerceOrderChangeOpening | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['contract', 'draft', 'source'])
    || value.contract !== 'supermega.ecommerce.order_change_opening.v1') return null
  const source = cloneSource(value.source)
  const draft = cloneDraft(value.draft)
  if (!source || !draft || source.orderId !== draft.orderId) return null
  return { contract: value.contract, source, draft }
}

function cloneClosed(value: unknown): EcommerceClosedOrderChangeDraft | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['contract', 'draft', 'source'])
    || value.contract !== 'supermega.ecommerce.closed_order_change_draft.v1') return null
  const source = cloneSource(value.source)
  const draft = cloneDraft(value.draft)
  if (!source || !draft || source.orderId !== draft.orderId) return null
  return { contract: value.contract, source, draft }
}

export function createEcommerceOrderChangeOpening(
  draft: EcommerceOrderChangeDraft,
  entry: CommerceStorefrontOrderTimelineEntry,
): EcommerceOrderChangeOpening | null {
  const safeDraft = cloneDraft(draft)
  const source = sourceFromEntry(entry)
  if (!safeDraft || !source || safeDraft.orderId !== source.orderId) return null
  return {
    contract: 'supermega.ecommerce.order_change_opening.v1',
    source,
    draft: safeDraft,
  }
}

export function closeEcommerceOrderChangeDraft(
  draft: EcommerceOrderChangeDraft,
  opening: EcommerceOrderChangeOpening,
): EcommerceClosedOrderChangeDraft | null {
  const safeDraft = cloneDraft(draft)
  const safeOpening = cloneOpening(opening)
  if (!safeDraft || !safeOpening || safeDraft.orderId !== safeOpening.source.orderId) return null
  if (JSON.stringify(safeDraft) === JSON.stringify(safeOpening.draft)) return null
  return {
    contract: 'supermega.ecommerce.closed_order_change_draft.v1',
    source: safeOpening.source,
    draft: safeDraft,
  }
}

export function recoverEcommerceOrderChangeDraft(
  currentDraft: EcommerceOrderChangeDraft | null,
  closedDraft: EcommerceClosedOrderChangeDraft,
  currentEntries: CommerceStorefrontOrderTimelineEntry[],
  conflictingOrderIds: readonly string[],
): EcommerceOrderChangeRecovery {
  if (currentDraft) return { ok: false, reason: 'already_editing' }
  const closed = cloneClosed(closedDraft)
  if (!closed || !Array.isArray(currentEntries) || !Array.isArray(conflictingOrderIds)) {
    return { ok: false, reason: 'invalid_recovery' }
  }
  const entry = currentEntries.find((candidate) => candidate.order?.id === closed.source.orderId)
  const order = entry?.order
  if (!entry
    || !order
    || order.status !== 'confirmed'
    || order.paymentStatus !== 'pending'
    || order.refundStatus !== 'none'
    || !order.lines?.length
    || entry.request.schema !== 'supermega.ecommerce.order_request.v2'
    || !entry.request.customerProfile
    || order.sourceRecordId !== entry.request.id) return { ok: false, reason: 'order_inactive' }
  if (conflictingOrderIds.some((orderId) => orderId === order.id)) return { ok: false, reason: 'change_pending' }
  const currentSource = sourceFromEntry(entry)
  if (!currentSource
    || currentSource.requestId !== closed.source.requestId
    || currentSource.entryEvidence !== closed.source.entryEvidence) return { ok: false, reason: 'order_changed' }
  const draft = cloneDraft(closed.draft)
  if (!draft) return { ok: false, reason: 'invalid_recovery' }
  return {
    ok: true,
    draft,
    opening: {
      contract: 'supermega.ecommerce.order_change_opening.v1',
      source: currentSource,
      draft: cloneDraft(draft) as EcommerceOrderChangeDraft,
    },
  }
}
