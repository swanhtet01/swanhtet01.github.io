import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { coreProduct, publicModules } from '../content'

export function PlatformPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Core product"
        title="Action OS"
        description="The main SuperMega product. One live action layer for teams still running work through Gmail, Drive, Sheets, and manual follow-up."
      />

      <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What it does</p>
          <h2 className="mt-3 text-4xl font-bold text-white">{coreProduct.tagline}</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
            Action OS gives managers one place to see what matters, who owns it, and what is blocked.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
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

          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/actions">
              Open app
            </Link>
            <Link className="sm-button-accent" to="/book">
              Book demo
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

      <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Add-on modules</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Add depth only where the business needs it.</h2>
            </div>
          <Link className="sm-link" to="/products">
            See modules
          </Link>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {publicModules.map((module) => (
            <article className="sm-surface-soft p-5" key={module.name}>
              <h3 className="text-lg font-bold text-white">{module.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{module.tagline}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--sm-accent)]">{module.bestFor}</p>
              <Link className="sm-button-secondary mt-5" to={module.path}>
                Open in app
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
