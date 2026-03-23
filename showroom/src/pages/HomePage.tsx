import { Link } from 'react-router-dom'

import { packages, products, trialModules } from '../content'

export function HomePage() {
  return (
    <div className="space-y-8 pb-8 lg:space-y-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/45 p-7 shadow-[0_30px_70px_-45px_rgba(8,40,58,0.85)] backdrop-blur-xl lg:p-10">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(37,170,167,0.42),_transparent_68%)]" />
        <div className="pointer-events-none absolute -bottom-20 -left-14 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(232,116,67,0.35),_transparent_72%)]" />
        <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[var(--sm-accent)]">SuperMega</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-extrabold tracking-tight text-[var(--sm-ink)] lg:text-6xl">
          AI agents that make management simpler.
        </h1>
        <p className="mt-4 max-w-3xl text-base text-[var(--sm-muted)] lg:text-lg">
          We build practical systems your managers and directors can use every day.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sm-muted)]">
          <span className="rounded-full border border-white/70 bg-white/55 px-3 py-1.5">1. Website</span>
          <span className="rounded-full border border-white/70 bg-white/55 px-3 py-1.5">2. Products</span>
          <span className="rounded-full border border-white/70 bg-white/55 px-3 py-1.5">3. Examples</span>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5b5d]"
            to="/examples"
          >
            Open Examples
          </Link>
          <Link
            className="rounded-full border border-white/70 bg-white/50 px-5 py-3 text-sm font-bold text-[var(--sm-ink)] hover:bg-white/80"
            to="/products"
          >
            See Products
          </Link>
          <Link
            className="rounded-full bg-[var(--sm-accent-alt)] px-5 py-3 text-sm font-bold text-white hover:bg-[#b84d1d]"
            to="/contact?intent=pilot"
          >
            Book Pilot
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--sm-ink)]">Products</h2>
          <Link className="text-sm font-bold text-[var(--sm-accent)] hover:text-[#0a5b5d]" to="/products">
            All products
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {products.map((product) => (
            <article className="rounded-3xl border border-white/55 bg-white/45 p-5 backdrop-blur-xl" key={product.name}>
              <h3 className="text-lg font-bold text-[var(--sm-ink)]">{product.name}</h3>
              <p className="mt-2 text-sm font-semibold text-[var(--sm-accent)]">{product.tagline}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.fit}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--sm-ink)]">Examples</h2>
          <Link className="text-sm font-bold text-[var(--sm-accent)] hover:text-[#0a5b5d]" to="/examples">
            Run now
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {trialModules.map((module) => (
            <article className="rounded-3xl border border-white/55 bg-white/45 p-5 backdrop-blur-xl" key={module.id}>
              <h3 className="text-lg font-bold text-[var(--sm-ink)]">{module.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{module.promise}</p>
              <Link
                className="mt-4 inline-flex rounded-full bg-[var(--sm-accent)] px-4 py-2 text-sm font-bold text-white hover:bg-[#0a5b5d]"
                to={`/examples#${module.id}`}
              >
                Run
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--sm-ink)]">Pricing</h2>
          <Link className="text-sm font-bold text-[var(--sm-accent)] hover:text-[#0a5b5d]" to="/packages">
            Compare plans
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {packages.map((pkg) => (
            <article className="rounded-3xl border border-white/55 bg-white/45 p-5 backdrop-blur-xl" key={pkg.name}>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--sm-accent)]">{pkg.name}</p>
              <p className="mt-2 text-2xl font-extrabold text-[var(--sm-ink)]">{pkg.investment}</p>
              <p className="mt-1 text-sm text-[var(--sm-muted)]">{pkg.timeline}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
