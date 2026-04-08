import { Link } from 'react-router-dom'

import { SystemDemoCanvas } from '../components/SystemDemoCanvas'
import { FREE_TOOLS, SITE_SYSTEMS } from '../lib/siteSystems'

export function DemosPage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Demos</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Open the systems and see how they work.</h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are public demo surfaces. They show the actual working shape. The team app is still separate on app.supermega.dev.
          </p>
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
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/demos/${system.slug}`}>
                  Open demo
                </Link>
                <Link className="sm-button-secondary" to={`/products/${system.slug}`}>
                  View system
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
            <p className="sm-kicker text-[var(--sm-accent)]">Free tools</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Smaller public tools if you want to test one action first.</h2>
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
