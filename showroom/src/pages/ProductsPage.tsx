import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { products } from '../content'

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Products"
        title="New-gen operating products, not old ERP screens with AI labels."
        description="Each product is designed to create measurable operational advantage in weeks: decision speed, execution reliability, and quality control."
      />

      <section className="grid gap-5">
        {products.map((product) => (
          <article
            className="rounded-3xl border border-[var(--sm-line)] bg-white/95 p-6 shadow-[0_20px_50px_-40px_rgba(13,44,53,0.35)]"
            key={product.name}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h2 className="text-2xl font-bold text-[var(--sm-ink)]">{product.name}</h2>
              <span className="rounded-full border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--sm-muted)]">
                Productized
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--sm-accent)]">{product.tagline}</p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{product.innovation}</p>
            <ul className="mt-5 grid gap-2 text-sm text-[var(--sm-muted)] md:grid-cols-3">
              {product.capabilities.map((capability) => (
                <li className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-3" key={capability}>
                  {capability}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-[var(--sm-muted)]">
              <strong className="text-[var(--sm-ink)]">Best fit:</strong> {product.fit}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--sm-line)] bg-[var(--sm-paper)] p-6">
        <h2 className="text-xl font-bold text-[var(--sm-ink)]">Commercial launch format</h2>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">
          Start with a 14-day paid pilot. We implement one product flow in your real operations, prove measured uplift, then scale.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5b5d]"
            to="/contact?intent=pilot"
          >
            Launch 14-Day Pilot
          </Link>
          <Link
            className="rounded-full border border-[var(--sm-line)] px-5 py-3 text-sm font-semibold text-[var(--sm-ink)] hover:bg-white/80"
            to="/packages"
          >
            See Package Structure
          </Link>
        </div>
      </section>
    </div>
  )
}

