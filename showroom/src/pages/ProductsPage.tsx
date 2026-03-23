import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { flagshipSystem, paidModules, products } from '../content'

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Products"
        title="Start free. Fix one workflow. Then run one action layer."
        description="The product ladder is simple: test a free tool, deploy a paid module, then move into SuperMega OS."
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[var(--sm-ink)]">Free tools</h2>
          <Link className="sm-link" to="/examples">
            Try now
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article className="sm-surface p-6" key={product.name}>
              <h2 className="text-2xl font-bold text-[var(--sm-ink)]">{product.name}</h2>
              <p className="mt-2 text-sm font-semibold text-[var(--sm-accent)]">{product.tagline}</p>
              <ul className="mt-4 space-y-2 text-sm text-[var(--sm-muted)]">
                {product.capabilities.map((capability) => (
                  <li className="sm-chip" key={capability}>
                    {capability}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-[var(--sm-muted)]">
                <strong className="text-[var(--sm-ink)]">Best for:</strong> {product.fit}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/examples#${product.exampleId}`}>
                  Try free
                </Link>
                <Link className="sm-button-secondary" to="/contact?intent=pilot">
                  Use on my data
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[var(--sm-ink)]">Paid modules</h2>
          <Link className="sm-link" to="/contact?intent=pilot">
            Start with one module
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {paidModules.map((module) => (
            <article className="sm-surface p-6" key={module.name}>
              <h2 className="text-2xl font-bold text-[var(--sm-ink)]">{module.name}</h2>
              <p className="mt-2 text-sm font-semibold text-[var(--sm-accent)]">{module.tagline}</p>
              <ul className="mt-4 space-y-2 text-sm text-[var(--sm-muted)]">
                {module.outcomes.map((outcome) => (
                  <li className="sm-chip" key={outcome}>
                    {outcome}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-[var(--sm-muted)]">
                <strong className="text-[var(--sm-ink)]">Best for:</strong> {module.fit}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-accent" to="/contact?intent=pilot">
                  Deploy on my data
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-surface-deep p-6 text-white">
        <p className="sm-kicker text-cyan-200">Flagship</p>
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
    </div>
  )
}
