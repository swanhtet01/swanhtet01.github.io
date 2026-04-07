import { Link } from 'react-router-dom'

import { publicModules, workExamples } from '../content'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

export function ProductsPage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Work</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              Composite rollout examples of the systems SuperMega can ship.
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are simulated client systems based on recurring workflows. They show the shape of the operating layer without pretending to be named client work.
          </p>
        </div>
      </section>

      <section className="space-y-8">
        {workExamples.map((example, index) => (
          <article className={`sm-site-case ${index % 2 === 1 ? 'sm-site-case-reverse' : ''}`} key={example.name}>
            <div className="sm-site-case-copy">
              <div className="flex flex-wrap items-center gap-3">
                <p className="sm-kicker text-[var(--sm-accent)]">{example.category}</p>
                <span className="sm-status-pill">Composite rollout</span>
              </div>
              <h2 className="mt-3 max-w-xl text-3xl font-bold text-white lg:text-5xl">{example.name}</h2>
              <p className="mt-3 max-w-xl text-base font-semibold text-white/80">{example.audience}</p>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">{example.summary}</p>
              <div className="mt-6 space-y-3">
                {example.outcomes.map((point) => (
                  <div className="sm-site-point" key={point}>
                    <span className="sm-site-point-dot" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 max-w-xl text-xs leading-relaxed text-white/45">{example.disclosure}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={contactLink(example.name)}>
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

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Free proof tools</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              These are small utilities, not the main offer. Use them if you want to test the workflow shape before a full rollout.
            </p>
          </div>
          <Link className="sm-button-secondary" to="/contact">
            Contact us
          </Link>
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
    </div>
  )
}
