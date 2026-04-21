import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import type { RuntimeControlPayload } from '../lib/runtimeControlApi'
import { DATA_SCIENCE_LANES, PLATFORM_TEAM_BLUEPRINTS, PRODUCT_BLUEPRINT_MODULES } from '../lib/aiNativeProductModel'
import { CLOUD_DEPLOYMENT_PATTERNS, SELLABLE_WORKSPACE_PROGRAMS, WORKFORCE_PACKAGES } from '../lib/cloudProductizationModel'
import { PORTAL_APP_SUITES, RAPID_DELIVERY_LOOPS } from '../lib/enterprisePortalBlueprint'
import {
  BUILD_TEAMS,
  BUILD_WORKSPACES,
  INTERNAL_AGENT_CREWS,
  MODULE_PROGRAMS,
  RESEARCH_CELLS,
  RELEASE_GATES,
} from '../lib/companyBuildingModel'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'
import { hasLiveWorkspaceApi, workspaceFetch, type AgentRunRow, type WorkspaceTaskRow } from '../lib/workspaceApi'
import { YANGON_TYRE_PORTAL_APPS } from '../lib/yangonTyrePortalModel'

type ProductOpsPulseMetric = {
  label: string
  value: string
  detail: string
}

type ProductOpsPulseStatus = 'loading' | 'live' | 'preview' | 'signin' | 'unavailable'

type ProductOpsPulseState = {
  status: ProductOpsPulseStatus
  headline: string
  note: string
  updatedAt: string | null
  metrics: ProductOpsPulseMetric[]
  priorities: string[]
}

type ProductOpsMetaPulsePayload = {
  summary?: {
    review?: {
      top_priorities?: string[]
    }
  }
  runtime_control?: RuntimeControlPayload | null
  workspace_tasks?: {
    rows?: WorkspaceTaskRow[]
  }
  agent_runs?: {
    rows?: AgentRunRow[]
  }
  attention?: Array<{
    id?: string
    area?: string
    title?: string
  }>
  latest_rollout?: {
    generated_at?: string
    workspace?: {
      workspace_name?: string
    }
    rollout_pack?: {
      company_name?: string
      first_30_days?: string[]
    }
  } | null
}

const FALLBACK_PULSE_METRICS: ProductOpsPulseMetric[] = [
  {
    label: 'Tracked programs',
    value: String(MODULE_PROGRAMS.length),
    detail: 'Named modules with owners, release trains, and next moves',
  },
  {
    label: 'Release trains',
    value: String(new Set(MODULE_PROGRAMS.map((program) => program.releaseTrain)).size),
    detail: 'Delivery lanes already grouped by discipline',
  },
  {
    label: 'Build teams',
    value: String(BUILD_TEAMS.length),
    detail: 'Execution crews wired to research, runtime, and launch',
  },
  {
    label: 'Yangon apps',
    value: String(YANGON_TYRE_PORTAL_APPS.length),
    detail: 'Named tenant proof surfaces with direct routes',
  },
]

const FALLBACK_PRIORITIES = MODULE_PROGRAMS.slice(0, 3).map((program) => `${program.name}: ${program.nextMove}`)

function formatPulseTimestamp(value: string | null) {
  if (!value) {
    return 'model-backed preview'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function getPulseStatusPill(status: ProductOpsPulseStatus) {
  switch (status) {
    case 'live':
      return 'Live workspace'
    case 'signin':
      return 'Sign-in required'
    case 'unavailable':
      return 'Workspace pulse unavailable'
    case 'loading':
      return 'Checking workspace pulse'
    default:
      return 'Preview shell'
  }
}

function getFallbackPulse(status: Exclude<ProductOpsPulseStatus, 'live'>): ProductOpsPulseState {
  if (status === 'loading') {
    return {
      status,
      headline: 'Checking for a live execution pulse.',
      note: 'Product Ops is looking for `/api/meta/workspace`. Until that resolves, the board stays usable with model-backed execution counts.',
      updatedAt: null,
      metrics: FALLBACK_PULSE_METRICS,
      priorities: FALLBACK_PRIORITIES,
    }
  }

  if (status === 'signin') {
    return {
      status,
      headline: 'Live workspace detected, but sign-in is required.',
      note: 'This host can reach the workspace API, but Product Ops does not have an authenticated session yet. Showing model-backed counts until login is available.',
      updatedAt: null,
      metrics: FALLBACK_PULSE_METRICS,
      priorities: FALLBACK_PRIORITIES,
    }
  }

  if (status === 'unavailable') {
    return {
      status,
      headline: 'Workspace pulse is unavailable right now.',
      note: 'The board fell back to the product model because the live workspace endpoint did not return current state.',
      updatedAt: null,
      metrics: FALLBACK_PULSE_METRICS,
      priorities: FALLBACK_PRIORITIES,
    }
  }

  return {
    status,
    headline: 'Running in preview shell mode.',
    note: 'This host does not expose the live workspace API, so Product Ops is using the current delivery model and direct routes instead of runtime queue data.',
    updatedAt: null,
    metrics: FALLBACK_PULSE_METRICS,
    priorities: FALLBACK_PRIORITIES,
  }
}

function collectDistinctStrings(...groups: Array<Array<string | undefined> | undefined>) {
  const seen = new Set<string>()

  return groups.flatMap((group) =>
    (group ?? []).flatMap((item) => {
      const normalized = String(item ?? '').trim()
      if (!normalized || seen.has(normalized)) {
        return []
      }
      seen.add(normalized)
      return [normalized]
    }),
  )
}

function countOpenTasks(rows?: WorkspaceTaskRow[]) {
  return (rows ?? []).filter((row) => {
    const status = String(row.status ?? '').trim().toLowerCase()
    return status !== 'done' && status !== 'closed'
  }).length
}

const DEPLOYMENT_PATTERN_BY_ID = new Map(CLOUD_DEPLOYMENT_PATTERNS.map((pattern) => [pattern.id, pattern]))

function deriveLivePulse(payload: ProductOpsMetaPulsePayload): ProductOpsPulseState {
  const openTaskCount = countOpenTasks(payload.workspace_tasks?.rows)
  const agentRunCount = (payload.agent_runs?.rows ?? []).length
  const attentionCount = (payload.attention ?? []).length
  const runtimeFeedCount = payload.runtime_control?.connectors?.length ?? 0
  const workspaceLabel =
    payload.latest_rollout?.workspace?.workspace_name ||
    payload.latest_rollout?.rollout_pack?.company_name ||
    'Meta workspace'
  const priorities =
    collectDistinctStrings(
      payload.summary?.review?.top_priorities,
      payload.latest_rollout?.rollout_pack?.first_30_days,
      payload.runtime_control?.big_picture?.next_builds,
    ).slice(0, 3) || FALLBACK_PRIORITIES

  return {
    status: 'live',
    headline: `${workspaceLabel} is feeding Product Ops right now.`,
    note:
      attentionCount > 0
        ? `${attentionCount} attention items are already surfaced in the live workspace. This board is reading queue, runtime, rollout, and agent activity from \`/api/meta/workspace\`.`
        : 'This board is reading queue, runtime, rollout, and agent activity from `/api/meta/workspace`.',
    updatedAt: payload.runtime_control?.updated_at ?? payload.latest_rollout?.generated_at ?? null,
    metrics: [
      {
        label: 'Open tasks',
        value: String(openTaskCount),
        detail: 'Current workspace queue still needing a next move',
      },
      {
        label: 'Recent agent runs',
        value: String(agentRunCount),
        detail: 'Latest automated executions returned by the workspace',
      },
      {
        label: 'Attention items',
        value: String(attentionCount),
        detail: 'Cross-runtime or delivery issues already flagged',
      },
      {
        label: 'Runtime feeds',
        value: String(runtimeFeedCount),
        detail: 'Connectors exposed through runtime control right now',
      },
    ],
    priorities: priorities.length ? priorities : FALLBACK_PRIORITIES,
  }
}

export function ProductOperationsPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [pulse, setPulse] = useState<ProductOpsPulseState>(() => getFallbackPulse('loading'))

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
        unauthenticatedMessage: 'Login is required to open Product Ops.',
        previewMessage: 'Product Ops is only available in the authenticated workspace.',
      })

      if (!cancelled) {
        setAccess(nextAccess)
      }
    }

    void loadAccess()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (access.loading) {
      return
    }

    if (!access.authenticated || !access.allowed) {
      return
    }

    let cancelled = false

    async function loadPulse() {
      if (!hasLiveWorkspaceApi()) {
        if (!cancelled) {
          setPulse(getFallbackPulse('preview'))
        }
        return
      }

      try {
        const payload = await workspaceFetch<ProductOpsMetaPulsePayload>('/api/meta/workspace')
        if (cancelled) {
          return
        }
        setPulse(deriveLivePulse(payload))
      } catch (error) {
        if (cancelled) {
          return
        }

        const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status ?? 0) : 0
        setPulse(getFallbackPulse(status === 401 ? 'signin' : 'unavailable'))
      }
    }

    void loadPulse()
    return () => {
      cancelled = true
    }
  }, [access.allowed, access.authenticated, access.loading])

  const releaseTrainGroups = MODULE_PROGRAMS.reduce<Record<string, string[]>>((acc, program) => {
    const train = program.releaseTrain
    acc[train] = acc[train] ?? []
    acc[train].push(program.name)
    return acc
  }, {})

  const successSignalStory = MODULE_PROGRAMS.map((program) => ({
    id: program.id,
    name: program.name,
    signals: program.successSignals,
    nextMove: program.nextMove,
  }))

  const launchTracks = STARTER_PACK_DETAILS.map((pack) => ({
    id: pack.id,
    name: pack.name,
    launchWindow: pack.launchWindow,
    promise: pack.promise,
    demoSteps: pack.demoSteps.map((step) => step.title),
    deliverables: pack.launchDeliverables,
    proofRoute: pack.proofTool.route,
    setupRoute: `/products/${pack.slug}`,
  }))

  if (access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Product ops"
          title="Loading Product Ops."
          description="Checking workspace access for the release and delivery control board."
        />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Product ops"
          title="Authenticated workspace required."
          description="This release board is reserved for the live internal workspace and does not run in public preview mode."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error ?? 'Product Ops is only available in the authenticated workspace.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/product-ops">
              Login
            </Link>
            <Link className="sm-button-secondary" to="/products">
              Open products
            </Link>
          </div>
        </section>
      </div>
    )
  }

  if (!access.allowed) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Product ops"
          title="Change-control access required."
          description="This board is reserved for architecture, delivery, and tenant control roles that can steer release trains and rollout pressure."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Current role: {access.roleLabel}. Ask an architect, agent-ops lead, tenant admin, or platform admin to grant access.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/workbench">
              Open workbench
            </Link>
            <Link className="sm-button-secondary" to="/app/actions">
              Open my queue
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Product Operations"
        title="Turn SuperMega modules into a live R&D and delivery system."
        description="Product lines, release trains, research cells, agent crews, and success signals are tracked here so the operating company can scale beyond prototypes and keep every release accountable."
      />

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Execution pulse</p>
            <h2 className="mt-2 text-3xl font-bold text-white">What Product Ops is moving right now.</h2>
            <p className="mt-3 max-w-3xl text-sm text-[var(--sm-muted)]">{pulse.note}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/60">
              {pulse.headline} Source: {formatPulseTimestamp(pulse.updatedAt)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/workbench">
              Open Workbench
            </Link>
            <Link className="sm-button-primary" to="/app/meta">
              Open Meta workspace
            </Link>
            <Link className="sm-button-secondary" to="/app/foundry">
              Open Foundry Desk
            </Link>
            <Link className="sm-button-secondary" to="/app/factory">
              Open Build room
            </Link>
            <Link className="sm-button-secondary" to="/clients/yangon-tyre">
              Open Yangon proof
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {pulse.metrics.map((metric) => (
            <article className="sm-chip text-white" key={metric.label}>
              <p className="sm-kicker text-[var(--sm-accent)]">{metric.label}</p>
              <p className="mt-2 text-3xl font-bold text-white">{metric.value}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{metric.detail}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Board mode</p>
            <h3 className="mt-2 text-2xl font-bold text-white">{pulse.headline}</h3>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">
              {pulse.status === 'live'
                ? 'The top row now reflects live queue pressure instead of only seeded narrative. If the workspace goes away, the board keeps the operator map instead of blanking out.'
                : 'The board stays operational even without a live workspace connection by falling back to the current delivery model, build map, and direct tenant routes.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/80">
              <span className="sm-status-pill">{getPulseStatusPill(pulse.status)}</span>
              <span className="sm-status-pill">{BUILD_WORKSPACES.length} build workspaces</span>
              <span className="sm-status-pill">{YANGON_TYRE_PORTAL_APPS.length} Yangon routes</span>
            </div>
          </article>
          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Focus now</p>
            <h3 className="mt-2 text-2xl font-bold text-white">Current actions and next moves.</h3>
            <div className="mt-4 grid gap-3">
              {pulse.priorities.map((priority, index) => (
                <article className="sm-chip text-white" key={`${index}-${priority}`}>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Priority {index + 1}</p>
                  <p className="mt-2 text-sm text-white/85">{priority}</p>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Build system</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Named teams and workspaces own the delivery factory.</h2>
          </div>
          <p className="max-w-2xl text-sm text-[var(--sm-muted)]">
            Product Ops can only work like an execution board if research, prototypes, modules, runtime, launch, and model review already have bounded owners and
            named rooms. Workbench is where those signals become execution tracks, architecture decisions, and controlled delegation.
          </p>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <article className="sm-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Build teams</p>
                <h3 className="mt-2 text-2xl font-bold text-white">{BUILD_TEAMS.length} teams with explicit ownership</h3>
              </div>
              <Link className="sm-link" to="/app/factory">
                Open Build Studio
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {BUILD_TEAMS.map((team) => (
                <article className="sm-chip text-white" key={team.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{team.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">{team.workspace}</p>
                    </div>
                    <span className="sm-status-pill">{team.agentPods.join(' / ')}</span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{team.mission}</p>
                  <p className="mt-2 text-sm text-white/80">Outputs: {team.outputs.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/80">Rituals: {team.rituals.join(', ')}</p>
                </article>
              ))}
            </div>
          </article>
          <article className="sm-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Build workspaces</p>
                <h3 className="mt-2 text-2xl font-bold text-white">{BUILD_WORKSPACES.length} rooms with review cadence</h3>
              </div>
              <Link className="sm-link" to="/app/platform-admin">
                Open rollout control
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {BUILD_WORKSPACES.map((workspace) => (
                <article className="sm-chip text-white" key={workspace.id}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{workspace.name}</p>
                    <span className="sm-status-pill">{workspace.reviewCadence}</span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{workspace.purpose}</p>
                  <p className="mt-2 text-sm text-white/80">Owners: {workspace.owners.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/80">Surfaces: {workspace.surfaces.join(', ')}</p>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Yangon Tyre proof</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Named tenant proof with direct app routes.</h2>
          </div>
          <p className="max-w-2xl text-sm text-[var(--sm-muted)]">
            The proof is not abstract. Yangon Tyre already names the tenant, the workspaces, and the apps that show whether the platform can replace scattered
            plant, commercial, quality, maintenance, and admin work.
          </p>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
          <article className="sm-surface-deep p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Tenant proof</p>
            <h3 className="mt-2 text-2xl font-bold text-white">Yangon Tyre Factory</h3>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">
              One named tenant proving director review, commercial control, plant operations, quality, maintenance, approvals, and tenant administration on the
              same operating model.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <article className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Named apps</p>
                <p className="mt-2 text-3xl font-bold text-white">{YANGON_TYRE_PORTAL_APPS.length}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Direct workspace routes already wired into the product shell.</p>
              </article>
              <article className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Workspaces</p>
                <p className="mt-2 text-3xl font-bold text-white">{new Set(YANGON_TYRE_PORTAL_APPS.map((app) => app.workspace)).size}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Role-based areas mapped to a real manufacturing tenant.</p>
              </article>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/clients/yangon-tyre">
                Open tenant proof
              </Link>
              <Link className="sm-button-secondary" to="/app/director">
                Director app
              </Link>
              <Link className="sm-button-secondary" to="/app/operations">
                Plant Ops app
              </Link>
            </div>
          </article>
          <div className="grid gap-4 xl:grid-cols-2">
            {YANGON_TYRE_PORTAL_APPS.map((app) => (
              <article className="sm-demo-link sm-demo-link-card" key={app.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="sm-home-proof-label">{app.workspace}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{app.name}</h3>
                  </div>
                  <span className="sm-status-pill">{app.users.join(' / ')}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{app.mission}</p>
                <p className="mt-2 text-sm text-white/80">Outcome: {app.outcome}</p>
                <p className="mt-2 text-sm text-white/80">Data sources: {app.dataSources.join(', ')}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link className="sm-link" to={app.route}>
                    Open app
                  </Link>
                  <Link className="sm-link" to="/clients/yangon-tyre">
                    View tenant proof
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Portal product shape</p>
            <h2 className="mt-2 text-3xl font-bold text-white">The product is one portal with several app families, then AI and data-science upgrades on top.</h2>
          </div>
          <p className="max-w-xl text-sm text-[var(--sm-muted)]">
            This is the actual SaaS shape: app suites by role, company memory in the middle, and AI runtime plus data science driving the next release.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {PORTAL_APP_SUITES.map((suite) => (
            <article className="sm-demo-link sm-demo-link-card" key={suite.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">App suite</span>
                <span className="sm-status-pill">{suite.users.join(' / ')}</span>
              </div>
              <h3 className="mt-2 text-2xl font-bold text-white">{suite.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{suite.purpose}</p>
              <p className="mt-3 text-sm text-white/80">Modules: {suite.modules.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Data sources: {suite.dataSources.join(', ')}</p>
              <div className="mt-4">
                <Link className="sm-link" to={suite.route}>
                  Open app
                </Link>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {PRODUCT_BLUEPRINT_MODULES.map((module) => (
            <article className="sm-demo-link sm-demo-link-card" key={module.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{module.category}</span>
                <span className="sm-status-pill">{module.ownedBy}</span>
              </div>
              <h3 className="mt-2 text-2xl font-bold text-white">{module.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{module.outcome}</p>
              <p className="mt-3 text-sm text-white/80">Agent crews: {module.agentCrews.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Data science: {module.dataScience.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Infrastructure: {module.infrastructure.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Tenants: {module.tenants.join(', ')}</p>
              <div className="mt-4">
                <Link className="sm-link" to={module.route}>
                  Open module
                </Link>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <article className="sm-site-proof-panel p-5">
            <p className="sm-kicker text-[var(--sm-accent)]">Owning teams</p>
            <div className="mt-4 grid gap-3">
              {PLATFORM_TEAM_BLUEPRINTS.map((team) => (
                <article className="sm-chip text-white" key={team.id}>
                  <p className="font-semibold">{team.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{team.mandate}</p>
                  <p className="mt-2 text-sm text-white/80">Owns: {team.owns.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/80">Ships: {team.ships.join(', ')}</p>
                </article>
              ))}
            </div>
          </article>
          <article className="sm-site-proof-panel p-5">
            <p className="sm-kicker text-[var(--sm-accent)]">Data-science lanes</p>
            <div className="mt-4 grid gap-3">
              {DATA_SCIENCE_LANES.map((lane) => (
                <article className="sm-chip text-white" key={lane.id}>
                  <p className="font-semibold">{lane.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.purpose}</p>
                  <p className="mt-2 text-sm text-white/80">Outputs: {lane.outputs.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/80">Feeds: {lane.feeds.join(', ')}</p>
                </article>
              ))}
            </div>
          </article>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {RAPID_DELIVERY_LOOPS.map((loop) => (
            <article className="sm-chip text-white" key={loop.id}>
              <p className="font-semibold">{loop.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{loop.purpose}</p>
              <p className="mt-2 text-sm text-white/80">Ship rule: {loop.shipRule}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Sellable cloud programs</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Package full cloud workspaces and AI workforces, not just isolated features.</h2>
          </div>
          <p className="max-w-2xl text-sm text-[var(--sm-muted)]">
            The commercial unit is a cloud-running workspace with a bounded workforce pack, a deployment pattern, and a clear expansion path. This is how SuperMega
            becomes a sellable operating system instead of a set of disconnected demos.
          </p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <article className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent)]">Workspace programs</p>
            <p className="mt-2 text-3xl font-bold text-white">{SELLABLE_WORKSPACE_PROGRAMS.length}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Named cloud products that can be sold as full workspaces.</p>
          </article>
          <article className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent)]">Workforce packs</p>
            <p className="mt-2 text-3xl font-bold text-white">{WORKFORCE_PACKAGES.length}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Recurring AI workforce bundles that keep the workspace productive.</p>
          </article>
          <article className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent)]">Deployment patterns</p>
            <p className="mt-2 text-3xl font-bold text-white">{CLOUD_DEPLOYMENT_PATTERNS.length}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Cloud shapes for single-tenant, multi-site, networked, and workforce-add-on products.</p>
          </article>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
          <article className="sm-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Workspace products</p>
                <h3 className="mt-2 text-2xl font-bold text-white">Each workspace package should be cloud-runnable and commercially legible.</h3>
              </div>
              <Link className="sm-link" to="/app/cloud">
                Open Cloud Ops
              </Link>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {SELLABLE_WORKSPACE_PROGRAMS.map((program) => {
                const pattern = DEPLOYMENT_PATTERN_BY_ID.get(program.deploymentPatternId)

                return (
                  <article className="sm-demo-link sm-demo-link-card" key={program.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="sm-home-proof-label">{program.buyer}</p>
                        <h3 className="mt-2 text-2xl font-bold text-white">{program.name}</h3>
                      </div>
                      <span className="sm-status-pill">{pattern?.name ?? 'Cloud package'}</span>
                    </div>
                    <p className="mt-3 text-sm text-[var(--sm-muted)]">{program.strap}</p>
                    <p className="mt-3 text-sm text-white/80">Outcome: {program.outcome}</p>
                    <p className="mt-2 text-sm text-white/80">Apps: {program.apps.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Workforce packs: {program.workforcePacks.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Pricing motion: {program.pricingMotion}</p>
                    <p className="mt-2 text-sm text-white/80">Launch motion: {program.launchMotion}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link className="sm-link" to={program.route}>
                        Open product
                      </Link>
                      <Link className="sm-link" to="/app/teams">
                        Open workforce
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          </article>

          <div className="grid gap-6">
            <article className="sm-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">AI workforce packs</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">Sell the recurring workforce as an add-on, not as hidden internal labor.</h3>
                </div>
                <Link className="sm-link" to="/app/teams">
                  Open Agent Ops
                </Link>
              </div>
              <div className="mt-5 grid gap-3">
                {WORKFORCE_PACKAGES.map((pack) => (
                  <article className="sm-chip text-white" key={pack.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{pack.name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{pack.strap}</p>
                      </div>
                      <span className="sm-status-pill">{pack.mode}</span>
                    </div>
                    <p className="mt-3 text-sm text-white/80">{pack.mission}</p>
                    <p className="mt-2 text-sm text-white/80">Jobs: {pack.jobFamilies.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Guardrails: {pack.guardrails.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Sold with: {pack.soldWith.join(', ')}</p>
                  </article>
                ))}
              </div>
            </article>

            <article className="sm-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Cloud deployment patterns</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">The same product can be sold in different runtime shapes.</h3>
                </div>
                <Link className="sm-link" to="/app/platform-admin">
                  Open control plane
                </Link>
              </div>
              <div className="mt-5 grid gap-3">
                {CLOUD_DEPLOYMENT_PATTERNS.map((pattern) => (
                  <article className="sm-chip text-white" key={pattern.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{pattern.name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{pattern.strap}</p>
                      </div>
                      <span className="sm-status-pill">{pattern.tenancy}</span>
                    </div>
                    <p className="mt-3 text-sm text-white/80">{pattern.purpose}</p>
                    <p className="mt-2 text-sm text-white/80">Control plane: {pattern.controlPlane.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Runtime: {pattern.runtime.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Sell as: {pattern.sellAs.join(', ')}</p>
                  </article>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Product lines</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Every module is a tracked program with release trains, crews, success metrics, and next moves.</h2>
          </div>
          <p className="max-w-xl text-sm text-[var(--sm-muted)]">
            Revenue OS, Ops ERP Core, Portal Network, Knowledge Runtime, and Director OS each have a program owner, research cell, and agent stack so R&D does not tumble into heroics.
          </p>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {MODULE_PROGRAMS.map((program) => (
            <article className="sm-demo-link sm-demo-link-card" key={program.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{program.stage}</span>
                <span className="sm-status-pill">{program.releaseTrain}</span>
              </div>
              <h3 className="mt-2 text-2xl font-bold text-white">{program.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{program.target}</p>
              <div className="mt-4 grid gap-2 text-sm text-white/80 sm:grid-cols-2">
                <p>
                  <span className="font-semibold text-white">Owner:</span> {program.owner}
                </p>
                <p>
                  <span className="font-semibold text-white">Research cell:</span> {program.researchCell}
                </p>
                <p>
                  <span className="font-semibold text-white">Starter wedge:</span> {program.starterWedge}
                </p>
                <p>
                  <span className="font-semibold text-white">Tenant proof:</span> {program.tenantProof}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-white/60">
                {program.modules.map((module) => (
                  <span key={`${program.id}-${module}`}>{module}</span>
                ))}
              </div>
              <div className="mt-4 text-sm text-white/80">
                <p className="font-semibold text-white">Success signals</p>
                <ul className="mt-2 space-y-1 list-disc pl-4">
                  {program.successSignals.map((signal) => (
                    <li key={`${program.id}-${signal}`}>{signal}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Next move: {program.nextMove}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Release trains</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Release momentum is grouped by discipline.</h2>
          </div>
          <div className="mt-4 grid gap-4">
            {Object.entries(releaseTrainGroups).map(([train, programs]) => (
              <div key={train} className="sm-chip text-white">
                <p className="font-semibold uppercase tracking-[0.2em] text-[var(--sm-muted)]">{train}</p>
                <p className="mt-1 text-sm">{programs.join(', ')}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-3">
            <p className="sm-kicker text-[var(--sm-accent)]">Release gates</p>
            <div className="grid gap-3">
              {RELEASE_GATES.map((gate) => (
                <article className="sm-chip text-white" key={gate.id}>
                  <p className="font-semibold">{gate.name}</p>
                  <p className="text-sm text-[var(--sm-muted)]">{gate.question}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">Exit: {gate.exitCriteria}</p>
                </article>
              ))}
            </div>
          </div>
        </article>
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Success signals</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Every program sends a signal that the next release is real.</h2>
          </div>
          <div className="mt-4 space-y-4">
            {successSignalStory.map((story) => (
              <article className="sm-demo-link sm-demo-link-card" key={story.id}>
                <h3 className="text-xl font-bold text-white">{story.name}</h3>
                <ul className="mt-2 space-y-1 text-sm text-white/80 list-disc pl-4">
                  {story.signals.map((signal) => (
                    <li key={`${story.id}-${signal}`}>{signal}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Next move: {story.nextMove}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Launch readiness</p>
            <h2 className="mt-2 text-3xl font-bold text-white">A module is only done when it is sellable, demoable, and ready to onboard.</h2>
          </div>
          <div className="flex max-w-xl flex-col gap-3 text-sm text-[var(--sm-muted)]">
            <p>
              Product Ops owns the bridge between R&D and revenue. Each live wedge needs screenshots, a proof route, a clean walkthrough, and a direct
              rollout CTA or it stays a prototype.
            </p>
            <Link className="sm-link" to="/app/workbench">
              Promote launch blockers into Workbench
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {launchTracks.map((track) => (
            <article className="sm-demo-link sm-demo-link-card" key={track.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">Proof live</span>
                <span className="sm-status-pill">{track.launchWindow}</span>
              </div>
              <h3 className="mt-2 text-2xl font-bold text-white">{track.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{track.promise}</p>
              <p className="mt-3 text-sm text-white/80">Demo track: {track.demoSteps.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Deliverables: {track.deliverables.join(', ')}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="sm-link" to={track.proofRoute}>
                  Open proof center
                </Link>
                <Link className="sm-link" to={track.setupRoute}>
                  Review setup
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Research cells</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Experimental cells turn data into modules.</h2>
          </div>
          <p className="max-w-xl text-sm text-[var(--sm-muted)]">Cells own mandates, inputs, outputs, and the tenants they support so the factory can prioritize wiring the right data.</p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {RESEARCH_CELLS.map((cell) => (
            <article className="sm-demo-link sm-demo-link-card" key={cell.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{cell.ownedBy}</span>
                <span className="sm-status-pill text-[var(--sm-accent)]">Supports {cell.supports.length} lines</span>
              </div>
              <h3 className="mt-2 text-2xl font-bold text-white">{cell.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{cell.mandate}</p>
              <div className="mt-3 text-sm text-white/80 space-y-1">
                <p>Inputs: {cell.inputs.join(', ')}</p>
                <p>Outputs: {cell.outputs.join(', ')}</p>
                <p>Supports: {cell.supports.join(', ')}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Agent crews</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Dedicated crews scale the automation work.</h2>
          </div>
          <p className="max-w-xl text-sm text-[var(--sm-muted)]">Crews own read/write scope, cadence, and approvals so AI action stays aligned with the product company’s risk posture.</p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {INTERNAL_AGENT_CREWS.map((crew) => (
            <article className="sm-demo-link sm-demo-link-card" key={crew.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{crew.workspace}</span>
                <span className="sm-status-pill text-white/80">{crew.cadence}</span>
              </div>
              <h3 className="mt-2 text-xl font-bold text-white">{crew.name}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{crew.mission}</p>
              <div className="mt-3 space-y-1 text-sm text-white/80">
                <p>Read scope: {crew.readScope.join(', ')}</p>
                <p>Write scope: {crew.writeScope.join(', ')}</p>
                <p>Approval gate: {crew.approvalGate}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
