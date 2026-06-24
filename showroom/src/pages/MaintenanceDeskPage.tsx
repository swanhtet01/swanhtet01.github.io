import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getTenantConfig } from '../lib/tenantConfig'
import { YANGON_TYRE_DATA_PROFILE } from '../lib/yangonTyreDataProfile'
import { checkWorkspaceHealth, getCapabilityProfileForRole, getWorkspaceSession, sessionHasCapability, workspaceFetch } from '../lib/workspaceApi'

type MaintenanceRow = {
  maintenance_id: string
  logged_at: string
  asset_name: string
  issue_type: string
  priority: string
  status: string
  owner: string
  downtime_minutes: string
  next_action: string
}

type MaintenanceSummary = {
  maintenance_count?: number
  by_status?: Record<string, number>
  breakdown_count?: number
  downtime_minutes_total?: number
  top_issue_types?: Array<{ issue_type: string; item_count: number }>
}

type MetricRow = {
  metric_id: string
  metric_name: string
  metric_group: string
  metric_value: string
  unit: string
  period_label: string
  owner: string
}

type InventoryRow = {
  inventory_id: string
  item_name: string
  warehouse: string
  available_qty: string
  reorder_point: string
  status: string
  next_action: string
}

type ApprovalRow = {
  approval_id: string
  title: string
  owner: string
  status: string
  due: string
}

type MaintenanceForm = {
  asset_name: string
  issue_type: string
  priority: string
  status: string
  owner: string
  downtime_minutes: string
  next_action: string
  evidence_link: string
  logged_at: string
}

const defaults: MaintenanceForm = {
  asset_name: '',
  issue_type: 'breakdown',
  priority: 'medium',
  status: 'open',
  owner: 'Maintenance Team',
  downtime_minutes: '',
  next_action: '',
  evidence_link: '',
  logged_at: '',
}

export function MaintenanceDeskPage() {
  const tenant = getTenantConfig()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null)
  const [rows, setRows] = useState<MaintenanceRow[]>([])
  const [metricRows, setMetricRows] = useState<MetricRow[]>([])
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  const [approvalRows, setApprovalRows] = useState<ApprovalRow[]>([])
  const [form, setForm] = useState<MaintenanceForm>(defaults)

  async function loadDesk() {
    const [maintenancePayload, metricPayload, inventoryPayload, approvalPayload] = await Promise.all([
      workspaceFetch<{ summary?: MaintenanceSummary; rows?: MaintenanceRow[] }>('/api/maintenance/records?limit=20'),
      workspaceFetch<{ rows?: MetricRow[] }>('/api/metrics/records?limit=20'),
      workspaceFetch<{ rows?: InventoryRow[] }>('/api/inventory/records?status=reorder&limit=8'),
      workspaceFetch<{ rows?: ApprovalRow[] }>('/api/approvals?limit=10'),
    ])
    setSummary(maintenancePayload.summary ?? null)
    setRows(maintenancePayload.rows ?? [])
    setMetricRows(metricPayload.rows ?? [])
    setInventoryRows(inventoryPayload.rows ?? [])
    setApprovalRows(approvalPayload.rows ?? [])
  }

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
          setError('Login is required to open maintenance.')
          setLoading(false)
          return
        }
        if (!sessionHasCapability(session.session, 'maintenance.view') && !sessionHasCapability(session.session, 'actions.view')) {
          setError(`Maintenance access is required for this desk. Current role: ${getCapabilityProfileForRole(session.session?.role).label}.`)
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
        await loadDesk()
      } catch {
        if (!cancelled) {
          setError('Maintenance desk could not be loaded right now.')
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

  const maintenanceMetrics = useMemo(
    () =>
      metricRows.filter((row) => {
        const group = String(row.metric_group || '').toLowerCase()
        const name = String(row.metric_name || '').toLowerCase()
        return group === 'production' || name.includes('downtime') || name.includes('oee') || name.includes('availability') || name.includes('mtbf')
      }),
    [metricRows],
  )

  async function saveRecord() {
    if (!form.asset_name.trim()) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const payload = await workspaceFetch<{ message?: string }>('/api/maintenance/records', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      await loadDesk()
      setForm(defaults)
      setMessage(payload.message ?? 'Maintenance record saved.')
    } catch {
      setError('Could not save the maintenance record right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Maintenance"
        title="Track breakdowns, PM work, and spare-part blockers."
        description="This desk gives maintenance its own live lane: machine issues, downtime, owner follow-up, dependency watch, and reliability review."
      />

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Records</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.maintenance_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Breakdowns</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.breakdown_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Downtime</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.downtime_minutes_total ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Spare-part watch</p>
          <p className="mt-3 text-3xl font-bold text-white">{inventoryRows.length}</p>
        </div>
      </section>

      {tenant.key === 'ytf-plant-a' ? (
        <section className="grid gap-4 md:grid-cols-4">
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent)]">Machine clusters</p>
            <p className="mt-2 text-lg font-bold">{YANGON_TYRE_DATA_PROFILE.machineClusters.length} core assets</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{YANGON_TYRE_DATA_PROFILE.machineClusters.join(' / ')}</p>
          </div>
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Factory scope</p>
            <p className="mt-2 text-lg font-bold">PD-1 to PD-4</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{YANGON_TYRE_DATA_PROFILE.productionLines.join(' / ')}</p>
          </div>
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent)]">Quality tie-in</p>
            <p className="mt-2 text-lg font-bold">{YANGON_TYRE_DATA_PROFILE.topDefects[0]}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Reliability work should stay linked to repeat defect and CAPA records.</p>
          </div>
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Reliability aim</p>
            <p className="mt-2 text-lg font-bold">Downtime plus root cause</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Use 5W1H and Ishikawa closeout on repeat failures and major stoppages.</p>
          </div>
        </section>
      ) : null}

      {loading ? (
        <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Loading maintenance desk...</section>
      ) : error ? (
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{error}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/maintenance">
              Login
            </Link>
            <Link className="sm-button-secondary" to="/app/actions">
              Open queue
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <article className="sm-surface-deep p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Log work</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Capture maintenance activity as it happens.</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Asset</span>
                  <input className="sm-input" value={form.asset_name} onChange={(event) => setForm((current) => ({ ...current, asset_name: event.target.value }))} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Issue type</span>
                  <select className="sm-input" value={form.issue_type} onChange={(event) => setForm((current) => ({ ...current, issue_type: event.target.value }))}>
                    <option value="breakdown">breakdown</option>
                    <option value="preventive">preventive</option>
                    <option value="spare_part">spare_part</option>
                    <option value="repeat_failure">repeat_failure</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Priority</span>
                  <select className="sm-input" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                  <input className="sm-input" value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Status</span>
                  <select className="sm-input" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                    <option value="open">open</option>
                    <option value="in_progress">in_progress</option>
                    <option value="review">review</option>
                    <option value="closed">closed</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-[var(--sm-muted)]">Downtime minutes</span>
                  <input className="sm-input" value={form.downtime_minutes} onChange={(event) => setForm((current) => ({ ...current, downtime_minutes: event.target.value }))} />
                </label>
              </div>
              <label className="mt-4 block space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Next action</span>
                <input className="sm-input" value={form.next_action} onChange={(event) => setForm((current) => ({ ...current, next_action: event.target.value }))} />
              </label>
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="sm-button-primary" disabled={saving} onClick={() => void saveRecord()} type="button">
                  {saving ? 'Saving...' : 'Save maintenance record'}
                </button>
                <Link className="sm-button-secondary" to="/app/inventory">
                  Open inventory
                </Link>
              </div>
              {message ? <div className="mt-4 sm-chip text-white">{message}</div> : null}
              {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
            </article>

            <article className="sm-terminal p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Maintenance queue</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Open asset issues and follow-up</h2>
                </div>
                <span className="sm-status-pill">{rows.length} records</span>
              </div>
              <div className="mt-5 space-y-3">
                {rows.map((row) => (
                  <article className="sm-proof-card" key={row.maintenance_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.asset_name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.issue_type} · {row.next_action}</p>
                      </div>
                      <span className="sm-status-pill">{row.priority}</span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                        <p className="mt-2">{row.owner}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Status</p>
                        <p className="mt-2">{row.status}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Downtime</p>
                        <p className="mt-2">{row.downtime_minutes || '0'} min</p>
                      </div>
                    </div>
                  </article>
                ))}
                {!rows.length ? <div className="sm-chip text-[var(--sm-muted)]">No maintenance records yet. Save the first issue from the form on the left.</div> : null}
              </div>
            </article>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Dependencies</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Spare parts and approvals that can block maintenance</h2>
              <div className="mt-5 space-y-3">
                {inventoryRows.map((row) => (
                  <article className="sm-chip text-white" key={row.inventory_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{row.item_name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">
                          {row.warehouse} · available {row.available_qty || '0'} / reorder {row.reorder_point || '0'}
                        </p>
                      </div>
                      <span className="sm-status-pill">{row.status}</span>
                    </div>
                  </article>
                ))}
                {approvalRows.slice(0, 3).map((row) => (
                  <article className="sm-chip text-white" key={row.approval_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{row.title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">Owner {row.owner} · due {row.due || 'Review'}</p>
                      </div>
                      <span className="sm-status-pill">{row.status}</span>
                    </div>
                  </article>
                ))}
                {!inventoryRows.length && !approvalRows.length ? <div className="sm-chip text-[var(--sm-muted)]">No current blockers returned.</div> : null}
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Reliability metrics</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Use data science and KPI review to stop repeat failures.</h2>
              <div className="mt-5 space-y-3">
                {maintenanceMetrics.slice(0, 6).map((row) => (
                  <article className="sm-proof-card" key={row.metric_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{row.metric_name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.metric_group} · {row.period_label || row.owner}</p>
                      </div>
                      <span className="sm-status-pill">
                        {row.metric_value} {row.unit}
                      </span>
                    </div>
                  </article>
                ))}
                {!maintenanceMetrics.length ? <div className="sm-chip text-[var(--sm-muted)]">No maintenance metrics yet. Add downtime and reliability rows in KPI intake.</div> : null}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to="/app/insights">
                  Open insights
                </Link>
                <Link className="sm-button-secondary" to="/app/dqms">
                  Open DQMS
                </Link>
                <Link className="sm-button-secondary" to="/app/intake">
                  KPI intake
                </Link>
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  )
}
