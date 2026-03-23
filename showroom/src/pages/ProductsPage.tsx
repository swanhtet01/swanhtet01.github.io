import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { products, trialModules } from '../content'

const trialLinkByProduct: Record<string, string> = {
  'SignalGrid OS': '#brief',
  'FlowForge Agents': '#supplier',
  'QualityPulse DQMS': '#quality',
}

export function ProductsPage() {
  return (
    <div className="space-y-7">
      <PageIntro
        eyebrow="Products"
        title="Three practical AI agent products."
        description="Simple value: faster decisions, clearer ownership, and stronger execution."
      />

      <section className="grid gap-5">
        {products.map((product) => {
          const mappedLink = trialLinkByProduct[product.name] ?? '#brief'
          const mappedTrialName =
            trialModules.find((module) => mappedLink === `#${module.id}`)?.name ?? 'Prototype'
          return (
            <article
              className="rounded-3xl border border-[var(--sm-line)] bg-white/95 p-6 shadow-[0_20px_50px_-40px_rgba(13,44,53,0.35)]"
              key={product.name}
            >
              <h2 className="text-2xl font-bold text-[var(--sm-ink)]">{product.name}</h2>
              <p className="mt-2 text-sm font-semibold text-[var(--sm-accent)]">{product.tagline}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.innovation}</p>
              <ul className="mt-4 grid gap-2 text-sm text-[var(--sm-muted)] md:grid-cols-3">
                {product.capabilities.map((capability) => (
                  <li className="rounded-2xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-3" key={capability}>
                    {capability}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-[var(--sm-muted)]">
                <strong className="text-[var(--sm-ink)]">Best fit:</strong> {product.fit}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  className="rounded-full bg-[var(--sm-accent)] px-4 py-2 text-sm font-bold text-white hover:bg-[#0a5b5d]"
                  to={`/prototypes${mappedLink}`}
                >
                  Open {mappedTrialName}
                </Link>
                <Link
                  className="rounded-full border border-[var(--sm-line)] px-4 py-2 text-sm font-semibold text-[var(--sm-ink)] hover:bg-[var(--sm-paper)]"
                  to="/contact?intent=pilot"
                >
                  Use on my data
                </Link>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

