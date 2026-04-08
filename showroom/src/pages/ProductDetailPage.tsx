import { Link, Navigate, useParams } from 'react-router-dom'

import { getSiteSystem, getSystemModules, SITE_SYSTEMS } from '../lib/siteSystems'

export function ProductDetailPage() {
  const { productId } = useParams()
  const system = getSiteSystem(productId)

  if (!system) {
    return <Navigate replace to="/products" />
  }

  const siblingSystems = SITE_SYSTEMS.filter((item) => item.id !== system.id)
  const modules = getSystemModules(system.id)

  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{system.name}</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{system.tagline}</p>
            <p className="mt-4 max-w-3xl text-sm font-medium text-white/88">{system.summary}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to={`/demos/${system.slug}`}>
              Open demo
            </Link>
            <Link className="sm-button-secondary" to="/products">
              All systems
            </Link>
            <Link className="sm-button-secondary" to={`/contact?package=${encodeURIComponent(system.name)}`}>
              Contact
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="sm-site-panel">
          <figure className="sm-site-proof-panel">
            <div className="sm-site-proof-head">
              <span>Current branch screen</span>
              <span>{system.name}</span>
            </div>
            <img alt={system.previewAlt} className="sm-site-proof-image" src={system.previewImage} />
            <figcaption className="sm-site-proof-foot">
              <span>{system.previewNote}</span>
              <Link className="sm-link" to={`/demos/${system.slug}`}>
                Open demo
              </Link>
            </figcaption>
          </figure>
        </article>

        <div className="space-y-6">
          <article className="sm-site-panel sm-site-detail-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Who uses it</p>
            <div className="mt-5 grid gap-3">
              {system.audience.split(', ').map((item) => (
                <div className="sm-demo-mini" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </article>

          <article className="sm-site-panel sm-site-detail-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">How it looks</p>
            <div className="mt-5 grid gap-3">
              {system.surface.map((item) => (
                <div className="sm-demo-mini" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Core modules</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">This flagship is built from focused reusable modules.</h2>
          </div>
          <span className="sm-status-pill">{modules.length} modules</span>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {modules.map((module) => (
            <article className="sm-demo-link sm-demo-link-card" key={module.id}>
              <strong>{module.name}</strong>
              <span>{module.purpose}</span>
              <small className="text-[var(--sm-muted)]">Used by: {module.users}</small>
              <small className="text-[var(--sm-muted)]">Looks like: {module.looksLike}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="sm-site-panel sm-site-detail-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Replaces</p>
          <div className="mt-5 grid gap-3">
            {system.replaces.map((item) => (
              <div className="sm-demo-mini" key={item}>
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel sm-site-detail-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Set it up for another company</p>
          <div className="mt-5 space-y-3">
            {system.setup.map((step, index) => (
              <div className="sm-site-point" key={step}>
                <span className="sm-site-point-dot" />
                <span>
                  {index + 1}. {step}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel sm-site-detail-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Expand next</p>
          <div className="mt-5 grid gap-3">
            {system.nextBuilds.map((item) => (
              <div className="sm-demo-mini" key={item}>
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Other flagships</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Same shared base. Different daily surface.</h2>
          </div>
          <Link className="sm-button-secondary" to="/products">
            View all systems
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {siblingSystems.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.id}>
              <strong>{item.name}</strong>
              <span>{item.tagline}</span>
              <div className="mt-4 flex gap-3">
                <Link className="sm-link" to={`/demos/${item.slug}`}>
                  Demo
                </Link>
                <Link className="sm-link" to={`/products/${item.slug}`}>
                  System
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
