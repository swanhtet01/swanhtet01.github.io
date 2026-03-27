import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { coreProduct, publicModules } from '../content'

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Modules"
        title="One core product. A small set of add-ons."
        description="Start with Action OS. Add the next module only when the business needs deeper control in that area."
      />

      <section className="sm-surface-deep p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">Core product</p>
        <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <h2 className="mt-3 text-4xl font-bold text-white">{coreProduct.name}</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{coreProduct.tagline}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/platform">
                See product
              </Link>
              <Link className="sm-button-secondary" to="/login?next=/app/actions">
                Login to app
              </Link>
            </div>
          </div>
          <div className="grid gap-3">
            {coreProduct.outputs.map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Add-on modules</p>
            <h2 className="mt-2 text-2xl font-bold text-white">The next screens after Action OS.</h2>
          </div>
          <Link className="sm-link" to="/contact">
            Book demo
          </Link>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {publicModules.map((module) => (
            <article className="sm-surface-soft p-6" key={module.name}>
              <h3 className="text-2xl font-bold text-white">{module.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{module.tagline}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--sm-accent)]">{module.bestFor}</p>

              <div className="mt-5 grid gap-2">
                {module.outputs.map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-secondary" to={module.path}>
                  Open in app
                </Link>
                <Link className="sm-button-accent" to={`/contact?package=${encodeURIComponent(module.name)}`}>
                  Use on my data
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
