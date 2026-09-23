type SavedRequestReceiptProps = {
  reference: string
  total: string
  expiresAt: string
  expired: boolean
  delivery: 'confirmed' | 'unverified' | 'local'
}

/** Historical display only: never enables an expired or changed quote. */
export function SavedRequestReceipt({ reference, total, expiresAt, expired, delivery }: SavedRequestReceiptProps) {
  return <article className="ecommerce-request-receipt ecommerce-quote-receipt ecommerce-stale-quote" data-current="false" tabIndex={-1} aria-label="Saved request receipt">
    <span className="status-pill bounded">Retained request · not a confirmed order</span>
    <strong>{expired ? 'Saved request — quote expired' : 'Saved request — checkout changed'}</strong>
    <b>{total}</b>
    <small style={{ overflowWrap: 'anywhere' }}>Reference {reference}</small>
    <small>Original quote {expired ? 'expired' : 'expires'} <time dateTime={expiresAt}>{new Date(expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time></small>
    <p>{delivery === 'confirmed' ? 'Company Shop received this request.' : delivery === 'unverified'
      ? 'Saved on this device. Company Shop delivery is not verified here.' : 'This browser demo retained the request.'} Shop still confirms stock, promise, payment, and delivery.</p>
    <small>The saved request has not been deleted. Review the current cart and details before requesting a new total; this receipt cannot confirm the old quote.</small>
  </article>
}
