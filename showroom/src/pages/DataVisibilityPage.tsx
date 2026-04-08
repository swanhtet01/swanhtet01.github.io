import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getDataVisibility, getWorkspaceSession, type DataVisibilityPayload } from '../lib/workspaceApi'

function formatDateTime(value?: string) {
  if (!value) {
    return 'Not synced yet'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function formatStatus(value?: string) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return 'Unknown'
  }
  return normalized.replace(/[-_]+/g, ' ')
}

function statusClassName(value?: string) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'active') {
    return 'rounded-full border border-[rgba(37,208,255,0.28)] bg-[rgba(37,208,255,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sm-accent)]'
  }
  if (normalized === 'ready') {
    return 'rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200'
  }
  if (normalized === 'partial') {
    return 'rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200'
  }
  if (normalized === 'manual') {
    return 'rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white'
  }
  return 'rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sm-muted)]'
}

export function DataVisibilityPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<DataVisibilityPayload | null>(null)

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
          setError('Login is required to open Data.')
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
        const nextPayload = await getDataVisibility()
        if (cancelled) return
        setPayload(nextPayload)
        setError(null)
      } catch (nextError) {
        if (cancelled) return
        setError(nextError instanceof Error ? nextError.message : 'Data visibility could not be loaded right now.')
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

  const connectorGaps = (payload?.connectors ?? []).filter((item) => {
    const normalized = String(item.status || '').trim().toLowerCase()
    return normalized === 'partial' || normalized === 'scaffolded'
  })

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Data"
        title="See where company state comes from."
        description="Read-only map of sources, connectors, memory, and KPI visibility across the live workspace."
      />

      <section className="grid gap-4 md:grid-cols-6">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Connected sources</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.connected_source_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Connectors</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.connector_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Memory layers</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.memory_surface_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">KPI surfaces</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.kpi_surface_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Manual lanes with data</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.manual_surface_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next wiring steps</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.unresolved_gap_count ?? 0}</p>
        </div>
      </section>

      {loading ? <div className="sm-chip text-[var(--sm-muted)]">Loading data visibility...</div> : null}

      {error ? (
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{error}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/data">
              Login
            </Link>
            <Link className="sm-button-secondary" to="/app/dev-desk">
              Open Dev Desk
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && !error && payload ? (
        <>
          <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Transparency</p>
              <h2 className="mt-2 text-2xl font-bold text-white">This is not just manual entry.</h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--sm-muted)]">{payload.statement}</p>
              <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{payload.manual_entry_note}</p>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Current workspace</p>
                  <p className="mt-2 text-sm">{payload.workspace?.workspace_name || payload.workspace?.workspace_slug || 'Workspace'}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Last sync</p>
                  <p className="mt-2 text-sm">{formatDateTime(payload.summary?.last_sync_at || payload.workspace?.last_sync_at)}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Workspaces</p>
                  <p className="mt-2 text-sm">{payload.workspace?.workspace_count ?? 0} live workspaces</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Agent runs</p>
                  <p className="mt-2 text-sm">{payload.summary?.agent_run_count ?? 0} recent runs</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to="/app/deals">
                  Open deals
                </Link>
                <Link className="sm-button-secondary" to="/app/workflows">
                  Open workflows
                </Link>
                <Link className="sm-button-secondary" to="/app/dev-desk">
                  Open Dev Desk
                </Link>
                {payload.links?.workspace_export ? (
                  <a className="sm-button-secondary" href={payload.links.workspace_export} rel="noreferrer" target="_blank">
                    Open export
                  </a>
                ) : null}
                {payload.links?.founder_brief ? (
                  <a className="sm-button-secondary" href={payload.links.founder_brief} rel="noreferrer" target="_blank">
                    Open brief
                  </a>
                ) : null}
                {payload.links?.gmail_compose ? (
                  <a className="sm-button-secondary" href={payload.links.gmail_compose} rel="noreferrer" target="_blank">
                    Open Gmail draft
                  </a>
                ) : null}
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Linkage</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What is connected to what.</h2>
              <div className="mt-5 space-y-3">
                {(payload.linkage ?? []).map((item) => (
                  <article className="sm-proof-card" key={item.key}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{item.source}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">Memory: {item.memory}</p>
                      </div>
                      <span className="sm-status-pill">{item.surfaces.join(' / ')}</span>
                    </div>
                    {item.note ? <p className="mt-4 text-sm text-[var(--sm-muted)]">{item.note}</p> : null}
                  </article>
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
            <article className="sm-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Connectors</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">How data enters the platform.</h2>
                </div>
                <span className="sm-status-pill">{payload.summary?.connected_source_count ?? 0} live sources</span>
              </div>

              <div className="mt-5 space-y-4">
                {(payload.connectors ?? []).map((item) => (
                  <article className="sm-proof-card" key={item.key}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{item.label}</p>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sm-muted)]">{item.category}</p>
                      </div>
                      <span className={statusClassName(item.status)}>{formatStatus(item.status)}</span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Mode</p>
                        <p className="mt-2 text-sm">{item.mode}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Evidence</p>
                        <p className="mt-2 text-sm">{item.evidence}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {(item.destinations ?? []).map((destination) => (
                        <span className="sm-status-pill" key={`${item.key}-${destination}`}>
                          {destination}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--sm-muted)]">
                      <span>{item.next_step || 'No immediate next step.'}</span>
                      <span>{formatDateTime(item.updated_at)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="sm-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Memory</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Where state is stored and reused.</h2>
                </div>
                <span className="sm-status-pill">{payload.summary?.memory_surface_count ?? 0} layers</span>
              </div>

              <div className="mt-5 space-y-4">
                {(payload.memory ?? []).map((item) => (
                  <article className="sm-proof-card" key={item.key}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{item.label}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.kind}</p>
                      </div>
                      <span className={statusClassName(item.status)}>{formatStatus(item.status)}</span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Evidence</p>
                        <p className="mt-2 text-sm">{item.evidence}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Connected surfaces</p>
                        <p className="mt-2 text-sm">{(item.connected_surfaces ?? []).join(' / ') || 'No surfaces listed yet.'}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--sm-muted)]">
                      <span>{item.next_step || 'No immediate next step.'}</span>
                      <span>{formatDateTime(item.updated_at)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <article className="sm-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">KPI visibility</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Which surfaces already show live metrics.</h2>
                </div>
                <span className="sm-status-pill">{payload.summary?.kpi_surface_count ?? 0} views</span>
              </div>

              <div className="mt-5 space-y-4">
                {(payload.kpi_surfaces ?? []).map((item) => (
                  <article className="sm-proof-card" key={item.key}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{item.label}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.source}</p>
                      </div>
                      <span className={statusClassName(item.status)}>{formatStatus(item.status)}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.metrics.map((metric) => (
                        <span className="sm-status-pill" key={`${item.key}-${metric}`}>
                          {metric}
                        </span>
                      ))}
                    </div>
                    <p className="mt-4 text-sm text-[var(--sm-muted)]">{item.evidence}</p>
                    {item.next_step ? <p className="mt-4 text-sm text-[var(--sm-muted)]">{item.next_step}</p> : null}
                  </article>
                ))}
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Still needs wiring</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What is partial versus already live.</h2>

              <div className="mt-5 space-y-3">
                {(payload.next_steps ?? []).map((item) => (
                  <div className="sm-chip text-[var(--sm-muted)]" key={item}>
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-3">
                {connectorGaps.length ? (
                  connectorGaps.map((item) => (
                    <article className="sm-chip text-white" key={`gap-${item.key}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.label}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.evidence}</p>
                        </div>
                        <span className={statusClassName(item.status)}>{formatStatus(item.status)}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">The current connector set is visible. Remaining work is mostly deeper auth, richer provenance labels, and broader KPI imports.</div>
                )}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  )
}
