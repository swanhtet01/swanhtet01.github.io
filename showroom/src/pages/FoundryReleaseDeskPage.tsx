import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  AI_FOUNDRY_STAGES,
  EXPERIENCE_LAWS,
  FRONTIER_MODULE_CONCEPTS,
  FOUNDRY_DIALECTICS,
  FOUNDRY_HACKATHON_TRACKS,
} from '../lib/aiFoundryModel'
import { BUILD_TEAMS, BUILD_WORKSPACES, MODULE_FACTORY_STAGES, RELEASE_GATES, RESEARCH_PRIORITIES } from '../lib/companyBuildingModel'
import { buildFactoryGapQueue, buildFactoryProgramBoard, summarizeFactoryProgramBoard } from '../lib/moduleFactoryRuntime'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'
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

type FoundryManifestPlaybook = NonNullable<NonNullable<AgentTeamsPayload['manifest']>['playbooks']>[number]

function findBuildTeamName(teamId: string) {
  return BUILD_TEAMS.find((team) => team.id === teamId)?.name ?? teamId
}

function findWorkspaceName(workspaceId: string) {
  return BUILD_WORKSPACES.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId
}

function formatDateTime(value: string) {
  if (!value) {
    return 'Not recorded'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function normalizeFoundryKey(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function statusTone(status: string) {
  const normalized = String(status || '').trim().toLowerCase()
  if (
    normalized === 'enabled' ||
    normalized === 'active' ||
    normalized === 'completed' ||
    normalized === 'live sellable' ||
    normalized === 'release ready' ||
    normalized === 'live'
  ) {
    return 'text-emerald-300'
  }
  if (
    normalized === 'pilot' ||
    normalized === 'running' ||
    normalized === 'pilot expansion' ||
    normalized === 'pilot hardening' ||
    normalized === 'in build' ||
    normalized === 'crewed build'
  ) {
    return 'text-amber-300'
  }
  if (normalized === 'disabled' || normalized === 'error' || normalized === 'missing' || normalized === 'mapped only' || normalized === 'mapped') {
    return 'text-rose-300'
  }
  return 'text-white/70'
}

function isPromotionCriticalPlaybook(playbook: FoundryManifestPlaybook) {
  const haystack = normalizeFoundryKey([playbook.id, playbook.name, playbook.workspace, playbook.mission].join(' '))
  return [
    'launch',
    'foundry',
    'experience',
    'runtime',
    'knowledge',
    'quality',
    'manufacturing',
    'director',
    'data science',
    'commercial',
  ].some((keyword) => haystack.includes(keyword))
}

function matchLiveTeam(playbook: FoundryManifestPlaybook, teams: NonNullable<AgentTeamsPayload['teams']>) {
  const playbookKey = normalizeFoundryKey(playbook.name)
  const playbookTeamKey = normalizeFoundryKey(playbook.teamId)
  return (
    teams.find((team) => {
      const teamName = normalizeFoundryKey(team.name)
      const teamId = normalizeFoundryKey(team.team_id)
      return Boolean((playbookTeamKey && teamId === playbookTeamKey) || teamName === playbookKey)
    }) ?? null
  )
}

function buildPlaybookEvalRow(playbook: FoundryManifestPlaybook, liveTeam: NonNullable<AgentTeamsPayload['teams']>[number] | null) {
  const score =
    (liveTeam ? 35 : 0) +
    (liveTeam && ['active', 'live', 'completed'].includes(normalizeFoundryKey(liveTeam.status)) ? 10 : 0) +
    (String(playbook.writePolicy ?? '').trim() ? 20 : 0) +
    ((playbook.kpis?.length ?? 0) > 0 ? 20 : 0) +
    ((playbook.tools?.length ?? 0) > 0 ? 10 : 0) +
    ((playbook.cadence?.length ?? 0) > 0 ? 5 : 0)

  let posture = 'Mapped'
  if (score >= 85) {
    posture = 'Release ready'
  } else if (score >= 65) {
    posture = 'Pilot hardening'
  } else if (score >= 45) {
    posture = 'Crewed build'
  }

  return {
    playbook,
    liveTeam,
    score: Math.min(score, 100),
    posture,
    hasWritePolicy: Boolean(String(playbook.writePolicy ?? '').trim()),
    kpiCount: playbook.kpis?.length ?? 0,
    cadenceCount: playbook.cadence?.length ?? 0,
  }
}

function foundryTemplateId(prefix: 'release' | 'crew', taskId: string) {
  return `foundry:${prefix}:${taskId}`
}

export function FoundryReleaseDeskPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [liveLoading, setLiveLoading] = useState(true)
  const [liveMessage, setLiveMessage] = useState<string | null>(null)
  const [executionMessage, setExecutionMessage] = useState<string | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [seedReleaseBusy, setSeedReleaseBusy] = useState(false)
  const [seedCrewBusy, setSeedCrewBusy] = useState(false)
  const [controlPlane, setControlPlane] = useState<PlatformControlPlanePayload | null>(null)
  const [agentTeams, setAgentTeams] = useState<AgentTeamsPayload | null>(null)
  const [agentRuns, setAgentRuns] = useState<AgentRunRow[]>([])
  const activeUnitCount = new Set(FOUNDRY_HACKATHON_TRACKS.map((track) => track.unitId)).size
  const activeLaneCount = new Set(FOUNDRY_HACKATHON_TRACKS.flatMap((track) => track.workspaceIds)).size
  const uniqueModuleCount = new Set(FOUNDRY_HACKATHON_TRACKS.flatMap((track) => track.modules)).size
  const liveModules = useMemo(() => controlPlane?.modules?.rows ?? [], [controlPlane?.modules?.rows])
  const liveProgramBoard = useMemo(() => buildFactoryProgramBoard(liveModules), [liveModules])
  const liveProgramSummary = useMemo(() => summarizeFactoryProgramBoard(liveProgramBoard), [liveProgramBoard])
  const factoryGapQueue = useMemo(() => buildFactoryGapQueue(liveProgramBoard).slice(0, 6), [liveProgramBoard])
  const modulePromotionQueue = useMemo(
    () => liveModules.filter((row) => String(row.workspace_status || '').trim().toLowerCase() !== 'enabled').slice(0, 6),
    [liveModules],
  )
  const manifestPlaybooks = useMemo(() => agentTeams?.manifest?.playbooks ?? [], [agentTeams?.manifest?.playbooks])
  const liveTeams = useMemo(() => agentTeams?.teams ?? [], [agentTeams?.teams])
  const criticalPlaybookRows = useMemo(() => {
    return manifestPlaybooks
      .filter(isPromotionCriticalPlaybook)
      .map((playbook) => buildPlaybookEvalRow(playbook, matchLiveTeam(playbook, liveTeams)))
      .sort(
        (left, right) =>
          left.score - right.score || String(left.playbook.name ?? '').localeCompare(String(right.playbook.name ?? '')),
      )
      .slice(0, 6)
  }, [liveTeams, manifestPlaybooks])
  const evalGapRows = useMemo(() => (agentTeams?.gaps ?? []).slice(0, 6), [agentTeams?.gaps])
  const guardedPlaybookCount = useMemo(
    () => manifestPlaybooks.filter((playbook) => String(playbook.writePolicy ?? '').trim()).length,
    [manifestPlaybooks],
  )
  const kpiCoveredPlaybookCount = useMemo(
    () => manifestPlaybooks.filter((playbook) => (playbook.kpis?.length ?? 0) > 0).length,
    [manifestPlaybooks],
  )
  const liveMatchedPlaybookCount = useMemo(
    () => criticalPlaybookRows.filter((row) => row.liveTeam).length,
    [criticalPlaybookRows],
  )
  const nextMoves = useMemo(() => (agentTeams?.next_moves ?? []).slice(0, 4), [agentTeams?.next_moves])

  async function handleSeedReleaseSprint() {
    setSeedReleaseBusy(true)
    setExecutionMessage(null)
    setExecutionError(null)
    try {
      const taskBoard = await listWorkspaceTasks(undefined, 200)
      const existingTemplates = new Set(
        (taskBoard.rows ?? [])
          .map((row) => String(row.template ?? '').trim())
          .filter(Boolean),
      )
      const seedRows = (
        modulePromotionQueue.length > 0
          ? modulePromotionQueue.slice(0, 4).map((module) => ({
              id: module.module_id,
              title: `Promote ${module.name} through the next release gate`,
              owner: 'Foundry release pod',
              priority: 'High',
              due: 'This sprint',
              notes: `${module.summary} Current status: ${module.workspace_status}. Route: ${module.route}`,
            }))
          : FOUNDRY_HACKATHON_TRACKS.slice(0, 4).map((track) => ({
              id: track.id,
              title: `Ship ${track.name} through the foundry lane`,
              owner: findBuildTeamName(track.unitId),
              priority: 'High',
              due: 'This sprint',
              notes: `Modules: ${track.modules.join(', ')}. Workspace lanes: ${track.workspaceIds.map(findWorkspaceName).join(', ')}`,
            }))
      )
      const rowsToCreate = seedRows
        .filter((task) => !existingTemplates.has(foundryTemplateId('release', task.id)))
        .map((task) => ({
          title: task.title,
          owner: task.owner,
          priority: task.priority,
          due: task.due,
          status: 'open',
          notes: task.notes,
          template: foundryTemplateId('release', task.id),
        }))

      if (!rowsToCreate.length) {
        setExecutionMessage('Release sprint is already seeded into the workspace queue.')
        return
      }

      const payload = await createWorkspaceTasks(rowsToCreate)
      const savedCount = Number(payload.saved_count ?? payload.rows?.length ?? rowsToCreate.length)
      setExecutionMessage(`Seeded ${savedCount} foundry release tasks into the workspace queue.`)
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : 'Could not seed the release sprint right now.')
    } finally {
      setSeedReleaseBusy(false)
    }
  }

  async function handleSeedCrewHardening() {
    setSeedCrewBusy(true)
    setExecutionMessage(null)
    setExecutionError(null)
    try {
      const taskBoard = await listWorkspaceTasks(undefined, 200)
      const existingTemplates = new Set(
        (taskBoard.rows ?? [])
          .map((row) => String(row.template ?? '').trim())
          .filter(Boolean),
      )
      const seedRows = criticalPlaybookRows
        .filter((row) => row.score < 85)
        .slice(0, 4)
        .map((row) => ({
          id: String(row.playbook.id ?? row.playbook.name ?? 'crew'),
          title: `Harden ${row.playbook.name} before release promotion`,
          owner: row.liveTeam?.name || findBuildTeamName(String(row.playbook.teamId ?? 'release')),
          priority: 'High',
          due: 'This sprint',
          notes: `Score ${row.score}. Write policy: ${row.hasWritePolicy ? 'yes' : 'missing'}. KPI count: ${row.kpiCount}. Cadence count: ${row.cadenceCount}.`,
        }))
      const rowsToCreate = seedRows
        .filter((task) => !existingTemplates.has(foundryTemplateId('crew', task.id)))
        .map((task) => ({
          title: task.title,
          owner: task.owner,
          priority: task.priority,
          due: task.due,
          status: 'open',
          notes: task.notes,
          template: foundryTemplateId('crew', task.id),
        }))

      if (!rowsToCreate.length) {
        setExecutionMessage('Crew hardening sprint is already seeded into the workspace queue.')
        return
      }

      const payload = await createWorkspaceTasks(rowsToCreate)
      const savedCount = Number(payload.saved_count ?? payload.rows?.length ?? rowsToCreate.length)
      setExecutionMessage(`Seeded ${savedCount} crew-hardening tasks into the workspace queue.`)
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : 'Could not seed the crew hardening sprint right now.')
    } finally {
      setSeedCrewBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'],
        unauthenticatedMessage: 'Login is required to open the Foundry Release Desk.',
        previewMessage: 'Foundry Release Desk is only available in the authenticated workspace.',
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

    async function loadLiveDesk() {
      setLiveLoading(true)
      try {
        const health = await checkWorkspaceHealth()
        if (!health.ready) {
          if (!cancelled) {
            setLiveMessage('Workspace API is not connected on this host yet, so the release desk is showing model-backed flow only.')
            setLiveLoading(false)
          }
          return
        }

        const session = await getWorkspaceSession()
        if (!session.authenticated) {
          if (!cancelled) {
            setLiveMessage('Log in to see the live release posture, promotion queue, and recent agent activity.')
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

        const messages: string[] = []

        if (settled[0].status === 'fulfilled') {
          setAgentTeams(settled[0].value)
        } else {
          messages.push('AI workforce state could not be loaded.')
        }

        if (settled[1].status === 'fulfilled') {
          setAgentRuns(settled[1].value.rows ?? [])
        } else {
          messages.push('Recent agent runs are unavailable.')
        }

        if (settled[2].status === 'fulfilled') {
          setControlPlane(settled[2].value)
        } else if (canSeeModuleControl) {
          messages.push('Module control-plane data could not be loaded.')
        } else {
          messages.push('Live module control is reserved for tenant-admin and platform-admin roles.')
        }

        setLiveMessage(messages.length > 0 ? messages.join(' ') : null)
      } catch (error) {
        if (!cancelled) {
          setLiveMessage(error instanceof Error ? error.message : 'Live release state is unavailable right now.')
        }
      } finally {
        if (!cancelled) {
          setLiveLoading(false)
        }
      }
    }

    void loadLiveDesk()
    return () => {
      cancelled = true
    }
  }, [access.allowed, access.authenticated, access.loading])

  if (access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Foundry Release Desk"
          title="Loading the release desk."
          description="Checking workspace access for the internal foundry control layer."
        />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Foundry Release Desk"
          title="Authenticated workspace required."
          description="This desk is reserved for the live internal workspace and does not run in public preview mode."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            {access.error ?? 'Foundry Release Desk is only available in the authenticated workspace.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/foundry">
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
          eyebrow="Foundry Release Desk"
          title="Change-control access required."
          description="This desk is reserved for architecture, delivery, and tenant control roles that can promote modules into reusable releases."
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
        eyebrow="Foundry Release Desk"
        title="Run R&D as a shipping system."
        description="This is the focused build desk for SUPERMEGA.dev. It turns research, prototypes, tenant rollout, module promotion, and AI workforce ownership into one routed operating surface."
      />

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Operating desk</p>
            <h2 className="mt-2 text-3xl font-bold text-white">One page for the machine that builds the machine.</h2>
            <p className="mt-3 max-w-3xl text-sm text-[var(--sm-muted)]">
              Build Studio still holds the wider system map. Product Ops still tracks launch readiness. This desk is the tight execution layer between them.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={seedReleaseBusy} onClick={() => void handleSeedReleaseSprint()} type="button">
              {seedReleaseBusy ? 'Seeding release sprint...' : 'Seed release sprint'}
            </button>
            <button className="sm-button-secondary" disabled={seedCrewBusy} onClick={() => void handleSeedCrewHardening()} type="button">
              {seedCrewBusy ? 'Seeding crew sprint...' : 'Seed crew hardening'}
            </button>
            <Link className="sm-button-primary" to="/app/factory">
              Open Build Studio
            </Link>
            <Link className="sm-button-secondary" to="/app/product-ops">
              Open Product Ops
            </Link>
            <Link className="sm-button-secondary" to="/app/teams">
              Open Agent Ops
            </Link>
          </div>
        </div>
        {executionMessage ? <div className="mt-4 sm-chip text-white">{executionMessage}</div> : null}
        {executionError ? <div className="mt-4 sm-chip text-white">{executionError}</div> : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Hackathon tracks',
              value: String(FOUNDRY_HACKATHON_TRACKS.length),
              detail: 'Named release pushes with app route, proof route, and ship signal',
            },
            {
              label: 'Owning units',
              value: String(activeUnitCount),
              detail: 'R&D or platform teams directly accountable for promotion',
            },
            {
              label: 'Shared lanes',
              value: String(activeLaneCount),
              detail: 'Research, prototype, release, launch, and model rooms already wired',
            },
            {
              label: 'Modules in play',
              value: String(uniqueModuleCount),
              detail: 'Reusable module surfaces currently inside the active foundry push',
            },
          ].map((item) => (
            <article className="sm-proof-card" key={item.label}>
              <p className="text-sm uppercase tracking-[0.14em] text-[var(--sm-muted)]">{item.label}</p>
              <p className="mt-3 text-3xl font-bold text-white">{item.value}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <article className="sm-site-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Live release pulse</p>
              <h2 className="mt-2 text-3xl font-bold text-white">What the release desk can actually promote right now.</h2>
            </div>
            <p className="max-w-2xl text-sm text-[var(--sm-muted)]">
              This layer reads the same module control plane and AI workforce feeds used by Build Studio, then keeps the output focused on release posture.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                label: 'AI teams',
                value: `${agentTeams?.summary?.team_count ?? 0}`,
                detail: `${agentTeams?.summary?.manifest_playbook_count ?? 0} playbooks in the manifest`,
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
            <div className="mt-6 sm-chip text-white">Loading live release state...</div>
          ) : null}

          {liveMessage ? (
            <div className="mt-6 sm-chip text-white">
              <strong>Desk note</strong>
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
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Promotion queue</p>
            <h2 className="mt-2 text-3xl font-bold text-white">What is blocked, what is pilot, what still needs module work.</h2>
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
                <p className="font-semibold">No visible module waiting for promotion</p>
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

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-site-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Agent eval lane</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Promotion now includes crew maturity, guardrails, and KPI coverage.</h2>
            </div>
            <p className="max-w-2xl text-sm text-[var(--sm-muted)]">
              Enterprise completion means the crews that build and run the platform are measured, not just named. This lane scores the playbooks most critical to promotion.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Autonomy score',
                value: `${agentTeams?.summary?.autonomy_score ?? 0}`,
                detail: agentTeams?.summary?.autonomy_level || 'No live autonomy level yet',
              },
              {
                label: 'Guarded playbooks',
                value: `${guardedPlaybookCount}`,
                detail: `${manifestPlaybooks.length} total playbooks carry write-policy coverage`,
              },
              {
                label: 'KPI-covered crews',
                value: `${kpiCoveredPlaybookCount}`,
                detail: 'Playbooks with explicit KPI or quality targets',
              },
              {
                label: 'Live matched crews',
                value: `${liveMatchedPlaybookCount}/${criticalPlaybookRows.length || 0}`,
                detail: 'Promotion-critical playbooks with a live team attached',
              },
            ].map((item) => (
              <article className="sm-proof-card" key={item.label}>
                <p className="text-sm uppercase tracking-[0.14em] text-[var(--sm-muted)]">{item.label}</p>
                <p className="mt-3 text-3xl font-bold text-white">{item.value}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {criticalPlaybookRows.length > 0 ? (
              criticalPlaybookRows.map((row) => (
                <article className="sm-proof-card" key={row.playbook.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{row.playbook.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.playbook.workspace}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`sm-status-pill ${statusTone(row.posture)}`}>{row.posture}</span>
                      <span className="sm-status-pill">{row.score}% gate coverage</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">{row.playbook.mission}</p>
                  <p className="mt-3 text-sm text-white/80">
                    Live team: {row.liveTeam ? `${row.liveTeam.name} (${row.liveTeam.status})` : 'No live team currently matched'}
                  </p>
                  <p className="mt-2 text-sm text-white/80">
                    Controls: {row.hasWritePolicy ? 'write policy in place' : 'write policy missing'} · {row.kpiCount} KPIs · {row.cadenceCount} cadence rules
                  </p>
                  <p className="mt-2 text-sm text-white/80">Escalations: {(row.playbook.escalateWhen ?? []).slice(0, 2).join(' · ') || 'No escalation rules recorded'}</p>
                </article>
              ))
            ) : (
              <article className="sm-chip text-white">
                <p className="font-semibold">No manifest playbooks were returned</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">The release desk can still run on module posture, but the crew-eval lane needs Agent Ops manifest data.</p>
              </article>
            )}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Reliability backlog</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Open eval gaps and enterprise completion tracks.</h2>
          </div>

          <div className="mt-6 grid gap-3">
            {evalGapRows.length > 0 ? (
              evalGapRows.map((gap, index) => (
                <article className="sm-chip text-white" key={`${gap.gap_id ?? index}-${gap.problem ?? gap.next_step ?? 'gap'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{gap.problem || 'Unspecified gap'}</p>
                    <span className={`sm-status-pill ${statusTone(gap.severity || 'mapped')}`}>{gap.severity || 'Open'}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{gap.next_step || 'Next step has not been recorded yet.'}</p>
                </article>
              ))
            ) : (
              <article className="sm-chip text-white">
                <p className="font-semibold">No live agent gaps returned</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">The live payload did not report open workforce or evaluation gaps on this host.</p>
              </article>
            )}
          </div>

          <div className="mt-6 grid gap-3">
            {RESEARCH_PRIORITIES.map((priority) => (
              <article className="sm-proof-card" key={priority.id}>
                <p className="font-semibold text-white">{priority.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{priority.thesis}</p>
                <p className="mt-2 text-sm text-white/80">Graduation: {priority.graduation}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Build resolution method</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Each build track should resolve a real product tension.</h2>
          </div>
          <p className="max-w-2xl text-sm text-[var(--sm-muted)]">
            Each track resolves a real contradiction instead of adding another module because the category sounds impressive.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {FOUNDRY_DIALECTICS.map((item) => (
            <article className="sm-proof-card" key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{item.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Owner: {item.owner}</p>
                </div>
                <span className="sm-status-pill">Resolution</span>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="sm-chip text-white">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Current bet</p>
                  <p className="mt-2 text-sm text-white/85">{item.thesis}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Delivery risk</p>
                  <p className="mt-2 text-sm text-white/85">{item.antithesis}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Resolution path</p>
                  <p className="mt-2 text-sm text-white/85">{item.synthesis}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-white/80">Proves in: {item.provesIn.join(', ')}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Hackathon board</p>
            <h2 className="mt-2 text-3xl font-bold text-white">These are the active pushes that turn the platform into a product company.</h2>
          </div>
          <p className="max-w-2xl text-sm text-[var(--sm-muted)]">
            Every track names the owning unit, the build lanes, the modules being promoted, and the route where the proof must hold.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {FOUNDRY_HACKATHON_TRACKS.map((track) => (
            <article className="sm-demo-link sm-demo-link-card" key={track.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-home-proof-label">{track.sprint}</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">{track.name}</h3>
                </div>
                <span className="sm-status-pill">{findBuildTeamName(track.unitId)}</span>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-white/80">
                <p>
                  <span className="font-semibold text-white">Current bet:</span> {track.thesis}
                </p>
                <p>
                  <span className="font-semibold text-white">Delivery risk:</span> {track.antithesis}
                </p>
                <p>
                  <span className="font-semibold text-white">Resolution path:</span> {track.synthesis}
                </p>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-white/80">
                <p>
                  <span className="font-semibold text-white">Build lanes:</span>{' '}
                  {track.workspaceIds.map((workspaceId) => findWorkspaceName(workspaceId)).join(' -> ')}
                </p>
                <p>
                  <span className="font-semibold text-white">Modules:</span> {track.modules.join(', ')}
                </p>
                <p>
                  <span className="font-semibold text-white">Crew stack:</span> {track.crews.join(', ')}
                </p>
                <p>
                  <span className="font-semibold text-white">Ship signal:</span> {track.shipSignal}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="sm-link" to={track.appRoute}>
                  Open app
                </Link>
                <Link className="sm-link" to={track.proofRoute}>
                  Open proof
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Frontier modules</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Research-driven module ideas for the next enterprise wave.</h2>
          </div>
          <p className="max-w-2xl text-sm text-[var(--sm-muted)]">
            These are the next high-leverage bets pulled into the build system so research turns into a visible product queue instead of scattered notes.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {FRONTIER_MODULE_CONCEPTS.map((concept) => (
            <article className="sm-demo-link sm-demo-link-card" key={concept.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-home-proof-label">{concept.category}</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">{concept.name}</h3>
                </div>
                <span className="sm-status-pill">Research queue</span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{concept.whyNow}</p>
              <p className="mt-3 text-sm text-white/80">
                <span className="font-semibold text-white">Strategic bet:</span> {concept.thesis}
              </p>
              <p className="mt-2 text-sm text-white/80">
                <span className="font-semibold text-white">Platform move:</span> {concept.platformMove}
              </p>
              <p className="mt-2 text-sm text-white/80">
                <span className="font-semibold text-white">Borrows from:</span> {concept.borrowedFrom.join(' · ')}
              </p>
              <div className="mt-4">
                <Link className="sm-link" to={concept.route}>
                  Open related control surface
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Promotion flow</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Research becomes modules through explicit stages.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {MODULE_FACTORY_STAGES.map((stage, index) => (
              <article className="sm-chip text-white" key={stage.id}>
                <p className="font-semibold">
                  {index + 1}. {stage.name}
                </p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{stage.detail}</p>
                <p className="mt-2 text-sm text-white/80">Artifacts: {stage.artifacts.join(', ')}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3">
            {AI_FOUNDRY_STAGES.map((stage) => (
              <article className="sm-proof-card" key={stage.id}>
                <p className="font-semibold text-white">{stage.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{stage.detail}</p>
                <p className="mt-2 text-sm text-white/80">Crews: {stage.crews.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Release gates and lanes</p>
            <h2 className="mt-2 text-3xl font-bold text-white">The desk should know who owns promotion and what blocks it.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {RELEASE_GATES.map((gate) => (
              <article className="sm-proof-card" key={gate.id}>
                <p className="font-semibold text-white">{gate.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{gate.question}</p>
                <p className="mt-2 text-sm text-white/80">Signals: {gate.requiredSignals.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Exit: {gate.exitCriteria}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3">
            {BUILD_WORKSPACES.map((workspace) => (
              <article className="sm-chip text-white" key={workspace.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{workspace.name}</p>
                  <span className="sm-status-pill">{workspace.reviewCadence}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{workspace.purpose}</p>
                <p className="mt-2 text-sm text-white/80">Owners: {workspace.owners.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Experience law</p>
            <h2 className="mt-2 text-3xl font-bold text-white">The foundry only ships things staff can actually run.</h2>
          </div>
          <p className="max-w-2xl text-sm text-[var(--sm-muted)]">
            These laws keep the platform practical while the modules and agents get more powerful.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {EXPERIENCE_LAWS.map((item) => (
            <article className="sm-proof-card" key={item.title}>
              <p className="font-semibold text-white">{item.title}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
