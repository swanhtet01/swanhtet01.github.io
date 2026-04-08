import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  checkWorkspaceHealth,
  getWorkspaceSession,
  listAgentRuns,
  listTeamMembers,
  runDefaultAgentJobs,
  workspaceApiBase,
  workspaceAppBase,
  workspaceFetch,
  type AgentJobTemplate,
  type AgentRunRow,
  type TeamMemberRow,
  type WorkspaceSessionPayload,
} from '../lib/workspaceApi'

type SummaryPayload = {
  supervisor?: {
    status?: string
    cycle_count?: number
    interval_minutes?: number
    last_finished_at?: string
  }
  workspace?: {
    drive_folder_link?: string
    google_doc_link?: string
  }
  approvals?: { approval_count?: number }
  actions?: { total_items?: number }
  lead_pipeline?: { lead_count?: number }
  product_lab?: {
    flagship_status?: string
    pilot_ready_count?: number
    live_demo_count?: number
  }
}

type AgentTeamPayload = {
  summary?: {
    team_count?: number
    autonomy_score?: number
    autonomy_level?: string
    shared_core_team_count?: number
  }
  gaps?: string[]
  next_moves?: string[]
}

type ContactSubmissionRow = {
  submission_id?: number
  created_at?: string
  source?: string
  name?: string
  email?: string
  company?: string
  workflow?: string
  data_summary?: string
  goal?: string
}

type WorkspacesPayload = {
  active_workspace?: {
    workspace_id?: string
    workspace_slug?: string
    workspace_name?: string
    workspace_plan?: string
  }
  app_workspaces?: Array<{
    workspace_id?: string
    slug?: string
    name?: string
    plan?: string
    role?: string
  }>
  input_center_workspace?: string
  published_workspace?: string
  published_google_doc?: string
  templates?: Array<{
    key?: string
    title?: string
    web_view_link?: string
    spreadsheet_id?: string
  }>
}

type TenantArchitecturePayload = {
  resolved_tenant?: string
  auth?: {
    auth_required?: boolean
    uses_default_credentials?: boolean
    default_username?: string
    default_workspace_slug?: string
    default_workspace_name?: string
    default_workspace_plan?: string
    session_ttl_hours?: number
  }
  google_auth?: {
    enabled?: boolean
    auto_provision?: boolean
    client_json_configured?: boolean
    client_id_configured?: boolean
    client_secret_configured?: boolean
    redirect_uri_configured?: boolean
    allowed_domains?: string[]
  }
}

function formatDateTime(value?: string) {
  if (!value) {
    return 'Never'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

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

function formatHost(value: string) {
  if (!value) {
    return 'Not configured'
  }
  try {
    return new URL(value).host
  } catch {
    return value.replace(/^https?:\/\//, '')
  }
}

export function FounderControlPlanePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<'defaults' | 'queue' | null>(null)
  const [session, setSession] = useState<WorkspaceSessionPayload['session'] | null>(null)
  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [agentPayload, setAgentPayload] = useState<AgentTeamPayload | null>(null)
  const [members, setMembers] = useState<TeamMemberRow[]>([])
  const [agentJobs, setAgentJobs] = useState<AgentJobTemplate[]>([])
  const [agentRuns, setAgentRuns] = useState<AgentRunRow[]>([])
  const [contacts, setContacts] = useState<ContactSubmissionRow[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspacesPayload | null>(null)
  const [tenantArchitecture, setTenantArchitecture] = useState<TenantArchitecturePayload | null>(null)

  const loadData = useCallback(async () => {
    const health = await checkWorkspaceHealth()
    if (!health.ready) {
      throw new Error('Workspace API is not connected on this host yet.')
    }

    const sessionPayload = await getWorkspaceSession()
    if (!sessionPayload.authenticated) {
      throw new Error('Login is required to open Dev Desk.')
    }

    const [summaryPayload, agentTeamPayload, memberPayload, agentRunPayload, contactPayload, workspacePayload, tenantPayload] = await Promise.all([
      workspaceFetch<SummaryPayload>('/api/summary'),
      workspaceFetch<AgentTeamPayload>('/api/agent-teams'),
      listTeamMembers(),
      listAgentRuns(16),
      workspaceFetch<{ rows?: ContactSubmissionRow[] }>('/api/contact-submissions?limit=8'),
      workspaceFetch<WorkspacesPayload>('/api/workspaces'),
      workspaceFetch<TenantArchitecturePayload>('/api/platform/tenant-architecture'),
    ])

    setSession(sessionPayload.session ?? null)
    setSummary(summaryPayload)
    setAgentPayload(agentTeamPayload)
    setMembers(memberPayload.rows ?? [])
    setAgentJobs(agentRunPayload.jobs ?? [])
    setAgentRuns(agentRunPayload.rows ?? [])
    setContacts(contactPayload.rows ?? [])
    setWorkspaces(workspacePayload)
    setTenantArchitecture(tenantPayload)
    setError(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await loadData()
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Dev Desk could not be loaded right now.')
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

  async function handleRunDefaults() {
    setBusy('defaults')
    setMessage(null)
    try {
      const payload = await runDefaultAgentJobs()
      await loadData()
      setMessage(`Ran ${payload.count ?? 0} default loop${payload.count === 1 ? '' : 's'}.`)
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not run the core loops.')
    } finally {
      setBusy(null)
    }
  }

  async function handleProcessQueue() {
    setBusy('queue')
    setMessage(null)
    try {
      const payload = await workspaceFetch<{ count?: number }>('/api/agent-runs/process-queue', {
        method: 'POST',
        body: JSON.stringify({
          source: 'manual_control_plane',
          limit: 8,
        }),
      })
      await loadData()
      setMessage(`Processed ${payload.count ?? 0} queued job${payload.count === 1 ? '' : 's'}.`)
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : 'Could not process the queue right now.')
    } finally {
      setBusy(null)
    }
  }

  const runtimeHealth = useMemo(() => {
    const now = Date.now()
    let staleCount = 0
    let errorCount = 0

    for (const job of agentJobs) {
      const lastStatus = String(job.last_run?.status || '').trim().toLowerCase()
      if (lastStatus === 'error') {
        errorCount += 1
      }
      const lastTimestamp = String(job.last_run?.completed_at || job.last_run?.created_at || '').trim()
      const parsed = lastTimestamp ? new Date(lastTimestamp) : null
      const thresholdMs = cadenceThresholdMinutes(job.cadence) * 60 * 1000
      if (!parsed || Number.isNaN(parsed.getTime()) || now - parsed.getTime() > thresholdMs) {
        staleCount += 1
      }
    }

    const latestSchedulerRun = agentRuns.find((row) => String(row.source || '').trim().toLowerCase() === 'scheduler')

    return {
      staleCount,
      errorCount,
      lastSchedulerRun: latestSchedulerRun?.completed_at || latestSchedulerRun?.created_at || '',
    }
  }, [agentJobs, agentRuns])

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : workspaceAppBase || workspaceApiBase || ''

  const tenantModeLabel = useMemo(() => {
    const tenantKey = String(tenantArchitecture?.resolved_tenant || '').trim().toLowerCase()
    if (!tenantKey || tenantKey === 'default' || tenantKey === 'supermega' || tenantKey === 'supermega-lab') {
      return 'General SuperMega'
    }
    if (tenantKey.includes('ytf')) {
      return 'YTF tenant'
    }
    return tenantArchitecture?.resolved_tenant || 'General SuperMega'
  }, [tenantArchitecture])

  const googleAuthReady = Boolean(
    tenantArchitecture?.google_auth?.enabled &&
      (
        tenantArchitecture?.google_auth?.client_json_configured ||
        (tenantArchitecture?.google_auth?.client_id_configured &&
          tenantArchitecture?.google_auth?.client_secret_configured &&
          tenantArchitecture?.google_auth?.redirect_uri_configured)
      ),
  )

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Dev Desk"
        title="Control runtime, tenants, and releases."
        description="Founder surface for app health, workspaces, inbound, loops, and rollout state."
      />

      <section className="grid gap-4 md:grid-cols-6">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Runtime</p>
          <p className="mt-3 text-3xl font-bold text-white">{error ? 'Issue' : 'Ready'}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Workspace</p>
          <p className="mt-3 text-xl font-bold text-white">{workspaces?.active_workspace?.workspace_slug || session?.workspace_slug || 'none'}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Tenants</p>
          <p className="mt-3 text-3xl font-bold text-white">{workspaces?.app_workspaces?.length ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Inbound</p>
          <p className="mt-3 text-3xl font-bold text-white">{contacts.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Loop drift</p>
          <p className="mt-3 text-3xl font-bold text-white">{runtimeHealth.staleCount}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Autonomy</p>
          <p className="mt-3 text-3xl font-bold text-white">{agentPayload?.summary?.autonomy_score ?? 0}</p>
        </div>
      </section>

      {loading ? <div className="sm-chip text-[var(--sm-muted)]">Loading Dev Desk...</div> : null}
      {error ? <div className="sm-chip text-[var(--sm-muted)]">{error}</div> : null}

      {!loading && !error ? (
        <>
          <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <article className="sm-surface p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Runtime</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">What is live right now.</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className="sm-button-primary" disabled={busy !== null} onClick={() => void handleRunDefaults()} type="button">
                    {busy === 'defaults' ? 'Running...' : 'Run core loops'}
                  </button>
                  <button className="sm-button-secondary" disabled={busy !== null} onClick={() => void handleProcessQueue()} type="button">
                    {busy === 'queue' ? 'Processing...' : 'Process queue'}
                  </button>
                </div>
              </div>

              {message ? <div className="sm-chip mt-4 text-[var(--sm-muted)]">{message}</div> : null}

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Public site</p>
                  <p className="mt-2 text-sm">{formatHost('https://supermega.dev')}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">App host</p>
                  <p className="mt-2 text-sm">{formatHost(workspaceAppBase || currentOrigin)}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">API host</p>
                  <p className="mt-2 text-sm">{formatHost(workspaceApiBase || currentOrigin)}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Supervisor</p>
                  <p className="mt-2 text-sm">
                    {summary?.supervisor?.status || 'manual'}
                    {summary?.supervisor?.interval_minutes ? ` / ${summary.supervisor.interval_minutes}m` : ''}
                  </p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Last scheduler</p>
                  <p className="mt-2 text-sm">{formatDateTime(runtimeHealth.lastSchedulerRun)}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Current tenant</p>
                  <p className="mt-2 text-sm">
                    {workspaces?.active_workspace?.workspace_name || session?.workspace_name || 'SuperMega'}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-secondary" to="/app/hq">
                  Open HQ
                </Link>
                <Link className="sm-button-secondary" to="/app/agents">
                  Open Agents
                </Link>
                <Link className="sm-button-secondary" to="/app/company">
                  Open company log
                </Link>
                <Link className="sm-button-secondary" to="/">
                  Open public site
                </Link>
                {summary?.workspace?.google_doc_link ? (
                  <a className="sm-button-secondary" href={summary.workspace.google_doc_link} rel="noreferrer" target="_blank">
                    Open latest brief
                  </a>
                ) : null}
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Identity</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Auth and tenant mode</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Tenant</p>
                  <p className="mt-2 text-sm">{tenantModeLabel}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Auth mode</p>
                  <p className="mt-2 text-sm">
                    {tenantArchitecture?.auth?.auth_required ? 'Protected' : 'Open'}
                    {tenantArchitecture?.auth?.session_ttl_hours ? ` / ${tenantArchitecture.auth.session_ttl_hours}h session` : ''}
                  </p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Demo credentials</p>
                  <p className="mt-2 text-sm">{tenantArchitecture?.auth?.uses_default_credentials ? 'Active' : 'Off'}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Google auth</p>
                  <p className="mt-2 text-sm">{googleAuthReady ? 'Ready' : tenantArchitecture?.google_auth?.enabled ? 'Partial' : 'Off'}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Default identity</p>
                  <p className="mt-2 text-sm">
                    {tenantArchitecture?.auth?.default_username || 'Not set'}
                    {tenantArchitecture?.auth?.default_workspace_slug ? ` / ${tenantArchitecture.auth.default_workspace_slug}` : ''}
                  </p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Google domains</p>
                  <p className="mt-2 text-sm">
                    {(tenantArchitecture?.google_auth?.allowed_domains ?? []).length
                      ? tenantArchitecture?.google_auth?.allowed_domains?.join(', ')
                      : 'Any domain'}
                  </p>
                </div>
              </div>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Tenants</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Where the company is currently deployed.</h2>
              <div className="mt-5 space-y-3">
                {(workspaces?.app_workspaces ?? []).length ? (
                  workspaces?.app_workspaces?.map((workspace) => (
                    <div className="sm-proof-card" key={workspace.workspace_id || workspace.slug || workspace.name}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-white">{workspace.name || workspace.slug || 'Workspace'}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">{workspace.slug || 'No slug'}</p>
                        </div>
                        <span className="sm-status-pill">
                          {workspace.plan || 'plan'} / {workspace.role || 'role'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">No additional workspaces are registered yet.</div>
                )}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Published workspace</p>
                  {workspaces?.published_workspace ? (
                    <a className="mt-2 block text-sm text-white underline underline-offset-4" href={workspaces.published_workspace} rel="noreferrer" target="_blank">
                      Open published sheet
                    </a>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Not linked</p>
                  )}
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Templates</p>
                  <p className="mt-2 text-2xl font-bold">{workspaces?.templates?.length ?? 0}</p>
                </div>
              </div>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Inbound</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What prospects asked for.</h2>
              <div className="mt-5 space-y-3">
                {contacts.length ? (
                  contacts.map((row) => (
                    <div className="sm-proof-card" key={`${row.submission_id ?? row.created_at ?? row.email}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{row.company || row.name || 'Inbound request'}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.workflow || row.goal || 'No workflow captured.'}</p>
                        </div>
                        <span className="sm-status-pill">{formatDateTime(row.created_at)}</span>
                      </div>
                      {row.goal ? <p className="mt-3 text-sm text-[var(--sm-muted)]">{row.goal}</p> : null}
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">No inbound requests have been captured yet.</div>
                )}
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Execution</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What the system just did.</h2>
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
                        <span>{run.source || 'manual'}</span>
                        <span>{run.triggered_by || 'system'}</span>
                        <span>{formatDateTime(run.completed_at || run.created_at)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">No recent runs are visible yet.</div>
                )}
              </div>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Operators</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Who can act inside the company.</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {members.length ? (
                  members.slice(0, 8).map((member) => (
                    <div className="sm-chip text-white" key={member.membership_id}>
                      <p className="font-semibold">{member.display_name || member.email}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{member.email}</p>
                      <p className="mt-2 text-xs text-[var(--sm-muted)]">
                        {member.role} / {member.status}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">No team members loaded.</div>
                )}
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Control notes</p>
              <div className="mt-4 space-y-3">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Approvals</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.approvals?.approval_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Open workflows</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.actions?.total_items ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Deals tracked</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.lead_pipeline?.lead_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Product lab</p>
                  <p className="mt-2 text-sm">
                    {summary?.product_lab?.flagship_status || 'No flagship status'}
                    {summary?.product_lab?.live_demo_count ? ` / ${summary.product_lab.live_demo_count} live demos` : ''}
                  </p>
                </div>
                {(agentPayload?.gaps ?? []).slice(0, 2).map((item) => (
                  <div className="sm-chip text-[var(--sm-muted)]" key={item}>
                    {item}
                  </div>
                ))}
                {(agentPayload?.next_moves ?? []).slice(0, 2).map((item) => (
                  <div className="sm-chip text-[var(--sm-muted)]" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  )
}
