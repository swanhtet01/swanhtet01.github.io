import { Link } from 'react-router-dom'

import {
  AI_WORKFLOW_DESK_AGENT_ARMY,
  AI_WORKFLOW_DESK_CLIENT_INPUTS,
  AI_WORKFLOW_DESK_MODULES,
  AI_WORKFLOW_DESK_PACKAGE,
  AI_WORKFLOW_DESK_PROOF_METRICS,
  AI_WORKFLOW_DESK_QUEUE,
} from '../lib/aiWorkflowDeskProduct'
import { appClientLoginBaseUrl } from '../lib/demoSurfaces'

function appProofHref() {
  return `${appClientLoginBaseUrl}/login?proof=ai-workflow-desk&next=${encodeURIComponent(AI_WORKFLOW_DESK_PACKAGE.appRoute)}`
}

export function AiWorkflowDeskPage() {
  return (
    <div className="space-y-8 pb-14">
      <section className="sm-site-panel overflow-hidden">
        <div className="grid gap-8 xl:grid-cols-[0.85fr_1.15fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Flagship offer</p>
            <h1 className="mt-4 max-w-4xl text-5xl font-black tracking-[-0.08em] text-white lg:text-7xl">
              Document Extraction Ledger
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              {AI_WORKFLOW_DESK_PACKAGE.promise}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/intake?package=ai-workflow-desk">
                Start file-first intake
              </Link>
              <a className="sm-button-secondary" href={appProofHref()}>
                Open Document Extraction Ledger
              </a>
              <Link className="sm-button-secondary" to="/pricing">
                Pricing
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/30">
            <img
              alt="Document Extraction Ledger workbench screenshot"
              className="h-full max-h-[520px] w-full object-cover object-top"
              src={AI_WORKFLOW_DESK_PACKAGE.image}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]" aria-label="Why this product">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">What changed</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] text-white">Prototypes are not enough.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
            The market is moving from impressive prototypes to deployed workflow systems. SuperMega should sell the last mile:
            source evidence, operating screens, approval gates, and measurable proof inside one client workflow.
          </p>
        </article>
        <article className="sm-site-panel">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Client buys</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">One painful workflow replaced, not a confusing menu of tools.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">We build</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">A source-backed queue, role screen, prepared work, review policy, and proof pack.</p>
            </div>
            <div className="rounded-3xl border border-[var(--sm-accent)]/25 bg-[var(--sm-accent)]/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">We expand</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">Managed workspace, browser actions, integrations, reporting, and custom SaaS modules.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="sm-site-panel" aria-label="Desk modules">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">System checklist</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.06em] text-white">Everything is built around proof and approval.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            This is the product clients can understand: send the files and field requirements; SuperMega returns a reviewed document ledger with exceptions and export proof.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-5">
          {AI_WORKFLOW_DESK_MODULES.map((module) => (
            <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5" key={module.label}>
              <span className="sm-status-pill">{module.status}</span>
              <h3 className="mt-4 text-2xl font-black tracking-[-0.04em] text-white">{module.label}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{module.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]" aria-label="Client input and work queue">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">What the client sends</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">The intake stays simple.</h2>
          <div className="mt-5 grid gap-3">
            {AI_WORKFLOW_DESK_CLIENT_INPUTS.map((input) => (
              <div className="flex gap-3 rounded-3xl border border-white/10 bg-black/20 p-4" key={input}>
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--sm-accent)]" />
                <p className="text-sm font-semibold leading-relaxed text-white">{input}</p>
              </div>
            ))}
          </div>
        </article>
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Example work queue</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">Prepared work is drafted; humans approve risk.</h2>
          <div className="mt-5 grid gap-3">
            {AI_WORKFLOW_DESK_QUEUE.map((item) => (
              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4" key={item.title}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-black text-white">{item.title}</h3>
                  <span className="sm-status-pill">{item.risk} risk</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.evidence}</p>
                <p className="mt-3 text-sm font-semibold text-white">{item.nextAction}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel" aria-label="Workflow operating team">
        <p className="sm-kicker text-[var(--sm-accent)]">Delivery team</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.06em] text-white">A client workflow gets a full operating packet.</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {AI_WORKFLOW_DESK_AGENT_ARMY.map((agent) => (
            <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5" key={agent.role}>
              <h3 className="text-xl font-black tracking-[-0.03em] text-white">{agent.role}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{agent.job}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel" aria-label="Proof metrics">
        <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Proof pack</p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] text-white">How we prove value.</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            {AI_WORKFLOW_DESK_PROOF_METRICS.map(([label, value]) => (
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4" key={label}>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">{label}</p>
                <p className="mt-3 text-sm font-semibold leading-relaxed text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
