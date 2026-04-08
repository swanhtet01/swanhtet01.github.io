import { useState } from 'react'
import { Link } from 'react-router-dom'

import { SystemDemoCanvas } from '../components/SystemDemoCanvas'
import { CUSTOM_BUILD_EXAMPLES, FREE_TOOLS, SITE_SYSTEMS } from '../lib/siteSystems'

export function HomePage() {
  const [activeSystemId, setActiveSystemId] = useState(SITE_SYSTEMS[0].id)
  const activeSystem = SITE_SYSTEMS.find((item) => item.id === activeSystemId) ?? SITE_SYSTEMS[0]

  return (
    <div className="pb-16">
      <section className="sm-site-bleed sm-site-hero sm-site-hero-reset">
        <div className="sm-site-reset-grid">
          <div className="sm-site-hero-copy">
            <p className="sm-kicker text-[var(--sm-accent)]">SuperMega</p>
            <h1 className="mt-4 max-w-4xl text-5xl font-extrabold tracking-tight text-white lg:text-8xl">Real business systems. Real demos.</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              We build simple systems for sales, operations, management, and client work. The site shows real demo surfaces, not generic terminal art.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/products">
                See systems
              </Link>
              <Link className="sm-button-secondary" to="/demos">
                Open demos
              </Link>
              <Link className="sm-button-secondary" to="/contact">
                Contact
              </Link>
            </div>
          </div>

          <div className="sm-hero-demo-block">
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
            <SystemDemoCanvas scenario={activeSystem.scenarios[0]} />
          </div>
        </div>
      </section>

      <section className="mt-12 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Systems</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Start from one workflow people actually use every day.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Each system has a live demo, a simple setup path, and a clear daily user.
          </p>
        </div>
        <div className="mt-8 grid gap-5 xl:grid-cols-2">
          {SITE_SYSTEMS.map((system) => (
            <article className="sm-system-card" key={system.id}>
              <div className="sm-system-copy">
                <p className="sm-kicker text-[var(--sm-accent)]">{system.category}</p>
                <h3 className="mt-3 text-2xl font-bold text-white">{system.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{system.tagline}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {system.replaces.map((item) => (
                    <span className="sm-status-pill" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link className="sm-button-primary" to={`/products/${system.slug}`}>
                    View system
                  </Link>
                  <Link className="sm-button-secondary" to={`/demos/${system.slug}`}>
                    Open demo
                  </Link>
                </div>
              </div>
              <SystemDemoCanvas compact scenario={system.scenarios[0]} />
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <article>
            <p className="sm-kicker text-[var(--sm-accent)]">Free tools</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Try a small tool first.</h2>
            <div className="mt-6 grid gap-3">
              {FREE_TOOLS.map((tool) => (
                <Link className="sm-demo-link" key={tool.name} to={tool.route}>
                  <strong>{tool.name}</strong>
                  <span>{tool.tagline}</span>
                </Link>
              ))}
            </div>
          </article>
          <article>
            <p className="sm-kicker text-[var(--sm-accent)]">Custom builds</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">We also build larger systems when the workflow is clear.</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {CUSTOM_BUILD_EXAMPLES.map((item) => (
                <div className="sm-demo-mini" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}
