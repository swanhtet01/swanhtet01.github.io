import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type SummaryPayload = {
  actions?: { total_items?: number }
  approvals?: { approval_count?: number }
  supplier_watch?: { risk_count?: number }
  quality?: { incident_count?: number }
  receiving?: { variance_count?: number; hold_count?: number }
  inventory?: { reorder_count?: number; watch_count?: number }
  supervisor?: { status?: string; interval_minutes?: number }
  workspace?: { drive_folder_link?: string; google_doc_link?: string }
}

type ExceptionRow = {
  exception_id: string
  source_type: string
  priority: string
  title: string
  summary: string
  owner: string
  route: string
}

type DecisionRow = {
  decision_id: string
  title: string
  decision_text: string
  owner: string
  status: string
  related_route: string
}

type LeadPipelineRow = {
  lead_id: string
  company_name: string
  stage: string
  service_pack: string
  wedge_product: string
  owner: string
  contact_email: string
}

type RoleRow = {
  title?: string
  action?: string
  owner?: string
  due?: string
  priority?: string
  evidence?: string
}

export function DirectorDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([])
  const [decisions, setDecisions] = useState<DecisionRow[]>([])
  const [leads, setLeads] = useState<LeadPipelineRow[]>([])
  const [roleRows, setRoleRows] = useState<RoleRow[]>([])

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
          setError('Login is required to open the director dashboard.')
          setLoading(false)
          return
        }
      } catch {
        if (cancelled) return
        setError('Workspace login could not be verified on this host yet.')
        setLoading(false)
        return
      }

      try {
        const [summaryPayload, exceptionPayload, decisionPayload, leadPayload, rolePayload] = await Promise.all([
          workspaceFetch<SummaryPayload>('/api/summary'),
          workspaceFetch<{ rows?: ExceptionRow[] }>('/api/exceptions?limit=6'),
          workspaceFetch<{ rows?: DecisionRow[] }>('/api/decisions?limit=6'),
          workspaceFetch<{ rows?: LeadPipelineRow[] }>('/api/lead-pipeline'),
          workspaceFetch<{ rows?: RoleRow[] }>('/api/reports/role/director'),
        ])
        if (cancelled) return
        setSummary(summaryPayload)
        setExceptions(exceptionPayload.rows ?? [])
        setDecisions(decisionPayload.rows ?? [])
        setLeads((leadPayload.rows ?? []).slice(0, 6))
        setRoleRows((rolePayload.rows ?? []).slice(0, 6))
      } catch {
        if (cancelled) return
        setError('Director dashboard could not be loaded right now.')
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

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Director"
        title="See what matters today."
        description="This is the simplest leadership view: actions, exceptions, decisions, and pipeline in one screen."
      />

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Open actions</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.actions?.total_items ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Approvals</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.approvals?.approval_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Exceptions</p>
          <p className="mt-3 text-3xl font-bold text-white">{exceptions.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Decisions</p>
          <p className="mt-3 text-3xl font-bold text-white">{decisions.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Leads</p>
          <p className="mt-3 text-3xl font-bold text-white">{leads.length}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Top priorities</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What needs leadership attention</h2>
            </div>
            <Link className="sm-link" to="/app/actions">
              Open Action OS
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <p className="text-sm text-[var(--sm-muted)]">Loading dashboard...</p>
            ) : error ? (
              <div className="space-y-4">
                <p className="text-sm text-[var(--sm-muted)]">{error}</p>
                <Link className="sm-button-primary" to="/login?next=/app/director">
                  Login
                </Link>
              </div>
            ) : roleRows.length ? (
              roleRows.map((row, index) => (
                <article className="sm-proof-card" key={`${row.title ?? 'priority'}-${index}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{row.title || row.action || 'Priority'}</p>
                      {row.action ? <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.action}</p> : null}
                    </div>
                    {row.priority ? <span className="sm-status-pill">{row.priority}</span> : null}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                      <p className="mt-2">{row.owner || 'Management'}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Due</p>
                      <p className="mt-2">{row.due || 'Review'}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Evidence</p>
                      <p className="mt-2">{row.evidence || 'Workspace'}</p>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No director rows available yet.</div>
            )}
          </div>
        </article>

        <article className="space-y-6">
          <div className="sm-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Exception queue</p>
                <h2 className="mt-2 text-2xl font-bold text-white">What is starting to break</h2>
              </div>
              <Link className="sm-link" to="/app/exceptions">
                Open queue
              </Link>
            </div>

            <div className="mt-5 grid gap-3">
              {exceptions.length ? (
                exceptions.map((row) => (
                  <article className="sm-chip" key={row.exception_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{row.title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary}</p>
                      </div>
                      <span className="sm-status-pill">{row.priority}</span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="sm-chip text-[var(--sm-muted)]">No live exceptions returned.</div>
              )}
            </div>
          </div>

          <div className="sm-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Decision journal</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Recent decisions</h2>
              </div>
              <Link className="sm-link" to="/app/decisions">
                Open journal
              </Link>
            </div>
            <div className="mt-5 grid gap-3">
              {decisions.length ? (
                decisions.map((row) => (
                  <article className="sm-chip" key={row.decision_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{row.title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.decision_text}</p>
                      </div>
                      <span className="sm-status-pill">{row.status}</span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="sm-chip text-[var(--sm-muted)]">No decisions saved yet.</div>
              )}
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Pipeline</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What is moving commercially</h2>
            </div>
          <Link className="sm-link" to="/app/sales">
            Open sales
          </Link>
          </div>
          <div className="mt-5 grid gap-3">
            {leads.length ? (
              leads.map((row) => (
                <article className="sm-chip" key={row.lead_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{row.company_name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {row.wedge_product} / {row.service_pack}
                      </p>
                    </div>
                    <span className="sm-status-pill">{row.stage}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No pipeline rows saved yet.</div>
            )}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">System pulse</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Key system signals</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Supplier risks</p>
              <p className="mt-2 text-2xl font-bold">{summary?.supplier_watch?.risk_count ?? 0}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Quality incidents</p>
              <p className="mt-2 text-2xl font-bold">{summary?.quality?.incident_count ?? 0}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Receiving holds</p>
              <p className="mt-2 text-2xl font-bold">{summary?.receiving?.hold_count ?? 0}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Inventory reorder</p>
              <p className="mt-2 text-2xl font-bold">{summary?.inventory?.reorder_count ?? 0}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/approvals">
              Open approvals
            </Link>
            {summary?.workspace?.google_doc_link ? (
              <a className="sm-button-secondary" href={summary.workspace.google_doc_link} rel="noreferrer" target="_blank">
                Open latest brief
              </a>
            ) : null}
            {summary?.workspace?.drive_folder_link ? (
              <a className="sm-button-secondary" href={summary.workspace.drive_folder_link} rel="noreferrer" target="_blank">
                Open workspace folder
              </a>
            ) : null}
            <Link className="sm-button-primary" to="/app">
              Open workbench
            </Link>
          </div>

          <p className="mt-4 text-sm text-[var(--sm-muted)]">
            Supervisor: {summary?.supervisor?.status ?? 'manual'}
            {summary?.supervisor?.interval_minutes ? ` / ${summary.supervisor.interval_minutes} minute cycle` : ''}
          </p>
        </article>
      </section>
    </div>
  )
}
