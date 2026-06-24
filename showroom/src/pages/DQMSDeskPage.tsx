import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  YANGON_TYRE_APPROVAL_ROWS_SEED,
  YANGON_TYRE_CAPA_ROWS_SEED,
  YANGON_TYRE_DQMS_SUMMARY_SEED,
  YANGON_TYRE_PLANT_CONTROL_UPDATED_AT,
  YANGON_TYRE_PLANT_MANAGER_REVIEW_RHYTHMS,
  YANGON_TYRE_QUALITY_INCIDENTS_SEED,
  YANGON_TYRE_QUALITY_METRIC_ROWS_SEED,
} from '../lib/yangonTyrePlantControl'
import { getTenantConfig } from '../lib/tenantConfig'
import { YANGON_TYRE_DATA_PROFILE } from '../lib/yangonTyreDataProfile'
import { checkWorkspaceHealth, getCapabilityProfileForRole, getWorkspaceSession, sessionHasCapability, workspaceFetch } from '../lib/workspaceApi'

type QualityIncidentRow = {
  incident_id: string
  status: string
  severity: string
  owner: string
  supplier: string
  title: string
  summary: string
  source_type: string
  reported_at: string
  target_close_date: string
}

type CapaRow = {
  capa_id: string
  incident_id: string
  status: string
  owner: string
  action_title: string
  verification_criteria: string
  target_date: string
}

type MetricRow = {
  metric_id: string
  metric_name: string
  metric_group: string
  metric_value: string
  unit: string
  period_label: string
  owner: string
  status: string
}

type ApprovalRow = {
  approval_id: string
  title: string
  approval_gate: string
  owner: string
  status: string
  due: string
}

type SummaryPayload = {
  quality?: {
    incident_count?: number
    capa_count?: number
    by_status?: Record<string, number>
    top_suppliers?: Array<{ supplier: string; incident_count: number }>
  }
}

type IncidentForm = {
  title: string
  summary: string
  supplier: string
  severity: string
  status: string
  owner: string
  reported_at: string
  target_close_date: string
  evidence_link: string
}

type CapaForm = {
  incident_id: string
  action_title: string
  verification_criteria: string
  target_date: string
  owner: string
  status: string
}

const incidentDefaults: IncidentForm = {
  title: '',
  summary: '',
  supplier: 'Internal',
  severity: 'medium',
  status: 'open',
  owner: 'Quality Team',
  reported_at: '',
  target_close_date: '',
  evidence_link: '',
}

const capaDefaults: CapaForm = {
  incident_id: '',
  action_title: '',
  verification_criteria: '',
  target_date: '',
  owner: 'Quality Team',
  status: 'open',
}

export function DQMSDeskPage() {
  const tenant = getTenantConfig()
  const [loading, setLoading] = useState(true)
  const [savingIncident, setSavingIncident] = useState(false)
  const [savingCapa, setSavingCapa] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string>('Using seeded DQMS surface while the live workspace connects.')
  const [source, setSource] = useState<'live' | 'seed'>('seed')
  const [summary, setSummary] = useState<SummaryPayload | null>(() => ({
    quality: {
      incident_count: YANGON_TYRE_DQMS_SUMMARY_SEED.quality.incident_count,
      capa_count: YANGON_TYRE_DQMS_SUMMARY_SEED.quality.capa_count,
      by_status: { ...YANGON_TYRE_DQMS_SUMMARY_SEED.quality.by_status },
      top_suppliers: YANGON_TYRE_DQMS_SUMMARY_SEED.quality.top_suppliers.map((item) => ({ ...item })),
    },
  }))
  const [incidents, setIncidents] = useState<QualityIncidentRow[]>(YANGON_TYRE_QUALITY_INCIDENTS_SEED)
  const [capaRows, setCapaRows] = useState<CapaRow[]>(YANGON_TYRE_CAPA_ROWS_SEED)
  const [metricRows, setMetricRows] = useState<MetricRow[]>(YANGON_TYRE_QUALITY_METRIC_ROWS_SEED)
  const [approvalRows, setApprovalRows] = useState<ApprovalRow[]>(YANGON_TYRE_APPROVAL_ROWS_SEED)
  const [incidentForm, setIncidentForm] = useState<IncidentForm>(incidentDefaults)
  const [capaForm, setCapaForm] = useState<CapaForm>(capaDefaults)

  async function loadDesk() {
    const [summaryPayload, incidentPayload, capaPayload, metricPayload, approvalPayload] = await Promise.all([
      workspaceFetch<SummaryPayload>('/api/summary'),
      workspaceFetch<{ rows?: QualityIncidentRow[] }>('/api/quality/incidents?limit=20'),
      workspaceFetch<{ rows?: CapaRow[] }>('/api/quality/capa?limit=20'),
      workspaceFetch<{ rows?: MetricRow[] }>('/api/metrics/records?limit=20'),
      workspaceFetch<{ rows?: ApprovalRow[] }>('/api/approvals?limit=10'),
    ])
    setSummary(summaryPayload)
    setIncidents(incidentPayload.rows ?? [])
    setCapaRows(capaPayload.rows ?? [])
    setMetricRows(metricPayload.rows ?? [])
    setApprovalRows(approvalPayload.rows ?? [])
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      const health = await checkWorkspaceHealth()
      if (cancelled) return
      if (!health.ready) {
        setSource('seed')
        setStatusNote('Workspace API is not connected on this host yet. Showing the seeded DQMS surface.')
        setLoading(false)
        return
      }

      try {
        const session = await getWorkspaceSession()
        if (cancelled) return
        if (!session.authenticated) {
          setSource('seed')
          setStatusNote('Workspace login is not active here. Showing the seeded DQMS surface.')
          setLoading(false)
          return
        }
        if (!sessionHasCapability(session.session, 'dqms.view') && !sessionHasCapability(session.session, 'approvals.view')) {
          setSource('seed')
          setStatusNote(`Live DQMS access is not available for the current role (${getCapabilityProfileForRole(session.session?.role).label}). Showing the seeded DQMS surface.`)
          setLoading(false)
          return
        }
      } catch {
        if (!cancelled) {
          setSource('seed')
          setStatusNote('Workspace login could not be verified on this host yet. Showing the seeded DQMS surface.')
          setLoading(false)
        }
        return
      }

      try {
        await loadDesk()
        setSource('live')
        setStatusNote('Live DQMS incidents, CAPA, and KPI rows are connected.')
      } catch {
        if (!cancelled) {
          setSource('seed')
          setStatusNote('Live DQMS data could not be loaded right now. Showing the seeded DQMS surface.')
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

  const qualityMetrics = useMemo(
    () =>
      metricRows.filter((row) => {
        const group = String(row.metric_group || '').toLowerCase()
        const name = String(row.metric_name || '').toLowerCase()
        return group === 'quality' || group === 'production' || name.includes('reject') || name.includes('scrap') || name.includes('ppm') || name.includes('downtime')
      }),
    [metricRows],
  )

  async function saveIncident() {
    if (!incidentForm.title.trim()) return
    if (source !== 'live') {
      setMessage('Seed mode is read-only. Connect the live workspace to write incidents back into the DQMS record.')
      return
    }
    setSavingIncident(true)
    setMessage(null)
    setError(null)
    try {
      const payload = await workspaceFetch<{ message?: string }>('/api/quality/incidents', {
        method: 'POST',
        body: JSON.stringify({
          ...incidentForm,
          source_type: 'manual_entry',
        }),
      })
      await loadDesk()
      setIncidentForm(incidentDefaults)
      setMessage(payload.message ?? 'Quality incident saved.')
    } catch {
      setError('Could not save the quality incident right now.')
    } finally {
      setSavingIncident(false)
    }
  }

  async function saveCapa() {
    if (!capaForm.incident_id.trim() || !capaForm.action_title.trim()) return
    if (source !== 'live') {
      setMessage('Seed mode is read-only. Connect the live workspace to write CAPA actions back into the DQMS record.')
      return
    }
    setSavingCapa(true)
    setMessage(null)
    setError(null)
    try {
      const payload = await workspaceFetch<{ message?: string }>('/api/quality/capa', {
        method: 'POST',
        body: JSON.stringify(capaForm),
      })
      await loadDesk()
      setCapaForm(capaDefaults)
      setMessage(payload.message ?? 'CAPA action saved.')
    } catch {
      setError('Could not save the CAPA action right now.')
    } finally {
      setSavingCapa(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="DQMS"
        title="Run incidents, CAPA, and quality methods in one place."
        description="This is the industrial quality desk for Yangon Tyre: incident register, CAPA queue, KPI review, fishbone, 5W1H, and closeout discipline."
      />

      <section className="sm-chip text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-semibold">{source === 'live' ? 'Live DQMS surface connected.' : 'Seeded DQMS surface active.'}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              {statusNote} Updated signal: {source === 'live' ? 'Live workspace snapshot' : new Date(YANGON_TYRE_PLANT_CONTROL_UPDATED_AT).toLocaleString()}.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/plant-manager">
              Plant manager
            </Link>
            <Link className="sm-button-secondary" to="/app/operations">
              Open operations
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Incidents</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.quality?.incident_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Open</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.quality?.by_status?.open ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">CAPA</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.quality?.capa_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Quality KPIs</p>
          <p className="mt-3 text-3xl font-bold text-white">{qualityMetrics.length}</p>
        </div>
      </section>

      {tenant.key === 'ytf-plant-a' ? (
        <section className="grid gap-4 md:grid-cols-4">
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent)]">Top defects</p>
            <p className="mt-2 text-lg font-bold">{YANGON_TYRE_DATA_PROFILE.topDefects[0]}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{YANGON_TYRE_DATA_PROFILE.topDefects.slice(1).join(' / ')}</p>
          </div>
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">B+R baseline</p>
            <p className="mt-2 text-lg font-bold">{YANGON_TYRE_DATA_PROFILE.annualBPlusRRate2024}% avg</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Worst month: {YANGON_TYRE_DATA_PROFILE.worstMonth2024.month} at {YANGON_TYRE_DATA_PROFILE.worstMonth2024.bPlusRRate}%.</p>
          </div>
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent)]">Release logic</p>
            <p className="mt-2 text-lg font-bold">Containment before closeout</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{YANGON_TYRE_DATA_PROFILE.qualityTargets.join(' / ')}</p>
          </div>
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Process scope</p>
            <p className="mt-2 text-lg font-bold">Mixing to curing</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{YANGON_TYRE_DATA_PROFILE.productionLines.join(' / ')}</p>
          </div>
        </section>
      ) : null}

      {tenant.key === 'ytf-plant-a' ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <article className="sm-surface-deep p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Quality and plant rhythm</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Containment and plant flow should share one review cadence.</h2>
            <div className="mt-6 grid gap-4">
              {YANGON_TYRE_PLANT_MANAGER_REVIEW_RHYTHMS.slice(0, 2).map((item) => (
                <article className="sm-proof-card" key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{item.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.cadence}</p>
                    </div>
                    <Link className="sm-link" to={item.route}>
                      Open lane
                    </Link>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-white/80">{item.purpose}</p>
                </article>
              ))}
            </div>
          </article>
          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Writeback status</p>
            <h2 className="mt-2 text-3xl font-bold text-white">This desk is already usable for review, and live mode enables writeback.</h2>
            <div className="mt-6 grid gap-4">
              <article className="sm-proof-card">
                <p className="font-semibold text-white">Current mode</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
                  {source === 'live'
                    ? 'Live mode is active. New incidents and CAPA actions can be written back into the workspace APIs.'
                    : 'Seed mode is active. You can review the DQMS flow, methods, and incident patterns now, then switch to live mode for writeback.'}
                </p>
              </article>
              <article className="sm-proof-card">
                <p className="font-semibold text-white">Next move</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
                  Use the plant-manager interface to run the daily rhythm across operations, DQMS, maintenance, and receiving from one command surface.
                </p>
              </article>
            </div>
          </article>
        </section>
      ) : null}

      {tenant.key === 'ytf-plant-a' ? (
        <section className="sm-calm-surface p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Manager routine</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Use Plant Manager for the review loop.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                Use DQMS for the case itself. Use Plant Manager when quality managers need the daily routine, teaching sequence, and method framing before diving into individual incidents.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/plant-manager">
                Open plant manager
              </Link>
              <Link className="sm-button-secondary" to="/app/adoption-command">
                Review adoption
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {loading && source === 'live' ? (
        <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Loading DQMS desk...</section>
      ) : error ? (
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{error}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/dqms">
              Login
            </Link>
            <Link className="sm-button-secondary" to="/app/approvals">
              Open approvals
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <article className="sm-surface-deep p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Log incident</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Capture the issue while the evidence is fresh.</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Title</span>
                  <input className="sm-input" value={incidentForm.title} onChange={(event) => setIncidentForm((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Supplier</span>
                  <input className="sm-input" value={incidentForm.supplier} onChange={(event) => setIncidentForm((current) => ({ ...current, supplier: event.target.value }))} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Severity</span>
                  <select className="sm-input" value={incidentForm.severity} onChange={(event) => setIncidentForm((current) => ({ ...current, severity: event.target.value }))}>
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                  <input className="sm-input" value={incidentForm.owner} onChange={(event) => setIncidentForm((current) => ({ ...current, owner: event.target.value }))} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Status</span>
                  <select className="sm-input" value={incidentForm.status} onChange={(event) => setIncidentForm((current) => ({ ...current, status: event.target.value }))}>
                    <option value="open">open</option>
                    <option value="triage">triage</option>
                    <option value="review">review</option>
                    <option value="closed">closed</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Target close</span>
                  <input className="sm-input" value={incidentForm.target_close_date} onChange={(event) => setIncidentForm((current) => ({ ...current, target_close_date: event.target.value }))} />
                </label>
              </div>
              <label className="mt-4 block space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Summary</span>
                <textarea
                  className="min-h-24 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-normal text-white"
                  value={incidentForm.summary}
                  onChange={(event) => setIncidentForm((current) => ({ ...current, summary: event.target.value }))}
                />
              </label>
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="sm-button-primary" disabled={savingIncident} onClick={() => void saveIncident()} type="button">
                  {source === 'live' ? (savingIncident ? 'Saving...' : 'Save incident') : 'Live workspace required'}
                </button>
                <Link className="sm-button-secondary" to="/app/documents">
                  Open documents
                </Link>
              </div>

              <div className="mt-8 border-t border-white/8 pt-6">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Create CAPA</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--sm-muted)]">Incident ID</span>
                    <input className="sm-input" value={capaForm.incident_id} onChange={(event) => setCapaForm((current) => ({ ...current, incident_id: event.target.value }))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                    <input className="sm-input" value={capaForm.owner} onChange={(event) => setCapaForm((current) => ({ ...current, owner: event.target.value }))} />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm text-[var(--sm-muted)]">Action title</span>
                    <input className="sm-input" value={capaForm.action_title} onChange={(event) => setCapaForm((current) => ({ ...current, action_title: event.target.value }))} />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm text-[var(--sm-muted)]">Verification criteria</span>
                    <input className="sm-input" value={capaForm.verification_criteria} onChange={(event) => setCapaForm((current) => ({ ...current, verification_criteria: event.target.value }))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--sm-muted)]">Target date</span>
                    <input className="sm-input" value={capaForm.target_date} onChange={(event) => setCapaForm((current) => ({ ...current, target_date: event.target.value }))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[var(--sm-muted)]">Status</span>
                    <select className="sm-input" value={capaForm.status} onChange={(event) => setCapaForm((current) => ({ ...current, status: event.target.value }))}>
                      <option value="open">open</option>
                      <option value="review">review</option>
                      <option value="done">done</option>
                    </select>
                  </label>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button className="sm-button-accent" disabled={savingCapa} onClick={() => void saveCapa()} type="button">
                    {source === 'live' ? (savingCapa ? 'Saving...' : 'Save CAPA') : 'Live workspace required'}
                  </button>
                  <Link className="sm-button-secondary" to="/app/approvals">
                    Open approvals
                  </Link>
                </div>
              </div>

              {message ? <div className="mt-4 sm-chip text-white">{message}</div> : null}
              {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
            </article>

            <article className="sm-terminal p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Incident register</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Open quality and DQMS items</h2>
                </div>
                <span className="sm-status-pill">{incidents.length} incidents</span>
              </div>
              <div className="mt-5 space-y-3">
                {incidents.map((row) => (
                  <article className="sm-proof-card" key={row.incident_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary}</p>
                      </div>
                      <span className="sm-status-pill">{row.severity}</span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Supplier</p>
                        <p className="mt-2">{row.supplier || 'Internal'}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Owner</p>
                        <p className="mt-2">{row.owner}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Status</p>
                        <p className="mt-2">{row.status}</p>
                      </div>
                    </div>
                  </article>
                ))}
                {!incidents.length ? <div className="sm-chip text-[var(--sm-muted)]">No live incidents yet. Save the first incident from the form on the left.</div> : null}
              </div>
            </article>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <article className="sm-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">CAPA queue</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Corrective actions and verification</h2>
                </div>
                <span className="sm-status-pill">{capaRows.length} CAPA</span>
              </div>
              <div className="mt-5 space-y-3">
                {capaRows.map((row) => (
                  <article className="sm-proof-card" key={row.capa_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.action_title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.verification_criteria}</p>
                      </div>
                      <span className="sm-status-pill">{row.status}</span>
                    </div>
                    <p className="mt-4 text-sm text-white/80">Incident: {row.incident_id} · owner {row.owner} · target {row.target_date || 'Review'}</p>
                  </article>
                ))}
                {!capaRows.length ? <div className="sm-chip text-[var(--sm-muted)]">No CAPA actions yet.</div> : null}
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Methods and KPI review</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Use structured quality methods, not blank notes.</h2>
              <div className="mt-5 flex flex-wrap gap-2">
                {['Fishbone', '5W1H', 'Containment', 'CAPA', 'Gap review', 'Management review'].map((item) => (
                  <span className="sm-status-pill" key={item}>
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-5 space-y-3">
                {qualityMetrics.slice(0, 6).map((row) => (
                  <article className="sm-chip text-white" key={row.metric_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{row.metric_name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.metric_group} · {row.period_label || row.owner}</p>
                      </div>
                      <span className="sm-status-pill">
                        {row.metric_value} {row.unit}
                      </span>
                    </div>
                  </article>
                ))}
                {!qualityMetrics.length ? <div className="sm-chip text-[var(--sm-muted)]">No quality KPI rows yet.</div> : null}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to="/app/insights">
                  Open insights
                </Link>
                <Link className="sm-button-secondary" to="/app/knowledge">
                  Open knowledge
                </Link>
                <Link className="sm-button-secondary" to="/app/approvals">
                  Open approvals
                </Link>
              </div>
              <div className="mt-4 text-sm text-[var(--sm-muted)]">Pending approvals in review: {approvalRows.filter((row) => row.status === 'pending' || row.status === 'review').length}</div>
            </article>
          </section>
        </>
      )}
    </div>
  )
}
