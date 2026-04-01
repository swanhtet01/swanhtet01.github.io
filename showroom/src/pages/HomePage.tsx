import { Link } from 'react-router-dom'

import { coreProduct, hero, leadFinder, proofPoints } from '../content'
import { appHref, hasLiveWorkspaceApp } from '../lib/workspaceApi'

export function HomePage() {
  const liveAppAvailable = hasLiveWorkspaceApp()

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
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              {hero.description}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/lead-finder">
                Open Lead Finder
              </Link>
              {liveAppAvailable ? (
                <a className="sm-button-secondary" href={appHref('/login/')}>
                  Open app
                </a>
              ) : (
                <Link className="sm-button-secondary" to="/book">
                  Book call
                </Link>
              )}
            </div>
          </div>

          <div className="sm-terminal p-5">
            <p className="sm-kicker text-[var(--sm-accent)]">Live now</p>
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

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Action OS</p>
          <h2 className="mt-3 text-3xl font-bold text-white">{coreProduct.tagline}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Pull work out of inboxes and sheets. Keep one live board for owners, due dates, and blockers.
          </p>
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
      </section>

      <section className="sm-surface-deep p-6">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{leadFinder.title}</p>
            <h2 className="mt-3 text-3xl font-bold text-white">One live tool.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">{leadFinder.description}</p>
          </div>

          <div className="grid gap-3">
            {leadFinder.steps.map((step) => (
              <div className="sm-proof-card" key={step}>
                <p className="text-sm text-white">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/lead-finder">
            Open Lead Finder
          </Link>
          <Link className="sm-button-secondary" to="/platform">
            See Action OS
          </Link>
        </div>
      </section>
    </div>
  )
}
