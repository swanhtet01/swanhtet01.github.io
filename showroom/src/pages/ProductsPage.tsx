import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { products } from '../content'

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Products"
        title="3 AI agent products."
        description="Each product has a free working example you can test right now."
      />

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
                Open Example
              </Link>
              <Link
                className="rounded-full border border-white/70 bg-white/65 px-4 py-2 text-sm font-semibold text-[var(--sm-ink)] hover:bg-white/90"
                to="/contact?intent=pilot"
              >
                Deploy This
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
