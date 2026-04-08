import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

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
      throw new Error('Login is required to open Founder.')
    }

    const [
      summaryPayload,
      agentTeamPayload,
      memberPayload,
      agentRunPayload,
      contactPayload,
      workspacePayload,
      tenantPayload,
    ] = await Promise.all([
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
          setError(nextError instanceof Error ? nextError.message : 'Founder console could not be loaded.')
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
      setMessage(`Ran ${payload.count ?? 0} core loop${payload.count === 1 ? '' : 's'}.`)
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
      (tenantArchitecture?.google_auth?.client_json_configured ||
        (tenantArchitecture?.google_auth?.client_id_configured &&
          tenantArchitecture?.google_auth?.client_secret_configured &&
          tenantArchitecture?.google_auth?.redirect_uri_configured)),
  )

  return (
    <div className="sm-app-page">
      <section className="sm-app-panel">
        <div className="sm-app-header">
          <div className="sm-app-header-copy">
            <p className="sm-kicker text-[var(--sm-accent)]">Founder</p>
            <h2>Control runtime and tenants.</h2>
            <p>Use this screen to run the company stack, check drift, and move between workspaces fast.</p>
          </div>

          <div className="sm-app-actions">
            <button className="sm-button-primary" disabled={busy !== null} onClick={() => void handleRunDefaults()} type="button">
              {busy === 'defaults' ? 'Running…' : 'Run core loops'}
            </button>
            <button className="sm-button-secondary" disabled={busy !== null} onClick={() => void handleProcessQueue()} type="button">
              {busy === 'queue' ? 'Processing…' : 'Process queue'}
            </button>
            <Link className="sm-button-secondary" to="/app/agents">
              Open agents
            </Link>
            <Link className="sm-button-secondary" to="/app/company">
              Company log
            </Link>
          </div>
        </div>

        {message ? <div className="sm-app-note mt-4">{message}</div> : null}
      </section>

      <section className="sm-app-kpi-strip">
        <article className="sm-app-kpi">
          <p className="sm-app-label">Runtime</p>
          <strong>{error ? 'Issue' : 'Ready'}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Workspace</p>
          <strong>{workspaces?.active_workspace?.workspace_slug || session?.workspace_slug || 'none'}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Tenants</p>
          <strong>{workspaces?.app_workspaces?.length ?? 0}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Inbound</p>
          <strong>{contacts.length}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Loop drift</p>
          <strong>{runtimeHealth.staleCount}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Autonomy</p>
          <strong>{agentPayload?.summary?.autonomy_score ?? 0}</strong>
        </article>
      </section>

      {loading ? <div className="sm-app-note">Loading founder console…</div> : null}
      {error ? <div className="sm-app-note">{error}</div> : null}

      {!loading && !error ? (
        <>
          <section className="sm-app-grid-split">
            <article className="sm-app-panel">
              <div className="sm-app-panel-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Live stack</p>
                  <h2>Runtime</h2>
                </div>
                <span className="sm-status-pill">{summary?.supervisor?.status || 'manual'}</span>
              </div>

              <div className="sm-app-mini-grid">
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Public site</p>
                  <strong>{formatHost('https://supermega.dev')}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">App host</p>
                  <strong>{formatHost(workspaceAppBase || currentOrigin)}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">API host</p>
                  <strong>{formatHost(workspaceApiBase || currentOrigin)}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Cycle</p>
                  <strong>{summary?.supervisor?.interval_minutes ? `${summary.supervisor.interval_minutes}m` : 'Manual'}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Last scheduler</p>
                  <strong>{formatDateTime(runtimeHealth.lastSchedulerRun)}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Current tenant</p>
                  <strong>{workspaces?.active_workspace?.workspace_name || session?.workspace_name || 'SuperMega'}</strong>
                </div>
              </div>
            </article>

            <article className="sm-app-panel-muted">
              <div className="sm-app-panel-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Identity</p>
                  <h2>Auth and tenant mode</h2>
                </div>
                <span className="sm-status-pill">{tenantModeLabel}</span>
              </div>

              <div className="sm-app-mini-grid">
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Auth mode</p>
                  <strong>
                    {tenantArchitecture?.auth?.auth_required ? 'Protected' : 'Open'}
                    {tenantArchitecture?.auth?.session_ttl_hours ? ` / ${tenantArchitecture.auth.session_ttl_hours}h` : ''}
                  </strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Demo credentials</p>
                  <strong>{tenantArchitecture?.auth?.uses_default_credentials ? 'Active' : 'Off'}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Google auth</p>
                  <strong>{googleAuthReady ? 'Ready' : tenantArchitecture?.google_auth?.enabled ? 'Partial' : 'Off'}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Allowed domains</p>
                  <strong>
                    {(tenantArchitecture?.google_auth?.allowed_domains ?? []).length
                      ? tenantArchitecture?.google_auth?.allowed_domains?.join(', ')
                      : 'Any'}
                  </strong>
                </div>
              </div>
            </article>
          </section>

          <section className="sm-app-grid-main">
            <div className="sm-app-stack">
              <article className="sm-app-panel">
                <div className="sm-app-panel-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Execution</p>
                    <h2>Recent runs</h2>
                  </div>
                  <span className="sm-status-pill">{runtimeHealth.errorCount} errors</span>
                </div>

                <div className="sm-app-list">
                  {agentRuns.length ? (
                    agentRuns.slice(0, 8).map((run) => (
                      <article className="sm-app-list-row" key={run.run_id}>
                        <div className="sm-app-list-row-head">
                          <div>
                            <div className="sm-app-list-row-title">{run.job_type}</div>
                            <div className="sm-app-list-row-copy">{run.summary || run.error_text || 'No summary captured.'}</div>
                          </div>
                          <span className="sm-status-pill">{run.status}</span>
                        </div>
                        <div className="sm-app-meta-row">
                          <span>{run.source || 'manual'}</span>
                          <span>{run.triggered_by || 'system'}</span>
                          <span>{formatDateTime(run.completed_at || run.created_at)}</span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="sm-app-empty">No recent runs are visible yet.</div>
                  )}
                </div>
              </article>

              <article className="sm-app-panel">
                <div className="sm-app-panel-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Inbound</p>
                    <h2>Recent requests</h2>
                  </div>
                  <span className="sm-status-pill">{contacts.length} items</span>
                </div>

                <div className="sm-app-list">
                  {contacts.length ? (
                    contacts.map((row) => (
                      <article className="sm-app-list-row" key={`${row.submission_id ?? row.created_at ?? row.email}`}>
                        <div className="sm-app-list-row-head">
                          <div>
                            <div className="sm-app-list-row-title">{row.company || row.name || 'Inbound request'}</div>
                            <div className="sm-app-list-row-copy">{row.workflow || row.goal || 'No workflow captured.'}</div>
                          </div>
                          <span className="sm-status-pill">{row.source || 'site'}</span>
                        </div>
                        <div className="sm-app-meta-row">
                          <span>{row.email || 'No email'}</span>
                          <span>{formatDateTime(row.created_at)}</span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="sm-app-empty">No inbound requests have been captured yet.</div>
                  )}
                </div>
              </article>
            </div>

            <div className="sm-app-stack">
              <article className="sm-app-panel-muted">
                <div className="sm-app-panel-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Tenants</p>
                    <h2>Workspace coverage</h2>
                  </div>
                  <span className="sm-status-pill">{workspaces?.templates?.length ?? 0} templates</span>
                </div>

                <div className="sm-app-list">
                  {(workspaces?.app_workspaces ?? []).length ? (
                    workspaces?.app_workspaces?.map((workspace) => (
                      <article className="sm-app-list-row" key={workspace.workspace_id || workspace.slug || workspace.name}>
                        <div className="sm-app-list-row-head">
                          <div>
                            <div className="sm-app-list-row-title">{workspace.name || workspace.slug || 'Workspace'}</div>
                            <div className="sm-app-list-row-copy">{workspace.slug || 'No slug'}</div>
                          </div>
                          <span className="sm-status-pill">{workspace.plan || 'plan'}</span>
                        </div>
                        <div className="sm-app-meta-row">
                          <span>{workspace.role || 'role'}</span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="sm-app-empty">No additional workspaces are registered yet.</div>
                  )}
                </div>

                <div className="sm-app-note-list">
                  <div>
                    Published workspace:{' '}
                    {workspaces?.published_workspace ? (
                      <a href={workspaces.published_workspace} rel="noreferrer" target="_blank">
                        Open sheet
                      </a>
                    ) : (
                      'Not linked'
                    )}
                  </div>
                  <div>
                    Latest brief:{' '}
                    {summary?.workspace?.google_doc_link ? (
                      <a href={summary.workspace.google_doc_link} rel="noreferrer" target="_blank">
                        Open doc
                      </a>
                    ) : (
                      'Not linked'
                    )}
                  </div>
                </div>
              </article>

              <article className="sm-app-panel">
                <div className="sm-app-panel-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Operators</p>
                    <h2>People with access</h2>
                  </div>
                  <span className="sm-status-pill">{members.length} users</span>
                </div>

                <div className="sm-app-list">
                  {members.length ? (
                    members.slice(0, 8).map((member) => (
                      <article className="sm-app-list-row" key={member.membership_id}>
                        <div className="sm-app-list-row-title">{member.display_name || member.email}</div>
                        <div className="sm-app-list-row-copy">{member.email}</div>
                        <div className="sm-app-meta-row">
                          <span>{member.role}</span>
                          <span>{member.status}</span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="sm-app-empty">No team members loaded.</div>
                  )}
                </div>
              </article>

              <article className="sm-app-panel">
                <div className="sm-app-panel-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Control notes</p>
                    <h2>Short founder view</h2>
                  </div>
                </div>

                <div className="sm-app-mini-grid">
                  <div className="sm-app-mini-card">
                    <p className="sm-app-label">Approvals</p>
                    <strong>{summary?.approvals?.approval_count ?? 0}</strong>
                  </div>
                  <div className="sm-app-mini-card">
                    <p className="sm-app-label">Open workflows</p>
                    <strong>{summary?.actions?.total_items ?? 0}</strong>
                  </div>
                  <div className="sm-app-mini-card">
                    <p className="sm-app-label">Deals tracked</p>
                    <strong>{summary?.lead_pipeline?.lead_count ?? 0}</strong>
                  </div>
                  <div className="sm-app-mini-card">
                    <p className="sm-app-label">Product lab</p>
                    <strong>
                      {summary?.product_lab?.flagship_status || 'No flagship'}
                      {summary?.product_lab?.live_demo_count ? ` / ${summary.product_lab.live_demo_count} live` : ''}
                    </strong>
                  </div>
                </div>

                <div className="sm-app-note-list">
                  {(agentPayload?.gaps ?? []).slice(0, 2).map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                  {(agentPayload?.next_moves ?? []).slice(0, 2).map((item) => (
                    <div key={item}>{item}</div>
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
