import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  getCapabilityProfileForRole,
  getWorkspaceSession,
  getYtfCommunicationsLatest,
  getYtfOperatingMetrics,
  getYtfPipelineStats,
  listWorkspaceTasks,
  loadCachedWorkspaceSession,
  sessionHasCapability,
  type WorkspaceTaskRow,
  type YtfCommunicationsLatestResult,
  type YtfOperatingMetricsResult,
  type YtfPipelineStatsResult,
} from '../lib/workspaceApi'
import {
  selectTopYtfOperatingRows,
  ytfOperatingMetricContext,
  ytfOperatingMetricSource,
  ytfOperatingMetricTitle,
  ytfOperatingMetricValue,
  type YtfOperatingMetricRow,
} from '../lib/ytfMetricRows'
import { isYtfFactoryFacingTask, summarizeYtfTaskNotes, ytfOwnerLabel } from '../lib/ytfUiFormat'
import { YTF_VERIFIED_PIPELINE_SNAPSHOT } from '../lib/ytfVerifiedSnapshot'

type SessionState = Awaited<ReturnType<typeof getWorkspaceSession>>['session']
type YtfFactoryLane = NonNullable<NonNullable<NonNullable<YtfOperatingMetricsResult['story']>['factory_system']>['lanes']>[number]

function isOpenTask(task: WorkspaceTaskRow) {
  const status = String(task.status || '').trim().toLowerCase()
  return !['done', 'closed', 'cancelled', 'resolved'].includes(status)
}

function priorityWeight(priority?: string | null) {
  const text = String(priority || '').toLowerCase()
  if (text.includes('critical')) return 4
  if (text.includes('high')) return 3
  if (text.includes('medium')) return 2
  return 1
}

function compactNumber(value?: number | null) {
  return Number(value || 0).toLocaleString()
}

function formatDate(value?: string | null) {
  if (!value) return 'No update yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function publicCeoText(value?: string | null, fallback = 'Operational record') {
  const raw = String(value || '').replace(/\s+/g, ' ').trim()
  if (!raw) return fallback
  const lower = raw.toLowerCase()
  const recordLabel = lower.includes('claim') || lower.includes('qc') || lower.includes('quality') || lower.includes('defect')
    ? 'Quality record'
    : lower.includes('stock') || lower.includes('warehouse') || lower.includes('dispatch') || lower.includes('sales') || lower.includes('inventory')
      ? 'Sales / inventory record'
      : lower.includes('purchase') || lower.includes('supplier') || lower.includes('finance') || lower.includes('invoice') || lower.includes('payment')
        ? 'Supplier / finance record'
        : lower.includes('production') || lower.includes('output') || lower.includes('curing') || lower.includes('mixing') || lower.includes('building')
          ? 'Production record'
          : fallback
  const cleaned = raw
    .replace(/\bSource:\s*[^;\n]*\.(?:xlsx|xls|csv|pdf|docx)\b[^;\n]*/gi, recordLabel)
    .replace(/\b[^/;,\n]*\.(?:xlsx|xls|csv|pdf|docx)\b[^/;,\n]*/gi, recordLabel)
    .replace(/\b(?:Google\s+Drive|Drive|workbook|worksheet|source file|file|folder)\b/gi, 'record')
    .replace(/\bsource[_\s-]*workbook\b/gi, 'record')
    .replace(/\bsource[_\s-]*sheet\b/gi, 'section')
    .replace(/\bsource\b/gi, 'record')
    .replace(/[_]{2,}/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.;,])/g, '$1')
    .trim()
  if (!cleaned || /\.(?:xlsx|xls|csv|pdf|docx)\b/i.test(cleaned) || /drive\.google|docs\.google|googleapis/i.test(cleaned)) {
    return recordLabel
  }
  return cleaned
}

function rowText(row: YtfOperatingMetricRow) {
  return [
    row.metric_name,
    row.metric_group,
    row.plant,
    row.site_scope,
    row.workbook,
    row.sheet_name,
    row.row_label,
    row.source,
    row.source_workbook,
    row.operating_lane,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function rowMatches(row: YtfOperatingMetricRow, pattern: RegExp) {
  return pattern.test(rowText(row))
}

function pickMetric(rows: YtfOperatingMetricRow[], fallbackLabel: string) {
  const row = rows[0]
  if (!row) {
    return {
      title: fallbackLabel,
      value: 'No value yet',
      detail: 'Waiting for extracted workbook values or manager entry.',
      source: 'YTF data',
    }
  }

  return {
    title: ytfOperatingMetricTitle(row),
    value: ytfOperatingMetricValue(row),
    detail: ytfOperatingMetricContext(row),
    source: ytfOperatingMetricSource(row),
  }
}

function findLane(lanes: YtfFactoryLane[], id: string) {
  return lanes.find((lane) => String(lane.id || '').toLowerCase() === id)
}

function pickLaneMetric(lane: YtfFactoryLane | undefined, fallbackRows: YtfOperatingMetricRow[], fallbackLabel: string) {
  if (lane?.value || lane?.detail) {
    return {
      title: lane.label || fallbackLabel,
      value: lane.value || 'Review',
      detail: lane.detail || 'Extracted from Factory Client operating records.',
      source: lane.source || 'YTF operating data',
    }
  }
  return pickMetric(fallbackRows, fallbackLabel)
}

function plantSplitCount(metrics: YtfOperatingMetricsResult | null, pattern: RegExp) {
  const split = metrics?.summary?.plant_split ?? {}
  return Object.entries(split).reduce((total, [label, count]) => {
    return pattern.test(label.toLowerCase()) ? total + Number(count || 0) : total
  }, 0)
}

function pickPlantMetric(rows: YtfOperatingMetricRow[], metrics: YtfOperatingMetricsResult | null, pattern: RegExp, fallbackLabel: string) {
  const picked = pickMetric(rows, fallbackLabel)
  if (picked.value !== 'No value yet') return picked
  const count = plantSplitCount(metrics, pattern)
  return count > 0
    ? {
        title: 'Extracted plant rows',
        value: `${compactNumber(count)} rows`,
        detail: 'Plant-specific records are separated in the current warehouse.',
        source: 'YTF operating data',
      }
    : picked
}

export function YtfCeoReviewPage() {
  const cached = useMemo(() => loadCachedWorkspaceSession(), [])
  const [loading, setLoading] = useState(!cached?.authenticated)
  const [session, setSession] = useState<SessionState | null>(cached?.session ?? null)
  const [tasks, setTasks] = useState<WorkspaceTaskRow[]>([])
  const [metrics, setMetrics] = useState<YtfOperatingMetricsResult | null>(null)
  const [pipeline, setPipeline] = useState<YtfPipelineStatsResult | null>(() => YTF_VERIFIED_PIPELINE_SNAPSHOT)
  const [comms, setComms] = useState<YtfCommunicationsLatestResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [nextSession, nextTasks, nextMetrics, nextPipeline, nextComms] = await Promise.all([
          getWorkspaceSession().catch(() => cached),
          listWorkspaceTasks('open', 80).catch(() => ({ rows: [] })),
          getYtfOperatingMetrics().catch(() => null),
          getYtfPipelineStats().catch(() => YTF_VERIFIED_PIPELINE_SNAPSHOT),
          getYtfCommunicationsLatest({ durable: true }).catch(() => null),
        ])

        if (!cancelled) {
          setSession(nextSession?.session ?? cached?.session ?? null)
          setTasks(nextTasks.rows ?? [])
          setMetrics(nextMetrics)
          setPipeline(nextPipeline)
          setComms(nextComms)
          setError('')
        }
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'CEO review could not be loaded.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [cached])

  const role = getCapabilityProfileForRole(session?.role)
  const canOpen =
    sessionHasCapability(session, 'director.view') ||
    sessionHasCapability(session, 'tenant_admin.view') ||
    sessionHasCapability(session, 'platform_admin.view')

  const topRows = useMemo(() => selectTopYtfOperatingRows(metrics?.top_rows ?? [], 24), [metrics?.top_rows])
  const plantARows = useMemo(() => topRows.filter((row) => rowMatches(row, /(plant\s*a|yangon|shwe|nylon|bias|mixing|curing|building)/)), [topRows])
  const plantBRows = useMemo(() => topRows.filter((row) => rowMatches(row, /(plant\s*b|bilin|radial|motorcycle|mon\s*state|\bmc\b|\bpcr\b)/)), [topRows])
  const commercialRows = useMemo(() => topRows.filter((row) => rowMatches(row, /(sales|stock|showroom|dealer|inventory|balance|dispatch)/)), [topRows])
  const qualityRows = useMemo(() => topRows.filter((row) => rowMatches(row, /(quality|qc|claim|defect|reject|hold|inspection)/)), [topRows])
  const supplierRows = useMemo(() => topRows.filter((row) => rowMatches(row, /(supplier|purchase|invoice|payment|finance|cost|po|kiic|junky)/)), [topRows])
  const factoryLanes = metrics?.story?.factory_system?.lanes ?? []

  const openWork = useMemo(
    () =>
      tasks
        .filter(isOpenTask)
        .filter(isYtfFactoryFacingTask)
        .sort((left, right) => priorityWeight(right.priority) - priorityWeight(left.priority))
        .slice(0, 5),
    [tasks],
  )

  const cards = [
    { label: 'Floor A / Yangon', route: '/app/live-data?view=kpi&plant=plant-a', ...pickPlantMetric(plantARows, metrics, /Floor A|yangon|company|shared a\+b/, 'Floor A output') },
    { label: 'Floor B / Bilin', route: '/app/live-data?view=kpi&plant=plant-b', ...pickPlantMetric(plantBRows, metrics, /Floor B|bilin|shared a\+b/, 'Floor B output') },
    { label: 'Production', route: '/app/live-data?view=kpi&scope=production', ...pickLaneMetric(findLane(factoryLanes, 'production'), plantARows, 'Production output') },
    { label: 'Sales / stock', route: '/app/live-data?view=kpi&scope=commercial', ...pickLaneMetric(findLane(factoryLanes, 'stock'), commercialRows, 'Sales and stock') },
    { label: 'Quality', route: '/app/dqms', ...pickLaneMetric(findLane(factoryLanes, 'quality'), qualityRows, 'Quality signal') },
    { label: 'Supplier / finance', route: '/app/email', ...pickLaneMetric(findLane(factoryLanes, 'supplier'), supplierRows, 'Supplier and finance') },
  ]

  const sourceCount = pipeline?.source_records?.count ?? YTF_VERIFIED_PIPELINE_SNAPSHOT.source_records?.count ?? 0
  const metricCount =
    metrics?.summary?.extracted_metric_value_count ??
    metrics?.top_rows?.length ??
    pipeline?.workbooks?.metric_candidate_count ??
    0
  const messageCount = comms?.summary?.gmail_message_count ?? comms?.summary?.scan_result_count ?? 0
  const lastUpdate = metrics?.generated_at ?? pipeline?.refresh_loop?.latest_at ?? pipeline?.source_records?.latest_modified_time

  if (!session) {
    return (
      <section className="sm-ytf-simple-page">
        <div className="sm-ytf-panel">
          <h1>Login required.</h1>
          <p>Use the CEO or admin workspace to open company review.</p>
          <Link className="sm-button-primary mt-4" to="/login?next=/app/director">
            Login
          </Link>
        </div>
      </section>
    )
  }

  if (!canOpen) {
    return (
      <section className="sm-ytf-simple-page">
        <div className="sm-ytf-panel">
          <h1>CEO access only.</h1>
          <p>Current role: {role.label}. Use your assigned YTF home.</p>
          <Link className="sm-button-primary mt-4" to="/app/portal">
            Open home
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="sm-ytf-simple-page sm-ytf-ceo-page" aria-busy={loading}>
      <section className="sm-ytf-hero-row sm-ytf-hero-compact">
        <div>
          <span className="sm-eyebrow">CEO Review</span>
          <h1>Company control.</h1>
          <p>Floor A, Floor B, sales, quality, supplier, and finance signals in one private review.</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{role.label}</span>
          <span>{formatDate(lastUpdate)}</span>
        </div>
      </section>

      {error ? <section className="sm-ytf-alert">{error}</section> : null}

      <section className="sm-ytf-metric-strip">
        <Link to="/app/live-data?view=kpi">
          <span>Plant values</span>
          <strong>{compactNumber(metricCount)}</strong>
          <small>extracted numbers</small>
        </Link>
        <Link to="/app/live-data?view=data">
          <span>Records</span>
          <strong>{compactNumber(sourceCount)}</strong>
          <small>organized source items</small>
        </Link>
        <Link to="/app/action-board">
          <span>Open work</span>
          <strong>{openWork.length}</strong>
          <small>factory-facing only</small>
        </Link>
        <Link to="/app/email">
          <span>Email/chat</span>
          <strong>{compactNumber(messageCount)}</strong>
          <small>private CEO/admin intake</small>
        </Link>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <span className="sm-eyebrow">Decision Map</span>
            <h2>Tap the area to drill in.</h2>
          </div>
          <Link className="sm-button" to="/app/live-data?view=kpi">
            Data
          </Link>
        </div>
        <div className="sm-ytf-action-grid">
          {cards.map((card) => (
            <Link key={card.label} to={card.route}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{publicCeoText(card.title, card.label)}</small>
              <small>{publicCeoText(card.detail, 'Latest operating context')}</small>
              <small>{publicCeoText(card.source, 'Operational evidence')}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <span className="sm-eyebrow">Open Work</span>
              <h2>Only real team work.</h2>
            </div>
            <Link className="sm-button" to="/app/action-board">
              Board
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {openWork.map((task) => {
              const note = summarizeYtfTaskNotes(task.notes, task.title)
              return (
                <Link className="sm-ytf-list-row" key={task.task_id} to="/app/action-board">
                  <span>
                    <strong>{task.title}</strong>
                    <small>{note.summary}</small>
                    <small>{note.source}</small>
                  </span>
                  <em>{ytfOwnerLabel(task.owner)}</em>
                </Link>
              )
            })}
            {!openWork.length ? <p className="sm-ytf-empty">No factory-facing work is open.</p> : null}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <span className="sm-eyebrow">Private Inbox</span>
              <h2>Email stays CEO/admin only.</h2>
            </div>
            <Link className="sm-button" to="/app/email">
              Email
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {(comms?.plan?.sources ?? []).slice(0, 4).map((source) => (
              <div className="sm-ytf-list-row" key={source.source_id ?? source.name}>
                <span>
                  <strong>{source.name ?? source.source_id ?? 'Communication source'}</strong>
                  <small>{source.owner ?? 'CEO/admin'} / {source.cadence ?? 'as available'}</small>
                </span>
                <em>{source.status ?? source.probe_status ?? 'mapped'}</em>
              </div>
            ))}
            {!(comms?.plan?.sources ?? []).length ? (
              <p className="sm-ytf-empty">No email rows connected yet. Manual chat and Drive data still feed the dashboard.</p>
            ) : null}
          </div>
        </article>
      </section>
    </div>
  )
}
