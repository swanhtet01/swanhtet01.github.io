import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { STARTER_PACK_DETAILS, type StarterPackDetail } from '../lib/salesControl'
import { SOFTWARE_MODULE_DETAILS, type SoftwareModuleDetail } from '../lib/softwareCatalog'
import { YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'

const supportedInputs = ['Gmail', 'Google Drive', 'Google Sheets', 'Google Calendar', 'CSV / Excel', 'ERP / CRM exports', 'Uploaded documents'] as const

const rolloutSteps = [
  {
    name: 'Pick one job',
    detail: 'Start with one workflow that already wastes time today.',
  },
  {
    name: 'Connect the current stack',
    detail: 'Bring in the inboxes, files, sheets, exports, and documents people already use.',
  },
  {
    name: 'Go live for one team',
    detail: 'Give one team one working desk, then expand only after it is trusted.',
  },
] as const

const firstDayOutcomes = [
  {
    title: 'One record',
    detail: 'Emails, files, rows, and manual updates stay attached to the same account, request, or issue.',
  },
  {
    title: 'One queue',
    detail: 'The right team gets one owned board instead of chasing messages across tools.',
  },
  {
    title: 'One control layer',
    detail: 'Roles, approvals, and audit history stay on the same system from day one.',
  },
] as const

const starterExamples: StarterPackDetail[] = STARTER_PACK_DETAILS.slice(0, 3)

const fullSolutionIds = ['sales-system', 'operations-inbox', 'client-portal'] as const
const fullSolutions: SoftwareModuleDetail[] = SOFTWARE_MODULE_DETAILS.filter((item: SoftwareModuleDetail) =>
  fullSolutionIds.includes(item.id as (typeof fullSolutionIds)[number]),
)

const rolePreview = YANGON_TYRE_MODEL.roles.slice(0, 6).map((item) => item.name)
const connectorPreview = Array.from(
  new Set([...supportedInputs, ...YANGON_TYRE_MODEL.connectors.slice(0, 4).map((item) => item.name)]),
).slice(0, 8)

function rolloutLink(name: string) {
  return `/contact?package=${encodeURIComponent(name)}`
}

export function PlatformNarrativePage() {
  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="How it works"
        title="Connect the stack you already use."
        description="We start with one live workflow, connect the current inputs, and expand only after the first team trusts the system."
      />

      <section className="sm-site-panel">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <article>
            <p className="sm-kicker text-[var(--sm-accent)]">Start here</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">One workflow. One team. One connected system.</h2>
            <div className="mt-6 space-y-3">
              {rolloutSteps.map((step) => (
                <div className="sm-site-point" key={step.name}>
                  <span className="sm-site-point-dot" />
                  <span>
                    <strong>{step.name}:</strong> {step.detail}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/contact">
                Start rollout
              </Link>
              <Link className="sm-button-secondary" to="/products">
                See products
              </Link>
              <Link className="sm-button-secondary" to="/packages">
                See packages
              </Link>
            </div>
          </article>

          <article className="overflow-hidden rounded-[1.45rem] border border-white/10 bg-[#040b16]">
            <img alt="SUPERMEGA Find Clients live workspace" className="h-auto w-full object-cover object-top" loading="eager" src="/site/find-clients-live.png" />
            <div className="grid gap-3 border-t border-white/8 p-4 md:grid-cols-2">
              <article className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Supported inputs</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Start with the inboxes, drives, sheets, exports, and uploaded files the team already has.</p>
              </article>
              <article className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Built-in controls</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Keep role scope, approvals, and history inside the same workflow from the first launch.</p>
              </article>
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Supported inputs</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Import first. Rebuild later only if it earns it.</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {connectorPreview.map((item) => (
              <span className="sm-status-pill" key={item}>
                {item}
              </span>
            ))}
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            The first rollout connects to current systems so the team can adopt the product without re-entering everything on day one.
          </p>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">What changes first</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Give one team one place to work.</h2>
          <div className="mt-6 grid gap-3">
            {firstDayOutcomes.map((item) => (
              <article className="sm-chip text-white" key={item.title}>
                <p className="sm-kicker text-[var(--sm-accent)]">{item.title}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Common starting points</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the first three live rollouts.</h2>
          </div>
          <Link className="sm-link" to="/products">
            Review all product pages
          </Link>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {starterExamples.map((product) => (
            <article className="sm-proof-card" key={product.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white">{product.name}</p>
                <span className="sm-status-pill">{product.launchWindow}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.promise}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {product.integrations.slice(0, 4).map((item) => (
                  <span className="sm-status-pill" key={`${product.id}-${item}`}>
                    {item}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm text-white/80">First outcome: {product.launchDeliverables[0] ?? product.problemsSolved[0]}</p>
              <p className="mt-2 text-sm text-white/80">Expands into: {product.expandsTo.slice(0, 2).join(' · ')}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-link" to={`/products/${product.slug}`}>
                  View product
                </Link>
                <Link className="sm-link" to={rolloutLink(product.name)}>
                  Start rollout
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
          <article>
            <p className="sm-kicker text-[var(--sm-accent)]">Case study</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">{YANGON_TYRE_MODEL.domain}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              Yangon Tyre shows how the same base can expand into a full client portal with role-based workspaces, connected records, and leadership visibility.
            </p>
            <div className="mt-6 space-y-3">
              {[
                'Sales, operations, quality, maintenance, and leadership share the same operating system.',
                'The current stack feeds one role-based portal instead of separate tools and file loops.',
                'The first product can expand into a broader company system without restarting from scratch.',
              ].map((point) => (
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
              <Link className="sm-button-secondary" to={rolloutLink('Yangon Tyre portal')}>
                Start similar rollout
              </Link>
            </div>
          </article>

          <div className="space-y-4">
            <article className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#040b16] p-4">
              <img alt="Yangon Tyre client portal preview" className="h-auto w-full object-cover object-top" loading="lazy" src="/site/client-portal.svg" />
            </article>

            <article className="sm-terminal p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Roles and full-system modules</p>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--sm-muted)]">Roles</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {rolePreview.map((role) => (
                    <span className="sm-status-pill" key={role}>
                      {role}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--sm-muted)]">Full-system modules</p>
                <div className="mt-3 grid gap-3">
                  {fullSolutions.map((item) => (
                    <div className="sm-chip text-white" key={item.id}>
                      <p className="font-semibold text-white">{item.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Choose the first rollout, then scale on the same base.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/contact">
            Start rollout
          </Link>
          <Link className="sm-button-secondary" to="/products">
            Review products
          </Link>
          <Link className="sm-button-secondary" to="/packages">
            Review packages
          </Link>
        </div>
      </section>
    </div>
  )
}
