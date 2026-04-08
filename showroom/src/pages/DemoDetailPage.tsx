import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { SystemDemoCanvas } from '../components/SystemDemoCanvas'
import { getSiteSystem } from '../lib/siteSystems'

export function DemoDetailPage() {
  const { demoId } = useParams()
  const system = getSiteSystem(demoId)
  const [activeScenarioId, setActiveScenarioId] = useState(system?.scenarios[0]?.id ?? '')

  if (!system) {
    return <Navigate replace to="/demos" />
  }

  const activeScenario = system.scenarios.find((item) => item.id === activeScenarioId) ?? system.scenarios[0]

  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live demo</p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{system.name}</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{system.tagline}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to={`/products/${system.slug}`}>
              View system
            </Link>
            <Link className="sm-button-primary" to={`/contact?package=${encodeURIComponent(system.name)}`}>
              Contact
            </Link>
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
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
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">What this replaces</p>
          <div className="mt-5 grid gap-3">
            {system.replaces.map((item) => (
              <div className="sm-demo-mini" key={item}>
                {item}
              </div>
            ))}
          </div>
        </article>
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Typical setup</p>
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
      </section>
    </div>
  )
}
