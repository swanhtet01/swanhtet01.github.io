import { Link } from 'react-router-dom'

import { LiveProductPreview } from '../components/LiveProductPreview'
import { getTenantConfig } from '../lib/tenantConfig'
import { YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'
import {
  YANGON_TYRE_AGENT_CELLS,
  YANGON_TYRE_CONNECTOR_CHANNELS,
  YANGON_TYRE_IDENTITY_LANES,
  YANGON_TYRE_MANUFACTURING_LOOPS,
  YANGON_TYRE_PORTAL_APPS,
} from '../lib/yangonTyrePortalModel'

const valuePoints = [
  'One portal replaces separate sales, plant, quality, maintenance, and leadership tools.',
  'Current files, email, ERP exports, and manual updates feed the same records.',
  'AI prepares and routes work, while sensitive decisions stay behind human review.',
] as const

const trustControls = [
  {
    title: 'Enterprise identity and role scope',
    detail: 'Every user lands in the right home with scoped data, approved actions, and a clear audit trail.',
  },
  {
    title: 'Evidence-linked operations',
    detail: 'Emails, Drive files, chat threads, ERP rows, and manual entries stay attached to the record they created.',
  },
  {
    title: 'Human approval for sensitive moves',
    detail: 'Agents can classify, summarize, and draft, but financial, supplier, and release decisions stay behind review gates.',
  },
  {
    title: 'Admin control',
    detail: 'Admins control connectors, roles, staged expansion, and write permissions from the same system.',
  },
]

export function YangonTyrePage() {
  const tenant = getTenantConfig()
  const isClientTenant = tenant.key === 'ytf-plant-a'
  const model = YANGON_TYRE_MODEL
  const rolePreview = YANGON_TYRE_IDENTITY_LANES.slice(0, 4)
  const featuredApps = YANGON_TYRE_PORTAL_APPS.slice(0, 4)
  const featuredConnectors = YANGON_TYRE_CONNECTOR_CHANNELS.slice(0, 4)
  const featuredAgentCells = YANGON_TYRE_AGENT_CELLS.slice(0, 3)

  return (
    <div className="space-y-12 pb-16">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr] xl:items-center">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Case study / {model.domain}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Yangon Tyre client portal.</h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              One role-based portal replaces scattered tools across sales, operations, quality, maintenance, supplier follow-up, and leadership review without a big-bang rewrite.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">Sales</span>
              <span className="sm-status-pill">Operations</span>
              <span className="sm-status-pill">Quality</span>
              <span className="sm-status-pill">Leadership</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {isClientTenant ? (
                <>
                  <Link className="sm-button-primary" to="/login?next=/app/portal">
                    Open portal
                  </Link>
                  <Link className="sm-button-secondary" to="/app/operations">
                    Open operations
                  </Link>
                </>
              ) : (
                <>
                  <Link className="sm-button-primary" to="/contact?package=Yangon%20Tyre%20portal">
                    Start portal rollout
                  </Link>
                  <Link className="sm-button-secondary" to="/products">
                    View products
                  </Link>
                </>
              )}
            </div>
            <div className="mt-8 space-y-3">
              {valuePoints.map((point) => (
                <div className="sm-site-point" key={point}>
                  <span className="sm-site-point-dot" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>

          <LiveProductPreview className="animate-rise-delayed" variant="ytf-portal" />
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Who uses it</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each team gets the right home.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Each team sees the work, data, and approvals that actually matter to them.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {rolePreview.map((lane) => (
            <article className="sm-proof-card" key={lane.id}>
              <p className="sm-kicker text-[var(--sm-accent)]">{lane.role}</p>
              <h3 className="mt-3 text-xl font-bold text-white">{lane.home}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{lane.mandate}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">What it includes</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Workspaces are built around real jobs, not generic menus.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Each workspace is tied to a real team and one operating outcome.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {featuredApps.map((app) => (
            <article className="sm-proof-card" key={app.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">{app.workspace}</p>
                  <h3 className="mt-3 text-2xl font-bold text-white">{app.name}</h3>
                </div>
                <span className="sm-status-pill">{app.users.join(' / ')}</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{app.mission}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {app.dataSources.map((item) => (
                  <span className="sm-status-pill" key={`${app.id}-${item}`}>
                    {item}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-white/80">{app.outcome}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Connected data</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">It starts from the tools Yangon Tyre already uses.</h2>
          <div className="mt-6 grid gap-4">
            {featuredConnectors.map((connector) => (
              <article className="sm-proof-card" key={connector.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{connector.name}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{connector.source}</p>
                  </div>
                  <span className="sm-status-pill">{connector.cadence}</span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/80">{connector.purpose}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {connector.outputs.map((output) => (
                    <span className="sm-status-pill" key={`${connector.id}-${output}`}>
                      {output}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">How it was introduced</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">It was introduced in phases, not one giant rewrite.</h2>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_MANUFACTURING_LOOPS.slice(0, 3).map((loop) => (
              <article className="sm-proof-card" key={loop.id}>
                <p className="font-semibold text-white">{loop.stage}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{loop.focus}</p>
                <p className="mt-4 text-sm text-white/80">Tracked in: {loop.dataSignals.join(' · ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Enterprise controls</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The system stays controlled as it grows.</h2>
          <div className="mt-6 grid gap-4">
            {trustControls.map((control) => (
              <article className="sm-proof-card" key={control.title}>
                <p className="font-semibold text-white">{control.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{control.detail}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">AI help</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">AI helps with the busy work inside clear guardrails.</h2>
          <div className="mt-6 grid gap-4">
            {featuredAgentCells.map((cell) => (
              <article className="sm-proof-card" key={cell.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{cell.name}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{cell.mission}</p>
                  </div>
                  <span className="sm-status-pill">{cell.workspace}</span>
                </div>
                <p className="mt-4 text-sm text-white/80">Reads: {cell.reads.join(' · ')}</p>
                <p className="mt-2 text-sm text-white/80">Writes: {cell.writes.join(' · ')}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{cell.guardrail}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next move</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Use this as the model for the next client system.</h2>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Start with the first painful workflow, connect the current data, give each team the right home, and expand only after the first result is used every day.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {isClientTenant ? (
            <>
              <Link className="sm-button-primary" to="/login?next=/app/portal">
                Open portal
              </Link>
              <Link className="sm-button-secondary" to="/app/director">
                Open director
              </Link>
            </>
          ) : (
            <>
              <Link className="sm-button-primary" to="/contact?package=Yangon%20Tyre%20portal">
                Start portal rollout
              </Link>
              <Link className="sm-button-secondary" to="/products">
                View products
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
