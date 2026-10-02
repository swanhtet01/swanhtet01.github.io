export type CommerceOrderDeskFilter = 'stock' | 'expiring' | 'payment' | 'delivery' | 'refund'

export type CommerceOrderDeskRequest = {
  customer: string
  fulfilment: string
  id: string
  lineCount: number
  placedLabel: string
  quoteLabel: string
  totalLabel: string
  flags: string[]
}

type CommerceOrderDeskProps = {
  activeOrderCount: number
  completedOrderCount: number
  exceptionCounts: Record<CommerceOrderDeskFilter, number>
  nextActionLabel: string
  nextRequest: CommerceOrderDeskRequest | null
  onOpenException: (filter: CommerceOrderDeskFilter) => void
  onOpenNext: () => void
  onOpenShop: () => void
  onOpenStore: () => void
  pendingRequestCount: number
}

const EXCEPTIONS: ReadonlyArray<{ filter: CommerceOrderDeskFilter; label: string; detail: string }> = [
  { filter: 'stock', label: 'Stock', detail: 'Requested quantity needs review' },
  { filter: 'payment', label: 'Payment', detail: 'Manual payment needs evidence' },
  { filter: 'expiring', label: 'Quotes', detail: 'Customer quote is close to expiry' },
  { filter: 'delivery', label: 'Delivery', detail: 'Area, fee or handoff needs review' },
  { filter: 'refund', label: 'Refund', detail: 'Refund evidence needs settlement' },
]

export function CommerceOrderDesk({
  activeOrderCount,
  completedOrderCount,
  exceptionCounts,
  nextActionLabel,
  nextRequest,
  onOpenException,
  onOpenNext,
  onOpenShop,
  onOpenStore,
  pendingRequestCount,
}: CommerceOrderDeskProps) {
  const openExceptionCount = Object.values(exceptionCounts).reduce((total, count) => total + count, 0)

  return (
    <section aria-labelledby="commerce-order-desk-title" className="commerce-order-desk">
      <header className="commerce-order-desk-head">
        <div>
          <span className="core-eyebrow">Order desk</span>
          <h2 id="commerce-order-desk-title">Take every order through delivery.</h2>
          <p>Customer requests, Shop review and fulfilment stay in one accountable flow.</p>
        </div>
        <div className="commerce-order-desk-actions">
          <button className="core-button secondary" onClick={onOpenStore} type="button">View customer store</button>
          <button className="core-button primary" onClick={onOpenNext} type="button">{nextActionLabel}</button>
        </div>
      </header>

      <div aria-label="Commerce order stages" className="commerce-order-stage" role="list">
        <div data-state={pendingRequestCount ? 'active' : 'clear'} role="listitem">
          <span>01</span><strong>Request</strong><small>{pendingRequestCount ? `${pendingRequestCount} waiting` : 'Ready for customer'}</small>
        </div>
        <div data-state={openExceptionCount ? 'attention' : pendingRequestCount ? 'active' : 'clear'} role="listitem">
          <span>02</span><strong>Review</strong><small>{openExceptionCount ? `${openExceptionCount} checks` : pendingRequestCount ? 'Shop confirmation' : 'Queue clear'}</small>
        </div>
        <div data-state={activeOrderCount ? 'active' : completedOrderCount ? 'clear' : 'idle'} role="listitem">
          <span>03</span><strong>Fulfil</strong><small>{activeOrderCount ? `${activeOrderCount} active` : completedOrderCount ? `${completedOrderCount} completed` : 'No active order'}</small>
        </div>
      </div>

      <div className="commerce-order-desk-body">
        <article className="commerce-next-request" data-empty={nextRequest ? 'false' : 'true'}>
          <div className="commerce-order-card-head">
            <span className="core-eyebrow">Next request</span>
            {nextRequest ? <span className="status-pill bounded">{nextRequest.fulfilment}</span> : null}
          </div>
          {nextRequest ? <>
            <h3>{nextRequest.customer}</h3>
            <p>{nextRequest.lineCount} line{nextRequest.lineCount === 1 ? '' : 's'} · {nextRequest.totalLabel}</p>
            <div className="commerce-order-meta">
              <span><small>Received</small><strong>{nextRequest.placedLabel}</strong></span>
              <span><small>Quote</small><strong>{nextRequest.quoteLabel}</strong></span>
            </div>
            {nextRequest.flags.length ? <div aria-label="Request checks" className="commerce-order-flags">
              {nextRequest.flags.map((flag) => <span key={flag}>{flag}</span>)}
            </div> : <p className="commerce-order-clear">Ready for Shop review.</p>}
            <details className="commerce-order-reference"><summary>Request reference</summary><small>{nextRequest.id}</small></details>
            <button className="core-button primary" onClick={onOpenNext} type="button">Open request in Shop</button>
          </> : <>
            <h3>No request is waiting.</h3>
            <p>The customer store is ready to collect the next order request.</p>
            <button className="core-button primary" onClick={onOpenStore} type="button">Open customer store</button>
          </>}
        </article>

        <aside aria-label="Commerce exceptions" className="commerce-exception-queue">
          <div className="commerce-order-card-head">
            <div><span className="core-eyebrow">Exceptions</span><h3>{openExceptionCount ? `${openExceptionCount} need attention` : 'Queue clear'}</h3></div>
            <button className="text-link" onClick={onOpenShop} type="button">Open Shop</button>
          </div>
          <div className="commerce-exception-list">
            {EXCEPTIONS.map(({ filter, label, detail }) => {
              const count = exceptionCounts[filter]
              return <button disabled={!count} key={filter} onClick={() => onOpenException(filter)} type="button">
                <span><strong>{label}</strong><small>{count ? detail : 'No action needed'}</small></span>
                <b>{count}</b>
              </button>
            })}
          </div>
        </aside>
      </div>
    </section>
  )
}
