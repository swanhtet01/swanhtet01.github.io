import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { flagshipSystem, products, sellableTemplates } from '../content'

const freeTools = products.filter((product) => product.kind === 'Free tool')

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Products"
        title="Reusable workflow templates, not one-off demos."
        description="The free tools are the proof layer. The real sellable products are repeatable workflow templates that can be adapted to different client data contexts."
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Sellable layer</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Workflow templates</h2>
          </div>
          <Link className="sm-link" to="/contact">
            Scope one
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sellableTemplates.map((template) => (
            <article className="sm-surface p-6" key={template.name}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-white">{template.name}</h2>
                <span className="sm-status-pill border-[rgba(255,122,24,0.18)] bg-[rgba(255,122,24,0.08)] text-[var(--sm-accent-alt)]">
                  Sellable
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{template.problem}</p>
              <p className="mt-4 text-sm text-[var(--sm-muted)]">
                <strong className="text-white">Buyer:</strong> {template.buyer}
              </p>
              <div className="mt-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Needs</p>
                <div className="mt-3 grid gap-2">
                  {template.requiredData.map((item) => (
                    <div className="sm-chip text-sm text-white" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Outputs</p>
                <div className="mt-3 grid gap-2">
                  {template.outputs.map((item) => (
                    <div className="sm-chip text-sm text-white" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-4 text-sm text-[var(--sm-muted)]">
                <strong className="text-white">Rollout:</strong> {template.rollout}
              </p>
              <p className="mt-4 text-sm text-[var(--sm-muted)]">
                <strong className="text-white">Reuse pattern:</strong> {template.reusePattern}
              </p>
              <Link className="sm-button-accent mt-5" to="/contact">
                Deploy template
              </Link>
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
              <div className="mt-5 space-y-3 text-sm">
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Input</p>
                  <p className="mt-2 text-white">{product.input}</p>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Output</p>
                  <p className="mt-2 text-white">{product.output}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-[var(--sm-muted)]">
                <strong className="text-white">Best fit:</strong> {product.fit}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs font-semibold text-white" key={variant}>
                    {variant}
                  </span>
                ))}
              </div>
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
        <p className="mt-4 text-sm text-[var(--sm-muted)]">{flagshipSystem.bestFor}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Start OS pilot
          </Link>
          <Link className="sm-button-secondary" to="/examples">
            Try the proof tools
          </Link>
        </div>
      </section>
    </div>
  )
}
