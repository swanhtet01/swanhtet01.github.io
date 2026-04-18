import { Link } from 'react-router-dom'

import { trackEvent } from '../lib/analytics'
import { STARTER_PACK_DETAILS, type StarterPackDetail } from '../lib/salesControl'
import { SOFTWARE_MODULE_DETAILS, type SoftwareModuleDetail } from '../lib/softwareCatalog'
import { getTenantConfig } from '../lib/tenantConfig'
import { YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'

const screenshotSize = {
  width: 1440,
  height: 1024,
} as const

const publicTemplateImageMap: Record<string, string> = {
  'sales-system': '/site/sales-desk.svg',
  'operations-inbox': '/site/ops-desk.svg',
  'client-portal': '/site/client-portal.svg',
}

const featuredTemplateIds = ['sales-system', 'operations-inbox', 'client-portal'] as const
const featuredTemplates = SOFTWARE_MODULE_DETAILS.filter((item: SoftwareModuleDetail) =>
  featuredTemplateIds.includes(item.id as (typeof featuredTemplateIds)[number]),
)

const rolloutSteps = [
  {
    title: 'Start with one live product',
    detail: 'Pick Find Clients, Company List, or Receiving Control for the first painful workflow.',
  },
  {
    title: 'Add the right template',
    detail: 'Expand into a sales portal, operations portal, or client portal after the first screen works.',
  },
  {
    title: 'Roll it out to the client',
    detail: 'Brand it, import current data, add roles, approvals, and history, then keep improving.',
  },
] as const

const yangonTyreHighlights = [
  'One customer portal for sales, operations, quality, maintenance, management, and admin.',
  'Connects Gmail, Drive, Calendar, ERP exports, forms, and uploaded files.',
  'Built from reusable templates instead of a one-off custom stack.',
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
        <div className="grid gap-8 xl:grid-cols-[0.84fr_1.16fr] xl:items-center">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">SUPERMEGA.dev</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Company software that starts useful on day one.</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Start with a real product for sales, company data, or receiving. Then expand it into a branded portal for the client or team that needs more.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">Live products</span>
              <span className="sm-status-pill">Reusable templates</span>
              <span className="sm-status-pill">Customer rollouts</span>
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
                <p className="sm-kicker text-[var(--sm-accent)]">Live now</p>
                <p className="mt-2 text-lg font-semibold text-white">Company List</p>
              </div>
              <span className="sm-status-pill">Structured list</span>
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
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Import</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Gmail, Drive, Sheets, CSV, CRM export</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Use</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Assign owners, track stages, keep next steps visible</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Expand</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Turn it into a full sales or client portal later</p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live products</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">Start with a product that already works.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are the current starting points. Each one solves a narrow job first, then expands into a broader customer system.
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
                <p className="sm-kicker text-[var(--sm-accent)]">Live now</p>
                <span className="sm-status-pill">{product.launchWindow}</span>
              </div>
              <h3 className="mt-4 text-2xl font-bold">{product.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
              <div className="mt-4 space-y-3">
                {product.problemsSolved.slice(0, 2).map((item) => (
                  <div className="sm-site-point" key={item}>
                    <span className="sm-site-point-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/products/${product.slug}`}>
                  See product
                </Link>
                <Link className="sm-link" to={contactLink(product.name)}>
                  Start rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Portal templates</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">When the first workflow works, expand into a full portal.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are structured rollouts, not prototypes. They reuse the same product base, then adapt the roles, inputs, and screens for the customer.
          </p>
        </div>
        <div className="mt-8 grid gap-6 xl:grid-cols-3">
          {featuredTemplates.map((template) => (
            <article className="sm-pack-card overflow-hidden p-4 text-white" key={template.id}>
              <img
                alt={`${template.name} template preview`}
                className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-center"
                decoding="async"
                height={screenshotSize.height}
                loading="lazy"
                src={publicTemplateImageMap[template.id]}
                width={screenshotSize.width}
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="sm-kicker text-[var(--sm-accent)]">Template</p>
                <span className="sm-status-pill">{template.status}</span>
              </div>
              <h3 className="mt-4 text-2xl font-bold">{template.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{template.promise}</p>
              <p className="mt-4 text-sm text-white/80">Includes: {template.surfaces.slice(0, 3).join(' · ')}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/products/${template.id}`}>
                  See template
                </Link>
                <Link className="sm-link" to="/clients/yangon-tyre">
                  See case study
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Case study</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Yangon Tyre is the first named client portal.</h2>
          <img
            alt="Yangon Tyre client portal"
            className="mt-6 aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
            decoding="async"
            height={screenshotSize.height}
            loading="lazy"
            src="/site/receiving-control-live.png"
            width={screenshotSize.width}
          />
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
            <Link className="sm-button-secondary" to="/contact">
              Start similar rollout
            </Link>
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">How rollout works</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Keep the path short and useful.</h2>
          <div className="mt-6 grid gap-3">
            {rolloutSteps.map((step) => (
              <article className="sm-proof-card" key={step.title}>
                <p className="font-semibold text-white">{step.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{step.detail}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
              <p className="mt-2 text-3xl font-bold">{YANGON_TYRE_MODEL.modules.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Roles</p>
              <p className="mt-2 text-3xl font-bold">{YANGON_TYRE_MODEL.roles.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Connectors</p>
              <p className="mt-2 text-3xl font-bold">{YANGON_TYRE_MODEL.connectors.length}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Choose the first workflow and start rollout.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/products">
            See products
          </Link>
          <Link className="sm-button-secondary" to="/contact">
            Start rollout
          </Link>
        </div>
      </section>
    </div>
  )
}
