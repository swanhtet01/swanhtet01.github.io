import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  getSupermegaDevControl,
  type SupermegaAssignmentRow,
  type SupermegaAutomationLaneRow,
  type SupermegaCoreTeamRow,
  type SupermegaDataLinkRow,
  type SupermegaDevControlPayload,
  type SupermegaDomainReport,
  type SupermegaResourceRow,
  type SupermegaReviewCycleRow,
} from '../lib/supermegaDevApi'
import { applyWorkforceAutomation, triggerPreviewDeploy, updateWorkspaceTask, verifyAllWorkspaceDomains, type WorkspaceDomainRow } from '../lib/workspaceApi'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'

const requiredCapabilities = ['tenant_admin.view', 'platform_admin.view'] as const
const publicDomainRoutes = ['/', '/platform/', '/products/', '/packages/', '/contact/']

function formatDateTime(value?: string | null) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return 'Not recorded yet'
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return raw
  }
  return parsed.toLocaleString()
}

function statusTone(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'ready' || normalized === 'healthy') {
    return 'text-emerald-300'
  }
  if (normalized === 'warning' || normalized === 'attention' || normalized === 'partial' || normalized === 'queued') {
    return 'text-amber-300'
  }
  if (normalized === 'unknown') {
    return 'text-sky-300'
  }
  return 'text-rose-300'
}

function rootReportStatus(report?: SupermegaDomainReport | null) {
  const normalized = String(report?.overall_status ?? '').trim().toLowerCase()
  if (normalized === 'warning') {
    return 'warning'
  }
  if (normalized === 'ready') {
    return 'ready'
  }
  return normalized || 'error'
}

function sharedAppStatus(row?: WorkspaceDomainRow | null) {
  const normalized = String(row?.status ?? '').trim().toLowerCase()
  if (normalized) {
    return normalized
  }
  if (String(row?.dns_status ?? '').trim() === 'ready' && String(row?.tls_status ?? '').trim() === 'ready' && String(row?.http_status ?? '').trim() === 'ready') {
    return 'ready'
  }
  if ([row?.dns_status, row?.tls_status, row?.http_status].some((value) => String(value ?? '').trim() === 'ready')) {
    return 'attention'
  }
  return 'blocked'
}

function resourceTone(resource: SupermegaResourceRow) {
  return resource.exists ? 'text-emerald-300' : 'text-rose-300'
}

function failureList(report?: SupermegaDomainReport | null) {
  const required = Array.isArray(report?.failures) ? report!.failures : []
  const optional = Array.isArray(report?.optional_failures) ? report!.optional_failures : []
  return [...required, ...optional].slice(0, 6)
}

function domainInventoryKey(row: WorkspaceDomainRow) {
  return String(row.domain_id || row.hostname)
}

function domainInventoryLabel(row: WorkspaceDomainRow) {
  return String(row.display_name || row.hostname)
}

function domainInventoryRuntime(row: WorkspaceDomainRow) {
  return String(row.runtime_target || 'Not mapped')
}

function domainInventoryRoute(row: WorkspaceDomainRow) {
  return String(row.route_root || '/')
}

function domainInventoryDeployment(row: WorkspaceDomainRow) {
  return String(row.deployment_url || 'Not recorded')
}

function normalizedOwner(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

function assignmentNeedsAttention(row: SupermegaAssignmentRow) {
  const currentOwner = normalizedOwner(row.current_owner)
  const suggestedOwner = normalizedOwner(row.suggested_owner)
  if (!suggestedOwner) {
    return false
  }
  if (!currentOwner || currentOwner === 'owner' || currentOwner === 'management' || currentOwner === 'unassigned') {
    return true
  }
  return currentOwner !== suggestedOwner
}

function operatorAssignmentNote(row: SupermegaAssignmentRow) {
  const notes = [String(row.next_action ?? '').trim(), `Assigned from supermega.dev operator board. ${String(row.reason ?? '').trim()}`.trim()]
  return notes.filter(Boolean).join('\n')
}

export function SupermegaDevPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [payload, setPayload] = useState<SupermegaDevControlPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [deployBusy, setDeployBusy] = useState(false)
  const [workforceBusy, setWorkforceBusy] = useState(false)
  const [assignmentBusyId, setAssignmentBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: [...requiredCapabilities],
        unauthenticatedMessage: 'Login is required to manage supermega.dev.',
        previewMessage: 'supermega.dev management only works in the authenticated workspace.',
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
    if (!access.allowed) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function hydrate(options?: { quiet?: boolean }) {
      const quiet = Boolean(options?.quiet)
      if (quiet) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      try {
        const nextPayload = await getSupermegaDevControl()
        if (cancelled) {
          return
        }
        setPayload(nextPayload)
        setError(null)
      } catch {
        if (!cancelled) {
          setError('supermega.dev control data could not be loaded on this host.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void hydrate()
    const intervalId = window.setInterval(() => {
      void hydrate({ quiet: true })
    }, 60000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [access.allowed])

  const machine = payload?.machine
  const platform = payload?.platform
  const cloud = payload?.cloud
  const workforce = payload?.workforce
  const domains = payload?.domains
  const rootReport = domains?.root_report
  const sharedAppDomain = domains?.shared_app_domain
  const topologyRows = useMemo<WorkspaceDomainRow[]>(
    () => (Array.isArray(cloud?.topology?.rows) ? cloud?.topology?.rows : Array.isArray(domains?.workspace_rows) ? domains?.workspace_rows : []),
    [cloud?.topology?.rows, domains?.workspace_rows],
  )
  const deploymentScripts = Array.isArray(payload?.deployment?.scripts) ? payload!.deployment!.scripts! : []
  const smokeScripts = Array.isArray(payload?.smoke?.scripts) ? payload!.smoke!.scripts! : []
  const codeResources = Array.isArray(payload?.resources?.code) ? payload!.resources!.code! : []
  const dataResources = Array.isArray(payload?.resources?.data) ? payload!.resources!.data! : []
  const instructionResources = Array.isArray(payload?.resources?.instructions) ? payload!.resources!.instructions! : []
  const coreTeam = Array.isArray(workforce?.core_team) ? workforce.core_team : []
  const assignmentBoard = Array.isArray(workforce?.assignment_board) ? workforce.assignment_board : []
  const reviewCycles = Array.isArray(workforce?.review_cycles) ? workforce.review_cycles : []
  const automationLanes = Array.isArray(workforce?.automation_lanes) ? workforce.automation_lanes : []
  const nextMoves = Array.isArray(workforce?.next_moves) ? workforce.next_moves : []
  const linkedDataSources = Array.isArray(workforce?.data_links) ? workforce.data_links : []
  const rootFailures = failureList(rootReport)

  async function refreshControl() {
    setRefreshing(true)
    setActionError(null)
    try {
      const nextPayload = await getSupermegaDevControl()
      setPayload(nextPayload)
      setError(null)
    } catch {
      setActionError('The refresh did not complete.')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleVerifyDomains() {
    setVerifyBusy(true)
    setActionMessage(null)
    setActionError(null)
    try {
      const result = await verifyAllWorkspaceDomains(publicDomainRoutes)
      setActionMessage(`Verified ${result.verified_count ?? 0} workspace domain${result.verified_count === 1 ? '' : 's'}.`)
      const nextPayload = await getSupermegaDevControl()
      setPayload(nextPayload)
    } catch {
      setActionError('Workspace domain verification did not complete on this host.')
    } finally {
      setVerifyBusy(false)
    }
  }

  async function handleDeployPreview() {
    setDeployBusy(true)
    setActionMessage(null)
    setActionError(null)
    try {
      const result = await triggerPreviewDeploy()
      const previewUrl = String(result.result?.previewUrl ?? result.result?.deploymentUrl ?? result.result?.url ?? '').trim()
      setActionMessage(previewUrl ? `Preview deploy started: ${previewUrl}` : 'Preview deploy started.')
      const nextPayload = await getSupermegaDevControl()
      setPayload(nextPayload)
    } catch {
      setActionError('Preview deploy did not complete on this host.')
    } finally {
      setDeployBusy(false)
    }
  }

  async function handleRunWorkforceCommand() {
    setWorkforceBusy(true)
    setActionMessage(null)
    setActionError(null)
    try {
      const result = await applyWorkforceAutomation({
        apply_assignments: true,
        seed_review_cycles: true,
        queue_default_jobs: true,
        process_queue: false,
        limit: 8,
        source: 'supermega_dev',
      })
      setActionMessage(result.message ?? 'Workforce review cycle was applied.')
      const nextPayload = await getSupermegaDevControl()
      setPayload(nextPayload)
    } catch {
      setActionError('Workforce automation did not complete on this host.')
    } finally {
      setWorkforceBusy(false)
    }
  }

  async function handleAssignTask(row: SupermegaAssignmentRow) {
    const taskId = String(row.id ?? '').trim()
    const suggestedOwner = String(row.suggested_owner ?? '').trim()
    if (!taskId || !suggestedOwner) {
      return
    }
    setAssignmentBusyId(taskId)
    setActionMessage(null)
    setActionError(null)
    try {
      await updateWorkspaceTask(taskId, {
        owner: suggestedOwner,
        notes: operatorAssignmentNote(row),
      })
      setActionMessage(`Assigned ${String(row.title ?? 'task')} to ${suggestedOwner}.`)
      const nextPayload = await getSupermegaDevControl()
      setPayload(nextPayload)
    } catch {
      setActionError(`Could not assign ${String(row.title ?? 'the task')} on this host.`)
    } finally {
      setAssignmentBusyId(null)
    }
  }

  if (access.loading) {
    return (
      <div className="space-y-6">
        <PageIntro eyebrow="supermega.dev" title="Loading the domain control plane." description="Checking workspace access and loading the machine snapshot." />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-6">
        <PageIntro eyebrow="supermega.dev" title="Login required." description="supermega.dev management only works from the authenticated workspace." />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login">
              Login
            </Link>
            <Link className="sm-button-secondary" to="/platform">
              Back to platform
            </Link>
          </div>
        </section>
      </div>
    )
  }

  if (!access.allowed) {
    return (
      <div className="space-y-6">
        <PageIntro eyebrow="supermega.dev" title="Admin access required." description="Domain, deploy, and machine controls are reserved for tenant admins and platform admins." />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Current role: {access.roleLabel}. Ask a tenant admin or platform admin to grant the control-plane scopes for this workspace.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Open Platform Admin
            </Link>
            <Link className="sm-button-secondary" to="/app/cloud">
              Open Cloud Ops
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="supermega.dev"
        title="Manage the whole SuperMega machine."
        description="This page consolidates the public domain, shared app host, control-plane state, deploy loop, smoke harness, and core operating resources that keep supermega.dev running and explain how the platform fits together."
      />

      <section className="sm-surface-deep p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <span className="sm-chip text-white">Workspace: {String(payload?.workspace?.workspace_name ?? 'Unknown workspace')}</span>
              <span className="sm-chip text-white">Role: {String(payload?.workspace?.role ?? access.roleLabel)}</span>
              <span className="sm-chip text-white">Updated: {formatDateTime(payload?.generated_at)}</span>
            </div>
            <p className="text-sm text-[var(--sm-muted)]">
              Root domain `{machine?.root_domain ?? 'supermega.dev'}` and shared app host `{machine?.shared_app_host ?? 'app.supermega.dev'}` are mapped here together with the repo, runtime, deploy, and instruction stack.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="sm-button-secondary" onClick={() => void refreshControl()} type="button">
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button className="sm-button-secondary" onClick={() => void handleVerifyDomains()} type="button">
              {verifyBusy ? 'Verifying...' : 'Verify domains'}
            </button>
            <button className="sm-button-primary" onClick={() => void handleDeployPreview()} type="button">
              {deployBusy ? 'Deploying...' : 'Deploy preview'}
            </button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="sm-button-secondary" to="/app/platform-admin">
            Platform Admin
          </Link>
          <Link className="sm-button-secondary" to="/app/cloud">
            Cloud Ops
          </Link>
          <Link className="sm-button-secondary" to="/app/runtime">
            Runtime
          </Link>
          <Link className="sm-button-secondary" to="/app/workbench">
            Workbench
          </Link>
        </div>
        {actionMessage ? <div className="mt-4 sm-chip text-white">{actionMessage}</div> : null}
        {actionError ? <div className="mt-4 sm-chip text-white">{actionError}</div> : null}
        {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
      </section>

      {loading ? <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Loading live supermega.dev control data...</section> : null}

      {!loading ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Public domain</p>
              <h2 className={`mt-3 text-2xl font-semibold ${statusTone(rootReportStatus(rootReport))}`}>{String(machine?.root_domain ?? 'supermega.dev')}</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {rootReportStatus(rootReport) === 'ready'
                  ? 'Apex checks are healthy.'
                  : rootReportStatus(rootReport) === 'warning'
                    ? 'Apex checks are partially degraded.'
                    : 'Apex checks need intervention.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="sm-chip text-white">Failures: {rootReport?.failure_count ?? 0}</span>
                <span className="sm-chip text-white">Optional: {rootReport?.optional_failure_count ?? 0}</span>
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Shared app host</p>
              <h2 className={`mt-3 text-2xl font-semibold ${statusTone(sharedAppStatus(sharedAppDomain))}`}>{String(machine?.shared_app_host ?? 'app.supermega.dev')}</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                Runtime target: {String(sharedAppDomain?.runtime_target ?? 'Not mapped')} | route root: {String(sharedAppDomain?.route_root ?? '/')}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="sm-chip text-white">DNS {String(sharedAppDomain?.dns_status ?? 'unknown')}</span>
                <span className="sm-chip text-white">TLS {String(sharedAppDomain?.tls_status ?? 'unknown')}</span>
                <span className="sm-chip text-white">HTTP {String(sharedAppDomain?.http_status ?? 'unknown')}</span>
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Control plane</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">{platform?.modules?.enabled_count ?? 0} enabled</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {platform?.members?.count ?? 0} members, {platform?.domains?.count ?? 0} domains, {platform?.audit_events?.count ?? 0} audit events.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="sm-chip text-white">Pilots {platform?.modules?.pilot_count ?? 0}</span>
                <span className="sm-chip text-white">Disabled {platform?.modules?.disabled_count ?? 0}</span>
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Worker and deploy loop</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">{String(cloud?.preferred_workforce_mode ?? 'direct_batch')}</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {payload?.deployment?.preview_ready ? 'Preview deploy path is ready.' : 'Preview deploy path is partial.'} {payload?.smoke?.ready ? 'Smoke harness is ready.' : 'Smoke harness is partial.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="sm-chip text-white">Ready {cloud?.summary?.ready_count ?? 0}</span>
                <span className="sm-chip text-white">Attention {cloud?.summary?.attention_count ?? 0}</span>
                <span className="sm-chip text-white">Stale jobs {cloud?.summary?.stale_job_count ?? 0}</span>
              </div>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
            <article className="sm-surface p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Workforce command</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Review, route, and keep cloud crews moving.</h2>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">
                    The operator board below is built from the live workspace queue, the current team, connector-linked data, and the cloud automation lanes.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="sm-chip text-white">Mode {String(workforce?.preferred_workforce_mode ?? cloud?.preferred_workforce_mode ?? 'direct_batch')}</span>
                  <span className="sm-chip text-white">Supervisor {String(workforce?.supervisor?.status ?? 'unknown')}</span>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Core team</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{workforce?.summary?.core_team_count ?? coreTeam.length}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Named members with route, data, and next move.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Assignments</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{workforce?.summary?.assignment_count ?? assignmentBoard.length}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Open tasks needing stronger ownership or rerouting.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Review cycles</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{workforce?.summary?.review_cycle_count ?? reviewCycles.length}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Manager cadences tied to data signals and queue depth.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Automation lanes</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{workforce?.summary?.automation_lane_count ?? automationLanes.length}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Cloud jobs and queue-backed loops keeping the machine active.</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button className="sm-button-primary" onClick={() => void handleRunWorkforceCommand()} type="button">
                  {workforceBusy ? 'Running operator cycle...' : 'Run operator cycle'}
                </button>
                <Link className="sm-button-secondary" to="/app/workforce">
                  Open Workforce
                </Link>
                <Link className="sm-button-secondary" to="/app/teams">
                  Open Agent Ops
                </Link>
              </div>
            </article>

            <article className="sm-surface-deep p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Operating signals</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">The team, review, and data loops are linked here.</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                Coverage {workforce?.summary?.coverage_score ?? 0}. Open tasks {workforce?.summary?.open_task_count ?? 0}. Active playbooks {workforce?.summary?.active_playbook_count ?? 0}. Supervisor interval{' '}
                {workforce?.supervisor?.interval_minutes ?? 0} minutes.
              </p>
              <div className="mt-5 space-y-3">
                {nextMoves.slice(0, 4).map((move) => (
                  <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={move}>
                    <p className="text-sm text-white">{move}</p>
                  </div>
                ))}
                {!nextMoves.length ? (
                  <div className="sm-chip text-white">No operator moves were generated for this workspace yet.</div>
                ) : null}
              </div>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.92fr,1.08fr]">
            <article className="sm-surface p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Core team</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Current workspace owners and their lanes.</h2>
                </div>
                <span className="sm-chip text-white">{coreTeam.length} member{coreTeam.length === 1 ? '' : 's'}</span>
              </div>
              <div className="mt-5 space-y-3">
                {coreTeam.length ? (
                  coreTeam.map((member: SupermegaCoreTeamRow) => (
                    <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={String(member.member_id ?? member.name ?? member.role ?? 'member')}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{String(member.name ?? 'Workspace member')}</p>
                          <p className="mt-1 text-sm text-[var(--sm-muted)]">
                            {String(member.role ?? 'member')} | {String(member.status ?? 'active')}
                          </p>
                        </div>
                        <Link className="sm-button-secondary" to={String(member.home_route ?? '/app/workforce')}>
                          Open lane
                        </Link>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="sm-chip text-white">Open {member.assigned_open_task_count ?? 0}</span>
                        <span className="sm-chip text-white">High priority {member.assigned_high_priority_task_count ?? 0}</span>
                        {(member.capability_focus ?? []).map((focus) => (
                          <span className="sm-chip text-white" key={`${member.member_id ?? member.name}-focus-${focus}`}>
                            {focus}
                          </span>
                        ))}
                      </div>
                      {(member.linked_programs ?? []).length ? (
                        <p className="mt-3 text-sm text-[var(--sm-muted)]">Programs: {(member.linked_programs ?? []).join(', ')}</p>
                      ) : null}
                      {(member.linked_data_domains ?? []).length ? (
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">Data: {(member.linked_data_domains ?? []).join(', ')}</p>
                      ) : null}
                      <p className="mt-3 text-sm text-white">{String(member.next_move ?? 'No next move recorded yet.')}</p>
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-white">No core team members are mapped for this workspace yet.</div>
                )}
              </div>
            </article>

            <article className="sm-surface p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Assignment board</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Open work routed to a named owner.</h2>
                </div>
                <span className="sm-chip text-white">{assignmentBoard.length} task{assignmentBoard.length === 1 ? '' : 's'}</span>
              </div>
              <div className="mt-5 space-y-3">
                {assignmentBoard.length ? (
                  assignmentBoard.map((row: SupermegaAssignmentRow) => {
                    const taskId = String(row.id ?? row.title ?? 'task')
                    const suggestedOwner = String(row.suggested_owner ?? '').trim()
                    const assignable = assignmentNeedsAttention(row)
                    return (
                      <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={taskId}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{String(row.title ?? 'Workspace task')}</p>
                            <p className="mt-1 text-sm text-[var(--sm-muted)]">
                              {String(row.priority ?? 'normal')} | {String(row.status ?? 'open')} | due {String(row.due ?? 'not set')}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Link className="sm-button-secondary" to={String(row.route ?? '/app/workforce')}>
                              Open lane
                            </Link>
                            <button
                              className="sm-button-primary"
                              disabled={!assignable || !suggestedOwner || assignmentBusyId === String(row.id ?? '')}
                              onClick={() => void handleAssignTask(row)}
                              type="button"
                            >
                              {assignmentBusyId === String(row.id ?? '') ? 'Assigning...' : assignable ? `Assign ${suggestedOwner}` : 'Assigned'}
                            </button>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="sm-chip text-white">Current {String(row.current_owner ?? 'Unassigned')}</span>
                          <span className="sm-chip text-white">Suggested {suggestedOwner || 'Not set'}</span>
                          <span className="sm-chip text-white">Role {String(row.suggested_role ?? 'manager')}</span>
                          {(row.data_signals ?? []).map((signal) => (
                            <span className="sm-chip text-white" key={`${taskId}-signal-${signal}`}>
                              {signal}
                            </span>
                          ))}
                        </div>
                        <p className="mt-3 text-sm text-[var(--sm-muted)]">{String(row.reason ?? 'No routing reason recorded.')}</p>
                        <p className="mt-2 text-sm text-white">{String(row.next_action ?? 'No next action recorded.')}</p>
                      </div>
                    )
                  })
                ) : (
                  <div className="sm-chip text-white">No assignment candidates are open right now.</div>
                )}
              </div>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <article className="sm-surface p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Review cycles</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Manager cadences and queue load.</h2>
                </div>
                <span className="sm-chip text-white">{reviewCycles.length}</span>
              </div>
              <div className="mt-5 space-y-3">
                {reviewCycles.length ? (
                  reviewCycles.map((cycle: SupermegaReviewCycleRow) => (
                    <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={String(cycle.id ?? cycle.name ?? 'cycle')}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-white">{String(cycle.name ?? 'Review cycle')}</p>
                        <span className={`sm-chip ${statusTone(cycle.status)}`}>{String(cycle.status ?? 'unknown')}</span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {String(cycle.owner_role ?? 'Manager')} | {String(cycle.cadence ?? 'Daily manager review')} | queue {cycle.queue_count ?? 0}
                      </p>
                      {(cycle.focus ?? []).length ? <p className="mt-2 text-sm text-white">Focus: {(cycle.focus ?? []).join(', ')}</p> : null}
                      {(cycle.data_signals ?? []).length ? <p className="mt-2 text-sm text-[var(--sm-muted)]">Signals: {(cycle.data_signals ?? []).join(', ')}</p> : null}
                      <p className="mt-3 text-sm text-white">{String(cycle.next_move ?? 'No next move recorded.')}</p>
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-white">No review cycles are mapped yet.</div>
                )}
              </div>
            </article>

            <article className="sm-surface p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Automation lanes</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Cloud jobs and always-on loops.</h2>
                </div>
                <span className="sm-chip text-white">{automationLanes.length}</span>
              </div>
              <div className="mt-5 space-y-3">
                {automationLanes.length ? (
                  automationLanes.map((lane: SupermegaAutomationLaneRow) => (
                    <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={String(lane.id ?? lane.name ?? 'lane')}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-white">{String(lane.name ?? 'Automation lane')}</p>
                        <span className={`sm-chip ${statusTone(lane.status)}`}>{String(lane.status ?? 'blocked')}</span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {String(lane.mode ?? 'Direct batch')} | {String(lane.cadence ?? 'On demand')} | last run {formatDateTime(lane.latest_run_at)}
                      </p>
                      {(lane.source_systems ?? []).length ? <p className="mt-2 text-sm text-white">Sources: {(lane.source_systems ?? []).join(', ')}</p> : null}
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{String(lane.queue_signal ?? 'No queue signal recorded.')}</p>
                      <p className="mt-3 text-sm text-white">{String(lane.next_move ?? 'No next move recorded.')}</p>
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-white">No automation lanes are wired into this workspace yet.</div>
                )}
              </div>
            </article>

            <article className="sm-surface p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Linked data</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Sources feeding the operating loops.</h2>
                </div>
                <span className="sm-chip text-white">{linkedDataSources.length}</span>
              </div>
              <div className="mt-5 space-y-3">
                {linkedDataSources.length ? (
                  linkedDataSources.map((source: SupermegaDataLinkRow) => (
                    <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={String(source.id ?? source.name ?? 'source')}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-white">{String(source.name ?? 'Source')}</p>
                        <span className={`sm-chip ${statusTone(source.status)}`}>{String(source.status ?? 'mapped')}</span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {String(source.source_type ?? 'source')} | evidence {source.evidence_count ?? 0}
                      </p>
                      {(source.consumers ?? []).length ? <p className="mt-2 text-sm text-white">Consumers: {(source.consumers ?? []).join(', ')}</p> : null}
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">Route {String(source.route ?? '/app/data-fabric')}</p>
                      <p className="mt-3 text-sm text-white">{String(source.next_automation ?? 'No next automation recorded.')}</p>
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-white">No linked data sources are mapped for this workspace yet.</div>
                )}
              </div>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            {(machine?.sections ?? []).map((section) => (
              <article className="sm-surface p-6" key={section.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">{section.name}</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">{section.summary}</h2>
                  </div>
                  <Link className="sm-button-secondary" to={section.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {section.signals.map((signal) => (
                    <span className="sm-chip text-white" key={`${section.id}-${signal}`}>
                      {signal}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
            <article className="sm-surface p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Domain health</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Apex route checks</h2>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">
                    Checked at {formatDateTime(rootReport?.checked_at)} across {(machine?.public_routes ?? []).length} public routes.
                  </p>
                </div>
                <div className={`sm-chip ${statusTone(rootReportStatus(rootReport))}`}>{String(rootReport?.overall_status ?? 'unknown')}</div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {(machine?.public_routes ?? []).map((route) => (
                  <span className="sm-chip text-white" key={route}>
                    {route}
                  </span>
                ))}
              </div>
              <div className="mt-5 space-y-3">
                {rootFailures.length ? (
                  rootFailures.map((failure) => (
                    <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={`${failure.target ?? 'check'}-${failure.detail ?? 'detail'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-white">{String(failure.target ?? 'check')}</p>
                        <span className={`sm-chip ${statusTone(failure.status)}`}>{String(failure.status ?? 'error')}</span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{String(failure.detail ?? 'Check failed.')}</p>
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-white">No domain failures were reported in the latest apex check.</div>
                )}
              </div>
            </article>

            <article className="sm-surface-deep p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Host posture</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{String(sharedAppDomain?.display_name ?? sharedAppDomain?.hostname ?? machine?.shared_app_host ?? 'Shared app host')}</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{String(sharedAppDomain?.notes ?? sharedAppDomain?.deployment_url ?? 'Use this row to track the internal app host posture.')}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Deployment</p>
                  <p className="mt-2 text-sm text-white">{String(sharedAppDomain?.deployment_url ?? 'Not recorded')}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Last deployed</p>
                  <p className="mt-2 text-sm text-white">{formatDateTime(sharedAppDomain?.last_deployed_at)}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="sm-chip text-white">Topology ready {domains?.topology_summary?.ready_count ?? 0}</span>
                <span className="sm-chip text-white">Attention {domains?.topology_summary?.attention_count ?? 0}</span>
                <span className="sm-chip text-white">Blocked {domains?.topology_summary?.blocker_count ?? 0}</span>
              </div>
            </article>
          </section>

          <section className="sm-surface p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Workspace and topology domains</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Host inventory</h2>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">
                  This is the merged host table for the current workspace, including route roots, runtime targets, and deployment URLs.
                </p>
              </div>
              <span className="sm-chip text-white">{topologyRows.length} host{topologyRows.length === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-5 space-y-3">
              {topologyRows.length ? (
                topologyRows.map((row) => (
                  <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/4 p-4 lg:grid-cols-[1.4fr,0.8fr,0.9fr,0.8fr,1.2fr] lg:items-start" key={domainInventoryKey(row)}>
                    <div>
                      <p className="font-semibold text-white">{domainInventoryLabel(row)}</p>
                      <p className="mt-1 text-sm text-[var(--sm-muted)]">
                        {row.hostname} | {row.scope || 'workspace'} | {row.provider || 'provider not set'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Status</p>
                      <p className={`mt-1 text-sm font-semibold ${statusTone(row.status)}`}>{String(row.status || 'unknown')}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Runtime</p>
                      <p className="mt-1 text-sm text-white">{domainInventoryRuntime(row)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Route</p>
                      <p className="mt-1 text-sm text-white">{domainInventoryRoute(row)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Deploy URL</p>
                      <p className="mt-1 break-all text-sm text-white">{domainInventoryDeployment(row)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="sm-chip text-white">No workspace or topology hosts are available yet.</div>
              )}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Deploy loop</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Build and ship</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                Preview deploys, bundle packaging, and the current deployment files live here. Vercel CLI available: {payload?.deployment?.vercel_cli_available ? 'yes' : 'no'}.
              </p>
              <div className="mt-5 space-y-3">
                {(payload?.deployment?.commands ?? []).map((command) => (
                  <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={command.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{command.label}</p>
                      <span className="sm-chip text-white">{command.kind}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{command.detail}</p>
                    <code className="mt-3 block overflow-x-auto rounded-xl bg-black/30 px-3 py-2 text-xs text-white">{command.command}</code>
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-3">
                {deploymentScripts.map((resource) => (
                  <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={resource.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{resource.label}</p>
                      <span className={`sm-chip ${resourceTone(resource)}`}>{resource.exists ? 'present' : 'missing'}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{resource.detail}</p>
                    <p className="mt-2 text-xs text-[var(--sm-muted)]">{resource.path}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Verification loop</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Smoke and route checks</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                Public-site routes and authenticated app routes are explicitly tracked so supermega.dev stays shippable instead of drifting.
              </p>
              <div className="mt-5 space-y-3">
                {(payload?.smoke?.commands ?? []).map((command) => (
                  <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={command.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{command.label}</p>
                      <span className="sm-chip text-white">{command.kind}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{command.detail}</p>
                    <code className="mt-3 block overflow-x-auto rounded-xl bg-black/30 px-3 py-2 text-xs text-white">{command.command}</code>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {(payload?.smoke?.public_routes ?? []).map((route) => (
                  <span className="sm-chip text-white" key={`public-${route}`}>
                    Public {route}
                  </span>
                ))}
                {(payload?.smoke?.app_routes ?? []).map((route) => (
                  <span className="sm-chip text-white" key={`app-${route}`}>
                    App {route}
                  </span>
                ))}
              </div>
              <div className="mt-5 space-y-3">
                {smokeScripts.map((resource) => (
                  <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={resource.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{resource.label}</p>
                      <span className={`sm-chip ${resourceTone(resource)}`}>{resource.exists ? 'present' : 'missing'}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{resource.detail}</p>
                    <p className="mt-2 text-xs text-[var(--sm-muted)]">{resource.path}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            {[
              { title: 'Code anchors', rows: codeResources },
              { title: 'Data anchors', rows: dataResources },
              { title: 'Instruction anchors', rows: instructionResources },
            ].map((group) => (
              <article className="sm-surface p-6" key={group.title}>
                <p className="sm-kicker text-[var(--sm-accent)]">{group.title}</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Core resources</h2>
                <div className="mt-5 space-y-3">
                  {group.rows.map((resource) => (
                    <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={resource.id}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-white">{resource.label}</p>
                        <span className={`sm-chip ${resourceTone(resource)}`}>{resource.exists ? 'present' : 'missing'}</span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{resource.detail}</p>
                      <p className="mt-2 text-xs text-[var(--sm-muted)]">{resource.path}</p>
                      <p className="mt-1 text-xs text-[var(--sm-muted)]">Updated {formatDateTime(resource.updated_at)}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </div>
  )
}
