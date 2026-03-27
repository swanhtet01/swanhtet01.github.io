import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type MetricRow = {
  metric_id?: string
  captured_at?: string
  metric_name: string
  metric_group: string
  metric_value: string
  unit: string
  period_label: string
  scope: string
  owner: string
  status: string
  notes: string
  evidence_link: string
  source_line?: string
  confidence?: string
}

type MetricAnalysis = {
  filename: string
  metric_count: number
  recommended_groups: string[]
  metrics: MetricRow[]
  preview: string
  summary: string
  summary_stats?: {
    metric_count?: number
    numeric_metric_count?: number
    group_counts?: Record<string, number>
  }
}

type MetricSummary = {
  metric_count?: number
  by_group?: Record<string, number>
  by_status?: Record<string, number>
  top_groups?: Array<{ metric_group: string; item_count: number }>
}

type MetricPayload = {
  rows: MetricRow[]
  summary: MetricSummary | null
}

const DEFAULT_FORM: MetricRow = {
  metric_name: '',
  metric_group: 'general',
  metric_value: '',
  unit: 'value',
  period_label: '',
  scope: '',
  owner: 'Management',
  status: 'reported',
  notes: '',
  evidence_link: '',
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

function parseQuickPaste(rawText: string): MetricRow[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const delimiter = line.includes('\t') ? '\t' : line.includes('|') ? '|' : ','
      const parts = line.split(delimiter).map((part) => part.trim())
      return {
        ...DEFAULT_FORM,
        metric_name: parts[0] || '',
        metric_value: parts[1] || '',
        unit: parts[2] || 'value',
        metric_group: parts[3] || 'general',
        period_label: parts[4] || '',
        scope: parts[5] || '',
        owner: parts[6] || 'Management',
        status: parts[7] || 'reported',
        notes: parts[8] || '',
      }
    })
    .filter((row) => row.metric_name && row.metric_value)
}

export function MetricIntakePage() {
  const [apiReady, setApiReady] = useState<boolean | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fileName, setFileName] = useState('')
  const [analysis, setAnalysis] = useState<MetricAnalysis | null>(null)
  const [rows, setRows] = useState<MetricRow[]>([])
  const [summary, setSummary] = useState<MetricSummary | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [quickPaste, setQuickPaste] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  async function loadRows() {
    const payload = await workspaceFetch<MetricPayload>('/api/metrics/records')
    setRows(payload.rows ?? [])
    setSummary(payload.summary ?? null)
  }

  useEffect(() => {
    let cancelled = false
    async function boot() {
      const health = await checkWorkspaceHealth()
      if (cancelled) return
      setApiReady(health.ready)
      if (!health.ready) return
      try {
        const session = await getWorkspaceSession()
        if (cancelled) return
        if (!session.authenticated) {
          setAuthenticated(false)
          return
        }
        setAuthenticated(true)
      } catch {
        if (!cancelled) {
          setError('Ops Intake login could not be verified on this host yet.')
        }
        return
      }
      try {
        await loadRows()
      } catch {
        if (!cancelled) {
          setError('Metric service is not responding yet.')
        }
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleFileChange(file: File | null) {
    if (!file) return
    setBusy(true)
    setSaved(null)
    setError(null)
    setAnalysis(null)
    setFileName(file.name)
    try {
      const health = await checkWorkspaceHealth()
      setApiReady(health.ready)
      if (!health.ready) {
        setError('Workspace API is not connected on this host yet.')
        return
      }
      const session = await getWorkspaceSession()
      if (!session.authenticated) {
        setAuthenticated(false)
        setError('Login is required before files can be extracted into live records.')
        return
      }
      setAuthenticated(true)
      const contentBase64 = await fileToBase64(file)
      const payload = await workspaceFetch<{ analysis: MetricAnalysis }>('/api/tools/metric-intake', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          content_base64: contentBase64,
        }),
      })
      setAnalysis(payload.analysis)
    } catch {
      setError('Ops Intake could not process that file yet.')
    } finally {
      setBusy(false)
    }
  }

  async function saveMetric() {
    if (!apiReady || !authenticated || !form.metric_name.trim() || !form.metric_value.trim()) return
    setSaving(true)
    setSaved(null)
    setError(null)
    try {
      const payload = await workspaceFetch<MetricPayload & { message?: string }>('/api/metrics/records', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setRows(payload.rows ?? [])
      setSummary(payload.summary ?? null)
      setForm(DEFAULT_FORM)
      setSaved(payload.message ?? 'Metric saved.')
    } catch {
      setError('Could not save the metric right now.')
    } finally {
      setSaving(false)
    }
  }

  async function saveExtractedMetrics() {
    if (!apiReady || !authenticated || !analysis?.metrics?.length) return
    setSaving(true)
    setSaved(null)
    setError(null)
    try {
      const payload = await workspaceFetch<MetricPayload & { saved_count?: number }>('/api/metrics/records/bulk', {
        method: 'POST',
        body: JSON.stringify({
          rows: analysis.metrics.map((row) => ({
            ...DEFAULT_FORM,
            ...row,
            owner: row.owner || 'Management',
            status: row.status || 'reported',
            notes: row.notes || `Extracted from ${analysis.filename}`,
          })),
        }),
      })
      setRows(payload.rows ?? [])
      setSummary(payload.summary ?? null)
      setSaved(`Saved ${payload.saved_count ?? analysis.metrics.length} extracted metrics.`)
    } catch {
      setError('Could not save the extracted metrics right now.')
    } finally {
      setSaving(false)
    }
  }

  async function saveQuickPasteMetrics() {
    if (!apiReady || !authenticated) return
    const parsedRows = parseQuickPaste(quickPaste)
    if (!parsedRows.length) {
      setError('Paste at least one valid metric row first.')
      return
    }
    setSaving(true)
    setSaved(null)
    setError(null)
    try {
      const payload = await workspaceFetch<MetricPayload & { saved_count?: number }>('/api/metrics/records/bulk', {
        method: 'POST',
        body: JSON.stringify({ rows: parsedRows }),
      })
      setRows(payload.rows ?? [])
      setSummary(payload.summary ?? null)
      setQuickPaste('')
      setSaved(`Saved ${payload.saved_count ?? parsedRows.length} pasted metrics.`)
    } catch {
      setError('Could not save the pasted metric rows right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Core module"
        title="Ops Intake"
        description="Turn uploads, spreadsheets, and manual KPI updates into clean live records the rest of the system can actually use."
      />

      {apiReady && !authenticated ? (
        <section className="sm-chip border-[rgba(37,208,255,0.2)] bg-[rgba(37,208,255,0.08)] text-[var(--sm-muted)]">
          Login is required to save live KPI records. The public site can explain the module, but the private app host is where the saved record layer lives.
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Two ways in</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Use upload extraction, quick paste, or simple data entry.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This is the intake layer for messy teams. You do not need a perfect dataset first. Upload a file, paste rough KPI rows, or enter the metric directly.
          </p>

          <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-white/12 bg-[rgba(255,255,255,0.03)] px-6 py-8 text-center">
            <span className="text-lg font-semibold text-white">{busy ? 'Extracting metrics...' : 'Choose a metrics file'}</span>
            <span className="mt-2 text-sm text-[var(--sm-muted)]">Stock sheets, output sheets, quality logs, cash sheets, and similar files.</span>
            <input
              accept=".pdf,.xlsx,.xlsm,.txt,.csv,.json,.md"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null
                void handleFileChange(nextFile)
              }}
              type="file"
            />
          </label>

          {fileName ? <div className="mt-4 sm-chip text-white">Current file: {fileName}</div> : null}

          <div className="mt-6 space-y-2">
            <span className="text-sm text-[var(--sm-muted)]">Quick paste</span>
            <textarea
              className="sm-textarea min-h-[8rem]"
              placeholder={'One row per line: metric name, value, unit, group, period, scope, owner, status, notes'}
              value={quickPaste}
              onChange={(event) => setQuickPaste(event.target.value)}
            />
            <p className="text-xs text-[var(--sm-muted)]">Example: Output,1200,pcs,production,2026-03-26,Plant A,Ops Team,reported,Night shift total</p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Metric name</span>
              <input className="sm-input" value={form.metric_name} onChange={(event) => setForm((current) => ({ ...current, metric_name: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Metric group</span>
              <select className="sm-input" value={form.metric_group} onChange={(event) => setForm((current) => ({ ...current, metric_group: event.target.value }))}>
                <option value="general">general</option>
                <option value="production">production</option>
                <option value="quality">quality</option>
                <option value="receiving">receiving</option>
                <option value="inventory">inventory</option>
                <option value="cash">cash</option>
                <option value="sales">sales</option>
                <option value="people">people</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Value</span>
              <input className="sm-input" value={form.metric_value} onChange={(event) => setForm((current) => ({ ...current, metric_value: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Unit</span>
              <input className="sm-input" value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Period</span>
              <input className="sm-input" value={form.period_label} onChange={(event) => setForm((current) => ({ ...current, period_label: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Scope</span>
              <input className="sm-input" value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value }))} />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={!apiReady || !authenticated || saving || !form.metric_name.trim() || !form.metric_value.trim()} onClick={() => void saveMetric()} type="button">
              {saving ? 'Saving...' : 'Save metric'}
            </button>
            <button className="sm-button-secondary" disabled={!apiReady || !authenticated || saving || !quickPaste.trim()} onClick={() => void saveQuickPasteMetrics()} type="button">
              Save pasted rows
            </button>
            {analysis?.metrics?.length ? (
              <button className="sm-button-secondary" disabled={!apiReady || !authenticated || saving} onClick={() => void saveExtractedMetrics()} type="button">
                Save extracted metrics
              </button>
            ) : null}
            {apiReady && !authenticated ? (
              <Link className="sm-button-secondary" to="/login?next=/ops-intake">
                Login to save
              </Link>
            ) : null}
          </div>

          {saved ? <div className="mt-4 sm-chip text-white">{saved}</div> : null}
          {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Ops Intake result</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Candidate metrics and live records</h2>
            </div>
            <span className="sm-status-pill">
              <span className={`sm-led ${rows.length || analysis ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {rows.length} saved
            </span>
          </div>

          {analysis ? (
            <div className="mt-5 grid gap-4">
              <div className="sm-proof-card">
                <p className="sm-kicker text-[var(--sm-accent)]">Extraction summary</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{analysis.summary}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Recommended groups</p>
                  <p className="mt-2">{analysis.recommended_groups.join(', ') || 'Review manually'}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Candidates</p>
                  <p className="mt-2">{analysis.metric_count}</p>
                </div>
              </div>

              <div className="space-y-3">
                {analysis.metrics.slice(0, 8).map((row, index) => (
                  <div className="sm-chip text-white" key={`${row.metric_name}-${index}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{row.metric_name}</p>
                      <span className="sm-status-pill">{row.confidence || 'review'}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">
                      {row.metric_group} | {row.metric_value} {row.unit} {row.scope ? `| ${row.scope}` : ''}
                    </p>
                    <p className="mt-2 text-xs text-[var(--sm-muted)]">{row.source_line}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Saved metrics</p>
              <p className="mt-2 text-2xl font-bold">{summary?.metric_count ?? 0}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Top group</p>
              <p className="mt-2 text-2xl font-bold">{summary?.top_groups?.[0]?.metric_group ?? 'n/a'}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Use with</p>
              <p className="mt-2 text-sm">Action OS, Inventory Pulse, Receiving Control</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {rows.slice(0, 8).map((row) => (
              <div className="sm-proof-card" key={row.metric_id || `${row.metric_name}-${row.captured_at}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{row.metric_name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">
                      {row.metric_group} | {row.metric_value} {row.unit} {row.scope ? `| ${row.scope}` : ''}
                    </p>
                  </div>
                  <span className="sm-status-pill">{row.status}</span>
                </div>
              </div>
            ))}
            {rows.length === 0 ? <div className="sm-chip text-[var(--sm-muted)]">No saved metrics yet. Upload a file or enter the first KPI row.</div> : null}
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Best fit</p>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">Production output and downtime sheets</div>
            <div className="sm-chip text-white">Inventory and warehouse stock reports</div>
            <div className="sm-chip text-white">Cash, sales, quality, and receiving KPI logs</div>
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next step</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Use Ops Intake as the onboarding bridge.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This lets a company start with rough KPI sheets and manual entries, then gradually move toward cleaner module-specific records without forcing a heavy setup first.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/actions">
              Open Action OS
            </Link>
            <Link className="sm-button-secondary" to="/app/inventory">
              Open Inventory Pulse
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
