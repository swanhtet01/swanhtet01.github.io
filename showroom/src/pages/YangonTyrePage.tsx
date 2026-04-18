import { Link } from 'react-router-dom'

import { YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'

const screenshotSize = {
  width: 1440,
  height: 1024,
} as const

const workspaces = [
  {
    name: 'Sales',
    detail: 'Accounts, visits, follow-up, and commercial notes in one customer-facing sales system.',
  },
  {
    name: 'Operations',
    detail: 'Receiving, issue control, inventory pressure, and daily execution in one operations desk.',
  },
  {
    name: 'Quality + Maintenance',
    detail: 'Incidents, CAPA, fishbone, 5W1H, downtime, and maintenance follow-up on the same portal.',
  },
  {
    name: 'Management',
    detail: 'Revenue, plant risk, approvals, decisions, and admin control for leadership.',
  },
] as const

const inputs = ['Gmail', 'Google Drive', 'Google Calendar', 'ERP exports', 'Forms and structured entry'] as const
const controls = ['Role-based access', 'Approval gates', 'Audit history', 'Shared knowledge', 'Agent review lanes'] as const
const rolloutModules = [
  'Sales System',
  'Operations Inbox',
  'Industrial DQMS',
  'Maintenance Control',
  'Knowledge Graph',
  'Approval and decision tracking',
] as const

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
              A named customer rollout built from SUPERMEGA.dev products and templates for sales, operations, quality, maintenance, and management.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">Named customer rollout</span>
              <span className="sm-status-pill">Built from templates</span>
              <span className="sm-status-pill">Role-based portal</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/contact?package=Yangon%20Tyre%20style%20portal">
                Start similar rollout
              </Link>
              <Link className="sm-button-secondary" to="/products">
                See products
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
            <p className="sm-kicker text-[var(--sm-accent)]">Role-based portal</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each team has a clear home inside the same customer system.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The point is not more buttons. The point is that sales, operations, and management stop working from separate tools.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {workspaces.map((workspace) => (
            <article className="sm-proof-card" key={workspace.name}>
              <p className="font-semibold text-white">{workspace.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{workspace.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">What the rollout includes</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">This portal is built from reusable product modules.</h2>
          <div className="mt-6 grid gap-3">
            {rolloutModules.map((item) => (
              <article className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/products">
              See products
            </Link>
            <Link className="sm-button-secondary" to="/contact">
              Start rollout
            </Link>
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Inputs and controls</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">It connects to current data and stays controlled.</h2>
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
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Use this as the reference for a named customer portal rollout.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact?package=Yangon%20Tyre%20style%20portal">
            Start similar rollout
          </Link>
          <Link className="sm-button-secondary" to="/products">
            See products
          </Link>
        </div>
      </section>
    </div>
  )
}
