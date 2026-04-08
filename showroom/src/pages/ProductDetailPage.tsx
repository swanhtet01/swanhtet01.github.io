import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { SystemDemoCanvas } from '../components/SystemDemoCanvas'
import { getSiteSystem, SITE_SYSTEMS } from '../lib/siteSystems'

export function ProductDetailPage() {
  const { productId } = useParams()
  const system = getSiteSystem(productId)
  const [activeScenarioId, setActiveScenarioId] = useState(system?.scenarios[0]?.id ?? '')

  if (!system) {
    return <Navigate replace to="/products" />
  }

  const activeScenario =
    system.scenarios.find((item) => item.id === activeScenarioId) ?? system.scenarios[0]
  const siblingSystems = SITE_SYSTEMS.filter((item) => item.id !== system.id)

  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{system.name}</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{system.tagline}</p>
            <p className="mt-4 text-sm font-medium text-white/88">Used by: {system.audience}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to={`/demos/${system.slug}`}>
              Open demo
            </Link>
            <Link className="sm-button-secondary" to={`/contact?package=${encodeURIComponent(system.name)}`}>
              Contact us
            </Link>
            {system.freeToolLabel && system.freeToolRoute ? (
              <Link className="sm-button-secondary" to={system.freeToolRoute}>
                {system.freeToolLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <article className="sm-site-panel">
          <div className="sm-demo-switcher mb-5">
            {system.scenarios.map((item) => (
              <button
                className={`sm-demo-switch ${item.id === activeScenario.id ? 'sm-demo-switch-active' : ''}`}
                key={item.id}
                onClick={() => setActiveScenarioId(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <SystemDemoCanvas scenario={activeScenario} />
        </article>

        <div className="space-y-6">
          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">What it is</p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{system.summary}</p>
          </article>

          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Who uses it</p>
            <div className="mt-5 grid gap-3">
              {system.audience.split(', ').map((item) => (
                <div className="sm-demo-mini" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </article>

          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">What the screen has</p>
            <div className="mt-5 grid gap-3">
              {system.surface.map((item) => (
                <div className="sm-demo-mini" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </article>

          <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Start simple</p>
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
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">What it replaces</p>
          <div className="mt-5 grid gap-3">
            {system.replaces.map((item) => (
              <div className="sm-demo-mini" key={item}>
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
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

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Expand it into</p>
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
            <p className="sm-kicker text-[var(--sm-accent)]">Other systems</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Same company base. Different working surface.</h2>
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
                  Details
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
