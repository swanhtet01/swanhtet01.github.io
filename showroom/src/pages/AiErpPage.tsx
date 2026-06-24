import { Link } from 'react-router-dom'

type FactoryOperationsAppMetric = {
  label: string
  value: string
  detail: string
}

type FactoryOperationsAppRecord = {
  id: string
  title: string
  type: string
  owner: string
  status: string
  proof: string
}

const metrics: FactoryOperationsAppMetric[] = [
  {
    label: 'Open approvals',
    value: '6',
    detail: 'Purchase, stock, and customer-order decisions waiting for owner review.',
  },
  {
    label: 'Inventory exceptions',
    value: '4',
    detail: 'Low stock, receiving mismatch, or manual adjustment needs proof.',
  },
  {
    label: 'Source records',
    value: '128',
    detail: 'Sheets, forms, photos, invoices, and notes attached to ERP records.',
  },
  {
    label: 'Daily close',
    value: 'Ready',
    detail: 'Today has owner, source, movement, and approval history.',
  },
]

const records: FactoryOperationsAppRecord[] = [
  {
    id: 'PO-1048',
    title: 'Purchase request for replacement bearings',
    type: 'Purchase queue',
    owner: 'Operations Manager',
    status: 'Needs approval',
    proof: 'Supplier quote, stock level, and last maintenance note attached.',
  },
  {
    id: 'STK-3091',
    title: 'Inventory adjustment for warehouse receiving mismatch',
    type: 'Inventory ledger',
    owner: 'Warehouse Lead',
    status: 'Review proof',
    proof: 'Receiving photo, invoice line, and counted quantity disagree.',
  },
  {
    id: 'ORD-2210',
    title: 'Customer order waiting for payment confirmation',
    type: 'Order register',
    owner: 'Sales Admin',
    status: 'Follow up',
    proof: 'Payment screenshot requested before dispatch release.',
  },
]

const modules = [
  {
    name: 'Item master',
    detail: 'Products, SKUs, categories, reorder rules, and source files in one controlled register.',
  },
  {
    name: 'Inventory ledger',
    detail: 'Stock movement, receiving, adjustment, issue, and closing balance with source evidence.',
  },
  {
    name: 'Purchase queue',
    detail: 'Requests, quotes, approval status, supplier proof, and follow-up owner.',
  },
  {
    name: 'Customer and order register',
    detail: 'Customers, orders, payment proof, delivery status, and handoff notes.',
  },
  {
    name: 'Approval history',
    detail: 'Who approved, what changed, what proof was attached, and what remains blocked.',
  },
  {
    name: 'Source intake',
    detail: 'Sheets, Drive folders, PDFs, invoices, photos, forms, and email exports become reviewable records.',
  },
]

export function AiErpPage() {
  return (
    <div className="space-y-5 pb-10">
      <section className="sm-start-hero">
        <div className="sm-start-copy">
          <div className="flex flex-wrap gap-2">
            <span className="sm-status-pill">Factory Operations App proof</span>
            <span className="sm-status-pill">Generic sample data</span>
          </div>
          <h1>Simple ERP records before a heavy ERP rollout.</h1>
          <p>
            Factory Operations App starts with one transaction flow: item master, stock movement, purchase request, customer order, or
            daily close. Every record has owner, status, source proof, and approval history.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/client-build">
              Build client version
            </Link>
            <Link className="sm-button-secondary" to="/app/client-room">
              Open source intake
            </Link>
          </div>
        </div>
        <Link className="sm-start-primary-card" to="/app/receiving">
          <span>First workflow</span>
          <strong>Receiving to inventory</strong>
          <p>Connect supplier proof, received quantity, QC hold, and manager disposition.</p>
          <em>Open</em>
        </Link>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Factory Operations App metrics">
        {metrics.map((metric) => (
          <article className="sm-calm-surface p-4" key={metric.label}>
            <p className="sm-kicker text-[var(--sm-accent)]">{metric.label}</p>
            <strong className="mt-2 block text-2xl text-white">{metric.value}</strong>
            <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-calm-surface p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Work queue</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Records that need action.</h2>
            </div>
            <span className="sm-status-pill">{records.length} open</span>
          </div>
          <div className="mt-5 grid gap-3">
            {records.map((record) => (
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4" key={record.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">
                      {record.id} / {record.type}
                    </p>
                    <h3 className="mt-2 text-lg font-bold text-white">{record.title}</h3>
                  </div>
                  <span className="sm-status-pill">{record.status}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{record.proof}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-white/82">Owner: {record.owner}</span>
                  <Link className="sm-link" to="/app/action-board">
                    Review
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-5">
          <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Only install the ERP pieces the team uses.</h2>
          <div className="mt-5 grid gap-3">
            {modules.map((module) => (
              <div className="rounded-2xl border border-white/10 bg-black/10 p-4" key={module.name}>
                <h3 className="text-base font-bold text-white">{module.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{module.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
