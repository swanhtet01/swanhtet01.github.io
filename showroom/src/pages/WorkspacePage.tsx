import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type SummaryPayload = {
  coverage_score?: number
  actions?: {
    total_items?: number
  }
  quality?: {
    incident_count?: number
  }
  supplier_watch?: {
    risk_count?: number
  }
  receiving?: {
    variance_count?: number
    hold_count?: number
  }
  inventory?: {
    reorder_count?: number
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
  severity: string
  title: string
  summary: string
}

type QualityIncidentRow = {
  incident_id: string
  severity: string
  title: string
  summary: string
}

export function WorkspacePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
          setError('Login is required to open the live queue.')
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
        const [summaryPayload, actionPayload, riskPayload, incidentPayload] = await Promise.all([
          workspaceFetch<SummaryPayload>('/api/summary'),
          workspaceFetch<{ items: ActionRow[] }>('/api/actions?limit=10'),
          workspaceFetch<{ rows: SupplierRiskRow[] }>('/api/suppliers/risks?limit=4'),
          workspaceFetch<{ rows: QualityIncidentRow[] }>('/api/quality/incidents?limit=4'),
        ])
        if (cancelled) return
        setSummary(summaryPayload)
        setActions(actionPayload.items ?? [])
        setRisks(riskPayload.rows ?? [])
        setIncidents(incidentPayload.rows ?? [])
      } catch {
        if (!cancelled) {
          setError('Workspace service is not responding yet.')
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
  }, [])

  const exceptionCount = (summary?.supplier_watch?.risk_count ?? 0) + (summary?.quality?.incident_count ?? 0)

  return (
    <div className="space-y-8">
      <PageIntro
        compact
        eyebrow="Action OS"
        title="Today queue."
        description="See what needs action, what is blocked, and what needs escalation."
      />

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Open actions</p>
          <p className="mt-2 text-3xl font-bold">{summary?.actions?.total_items ?? 0}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Exceptions</p>
          <p className="mt-2 text-3xl font-bold">{exceptionCount}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Receiving</p>
          <p className="mt-2 text-3xl font-bold">{summary?.receiving?.hold_count ?? 0}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Holds</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Inventory</p>
          <p className="mt-2 text-3xl font-bold">{summary?.inventory?.reorder_count ?? 0}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Reorder watch</p>
        </div>
      </section>

      {loading ? (
        <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Loading queue...</section>
      ) : error ? (
        <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">{error}</section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[1.06fr_0.94fr]">
          <article className="sm-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Queue</p>
                <h2 className="mt-2 text-2xl font-bold text-white">What needs action now</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="sm-button-secondary" to="/app/leads">
                  Leads
                </Link>
                <Link className="sm-button-secondary" to="/app/receiving">
                  Receiving
                </Link>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {actions.length ? (
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
              ) : (
                <div className="sm-chip text-[var(--sm-muted)]">No live action rows yet.</div>
              )}
            </div>
          </article>

          <article className="space-y-6">
            <div className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Exceptions</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What is starting to break</h2>

              <div className="mt-5 grid gap-3">
                {risks.slice(0, 2).map((row) => (
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
                {incidents.slice(0, 2).map((row) => (
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
                {!risks.length && !incidents.length ? <div className="sm-chip text-[var(--sm-muted)]">No current exception rows.</div> : null}
              </div>
            </div>

            <div className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Top priorities</p>
              <div className="mt-4 grid gap-3">
                {(summary?.review?.top_priorities ?? []).slice(0, 5).map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
                {summary?.review?.top_priorities?.length ? null : <div className="sm-chip text-[var(--sm-muted)]">No priority brief loaded yet.</div>}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-secondary" to="/app/director">
                  Director view
                </Link>
                <Link className="sm-button-secondary" to="/app/intake">
                  Intake
                </Link>
              </div>
            </div>
          </article>
        </section>
      )}
    </div>
  )
}
