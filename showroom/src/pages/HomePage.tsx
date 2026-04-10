import { Link } from 'react-router-dom'

import { enterpriseSignals, hero, ytfDeployment } from '../content'
import { trackEvent } from '../lib/analytics'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'
import { getTenantConfig } from '../lib/tenantConfig'

const heroSignals = [
  {
    label: 'Live demos',
    value: '3 working products',
  },
  {
    label: 'Connected data',
    value: 'Gmail, Drive, Sheets, CSV, API',
  },
  {
    label: 'Enterprise layer',
    value: 'Roles, approvals, history, tenant scope',
  },
] as const

const rolloutSteps = [
  'Pick one workflow that is still stuck in inboxes, sheets, or manual chasing.',
  'Bring the current data and team into one clear screen with owners and next steps.',
  'Add approvals, automation, and more modules only after the first workflow works.',
] as const

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
    <div className="space-y-14 pb-16">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.88fr_1.12fr] xl:items-center">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">{hero.eyebrow}</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">One working system for sales and operations.</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{hero.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" onClick={() => trackEvent('offer_open_click', { offer: 'Products overview' })} to="/products">
                Open product demos
              </Link>
              <Link className="sm-button-secondary" onClick={() => trackEvent('contact_open_click', { source: 'home_hero' })} to="/contact">
                Start rollout
              </Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {heroSignals.map((item) => (
                <article className="sm-chip text-white" key={item.label}>
                  <p className="sm-kicker text-[var(--sm-accent)]">{item.label}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.value}</p>
                </article>
              ))}
            </div>
          </div>

          <article className="sm-surface-deep p-4 lg:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Live demo</p>
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
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {featuredProducts.map((product) => (
                <article className="sm-chip text-white" key={product.id}>
                  <p className="font-semibold">{product.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.problemsSolved[0]}</p>
                </article>
              ))}
            </div>
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
            Each product does one job clearly. Open the demo, see the workflow, then decide if you want that same system adapted to your company.
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
                <span className="sm-status-pill">Live demo</span>
              </div>
              <h3 className="mt-4 text-2xl font-bold">{product.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
              <div className="mt-4 space-y-2">
                {product.problemsSolved.slice(0, 2).map((item) => (
                  <div className="sm-site-point text-sm" key={item}>
                    <span className="sm-site-point-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={product.proofTool.route}>
                  Open demo
                </Link>
                <Link className="sm-button-secondary" to={contactLink(product.name)}>
                  Get rollout plan
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">How rollout works</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Keep the first project short and concrete.</h2>
          <div className="mt-6 space-y-3">
            {rolloutSteps.map((step, index) => (
              <div className="sm-site-point" key={step}>
                <span className="sm-site-point-dot" />
                <span>{index + 1}. {step}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What ships first</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              'One live screen for the working team',
              'Imported data from current tools',
              'Clear owners and next actions',
              'Roles, approvals, and history',
            ].map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-relaxed text-[var(--sm-muted)]">
            Common starting inputs: Gmail, Google Drive, Sheets, CSV exports, uploaded files, ERP exports, and APIs.
          </p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Enterprise foundation</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The demos sit on a real company-system base.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {enterpriseSignals.slice(0, 4).map((item) => (
              <article className="sm-demo-link sm-demo-link-card" key={item.name}>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Example deployment</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">{ytfDeployment.domain}</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{ytfDeployment.summary}</p>
          <div className="mt-5 grid gap-3">
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{ytfDeployment.modules.join(', ')}</p>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Data sources</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{ytfDeployment.dataSources.join(', ')}</p>
            </article>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/platform">
              See enterprise setup
            </Link>
            <Link className="sm-button-secondary" to="/contact">
              Start rollout
            </Link>
          </div>
        </article>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open a demo, then bring the first workflow to fix.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            We will map the product, data sources, roles, and rollout order around a real problem instead of a vague transformation plan.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/products">
            Open product demos
          </Link>
          <Link className="sm-button-secondary" to="/contact">
            Start rollout
          </Link>
        </div>
      </section>
    </div>
  )
}
