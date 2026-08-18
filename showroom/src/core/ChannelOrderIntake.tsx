import { type FormEvent, useState } from 'react'

import {
  CHANNEL_ORDER_MESSAGE_MAX,
  CHANNEL_ORDER_QUOTE_MAX,
  buildManagedChannelOrderDraft,
  buildChannelOrderDraft,
  channelOrderChannels,
  channelOrderDraftIsReady,
  channelOrderFields,
  channelOrderPayments,
  type ChannelOrderAttributionInput,
  type ChannelOrderDraft,
  type ChannelOrderField,
} from './channel-order-intake'
import { lockedCapabilityNotice } from './capability-tiers'
import type { CommerceItem } from './commerce-workspace'
import { prepareManagedOrderIntakeDraft, type ManagedIdentity } from './managed-trial'
import {
  captureOrderIntakeCorrection,
  readManagedIntakeGeneration,
  type OrderIntakeGeneration,
} from './order-intake-correction-capture'

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
  if (blocker === 'ai_multiple_items' || blocker === 'ai_scope_multiple_item_order') return 'This message contains multiple items. Review them in the order form.'
  if (blocker === 'ai_not_an_order' || blocker === 'ai_scope_not_an_order') return 'This does not look like an order.'
  if (blocker === 'ai_ambiguous_order' || blocker === 'ai_scope_ambiguous') return 'The message is ambiguous. Check the highlighted details.'
  if (blocker === 'ai_incomplete_required_fields') return 'AI could not find every required order detail.'
  if (blocker === 'ai_uncertain_fields') return 'AI found conflicting or uncertain details.'
  if (blocker === 'ai_unknown_sku') return 'AI could not match the item to the current Shop catalog.'
  if (blocker === 'ai_insufficient_stock') return 'The requested quantity is above current available stock.'
  if (blocker.endsWith('_attribution_required')) return `${fieldLabel} needs an exact quote or Operator supplied.`
  if (blocker.endsWith('_quote_required')) return `Add the exact ${fieldLabel.toLowerCase()} words from the message.`
  if (blocker.endsWith('_quote_must_be_excerpt')) return `Use a short ${fieldLabel.toLowerCase()} excerpt, not the full message.`
  if (blocker.endsWith('_quote_not_found')) return `The ${fieldLabel.toLowerCase()} quote is not in this message.`
  if (blocker.endsWith('_quote_ambiguous')) return `Use a longer, unique ${fieldLabel.toLowerCase()} quote.`
  return blocker.replaceAll('_', ' ')
}

export function ChannelOrderIntake({ disabled, identity, items, onAcceptedFocus, onUse }: {
  disabled: boolean
  identity?: ManagedIdentity
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
  // The AI's ORIGINAL proposal, held apart from reviewedDraft on purpose. reviewedDraft is the
  // live mapping and invalidateReview() clears it on every keystroke; these two survive that,
  // because the whole value of the correction is the difference between what AI proposed and
  // what the operator accepted. Clearing them alongside reviewedDraft is exactly the bug this
  // replaces -- the signal used to be destroyed by the first edit that made it interesting.
  const [aiProposedDraft, setAiProposedDraft] = useState<ChannelOrderDraft | null>(null)
  const [aiGeneration, setAiGeneration] = useState<OrderIntakeGeneration | null>(null)
  const [mappingField, setMappingField] = useState<ChannelOrderField>('customer')
  const [manualOpen, setManualOpen] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiIssue, setAiIssue] = useState('')
  const [aiPrepared, setAiPrepared] = useState(false)
  const controlsDisabled = disabled || aiBusy
  const selectedSku = items.some((item) => item.sku === sku) ? sku : sku || items[0]?.sku || ''
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
    setAiPrepared(false)
  }

  function updateAttribution(field: ChannelOrderField, patch: Partial<ChannelAttributionDraft>) {
    setAttributions((current) => ({ ...current, [field]: { ...current[field], ...patch } }))
    invalidateReview()
  }

  function reviewMessage(event: FormEvent) {
    event.preventDefault()
    setAiIssue('')
    setAiPrepared(false)
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

  async function prepareWithAi() {
    if (!identity || disabled || aiBusy || !sourceLabel.trim() || !message.trim()) return
    const requestSourceLabel = sourceLabel.trim()
    const requestMessage = message
    setAiBusy(true)
    setAiIssue('')
    setReviewedDraft(null)
    setAiProposedDraft(null)
    setAiGeneration(null)
    try {
      const response = await prepareManagedOrderIntakeDraft({ identity, sourceLabel: requestSourceLabel, message: requestMessage })
      const draft = await buildManagedChannelOrderDraft({
        catalogSkus: items.map((item) => item.sku),
        fallbackChannel: channel,
        message: requestMessage,
        response,
        sourceLabel: requestSourceLabel,
      })
      const nextAttributions = emptyChannelAttributions()
      for (const field of channelOrderFields) {
        const source = draft.provenance.find((entry) => entry.field === field)
        nextAttributions[field] = source?.kind === 'quote'
          ? { kind: 'quote', quote: source.quote }
          : { kind: 'operator_supplied', quote: '' }
      }
      if (draft.channel) setChannel(draft.channel)
      setCustomer(draft.customer)
      setSku(draft.sku)
      setQuantity(draft.quantity > 0 ? String(draft.quantity) : '')
      if (draft.payment) setPayment(draft.payment)
      setAttributions(nextAttributions)
      setReviewedDraft(draft)
      setAiProposedDraft(draft)
      setAiGeneration(readManagedIntakeGeneration(response))
      setAiPrepared(true)
      const ready = channelOrderDraftIsReady(draft)
      setManualOpen(!ready)
      if (!ready) {
        const blockedField = channelOrderFields.find((field) => (
          draft.blockers.some((blocker) => blocker.startsWith(`${field}_`))
        ))
        if (blockedField) setMappingField(blockedField)
      }
    } catch {
      setAiIssue('AI could not prepare this message safely. Review the four order details below.')
      setManualOpen(true)
    } finally {
      setAiBusy(false)
    }
  }

  function useReviewedDraft() {
    if (!reviewedDraft || !channelOrderDraftIsReady(reviewedDraft)) return
    // Acceptance is the only moment both halves of the pair exist and are final. Digest-only:
    // captureOrderIntakeCorrection writes field NAMES and counts, never the message or the values.
    captureOrderIntakeCorrection(window.localStorage, {
      generation: aiGeneration,
      proposed: aiProposedDraft,
      accepted: reviewedDraft,
      acceptedAt: new Date(),
    })
    onUse(reviewedDraft)
    setSourceLabel('')
    setMessage('')
    setCustomer('')
    setQuantity('1')
    setAttributions(emptyChannelAttributions())
    setMappingField('customer')
    setManualOpen(false)
    setAiIssue('')
    setAiPrepared(false)
    setReviewedDraft(null)
    setAiProposedDraft(null)
    setAiGeneration(null)
    onAcceptedFocus()
  }

  return <section className="channel-intake-panel">
    <div className="channel-intake-heading"><span className="core-eyebrow">AI-assisted intake</span><h3>Turn one message into an order draft</h3><p>Paste one customer message. AI proposes the details; a person still reviews and confirms the order.</p></div>
    <form aria-busy={aiBusy} className="core-form channel-intake-form" onSubmit={reviewMessage}>
      <div className="form-row">
        <label>Message reference<input disabled={controlsDisabled} maxLength={120} onChange={(event) => { setSourceLabel(event.target.value); invalidateReview() }} placeholder="Message ID or approved sample" required value={sourceLabel} /></label>
        <label>Received through<select disabled={controlsDisabled} onChange={(event) => { setChannel(event.target.value); invalidateReview() }} value={channel}>{channelOrderChannels.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      </div>
      <label>Single message<textarea disabled={controlsDisabled} maxLength={CHANNEL_ORDER_MESSAGE_MAX} onChange={(event) => { setMessage(event.target.value); invalidateReview() }} placeholder="Paste only the message needed to prepare this order." required value={message} /></label>
      <div className="channel-intake-actions">
        {identity
          ? <button className="core-button primary" disabled={controlsDisabled || !sourceLabel.trim() || !message.trim() || items.length === 0} onClick={() => void prepareWithAi()} type="button">{aiBusy ? 'Preparing draft…' : 'Prepare with AI'}</button>
          : <button className="core-button" disabled={controlsDisabled} onClick={() => setManualOpen(true)} type="button">Map manually</button>}
        {identity
          ? <small>Uses the company account and current Shop catalog. No order or stock change happens yet.</small>
          : <small>{lockedCapabilityNotice('ai-order-intake').outcome} {lockedCapabilityNotice('ai-order-intake').reason} <a className="text-link" href="/manage">Talk to us about this.</a></small>}
      </div>
      {aiIssue ? <p className="form-notice" role="alert">{aiIssue}</p> : null}
      <details className="channel-intake-disclosure" onToggle={(event) => setManualOpen(event.currentTarget.open)} open={manualOpen}>
        <summary><span>Review or fix details</span><small>4 fields · exact evidence</small></summary>
        <nav aria-label="Message field mapping" className="channel-field-nav">
          {channelOrderFields.map((field) => (
            <button
              aria-current={mappingField === field ? 'step' : undefined}
              className={attributionIsComplete(field) ? 'is-complete' : ''}
              disabled={controlsDisabled}
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
            <label>Customer reference<input disabled={controlsDisabled} maxLength={80} onChange={(event) => { setCustomer(event.target.value); invalidateReview() }} placeholder="Name or internal reference" required value={customer} /></label>
            <ChannelAttributionControl attribution={attributions.customer} disabled={controlsDisabled} field="customer" onChange={updateAttribution} />
          </div> : null}
          {mappingField === 'sku' ? <div className="channel-mapping-row">
            <label>Catalog item<select disabled={controlsDisabled} onChange={(event) => { setSku(event.target.value); invalidateReview() }} value={selectedSku}>{!items.some((item) => item.sku === selectedSku) && selectedSku ? <option disabled value={selectedSku}>{selectedSku} · not in Shop</option> : null}{items.map((item) => <option key={item.sku} value={item.sku}>{item.name} / {item.sku}</option>)}</select></label>
            <ChannelAttributionControl attribution={attributions.sku} disabled={controlsDisabled} field="sku" onChange={updateAttribution} />
          </div> : null}
          {mappingField === 'quantity' ? <div className="channel-mapping-row">
            <label>Quantity<input disabled={controlsDisabled} max="9999" min="1" onChange={(event) => { setQuantity(event.target.value); invalidateReview() }} required step="1" type="number" value={quantity} /></label>
            <ChannelAttributionControl attribution={attributions.quantity} disabled={controlsDisabled} field="quantity" onChange={updateAttribution} />
          </div> : null}
          {mappingField === 'payment' ? <div className="channel-mapping-row">
            <label>Payment intent<select disabled={controlsDisabled} onChange={(event) => { setPayment(event.target.value); invalidateReview() }} value={payment}>{channelOrderPayments.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
            <ChannelAttributionControl attribution={attributions.payment} disabled={controlsDisabled} field="payment" onChange={updateAttribution} />
          </div> : null}
        </div>
        <div className="channel-mapping-actions">
          {previousMappingField ? <button className="text-link" disabled={controlsDisabled} onClick={() => setMappingField(previousMappingField)} type="button">Back</button> : <span />}
          {nextMappingField
            ? <button className="core-button compact" disabled={controlsDisabled} onClick={() => setMappingField(nextMappingField)} type="button">Next: {channelFieldLabels[nextMappingField]}</button>
            : <button className="core-button primary compact" disabled={controlsDisabled} type="submit">Review mapping</button>}
        </div>
      </details>
    </form>
    {reviewedDraft ? <div aria-live="polite" className={`channel-draft-result ${channelOrderDraftIsReady(reviewedDraft) ? 'ready' : 'review'}`}>
      <div><span className="core-eyebrow">{aiPrepared ? 'AI draft' : 'Reviewed mapping'}</span><strong>{channelOrderDraftIsReady(reviewedDraft) ? 'Ready for human confirmation' : 'Check the order details'}</strong></div>
      {channelOrderDraftIsReady(reviewedDraft) ? <>
        <p>{reviewedDraft.sourceRecordId} / {reviewedDraft.provenance.filter((entry) => entry.kind === 'quote').length} exact source mappings</p>
        <button className="core-button primary compact" disabled={controlsDisabled} onClick={useReviewedDraft} type="button">Use reviewed draft</button>
      </> : <ul>{reviewedDraft.blockers.slice(0, 4).map((blocker) => <li key={blocker}>{channelDraftBlockerLabel(blocker)}</li>)}</ul>}
      <small>The message is used only to prepare this draft and is not written into the order record.</small>
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
