import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { CommerceState } from './commerce-workspace'
import type { ShopProfitControlBoard } from './shop-profit-control'
import type { ShopBatchProfitControlView } from './ShopTodayAdvanced'
import { projectShopTodaySalesPulse } from './shop-today-sales'
import { ProductPhoto } from './ProductPhoto'

const ShopTodayAdvancedPanel = lazy(() => import('./ShopTodayAdvanced').then((module) => ({ default: module.ShopTodayAdvanced })))

export type ShopTodayMetric = {
  label: string
  value: string
  detail: string
  tone?: 'attention' | 'ready'
}

export type ShopTodayModule = {
  detail: string
  label: string
  status: string
  to: string
  tone?: 'attention' | 'ready'
}

export type ShopTodayCloseQueue = {
  actionLabel: string
  exceptionCount: number
  latestCloseRecorded: boolean
  orderCount: number
  paymentMethods: Array<{
    paymentMethod: string
    totalMmk: number
  }>
  target: string
  tone: 'attention' | 'ready'
  totalMmk: number
}

export type ShopTodayRecordStatus = {
  actionLabel: string | null
  badge: string
  detail: string
  label: string
  target: string | null
}

type ShopTodayProps = {
  accountingExport?: {
    businessDate: string
    mappingReady: boolean
    onDownload: () => void
    totalMmk: number
  } | null
  batchProfitControl?: ShopBatchProfitControlView
  catalogReady: boolean
  closeQueue: ShopTodayCloseQueue
  metrics: ShopTodayMetric[]
  modules: ShopTodayModule[]
  productImageScope: string
  nextAction: string
  nextActionLabel: string
  nextDetail: string
  nextOwnerGate: string
  nextTo: string
  nextTrack: 'Review' | 'Orders' | 'Inventory' | 'Counter'
  commerce: CommerceState
  localBatchFirstUseAllowed: boolean
  profitControl: ShopProfitControlBoard
  recordStatus: ShopTodayRecordStatus
}

const formatMmk = (value: number) => `${value.toLocaleString('en-US')} MMK`

function taskLink(title: string, detail: string, action: string, to: string, ownerGate?: string) {
  return <Link aria-description={ownerGate} to={to}><span><strong>{title}</strong><small>{detail}</small></span><b>{action}</b></Link>
}

const yangonDay = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Yangon',
  weekday: 'short',
})

function ShopSummaryIcon({ label }: { label: string }) {
  if (label === "Today's sales") return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M4 4v16h16M8 15v-3m5 3V8m5 7V5" /></svg>
  if (label === 'Open orders') return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M6 3.75h8.5L19 8.25v12H6zM14 4v5h5M9 13h7m-7 4h7" /></svg>
  return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m12 3 9 17H3zM12 9v5m0 3h.01" /></svg>
}

function formatSalesComparison(deltaBasisPoints: number | null, previousGrossMmk: number) {
  if (!previousGrossMmk || deltaBasisPoints === null) return 'No sales yesterday'
  if (deltaBasisPoints === 0) return 'Level with yesterday'
  const percentage = Math.abs(deltaBasisPoints) / 100
  return `${deltaBasisPoints > 0 ? 'Up' : 'Down'} ${percentage.toLocaleString('en-US', { maximumFractionDigits: 1 })}% vs yesterday`
}

function privacySafeQueueCustomer(customer: string) {
  const normalized = customer.trim()
  if (!normalized) return 'Walk-in'
  const withoutContactNumber = normalized
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/gu, ' ')
    .replace(/[·|,/-]+\s*$/u, '')
    .replace(/\s{2,}/gu, ' ')
    .trim()
  return withoutContactNumber || 'Customer'
}

export function ShopToday({ accountingExport = null, batchProfitControl, catalogReady, closeQueue, commerce, localBatchFirstUseAllowed, metrics, modules, nextAction, nextActionLabel, nextDetail, nextOwnerGate, nextTo, nextTrack, productImageScope, profitControl, recordStatus }: ShopTodayProps) {
  const [activityAsOf] = useState(() => Date.now())
  const [advancedControlsLoaded, setAdvancedControlsLoaded] = useState(false)
  const salesPulse = useMemo(() => projectShopTodaySalesPulse(commerce, activityAsOf), [activityAsOf, commerce])
  const activeOrders = useMemo(() => commerce.orders
    .filter((order) => order.status !== 'completed' && order.status !== 'cancelled')
    .sort((left, right) => {
      if (left.paymentStatus !== right.paymentStatus) return left.paymentStatus === 'pending' ? -1 : 1
      const leftTime = Date.parse(left.promisedAt ?? left.createdAt)
      const rightTime = Date.parse(right.promisedAt ?? right.createdAt)
      return (Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER)
        - (Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER)
    })
    .slice(0, 5), [commerce.orders])
  const openOrderCount = commerce.orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled').length
  const visibleProducts = commerce.items.slice(0, 6)
  const summaryMetrics = ["Today's sales", 'Open orders', 'Stock alerts']
    .flatMap((label) => metrics.find((metric) => metric.label === label) ?? [])
  const financeModule = modules.find((module) => module.label === 'Finance controls')
  const primaryTask = (recordStatus.badge === 'Paused' || recordStatus.badge === 'Backup advised') && recordStatus.target && recordStatus.actionLabel
    ? { title: recordStatus.actionLabel, detail: recordStatus.detail, action: recordStatus.badge, target: recordStatus.target, ownerGate: recordStatus.detail }
    : { title: nextAction, detail: nextDetail, action: nextActionLabel, target: nextTo, ownerGate: nextOwnerGate }
  const attentionPriority = recordStatus.badge === 'Paused' || recordStatus.badge === 'Backup advised'
    ? undefined
    : profitControl.priorities.find((priority) => priority.id !== 'close_ready')
  const maximumPulseMmk = Math.max(1, ...salesPulse.points.map((point) => point.grossMmk))

  return <div className="shop-today">
    <section aria-labelledby="shop-today-title" className="shop-today-overview">
      <header className="shop-today-heading">
        <div>
          <h2 id="shop-today-title">Today</h2>
          <p>{yangonDay.format(new Date(activityAsOf))}</p>
        </div>
        {catalogReady ? <Link className="core-button primary" to="/shop/?tab=counter">New sale</Link> : null}
      </header>
      <div className="shop-today-metrics" aria-label="Shop summary">
        {summaryMetrics.map((metric, index) => <article data-index={index} data-tone={metric.tone ?? 'ready'} key={metric.label}>
          <span className="shop-today-metric-icon"><ShopSummaryIcon label={metric.label} /></span>
          <small>{metric.label}</small>
          <strong>{metric.value}</strong>
          <span>{metric.detail}</span>
        </article>)}
      </div>
    </section>

    <section aria-label="Shop operating view" className="shop-operations-board" data-track={nextTrack.toLowerCase()}>
      <article aria-label="Product list" className="shop-operations-card shop-stock-watch-card">
        <header><span><strong>Products</strong></span><b>{commerce.items.length} total</b></header>
        <div className="shop-operating-list shop-product-list">
          {visibleProducts.length ? visibleProducts.map((item) => <Link data-low-stock={item.onHand <= item.reorderAt} key={item.sku} to="/shop/?tab=inventory">
            <ProductPhoto className="shop-today-product-photo" fallback={<span aria-hidden="true" className="shop-today-product-fallback">{item.name.trim().slice(0, 1).toUpperCase()}</span>} scope={productImageScope} sku={item.sku} />
            <span><strong>{item.name}</strong><small>{item.onHand} in stock{item.onHand <= item.reorderAt ? ' · reorder' : ''}</small></span>
            <span><b>{formatMmk(item.price)}</b></span>
          </Link>) : <div className="shop-operating-empty"><strong>No products to sell yet</strong><span>Add one item to start, or import a catalog.</span><Link className="core-button primary" to="/shop/?tab=inventory#shop-catalog-create">Add first product</Link><Link className="text-link" to="/shop/?tab=inventory#shop-catalog-import">Import a CSV <span aria-hidden="true">→</span></Link></div>}
        </div>
        {commerce.items.length ? <footer><Link to="/shop/?tab=inventory">View products <span aria-hidden="true">→</span></Link></footer> : null}
      </article>

      <article aria-label="Order queue" className="shop-operations-card shop-order-queue-card">
        <header><span><strong>Order queue</strong></span><b>{openOrderCount} open</b></header>
        <div className="shop-operating-list">
          {activeOrders.length ? activeOrders.map((order) => <Link key={order.id} to="/shop/?tab=orders#shop-order-queue">
            <span><strong>{order.item}</strong><small>{privacySafeQueueCustomer(order.customer)} · {order.quantity} item{order.quantity === 1 ? '' : 's'}</small></span>
            <span><b>{formatMmk(order.total)}</b><small>{order.status} · {order.paymentStatus === 'pending' ? 'payment due' : 'paid'}</small></span>
          </Link>) : <p className="shop-operating-empty"><strong>Queue clear</strong><span>No open orders need fulfilment.</span></p>}
        </div>
        <footer><Link to="/shop/?tab=orders#shop-order-queue">Open all orders <span aria-hidden="true">→</span></Link></footer>
      </article>

      <aside className="shop-operations-rail">
        <article aria-label="Sales insight" className="shop-sales-pulse">
          <header><span><small>Sales insight</small><strong>{formatMmk(salesPulse.today.grossMmk)}</strong></span>{salesPulse.today.count ? <b data-direction={salesPulse.deltaBasisPoints === null ? 'neutral' : salesPulse.deltaBasisPoints >= 0 ? 'up' : 'down'}>{formatSalesComparison(salesPulse.deltaBasisPoints, salesPulse.previous.grossMmk)}</b> : null}</header>
          {salesPulse.today.count ? <>
            <div aria-label="Retained completed sales by three-hour Yangon period" className="shop-sales-bars">
            {salesPulse.points.map((point) => <span aria-label={`${point.label}: ${formatMmk(point.grossMmk)}`} key={point.hour}>
              <i aria-hidden="true" style={{ height: `${Math.max(point.grossMmk ? 12 : 2, Math.round((point.grossMmk / maximumPulseMmk) * 100))}%` }} />
              <small>{point.hour % 6 === 0 ? point.label : ''}</small>
            </span>)}
            </div>
            <p>{salesPulse.today.count} completed {salesPulse.today.count === 1 ? 'sale' : 'sales'} today</p>
          </> : <div className="shop-sales-empty"><strong>No sales yet today</strong><span>Completed counter sales will appear here.</span></div>}
        </article>

        <section aria-label="Quick tasks" className="shop-next-focus">
          <header className="shop-next-focus-copy"><h3>Quick tasks</h3></header>
          <div className="shop-operating-list shop-task-list">
            {attentionPriority ? <Link data-priority-id={attentionPriority.id} data-state={profitControl.state} to={attentionPriority.target}>
              <span><strong>{attentionPriority.title}</strong><small><strong>Next:</strong> {attentionPriority.actionLabel}</small></span>
            </Link> : taskLink(primaryTask.title, primaryTask.detail, primaryTask.action, primaryTask.target, primaryTask.ownerGate)}

            {financeModule && (accountingExport || closeQueue.orderCount || closeQueue.exceptionCount) ? accountingExport ? <button className="shop-task-row shop-finance-task" data-shop-accounting-export="accounting-csv-v1" onClick={accountingExport.onDownload} type="button">
              <span><strong>Export</strong><small>Accountant CSV · {accountingExport.businessDate} · {accountingExport.mappingReady ? 'Mapped' : 'Unmapped'}</small></span>
            </button> : <Link aria-label="Cash and wallet close queue" aria-description="Not reconciled. Expected from completed, reconciled Shop orders. Wallet and bank settlement is not independently confirmed." to={closeQueue.target}>
              <span><strong>Close payments</strong><small>{closeQueue.paymentMethods.length
                ? closeQueue.paymentMethods.map((method) => `${method.paymentMethod} ${formatMmk(method.totalMmk)}`).join(' · ')
                : closeQueue.exceptionCount ? `${closeQueue.exceptionCount} exceptions`
                  : closeQueue.orderCount ? `${closeQueue.orderCount} ready · ${formatMmk(closeQueue.totalMmk)}`
                    : closeQueue.latestCloseRecorded ? 'Close on file' : 'Nothing to close'}</small></span>
              <b>{closeQueue.actionLabel}</b>
            </Link> : null}

          </div>
        </section>
      </aside>
    </section>

    <details aria-label="Advanced Shop controls" className="shop-today-workspaces shop-today-advanced" onToggle={(event) => { if (event.currentTarget.open) setAdvancedControlsLoaded(true) }}>
      <summary><span><strong>Advanced controls</strong><small>Costs, trends and operations</small></span><b>{profitControl.openPriorityCount ? profitControl.openPriorityCount + ' priorities' : 'Explore'}</b></summary>
      {advancedControlsLoaded ? <Suspense fallback={<p aria-live="polite" className="panel-note">Loading advanced controls…</p>}><ShopTodayAdvancedPanel batchProfitControl={batchProfitControl} commerce={commerce} localBatchFirstUseAllowed={localBatchFirstUseAllowed} modules={modules} /></Suspense> : null}
    </details>
  </div>
}
