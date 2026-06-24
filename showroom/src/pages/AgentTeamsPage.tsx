import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { buildAgentEvidenceLedger } from '../lib/agentEvidenceLedger'
import { AGENT_INFRASTRUCTURE_DECISIONS, AGENT_INFRASTRUCTURE_RADAR } from '../lib/agentInfrastructureRadar'
import { getAgentOperatingModel, getToolDefinitionMap, type AgentOperatingModel } from '../lib/agentOperatingModel'
import { SUPERMEGA_AUTONOMOUS_CLOUD_MODEL } from '../lib/autonomousCloudOperatingModel'
import { getTenantConfig } from '../lib/tenantConfig'
import {
  HUMAN_DATA_LOOPS,
  SOURCE_OWNER_CHANGE_LOOPS,
  summarizeWorkspaceExperienceScorecards,
  summarizeWorkspaceGapCards,
} from '../lib/workspaceGapModel'
import {
  listAgentRuns,
  checkWorkspaceHealth,
  getAgentTeams,
  getCapabilityProfileForRole,
  getWorkspaceSession,
  inviteTeamMember,
  listTeamMembers,
  processAgentRunQueue,
  queueDefaultAgentJobs,
  runAgentJob,
  runDefaultAgentJobs,
  sessionHasCapability,
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

function evidenceGateTone(state: string) {
  const normalized = String(state || '').trim().toLowerCase()
  if (['strong', 'completed', 'ready', 'low', 'approved'].includes(normalized)) return 'text-emerald-300'
  if (['improving', 'running', 'medium', 'review_required_before_writeback', 'mapped_required'].includes(normalized)) return 'text-amber-300'
  if (['weak', 'error', 'failed', 'high', 'failed_review_required'].includes(normalized)) return 'text-rose-300'
  return 'text-white/70'
}

function operatorSafeText(value: unknown, fallback = '') {
  return String(value || fallback)
    .replace(/\bAgent Ops\b/gi, 'Automation Review')
    .replace(/\bAgent infrastructure\b/gi, 'Automation infrastructure')
    .replace(/\bAgent loops\b/gi, 'Review loops')
    .replace(/\bAgent action\b/gi, 'Prepared action')
    .replace(/\bAgent\b/gi, 'Review')
    .replace(/\bagents\b/gi, 'review lanes')
    .replace(/\bagent\b/gi, 'review lane')
    .replace(/\bAI workforce\b/gi, 'Automation support')
    .replace(/\bAI\b/g, 'Automation')
    .replace(/\bcrews\b/gi, 'lanes')
    .replace(/\bcrew\b/gi, 'lane')
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
      throw new Error('Login is required to open Automation Review.')
    }
    if (
      !sessionHasCapability(session.session, 'agent_ops.view') &&
      !sessionHasCapability(session.session, 'tenant_admin.view') &&
      !sessionHasCapability(session.session, 'platform_admin.view')
    ) {
      const profile = getCapabilityProfileForRole(session.session?.role)
      throw new Error(`Automation Review requires an operator, manager, or tenant-admin role. Current role: ${profile.label}.`)
    }

    const [nextAgentPayload, nextMembersPayload, nextRunsPayload] = await Promise.all([
      getAgentTeams() as Promise<AgentTeamPayload>,
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
          setError('Login is required to open Automation Review.')
          setLoading(false)
          return
        }
        if (
          !sessionHasCapability(session.session, 'agent_ops.view') &&
          !sessionHasCapability(session.session, 'tenant_admin.view') &&
          !sessionHasCapability(session.session, 'platform_admin.view')
        ) {
          setError(`Automation Review requires operator or tenant-admin access. Current role: ${getCapabilityProfileForRole(session.session?.role).label}.`)
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
      setJobMessage(nextError instanceof Error ? nextError.message : 'Could not run that automation job right now.')
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
      setJobMessage(`Ran ${payload.count ?? 0} core automation job${payload.count === 1 ? '' : 's'}.`)
    } catch (nextError) {
      setJobMessage(nextError instanceof Error ? nextError.message : 'Could not run the core loop right now.')
    } finally {
      setJobBusy(null)
    }
  }

  async function handleQueueCoreLoop() {
    setJobBusy('queue')
    setJobMessage(null)
    try {
      const payload = await queueDefaultAgentJobs([...runnableJobTypes])
      await loadData()
      setJobMessage(`Queued ${payload.queued_count ?? payload.count ?? 0} safe automation job${payload.queued_count === 1 ? '' : 's'} for the worker queue.`)
    } catch (nextError) {
      setJobMessage(nextError instanceof Error ? nextError.message : 'Could not queue the core loop right now.')
    } finally {
      setJobBusy(null)
    }
  }

  async function handleDrainQueue() {
    setJobBusy('drain')
    setJobMessage(null)
    try {
      const payload = await processAgentRunQueue([...runnableJobTypes], 8)
      await loadData()
      setJobMessage(`Processed ${payload.processed_count ?? payload.count ?? 0} queued automation job${payload.processed_count === 1 ? '' : 's'}.`)
    } catch (nextError) {
      setJobMessage(nextError instanceof Error ? nextError.message : 'Could not process the automation queue right now.')
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
  const evidenceLedger = useMemo(
    () => buildAgentEvidenceLedger(agentRuns, activeJobs, runtimeContract),
    [activeJobs, agentRuns, runtimeContract],
  )
  const workspaceGapSummary = summarizeWorkspaceGapCards()
  const workspaceExperienceSummary = summarizeWorkspaceExperienceScorecards()
  const workspaceGapWatch = [...workspaceGapSummary.cards]
    .filter((card) => ['agent-ops', 'platform-admin', 'manager-system', 'plant-manager', 'product-ops'].includes(card.id))
    .sort((left, right) => left.score - right.score)
    .slice(0, 4)
  const workspaceExperienceWatch = [...workspaceExperienceSummary.cards]
    .map((card) => ({
      ...card,
      compositeScore: Math.round(
        (card.simplicityScore + card.mobileScore + card.learningScore + card.collaborationScore + card.insightScore) / 5,
      ),
    }))
    .filter((card) => ['agent-ops', 'platform-admin', 'manager-system', 'plant-manager', 'product-ops'].includes(card.workspaceId))
    .sort((left, right) => left.compositeScore - right.compositeScore)
    .slice(0, 4)

  if (tenant.key === 'ytf-plant-a') {
    const visibleCrews = (agentPayload?.teams ?? []).slice(0, 5)
    const recentRuns = agentRuns.slice(0, 6)
    const runtimeStatus = loading ? 'Loading' : error ? 'Needs check' : 'Ready'

    return (
      <div className="sm-ytf-simple-page">
        <section className="sm-ytf-hero-row">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">YTF automation support</p>
            <h1>Review lanes.</h1>
            <p>Queue safe jobs, check recent runs, and keep the Plant A workspace improving without exposing internal machinery to managers.</p>
          </div>
          <div className="sm-ytf-status-stack">
            <span>{runtimeStatus}</span>
            <span>{activeJobs.length} jobs</span>
            <span>{visibleCrews.length} lanes</span>
          </div>
        </section>

        {loading ? <p className="sm-ytf-alert">Loading automation runtime...</p> : null}
        {error ? <p className="sm-ytf-alert">{error}</p> : null}
        {jobMessage ? <p className="sm-ytf-alert">{jobMessage}</p> : null}

        {!loading && !error ? (
          <>
            <section className="sm-ytf-action-grid sm-ytf-action-grid-three">
              <button className="sm-ytf-action-tile is-primary text-left" disabled={jobBusy !== null} onClick={() => void handleQueueCoreLoop()} type="button">
                <span>
                  <strong>Queue safe jobs</strong>
                  <small>Prepare the normal review loop.</small>
                </span>
                <span className="sm-ytf-action-arrow">{jobBusy === 'queue' ? 'Queueing...' : 'Queue'}</span>
              </button>
              <button className="sm-ytf-action-tile text-left" disabled={jobBusy !== null} onClick={() => void handleDrainQueue()} type="button">
                <span>
                  <strong>Process queue</strong>
                  <small>Run queued work with the existing guardrails.</small>
                </span>
                <span className="sm-ytf-action-arrow">{jobBusy === 'drain' ? 'Running...' : 'Run'}</span>
              </button>
              <button className="sm-ytf-action-tile text-left" disabled={jobBusy !== null} onClick={() => void handleRunCoreLoop()} type="button">
                <span>
                  <strong>Run now</strong>
                  <small>Manual recovery for urgent admin checks.</small>
                </span>
                <span className="sm-ytf-action-arrow">{jobBusy === 'batch' ? 'Running...' : 'Run'}</span>
              </button>
            </section>

            <section className="sm-ytf-metric-strip">
              <article>
                <span>Lanes</span>
                <strong>{agentPayload?.summary?.team_count ?? visibleCrews.length}</strong>
                <small>Runtime lanes.</small>
              </article>
              <article>
                <span>Runnable</span>
                <strong>{activeJobs.length}</strong>
                <small>Jobs available now.</small>
              </article>
              <article>
                <span>Attention</span>
                <strong>{runtimeHealth.staleCount + runtimeHealth.errorCount}</strong>
                <small>Stale or failed.</small>
              </article>
              <article>
                <span>Last batch</span>
                <strong>{runtimeHealth.lastBatchRun ? 'Seen' : 'None'}</strong>
                <small>{formatDateTime(runtimeHealth.lastBatchRun)}</small>
              </article>
            </section>

            <section className="sm-ytf-split">
              <article className="sm-ytf-panel">
                <div className="sm-ytf-section-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Lanes</p>
                    <h2>What automation owns.</h2>
                  </div>
                  <Link className="sm-button-secondary" to="/app/plantos-template">
                    Template
                  </Link>
                </div>
                <div className="sm-ytf-compact-list">
                  {visibleCrews.length ? (
                    visibleCrews.map((team) => (
                      <article className="sm-ytf-list-row" key={team.team_id}>
                        <span>
                          <strong>{operatorSafeText(team.name)}</strong>
                          <small>{operatorSafeText(team.mission)}</small>
                        </span>
                        <em>{team.status}</em>
                      </article>
                    ))
                  ) : (
                    <article className="sm-ytf-list-row">
                      <span>
                        <strong>No lanes loaded</strong>
                        <small>Check runtime API and admin login.</small>
                      </span>
                      <em>Check</em>
                    </article>
                  )}
                </div>
              </article>

              <article className="sm-ytf-panel">
                <div className="sm-ytf-section-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Recent runs</p>
                    <h2>What just happened.</h2>
                  </div>
                  <Link className="sm-button-secondary" to="/app/platform-admin">
                    Admin
                  </Link>
                </div>
                <div className="sm-ytf-compact-list">
                  {recentRuns.length ? (
                    recentRuns.map((run) => (
                      <article className="sm-ytf-list-row" key={run.run_id}>
                        <span>
                          <strong>{operatorSafeText(run.job_type)}</strong>
                          <small>{operatorSafeText(run.summary || run.error_text || 'No summary captured.')}</small>
                        </span>
                        <em>{run.status || 'queued'}</em>
                      </article>
                    ))
                  ) : (
                    <article className="sm-ytf-list-row">
                      <span>
                        <strong>No recent run</strong>
                        <small>Queue safe jobs first, then process the queue.</small>
                      </span>
                      <em>Empty</em>
                    </article>
                  )}
                </div>
              </article>
            </section>

            <details className="sm-ytf-panel sm-ytf-details">
              <summary>Advanced automation controls</summary>
              <div className="sm-ytf-compact-list">
                {activeJobs.map((job) => (
                  <article className="sm-ytf-list-row" key={job.job_type}>
                    <span>
                      <strong>{operatorSafeText(job.name)}</strong>
                      <small>{operatorSafeText(job.description)}</small>
                    </span>
                    <button
                      className="sm-button-secondary"
                      disabled={jobBusy !== null}
                      onClick={() => void handleRunJob(job.job_type)}
                      type="button"
                    >
                      {jobBusy === job.job_type ? 'Running...' : 'Run'}
                    </button>
                  </article>
                ))}
              </div>
            </details>
          </>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Automation Review"
        title="Keep the company running with people, loops, and escalation."
        description="Scheduler keeps the base loops alive. Manual run is for operator checks, recovery, and urgent refresh."
      />

      {agentPayload?.tenant_state?.status &&
      agentPayload.tenant_state.status !== 'matched' &&
      agentPayload.tenant_state.status !== 'parallel' ? (
        <section className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Tenant state</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Lane state is gated until the active workspace and persisted tenant data line up.</h2>
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
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Review loops</p>
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
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Named tools with scoped automation access.</p>
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

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="sm-kicker text-[var(--sm-accent)]">Automation infrastructure radar</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Adopt new automation infrastructure only when it creates a clearer operating system.</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
              This is the build filter for SuperMega: one default execution lane, one enterprise Google lane, and one Vercel cloud lane. Everything else stays in R&D until it proves value.
            </p>
          </div>
          <Link className="sm-link" to="/app/factory">
            Open build studio
          </Link>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-5">
          {AGENT_INFRASTRUCTURE_RADAR.map((item) => (
            <article className="sm-proof-card" key={item.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="sm-status-pill text-white">{item.provider}</span>
                <span className="sm-status-pill text-[var(--sm-accent)]">{item.status}</span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">{item.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.productMove}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.modules.slice(0, 3).map((module) => (
                  <span className="sm-chip text-xs text-white" key={module}>
                    {module}
                  </span>
                ))}
              </div>
              <a className="mt-4 inline-flex text-sm font-semibold text-[var(--sm-accent)]" href={item.sourceUrl} rel="noreferrer" target="_blank">
                {item.sourceLabel}
              </a>
            </article>
          ))}
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {AGENT_INFRASTRUCTURE_DECISIONS.map((item) => (
            <article className="rounded-3xl border border-white/10 bg-black/20 p-4" key={item.id}>
              <p className="text-sm font-semibold text-white">{item.decision}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.why}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--sm-accent-alt)]">{item.nextBuild}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Evidence ledger</p>
          <p className="mt-3 text-5xl font-bold text-white">{evidenceLedger.score}</p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{evidenceLedger.verdict}</p>
          <div className="mt-6 grid gap-3">
            {[
              ['Successful', evidenceLedger.successfulRuns],
              ['Failed', evidenceLedger.failedRuns],
              ['Reviewable', evidenceLedger.reviewableRuns],
              ['Due jobs', evidenceLedger.dueJobs],
            ].map(([label, value]) => (
              <div className="flex items-center justify-between border-b border-white/10 pb-2 text-sm last:border-b-0 last:pb-0" key={label}>
                <span className="text-[var(--sm-muted)]">{label}</span>
                <span className="font-semibold text-white">{value}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Autonomy gates</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Automation only earns more autonomy when the evidence is inspectable.</h2>
            </div>
            <Link className="sm-link" to="/app/security">
              Open security
            </Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {evidenceLedger.gates.map((gate) => (
              <article className="sm-chip text-white" key={gate.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{gate.name}</p>
                  <span className={`sm-status-pill ${evidenceGateTone(gate.state)}`}>{gate.state}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{gate.detail}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 grid gap-3">
            {evidenceLedger.rows.slice(0, 4).map((row) => (
              <article className="sm-proof-card" key={row.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{row.jobType}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.evidence}</p>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--sm-muted)]">
                      Scope: {row.inputScope} Output: {row.outputArtifact}
                    </p>
                  </div>
                  <span className={`sm-status-pill ${evidenceGateTone(row.status)}`}>{row.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--sm-muted)]">
                  <span>{row.source}</span>
                  <span>{row.triggeredBy}</span>
                  <span>{formatDateTime(row.completedAt)}</span>
                  <span>Attempts {row.attemptLabel}</span>
                  <span>Related {row.relatedEntity}</span>
                  <span>{row.action}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="sm-status-pill text-sky-300">Owner: {row.owner}</span>
                  <span className={`sm-status-pill ${evidenceGateTone(row.approvalState)}`}>Approval: {row.approvalState}</span>
                  <span className={`sm-status-pill ${evidenceGateTone(row.securityDrillStatus)}`}>Security: {row.securityDrillStatus}</span>
                  <span className={`sm-status-pill ${evidenceGateTone(row.riskLevel)}`}>Risk: {row.riskLevel}</span>
                </div>
                <div className="mt-3 grid gap-2 text-xs leading-relaxed text-[var(--sm-muted)] md:grid-cols-3">
                  <span>Tools: {row.toolCalls.length ? row.toolCalls.join(', ') : 'not named'}</span>
                  <span>Sources: {row.sourceRefs.length ? row.sourceRefs.join(', ') : 'not named'}</span>
                  <span>Rollback: {row.rollbackPath}</span>
                </div>
                <div className="mt-2 grid gap-2 text-xs leading-relaxed text-[var(--sm-muted)] md:grid-cols-3">
                  <span>Idempotency: {row.idempotencyKey}</span>
                  <span>Schedule: {row.scheduledFor}</span>
                  <span>Missing: {row.missingFields.length ? row.missingFields.join(', ') : 'none'}</span>
                </div>
              </article>
            ))}
            {!evidenceLedger.rows.length ? <div className="sm-chip text-[var(--sm-muted)]">No run evidence is available yet. Run the operator loop first.</div> : null}
          </div>
        </article>
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
              <p className="sm-kicker text-[var(--sm-accent)]">Lane runtime contract</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Each lane now has a named workspace, tool boundary, scheduler lane, and approval edge.</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                This is the operator-facing contract for cloud lanes: where they run, what they can touch, and how risky work is contained.
              </p>
            </div>
            <span className="sm-status-pill">{runtimeContract.crews.length} lanes</span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Lane workspaces</p>
              <p className="mt-2 text-sm">{runtimeContract.summary?.workspace_count ?? 0} named workspaces</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Scheduler-backed lanes</p>
              <p className="mt-2 text-sm">{runtimeContract.summary?.scheduler_backed_team_count ?? 0} lanes tied to recurring jobs</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Connector lanes</p>
              <p className="mt-2 text-sm">{runtimeContract.summary?.connector_enabled_team_count ?? 0} lanes with direct connector scope</p>
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
                    <p className="text-xl font-bold text-white">{operatorSafeText(crew.name || crew.team_id || 'Lane')}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{operatorSafeText(crew.runtime_lane || 'Runtime lane not declared yet.')}</p>
                  </div>
                  <span className="sm-status-pill">{operatorSafeText(crew.guardrail_posture || 'Guardrails pending')}</span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Workspace</p>
                    <p className="mt-2 text-sm">{crew.workspace || 'Unassigned workspace'}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Execution</p>
                    <p className="mt-2 text-sm">{operatorSafeText(crew.execution_mode || 'Manual lane')}</p>
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
                    <p className="mt-2 text-sm">{operatorSafeText(crew.job_types?.join(' · ') || 'No recurring job mapped yet')}</p>
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
                    <p className="mt-2 text-sm">{operatorSafeText(crew.write_policy || 'Human review before writes.')}</p>
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

      <section className="grid gap-6 lg:grid-cols-[1.04fr_0.96fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Human data loops</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Source changes should become one review packet for the right human owner.</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                This is the operating contract for Drive, Gmail, ERP exports, daily entries, and quality clusters. Agents prepare the packet; the owner makes the decision.
              </p>
            </div>
            <span className="sm-status-pill">{HUMAN_DATA_LOOPS.length} loops</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Critical lanes</p>
              <p className="mt-2 text-3xl font-bold text-white">{HUMAN_DATA_LOOPS.length}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Change-triggered loops with explicit owner handoff.</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Reviewable packets</p>
              <p className="mt-2 text-3xl font-bold text-white">{HUMAN_DATA_LOOPS.filter((loop) => loop.kpis.length >= 3).length}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Loops already shaped as KPI-backed decision packets.</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Weakest workspace</p>
              <p className="mt-2 text-lg font-bold text-white">{workspaceGapSummary.weakestCard?.name || 'No workspace watch yet'}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {workspaceGapSummary.weakestCard ? `${workspaceGapSummary.weakestCard.score}/100` : 'Gap watch pending.'}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {HUMAN_DATA_LOOPS.map((loop) => (
              <article className="sm-proof-card" key={loop.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-home-proof-label">{loop.owner}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{loop.name}</h3>
                  </div>
                  <span className="sm-status-pill">{loop.kpis.length} KPIs</span>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Change signal</p>
                    <p className="mt-2 text-sm">{loop.changeSignal}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Prepared action</p>
                    <p className="mt-2 text-sm">{operatorSafeText(loop.agentAction)}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Human decision</p>
                    <p className="mt-2 text-sm">{loop.humanDecision}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {loop.kpis.map((kpi) => (
                    <span className="sm-status-pill" key={`${loop.id}-${kpi}`}>
                      {kpi}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/manager-system">
              Open Manager Workspace
            </Link>
            <Link className="sm-button-secondary" to="/app/plant-manager">
              Open Plant Manager
            </Link>
            <Link className="sm-button-secondary" to="/app/product-ops">
              Open Product Ops
            </Link>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Source-owner loops</p>
                <h3 className="mt-2 text-2xl font-bold text-white">When files still live on human-owned machines, Automation Review needs a companion lane.</h3>
              </div>
              <span className="sm-status-pill">{SOURCE_OWNER_CHANGE_LOOPS.length} lanes</span>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {SOURCE_OWNER_CHANGE_LOOPS.map((loop) => (
                <article className="sm-proof-card" key={loop.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{loop.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{loop.ownerContext}</p>
                    </div>
                    <span className="sm-status-pill">desktop + mobile</span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Change signal</p>
                      <p className="mt-2 text-sm">{loop.changeSignal}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">System action</p>
                      <p className="mt-2 text-sm">{loop.systemAction}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Human decision</p>
                      <p className="mt-2 text-sm">{loop.humanDecision}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Desktop fit</p>
                      <p className="mt-2 text-sm">{loop.desktopFit}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Mobile fit</p>
                      <p className="mt-2 text-sm">{loop.mobileFit}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-white/80">
                    <span className="font-semibold text-white">Insight output:</span> {loop.insightOutput}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Experience watch</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Automation Review should watch simplicity, mobile fit, and insight quality before drift becomes rework.</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                The runtime should not just run jobs. It should measure whether each workspace stays simple enough, mobile-safe, and useful enough for the human owner.
              </p>
            </div>
            <span className="sm-status-pill">{workspaceExperienceSummary.overallAverage}/100 avg</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Overall</p>
              <p className="mt-2 text-3xl font-bold text-white">{workspaceExperienceSummary.overallAverage}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Simplicity</p>
              <p className="mt-2 text-3xl font-bold text-white">{workspaceExperienceSummary.simplicityAverage}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Mobile</p>
              <p className="mt-2 text-3xl font-bold text-white">{workspaceExperienceSummary.mobileAverage}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Learning</p>
              <p className="mt-2 text-3xl font-bold text-white">{workspaceExperienceSummary.learningAverage}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Insight</p>
              <p className="mt-2 text-3xl font-bold text-white">{workspaceExperienceSummary.insightAverage}</p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {workspaceExperienceWatch.map((card) => (
              <article className="sm-proof-card" key={card.workspaceId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{card.label}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{card.verdict}</p>
                  </div>
                  <span className="sm-status-pill">{card.compositeScore}/100</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-5">
                  {[
                    ['Simple', card.simplicityScore],
                    ['Mobile', card.mobileScore],
                    ['Learning', card.learningScore],
                    ['Collab', card.collaborationScore],
                    ['Insight', card.insightScore],
                  ].map(([label, value]) => (
                    <div className="sm-chip text-white" key={`${card.workspaceId}-${label}`}>
                      <p className="sm-kicker text-[var(--sm-accent)]">{label}</p>
                      <p className="mt-2 text-lg font-bold text-white">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-white/80">
                  <span className="font-semibold text-white">ERRC focus:</span> {card.errcFocus}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="sm-status-pill">Continuous evaluation</span>
                  <span className="sm-status-pill">Human-owner fit</span>
                  <span className="sm-status-pill">Adaptive module candidate</span>
                </div>
                <div className="mt-4">
                  <Link
                    className="sm-link"
                    to={workspaceGapSummary.cards.find((gapCard) => gapCard.id === card.workspaceId)?.route || '/app/product-ops'}
                  >
                    Open workspace
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-6 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Gap watch</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">
                  Weakest current surface: {workspaceGapSummary.weakestCard?.name || 'No workspace watch yet'}{' '}
                  {workspaceGapSummary.weakestCard ? `(${workspaceGapSummary.weakestCard.score}/100)` : ''}
                </p>
              </div>
              <span className="sm-status-pill">{workspaceGapSummary.interventionCount} intervention lanes</span>
            </div>
            <div className="mt-4 space-y-3">
              {workspaceGapWatch.slice(0, 3).map((card) => (
                <div className="sm-chip text-white" key={`gap-watch-${card.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="font-semibold">{card.name}</p>
                    <span className="sm-status-pill">{card.score}/100</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{card.mainGap}</p>
                  <p className="mt-2 text-sm text-white/80">
                    <span className="font-semibold text-white">Create:</span> {card.errc.create}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

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
              <h2 className="mt-2 text-2xl font-bold text-white">Lanes should know which runtime they belong to before they run autonomously.</h2>
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
              <p className="sm-kicker text-[var(--sm-accent)]">Foundry lanes</p>
              <h2 className="mt-2 text-2xl font-bold text-white">These lanes design the apps, not just the automations.</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                The tenant now has explicit crews for app design, manufacturing genealogy, and experience evaluation. This is the workforce that turns the
                platform into repeatable AI-native software.
              </p>
            </div>
            <span className="sm-status-pill">{foundryCrews.length} design lanes</span>
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
            <div className="flex flex-wrap gap-3">
              <button className="sm-button-secondary" disabled={jobBusy !== null} onClick={() => void handleQueueCoreLoop()} type="button">
                {jobBusy === 'queue' ? 'Queueing...' : 'Queue loop'}
              </button>
              <button className="sm-button-secondary" disabled={jobBusy !== null} onClick={() => void handleDrainQueue()} type="button">
                {jobBusy === 'drain' ? 'Processing...' : 'Drain queue'}
              </button>
              <button className="sm-button-primary" disabled={jobBusy !== null} onClick={() => void handleRunCoreLoop()} type="button">
                {jobBusy === 'batch' ? 'Running operator loop...' : 'Run now'}
              </button>
            </div>
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
          <h2 className="mt-2 text-2xl font-bold text-white">What automation just did.</h2>
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
              <div className="sm-chip text-[var(--sm-muted)]">No recent automation runs yet.</div>
            )}
          </div>
        </article>
      </section>

      {loading ? <div className="sm-chip text-[var(--sm-muted)]">Loading Automation Review...</div> : null}
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
                        <p className="sm-kicker text-[var(--sm-accent)]">Lead lane</p>
                        <p className="mt-2 text-sm">{operatorSafeText(team.lead_agent)}</p>
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
