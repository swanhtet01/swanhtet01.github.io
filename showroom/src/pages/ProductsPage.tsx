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
        <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              Public modules for sales, operations, founder review, and client work.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              Start with the module that matches the work you want to replace. Then extend only after the team is using it.
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
              <strong>Open the surface</strong>
              <span>See the actual branch screenshot before reading further.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Pick one module</strong>
              <span>Sales OS, Operations OS, Founder Brief, or Client Portal.</span>
            </div>
            <div className="sm-demo-mini">
              <strong>Expand from the base</strong>
              <span>Add Approval Flow, QR Ordering, or Commerce Back Office later.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-8">
        {SITE_SYSTEMS.map((system, index) => (
          <article className="sm-product-row" id={system.slug} key={system.id}>
            <div className={index % 2 === 0 ? 'order-2 lg:order-1' : 'order-2'}>
              <div className="sm-product-copy">
                <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
                <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">{system.name}</h2>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{system.tagline}</p>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/88">{system.summary}</p>
                <p className="mt-4 text-sm font-medium text-white/88">Used by: {system.audience}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">
                  Replaces: {system.replaces.join(', ')}.
                </p>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="sm-demo-mini">
                    <strong>Screen</strong>
                    <span>{system.surface[0]}</span>
                  </div>
                  <div className="sm-demo-mini">
                    <strong>Set it up</strong>
                    <span>{system.setup[0]}</span>
                  </div>
                  <div className="sm-demo-mini">
                    <strong>Extend into</strong>
                    <span>{system.nextBuilds[0]}</span>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link className="sm-button-primary" to={`/demos/${system.slug}`}>
                    Open demo
                  </Link>
                  <Link className="sm-button-secondary" to={`/products/${system.slug}`}>
                    See module
                  </Link>
                  <Link className="sm-button-secondary" to={`/contact?package=${encodeURIComponent(system.name)}`}>
                    Contact us
                  </Link>
                </div>
              </div>
            </div>
            <div className={index % 2 === 0 ? 'order-1 lg:order-2' : 'order-1'}>
              <figure className="overflow-hidden rounded-[1.3rem] border border-white/10 bg-[rgba(6,11,22,0.9)] shadow-[var(--sm-shadow)]">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--sm-muted)]">
                  <span>Branch screenshot</span>
                  <span>{system.name}</span>
                </div>
                <img
                  alt={system.previewAlt}
                  className="block w-full bg-[rgba(4,8,16,0.92)]"
                  loading="lazy"
                  src={system.previewImage}
                />
                <figcaption className="flex flex-col gap-3 px-4 py-4 text-sm text-[var(--sm-muted)] md:flex-row md:items-center md:justify-between">
                  <span>{system.previewNote}</span>
                  <Link className="sm-link" to={`/demos/${system.slug}`}>
                    Open live demo
                  </Link>
                </figcaption>
              </figure>
            </div>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Custom builds</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Need the next layer after the core systems?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              Common next modules are Approval Flow, QR Ordering, Commerce Back Office, Supplier Portal, and Learning Hub.
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
    </div>
  )
}
