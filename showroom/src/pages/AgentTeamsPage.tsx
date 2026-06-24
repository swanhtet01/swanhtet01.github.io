import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getAgentOperatingModel, getToolDefinitionMap, type AgentOperatingModel } from '../lib/agentOperatingModel'
import { SUPERMEGA_AUTONOMOUS_CLOUD_MODEL } from '../lib/autonomousCloudOperatingModel'
import { getTenantConfig } from '../lib/tenantConfig'
import {
  listAgentRuns,
  checkWorkspaceHealth,
  getCapabilityProfileForRole,
  getWorkspaceSession,
  inviteTeamMember,
  listTeamMembers,
  runAgentJob,
  runDefaultAgentJobs,
  sessionHasCapability,
  workspaceFetch,
  type AgentJobTemplate,
  type AgentRunRow,
  type TeamMemberRow,
} from '../lib/workspaceApi'

type AgentUnit = {
  agent_id: string
  name: string
  role: string
  mode: string
  output_schema: string
  write_scope: string
  approval_gate: string
  focus: string
}

type AgentTeam = {
  team_id: string
  name: string
  status: string
  scaling_tier: string
  mission: string
  lead_agent: string
  cadence: string
  agents: AgentUnit[]
}

type AgentRuntimeCrew = {
  team_id?: string
  name?: string
  scaling_tier?: string
  workspace?: string
  runtime_lane?: string
  execution_mode?: string
  tool_count?: number
  connector_tool_count?: number
  tool_modes?: string[]
  tool_scopes?: string[]
  approval_gates?: string[]
  required_capabilities?: string[]
  write_policy?: string
  guardrail_posture?: string
  job_types?: string[]
  last_run_at?: string
  last_run_status?: string
  current_user_can_view?: boolean
  current_user_can_run?: boolean
  current_user_can_approve?: boolean
  current_user_can_take_over?: boolean
}

type AgentRuntimeContract = {
  generated_at?: string
  viewer?: {
    role?: string
    display_name?: string
    capabilities?: string[]
    can_run_jobs?: boolean
    can_manage_runtime?: boolean
    can_approve_guardrails?: boolean
  }
  summary?: {
    workspace_count?: number
    scheduler_backed_team_count?: number
    connector_enabled_team_count?: number
    approval_gate_count?: number
    guarded_team_count?: number
  }
  crews?: AgentRuntimeCrew[]
}

type TenantState = {
  status?: string
  blocked?: boolean
  expected_tenant_key?: string
  resource_tenant_key?: string
  persisted_manifest_tenant_key?: string
  current_state_tenant_key?: string
  snapshot_tenant_key?: string
  workspace_slug?: string
  workspace_name?: string
  detail?: string
}

type AgentTeamPayload = {
  status: string
  tenant_state?: TenantState
  summary?: {
    team_count?: number
    shared_core_team_count?: number
    client_pod_team_count?: number
    autonomy_score?: number
    autonomy_level?: string
    manifest_version?: string
    manifest_tool_count?: number
    manifest_playbook_count?: number
  }
  teams?: AgentTeam[]
  manifest?: AgentOperatingModel | null
  runtime_contract?: AgentRuntimeContract
  gaps?: Array<{
    gap_id?: string
    severity?: string
    problem?: string
    next_step?: string
  }>
  next_moves?: string[]
  scaling_model?: {
    core_loop?: string[]
    founder_focus?: string[]
    rules?: string[]
  }
}

const roleOptions = ['member', 'operator', 'manager', 'owner', 'sales', 'operations', 'quality', 'maintenance', 'ceo', 'admin'] as const
const runnableJobTypes = [
  'revenue_scout',
  'list_clerk',
  'template_clerk',
  'task_triage',
  'ops_watch',
  'founder_brief',
  'github_release_watch',
] as const

function cadenceThresholdMinutes(cadence: string) {
  const normalized = String(cadence || '').trim().toLowerCase()
  if (normalized === '15m') {
    return 60
  }
  if (normalized === 'hourly') {
    return 180
  }
  if (normalized === 'daily') {
    return 36 * 60
  }
  return 6 * 60
}

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

export function AgentTeamsPage() {
  const tenant = getTenantConfig()
  const fallbackOperatingModel = getAgentOperatingModel(tenant.key)
  const autonomyModel = SUPERMEGA_AUTONOMOUS_CLOUD_MODEL
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agentPayload, setAgentPayload] = useState<AgentTeamPayload | null>(null)
  const [members, setMembers] = useState<TeamMemberRow[]>([])
  const [agentJobs, setAgentJobs] = useState<AgentJobTemplate[]>([])
  const [agentRuns, setAgentRuns] = useState<AgentRunRow[]>([])
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteMessage, setInviteMessage] = useState<string | null>(null)
  const [jobBusy, setJobBusy] = useState<string | null>(null)
  const [jobMessage, setJobMessage] = useState<string | null>(null)
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    role: 'member',
    password: '',
  })

  const loadData = useCallback(async () => {
    const health = await checkWorkspaceHealth()
    if (!health.ready) {
      throw new Error('Workspace API is not connected on this host yet.')
    }

    const session = await getWorkspaceSession()
    if (!session.authenticated) {
      throw new Error('Login is required to open Agent Ops.')
    }
    if (!sessionHasCapability(session.session, 'agent_ops.view') && !sessionHasCapability(session.session, 'tenant_admin.view')) {
      const profile = getCapabilityProfileForRole(session.session?.role)
      throw new Error(`Agent Ops requires an operator, manager, or tenant-admin role. Current role: ${profile.label}.`)
    }

    const [nextAgentPayload, nextMembersPayload, nextRunsPayload] = await Promise.all([
      workspaceFetch<AgentTeamPayload>('/api/agent-teams'),
      listTeamMembers(),
      listAgentRuns(20),
    ])

    setAgentPayload(nextAgentPayload)
    setMembers(nextMembersPayload.rows ?? [])
    setAgentJobs(nextRunsPayload.jobs ?? [])
    setAgentRuns(nextRunsPayload.rows ?? [])
    setError(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const health = await checkWorkspaceHealth()
      if (cancelled) return
      if (!health.ready) {
        setError('Workspace API is not connected on this host yet.')
        setLoading(false)
        return
      }

      try {
        const session = await getWorkspaceSession()
        if (cancelled) return
        if (!session.authenticated) {
          setError('Login is required to open Agent Ops.')
          setLoading(false)
          return
        }
        if (!sessionHasCapability(session.session, 'agent_ops.view') && !sessionHasCapability(session.session, 'tenant_admin.view')) {
          setError(`Agent Ops requires operator or tenant-admin access. Current role: ${getCapabilityProfileForRole(session.session?.role).label}.`)
          setLoading(false)
          return
        }
      } catch {
        if (!cancelled) {
          setError('Workspace login could not be verified on this host yet.')
          setLoading(false)
        }
        return
      }

      try {
        await loadData()
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Team data could not be loaded right now.')
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
  }, [loadData])

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!inviteForm.email.trim()) {
      setInviteMessage('Enter an email first.')
      return
    }

    setInviteBusy(true)
    setInviteMessage(null)
    try {
      const payload = await inviteTeamMember({
        email: inviteForm.email,
        name: inviteForm.name,
        role: inviteForm.role,
        password: inviteForm.password,
      })
      setMembers(payload.rows ?? [])
      setInviteForm({
        name: '',
        email: '',
        role: 'member',
        password: '',
      })
      const temporaryPassword = String(payload.generated_password ?? '').trim()
      if (temporaryPassword) {
        setInviteMessage(`Member added. Share this initial password once: ${temporaryPassword}`)
      } else if (payload.created) {
        setInviteMessage('Member added.')
      } else {
        setInviteMessage('Member access updated.')
      }
    } catch (nextError) {
      setInviteMessage(nextError instanceof Error ? nextError.message : 'Could not add this member right now.')
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleRunJob(jobType: string) {
    setJobBusy(jobType)
    setJobMessage(null)
    try {
      const payload = await runAgentJob({
        job_type: jobType,
        source: 'manual_operator',
      })
      await loadData()
      setJobMessage((payload.row?.summary || `${jobType} ran successfully.`).trim())
    } catch (nextError) {
      setJobMessage(nextError instanceof Error ? nextError.message : 'Could not run that agent right now.')
    } finally {
      setJobBusy(null)
    }
  }

  async function handleRunCoreLoop() {
    setJobBusy('batch')
    setJobMessage(null)
    try {
      const payload = await runDefaultAgentJobs([...runnableJobTypes])
      await loadData()
      setJobMessage(`Ran ${payload.count ?? 0} core agent job${payload.count === 1 ? '' : 's'}.`)
    } catch (nextError) {
      setJobMessage(nextError instanceof Error ? nextError.message : 'Could not run the core loop right now.')
    } finally {
      setJobBusy(null)
    }
  }

  const activeJobs = useMemo(
    () => agentJobs.filter((job) => runnableJobTypes.includes(job.job_type as (typeof runnableJobTypes)[number])),
    [agentJobs],
  )

  const operatingModel = useMemo(() => {
    const runtimeManifest = agentPayload?.manifest
    if (runtimeManifest && runtimeManifest.tenantKey === tenant.key) {
      return runtimeManifest
    }
    return fallbackOperatingModel
  }, [agentPayload?.manifest, fallbackOperatingModel, tenant.key])

  const playbookSummary = useMemo(() => {
    const automationCount = operatingModel.playbooks.reduce((total, playbook) => total + playbook.cadence.length, 0)
    const guardedTeamCount = operatingModel.playbooks.filter((playbook) => playbook.writePolicy.trim().length > 0).length
    return {
      automationCount,
      guardedTeamCount,
      teamCount: operatingModel.playbooks.length,
      toolCount: operatingModel.tools.length,
    }
  }, [operatingModel])

  const toolUsage = useMemo(() => {
    const toolMap = getToolDefinitionMap(operatingModel)
    return operatingModel.tools
      .map((tool) => ({
        tool,
        teams: operatingModel.playbooks
          .filter((playbook) => playbook.tools.some((access) => access.toolId === tool.id))
          .map((playbook) => playbook.name),
        strongestMode:
          operatingModel.playbooks.flatMap((playbook) => playbook.tools.filter((access) => access.toolId === tool.id).map((access) => access.mode))[0] ?? 'Read',
        purpose: toolMap.get(tool.id)?.purpose ?? tool.purpose,
      }))
      .filter((entry) => entry.teams.length)
  }, [operatingModel])

  const foundryCrews = useMemo(
    () =>
      operatingModel.playbooks.filter((playbook) =>
        ['tenant-app-foundry', 'manufacturing-genealogy', 'experience-assurance'].includes(playbook.id),
      ),
    [operatingModel],
  )

  const runtimeHealth = useMemo(() => {
    const now = Date.now()
    let staleCount = 0
    let errorCount = 0

    for (const job of activeJobs) {
      const lastRun = job.last_run
      const lastStatus = String(lastRun?.status || '').trim().toLowerCase()
      if (lastStatus === 'error') {
        errorCount += 1
      }
      const lastTimestamp = String(lastRun?.completed_at || lastRun?.created_at || '').trim()
      const parsed = lastTimestamp ? new Date(lastTimestamp) : null
      const thresholdMs = cadenceThresholdMinutes(job.cadence) * 60 * 1000
      if (!parsed || Number.isNaN(parsed.getTime()) || now - parsed.getTime() > thresholdMs) {
        staleCount += 1
      }
    }

    const latestSchedulerRun = agentRuns.find((row) => String(row.source || '').trim().toLowerCase() === 'scheduler')
    const latestBatchRun = agentRuns.find((row) => {
      const source = String(row.source || '').trim().toLowerCase()
      return source === 'scheduler' || source.includes('batch')
    })

    return {
      staleCount,
      errorCount,
      jobsDueNow: staleCount,
      lastSchedulerRun: latestSchedulerRun?.completed_at || latestSchedulerRun?.created_at || '',
      lastBatchRun: latestBatchRun?.completed_at || latestBatchRun?.created_at || '',
    }
  }, [activeJobs, agentRuns])

  const runtimeContract = agentPayload?.runtime_contract ?? null

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Agent Ops"
        title={
          tenant.key === 'ytf-plant-a'
            ? 'Run the AI workforce that designs and operates the Yangon Tyre platform.'
            : 'Keep the company running with people, loops, and escalation.'
        }
        description={
          tenant.key === 'ytf-plant-a'
            ? 'This surface now includes the app-foundry crews, manufacturing genealogy crew, and experience-evals crew alongside the runtime operators.'
            : 'Scheduler keeps the base loops alive. Manual run is for operator checks, recovery, and urgent refresh.'
        }
      />

      {agentPayload?.tenant_state?.status &&
      agentPayload.tenant_state.status !== 'matched' &&
      agentPayload.tenant_state.status !== 'parallel' ? (
        <section className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Tenant state</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Crew state is gated until the active workspace and persisted tenant data line up.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{agentPayload.tenant_state.detail || 'Tenant alignment needs review.'}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
            <span className="sm-chip text-white">Expected: {agentPayload.tenant_state.expected_tenant_key || 'unknown'}</span>
            <span className="sm-chip text-white">Live state: {agentPayload.tenant_state.current_state_tenant_key || 'not reported'}</span>
            <span className="sm-chip text-white">Persisted manifest: {agentPayload.tenant_state.persisted_manifest_tenant_key || 'not reported'}</span>
            <span className="sm-chip text-white">Snapshot: {agentPayload.tenant_state.snapshot_tenant_key || 'not reported'}</span>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Members</p>
          <p className="mt-3 text-3xl font-bold text-white">{members.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Agent loops</p>
          <p className="mt-3 text-3xl font-bold text-white">{agentPayload?.summary?.team_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Core loops</p>
          <p className="mt-3 text-3xl font-bold text-white">{agentPayload?.summary?.shared_core_team_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Autonomy</p>
          <p className="mt-3 text-3xl font-bold text-white">{agentPayload?.summary?.autonomy_score ?? 0}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">{agentPayload?.summary?.autonomy_level || 'unknown'}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Stale loops</p>
          <p className="mt-3 text-3xl font-bold text-white">{runtimeHealth.staleCount}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Jobs that are overdue for their cadence.</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Errored loops</p>
          <p className="mt-3 text-3xl font-bold text-white">{runtimeHealth.errorCount}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Jobs whose last recorded run failed.</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Last scheduler run</p>
          <p className="mt-3 text-lg font-bold text-white">{formatDateTime(runtimeHealth.lastSchedulerRun)}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Jobs due now</p>
          <p className="mt-3 text-3xl font-bold text-white">{runtimeHealth.jobsDueNow}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">
            Last batch: {formatDateTime(runtimeHealth.lastBatchRun)}
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Configured teams</p>
          <p className="mt-3 text-3xl font-bold text-white">{playbookSummary.teamCount}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">{operatingModel.title}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Tool plane</p>
          <p className="mt-3 text-3xl font-bold text-white">{playbookSummary.toolCount}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Named tools with scoped agent access.</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Automation loops</p>
          <p className="mt-3 text-3xl font-bold text-white">{playbookSummary.automationCount}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Cadenced loops attached to team playbooks.</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Guarded teams</p>
          <p className="mt-3 text-3xl font-bold text-white">{playbookSummary.guardedTeamCount}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">
            {agentPayload?.summary?.manifest_version
              ? `Runtime contract ${agentPayload.summary.manifest_version}`
              : 'Teams with explicit write and escalation policy.'}
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Operating model</p>
          <h2 className="mt-2 text-2xl font-bold text-white">{operatingModel.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{operatingModel.summary}</p>

          <div className="mt-5 space-y-3">
            {operatingModel.managerMoves.map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Tool plane</p>
          <h2 className="mt-2 text-2xl font-bold text-white">What the teams are actually equipped with.</h2>
          <div className="mt-5 space-y-3">
            {toolUsage.map(({ tool, teams, strongestMode, purpose }) => (
              <div className="sm-proof-card" key={tool.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{tool.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{purpose}</p>
                  </div>
                  <span className="sm-status-pill">
                    {tool.category} / {strongestMode}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {teams.map((team) => (
                    <span className="sm-status-pill" key={`${tool.id}-${team}`}>
                      {team}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {runtimeContract?.crews?.length ? (
        <section className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Crew runtime contract</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Each crew now has a named workspace, tool boundary, scheduler lane, and approval edge.</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                This is the operator-facing contract for cloud crews: where they run, what they can touch, and how risky work is contained.
              </p>
            </div>
            <span className="sm-status-pill">{runtimeContract.crews.length} crews</span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Crew workspaces</p>
              <p className="mt-2 text-sm">{runtimeContract.summary?.workspace_count ?? 0} named workspaces</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Scheduler-backed crews</p>
              <p className="mt-2 text-sm">{runtimeContract.summary?.scheduler_backed_team_count ?? 0} crews tied to recurring jobs</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Connector crews</p>
              <p className="mt-2 text-sm">{runtimeContract.summary?.connector_enabled_team_count ?? 0} crews with direct connector scope</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Approval boundaries</p>
              <p className="mt-2 text-sm">{runtimeContract.summary?.approval_gate_count ?? 0} named approval gates in live use</p>
            </div>
          </div>

          {runtimeContract.viewer ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-[0.78fr_1.22fr]">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">My access</p>
                <p className="mt-2 text-sm">
                  {runtimeContract.viewer.display_name || 'Current operator'} · {runtimeContract.viewer.role || 'unknown role'}
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="sm-status-pill">{runtimeContract.viewer.can_run_jobs ? 'Can run jobs' : 'No run control'}</div>
                  <div className="sm-status-pill">
                    {runtimeContract.viewer.can_approve_guardrails ? 'Can approve guardrails' : 'No approval authority'}
                  </div>
                  <div className="sm-status-pill">
                    {runtimeContract.viewer.can_manage_runtime ? 'Can take over runtime' : 'No takeover authority'}
                  </div>
                </div>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Authoritative capabilities</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(runtimeContract.viewer.capabilities ?? []).map((capability) => (
                    <span className="sm-status-pill" key={`viewer-cap-${capability}`}>
                      {capability}
                    </span>
                  ))}
                  {!(runtimeContract.viewer.capabilities ?? []).length ? (
                    <span className="sm-status-pill">No capabilities reported</span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {runtimeContract.crews.map((crew) => (
              <article className="sm-proof-card" key={crew.team_id || crew.name}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold text-white">{crew.name || crew.team_id || 'Crew'}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{crew.runtime_lane || 'Runtime lane not declared yet.'}</p>
                  </div>
                  <span className="sm-status-pill">{crew.guardrail_posture || 'Guardrails pending'}</span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Workspace</p>
                    <p className="mt-2 text-sm">{crew.workspace || 'Unassigned workspace'}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Execution</p>
                    <p className="mt-2 text-sm">{crew.execution_mode || 'Manual lane'}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Tools</p>
                    <p className="mt-2 text-sm">
                      {crew.tool_count ?? 0} total / {crew.connector_tool_count ?? 0} connector
                    </p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Tracked jobs</p>
                    <p className="mt-2 text-sm">{crew.job_types?.join(' · ') || 'No recurring job mapped yet'}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Last run</p>
                    <p className="mt-2 text-sm">
                      {crew.last_run_at ? formatDateTime(crew.last_run_at) : crew.last_run_status || 'Manual'}
                    </p>
                    {crew.last_run_at ? <p className="mt-1 text-xs text-[var(--sm-muted)]">{crew.last_run_status || 'Recorded'}</p> : null}
                  </div>
                </div>

                {crew.tool_modes?.length ? (
                  <div className="mt-4">
                    <p className="sm-kicker text-[var(--sm-accent)]">Tool modes</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {crew.tool_modes.map((mode) => (
                        <span className="sm-status-pill" key={`${crew.team_id}-mode-${mode}`}>
                          {mode}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {crew.tool_scopes?.length ? (
                  <div className="mt-4">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Active scopes</p>
                    <div className="mt-2 space-y-2">
                      {crew.tool_scopes.map((scope) => (
                        <div className="sm-chip text-white" key={`${crew.team_id}-scope-${scope}`}>
                          {scope}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {crew.required_capabilities?.length ? (
                  <div className="mt-4">
                    <p className="sm-kicker text-[var(--sm-accent)]">Required capabilities</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {crew.required_capabilities.map((capability) => (
                        <span className="sm-status-pill" key={`${crew.team_id}-required-${capability}`}>
                          {capability}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Approval gates</p>
                    <div className="mt-2 space-y-2">
                      {crew.approval_gates?.length ? (
                        crew.approval_gates.map((gate) => (
                          <div className="sm-chip text-white" key={`${crew.team_id}-gate-${gate}`}>
                            {gate}
                          </div>
                        ))
                      ) : (
                        <div className="sm-chip text-white">No explicit gate recorded yet</div>
                      )}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Write policy</p>
                    <p className="mt-2 text-sm">{crew.write_policy || 'Human review before writes.'}</p>
                    <div className="mt-3 grid gap-2">
                      <div className="sm-status-pill">{crew.current_user_can_view ? 'You can view' : 'You cannot view'}</div>
                      <div className="sm-status-pill">{crew.current_user_can_run ? 'You can run' : 'You cannot run'}</div>
                      <div className="sm-status-pill">{crew.current_user_can_approve ? 'You can approve' : 'You cannot approve'}</div>
                      <div className="sm-status-pill">{crew.current_user_can_take_over ? 'You can take over' : 'You cannot take over'}</div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Cloud development loops</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Autonomous development only works when the loops are named and audited.</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                These loops are the company’s internal machine for architecture, building, connector expansion, crew learning, and storytelling.
              </p>
            </div>
            <span className="sm-status-pill">{autonomyModel.developmentLoops.length} loops</span>
          </div>
          <div className="mt-6 grid gap-4">
            {autonomyModel.developmentLoops.map((loop) => (
              <article className="sm-proof-card" key={loop.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{loop.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{loop.mission}</p>
                  </div>
                  <Link className="sm-link" to={loop.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-3 text-sm text-white/80">Cadence: {loop.cadence}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Reads</p>
                    <p className="mt-2 text-sm">{loop.reads.join(', ')}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Writes</p>
                    <p className="mt-2 text-sm">{loop.writes.join(', ')}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">Success metric: {loop.successMetric}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Execution lanes</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Crews should know which runtime lane they belong to before they run autonomously.</h2>
            </div>
            <span className="sm-status-pill">{autonomyModel.modelLanes.length} lanes</span>
          </div>
          <div className="mt-6 grid gap-4">
            {autonomyModel.modelLanes.map((lane) => (
              <article className="sm-proof-card" key={lane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{lane.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.mission}</p>
                  </div>
                  <Link className="sm-link" to={lane.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-3 text-sm text-white/80">Placement: {lane.placement}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {lane.workloads.map((item) => (
                    <span className="sm-status-pill" key={`${lane.id}-workload-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">Guardrails: {lane.guardrails.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      {foundryCrews.length ? (
        <section className="sm-surface-deep p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Foundry crews</p>
              <h2 className="mt-2 text-2xl font-bold text-white">These crews design the apps, not just the automations.</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                The tenant now has explicit crews for app design, manufacturing genealogy, and experience evaluation. This is the workforce that turns the
                platform into repeatable AI-native software.
              </p>
            </div>
            <span className="sm-status-pill">{foundryCrews.length} design crews</span>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {foundryCrews.map((playbook) => (
              <article className="sm-proof-card" key={playbook.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{playbook.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{playbook.workspace}</p>
                  </div>
                  <span className="sm-status-pill">{playbook.leadRole}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{playbook.mission}</p>
                <p className="mt-3 text-sm text-white/80">Outputs: {playbook.outputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Cadence: {playbook.cadence.join(' · ')}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Team playbooks</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Named teams, instructions, handoff rules, and KPIs.</h2>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">
              This is the canonical team design for the current tenant. Runtime jobs and people assignments should converge toward this model.
            </p>
          </div>
          <span className="sm-status-pill">{tenant.brandName}</span>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          {operatingModel.playbooks.map((playbook) => (
            <article className="sm-proof-card" key={playbook.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-bold text-white">{playbook.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{playbook.mission}</p>
                </div>
                <span className="sm-status-pill">{playbook.leadRole}</span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Workspace</p>
                  <p className="mt-2 text-sm">{playbook.workspace}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Cadence</p>
                  <p className="mt-2 text-sm">{playbook.cadence.join(' · ')}</p>
                </div>
              </div>

              <div className="mt-4">
                <p className="sm-kicker text-[var(--sm-accent)]">Outputs</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {playbook.outputs.map((output) => (
                    <span className="sm-status-pill" key={output}>
                      {output}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Tool access</p>
                <div className="mt-2 grid gap-2">
                  {playbook.tools.map((toolAccess) => {
                    const tool = operatingModel.tools.find((entry) => entry.id === toolAccess.toolId)
                    return (
                      <div className="sm-chip text-white" key={`${playbook.id}-${toolAccess.toolId}`}>
                        <p className="font-semibold">{tool?.name || toolAccess.toolId}</p>
                        <p className="mt-1 text-sm text-[var(--sm-muted)]">
                          {toolAccess.mode} · {toolAccess.scope}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Instructions</p>
                  <div className="mt-2 space-y-2">
                    {playbook.instructions.map((item) => (
                      <div className="sm-chip text-white" key={item}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Escalate when</p>
                  <div className="mt-2 space-y-2">
                    {playbook.escalateWhen.map((item) => (
                      <div className="sm-chip text-white" key={item}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Write policy</p>
                <p className="mt-2 text-sm">{playbook.writePolicy}</p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {playbook.kpis.map((kpi) => (
                  <div className="sm-chip text-white" key={`${playbook.id}-${kpi.name}`}>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">{kpi.name}</p>
                    <p className="mt-2 text-sm">{kpi.target}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Always-on loops</p>
              <h2 className="mt-2 text-2xl font-bold text-white">The jobs that keep SUPERMEGA.dev moving.</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                Revenue, cleanup, inbound handling, queue control, runtime watch, and the founder brief now live in one operator surface.
              </p>
            </div>
            <button className="sm-button-primary" disabled={jobBusy !== null} onClick={() => void handleRunCoreLoop()} type="button">
              {jobBusy === 'batch' ? 'Running operator loop...' : 'Run full operator loop'}
            </button>
          </div>

          {jobMessage ? <div className="sm-chip mt-4 text-[var(--sm-muted)]">{jobMessage}</div> : null}

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Always on</p>
              <p className="mt-2 text-sm">Scheduler runs these loops even when nobody is in the app.</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Run now</p>
              <p className="mt-2 text-sm">Use manual run for checks, recovery, and urgent refresh.</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Escalation</p>
              <p className="mt-2 text-sm">Ops Watch and Founder Brief raise drift before it becomes a delivery problem.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {activeJobs.length ? (
              activeJobs.map((job) => (
                <div className="sm-proof-card" key={job.job_type}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-bold text-white">{job.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{job.description}</p>
                    </div>
                    <button
                      className="sm-button-secondary"
                      disabled={jobBusy !== null}
                      onClick={() => void handleRunJob(job.job_type)}
                      type="button"
                    >
                      {jobBusy === job.job_type ? 'Running...' : 'Run now'}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Cadence</p>
                      <p className="mt-2 text-sm">{job.cadence}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Last status</p>
                      <p className="mt-2 text-sm">{job.last_run?.status || 'Never run'}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Last completion</p>
                      <p className="mt-2 text-sm">{formatDateTime(job.last_run?.completed_at || job.last_run?.created_at || '')}</p>
                    </div>
                  </div>
                  {job.last_run?.summary ? <div className="sm-chip mt-4 text-[var(--sm-muted)]">{job.last_run.summary}</div> : null}
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No runnable jobs are visible yet.</div>
            )}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Recent outcomes</p>
          <h2 className="mt-2 text-2xl font-bold text-white">What the agents just did.</h2>
          <div className="mt-5 space-y-3">
            {agentRuns.length ? (
              agentRuns.slice(0, 8).map((run) => (
                <div className="sm-chip" key={run.run_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{run.job_type}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{run.summary || run.error_text || 'No summary captured.'}</p>
                    </div>
                    <span className="sm-status-pill">{run.status}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--sm-muted)]">
                    <span>Source: {run.source || 'manual'}</span>
                    <span>By: {run.triggered_by || 'system'}</span>
                    <span>{formatDateTime(run.completed_at || run.created_at)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No recent agent runs yet.</div>
            )}
          </div>
        </article>
      </section>

      {loading ? <div className="sm-chip text-[var(--sm-muted)]">Loading Agent Ops...</div> : null}
      {error ? <div className="sm-chip text-[var(--sm-muted)]">{error}</div> : null}

      {!loading && !error ? (
        <>
          <section className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
            <article className="sm-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">People</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Who can operate this company</h2>
                </div>
                <span className="sm-status-pill">{members.length} active</span>
              </div>

              <div className="mt-5 space-y-3">
                {members.length ? (
                  members.map((member) => (
                    <div className="sm-proof-card" key={member.membership_id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-white">{member.display_name || member.email}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">{member.email}</p>
                        </div>
                        <span className="sm-status-pill">
                          {member.role} / {member.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">No team members added yet.</div>
                )}
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Invite</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Add a workspace member</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                This creates or updates login access for the current workspace. If you leave password blank, a one-time password is generated.
              </p>

              <form className="mt-5 grid gap-4" onSubmit={(event) => void handleInvite(event)}>
                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Name
                  <input
                    className="sm-input"
                    onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Plant manager"
                    value={inviteForm.name}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Email
                  <input
                    className="sm-input"
                    onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="manager@company.com"
                    type="email"
                    value={inviteForm.email}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Role
                  <select
                    className="sm-input"
                    onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value }))}
                    value={inviteForm.role}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Password
                  <input
                    className="sm-input"
                    onChange={(event) => setInviteForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Leave blank to auto-generate"
                    value={inviteForm.password}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button className="sm-button-primary" disabled={inviteBusy} type="submit">
                    {inviteBusy ? 'Adding...' : 'Add member'}
                  </button>
                </div>
              </form>

              {inviteMessage ? <div className="sm-chip mt-4 text-[var(--sm-muted)]">{inviteMessage}</div> : null}
            </article>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Scaling model</p>
              <div className="mt-4 space-y-3">
                {(agentPayload?.scaling_model?.core_loop ?? []).map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
                {!(agentPayload?.scaling_model?.core_loop ?? []).length ? (
                  <div className="sm-chip text-[var(--sm-muted)]">No core loop loaded yet.</div>
                ) : null}
              </div>

              <div className="mt-6 space-y-4">
                {(agentPayload?.teams ?? []).map((team) => (
                  <div className="sm-proof-card" key={team.team_id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-bold text-white">{team.name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{team.mission}</p>
                      </div>
                      <span className="sm-status-pill">
                        {team.status} / {team.scaling_tier}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Lead agent</p>
                        <p className="mt-2 text-sm">{team.lead_agent}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Cadence</p>
                        <p className="mt-2 text-sm">{team.cadence}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {team.agents.map((agent) => (
                        <span className="sm-status-pill" key={agent.agent_id}>
                          {agent.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <div className="space-y-6">
              <article className="sm-surface p-6">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Founder attention</p>
                <div className="mt-4 space-y-3">
                  {(agentPayload?.scaling_model?.founder_focus ?? []).map((item) => (
                    <div className="border-b border-white/8 pb-3 text-sm text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="sm-surface p-6">
                <p className="sm-kicker text-[var(--sm-accent)]">Control rules</p>
                <div className="mt-4 space-y-3">
                  {(agentPayload?.scaling_model?.rules ?? []).map((item) => (
                    <div className="border-b border-white/8 pb-3 text-sm text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="sm-surface p-6">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Next moves</p>
                <div className="mt-4 space-y-3">
                  {(agentPayload?.next_moves ?? []).map((item) => (
                    <div className="sm-chip text-white" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
