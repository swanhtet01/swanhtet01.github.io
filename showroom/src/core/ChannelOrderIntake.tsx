import { type FormEvent, useState } from 'react'

import {
  CHANNEL_ORDER_MESSAGE_MAX,
  CHANNEL_ORDER_QUOTE_MAX,
  buildChannelOrderDraft,
  channelOrderChannels,
  channelOrderDraftIsReady,
  channelOrderFields,
  channelOrderPayments,
  type ChannelOrderAttributionInput,
  type ChannelOrderDraft,
  type ChannelOrderField,
} from './channel-order-intake'
import type { CommerceItem } from './commerce-workspace'

type ChannelAttributionDraft = { kind: ChannelOrderAttributionInput['kind']; quote: string }

const channelFieldLabels: Record<ChannelOrderField, string> = {
  customer: 'Customer',
  sku: 'Item',
  quantity: 'Quantity',
  payment: 'Payment',
}

function emptyChannelAttributions(): Record<ChannelOrderField, ChannelAttributionDraft> {
  return {
    customer: { kind: 'quote', quote: '' },
    sku: { kind: 'quote', quote: '' },
    quantity: { kind: 'quote', quote: '' },
    payment: { kind: 'quote', quote: '' },
  }
}

function channelDraftBlockerLabel(blocker: string) {
  const field = channelOrderFields.find((candidate) => blocker.startsWith(`${candidate}_`))
  const fieldLabel = field ? channelFieldLabels[field] : ''
  if (blocker === 'source_label_required') return 'Add a message ID or approved sample label.'
  if (blocker === 'source_message_required') return 'Paste one approved or synthetic message.'
  if (blocker === 'source_message_too_long') return `Keep the single message under ${CHANNEL_ORDER_MESSAGE_MAX.toLocaleString()} characters.`
  if (blocker === 'channel_invalid') return 'Choose Messenger, Viber, or Phone.'
  if (blocker === 'customer_required') return 'Add a customer reference.'
  if (blocker === 'sku_required') return 'Choose a catalog item.'
  if (blocker === 'sku_unknown') return 'The selected item is not in the current catalog.'
  if (blocker === 'quantity_invalid') return 'Enter a whole quantity from 1 to 9,999.'
  if (blocker === 'payment_invalid') return 'Choose a supported payment intent.'
  if (blocker === 'source_quote_required') return 'Map at least one field to exact words from the message.'
  if (blocker.endsWith('_attribution_required')) return `${fieldLabel} needs an exact quote or Operator supplied.`
  if (blocker.endsWith('_quote_required')) return `Add the exact ${fieldLabel.toLowerCase()} words from the message.`
  if (blocker.endsWith('_quote_must_be_excerpt')) return `Use a short ${fieldLabel.toLowerCase()} excerpt, not the full message.`
  if (blocker.endsWith('_quote_not_found')) return `The ${fieldLabel.toLowerCase()} quote is not in this message.`
  if (blocker.endsWith('_quote_ambiguous')) return `Use a longer, unique ${fieldLabel.toLowerCase()} quote.`
  return blocker.replaceAll('_', ' ')
}

export function ChannelOrderIntake({ disabled, items, onAcceptedFocus, onUse }: {
  disabled: boolean
  items: CommerceItem[]
  onAcceptedFocus: () => void
  onUse: (draft: ChannelOrderDraft) => void
}) {
  const [sourceLabel, setSourceLabel] = useState('')
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState('Messenger')
  const [customer, setCustomer] = useState('')
  const [sku, setSku] = useState(items[0]?.sku ?? '')
  const [quantity, setQuantity] = useState('1')
  const [payment, setPayment] = useState('KBZPay')
  const [attributions, setAttributions] = useState(emptyChannelAttributions)
  const [reviewedDraft, setReviewedDraft] = useState<ChannelOrderDraft | null>(null)
  const [mappingField, setMappingField] = useState<ChannelOrderField>('customer')
  const selectedSku = items.some((item) => item.sku === sku) ? sku : items[0]?.sku ?? ''
  const mappingFieldIndex = channelOrderFields.indexOf(mappingField)
  const previousMappingField = mappingFieldIndex > 0 ? channelOrderFields[mappingFieldIndex - 1] : undefined
  const nextMappingField = channelOrderFields[mappingFieldIndex + 1]

  function attributionIsComplete(field: ChannelOrderField) {
    const attribution = attributions[field]
    const valueIsComplete = field === 'customer'
      ? Boolean(customer.trim())
      : field === 'sku'
        ? Boolean(selectedSku)
        : field === 'quantity'
          ? Number.isInteger(Number(quantity)) && Number(quantity) > 0
          : Boolean(payment)
    return valueIsComplete && (attribution.kind === 'operator_supplied' || Boolean(attribution.quote.trim()))
  }

  function invalidateReview() {
    if (reviewedDraft) setReviewedDraft(null)
  }

  function updateAttribution(field: ChannelOrderField, patch: Partial<ChannelAttributionDraft>) {
    setAttributions((current) => ({ ...current, [field]: { ...current[field], ...patch } }))
    invalidateReview()
  }

  function reviewMessage(event: FormEvent) {
    event.preventDefault()
    const normalizedAttributions = Object.fromEntries(channelOrderFields.map((field) => {
      const attribution = attributions[field]
      const value: ChannelOrderAttributionInput = attribution.kind === 'operator_supplied'
        ? { kind: 'operator_supplied' }
        : { kind: 'quote', quote: attribution.quote }
      return [field, value]
    })) as Record<ChannelOrderField, ChannelOrderAttributionInput>
    const draft = buildChannelOrderDraft({
      sourceLabel,
      message,
      channel,
      customer,
      sku: selectedSku,
      quantity: Number(quantity),
      payment,
      catalogSkus: items.map((item) => item.sku),
      attributions: normalizedAttributions,
    })
    setReviewedDraft(draft)
    if (!channelOrderDraftIsReady(draft)) {
      const blockedField = channelOrderFields.find((field) => (
        draft.blockers.some((blocker) => blocker.startsWith(`${field}_`))
      ))
      if (blockedField) setMappingField(blockedField)
    }
  }

  function useReviewedDraft() {
    if (!reviewedDraft || !channelOrderDraftIsReady(reviewedDraft)) return
    onUse(reviewedDraft)
    setSourceLabel('')
    setMessage('')
    setCustomer('')
    setQuantity('1')
    setAttributions(emptyChannelAttributions())
    setMappingField('customer')
    setReviewedDraft(null)
    onAcceptedFocus()
  }

  return <section className="channel-intake-panel">
    <div className="channel-intake-heading"><span className="core-eyebrow">Human-mapped intake</span><h3>Start from a channel message</h3><p>Use one approved or synthetic message, not a full conversation. Map one exact excerpt; nothing is sent, and AI is not connected.</p></div>
    <form className="core-form channel-intake-form" onSubmit={reviewMessage}>
      <div className="form-row">
        <label>Message reference<input disabled={disabled} maxLength={120} onChange={(event) => { setSourceLabel(event.target.value); invalidateReview() }} placeholder="Message ID or approved sample" required value={sourceLabel} /></label>
        <label>Channel<select disabled={disabled} onChange={(event) => { setChannel(event.target.value); invalidateReview() }} value={channel}>{channelOrderChannels.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      </div>
      <label>Single message<textarea disabled={disabled} maxLength={CHANNEL_ORDER_MESSAGE_MAX} onChange={(event) => { setMessage(event.target.value); invalidateReview() }} placeholder="Paste only the message needed to prepare this order." required value={message} /></label>
      <details className="channel-intake-disclosure">
        <summary><span>Map order details</span><small>4 fields · exact evidence</small></summary>
        <nav aria-label="Message field mapping" className="channel-field-nav">
          {channelOrderFields.map((field) => (
            <button
              aria-current={mappingField === field ? 'step' : undefined}
              className={attributionIsComplete(field) ? 'is-complete' : ''}
              key={field}
              onClick={() => setMappingField(field)}
              type="button"
            >
              {channelFieldLabels[field]}
            </button>
          ))}
        </nav>
        <div className="channel-mapping-list">
          {mappingField === 'customer' ? <div className="channel-mapping-row">
            <label>Customer reference<input disabled={disabled} maxLength={80} onChange={(event) => { setCustomer(event.target.value); invalidateReview() }} placeholder="Name or internal reference" required value={customer} /></label>
            <ChannelAttributionControl attribution={attributions.customer} disabled={disabled} field="customer" onChange={updateAttribution} />
          </div> : null}
          {mappingField === 'sku' ? <div className="channel-mapping-row">
            <label>Catalog item<select disabled={disabled} onChange={(event) => { setSku(event.target.value); invalidateReview() }} value={selectedSku}>{items.map((item) => <option key={item.sku} value={item.sku}>{item.name} / {item.sku}</option>)}</select></label>
            <ChannelAttributionControl attribution={attributions.sku} disabled={disabled} field="sku" onChange={updateAttribution} />
          </div> : null}
          {mappingField === 'quantity' ? <div className="channel-mapping-row">
            <label>Quantity<input disabled={disabled} max="9999" min="1" onChange={(event) => { setQuantity(event.target.value); invalidateReview() }} required step="1" type="number" value={quantity} /></label>
            <ChannelAttributionControl attribution={attributions.quantity} disabled={disabled} field="quantity" onChange={updateAttribution} />
          </div> : null}
          {mappingField === 'payment' ? <div className="channel-mapping-row">
            <label>Payment intent<select disabled={disabled} onChange={(event) => { setPayment(event.target.value); invalidateReview() }} value={payment}>{channelOrderPayments.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
            <ChannelAttributionControl attribution={attributions.payment} disabled={disabled} field="payment" onChange={updateAttribution} />
          </div> : null}
        </div>
        <div className="channel-mapping-actions">
          {previousMappingField ? <button className="text-link" onClick={() => setMappingField(previousMappingField)} type="button">Back</button> : <span />}
          {nextMappingField
            ? <button className="core-button compact" onClick={() => setMappingField(nextMappingField)} type="button">Next: {channelFieldLabels[nextMappingField]}</button>
            : <button className="core-button primary compact" disabled={disabled} type="submit">Review mapping</button>}
        </div>
      </details>
    </form>
    {reviewedDraft ? <div aria-live="polite" className={`channel-draft-result ${channelOrderDraftIsReady(reviewedDraft) ? 'ready' : 'review'}`}>
      <div><span className="core-eyebrow">Ephemeral draft</span><strong>{channelOrderDraftIsReady(reviewedDraft) ? 'Ready for accountable confirmation' : 'Needs review'}</strong></div>
      {channelOrderDraftIsReady(reviewedDraft) ? <>
        <p>{reviewedDraft.sourceRecordId} / {reviewedDraft.provenance.filter((entry) => entry.kind === 'quote').length} exact source mappings</p>
        <button className="core-button primary compact" disabled={disabled} onClick={useReviewedDraft} type="button">Use reviewed draft</button>
      </> : <ul>{reviewedDraft.blockers.slice(0, 4).map((blocker) => <li key={blocker}>{channelDraftBlockerLabel(blocker)}</li>)}</ul>}
      <small>The full message is not part of the order record.</small>
    </div> : null}
  </section>
}

function ChannelAttributionControl({ attribution, disabled, field, onChange }: {
  attribution: ChannelAttributionDraft
  disabled: boolean
  field: ChannelOrderField
  onChange: (field: ChannelOrderField, patch: Partial<ChannelAttributionDraft>) => void
}) {
  return <div className="channel-attribution">
    <label className="channel-operator-check"><input aria-label={`${channelFieldLabels[field]} is operator supplied`} checked={attribution.kind === 'operator_supplied'} disabled={disabled} onChange={(event) => onChange(field, { kind: event.target.checked ? 'operator_supplied' : 'quote' })} type="checkbox" /><span>Operator supplied</span></label>
    {attribution.kind === 'quote' ? <label>Exact words<input aria-label={`${channelFieldLabels[field]} exact source words`} disabled={disabled} maxLength={CHANNEL_ORDER_QUOTE_MAX} onChange={(event) => onChange(field, { quote: event.target.value })} placeholder="Copy a short, unique excerpt" required value={attribution.quote} /></label> : <small>Human-entered; no source quote claimed.</small>}
  </div>
}
