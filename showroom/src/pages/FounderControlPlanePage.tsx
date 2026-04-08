import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  checkWorkspaceHealth,
  getDevStatus,
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
    google_doc_link?: string
  }
  approvals?: { approval_count?: number }
  actions?: { total_items?: number }
  lead_pipeline?: { lead_count?: number }
}

type ContactSubmissionRow = {
  submission_id?: number
  created_at?: string
  source?: string
  name?: string
  email?: string
  company?: string
  workflow?: string
  goal?: string
}

type WorkspacesPayload = {
  active_workspace?: {
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
  templates?: Array<{
    key?: string
    title?: string
  }>
}

type TenantArchitecturePayload = {
  resolved_tenant?: string
  auth?: {
    auth_required?: boolean
    uses_default_credentials?: boolean
    session_ttl_hours?: number
  }
  google_auth?: {
    enabled?: boolean
    client_json_configured?: boolean
    client_id_configured?: boolean
    client_secret_configured?: boolean
    redirect_uri_configured?: boolean
    allowed_domains?: string[]
  }
}

type DevStatusPayload = Awaited<ReturnType<typeof getDevStatus>>

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

function cadenceThresholdMinutes(cadence: string) {
  const normalized = String(cadence || '').trim().toLowerCase()
  if (normalized === '15m') return 60
  if (normalized === 'hourly') return 180
  if (normalized === 'daily') return 36 * 60
  return 6 * 60
}

export function FounderControlPlanePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<'defaults' | null>(null)
  const [session, setSession] = useState<WorkspaceSessionPayload['session'] | null>(null)
  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [members, setMembers] = useState<TeamMemberRow[]>([])
  const [agentJobs, setAgentJobs] = useState<AgentJobTemplate[]>([])
  const [agentRuns, setAgentRuns] = useState<AgentRunRow[]>([])
  const [contacts, setContacts] = useState<ContactSubmissionRow[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspacesPayload | null>(null)
  const [tenantArchitecture, setTenantArchitecture] = useState<TenantArchitecturePayload | null>(null)
  const [devStatus, setDevStatus] = useState<DevStatusPayload | null>(null)

  const loadData = useCallback(async () => {
    const health = await checkWorkspaceHealth()
    if (!health.ready) {
      throw new Error('Workspace API is not connected on this host yet.')
    }

    const sessionPayload = await getWorkspaceSession()
    if (!sessionPayload.authenticated) {
      throw new Error('Login is required to open the control plane.')
    }

    const [summaryPayload, memberPayload, agentRunPayload, contactPayload, workspacePayload, tenantPayload, devPayload] = await Promise.all([
      workspaceFetch<SummaryPayload>('/api/summary'),
      listTeamMembers(),
      listAgentRuns(16),
      workspaceFetch<{ rows?: ContactSubmissionRow[] }>('/api/contact-submissions?limit=8'),
      workspaceFetch<WorkspacesPayload>('/api/workspaces'),
      workspaceFetch<TenantArchitecturePayload>('/api/platform/tenant-architecture'),
      getDevStatus(),
    ])

    setSession(sessionPayload.session ?? null)
    setSummary(summaryPayload)
    setMembers(memberPayload.rows ?? [])
    setAgentJobs(agentRunPayload.jobs ?? [])
    setAgentRuns(agentRunPayload.rows ?? [])
    setContacts(contactPayload.rows ?? [])
    setWorkspaces(workspacePayload)
    setTenantArchitecture(tenantPayload)
    setDevStatus(devPayload)
    setError(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await loadData()
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Control plane could not be loaded.')
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

    return {
      staleCount,
      errorCount,
      lastSchedulerRun:
        agentRuns.find((row) => String(row.source || '').trim().toLowerCase() === 'scheduler')?.completed_at ||
        agentRuns.find((row) => String(row.source || '').trim().toLowerCase() === 'scheduler')?.created_at ||
        '',
    }
  }, [agentJobs, agentRuns])

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : workspaceAppBase || workspaceApiBase || ''

  const googleAuthReady = Boolean(
    tenantArchitecture?.google_auth?.enabled &&
      (tenantArchitecture?.google_auth?.client_json_configured ||
        (tenantArchitecture?.google_auth?.client_id_configured &&
          tenantArchitecture?.google_auth?.client_secret_configured &&
          tenantArchitecture?.google_auth?.redirect_uri_configured)),
  )

  const founderAttention = useMemo(
    () => [
      {
        title: 'Revenue',
        value: `${contacts.length} inbound`,
        detail: contacts.length
          ? 'New requests are waiting in Deals.'
          : 'No fresh inbound right now. Outbound sprint still matters.',
        href: '/app/deals',
        action: 'Open Deals',
        tone: contacts.length ? 'text-[var(--sm-accent)]' : 'text-[var(--sm-muted)]',
      },
      {
        title: 'Runtime',
        value: runtimeHealth.staleCount ? `${runtimeHealth.staleCount} loops drifting` : 'Loops on cadence',
        detail: runtimeHealth.errorCount
          ? `${runtimeHealth.errorCount} loop errors need review.`
          : 'Core loops are finishing without fresh errors.',
        href: '/app/agents',
        action: 'Open Agent Ops',
        tone: runtimeHealth.staleCount || runtimeHealth.errorCount ? 'text-[var(--sm-accent-alt)]' : 'text-[var(--sm-accent)]',
      },
      {
        title: 'Approvals',
        value: `${summary?.approvals?.approval_count ?? 0} open`,
        detail:
          (summary?.approvals?.approval_count ?? 0) > 0
            ? 'Open approvals are still blocking delivery.'
            : 'No approval backlog is visible right now.',
        href: '/app/workflows',
        action: 'Open workflows',
        tone: (summary?.approvals?.approval_count ?? 0) > 0 ? 'text-[var(--sm-accent-alt)]' : 'text-[var(--sm-muted)]',
      },
      {
        title: 'Engineering',
        value: devStatus?.repo?.dirty_count ? `${devStatus.repo.dirty_count} local changes` : 'Repo clean',
        detail: devStatus?.local_runner?.local_hq_ready
          ? 'Local HQ can run on this machine.'
          : 'Local HQ is still blocked until Python is on PATH.',
        href: '/app/dev-desk',
        action: 'Open Dev Desk',
        tone:
          (devStatus?.repo?.dirty_count ?? 0) > 0 || !devStatus?.local_runner?.local_hq_ready
            ? 'text-[var(--sm-accent-alt)]'
            : 'text-[var(--sm-accent)]',
      },
    ],
    [contacts.length, devStatus?.local_runner?.local_hq_ready, devStatus?.repo?.dirty_count, runtimeHealth.errorCount, runtimeHealth.staleCount, summary?.approvals?.approval_count],
  )

  return (
    <div className="sm-app-page">
      <section className="sm-app-panel">
        <div className="sm-app-header">
          <div className="sm-app-header-copy">
            <p className="sm-kicker text-[var(--sm-accent)]">Control plane</p>
            <h2>Run the company workspace from one screen.</h2>
            <p>Use this for runtime health, workspaces, automations, access, and inbound oversight.</p>
          </div>

          <div className="sm-app-actions">
            <button className="sm-button-primary" disabled={busy !== null} onClick={() => void handleRunDefaults()} type="button">
              {busy === 'defaults' ? 'Running...' : 'Run core loops'}
            </button>
            <Link className="sm-button-secondary" to="/app/agents">
              Agent ops
            </Link>
            <Link className="sm-button-secondary" to="/app/data">
              Data linkage
            </Link>
            <Link className="sm-button-secondary" to="/app/company">
              Company log
            </Link>
          </div>
        </div>

        {message ? <div className="sm-app-note mt-4">{message}</div> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {founderAttention.map((item) => (
          <article className="sm-metric-card" key={item.title}>
            <p className="sm-kicker text-[var(--sm-muted)]">{item.title}</p>
            <p className={`mt-3 text-2xl font-bold ${item.tone}`}>{item.value}</p>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">{item.detail}</p>
            <div className="mt-4">
              <Link className="sm-link" to={item.href}>
                {item.action}
              </Link>
            </div>
          </article>
        ))}
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
          <p className="sm-app-label">Team access</p>
          <strong>{members.length}</strong>
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
          <p className="sm-app-label">Approvals</p>
          <strong>{summary?.approvals?.approval_count ?? 0}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Repo drift</p>
          <strong>{devStatus?.repo?.dirty_count ?? 0}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Local HQ</p>
          <strong>{devStatus?.local_runner?.local_hq_ready ? 'Ready' : 'Blocked'}</strong>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Control plane</p>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">Runtime, workspaces, auth, inbound, and loop control.</p>
          <div className="mt-4">
            <Link className="sm-button-secondary" to="/app/control-plane">
              This screen
            </Link>
          </div>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Data plane</p>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">See sources, exports, memory layers, and KPI provenance.</p>
          <div className="mt-4">
            <Link className="sm-button-secondary" to="/app/data">
              Open data
            </Link>
          </div>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Portal builder</p>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">Inspect modules, shape a client workspace, and stage rollout scope.</p>
          <div className="mt-4">
            <Link className="sm-button-secondary" to="/app/portal-studio">
              Open studio
            </Link>
          </div>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Agent ops</p>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">Run pods, inspect drift, and recover queued jobs.</p>
          <div className="mt-4">
            <Link className="sm-button-secondary" to="/app/agents">
              Open agents
            </Link>
          </div>
        </article>
      </section>

      {loading ? <div className="sm-app-note">Loading HQ control plane...</div> : null}
      {error ? <div className="sm-app-note">{error}</div> : null}

      {!loading && !error ? (
        <>
          <section className="sm-app-grid-split">
            <article className="sm-app-panel">
              <div className="sm-app-panel-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Runtime</p>
                  <h2>Infrastructure and host state</h2>
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
                  <p className="sm-app-label">Scheduler cadence</p>
                  <strong>{summary?.supervisor?.interval_minutes ? `${summary.supervisor.interval_minutes}m` : 'Manual'}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Last scheduler run</p>
                  <strong>{formatDateTime(runtimeHealth.lastSchedulerRun)}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Current workspace</p>
                  <strong>{workspaces?.active_workspace?.workspace_name || session?.workspace_name || 'SuperMega'}</strong>
                </div>
              </div>
            </article>

            <article className="sm-app-panel-muted">
              <div className="sm-app-panel-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Access</p>
                  <h2>Workspace access and identity</h2>
                </div>
                <span className="sm-status-pill">{tenantArchitecture?.resolved_tenant || 'default'}</span>
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

          <section className="sm-app-grid-split">
            <article className="sm-app-panel">
              <div className="sm-app-panel-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Dev Desk</p>
                  <h2>Repo and local runner state</h2>
                </div>
                <span className="sm-status-pill">{devStatus?.mode || 'unknown'}</span>
              </div>

              <div className="sm-app-mini-grid">
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Branch</p>
                  <strong>{devStatus?.repo?.branch || 'Unavailable'}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Commit</p>
                  <strong>{devStatus?.repo?.commit || 'Unavailable'}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Dirty files</p>
                  <strong>{devStatus?.repo?.dirty_count ?? 0}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Local HQ ready</p>
                  <strong>{devStatus?.local_runner?.local_hq_ready ? 'Yes' : 'No'}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Python</p>
                  <strong>{devStatus?.local_runner?.python_on_path ? 'On PATH' : 'Missing on PATH'}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">NPM</p>
                  <strong>{devStatus?.local_runner?.npm_on_path ? 'On PATH' : 'Missing on PATH'}</strong>
                </div>
              </div>

              {devStatus?.reason ? <div className="sm-app-note mt-4">{devStatus.reason}</div> : null}
              {devStatus?.repo?.tracking ? <div className="sm-app-note mt-4">{devStatus.repo.tracking}</div> : null}
            </article>

            <article className="sm-app-panel-muted">
              <div className="sm-app-panel-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Recent engineering activity</p>
                  <h2>Latest repo changes</h2>
                </div>
                <span className="sm-status-pill">{devStatus?.repo?.recent_commits?.length ?? 0} recent</span>
              </div>

              <div className="sm-app-list">
                {(devStatus?.repo?.recent_commits ?? []).length ? (
                  devStatus?.repo?.recent_commits?.map((item) => (
                    <article className="sm-app-list-row" key={`${item.commit}-${item.date}`}>
                      <div>
                        <p className="text-sm font-semibold text-white">{item.subject || 'Commit'}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--sm-muted)]">
                          {item.commit || 'unknown'} · {formatDateTime(item.date)}
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="sm-app-note">Recent commit history is only available when the app is running against a local git checkout.</div>
                )}
              </div>
            </article>
          </section>

          <section className="sm-app-grid-main">
            <div className="sm-app-stack">
              <article className="sm-app-panel">
                <div className="sm-app-panel-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Automation</p>
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
                    <h2>Recent contact requests</h2>
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
                    <p className="sm-kicker text-[var(--sm-accent)]">Workspaces</p>
                    <h2>Registered workspaces</h2>
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
              </article>

              <article className="sm-app-panel">
                <div className="sm-app-panel-head">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Access</p>
                    <h2>People with workspace access</h2>
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
                    <p className="sm-kicker text-[var(--sm-accent)]">At a glance</p>
                    <h2>Founder short view</h2>
                  </div>
                </div>

                <div className="sm-app-mini-grid">
                  <div className="sm-app-mini-card">
                    <p className="sm-app-label">Open workflows</p>
                    <strong>{summary?.actions?.total_items ?? 0}</strong>
                  </div>
                  <div className="sm-app-mini-card">
                    <p className="sm-app-label">Approvals</p>
                    <strong>{summary?.approvals?.approval_count ?? 0}</strong>
                  </div>
                  <div className="sm-app-mini-card">
                    <p className="sm-app-label">Deals tracked</p>
                    <strong>{summary?.lead_pipeline?.lead_count ?? 0}</strong>
                  </div>
                  <div className="sm-app-mini-card">
                    <p className="sm-app-label">Latest brief</p>
                    <strong>{summary?.workspace?.google_doc_link ? 'Linked' : 'Not linked'}</strong>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
