import { Link } from 'react-router-dom'

import { FREE_TOOLS, SITE_SYSTEMS } from '../lib/siteSystems'

export function DemosPage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Demos</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              Live demos for the modules we actually roll out.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              Start with the module that matches the queue or review you want to replace. Open the demo and inspect the screen.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm-demo-mini">
              <strong>Module first</strong>
              <span>Sales OS, Operations OS, Founder Brief, or Client Portal.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Rollout ready</strong>
              <span>Swap owners, fields, and rules for another company.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Extend later</strong>
              <span>Add Approval Flow, QR Ordering, or Commerce Back Office later.</span>
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
                  See module
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
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Free proofs</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Need a smaller proof before the module?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              These are small public proofs of Sales OS or Operations OS, not standalone products.
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
