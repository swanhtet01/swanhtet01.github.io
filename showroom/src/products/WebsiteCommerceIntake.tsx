import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'

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
  importedSourceIds: string[]
  onQueueReadyOrder: (order: WebsiteOrderRecord) => void
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

export function WebsiteCommerceIntake({ catalog, importedSourceIds, onQueueReadyOrder }: WebsiteCommerceIntakeProps) {
  const [context, setContext] = useState(() => readWebsiteEcommerceHandoff())
  const [operatorId, setOperatorId] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [fulfilmentMethod, setFulfilmentMethod] = useState<WebsiteOrderFulfilmentMethod | ''>('')
  const [paymentMethod, setPaymentMethod] = useState<WebsiteOrderPaymentMethod | ''>('')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const item = context ? matchingCatalogItem(context, catalog) : null
  const imported = Boolean(context?.order && importedSourceIds.includes(context.order.id))

  function acceptIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!context || context.handoff.state !== 'pending_acceptance' || !operatorPattern.test(operatorId) || !confirmed || !item) return

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
    if (!context || context.handoff.state !== 'accepted') return
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
    if (!context?.draft || context.order || !fulfilmentMethod || !paymentMethod || !operatorPattern.test(operatorId) || !evidencePattern.test(evidenceReference) || !confirmed) return

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
    setNotice(`${completed.order.id} is ready for accountable confirmation into Commerce.`)
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

  return (
    <section aria-label="Website order intake" className="website-intake">
      <header className="website-intake-head">
        <div><span className="core-eyebrow">Website orders</span><strong>{stateLabel}</strong></div>
        <div><Link className="text-link" to="/products/website/">Open Website</Link></div>
      </header>

      {context && !item ? <p className="form-notice warning-text">SKU {context.handoff.intake.sku} does not match exactly one Commerce inventory item. Intake is blocked.</p> : null}

      {context?.handoff.state === 'pending_acceptance' ? (
        <form className="website-intake-form" onSubmit={acceptIntake}>
          <div className="website-intake-record"><strong>{context.display?.siteName || 'Approved Website revision'}</strong><small>{context.handoff.intake.sku} · quantity {context.handoff.intake.quantity} · {context.handoff.id}</small></div>
          <label>Operator ID<input autoComplete="off" maxLength={35} onChange={(event) => setOperatorId(event.target.value.toUpperCase())} pattern="OP-[A-Z0-9][A-Z0-9_-]{2,31}" placeholder="OP-OWNER" required value={operatorId} /></label>
          <label className="website-intake-confirm"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>I reviewed this SKU, quantity, and Website evidence.</span></label>
          <button className="core-button primary" disabled={!item || !operatorPattern.test(operatorId) || !confirmed} type="submit">Accept intake</button>
        </form>
      ) : null}

      {context?.handoff.state === 'accepted' && !context.draft ? (
        <div className="website-intake-ready"><div><strong>{context.handoff.id}</strong><small>Accepted by {context.handoff.acceptance.operatorId}; no order exists yet.</small></div><button className="core-button" disabled={!item} onClick={prepareDraft} type="button">Prepare order</button></div>
      ) : null}

      {context?.draft && !context.order ? (
        <form className="website-intake-completion" onSubmit={completeDraft}>
          <div className="website-intake-record"><strong>{context.draft.lines[0]?.itemName} × {context.draft.lines[0]?.quantity}</strong><small>{context.draft.id} · {context.draft.totalMmk.toLocaleString()} MMK · opaque customer reference generated on completion</small></div>
          <div className="form-row">
            <label>Fulfilment<select onChange={(event) => setFulfilmentMethod(event.target.value as WebsiteOrderFulfilmentMethod | '')} required value={fulfilmentMethod}><option value="">Select</option><option value="pickup">Customer pickup</option><option value="local_delivery">Local delivery</option></select></label>
            <label>Payment<select onChange={(event) => setPaymentMethod(event.target.value as WebsiteOrderPaymentMethod | '')} required value={paymentMethod}><option value="">Select</option><option value="cash_on_delivery">Cash on delivery</option><option value="manual_qr">Manual QR review</option><option value="manual_bank_transfer">Manual bank transfer</option></select></label>
          </div>
          <div className="form-row">
            <label>Operator ID<input autoComplete="off" maxLength={35} onChange={(event) => setOperatorId(event.target.value.toUpperCase())} pattern="OP-[A-Z0-9][A-Z0-9_-]{2,31}" placeholder="OP-OWNER" required value={operatorId} /></label>
            <label>Evidence reference<input autoComplete="off" maxLength={27} onChange={(event) => setEvidenceReference(event.target.value.toUpperCase())} pattern="EV-[A-HJ-NP-Z2-9]{8,24}" placeholder="EV-TESTAB23" required value={evidenceReference} /></label>
          </div>
          <label className="website-intake-confirm"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>I verified the immutable item and MMK total.</span></label>
          <button className="core-button primary" disabled={submitting || !fulfilmentMethod || !paymentMethod || !operatorPattern.test(operatorId) || !evidencePattern.test(evidenceReference) || !confirmed} type="submit">{submitting ? 'Checking…' : 'Create ready order'}</button>
        </form>
      ) : null}

      {context?.order ? (
        <div className="website-intake-ready">
          <div><strong>{context.order.customerReference} · {context.order.lines[0]?.itemName} × {context.order.lines[0]?.quantity}</strong><small>{context.order.id} · {fulfilmentLabels[context.order.fulfilmentMethod]} · {paymentLabels[context.order.paymentMethod]} · {context.order.totalMmk.toLocaleString()} MMK</small></div>
          <button className="core-button primary" disabled={imported} onClick={() => onQueueReadyOrder(context.order!)} type="button">{imported ? 'In order queue' : 'Confirm into orders'}</button>
        </div>
      ) : null}

      {context || notice ? <p aria-live="polite" className="form-notice">{notice || 'Browser-local evidence only. No customer message, payment, delivery request, or external write occurs.'}</p> : null}
    </section>
  )
}
