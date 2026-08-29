import { useMemo } from 'react'
import { Link } from 'react-router'
import type { CommerceState } from './commerce-workspace'
import { formatShopCostCoverage, formatShopMarginRate, projectShopCostCoverageAndMarginAtRisk } from './shop-cost-coverage-and-margin-at-risk'
import { formatHiddenShopProfitControlPriorities, formatShopProfitControlMetric } from './shop-profit-control'
import type { ShopProfitControlBoard } from './shop-profit-control'

export type ShopTodayMetric = {
  label: string
  value: string
  tone?: 'attention' | 'ready'
}

export type ShopTodayModule = {
  detail: string
  label: string
  status: string
  to: string
  tone?: 'attention' | 'ready'
}

type ShopTodayProps = {
  catalogReady: boolean
  metrics: ShopTodayMetric[]
  modules: ShopTodayModule[]
  nextAction: string
  nextDetail: string
  nextTo: string
  commerce: CommerceState
  profitControl: ShopProfitControlBoard
}

const capabilityGroups = [
  ['Sell', 'Visual counter, multi-item sales, payment choice, tax snapshot'],
  ['Orders', 'Omnichannel intake, promise, allocation, fulfilment, returns'],
  ['Stock', 'Locations, lots, available-to-promise, counts, transfers'],
  ['Supply', 'Reorder, purchase orders, receiving, discrepancy, suppliers'],
  ['Customers', 'Credit policy, receivables, service schedule, support'],
  ['Control', 'Daily close, settlement review, accounting export, audit'],
] as const

const formatMmk = (value: number) => `${value.toLocaleString('en-US')} MMK`

export function ShopToday({ catalogReady, commerce, metrics, modules, nextAction, nextDetail, nextTo, profitControl }: ShopTodayProps) {
  const marginControl = useMemo(() => projectShopCostCoverageAndMarginAtRisk(commerce), [commerce])
  return <div className="shop-today">
    <section className="shop-today-mission" aria-label="Next Shop action">
      <div>
        <span className="core-eyebrow">Today</span>
        <h2>{nextAction}</h2>
        <p>{nextDetail}</p>
      </div>
      <div className="shop-today-actions">
        <Link className="core-button primary" to={nextTo}>Open next step</Link>
        {catalogReady ? <Link className="core-button" to="/shop/?tab=counter">New sale</Link> : null}
      </div>
    </section>

    <section className="shop-today-metrics" aria-label="Shop summary">
      {metrics.map((metric) => <article data-tone={metric.tone ?? 'ready'} key={metric.label}>
        <small>{metric.label}</small>
        <strong>{metric.value}</strong>
      </article>)}
    </section>

    <details aria-label="Shop profit control" className="shop-today-workspaces shop-profit-control" open>
      <summary><span><strong>Profit control</strong><small>Current leak → accountable owner → objective closure</small></span><b>{profitControl.criticalPriorityCount ? `${profitControl.criticalPriorityCount} critical · ${profitControl.openPriorityCount} open` : profitControl.openPriorityCount ? `${profitControl.openPriorityCount} open` : 'Controlled'}</b></summary>
      <div className="shop-today-module-grid">
        {profitControl.priorities.map((priority) => <Link data-tone={priority.severity === 'critical' || priority.severity === 'attention' ? 'attention' : 'ready'} key={priority.id} to={priority.target}>
          <span>
            <strong>{priority.title}</strong>
            <small>{priority.impact}</small>
            <small>{priority.ownerRole} · {priority.dueLabel}</small>
            <small>Closed when: {priority.closureCondition}</small>
          </span>
          <b>{formatShopProfitControlMetric(priority.metric)}</b>
        </Link>)}
      </div>
      {profitControl.hiddenPriorityCount ? <p className="panel-note">{formatHiddenShopProfitControlPriorities(profitControl.hiddenPriorityCount)}</p> : null}
      <p className="panel-note">Read-only projection from the current Shop record. A card clears only when its source metric changes; this panel does not contact anyone, move money or stock, or write a completion claim.</p>
    </details>

    <section aria-label="Shop cost coverage and margin at risk" className="shop-margin-control" id="shop-cost-coverage">
      <header>
        <div>
          <span className="core-eyebrow">Daily profit control</span>
          <h3>Cost coverage before margin</h3>
          <p>Retained non-sample completed sales and reviewed retained Shop cost evidence count. This is local operating evidence, not pilot, customer, or commercial proof.</p>
        </div>
        <b data-state={marginControl.state}>{marginControl.costCoverage.state === 'complete' ? 'Cost-complete' : marginControl.costCoverage.state === 'no_retained_sales' ? 'Awaiting retained sale' : 'Evidence incomplete'}</b>
      </header>
      <div className="shop-margin-summary">
        <article>
          <small>Sold-value cost coverage</small>
          <strong>{formatShopCostCoverage(marginControl.costCoverage.coverageBasisPoints)}</strong>
          <span>{formatMmk(marginControl.costCoverage.coveredSoldValueMmk)} of {formatMmk(marginControl.costCoverage.soldValueMmk)}</span>
          <span>Single reviewed unit cost per SKU, allocated by receipt order; conflicts withhold margin.</span>
        </article>
        <article>
          <small>Retained non-sample sales</small>
          <strong>{marginControl.activity.retainedNonSampleCompletedSales}</strong>
          <span>{marginControl.activity.openOrders} open · {marginControl.activity.cancelledOrders} cancelled · {marginControl.activity.sampleOrders} sample excluded</span>
        </article>
        <article>
          <small>Aggregate gross profit</small>
          <strong>{marginControl.profit.grossProfitMmk === null ? 'Withheld' : formatMmk(marginControl.profit.grossProfitMmk)}</strong>
          <span>{marginControl.profit.marginBasisPoints === null ? marginControl.profit.reason : `${formatShopMarginRate(marginControl.profit.marginBasisPoints)} of completed sold value`}</span>
        </article>
      </div>
      {marginControl.costCoverage.state === 'incomplete' ? <p className="shop-margin-gaps" role="status">
        Evidence gaps: {marginControl.costCoverage.gaps.missingLineCount} missing · {marginControl.costCoverage.gaps.staleLineCount} stale · {marginControl.costCoverage.gaps.unlinkedLineCount} unlinked · {marginControl.costCoverage.gaps.unreviewedLineCount} unreviewed · {marginControl.costCoverage.gaps.partialLineCount} partial · {marginControl.costCoverage.gaps.costMethodLineCount} cost-method review
      </p> : null}
      {marginControl.activity.adjustmentBlockedSales ? <p className="shop-margin-gaps" role="status">{marginControl.activity.adjustmentBlockedSales} completed {marginControl.activity.adjustmentBlockedSales === 1 ? 'sale has' : 'sales have'} return, correction, or refund evidence awaiting exact line-value review.</p> : null}
      {marginControl.priorities.length ? <div aria-label="Margin at risk priorities" className="shop-margin-priorities">
        {marginControl.priorities.map((priority) => <Link data-tone={priority.severity} key={priority.id} to={priority.target}>
          <div>
            <span>{priority.severity === 'critical' ? 'Negative margin' : 'Below margin floor'}</span>
            <strong>{priority.itemName}</strong>
            <small>{priority.ownerRole} · {priority.dueLabel}</small>
          </div>
          <div>
            <b>{formatMmk(priority.exposureMmk)} at risk</b>
            <small>{formatShopMarginRate(priority.marginBasisPoints)} margin</small>
          </div>
          <p><strong>Next:</strong> {priority.actionLabel}. <strong>Closed when:</strong> {priority.closureCondition}</p>
        </Link>)}
      </div> : marginControl.profit.status === 'available' ? <p className="shop-margin-controlled">No negative or below-floor margin exposure appears in the complete retained evidence.</p> : null}
      <p className="panel-note">No payment, stock, supplier, accounting, customer, or hosted write runs from this panel.</p>
    </section>

    <details className="shop-today-workspaces">
      <summary><span><strong>More Shop tools</strong><small>Customers, finance, channels, and purchasing</small></span><b>{modules.length} connected areas</b></summary>
      <div className="shop-today-module-grid">
        {modules.map((module) => <Link data-tone={module.tone ?? 'ready'} key={module.label} to={module.to}>
          <span><strong>{module.label}</strong><small>{module.detail}</small></span>
          <b>{module.status}</b>
        </Link>)}
      </div>
    </details>

    <details className="shop-today-coverage">
      <summary><span><strong>Shop safeguards</strong><small>What SuperMega checks while the screen stays simple</small></span><b>6 areas</b></summary>
      <div>{capabilityGroups.map(([label, detail]) => <article key={label}><strong>{label}</strong><small>{detail}</small></article>)}</div>
      <p>SuperMega keeps consequential changes behind named human review. External payment, customer messaging, delivery, filing, and accounting posting require separately verified connections.</p>
    </details>
  </div>
}
