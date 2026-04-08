import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

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
          setError('Login is required to open HQ.')
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
        setError('HQ could not be loaded right now.')
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
    <div className="sm-app-page">
      <section className="sm-app-panel">
        <div className="sm-app-header">
          <div className="sm-app-header-copy">
            <p className="sm-kicker text-[var(--sm-accent)]">HQ</p>
            <h2>Read the company fast.</h2>
            <p>Start here for priorities, risk, deals, and decisions that need a founder move.</p>
          </div>

          <div className="sm-app-actions">
            <Link className="sm-button-primary" to="/app/workflows">
              Open workflows
            </Link>
            <Link className="sm-button-secondary" to="/app/dev-desk">
              Founder
            </Link>
            <Link className="sm-button-secondary" to="/app/agents">
              Agents
            </Link>
            <Link className="sm-button-secondary" to="/app/company">
              Company log
            </Link>
          </div>
        </div>
      </section>

      <section className="sm-app-kpi-strip">
        <article className="sm-app-kpi">
          <p className="sm-app-label">Open workflows</p>
          <strong>{summary?.actions?.total_items ?? 0}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Approvals</p>
          <strong>{summary?.approvals?.approval_count ?? 0}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Exceptions</p>
          <strong>{exceptions.length}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Decisions</p>
          <strong>{decisions.length}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Deals</p>
          <strong>{leads.length}</strong>
        </article>
        <article className="sm-app-kpi">
          <p className="sm-app-label">Runtime</p>
          <strong>{summary?.supervisor?.status ?? 'manual'}</strong>
        </article>
      </section>

      {loading ? <div className="sm-app-note">Loading HQ…</div> : null}
      {error ? (
        <div className="sm-app-note">
          {error}
          <div className="mt-4">
            <Link className="sm-button-primary" to="/login?next=/app/hq">
              Login
            </Link>
          </div>
        </div>
      ) : null}

      {!loading && !error ? (
        <section className="sm-app-grid-main">
          <div className="sm-app-stack">
            <article className="sm-app-panel">
              <div className="sm-app-panel-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Founder priorities</p>
                  <h2>What needs action now</h2>
                </div>
                <Link className="sm-link" to="/app/workflows">
                  Open queue
                </Link>
              </div>

              <div className="sm-app-list">
                {roleRows.length ? (
                  roleRows.map((row, index) => (
                    <article className="sm-app-list-row" key={`${row.title ?? 'priority'}-${index}`}>
                      <div className="sm-app-list-row-head">
                        <div>
                          <div className="sm-app-list-row-title">{row.title || row.action || 'Priority'}</div>
                          {row.action ? <div className="sm-app-list-row-copy">{row.action}</div> : null}
                        </div>
                        {row.priority ? <span className="sm-status-pill">{row.priority}</span> : null}
                      </div>
                      <div className="sm-app-meta-row">
                        <span>{row.owner || 'Management'}</span>
                        <span>{row.due || 'Review'}</span>
                        <span>{row.evidence || 'Workspace'}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="sm-app-empty">No founder-priority rows available yet.</div>
                )}
              </div>
            </article>

            <article className="sm-app-panel">
              <div className="sm-app-panel-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Deals</p>
                  <h2>Commercial movement</h2>
                </div>
                <Link className="sm-link" to="/app/deals">
                  Open deals
                </Link>
              </div>

              <div className="sm-app-list">
                {leads.length ? (
                  leads.map((row) => (
                    <article className="sm-app-list-row" key={row.lead_id}>
                      <div className="sm-app-list-row-head">
                        <div>
                          <div className="sm-app-list-row-title">{row.company_name}</div>
                          <div className="sm-app-list-row-copy">
                            {row.wedge_product} / {row.service_pack}
                          </div>
                        </div>
                        <span className="sm-status-pill">{row.stage}</span>
                      </div>
                      <div className="sm-app-meta-row">
                        <span>{row.owner || 'Unassigned'}</span>
                        <span>{row.contact_email || 'No email'}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="sm-app-empty">No pipeline rows saved yet.</div>
                )}
              </div>
            </article>
          </div>

          <div className="sm-app-stack">
            <article className="sm-app-panel-muted">
              <div className="sm-app-panel-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Risk</p>
                  <h2>What is starting to break</h2>
                </div>
                <Link className="sm-link" to="/app/exceptions">
                  Open exceptions
                </Link>
              </div>

              <div className="sm-app-list">
                {exceptions.length ? (
                  exceptions.map((row) => (
                    <article className="sm-app-list-row" key={row.exception_id}>
                      <div className="sm-app-list-row-head">
                        <div>
                          <div className="sm-app-list-row-title">{row.title}</div>
                          <div className="sm-app-list-row-copy">{row.summary}</div>
                        </div>
                        <span className="sm-status-pill">{row.priority}</span>
                      </div>
                      <div className="sm-app-meta-row">
                        <span>{row.owner || 'Unassigned'}</span>
                        <span>{row.source_type || 'system'}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="sm-app-empty">No live exceptions returned.</div>
                )}
              </div>
            </article>

            <article className="sm-app-panel">
              <div className="sm-app-panel-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Decisions</p>
                  <h2>Recent calls</h2>
                </div>
                <Link className="sm-link" to="/app/company">
                  Open journal
                </Link>
              </div>

              <div className="sm-app-list">
                {decisions.length ? (
                  decisions.map((row) => (
                    <article className="sm-app-list-row" key={row.decision_id}>
                      <div className="sm-app-list-row-head">
                        <div>
                          <div className="sm-app-list-row-title">{row.title}</div>
                          <div className="sm-app-list-row-copy">{row.decision_text}</div>
                        </div>
                        <span className="sm-status-pill">{row.status}</span>
                      </div>
                      <div className="sm-app-meta-row">
                        <span>{row.owner || 'Management'}</span>
                        <span>{row.related_route || 'No route'}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="sm-app-empty">No decisions saved yet.</div>
                )}
              </div>
            </article>

            <article className="sm-app-panel">
              <div className="sm-app-panel-head">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">State</p>
                  <h2>Core signals</h2>
                </div>
              </div>

              <div className="sm-app-mini-grid">
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Supplier risks</p>
                  <strong>{summary?.supplier_watch?.risk_count ?? 0}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Quality incidents</p>
                  <strong>{summary?.quality?.incident_count ?? 0}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Receiving holds</p>
                  <strong>{summary?.receiving?.hold_count ?? 0}</strong>
                </div>
                <div className="sm-app-mini-card">
                  <p className="sm-app-label">Inventory reorder</p>
                  <strong>{summary?.inventory?.reorder_count ?? 0}</strong>
                </div>
              </div>

              <div className="sm-app-actions mt-4">
                <Link className="sm-button-secondary" to="/app/approvals">
                  Approvals
                </Link>
                {summary?.workspace?.google_doc_link ? (
                  <a className="sm-button-secondary" href={summary.workspace.google_doc_link} rel="noreferrer" target="_blank">
                    Latest brief
                  </a>
                ) : null}
                {summary?.workspace?.drive_folder_link ? (
                  <a className="sm-button-secondary" href={summary.workspace.drive_folder_link} rel="noreferrer" target="_blank">
                    Workspace folder
                  </a>
                ) : null}
              </div>

              <div className="sm-app-note mt-4">
                Supervisor: {summary?.supervisor?.status ?? 'manual'}
                {summary?.supervisor?.interval_minutes ? ` / ${summary.supervisor.interval_minutes} minute cycle` : ''}
              </div>
            </article>
          </div>
        </section>
      ) : null}
    </div>
  )
}
