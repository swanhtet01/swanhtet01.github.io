import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { flagshipSystem, products, sellableTemplates } from '../content'

const freeTools = products.filter((product) => product.kind === 'Free tool')
const laneOrder = ['Run the day', 'Control risk', 'Commercial watch'] as const

const templatesByLane = laneOrder.map((lane) => ({
  lane,
  templates: sellableTemplates.filter((template) => template.lane === lane),
}))

export function ProductsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Products"
        title="Pick one problem. Deploy one agent workflow."
        description="Try the free tools first. Then deploy one workflow on your real Gmail, Drive, and Sheets data."
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Deploy layer</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Workflow templates by lane</h2>
          </div>
          <Link className="sm-link" to="/contact">
            Deploy one
          </Link>
        </div>
        <div className="space-y-8">
          {templatesByLane.map(({ lane, templates }) => (
            <section className="space-y-4" key={lane}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{lane}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Templates that land fast and show a real first-week result.</p>
                </div>
                <span className="sm-status-pill">{templates.length} templates</span>
              </div>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {templates.map((template) => (
                  <article className="sm-surface p-6" key={template.name}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-2xl font-bold text-white">{template.name}</h2>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--sm-muted)]">{template.lane}</p>
                      </div>
                      <span className="sm-status-pill border-[rgba(255,122,24,0.18)] bg-[rgba(255,122,24,0.08)] text-[var(--sm-accent-alt)]">
                        Sellable
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-[var(--sm-muted)]">{template.problem}</p>
                    <div className="mt-4 grid gap-2 text-sm">
                      <div className="sm-chip text-white">
                        <span className="sm-kicker text-[var(--sm-accent)]">Week 1 result</span>
                        <p className="mt-2">{template.firstWeekOutcome}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <span className="sm-kicker text-[var(--sm-accent)]">Works with</span>
                        <p className="mt-2">{template.requiredData.slice(0, 3).join(' · ')}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <span className="sm-kicker text-[var(--sm-accent)]">Live in</span>
                        <p className="mt-2">{template.timeToFirstLiveOutput}</p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-[var(--sm-muted)]">
                      <strong className="text-white">Best for:</strong> {template.buyer}
                    </p>
                    <div className="mt-4">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Outputs</p>
                      <div className="mt-3 grid gap-2">
                        {template.outputs.slice(0, 3).map((item) => (
                          <div className="sm-chip text-sm text-white" key={item}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    <Link className="sm-button-accent mt-5" to="/contact">
                      Start this template
                    </Link>
                  </article>
                ))}
              </div>
            </section>
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

      <section className="sm-surface p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">Works with your stack</p>
        <h2 className="mt-3 text-2xl font-bold text-white">Built for Gmail, Drive, and Sheets first.</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="sm-chip">
            <p className="sm-kicker text-[var(--sm-accent)]">Connectors</p>
            <p className="mt-2 text-sm text-white">Gmail, Drive, Sheets, forms, ERP exports, and external feeds.</p>
          </div>
          <div className="sm-chip">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Real ops context</p>
            <p className="mt-2 text-sm text-white">Suppliers, incidents, invoices, actions, approvals, and owners.</p>
          </div>
          <div className="sm-chip">
            <p className="sm-kicker text-[var(--sm-accent)]">Views</p>
            <p className="mt-2 text-sm text-white">Manager board, founder brief, weekly report, and exception queue.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
