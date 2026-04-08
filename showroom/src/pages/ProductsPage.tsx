import { Link } from 'react-router-dom'

import { CUSTOM_BUILD_EXAMPLES, SITE_SYSTEMS } from '../lib/siteSystems'

const categoryLabels = [
  { id: 'sales', label: 'Sales' },
  { id: 'operations', label: 'Operations' },
  { id: 'management', label: 'Founder' },
  { id: 'client-facing', label: 'Client' },
] as const

export function ProductsPage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              Four core systems. One shared base.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              Start with the module closest to the daily work. Use the same base for approvals, portals, back-office flows, and follow-on modules later.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {categoryLabels.map((item) => (
                <span className="sm-status-pill" key={item.id}>
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm-demo-mini">
              <strong>Open the screen</strong>
              <span>Each module shows a current branch screenshot first.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Pick one system</strong>
              <span>Sales, operations, daily brief, or client-facing work.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Extend from the base</strong>
              <span>Add approvals, intake, ordering, or portal flows later.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {SITE_SYSTEMS.map((system) => (
          <article className="sm-site-module-card sm-site-module-card-dense" id={system.slug} key={system.id}>
            <div className="sm-site-module-image-wrap">
              <img alt={system.previewAlt} className="sm-site-module-image" loading="lazy" src={system.previewImage} />
            </div>
            <div className="sm-site-module-body">
              <div className="sm-site-module-head">
                <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
                <h2 className="mt-2 text-3xl font-bold text-white lg:text-4xl">{system.name}</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{system.tagline}</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="sm-demo-mini">
                  <strong>Used by</strong>
                  <span>{system.audience}</span>
                </div>
                <div className="sm-demo-mini">
                  <strong>Ships first</strong>
                  <span>{system.surface[0]}</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {system.replaces.slice(0, 3).map((item) => (
                  <span className="sm-home-tag sm-home-tag-muted" key={item}>
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/products/${system.slug}`}>
                  View system
                </Link>
                <Link className="sm-button-secondary" to={`/demos/${system.slug}`}>
                  Open example
                </Link>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Extends into</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Add the next layer only after the first module is in use.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              Common follow-on modules use the same base and data model.
            </p>
          </div>
          <Link className="sm-button-secondary" to="/contact">
            Contact us
          </Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {CUSTOM_BUILD_EXAMPLES.map((item) => (
            <div className="sm-demo-mini" key={item}>
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="sm-site-proof-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Examples</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Want to inspect the screen in motion?</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/demos">
              Browse examples
            </Link>
            <Link className="sm-button-primary" to="/contact">
              Contact
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
