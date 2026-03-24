import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { flagshipSystem, miniProducts, products, sellableTemplates } from '../content'

const freeTools = products.filter((product) => product.kind === 'Free tool')
const controlModules = products.filter((product) => product.kind === 'Control module')

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Products"
        title="One stack. Three layers."
        description="Free proof tools, deployable modules, and one flagship operating system."
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Deploy layer</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Core modules</h2>
          </div>
          <Link className="sm-link" to="/contact">
            Deploy one
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {controlModules.map((product) => (
            <article className="sm-surface p-6" key={product.name}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-white">{product.name}</h2>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--sm-muted)]">{product.availability}</p>
                </div>
                <span className="sm-status-pill border-[rgba(255,122,24,0.18)] bg-[rgba(255,122,24,0.08)] text-[var(--sm-accent-alt)]">
                  Module
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.tagline}</p>
              <div className="mt-4 grid gap-2 text-sm">
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
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-accent" to="/contact">
                  Start module
                </Link>
                <Link className="sm-button-secondary" to="/workspace">
                  Open workspace
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Mini layer</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Small products and add-ons</h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {miniProducts.map((item) => (
            <article className="sm-surface-soft p-5" key={item.name}>
              <p className="text-lg font-bold text-white">{item.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              <p className="mt-4 text-sm text-white">{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Proof layer</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Free tools</h2>
          </div>
          <Link className="sm-link" to="/examples">
            Try now
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {freeTools.map((product) => (
            <article className="sm-surface p-6" key={product.name}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-white">{product.name}</h2>
                <span className="sm-status-pill">{product.availability}</span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.tagline}</p>
              <p className="mt-4 text-sm text-white">{product.output}</p>
              {product.exampleId ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link className="sm-button-primary" to={`/examples#${product.exampleId}`}>
                    Try free
                  </Link>
                  <Link className="sm-button-secondary" to="/contact">
                    Use as proof
                  </Link>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="sm-surface-deep p-6 text-white">
        <p className="sm-kicker text-[var(--sm-accent)]">Flagship</p>
        <h2 className="mt-3 text-3xl font-bold">{flagshipSystem.name}</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--sm-muted)]">{flagshipSystem.tagline}</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {flagshipSystem.steps.map((step, index) => (
            <div className="sm-chip text-sm text-white" key={step}>
              <p className="font-mono text-[var(--sm-accent)]">0{index + 1}</p>
              <p className="mt-2">{step}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sellableTemplates.slice(0, 3).map((template) => (
            <div className="sm-chip text-sm text-white" key={template.name}>
              <p className="font-semibold">{template.name}</p>
              <p className="mt-2 text-[var(--sm-muted)]">{template.firstWeekOutcome}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-[var(--sm-muted)]">{flagshipSystem.bestFor}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Start OS pilot
          </Link>
          <Link className="sm-button-secondary" to="/workspace">
            Open workspace
          </Link>
        </div>
      </section>
    </div>
  )
}
