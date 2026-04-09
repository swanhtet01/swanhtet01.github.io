import { Link } from 'react-router-dom'

import { PLATFORM_LAYER_DETAILS, QUICK_WIN_PRODUCTS, STARTER_PACK_DETAILS } from '../lib/salesControl'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

const packagingModes = [
  {
    name: 'For your team',
    detail: 'Run the products as your own operating stack for queues, approvals, data flow, and automation.',
  },
  {
    name: 'For your own workspace',
    detail: 'Use the same modules as a personal control room for daily review, tasks, and decisions.',
  },
  {
    name: 'For clients',
    detail: 'Wrap the same base in branded customer or partner-facing systems without building another stack.',
  },
  {
    name: 'For self-hosted builds',
    detail: 'Reuse the same base while keeping private workflows and client data separate.',
  },
] as const

export function ProductsPage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Products</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Connected products you can use now.</h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Each product starts simple: one workflow, real data, and a live screen. Underneath, the products share data, permissions, connections,
            and automation, so you do not need separate tools for every step.
          </p>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Platform stack</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Every product shares the same foundation.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              You start with one product, but the data, permissions, connections, and automation stay connected behind it.
            </p>
          </div>
          <Link className="sm-button-secondary" to="/platform">
            See how it works
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {PLATFORM_LAYER_DETAILS.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.id}>
              <span className="sm-home-proof-label">{item.layer}</span>
              <strong>{item.name}</strong>
              <span>{item.detail}</span>
              <small className="text-[var(--sm-muted)]">{item.modules.join(', ')}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Ways to use it</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The same products can run your team, your workspace, or client delivery.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are not only external products. They can also become your internal operating base or your own working system.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {packagingModes.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        {STARTER_PACK_DETAILS.map((product) => (
          <article className="sm-pack-card overflow-hidden p-4 text-white" key={product.id}>
            <img
              alt={`${product.name} live screenshot`}
              className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
              loading="lazy"
              src={product.image}
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="sm-kicker text-[var(--sm-accent)]">{product.eyebrow}</p>
              <span className="sm-status-pill">Live now</span>
            </div>
            <h2 className="mt-4 text-2xl font-bold">{product.name}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">For {product.audience}</p>
            <div className="mt-4 grid gap-2">
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Product</p>
                <p className="mt-2 text-sm text-white">{product.starterModules.join(' + ')}</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Shared data</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.knowledgeModules.join(', ')}</p>
              </div>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Connections</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.infrastructureModules.join(', ')}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={contactLink(product.name)}>
                Start onboarding
              </Link>
              <Link className="sm-button-secondary" to={product.proofTool.route}>
                Open live module
              </Link>
            </div>
            <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={`/products/${product.slug}`}>
              View product details
            </Link>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">How rollout starts</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Short rollout. Real data. Small team.</h2>
          <div className="mt-6 space-y-3">
            {[
              'Pick the product that matches the actual bottleneck.',
              'Import the spreadsheet, notes, inbox, or issue log the team already uses.',
              'Give the working team one shared queue and one short review habit.',
              'Turn on automation after the workflow is trusted.',
            ].map((item, index) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{index + 1}. {item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Add after the base product works</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These extend the same system without fragmenting the stack.</h2>
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
