import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { CommerceState } from './commerce-workspace'
import type { ShopProfitControlBoard } from './shop-profit-control'
import type { ShopBatchProfitControlView } from './ShopTodayAdvanced'
import { bi } from './i18n-actions'
import { readUiLocale, uiText } from './ui-locale'
import { hasShopTodaySalesPattern, projectShopTodaySalesPulse } from './shop-today-sales'
import { prioritizeShopTodayProducts } from './shop-today-priority'
import { ProductPhoto } from './ProductPhoto'
import { shopOrderLink } from './shop-order-target'

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
  return <Link aria-description={ownerGate} to={to}><span><strong>{uiText(title)}</strong><small>{uiText(detail)}</small></span><b>{uiText(action)}</b></Link>
}

const yangonDay = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Yangon',
  weekday: 'short',
})
const yangonDayMyanmar = new Intl.DateTimeFormat('my-MM', {
  day: 'numeric', month: 'short', timeZone: 'Asia/Yangon', weekday: 'short',
})

function localizeMetricDetail(detail: string): string {
  if (readUiLocale() !== 'my') return detail
  const actionCount = /^(\d+) need action$/.exec(detail)
  if (actionCount) return `${actionCount[1]} ${uiText('need action')}`
  const completedCount = /^(\d+) completed · before returns$/.exec(detail)
  if (completedCount) return `${completedCount[1]} ${uiText('completed')} · ${uiText('before returns')}`
  return uiText(detail)
}

function ShopSummaryIcon({ label }: { label: string }) {
  if (label === "Today's sales") return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M4 4v16h16M8 15v-3m5 3V8m5 7V5" /></svg>
  if (label === 'Open orders') return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M6 3.75h8.5L19 8.25v12H6zM14 4v5h5M9 13h7m-7 4h7" /></svg>
  return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m12 3 9 17H3zM12 9v5m0 3h.01" /></svg>
}

function formatSalesComparison(deltaBasisPoints: number | null, previousGrossMmk: number) {
  if (!previousGrossMmk || deltaBasisPoints === null) return uiText('No sales yesterday')
  if (deltaBasisPoints === 0) return uiText('Level with yesterday')
  const percentage = Math.abs(deltaBasisPoints) / 100
  return `${uiText(deltaBasisPoints > 0 ? 'Up' : 'Down')} ${percentage.toLocaleString('en-US', { maximumFractionDigits: 1 })}% ${uiText('vs yesterday')}`
}

function privacySafeQueueCustomer(customer: string) {
  const normalized = customer.trim()
  if (!normalized) return uiText('Walk-in')
  const withoutContactNumber = normalized
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/gu, ' ')
    .replace(/[·|,/-]+\s*$/u, '')
    .replace(/\s{2,}/gu, ' ')
    .trim()
  return withoutContactNumber || uiText('Customer')
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
  const visibleProducts = prioritizeShopTodayProducts(commerce.items).slice(0, 6)
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
  const salesPatternReady = hasShopTodaySalesPattern(salesPulse)

  const isNewShop = !commerce.items.length && !commerce.orders.length && !commerce.movements.length
    && !commerce.closes.length && !commerce.websiteIntakes?.length && !commerce.storefrontRequests?.length
  const setupBlocked = recordStatus.badge === 'Paused' || recordStatus.badge === 'Checking'

  if (isNewShop) return <section aria-labelledby="shop-first-product-title" className="shop-today shop-today-first-run">
    <div className="shop-first-product-card">
      <span aria-hidden="true" className="shop-first-product-mark"><svg fill="none" viewBox="0 0 24 24"><path d="M3 8.5 12 4l9 4.5v10L12 23l-9-4.5zM3 8.5 12 13l9-4.5M12 13v10" /></svg></span>
      <div>
        <span className="shop-first-product-eyebrow">{uiText('Shop setup')}</span>
        <h2 id="shop-first-product-title">{bi('No products to sell yet')}</h2>
        <p>{bi('Add one item to start, or import a catalog.')}</p>
      </div>
      {setupBlocked ? <p className="shop-first-product-note" role="status">{recordStatus.detail}</p> : <div className="shop-first-product-actions">
        <Link className="core-button primary" to="/shop/?tab=inventory#shop-catalog-create">{bi('Add first product')}</Link>
        <Link className="text-link" to="/shop/?tab=inventory#shop-catalog-import">{bi('Import a CSV')} <span aria-hidden="true">→</span></Link>
      </div>}
      {setupBlocked && recordStatus.target && recordStatus.actionLabel ? <Link className="core-button" to={recordStatus.target}>{recordStatus.actionLabel}</Link> : null}
    </div>
  </section>

  return <div className="shop-today">
    <section aria-labelledby="shop-today-title" className="shop-today-overview">
      <header className="shop-today-heading">
        <div>
          <h2 id="shop-today-title">{uiText('Today')}</h2>
          <p>{(readUiLocale() === 'my' ? yangonDayMyanmar : yangonDay).format(new Date(activityAsOf))}</p>
        </div>
        {catalogReady ? <Link className="core-button primary" to="/shop/?tab=counter">{uiText('New sale')}</Link> : null}
      </header>
      <div className="shop-today-metrics" aria-label={uiText('Shop summary')}>
        {summaryMetrics.map((metric, index) => <article data-index={index} data-tone={metric.tone ?? 'ready'} key={metric.label}>
          <span className="shop-today-metric-icon"><ShopSummaryIcon label={metric.label} /></span>
          <small>{uiText(metric.label)}</small>
          <strong>{metric.value}</strong>
          <span>{localizeMetricDetail(metric.detail)}</span>
          {index > 0 ? <Link aria-label={uiText(metric.label)} className="shop-today-metric-target" to={index === 1 ? '/shop/?tab=orders#shop-order-queue' : '/shop/?tab=inventory#shop-stock-attention-title'} /> : null}
        </article>)}
      </div>
    </section>

    <section aria-label={uiText('Shop operating view')} className="shop-operations-board" data-track={nextTrack.toLowerCase()}>
      <article aria-label={uiText('Product list')} className="shop-operations-card shop-stock-watch-card">
        <header><span><strong>{uiText('Products')}</strong></span><b>{commerce.items.length} {uiText('total')}</b></header>
        {visibleProducts.length ? <div aria-hidden="true" className="shop-product-columns"><span>{uiText('Product')}</span><span>{uiText('Stock')}</span><span>{uiText('Price')}</span></div> : null}
        <div className="shop-operating-list shop-product-list">
          {visibleProducts.length ? visibleProducts.map((item) => <Link aria-label={`${readUiLocale() === 'my' && item.nameMy ? item.nameMy : item.name}: ${item.onHand} ${uiText('in stock')}, ${formatMmk(item.price)}`} data-low-stock={item.onHand <= item.reorderAt} key={item.sku} to="/shop/?tab=inventory">
            <span className="shop-product-identity"><ProductPhoto className="shop-today-product-photo" fallback={<span aria-hidden="true" className="shop-today-product-fallback">{item.name.trim().slice(0, 1).toUpperCase()}</span>} scope={productImageScope} sku={item.sku} /><span><strong>{readUiLocale() === 'my' && item.nameMy ? item.nameMy : item.name}</strong><small>{item.onHand} {uiText('in stock')}{item.onHand <= item.reorderAt ? ` · ${uiText('Reorder')}` : ''}</small></span></span>
            <span className="shop-product-stock">{item.onHand}{item.onHand <= item.reorderAt ? <small>{uiText('Reorder')}</small> : null}</span>
            <span className="shop-product-price"><b>{formatMmk(item.price)}</b></span>
          </Link>) : <div className="shop-operating-empty"><strong>{bi('No products to sell yet')}</strong><span>{bi('Add one item to start, or import a catalog.')}</span><Link className="core-button primary" to="/shop/?tab=inventory#shop-catalog-create">{bi('Add first product')}</Link><Link className="text-link" to="/shop/?tab=inventory#shop-catalog-import">{bi('Import a CSV')} <span aria-hidden="true">→</span></Link></div>}
        </div>
        {commerce.items.length ? <footer><Link to="/shop/?tab=inventory">{uiText('View products')} <span aria-hidden="true">→</span></Link></footer> : null}
      </article>

      <article aria-label={uiText('Order queue')} className="shop-operations-card shop-order-queue-card">
        <header><span><strong>{uiText('Order queue')}</strong></span><b>{openOrderCount} {uiText('open')}</b></header>
        <div className="shop-operating-list">
          {activeOrders.length ? activeOrders.map((order) => <Link key={order.id} to={shopOrderLink(order.id)}>
            <span><strong>{order.item}</strong><small>{privacySafeQueueCustomer(order.customer)} · {order.quantity} {uiText(order.quantity === 1 ? 'item' : 'items')}</small></span>
            <span className="shop-order-queue-meta"><b>{formatMmk(order.total)}</b><small>{uiText(order.status)} <em data-payment-due={order.paymentStatus === 'pending'}>{uiText(order.paymentStatus === 'pending' ? 'Payment due' : 'Paid')}</em></small></span>
          </Link>) : <p className="shop-operating-empty"><strong>{uiText('Queue clear')}</strong><span>{uiText('No open orders need fulfilment.')}</span></p>}
        </div>
        <footer><Link to="/shop/?tab=orders#shop-order-queue">{uiText('Open all orders')} <span aria-hidden="true">→</span></Link></footer>
      </article>

      <aside className="shop-operations-rail">
        {salesPatternReady || salesPulse.today.count > 0 ? <article aria-label={uiText('Sales insight')} className="shop-sales-pulse">
          <header><span><small>{uiText(salesPatternReady ? 'Sales insight' : 'Sales activity')}</small><strong>{formatMmk(salesPulse.today.grossMmk)}</strong></span>{salesPulse.today.count ? <b data-direction={salesPatternReady && salesPulse.deltaBasisPoints !== null ? salesPulse.deltaBasisPoints >= 0 ? 'up' : 'down' : 'neutral'}>{salesPatternReady ? formatSalesComparison(salesPulse.deltaBasisPoints, salesPulse.previous.grossMmk) : `${salesPulse.today.count} ${uiText('completed')} ${uiText(salesPulse.today.count === 1 ? 'sale' : 'sales')}`}</b> : null}</header>
          {salesPatternReady ? <>
            <div aria-label="Retained completed sales by three-hour Yangon period" className="shop-sales-bars">
            {salesPulse.points.map((point) => <span aria-label={`${point.label}: ${formatMmk(point.grossMmk)}`} key={point.hour}>
              <i aria-hidden="true" style={{ height: `${Math.max(point.grossMmk ? 12 : 2, Math.round((point.grossMmk / maximumPulseMmk) * 100))}%` }} />
              <small>{point.hour % 6 === 0 ? point.label : ''}</small>
            </span>)}
            </div>
            <p>{salesPulse.today.count} {uiText('completed')} {uiText(salesPulse.today.count === 1 ? 'sale' : 'sales')} {uiText('today')}</p>
          </> : salesPulse.today.count ? <div className="shop-sales-empty" role="status"><strong>{uiText('Sales by time')}</strong><span>{uiText('At least 3 sales across 2 time blocks show your busiest hours.')}</span></div>
            : <div className="shop-sales-empty"><strong>{uiText('No sales yet today')}</strong><span>{uiText('Completed counter sales will appear here.')}</span></div>}
        </article> : null}

        <section aria-label={uiText('Quick tasks')} className="shop-next-focus">
          <header className="shop-next-focus-copy"><h3>{uiText('Quick tasks')}</h3></header>
          <div className="shop-operating-list shop-task-list">
            {attentionPriority ? <Link data-priority-id={attentionPriority.id} data-state={profitControl.state} to={attentionPriority.target}>
              <span><strong>{uiText(attentionPriority.id === 'payment_pending' ? 'Orders awaiting payment' : attentionPriority.title)}</strong><small><strong>{uiText('Next:')}</strong> {uiText(attentionPriority.actionLabel)}</small></span>
            </Link> : taskLink(primaryTask.title, primaryTask.detail, primaryTask.action, primaryTask.target, primaryTask.ownerGate)}

            {financeModule && (accountingExport || closeQueue.orderCount || closeQueue.exceptionCount) ? accountingExport ? <button className="shop-task-row shop-finance-task" data-shop-accounting-export="accounting-csv-v1" onClick={accountingExport.onDownload} type="button">
              <span><strong>CSV</strong><small>{accountingExport.businessDate} · {uiText(accountingExport.mappingReady ? 'Mapped' : 'Unmapped')}</small></span>
            </button> : <Link aria-label="Cash and wallet close queue" aria-description="Not reconciled. Expected from completed, reconciled Shop orders. Wallet and bank settlement is not independently confirmed." to={closeQueue.target}>
              <span><strong>{uiText('Reconcile recorded takings')}</strong><small>{closeQueue.paymentMethods.length
                ? closeQueue.paymentMethods.map((method) => `${method.paymentMethod} ${formatMmk(method.totalMmk)}`).join(' · ')
                : closeQueue.exceptionCount ? `${closeQueue.exceptionCount} exceptions`
                    : closeQueue.orderCount ? `${closeQueue.orderCount} ready · ${formatMmk(closeQueue.totalMmk)}`
                    : uiText(closeQueue.latestCloseRecorded ? 'Close on file' : 'Nothing to close')}</small></span>
              <b>{uiText(closeQueue.actionLabel)}</b>
            </Link> : null}

          </div>
        </section>
      </aside>
    </section>

    <details aria-label={uiText('Advanced controls')} className="shop-today-workspaces shop-today-advanced" onToggle={(event) => { if (event.currentTarget.open) setAdvancedControlsLoaded(true) }}>
      <summary><span><strong>{uiText('Advanced controls')}</strong><small>{uiText('Costs, trends and operations')}</small></span><b>{profitControl.openPriorityCount ? profitControl.openPriorityCount + ' priorities' : uiText('Explore')}</b></summary>
      {advancedControlsLoaded ? <Suspense fallback={<p aria-live="polite" className="panel-note">{uiText('Loading advanced controls…')}</p>}><ShopTodayAdvancedPanel batchProfitControl={batchProfitControl} commerce={commerce} localBatchFirstUseAllowed={localBatchFirstUseAllowed} modules={modules} /></Suspense> : null}
    </details>
  </div>
}
