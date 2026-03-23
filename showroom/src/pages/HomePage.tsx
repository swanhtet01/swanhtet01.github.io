import { Link } from 'react-router-dom'

import { engagementFlow, flagshipSystem, paidModules, products } from '../content'

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="sm-surface-deep relative overflow-hidden p-8 text-white lg:p-12">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,_rgba(78,221,246,0.35),_transparent_68%)]" />
        <div className="pointer-events-none absolute -bottom-20 left-0 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(255,144,93,0.28),_transparent_70%)]" />
        <p className="sm-kicker text-cyan-200">SuperMega</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-extrabold tracking-tight lg:text-6xl">
          Start with one useful AI tool. Grow into one action layer.
        </h1>
        <p className="mt-4 max-w-3xl text-base text-slate-100 lg:text-lg">
          Use a free tool first. If it works, we deploy one module on your data. Then we connect everything into SuperMega OS.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="sm-button-primary bg-cyan-400 text-slate-950 hover:bg-cyan-300" to="/examples">
            Try Tools
          </Link>
          <Link className="sm-button-dark" to="/products">
            See Products
          </Link>
          <Link className="sm-button-accent" to="/contact?intent=pilot">
            Start Pilot
          </Link>
        </div>
        <div className="mt-8 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-4 backdrop-blur">
            <p className="sm-kicker text-cyan-200">Free</p>
            <p className="mt-2 text-base font-bold">Lead Finder, Market Brief, Action Board</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-4 backdrop-blur">
            <p className="sm-kicker text-cyan-200">Deploy</p>
            <p className="mt-2 text-base font-bold">Supplier Watch, Quality CAPA, Action Board Pro</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-4 backdrop-blur">
            <p className="sm-kicker text-cyan-200">Flagship</p>
            <p className="mt-2 text-base font-bold">{flagshipSystem.name}</p>
            <p className="mt-1 text-slate-200">{flagshipSystem.tagline}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[var(--sm-ink)]">Free tools</h2>
          <Link className="sm-link" to="/products">
            View all
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {products.map((product) => (
            <article className="sm-surface p-5" key={product.name}>
              <h3 className="text-lg font-bold text-[var(--sm-ink)]">{product.name}</h3>
              <p className="mt-2 text-sm font-semibold text-[var(--sm-accent)]">{product.tagline}</p>
              <Link className="sm-button-primary mt-4" to={`/examples#${product.exampleId}`}>
                Open example
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Paid modules</p>
          <h2 className="mt-3 text-2xl font-bold text-[var(--sm-ink)]">Deploy one workflow first.</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {paidModules.map((module) => (
              <div className="sm-chip" key={module.name}>
                <p className="font-bold text-[var(--sm-ink)]">{module.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{module.tagline}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">How it works</p>
          <h2 className="mt-3 text-2xl font-bold text-[var(--sm-ink)]">Small start. Real rollout.</h2>
          <div className="mt-4 grid gap-3">
            {engagementFlow.map((step) => (
              <div className="sm-chip text-sm font-medium text-[var(--sm-ink)]" key={step}>
                {step}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">Flagship</p>
        <h2 className="mt-3 text-2xl font-bold text-[var(--sm-ink)]">{flagshipSystem.name}</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--sm-muted)]">{flagshipSystem.bestFor}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {flagshipSystem.steps.map((step) => (
            <div className="sm-chip text-sm font-medium text-[var(--sm-ink)]" key={step}>
              {step}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
