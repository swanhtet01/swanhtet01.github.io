import { Link } from 'react-router-dom'

import { QUICK_WIN_PRODUCTS, STARTER_PACK_DETAILS } from '../lib/salesControl'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

export function ProductsPage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Products</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              Three starter packs for real company work.
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Start with one pack. Load the data the team already has. Run one shared queue. Turn on the agent loops only after the base workflow is clear.
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        {STARTER_PACK_DETAILS.map((product) => (
          <article className="sm-pack-card overflow-hidden p-4 text-white" key={product.id}>
            <img alt={product.name} className="w-full rounded-2xl border border-white/10 bg-[#020612]" src={product.image} />
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="sm-kicker text-[var(--sm-accent)]">{product.eyebrow}</p>
              <span className="sm-status-pill">Main product</span>
            </div>
            <h2 className="mt-4 text-2xl font-bold">{product.name}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">For {product.audience}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-secondary" to={`/products/${product.slug}`}>
                View product
              </Link>
              <Link className="sm-button-primary" to={contactLink(product.name)}>
                Contact us
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">How rollout starts</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Short rollout. Real data. Small team.</h2>
          <div className="mt-6 space-y-3">
            {[
              'Pick the one pack that matches the actual bottleneck.',
              'Import the spreadsheet, notes, inbox, or issue log the team already uses.',
              'Give the working team one shared queue and one short review habit.',
              'Turn on cleanup, triage, and daily brief loops after the workflow is trusted.',
            ].map((item, index) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{index + 1}. {item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Add after the base pack works</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These extend the same system.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {QUICK_WIN_PRODUCTS.map((item) => (
              <article className="sm-chip text-white" key={item.id}>
                <p className="font-semibold">{item.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.useCase}</p>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
