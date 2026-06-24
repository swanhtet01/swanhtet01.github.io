import { useEffect, useMemo, useState } from 'react'

import { YtfRoleScorecards } from '../components/YtfRoleScorecards'
import {
  YANGON_TYRE_CAPA_ROWS_SEED,
  YANGON_TYRE_DQMS_SUMMARY_SEED,
  YANGON_TYRE_QUALITY_INCIDENTS_SEED,
  YANGON_TYRE_QUALITY_METRIC_ROWS_SEED,
} from '../lib/yangonTyrePlantControl'
import { OPERATING_RECORD_LOOP, operatingRecordFailureMessage, operatingRecordSavedMessage, type OperatingRecordSavePayload } from '../lib/operatingRecordStatus'
import { loadCachedWorkspaceSession, sessionHasCapability, workspaceFetch, type WorkspaceCapability } from '../lib/workspaceApi'
import { ytfOwnerLabel } from '../lib/ytfUiFormat'

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

type SummaryPayload = {
  quality?: {
    incident_count?: number
    inspection_count?: number
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
  create_action: boolean
}

const incidentDefaults: IncidentForm = {
  title: '',
  summary: '',
  supplier: 'Internal process',
  severity: 'medium',
  status: 'open',
  owner: 'QC team',
  reported_at: '',
  target_close_date: '',
  evidence_link: '',
}

const capaDefaults: CapaForm = {
  incident_id: '',
  action_title: '',
  verification_criteria: '',
  target_date: '',
  owner: 'QC team',
  status: 'open',
  create_action: true,
}

const qualityOwnerOptions = ['QC team', 'Production team', 'Maintenance team', 'Section owner']
const protectedQualityRoles = new Set(['admin', 'tenant_admin', 'platform_admin', 'owner', 'ceo', 'director', 'plant_manager'])
const protectedQualityCapabilities: WorkspaceCapability[] = ['tenant_admin.view', 'platform_admin.view', 'director.view']

function canLoadProtectedQualityRecords() {
  const payload = loadCachedWorkspaceSession()
  const session = payload?.authenticated ? payload.session : null
  const role = String(session?.role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  return Boolean(session && (protectedQualityRoles.has(role) || protectedQualityCapabilities.some((capability) => sessionHasCapability(session, capability))))
}

function getSeedSummary(): SummaryPayload {
  return {
    quality: {
      incident_count: YANGON_TYRE_DQMS_SUMMARY_SEED.quality.incident_count,
      capa_count: YANGON_TYRE_DQMS_SUMMARY_SEED.quality.capa_count,
      by_status: { ...YANGON_TYRE_DQMS_SUMMARY_SEED.quality.by_status },
      top_suppliers: YANGON_TYRE_DQMS_SUMMARY_SEED.quality.top_suppliers.map((supplier) => ({ ...supplier })),
    },
  }
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

export function DQMSDeskPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<SummaryPayload>(() => getSeedSummary())
  const [incidents, setIncidents] = useState<QualityIncidentRow[]>(YANGON_TYRE_QUALITY_INCIDENTS_SEED)
  const [capas, setCapas] = useState<CapaRow[]>(YANGON_TYRE_CAPA_ROWS_SEED)
  const [metrics, setMetrics] = useState<MetricRow[]>(YANGON_TYRE_QUALITY_METRIC_ROWS_SEED)
  const [incidentForm, setIncidentForm] = useState<IncidentForm>(incidentDefaults)
  const [capaForm, setCapaForm] = useState<CapaForm>(capaDefaults)
  const [draft, setDraft] = useState('')

  async function loadDesk() {
    const [summaryPayload, incidentPayload, capaPayload, metricPayload] = await Promise.allSettled([
      workspaceFetch<SummaryPayload>('/api/summary'),
      workspaceFetch<{ rows?: QualityIncidentRow[] }>('/api/quality/incidents?limit=20'),
      workspaceFetch<{ rows?: CapaRow[] }>('/api/quality/capa?limit=20'),
      workspaceFetch<{ rows?: MetricRow[] }>('/api/metrics/records?limit=20'),
    ])

    if (summaryPayload.status === 'fulfilled') setSummary(summaryPayload.value)
    if (incidentPayload.status === 'fulfilled') {
      setIncidents(incidentPayload.value.rows?.length ? incidentPayload.value.rows : YANGON_TYRE_QUALITY_INCIDENTS_SEED)
    }
    if (capaPayload.status === 'fulfilled') setCapas(capaPayload.value.rows?.length ? capaPayload.value.rows : YANGON_TYRE_CAPA_ROWS_SEED)
    if (metricPayload.status === 'fulfilled') setMetrics(metricPayload.value.rows?.length ? metricPayload.value.rows : YANGON_TYRE_QUALITY_METRIC_ROWS_SEED)
  }

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        if (!canLoadProtectedQualityRecords()) {
          return
        }
        await loadDesk()
      } catch {
        if (!cancelled) setError('Using seed quality records because live data did not load.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void start()
    return () => {
      cancelled = true
    }
  }, [])

  const quality = summary.quality ?? {}
  const openIncidents = incidents.filter((incident) => incident.status !== 'closed')
  const qualityMetrics = useMemo(
    () => metrics.filter((metric) => `${metric.metric_group} ${metric.metric_name}`.toLowerCase().includes('quality')),
    [metrics],
  )

  function updateIncident(key: keyof IncidentForm, value: string) {
    setIncidentForm((current) => ({ ...current, [key]: value }))
  }

  function updateCapa(key: keyof CapaForm, value: string) {
    setCapaForm((current) => ({ ...current, [key]: value }))
  }

  function draftCapa() {
    const title = incidentForm.title.trim() || incidents[0]?.title || 'Quality issue'
    const facts = incidentForm.summary.trim() || incidents[0]?.summary || 'Facts still need manager confirmation.'
    setDraft(
      [
        `Issue: ${title}`,
        `5W1H facts: ${facts}`,
        'Containment: hold affected stock or process until QC confirms risk.',
        'Likely cause branch: material, machine, method, people, measurement, or environment.',
        'CAPA candidate: assign owner, due date, verification criteria, and photo/source proof before closure.',
      ].join('\n'),
    )
  }

  async function saveIncident() {
    if (!incidentForm.title.trim() || !incidentForm.summary.trim()) {
      setError('Add the issue title and facts before saving.')
      return
    }
    setSaving('incident')
    setMessage('')
    setError('')
    const nextRecord: QualityIncidentRow = {
      incident_id: `inc-local-${Date.now()}`,
      ...incidentForm,
      source_type: 'manual_entry',
      reported_at: incidentForm.reported_at || new Date().toISOString(),
      target_close_date: incidentForm.target_close_date || '',
    }
    try {
      const payload = await workspaceFetch<OperatingRecordSavePayload>('/api/quality/incidents', {
        method: 'POST',
        body: JSON.stringify(nextRecord),
      })
      await loadDesk()
      setMessage(operatingRecordSavedMessage(payload, 'Quality incident saved.'))
    } catch {
      setIncidents((current) => [nextRecord, ...current])
      setError(operatingRecordFailureMessage('Quality incident'))
    } finally {
      setIncidentForm(incidentDefaults)
      setSaving('')
    }
  }

  async function saveCapa() {
    if (!capaForm.action_title.trim() || !capaForm.verification_criteria.trim()) {
      setError('Add CAPA action and verification criteria before saving.')
      return
    }
    setSaving('capa')
    setMessage('')
    setError('')
    const nextRecord: CapaRow = {
      capa_id: `capa-local-${Date.now()}`,
      ...capaForm,
      incident_id: capaForm.incident_id || incidents[0]?.incident_id || 'manual',
      target_date: capaForm.target_date || '',
    }
    try {
      const payload = await workspaceFetch<OperatingRecordSavePayload>('/api/quality/capa', {
        method: 'POST',
        body: JSON.stringify(nextRecord),
      })
      await loadDesk()
      setMessage(operatingRecordSavedMessage(payload, 'CAPA saved.'))
    } catch {
      setCapas((current) => [nextRecord, ...current])
      setError(operatingRecordFailureMessage('CAPA'))
    } finally {
      setCapaForm(capaDefaults)
      setSaving('')
    }
  }

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row">
        <div>
          <p className="sm-kicker">Quality</p>
          <h1>Contain, assign, close.</h1>
          <p>
            A simple DQMS lane for defects, holds, CAPA, and release risk. ISO logic stays behind the form: evidence,
            root cause, owner, due date, and verification.
          </p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{loading ? 'Loading' : `${openIncidents.length} open`}</span>
          <span>{compactNumber(quality.capa_count ?? capas.length)} CAPA</span>
        </div>
      </section>

      <YtfRoleScorecards
        role="quality"
        title="Quality scorecard."
        subtitle="Evidence, CAPA follow-up, quality metrics, and source proof."
      />

      {(message || error) && <p className="sm-ytf-alert">{message || error}</p>}

      <section className="sm-ytf-metric-strip">
        {OPERATING_RECORD_LOOP.map((step) => (
          <article key={step.label}>
            <span>{step.label}</span>
            <strong>{step.label === 'Capture' ? 'DQMS' : step.label === 'Route' ? 'Action Board' : 'QC review'}</strong>
            <small>{step.detail}</small>
          </article>
        ))}
      </section>

      <section className="sm-ytf-metric-strip">
        <article>
          <span>Incidents</span>
          <strong>{compactNumber(quality.incident_count ?? incidents.length)}</strong>
        </article>
        <article>
          <span>Open</span>
          <strong>{compactNumber(openIncidents.length)}</strong>
        </article>
        <article>
          <span>CAPA</span>
          <strong>{compactNumber(quality.capa_count ?? capas.length)}</strong>
        </article>
        <article>
          <span>Quality KPIs</span>
          <strong>{compactNumber(qualityMetrics.length)}</strong>
        </article>
      </section>

      <details className="sm-ytf-panel">
        <summary className="cursor-pointer text-lg font-bold text-[var(--sm-ink)]">Open incidents and CAPA list</summary>
      <section className="mt-4 sm-ytf-split">
        <article className="sm-ytf-panel" id="quality-incident">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Incident</p>
              <h2>Record facts once.</h2>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
              Issue title
              <input
                className="sm-input"
                value={incidentForm.title}
                onChange={(event) => updateIncident('title', event.target.value)}
                placeholder="Example: Curing defect found on release check"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
                Severity
                <select className="sm-input" value={incidentForm.severity} onChange={(event) => updateIncident('severity', event.target.value)}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
                Owner
                <select className="sm-input" value={incidentForm.owner} onChange={(event) => updateIncident('owner', event.target.value)}>
                  {qualityOwnerOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
                Target close
                <input
                  className="sm-input"
                  type="date"
                  value={incidentForm.target_close_date}
                  onChange={(event) => updateIncident('target_close_date', event.target.value)}
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
              Facts and evidence
              <textarea
                className="sm-ytf-textarea"
                value={incidentForm.summary}
                onChange={(event) => updateIncident('summary', event.target.value)}
                rows={4}
                placeholder="What happened, where, when, how much is affected, and what proof exists?"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
              Photo or Drive link
              <input
                className="sm-input"
                value={incidentForm.evidence_link}
                onChange={(event) => updateIncident('evidence_link', event.target.value)}
                placeholder="Paste evidence link for now"
              />
            </label>
            <button className="sm-button-primary" type="button" onClick={() => void saveIncident()} disabled={saving === 'incident'}>
              {saving === 'incident' ? 'Saving...' : 'Save incident + action'}
            </button>
            <button className="sm-button-secondary" type="button" onClick={draftCapa}>
              Draft 5W1H candidate
            </button>
          </div>
        </article>

        <details className="sm-ytf-panel" id="quality-capa">
          <summary className="cursor-pointer text-lg font-bold text-[var(--sm-ink)]">Add CAPA countermeasure</summary>
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">CAPA</p>
              <h2>Assign the countermeasure.</h2>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
              Related incident
              <select className="sm-input" value={capaForm.incident_id} onChange={(event) => updateCapa('incident_id', event.target.value)}>
                <option value="">Pick incident</option>
                {incidents.map((incident) => (
                  <option key={incident.incident_id} value={incident.incident_id}>
                    {incident.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
              CAPA action
              <input
                className="sm-input"
                value={capaForm.action_title}
                onChange={(event) => updateCapa('action_title', event.target.value)}
                placeholder="What action prevents recurrence?"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
              Verification
              <textarea
                className="sm-ytf-textarea"
                value={capaForm.verification_criteria}
                onChange={(event) => updateCapa('verification_criteria', event.target.value)}
                rows={4}
                placeholder="How will QC prove this worked?"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
                Owner
                <select className="sm-input" value={capaForm.owner} onChange={(event) => updateCapa('owner', event.target.value)}>
                  {qualityOwnerOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold text-[var(--sm-ink)]">
                Target date
                <input
                  className="sm-input"
                  type="date"
                  value={capaForm.target_date}
                  onChange={(event) => updateCapa('target_date', event.target.value)}
                />
              </label>
            </div>
            <button className="sm-button-primary" type="button" onClick={() => void saveCapa()} disabled={saving === 'capa'}>
              {saving === 'capa' ? 'Saving...' : 'Save CAPA + action'}
            </button>
          </div>
        </details>
      </section>

      {draft && (
        <section className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Candidate draft</p>
              <h2>Manager must confirm.</h2>
            </div>
          </div>
          <pre className="sm-ytf-alert whitespace-pre-wrap">{draft}</pre>
        </section>
      )}

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Open incidents</p>
              <h2>Contain and close.</h2>
            </div>
          </div>
          <div className="sm-ytf-compact-list">
            {incidents.slice(0, 7).map((incident) => (
              <div className="sm-ytf-list-row" key={incident.incident_id}>
                <span>
                  <strong>{incident.title}</strong>
                  <small>
                    {ytfOwnerLabel(incident.owner)} - {formatDate(incident.reported_at)} - {incident.summary}
                  </small>
                </span>
                <em>{statusText(incident.severity || incident.status)}</em>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">CAPA list</p>
              <h2>Verify before closure.</h2>
            </div>
          </div>
          <div className="sm-ytf-compact-list">
            {capas.slice(0, 7).map((capa) => (
              <div className="sm-ytf-list-row" key={capa.capa_id}>
                <span>
                  <strong>{capa.action_title}</strong>
                  <small>
                    {ytfOwnerLabel(capa.owner)} - due {capa.target_date || 'not set'} - {capa.verification_criteria}
                  </small>
                </span>
                <em>{statusText(capa.status)}</em>
              </div>
            ))}
          </div>
        </article>
      </section>
      </details>

      <details className="sm-ytf-panel">
        <summary className="cursor-pointer text-lg font-bold text-[var(--sm-ink)]">Invisible ISO rules</summary>
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker">Invisible ISO</p>
            <h2>Only four rules for managers.</h2>
          </div>
        </div>
        <div className="sm-ytf-action-grid">
          <article className="sm-ytf-action-tile">
            <strong>Contain</strong>
            <small>Hold, sort, release, or escalate affected stock.</small>
          </article>
          <article className="sm-ytf-action-tile">
            <strong>Find cause</strong>
            <small>Use 5W1H and fishbone only after facts are captured.</small>
          </article>
          <article className="sm-ytf-action-tile">
            <strong>Assign CAPA</strong>
            <small>One owner, due date, and clear countermeasure.</small>
          </article>
          <article className="sm-ytf-action-tile">
            <strong>Verify</strong>
            <small>Close only with evidence that the fix worked.</small>
          </article>
        </div>
      </details>
    </div>
  )
}
