import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, workspaceApiBase, workspaceFetch } from '../lib/workspaceApi'

type SummaryPayload = {
  coverage_score?: number
  actions?: {
    total_items?: number
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
  }
  inventory?: {
    inventory_count?: number
    reorder_count?: number
  }
  metrics?: {
    metric_count?: number
  }
  feedback?: {
    feedback_count?: number
    open_count?: number
    high_priority_count?: number
  }
  agent_system?: {
    team_count?: number
    autonomy_score?: number
  }
  supervisor?: {
    status?: string
    interval_minutes?: number
  }
  review?: {
    top_priorities?: string[]
  }
}

type ActionRow = {
  action_id: string
  title: string
  action: string
  owner: string
  priority: string
  due: string
  lane: string
}

type MetricRow = {
  metric_id: string
  metric_name: string
  metric_group: string
  metric_value: string
  unit: string
  owner: string
  captured_at: string
  status: string
}

type FeedbackRow = {
  feedback_id: string
  created_at: string
  surface: string
  category: string
  priority: string
  status: string
  note: string
}

type FeedbackForm = {
  surface: string
  category: string
  priority: string
  note: string
}

const quickLaunches = [
  {
    name: 'Action OS',
    detail: 'Run the live owner board.',
    to: '/workspace',
  },
  {
    name: 'Ops Intake',
    detail: 'Upload files and save KPI rows.',
    to: '/ops-intake',
  },
  {
    name: 'Receiving',
    detail: 'Capture inbound material and holds.',
    to: '/receiving-control',
  },
  {
    name: 'Inventory',
    detail: 'Watch stock and reorder pressure.',
    to: '/inventory-pulse',
  },
  {
    name: 'Lead Finder',
    detail: 'Find leads and build offers.',
    to: '/lead-finder',
  },
  {
    name: 'News Brief',
    detail: 'Turn signals into one short brief.',
    to: '/news-brief',
  },
] as const

const feedbackDefaults: FeedbackForm = {
  surface: 'workbench',
  category: 'ux',
  priority: 'medium',
  note: '',
}

export function WorkbenchPage() {
  const [loading, setLoading] = useState(true)
  const [apiReady, setApiReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [actions, setActions] = useState<ActionRow[]>([])
  const [metrics, setMetrics] = useState<MetricRow[]>([])
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([])
  const [feedbackForm, setFeedbackForm] = useState<FeedbackForm>(feedbackDefaults)

  async function loadWorkbench() {
    const [summaryPayload, actionPayload, metricPayload, feedbackPayload] = await Promise.all([
      workspaceFetch<SummaryPayload>('/api/summary'),
      workspaceFetch<{ items: ActionRow[] }>('/api/actions?limit=6'),
      workspaceFetch<{ rows: MetricRow[] }>('/api/metrics/records?limit=6'),
      workspaceFetch<{ rows: FeedbackRow[] }>('/api/product-feedback?limit=8'),
    ])
    setSummary(summaryPayload)
    setActions(actionPayload.items ?? [])
    setMetrics(metricPayload.rows ?? [])
    setFeedbackRows(feedbackPayload.rows ?? [])
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      const health = await checkWorkspaceHealth()
      if (cancelled) return
      setApiReady(health.ready)
      if (!health.ready) {
        setLoading(false)
        return
      }

      try {
        await loadWorkbench()
      } catch {
        if (!cancelled) {
          setError('Workbench service is not responding yet.')
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

  async function saveFeedback() {
    if (!apiReady || !feedbackForm.note.trim()) {
      return
    }
    setSaving(true)
    setSaved(null)
    setError(null)
    try {
      const payload = await workspaceFetch<{ message?: string; rows?: FeedbackRow[]; summary?: SummaryPayload['feedback'] }>(
        '/api/product-feedback',
        {
          method: 'POST',
          body: JSON.stringify(feedbackForm),
        },
      )
      setFeedbackRows(payload.rows ?? [])
      setSummary((current) => ({
        ...(current ?? {}),
        feedback: payload.summary ?? current?.feedback,
      }))
      setFeedbackForm(feedbackDefaults)
      setSaved(payload.message ?? 'Feedback saved.')
    } catch {
      setError('Could not save the workbench note right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Daily workbench"
        title="One place to run the product, test it, and improve it."
        description="This is the simplest serious SuperMega surface: open your live boards, see what is moving, and save product notes directly into the system while you work."
      />

      <section className="grid gap-3 md:grid-cols-4">
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Mode</p>
          <p className="mt-2">{apiReady ? 'live workspace' : 'offline shell'}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Records</p>
          <p className="mt-2">Saved into the workspace state DB</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Feedback loop</p>
          <p className="mt-2">Workbench notes become product backlog rows</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Use it for</p>
          <p className="mt-2">Run today, test flows, capture improvements</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Daily cockpit</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The meta app for working inside SuperMega.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            Open the real modules from here, keep one testing notebook, and push improvements into the backlog while the system is running. The goal is not more pages. The goal is less context-switching.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {quickLaunches.map((item) => (
              <Link className="sm-command-row" key={item.name} to={item.to}>
                <div>
                  <p className="font-semibold text-white">{item.name}</p>
                  <p className="text-sm text-[var(--sm-muted)]">{item.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Best daily loop</p>
              <p className="mt-2 text-sm">Check Workbench, clear actions, update records, save improvement notes, repeat.</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Testing rule</p>
              <p className="mt-2 text-sm">If something is annoying, broken, or missing, save it here before it gets lost.</p>
            </div>
          </div>
        </article>

        <article className="sm-terminal p-6">
          {loading ? (
            <p className="text-sm text-[var(--sm-muted)]">Loading workbench pulse...</p>
          ) : !apiReady ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--sm-muted)]">Workbench API is not connected on this host yet.</p>
              <div className="sm-chip text-white">
                {workspaceApiBase
                  ? `Current API base: ${workspaceApiBase}`
                  : 'Run the local workspace service or deploy the single-app backend to use the live workbench.'}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Open actions</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.actions?.total_items ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Risk queue</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.supplier_watch?.risk_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Saved metrics</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.metrics?.metric_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Product notes</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.feedback?.feedback_count ?? 0}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Receiving</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.receiving?.receiving_count ?? 0}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Variance: {summary?.receiving?.variance_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Inventory</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.inventory?.inventory_count ?? 0}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Reorder: {summary?.inventory?.reorder_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Agent teams</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.agent_system?.team_count ?? 0}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Autonomy: {summary?.agent_system?.autonomy_score ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Supervisor</p>
                  <p className="mt-2 text-lg font-bold">{summary?.supervisor?.status ?? 'manual'}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">
                    {summary?.supervisor?.interval_minutes ? `${summary.supervisor.interval_minutes} minute cycle` : 'No cycle'}
                  </p>
                </div>
              </div>

              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">What to improve next</p>
                <div className="mt-3 grid gap-2">
                  {(summary?.review?.top_priorities ?? []).slice(0, 4).map((item) => (
                    <div className="sm-chip bg-white/4 text-white" key={item}>
                      {item}
                    </div>
                  ))}
                  {!summary?.review?.top_priorities?.length ? (
                    <p className="text-sm text-[var(--sm-muted)]">No review priorities loaded yet.</p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Today queue</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What you can work right now</h2>
            </div>
            <Link className="sm-link" to="/workspace">
              Full board
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {actions.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">No action rows yet. Use Action OS, Receiving, or Ops Intake to create the first live queue.</div>
            ) : (
              actions.map((row) => (
                <div className="sm-proof-card" key={row.action_id}>
                  <div className="flex items-start justify-between gap-3">
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

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Testing notebook</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Save friction, bugs, and ideas while you use it.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This is the product improvement loop. Use the app, notice friction, save the note, and let that become the build backlog.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Surface</span>
              <select
                className="sm-input"
                value={feedbackForm.surface}
                onChange={(event) => setFeedbackForm((current) => ({ ...current, surface: event.target.value }))}
              >
                <option value="workbench">Workbench</option>
                <option value="action-os">Action OS</option>
                <option value="ops-intake">Ops Intake</option>
                <option value="receiving-control">Receiving Control</option>
                <option value="inventory-pulse">Inventory Pulse</option>
                <option value="lead-finder">Lead Finder</option>
                <option value="news-brief">News Brief</option>
                <option value="action-board">Action Board</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Category</span>
              <select
                className="sm-input"
                value={feedbackForm.category}
                onChange={(event) => setFeedbackForm((current) => ({ ...current, category: event.target.value }))}
              >
                <option value="ux">UX</option>
                <option value="bug">Bug</option>
                <option value="workflow">Workflow</option>
                <option value="data">Data</option>
                <option value="agent">Agent</option>
                <option value="idea">Idea</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Priority</span>
              <select
                className="sm-input"
                value={feedbackForm.priority}
                onChange={(event) => setFeedbackForm((current) => ({ ...current, priority: event.target.value }))}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm text-[var(--sm-muted)]">Note</span>
            <textarea
              className="sm-textarea min-h-[150px]"
              placeholder="What felt clumsy, slow, missing, or especially useful?"
              value={feedbackForm.note}
              onChange={(event) => setFeedbackForm((current) => ({ ...current, note: event.target.value }))}
            />
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={!apiReady || saving || !feedbackForm.note.trim()} onClick={() => void saveFeedback()} type="button">
              {saving ? 'Saving...' : 'Save note'}
            </button>
            <Link className="sm-button-secondary" to="/platform">
              Review platform
            </Link>
          </div>

          {saved ? <div className="mt-4 sm-chip text-white">{saved}</div> : null}
          {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Fresh records</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Latest metric inputs</h2>
            </div>
            <Link className="sm-link" to="/ops-intake">
              Add more
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {metrics.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">No saved metric rows yet. Use Ops Intake to capture KPIs or upload a source sheet.</div>
            ) : (
              metrics.map((row) => (
                <div className="sm-chip" key={row.metric_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{row.metric_name}</p>
                      <p className="mt-1 text-sm text-[var(--sm-muted)]">
                        {row.metric_group} | {row.owner} | {row.captured_at}
                      </p>
                    </div>
                    <span className="sm-status-pill">{row.status}</span>
                  </div>
                  <p className="mt-3 text-lg font-bold text-white">
                    {row.metric_value} {row.unit}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Product backlog</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Recent saved workbench notes</h2>
            </div>
            <span className="sm-status-pill">
              Open {summary?.feedback?.open_count ?? 0}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {feedbackRows.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">No saved product notes yet. Use the notebook above to start the improvement loop.</div>
            ) : (
              feedbackRows.map((row) => (
                <div className="sm-proof-card" key={row.feedback_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-white">{row.surface}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.note}</p>
                    </div>
                    <span className="sm-status-pill">{row.priority}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="sm-chip text-white">{row.category}</span>
                    <span className="sm-chip text-white">{row.status}</span>
                    <span className="sm-chip text-white">{row.created_at}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
