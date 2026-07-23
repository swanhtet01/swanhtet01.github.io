export const CHANNEL_ORDER_DRAFT_SCHEMA = 'supermega.channel_order_draft.v1' as const
export const CHANNEL_ORDER_MESSAGE_MAX = 2_000
export const CHANNEL_ORDER_QUOTE_MAX = 120

export const channelOrderChannels = ['Messenger', 'Viber', 'Phone'] as const
export const channelOrderPayments = ['KBZPay', 'WavePay', 'Cash on delivery', 'Cash', 'Card'] as const
export const channelOrderFields = ['customer', 'sku', 'quantity', 'payment'] as const

export type ChannelOrderChannel = (typeof channelOrderChannels)[number]
export type ChannelOrderPayment = (typeof channelOrderPayments)[number]
export type ChannelOrderField = (typeof channelOrderFields)[number]
export type ChannelOrderAttributionInput =
  | { kind: 'quote'; quote: string }
  | { kind: 'operator_supplied' }

export type ChannelOrderDraftInput = {
  sourceLabel: string
  message: string
  channel: string
  customer: string
  sku: string
  quantity: number
  payment: string
  catalogSkus: string[]
  attributions: Record<ChannelOrderField, ChannelOrderAttributionInput>
}

export type ChannelOrderProvenance =
  | { field: ChannelOrderField; kind: 'operator_supplied' }
  | { field: ChannelOrderField; kind: 'quote'; quote: string; start: number; end: number }

export type ChannelOrderDraft = {
  schema: typeof CHANNEL_ORDER_DRAFT_SCHEMA
  sourceRecordId: string | null
  evidenceReference: string | null
  sourceLabel: string
  messageFingerprint: string | null
  channel: ChannelOrderChannel | null
  customer: string
  sku: string
  quantity: number
  payment: ChannelOrderPayment | null
  status: 'needs_review' | 'ready_for_confirmation'
  blockers: string[]
  provenance: ChannelOrderProvenance[]
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  return normalized.length <= maximum ? normalized : ''
}

function fingerprint(value: string) {
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

function occurrences(message: string, quote: string) {
  const indexes: number[] = []
  let cursor = 0
  while (cursor <= message.length - quote.length) {
    const index = message.indexOf(quote, cursor)
    if (index < 0) break
    indexes.push(index)
    cursor = index + 1
  }
  return indexes
}

function expectedEvidenceReference(draft: Pick<ChannelOrderDraft, 'sourceRecordId' | 'messageFingerprint' | 'customer' | 'sku' | 'quantity' | 'payment' | 'provenance'>) {
  if (!draft.sourceRecordId || !draft.messageFingerprint) return null
  const mappingFingerprint = fingerprint(JSON.stringify({
    sourceRecordId: draft.sourceRecordId,
    messageFingerprint: draft.messageFingerprint,
    customer: draft.customer,
    sku: draft.sku,
    quantity: draft.quantity,
    payment: draft.payment,
    provenance: draft.provenance,
  }))
  return `channel-message://${draft.sourceRecordId}#msg-${draft.messageFingerprint.slice(4).toLowerCase()}-map-${mappingFingerprint}`
}

export function buildChannelOrderDraft(input: ChannelOrderDraftInput): ChannelOrderDraft {
  const blockers: string[] = []
  const provenance: ChannelOrderProvenance[] = []
  const sourceLabel = boundedText(input.sourceLabel, 120)
  const message = typeof input.message === 'string' ? input.message : ''
  const channel = channelOrderChannels.includes(input.channel as ChannelOrderChannel)
    ? input.channel as ChannelOrderChannel
    : null
  const customer = boundedText(input.customer, 80)
  const sku = boundedText(input.sku, 80).toUpperCase()
  const payment = channelOrderPayments.includes(input.payment as ChannelOrderPayment)
    ? input.payment as ChannelOrderPayment
    : null
  const catalogSkus = new Set(input.catalogSkus.map((entry) => boundedText(entry, 80).toUpperCase()).filter(Boolean))

  if (!sourceLabel) blockers.push('source_label_required')
  if (!message.trim()) blockers.push('source_message_required')
  else if (message.length > CHANNEL_ORDER_MESSAGE_MAX) blockers.push('source_message_too_long')
  if (!channel) blockers.push('channel_invalid')
  if (!customer) blockers.push('customer_required')
  if (!sku) blockers.push('sku_required')
  else if (!catalogSkus.has(sku)) blockers.push('sku_unknown')
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 9_999) blockers.push('quantity_invalid')
  if (!payment) blockers.push('payment_invalid')

  for (const field of channelOrderFields) {
    const attribution = input.attributions[field]
    if (!attribution || (attribution.kind !== 'quote' && attribution.kind !== 'operator_supplied')) {
      blockers.push(`${field}_attribution_required`)
      continue
    }
    if (attribution.kind === 'operator_supplied') {
      provenance.push({ field, kind: 'operator_supplied' })
      continue
    }

    const quote = boundedText(attribution.quote, CHANNEL_ORDER_QUOTE_MAX)
    if (!quote) {
      blockers.push(`${field}_quote_required`)
      continue
    }
    if (quote === message.trim()) {
      blockers.push(`${field}_quote_must_be_excerpt`)
      continue
    }
    const matches = message ? occurrences(message, quote) : []
    if (matches.length === 0) {
      blockers.push(`${field}_quote_not_found`)
      continue
    }
    if (matches.length > 1) {
      blockers.push(`${field}_quote_ambiguous`)
      continue
    }
    provenance.push({ field, kind: 'quote', quote, start: matches[0], end: matches[0] + quote.length })
  }

  if (!provenance.some((entry) => entry.kind === 'quote')) blockers.push('source_quote_required')

  const sourceRecordId = sourceLabel && channel
    ? `CHN-${fingerprint(`${channel}\u001f${sourceLabel.toUpperCase()}`).toUpperCase()}`
    : null
  const messageFingerprint = message ? `MSG-${fingerprint(message).toUpperCase()}` : null
  const draft: ChannelOrderDraft = {
    schema: CHANNEL_ORDER_DRAFT_SCHEMA,
    sourceRecordId,
    evidenceReference: null,
    sourceLabel,
    messageFingerprint,
    channel,
    customer,
    sku,
    quantity: input.quantity,
    payment,
    status: blockers.length ? 'needs_review' : 'ready_for_confirmation',
    blockers: [...new Set(blockers)],
    provenance,
  }
  draft.evidenceReference = expectedEvidenceReference(draft)
  return draft
}

export function channelOrderDraftIsReady(draft: ChannelOrderDraft): draft is ChannelOrderDraft & {
  sourceRecordId: string
  evidenceReference: string
  channel: ChannelOrderChannel
  payment: ChannelOrderPayment
  status: 'ready_for_confirmation'
} {
  if (!draft || draft.schema !== CHANNEL_ORDER_DRAFT_SCHEMA || !Array.isArray(draft.provenance)) return false
  const provenanceFields = new Set(draft.provenance.map((entry) => entry?.field))
  const validProvenance = draft.provenance.every((entry) => {
    if (!entry || !channelOrderFields.includes(entry.field)) return false
    if (entry.kind === 'operator_supplied') return Object.keys(entry).length === 2
    return entry.kind === 'quote'
      && Object.keys(entry).length === 5
      && typeof entry.quote === 'string'
      && entry.quote === entry.quote.trim()
      && entry.quote.length > 0
      && entry.quote.length <= CHANNEL_ORDER_QUOTE_MAX
      && Number.isSafeInteger(entry.start)
      && entry.start >= 0
      && Number.isSafeInteger(entry.end)
      && entry.end === entry.start + entry.quote.length
  })
  return draft.status === 'ready_for_confirmation'
    && draft.blockers.length === 0
    && /^CHN-[A-F0-9]{16}$/.test(draft.sourceRecordId ?? '')
    && /^MSG-[A-F0-9]{16}$/.test(draft.messageFingerprint ?? '')
    && draft.evidenceReference === expectedEvidenceReference(draft)
    && Boolean(draft.channel)
    && channelOrderChannels.includes(draft.channel as ChannelOrderChannel)
    && Boolean(draft.customer)
    && Boolean(draft.sku)
    && Number.isSafeInteger(draft.quantity)
    && draft.quantity > 0
    && Boolean(draft.payment)
    && channelOrderPayments.includes(draft.payment as ChannelOrderPayment)
    && draft.provenance.length === channelOrderFields.length
    && provenanceFields.size === channelOrderFields.length
    && channelOrderFields.every((field) => provenanceFields.has(field))
    && draft.provenance.some((entry) => entry.kind === 'quote')
    && validProvenance
}
