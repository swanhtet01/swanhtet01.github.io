import { Link } from 'react-router-dom'

import { engagementFlow, flagshipSystem, products } from '../content'

const liveAgents = products.filter((product) => product.availability === 'Live now')

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-8 lg:p-12">
        <div className="pointer-events-none absolute -left-20 top-10 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,122,24,0.16),_transparent_70%)]" />
        <div className="pointer-events-none absolute -right-20 top-4 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.16),_transparent_72%)]" />
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-rise">
            <p className="sm-kicker text-[var(--sm-accent)]">SuperMega</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              AI agents that actually help operators run the company.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              We build real agent workflows for supplier risk, quality, cash control, director command, and sales.
              Start with one agent. Scale into SuperMega OS.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-accent" to="/examples">
                Open Live Lab
              </Link>
              <Link className="sm-button-secondary" to="/products">
                See Agents
              </Link>
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Live now</p>
                <p className="mt-2 font-semibold text-white">3 real agents you can run today</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Pilot</p>
                <p className="mt-2 font-semibold text-white">Quality, supplier, cash control rollouts</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Flagship</p>
                <p className="mt-2 font-semibold text-white">{flagshipSystem.name}</p>
              </div>
            </div>
          </div>

          <div className="animate-rise-delayed">
            <div className="sm-surface overflow-hidden p-5">
              <div className="flex items-center justify-between border-b border-white/8 pb-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Command layer</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">{flagshipSystem.name}</h2>
                </div>
                <div className="rounded-full border border-[rgba(37,208,255,0.2)] bg-[rgba(37,208,255,0.08)] px-3 py-1 text-xs font-semibold text-[var(--sm-accent)]">
                  AI-native ops
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {flagshipSystem.steps.map((step) => (
                  <div className="sm-chip text-sm text-white" key={step}>
                    {step}
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="sm-surface-soft p-4">
                  <p className="sm-kicker text-[var(--sm-accent)]">Signals</p>
                  <p className="mt-2 text-sm text-white">Gmail, Drive, Sheets, forwarded updates, raw notes</p>
                </div>
                <div className="sm-surface-soft p-4">
                  <p className="sm-kicker text-[var(--sm-accent)]">Outputs</p>
                  <p className="mt-2 text-sm text-white">Actions, blockers, escalations, close-out chains</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Live agents</h2>
          <Link className="sm-link" to="/examples">
            Open lab
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {liveAgents.map((product) => (
            <article className="sm-surface p-5" key={product.name}>
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-white">{product.name}</p>
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
              {product.exampleId ? (
                <Link className="sm-button-primary mt-5" to={`/examples#${product.exampleId}`}>
                  Run live
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What we sell</p>
          <h2 className="mt-3 text-2xl font-bold text-white">A cleaner alternative to manual ERP work.</h2>
          <div className="mt-4 grid gap-3">
            <div className="sm-chip text-sm text-white">Start with one agent on one workflow.</div>
            <div className="sm-chip text-sm text-white">Give managers one command view instead of scattered spreadsheets.</div>
            <div className="sm-chip text-sm text-white">Scale into a controlled operating layer instead of a giant ERP rollout.</div>
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">How it lands</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Simple path to value.</h2>
          <div className="mt-4 grid gap-3">
            {engagementFlow.map((step) => (
              <div className="sm-chip text-sm text-white" key={step}>
                {step}
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
