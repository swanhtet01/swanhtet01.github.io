import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'
import { SOFTWARE_MODULE_DETAILS } from '../lib/softwareCatalog'
import { YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'

function contactLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

const screenshotSize = {
  width: 1440,
  height: 1024,
} as const

const rolloutTemplates = SOFTWARE_MODULE_DETAILS.filter((item) => item.status === 'Rollout module')
const controlLayers = SOFTWARE_MODULE_DETAILS.filter((item) => item.status === 'Control layer')

const rolloutIncludes = [
  'One named workflow',
  'Current data imported',
  'Roles, approvals, and history',
  'One live team screen',
] as const

const ytfPortalLanes = [
  {
    name: 'Sales workspace',
    detail: 'Dealer accounts, visit plans, follow-up, and commercial history in one CRM.',
  },
  {
    name: 'Operations workspace',
    detail: 'Receiving, supplier recovery, inventory pressure, quality, and maintenance in one operating lane.',
  },
  {
    name: 'CEO and admin workspace',
    detail: 'Decision review, connector posture, policies, and tenant setup in one control layer.',
  },
] as const

export function ProductsPage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Products"
        title="Live products first. More systems behind them."
        description="These are not placeholder demos. The first row is live product workspaces you can open now. The rest are rollout templates and control layers already defined in the platform."
      />

      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live now</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the current entry products.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Each one solves one clear job and can be the starting point for a larger rollout.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          {STARTER_PACK_DETAILS.map((product) => (
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
                <span className="sm-status-pill">Ready now</span>
              </div>
              <h2 className="mt-4 text-2xl font-bold">{product.name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/45">Best for {product.audience}</p>
              <div className="mt-4 space-y-2">
                {product.problemsSolved.slice(0, 2).map((item) => (
                  <div className="sm-site-point text-sm" key={item}>
                    <span className="sm-site-point-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-2">
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Uses</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.integrations.join(', ')}</p>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Includes</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.starterModules.join(' + ')}</p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={product.proofTool.route}>
                  Open product
                </Link>
                <Link className="sm-button-secondary" to={`/products/${product.slug}`}>
                  See full setup
                </Link>
                <Link className="sm-link" to={contactLink(product.name)}>
                  Start with this product
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Rollout templates</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the broader systems behind the entry products.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Use these when the client needs a full system, not only the first wedge.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {rolloutTemplates.map((module) => (
            <article className="sm-demo-link sm-demo-link-card" key={module.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{module.category}</span>
                <span className="sm-status-pill">Rollout template</span>
              </div>
              <strong>{module.name}</strong>
              <span>{module.summary}</span>
              <small className="text-[var(--sm-muted)]">Best for: {module.audience}</small>
              <small className="text-[var(--sm-muted)]">Includes: {module.surfaces.slice(0, 3).join(', ')}</small>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={`/products/${module.id}`}>
                  See template
                </Link>
                <Link className="sm-button-secondary" to={contactLink(module.name)}>
                  Use in rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Named client portal</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Yangon Tyre shows how the products become one full tenant system.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The first real client rollout combines {YANGON_TYRE_MODEL.modules.length} modules, {YANGON_TYRE_MODEL.roles.length} roles, and{' '}
            {YANGON_TYRE_MODEL.connectors.length} connectors on one portal.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {ytfPortalLanes.map((lane) => (
            <article className="sm-proof-card" key={lane.name}>
              <p className="font-semibold text-white">{lane.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{lane.detail}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/clients/yangon-tyre">
            Open Yangon Tyre portal
          </Link>
          <Link className="sm-button-secondary" to="/app/platform-admin">
            Open tenant admin
          </Link>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Control and intelligence</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These layers add value after the workflow is live.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are not separate fake apps. They are layers on the same system.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {controlLayers.map((module) => (
            <article className="sm-demo-link sm-demo-link-card" key={module.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{module.category}</span>
                <span className="sm-status-pill">{module.status}</span>
              </div>
              <strong>{module.name}</strong>
              <span>{module.summary}</span>
              <small className="text-[var(--sm-muted)]">{module.promise}</small>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link className="sm-link" to={`/products/${module.id}`}>
                  See layer
                </Link>
                <Link className="sm-link" to={contactLink(module.name)}>
                  Add to rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">What ships first</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Start from one product. Roll into a full system only if it adds value.</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            {rolloutIncludes.map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Start rollout
          </Link>
          <Link className="sm-button-secondary" to="/platform">
            See enterprise setup
          </Link>
        </div>
      </section>
    </div>
  )
}
