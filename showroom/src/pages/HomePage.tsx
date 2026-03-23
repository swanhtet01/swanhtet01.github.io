import { Link } from 'react-router-dom'

import { engagementFlow, flagshipSystem, products } from '../content'

const freeTools = products.filter((product) => product.kind === 'Free tool')
const controlModules = products.filter((product) => product.kind === 'Control module')

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-10">
        <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.14),_transparent_70%)]" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(255,122,24,0.16),_transparent_72%)]" />

        <div className="sm-status-bar">
          <span className="sm-status-pill">
            <span className="sm-led bg-emerald-400" />
            Live tools {freeTools.length}
          </span>
          <span className="sm-status-pill">Control modules {controlModules.length}</span>
          <span className="sm-status-pill">Gmail + Drive + Sheets</span>
          <span className="sm-status-pill">Operator-first</span>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-rise">
            <p className="sm-kicker text-[var(--sm-accent)]">SuperMega</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              AI agents for messy operators.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Try three free tools. Deploy one control module. Then run your company from one action layer.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/examples">
                Try free tools
              </Link>
              <Link className="sm-button-secondary" to="/products">
                See products
              </Link>
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <div className="sm-metric-card">
                <p className="sm-kicker text-[var(--sm-accent)]">Free</p>
                <p className="mt-3 text-3xl font-bold text-white">{freeTools.length}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Simple tools anyone can test now</p>
              </div>
              <div className="sm-metric-card">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Deploy</p>
                <p className="mt-3 text-3xl font-bold text-white">{controlModules.length}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Control modules for real operations</p>
              </div>
              <div className="sm-metric-card">
                <p className="sm-kicker text-[var(--sm-accent)]">Flagship</p>
                <p className="mt-3 text-lg font-bold text-white">{flagshipSystem.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">AI-native ERP alternative</p>
              </div>
            </div>
          </div>

          <div className="animate-rise-delayed">
            <div className="sm-terminal p-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Mission control</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">{flagshipSystem.name}</h2>
                </div>
                <span className="sm-status-pill">
                  <span className="sm-led bg-cyan-400" />
                  Action layer
                </span>
              </div>

              <div className="mt-5 grid gap-3">
                {flagshipSystem.steps.map((step, index) => (
                  <div className="sm-chip flex items-start gap-3 text-sm text-white" key={step}>
                    <span className="font-mono text-[var(--sm-accent)]">0{index + 1}</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="sm-surface-soft p-4">
                  <p className="sm-kicker text-[var(--sm-accent)]">Signals in</p>
                  <p className="mt-2 text-sm text-white">Emails, files, sheets, forwarded notes, market headlines</p>
                </div>
                <div className="sm-surface-soft p-4">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Actions out</p>
                  <p className="mt-2 text-sm text-white">Owners, due dates, escalations, close-out chains</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {controlModules.map((product) => (
                  <div className="sm-command-row" key={product.name}>
                    <div>
                      <p className="font-semibold text-white">{product.name}</p>
                      <p className="text-sm text-[var(--sm-muted)]">{product.tagline}</p>
                    </div>
                    <span className="sm-status-pill">{product.availability}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Try first</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Three free tools.</h2>
          </div>
          <Link className="sm-link" to="/examples">
            Open tools
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {freeTools.map((product) => (
            <article className="sm-surface p-5" key={product.name}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-bold text-white">{product.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.tagline}</p>
                </div>
                <span className="sm-status-pill">{product.availability}</span>
              </div>
              <div className="mt-5 grid gap-2 text-sm">
                {product.variants.map((variant) => (
                  <div className="sm-chip text-white" key={variant}>
                    {variant}
                  </div>
                ))}
              </div>
              {product.exampleId ? (
                <Link className="sm-button-primary mt-5" to={`/examples#${product.exampleId}`}>
                  Try it
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Deploy next</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Control modules for real workflows.</h2>
          <div className="mt-4 grid gap-3">
            {controlModules.map((product) => (
              <div className="sm-command-row" key={product.name}>
                <div>
                  <p className="font-semibold text-white">{product.name}</p>
                  <p className="text-sm text-[var(--sm-muted)]">{product.output}</p>
                </div>
                <Link className="sm-link" to="/contact">
                  Deploy
                </Link>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">How it lands</p>
          <h2 className="mt-3 text-2xl font-bold text-white">One clean buying path.</h2>
          <div className="mt-4 grid gap-3">
            {engagementFlow.map((step, index) => (
              <div className="sm-chip flex items-center gap-3 text-sm text-white" key={step}>
                <span className="font-mono text-[var(--sm-accent)]">0{index + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
