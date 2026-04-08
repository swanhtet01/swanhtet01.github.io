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
        <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr] xl:items-start">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{system.name}</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{system.tagline}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {system.replaces.map((item) => (
                <span className="sm-status-pill" key={item}>
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={`/demos/${system.slug}`}>
                {system.demoCta}
              </Link>
              <Link className="sm-button-secondary" to={`/contact?package=${encodeURIComponent(system.name)}`}>
                Contact
              </Link>
              {system.freeToolLabel && system.freeToolRoute ? (
                <Link className="sm-button-secondary" to={system.freeToolRoute}>
                  Try {system.freeToolLabel}
                </Link>
              ) : null}
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {system.dailyUse.map((item) => (
                <div className="sm-demo-mini" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="sm-demo-switcher mb-4">
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
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Why it helps</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">One working surface. One queue. One next step.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{system.summary}</p>
          <div className="mt-6 space-y-3">
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
          <p className="sm-kicker text-[var(--sm-accent)]">Where it goes next</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">This is a base system, not a dead-end demo.</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
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
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Use the same company base for another workflow.</h2>
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
                <Link className="sm-link" to={`/products/${item.slug}`}>
                  View
                </Link>
                <Link className="sm-link" to={`/demos/${item.slug}`}>
                  Demo
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
