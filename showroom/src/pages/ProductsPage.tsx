import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { coreProduct, leadFinder } from '../content'

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Public products" title="Action OS" description="One product. One proof tool. One way in." />

      <section className="grid gap-5 lg:grid-cols-[1fr_0.95fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Action OS</p>
          <h2 className="mt-3 text-4xl font-bold text-white">{coreProduct.tagline}</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="text-sm font-semibold">{coreProduct.replaces[0]}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="text-sm font-semibold">{coreProduct.replaces[1]}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="text-sm font-semibold">{coreProduct.replaces[2]}</p>
            </div>
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">{leadFinder.title}</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Proof in one tool.</h2>
          <div className="mt-5 grid gap-3">
            {leadFinder.steps.map((step) => (
              <div className="sm-proof-card" key={step}>
                <p className="text-sm text-white">{step}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm leading-relaxed text-[var(--sm-muted)]">
            Create a workspace to use Action OS. Lead Finder stays in the same flow.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/signup">
              Create workspace
            </Link>
            <Link className="sm-button-secondary" to="/login?next=/app">
              Login
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
