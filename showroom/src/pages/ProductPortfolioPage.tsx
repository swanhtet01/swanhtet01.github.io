import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  INTERNAL_AGENT_CREWS,
  MODULE_PROGRAMS,
  RESEARCH_CELLS,
} from '../lib/companyBuildingModel'

const portfolioSteps = [
  'Choose the product line that matches the workflow causing the most pain.',
  'Bring in the connectors, files, and notes the team already uses so the first live product starts from real data.',
  'Use the first rollout to learn what should become reusable in the shared system.',
  'Promote the next release only when the quality signals are clear and repeatable.',
]

export function ProductPortfolioPage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Portfolio"
        title="Product lines and build teams behind the live products."
        description="SUPERMEGA.dev does not treat each release as a one-off app. This page shows the product programs, build teams, and agent teams that keep rollout quality high."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Product lines</p>
          <p className="mt-3 text-3xl font-bold text-white">{MODULE_PROGRAMS.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Each one maps to a real roadmap, owner, customer rollout, and release plan.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Build teams</p>
          <p className="mt-3 text-3xl font-bold text-white">{RESEARCH_CELLS.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Connector, workflow, knowledge, decision, and safety teams keep releases grounded in real operating work.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent teams</p>
          <p className="mt-3 text-3xl font-bold text-white">{INTERNAL_AGENT_CREWS.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">These teams stay on call for releases, connectors, and quality while humans lead the next moves.</p>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Product lines</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Every module sits inside a product line with clear ownership and measurable success.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/products">
              View live modules
            </Link>
            <Link className="sm-button-secondary" to="/factory">
              See build system
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {MODULE_PROGRAMS.map((program) => (
            <article className="sm-demo-link sm-demo-link-card" key={program.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{program.stage}</span>
                <span className="sm-status-pill">{program.owner}</span>
              </div>
              <strong>{program.name}</strong>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{program.target}</p>
              <p className="mt-2 text-sm text-white/80">Market: {program.market}</p>
              <p className="mt-2 text-sm text-white/80">Starts with: {program.starterWedge}</p>
              <p className="mt-2 text-sm text-white/80">Release train: {program.releaseTrain}</p>
              <p className="mt-2 text-sm text-white/80">Build team: {program.researchCell}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-white/60">
                {program.modules.map((module) => (
                  <span key={`${program.id}-${module}`}>{module}</span>
                ))}
              </div>
              <p className="mt-3 text-sm text-white/80">Differentiator: {program.differentiator}</p>
              <p className="mt-3 text-sm text-white/80">Adds next: {program.nextReleases.join(', ')}</p>
              <div className="mt-4 space-y-2 text-sm text-white/80">
                <p>Agent teams: {program.agentCrews.join(', ')}</p>
                <p>Success signals: {program.successSignals.join('; ')}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="sm-link" to={program.route}>
                  Open program
                </Link>
                <Link className="sm-link" to="/contact">
                  Start rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Build teams</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Named teams turn raw inputs into repeatable engineering work.</h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
              Each team has owners, inputs, outputs, and a clear mandate tied to connectors, workflows, knowledge, decisions, and safety.
            </p>
          </div>
          <div className="mt-6 grid gap-3">
            {RESEARCH_CELLS.map((cell) => (
              <article className="sm-chip text-white" key={cell.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{cell.name}</p>
                  <span className="sm-status-pill">{cell.ownedBy}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{cell.mandate}</p>
                <p className="mt-2 text-sm text-white/80">Supports: {cell.supports.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Inputs: {cell.inputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Outputs: {cell.outputs.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Agent teams</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Delegation stays scoped, auditable, and repeatable.</h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
              These teams keep connector health, pilot QA, and release discipline on track so you can keep shipping modules instead of babysitting pilots.
            </p>
          </div>
          <div className="mt-6 grid gap-3">
            {INTERNAL_AGENT_CREWS.map((crew) => (
              <article className="sm-chip text-white" key={crew.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{crew.name}</p>
                  <span className="sm-status-pill">{crew.workspace}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{crew.mission}</p>
                <p className="mt-2 text-sm text-white/80">Read: {crew.readScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Write: {crew.writeScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Cadence: {crew.cadence}</p>
                <p className="mt-2 text-sm text-white/80">Gate: {crew.approvalGate}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">How to start</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Ship the next product through the same portfolio system.</h2>
            <div className="mt-6 space-y-3">
              {portfolioSteps.map((step, index) => (
                <div className="sm-site-point" key={step}>
                  <span className="sm-site-point-dot" />
                  <span>{index + 1}. {step}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Next moves</p>
            <div className="mt-6 space-y-3">
              <p>Pick a named product line, not a vague category.</p>
              <p>Use the build teams as the guardrails for connectors, knowledge, safety, and workflow repeatability.</p>
              <p>Layer agent teams onto the release train so success signals stay measurable.</p>
              <p>Roll out the module with control-plane oversight from Build Studio, Platform Admin, and Agent Ops.</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/factory">
                Open build system
              </Link>
              <Link className="sm-button-secondary" to="/app/platform-admin">
                Open control plane
              </Link>
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}
