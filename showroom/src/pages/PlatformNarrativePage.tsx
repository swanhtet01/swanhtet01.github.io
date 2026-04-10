import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'
import { YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'

const enterpriseHighlights = [
  {
    name: 'One branded workspace',
    detail: 'Sales, operations, managers, and clients work in one portal instead of across separate tools.',
  },
  {
    name: 'Connected data',
    detail: 'Bring in Gmail, Drive, Sheets, CSV, uploaded files, ERP exports, and other existing sources first.',
  },
  {
    name: 'Enterprise basics included',
    detail: 'Roles, approvals, audit history, and customer-specific workspaces ship with the rollout.',
  },
] as const

const rolloutSteps = [
  'Pick the first workflow to fix.',
  'Import the current data and files.',
  'Give one team one live screen.',
  'Add roles, approvals, and history.',
  'Expand into a larger system only after the first workflow works.',
] as const

const securityPoints = [
  'Role-based access for each team and customer.',
  'Approval gates on sensitive actions.',
  'Audit history on imports, edits, and workflow changes.',
  'Customer workspace separation by company or site.',
] as const

const caseStudyPoints = [
  'Sales, operations, quality, maintenance, CEO review, and admin use one portal.',
  'The portal is built from the same product templates shown on this site.',
  'The first rollout starts with one useful workflow, then expands module by module.',
] as const

export function PlatformNarrativePage() {
  return (
    <div className="space-y-8 pb-12">
      <PageIntro
        eyebrow="Enterprise rollout"
        title="Roll out one system, not another tool stack."
        description="SUPERMEGA.dev starts with a working product, then expands into a branded customer portal with connected data, roles, approvals, and audit history."
      />

      <section className="grid gap-4 md:grid-cols-3">
        {enterpriseHighlights.map((item) => (
          <article className="sm-proof-card" key={item.name}>
            <p className="font-semibold text-white">{item.name}</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Working products</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Start from a live product.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are the current products clients can start with today. Each one can stay focused or grow into a larger customer portal.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {STARTER_PACK_DETAILS.map((product) => (
            <article className="sm-proof-card" key={product.id}>
              <p className="font-semibold text-white">{product.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-link" to={product.proofTool.route}>
                  Open product
                </Link>
                <Link className="sm-link" to={`/products/${product.slug}`}>
                  See product
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">First rollout</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Keep the first launch small and useful.</h2>
          <div className="mt-6 space-y-3">
            {rolloutSteps.map((step, index) => (
              <div className="sm-site-point" key={step}>
                <span className="sm-site-point-dot" />
                <span>{index + 1}. {step}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Security and control</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Enterprise basics are part of the rollout.</h2>
          <div className="mt-6 grid gap-3">
            {securityPoints.map((point) => (
              <article className="sm-chip text-white" key={point}>
                <p className="font-semibold">{point}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
          <article>
            <p className="sm-kicker text-[var(--sm-accent)]">Customer example</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">{YANGON_TYRE_MODEL.domain}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              Yangon Tyre is the first named client portal. It shows how the same product base becomes one customer-specific system.
            </p>
            <div className="mt-6 space-y-3">
              {caseStudyPoints.map((point) => (
                <div className="sm-site-point" key={point}>
                  <span className="sm-site-point-dot" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Portal scope</p>
            <div className="mt-4 space-y-3 text-sm text-white/80">
              <p>Modules: {YANGON_TYRE_MODEL.modules.length}</p>
              <p>Roles: {YANGON_TYRE_MODEL.roles.length}</p>
              <p>Connectors: {YANGON_TYRE_MODEL.connectors.length}</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/clients/yangon-tyre">
                Open case study
              </Link>
              <Link className="sm-button-secondary" to="/contact">
                Start rollout
              </Link>
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}
