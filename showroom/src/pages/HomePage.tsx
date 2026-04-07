import { Link } from 'react-router-dom'

import { hero, siteShowcases } from '../content'
import { trackEvent } from '../lib/analytics'

export function HomePage() {
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
              <Link className="sm-button-secondary" onClick={() => trackEvent('offer_open_click', { offer: 'Systems' })} to="/systems">
                See systems
              </Link>
            </div>
          </div>

          <div className="sm-site-stage" aria-label="SuperMega system examples">
            <img alt="SuperMega control room" className="sm-site-shot sm-site-shot-main" src="/site/control-room.svg" />
            <img alt="Founder daily brief example" className="sm-site-shot sm-site-shot-top" src="/site/founder-brief.svg" />
            <img alt="Operations desk example" className="sm-site-shot sm-site-shot-bottom" src="/site/ops-desk.svg" />
          </div>
        </div>
      </section>

      <section className="mt-12 space-y-8">
        {siteShowcases.map((showcase, index) => (
          <article className={`sm-site-case ${index % 2 === 1 ? 'sm-site-case-reverse' : ''}`} key={showcase.name}>
            <div className="sm-site-case-copy">
              <p className="sm-kicker text-[var(--sm-accent)]">{showcase.eyebrow}</p>
              <h2 className="mt-3 max-w-xl text-3xl font-bold text-white lg:text-5xl">{showcase.title}</h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{showcase.summary}</p>
              <div className="mt-6 space-y-3">
                {showcase.points.map((point) => (
                  <div className="sm-site-point" key={point}>
                    <span className="sm-site-point-dot" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link className="sm-button-secondary" to={showcase.route}>
                  Ask about {showcase.name}
                </Link>
              </div>
            </div>

            <div className="sm-site-case-visual">
              <img alt={showcase.name} className="sm-site-case-image" src={showcase.image} />
            </div>
          </article>
        ))}
      </section>

      <section className="mt-16 sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">SuperMega</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Start with one workflow. Ship one working system.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            If you already know the problem, contact us. If you want to see the shape first, open one of the free proof tools from the examples page.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Contact us
          </Link>
          <Link className="sm-button-secondary" to="/templates">
            View examples
          </Link>
        </div>
      </section>
    </div>
  )
}
