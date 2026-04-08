import { Link } from 'react-router-dom'

import { FREE_TOOLS, getSystemModules, SITE_SYSTEMS } from '../lib/siteSystems'

export function DemosPage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Demos</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              Open the flagship. See the real shape. Decide if it fits the workflow.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              These demos use synthetic sample data. The point is to show the working surface clearly, not bury it in brochure text.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm-demo-mini">
              <strong>Free to try</strong>
              <span>Each demo is a real system surface, not a slide deck.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Company-ready</strong>
              <span>Swap fields, owners, and rules for another company.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Built from modules</strong>
              <span>Every flagship can expand from the same shared base.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {SITE_SYSTEMS.map((system) => {
          const modules = getSystemModules(system.id)
          return (
            <article className="sm-demo-gallery-card" key={system.id}>
              <div className="flex flex-col gap-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
                  <h2 className="mt-3 text-3xl font-bold text-white">{system.name}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{system.tagline}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="sm-demo-mini">
                      <strong>Used by</strong>
                      <span>{system.audience}</span>
                    </div>
                    <div className="sm-demo-mini">
                      <strong>Modules inside</strong>
                      <span>{modules.map((item) => item.name).join(', ')}</span>
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
              <figure className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-[rgba(6,11,22,0.92)]">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  <span>Current branch screen</span>
                  <span>{system.name}</span>
                </div>
                <img alt={system.previewAlt} className="block w-full bg-[rgba(4,8,16,0.92)]" loading="lazy" src={system.previewImage} />
              </figure>
            </article>
          )
        })}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Small proofs</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Need a smaller entry point first?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              These are small proofs of single modules inside the bigger systems.
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
