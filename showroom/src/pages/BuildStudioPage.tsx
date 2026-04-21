import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AGENT_TECHNIQUES, AI_NATIVE_STACK_LAYERS } from '../lib/aiArchitectureBlueprint'
import { INFRASTRUCTURE_CAPABILITIES, TENANT_SCALE_LANES } from '../lib/aiNativeProductModel'
import {
  AI_FOUNDRY_CREWS,
  AI_FOUNDRY_STAGES,
  EXPERIENCE_LAWS,
  SAAS_REBUILD_TRACKS,
  YTF_APP_FOUNDRY_BLUEPRINTS,
} from '../lib/aiFoundryModel'
import { getAgentOperatingModel } from '../lib/agentOperatingModel'
import { PageIntro } from '../components/PageIntro'
import {
  BUILD_TEAMS,
  BUILD_WORKSPACES,
  COMPETITIVE_FRONTS,
  INTERNAL_AGENT_CREWS,
  MODULE_FACTORY_STAGES,
  MODULE_PROGRAMS,
  RELEASE_GATES,
  RESEARCH_CELLS,
  RESEARCH_PRIORITIES,
} from '../lib/companyBuildingModel'
import {
  AI_OPERATING_LOOPS,
  ENTERPRISE_MODULE_FAMILIES,
  OPEN_SOURCE_STACK_LAYERS,
  PORTAL_APP_SUITES,
  RAPID_DELIVERY_LOOPS,
  WORKSPACE_FRAMEWORKS,
} from '../lib/enterprisePortalBlueprint'
import {
  buildFactoryGapQueue,
  buildFactoryProgramBoard,
  summarizeFactoryProgramBoard,
} from '../lib/moduleFactoryRuntime'
import {
  buildTenantAppFoundryBoard,
  buildTenantAppFoundryGapQueue,
  summarizeTenantAppFoundryBoard,
} from '../lib/tenantAppFoundryRuntime'
import { getTenantConfig } from '../lib/tenantConfig'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'
import { YANGON_TYRE_DATA_PROFILE } from '../lib/yangonTyreDataProfile'
import { YANGON_TYRE_CONNECTOR_EXPANSION, YANGON_TYRE_SOURCE_PACKS } from '../lib/yangonTyreDriveModel'
import {
  checkWorkspaceHealth,
  createWorkspaceTasks,
  getAgentTeams,
  getPlatformControlPlane,
  getWorkspaceSession,
  listAgentRuns,
  listWorkspaceTasks,
  sessionHasCapability,
  type AgentRunRow,
  type AgentTeamsPayload,
  type PlatformControlPlanePayload,
} from '../lib/workspaceApi'

function formatDateTime(value: string) {
  if (!value) {
    return 'Never'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function statusTone(status: string) {
  const normalized = String(status || '').trim().toLowerCase()
  if (
    normalized === 'enabled' ||
    normalized === 'active' ||
    normalized === 'completed' ||
    normalized === 'live sellable' ||
    normalized === 'release candidate' ||
    normalized === 'live'
  ) {
    return 'text-emerald-300'
  }
  if (
    normalized === 'pilot' ||
    normalized === 'queued' ||
    normalized === 'running' ||
    normalized === 'pilot expansion' ||
    normalized === 'in build' ||
    normalized === 'pilot hardening' ||
    normalized === 'crewed build' ||
    normalized === 'standby' ||
    normalized === 'designed' ||
    normalized === 'mapped'
  ) {
    return 'text-amber-300'
  }
  if (
    normalized === 'error' ||
    normalized === 'disabled' ||
    normalized === 'blocked' ||
    normalized === 'mapped only' ||
    normalized === 'workflow mapped' ||
    normalized === 'blueprint only' ||
    normalized === 'missing'
  ) {
    return 'text-rose-300'
  }
  return 'text-white/70'
}

const BUILD_STUDIO_CORE_SPRINT = [
  {
    id: 'cloud-release-loop',
    title: 'Close the cloud release loop for supermega.dev and tenant portals',
    owner: 'Cloud pod',
    priority: 'High',
    due: 'This week',
    notes: 'Use Cloud Ops, smoke, and Platform Admin to keep preview, production, and domain verification running from the app.',
  },
  {
    id: 'ytf-runtime',
    title: 'Harden Yangon Tyre runtime, roles, and portal defaults',
    owner: 'Tenant delivery pod',
    priority: 'High',
    due: 'This week',
    notes: 'Keep YTF desks, role homes, and writeback paths usable for daily operations without side trackers.',
  },
  {
    id: 'workforce-automation',
    title: 'Expand autonomous workforce coverage for queue, approvals, and review loops',
    owner: 'Agent ops pod',
    priority: 'High',
    due: 'This week',
    notes: 'Add bounded agent routines that reduce manual coordination and keep audit trails explicit.',
  },
  {
    id: 'product-proof',
    title: 'Keep product proof and live module evidence aligned with public product pages',
    owner: 'Product systems pod',
    priority: 'Medium',
    due: 'This week',
    notes: 'Every sellable module should keep a current proof path, live route, or guided preview.',
  },
] as const

const BUILD_STUDIO_PROTOTYPE_SPRINT = [
  {
    id: 'dqms-copilot',
    title: 'Prototype the DQMS copilot for fishbone, 5W1H, and CAPA guidance',
    owner: 'Quality R&D cell',
    priority: 'High',
    due: 'Next sprint',
    notes: 'Package the industrial methods into an operator flow that can graduate into the DQMS desk.',
  },
  {
    id: 'knowledge-graph-studio',
    title: 'Prototype the knowledge graph studio for Drive, Gmail, and structured business memory',
    owner: 'Knowledge systems pod',
    priority: 'High',
    due: 'Next sprint',
    notes: 'Turn tenant file systems and inboxes into governed graph-ready records and retrieval surfaces.',
  },
  {
    id: 'data-story-pack',
    title: 'Prototype the data science story pack for KPI drift, gap analysis, and weekly review',
    owner: 'Data science cell',
    priority: 'High',
    due: 'Next sprint',
    notes: 'Bundle feature engineering, anomaly scans, and executive storytelling into one repeatable module.',
  },
  {
    id: 'agent-browser-lane',
    title: 'Prototype the browser-agent lane for external portals and computer-task automation',
    owner: 'Automation R&D cell',
    priority: 'Medium',
    due: 'Next sprint',
    notes: 'Test bounded browser actions that can graduate into workforce tools with approvals and audit.',
  },
] as const

function buildStudioTemplateId(prefix: 'core' | 'prototype', taskId: string) {
  return `build-studio:${prefix}:${taskId}`
}

export function BuildStudioPage() {
  const tenant = getTenantConfig()
  const tenantAgentModel = useMemo(
    () => getAgentOperatingModel(tenant.key === 'ytf-plant-a' ? 'ytf-plant-a' : 'default'),
    [tenant.key],
  )
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [liveLoading, setLiveLoading] = useState(true)
  const [liveMessage, setLiveMessage] = useState<string | null>(null)
  const [executionMessage, setExecutionMessage] = useState<string | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [seedCoreBusy, setSeedCoreBusy] = useState(false)
  const [seedPrototypeBusy, setSeedPrototypeBusy] = useState(false)
  const [controlPlane, setControlPlane] = useState<PlatformControlPlanePayload | null>(null)
  const [agentTeams, setAgentTeams] = useState<AgentTeamsPayload | null>(null)
  const [agentRuns, setAgentRuns] = useState<AgentRunRow[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
        unauthenticatedMessage: 'Login is required to open Build Studio.',
        previewMessage: 'Build Studio is only available in the authenticated workspace.',
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
      setLiveLoading(false)
      return
    }

    let cancelled = false

    async function loadLiveFactory() {
      setLiveLoading(true)
      try {
        const health = await checkWorkspaceHealth()
        if (!health.ready) {
          if (!cancelled) {
            setLiveMessage('Workspace API is not connected on this host yet, so the live factory board is showing strategy only.')
            setLiveLoading(false)
          }
          return
        }

        const session = await getWorkspaceSession()
        if (!session.authenticated) {
          if (!cancelled) {
            setLiveMessage('Log in to see the live module catalog, workforce contract, and current build posture.')
            setLiveLoading(false)
          }
          return
        }

        const canSeeModuleControl =
          sessionHasCapability(session.session, 'tenant_admin.view') || sessionHasCapability(session.session, 'platform_admin.view')
        const settled = await Promise.allSettled([
          getAgentTeams(),
          listAgentRuns(8),
          canSeeModuleControl ? getPlatformControlPlane() : Promise.resolve(null),
        ])
        if (cancelled) {
          return
        }

        const nextMessages: string[] = []

        if (settled[0].status === 'fulfilled') {
          setAgentTeams(settled[0].value)
        } else {
          nextMessages.push('AI workforce state could not be loaded.')
        }

        if (settled[1].status === 'fulfilled') {
          setAgentRuns(settled[1].value.rows ?? [])
        } else {
          nextMessages.push('Recent agent runs are unavailable.')
        }

        if (settled[2].status === 'fulfilled') {
          setControlPlane(settled[2].value)
        } else if (canSeeModuleControl) {
          nextMessages.push('Module control-plane data could not be loaded.')
        } else {
          nextMessages.push('Live module control is reserved for tenant-admin and platform-admin roles.')
        }

        setLiveMessage(nextMessages.length > 0 ? nextMessages.join(' ') : null)
      } catch (error) {
        if (!cancelled) {
          setLiveMessage(error instanceof Error ? error.message : 'Live factory state is unavailable right now.')
        }
      } finally {
        if (!cancelled) {
          setLiveLoading(false)
        }
      }
    }

    void loadLiveFactory()
    return () => {
      cancelled = true
    }
  }, [access.allowed, access.authenticated, access.loading])

  const liveModules = useMemo(() => controlPlane?.modules?.rows ?? [], [controlPlane?.modules?.rows])
  const liveProgramBoard = useMemo(() => buildFactoryProgramBoard(liveModules), [liveModules])
  const liveProgramSummary = useMemo(() => summarizeFactoryProgramBoard(liveProgramBoard), [liveProgramBoard])
  const factoryGapQueue = useMemo(() => buildFactoryGapQueue(liveProgramBoard).slice(0, 6), [liveProgramBoard])
  const modulePromotionQueue = useMemo(
    () => liveModules.filter((row) => String(row.workspace_status || '').trim().toLowerCase() !== 'enabled').slice(0, 6),
    [liveModules],
  )
  const workforceTeams = useMemo(() => agentTeams?.teams ?? [], [agentTeams?.teams])
  const workforcePlaybooks = useMemo(() => agentTeams?.manifest?.playbooks ?? [], [agentTeams?.manifest?.playbooks])
  const foundryPlaybooks = useMemo(
    () => (workforcePlaybooks.length > 0 ? workforcePlaybooks : tenantAgentModel.playbooks),
    [tenantAgentModel.playbooks, workforcePlaybooks],
  )
  const ytfFoundryBoard = useMemo(
    () => buildTenantAppFoundryBoard(YTF_APP_FOUNDRY_BLUEPRINTS, liveModules, workforceTeams, foundryPlaybooks),
    [foundryPlaybooks, liveModules, workforceTeams],
  )
  const ytfFoundrySummary = useMemo(() => summarizeTenantAppFoundryBoard(ytfFoundryBoard), [ytfFoundryBoard])
  const ytfFoundryGapQueue = useMemo(() => buildTenantAppFoundryGapQueue(ytfFoundryBoard).slice(0, 8), [ytfFoundryBoard])
  const nextMoves = useMemo(() => (agentTeams?.next_moves ?? []).slice(0, 4), [agentTeams?.next_moves])

  async function handleSeedSprint(prefix: 'core' | 'prototype') {
    const taskPack = prefix === 'core' ? BUILD_STUDIO_CORE_SPRINT : BUILD_STUDIO_PROTOTYPE_SPRINT
    const setBusy = prefix === 'core' ? setSeedCoreBusy : setSeedPrototypeBusy
    setBusy(true)
    setExecutionMessage(null)
    setExecutionError(null)
    try {
      const taskBoard = await listWorkspaceTasks(undefined, 200)
      const existingTemplates = new Set(
        (taskBoard.rows ?? [])
          .map((row) => String(row.template ?? '').trim())
          .filter(Boolean),
      )
      const rowsToCreate = taskPack
        .filter((task) => !existingTemplates.has(buildStudioTemplateId(prefix, task.id)))
        .map((task) => ({
          title: task.title,
          owner: task.owner,
          priority: task.priority,
          due: task.due,
          status: 'open',
          notes: task.notes,
          template: buildStudioTemplateId(prefix, task.id),
        }))

      if (!rowsToCreate.length) {
        setExecutionMessage(prefix === 'core' ? 'Core team sprint is already seeded into the workspace queue.' : 'Prototype sprint is already seeded into the workspace queue.')
        return
      }

      const payload = await createWorkspaceTasks(rowsToCreate)
      const savedCount = Number(payload.saved_count ?? payload.rows?.length ?? rowsToCreate.length)
      setExecutionMessage(
        prefix === 'core'
          ? `Seeded ${savedCount} core-team sprint tasks into the workspace queue.`
          : `Seeded ${savedCount} prototype sprint tasks into the workspace queue.`,
      )
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : 'Could not seed the build sprint tasks right now.')
    } finally {
      setBusy(false)
    }
  }

  if (access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Build system"
          title="Loading Build Studio."
          description="Checking workspace access for the internal app factory."
        />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Build system"
          title="Authenticated workspace required."
          description="Build Studio is an internal change-control desk and does not run in public preview mode."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error ?? 'Build Studio is only available in the authenticated workspace.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/factory">
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
          eyebrow="Build system"
          title="Change-control access required."
          description="This desk is reserved for architecture, delivery, and tenant control roles that can steer the internal product factory."
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
        eyebrow="Build system"
        title="How SUPERMEGA.dev builds and scales."
        description="The point is not to keep making isolated demos. The point is to turn painful workflows into live customer systems, then into reusable products with stronger connectors, controls, and rollout discipline."
      />

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Operating thesis</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">The advantage is not one giant suite. The advantage is turning workflow pain into products faster.</h2>
          <div className="mt-6 space-y-3">
            {[
              'Find a workflow where old software is already failing the operator.',
              'Land a small live version with real files, users, and approvals.',
              'Product teams turn what repeats into reusable software.',
              'Connector, data, and control teams keep the core system stronger after launch.',
            ].map((item) => (
              <div className="sm-site-point" key={item}>
                <span className="sm-site-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-proof-panel">
          <div className="sm-site-proof-head">
            <span>How products move from pilot to standard release</span>
            <span>Each stage has real artifacts, not vague product ambition</span>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {MODULE_FACTORY_STAGES.map((stage, index) => (
              <div className="sm-demo-mini" key={stage.id}>
                <strong>
                  {index + 1}. {stage.name}
                </strong>
                <span>{stage.detail}</span>
                <small className="text-[var(--sm-muted)]">Artifacts: {stage.artifacts.join(', ')}</small>
              </div>
            ))}
          </div>
          <div className="sm-site-proof-foot">
            <span>The win comes from making this loop faster, safer, and more repeatable than the incumbents.</span>
            <Link className="sm-link" to="/products">
              Explore live modules
            </Link>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <article className="sm-site-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Live factory board</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">This is the machine that builds the machine.</h2>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
              Strategy is already defined below. This board shows what the current workspace can actually staff, ship, and promote right now.
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Avg readiness',
                value: `${liveProgramSummary.averageReadiness}%`,
                detail: `${liveProgramSummary.liveSellableCount} live sellable, ${liveProgramSummary.inBuildCount} in build`,
              },
              {
                label: 'Live modules',
                value: `${controlPlane?.modules?.enabled_count ?? 0}`,
                detail: `${controlPlane?.modules?.pilot_count ?? 0} pilot, ${controlPlane?.modules?.disabled_count ?? 0} disabled`,
              },
              {
                label: 'AI workforce',
                value: `${agentTeams?.summary?.team_count ?? workforceTeams.length}`,
                detail: `${agentTeams?.summary?.manifest_playbook_count ?? workforcePlaybooks.length} playbooks, autonomy ${agentTeams?.summary?.autonomy_score ?? 0}`,
              },
              {
                label: 'Recent runs',
                value: `${agentRuns.length}`,
                detail: agentRuns[0]?.completed_at ? `Latest ${formatDateTime(agentRuns[0].completed_at)}` : 'No recent run recorded',
              },
            ].map((item) => (
              <article className="sm-proof-card" key={item.label}>
                <p className="text-sm uppercase tracking-[0.14em] text-[var(--sm-muted)]">{item.label}</p>
                <p className="mt-3 text-3xl font-bold text-white">{item.value}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              </article>
            ))}
          </div>

          {liveLoading ? (
            <div className="mt-6 sm-chip text-white">Loading live factory state...</div>
          ) : null}

          {liveMessage ? (
            <div className="mt-6 sm-chip text-white">
              <strong>Board note</strong>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{liveMessage}</p>
            </div>
          ) : null}

          {nextMoves.length > 0 ? (
            <div className="mt-6 grid gap-3">
              {nextMoves.map((item) => (
                <article className="sm-demo-mini" key={item}>
                  <strong>Next move</strong>
                  <span>{item}</span>
                </article>
              ))}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={seedCoreBusy} onClick={() => void handleSeedSprint('core')} type="button">
              {seedCoreBusy ? 'Seeding core sprint...' : 'Seed core sprint'}
            </button>
            <button className="sm-button-secondary" disabled={seedPrototypeBusy} onClick={() => void handleSeedSprint('prototype')} type="button">
              {seedPrototypeBusy ? 'Seeding prototype sprint...' : 'Seed prototype sprint'}
            </button>
            <Link className="sm-button-primary" to="/app/teams">
              Open Agent Ops
            </Link>
            <Link className="sm-button-secondary" to="/app/foundry">
              Open Foundry Desk
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Open Platform Admin
            </Link>
            <Link className="sm-button-secondary" to="/app/architect">
              Open Architect
            </Link>
          </div>
          {executionMessage ? <div className="mt-4 sm-chip text-white">{executionMessage}</div> : null}
          {executionError ? <div className="mt-4 sm-chip text-white">{executionError}</div> : null}
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Promotion and gap queue</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">What gets promoted next, and what is still missing.</h2>
          </div>

          <div className="mt-6 grid gap-3">
            {modulePromotionQueue.length > 0 ? (
              modulePromotionQueue.map((module) => (
                <article className="sm-proof-card" key={`promotion-${module.module_id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{module.name}</p>
                    <span className={`sm-status-pill ${statusTone(module.workspace_status)}`}>{module.workspace_status}</span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{module.summary}</p>
                  <p className="mt-2 text-sm text-white/80">Category: {module.category}</p>
                  <p className="mt-2 text-sm text-white/80">Route: {module.route}</p>
                </article>
              ))
            ) : (
              <article className="sm-chip text-white">
                <p className="font-semibold">Promotion queue</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">All visible workspace modules are currently enabled.</p>
              </article>
            )}
          </div>

          <div className="mt-6 grid gap-3">
            {factoryGapQueue.map((gap) => (
              <article className="sm-chip text-white" key={`gap-${gap.requestedName}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{gap.requestedName}</p>
                  <span className="sm-status-pill">{gap.count} programs</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Needed by: {gap.programNames.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Portal app factory</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The build system ships complete portal apps, not disconnected screens.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {PORTAL_APP_SUITES.map((suite) => (
              <article className="sm-proof-card" key={suite.id}>
                <p className="font-semibold text-white">{suite.name}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{suite.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Modules: {suite.modules.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Core infrastructure</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The build system needs shared backbone, not per-client improvisation.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {INFRASTRUCTURE_CAPABILITIES.map((capability) => (
              <article className="sm-chip text-white" key={capability.id}>
                <p className="font-semibold">{capability.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{capability.purpose}</p>
                <p className="mt-2 text-sm text-white/80">Supports: {capability.supports.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Architecture stack</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The platform needs a durable agent stack, not a pile of prompts.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {AI_NATIVE_STACK_LAYERS.map((layer) => (
              <article className="sm-proof-card" key={layer.id}>
                <p className="font-semibold text-white">{layer.layer}</p>
                <p className="mt-3 text-sm text-white/80">Standard: {layer.recommendation}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{layer.role}</p>
                <p className="mt-2 text-sm text-white/80">Why now: {layer.whyNow}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Agent techniques</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The operating model is tool loop, state, workflow, connectors, action, and eval.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {AGENT_TECHNIQUES.map((technique) => (
              <article className="sm-chip text-white" key={technique.id}>
                <p className="font-semibold">{technique.name}</p>
                <p className="mt-2 text-sm text-white/80">Pattern: {technique.pattern}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{technique.purpose}</p>
                <p className="mt-2 text-sm text-white/80">Yangon Tyre use: {technique.ytfUse}</p>
                <p className="mt-2 text-sm text-white/80">Adopt next: {technique.adoptNext}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">AI design workforce</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The platform needs agent crews that design apps, not just run chores.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {AI_FOUNDRY_CREWS.map((crew) => (
              <article className="sm-proof-card" key={crew.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{crew.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{crew.workspace}</p>
                  </div>
                  <span className="sm-status-pill">{crew.workspace}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{crew.mission}</p>
                <p className="mt-3 text-sm text-white/80">Inputs: {crew.inputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Outputs: {crew.outputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Gate: {crew.gate}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">App foundry machine</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The machine is benchmark, redesign, compile, crew, and promote.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {AI_FOUNDRY_STAGES.map((stage, index) => (
              <article className="sm-chip text-white" key={stage.id}>
                <p className="font-semibold">
                  {index + 1}. {stage.name}
                </p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{stage.detail}</p>
                <p className="mt-2 text-sm text-white/80">Crews: {stage.crews.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Artifacts: {stage.artifacts.join(', ')}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3">
            {EXPERIENCE_LAWS.map((item) => (
              <article className="sm-proof-card" key={item.title}>
                <p className="font-semibold text-white">{item.title}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Program readiness board</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Every app line now has a live readiness posture, not just a roadmap slot.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            This board maps the current workspace module catalog against the product programs below so you can see what is sellable, what is in pilot
            expansion, and what still needs new module work.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {liveProgramBoard.map((row) => (
            <article className="sm-demo-link sm-demo-link-card" key={`live-program-${row.program.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={`sm-home-proof-label ${statusTone(row.posture)}`}>{row.posture}</span>
                <span className="sm-status-pill">{row.readinessScore}% ready</span>
              </div>
              <strong>{row.program.name}</strong>
              <span>{row.program.target}</span>
              <small className="text-[var(--sm-muted)]">
                Coverage: {row.enabledCount} enabled, {row.pilotCount} pilot, {row.disabledCount} parked, {row.gapCount} missing
              </small>
              <small className="text-[var(--sm-muted)]">Release train: {row.program.releaseTrain}</small>
              <small className="text-[var(--sm-muted)]">Crew stack: {row.program.agentCrews.join(', ')}</small>
              <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-white/70">
                {row.moduleStatuses.map((module) => (
                  <span className={statusTone(module.state)} key={`${row.program.id}-${module.requestedName}`}>
                    {module.requestedName}
                  </span>
                ))}
              </div>
              <small className="text-[var(--sm-muted)]">Next move: {row.program.nextMove}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live workforce pods</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the active AI teams attached to the current operating contract.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {workforceTeams.length > 0 ? (
              workforceTeams.slice(0, 6).map((team) => (
                <article className="sm-proof-card" key={`live-team-${team.team_id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{team.name}</p>
                    <span className={`sm-status-pill ${statusTone(team.status)}`}>{team.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{team.mission}</p>
                  <p className="mt-2 text-sm text-white/80">Cadence: {team.cadence}</p>
                  <p className="mt-2 text-sm text-white/80">Lead agent: {team.lead_agent}</p>
                  <p className="mt-2 text-sm text-white/80">Units: {team.agents.length}</p>
                </article>
              ))
            ) : (
              <article className="sm-chip text-white">
                <p className="font-semibold">No live workforce pod loaded</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">The strategy model is still visible on this page, but the runtime team state has not been returned.</p>
              </article>
            )}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Recent agent loops</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">This is the current operating pulse behind the build system.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {agentRuns.length > 0 ? (
              agentRuns.slice(0, 6).map((run) => (
                <article className="sm-chip text-white" key={`run-${run.run_id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{run.job_type}</p>
                    <span className={`sm-status-pill ${statusTone(run.status)}`}>{run.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{run.summary || 'No summary recorded yet.'}</p>
                  <p className="mt-2 text-sm text-white/80">Source: {run.source || 'system'}</p>
                  <p className="mt-2 text-sm text-white/80">Completed: {formatDateTime(run.completed_at || run.started_at || run.created_at)}</p>
                </article>
              ))
            ) : (
              <article className="sm-chip text-white">
                <p className="font-semibold">No recent agent runs recorded</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Open Agent Ops to run or inspect the current workforce loops.</p>
              </article>
            )}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">SaaS remake map</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">We are not inventing categories from scratch. We are remaking the best ones in AI-native form.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The point is to copy the winning workflow shape from proven SaaS, then rebuild it around role homes, shared records, and bounded AI workers.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {SAAS_REBUILD_TRACKS.map((track) => (
            <article className="sm-demo-link sm-demo-link-card" key={track.id}>
              <span className="sm-home-proof-label">{track.category}</span>
              <strong>{track.incumbents.join(' / ')}</strong>
              <span>{track.aiNativeAngle}</span>
              <small className="text-[var(--sm-muted)]">Jobs: {track.jobs.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">First products: {track.firstProducts.join(', ')}</small>
            </article>
          ))}
        </div>
      </section>

      {tenant.key === 'ytf-plant-a' ? (
        <section className="space-y-6">
          <article className="sm-site-panel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Yangon Tyre app foundry</p>
                <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each tenant app now has a live build posture, source spine, and AI crew contract.</h2>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
                This tenant board now scores each app against real module coverage, live or designed crews, and the Drive or spreadsheet evidence already visible in
                Yangon Tyre data sources.
              </p>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: 'Avg readiness',
                  value: `${ytfFoundrySummary.averageReadiness}%`,
                  detail: `${ytfFoundrySummary.releaseCandidateCount} release candidate, ${ytfFoundrySummary.crewedBuildCount} crewed build`,
                },
                {
                  label: 'App line count',
                  value: `${ytfFoundryBoard.length}`,
                  detail: `${ytfFoundrySummary.workflowMappedCount} workflow mapped, ${ytfFoundrySummary.blueprintOnlyCount} blueprint only`,
                },
                {
                  label: 'Live source packs',
                  value: `${YANGON_TYRE_SOURCE_PACKS.filter((item) => item.status === 'live').length}`,
                  detail: `${YANGON_TYRE_SOURCE_PACKS.filter((item) => item.status === 'mapped').length} mapped, ${YANGON_TYRE_SOURCE_PACKS.filter((item) => item.status === 'queued').length} queued`,
                },
                {
                  label: 'Connector expansion',
                  value: `${YANGON_TYRE_CONNECTOR_EXPANSION.filter((item) => item.status === 'queued').length}`,
                  detail: `${YANGON_TYRE_CONNECTOR_EXPANSION.filter((item) => item.status === 'live').length} live now, ${YANGON_TYRE_CONNECTOR_EXPANSION.filter((item) => item.status === 'mapped').length} mapped`,
                },
              ].map((item) => (
                <article className="sm-proof-card" key={item.label}>
                  <p className="text-sm uppercase tracking-[0.14em] text-[var(--sm-muted)]">{item.label}</p>
                  <p className="mt-3 text-3xl font-bold text-white">{item.value}</p>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                </article>
              ))}
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
              <article className="sm-proof-card">
                <p className="font-semibold text-white">Local plant data spine</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{YANGON_TYRE_DATA_PROFILE.sourceNote}</p>
                <p className="mt-3 text-sm text-white/80">
                  2024 output: {YANGON_TYRE_DATA_PROFILE.annualBiasOutput2024.toLocaleString()} tyres. B+R: {YANGON_TYRE_DATA_PROFILE.annualBPlusRRate2024}%.
                </p>
                <p className="mt-2 text-sm text-white/80">
                  Best month: {YANGON_TYRE_DATA_PROFILE.bestMonth2024.month} ({YANGON_TYRE_DATA_PROFILE.bestMonth2024.bPlusRRate}%).
                </p>
                <p className="mt-2 text-sm text-white/80">
                  Worst month: {YANGON_TYRE_DATA_PROFILE.worstMonth2024.month} ({YANGON_TYRE_DATA_PROFILE.worstMonth2024.bPlusRRate}%).
                </p>
                <p className="mt-2 text-sm text-white/80">Top defects: {YANGON_TYRE_DATA_PROFILE.topDefects.slice(0, 4).join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Production lines: {YANGON_TYRE_DATA_PROFILE.productionLines.join(' / ')}</p>
              </article>

              <article className="sm-proof-card">
                <p className="font-semibold text-white">Open build gaps</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">
                  These are the missing modules or missing crews blocking Yangon Tyre apps from moving into harder daily use.
                </p>
                <div className="mt-4 grid gap-3">
                  {ytfFoundryGapQueue.length > 0 ? (
                    ytfFoundryGapQueue.map((gap) => (
                      <div className="sm-chip text-white" key={`${gap.gapType}-${gap.label}`}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold">{gap.label}</p>
                          <span className={`sm-status-pill ${statusTone(gap.gapType === 'module' ? 'queued' : 'mapped')}`}>{gap.gapType}</span>
                        </div>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">Needed by: {gap.appNames.join(', ')}</p>
                      </div>
                    ))
                  ) : (
                    <div className="sm-chip text-white">
                      <p className="font-semibold">No open structural gap</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">The current tenant app line has module and crew coverage mapped for every blueprint.</p>
                    </div>
                  )}
                </div>
              </article>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {ytfFoundryBoard.map((row) => (
                <article className="sm-proof-card" key={row.blueprint.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="sm-kicker text-[var(--sm-accent)]">{row.blueprint.workspace}</p>
                      <h3 className="mt-2 text-2xl font-bold text-white">{row.blueprint.name}</h3>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`sm-status-pill ${statusTone(row.posture)}`}>{row.posture}</span>
                      <span className="sm-status-pill">{row.readinessScore}% ready</span>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-white/80">Benchmarks: {row.blueprint.incumbents.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/80">Roles: {row.roleHomes.join(', ') || 'Manager and operator routing still needs role-home mapping.'}</p>
                  <p className="mt-2 text-sm text-white/80">Data spine: {row.dataSources.join(', ') || 'Drive and form sources still need app-level mapping.'}</p>
                  <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 md:grid-cols-3">
                    {[
                      {
                        label: 'Current workflow',
                        caption: 'Current workflow',
                        value: row.blueprint.thesis,
                      },
                      {
                        label: 'Failure and conflict',
                        caption: 'Failure and conflict',
                        value: row.blueprint.antithesis,
                      },
                      {
                        label: 'AI-native model',
                        caption: 'AI-native model',
                        value: row.blueprint.synthesis,
                      },
                    ].map((item) => (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3" key={`${row.blueprint.id}-${item.label}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">{item.label}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--sm-muted)]">{item.caption}</p>
                        <p className="mt-3 text-sm leading-relaxed text-white/80">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-white/70">
                    {row.moduleStatuses.map((module) => (
                      <span className={statusTone(module.state)} key={`${row.blueprint.id}-module-${module.requirement.key}`}>
                        {module.requirement.name}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-white/70">
                    {row.crewStatuses.map((crew) => (
                      <span className={statusTone(crew.state)} key={`${row.blueprint.id}-crew-${crew.requirement.id}`}>
                        {crew.requirement.name}
                      </span>
                    ))}
                  </div>

                  <p className="mt-3 text-sm text-white/80">Required artifacts: {row.blueprint.requiredArtifacts.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/80">Success signal: {row.blueprint.successSignals[0]}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.nextBuildGap}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link className="sm-link" to={row.blueprint.route}>
                      Open app
                    </Link>
                    <span className="text-xs uppercase tracking-[0.16em] text-white/50">
                      Missing: {row.missingModules.length + row.missingCrews.length}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </article>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <article className="sm-site-panel">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Current source spine</p>
                <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The app line is now tied to the real Yangon Tyre Drive evidence already in hand.</h2>
              </div>
              <div className="mt-6 grid gap-3">
                {YANGON_TYRE_SOURCE_PACKS.map((pack) => (
                  <article className="sm-proof-card" key={pack.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{pack.name}</p>
                      <span className={`sm-status-pill ${statusTone(pack.status)}`}>{pack.status}</span>
                    </div>
                    <p className="mt-3 text-sm text-white/80">{pack.sourceType}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{pack.evidence}</p>
                    <p className="mt-2 text-sm text-white/80">Feeds: {pack.feedsApps.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Why it matters: {pack.note}</p>
                  </article>
                ))}
              </div>
            </article>

            <article className="sm-site-panel">
              <div>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Progressive connector expansion</p>
                <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Website, analytics, social, and chat channels plug into the same tenant machine next.</h2>
              </div>
              <div className="mt-6 grid gap-3">
                {YANGON_TYRE_CONNECTOR_EXPANSION.map((item) => (
                  <article className="sm-chip text-white" key={item.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{item.name}</p>
                      <span className={`sm-status-pill ${statusTone(item.status)}`}>{item.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.purpose}</p>
                    <p className="mt-2 text-sm text-white/80">Apps: {item.apps.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">First jobs: {item.firstJobs.join(', ')}</p>
                  </article>
                ))}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Fast build loops</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Gen AI and data science should accelerate product updates, not create demo noise.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {RAPID_DELIVERY_LOOPS.map((loop) => (
              <article className="sm-chip text-white" key={loop.id}>
                <p className="font-semibold">{loop.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{loop.purpose}</p>
                <p className="mt-2 text-sm text-white/80">Artifacts: {loop.artifacts.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Agents: {loop.agents.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Scale lanes</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Modules should graduate from one team to many tenants without changing the product shape.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {TENANT_SCALE_LANES.map((lane) => (
              <article className="sm-demo-link sm-demo-link-card" key={lane.id}>
                <strong>{lane.stage}</strong>
                <span>{lane.focus}</span>
                <small className="text-[var(--sm-muted)]">Adds: {lane.adds.join(', ')}</small>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Enterprise module families</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The factory should be building repeatable operating systems, not isolated features.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {ENTERPRISE_MODULE_FAMILIES.map((family) => (
              <article className="sm-proof-card" key={family.id}>
                <p className="font-semibold text-white">{family.name}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{family.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Functions: {family.functions.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Meta tools: {family.metaTools.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Workspace frameworks</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Every program should land on one proven workspace pattern.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {WORKSPACE_FRAMEWORKS.map((framework) => (
              <article className="sm-chip text-white" key={framework.id}>
                <p className="font-semibold">{framework.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{framework.purpose}</p>
                <p className="mt-2 text-sm text-white/80">Surfaces: {framework.surfaces.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Open stack: {framework.openStack.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Open-source stack</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Shared technical layers should compound across every tenant and module.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {OPEN_SOURCE_STACK_LAYERS.map((layer) => (
              <article className="sm-proof-card" key={layer.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{layer.name}</p>
                  <span className="sm-status-pill">{layer.status}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{layer.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Tools: {layer.tools.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">AI operating loops</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Delegation should be designed as named loops with outputs and review gates.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {AI_OPERATING_LOOPS.map((loop) => (
              <article className="sm-chip text-white" key={loop.id}>
                <p className="font-semibold">{loop.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{loop.purpose}</p>
                <p className="mt-2 text-sm text-white/80">Outputs: {loop.outputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Gate: {loop.reviewGate}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Product ownership</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each program ships with a named owner, a release train, a real customer rollout, and a clear next decision.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            This is the build rule we bring to the market: assign ownership, keep the proofs honest, and measure the next move inside the same surface.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {MODULE_PROGRAMS.map((program) => (
            <article className="sm-demo-link sm-demo-link-card" key={`product-owner-${program.id}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{program.stage}</span>
                <span className="sm-status-pill">{program.owner}</span>
              </div>
              <strong>{program.name}</strong>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{program.target}</p>
              <p className="mt-2 text-sm text-white/80">{program.commercialStory}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-white/60">
                {program.modules.map((module) => (
                  <span key={`${program.id}-${module}`}>{module}</span>
                ))}
              </div>
              <p className="mt-2 text-sm text-white/70">Release train: {program.releaseTrain}</p>
              <p className="mt-2 text-sm text-white/70">Internal crews: {program.agentCrews.join(', ')}</p>
              <p className="mt-2 text-sm text-white/70">Live tenant: {program.tenantProof}</p>
              <p className="mt-2 text-sm text-white/70">Next move: {program.nextMove}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Why clients care</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">A better build model creates better rollout results.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            This internal structure matters because clients do not want a nice demo. They want faster rollout, cleaner ownership, safer automation, and a system that can keep improving after launch.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            'Start from one painful workflow instead of a giant transformation project.',
            'Use real files, inboxes, exports, and roles early so rollout risk shows up before launch.',
            'Promote only the modules that survive tenant reality and release gates.',
            'Keep connectors, policy, and agent crews deepening the runtime after go-live.',
          ].map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item}>
              <strong>Client result</strong>
              <span>{item}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Build teams</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Human teams own the product areas. Agent teams keep the build system moving.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The internal company should already look like the platform we want to sell: bounded ownership, named workspaces, review rituals, and module
            promotion criteria.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {BUILD_TEAMS.map((team) => (
            <article className="sm-demo-link sm-demo-link-card" key={team.id}>
              <span className="sm-home-proof-label">{team.workspace}</span>
              <strong>{team.name}</strong>
              <span>{team.mission}</span>
              <small className="text-[var(--sm-muted)]">Owns: {team.ownership.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Agent crews: {team.agentPods.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Cadence: {team.rituals.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Success: {team.metric}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent)]">Build workspaces</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each workspace exists to move one type of work forward.</h2>
          <div className="mt-6 grid gap-3">
            {BUILD_WORKSPACES.map((workspace) => (
              <article className="sm-proof-card" key={workspace.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{workspace.name}</p>
                  <span className="sm-status-pill">{workspace.reviewCadence}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{workspace.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Owners: {workspace.owners.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Surfaces: {workspace.surfaces.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Autonomous teams</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Agents should be employed into bounded workspaces with explicit access and gates.</h2>
          <div className="mt-6 grid gap-3">
            {INTERNAL_AGENT_CREWS.map((crew) => (
              <article className="sm-chip text-white" key={crew.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{crew.name}</p>
                  <span className="sm-status-pill">{crew.cadence}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{crew.mission}</p>
                <p className="mt-2 text-sm text-white/80">Workspace: {crew.workspace}</p>
                <p className="mt-2 text-sm text-white/80">Read: {crew.readScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Write: {crew.writeScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Gate: {crew.approvalGate}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Research teams</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">A product company needs named research teams, not one vague catch-all team.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These cells translate raw company signal into connector depth, workflow contracts, knowledge canon, decision systems, and safe autonomy.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {RESEARCH_CELLS.map((cell) => (
            <article className="sm-demo-link sm-demo-link-card" key={cell.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{cell.ownedBy}</span>
                <span className="sm-status-pill">{cell.supports.join(' / ')}</span>
              </div>
              <strong>{cell.name}</strong>
              <span>{cell.mandate}</span>
              <small className="text-[var(--sm-muted)]">Inputs: {cell.inputs.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Outputs: {cell.outputs.join(', ')}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Product programs</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the product lines that can actually challenge the suite vendors.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Keep each program tied to a target category, a real customer rollout, and a precise next move. That is how the roadmap stays commercial instead
            of becoming a vague innovation list.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {MODULE_PROGRAMS.map((program) => (
            <article className="sm-demo-link sm-demo-link-card" key={program.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{program.stage}</span>
                <span className="sm-status-pill">{program.owner}</span>
              </div>
              <strong>{program.name}</strong>
              <span>{program.target}</span>
              <small className="text-[var(--sm-muted)]">{program.commercialStory}</small>
              <small className="text-[var(--sm-muted)]">Market: {program.market}</small>
              <small className="text-[var(--sm-muted)]">Build team: {program.researchCell}</small>
              <small className="text-[var(--sm-muted)]">Starts with: {program.starterWedge}</small>
              <small className="text-[var(--sm-muted)]">Release train: {program.releaseTrain}</small>
              <small className="text-[var(--sm-muted)]">Live tenant: {program.tenantProof}</small>
              <small className="text-[var(--sm-muted)]">Modules: {program.modules.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Internal crews: {program.agentCrews.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Differentiator: {program.differentiator}</small>
              <small className="text-[var(--sm-muted)]">Success signals: {program.successSignals.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Adds next: {program.nextReleases.join(', ')}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Release gates</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Do not let strong demos masquerade as finished enterprise modules.</h2>
          <div className="mt-6 grid gap-3">
            {RELEASE_GATES.map((gate) => (
              <article className="sm-proof-card" key={gate.id}>
                <p className="font-semibold text-white">{gate.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{gate.question}</p>
                <p className="mt-3 text-sm text-white/80">Signals: {gate.requiredSignals.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Exit: {gate.exitCriteria}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Priority infrastructure</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the infrastructure bets that make the platform stronger.</h2>
          <div className="mt-6 grid gap-3">
            {RESEARCH_PRIORITIES.map((priority) => (
              <article className="sm-chip text-white" key={priority.id}>
                <p className="font-semibold">{priority.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{priority.thesis}</p>
                <p className="mt-2 text-sm text-white/80">Graduation: {priority.graduation}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Competitive fronts</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">SUPERMEGA.dev wins by shipping narrower, learning faster, and sharing more of the core system.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The strategy is not one more suite. It is a faster build system that turns real operator pain into live modules before the big vendors can
            respond.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {COMPETITIVE_FRONTS.map((front) => (
            <article className="sm-demo-link sm-demo-link-card" key={front.id}>
              <span className="sm-home-proof-label">{front.name}</span>
              <strong>{front.incumbents}</strong>
              <span>{front.supermegaAngle}</span>
              <small className="text-[var(--sm-muted)]">{front.whyItMatters}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Run the company like a product build system with release gates, not like a demo shop.</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)]">
            The next compounding move is to keep routing research, pilots, product promotion, connector depth, and tenant launches through the same
            operating layer.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/app/teams">
            See Agent Teams
          </Link>
          <Link className="sm-button-secondary" to="/portfolio">
            View portfolio
          </Link>
          <Link className="sm-button-secondary" to="/contact">
            Start rollout
          </Link>
          <Link className="sm-button-secondary" to="/platform">
            See Enterprise Setup
          </Link>
          <Link className="sm-button-secondary" to="/clients/yangon-tyre">
            Open tenant example
          </Link>
        </div>
      </section>
    </div>
  )
}
