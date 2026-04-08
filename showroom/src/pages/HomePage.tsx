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
  const flagshipSystems = SITE_SYSTEMS.filter((item) => item.id !== 'portal')
  const portalSystem = SITE_SYSTEMS.find((item) => item.id === 'portal') ?? SITE_SYSTEMS[SITE_SYSTEMS.length - 1]

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
          <div className="sm-site-hero-copy">
            <div className="sm-home-site-marker">
              <span>Public site</span>
              <span>Live examples</span>
              <span>Team app separate</span>
            </div>
            <p className="sm-kicker text-[var(--sm-accent)]">SuperMega</p>
            <h1 className="mt-4 max-w-5xl text-5xl font-extrabold tracking-tight text-white lg:text-8xl">
              Systems that turn messy company work into one clean surface.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Sales, operations, client work, and founder review.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={`/demos/${activeSystem.slug}`}>
                Open live example
              </Link>
              <Link className="sm-button-secondary" to="/contact">
                Contact
              </Link>
            </div>
            <div className="mt-10 sm-home-proof-bar">
              <div className="sm-home-proof-item">
                <span className="sm-home-proof-label">Website</span>
                <strong>Shows systems and examples</strong>
              </div>
              <div className="sm-home-proof-item">
                <span className="sm-home-proof-label">App</span>
                <strong>Runs the real team workflow</strong>
              </div>
              <div className="sm-home-proof-item">
                <span className="sm-home-proof-label">Agents</span>
                <strong>Keep queues and briefs moving</strong>
              </div>
            </div>
          </div>

          <div className="sm-hero-demo-block sm-hero-demo-block-live">
            <div className="sm-home-demo-head">
              <div className="sm-home-demo-copy">
                <span className="sm-home-demo-label">Live example</span>
                <strong>{activeSystem.name}</strong>
                <span>{activeSystem.replaces[0]}</span>
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
              <span>{activeSystem.audience}</span>
              <Link className="sm-link" to={`/products/${activeSystem.slug}`}>
                View system
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12 sm-site-panel">
        <div className="sm-home-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Flagship systems</p>
            <h2 className="mt-3 max-w-4xl text-3xl font-bold text-white lg:text-5xl">Start with the surface people will actually open every day.</h2>
          </div>
          <Link className="sm-link" to="/products">
            All systems
          </Link>
        </div>
        <div className="mt-10">
          {flagshipSystems.map((system, index) => (
            <article className={`sm-home-system-row ${index % 2 === 1 ? 'sm-home-system-row-reverse' : ''}`} key={system.id}>
              <div className="sm-home-system-copy">
                <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
                <h3 className="mt-3 text-3xl font-bold text-white lg:text-4xl">{system.name}</h3>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--sm-muted)]">{system.summary}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {system.replaces.slice(0, 2).map((item) => (
                    <span className="sm-home-tag sm-home-tag-muted" key={item}>
                      Replaces {item}
                    </span>
                  ))}
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link className="sm-button-primary" to={`/demos/${system.slug}`}>
                    Open demo
                  </Link>
                  <Link className="sm-button-secondary" to={`/products/${system.slug}`}>
                    View system
                  </Link>
                </div>
              </div>
              <div className="sm-home-system-visual">
                <div className="sm-home-proof-shot-frame sm-home-proof-shot-frame-row">
                  <img alt={`${system.name} screenshot`} className="sm-home-proof-shot" src={systemScreens[system.id]} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="sm-home-custom-shell">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Custom builds</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Need a portal or back-office flow instead?</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
              We use the same operating model for client portals, onboarding hubs, approval flows, and internal back-office systems.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {['Client portal', 'Learning hub', 'Approval flow', 'Commerce back office'].map((item) => (
                <span className="sm-home-tag" key={item}>
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="sm-home-system-visual">
            <div className="sm-home-proof-shot-frame sm-home-proof-shot-frame-row">
              <img alt={`${portalSystem.name} screenshot`} className="sm-home-proof-shot" src={systemScreens.portal} />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="sm-site-final">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Contact</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Tell us which workflow still feels broken.</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
              The website shows the shape. The app runs the work.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/contact">
              Contact
            </Link>
            <a className="sm-button-secondary" href="https://app.supermega.dev" rel="noreferrer" target="_blank">
              Open team app
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
