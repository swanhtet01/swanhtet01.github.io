import { Link } from 'react-router-dom'

import { BrandLockup } from '../components/Brand'
import { LiveProductPreview } from '../components/LiveProductPreview'
import { trackEvent } from '../lib/analytics'
import { PUBLIC_PERSONAS } from '../lib/goToMarketShowcase'
import { STARTER_PACK_DETAILS, type StarterPackDetail } from '../lib/salesControl'
import { getTenantConfig } from '../lib/tenantConfig'

const heroHighlights = [
  { label: 'Start small', value: 'One team, one workflow, one live screen.' },
  { label: 'Connect first', value: 'Gmail, Drive, Sheets, Calendar, CSV, and ERP exports.' },
  { label: 'Control stays built in', value: 'Roles, approvals, history, and tenant scope from day one.' },
] as const

const yangonTyreHighlights = [
  'Sales, operations, quality, maintenance, and leadership work from one role-based portal.',
  'Approvals and follow-up move into owned queues instead of chats and file loops.',
  'Current Gmail, Drive, ERP exports, forms, and uploads connect into the same workspace.',
] as const

const rolloutPrinciples = [
  'Each rollout starts with one product that already exists.',
  'Current data is connected before any rewrite.',
  'The client expands only after the first team is using it daily.',
] as const

const platformPaths = [
  {
    label: 'Use the platform',
    title: 'Open the guided workspace',
    detail: 'Login into one clear start screen, then open the right desk instead of guessing between internal routes.',
    primary: { label: 'Open workspace', to: '/login?next=/app/start' },
    secondary: { label: 'See app flow', to: '/platform' },
  },
  {
    label: 'Sell the platform',
    title: 'Show live proof',
    detail: 'Use demo center, products, and the Yangon Tyre case study to present what already works.',
    primary: { label: 'Open demo center', to: '/demo-center' },
    secondary: { label: 'Read case study', to: '/clients/yangon-tyre' },
  },
  {
    label: 'Build products',
    title: 'Run the foundry stack',
    detail: 'Use the internal build lanes for R&D, modules, release gates, and the AI workforce that ships them.',
    primary: { label: 'Open build stack', to: '/login?next=/app/factory' },
    secondary: { label: 'Review products', to: '/products' },
  },
  {
    label: 'Operate cloud',
    title: 'Keep deploys and agents healthy',
    detail: 'Use the cloud and runtime desks to manage deploys, domains, jobs, and the autonomous operating layer.',
    primary: { label: 'Open cloud ops', to: '/login?next=/app/cloud' },
    secondary: { label: 'Request rollout', to: '/contact' },
  },
] as const

function rolloutLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

export function HomePage() {
  const tenant = getTenantConfig()
  const featuredProducts: StarterPackDetail[] = STARTER_PACK_DETAILS.slice(0, 3)
  const primaryProduct = featuredProducts[0]
  const featuredPackages = PUBLIC_PERSONAS.slice(0, 3)

  if (tenant.key !== 'default') {
    return (
      <div className="space-y-10 pb-16">
        <section className="sm-site-panel">
          <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr] xl:items-center">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">{tenant.homeEyebrow}</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{tenant.homeTitle}</h1>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{tenant.homeDescription}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={tenant.homePrimaryCta.to}>
                  {tenant.homePrimaryCta.label}
                </Link>
                <Link className="sm-button-secondary" to={tenant.homeSecondaryCta.to}>
                  {tenant.homeSecondaryCta.label}
                </Link>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {tenant.toolCards.map((item) => (
                <article className="sm-proof-card" key={item.title}>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
                  <div className="mt-5">
                    <Link className="sm-link" to={item.to}>
                      Open
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sm-site-final">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Choose the workspace entry point.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/receiving">
              Open operations
            </Link>
            <Link className="sm-button-secondary" to="/app/revenue">
              Open revenue
            </Link>
            <Link className="sm-button-secondary" to="/login">
              Team login
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-12 pb-16">
      <section className="sm-site-panel">
        <div className="sm-home-hero-shell">
          <div className="sm-home-hero-copy">
            <BrandLockup className="mb-4" markClassName="h-11 w-11" meta={tenant.brandTagline} wordmarkClassName="text-2xl text-white" />
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Replace tool sprawl with one working system.</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Start with sales follow-up, company cleanup, receiving control, or a client portal. Expand only after the first team is using the system every day.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" onClick={() => trackEvent('offer_open_click', { offer: 'products_overview' })} to="/products">
                Review products
              </Link>
              <Link
                className="sm-button-secondary"
                onClick={() => trackEvent('signup_open_click', { source: 'home_hero' })}
                to="/signup"
              >
                Create workspace
              </Link>
            </div>
            <div className="sm-home-signal-grid">
              {heroHighlights.map((item) => (
                <article className="sm-hero-signal" key={item.label}>
                  <span className="sm-hero-signal-label">{item.label}</span>
                  <span className="sm-hero-signal-value">{item.value}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="sm-home-preview-stage">
            <LiveProductPreview className="sm-home-preview-main animate-rise-delayed" variant="portal" />
            <LiveProductPreview className="sm-home-preview-aux" compact variant="founder-brief" />
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Products</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Three products ready to launch.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Each rollout starts with one clear job, one team, and one live outcome.
          </p>
        </div>
        <div className="sm-home-product-rail mt-8">
          {featuredProducts.map((product: StarterPackDetail) => (
            <article className="sm-home-product-tile" key={product.id}>
              <div className="sm-home-product-image">
                <img alt={`${product.name} screenshot`} className="h-auto w-full object-cover object-top" loading="lazy" src={product.image} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="sm-kicker text-[var(--sm-accent)]">Working product</p>
                <span className="sm-status-pill">Live now</span>
              </div>
              <h3 className="mt-4 text-2xl font-bold">{product.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
              <div className="mt-5 grid gap-2">
                <div className="sm-site-point">
                  <span className="sm-site-point-dot" />
                  <span>{product.audience}</span>
                </div>
                <div className="sm-site-point">
                  <span className="sm-site-point-dot" />
                  <span>{product.problemsSolved[0]}</span>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/products/${product.slug}`}>
                  Review product
                </Link>
                <Link className="sm-button-secondary" to={rolloutLink(product.name)}>
                  Request rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Choose your path</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Use it, sell it, build it, or operate it.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            SUPERMEGA.dev is easier to understand when the path is explicit. Start with the mode you are in, not the full platform map.
          </p>
        </div>
        <div className="sm-home-package-list mt-8">
          {platformPaths.map((path) => (
            <article className="sm-home-package-row" key={path.title}>
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">{path.label}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{path.title}</h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">{path.detail}</p>
              </div>
              <div className="sm-home-package-meta">
                <Link className="sm-button-primary" to={path.primary.to}>
                  {path.primary.label}
                </Link>
                <Link className="sm-link" to={path.secondary.to}>
                  {path.secondary.label}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.02fr_0.98fr] xl:items-start">
        <article className="sm-site-panel sm-home-case-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Case study</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Yangon Tyre is the first full client portal.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            The same product base expands into a company portal with role-based views, connected records, approvals, and audit history.
          </p>
          <div className="mt-6 space-y-3">
            {yangonTyreHighlights.map((point) => (
              <div className="sm-site-point" key={point}>
                <span className="sm-site-point-dot" />
                <span>{point}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/clients/yangon-tyre">
              Read case study
            </Link>
            <Link className="sm-button-secondary" to="/contact?package=Yangon%20Tyre%20portal">
              Request rollout
            </Link>
          </div>
        </article>

        <aside className="sm-site-panel">
          <div className="sm-home-showcase-stack">
            <LiveProductPreview className="animate-rise" variant="ytf-portal" />
            <LiveProductPreview compact variant="tenant-control" />
          </div>
        </aside>
      </section>

      <section className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Best-fit packages</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Start with the package that matches the client.</h2>
          <div className="sm-home-package-list mt-6">
            {featuredPackages.map((persona) => (
              <article className="sm-home-package-row" key={persona.id}>
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{persona.name}</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">{persona.role}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{persona.firstLaunch}</p>
                </div>
                <div className="sm-home-package-meta">
                  <p>{persona.stack}</p>
                  <Link className="sm-link" to={persona.route}>
                    Review package
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-6">
            <Link className="sm-button-secondary" to="/packages">
              Review all packages
            </Link>
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Rollout standard</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Every rollout stays small until it works.</h2>
          <div className="mt-6 grid gap-4">
            {rolloutPrinciples.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          {primaryProduct ? (
            <div className="mt-8 overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#040b16]">
              <img
                alt={`${primaryProduct.name} product screenshot`}
                className="h-auto w-full object-cover object-top"
                loading="lazy"
                src={primaryProduct.image}
              />
            </div>
          ) : null}
        </article>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Tell us the first team and current stack.</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/signup">
              Create workspace
            </Link>
            <Link className="sm-button-secondary" to="/contact">
              Request rollout
            </Link>
            <Link className="sm-button-secondary" to="/products">
              Review products
            </Link>
            <Link className="sm-button-secondary" to="/clients/yangon-tyre">
              Read case study
            </Link>
            <Link className="sm-button-secondary" to="/platform">
              How it works
            </Link>
          </div>
          <article className="sm-qr-card">
            <p className="sm-kicker text-[var(--sm-accent)]">Open on mobile</p>
            <img alt="QR code to open SUPERMEGA.dev" className="sm-qr-image" src="/site/supermega-qr.svg" />
            <p className="text-sm leading-relaxed text-[var(--sm-muted)]">Scan to open `supermega.dev` on a phone or share it fast in a meeting.</p>
          </article>
        </div>
      </section>
    </div>
  )
}
