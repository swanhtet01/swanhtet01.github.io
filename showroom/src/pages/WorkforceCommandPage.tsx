import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { applyWorkforceAutomation, loadWorkforceRegistry, type WorkforceRegistryPayload } from '../lib/workforceCommandApi'
import {
  processAgentRunQueue,
  queueDefaultAgentJobs,
  runDefaultAgentJobs,
  updateWorkspaceTask,
} from '../lib/workspaceApi'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'

const workforceCapabilities = [
  'actions.view',
  'approvals.view',
  'sales.view',
  'receiving.view',
  'dqms.view',
  'maintenance.view',
  'tenant_admin.view',
  'platform_admin.view',
] as const

const workforceManageRoles = new Set([
  'manager',
  'owner',
  'ceo',
  'director',
  'tenant_admin',
  'platform_admin',
  'product_owner',
  'implementation_lead',
])

function formatDateTime(value: string | null) {
  if (!value) {
    return 'No live timestamp yet'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function toneForMetric(value: number) {
  if (value >= 80) {
    return 'text-emerald-300'
  }
  if (value >= 50) {
    return 'text-sky-300'
  }
  return 'text-amber-300'
}

function toneForStatus(value: string) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'healthy' || normalized === 'ready' || normalized === 'assigned' || normalized === 'live') {
    return 'text-emerald-300'
  }
  if (normalized === 'attention' || normalized === 'needs assignment' || normalized === 'warning') {
    return 'text-amber-300'
  }
  if (normalized === 'mapped') {
    return 'text-sky-300'
  }
  return 'text-white'
}

function formatLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

export function WorkforceCommandPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [canManage, setCanManage] = useState(false)
  const [payload, setPayload] = useState<WorkforceRegistryPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [automationBusy, setAutomationBusy] = useState(false)
  const [preferredCycleBusy, setPreferredCycleBusy] = useState(false)
  const [drainQueueBusy, setDrainQueueBusy] = useState(false)
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: [...workforceCapabilities],
        unauthenticatedMessage: 'Login is required to open Workforce Command.',
        previewMessage: 'Workforce Command only runs inside the authenticated workspace.',
      })

      if (cancelled) {
        return
      }

      setAccess(nextAccess)
      if (!nextAccess.authenticated || !nextAccess.allowed) {
        setCanManage(false)
        setLoading(false)
        return
      }

      try {
        if (!cancelled) {
          setCanManage(workforceManageRoles.has(nextAccess.roleKey))
        }
        const nextPayload = await loadWorkforceRegistry()
        if (!cancelled) {
          setPayload(nextPayload)
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'The workforce registry could not be loaded.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function refreshRegistry() {
    setRefreshing(true)
    try {
      const nextPayload = await loadWorkforceRegistry()
      setPayload(nextPayload)
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The workforce registry could not be refreshed.')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleSyncWorkforce() {
    if (!canManage || !payload) {
      return
    }
    setAutomationBusy(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await applyWorkforceAutomation({
        applyAssignments: true,
        seedReviewCycles: true,
        queueDefaultJobs: payload.live.preferredWorkforceMode === 'queue_worker',
        processQueue: false,
        limit: 8,
        source: 'workforce_command',
      })
      if (result.registry) {
        setPayload(result.registry)
      } else {
        await refreshRegistry()
      }
      setActionMessage(result.message || 'Synced assignments, review tasks, and automation posture.')
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : 'Could not sync the workforce control loop.')
    } finally {
      setAutomationBusy(false)
    }
  }

  async function handleRunPreferredCycle() {
    if (!canManage || !payload) {
      return
    }
    setPreferredCycleBusy(true)
    setActionError(null)
    setActionMessage(null)
    try {
      if (payload.live.preferredWorkforceMode === 'queue_worker') {
        const result = await queueDefaultAgentJobs()
        setActionMessage(
          Number(result.queued_count ?? result.count ?? result.rows?.length ?? 0) > 0
            ? `Queued ${Number(result.queued_count ?? result.count ?? result.rows?.length ?? 0)} workforce jobs for the cloud worker lane.`
            : 'Queued the preferred workforce cycle.',
        )
      } else {
        const result = await runDefaultAgentJobs()
        setActionMessage(
          Number(result.count ?? result.rows?.length ?? 0) > 0
            ? `Started ${Number(result.count ?? result.rows?.length ?? 0)} direct workforce jobs.`
            : 'Started the preferred workforce cycle.',
        )
      }
      await refreshRegistry()
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : 'Could not run the preferred workforce cycle.')
    } finally {
      setPreferredCycleBusy(false)
    }
  }

  async function handleDrainQueue() {
    if (!canManage) {
      return
    }
    setDrainQueueBusy(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await processAgentRunQueue(undefined, 8)
      setActionMessage(
        Number(result.processed_count ?? result.count ?? result.rows?.length ?? 0) > 0
          ? `Processed ${Number(result.processed_count ?? result.count ?? result.rows?.length ?? 0)} queued jobs.`
          : 'Queue drain completed with no queued jobs to process.',
      )
      await refreshRegistry()
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : 'Could not drain the queue.')
    } finally {
      setDrainQueueBusy(false)
    }
  }

  async function handleApplySuggestedOwner(taskId: string, suggestedOwner: string) {
    if (!canManage || !taskId || !suggestedOwner) {
      return
    }
    setAssigningTaskId(taskId)
    setActionError(null)
    setActionMessage(null)
    try {
      await updateWorkspaceTask(taskId, { owner: suggestedOwner })
      setActionMessage(`Assigned ${suggestedOwner} to the selected task.`)
      await refreshRegistry()
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : 'Could not assign the selected task.')
    } finally {
      setAssigningTaskId(null)
    }
  }

  if (loading || access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Workforce command"
          title="Loading the workforce registry."
          description="Checking workspace scope, team charters, and live workforce posture."
        />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Workforce command"
          title="Authenticated workspace required."
          description="This desk exposes internal team charters, playbooks, and live operating loops, so it only runs inside the live app."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error ?? 'Login is required to open Workforce Command.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/workforce">
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
          eyebrow="Workforce command"
          title="Workforce access required."
          description="This desk is available to workstream and admin roles that use or govern the operating workforce."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Current role: {access.roleLabel}. Ask an admin to grant one of the workstream or tenant-admin control scopes if this desk should be visible.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/meta">
              Open meta
            </Link>
            <Link className="sm-button-secondary" to="/app/actions">
              Open my queue
            </Link>
          </div>
        </section>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Workforce command"
          title="The workforce registry is unavailable."
          description="The backend did not return a usable workforce payload."
        />
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{error ?? 'No workforce payload returned.'}</p>
        </section>
      </div>
    )
  }

  const needsAssignmentCount = payload.live.assignmentBoard.filter((item) => item.status === 'Needs assignment').length
  const attentionReviewCount = payload.live.reviewCycles.filter((cycle) => cycle.status !== 'Healthy').length
  const attentionAutomationCount = payload.live.automationLanes.filter((lane) => lane.status !== 'ready' && lane.status !== 'healthy' && lane.status !== 'live').length
  const preferredModeLabel = payload.live.preferredWorkforceMode === 'queue_worker' ? 'Queue-first' : 'Direct batch'

  return (
    <div className="space-y-8 pb-12">
      <PageIntro
        eyebrow="Workforce command"
        title={`Run ${payload.title} as a real team system.`}
        description={`${payload.dialectic.synthesis} This desk merges role homes, build teams, instruction packs, playbooks, and live workforce posture instead of leaving them scattered across models and notes.`}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Playbooks</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload.summary.playbookCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{payload.summary.activePlaybookCount} recent runs are still active or freshly queued.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Build teams</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload.summary.buildTeamCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">
            {payload.summary.delegatedPodCount} delegated pods back the control layer, with {payload.summary.coreTeamCount} named core-team members.
          </p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Workspaces</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload.summary.workspaceCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">
            Named lanes with explicit purpose, owners, and {payload.summary.reviewCycleCount} review cycles.
          </p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Instruction packs</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload.summary.instructionPackCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{payload.summary.roleCount} role cells are explicitly modeled in this tenant.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Coverage score</p>
          <p className={`mt-3 text-3xl font-bold ${toneForMetric(payload.summary.coverageScore)}`}>{payload.summary.coverageScore}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Enabled modules {payload.summary.enabledModuleCount}, members {payload.summary.memberCount}, open tasks {payload.summary.openTaskCount}.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Cloud posture</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload.summary.cloudReadyCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">
            Ready surfaces, with {payload.summary.automationLaneCount} automation lanes, {payload.summary.cloudAttentionCount} attention items, and{' '}
            {payload.summary.cloudBlockerCount} blockers.
          </p>
        </article>
      </section>

      <section className="sm-chip text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-semibold">{payload.workspace.workspaceName || 'Current workspace'}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              Updated {formatDateTime(payload.updatedAt)}. Supervisor {payload.live.supervisor.status || 'unknown'}, cycle count {payload.live.supervisor.cycleCount},
              last finished {formatDateTime(payload.live.supervisor.lastFinishedAt)}. Preferred automation mode{' '}
              {formatLabel(payload.live.preferredWorkforceMode || 'direct_batch')}.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="sm-button-secondary" disabled={refreshing} onClick={() => void refreshRegistry()} type="button">
              {refreshing ? 'Refreshing...' : 'Refresh registry'}
            </button>
            <Link className="sm-button-secondary" to="/app/cloud">
              Cloud Ops
            </Link>
            <Link className="sm-button-secondary" to="/app/teams">
              Agent Ops
            </Link>
            <Link className="sm-button-secondary" to="/app/workbench">
              Workbench
            </Link>
          </div>
        </div>
      </section>

      <section className="sm-surface-deep p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Core team control</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Link data, tasks, review, and automation from one desk.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
              This control loop works with the current workspace members and current task board. It applies suggested owners, seeds missing manager reviews, and runs the preferred workforce mode without leaving Workforce Command.
            </p>
          </div>
          <span className="sm-status-pill">{preferredModeLabel}</span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="sm-proof-card">
            <p className="sm-kicker text-[var(--sm-accent)]">Needs assignment</p>
            <p className="mt-3 text-3xl font-bold text-white">{needsAssignmentCount}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Tasks that still need a named owner instead of a generic lane.</p>
          </article>
          <article className="sm-proof-card">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Review pressure</p>
            <p className="mt-3 text-3xl font-bold text-white">{attentionReviewCount}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Review cycles currently flagged for attention or missing data wiring.</p>
          </article>
          <article className="sm-proof-card">
            <p className="sm-kicker text-[var(--sm-accent)]">Automation attention</p>
            <p className="mt-3 text-3xl font-bold text-white">{attentionAutomationCount}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Automation lanes that are not yet healthy, ready, or live.</p>
          </article>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="sm-button-primary" disabled={!canManage || automationBusy} onClick={() => void handleSyncWorkforce()} type="button">
            {automationBusy ? 'Syncing...' : 'Sync assignments and reviews'}
          </button>
          <button className="sm-button-secondary" disabled={!canManage || preferredCycleBusy} onClick={() => void handleRunPreferredCycle()} type="button">
            {preferredCycleBusy ? 'Running...' : `Run ${preferredModeLabel.toLowerCase()} cycle`}
          </button>
          <button className="sm-button-secondary" disabled={!canManage || drainQueueBusy} onClick={() => void handleDrainQueue()} type="button">
            {drainQueueBusy ? 'Draining...' : 'Drain queue'}
          </button>
        </div>
        {!canManage ? (
          <p className="mt-4 text-sm text-[var(--sm-muted)]">
            This workspace role can view the workforce registry but cannot change task ownership or trigger automation cycles.
          </p>
        ) : null}
        {actionMessage ? <p className="mt-4 text-sm text-emerald-300">{actionMessage}</p> : null}
        {actionError ? <p className="mt-4 text-sm text-rose-300">{actionError}</p> : null}
      </section>

      {error ? (
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{error}</p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Thesis</p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{payload.dialectic.thesis}</p>
        </article>
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Antithesis</p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{payload.dialectic.antithesis}</p>
        </article>
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Synthesis</p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{payload.dialectic.synthesis}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-surface p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Manager moves</p>
              <h2 className="mt-3 text-3xl font-bold text-white">The workforce has explicit operating rules.</h2>
            </div>
            <span className="sm-status-pill">{payload.managerMoves.length} rules</span>
          </div>
          <div className="mt-6 grid gap-3">
            {payload.managerMoves.map((move) => (
              <article className="sm-proof-card" key={move}>
                <p className="text-sm leading-relaxed text-[var(--sm-muted)]">{move}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Role cells</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Role homes and review loops are named.</h2>
            </div>
            <span className="sm-status-pill">{payload.roleCells.length} cells</span>
          </div>
          <div className="mt-6 grid gap-4">
            {payload.roleCells.length ? (
              payload.roleCells.map((cell) => (
                <article className="sm-proof-card" key={cell.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{cell.role}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{cell.home}</p>
                    </div>
                    <Link className="sm-status-pill" to={cell.route}>
                      Open home
                    </Link>
                  </div>
                  <p className="mt-4 text-sm text-white/80">Cadence: {cell.managerCadence}</p>
                  <p className="mt-2 text-sm text-white/80">Must capture: {cell.mustCapture.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/80">Outputs: {cell.usefulOutputs.join(', ')}</p>
                </article>
              ))
            ) : (
              <article className="sm-proof-card">
                <p className="text-sm text-[var(--sm-muted)]">This workspace is currently using build-team and playbook views without role-cell overlays.</p>
              </article>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Build teams</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Each team owns an explicit slice of the machine.</h2>
          <div className="mt-6 grid gap-4">
            {payload.buildTeams.map((team) => (
              <article className="sm-proof-card" key={team.id}>
                <p className="font-semibold text-white">{team.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{team.mission}</p>
                <p className="mt-4 text-sm text-white/80">Workspace: {team.workspace}</p>
                <p className="mt-2 text-sm text-white/80">Owns: {team.ownership.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Outputs: {team.outputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Agent pods: {team.agentPods.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Metric: {team.metric}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Workspaces</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The workforce runs inside named operating rooms.</h2>
          <div className="mt-6 grid gap-4">
            {payload.workspaces.map((workspace) => (
              <article className="sm-proof-card" key={workspace.id}>
                <p className="font-semibold text-white">{workspace.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{workspace.purpose}</p>
                <p className="mt-4 text-sm text-white/80">Owners: {workspace.owners.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Surfaces: {workspace.surfaces.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Review cadence: {workspace.reviewCadence}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Playbooks</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Instructions, tools, and escalation ladders are live.</h2>
          <div className="mt-6 grid gap-4">
            {payload.manifest.playbooks.map((playbook) => (
              <article className="sm-proof-card" key={playbook.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{playbook.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{playbook.mission}</p>
                  </div>
                  <span className="sm-status-pill">{playbook.leadRole}</span>
                </div>
                <p className="mt-4 text-sm text-white/80">Workspace: {playbook.workspace}</p>
                <p className="mt-2 text-sm text-white/80">Cadence: {playbook.cadence.join(' · ')}</p>
                <p className="mt-2 text-sm text-white/80">Outputs: {playbook.outputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Write policy: {playbook.writePolicy}</p>
                <p className="mt-3 text-sm text-white/80">Instructions: {playbook.instructions.slice(0, 3).join(' · ')}</p>
                <p className="mt-2 text-sm text-white/80">Escalate when: {playbook.escalateWhen.slice(0, 2).join(' · ') || 'No escalation rules recorded.'}</p>
                <p className="mt-2 text-sm text-white/80">
                  Tools: {playbook.tools.map((tool) => `${formatLabel(tool.toolId)} (${tool.mode})`).join(', ')}
                </p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Instruction packs</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Shared rules are attached to the workspace, not left in chat.</h2>
          <div className="mt-6 grid gap-4">
            {payload.instructionPacks.map((pack) => (
              <article className="sm-proof-card" key={pack.id}>
                <p className="font-semibold text-white">{pack.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">
                  {pack.audience} in {pack.workspace}
                </p>
                <div className="mt-4 grid gap-2">
                  {pack.instructions.map((instruction) => (
                    <p className="text-sm text-white/80" key={instruction}>
                      {instruction}
                    </p>
                  ))}
                </div>
                <p className="mt-4 text-sm text-[var(--sm-muted)]">Done when: {pack.doneWhen}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Core team</p>
              <h2 className="mt-3 text-3xl font-bold text-white">People, lanes, and live load are in one roster.</h2>
            </div>
            <span className="sm-status-pill">{payload.live.coreTeam.length} members</span>
          </div>
          <div className="mt-6 grid gap-4">
            {payload.live.coreTeam.map((member) => (
              <article className="sm-proof-card" key={member.memberId || `${member.name}-${member.role}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{member.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{formatLabel(member.role)}</p>
                  </div>
                  <Link className="sm-status-pill" to={member.homeRoute}>
                    Open lane
                  </Link>
                </div>
                <p className={`mt-4 text-sm font-semibold ${toneForStatus(member.status)}`}>{formatLabel(member.status || 'active')}</p>
                <p className="mt-2 text-sm text-white/80">
                  Open tasks {member.assignedOpenTaskCount}, high priority {member.assignedHighPriorityTaskCount}
                </p>
                <p className="mt-2 text-sm text-white/80">Focus: {member.capabilityFocus.join(', ') || 'No focus recorded yet.'}</p>
                <p className="mt-2 text-sm text-white/80">Programs: {member.linkedPrograms.join(', ') || 'No linked programs yet.'}</p>
                <p className="mt-2 text-sm text-white/80">Data links: {member.linkedDataDomains.join(', ') || 'No linked data domains yet.'}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{member.nextMove}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Assignment board</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Open work is routed against real teams and desks.</h2>
            </div>
            <span className="sm-status-pill">{payload.live.assignmentBoard.length} lanes</span>
          </div>
          <div className="mt-6 grid gap-4">
            {payload.live.assignmentBoard.map((item) => (
              <article className="sm-proof-card" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className={`mt-2 text-sm font-semibold ${toneForStatus(item.status)}`}>{item.status}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManage && item.suggestedOwner && item.currentOwner !== item.suggestedOwner ? (
                      <button
                        className="sm-button-secondary"
                        disabled={assigningTaskId === item.id}
                        onClick={() => void handleApplySuggestedOwner(item.id, item.suggestedOwner)}
                        type="button"
                      >
                        {assigningTaskId === item.id ? 'Assigning...' : `Assign ${item.suggestedOwner}`}
                      </button>
                    ) : null}
                    <Link className="sm-status-pill" to={item.route}>
                      Open desk
                    </Link>
                  </div>
                </div>
                <p className="mt-4 text-sm text-white/80">Priority: {formatLabel(item.priority || 'normal')}</p>
                <p className="mt-2 text-sm text-white/80">Current owner: {item.currentOwner}</p>
                <p className="mt-2 text-sm text-white/80">
                  Suggested owner: {item.suggestedOwner} ({formatLabel(item.suggestedRole)})
                </p>
                <p className="mt-2 text-sm text-white/80">Data signals: {item.dataSignals.join(', ') || 'No linked sources yet.'}</p>
                <p className="mt-2 text-sm text-white/80">Due: {item.due ? formatDateTime(item.due) : 'No due date set'}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.reason}</p>
                <p className="mt-2 text-sm text-white/80">{item.nextAction}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Review cycles</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Manager reviews are explicit and data-backed.</h2>
          <div className="mt-6 grid gap-4">
            {payload.live.reviewCycles.map((cycle) => (
              <article className="sm-proof-card" key={cycle.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{cycle.name}</p>
                    <p className={`mt-2 text-sm font-semibold ${toneForStatus(cycle.status)}`}>{cycle.status}</p>
                  </div>
                  <Link className="sm-status-pill" to={cycle.route}>
                    Open review
                  </Link>
                </div>
                <p className="mt-4 text-sm text-white/80">Cadence: {cycle.cadence}</p>
                <p className="mt-2 text-sm text-white/80">Owner: {cycle.ownerRole}</p>
                <p className="mt-2 text-sm text-white/80">Queue: {cycle.queueCount}</p>
                <p className="mt-2 text-sm text-white/80">Signals: {cycle.dataSignals.join(', ') || 'No signals mapped yet.'}</p>
                <p className="mt-2 text-sm text-white/80">Focus: {cycle.focus.join(', ') || 'No focus areas recorded.'}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{cycle.nextMove}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Automation lanes</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Cloud jobs are tied to desks and source systems.</h2>
          <div className="mt-6 grid gap-4">
            {payload.live.automationLanes.map((lane) => (
              <article className="sm-proof-card" key={lane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{lane.name}</p>
                    <p className={`mt-2 text-sm font-semibold ${toneForStatus(lane.status)}`}>{formatLabel(lane.status)}</p>
                  </div>
                  <Link className="sm-status-pill" to={lane.route}>
                    Open lane
                  </Link>
                </div>
                <p className="mt-4 text-sm text-white/80">Cadence: {lane.cadence}</p>
                <p className="mt-2 text-sm text-white/80">Mode: {lane.mode}</p>
                <p className="mt-2 text-sm text-white/80">Sources: {lane.sourceSystems.join(', ') || 'No source systems mapped yet.'}</p>
                <p className="mt-2 text-sm text-white/80">Latest run: {formatDateTime(lane.latestRunAt)}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{lane.queueSignal}</p>
                <p className="mt-2 text-sm text-white/80">{lane.nextMove}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Data links</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The workforce shows which data feeds the work.</h2>
          <div className="mt-6 grid gap-4">
            {payload.live.dataLinks.map((link) => (
              <article className="sm-proof-card" key={link.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{link.name}</p>
                    <p className={`mt-2 text-sm font-semibold ${toneForStatus(link.status)}`}>{formatLabel(link.status)}</p>
                  </div>
                  <Link className="sm-status-pill" to={link.route}>
                    Open source
                  </Link>
                </div>
                <p className="mt-4 text-sm text-white/80">Type: {formatLabel(link.sourceType)}</p>
                <p className="mt-2 text-sm text-white/80">Evidence count: {link.evidenceCount}</p>
                <p className="mt-2 text-sm text-white/80">Consumers: {link.consumers.join(', ') || 'No consumers recorded.'}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{link.nextAutomation}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Delegated pods</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The internal control pods have real boundaries.</h2>
          <div className="mt-6 grid gap-4">
            {payload.delegatedPods.map((pod) => (
              <article className="sm-proof-card" key={pod.id}>
                <p className="font-semibold text-white">{pod.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{pod.mission}</p>
                <p className="mt-4 text-sm text-white/80">Owns: {pod.owns.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Read scope: {pod.readScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Write scope: {pod.writeScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Review gate: {pod.reviewGate}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {pod.routes.map((route) => (
                    <Link className="sm-status-pill" key={`${pod.id}-${route.to}`} to={route.to}>
                      {route.label}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Live workforce posture</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Commands, run history, and next moves are attached.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Member roles</p>
              <div className="mt-4 grid gap-3">
                {payload.live.memberRoleCounts.map((item) => (
                  <div className="flex items-center justify-between text-sm text-white/80" key={item.key}>
                    <span>{formatLabel(item.key)}</span>
                    <span className="font-semibold text-white">{item.count}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Recent runs</p>
              <div className="mt-4 grid gap-3">
                {payload.live.recentRuns.slice(0, 5).map((run) => (
                  <div key={run.runId || `${run.jobType}-${run.startedAt}`}>
                    <p className="text-sm font-semibold text-white">{formatLabel(run.jobType)}</p>
                    <p className="mt-1 text-sm text-[var(--sm-muted)]">
                      {run.status || 'unknown'} · {run.summary || 'No summary'}
                    </p>
                    <p className="mt-1 text-xs text-white/60">{formatDateTime(run.finishedAt || run.startedAt)}</p>
                  </div>
                ))}
              </div>
            </article>
            <article className="sm-proof-card md:col-span-2">
              <p className="font-semibold text-white">Runnable commands</p>
              <div className="mt-4 grid gap-3">
                {payload.live.commands.length ? (
                  payload.live.commands.map((command) => (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4" key={command.id}>
                      <p className="font-semibold text-white">{command.label}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{command.detail}</p>
                      <code className="mt-3 block overflow-x-auto rounded-xl bg-black/40 px-3 py-2 text-xs text-sky-200">{command.command}</code>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--sm-muted)]">No live workforce commands are advertised yet.</p>
                )}
              </div>
            </article>
            <article className="sm-proof-card md:col-span-2">
              <p className="font-semibold text-white">Next moves</p>
              <div className="mt-4 grid gap-3">
                {payload.live.nextMoves.map((move) => (
                  <p className="text-sm text-[var(--sm-muted)]" key={move}>
                    {move}
                  </p>
                ))}
              </div>
            </article>
          </div>
        </article>
      </section>
    </div>
  )
}
