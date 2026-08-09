import { Link } from 'react-router'

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
  nextLabel: string
  nextTo: string
}

const capabilityGroups = [
  ['Sell', 'Counter sales, payments, tax'],
  ['Orders', 'Omnichannel intake, promise, allocation, fulfilment, returns'],
  ['Stock', 'Locations, lots, available-to-promise, counts, transfers'],
  ['Supply', 'Reorder, purchase orders, receiving, discrepancy, suppliers'],
  ['Customers', 'Credit policy, receivables, service schedule, support'],
  ['Control', 'Daily close, settlement review, accounting export, audit'],
] as const

export function ShopToday({ catalogReady, metrics, modules, nextAction, nextDetail, nextLabel, nextTo }: ShopTodayProps) {
  const financeAttention = modules.find((module) => module.label === 'Finance controls' && module.tone === 'attention')
  return <div className="shop-today">
    <section className="shop-today-mission" aria-label="Next Shop action">
      <div>
        <span className="core-eyebrow">Today</span>
        <h2>{nextAction}</h2>
        <p>{nextDetail}</p>
      </div>
      <div className="shop-today-actions">
        <Link className="core-button primary" to={nextTo}>{nextLabel}</Link>
        {financeAttention ? <Link className="core-button" to={financeAttention.to}>{financeAttention.status}</Link> : catalogReady ? <Link className="core-button" to="/shop/?tab=counter">New sale</Link> : null}
      </div>
    </section>

    <section className="shop-today-metrics" aria-label="Shop summary">
      {metrics.map((metric) => <article data-tone={metric.tone ?? 'ready'} key={metric.label}>
        <small>{metric.label}</small>
        <strong>{metric.value}</strong>
      </article>)}
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
