import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  getMetricRecords,
  getWorkspaceSession,
  getYtfDailyCloseSummary,
  getYtfKpiDefinitionsLatest,
  getYtfManagerFiveWOneHReport,
  getYtfOperatingMetrics,
  getYtfPipelineStats,
  getYtfTwinSummary,
  getYtfWcmIncidents,
  listWorkspaceTasks,
  loadCachedWorkspaceSession,
  updateWorkspaceTask,
  type EnterpriseMetricRecord,
  type MetricRecordsResult,
  type WorkspaceTaskRow,
  type YtfDailyCloseSummaryResult,
  type YtfKpiDefinitionsResult,
  type YtfManagerFiveWOneHReportResult,
  type YtfOperatingMetricsResult,
  type YtfPipelineStatsResult,
  type YtfTwinSummaryResult,
  type YtfWcmIncidentRow,
} from '../lib/workspaceApi'
import { isYtfFactoryFacingTask, isYtfInternalOrBuildTask, summarizeYtfTaskNotes, ytfOwnerLabel } from '../lib/ytfUiFormat'
import {
  selectTopYtfOperatingRows,
  ytfOperatingMetricContext,
  ytfOperatingMetricSource,
  ytfOperatingMetricTitle,
  ytfOperatingMetricValue,
} from '../lib/ytfMetricRows'
import {
  ytfCompactNumber,
  ytfProcurementMetricCard,
  ytfProductionMetricCard,
  ytfQualityMetricCard,
  ytfRawMaterialMetricCard,
  ytfMetricIsCurrentOperational,
  ytfMetricMatchesPlantScope,
  normalizeYtfPlantScope,
  ytfStockMetricCard,
  type YtfMetricDisplayCard,
  type YtfPlantScope,
  type YtfSizeMetricLike,
} from '../lib/ytfMetricContext'

type YtfPendingProductionCloseRow = NonNullable<
  NonNullable<NonNullable<YtfOperatingMetricsResult['story']>['size_breakdowns']>['pending_production_close']
>[number] & YtfSizeMetricLike

function formatDate(value?: string | null): string {
  if (!value) return 'Not synced yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function priorityWeight(priority?: string | null): number {
  const text = String(priority ?? '').toLowerCase()
  if (text.includes('critical')) return 4
  if (text.includes('high')) return 3
  if (text.includes('medium')) return 2
  return 1
}

function isOpenTask(task: WorkspaceTaskRow): boolean {
  return !['done', 'closed', 'cancelled'].includes(String(task.status ?? '').toLowerCase())
}

function isFactoryVisibleTask(task: WorkspaceTaskRow): boolean {
  const haystack = `${task.title} ${task.template} ${task.notes} ${task.owner}`.toLowerCase().replace(/_/g, ' ')
  if (
    isYtfInternalOrBuildTask(task) ||
    /\b(extract kpi|kpi candidate|changed data|changed source|source change|source record|structured source|workbook|file agent|agent runtime|governance update|setup gap|oauth|database|postgres|cron|sync plan|build knowledge|full refresh)\b/i.test(
      haystack,
    )
  ) {
    return false
  }
  return isYtfFactoryFacingTask(task)
}

function cleanTaskTitle(task: WorkspaceTaskRow): string {
  const title = task.title?.trim()
  if (!title) return 'Untitled action'
  return title
    .replace(/^review\s+/i, '')
    .replace(/^resolve\s+/i, '')
    .replace(/\s+shortcut evidence$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanTaskSummary(task: WorkspaceTaskRow): string {
  const summary = summarizeYtfTaskNotes(task.notes).summary.replace(/\s+/g, ' ').trim()
  if (!summary) return 'No daily note yet. Add one clear next action.'
  return summary.length > 112 ? `${summary.slice(0, 112).trim()}...` : summary
}

function valueText(value?: number | null, suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Not entered'
  if (Number.isInteger(value)) return `${value}${suffix}`
  return `${value.toFixed(1)}${suffix}`
}

function plantScopeText(summary?: YtfDailyCloseSummaryResult | null): string {
  const plant = summary?.inputs?.find((input) => input.latest?.plant)?.latest?.plant
  if (!plant) return 'Plant A'
  if (plant === 'plant_a') return 'Plant A'
  if (plant === 'plant_b') return 'Plant B'
  return plant
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function scopeCurrentRows<T extends YtfSizeMetricLike>(
  rows: T[],
  plantScope: YtfPlantScope,
  options: { minYear?: number; allowLowConfidence?: boolean; allowArchiveMarker?: boolean } = {},
): T[] {
  return rows.filter((row) => ytfMetricIsCurrentOperational(row, options) && ytfMetricMatchesPlantScope(row, plantScope))
}

function ytfPendingProductionMetricCard(row?: YtfPendingProductionCloseRow): YtfMetricDisplayCard | null {
  if (!row) return null
  const qty = Number(row.pending_qty || 0)
  if (!Number.isFinite(qty) || qty <= 0) return null
  const asOf = String(row.source?.date_context || row.updated_at || '').trim()
  return {
    label: 'Confirm production',
    value: `${ytfCompactNumber(qty)} pcs`,
    detail: [row.plant || 'Plant', asOf, `${row.size || 'size'} close needs manager confirm`].filter(Boolean).join(' / '),
    source: row.plant || 'Plant',
    route: '/app/live-data?view=kpi&lane=production',
  }
}

function buildPlantFocusCards(metrics: YtfOperatingMetricsResult | null, plantScope: YtfPlantScope = 'plant-a'): YtfMetricDisplayCard[] {
  const breakdowns = metrics?.story?.size_breakdowns
  const productionRow = scopeCurrentRows(breakdowns?.production_by_size ?? [], plantScope, { minYear: 2025 })[0]
  const pendingProductionRow = scopeCurrentRows((breakdowns?.pending_production_close ?? []) as YtfPendingProductionCloseRow[], plantScope, {
    minYear: 2025,
    allowLowConfidence: true,
  })[0]
  const qualityRow = scopeCurrentRows(breakdowns?.quality_claims_by_size ?? [], plantScope, { minYear: 2024 })[0]
  const stockRow = scopeCurrentRows(breakdowns?.stock_by_size ?? [], plantScope, { minYear: 2024 })[0]
  const procurementRow = scopeCurrentRows(breakdowns?.procurement_by_size ?? [], plantScope, { minYear: 2024 })[0]
  const materialRows = [
    ...((breakdowns?.procurement_material_orders ?? []) as YtfSizeMetricLike[]),
    ...((breakdowns?.raw_material_orders ?? []) as YtfSizeMetricLike[]),
  ]
  const materialRow = scopeCurrentRows(materialRows, plantScope, { minYear: 2024 })[0]
  return [
    ytfProductionMetricCard(productionRow) || ytfPendingProductionMetricCard(pendingProductionRow),
    ytfQualityMetricCard(qualityRow),
    ytfStockMetricCard(stockRow),
    ytfProcurementMetricCard(procurementRow) || ytfRawMaterialMetricCard(materialRow),
  ].filter(Boolean).map((card) => ({ ...(card as YtfMetricDisplayCard), route: `/app/live-data?view=kpi&plant=${plantScope}` })) as YtfMetricDisplayCard[]
}

function teamLabelFromTask(task: WorkspaceTaskRow): string {
  const text = `${task.owner} ${task.title} ${task.notes} ${task.template}`.toLowerCase()
  if (/(qc|quality|claim|defect|capa|inspection)/.test(text)) return 'QC team'
  if (/(maintenance|machine|downtime|repair|utility|spare)/.test(text)) return 'Maintenance team'
  if (/(sales|inventory|stock|showroom|dealer|dispatch)/.test(text)) return 'Sales / inventory team'
  if (/(admin|planning|hr|ot|attendance)/.test(text)) return 'Admin / planning team'
  if (/(mixing|curing|building|production|shift|output|wip)/.test(text)) return 'Production team'
  return 'Plant team'
}

function buildTeamFocusRows(openTasks: WorkspaceTaskRow[]) {
  const groups = new Map<string, { team: string; count: number; high: number; sample: WorkspaceTaskRow | null }>()
  openTasks.forEach((task) => {
    const team = teamLabelFromTask(task)
    const current = groups.get(team) ?? { team, count: 0, high: 0, sample: null }
    current.count += 1
    if (priorityWeight(task.priority) >= 3) current.high += 1
    current.sample = current.sample ?? task
    groups.set(team, current)
  })
  return [...groups.values()].sort((left, right) => right.high - left.high || right.count - left.count).slice(0, 4)
}

export function PlantManagerPage() {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [sessionName, setSessionName] = useState('Plant Manager')
  const [sessionRole, setSessionRole] = useState(loadCachedWorkspaceSession()?.session?.role ?? 'plant_manager')
  const [tasks, setTasks] = useState<WorkspaceTaskRow[]>([])
  const [pipelineStats, setPipelineStats] = useState<YtfPipelineStatsResult | null>(null)
  const [kpiDefinitions, setKpiDefinitions] = useState<YtfKpiDefinitionsResult | null>(null)
  const [recentKpiValues, setRecentKpiValues] = useState<EnterpriseMetricRecord[]>([])
  const [operatingMetrics, setOperatingMetrics] = useState<YtfOperatingMetricsResult | null>(null)
  const [dailyCloseSummary, setDailyCloseSummary] = useState<YtfDailyCloseSummaryResult | null>(null)
  const [managerReport, setManagerReport] = useState<YtfManagerFiveWOneHReportResult | null>(null)
  const [twinSummary, setTwinSummary] = useState<YtfTwinSummaryResult | null>(null)
  const [wcmIncidents, setWcmIncidents] = useState<YtfWcmIncidentRow[]>([])
  const [closingTaskId, setClosingTaskId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const cached = loadCachedWorkspaceSession()
      setSessionName(cached?.session?.display_name ?? 'Plant Manager')

      const [session, taskList, stats, definitions, values, metrics, dailyClose, report, twin, incidents] = await Promise.all([
        getWorkspaceSession().catch(() => null),
        listWorkspaceTasks(undefined, 40),
        getYtfPipelineStats().catch(() => null),
        getYtfKpiDefinitionsLatest().catch(() => null),
        getMetricRecords({ status: 'reported', limit: 12 }).catch(() => ({ rows: [] }) as MetricRecordsResult),
        getYtfOperatingMetrics().catch(() => null),
        getYtfDailyCloseSummary().catch(() => null),
        getYtfManagerFiveWOneHReport(8).catch(() => null),
        getYtfTwinSummary().catch(() => null),
        getYtfWcmIncidents({ limit: 8 }).catch(() => ({ rows: [] as YtfWcmIncidentRow[] })),
      ])

      setSessionName(session?.session?.display_name ?? cached?.session?.display_name ?? 'Plant Manager')
      setSessionRole(session?.session?.role ?? cached?.session?.role ?? 'plant_manager')
      setTasks(taskList.rows ?? [])
      setPipelineStats(stats)
      setKpiDefinitions(definitions)
      setRecentKpiValues(values.rows ?? values.enterprise?.rows ?? [])
      setOperatingMetrics(metrics)
      setDailyCloseSummary(dailyClose)
      setManagerReport(report)
      setTwinSummary(twin)
      setWcmIncidents(incidents.rows ?? [])
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not load plant manager data.'
      setMessage(text)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const openTasks = useMemo(() => {
    return tasks
      .filter(isOpenTask)
      .filter(isFactoryVisibleTask)
      .sort((left, right) => priorityWeight(right.priority) - priorityWeight(left.priority))
  }, [tasks])

  const metrics = useMemo(() => {
    const reviewTasks =
      pipelineStats?.source_changes?.task_promotion?.review_task_count ??
      pipelineStats?.source_changes?.promoted_task_count ??
      0
    const kpiCandidates = pipelineStats?.workbooks?.metric_candidate_count ?? 0
    const officialKpis =
      kpiDefinitions?.summary?.official_count ?? kpiDefinitions?.rows?.length ?? recentKpiValues.length
    const plantNumbers =
      operatingMetrics?.summary?.extracted_metric_value_count ??
      operatingMetrics?.top_rows?.length ??
      recentKpiValues.length ??
      officialKpis
    const proofReady = reviewTasks + officialKpis
    return {
      openActions: openTasks.length,
      highActions: openTasks.filter((task) => priorityWeight(task.priority) >= 3).length,
      reviewTasks,
      kpiCandidates,
      officialKpis,
      plantNumbers,
      proofReady,
      lastSync:
        pipelineStats?.source_records?.latest_modified_time ??
        pipelineStats?.refresh_loop?.latest_at ??
        null,
      sourceRecords: pipelineStats?.source_records?.count ?? 0,
    }
  }, [
    kpiDefinitions?.rows?.length,
    kpiDefinitions?.summary?.official_count,
    openTasks,
    operatingMetrics?.summary?.extracted_metric_value_count,
    operatingMetrics?.top_rows?.length,
    pipelineStats,
    recentKpiValues.length,
  ])

  const dailyInputs = dailyCloseSummary?.inputs ?? []
  const missingDailyInputs = dailyInputs.filter((input) => input.status !== 'ready')
  const hasDailyCloseMetrics = Boolean(
    dailyCloseSummary?.summary?.oee_proxy ||
      dailyCloseSummary?.summary?.availability ||
      dailyCloseSummary?.summary?.quality,
  )
  const dailyCloseMissingCount = dailyInputs.length ? missingDailyInputs.length : hasDailyCloseMetrics ? 0 : 1
  const dailyCloseHeadline = hasDailyCloseMetrics
    ? 'Daily close ready.'
    : dailyInputs.length
      ? `${dailyCloseMissingCount} field${dailyCloseMissingCount === 1 ? '' : 's'} missing.`
      : 'Enter daily close.'
  const managerPlantScope = useMemo(() => normalizeYtfPlantScope(sessionRole, 'plant-a'), [sessionRole])
  const scopedDataRoute = `/app/live-data?view=kpi&plant=${managerPlantScope}`
  const operatingRows = selectTopYtfOperatingRows(operatingMetrics?.top_rows ?? [], 12, {
    preferredScope: managerPlantScope,
    minYear: 2024,
  })
    .filter((row) => ytfMetricMatchesPlantScope(row as YtfSizeMetricLike, managerPlantScope))
    .filter((row) => ytfMetricIsCurrentOperational(row as YtfSizeMetricLike, { minYear: 2024, allowLowConfidence: false }))
    .slice(0, 6)
  const plantFocusCards = useMemo(() => buildPlantFocusCards(operatingMetrics, managerPlantScope), [operatingMetrics, managerPlantScope])
  const visibleOpenTasks = openTasks.slice(0, 3)
  const visiblePlantFocusCards = plantFocusCards.slice(0, 2)
  const visibleRecentKpiValues = recentKpiValues.slice(0, 2)
  const visibleOperatingRows = operatingRows.slice(0, 2)
  const teamFocusRows = useMemo(() => buildTeamFocusRows(openTasks), [openTasks])
  const operatingLanes = operatingMetrics?.lanes?.filter((lane) => (lane.count ?? 0) > 0).slice(0, 4) ?? []
  const needsDailyCloseInput = missingDailyInputs.length > 0
  const managerReportRows = (managerReport?.rows ?? []).slice(0, 3)

  const handleCloseTask = async (task: WorkspaceTaskRow) => {
    setClosingTaskId(task.task_id)
    setMessage(null)
    try {
      await updateWorkspaceTask(task.task_id, {
        status: 'done',
        notes: [task.notes, `Closed by ${sessionName} from Plant Manager.`].filter(Boolean).join('\n'),
      })
      setTasks((current) => current.map((item) => (item.task_id === task.task_id ? { ...item, status: 'done' } : item)))
      setMessage('Action closed.')
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not close action.'
      setMessage(text)
    } finally {
      setClosingTaskId(null)
    }
  }

  return (
    <div className="sm-ytf-simple-page sm-ytf-plant-manager-page">
      <section className="sm-ytf-hero-row sm-ytf-hero-compact">
        <div>
          <span className="sm-eyebrow">Plant Manager</span>
          <h1>Run today from one screen.</h1>
          <p>Daily close, open work, and latest plant data.</p>
        </div>
        <div className="sm-ytf-status-stack" aria-label="Workspace status">
          <span>{loading ? 'Live view' : 'Signed in'}</span>
          <span>{sessionName}</span>
          <span>{plantScopeText(dailyCloseSummary)}</span>
          <span>Data {formatDate(metrics.lastSync)}</span>
        </div>
      </section>

      {message ? <div className="sm-ytf-alert">{message}</div> : null}

      <section className="sm-ytf-metric-strip" aria-label="Plant manager numbers">
        {(visiblePlantFocusCards.length ? visiblePlantFocusCards : []).map((card) => (
          <Link key={card.label} to={card.route}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </Link>
        ))}
        {!plantFocusCards.length ? (
          <article>
            <span>Plant values</span>
            <strong>{metrics.plantNumbers > 0 ? 'Open data' : 'Needs entry'}</strong>
            <small>{metrics.plantNumbers > 0 ? 'Review scoped production, quality, stock, and supplier values.' : 'Add today output, quality, stock, or board photo.'}</small>
          </article>
        ) : null}
        <article>
          <span>Machines</span>
          <strong>{twinSummary?.asset_count ? `${twinSummary?.state_counts?.ACTIVE ?? 0}/${twinSummary.asset_count}` : 'Needs setup'}</strong>
          <small>{twinSummary?.asset_count ? 'active machine signals' : 'add machine list and downtime entries'}</small>
        </article>
      </section>

      <section className="sm-ytf-panel sm-ytf-daily-close-panel">
        <div className="sm-ytf-section-head">
          <div>
            <span className="sm-eyebrow">Daily Close</span>
            <h2>{dailyCloseHeadline}</h2>
            <p>OEE appears only after output, rejects, downtime, and planned time exist.</p>
          </div>
          <div className="sm-ytf-action-row">
            <Link className="sm-button sm-button-primary" to={dailyCloseSummary?.next_action?.route ?? '/app/daily-entry'}>
              Add missing data
            </Link>
            <Link className="sm-button" to={scopedDataRoute}>
              Plant values
            </Link>
          </div>
        </div>

        <div className="sm-ytf-metric-strip sm-ytf-tight-strip">
          <article>
            <span>OEE</span>
            <strong>{valueText(dailyCloseSummary?.summary?.oee_proxy, '%')}</strong>
            <small>calculated only when inputs are ready</small>
          </article>
          <article>
            <span>Availability</span>
            <strong>{valueText(dailyCloseSummary?.summary?.availability, '%')}</strong>
            <small>planned time minus downtime</small>
          </article>
          <article>
            <span>Quality</span>
            <strong>{valueText(dailyCloseSummary?.summary?.quality, '%')}</strong>
            <small>good quantity versus total output</small>
          </article>
          <article>
            <span>Missing</span>
            <strong>{dailyCloseMissingCount}</strong>
            <small>{dailyInputs.length ? 'fields before close is trusted' : 'daily close form needed'}</small>
          </article>
        </div>

        <details className="sm-ytf-details sm-ytf-daily-close-details" aria-label="Daily close inputs">
          <summary>Input checklist</summary>
          <div className="sm-ytf-compact-list">
          {dailyInputs.slice(0, 5).map((input) => (
            <div key={input.key} className={input.status === 'ready' ? 'is-ready' : 'is-missing'}>
              <span>{input.label}</span>
              <strong>{input.status === 'ready' ? 'Ready' : 'Missing'}</strong>
            </div>
          ))}
          {!dailyInputs.length ? (
            <div className="is-missing">
              <span>Daily close contract</span>
              <strong>Not loaded</strong>
            </div>
          ) : null}
          </div>
        </details>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <span className="sm-eyebrow">5W1H</span>
            <h2>Manager report.</h2>
          </div>
          <Link className="sm-button" to={managerReport?.next_action?.route ?? '/app/daily-entry?mode=daily_routine'}>
            Add 5W1H
          </Link>
        </div>
        <div className="sm-ytf-compact-list">
          {managerReportRows.length ? (
            managerReportRows.map((row) => (
              <Link key={`${row.source}-${row.id}-${row.when}`} className="sm-ytf-compact-link" to={row.route ?? '/app/daily-entry'}>
                <span>{row.what ?? 'Manager record'}</span>
                <strong>{[row.where, row.why].filter(Boolean).join(' / ') || 'Daily control'}</strong>
                <small>{[row.who, row.how].filter(Boolean).join(' / ')}</small>
              </Link>
            ))
          ) : (
            <Link className="sm-ytf-compact-link" to="/app/daily-entry?mode=daily_routine">
              <span>Daily report</span>
              <strong>Enter 5W1H</strong>
              <small>What, where, who, when, why, how.</small>
            </Link>
          )}
        </div>
      </section>

      <section className="sm-ytf-mobile-command" aria-label="Daily work and data">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <span className="sm-eyebrow">Work</span>
              <h2>Open work.</h2>
            </div>
            <Link className="sm-button" to="/app/action-board">
              Board
            </Link>
          </div>

          <div className="sm-ytf-task-list">
            {visibleOpenTasks.length ? (
              visibleOpenTasks.map((task) => (
                <article key={task.task_id} className="sm-ytf-task-card">
                  <div>
                    <h3>{cleanTaskTitle(task)}</h3>
                    <p>{cleanTaskSummary(task)}</p>
                    <small>
                      {ytfOwnerLabel(task.owner)} / {task.priority ?? 'normal'} / {task.due ?? 'today'}
                    </small>
                  </div>
                  <button
                    className="sm-button"
                    type="button"
                    onClick={() => void handleCloseTask(task)}
                    disabled={closingTaskId === task.task_id}
                  >
                    {closingTaskId === task.task_id ? 'Closing' : 'Close'}
                  </button>
                </article>
              ))
            ) : (
              <div className="sm-ytf-empty-state">No open team work loaded.</div>
            )}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <span className="sm-eyebrow">Data</span>
              <h2>Latest useful numbers.</h2>
            </div>
            <Link className="sm-button" to={scopedDataRoute}>
              Open data
            </Link>
          </div>

          <div className="sm-ytf-compact-list">
            {visiblePlantFocusCards.map((card) => (
              <Link key={`focus-${card.label}`} className="sm-ytf-compact-link" to={card.route}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.detail}</small>
              </Link>
            ))}
            {visibleRecentKpiValues.map((record) => (
              <Link
                key={record.metric_id ?? `${record.metric_name}-${record.captured_at}`}
                className="sm-ytf-compact-link"
                to={`${scopedDataRoute}&focus=latest_metrics`}
              >
                <span>{record.metric_name}</span>
                <strong>
                  {record.metric_value ?? 'value'} {record.unit ?? ''}
                </strong>
              </Link>
            ))}
            {!recentKpiValues.length && !operatingRows.length ? (
              <Link className="sm-ytf-compact-link" to={scopedDataRoute}>
                <span>Plant values</span>
                <strong>{metrics.plantNumbers > 0 ? 'Open data' : 'Needs entry'}</strong>
                <small>{metrics.plantNumbers > 0 ? 'Open scoped operating values.' : 'Add today values from floor work.'}</small>
              </Link>
            ) : null}
          </div>

          <div className="sm-ytf-compact-list">
            {visibleOperatingRows.map((row, index) => (
              <Link
                key={`${row.lane ?? 'lane'}-${row.metric_name ?? index}`}
                className="sm-ytf-compact-link"
                to={scopedDataRoute}
              >
                <span>{ytfOperatingMetricTitle(row)}</span>
                <strong>{ytfOperatingMetricValue(row)}</strong>
                <small>{ytfOperatingMetricContext(row)}</small>
                <small>{ytfOperatingMetricSource(row)}</small>
              </Link>
            ))}
            {!operatingRows.length
              ? operatingLanes.map((lane) => (
                  <Link key={lane.id ?? lane.label} className="sm-ytf-compact-link" to={scopedDataRoute}>
                    <span>{lane.label ?? lane.id ?? 'Data lane'}</span>
                    <strong>{lane.count ?? 0}</strong>
                  </Link>
                ))
              : null}
          </div>
        </article>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <span className="sm-eyebrow">Collaboration</span>
            <h2>Team focus.</h2>
            <p>Use this to see which section needs help, a board update, or follow-up.</p>
          </div>
          <Link className="sm-button" to="/app/action-board">
            Board
          </Link>
        </div>
        <div className="sm-ytf-metric-strip sm-ytf-tight-strip">
          {(teamFocusRows.length ? teamFocusRows : [{ team: 'Plant team', count: 0, high: 0, sample: null }]).map((row) => (
            <Link key={row.team} to="/app/action-board">
              <span>{row.team}</span>
              <strong>{row.count}</strong>
              <small>{row.high} high / {row.sample ? cleanTaskTitle(row.sample) : 'no open work loaded'}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-ytf-action-grid" aria-label="Plant manager actions">
        <Link to="/app/daily-entry">
          <span>Entry</span>
          <strong>Record one issue</strong>
          <small>Manager entry, board photo, and next action.</small>
        </Link>
        <Link to="/app/action-board">
          <span>Work</span>
          <strong>Close open work</strong>
          <small>Team board, owner, due date, follow-up.</small>
        </Link>
        <Link to={scopedDataRoute}>
          <span>Data</span>
          <strong>See plant numbers</strong>
          <small>Production, quality, stock, and supplier numbers.</small>
        </Link>
        <Link to="/app/dqms">
          <span>Quality</span>
          <strong>Open quality</strong>
          <small>Defects, 5W1H, evidence, and closeout.</small>
        </Link>
      </section>

      <details className="sm-ytf-panel sm-ytf-details-panel">
        <summary>More data</summary>
        <div className="sm-ytf-metric-strip sm-ytf-tight-strip">
          <article>
            <span>Open work</span>
            <strong>{metrics.openActions}</strong>
            <small>{metrics.highActions} high</small>
          </article>
          <article>
            <span>5W1H records</span>
            <strong>{wcmIncidents.length}</strong>
            <small>latest 5W1H and abnormal entries</small>
          </article>
          <article>
            <span>Evidence</span>
            <strong>{metrics.proofReady}</strong>
            <small>saved numbers plus work items</small>
          </article>
          <article>
            <span>Daily close</span>
            <strong>{needsDailyCloseInput ? 'Input needed' : 'Ready'}</strong>
            <small>latest close status</small>
          </article>
        </div>
      </details>
    </div>
  )
}
