export const CHANNEL_ORDER_DRAFT_SCHEMA = 'supermega.channel_order_draft.v1' as const
export const CHANNEL_ORDER_MESSAGE_MAX = 4_000
export const CHANNEL_ORDER_QUOTE_MAX = 280

export const channelOrderChannels = ['Messenger', 'Viber', 'Telegram', 'TikTok', 'Phone'] as const
export const channelOrderPayments = ['KBZPay', 'WavePay', 'AYA Pay', 'MMQR', 'Cash on delivery', 'Cash', 'Card'] as const
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

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringList(value: unknown) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? value as string[]
    : null
}

async function sha256Reference(value: string) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure draft verification is unavailable in this browser.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

// telegram/tiktok are forward-compat: the managed AI contract
// (supermega_runtime/order_intake.py OrderIntakeChannel) does not emit them
// yet; extending that server enum requires re-running the golden-set eval.
const managedChannels: Record<string, ChannelOrderChannel> = {
  messenger: 'Messenger',
  viber: 'Viber',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  phone: 'Phone',
}

const managedPayments: Record<string, ChannelOrderPayment> = {
  kbzpay: 'KBZPay',
  wavepay: 'WavePay',
  ayapay: 'AYA Pay',
  mmqr: 'MMQR',
  cash_on_delivery: 'Cash on delivery',
  cash: 'Cash',
  card: 'Card',
}

type ManagedOrderField = 'customer_reference' | 'channel' | 'sku' | 'quantity' | 'payment' | 'fulfilment'

export async function buildManagedChannelOrderDraft(input: {
  catalogSkus: string[]
  fallbackChannel: string
  message: string
  response: unknown
  sourceLabel: string
}): Promise<ChannelOrderDraft> {
  if (!record(input.response) || !record(input.response.draft)) {
    throw new Error('The managed AI draft response is invalid.')
  }
  const sourceLabelDigest = await sha256Reference(input.sourceLabel)
  const messageDigest = await sha256Reference(input.message)
  if (input.response.source_label_digest !== sourceLabelDigest) {
    throw new Error('The managed AI draft does not match this message reference.')
  }
  const managed = input.response.draft
  if (managed.schema_version !== 'supermega.order_intake.draft.v1'
    || managed.message_digest !== messageDigest
    || !['ready_for_review', 'needs_clarification'].includes(String(managed.status))
    || !['single_item_order', 'multiple_item_order', 'not_an_order', 'ambiguous'].includes(String(managed.scope))) {
    throw new Error('The managed AI draft contract is invalid.')
  }
  const missingFields = stringList(managed.missing_fields)
  const uncertainFields = stringList(managed.uncertain_fields)
  const managedBlockers = stringList(managed.blockers)
  if (!missingFields || !uncertainFields || !managedBlockers || !Array.isArray(managed.provenance)) {
    throw new Error('The managed AI draft review fields are invalid.')
  }

  const provenance = new Map<ManagedOrderField, { quote: string; start: number; end: number }>()
  const managedFieldNames = new Set<ManagedOrderField>(['customer_reference', 'channel', 'sku', 'quantity', 'payment', 'fulfilment'])
  for (const entry of managed.provenance) {
    if (!record(entry) || !managedFieldNames.has(entry.field as ManagedOrderField) || provenance.has(entry.field as ManagedOrderField) || !Array.isArray(entry.source_spans) || entry.source_spans.length < 1) {
      throw new Error('The managed AI source evidence is invalid.')
    }
    const spans = entry.source_spans.map((span) => {
      if (!record(span)
        || typeof span.quote !== 'string'
        || !span.quote.trim()
        || span.quote.length > CHANNEL_ORDER_QUOTE_MAX
        || !Number.isSafeInteger(span.start)
        || !Number.isSafeInteger(span.end)
        || Number(span.start) < 0
        || Number(span.end) !== Number(span.start) + span.quote.length
        || input.message.slice(Number(span.start), Number(span.end)) !== span.quote) {
        throw new Error('The managed AI source evidence does not match the message.')
      }
      return { quote: span.quote, start: Number(span.start), end: Number(span.end) }
    })
    provenance.set(entry.field as ManagedOrderField, spans[0])
  }

  const customer = managed.customer_reference === null ? '' : boundedText(managed.customer_reference, 80)
  const sku = managed.sku === null ? '' : boundedText(managed.sku, 80).toUpperCase()
  const quantity = managed.quantity === null ? 0 : Number(managed.quantity)
  const managedChannel = managed.channel === null ? null : managedChannels[String(managed.channel)] ?? null
  const fallbackChannel = channelOrderChannels.includes(input.fallbackChannel as ChannelOrderChannel)
    ? input.fallbackChannel as ChannelOrderChannel
    : null
  const channel = managed.channel === null ? fallbackChannel : managedChannel
  const payment = managed.payment === null ? null : managedPayments[String(managed.payment)] ?? null
  const values: Record<ManagedOrderField, unknown> = {
    customer_reference: managed.customer_reference,
    channel: managed.channel,
    sku: managed.sku,
    quantity: managed.quantity,
    payment: managed.payment,
    fulfilment: managed.fulfilment,
  }
  for (const field of managedFieldNames) {
    if (values[field] !== null && !provenance.has(field)) {
      throw new Error(`The managed AI ${field.replaceAll('_', ' ')} is missing exact source evidence.`)
    }
  }

  const attribution = (field: ManagedOrderField): ChannelOrderAttributionInput => {
    const source = provenance.get(field)
    return source ? { kind: 'quote', quote: source.quote } : { kind: 'operator_supplied' }
  }
  const draft = buildChannelOrderDraft({
    sourceLabel: input.sourceLabel,
    message: input.message,
    channel: channel ?? '',
    customer,
    sku,
    quantity,
    payment: payment ?? '',
    catalogSkus: input.catalogSkus,
    attributions: {
      customer: attribution('customer_reference'),
      sku: attribution('sku'),
      quantity: attribution('quantity'),
      payment: attribution('payment'),
    },
  })

  const fallbackResolvedChannel = managed.channel === null && Boolean(fallbackChannel)
  const unresolvedMissing = missingFields.filter((field) => field !== 'channel' || !fallbackResolvedChannel)
  const unresolvedUncertain = uncertainFields.filter((field) => field !== 'channel' || !fallbackResolvedChannel)
  const unresolvedManaged = managedBlockers.filter((blocker) => {
    if (blocker === 'incomplete_required_fields' && unresolvedMissing.length === 0) return false
    if (blocker === 'uncertain_fields' && unresolvedUncertain.length === 0) return false
    return true
  })
  if (managed.scope !== 'single_item_order') unresolvedManaged.push(`scope_${String(managed.scope)}`)
  const blockers = [...new Set([
    ...draft.blockers,
    ...unresolvedManaged.map((blocker) => `ai_${blocker}`),
  ])]
  return blockers.length
    ? { ...draft, status: 'needs_review', blockers }
    : draft
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
