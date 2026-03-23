import { Link } from 'react-router-dom'

import { engagementFlow, products } from '../content'

export function HomePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/55 bg-[linear-gradient(145deg,rgba(7,33,56,0.9),rgba(16,75,96,0.84))] p-8 text-white shadow-[0_34px_90px_-50px_rgba(2,10,28,0.9)] backdrop-blur-2xl lg:p-12">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,_rgba(78,221,246,0.35),_transparent_68%)]" />
        <div className="pointer-events-none absolute -bottom-20 left-0 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(255,144,93,0.28),_transparent_70%)]" />
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200">SuperMega</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-extrabold tracking-tight lg:text-6xl">
          3 AI agents you can test now.
        </h1>
        <p className="mt-4 max-w-3xl text-base text-slate-100 lg:text-lg">
          Try free demos first. If useful, we connect the same flow to your live data.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
            to="/examples"
          >
            Try Free Tools
          </Link>
          <Link
            className="rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur hover:bg-white/20"
            to="/products"
          >
            See Products
          </Link>
          <Link
            className="rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-400"
            to="/contact?intent=pilot"
          >
            Start Pilot
          </Link>
        </div>
        <div className="mt-8 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">Lead scraping + scoring</div>
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">Daily news brief + actions</div>
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">Action board from raw notes</div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[var(--sm-ink)]">Products</h2>
          <Link className="text-sm font-semibold text-[var(--sm-accent)] hover:text-cyan-700" to="/products">
            View all
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {products.map((product) => (
            <article className="rounded-3xl border border-white/60 bg-white/60 p-5 shadow-[var(--sm-shadow)] backdrop-blur-xl" key={product.name}>
              <h3 className="text-lg font-bold text-[var(--sm-ink)]">{product.name}</h3>
              <p className="mt-2 text-sm font-semibold text-[var(--sm-accent)]">{product.tagline}</p>
              <Link
                className="mt-4 inline-flex rounded-full bg-[var(--sm-accent)] px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700"
                to={`/examples#${product.exampleId}`}
              >
                Open Example
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/60 bg-white/55 p-6 backdrop-blur-xl">
        <h2 className="text-2xl font-bold text-[var(--sm-ink)]">How it works</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {engagementFlow.map((step) => (
            <div className="rounded-2xl border border-white/65 bg-white/70 px-4 py-3 text-sm font-medium text-[var(--sm-ink)]" key={step}>
              {step}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
