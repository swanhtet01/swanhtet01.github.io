import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { SOFTWARE_MODULE_DETAILS, getAgentTeamDetails, type SoftwareModuleDetail } from '../lib/softwareCatalog'

type PackageOfferDefinition = {
  id: string
  name: string
  fit: string
  summary: string
  expandsTo: string
  moduleIds: string[]
  primaryModuleId: string
}

type PackageOffer = PackageOfferDefinition & {
  agentTeamNames: string[]
  modules: SoftwareModuleDetail[]
  primaryModule: SoftwareModuleDetail | null
  replaces: string[]
}

const PACKAGE_OFFER_DEFINITIONS: PackageOfferDefinition[] = [
  {
    id: 'revenue-system-package',
    name: 'Revenue System Package',
    fit: 'Owner-led distributors, branch sales teams, and commercial operators still working from CRM fragments, inboxes, and sheets.',
    summary: 'Ship one commercial operating layer for prospecting, follow-up, quoting, and leadership review before expanding into broader account delivery.',
    expandsTo: 'Expands into Client Portal and Director Command Center once the sales desk is used every day.',
    moduleIds: ['sales-system', 'decision-journal', 'founder-brief', 'agent-runtime'],
    primaryModuleId: 'sales-system',
  },
  {
    id: 'operations-control-package',
    name: 'Operations Control Package',
    fit: 'Warehouse, service, procurement, and branch teams that need one owned queue for requests, approvals, files, and exceptions.',
    summary: 'Start with a control desk that turns operational noise into assigned work, governed approvals, and visible escalation.',
    expandsTo: 'Expands into Supplier Portal and Director Command Center when more sites or vendors join the same workflow.',
    moduleIds: ['operations-inbox', 'document-intelligence', 'approval-policy-engine', 'decision-journal'],
    primaryModuleId: 'operations-inbox',
  },
  {
    id: 'industrial-quality-package',
    name: 'Industrial Quality Package',
    fit: 'Plants, maintenance teams, and industrial operators that already work with fishbone, 5W1H, CAPA, KPI review, and management gap analysis.',
    summary: 'Build the ERP-quality core around actual operating methods instead of generic forms, then add analytics and multi-site leadership review.',
    expandsTo: 'Expands into Data Science Studio and broader multi-site oversight as the operating history becomes rich enough to model.',
    moduleIds: ['industrial-dqms', 'manager-operating-system', 'knowledge-graph', 'data-science-studio', 'director-command-center'],
    primaryModuleId: 'industrial-dqms',
  },
  {
    id: 'portal-network-package',
    name: 'Portal Network Package',
    fit: 'Companies that need branded workspaces for clients or suppliers with files, requests, approvals, onboarding, and role-based access.',
    summary: 'Launch the client-facing or supplier-facing system on the same memory and control base as the rest of the rollout so the portal does real operating work.',
    expandsTo: 'Expands into Support and Service Desk and deeper tenant rollout once each external workspace has stable volume.',
    moduleIds: ['client-portal', 'supplier-portal', 'tenant-control-plane', 'document-intelligence'],
    primaryModuleId: 'client-portal',
  },
]

function contactLink(packageName: string) {
  return `/contact?package=${encodeURIComponent(packageName)}`
}

function requestedPackageFromQuery() {
  if (typeof window === 'undefined') {
    return ''
  }
  return new URLSearchParams(window.location.search).get('package')?.trim() ?? ''
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function splitReplaces(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const PACKAGE_OFFERS: PackageOffer[] = PACKAGE_OFFER_DEFINITIONS.map((offer) => {
  const modules = offer.moduleIds
    .map((moduleId) => SOFTWARE_MODULE_DETAILS.find((item) => item.id === moduleId))
    .filter((item): item is SoftwareModuleDetail => Boolean(item))
  const primaryModule = modules.find((item) => item.id === offer.primaryModuleId) ?? modules[0] ?? null
  const agentTeamNames = getAgentTeamDetails(unique(modules.flatMap((item) => item.agentTeams))).map((team) => team.name)
  const replaces = unique(modules.flatMap((item) => splitReplaces(item.replaces))).slice(0, 4)

  return {
    ...offer,
    agentTeamNames,
    modules,
    primaryModule,
    replaces,
  }
})

const standardBase = [
  'Shared auth, role mapping, approvals, and audit history',
  'Connector control for Gmail, Drive, Sheets, uploads, and ERP exports',
  'Reusable module templates and rollout order',
  'Runtime, security, rollout, and agent operations on the same base',
] as const

const configurableBase = [
  'Which package and lead module go live first',
  'Which roles and workspaces each team sees',
  'Which data sources and folders get mapped',
  'Whether the rollout starts with a team workspace, client portal, or both',
] as const

function resolveRequestedOffer(requestedPackage: string) {
  const query = normalizeKey(requestedPackage)
  if (!query) {
    return null
  }

  return (
    PACKAGE_OFFERS.find((offer) => {
      const keys = [
        offer.id,
        offer.name,
        offer.primaryModule?.id ?? '',
        offer.primaryModule?.name ?? '',
        ...offer.modules.map((item) => item.id),
        ...offer.modules.map((item) => item.name),
      ]

      return keys.some((key) => {
        const normalizedKey = normalizeKey(key)
        return normalizedKey === query || normalizedKey.includes(query) || query.includes(normalizedKey)
      })
    }) ?? null
  )
}

export function PackagesPage() {
  const requestedPackage = requestedPackageFromQuery()
  const requestedOffer = resolveRequestedOffer(requestedPackage)

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Packages"
        title="Choose the package that matches the buying pain."
        description="Each package starts with one live operating result. Add more modules only after that first result is in daily use."
      />

      {requestedOffer ? (
        <section className="sm-site-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Requested package</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">{requestedOffer.name}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                Best for: {requestedOffer.fit}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={contactLink(requestedOffer.name)}>
                Request rollout
              </Link>
              <Link className="sm-button-secondary" to={`/products/${requestedOffer.primaryModule?.id ?? ''}`}>
                Review lead module
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        {PACKAGE_OFFERS.map((offer) => (
          <article className="sm-pack-card p-6 text-white" key={offer.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Package</p>
                <h2 className="mt-3 text-3xl font-bold text-white">{offer.name}</h2>
              </div>
              <span className="sm-status-pill">{offer.modules.length} modules</span>
            </div>

            <div className="mt-6 grid gap-4">
              <div>
                <p className="sm-kicker text-white/70">Best for</p>
                <p className="mt-2 text-sm leading-relaxed text-white/85">{offer.fit}</p>
              </div>

              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">First live outcome</p>
                <p className="mt-2 text-sm">{offer.summary}</p>
              </div>

              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Ships first</p>
                <p className="mt-2 text-base font-semibold">{offer.primaryModule?.name ?? offer.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Then expand into {offer.expandsTo.replace(/^Expands into /, '').replace(/\.$/, '')}.</p>
              </div>

              <div>
                <p className="sm-kicker text-white/70">Included modules</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {offer.modules.map((module) => (
                    <Link className="sm-chip text-white" key={module.id} to={`/products/${module.id}`}>
                      {module.name}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="text-sm text-white/80">Replaces: {offer.replaces.join(' · ')}</div>
              <div className="text-sm text-white/80">Automation included: {offer.agentTeamNames.join(' · ')}</div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={contactLink(offer.name)}>
                Request rollout
              </Link>
              <Link className="sm-button-secondary" to={`/products/${offer.primaryModule?.id ?? ''}`}>
                Review lead module
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Always included</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The platform base stays standard.</h2>
          <div className="mt-6 space-y-3">
            {standardBase.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Configured per client</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The rollout shape changes with the client.</h2>
          <div className="mt-6 space-y-3">
            {configurableBase.map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Pick the package that matches the pain. Start the first rollout.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to={requestedOffer ? contactLink(requestedOffer.name) : '/contact'}>
            Request rollout
          </Link>
          <Link className="sm-button-secondary" to="/products">
            Review products
          </Link>
        </div>
      </section>
    </div>
  )
}
