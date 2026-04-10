import { Link } from 'react-router-dom'

import { hero } from '../content'
import { trackEvent } from '../lib/analytics'
import { STARTER_PACK_DETAILS, type StarterPackDetail } from '../lib/salesControl'
import { getTenantConfig } from '../lib/tenantConfig'

const screenshotSize = {
  width: 1440,
  height: 1024,
} as const

const templateHighlights = [
  {
    name: 'Sales system',
    detail: 'Start with Find Clients or Company List. Expand into a real CRM with follow-up, ownership, and review.',
    to: '/products/sales-system',
  },
  {
    name: 'Operations system',
    detail: 'Start with Receiving Control. Expand into approvals, supplier recovery, inventory, and issue tracking.',
    to: '/products/operations-inbox',
  },
  {
    name: 'Client portal',
    detail: 'Package the same system into one branded workspace for a client, site, or internal team.',
    to: '/products/client-portal',
  },
] as const

const yangonTyrePoints = [
  'Sales, operations, quality, maintenance, CEO, and admin use one portal.',
  'Gmail, Drive, Calendar, ERP exports, and forms feed the same system.',
  'The portal is built from the same templates shown on the products page.',
] as const

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

export function HomePage() {
  const tenant = getTenantConfig()

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
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open the workspace you need.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/receiving">
              Open operations
            </Link>
            <Link className="sm-button-secondary" to="/app/sales">
              Open sales
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Open admin
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-10 pb-16">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.88fr_1.12fr] xl:items-center">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Working products. Structured rollouts.</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Open a real product. If it works, turn it into a sales system, operations system, or client portal.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">Live products</span>
              <span className="sm-status-pill">Structured templates</span>
              <span className="sm-status-pill">Named client portals</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" onClick={() => trackEvent('offer_open_click', { offer: 'Products overview' })} to="/products">
                See products
              </Link>
              <Link className="sm-button-secondary" onClick={() => trackEvent('contact_open_click', { source: 'home_hero' })} to="/clients/yangon-tyre">
                See case study
              </Link>
            </div>
          </div>

          <article className="sm-surface-deep p-4 lg:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Live product</p>
                <p className="mt-2 text-lg font-semibold text-white">Company List</p>
              </div>
              <span className="sm-status-pill">Open now</span>
            </div>
            <img
              alt="SUPERMEGA.dev company list live product"
              className="mt-4 aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
              decoding="async"
              fetchPriority="high"
              height={screenshotSize.height}
              src="/site/company-list-live.png"
              width={screenshotSize.width}
            />
          </article>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live products</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Start with one clear job.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are the current working products. Each one can stand alone or become part of a larger system.
          </p>
        </div>
        <div className="mt-8 grid gap-6 xl:grid-cols-3">
          {STARTER_PACK_DETAILS.map((product: StarterPackDetail) => (
            <article className="sm-pack-card overflow-hidden p-4 text-white" key={product.id}>
              <img
                alt={`${product.name} live screenshot`}
                className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
                decoding="async"
                height={screenshotSize.height}
                loading="lazy"
                src={product.image}
                width={screenshotSize.width}
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="sm-kicker text-[var(--sm-accent)]">Live product</p>
                <span className="sm-status-pill">Open now</span>
              </div>
              <h3 className="mt-4 text-2xl font-bold">{product.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
              <p className="mt-4 text-sm text-white/80">Starts with: {product.starterModules.join(' + ')}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={product.proofTool.route}>
                  Open product
                </Link>
                <Link className="sm-link" to={`/products/${product.slug}`}>
                  See setup
                </Link>
                <Link className="sm-link" to={contactLink(product.name)}>
                  Start rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Structured templates</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Use the same base in a larger rollout.</h2>
          <div className="mt-6 grid gap-3">
            {templateHighlights.map((template) => (
              <article className="sm-proof-card" key={template.name}>
                <p className="font-semibold text-white">{template.name}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{template.detail}</p>
                <div className="mt-4">
                  <Link className="sm-link" to={template.to}>
                    See template
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Case study</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Yangon Tyre is the first full client portal.</h2>
          <img
            alt="Yangon Tyre portal"
            className="mt-6 aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
            decoding="async"
            height={screenshotSize.height}
            loading="lazy"
            src="/site/receiving-control-live.png"
            width={screenshotSize.width}
          />
          <div className="mt-6 space-y-3">
            {yangonTyrePoints.map((point) => (
              <div className="sm-site-point" key={point}>
                <span className="sm-site-point-dot" />
                <span>{point}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/clients/yangon-tyre">
              Open case study
            </Link>
            <Link className="sm-button-secondary" to="/products/client-portal">
              See client portal template
            </Link>
          </div>
        </article>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open a product. Then decide if you want the full rollout.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/products">
            Open products
          </Link>
          <Link className="sm-button-secondary" to="/contact">
            Start rollout
          </Link>
        </div>
      </section>
    </div>
  )
}
