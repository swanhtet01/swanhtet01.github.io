import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import {
  approveYtfKpiDefinitions,
  getCapabilityProfileForRole,
  getWorkspaceSession,
  getYtfKpiDefinitionsLatest,
  getYtfKpiCandidatePromotionLatest,
  getYtfSourceRecords,
  getYtfWorkbookExtractionLatest,
  promoteYtfKpiCandidates,
  rebuildYtfSourceRecords,
  runYtfWorkbookExtraction,
  sessionHasCapability,
  type YtfKpiDefinitionsResult,
  type YtfKpiCandidatePromotionResult,
  type YtfSourceRecordsResult,
  type YtfWorkbookExtractionResult,
  type WorkspaceCapability,
} from '../lib/workspaceApi'
import { buildYtfDataQualityPayload, type YtfDataQualityPayload, type YtfDataQualityQueue } from '../lib/ytfDataQualityModel'
import {
  getSeedYtfRootWarehouseDataset,
  loadYtfRootWarehouseDataset,
  syncYtfRootWarehouseDataset,
  type YtfRootLane,
  type YtfRootWarehouseDataset,
} from '../lib/ytfRootWarehouseApi'

function formatDate(value?: string | null) {
  if (!value) return 'Not synced'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function compact(value?: string | null, max = 110) {
  const trimmed = String(value || '').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 3).trim()}...` : trimmed
}

function laneSignal(lane: YtfRootLane) {
  return `${lane.liveItemCount} live / ${lane.workbookCount} books / ${lane.shortcutCount} shortcuts`
}

function queuePriority(queue: YtfDataQualityQueue) {
  if (queue.id === 'needs-owner') return 1
  if (queue.id === 'shortcut-debt') return 2
  if (queue.id === 'workbook-heavy') return 3
  if (queue.id === 'stale-empty') return 4
  return 5
}

function queueActionLabel(queue: YtfDataQualityQueue) {
  if (queue.id === 'workbook-heavy') return 'Extract values'
  if (queue.id === 'shortcut-debt') return 'Fix access'
  if (queue.id === 'needs-owner') return 'Assign owner'
  if (queue.id === 'stale-empty') return 'Confirm keep'
  return 'Review'
}

function topLanes(queue: YtfDataQualityQueue) {
  return queue.lanes.slice(0, 4)
}

function uniqueLanes(queues: YtfDataQualityQueue[]) {
  const seen = new Set<string>()
  const lanes: YtfRootLane[] = []
  for (const lane of queues.flatMap(topLanes)) {
    if (seen.has(lane.id)) continue
    seen.add(lane.id)
    lanes.push(lane)
  }
  return lanes.slice(0, 6)
}

type SessionState = Awaited<ReturnType<typeof getWorkspaceSession>>['session']

const DATA_REFRESH_CAPABILITIES: WorkspaceCapability[] = [
  'connector_admin.view',
  'knowledge_admin.view',
  'tenant_admin.view',
  'platform_admin.view',
]
const KPI_REVIEW_CAPABILITIES: WorkspaceCapability[] = [
  'operations.view',
  'dqms.view',
  'director.view',
  'tenant_admin.view',
  'platform_admin.view',
]
const KPI_APPROVAL_CAPABILITIES: WorkspaceCapability[] = [
  'dqms.view',
  'director.view',
  'tenant_admin.view',
  'platform_admin.view',
]

function hasAnyCapability(session: SessionState | null | undefined, capabilities: WorkspaceCapability[]) {
  return capabilities.some((capability) => sessionHasCapability(session, capability))
}

type WorkbookMetricCandidate = NonNullable<YtfWorkbookExtractionResult['metric_candidates']>[number]

function metricCandidateKey(candidate: WorkbookMetricCandidate) {
  return String(candidate.metric_key || candidate.metric_name || '').trim()
}

function bestMetricCandidateKeys(candidates: YtfWorkbookExtractionResult['metric_candidates'] | undefined, limit = 6) {
  return [...(candidates ?? [])]
    .sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0))
    .filter((candidate) => Number(candidate.score ?? 0) > 0)
    .map(metricCandidateKey)
    .filter(Boolean)
    .slice(0, limit)
}

export function YtfDataQualityPage() {
  const [dataset, setDataset] = useState<YtfRootWarehouseDataset>(() => getSeedYtfRootWarehouseDataset())
  const [session, setSession] = useState<SessionState | null>(null)
  const [sourceRecords, setSourceRecords] = useState<YtfSourceRecordsResult | null>(null)
  const [workbookExtraction, setWorkbookExtraction] = useState<YtfWorkbookExtractionResult | null>(null)
  const [kpiPromotion, setKpiPromotion] = useState<YtfKpiCandidatePromotionResult | null>(null)
  const [officialKpis, setOfficialKpis] = useState<YtfKpiDefinitionsResult | null>(null)
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadAll() {
    const [sessionPayload, warehousePayload, sourcePayload, workbookPayload, promotionPayload, officialPayload] = await Promise.all([
      getWorkspaceSession().catch(() => null),
      loadYtfRootWarehouseDataset(),
      getYtfSourceRecords({ limit: 80 }).catch(() => null),
      getYtfWorkbookExtractionLatest().catch(() => null),
      getYtfKpiCandidatePromotionLatest().catch(() => null),
      getYtfKpiDefinitionsLatest().catch(() => null),
    ])
    setSession(sessionPayload?.session ?? null)
    setDataset(warehousePayload)
    setSourceRecords(sourcePayload)
    setWorkbookExtraction(workbookPayload)
    setKpiPromotion(promotionPayload)
    setOfficialKpis(officialPayload)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await loadAll()
      } catch {
        if (!cancelled) setError('Could not load source quality right now.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const quality: YtfDataQualityPayload = useMemo(() => buildYtfDataQualityPayload(dataset), [dataset])
  const prioritizedQueues = useMemo(
    () => [...(quality?.queues ?? [])].sort((left, right) => queuePriority(left) - queuePriority(right)),
    [quality?.queues],
  )
  const metricCandidateRows = useMemo(
    () =>
      [...(workbookExtraction?.metric_candidates ?? [])]
        .sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0))
        .slice(0, 10),
    [workbookExtraction?.metric_candidates],
  )
  const selectedMetricSet = useMemo(() => new Set(selectedMetricKeys), [selectedMetricKeys])
  const sourceSummary = sourceRecords?.summary
  const kpiBuckets = sourceSummary?.by_kpi_readiness ?? {}
  const ragBuckets = sourceSummary?.by_rag_readiness ?? {}
  const kpiCandidateCount = (kpiBuckets.metric_candidate ?? 0) + (kpiBuckets.feature_candidate ?? 0)
  const ragCandidateCount = Object.entries(ragBuckets).reduce((total, [key, value]) => total + (key.includes('candidate') ? Number(value) || 0 : 0), 0)
  const promotionBoard = sourceRecords?.promotion_board
  const openPromotionActions = promotionBoard?.action_count ?? 0
  const workbookMetricCount = workbookExtraction?.summary?.metric_candidate_count ?? 0
  const kpiReviewTaskCount = kpiPromotion?.review_task_count ?? 0
  const officialKpiCount = officialKpis?.approved_count ?? officialKpis?.rows?.length ?? 0
  const roleLabel = getCapabilityProfileForRole(session?.role).label
  const canRefreshSourceData = hasAnyCapability(session, DATA_REFRESH_CAPABILITIES)
  const canCreateKpiReviewTasks = hasAnyCapability(session, KPI_REVIEW_CAPABILITIES)
  const canApproveKpis = hasAnyCapability(session, KPI_APPROVAL_CAPABILITIES)
  const canOpenDataQuality = canRefreshSourceData || sessionHasCapability(session, 'director.view')

  function toggleMetricKey(metricKey: string) {
    if (!metricKey) return
    setSelectedMetricKeys((current) => (current.includes(metricKey) ? current.filter((key) => key !== metricKey) : [...current, metricKey]))
  }

  function selectBestMetricCandidates() {
    setSelectedMetricKeys(bestMetricCandidateKeys(workbookExtraction?.metric_candidates, 6))
  }

  async function runWarehouseRefresh() {
    if (!canRefreshSourceData) {
      setError('Source refresh is limited to connector, knowledge, tenant, or platform admins.')
      return
    }
    setBusy('warehouse')
    setError('')
    setMessage('')
    try {
      const payload = await syncYtfRootWarehouseDataset()
      setDataset(payload)
      setMessage('Source warehouse refreshed.')
    } catch {
      setError('Source warehouse refresh failed.')
    } finally {
      setBusy('')
    }
  }

  async function runSourceRebuild() {
    if (!canRefreshSourceData) {
      setError('Data rebuild is limited to admin roles.')
      return
    }
    setBusy('source')
    setError('')
    setMessage('')
    try {
      await rebuildYtfSourceRecords()
      const next = await getYtfSourceRecords({ limit: 80 })
      setSourceRecords(next)
      setMessage(`Data records rebuilt with ${next.summary?.source_record_count ?? 0} records.`)
    } catch {
      setError('Data rebuild failed. Check the admin setup.')
    } finally {
      setBusy('')
    }
  }

  async function runWorkbookKpis() {
    if (!canCreateKpiReviewTasks) {
      setError('KPI extraction is limited to operations, quality, director, or admin roles.')
      return
    }
    setBusy('workbooks')
    setError('')
    setMessage('')
    try {
      const payload = await runYtfWorkbookExtraction(12)
      setWorkbookExtraction(payload)
      setSelectedMetricKeys(bestMetricCandidateKeys(payload.metric_candidates, 6))
      setMessage(`Workbook extraction found ${payload.summary?.metric_candidate_count ?? 0} metric candidates.`)
    } catch {
      setError('Workbook extraction failed. Check source download access.')
    } finally {
      setBusy('')
    }
  }

  async function runKpiReviewTasks() {
    if (!canCreateKpiReviewTasks) {
      setError('KPI review task creation is limited to operations, quality, director, or admin roles.')
      return
    }
    setBusy('kpi-review')
    setError('')
    setMessage('')
    try {
      const payload = await promoteYtfKpiCandidates(24)
      setKpiPromotion(payload)
      setMessage(`Created ${payload.review_task_count ?? 0} KPI review tasks for the action board.`)
    } catch {
      setError('Number check creation failed. Check the admin setup.')
    } finally {
      setBusy('')
    }
  }

  async function runOfficialKpiApproval() {
    if (!canApproveKpis) {
      setError('Publishing KPIs is limited to quality, director, tenant, or platform admin roles.')
      return
    }
    setBusy('official-kpis')
    setError('')
    setMessage('')
    try {
      const fallbackMetricKeys = bestMetricCandidateKeys(workbookExtraction?.metric_candidates, 6)
      const metricKeys = selectedMetricKeys.length ? selectedMetricKeys : fallbackMetricKeys
      const payload = await approveYtfKpiDefinitions(metricKeys.length || 12, metricKeys)
      setOfficialKpis(payload)
      setMessage(`Published ${payload.approved_count ?? 0} KPI definition${payload.approved_count === 1 ? '' : 's'}${metricKeys.length ? ' from selected values' : ''}.`)
    } catch {
      setError('KPI publishing failed. Check the admin setup.')
    } finally {
      setBusy('')
    }
  }

  if (!loading && session && !canOpenDataQuality) {
    return <Navigate replace to="/app/live-data?view=kpi" />
  }

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Data Quality</p>
          <h1>Make data usable.</h1>
          <p>Turn source changes into reviewed KPIs, actions, and ISO evidence. Raw folders stay behind the scenes.</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{loading ? 'Seeded view' : dataset.mode || 'seeded'}</span>
          <span>Synced {formatDate(dataset.lastSyncedAt)}</span>
          <span>{quality.summary.readinessScore}% ready</span>
          <span>{roleLabel}</span>
        </div>
      </section>

      <section className="sm-ytf-action-grid">
        <Link className="sm-ytf-action-tile is-primary" to="/app/action-board">
          <span>
            <strong>Review plant numbers</strong>
            <small>Keep only useful production, quality, stock, and supplier values.</small>
          </span>
          <span className="sm-ytf-action-arrow">{kpiReviewTaskCount || workbookMetricCount || 'Open'}</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/daily-entry">
          <span>
            <strong>Add today&apos;s number</strong>
            <small>Use one short entry when a value is missing.</small>
          </span>
          <span className="sm-ytf-action-arrow">Entry</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/documents">
          <span>
            <strong>Add evidence</strong>
            <small>Attach a photo, note, or controlled document reference.</small>
          </span>
          <span className="sm-ytf-action-arrow">Evidence</span>
        </Link>
      </section>

      {canRefreshSourceData ? (
        <details className="sm-ytf-panel sm-ytf-details">
          <summary>Admin data rebuild controls</summary>
          <section className="sm-ytf-action-grid sm-ytf-action-grid-five mt-4">
            <button className="sm-ytf-action-tile is-primary text-left" disabled={busy === 'warehouse'} onClick={runWarehouseRefresh} type="button">
              <span>
                <strong>Refresh sources</strong>
                <small>Re-scan lanes, shortcuts, workbooks, and freshness.</small>
              </span>
              <span className="sm-ytf-action-arrow">{busy === 'warehouse' ? 'Refreshing...' : 'Run'}</span>
            </button>
            <button className="sm-ytf-action-tile text-left" disabled={busy === 'source'} onClick={runSourceRebuild} type="button">
              <span>
                <strong>Build records</strong>
                <small>Create durable source-owner and promotion records.</small>
              </span>
              <span className="sm-ytf-action-arrow">{busy === 'source' ? 'Building...' : 'Run'}</span>
            </button>
            <button className="sm-ytf-action-tile text-left" disabled={busy === 'workbooks' || !canCreateKpiReviewTasks} onClick={runWorkbookKpis} type="button">
              <span>
                <strong>Extract plant numbers</strong>
                <small>Profile useful spreadsheets before dashboard metrics.</small>
              </span>
              <span className="sm-ytf-action-arrow">{!canCreateKpiReviewTasks ? 'Manager' : busy === 'workbooks' ? 'Extracting...' : 'Run'}</span>
            </button>
            <button className="sm-ytf-action-tile text-left" disabled={busy === 'kpi-review' || !canCreateKpiReviewTasks} onClick={runKpiReviewTasks} type="button">
              <span>
                <strong>Create number checks</strong>
                <small>Send uncertain values to the work board.</small>
              </span>
              <span className="sm-ytf-action-arrow">{!canCreateKpiReviewTasks ? 'Manager' : busy === 'kpi-review' ? 'Creating...' : 'Run'}</span>
            </button>
            <button className="sm-ytf-action-tile text-left" disabled={busy === 'official-kpis' || !canApproveKpis} onClick={runOfficialKpiApproval} type="button">
              <span>
                <strong>Publish KPIs</strong>
                <small>Make reviewed definitions visible in the dashboard.</small>
              </span>
              <span className="sm-ytf-action-arrow">{!canApproveKpis ? 'Admin' : busy === 'official-kpis' ? 'Publishing...' : 'Run'}</span>
            </button>
          </section>
        </details>
      ) : null}

      {error ? <p className="sm-ytf-alert">{error}</p> : null}
      {message ? <p className="sm-ytf-alert">{message}</p> : null}

      <section className="sm-ytf-metric-strip is-five">
        <article>
          <span>Readiness</span>
          <strong>{quality.summary.readinessScore}%</strong>
          <small>{quality.summary.readyLaneCount} ready lanes.</small>
        </article>
        <article>
          <span>Records</span>
          <strong>{sourceSummary?.source_record_count ?? 0}</strong>
          <small>{kpiCandidateCount} candidate values.</small>
        </article>
        <article>
          <span>Workbook values</span>
          <strong>{workbookMetricCount}</strong>
          <small>{workbookExtraction?.summary?.profiled_workbook_count ?? 0} workbooks profiled.</small>
        </article>
        <article>
          <span>Number checks</span>
          <strong>{kpiReviewTaskCount}</strong>
          <small>{formatDate(kpiPromotion?.promoted_at)}</small>
        </article>
        <article>
          <span>Published KPIs</span>
          <strong>{officialKpiCount}</strong>
          <small>{formatDate(officialKpis?.approved_at || officialKpis?.summary?.latest_at)}</small>
        </article>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Workbook values</p>
            <h2>Select dashboard numbers.</h2>
          </div>
          <div className="sm-ytf-chip-line">
            <span>{workbookExtraction?.summary?.recommended_candidate_count ?? 0} recommended</span>
            <span>{selectedMetricKeys.length} selected</span>
            <span>{officialKpiCount} official</span>
          </div>
        </div>
        <div className="sm-ytf-action-bar">
          <button className="sm-button-secondary" disabled={!metricCandidateRows.length} onClick={selectBestMetricCandidates} type="button">
            Select best
          </button>
          <button className="sm-button-secondary" disabled={busy === 'kpi-review' || !canCreateKpiReviewTasks} onClick={runKpiReviewTasks} type="button">
            {busy === 'kpi-review' ? 'Creating...' : 'Send to board'}
          </button>
          <button className="sm-button-primary" disabled={busy === 'official-kpis' || !canApproveKpis} onClick={runOfficialKpiApproval} type="button">
            {busy === 'official-kpis' ? 'Publishing...' : 'Publish selected'}
          </button>
        </div>
        <div className="sm-ytf-action-list">
          {metricCandidateRows.map((candidate) => {
            const metricKey = metricCandidateKey(candidate)
            const selected = selectedMetricSet.has(metricKey)
            return (
              <article className={`sm-ytf-action-row ${selected ? 'is-selected' : ''}`} key={metricKey || candidate.metric_name}>
                <div className="sm-ytf-action-main">
                  <div className="sm-ytf-row-title">
                    <strong>{compact(candidate.metric_name || metricKey || 'Metric candidate', 72)}</strong>
                    <span>{candidate.metric_group ?? 'metric'}</span>
                  </div>
                  <p>{compact(candidate.source || `${candidate.workbook ?? 'Workbook'}${candidate.sheet_name ? ` / ${candidate.sheet_name}` : ''}`, 118)}</p>
                </div>
                <div className="sm-ytf-action-meta">
                  <span>Score {candidate.score ?? 0}</span>
                  <button className="sm-button-secondary" disabled={!metricKey} onClick={() => toggleMetricKey(metricKey)} type="button">
                    {selected ? 'Selected' : 'Select'}
                  </button>
                </div>
              </article>
            )
          })}
          {!metricCandidateRows.length ? <p className="sm-ytf-empty">Run extraction to show workbook metric candidates here.</p> : null}
        </div>
      </section>

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Today&apos;s cleanup</p>
              <h2>Act on the worst queues.</h2>
            </div>
            <span className="sm-status-pill">{openPromotionActions} actions</span>
          </div>
          <div className="sm-ytf-action-list">
            {prioritizedQueues.slice(0, 4).map((queue) => (
              <article className="sm-ytf-action-row" key={queue.id}>
                <div className="sm-ytf-action-main">
                  <div className="sm-ytf-row-title">
                    <strong>{queue.title}</strong>
                    <span>{queue.lanes.length}</span>
                  </div>
                  <p>{compact(queue.action, 132)}</p>
                </div>
                <div className="sm-ytf-action-meta">
                  <span>{queueActionLabel(queue)}</span>
                  <Link to={queue.route}>Open</Link>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Promotion board</p>
              <h2>Candidate records.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/action-board">
              Board
            </Link>
          </div>
          <div className="sm-ytf-chip-line">
            <span>{ragCandidateCount} AI context</span>
            <span>{kpiCandidateCount} candidate values</span>
            <span>{openPromotionActions} owner actions</span>
            <span>{kpiReviewTaskCount} KPI reviews</span>
            <span>{officialKpiCount} official KPIs</span>
          </div>
          <div className="sm-ytf-action-list">
            {(promotionBoard?.actions ?? []).slice(0, 4).map((action) => (
              <article className="sm-ytf-action-row" key={action.action_id ?? action.title}>
                <div className="sm-ytf-action-main">
                  <div className="sm-ytf-row-title">
                    <strong>{compact(action.title, 80)}</strong>
                    <span>{action.action_type?.replaceAll('_', ' ') ?? 'review'}</span>
                  </div>
                  <p>{compact(action.next_step, 120)}</p>
                </div>
                <div className="sm-ytf-action-meta">
                  <span>{action.owner_hint || 'Owner'}</span>
                    <span>{action.department || 'Review'}</span>
                </div>
              </article>
            ))}
            {(promotionBoard?.actions ?? []).length === 0 ? <p className="sm-ytf-empty">Run source DB rebuild to generate promotion actions.</p> : null}
          </div>
          <div className="sm-ytf-action-list mt-3">
            {(officialKpis?.rows ?? []).slice(0, 4).map((metric) => (
              <article className="sm-ytf-action-row" key={metric.metric_id ?? metric.metric_name}>
                <div className="sm-ytf-action-main">
                  <div className="sm-ytf-row-title">
                    <strong>{compact(metric.metric_name, 78)}</strong>
                    <span>{metric.metric_group ?? 'metric'}</span>
                  </div>
                  <p>{compact(metric.notes || metric.scope || 'Official ERP metric definition', 112)}</p>
                </div>
                <div className="sm-ytf-action-meta">
                  <span>{metric.owner || 'Owner'}</span>
                  <span>{metric.status || 'official'}</span>
                </div>
              </article>
            ))}
            {(kpiPromotion?.candidates ?? []).slice(0, 3).map((candidate) => (
              <article className="sm-ytf-action-row" key={candidate.metric_key ?? candidate.metric_name}>
                <div className="sm-ytf-action-main">
                  <div className="sm-ytf-row-title">
                    <strong>{compact(candidate.metric_name, 78)}</strong>
                    <span>{candidate.metric_group ?? 'metric'}</span>
                  </div>
                  <p>{compact(`${candidate.workbook ?? 'Workbook'}${candidate.sheet_name ? ` / ${candidate.sheet_name}` : ''}`, 110)}</p>
                </div>
                <div className="sm-ytf-action-meta">
                  <span>{candidate.owner || 'Data owner'}</span>
                  <Link to="/app/action-board">Review</Link>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">File lanes</p>
            <h2>Open only what needs a decision.</h2>
          </div>
          <span className="sm-status-pill">{quality.summary.laneCount} lanes</span>
        </div>
        <div className="sm-ytf-card-grid">
          {uniqueLanes(prioritizedQueues).map((lane) => (
            <Link className="sm-ytf-mini-card" key={lane.id} to={lane.firstDeskRoute || '/app/action-board'}>
              <span>{lane.domain || 'Source lane'}</span>
              <strong>{lane.title}</strong>
              <small>{laneSignal(lane)}</small>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
