import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  COMPETITIVE_LAYERS,
  GENERAL_USE_PROTOTYPES,
  OPEN_SOURCE_ACCELERATORS,
  PROTOTYPE_FORGE_THESIS,
  SAAS_KILLER_SEQUENCE,
  STRATEGIC_SOURCES,
} from '../lib/prototypeForgeModel'
import {
  SAAS_KILLER_AGENT_TEAM,
  SAAS_KILLER_CLIENT_CHECKLIST,
  SAAS_KILLER_GATES,
  SAAS_KILLER_PACKAGES,
  SAAS_KILLER_POSITION,
  SAAS_KILLER_TARGETS,
} from '../lib/saasKillerOfferModel'

function readinessTone(readiness: string) {
  if (readiness === 'proof-ready') return 'bg-emerald-400/15 text-emerald-200'
  if (readiness === 'build-next') return 'bg-amber-400/15 text-amber-200'
  return 'bg-sky-400/15 text-sky-200'
}

export function PrototypeForgePage() {
  const proofReadyCount = GENERAL_USE_PROTOTYPES.filter((prototype) => prototype.readiness === 'proof-ready').length

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Prototype Forge"
        title="Build the SaaS-killer module machine."
        description="A research-backed product factory for turning SAP, MIT, Nirvasoft, Kaizentic, and open-source agent patterns into working SuperMega tools: private portals, browser workers, ERP action layers, research rooms, and security drills."
      />

      <section className="sm-surface-deep overflow-hidden p-6">
        <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">SaaS Killer Studio</p>
            <h2 className="mt-3 text-3xl font-semibold text-white lg:text-5xl">{SAAS_KILLER_POSITION.headline}</h2>
            <p className="mt-5 text-sm leading-7 text-[var(--sm-muted)]">{SAAS_KILLER_POSITION.customerPromise}</p>
            <p className="mt-4 text-sm leading-7 text-white">{SAAS_KILLER_POSITION.boundary}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-accent" to="/app/agent-workbench">
                Assign agent team
              </Link>
              <Link className="sm-button-secondary" to="/app/portal-factory">
                Build custom SaaS
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {SAAS_KILLER_PACKAGES.map((pack) => (
              <article className="rounded-3xl border border-white/10 bg-white/5 p-4" key={pack.id}>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">{pack.price}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{pack.name}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{pack.clientGets}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr,0.9fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Replacement targets</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Custom SaaS paths that can be sold without confusing clients.</h2>
            </div>
            <span className="sm-chip text-white">One pain first</span>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {SAAS_KILLER_TARGETS.map((target) => (
              <article className="rounded-3xl border border-white/10 bg-black/20 p-5" key={target.id}>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">{target.buyer}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{target.name}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">Replaces: {target.incumbents}</p>
                <p className="mt-3 text-sm leading-6 text-white">{target.customSaas}</p>
                <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={target.proofRoute}>
                  Open proof route
                </Link>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent team</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Who works on each client build.</h2>
          <div className="mt-5 space-y-3">
            {SAAS_KILLER_AGENT_TEAM.map((agent) => (
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4" key={agent.role}>
                <h3 className="font-semibold text-white">{agent.role}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{agent.mission}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--sm-accent)]">Evidence: {agent.requiredEvidence}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Client checklist</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">What we ask for before the sprint.</h2>
          <div className="mt-5 grid gap-3">
            {SAAS_KILLER_CLIENT_CHECKLIST.map((item) => (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4" key={item.label}>
                <h3 className="font-semibold text-white">{item.label}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{item.whyItMatters}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Approval gates</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">How we scale AI agents without pretending they are unsupervised magic.</h2>
          <div className="mt-5 space-y-3">
            {SAAS_KILLER_GATES.map((gate, index) => (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4" key={gate}>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Gate {index + 1}</p>
                <p className="mt-2 text-sm leading-6 text-white">{gate}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface-deep overflow-hidden p-6">
        <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">High-level answer</p>
            <h2 className="mt-3 text-3xl font-semibold text-white lg:text-5xl">{PROTOTYPE_FORGE_THESIS.title}</h2>
            <p className="mt-5 text-sm leading-7 text-[var(--sm-muted)]">{PROTOTYPE_FORGE_THESIS.s4hanaAnswer}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-accent" to="/app/portal-factory">
                Build a portal
              </Link>
              <Link className="sm-button-secondary" to="/app/market-intel">
                Open market intel
              </Link>
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Why Codex matters</p>
            <p className="mt-3 text-sm leading-7 text-white">{PROTOTYPE_FORGE_THESIS.codexAdvantage}</p>
            <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">SaaS killer definition</p>
              <p className="mt-3 text-sm leading-7 text-[var(--sm-muted)]">{PROTOTYPE_FORGE_THESIS.saasKillerDefinition}</p>
            </div>
            <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Proof-ready wedges</p>
              <p className="mt-2 text-3xl font-semibold text-white">{proofReadyCount}</p>
              <p className="mt-1 text-sm text-[var(--sm-muted)]">General-use prototypes can already point to live app routes.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {STRATEGIC_SOURCES.map((source) => (
          <article className="sm-surface p-5" key={source.url}>
            <p className="sm-kicker text-[var(--sm-accent)]">{source.category}</p>
            <h3 className="mt-3 text-lg font-semibold text-white">{source.name}</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{source.signal}</p>
            <p className="mt-3 text-sm leading-6 text-white">{source.supermegaTake}</p>
            <a className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" href={source.url} rel="noreferrer" target="_blank">
              Source
            </a>
          </article>
        ))}
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Competitive layers</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Where SuperMega beats SAP-scale and local integrator models.</h2>
          </div>
          <span className="sm-chip text-white">System of action</span>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {COMPETITIVE_LAYERS.map((layer) => (
            <article className="rounded-3xl border border-white/10 bg-black/20 p-5" key={layer.layer}>
              <h3 className="text-xl font-semibold text-white">{layer.layer}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Incumbent: {layer.incumbent}</p>
              <p className="mt-4 text-sm leading-6 text-white">{layer.supermegaAdvantage}</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={layer.proof}>
                Open proof
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">General-use tools</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Working prototype catalog to show prospects.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/founder-machine">
            Feed Founder Machine
          </Link>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {GENERAL_USE_PROTOTYPES.map((prototype) => (
            <article className="rounded-3xl border border-white/10 bg-white/5 p-5" key={prototype.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">{prototype.buyerLabel}</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">{prototype.name}</h3>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] ${readinessTone(prototype.readiness)}`}>
                  {prototype.readiness}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--sm-muted)]">{prototype.problem}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Inputs</p>
                  <p className="mt-2 text-sm text-white">{prototype.inputs.join(', ')}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Outputs</p>
                  <p className="mt-2 text-sm text-white">{prototype.outputs.join(', ')}</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Workflow</p>
                <p className="mt-2 text-sm text-white">{prototype.workflow.join(' -> ')}</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-white">{prototype.moat}</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={prototype.route}>
                Open prototype surface
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Open-source accelerators</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Borrow patterns, not dependency risk.</h2>
          <div className="mt-5 space-y-4">
            {OPEN_SOURCE_ACCELERATORS.map((repo) => (
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5" key={repo.url}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{repo.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{repo.pattern}</p>
                  </div>
                  <span className="sm-chip text-white">{repo.license}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white">{repo.useFor}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">Rule: {repo.adoptionRule}</p>
                <a className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" href={repo.url} rel="noreferrer" target="_blank">
                  Repository
                </a>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Execution sequence</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">How this becomes a company, not a prototype pile.</h2>
          <div className="mt-5 space-y-3">
            {SAAS_KILLER_SEQUENCE.map((step, index) => (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4" key={step}>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Step {index + 1}</p>
                <p className="mt-2 text-sm leading-6 text-white">{step}</p>
              </div>
            ))}
          </div>
          <Link className="mt-5 inline-flex sm-button-accent" to="/app/market-intel">
            Use for UMFCCI follow-up
          </Link>
        </article>
      </section>
    </div>
  )
}
