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
  metrics: ShopTodayMetric[]
  modules: ShopTodayModule[]
  nextAction: string
  nextDetail: string
  nextTo: string
}

const capabilityGroups = [
  ['Sell', 'Visual counter, multi-item sales, payment choice, tax snapshot'],
  ['Orders', 'Omnichannel intake, promise, allocation, fulfilment, returns'],
  ['Stock', 'Locations, lots, available-to-promise, counts, transfers'],
  ['Supply', 'Reorder, purchase orders, receiving, discrepancy, suppliers'],
  ['Customers', 'Credit policy, receivables, service schedule, support'],
  ['Control', 'Daily close, settlement review, accounting export, audit'],
] as const

const guidedJobs = [
  ['1', 'Review orders', 'Finish fulfilment, payment, return, or cancellation work.', '/shop/?tab=orders'],
  ['2', 'Make a sale', 'Open the counter, tap items, choose payment, and save a receipt note.', '/shop/?tab=counter'],
  ['3', 'Check stock', 'Review low stock, counts, receiving, and purchase actions.', '/shop/?tab=inventory'],
] as const

export function ShopToday({ metrics, modules, nextAction, nextDetail, nextTo }: ShopTodayProps) {
  return <div className="shop-today">
    <section className="shop-today-mission" aria-label="Next Shop action">
      <div>
        <span className="core-eyebrow">Today</span>
        <h2>{nextAction}</h2>
        <p>{nextDetail}</p>
      </div>
      <div className="shop-today-actions">
        <Link className="core-button primary" to={nextTo}>Review orders</Link>
        <Link className="core-button" to="/shop/?tab=counter">New sale</Link>
      </div>
    </section>

    <section className="shop-today-guide" aria-label="Shop guided jobs">
      <header><span className="core-eyebrow">Start here</span><h3>Three jobs run the shop.</h3></header>
      <div>
        {guidedJobs.map(([step, label, detail, to]) => <Link key={label} to={to}><b>{step}</b><span><strong>{label}</strong><small>{detail}</small></span></Link>)}
      </div>
    </section>

    <section className="shop-today-metrics" aria-label="Shop summary">
      {metrics.map((metric) => <article data-tone={metric.tone ?? 'ready'} key={metric.label}>
        <small>{metric.label}</small>
        <strong>{metric.value}</strong>
      </article>)}
    </section>

    <section className="shop-today-workspaces" aria-labelledby="shop-workspaces-title">
      <header>
        <div><span className="core-eyebrow">Shop areas</span><h2 id="shop-workspaces-title">Run the whole shop</h2></div>
        <p>Open the area for the job. Orders, stock, customers, and receipts stay connected.</p>
      </header>
      <div className="shop-today-module-grid">
        {modules.map((module) => <Link data-tone={module.tone ?? 'ready'} key={module.label} to={module.to}>
          <span><strong>{module.label}</strong><small>{module.detail}</small></span>
          <b>{module.status}</b>
        </Link>)}
      </div>
    </section>

    <details className="shop-today-coverage">
      <summary><span><strong>Enterprise control coverage</strong><small>See the connected lifecycle behind these simple screens</small></span><b>6 areas</b></summary>
      <div>{capabilityGroups.map(([label, detail]) => <article key={label}><strong>{label}</strong><small>{detail}</small></article>)}</div>
      <p>SuperMega keeps consequential changes behind named human review. External payment, customer messaging, delivery, filing, and accounting posting require separately verified connections.</p>
    </details>
  </div>
}
