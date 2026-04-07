import { Link, Navigate, useParams } from 'react-router-dom'

import { getStarterPackDetail, STARTER_PACK_DETAILS } from '../lib/salesControl'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

export function ProductDetailPage() {
  const { productId } = useParams()
  const product = getStarterPackDetail(productId)

  if (!product) {
    return <Navigate replace to="/products" />
  }

  const siblingProducts = STARTER_PACK_DETAILS.filter((pack) => pack.id !== product.id)

  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{product.eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{product.name}</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{product.promise}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">Myanmar-first</span>
              <span className="sm-status-pill">{product.audience}</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={contactLink(product.name)}>
                Contact us
              </Link>
              <Link className="sm-button-secondary" to={product.proofTool.route}>
                Try {product.proofTool.label}
              </Link>
            </div>
          </div>

          <div className="sm-pack-card overflow-hidden p-4">
            <img alt={product.name} className="w-full rounded-2xl border border-white/10 bg-[#020612]" src={product.image} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Start with</p>
                <p className="mt-3 text-sm font-semibold text-white">{product.starterModules.join(' + ')}</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Replaces</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.replaces}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Use it for</p>
          <div className="mt-5 space-y-3">
            {product.usedFor.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-[var(--sm-muted)]">
            This is not one narrow demo. It is the same system shape adapted to one team’s actual workflow and data.
          </p>
        </article>

        <article className="sm-site-panel">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">How setup works</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Set up in four short steps.</h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
              Start from the data and habits the team already has. Do not ask them to learn a giant new system first.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {product.setupPath.map((step, index) => (
              <article className="sm-chip text-white" key={step}>
                <p className="sm-kicker text-[var(--sm-accent)]">Step {index + 1}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{step}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Daily users</p>
          <div className="mt-5 space-y-3">
            {product.dailyUsers.map((role) => (
              <div className="sm-chip text-white" key={role}>
                <p className="font-semibold capitalize">{role}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Can expand into</p>
          <div className="mt-5 space-y-3">
            {product.expandsTo.map((item) => (
              <div className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Also works for</p>
          <div className="mt-5 space-y-3">
            {product.otherUses.map((item) => (
              <div className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next product</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Same company, different workflow.</h2>
          </div>
          <Link className="sm-button-secondary" to="/products">
            View all products
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {siblingProducts.map((item) => (
            <article className="sm-pack-card overflow-hidden p-4 text-white" key={item.id}>
              <img alt={item.name} className="w-full rounded-2xl border border-white/10 bg-[#020612]" src={item.image} />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="font-semibold">{item.name}</p>
                <span className="sm-status-pill">Starter pack</span>
              </div>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.promise}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-secondary" to={`/products/${item.slug}`}>
                  View product
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
