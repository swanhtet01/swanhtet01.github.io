import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { LAB_TRACKS, PUBLIC_PRODUCTS } from '../lib/salesControl'

export function ProductsPage() {
  const liveProducts = PUBLIC_PRODUCTS.filter((product) => product.status === 'Live now')
  const packProducts = PUBLIC_PRODUCTS.filter((product) => product.status !== 'Live now')

  return (
    <div className="space-y-8">
      <PageIntro
        compact
        eyebrow="Products"
        title="Specific products, not one vague platform."
        description="Sell a small set of AI-native workflow products now. Keep the riskier agent loops in the lab until they are durable."
      />

      <section className="sm-surface p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">Sell now</p>
        <h2 className="mt-3 text-3xl font-bold text-white">Three public products only.</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {liveProducts.map((product) => (
            <article className="sm-proof-card" key={product.id}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xl font-bold text-white">{product.name}</h3>
                <span className="sm-status-pill">{product.status}</span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.promise}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.audience}</p>
              <div className="mt-5">
                <Link className="sm-button-primary" to={product.route}>
                  Open {product.name}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Private packs and add-ons</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The next products after the wedge.</h2>
          <div className="mt-5 space-y-4">
            {packProducts.map((product) => (
              <article className="sm-proof-card" key={product.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-white">{product.name}</h3>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.promise}</p>
                  </div>
                  <span className="sm-status-pill">{product.status}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{product.audience}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What makes this different</p>
          <h2 className="mt-3 text-3xl font-bold text-white">AI-native means the software does the setup work.</h2>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-[var(--sm-muted)]">Lead Finder does not stop at search. It saves the shortlist, drafts outreach, and seeds the queue.</div>
            <div className="sm-chip text-[var(--sm-muted)]">Workspace does not wait for structured data. It can start from a pasted lead list, pasted updates, or pasted ops issues.</div>
            <div className="sm-chip text-[var(--sm-muted)]">The queue is the product core. Agents and automations should feed it, not replace it with opaque magic.</div>
          </div>
          <div className="mt-6">
            <Link className="sm-button-secondary" to="/lab">
              Open R&D Lab
            </Link>
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">R&D preview</p>
        <h2 className="mt-3 text-3xl font-bold text-white">Agent loops we are building next.</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {LAB_TRACKS.map((track) => (
            <div className="sm-chip text-white" key={track.id}>
              <p className="font-semibold">{track.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{track.loop}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
