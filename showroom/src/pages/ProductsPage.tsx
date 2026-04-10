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

const featuredTemplateIds = ['sales-system', 'operations-inbox', 'client-portal', 'supplier-portal'] as const
const featuredTemplates: SoftwareModuleDetail[] = SOFTWARE_MODULE_DETAILS.filter((item: SoftwareModuleDetail) =>
  featuredTemplateIds.includes(item.id as (typeof featuredTemplateIds)[number]),
)

const builtInLayerIds = ['decision-journal', 'document-intelligence', 'approval-policy-engine'] as const
const builtInLayers: SoftwareModuleDetail[] = SOFTWARE_MODULE_DETAILS.filter((item: SoftwareModuleDetail) =>
  builtInLayerIds.includes(item.id as (typeof builtInLayerIds)[number]),
)

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
    name: 'CEO and admin workspace',
    detail: 'Decision review, approvals, connector posture, and tenant setup in one control layer.',
  },
] as const

export function ProductsPage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Products"
        title="Working products and structured templates."
        description="Start with a live product. If it works, expand it into a full system or client portal."
      />

      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live products</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Open these now.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are the current working entry points. They are the start of the system, not fake demos.
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
                <p className="sm-kicker text-[var(--sm-accent)]">Live product</p>
                <span className="sm-status-pill">Open now</span>
              </div>
              <h2 className="mt-4 text-2xl font-bold">{product.name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
              <p className="mt-4 text-sm text-white/80">Starts with: {product.starterModules.join(' + ')}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={product.proofTool.route}>
                  Open product
                </Link>
                <Link className="sm-link" to={`/products/${product.slug}`}>
                  See setup
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Structured templates</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Use the same base in a bigger rollout.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are reusable systems for sales, operations, client portals, and supplier portals.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {featuredTemplates.map((module: SoftwareModuleDetail) => (
            <article className="sm-proof-card" key={module.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{module.category}</span>
                <span className="sm-status-pill">Template</span>
              </div>
              <p className="mt-4 text-xl font-semibold text-white">{module.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{module.summary}</p>
              <p className="mt-4 text-sm text-white/80">Includes: {module.surfaces.slice(0, 3).join(' · ')}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/products/${module.id}`}>
                  See template
                </Link>
                <Link className="sm-link" to={contactLink(module.name)}>
                  Start rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Case study</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Yangon Tyre is the first full client portal.</h2>
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
              Open case study
            </Link>
            <Link className="sm-button-secondary" to="/products/client-portal">
              Open client portal template
            </Link>
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Built in</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These layers come with the system.</h2>
          <div className="mt-6 grid gap-3">
            {builtInLayers.map((module: SoftwareModuleDetail) => (
              <article className="sm-chip text-white" key={module.id}>
                <p className="font-semibold">{module.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{module.summary}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open a product, a template, or the case study.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/find-companies">
            Open a live product
          </Link>
          <Link className="sm-button-secondary" to="/clients/yangon-tyre">
            See case study
          </Link>
          <Link className="sm-button-secondary" to="/contact">
            Start rollout
          </Link>
        </div>
      </section>
    </div>
  )
}
