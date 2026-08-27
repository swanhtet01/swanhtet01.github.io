import { Link } from 'react-router'
import type { ShopProfitControlBoard, ShopProfitControlPriority } from './shop-profit-control'

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

function profitMetric(priority: ShopProfitControlPriority) {
  if (priority.metric.kind === 'money') return `${priority.metric.value.toLocaleString('en-US')} MMK`
  return `${priority.metric.value} ${priority.metric.label}`
}

export function ShopToday({ catalogReady, metrics, modules, nextAction, nextDetail, nextTo, profitControl }: ShopTodayProps) {
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

    <details className="shop-today-workspaces shop-profit-control" open>
      <summary><span><strong>Profit control</strong><small>Current leak → accountable owner → objective closure</small></span><b>{profitControl.criticalPriorityCount ? `${profitControl.criticalPriorityCount} critical · ${profitControl.openPriorityCount} open` : profitControl.openPriorityCount ? `${profitControl.openPriorityCount} open` : 'Controlled'}</b></summary>
      <div className="shop-today-module-grid">
        {profitControl.priorities.map((priority) => <Link data-tone={priority.severity === 'critical' || priority.severity === 'attention' ? 'attention' : 'ready'} key={priority.id} to={priority.target}>
          <span>
            <strong>{priority.title}</strong>
            <small>{priority.impact}</small>
            <small>{priority.ownerRole} · {priority.dueLabel}</small>
            <small>Closed when: {priority.closureCondition}</small>
          </span>
          <b>{profitMetric(priority)}</b>
        </Link>)}
      </div>
      {profitControl.hiddenPriorityCount ? <p className="panel-note">{profitControl.hiddenPriorityCount} lower-priority signal{profitControl.hiddenPriorityCount === 1 ? '' : 's'} remain visible in the linked Shop workspaces. This board shows the top three only.</p> : null}
      <p className="panel-note">Read-only projection from the current Shop record. A card clears only when its source metric changes; this panel does not contact anyone, move money or stock, or write a completion claim.</p>
    </details>

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
