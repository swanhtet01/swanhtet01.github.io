import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { coreProduct, leadFinder } from '../content'

export function PlatformPage() {
  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Core product" title="Action OS" description="One board for work that needs an owner, a due date, or a decision." />

      <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What it does</p>
          <h2 className="mt-3 text-4xl font-bold text-white">{coreProduct.tagline}</h2>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="text-sm font-semibold">Owners</p>
            </div>
            <div className="sm-chip text-white">
              <p className="text-sm font-semibold">Due dates</p>
            </div>
            <div className="sm-chip text-white">
              <p className="text-sm font-semibold">Blockers</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/signup">
              Create workspace
            </Link>
            <Link className="sm-button-secondary" to="/login?next=/app">
              Login
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
      </section>

      <section className="sm-surface p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr] lg:items-start">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{leadFinder.title}</p>
            <h2 className="mt-3 text-3xl font-bold text-white">The proof tool.</h2>
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
            Try Lead Finder
          </Link>
        </div>
      </section>
    </div>
  )
}
