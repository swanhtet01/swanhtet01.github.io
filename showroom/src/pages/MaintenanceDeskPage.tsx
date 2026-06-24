import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  YANGON_TYRE_INVENTORY_ROWS_SEED,
  YANGON_TYRE_QUALITY_METRIC_ROWS_SEED,
} from '../lib/yangonTyrePlantControl'
import { operatingRecordFailureMessage, operatingRecordSavedMessage, type OperatingRecordSavePayload } from '../lib/operatingRecordStatus'
import { workspaceFetch } from '../lib/workspaceApi'
import { YTF_PLANT_SCOPE_OPTIONS, inferYtfPlantScope, ytfOwnerLabel, ytfSourceLine } from '../lib/ytfUiFormat'

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
  evidence_link?: string
  source_label?: string
  source_ref_json?: string
  plant_scope?: string
  modified_time?: string
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
  plant_scope: string
}

const fallbackRows: MaintenanceRow[] = [
  {
    maintenance_id: 'mt-seed-1',
    logged_at: '2026-04-20T08:30:00.000Z',
    asset_name: 'Curing press 07',
    issue_type: 'breakdown',
    priority: 'high',
    status: 'open',
    owner: 'Maintenance team',
    downtime_minutes: '45',
    next_action: 'Confirm root cause and spare-part blocker before shift handoff.',
    source_label: 'Seed example / Plant A / not live Drive data',
    plant_scope: 'plant_a',
  },
  {
    maintenance_id: 'mt-seed-2',
    logged_at: '2026-04-20T10:15:00.000Z',
    asset_name: 'Utility compressor',
    issue_type: 'utility',
    priority: 'medium',
    status: 'open',
    owner: 'Utility team',
    downtime_minutes: '20',
    next_action: 'Check repeat pressure drop and attach photo evidence.',
    source_label: 'Seed example / Plant A utility / not live Drive data',
    plant_scope: 'plant_a',
  },
]

const defaults: MaintenanceForm = {
  asset_name: '',
  issue_type: 'breakdown',
  priority: 'medium',
  status: 'open',
  owner: 'Maintenance team',
  downtime_minutes: '',
  next_action: '',
  evidence_link: '',
  logged_at: '',
  plant_scope: 'plant_a',
}

function formatDate(value?: string | null) {
  if (!value) return 'Not dated'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

function compactNumber(value?: number | string | null) {
  if (typeof value === 'number') return new Intl.NumberFormat().format(value)
  const normalized = String(value ?? '').trim()
  return normalized || '0'
}

function statusText(value?: string | null) {
  return String(value || 'open').replace(/_/g, ' ')
}

function maintenanceSource(row: MaintenanceRow) {
  if (row.source_label) return row.source_label
  if (row.evidence_link) return `Evidence: ${row.evidence_link}`
  return ytfSourceLine({
    sourceRootTitle: row.source_ref_json ? 'maintenance source reference' : 'maintenance records table',
    sourceMode: row.source_ref_json ? 'saved source reference' : 'manual or migrated entry',
    plant: row.plant_scope,
    title: row.asset_name,
    modifiedTime: row.modified_time || row.logged_at,
  })
}

export function MaintenanceDeskPage() {
  const [, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [summary, setSummary] = useState<MaintenanceSummary>(() => ({
    maintenance_count: fallbackRows.length,
    breakdown_count: fallbackRows.filter((row) => row.issue_type === 'breakdown').length,
    downtime_minutes_total: fallbackRows.reduce((sum, row) => sum + Number(row.downtime_minutes || 0), 0),
    by_status: { open: 2 },
  }))
  const [rows, setRows] = useState<MaintenanceRow[]>(fallbackRows)
  const [metricRows, setMetricRows] = useState<MetricRow[]>(YANGON_TYRE_QUALITY_METRIC_ROWS_SEED)
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>(YANGON_TYRE_INVENTORY_ROWS_SEED)
  const [form, setForm] = useState<MaintenanceForm>(defaults)

  const loadDesk = useCallback(async () => {
    const [maintenancePayload, metricPayload, inventoryPayload] = await Promise.allSettled([
      workspaceFetch<{ summary?: MaintenanceSummary; rows?: MaintenanceRow[] }>('/api/maintenance/records?limit=20'),
      workspaceFetch<{ rows?: MetricRow[] }>('/api/metrics/records?limit=20'),
      workspaceFetch<{ rows?: InventoryRow[] }>('/api/inventory/records?status=reorder&limit=8'),
    ])

    if (maintenancePayload.status === 'fulfilled') {
      if (maintenancePayload.value.summary) setSummary(maintenancePayload.value.summary)
      setRows(maintenancePayload.value.rows?.length ? maintenancePayload.value.rows : fallbackRows)
    }
    if (metricPayload.status === 'fulfilled') {
      setMetricRows(metricPayload.value.rows ?? [])
    }
    if (inventoryPayload.status === 'fulfilled') {
      setInventoryRows(inventoryPayload.value.rows ?? [])
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        await loadDesk()
      } catch {
        if (!cancelled) setError('Using seed maintenance records because live data did not load.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void start()
    return () => {
      cancelled = true
    }
  }, [loadDesk])

  const maintenanceMetrics = useMemo(
    () =>
      metricRows.filter((row) => {
        const text = `${row.metric_group} ${row.metric_name}`.toLowerCase()
        return text.includes('downtime') || text.includes('oee') || text.includes('availability') || text.includes('mtbf')
      }),
    [metricRows],
  )

  const openRows = useMemo(() => {
    const seen = new Set<string>()
    return rows
      .filter((row) => String(row.status || '').toLowerCase() !== 'closed')
      .filter((row) => {
        const key = [row.asset_name, row.issue_type, row.next_action, formatDate(row.logged_at)]
          .join('|')
          .toLowerCase()
          .replace(/\s+/g, ' ')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [rows])
  const sparePartWatch = inventoryRows.filter((row) => row.status !== 'ok').slice(0, 4)
  const selectedPlantScope = YTF_PLANT_SCOPE_OPTIONS.find((option) => option.value === form.plant_scope)
  const highRiskRows = openRows
    .filter((row) => ['critical', 'high'].includes(String(row.priority || '').toLowerCase()) || Number(row.downtime_minutes || 0) > 0)
    .slice(0, 3)
  const topDowntimeRow = [...openRows].sort((left, right) => Number(right.downtime_minutes || 0) - Number(left.downtime_minutes || 0))[0]

  function updateForm(key: keyof MaintenanceForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function saveRecord() {
    if (!form.asset_name.trim() || !form.next_action.trim()) {
      setError('Add the machine/asset and next action before saving.')
      return
    }
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const payload = await workspaceFetch<OperatingRecordSavePayload & { record?: MaintenanceRow }>('/api/maintenance/records', {
        method: 'POST',
        body: JSON.stringify({ ...form, logged_at: form.logged_at || new Date().toISOString(), create_action: true }),
      })
      await loadDesk()
      if (payload.record) setRows((current) => [payload.record as MaintenanceRow, ...current])
      setForm(defaults)
      setMessage(operatingRecordSavedMessage(payload, 'Maintenance record saved.'))
    } catch {
      setError(operatingRecordFailureMessage('Maintenance record'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row">
        <div>
          <p className="sm-kicker">Maintenance</p>
          <h1>Maintenance.</h1>
          <p>One asset, one issue, one next physical action. Team owner can be updated later.</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{`${openRows.length} open`}</span>
          <span>{compactNumber(summary.downtime_minutes_total)} min downtime</span>
          <span>Plant A default</span>
        </div>
      </section>

      {(message || error) && <p className="sm-ytf-alert">{message || error}</p>}

      <section className="sm-ytf-metric-strip">
        <article>
          <span>Open work</span>
          <strong>{compactNumber(openRows.length)}</strong>
          <small>repair, PM, utility, and spare-part items</small>
        </article>
        <article>
          <span>Downtime</span>
          <strong>{compactNumber(summary.downtime_minutes_total)} min</strong>
          <small>from saved maintenance rows</small>
        </article>
        <article>
          <span>Breakdowns</span>
          <strong>{compactNumber(summary.breakdown_count ?? rows.filter((row) => row.issue_type === 'breakdown').length)}</strong>
          <small>visible maintenance records</small>
        </article>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker">Maintenance focus</p>
            <h2>Fix these first.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/action-board">
            Support queue
          </Link>
        </div>
        <div className="sm-ytf-compact-list">
          {topDowntimeRow ? (
            <a className="sm-ytf-list-row" href="#maintenance-form">
              <span>
                <strong>Highest downtime: {topDowntimeRow.asset_name}</strong>
                <small>{compactNumber(topDowntimeRow.downtime_minutes)} min / {ytfOwnerLabel(topDowntimeRow.owner, 'Team owner')} / {topDowntimeRow.next_action || 'Confirm next action.'}</small>
              </span>
              <em>Fix</em>
            </a>
          ) : null}
          {highRiskRows.length ? (
            highRiskRows.map((row) => {
              const plant = inferYtfPlantScope(row.plant_scope, row.asset_name, maintenanceSource(row))
              return (
                <a className="sm-ytf-list-row" href="#maintenance-form" key={`risk-${row.maintenance_id}`}>
                  <span>
                    <strong>{row.asset_name}</strong>
                    <small>{plant.label} / {statusText(row.priority)} / {row.next_action || 'Needs repair action.'}</small>
                  </span>
                  <em>{compactNumber(row.downtime_minutes)} min</em>
                </a>
              )
            })
          ) : (
            <article className="sm-ytf-list-row">
              <span>
                <strong>No high-risk maintenance rows</strong>
                <small>Use the form below when a machine, utility, or spare-part blocker appears.</small>
              </span>
              <em>Ready</em>
            </article>
          )}
        </div>
      </section>

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel" id="maintenance-form">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">New record</p>
              <h2>One maintenance note.</h2>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
              Plant scope
              <select className="sm-input" value={form.plant_scope} onChange={(event) => updateForm('plant_scope', event.target.value)}>
                {YTF_PLANT_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small className="text-xs font-bold leading-snug text-[var(--sm-muted)]">
                {selectedPlantScope?.detail ?? 'Choose the correct plant before saving.'}
              </small>
            </label>
            <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
              Machine or asset
              <input
                className="sm-input"
                value={form.asset_name}
                onChange={(event) => updateForm('asset_name', event.target.value)}
                placeholder="Example: Curing press 07"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
                Type
                <select className="sm-input" value={form.issue_type} onChange={(event) => updateForm('issue_type', event.target.value)}>
                  <option value="breakdown">Breakdown</option>
                  <option value="preventive">Preventive work</option>
                  <option value="utility">Utility</option>
                  <option value="spare-part">Spare part</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
                Priority
                <select className="sm-input" value={form.priority} onChange={(event) => updateForm('priority', event.target.value)}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
                Downtime minutes
                <input
                  className="sm-input"
                  inputMode="numeric"
                  value={form.downtime_minutes}
                  onChange={(event) => updateForm('downtime_minutes', event.target.value)}
                  placeholder="0"
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
              Owner lane
              <select className="sm-input" value={form.owner} onChange={(event) => updateForm('owner', event.target.value)}>
                <option value="Maintenance team">Maintenance team</option>
                <option value="Utility team">Utility team</option>
                <option value="Team owner later">Team owner later</option>
                <option value="QC link">QC link</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
              Next action
              <textarea
                className="sm-ytf-textarea"
                value={form.next_action}
                onChange={(event) => updateForm('next_action', event.target.value)}
                rows={4}
                placeholder="What is the next physical action and who must confirm it?"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
              Photo or Drive link
              <input
                className="sm-input"
                value={form.evidence_link}
                onChange={(event) => updateForm('evidence_link', event.target.value)}
                placeholder="Paste photo/file link if available"
              />
            </label>
            <button className="sm-button-primary" type="button" onClick={() => void saveRecord()} disabled={saving}>
              {saving ? 'Saving...' : 'Save record + action'}
            </button>
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Open maintenance</p>
              <h2>Fix or escalate.</h2>
            </div>
          </div>
          <div className="sm-ytf-compact-list">
            {openRows.slice(0, 4).map((row) => {
              const plant = inferYtfPlantScope(row.plant_scope, row.asset_name, maintenanceSource(row))
              return (
              <div className="sm-ytf-list-row" key={row.maintenance_id}>
                <span>
                  <strong>{row.asset_name}</strong>
                  <small>
                    {ytfOwnerLabel(row.owner, 'Team owner')} / {formatDate(row.logged_at)} / {row.next_action}
                  </small>
                  <small>
                    {maintenanceSource(row)} / {plant.label}
                  </small>
                </span>
                <em>{statusText(row.priority || row.status)}</em>
              </div>
              )
            })}
          </div>
        </article>
      </section>

      <details className="sm-ytf-panel sm-ytf-details">
        <summary>More maintenance options</summary>
        <section className="sm-ytf-action-grid" aria-label="Maintenance actions">
          <a className="sm-ytf-action-tile is-primary" href="#maintenance-form">
            <span>
              <strong>Log issue</strong>
              <small>Breakdown, PM miss, utility issue, or spare-part blocker.</small>
            </span>
            <span className="sm-ytf-action-arrow">Start</span>
          </a>
          <Link className="sm-ytf-action-tile" to="/app/daily-entry">
            <span>
              <strong>Daily entry</strong>
              <small>Use shared entry when the issue crosses departments.</small>
            </span>
            <span className="sm-ytf-action-arrow">Open</span>
          </Link>
          <Link className="sm-ytf-action-tile" to="/app/dqms">
            <span>
              <strong>Quality link</strong>
              <small>Connect repeat machine issues to CAPA work.</small>
            </span>
            <span className="sm-ytf-action-arrow">Open</span>
          </Link>
          <Link className="sm-ytf-action-tile" to="/app/inventory">
            <span>
              <strong>Parts watch</strong>
              <small>Check reorder risk that blocks repair.</small>
            </span>
            <span className="sm-ytf-action-arrow">Open</span>
          </Link>
        </section>
        <section className="sm-ytf-metric-strip">
          <article>
            <span>Records</span>
            <strong>{compactNumber(summary.maintenance_count ?? rows.length)}</strong>
          </article>
          <article>
            <span>Breakdowns</span>
            <strong>{compactNumber(summary.breakdown_count ?? rows.filter((row) => row.issue_type === 'breakdown').length)}</strong>
          </article>
          <article>
            <span>Open work</span>
            <strong>{compactNumber(openRows.length)}</strong>
          </article>
          <article>
            <span>Parts watch</span>
            <strong>{compactNumber(sparePartWatch.length)}</strong>
          </article>
        </section>
      </details>

      <details className="sm-ytf-panel sm-ytf-details">
        <summary>Parts, metrics, and source notes</summary>
        <div className="sm-ytf-split">
        <article>
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Spare parts</p>
              <h2>Likely blockers.</h2>
            </div>
          </div>
          <div className="sm-ytf-compact-list">
            {sparePartWatch.map((item) => (
              <div className="sm-ytf-list-row" key={item.inventory_id}>
                <span>
                  <strong>{item.item_name}</strong>
                  <small>
                    {item.warehouse} - available {item.available_qty} - reorder {item.reorder_point}
                  </small>
                </span>
                <em>{statusText(item.status)}</em>
              </div>
            ))}
            {!sparePartWatch.length && <p className="sm-ytf-empty">No reorder blocker is visible yet.</p>}
          </div>
        </article>

        <article>
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Reliability signals</p>
              <h2>Reliability context.</h2>
            </div>
          </div>
          <div className="sm-ytf-compact-list">
            {maintenanceMetrics.slice(0, 3).map((metric) => (
              <div className="sm-ytf-list-row" key={metric.metric_id}>
                <span>
                  <strong>{metric.metric_name}</strong>
                  <small>
                    {metric.period_label} / {ytfOwnerLabel(metric.owner, 'Data steward')}
                  </small>
                </span>
                <em>
                  {metric.metric_value}
                  {metric.unit}
                </em>
              </div>
            ))}
          </div>
        </article>
        </div>
      </details>
    </div>
  )
}
