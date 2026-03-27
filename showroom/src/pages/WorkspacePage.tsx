import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type SummaryPayload = {
  coverage_score?: number
  actions?: {
    total_items?: number
    by_lane?: Record<string, number>
  }
  quality?: {
    incident_count?: number
    capa_count?: number
  }
  supplier_watch?: {
    risk_count?: number
  }
  receiving?: {
    receiving_count?: number
    variance_count?: number
    hold_count?: number
  }
  inventory?: {
    inventory_count?: number
    reorder_count?: number
    watch_count?: number
  }
  metrics?: {
    metric_count?: number
    by_group?: Record<string, number>
  }
  supervisor?: {
    status?: string
    cycle_count?: number
    interval_minutes?: number
  }
  workspace?: {
    drive_folder_link?: string
    google_doc_link?: string
  }
  review?: {
    top_priorities?: string[]
  }
}

type ActionRow = {
  action_id: string
  lane: string
  title: string
  action: string
  owner: string
  priority: string
  due: string
  status: string
}

type SupplierRiskRow = {
  risk_id: string
  supplier: string
  severity: string
  status: string
  owner: string
  title: string
  summary: string
  next_action: string
}

type QualityIncidentRow = {
  incident_id: string
  severity: string
  status: string
  owner: string
  supplier: string
  title: string
  summary: string
  target_close_date: string
}

export function WorkspacePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [actions, setActions] = useState<ActionRow[]>([])
  const [risks, setRisks] = useState<SupplierRiskRow[]>([])
  const [incidents, setIncidents] = useState<QualityIncidentRow[]>([])

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
          setAuthenticated(false)
          setError('Login is required to open the private Action OS workspace.')
          setLoading(false)
          return
        }
        setAuthenticated(true)
      } catch {
        if (cancelled) return
        setError('Workspace login could not be verified on this host yet.')
        setLoading(false)
        return
      }

      try {
        const [summaryPayload, actionPayload, riskPayload, incidentPayload] = await Promise.all([
          workspaceFetch<SummaryPayload>('/api/summary'),
          workspaceFetch<{ items: ActionRow[] }>('/api/actions?limit=8'),
          workspaceFetch<{ rows: SupplierRiskRow[] }>('/api/suppliers/risks?limit=6'),
          workspaceFetch<{ rows: QualityIncidentRow[] }>('/api/quality/incidents?limit=6'),
        ])
        if (cancelled) return
        setSummary(summaryPayload)
        setActions(actionPayload.items ?? [])
        setRisks(riskPayload.rows ?? [])
        setIncidents(incidentPayload.rows ?? [])
      } catch {
        if (cancelled) return
        setError('Workspace service is not responding yet.')
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
        eyebrow="Core product"
        title="Action OS"
        description="This is the real SuperMega wedge: one action layer across files, Gmail, sheets, risks, and operating updates."
      />

      <section className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What this is</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The first real operating screen.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This is where SuperMega stops being a brochure and starts behaving like software. The goal is simple: show what needs action, who owns it, and what is starting to break.
          </p>

          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">Today queue from actions and updates</div>
            <div className="sm-chip text-white">Exception queue from supplier and quality risk</div>
            <div className="sm-chip text-white">Operator links into receiving and inventory control</div>
            <div className="sm-chip text-white">Ops Intake for uploads, spreadsheets, and manual KPI rows</div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/workbench">
              Open Workbench
            </Link>
            <Link className="sm-button-secondary" to="/receiving-control">
              Open Receiving Control
            </Link>
            <Link className="sm-button-secondary" to="/inventory-pulse">
              Open Inventory Pulse
            </Link>
            <Link className="sm-button-secondary" to="/solution-architect">
              Open Solution Architect
            </Link>
            <Link className="sm-button-secondary" to="/ops-intake">
              Open Ops Intake
            </Link>
          </div>
        </article>

        <article className="sm-terminal p-6">
          {loading ? (
            <p className="text-sm text-[var(--sm-muted)]">Loading Action OS...</p>
          ) : error ? (
          <div className="space-y-4">
              <p className="text-sm text-[var(--sm-muted)]">{error}</p>
              {authenticated ? (
                <div className="sm-chip text-white">Run `powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -SkipRun -Serve`</div>
              ) : (
                <Link className="sm-button-primary" to="/login?next=/workspace">
                  Login to workspace
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Open actions</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.actions?.total_items ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Supplier risks</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.supplier_watch?.risk_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Quality incidents</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.quality?.incident_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Supervisor</p>
                  <p className="mt-3 text-lg font-bold text-white">{summary?.supervisor?.status || 'manual'}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">
                    {summary?.supervisor?.interval_minutes ? `${summary.supervisor.interval_minutes} min cycle` : 'No cycle'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Receiving</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.receiving?.receiving_count ?? 0}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Variance: {summary?.receiving?.variance_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Inventory</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.inventory?.inventory_count ?? 0}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Reorder: {summary?.inventory?.reorder_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Coverage</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.coverage_score ?? 0}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">System readiness</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Metrics</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.metrics?.metric_count ?? 0}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Uploaded or entered KPI rows</p>
                </div>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Today queue</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What needs action now</h2>
            </div>
            <Link className="sm-link" to="/action-board">Open Action Board</Link>
          </div>

          <div className="mt-5 space-y-3">
            {actions.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">No action rows yet. Use Action Board, Receiving Control, or Inventory Pulse to start the live queue.</div>
            ) : (
              actions.map((row) => (
                <div className="sm-proof-card" key={row.action_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{row.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.action}</p>
                    </div>
                    <span className="sm-status-pill">{row.priority}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                      <p className="mt-2">{row.owner}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Lane</p>
                      <p className="mt-2">{row.lane}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Due</p>
                      <p className="mt-2">{row.due}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="space-y-6">
          <div className="sm-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Exception queue</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Supplier and quality risk</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {risks.slice(0, 3).map((row) => (
                <div className="sm-chip" key={row.risk_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{row.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary}</p>
                    </div>
                    <span className="sm-status-pill">{row.severity}</span>
                  </div>
                </div>
              ))}
              {incidents.slice(0, 3).map((row) => (
                <div className="sm-chip" key={row.incident_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{row.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary}</p>
                    </div>
                    <span className="sm-status-pill">{row.severity}</span>
                  </div>
                </div>
              ))}
              {risks.length === 0 && incidents.length === 0 ? (
                <div className="sm-chip text-[var(--sm-muted)]">No current exception rows returned by the workspace.</div>
              ) : null}
            </div>
          </div>

          <div className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Director flash</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Top current priorities</h2>
            <div className="mt-5 grid gap-3">
              {(summary?.review?.top_priorities ?? []).slice(0, 5).map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
              {summary?.review?.top_priorities?.length ? null : (
                <div className="sm-chip text-[var(--sm-muted)]">Priority briefing is available once the workspace pipeline has current review output.</div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {summary?.workspace?.drive_folder_link ? (
                <a className="sm-button-primary" href={summary.workspace.drive_folder_link} rel="noreferrer" target="_blank">
                  Open workspace folder
                </a>
              ) : null}
              {summary?.workspace?.google_doc_link ? (
                <a className="sm-button-secondary" href={summary.workspace.google_doc_link} rel="noreferrer" target="_blank">
                  Open latest brief
                </a>
              ) : null}
            </div>
          </div>
        </article>
      </section>
    </div>
  )
}
