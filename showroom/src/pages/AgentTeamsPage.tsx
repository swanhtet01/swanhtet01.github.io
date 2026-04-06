import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { PageIntro } from '../components/PageIntro'
import {
  listAgentRuns,
  checkWorkspaceHealth,
  getWorkspaceSession,
  inviteTeamMember,
  listTeamMembers,
  runAgentJob,
  runDefaultAgentJobs,
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

type AgentTeamPayload = {
  status: string
  summary?: {
    team_count?: number
    shared_core_team_count?: number
    client_pod_team_count?: number
    autonomy_score?: number
    autonomy_level?: string
  }
  teams?: AgentTeam[]
  gaps?: string[]
  next_moves?: string[]
  scaling_model?: {
    core_loop?: string[]
    founder_focus?: string[]
    rules?: string[]
  }
}

const roleOptions = ['member', 'operator', 'manager', 'owner'] as const
const runnableJobTypes = ['revenue_scout', 'list_clerk', 'task_triage', 'founder_brief'] as const

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
          setError('Login is required to open Team.')
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

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Agent Ops"
        title="Run the company with people, loops, and approvals."
        description="Invite managers, trigger the core loops, and see what the agent system actually did."
      />

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

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Core agent army</p>
              <h2 className="mt-2 text-2xl font-bold text-white">The loops that keep SuperMega moving.</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">These are the real runnable jobs in production. Manual run is for operator checks. Scheduler keeps the base loop alive.</p>
            </div>
            <button className="sm-button-primary" disabled={jobBusy !== null} onClick={() => void handleRunCoreLoop()} type="button">
              {jobBusy === 'batch' ? 'Running core loop...' : 'Run all core loops'}
            </button>
          </div>

          {jobMessage ? <div className="sm-chip mt-4 text-[var(--sm-muted)]">{jobMessage}</div> : null}

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

      {loading ? <div className="sm-chip text-[var(--sm-muted)]">Loading Team...</div> : null}
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
              <h2 className="mt-2 text-2xl font-bold text-white">Add a manager or operator</h2>
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
