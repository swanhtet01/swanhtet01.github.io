import { useState } from 'react'

import type { WebsiteEcommerceHandoffContext } from '../product-handoff'
import {
  type CatalogItem,
  type CommerceOrder,
  type CommerceView,
  type FulfillmentStatus,
  type PaymentStatus,
  formatMmk,
  formatYangonTime,
  fulfillmentActionLabel,
  fulfillmentStatusLabels,
  getOrderTotal,
  paymentActionLabel,
  paymentMethodLabels,
  paymentStatusLabels,
} from './ecommerce-model'

type CommerceWorkspacesProps = {
  catalog: CatalogItem[]
  orders: CommerceOrder[]
  selectedOrderId: string
  view: CommerceView
  onOpenOrder: (orderId: string) => void
  onReceiveStock: (sku: string) => void
  onRequestFulfillment: (orderId: string) => void
  onRequestPayment: (orderId: string) => void
  onRequestWebsiteIntake: () => void
  onSelectOrder: (orderId: string) => void
  websiteHandoff: WebsiteEcommerceHandoffContext | null
  websiteHandoffAccepted: boolean
}

type OrderFilter = 'attention' | 'all'
type PaymentFilter = 'review' | 'all'

const fulfillmentStages: FulfillmentStatus[] = [
  'awaiting_confirmation',
  'picking',
  'ready_for_dispatch',
  'out_for_delivery',
  'delivered',
]

const fulfillmentLanes: Array<{ label: string; statuses: FulfillmentStatus[] }> = [
  { label: 'Intake / hold', statuses: ['awaiting_confirmation', 'held'] },
  { label: 'Picking', statuses: ['picking'] },
  { label: 'Ready', statuses: ['ready_for_dispatch'] },
  { label: 'On route', statuses: ['out_for_delivery'] },
  { label: 'Complete', statuses: ['delivered'] },
]

function paymentTone(status: PaymentStatus) {
  if (status === 'reconciled') return 'success'
  if (status === 'exception') return 'danger'
  if (status === 'evidence_submitted') return 'warning'
  return 'neutral'
}

function fulfillmentTone(status: FulfillmentStatus) {
  if (status === 'delivered') return 'success'
  if (status === 'held') return 'danger'
  if (status === 'ready_for_dispatch' || status === 'out_for_delivery') return 'warning'
  return 'neutral'
}

function StatusPill({ label, tone }: { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }) {
  return <span className="eco-status-pill" data-tone={tone}>{label}</span>
}

function OrderQueue({
  filter,
  orders,
  selectedOrderId,
  onFilterChange,
  onSelectOrder,
}: {
  filter: OrderFilter
  orders: CommerceOrder[]
  selectedOrderId: string
  onFilterChange: (filter: OrderFilter) => void
  onSelectOrder: (orderId: string) => void
}) {
  const visibleOrders = filter === 'all'
    ? orders
    : orders.filter((order) => order.fulfillmentStatus !== 'delivered' || order.paymentStatus !== 'reconciled')

  return (
    <section className="eco-panel eco-queue-panel" aria-labelledby="eco-orders-heading">
      <div className="eco-panel-head">
        <div>
          <span className="eco-eyebrow">Order queue</span>
          <h2 id="eco-orders-heading">{visibleOrders.length} visible records</h2>
        </div>
        <div className="eco-mini-tabs" aria-label="Filter orders">
          <button aria-pressed={filter === 'attention'} onClick={() => onFilterChange('attention')} type="button">Needs work</button>
          <button aria-pressed={filter === 'all'} onClick={() => onFilterChange('all')} type="button">All</button>
        </div>
      </div>
      <div className="eco-order-queue">
        {visibleOrders.map((order) => (
          <button
            aria-current={selectedOrderId === order.id ? 'true' : undefined}
            className="eco-order-row"
            key={order.id}
            onClick={() => onSelectOrder(order.id)}
            type="button"
          >
            <span className="eco-record-dot" data-tone={fulfillmentTone(order.fulfillmentStatus)} />
            <span>
              <strong>{order.customer}</strong>
              <small>{order.id} · {order.township}</small>
            </span>
            <span>
              <b>{formatMmk(getOrderTotal(order))}</b>
              <small>{paymentStatusLabels[order.paymentStatus]}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function FulfillmentTimeline({ order }: { order: CommerceOrder }) {
  const currentIndex = fulfillmentStages.indexOf(order.fulfillmentStatus)

  if (order.fulfillmentStatus === 'held') {
    return <div className="eco-hold-banner"><strong>Fulfilment held</strong><span>Resolve the payment exception, then request a human release.</span></div>
  }

  return (
    <ol className="eco-timeline" aria-label="Fulfilment progress">
      {fulfillmentStages.map((stage, index) => (
        <li className={index < currentIndex ? 'is-complete' : index === currentIndex ? 'is-current' : ''} key={stage}>
          <i aria-hidden="true" />
          <span>{fulfillmentStatusLabels[stage]}</span>
        </li>
      ))}
    </ol>
  )
}

function OrderDetail({
  order,
  onRequestFulfillment,
  onRequestPayment,
}: {
  order: CommerceOrder
  onRequestFulfillment: (orderId: string) => void
  onRequestPayment: (orderId: string) => void
}) {
  const fulfillmentAction = fulfillmentActionLabel(order)
  const paymentAction = paymentActionLabel(order)

  return (
    <section className="eco-panel eco-order-detail" aria-labelledby="eco-order-detail-heading">
      <header className="eco-detail-head">
        <div>
          <span className="eco-eyebrow">{order.id}</span>
          <h2 id="eco-order-detail-heading">{order.customer} · {order.township}</h2>
          <p>{order.channel} · {order.phoneSuffix} · {formatYangonTime(order.createdAt)} MMT</p>
        </div>
        <StatusPill label={fulfillmentStatusLabels[order.fulfillmentStatus]} tone={fulfillmentTone(order.fulfillmentStatus)} />
      </header>

      <div className="eco-detail-scroll">
        <FulfillmentTimeline order={order} />

        <section className="eco-order-lines" aria-label="Order lines">
          {order.lines.map((line) => (
            <div key={line.sku}>
              <span><strong>{line.name}</strong><small>{line.sku} · {formatMmk(line.unitPriceMmk)} each</small></span>
              <b>× {line.quantity}</b>
              <strong>{formatMmk(line.quantity * line.unitPriceMmk)}</strong>
            </div>
          ))}
          <footer><span>Order total</span><strong>{formatMmk(getOrderTotal(order))}</strong></footer>
        </section>

        <div className="eco-control-grid">
          <section>
            <span className="eco-control-label">Payment record</span>
            <div className="eco-control-title"><strong>{paymentMethodLabels[order.paymentMethod]}</strong><StatusPill label={paymentStatusLabels[order.paymentStatus]} tone={paymentTone(order.paymentStatus)} /></div>
            <p>Evidence: {order.paymentEvidence ?? 'No reference recorded'}</p>
            <small>Manual status only. No gateway or bank verification is connected.</small>
            {paymentAction ? <button className="eco-text-button" onClick={() => onRequestPayment(order.id)} type="button">{paymentAction} →</button> : null}
            {order.paymentStatus === 'cash_due' && order.fulfillmentStatus !== 'delivered' ? <em>Cash collection can be recorded after delivery is confirmed.</em> : null}
          </section>
          <section>
            <span className="eco-control-label">Fulfilment record</span>
            <div className="eco-control-title"><strong>{order.deliveryMethod}</strong><StatusPill label={fulfillmentStatusLabels[order.fulfillmentStatus]} tone={fulfillmentTone(order.fulfillmentStatus)} /></div>
            <p>{order.note ?? 'No special handling note.'}</p>
            <small>Every stage change requires an accountable operator and evidence reference.</small>
            {fulfillmentAction ? <button className="eco-text-button" onClick={() => onRequestFulfillment(order.id)} type="button">{fulfillmentAction} →</button> : null}
          </section>
        </div>
      </div>
    </section>
  )
}

function OrdersWorkspace({
  filter,
  orders,
  selectedOrder,
  onFilterChange,
  onRequestFulfillment,
  onRequestPayment,
  onRequestWebsiteIntake,
  onSelectOrder,
  websiteHandoff,
  websiteHandoffAccepted,
}: {
  filter: OrderFilter
  orders: CommerceOrder[]
  selectedOrder: CommerceOrder
  onFilterChange: (filter: OrderFilter) => void
  onRequestFulfillment: (orderId: string) => void
  onRequestPayment: (orderId: string) => void
  onRequestWebsiteIntake: () => void
  onSelectOrder: (orderId: string) => void
  websiteHandoff: WebsiteEcommerceHandoffContext | null
  websiteHandoffAccepted: boolean
}) {
  return (
    <div className="eco-orders-stack">
      {websiteHandoff ? (
        <section className="eco-website-intake" aria-labelledby="eco-website-intake-title">
          <span className="eco-mode-badge"><i />Website handoff</span>
          <div>
            <strong id="eco-website-intake-title">{websiteHandoff.display ? `${websiteHandoff.display.siteName} · ${websiteHandoff.display.pagePath}` : 'Accepted Website revision'}</strong>
            <small>{websiteHandoff.display ? `${websiteHandoff.display.pageHeadline} · approved by ${websiteHandoff.display.approvedBy}` : 'The source workspace changed after acceptance; only the audit references remain.'}</small>
          </div>
          <div>
            <strong>{websiteHandoff.handoff.intake.quantity} × {websiteHandoff.handoff.intake.sku}</strong>
            <small>Non-PII intake · no order, reservation, payment, or customer contact</small>
          </div>
          <button className="eco-button eco-button-primary" disabled={websiteHandoffAccepted} onClick={onRequestWebsiteIntake} type="button">
            {websiteHandoffAccepted ? 'Added locally' : 'Review intake'}
          </button>
        </section>
      ) : null}
      <div className="eco-two-pane">
        <OrderQueue filter={filter} orders={orders} selectedOrderId={selectedOrder.id} onFilterChange={onFilterChange} onSelectOrder={onSelectOrder} />
        <OrderDetail order={selectedOrder} onRequestFulfillment={onRequestFulfillment} onRequestPayment={onRequestPayment} />
      </div>
    </div>
  )
}

function CatalogWorkspace({ catalog, onReceiveStock }: { catalog: CatalogItem[]; onReceiveStock: (sku: string) => void }) {
  const boundaryCount = catalog.filter((item) => item.onHand <= item.reorderAt).length

  return (
    <section className="eco-panel eco-table-panel" aria-labelledby="eco-catalog-heading">
      <div className="eco-panel-head">
        <div>
          <span className="eco-eyebrow">Catalog control</span>
          <h2 id="eco-catalog-heading">Products and stock boundaries</h2>
        </div>
        <span className="eco-panel-note">{boundaryCount} at reorder boundary</span>
      </div>
      <div className="eco-table-wrap">
        <table className="eco-data-table">
          <caption>Local demo catalog. Receiving stock requires human approval.</caption>
          <thead><tr><th>Product</th><th>Status</th><th>On hand</th><th>Reorder at</th><th>Price</th><th><span className="eco-sr-only">Action</span></th></tr></thead>
          <tbody>
            {catalog.map((item) => (
              <tr key={item.sku}>
                <th scope="row"><strong>{item.name}</strong><small>{item.sku} · {item.variant}</small></th>
                <td><StatusPill label={item.onHand <= item.reorderAt ? 'Reorder' : item.active ? 'Active' : 'Paused'} tone={item.onHand <= item.reorderAt ? 'warning' : 'success'} /></td>
                <td className={item.onHand <= item.reorderAt ? 'eco-warning-text' : ''}>{item.onHand}</td>
                <td>{item.reorderAt}</td>
                <td>{formatMmk(item.priceMmk)}</td>
                <td><button className="eco-text-button" onClick={() => onReceiveStock(item.sku)} type="button">Receive +10</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="eco-panel-boundary">Catalog and stock figures are scenario records in browser memory. No storefront, supplier, or warehouse source is connected.</p>
    </section>
  )
}

function FulfillmentWorkspace({
  orders,
  selectedOrder,
  onOpenOrder,
  onRequestFulfillment,
  onSelectOrder,
}: {
  orders: CommerceOrder[]
  selectedOrder: CommerceOrder
  onOpenOrder: (orderId: string) => void
  onRequestFulfillment: (orderId: string) => void
  onSelectOrder: (orderId: string) => void
}) {
  const actionLabel = fulfillmentActionLabel(selectedOrder)

  return (
    <div className="eco-fulfillment-workspace">
      <section className="eco-panel eco-board-panel" aria-labelledby="eco-fulfillment-heading">
        <div className="eco-panel-head">
          <div>
            <span className="eco-eyebrow">Fulfilment board</span>
            <h2 id="eco-fulfillment-heading">Handoffs by recorded stage</h2>
          </div>
          <span className="eco-panel-note">Local states · owner controlled</span>
        </div>
        <div className="eco-fulfillment-board">
          {fulfillmentLanes.map((lane) => {
            const laneOrders = orders.filter((order) => lane.statuses.includes(order.fulfillmentStatus))
            return (
              <section className="eco-lane" key={lane.label}>
                <header><span>{lane.label}</span><strong>{laneOrders.length}</strong></header>
                <div>
                  {laneOrders.map((order) => (
                    <button aria-current={selectedOrder.id === order.id ? 'true' : undefined} key={order.id} onClick={() => onSelectOrder(order.id)} type="button">
                      <strong>{order.id}</strong>
                      <span>{order.customer}</span>
                      <small>{order.township} · {paymentStatusLabels[order.paymentStatus]}</small>
                    </button>
                  ))}
                  {!laneOrders.length ? <p>No order</p> : null}
                </div>
              </section>
            )
          })}
        </div>
      </section>

      <section className="eco-panel eco-selected-control" aria-label="Selected fulfilment record">
        <div><span className="eco-eyebrow">Selected handoff</span><strong>{selectedOrder.id} · {selectedOrder.customer}</strong><small>{fulfillmentStatusLabels[selectedOrder.fulfillmentStatus]} · {selectedOrder.deliveryMethod}</small></div>
        <div className="eco-selected-actions">
          <button className="eco-button eco-button-quiet" onClick={() => onOpenOrder(selectedOrder.id)} type="button">Open full order</button>
          {actionLabel ? <button className="eco-button eco-button-primary" onClick={() => onRequestFulfillment(selectedOrder.id)} type="button">{actionLabel}</button> : <span>{selectedOrder.fulfillmentStatus === 'held' ? 'Resolve the payment exception first.' : 'No further fulfilment action.'}</span>}
        </div>
      </section>
    </div>
  )
}

function PaymentsWorkspace({
  filter,
  orders,
  selectedOrder,
  onFilterChange,
  onOpenOrder,
  onRequestPayment,
  onSelectOrder,
}: {
  filter: PaymentFilter
  orders: CommerceOrder[]
  selectedOrder: CommerceOrder
  onFilterChange: (filter: PaymentFilter) => void
  onOpenOrder: (orderId: string) => void
  onRequestPayment: (orderId: string) => void
  onSelectOrder: (orderId: string) => void
}) {
  const reviewStatuses: PaymentStatus[] = ['evidence_needed', 'evidence_submitted', 'exception']
  const visibleOrders = filter === 'all' ? orders : orders.filter((order) => reviewStatuses.includes(order.paymentStatus))
  const actionLabel = paymentActionLabel(selectedOrder)

  return (
    <div className="eco-two-pane">
      <section className="eco-panel eco-queue-panel" aria-labelledby="eco-payment-queue-heading">
        <div className="eco-panel-head">
          <div><span className="eco-eyebrow">Payment status</span><h2 id="eco-payment-queue-heading">{visibleOrders.length} visible records</h2></div>
          <div className="eco-mini-tabs" aria-label="Filter payment records">
            <button aria-pressed={filter === 'review'} onClick={() => onFilterChange('review')} type="button">Needs review</button>
            <button aria-pressed={filter === 'all'} onClick={() => onFilterChange('all')} type="button">All</button>
          </div>
        </div>
        <div className="eco-payment-list">
          {visibleOrders.map((order) => (
            <button aria-current={selectedOrder.id === order.id ? 'true' : undefined} key={order.id} onClick={() => onSelectOrder(order.id)} type="button">
              <span><strong>{order.id}</strong><small>{order.customer} · {paymentMethodLabels[order.paymentMethod]}</small></span>
              <span><StatusPill label={paymentStatusLabels[order.paymentStatus]} tone={paymentTone(order.paymentStatus)} /><b>{formatMmk(getOrderTotal(order))}</b></span>
            </button>
          ))}
          {!visibleOrders.length ? <p className="eco-empty-state"><span>&gt;_</span>No payment record matches this filter.</p> : null}
        </div>
      </section>

      <section className="eco-panel eco-payment-detail" aria-labelledby="eco-payment-detail-heading">
        <header className="eco-detail-head">
          <div><span className="eco-eyebrow">Manual reconciliation</span><h2 id="eco-payment-detail-heading">{selectedOrder.id}</h2><p>{selectedOrder.customer} · {selectedOrder.channel} · {formatYangonTime(selectedOrder.createdAt)} MMT</p></div>
          <StatusPill label={paymentStatusLabels[selectedOrder.paymentStatus]} tone={paymentTone(selectedOrder.paymentStatus)} />
        </header>
        <div className="eco-reconciliation-card">
          <span><small>Method</small><strong>{paymentMethodLabels[selectedOrder.paymentMethod]}</strong></span>
          <span><small>Expected amount</small><strong>{formatMmk(getOrderTotal(selectedOrder))}</strong></span>
          <span><small>Evidence reference</small><strong>{selectedOrder.paymentEvidence ?? 'Not recorded'}</strong></span>
          <span><small>Fulfilment</small><strong>{fulfillmentStatusLabels[selectedOrder.fulfillmentStatus]}</strong></span>
        </div>
        <div className="eco-reconciliation-boundary">
          <span className="eco-eyebrow">What this status means</span>
          <p>The operator compares customer evidence with an authorized source outside this prototype, then records only the review result here. QR labels are payment-method labels, not live gateway connections.</p>
        </div>
        <div className="eco-payment-actions">
          <button className="eco-button eco-button-quiet" onClick={() => onOpenOrder(selectedOrder.id)} type="button">Open order</button>
          {actionLabel ? <button className="eco-button eco-button-primary" onClick={() => onRequestPayment(selectedOrder.id)} type="button">{actionLabel}</button> : null}
          {selectedOrder.paymentStatus === 'cash_due' && selectedOrder.fulfillmentStatus !== 'delivered' ? <small>Cash remains due until delivery is confirmed.</small> : null}
          {selectedOrder.paymentStatus === 'reconciled' ? <small>No further payment action is proposed.</small> : null}
        </div>
      </section>
    </div>
  )
}

export function CommerceWorkspaces({
  catalog,
  orders,
  selectedOrderId,
  view,
  onOpenOrder,
  onReceiveStock,
  onRequestFulfillment,
  onRequestPayment,
  onRequestWebsiteIntake,
  onSelectOrder,
  websiteHandoff,
  websiteHandoffAccepted,
}: CommerceWorkspacesProps) {
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('attention')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('review')
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? orders[0]

  if (!selectedOrder) return <p className="eco-empty-state"><span>&gt;_</span>No local orders are available.</p>

  if (view === 'catalog') return <CatalogWorkspace catalog={catalog} onReceiveStock={onReceiveStock} />
  if (view === 'fulfillment') return <FulfillmentWorkspace orders={orders} selectedOrder={selectedOrder} onOpenOrder={onOpenOrder} onRequestFulfillment={onRequestFulfillment} onSelectOrder={onSelectOrder} />
  if (view === 'payments') return <PaymentsWorkspace filter={paymentFilter} orders={orders} selectedOrder={selectedOrder} onFilterChange={setPaymentFilter} onOpenOrder={onOpenOrder} onRequestPayment={onRequestPayment} onSelectOrder={onSelectOrder} />

  return <OrdersWorkspace filter={orderFilter} orders={orders} selectedOrder={selectedOrder} onFilterChange={setOrderFilter} onRequestFulfillment={onRequestFulfillment} onRequestPayment={onRequestPayment} onRequestWebsiteIntake={onRequestWebsiteIntake} onSelectOrder={onSelectOrder} websiteHandoff={websiteHandoff} websiteHandoffAccepted={websiteHandoffAccepted} />
}
