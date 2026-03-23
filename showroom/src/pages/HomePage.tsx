import { Link } from 'react-router-dom'

import { products, trialModules } from '../content'

export function HomePage() {
  return (
    <div className="space-y-10 pb-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-[linear-gradient(145deg,rgba(11,18,32,0.86),rgba(16,36,56,0.78))] p-8 text-white shadow-[0_30px_90px_-50px_rgba(2,10,28,0.95)] backdrop-blur-2xl lg:p-12">
        <div className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(25,188,222,0.45),_transparent_68%)]" />
        <div className="pointer-events-none absolute -bottom-16 left-0 h-52 w-52 rounded-full bg-[radial-gradient(circle,_rgba(255,121,63,0.34),_transparent_70%)]" />
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200">SuperMega</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-extrabold tracking-tight lg:text-6xl">
          AI agent products people actually use.
        </h1>
        <p className="mt-4 max-w-3xl text-base text-slate-200 lg:text-lg">
          No fluff. Test free examples now, then deploy the same agents on real business data.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
            to="/examples"
          >
            Try Free Examples
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
            <article className="rounded-3xl border border-white/45 bg-white/55 p-5 shadow-[var(--sm-shadow)] backdrop-blur-xl" key={product.name}>
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

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[var(--sm-ink)]">Free examples</h2>
          <Link className="text-sm font-semibold text-[var(--sm-accent)] hover:text-cyan-700" to="/examples">
            Run now
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {trialModules.map((module) => (
            <article className="rounded-3xl border border-white/45 bg-white/55 p-5 backdrop-blur-xl" key={module.id}>
              <h3 className="text-lg font-bold text-[var(--sm-ink)]">{module.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{module.promise}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
