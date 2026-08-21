import { useEffect, useRef } from 'react'

import { type CommerceOrderAcknowledgement, commerceOrderAcknowledgementText } from './commerce-workspace'
import { bi } from './i18n-actions'
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

// G1 SCOPE BOUNDARY, stated because "Burmese receipt printing" is the competitor
// claim this batch answers and only half of it is answered here. The DIALOG above is
// wired for bilingual labels; the PRINTED document below is deliberately not, and it
// is not an oversight or a size decision.
//
// What this prints is commerceOrderAcknowledgementText(ack) — the order
// ACKNOWLEDGEMENT ARTIFACT, not a shop's customer slip. Its field names are the
// record's own vocabulary and it carries the confirmation action id, the calculation
// evidence and the document digest; verify_app_release_live.mjs pins several of its
// lines in the built chunk, and the same text is what Copy text puts on the clipboard
// for a support thread. Translating an evidence document's field names is a different
// decision from translating a button, with a different reviewer and a different
// failure mode, so it stays one language and the printed document declares that
// language honestly on its root element below.
//
// The customer-facing Burmese slip a Loyverse user is comparing against is a separate
// artifact this app does not have yet: it needs the shop's own name and address, no
// evidence identifiers, and a layout decision about Burmese numerals (the register
// note in i18n-actions.ts prefers them; MMK amounts here are Arabic). That is roadmap
// work with its own planning pass, not a wrapper around this function.
// G2 print geometry. A counter receipt is printed on a continuous thermal ROLL,
// not a sheet, so the printed document carries a roll layout by default and a
// sheet layout only when the print service reports sheet-sized media. Before
// this, it emitted `@page { margin: 1cm }` and 2rem of body padding on every
// path: measured on an 80mm roll, a 38.9mm text column, 49% of the paper, 16
// monospace characters wide, running a one-page receipt to 417mm of roll.
//
// The mm literals are the deliberate-literal case the 44px WCAG touch-target
// family is: they describe physical paper, no --space-* token expresses a
// millimetre, and this document is a standalone Blob that never loads
// core-app.css, so no design token is in scope here at all. Font sizes stay in
// rem so OS font scaling still reaches them (the P3.6 px->rem lane's point).
// The rationale lives in these `//` comments rather than inside the template
// literal below because anything in the literal survives minification and is
// re-emitted into the Blob of every single printed receipt.
//
// THE PAGE LENGTH IS DELIBERATELY NOT SET, not merely omitted. A roll's length
// is unknown at print time and CSS cannot express an auto page height: the
// `size` grammar takes `auto` alone, ONE length (which means a SQUARE page), or
// TWO lengths -- so `size: 80mm auto` is invalid and the browser discards the
// whole declaration. Measured in Chromium 1194: it produced a 215.9x279.4mm
// page, byte-for-byte the same as declaring no size at all. A two-length `size`
// would apply, but would commit every receipt to a page length we cannot know
// -- a long one paginates, a short one wastes roll -- so we declare no `size`
// at all and let the print service supply the media it actually has.
//
// That is also the only thing that steers these media queries: Chromium
// evaluates print media queries against the print job's selected paper width,
// NOT against `@page size` (measured: 58mm paper -> 58mm, 80mm -> 80mm, A4 and
// Letter -> 210-216mm). So the layout follows the media the printer reports.
//
// The three branches, and what each measured:
//   - Base print, roll typography sized against an 80mm roll. Zeroing the UA's
//     default body margin and insetting 4mm a side lands the column on the
//     72mm such a printer images -- measured 71.9mm, ~40 characters, next to
//     the 42 an ESC/POS Font A line holds at that width, and 148mm of roll.
//   - Narrow media (<=65mm), for 58mm rolls: 47.9mm, ~31 characters against
//     Font A's 32, 161mm of roll.
//   - Sheet media (>=90mm) keeps the layout this document has always used,
//     including the margin, restated as the rem equivalent of the 8px UA
//     default because the roll branch has to zero it. Measured: A4 and Letter
//     columns at 168.8mm and 174.6mm, the same as before this change, same
//     single page. Sheet printing is not regressed to serve the roll.
// The sheet branch starts at 90mm rather than higher so that small SHEET sizes
// land in it: A6 is 105mm, and giving a sheet printer the roll branch's zero
// horizontal page margin would clip both ends of every line inside its ~5mm
// unprintable border. 90mm sits clear above the largest common roll (80mm) and
// clear below the smallest common sheet (105mm).
//
// NO ROLL WIDTH IS BAKED IN. There is no 80mm constant here and no page of any
// fixed size; the column is whatever the reported media leaves after the
// insets, so a 76mm service gets a column that fits it. The two widths named
// above only pick a font size, and both are UNVERIFIED -- they are the sizes
// thermal printers commonly come in, not a sourced finding about this market,
// and no SuperMega receipt has ever been printed on a thermal printer at all.
// If the founder device test shows one width dominates, or that an owner needs
// to choose, that becomes a setting; nothing here presumes the answer.
//
// What this does NOT establish: whether any given ESC/POS print service renders
// this correctly is open, and so is whether the Android system-print path
// reaches those services at all -- that reframing of roadmap S4 is plausible
// and unsourced, and this change does not depend on it, because sheet geometry
// is wrong for a receipt on every print path. No thermal hardware was involved
// here. Settling it needs the same on-device test S1 and P2 already carry, and
// direct ESC/POS byte output (S4 proper) stays parked.
const RECEIPT_PRINT_STYLES = `
    body { font-family: ui-monospace, 'Courier New', monospace; padding: 1rem 2rem; font-size: 0.9rem; line-height: 1.5; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
    @media print {
      @page { margin: 3mm 0; }
      body { margin: 0; padding: 0 4mm; font-size: 0.7rem; line-height: 1.35; }
    }
    @media print and (max-width: 65mm) {
      body { padding: 0 5mm; font-size: 0.6rem; }
    }
    @media print and (min-width: 90mm) {
      @page { margin: 1cm; }
      body { margin: 0.5rem; padding: 1rem 2rem; font-size: 0.9rem; line-height: 1.5; }
    }`

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
  <style>${RECEIPT_PRINT_STYLES}
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
          <span className="core-eyebrow">{bi('Order record')}</span>
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
          {showSubtotalLine ? <div><span>{bi('Subtotal')}</span><span>{mmk(ack.grossSubtotalMmk)}</span></div> : null}
          {hasPromotion ? <div><span>{bi('Discount')}{ack.promotion.code ? ` (${ack.promotion.code})` : ''}</span><span>−{mmk(ack.promotion.discountMmk ?? 0)}</span></div> : null}
          {hasDeliveryFee ? <div><span>{bi('Delivery')}</span><span>{mmk(ack.delivery.feeMmk ?? 0)}</span></div> : null}
          {hasTax ? <div><span>{bi('Tax')}{ack.tax.code ? ` (${ack.tax.code})` : ''}</span><span>{mmk(ack.tax.taxMmk ?? 0)}</span></div> : null}
          <div className="receipt-total-row"><strong>{bi('Total')}</strong><strong>{mmk(ack.totalMmk)}</strong></div>
          {loyalty && loyalty.redeemedPoints > 0 ? <div><span>{bi('Points redeemed')}</span><span>−{loyalty.redeemedPoints.toLocaleString()}</span></div> : null}
          {loyalty ? <div><span>{bi('Points balance')}</span><span>{loyalty.balancePoints.toLocaleString()}</span></div> : null}
        </div>
        <div className="receipt-dialog-payment">
          <strong>{ack.payment.method}</strong>
          <span className={`status-pill ${ack.payment.status === 'reconciled' ? 'approved' : 'pending'}`}>
            {ack.payment.status === 'reconciled' ? bi('Paid') : bi('Payment pending')}
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
          <button className="core-button compact" onClick={() => openPrintWindow(ack)} type="button">{bi('Print receipt')}</button>
          <button className="core-button compact" onClick={() => void copyReceiptText()} type="button">{bi('Copy text')}</button>
          <button className="core-button compact" onClick={onClose} type="button">{bi('Close')}</button>
        </div>
      </> : null}
    </dialog>
  )
}
