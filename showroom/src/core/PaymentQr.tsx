// Merchant payment QR display + settings controls, backed by payment-qr-store.ts.
//
// DISPLAY-ONLY (see the boundary note in payment-qr-store.ts): these components show
// the owner's own provider-issued static QR next to the amount due, so the customer
// can scan it in their own banking app and type the amount themselves. No payment
// API is called, no payment status is read or written, and reconciliation stays the
// existing manual accountable flow in Orders. When no QR is stored for the selected
// method, the display button renders nothing (or a quiet settings pointer at the
// counter) — never a broken image.
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'

import {
  PAYMENT_QR_METHODS,
  deletePaymentQr,
  downscalePaymentQrImage,
  paymentQrSupported,
  putPaymentQr,
} from './payment-qr-store'
import { bi } from './i18n-actions'
import { usePaymentQrImageUrl } from './use-payment-qr-image'

/**
 * "Show payment QR" affordance for the amount-due moment (counter current sale,
 * pending-payment receipt). Renders a button only when a QR is actually stored on
 * this device for the given method; tapping it opens a near-full-screen dialog
 * with the QR and the amount due shown big enough to copy into a banking app.
 * `settingsHint` (the counter) additionally renders a quiet pointer to the
 * settings upload when no QR is stored yet; elsewhere absence renders nothing.
 */
export function PaymentQrButton({ amountDue, method, scope, settingsHint }: {
  amountDue: string
  method: string
  scope: string
  settingsHint?: boolean
}) {
  const url = usePaymentQrImageUrl(scope, method)
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [open])

  // The stored QR can disappear while the dialog is open (removed from settings in this
  // tab). Adjust during render — the sanctioned derived-state shape — so a stale `open`
  // can never re-show a dialog for a QR that no longer exists.
  if (open && !url) setOpen(false)

  if (!url) {
    if (!settingsHint || !paymentQrSupported()) return null
    return <small className="payment-qr-settings-hint">No {method} QR saved on this device yet. <Link className="text-link" to="/settings/#controls">Add your merchant QR</Link> to show it here.</small>
  }

  return <>
    <button className="core-button compact payment-qr-show" onClick={() => setOpen(true)} type="button">Show {method} QR · {amountDue}</button>
    {open ? <dialog aria-label={`${method} payment QR`} className="payment-qr-dialog" onClose={() => setOpen(false)} ref={dialogRef}>
      <header className="payment-qr-head">
        <span className="core-eyebrow">{bi('Scan to pay')}</span>
        <h2>{method}</h2>
      </header>
      <img alt={`${method} merchant payment QR`} className="payment-qr-image" src={url} />
      <div className="payment-qr-amount"><small>{bi('Amount due')}</small><strong>{amountDue}</strong></div>
      <p className="payment-qr-boundary">The customer scans this code in their own app and types the amount themselves. Check the confirmation on their screen — payment review in Orders stays manual, exactly as before.</p>
      <div className="payment-qr-actions">
        <button className="core-button compact" onClick={() => setOpen(false)} type="button">{bi('Close')}</button>
      </div>
    </dialog> : null}
  </>
}

function PaymentQrMethodControl({ method, scope }: { method: string; scope: string }) {
  const url = usePaymentQrImageUrl(scope, method)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState('')

  async function storeChosenImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setIssue('')
    try {
      await putPaymentQr(scope, method, await downscalePaymentQrImage(file))
    } catch (error) {
      setIssue(error instanceof Error && error.message ? error.message : 'The QR image could not be saved on this device.')
    } finally {
      setBusy(false)
    }
  }

  async function removeImage() {
    setBusy(true)
    setIssue('')
    try {
      await deletePaymentQr(scope, method)
    } catch {
      setIssue('The QR image could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="payment-qr-method">
    <button
      aria-busy={busy || undefined}
      aria-label={url ? `Change the ${method} payment QR` : `Add the ${method} payment QR`}
      className="payment-qr-method-frame"
      disabled={busy}
      onClick={() => inputRef.current?.click()}
      type="button"
    >
      {url ? <img alt="" src={url} /> : <span aria-hidden="true" className="payment-qr-method-placeholder">+</span>}
    </button>
    <input accept="image/*" className="sr-only" onChange={(event) => void storeChosenImage(event)} ref={inputRef} tabIndex={-1} type="file" />
    <div className="payment-qr-method-copy">
      <strong>{method}</strong>
      <small>{url ? 'Shown at the counter when a sale is paid by this method.' : 'Upload a screenshot or photo of the merchant QR your provider gave you.'}</small>
      {url ? <button className="text-link" disabled={busy} onClick={() => void removeImage()} type="button">Remove</button> : null}
      {issue ? <small className="payment-qr-method-issue" role="alert">{issue}</small> : null}
    </div>
  </div>
}

/**
 * Settings body for the Payment QR section: one upload slot per non-cash payment
 * method label the counter offers. An owner whose single Wave MMQR takes every
 * wallet simply uploads the same image to each method they accept. Renders an
 * explanatory notice instead of dead controls where IndexedDB is unavailable.
 */
export function PaymentQrSettingsControls({ scope }: { scope: string }) {
  if (!paymentQrSupported()) {
    return <p className="form-notice">This browser cannot store images on the device, so a payment QR cannot be saved here. The counter keeps working without one.</p>
  }
  return <div className="payment-qr-methods">
    {PAYMENT_QR_METHODS.map((method) => <PaymentQrMethodControl key={method} method={method} scope={scope} />)}
  </div>
}
