import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { PLATFORM_LAYER_DETAILS, STARTER_PACK_DETAILS } from '../lib/salesControl'

type StackModule = {
  id: string
  name: string
  purpose: string
  looksLike: string
}

const disruptionPoints = [
  'You stop buying separate tools for CRM, approvals, portals, reporting, cleanup, and operational follow-up.',
  'The same company context stops getting retyped into chats, sheets, inboxes, dashboards, and disconnected apps.',
  'Automation handles repetitive prep work so the product can stay smaller, clearer, and easier to trust.',
]

const knowledgePrinciples = [
  'Every account, request, approval, file, and decision should live in shared data.',
  'Documents, chats, inboxes, and exports should become reusable records instead of dead attachments.',
  'The same records should power queues, client views, leadership review, and background jobs.',
]

const infrastructurePrinciples = [
  'One connection layer for Gmail, Drive, Sheets, ERP extracts, uploads, APIs, and operational feeds.',
  'One workflow layer for statuses, owners, timers, escalations, approvals, and handoffs.',
  'One automation layer for watchers, triage, summaries, follow-up, and recovery loops.',
  'One permissions layer for access, tenants, audit, and role-specific views.',
]

const knowledgeModules: StackModule[] = [
  {
    id: 'company-memory',
    name: 'Company Memory',
    purpose: 'Keep accounts, approvals, notes, files, and workflow state in one reusable company context.',
    looksLike: 'Entities, timelines, summaries, linked records',
  },
  {
    id: 'decision-journal',
    name: 'Decision Journal',
    purpose: 'Track approvals, escalations, and directional decisions in one searchable reasoning trail.',
    looksLike: 'Decision log, evidence, approver, outcome',
  },
  {
    id: 'document-intelligence',
    name: 'Document Intelligence',
    purpose: 'Read inbound files, classify them, extract useful fields, and route them into owned work.',
    looksLike: 'Ingest, classify, extract, route',
  },
  {
    id: 'knowledge-base',
    name: 'Knowledge Base',
    purpose: 'Publish internal and client-facing SOPs, playbooks, onboarding modules, and controlled answers.',
    looksLike: 'Articles, playbooks, permissions, versioned content',
  },
]

const infrastructureModules: StackModule[] = [
  {
    id: 'connector-hub',
    name: 'Connector Hub',
    purpose: 'Bring Gmail, Drive, Sheets, ERP extracts, uploads, and operational exports into one ingest layer.',
    looksLike: 'Connectors, sync state, source map, error queue',
  },
  {
    id: 'workflow-runtime',
    name: 'Workflow Runtime',
    purpose: 'Power statuses, owners, timers, escalations, approvals, and handoffs across all modules.',
    looksLike: 'States, rules, timers, transitions',
  },
  {
    id: 'agent-runtime',
    name: 'Agent Runtime',
    purpose: 'Run triage, cleanup, watcher, summary, follow-up, and recovery loops against live company state.',
    looksLike: 'Job types, runs, schedules, retries, approval gates',
  },
  {
    id: 'identity-governance',
    name: 'Identity and Governance',
    purpose: 'Manage tenant access, user roles, external portal permissions, and audit across the platform.',
    looksLike: 'Roles, tenants, scopes, audit trail',
  },
  {
    id: 'observability',
    name: 'Observability',
    purpose: 'Track queue health, connector failures, stale data, and agent drift before operators lose trust.',
    looksLike: 'Health board, alerts, failure lanes, stale-run signals',
  },
]

const usageModes = [
  {
    name: 'For your team',
    detail: 'Use SuperMega as the operating layer for your own queues, approvals, documents, and automations.',
  },
  {
    name: 'For your own workspace',
    detail: 'Use the same system as a personal workspace for briefs, tasks, decisions, notes, and follow-up.',
  },
  {
    name: 'For clients',
    detail: 'Deploy branded external systems for customers, suppliers, partners, and managed-service operations on top of the same base.',
  },
  {
    name: 'For self-hosted builds',
    detail: 'Reuse shared code while tenant-specific workflows, data, and private products stay separate.',
  },
] as const

const openBuildPrinciples = [
  'Shared runtime pieces can be open while private tenant workflows stay private.',
  'Your own workspace can run first before the same system is sold outward to clients.',
  'Internal tools and client products should share data and automation instead of becoming two separate products.',
  'Open modules should make the platform easier to trust, extend, and self-host when needed.',
] as const

export function PlatformNarrativePage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="How it works"
        title="One system for products, internal tools, and your own workspace."
        description="Start with one product. Keep data, permissions, connections, and automation connected behind it. Use the same base for your own team, your own workspace, or client setups."
      />

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Why this matters</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">The goal is to replace tool sprawl, not decorate it.</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
            Traditional stacks stretch one workflow across CRM, ticketing, portals, spreadsheets, approvals, dashboards, storage, and chat.
            SuperMega keeps that work in one connected system shaped around the company itself.
          </p>

          <div className="mt-6 space-y-3">
            {disruptionPoints.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-proof-panel">
          <div className="sm-site-proof-head">
            <span>Software stack</span>
            <span>Business modules + knowledge + runtime</span>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-3">
            {PLATFORM_LAYER_DETAILS.map((item) => (
              <div className="sm-demo-mini" key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
          <div className="sm-site-proof-foot">
            <span>Start from one working product. Expand through the same base instead of buying another category product.</span>
            <div className="flex flex-wrap gap-4">
              <Link className="sm-link" to="/products">
                Explore products
              </Link>
            </div>
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-proof-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Usage modes</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">This is not only for clients. It is also for your own tools and workspace.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              The same platform can start as your internal operating stack, become your own workspace, and later expand into client systems or self-hosted builds.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {usageModes.map((item) => (
              <article className="sm-demo-link sm-demo-link-card" key={item.name}>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-proof-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Application layer</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">Business modules teams can adopt immediately.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              These are the entry points into the wider platform. Each one starts with a narrow workflow and expands into a company system later.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {STARTER_PACK_DETAILS.map((pack) => (
              <article className="sm-demo-link sm-demo-link-card" key={pack.id}>
                <strong>{pack.name}</strong>
                <span>{pack.promise}</span>
                <small className="text-[var(--sm-muted)]">Starts with: {pack.starterModules.join(' + ')}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Shared data</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">Shared records are part of the product, not a side feature.</h2>
          </div>

          <div className="mt-6 space-y-3">
            {knowledgePrinciples.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3">
            {knowledgeModules.map((module) => (
              <article className="sm-demo-link sm-demo-link-card" key={module.id}>
                <strong>{module.name}</strong>
                <span>{module.purpose}</span>
                <small className="text-[var(--sm-muted)]">Looks like: {module.looksLike}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Connections and automation</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">Connections, workflow rules, permissions, and automation under every module.</h2>
          </div>

          <div className="mt-6 space-y-3">
            {infrastructurePrinciples.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3">
            {infrastructureModules.map((module) => (
              <article className="sm-demo-link sm-demo-link-card" key={module.id}>
                <strong>{module.name}</strong>
                <span>{module.purpose}</span>
                <small className="text-[var(--sm-muted)]">Looks like: {module.looksLike}</small>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-proof-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Open build model</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-4xl">Shared code and private products can coexist in one strategy.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              If you want SuperMega to support open-source work as well, the clean path is to expose reusable layers while keeping tenant-specific workflows, data, and commercial products private where needed.
            </p>
          </div>
          <div className="space-y-3">
            {openBuildPrinciples.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="sm-home-process-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Rollout logic</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Start small. Keep the system connected.</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
              The product becomes more valuable when a narrow daily workflow lands first, then the company grows into the same shared data and automation base instead of adding more fragmented tools.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="sm-demo-mini">
              <strong>01 Pick the bottleneck</strong>
              <span>Start with the queue, workflow, or status view that already hurts every day.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>02 Launch one product</strong>
              <span>Use the real data and habits the team already has instead of forcing a giant migration.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>03 Turn on agent loops</strong>
              <span>Add cleanup, triage, summaries, and follow-up after the human workflow is trusted.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>04 Expand the platform</strong>
              <span>Add knowledge and infrastructure modules that make the whole company smarter over time.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-final">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Choose the first workflow, infrastructure layer, or workspace that should become software.</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
              We can shape the first product, the supporting shared data, the connections behind it, and the split between private and open layers.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/contact">
              Start the software map
            </Link>
            <Link className="sm-button-secondary" to="/products">
              Explore products
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
