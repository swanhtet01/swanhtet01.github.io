import { Link } from 'react-router-dom'

import { hero, publicModules, workExamples } from '../content'
import { trackEvent } from '../lib/analytics'

export function HomePage() {
  const featuredExamples = workExamples.slice(0, 3)

  return (
    <div className="pb-16">
      <section className="sm-site-bleed sm-site-hero">
        <div className="sm-site-hero-grid">
          <div className="sm-site-hero-copy">
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-extrabold tracking-tight text-white lg:text-8xl">{hero.title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{hero.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" onClick={() => trackEvent('contact_open_click', { source: 'home_hero' })} to="/contact">
                Contact us
              </Link>
              <Link className="sm-button-secondary" onClick={() => trackEvent('offer_open_click', { offer: 'Work' })} to="/work">
                See work
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-[var(--sm-muted)]">
              <span>Sales systems</span>
              <span>Operations control</span>
              <span>Founder brief</span>
              <span>Client-facing portals</span>
            </div>
          </div>

          <div className="sm-site-stage" aria-label="SuperMega system examples">
            <img alt="SuperMega control room" className="sm-site-shot sm-site-shot-main" src="/site/control-room.svg" />
            <img alt="Founder daily brief example" className="sm-site-shot sm-site-shot-top" src="/site/founder-brief.svg" />
            <img alt="Operations desk example" className="sm-site-shot sm-site-shot-bottom" src="/site/ops-desk.svg" />
          </div>
        </div>
      </section>

      <section className="mt-12 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">What we do</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">We build the working system behind the daily job.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Start with one workflow. Keep ownership, next steps, and management visibility in one place. Let the agent layer keep triage and reporting moving.
          </p>
        </div>
      </section>

      <section className="mt-12 space-y-8">
        {featuredExamples.map((example, index) => (
          <article className={`sm-site-case ${index % 2 === 1 ? 'sm-site-case-reverse' : ''}`} key={example.name}>
            <div className="sm-site-case-copy">
              <p className="sm-kicker text-[var(--sm-accent)]">{example.category}</p>
              <h2 className="mt-3 max-w-xl text-3xl font-bold text-white lg:text-5xl">{example.title}</h2>
              <p className="mt-3 max-w-xl text-sm font-semibold text-white/80 lg:text-base">{example.name}</p>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{example.summary}</p>
              <div className="mt-6 space-y-3">
                {example.outcomes.slice(0, 2).map((point) => (
                  <div className="sm-site-point" key={point}>
                    <span className="sm-site-point-dot" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 max-w-xl text-xs leading-relaxed text-white/45">{example.disclosure}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link className="sm-button-secondary" to={`/contact?package=${encodeURIComponent(example.name)}`}>
                  Ask about this system
                </Link>
              </div>
            </div>

            <div className="sm-site-case-visual">
              <img alt={example.name} className="sm-site-case-image" src={example.image} />
            </div>
          </article>
        ))}
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Free proof tools</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-4xl">Use a small tool first if you want to test the shape.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            These are utilities, not the whole company. They are just a fast way to test list cleanup or market search before a full rollout.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {publicModules.map((item) => (
            <article className="sm-chip text-white" key={item.name}>
              <p className="font-semibold">{item.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={item.path}>
                Open tool
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">SuperMega</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Start with one workflow. Keep the next step visible.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">Contact us with the first workflow that is still trapped in chat, spreadsheets, or scattered tools.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Contact us
          </Link>
          <Link className="sm-button-secondary" to="/work">
            View work
          </Link>
        </div>
      </section>
    </div>
  )
}
