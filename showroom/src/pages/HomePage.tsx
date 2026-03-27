import { Link } from 'react-router-dom'

import { coreProduct, hero, proofPoints, publicModules, useCases } from '../content'

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.16),_transparent_72%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,122,24,0.18),_transparent_74%)]" />

        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              {hero.title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              {hero.description}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/platform">
                See Action OS
              </Link>
              <Link className="sm-button-secondary" to="/lead-finder">
                Try Lead Finder
              </Link>
              <Link className="sm-button-accent" to="/contact">
                Book demo
              </Link>
            </div>
          </div>

          <div className="sm-terminal p-5">
            <p className="sm-kicker text-[var(--sm-accent)]">What is live now</p>
            <div className="mt-5 grid gap-3">
              {proofPoints.map((point) => (
                <div className="sm-proof-card" key={point.label}>
                  <p className="sm-kicker text-[var(--sm-accent)]">{point.label}</p>
                  <p className="mt-3 text-lg font-bold text-white">{point.value}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{point.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Use cases</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Three clear starting points.</h2>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {useCases.map((pack) => (
            <article className="sm-pack-card p-6" key={pack.name}>
              <p className="sm-kicker text-[var(--sm-accent)]">{pack.audience}</p>
              <h3 className="mt-3 text-2xl font-bold text-white">{pack.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{pack.promise}</p>
              <div className="mt-5 grid gap-3">
                {pack.outcomes.slice(0, 3).map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Action OS</p>
            <h2 className="mt-2 text-2xl font-bold text-white">The first product to trust.</h2>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="sm-surface-soft p-6">
            <h3 className="text-3xl font-bold text-white">{coreProduct.name}</h3>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">{coreProduct.tagline}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Replaces</p>
                <p className="mt-2 text-sm">{coreProduct.replaces.join(', ')}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Inputs</p>
                <p className="mt-2 text-sm">{coreProduct.inputs.join(', ')}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Outputs</p>
                <p className="mt-2 text-sm">{coreProduct.outputs.join(', ')}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/platform">
                See product
              </Link>
              <Link className="sm-button-secondary" to="/login?next=/app">
                Login to app
              </Link>
            </div>
          </article>

          <article className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">First rollout</p>
            <div className="mt-5 grid gap-3">
              {coreProduct.rollout.map((step) => (
                <div className="sm-proof-card" key={step}>
                  <p className="text-sm text-white">{step}</p>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Add-ons</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Go deeper only where control matters.</h2>
          <div className="mt-5 grid gap-3">
            {publicModules.map((module) => (
              <div className="sm-command-row" key={module.name}>
                <div>
                  <p className="font-semibold text-white">{module.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{module.tagline}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next step</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Start with one workflow, not a giant rollout.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            The best first move is usually one board, one queue, or one control loop. We make that work first, then expand.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/contact">
              Book demo
            </Link>
            <Link className="sm-button-secondary" to="/solutions">
              See use cases
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
