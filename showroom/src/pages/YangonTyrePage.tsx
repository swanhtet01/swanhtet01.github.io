import { Link } from 'react-router-dom'

import { YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'

const screenshotSize = {
  width: 1440,
  height: 1024,
} as const

const roleLaunches = [
  {
    name: 'Sales',
    detail: 'Keep dealer accounts, visit plans, follow-up, and commercial notes in one CRM.',
    modules: ['Sales CRM', 'Knowledge Graph and SOP Vault'],
    to: '/app/sales',
    cta: 'Open sales CRM',
  },
  {
    name: 'Operations',
    detail: 'Run receiving, issue follow-up, inventory pressure, and daily action review from one desk.',
    modules: ['Receiving Control', 'Plant Action Board', 'Inventory Pulse'],
    to: '/app/receiving',
    cta: 'Open operations',
  },
  {
    name: 'Quality and maintenance',
    detail: 'Use incidents, CAPA, breakdowns, 5W1H, and Ishikawa reviews without going back to side sheets.',
    modules: ['Quality Closeout', 'Maintenance Control', 'Knowledge Graph and SOP Vault'],
    to: '/app/intake',
    cta: 'Open quality flow',
  },
  {
    name: 'CEO',
    detail: 'See revenue, plant risk, supplier exposure, and decision follow-through in one command view.',
    modules: ['CEO Command Center', 'Decision Journal'],
    to: '/app/director',
    cta: 'Open CEO view',
  },
  {
    name: 'Admin',
    detail: 'Manage roles, connectors, security posture, and tenant rollout from one control plane.',
    modules: ['CEO Command Center', 'Document Intelligence', 'Knowledge Graph and SOP Vault'],
    to: '/app/platform-admin',
    cta: 'Open admin',
  },
] as const

const systemLanes: Array<{ name: string; detail: string; moduleIds: string[] }> = [
  {
    name: 'Sales and commercial',
    detail: 'For dealers, distributors, quotes, visit plans, and account memory.',
    moduleIds: ['sales-crm', 'document-intelligence', 'knowledge-hub'],
  },
  {
    name: 'Operations, QC, and maintenance',
    detail: 'For receiving, supplier recovery, breakdowns, quality incidents, and inventory pressure.',
    moduleIds: ['receiving-control', 'plant-action-board', 'supplier-control', 'quality-closeout', 'maintenance-control', 'inventory-pulse'],
  },
  {
    name: 'CEO and admin control',
    detail: 'For leadership review, policy, runtime oversight, and decision history.',
    moduleIds: ['decision-journal', 'director-command-center'],
  },
]

export function YangonTyrePage() {
  const model = YANGON_TYRE_MODEL

  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr] xl:items-center">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{model.domain}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Yangon Tyre runs sales, operations, and management on one portal.</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              This is the first full client portal on SUPERMEGA.dev: CRM, receiving, supplier control, quality, maintenance, knowledge, CEO review, and
              tenant admin on one base.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">CRM + ERP + knowledge</span>
              <span className="sm-status-pill">Gmail, Drive, Calendar, ERP exports</span>
              <span className="sm-status-pill">Role-based workspaces</span>
              <span className="sm-status-pill">Agent cleanup and briefs</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/receiving">
                Open operations
              </Link>
              <Link className="sm-button-secondary" to="/app/sales">
                Open sales CRM
              </Link>
              <Link className="sm-button-secondary" to="/app/director">
                Open CEO view
              </Link>
            </div>
          </div>

          <article className="sm-site-proof-panel overflow-hidden">
            <div className="sm-site-proof-head">
              <span>Named client portal</span>
              <span>Sales, ops, QC, maintenance, CEO, admin</span>
            </div>
            <img
              alt="Yangon Tyre client portal"
              className="aspect-[16/10] w-full border-b border-white/8 object-cover object-top"
              decoding="async"
              fetchPriority="high"
              height={screenshotSize.height}
              src="/site/receiving-control-live.png"
              width={screenshotSize.width}
            />
            <div className="grid gap-3 p-5 md:grid-cols-2">
              <div className="sm-demo-mini">
                <strong>{model.modules.length} modules</strong>
                <span>Commercial, plant, knowledge, and executive control on one tenant.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>{model.roles.length} roles</strong>
                <span>Each team gets one clear home instead of one generic dashboard.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>{model.connectors.length} connectors</strong>
                <span>Mail, files, sheets, calendar, exports, and forms feed the same memory.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>{model.agentPods.length} agent pods</strong>
                <span>Cleanup, routing, root-cause prep, and executive briefs stay inside approval lanes.</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Role entry points</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each team opens one obvious workspace.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The portal should not feel like a maze. These are the actual working surfaces for Yangon Tyre by role.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {roleLaunches.map((role) => (
            <article className="sm-proof-card" key={role.name}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white">{role.name}</p>
                <span className="sm-status-pill">Live route</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{role.detail}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">Uses</p>
              <p className="mt-2 text-sm text-white/80">{role.modules.join(' · ')}</p>
              <div className="mt-5">
                <Link className="sm-button-primary" to={role.to}>
                  {role.cta}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Full system</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The first client portal is a real system, not three isolated screens.</h2>
          <div className="mt-6 space-y-6">
            {systemLanes.map((lane) => (
              <section key={lane.name}>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{lane.name}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">{lane.detail}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3">
                  {model.modules
                    .filter((module) => lane.moduleIds.includes(module.id))
                    .map((module) => (
                      <article className="sm-demo-mini" key={module.id}>
                        <strong>{module.name}</strong>
                        <span>{module.summary}</span>
                        <span className="text-xs uppercase tracking-[0.18em] text-white/45">{module.status}</span>
                        {module.route ? (
                          <Link className="sm-link mt-2" to={module.route}>
                            Open {module.name}
                          </Link>
                        ) : null}
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Data in</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Use the data the company already creates.</h2>
          <div className="mt-6 grid gap-3">
            {model.connectors.map((connector) => (
              <article className="sm-chip text-white" key={connector.id}>
                <p className="font-semibold">{connector.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{connector.scope}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/45">Outputs</p>
                <p className="mt-2 text-sm text-white/80">{connector.outputs.join(' · ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Structured entry</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Human input is part of the system, not an afterthought.</h2>
          <div className="mt-6 grid gap-3">
            {model.dataEntrySurfaces.map((surface) => (
              <article className="sm-proof-card" key={surface.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{surface.name}</p>
                  {surface.route ? (
                    <Link className="sm-link" to={surface.route}>
                      Open
                    </Link>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">Captures: {surface.captures.join(' · ')}</p>
                <p className="mt-3 text-sm text-white/80">Rules: {surface.qualityRules.join(' · ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">AI agents</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Agents clean, route, and brief inside permissioned lanes.</h2>
          <div className="mt-6 grid gap-3">
            {model.agentPods.map((pod) => (
              <article className="sm-proof-card" key={pod.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{pod.name}</p>
                  <span className="sm-status-pill">{pod.workspace}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{pod.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Automations: {pod.automations.join(' · ')}</p>
                <p className="mt-2 text-sm text-white/80">Approval gate: {pod.approvalGate}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Rollout order</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Ship the portal in four controlled passes.</h2>
          <div className="mt-6 grid gap-3">
            {model.rolloutPhases.map((phase) => (
              <article className="sm-demo-mini" key={phase.id}>
                <strong>{phase.name}</strong>
                <span>{phase.outcome}</span>
                <span className="text-sm text-white/80">Modules: {phase.modules.join(' · ')}</span>
                <span className="text-sm text-white/80">Deliverables: {phase.deliverables.join(' · ')}</span>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Enterprise posture</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">What is already real and what still needs deeper wiring.</h2>
          <div className="mt-6 grid gap-3">
            {model.foundationSignals.map((signal) => (
              <article className="sm-chip text-white" key={signal.id}>
                <p className="font-semibold">{signal.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{signal.detail}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3">
            {model.gaps.map((gap) => (
              <article className="sm-demo-mini" key={gap.id}>
                <strong>{gap.name}</strong>
                <span>{gap.risk}</span>
                <span className="text-sm text-white/80">Next move: {gap.nextMove}</span>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open the role you care about and use the portal like a real client system.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The right next move is not more browsing. It is opening sales, operations, CEO, or admin and proving one live workflow end to end.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/app/platform-admin">
            Open admin
          </Link>
          <Link className="sm-button-secondary" to="/app/knowledge">
            Open knowledge
          </Link>
          <Link className="sm-button-secondary" to="/app/teams">
            Open agent ops
          </Link>
        </div>
      </section>
    </div>
  )
}
