import type { MouseEventHandler } from 'react'

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
  contextLabel: string
  exceptionCounts: Record<CommerceOrderDeskFilter, number>
  headline: string
  nextRequest: CommerceOrderDeskRequest | null
  onOpenException: (filter: CommerceOrderDeskFilter) => void
  onOpenNext: () => void
  onOpenStore: () => void
  onPrimaryAction: MouseEventHandler<HTMLButtonElement>
  primaryActionDisabled: boolean
  primaryActionLabel: string
  primaryActionOpensStore: boolean
  state: 'attention' | 'ready' | 'setup'
  statusRows: readonly (readonly string[])[]
  summary: string
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
  contextLabel,
  exceptionCounts,
  headline,
  nextRequest,
  onOpenException,
  onOpenNext,
  onOpenStore,
  onPrimaryAction,
  primaryActionDisabled,
  primaryActionLabel,
  primaryActionOpensStore,
  state,
  statusRows,
  summary,
}: CommerceOrderDeskProps) {
  const openExceptionCount = Object.values(exceptionCounts).reduce((total, count) => total + count, 0)
  const activeExceptions = EXCEPTIONS.filter(({ filter }) => exceptionCounts[filter] > 0)
  const setupWithoutOrders = state === 'setup' && !nextRequest && activeOrderCount === 0
  const workItemWithoutExceptions = !openExceptionCount && Boolean(nextRequest || activeOrderCount)
  const focusedEmptyState = state !== 'attention' && !nextRequest && activeOrderCount === 0 && !openExceptionCount

  if (focusedEmptyState) {
    return (
      <section aria-labelledby="commerce-order-desk-title" className="commerce-order-desk commerce-order-focused" data-state={state}>
        <header className="commerce-order-desk-head">
          <div>
            <span className="core-eyebrow">{state === 'setup' ? 'Online store' : 'Online orders'}</span>
            <h2 id="commerce-order-desk-title">{headline}</h2>
            <p>{summary}</p>
          </div>
          <button className="core-button primary" disabled={primaryActionDisabled} onClick={onPrimaryAction} type="button">{primaryActionLabel}</button>
        </header>
      </section>
    )
  }

  return (
    <section aria-labelledby="commerce-order-desk-title" className="commerce-order-desk" data-state={state}>
      <header className="commerce-order-desk-head">
        <div>
          <span className="core-eyebrow">Online orders</span>
          <h2 id="commerce-order-desk-title">{headline}</h2>
          <p>{summary}</p>
        </div>
        <div className="commerce-order-desk-actions">
          {!primaryActionOpensStore ? <button className="core-button secondary" onClick={onOpenStore} type="button">View customer store</button> : null}
          <button className="core-button primary" disabled={primaryActionDisabled} onClick={onPrimaryAction} type="button">{primaryActionLabel}</button>
        </div>
      </header>

      <div aria-label="Commerce operating status" className="commerce-operating-status" role="list">
        {statusRows.map(([label, value]) => <div key={label} role="listitem"><small>{label}</small><strong>{value}</strong></div>)}
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
          </> : activeOrderCount ? <>
            <h3>{activeOrderCount} order{activeOrderCount === 1 ? ' is' : 's are'} in fulfilment.</h3>
            <p>Continue in Shop to pack, hand off, and keep payment and delivery evidence with the order.</p>
          </> : openExceptionCount ? <>
            <h3>Resolve the next exception.</h3>
            <p>{openExceptionCount} recorded check{openExceptionCount === 1 ? '' : 's'} need an owner decision before the order flow is clear.</p>
          </> : state === 'setup' ? <>
            <h3>Finish your store first.</h3>
            <p>Customers cannot submit an order yet. Check the customer view, then save the products and prices you want to offer.</p>
          </> : <>
            <h3>Ready for the next customer.</h3>
            <p>The customer store can take an order request. Shop remains in control of stock, payment, and fulfilment.</p>
          </>}
        </article>

        <aside aria-label="Commerce exceptions" className="commerce-exception-queue">
          <div className="commerce-order-card-head">
            <div><span className="core-eyebrow">Needs attention</span><h3>{openExceptionCount ? `${openExceptionCount} to review` : setupWithoutOrders ? 'No requests yet' : workItemWithoutExceptions ? 'No exception flags' : 'All clear'}</h3></div>
          </div>
          {activeExceptions.length ? <div className="commerce-exception-list">
            {activeExceptions.map(({ filter, label, detail }) => {
              const count = exceptionCounts[filter]
              return <button key={filter} onClick={() => onOpenException(filter)} type="button">
                <span><strong>{label}</strong><small>{detail}</small></span>
                <b>{count}</b>
              </button>
            })}
          </div> : <div className="commerce-exception-clear" data-state={setupWithoutOrders ? 'setup' : 'ready'}>
            <span aria-hidden="true">{setupWithoutOrders ? '→' : '✓'}</span>
            <p><strong>{setupWithoutOrders ? 'Complete store setup' : workItemWithoutExceptions ? 'No extra checks' : 'No items need review'}</strong><small>{setupWithoutOrders ? 'Order checks appear here once customers can submit requests.' : nextRequest ? 'Open the request in Shop to confirm the order.' : activeOrderCount ? 'Continue fulfilment in Shop.' : 'Stock, payment, quotes, delivery, and refunds look clear.'}</small></p>
          </div>}
        </aside>
      </div>
      <p className="commerce-order-context" role="status">{contextLabel}</p>
    </section>
  )
}
