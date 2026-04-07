import { Link } from 'react-router-dom'

import { hero, publicModules } from '../content'
import { trackEvent } from '../lib/analytics'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'

export function HomePage() {
  const featuredProducts = STARTER_PACK_DETAILS

  return (
    <div className="pb-16">
      <section className="sm-site-bleed sm-site-hero">
        <div className="sm-site-hero-grid">
          <div className="sm-site-hero-copy">
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-extrabold tracking-tight text-white lg:text-8xl">{hero.title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{hero.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" onClick={() => trackEvent('contact_open_click', { source: 'home_hero' })} to="/contact">
                Contact us
              </Link>
              <Link className="sm-button-secondary" onClick={() => trackEvent('offer_open_click', { offer: 'Products' })} to="/products">
                See products
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-[var(--sm-muted)]">
              <span>Myanmar-first</span>
              <span>Sales systems</span>
              <span>Operations control</span>
              <span>Founder brief</span>
              <span>Client-facing portals</span>
            </div>
          </div>

          <div className="sm-site-stage" aria-label="SuperMega system examples">
            <img alt="SuperMega control room" className="sm-site-shot sm-site-shot-main" src="/site/control-room.svg" />
            <img alt="Founder daily brief example" className="sm-site-shot sm-site-shot-top" src="/site/founder-brief.svg" />
            <img alt="Operations desk example" className="sm-site-shot sm-site-shot-bottom" src="/site/ops-desk.svg" />
          </div>
        </div>
      </section>

      <section className="mt-12 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Products</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Three starter packs for sales, cleanup, and receiving.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Start with one product. Keep one queue moving. Add the agent loops after the team trusts the base workflow.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {featuredProducts.map((product) => (
            <article className="sm-pack-card overflow-hidden p-4 text-white" key={product.id}>
              <img alt={product.name} className="w-full rounded-2xl border border-white/10 bg-[#020612]" src={product.image} />
              <p className="mt-4 font-semibold">{product.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.promise}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">Start with {product.starterModules.join(' + ')}</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={`/products/${product.slug}`}>
                View product
              </Link>
            </article>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
          Best fit first: Myanmar distributors, importers, warehouses, factories, and service teams still running work through Facebook, Viber, WhatsApp, Gmail, and spreadsheets.
        </p>
      </section>

      <section className="mt-16 sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Free proof tools</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-4xl">Use a small tool first if you want to test the shape.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            These are support tools. The real products are the starter packs above.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {publicModules.map((item) => (
            <article className="sm-chip text-white" key={item.name}>
              <p className="font-semibold">{item.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.tagline}</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" to={item.path}>
                Open tool
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">SuperMega</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Start with one workflow. Keep the next step visible.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">Contact us with the first workflow that is still trapped in chat, spreadsheets, or scattered tools.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Contact us
          </Link>
          <Link className="sm-button-secondary" to="/products">
            View products
          </Link>
        </div>
      </section>
    </div>
  )
}
