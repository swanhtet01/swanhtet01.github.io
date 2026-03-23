import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { flagshipSystem, products } from '../content'

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Products"
        title="Simple AI tools."
        description="Try the public version first. Then deploy on your own data."
      />

      <section className="rounded-3xl border border-white/55 bg-[linear-gradient(145deg,rgba(8,36,56,0.92),rgba(14,81,92,0.88))] p-6 text-white shadow-[0_30px_70px_-46px_rgba(2,10,28,0.85)]">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">Flagship</p>
        <h2 className="mt-3 text-3xl font-bold">{flagshipSystem.name}</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-100">{flagshipSystem.tagline}</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {flagshipSystem.steps.map((step) => (
            <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-slate-100 backdrop-blur" key={step}>
              {step}
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-cyan-100">{flagshipSystem.bestFor}</p>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <article
            className="rounded-3xl border border-white/45 bg-white/55 p-6 shadow-[0_22px_50px_-38px_rgba(14,34,55,0.85)] backdrop-blur-xl"
            key={product.name}
          >
            <h2 className="text-2xl font-bold text-[var(--sm-ink)]">{product.name}</h2>
            <p className="mt-2 text-sm font-semibold text-[var(--sm-accent)]">{product.tagline}</p>
            <ul className="mt-4 space-y-2 text-sm text-[var(--sm-muted)]">
              {product.capabilities.map((capability) => (
                <li className="rounded-2xl border border-white/65 bg-white/60 px-3 py-2" key={capability}>
                  {capability}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-[var(--sm-muted)]">
              <strong className="text-[var(--sm-ink)]">Best for:</strong> {product.fit}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                className="rounded-full bg-[var(--sm-accent)] px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700"
                to={`/examples#${product.exampleId}`}
              >
                Try Free
              </Link>
              <Link
                className="rounded-full border border-white/70 bg-white/65 px-4 py-2 text-sm font-semibold text-[var(--sm-ink)] hover:bg-white/90"
                to="/contact?intent=pilot"
              >
                Deploy on My Data
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
