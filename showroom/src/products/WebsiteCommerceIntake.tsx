import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'

import type {
  CommerceWebsiteIntake,
  CommerceWebsiteOrderInput,
} from '../core/commerce-workspace'
import {
  acceptWebsiteEcommerceHandoff,
  completeWebsiteOrderDraft,
  createWebsiteOrderDraft,
  readWebsiteEcommerceHandoff,
  type WebsiteEcommerceHandoffContext,
  type WebsiteOrderFulfilmentMethod,
  type WebsiteOrderPaymentMethod,
  type WebsiteOrderRecord,
} from './product-handoff'

export type WebsiteCommerceCatalogItem = {
  sku: string
  name: string
  variant?: string
  onHand: number
  price: number
}

type WebsiteCommerceIntakeProps = {
  catalog: WebsiteCommerceCatalogItem[]
  disabled?: boolean
  importedSourceIds: string[]
  managedIntakes?: CommerceWebsiteIntake[]
  mode: 'local' | 'managed'
  onQueueManagedIntake?: (intakeId: string, input: CommerceWebsiteOrderInput) => boolean
  onQueueReadyOrder: (order: WebsiteOrderRecord, promisedAt: string) => void
}

const operatorPattern = /^OP-[A-Z0-9][A-Z0-9_-]{2,31}$/
const evidencePattern = /^EV-[A-HJ-NP-Z2-9]{8,24}$/

const fulfilmentLabels: Record<WebsiteOrderFulfilmentMethod, string> = {
  pickup: 'Customer pickup',
  local_delivery: 'Local delivery',
}

const paymentLabels: Record<WebsiteOrderPaymentMethod, string> = {
  cash_on_delivery: 'Cash on delivery',
  manual_qr: 'Manual QR review',
  manual_bank_transfer: 'Manual bank transfer',
}

function localDateTimeInputValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function defaultPromiseInput() {
  return localDateTimeInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000))
}

function canonicalFuturePromise(value: string) {
  const promisedAt = new Date(value)
  return value && !Number.isNaN(promisedAt.getTime()) && promisedAt.getTime() > Date.now()
    ? promisedAt.toISOString()
    : ''
}

function matchingCatalogItem(context: WebsiteEcommerceHandoffContext, catalog: WebsiteCommerceCatalogItem[]) {
  const matches = catalog.filter((item) => item.sku === context.handoff.intake.sku)
  return matches.length === 1 ? matches[0] : null
}

function createDraftFromAcceptedIntake(context: WebsiteEcommerceHandoffContext, catalog: WebsiteCommerceCatalogItem[]) {
  if (context.handoff.state !== 'accepted' || context.draft) return context
  const item = matchingCatalogItem(context, catalog)
  if (!item) return null
  return createWebsiteOrderDraft(context.handoff.id, {
    sku: item.sku,
    itemName: item.name,
    variant: item.variant || 'Standard',
    active: true,
    unitPriceMmk: item.price,
  })
}

export function WebsiteCommerceIntake({
  catalog,
  disabled = false,
  importedSourceIds,
  managedIntakes = [],
  mode,
  onQueueManagedIntake,
  onQueueReadyOrder,
}: WebsiteCommerceIntakeProps) {
  const [context, setContext] = useState(() => mode === 'local' ? readWebsiteEcommerceHandoff() : null)
  const [customer, setCustomer] = useState('')
  const [operatorId, setOperatorId] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [fulfilmentMethod, setFulfilmentMethod] = useState<WebsiteOrderFulfilmentMethod | ''>('')
  const [paymentMethod, setPaymentMethod] = useState<WebsiteOrderPaymentMethod | ''>('')
  const [promisedAt, setPromisedAt] = useState(defaultPromiseInput)
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const item = context ? matchingCatalogItem(context, catalog) : null
  const imported = Boolean(context?.order && importedSourceIds.includes(context.order.id))
  const pendingManagedIntakes = managedIntakes.filter((intake) => intake.status === 'pending_confirmation')
  const pendingManaged = pendingManagedIntakes[0]

  function reviewManagedIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const canonicalPromisedAt = canonicalFuturePromise(promisedAt)
    if (disabled || !pendingManaged || !customer.trim() || !fulfilmentMethod || !paymentMethod || !canonicalPromisedAt || !onQueueManagedIntake) return
    const queued = onQueueManagedIntake(pendingManaged.id, {
      customer: customer.trim(),
      fulfilmentMethod,
      paymentMethod,
      promisedAt: canonicalPromisedAt,
    })
    setNotice(queued
      ? `${pendingManaged.id} is ready for accountable order confirmation below.`
      : `${pendingManaged.id} was not queued. Resolve the Shop notice, then retry.`)
  }

  function acceptIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || !context || context.handoff.state !== 'pending_acceptance' || !operatorPattern.test(operatorId) || !confirmed || !item) return

    const accepted = acceptWebsiteEcommerceHandoff(context.handoff.id, operatorId)
    if (!accepted) {
      setNotice('The Website evidence could not be revalidated. Nothing changed.')
      return
    }

    const drafted = createDraftFromAcceptedIntake(accepted, catalog)
    setContext(drafted ?? accepted)
    setConfirmed(false)
    setNotice(drafted?.draft
      ? `${drafted.draft.id} is ready for fulfilment and payment details.`
      : 'The intake was accepted, but its current catalogue record could not create a draft.')
  }

  function prepareDraft() {
    if (disabled || !context || context.handoff.state !== 'accepted') return
    const drafted = createDraftFromAcceptedIntake(context, catalog)
    if (!drafted?.draft) {
      setNotice('Draft creation failed closed. Recheck the Website evidence and matching inventory item.')
      return
    }
    setContext(drafted)
    setNotice(`${drafted.draft.id} is ready for fulfilment and payment details.`)
  }

  async function completeDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || !context?.draft || context.order || !fulfilmentMethod || !paymentMethod || !operatorPattern.test(operatorId) || !evidencePattern.test(evidenceReference) || !confirmed) return

    setSubmitting(true)
    const completed = await completeWebsiteOrderDraft(context.draft.id, {
      fulfilmentMethod,
      paymentMethod,
      operatorId,
      evidenceReference,
    })
    setSubmitting(false)
    if (!completed?.order) {
      setNotice('Completion failed closed. The source, operator, or evidence reference could not be verified.')
      return
    }

    setContext(completed)
    setConfirmed(false)
    setNotice(`${completed.order.id} is ready for accountable confirmation in Shop.`)
  }

  const stateLabel = !context
    ? 'No intake waiting'
    : context.order
      ? imported ? 'Added to orders' : 'Ready to confirm'
      : context.draft
        ? 'Details required'
        : context.handoff.state === 'accepted'
          ? 'Accepted intake'
          : 'Approval required'

  if (mode === 'managed') {
    return (
      <section aria-label="Managed Website order intake" className="website-intake">
        <header className="website-intake-head">
          <div><span className="core-eyebrow">Website orders</span><strong>{pendingManaged ? `${pendingManagedIntakes.length} waiting` : 'No intake waiting'}</strong></div>
          <div><Link className="text-link" to="/products/website/">Open Website</Link></div>
        </header>

        {pendingManaged ? (
          <form className="website-intake-completion" onSubmit={reviewManagedIntake}>
            <div className="website-intake-record">
              <strong>{pendingManaged.itemName} × {pendingManaged.quantity}</strong>
              <small>{pendingManaged.id} · {pendingManaged.source.siteName} {pendingManaged.source.pagePath} · {pendingManaged.total.toLocaleString()} MMK</small>
            </div>
            <label>Customer name or reference<input disabled={disabled} maxLength={80} onChange={(event) => setCustomer(event.target.value)} placeholder="Name, phone suffix, or order reference" required value={customer} /></label>
            <div className="form-row">
              <label>Fulfilment<select disabled={disabled} onChange={(event) => setFulfilmentMethod(event.target.value as WebsiteOrderFulfilmentMethod | '')} required value={fulfilmentMethod}><option value="">Select</option><option value="pickup">Customer pickup</option><option value="local_delivery">Local delivery</option></select></label>
              <label>Payment<select disabled={disabled} onChange={(event) => setPaymentMethod(event.target.value as WebsiteOrderPaymentMethod | '')} required value={paymentMethod}><option value="">Select</option><option value="cash_on_delivery">Cash on delivery</option><option value="manual_qr">Manual QR review</option><option value="manual_bank_transfer">Manual bank transfer</option></select></label>
            </div>
            <label>Promised for<input autoComplete="off" disabled={disabled} min={localDateTimeInputValue(new Date())} onChange={(event) => setPromisedAt(event.target.value)} required type="datetime-local" value={promisedAt} /></label>
            <button className="core-button primary" disabled={disabled || !customer.trim() || !fulfilmentMethod || !paymentMethod || !canonicalFuturePromise(promisedAt)} type="submit">Review order</button>
          </form>
        ) : (
          <div className="website-intake-ready"><div><strong>Nothing to process</strong><small>Send an approved SKU and quantity from Website when a real request is ready.</small></div></div>
        )}

        <p aria-live="polite" className="form-notice">{notice || 'Managed intake only. Stock moves and an order is created only after the authenticated human confirmation.'}</p>
      </section>
    )
  }

  return (
    <section aria-label="Website order intake" className="website-intake">
      <header className="website-intake-head">
        <div><span className="core-eyebrow">Website orders</span><strong>{stateLabel}</strong></div>
        <div><Link className="text-link" to="/products/website/">Open Website</Link></div>
      </header>

      {context && !item ? <p className="form-notice warning-text">SKU {context.handoff.intake.sku} does not match exactly one Shop stock item. Intake is blocked.</p> : null}

      {context?.handoff.state === 'pending_acceptance' ? (
        <form className="website-intake-form" onSubmit={acceptIntake}>
          <div className="website-intake-record"><strong>{context.display?.siteName || 'Approved Website revision'}</strong><small>{context.handoff.intake.sku} · quantity {context.handoff.intake.quantity} · {context.handoff.id}</small></div>
          <label>Operator ID<input autoComplete="off" disabled={disabled} maxLength={35} onChange={(event) => setOperatorId(event.target.value.toUpperCase())} pattern="OP-[A-Z0-9][A-Z0-9_-]{2,31}" placeholder="OP-OWNER" required value={operatorId} /></label>
          <label className="website-intake-confirm"><input checked={confirmed} disabled={disabled} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>I reviewed this SKU, quantity, and Website evidence.</span></label>
          <button className="core-button primary" disabled={disabled || !item || !operatorPattern.test(operatorId) || !confirmed} type="submit">Accept intake</button>
        </form>
      ) : null}

      {context?.handoff.state === 'accepted' && !context.draft ? (
        <div className="website-intake-ready"><div><strong>{context.handoff.id}</strong><small>Accepted by {context.handoff.acceptance.operatorId}; no order exists yet.</small></div><button className="core-button" disabled={disabled || !item} onClick={prepareDraft} type="button">Prepare order</button></div>
      ) : null}

      {context?.draft && !context.order ? (
        <form className="website-intake-completion" onSubmit={completeDraft}>
          <div className="website-intake-record"><strong>{context.draft.lines[0]?.itemName} × {context.draft.lines[0]?.quantity}</strong><small>{context.draft.id} · {context.draft.totalMmk.toLocaleString()} MMK · opaque customer reference generated on completion</small></div>
          <div className="form-row">
            <label>Fulfilment<select disabled={disabled} onChange={(event) => setFulfilmentMethod(event.target.value as WebsiteOrderFulfilmentMethod | '')} required value={fulfilmentMethod}><option value="">Select</option><option value="pickup">Customer pickup</option><option value="local_delivery">Local delivery</option></select></label>
            <label>Payment<select disabled={disabled} onChange={(event) => setPaymentMethod(event.target.value as WebsiteOrderPaymentMethod | '')} required value={paymentMethod}><option value="">Select</option><option value="cash_on_delivery">Cash on delivery</option><option value="manual_qr">Manual QR review</option><option value="manual_bank_transfer">Manual bank transfer</option></select></label>
          </div>
          <div className="form-row">
            <label>Operator ID<input autoComplete="off" disabled={disabled} maxLength={35} onChange={(event) => setOperatorId(event.target.value.toUpperCase())} pattern="OP-[A-Z0-9][A-Z0-9_-]{2,31}" placeholder="OP-OWNER" required value={operatorId} /></label>
            <label>Evidence reference<input autoComplete="off" disabled={disabled} maxLength={27} onChange={(event) => setEvidenceReference(event.target.value.toUpperCase())} pattern="EV-[A-HJ-NP-Z2-9]{8,24}" placeholder="EV-TESTAB23" required value={evidenceReference} /></label>
          </div>
          <label className="website-intake-confirm"><input checked={confirmed} disabled={disabled} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>I verified the immutable item and MMK total.</span></label>
          <button className="core-button primary" disabled={disabled || submitting || !fulfilmentMethod || !paymentMethod || !operatorPattern.test(operatorId) || !evidencePattern.test(evidenceReference) || !confirmed} type="submit">{submitting ? 'Checking…' : 'Create ready order'}</button>
        </form>
      ) : null}

      {context?.order ? (
        <div className="website-intake-ready">
          <div><strong>{context.order.customerReference} · {context.order.lines[0]?.itemName} × {context.order.lines[0]?.quantity}</strong><small>{context.order.id} · {fulfilmentLabels[context.order.fulfilmentMethod]} · {paymentLabels[context.order.paymentMethod]} · {context.order.totalMmk.toLocaleString()} MMK</small></div>
          <label>Promised for<input autoComplete="off" disabled={disabled || imported} min={localDateTimeInputValue(new Date())} onChange={(event) => setPromisedAt(event.target.value)} required type="datetime-local" value={promisedAt} /></label>
          <button className="core-button primary" disabled={disabled || imported || !canonicalFuturePromise(promisedAt)} onClick={() => onQueueReadyOrder(context.order!, canonicalFuturePromise(promisedAt))} type="button">{imported ? 'In order queue' : 'Confirm into orders'}</button>
        </div>
      ) : null}

      {context || notice ? <p aria-live="polite" className="form-notice">{notice || 'Browser-local evidence only. No customer message, payment, delivery request, or external write occurs.'}</p> : null}
    </section>
  )
}
