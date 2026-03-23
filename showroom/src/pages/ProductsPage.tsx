import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { flagshipSystem, products } from '../content'

const liveAgents = products.filter((product) => product.availability === 'Live now')
const pilotAgents = products.filter((product) => product.availability === 'Pilot')

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Agents"
        title="Five practical agent products. One operating system."
        description="These are not generic chatbots. Each agent takes a messy business input and returns a clean action-oriented output."
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Live now</h2>
          <Link className="sm-link" to="/examples">
            Run them
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {liveAgents.map((product) => (
            <article className="sm-surface p-6" key={product.name}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-white">{product.name}</h2>
                <span className="rounded-full border border-[rgba(37,208,255,0.18)] bg-[rgba(37,208,255,0.08)] px-3 py-1 text-xs font-semibold text-[var(--sm-accent)]">
                  {product.availability}
                </span>
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
              {product.exampleId ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link className="sm-button-primary" to={`/examples#${product.exampleId}`}>
                    Run live
                  </Link>
                  <Link className="sm-button-secondary" to="/contact">
                    Deploy on my data
                  </Link>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Pilot agents</h2>
          <Link className="sm-link" to="/contact">
            Start pilot
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {pilotAgents.map((product) => (
            <article className="sm-surface p-6" key={product.name}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-white">{product.name}</h2>
                <span className="rounded-full border border-[rgba(255,122,24,0.18)] bg-[rgba(255,122,24,0.08)] px-3 py-1 text-xs font-semibold text-[var(--sm-accent-alt)]">
                  {product.availability}
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.tagline}</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2 text-sm">
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
              <Link className="sm-button-accent mt-5" to="/contact">
                Scope this pilot
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-surface-deep p-6 text-white">
        <p className="sm-kicker text-[var(--sm-accent)]">Flagship</p>
        <h2 className="mt-3 text-3xl font-bold">{flagshipSystem.name}</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--sm-muted)]">{flagshipSystem.tagline}</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {flagshipSystem.steps.map((step) => (
            <div className="sm-chip text-sm text-white" key={step}>
              {step}
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-[var(--sm-muted)]">{flagshipSystem.bestFor}</p>
      </section>
    </div>
  )
}
