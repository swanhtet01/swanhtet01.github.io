import { Link } from 'react-router-dom'

import { packages, products, trialModules } from '../content'

export function HomePage() {
  return (
    <div className="space-y-8 pb-8 lg:space-y-10">
      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[1.9rem] border border-[var(--sm-line)] bg-[var(--sm-paper)]/94 p-6 shadow-[var(--sm-shadow)] lg:p-9">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--sm-accent)]">SuperMega AI Agent Solutions</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--sm-ink)] lg:text-5xl">
            Simple AI systems that help managers and directors run daily work.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
            We connect your files, email, and team updates into one control system with clear actions, owners, and due dates.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5b5d]"
              to="/prototypes"
            >
              Open Free Prototypes
            </Link>
            <Link
              className="rounded-full border border-[var(--sm-line)] px-5 py-3 text-sm font-bold text-[var(--sm-ink)] hover:bg-white/90"
              to="/products"
            >
              View Products
            </Link>
            <Link
              className="rounded-full bg-[var(--sm-accent-alt)] px-5 py-3 text-sm font-bold text-white hover:bg-[#b84d1d]"
              to="/contact?intent=pilot"
            >
              Book 14-Day Pilot
            </Link>
          </div>
        </article>

        <article className="rounded-[1.9rem] border border-[#184a4a] bg-[#112d31] p-6 text-white">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-200">What you get</p>
          <ul className="mt-4 space-y-3 text-sm text-slate-100">
            <li className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3">Daily decision dashboard for leadership</li>
            <li className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3">Supplier, quality, and operations control loops</li>
            <li className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3">Weekly brief with action priorities</li>
            <li className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3">Evidence-linked outputs, not vague AI text</li>
          </ul>
        </article>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--sm-ink)]">Free prototypes you can test now</h2>
          <Link className="text-sm font-bold text-[var(--sm-accent)] hover:text-[#0a5b5d]" to="/prototypes">
            Open all prototypes
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {trialModules.map((module) => (
            <article className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-5" key={module.id}>
              <h3 className="text-lg font-bold text-[var(--sm-ink)]">{module.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{module.promise}</p>
              <Link
                className="mt-4 inline-flex rounded-full bg-[var(--sm-accent)] px-4 py-2 text-sm font-bold text-white hover:bg-[#0a5b5d]"
                to={`/prototypes#${module.id}`}
              >
                Test Prototype
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--sm-ink)]">Core products</h2>
          <Link className="text-sm font-bold text-[var(--sm-accent)] hover:text-[#0a5b5d]" to="/products">
            Product details
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {products.map((product) => (
            <article className="rounded-3xl border border-[var(--sm-line)] bg-[var(--sm-paper)]/95 p-5" key={product.name}>
              <h3 className="text-lg font-bold text-[var(--sm-ink)]">{product.name}</h3>
              <p className="mt-2 text-sm font-semibold text-[var(--sm-accent)]">{product.tagline}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.fit}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--sm-ink)]">Pricing</h2>
          <Link className="text-sm font-bold text-[var(--sm-accent)] hover:text-[#0a5b5d]" to="/packages">
            Compare packages
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {packages.map((pkg) => (
            <article className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-5" key={pkg.name}>
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

