import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { featuredProducts, flagshipSystem, miniProducts, products, servicePacks } from '../content'

const controlModules = products.filter((product) => product.kind === 'Control module')

function packForModule(moduleName: string) {
  const match = servicePacks.find((pack) => pack.includes.includes(moduleName))
  return match?.name ?? 'SuperMega OS'
}

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Products"
        title="Start with one useful product. Expand only after it works."
        description="SuperMega has a simple ladder: a few public tools, a few deployable systems, and one larger operating layer when the team is ready."
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Use now</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Front-door products.</h2>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {featuredProducts.map((item) => (
            <article className="sm-pack-card p-6" key={item.name}>
              <p className="sm-kicker text-[var(--sm-accent)]">{item.kind}</p>
              <h2 className="mt-3 text-2xl font-bold text-white">{item.name}</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              <div className="mt-5 grid gap-3">
                {item.bullets.map((bullet) => (
                  <div className="sm-chip text-white" key={bullet}>
                    {bullet}
                  </div>
                ))}
              </div>
              <Link className="sm-button-accent mt-5" to={item.path}>
                {item.kind === 'Free tool' ? 'Open product' : 'See system'}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Deployable systems</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Core systems we can put on your data.</h2>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {controlModules.map((product) => (
            <article className="sm-surface-soft p-6" key={product.name}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-bold text-white">{product.name}</h3>
                <span className="sm-status-pill border-[rgba(255,122,24,0.18)] bg-[rgba(255,122,24,0.08)] text-[var(--sm-accent-alt)]">{packForModule(product.name)}</span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.tagline}</p>

              <div className="mt-4 grid gap-3 text-sm">
                <div className="sm-chip text-white">
                  <span className="sm-kicker text-[var(--sm-accent)]">Input</span>
                  <p className="mt-2">{product.input}</p>
                </div>
                <div className="sm-chip text-white">
                  <span className="sm-kicker text-[var(--sm-accent-alt)]">Output</span>
                  <p className="mt-2">{product.output}</p>
                </div>
              </div>

              <p className="mt-4 text-sm text-[var(--sm-muted)]">
                <strong className="text-white">Best for:</strong> {product.buyer}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <article className="sm-surface-deep p-6 text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Flagship layer</p>
          <h2 className="mt-3 text-3xl font-bold">{flagshipSystem.name}</h2>
          <p className="mt-3 max-w-3xl text-sm text-[var(--sm-muted)]">{flagshipSystem.tagline}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {flagshipSystem.steps.map((step, index) => (
              <div className="sm-chip text-sm text-white" key={step}>
                <p className="font-mono text-[var(--sm-accent)]">0{index + 1}</p>
                <p className="mt-2">{step}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-[var(--sm-muted)]">{flagshipSystem.bestFor}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/contact?package=SuperMega%20OS">
              Start OS pilot
            </Link>
            <Link className="sm-button-secondary" to="/packages">
              See rollout model
            </Link>
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Small add-ons</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Mini products that help teams start faster.</h2>
          <div className="mt-5 grid gap-3">
            {miniProducts.map((item) => (
              <div className="sm-chip" key={item.name}>
                <p className="font-semibold text-white">{item.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Rollout shape</p>
            <h2 className="mt-2 text-2xl font-bold text-white">How these systems usually land.</h2>
          </div>
          <Link className="sm-link" to="/packages">See rollout</Link>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {servicePacks.map((pack) => (
            <article className="sm-surface p-6" key={pack.name}>
              <p className="sm-kicker text-[var(--sm-accent)]">{pack.audience}</p>
              <h3 className="mt-3 text-2xl font-bold text-white">{pack.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{pack.promise}</p>
              <p className="mt-4 text-sm text-white">{pack.bestFor}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
