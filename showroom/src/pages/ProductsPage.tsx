import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { STARTER_PACK_DETAILS, type StarterPackDetail } from '../lib/salesControl'
import { SOFTWARE_MODULE_DETAILS, type SoftwareModuleDetail } from '../lib/softwareCatalog'
import { YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

const screenshotSize = {
  width: 1440,
  height: 1024,
} as const

const featuredTemplateIds = ['sales-system', 'operations-inbox', 'client-portal', 'industrial-dqms'] as const
const featuredTemplates: SoftwareModuleDetail[] = SOFTWARE_MODULE_DETAILS.filter((item: SoftwareModuleDetail) =>
  featuredTemplateIds.includes(item.id as (typeof featuredTemplateIds)[number]),
)

const templateImageMap: Record<string, string> = {
  'sales-system': '/site/sales-desk.svg',
  'operations-inbox': '/site/ops-desk.svg',
  'client-portal': '/site/client-portal.svg',
  'industrial-dqms': '/site/control-room.svg',
}

const caseStudyLanes = [
  {
    name: 'Sales workspace',
    detail: 'Accounts, visit plans, follow-up, and commercial notes in one place.',
  },
  {
    name: 'Operations workspace',
    detail: 'Receiving, supplier issues, quality, maintenance, and inventory in one queue.',
  },
  {
    name: 'Management workspace',
    detail: 'Decision review, approvals, and company-wide oversight in one place.',
  },
] as const

const rolloutIncludes = ['Role-based access', 'Imported current data', 'Approval steps', 'Audit history'] as const

export function ProductsPage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Products"
        title="Live products first. Templates after that."
        description="Start with one real workflow now, then expand it into a structured portal for sales, operations, clients, or management."
      />

      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live products</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are real starting points, not placeholders.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Use one of these when the team has one painful job that needs a working screen immediately.
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
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
                <span className="sm-status-pill">{product.audience}</span>
              </div>
              <p className="mt-4 text-2xl font-semibold text-white">{product.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
              <p className="mt-4 text-sm text-white/80">Inputs: {product.integrations.slice(0, 4).join(' · ')}</p>
              <p className="mt-2 text-sm text-white/80">Includes: {product.starterModules.join(' + ')}</p>
              <div className="mt-5 flex flex-wrap gap-3">
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
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These templates turn one product into a fuller customer system.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Use these when the client needs more roles, more screens, or a branded portal around the first workflow.
          </p>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {featuredTemplates.map((template) => (
            <article className="sm-pack-card overflow-hidden p-4 text-white" key={template.id}>
              <img
                alt={`${template.name} template preview`}
                className="aspect-[16/10] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-center"
                decoding="async"
                height={screenshotSize.height}
                loading="lazy"
                src={templateImageMap[template.id]}
                width={screenshotSize.width}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">Template</span>
                <span className="sm-status-pill">{template.status}</span>
              </div>
              <p className="mt-4 text-xl font-semibold text-white">{template.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{template.promise}</p>
              <p className="mt-4 text-sm text-white/80">Used by: {template.audience}</p>
              <p className="mt-2 text-sm text-white/80">Screens: {template.surfaces.slice(0, 3).join(' · ')}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/products/${template.id}`}>
                  See template
                </Link>
                <Link className="sm-link" to={contactLink(template.name)}>
                  Start rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">What every rollout includes</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The customer system is structured from the start.</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {rolloutIncludes.map((item) => (
              <article className="sm-chip text-white" key={item}>
                <p className="font-semibold">{item}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Case study</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Yangon Tyre is the first named client portal.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            One client portal combines {YANGON_TYRE_MODEL.modules.length} modules, {YANGON_TYRE_MODEL.roles.length} roles, and{' '}
            {YANGON_TYRE_MODEL.connectors.length} connectors.
          </p>
          <div className="mt-6 space-y-3">
            {caseStudyLanes.map((lane) => (
              <div className="sm-site-point" key={lane.name}>
                <span className="sm-site-point-dot" />
                <span>
                  <strong>{lane.name}:</strong> {lane.detail}
                </span>
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
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Pick the first product or ask for a customer rollout.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Start rollout
          </Link>
          <Link className="sm-button-secondary" to="/clients/yangon-tyre">
            Read case study
          </Link>
        </div>
      </section>
    </div>
  )
}
