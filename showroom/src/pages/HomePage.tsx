import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { SITE_SYSTEMS } from '../lib/siteSystems'

const systemScreens: Record<string, string> = {
  sales: '/site/sales-system-screen.png',
  operations: '/site/ops-inbox-screen.png',
  brief: '/site/founder-brief-screen.png',
  portal: '/site/client-portal-screen.png',
}

export function HomePage() {
  const [activeSystemId, setActiveSystemId] = useState(SITE_SYSTEMS[0].id)
  const activeSystem = SITE_SYSTEMS.find((item) => item.id === activeSystemId) ?? SITE_SYSTEMS[0]

  useEffect(() => {
    const ids = SITE_SYSTEMS.map((item) => item.id)
    const timer = window.setInterval(() => {
      setActiveSystemId((current) => {
        const index = ids.indexOf(current)
        const nextIndex = index === -1 ? 0 : (index + 1) % ids.length
        return ids[nextIndex]
      })
    }, 4200)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="pb-16">
      <section className="sm-site-bleed sm-site-hero sm-site-hero-reset">
        <div className="sm-site-reset-grid">
          <div className="sm-site-hero-copy sm-site-hero-copy-tight">
            <p className="sm-kicker text-[var(--sm-accent)]">SuperMega</p>
            <h1 className="mt-4 max-w-5xl text-5xl font-extrabold tracking-tight text-white lg:text-8xl">
              Shared software for sales, operations, approvals, and client work.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Real product screens from the current branch. Start with one module. Add more only when the team is using it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/products">
                View systems
              </Link>
              <Link className="sm-button-secondary" to="/contact">
                Contact
              </Link>
            </div>
            <div className="mt-10 sm-home-quick-list">
              <span>Sales workspace</span>
              <span>Ops queue</span>
              <span>Daily brief</span>
              <span>Client portal</span>
            </div>
          </div>

          <div className="sm-hero-demo-block sm-hero-demo-block-live sm-site-hero-stage">
            <div className="sm-home-demo-head">
              <div className="sm-home-demo-copy">
                <span className="sm-home-demo-label">Current branch screen</span>
                <strong>{activeSystem.name}</strong>
                <span>{activeSystem.tagline}</span>
              </div>
              <div className="sm-demo-switcher">
                {SITE_SYSTEMS.map((item) => (
                  <button
                    className={`sm-demo-switch ${item.id === activeSystem.id ? 'sm-demo-switch-active' : ''}`}
                    key={item.id}
                    onClick={() => setActiveSystemId(item.id)}
                    type="button"
                  >
                    {item.shortName}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm-home-proof-shot-frame">
              <img
                alt={`${activeSystem.name} screenshot`}
                className="sm-home-proof-shot sm-home-proof-shot-hero"
                src={systemScreens[activeSystem.id]}
              />
            </div>

            <div className="sm-home-demo-note">
              <span>{activeSystem.summary}</span>
              <div className="flex flex-wrap gap-3">
                <Link className="sm-link" to={`/products/${activeSystem.slug}`}>
                  View system
                </Link>
                <Link className="sm-link" to={`/demos/${activeSystem.slug}`}>
                  Open example
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12 sm-site-panel">
        <div className="sm-home-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Core systems</p>
            <h2 className="mt-3 max-w-4xl text-3xl font-bold text-white lg:text-5xl">
              Pick the screen that matches the work you already need to run.
            </h2>
          </div>
          <Link className="sm-link" to="/products">
            All systems
          </Link>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {SITE_SYSTEMS.map((system) => (
            <article className="sm-site-module-card" key={system.id}>
              <div className="sm-site-module-image-wrap">
                <img alt={`${system.name} screenshot`} className="sm-site-module-image" src={systemScreens[system.id]} />
              </div>
              <div className="sm-site-module-body">
                <div className="sm-site-module-head">
                  <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
                  <h3 className="mt-2 text-2xl font-bold text-white lg:text-3xl">{system.name}</h3>
                </div>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{system.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {system.replaces.slice(0, 2).map((item) => (
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
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="sm-home-process-strip">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">How it expands</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Ship one working module first.</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
              Start with the queue, review, or portal the team will actually open. Then extend the same base instead of starting over.
            </p>
          </div>
          <div className="sm-home-process-grid">
            <div className="sm-demo-mini">
              <strong>1</strong>
              <span>Pick one module</span>
            </div>
            <div className="sm-demo-mini">
              <strong>2</strong>
              <span>Use the live screen</span>
            </div>
            <div className="sm-demo-mini">
              <strong>3</strong>
              <span>Add the next module later</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="sm-site-final">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Contact</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Tell us which workflow still feels fragmented.</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
              We&apos;ll point you to the closest module or shape a new one from the same base.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/contact">
              Contact
            </Link>
            <a className="sm-button-secondary" href="https://app.supermega.dev" rel="noreferrer" target="_blank">
              Open app
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
