import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'
import { AGENT_TEAM_DETAILS, SOFTWARE_MODULE_DETAILS } from '../lib/softwareCatalog'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

const delegationPrinciples = [
  'Each agent runs inside a real queue, not beside the product as a chat-only helper.',
  'Agents read company memory, workflow state, and role rules before they prepare work.',
  'Humans still approve, decide, or intervene where the workflow needs trust and control.',
  'Every run pushes back into shared state so the next operator and the next agent see the same reality.',
] as const

export function AgentsPage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Agents"
        title="Agent teams that run inside the system, not beside it."
        description="SUPERMEGA.dev uses agent teams for cleanup, triage, watch, summaries, and follow-up on live company data. The goal is simple: reduce manual prep work without losing review, ownership, or audit."
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
            <span>Agent-native runtime</span>
            <span>Queues + memory + human review</span>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <div className="sm-demo-mini">
              <strong>Reads</strong>
              <span>Agents read company records, workflow state, approvals, documents, and role rules before acting.</span>
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
            <span>Use agents to shrink manual prep work, not to hide the operating system behind another copilot layer.</span>
            <Link className="sm-link" to="/products">
              See live products
            </Link>
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Agent teams</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the first delegation loops exposed publicly.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The agent layer is productized as named teams with bounded jobs, clear handoff behavior, and known module fit.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {AGENT_TEAM_DETAILS.map((agent) => (
            <article className="sm-demo-link sm-demo-link-card" key={agent.id}>
              <span className="sm-home-proof-label">Agent team</span>
              <strong>{agent.name}</strong>
              <span>{agent.strap}</span>
              <small className="text-[var(--sm-muted)]">{agent.purpose}</small>
              <small className="text-[var(--sm-muted)]">Delegates: {agent.delegates.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">{agent.handoff}</small>
              <small className="text-[var(--sm-muted)]">Shows up in: {agent.products.join(', ')}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent-ready starter packs</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Start from one live product, then turn on the right agent loops.</h2>
          <div className="mt-6 grid gap-4">
            {STARTER_PACK_DETAILS.map((pack) => (
              <article className="sm-demo-link sm-demo-link-card" key={pack.id}>
                <strong>{pack.name}</strong>
                <span>{pack.promise}</span>
                <small className="text-[var(--sm-muted)]">Starts with: {pack.starterModules.join(' + ')}</small>
                <small className="text-[var(--sm-muted)]">Agent teams: {pack.agentLoops.join(', ')}</small>
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
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Agents are also part of the wider software catalog.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {SOFTWARE_MODULE_DETAILS.slice(0, 8).map((module) => (
              <article className="sm-demo-link sm-demo-link-card" key={module.id}>
                <span className="sm-home-proof-label">{module.category}</span>
                <strong>{module.name}</strong>
                <span>{module.summary}</span>
                <small className="text-[var(--sm-muted)]">Agent teams: {module.agentTeams.join(', ')}</small>
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
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Pick the first queue and the first agent team that should own the prep work.</h2>
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
