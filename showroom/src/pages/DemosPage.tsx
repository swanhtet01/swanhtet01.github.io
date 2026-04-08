import { Link } from 'react-router-dom'

import { SystemDemoCanvas } from '../components/SystemDemoCanvas'
import { FREE_TOOLS, SITE_SYSTEMS } from '../lib/siteSystems'

export function DemosPage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Demos</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              Working demos of the systems we actually roll out.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              Same surface, different labels, owners, and rules per company. Open the workflow you want to replace and inspect the screen.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm-demo-mini">
              <strong>Concrete</strong>
              <span>Board, inbox, brief, or portal.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Reusable</strong>
              <span>Swap fields, owners, and statuses for another company.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Expandable</strong>
              <span>Start narrow, then add approvals, ordering, or back office.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {SITE_SYSTEMS.map((system) => (
          <article className="sm-demo-gallery-card" key={system.id}>
            <div className="flex flex-col gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
                <h2 className="mt-3 text-3xl font-bold text-white">{system.name}</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{system.tagline}</p>
                <p className="mt-3 text-sm leading-relaxed text-white/88">{system.summary}</p>
                <p className="mt-3 text-sm font-medium text-white/88">Used by: {system.audience}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">Replaces: {system.replaces.join(', ')}.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-demo-mini">
                    <strong>Screen</strong>
                    <span>{system.surface[0]}</span>
                  </div>
                  <div className="sm-demo-mini">
                    <strong>Rollout</strong>
                    <span>{system.setup[0]}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/demos/${system.slug}`}>
                  Open demo
                </Link>
                <Link className="sm-button-secondary" to={`/products/${system.slug}`}>
                  See system
                </Link>
              </div>
            </div>
            <SystemDemoCanvas compact scenario={system.scenarios[0]} />
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Free proofs</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Need to test the front end of the system first?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              These are narrow public proofs of a larger system, not standalone brochure tools.
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {FREE_TOOLS.map((tool) => (
            <Link className="sm-demo-link" key={tool.name} to={tool.route}>
              <strong>{tool.name}</strong>
              <span>{tool.tagline}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
