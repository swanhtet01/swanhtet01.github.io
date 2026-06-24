import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'
import { AGENT_TEAM_DETAILS, SOFTWARE_MODULE_DETAILS } from '../lib/softwareCatalog'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

function cleanLabel(value: string) {
  return value
    .replace(/\bAgentic\b/gi, 'Automated')
    .replace(/\bAgent Teams\b/gi, 'Review Lanes')
    .replace(/\bAgent Team\b/gi, 'Review Lane')
    .replace(/\bAgent Runtime\b/gi, 'Automation Runtime')
    .replace(/\bAgent\b/gi, 'Review')
    .replace(/\bAI\b/g, 'Automation')
}

const delegationPrinciples = [
  'Each automation lane runs inside a real queue, not beside the product as a chat-only helper.',
  'The system reads company memory, workflow state, and role rules before it prepares work.',
  'Humans still approve, decide, or intervene where the workflow needs trust and control.',
  'Every run pushes back into shared state so the next operator sees the same reality.',
] as const

export function AgentsPage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Automation"
        title="Invisible work lanes that run inside the system."
        description="SUPERMEGA.dev uses governed automation for cleanup, triage, watch, summaries, and follow-up on live company data. The goal is simple: reduce manual prep work without losing review, ownership, or audit."
      />

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Delegation model</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Delegate the preparation layer. Keep human trust at the decision layer.</h2>
          <div className="mt-6 space-y-3">
            {delegationPrinciples.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-proof-panel">
          <div className="sm-site-proof-head">
            <span>Governed runtime</span>
            <span>Queues + memory + human review</span>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <div className="sm-demo-mini">
              <strong>Reads</strong>
              <span>The system reads company records, workflow state, approvals, documents, and role rules before acting.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Prepares</strong>
              <span>They clean rows, route intake, rank exceptions, draft summaries, and surface missing evidence.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Hands off</strong>
              <span>They pass the result into a queue with clear owner, urgency, and reason instead of hiding the work in chat.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Learns</strong>
              <span>Every accepted change, escalation, and decision becomes part of the shared operating memory.</span>
            </div>
          </div>
          <div className="sm-site-proof-foot">
            <span>Use automation to shrink manual prep work, not to hide the operating system behind another copilot layer.</span>
            <Link className="sm-link" to="/products">
              See live products
            </Link>
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Automation lanes</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the first preparation loops exposed publicly.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The automation layer is productized as named lanes with bounded jobs, clear handoff behavior, and known module fit.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {AGENT_TEAM_DETAILS.map((agent) => (
            <article className="sm-demo-link sm-demo-link-card" key={agent.id}>
              <span className="sm-home-proof-label">Review lane</span>
              <strong>{cleanLabel(agent.name)}</strong>
              <span>{cleanLabel(agent.strap)}</span>
              <small className="text-[var(--sm-muted)]">{cleanLabel(agent.purpose)}</small>
              <small className="text-[var(--sm-muted)]">Delegates: {agent.delegates.map(cleanLabel).join(', ')}</small>
              <small className="text-[var(--sm-muted)]">{cleanLabel(agent.handoff)}</small>
              <small className="text-[var(--sm-muted)]">Shows up in: {agent.products.join(', ')}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Automation-ready starter packs</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Start from one live product, then turn on the right review loops.</h2>
          <div className="mt-6 grid gap-4">
            {STARTER_PACK_DETAILS.map((pack) => (
              <article className="sm-demo-link sm-demo-link-card" key={pack.id}>
                <strong>{pack.name}</strong>
                <span>{pack.promise}</span>
                <small className="text-[var(--sm-muted)]">Starts with: {pack.starterModules.join(' + ')}</small>
                <small className="text-[var(--sm-muted)]">Review loops: {pack.agentLoops.map(cleanLabel).join(', ')}</small>
                <div className="mt-2 flex flex-wrap gap-3">
                  <Link className="sm-button-secondary" to={`/products/${pack.slug}`}>
                    See product
                  </Link>
                  <Link className="sm-button-primary" to={contactLink(pack.name)}>
                    Start rollout
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Broader product fit</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Prepared checks are also part of the wider software catalog.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {SOFTWARE_MODULE_DETAILS.slice(0, 8).map((module) => (
              <article className="sm-demo-link sm-demo-link-card" key={module.id}>
                <span className="sm-home-proof-label">{module.category}</span>
                <strong>{module.name}</strong>
                <span>{module.summary}</span>
                <small className="text-[var(--sm-muted)]">Review loops: {module.agentTeams.map(cleanLabel).join(', ')}</small>
                <Link className="sm-link mt-1" to={contactLink(module.name)}>
                  Start with this module
                </Link>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-final">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Pick the first queue and the first review lane that should own the prep work.</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
              We can map which workflow stays human-led, which prep work gets delegated, and which product module should carry the first rollout.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/contact">
              Start rollout
            </Link>
            <Link className="sm-button-secondary" to="/products">
              See live products
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
