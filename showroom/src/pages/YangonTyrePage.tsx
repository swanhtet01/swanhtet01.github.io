import { Link } from 'react-router-dom'

import { YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'

const screenshotSize = {
  width: 1440,
  height: 1024,
} as const

const workspaces = [
  {
    name: 'Sales',
    detail: 'Accounts, visits, follow-up, and commercial notes.',
    to: '/app/sales',
  },
  {
    name: 'Operations',
    detail: 'Receiving, issues, inventory pressure, and daily actions.',
    to: '/app/receiving',
  },
  {
    name: 'Quality and maintenance',
    detail: 'Incidents, CAPA, breakdowns, 5W1H, and Ishikawa review.',
    to: '/app/intake',
  },
  {
    name: 'CEO',
    detail: 'Revenue, plant risk, supplier exposure, and decisions.',
    to: '/app/director',
  },
  {
    name: 'Admin',
    detail: 'Roles, connectors, policies, and tenant setup.',
    to: '/app/platform-admin',
  },
] as const

const templateBlocks = [
  {
    name: 'Sales CRM template',
    detail: 'Built from sales workflow, shared knowledge, and follow-up history.',
    modules: ['Sales CRM', 'Decision Journal'],
  },
  {
    name: 'Operations template',
    detail: 'Built from receiving, supplier control, quality, maintenance, and inventory.',
    modules: ['Receiving Control', 'Supplier Control', 'Quality Closeout', 'Maintenance Control', 'Inventory Pulse'],
  },
  {
    name: 'Client portal and admin template',
    detail: 'Built from shared access, history, approvals, and control layers.',
    modules: ['Document Intelligence', 'Knowledge Graph and SOP Vault', 'CEO Command Center'],
  },
] as const

const inputs = ['Gmail', 'Google Drive', 'Google Calendar', 'ERP exports', 'Forms and structured entry'] as const
const controls = ['Role-based access', 'Approval gates', 'Audit history', 'Shared knowledge', 'Agent review lanes'] as const

export function YangonTyrePage() {
  const model = YANGON_TYRE_MODEL

  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr] xl:items-center">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{model.domain}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Yangon Tyre client portal.</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Sales, operations, quality, maintenance, CEO review, and admin run on one system.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">Real client portal</span>
              <span className="sm-status-pill">Built from templates</span>
              <span className="sm-status-pill">Live routes</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/receiving">
                Open operations
              </Link>
              <Link className="sm-button-secondary" to="/app/sales">
                Open sales
              </Link>
              <Link className="sm-button-secondary" to="/app/platform-admin">
                Open admin
              </Link>
            </div>
          </div>

          <article className="sm-site-proof-panel overflow-hidden">
            <div className="sm-site-proof-head">
              <span>Named client portal</span>
              <span>{model.roles.length} roles · {model.connectors.length} connectors</span>
            </div>
            <img
              alt="Yangon Tyre portal"
              className="aspect-[16/10] w-full border-b border-white/8 object-cover object-top"
              decoding="async"
              fetchPriority="high"
              height={screenshotSize.height}
              src="/site/receiving-control-live.png"
              width={screenshotSize.width}
            />
            <div className="grid gap-3 p-5 md:grid-cols-3">
              <div className="sm-demo-mini">
                <strong>{model.modules.length} modules</strong>
                <span>One shared system.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>{model.roles.length} roles</strong>
                <span>Each team has a clear home.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>{model.agentPods.length} agent pods</strong>
                <span>Cleanup and briefs stay inside the portal.</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Workspaces</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Open the right workspace.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The portal is simple on purpose. Each role should know where to go immediately.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {workspaces.map((workspace) => (
            <article className="sm-proof-card" key={workspace.name}>
              <p className="font-semibold text-white">{workspace.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{workspace.detail}</p>
              <div className="mt-5">
                <Link className="sm-button-primary" to={workspace.to}>
                  Open
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Built from templates</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">This portal is made from reusable product blocks.</h2>
          <div className="mt-6 grid gap-3">
            {templateBlocks.map((block) => (
              <article className="sm-proof-card" key={block.name}>
                <p className="font-semibold text-white">{block.name}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{block.detail}</p>
                <p className="mt-4 text-sm text-white/80">{block.modules.join(' · ')}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/products">
              Open products
            </Link>
            <Link className="sm-button-secondary" to="/products/client-portal">
              Open client portal template
            </Link>
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Data and control</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Use existing data. Keep control in the system.</h2>
          <div className="mt-6 grid gap-3">
            {inputs.map((item) => (
              <article className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3">
            {controls.map((item) => (
              <article className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Use the workspace you need.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/app/sales">
            Open sales
          </Link>
          <Link className="sm-button-secondary" to="/app/receiving">
            Open operations
          </Link>
          <Link className="sm-button-secondary" to="/app/director">
            Open CEO
          </Link>
        </div>
      </section>
    </div>
  )
}
