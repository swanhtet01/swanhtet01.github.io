import { useEffect, useState } from 'react'

import { PageIntro } from '../components/PageIntro'
import { workspaceApiBase, workspaceFetch } from '../lib/workspaceApi'

type SummaryPayload = {
  coverage_score?: number
  agent_system?: {
    team_count?: number
    autonomy_score?: number
    autonomy_level?: string
    status?: string
  }
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
  product_lab?: {
    flagship_status?: string
    pilot_ready_count?: number
    live_demo_count?: number
  }
  supervisor?: {
    status?: string
    cycle_count?: number
    last_finished_at?: string
    interval_minutes?: number
  }
  workspace?: {
    drive_folder_link?: string
    google_doc_link?: string
  }
  review?: {
    top_priorities?: string[]
    project_status?: Record<string, string>
  }
}

export function WorkspacePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<SummaryPayload | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!workspaceApiBase) {
        setError('Workspace API is not connected on this host yet.')
        setLoading(false)
        return
      }

      try {
        const payload = await workspaceFetch<SummaryPayload>('/api/summary')
        if (cancelled) return
        setSummary(payload)
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
        eyebrow="Workspace"
        title="One live operating layer."
        description="This page connects to your local SuperMega workspace service. Use it on phone or laptop when the workspace server is running."
      />

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Connection</p>
          <h2 className="mt-3 text-2xl font-bold text-white">{workspaceApiBase ? 'Workspace endpoint found' : 'Workspace endpoint missing'}</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            {workspaceApiBase || 'Run `run_solution.ps1 -Serve` or open the site from the local workspace service.'}
          </p>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent)]">Best use</p>
              <p className="mt-2 text-white">Manager board, director brief, Google Workspace links, and live action status.</p>
            </div>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Why it matters</p>
              <p className="mt-2 text-white">This is the first actual workspace layer, not just a public brochure site.</p>
            </div>
          </div>
        </article>

        <article className="sm-surface p-6">
          {loading ? (
            <p className="text-sm text-[var(--sm-muted)]">Loading workspace summary...</p>
          ) : error ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--sm-muted)]">{error}</p>
              <div className="sm-chip">
                <p className="sm-kicker text-[var(--sm-accent)]">Run locally</p>
                <p className="mt-2 text-sm text-white">`powershell -ExecutionPolicy Bypass -File .\\tools\\run_solution.ps1 -Config .\\config.example.json -SkipRun -Serve`</p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Coverage</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.coverage_score ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Actions</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.actions?.total_items ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Flagship</p>
                  <p className="mt-3 text-lg font-bold text-white">{summary?.product_lab?.flagship_status ?? 'unknown'}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Agent teams</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.agent_system?.team_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Autonomy score</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.agent_system?.autonomy_score ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Agent mode</p>
                  <p className="mt-3 text-lg font-bold text-white">{summary?.agent_system?.autonomy_level ?? 'unknown'}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Supplier risks</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.supplier_watch?.risk_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Receiving records</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.receiving?.receiving_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Receiving variance</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.receiving?.variance_count ?? 0}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Quality incidents</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.quality?.incident_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">CAPA actions</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.quality?.capa_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Receiving hold</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.receiving?.hold_count ?? 0}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Supervisor</p>
                  <p className="mt-3 text-lg font-bold text-white">{summary?.supervisor?.status || 'manual'}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Cycles</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.supervisor?.cycle_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Refresh cadence</p>
                  <p className="mt-3 text-lg font-bold text-white">
                    {summary?.supervisor?.interval_minutes ? `${summary.supervisor.interval_minutes} min` : 'manual'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent)]">Top priorities</p>
                  <ul className="mt-3 space-y-2 text-sm text-white">
                    {(summary?.review?.top_priorities ?? []).slice(0, 4).map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="sm-chip">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Lane counts</p>
                  <ul className="mt-3 space-y-2 text-sm text-white">
                    {Object.entries(summary?.actions?.by_lane ?? {}).map(([lane, count]) => (
                      <li key={lane}>
                        {lane}: {count}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
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
          )}
        </article>
      </section>
    </div>
  )
}
