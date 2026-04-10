import { Link } from 'react-router-dom'

import { hero, ytfDeployment } from '../content'
import { trackEvent } from '../lib/analytics'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'
import { getTenantConfig } from '../lib/tenantConfig'

const screenshotSize = {
  width: 1440,
  height: 1024,
} as const

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

export function HomePage() {
  const tenant = getTenantConfig()
  const featuredProducts = STARTER_PACK_DETAILS

  if (tenant.key !== 'default') {
    return (
      <div className="space-y-10 pb-16">
        <section className="sm-site-panel">
          <div className="sm-site-proof-strip">
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
                <article className="sm-demo-link sm-demo-link-card" key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <Link className="sm-link" to={item.to}>
                    Open
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sm-site-panel">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Roles and controls</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Built for real plant work, review, and recovery.</h2>
              <div className="mt-5 grid gap-3">
                {ytfDeployment.roles.map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-3">
                {ytfDeployment.controls.map((item) => (
                  <div className="sm-chip text-[var(--sm-muted)]" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </article>

            <article className="sm-terminal p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Connected inputs</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Bring Gmail, Drive, Sheets, exports, and files into one tenant workspace.</h2>
              <div className="mt-5 grid gap-3">
                {ytfDeployment.dataSources.map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-relaxed text-[var(--sm-muted)]">Agent teams: {ytfDeployment.agentTeams.join(', ')}</p>
            </article>
          </div>
        </section>

        <section className="sm-site-final">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open the tenant workspace or review the operating model.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              This tenant shows the current live model: receiving, task control, files, approvals, management review, and agent operations on one base.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login">
              Team login
            </Link>
            <Link className="sm-button-secondary" to="/clients/yangon-tyre">
              Operating model
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Control plane
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-12 pb-16">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.88fr_1.12fr] xl:items-center">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">One working system for sales and operations.</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{hero.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" onClick={() => trackEvent('offer_open_click', { offer: 'Products overview' })} to="/products">
                See products
              </Link>
              <Link className="sm-button-secondary" onClick={() => trackEvent('contact_open_click', { source: 'home_hero' })} to="/contact">
                Start rollout
              </Link>
            </div>
          </div>

          <article className="sm-surface-deep p-4 lg:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Live product</p>
                <p className="mt-2 text-lg font-semibold text-white">Company List</p>
              </div>
              <span className="sm-status-pill">Real product screen</span>
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
            <p className="sm-kicker text-[var(--sm-accent)]">Start here</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Choose the first job to fix.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Each product does one job clearly. Open the product, see the workflow, then decide if you want that same system adapted to your company.
          </p>
        </div>
        <div className="mt-8 grid gap-6 xl:grid-cols-3">
          {featuredProducts.map((product) => (
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
                <p className="sm-kicker text-[var(--sm-accent)]">{product.eyebrow}</p>
                <span className="sm-status-pill">Live product</span>
              </div>
              <h3 className="mt-4 text-2xl font-bold">{product.name}</h3>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/45">Best for {product.audience}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={product.proofTool.route}>
                  Open product
                </Link>
                <Link className="sm-link" to={contactLink(product.name)}>
                  Start with this product
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open one product or start rollout.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The goal is not to understand the whole platform. The goal is to pick one painful workflow and make it work.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Start rollout
          </Link>
          <Link className="sm-button-secondary" to="/products">
            See products and templates
          </Link>
        </div>
      </section>
    </div>
  )
}
