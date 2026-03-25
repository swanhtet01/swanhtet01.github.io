import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { flagshipSystem, miniProducts, products, servicePacks } from '../content'

const coreModules = products.filter((product) => product.kind === 'Control module')

const roleSurfaces = [
  {
    name: 'Director view',
    detail: 'See priorities, blockers, and exceptions without reading ten separate updates.',
  },
  {
    name: 'Manager board',
    detail: 'Run owners, due dates, and follow-up across actions, suppliers, receiving, inventory, and quality.',
  },
  {
    name: 'Operator inputs',
    detail: 'Use simple forms, file intake, and check-ins instead of long manual tracker updates.',
  },
]

const agentSpine = [
  {
    name: 'Command Office',
    detail: 'Turns the working system into director priorities, flash briefs, and escalations.',
  },
  {
    name: 'Control Tower',
    detail: 'Runs the live queues for actions, suppliers, receiving, inventory, quality, and cash.',
  },
  {
    name: 'Platform Engineering',
    detail: 'Owns connectors, state, APIs, evals, and deployment so the system scales cleanly.',
  },
  {
    name: 'R&D Lab',
    detail: 'Tests new agent, UX, and automation ideas before they become part of the platform.',
  },
]

const stackNow = ['React', 'FastAPI', 'SQLite', 'Google APIs', 'Workspace service']
const stackNext = ['SQLModel', 'Cloud Run', 'Cloud Scheduler', 'Cloud Tasks', 'Secret Manager', 'Polars', 'DuckDB', 'LangGraph', 'PydanticAI']

export function PlatformPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Platform"
        title="SuperMega OS starts with one live operating layer."
        description="The first product is Action OS. It gives a business one place to see what matters, who owns it, and what is starting to break. Everything else plugs into that layer."
      />

      <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Wedge product</p>
          <h2 className="mt-3 text-4xl font-bold text-white">Action OS</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
            This is the core SuperMega value proposition: pull messy business signals out of Gmail, Drive, Sheets, and simple operator inputs, then turn them into one clean owner and due-date system. Once that board is trusted, we add the deeper control modules.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {flagshipSystem.steps.map((step) => (
              <div className="sm-chip text-white" key={step}>
                {step}
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/workbench">
              Open Workbench
            </Link>
            <Link className="sm-button-secondary" to="/workspace">
              Open Action OS
            </Link>
            <Link className="sm-button-accent" to="/contact?package=Action%20OS">
              Start with this
            </Link>
          </div>
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Role surfaces</p>
              <h2 className="mt-2 text-2xl font-bold text-white">How the platform feels in practice</h2>
            </div>
            <span className="sm-status-pill">
              <span className="sm-led bg-emerald-400" />
              Platform spine
            </span>
          </div>

          <div className="mt-5 grid gap-3">
            {roleSurfaces.map((surface) => (
              <div className="sm-proof-card" key={surface.name}>
                <p className="text-lg font-bold text-white">{surface.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{surface.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Long-term layer</p>
            <p className="mt-2 text-sm">{flagshipSystem.name} becomes the shared layer above actions, records, approvals, and role views.</p>
          </div>
        </article>
      </section>

      <section className="space-y-4">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Control modules</p>
          <h2 className="mt-2 text-2xl font-bold text-white">These are the systems that plug into Action OS.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {coreModules.map((module) => (
            <article className="sm-surface-soft p-5" key={module.name}>
              <h3 className="text-xl font-bold text-white">{module.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{module.tagline}</p>
              <p className="mt-4 text-sm text-white">{module.output}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Commercial shape</p>
          <h2 className="mt-3 text-2xl font-bold text-white">How we package the platform.</h2>
          <div className="mt-5 grid gap-3">
            {servicePacks.map((pack) => (
              <div className="sm-command-row" key={pack.name}>
                <div>
                  <p className="font-semibold text-white">{pack.name}</p>
                  <p className="text-sm text-[var(--sm-muted)]">{pack.promise}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3">
            {miniProducts.map((item) => (
              <div className="sm-chip text-white" key={item.name}>
                {item.name}: {item.tagline}
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Architecture and teams</p>
          <div className="mt-5 grid gap-3">
            {agentSpine.map((team) => (
              <div className="sm-command-row" key={team.name}>
                <div>
                  <p className="font-semibold text-white">{team.name}</p>
                  <p className="text-sm text-[var(--sm-muted)]">{team.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Working stack now</p>
              <ul className="mt-3 space-y-2 text-sm">
                {stackNow.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Next integrations</p>
              <ul className="mt-3 space-y-2 text-sm">
                {stackNext.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </section>
    </div>
  )
}
