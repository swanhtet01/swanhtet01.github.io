import { useEffect, useRef } from 'react'

import { type CommerceOrderAcknowledgement, commerceOrderAcknowledgementText } from './commerce-workspace'
import { PaymentQrButton } from './PaymentQr'

function formatReceiptDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function mmk(amount: number) {
  return `${amount.toLocaleString()} MMK`
}

function openPrintWindow(ack: CommerceOrderAcknowledgement) {
  const text = commerceOrderAcknowledgementText(ack)
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Receipt ${ack.orderId.replace(/[^A-Za-z0-9._-]/g, '-')}</title>
  <style>
    body { font-family: ui-monospace, 'Courier New', monospace; padding: 1rem 2rem; font-size: 0.9rem; line-height: 1.5; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
    @media print { @page { margin: 1cm; } }
  </style>
</head>
<body><pre>${escaped}</pre></body>
</html>`
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (win) {
    win.addEventListener('load', () => win.print())
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
}

export function ReceiptDialog({ ack, loyalty, onClose, paymentQrScope }: {
  ack: CommerceOrderAcknowledgement | null
  /**
   * S3 PR2 customer points, display-only: the named customer's current balance
   * and any points already redeemed against this order (shop-loyalty.ts).
   * Null when points are off or the customer is Guest/blank. The printed and
   * copied artifact text is untouched — these lines exist only in the dialog.
   */
  loyalty?: { balancePoints: number; redeemedPoints: number } | null
  onClose: () => void
  paymentQrScope: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (ack) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [ack])

  async function copyReceiptText() {
    if (!ack) return
    try {
      await navigator.clipboard.writeText(commerceOrderAcknowledgementText(ack))
    } catch { /* clipboard unavailable on this device */ }
  }

  const hasPromotion = ack ? (ack.promotion.discountMmk ?? 0) > 0 : false
  const hasTax = ack ? (ack.tax.taxMmk ?? 0) > 0 : false
  const hasDeliveryFee = ack ? (ack.delivery?.feeMmk ?? 0) > 0 : false
  const showSubtotalLine = hasPromotion || hasTax || hasDeliveryFee

  return (
    <dialog aria-labelledby="receipt-dialog-title" className="receipt-dialog" onClose={onClose} ref={ref}>
      {ack ? <>
        <header className="receipt-dialog-header">
          <span className="core-eyebrow">Order record</span>
          <h2 id="receipt-dialog-title">{ack.customer}</h2>
          <p>{formatReceiptDate(ack.createdAt)} · {ack.channel}</p>
          <small>{ack.orderId}</small>
        </header>
        <table className="receipt-dialog-lines">
          <tbody>
            {ack.lines.map((line) => (
              <tr key={line.sku}>
                <td>{line.name}{line.variant ? <> · <em>{line.variant}</em></> : null}</td>
                <td className="receipt-num">×{line.quantity}</td>
                <td className="receipt-num">{mmk(line.lineTotalMmk)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="receipt-dialog-totals">
          {showSubtotalLine ? <div><span>Subtotal</span><span>{mmk(ack.grossSubtotalMmk)}</span></div> : null}
          {hasPromotion ? <div><span>Discount{ack.promotion.code ? ` (${ack.promotion.code})` : ''}</span><span>−{mmk(ack.promotion.discountMmk ?? 0)}</span></div> : null}
          {hasDeliveryFee ? <div><span>Delivery</span><span>{mmk(ack.delivery.feeMmk ?? 0)}</span></div> : null}
          {hasTax ? <div><span>Tax{ack.tax.code ? ` (${ack.tax.code})` : ''}</span><span>{mmk(ack.tax.taxMmk ?? 0)}</span></div> : null}
          <div className="receipt-total-row"><strong>Total</strong><strong>{mmk(ack.totalMmk)}</strong></div>
          {loyalty && loyalty.redeemedPoints > 0 ? <div><span>Points redeemed</span><span>−{loyalty.redeemedPoints.toLocaleString()}</span></div> : null}
          {loyalty ? <div><span>Points balance</span><span>{loyalty.balancePoints.toLocaleString()}</span></div> : null}
        </div>
        <div className="receipt-dialog-payment">
          <strong>{ack.payment.method}</strong>
          <span className={`status-pill ${ack.payment.status === 'reconciled' ? 'approved' : 'pending'}`}>
            {ack.payment.status === 'reconciled' ? 'Paid' : 'Payment pending'}
          </span>
          {ack.payment.status !== 'reconciled' && ack.payment.dueAt
            ? <small>Due {formatReceiptDate(ack.payment.dueAt)}</small>
            : null}
          {/* S2 merchant payment QR: while payment is still pending, the cashier can show
              the owner's stored merchant QR for this method with the amount due (display
              only — see payment-qr-store.ts; renders nothing when no QR is stored). */}
          {ack.payment.status !== 'reconciled' ? <PaymentQrButton amountDue={mmk(ack.totalMmk)} method={ack.payment.method} scope={paymentQrScope} /> : null}
        </div>
        {ack.delivery?.fulfilment ? <div className="receipt-dialog-delivery">
          <strong>{ack.delivery.fulfilment}</strong>
          {ack.delivery.reference ? <span>{ack.delivery.reference}</span> : null}
          {ack.delivery.promisedAt ? <small>Promised {formatReceiptDate(ack.delivery.promisedAt)}</small> : null}
        </div> : null}
        <p className="receipt-dialog-notice">{ack.notice}</p>
        <div className="receipt-dialog-actions">
          <button className="core-button compact" onClick={() => openPrintWindow(ack)} type="button">Print receipt</button>
          <button className="core-button compact" onClick={() => void copyReceiptText()} type="button">Copy text</button>
          <button className="core-button compact" onClick={onClose} type="button">Close</button>
        </div>
      </> : null}
    </dialog>
  )
}
