import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { products } from '../content'

const demoLinkByProduct: Record<string, string> = {
  'Daily Brief Agent': '#brief',
  'Supplier Risk Agent': '#supplier',
  'Quality CAPA Agent': '#quality',
}

export function ProductsPage() {
  return (
    <div className="space-y-7">
      <PageIntro
        eyebrow="Products"
        title="Simple AI agent products teams can use fast."
        description="Clear value, short rollout, and practical daily use."
      />

      <section className="grid gap-5 lg:grid-cols-2">
        {products.map((product) => {
          const demoLink = demoLinkByProduct[product.name]
          return (
            <article
              className="rounded-3xl border border-white/55 bg-white/45 p-6 shadow-[0_24px_55px_-42px_rgba(15,37,52,0.85)] backdrop-blur-xl"
              key={product.name}
            >
              <h2 className="text-2xl font-bold text-[var(--sm-ink)]">{product.name}</h2>
              <p className="mt-2 text-sm font-semibold text-[var(--sm-accent)]">{product.tagline}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.innovation}</p>
              <ul className="mt-4 grid gap-2 text-sm text-[var(--sm-muted)] md:grid-cols-3">
                {product.capabilities.map((capability) => (
                  <li className="rounded-2xl border border-white/65 bg-white/55 px-3 py-3" key={capability}>
                    {capability}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-[var(--sm-muted)]">
                <strong className="text-[var(--sm-ink)]">Best fit:</strong> {product.fit}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                {demoLink ? (
                  <Link
                    className="rounded-full bg-[var(--sm-accent)] px-4 py-2 text-sm font-bold text-white hover:bg-[#0a5b5d]"
                    to={`/examples${demoLink}`}
                  >
                    Open Example
                  </Link>
                ) : null}
                <Link
                  className="rounded-full border border-white/75 bg-white/55 px-4 py-2 text-sm font-semibold text-[var(--sm-ink)] hover:bg-white/85"
                  to="/contact?intent=pilot"
                >
                  Use on My Data
                </Link>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
