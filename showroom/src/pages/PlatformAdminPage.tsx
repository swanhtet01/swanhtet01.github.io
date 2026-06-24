import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  getWorkspaceSession,
  getYtfOperatingMetrics,
  listWorkspaceTasks,
  loadCachedWorkspaceSession,
  sessionHasCapability,
  type WorkspaceSessionPayload,
  type WorkspaceTaskRow,
  type YtfOperatingMetricsResult,
} from '../lib/workspaceApi'
import { isYtfFactoryFacingTask, isYtfInternalOrBuildTask } from '../lib/ytfUiFormat'
import {
  ytfMetricIsCurrentOperational,
  ytfProcurementMetricCard,
  ytfProductionMetricCard,
  ytfQualityMetricCard,
  ytfRawMaterialMetricCard,
  ytfStockMetricCard,
  type YtfMetricDisplayCard,
  type YtfSizeMetricLike,
} from '../lib/ytfMetricContext'

type RoleAccountRow = {
  label: string
  username: string
  route: string
  modules: string
}

const ROLE_ACCOUNT_ROWS: RoleAccountRow[] = [
  {
    label: 'Admin',
    username: 'ytf-admin',
    route: '/app/platform-admin',
    modules: 'Settings, ERP, Data, Work',
  },
  {
    label: 'CEO',
    username: 'ytf-ceo',
    route: '/app/director',
    modules: 'CEO, ERP, Data, Work',
  },
  {
    label: 'Plant A Manager',
    username: 'ytf-plant-manager-a',
    route: '/app/plant-manager',
    modules: 'Plant, Entry, ERP, Work',
  },
  {
    label: 'Plant B Manager',
    username: 'ytf-plant-manager-b',
    route: '/app/plant-manager',
    modules: 'Plant, Entry, ERP, Work',
  },
  {
    label: 'Manager A',
    username: 'ytf-manager-a',
    route: '/app/manager-system',
    modules: 'Today, Entry, ERP, Work',
  },
  {
    label: 'Manager B',
    username: 'ytf-manager-b',
    route: '/app/manager-system',
    modules: 'Today, Entry, ERP, Work',
  },
]

function compactNumber(value?: number | null) {
  return Number(value || 0).toLocaleString()
}

function formatDate(value?: string | null) {
  if (!value) return 'Not synced'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function hasAdminAccess(session?: WorkspaceSessionPayload | null) {
  if (!session?.authenticated) return false
  const role = String(session.session?.role || '').trim().toLowerCase()
  return (
    role.includes('admin') ||
    role === 'ceo' ||
    role === 'director' ||
    sessionHasCapability(session.session, 'tenant_admin.view') ||
    sessionHasCapability(session.session, 'platform_admin.view')
  )
}

function taskPriorityWeight(task: WorkspaceTaskRow) {
  const text = String(task.priority || '').toLowerCase()
  if (text.includes('critical')) return 4
  if (text.includes('high')) return 3
  if (text.includes('medium')) return 2
  return 1
}

function isOpenTask(task: WorkspaceTaskRow) {
  const status = String(task.status || '').toLowerCase()
  return !['done', 'closed', 'cancelled', 'resolved'].includes(status)
}

function isApprovalTask(task: WorkspaceTaskRow) {
  const text = `${task.title} ${task.notes} ${task.template}`.toLowerCase()
  return text.includes('approval') || text.includes('approve') || text.includes('review')
}

function currentRow<T extends YtfSizeMetricLike>(rows: T[] = []): T | undefined {
  return rows.find((row) => ytfMetricIsCurrentOperational(row, { minYear: 2024 })) || rows[0]
}

function topOperationalCards(metrics: YtfOperatingMetricsResult | null): YtfMetricDisplayCard[] {
  const breakdowns = metrics?.story?.size_breakdowns
  const production = ytfProductionMetricCard(currentRow(breakdowns?.production_by_size ?? []))
  const quality = ytfQualityMetricCard(currentRow(breakdowns?.quality_claims_by_size ?? []))
  const stock = ytfStockMetricCard(currentRow(breakdowns?.stock_by_size ?? []))
  const procurement =
    ytfProcurementMetricCard(currentRow(breakdowns?.procurement_by_size ?? [])) ||
    ytfRawMaterialMetricCard(currentRow((breakdowns?.procurement_material_orders ?? breakdowns?.raw_material_orders ?? []) as YtfSizeMetricLike[]))

  return [production, quality, stock, procurement]
    .filter(Boolean)
    .map((card) => ({
      ...(card as YtfMetricDisplayCard),
      route: '/app/live-data?view=kpi',
    }))
}

export function PlatformAdminPage() {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [sessionPayload, setSessionPayload] = useState<WorkspaceSessionPayload | null>(null)
  const [metrics, setMetrics] = useState<YtfOperatingMetricsResult | null>(null)
  const [tasks, setTasks] = useState<WorkspaceTaskRow[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setMessage(null)
      const cached = loadCachedWorkspaceSession()
      try {
        const [session, nextMetrics, taskPayload] = await Promise.all([
          getWorkspaceSession().catch(() => cached),
          getYtfOperatingMetrics({ compact: true }).catch(() => null),
          listWorkspaceTasks(undefined, 120).catch(() => ({ rows: [] as WorkspaceTaskRow[] })),
        ])
        if (cancelled) return
        setSessionPayload(session ?? cached ?? null)
        setMetrics(nextMetrics)
        setTasks(taskPayload.rows ?? [])
      } catch (error) {
        if (cancelled) return
        setMessage(error instanceof Error ? error.message : 'Settings page could not load.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const allowed = hasAdminAccess(sessionPayload)
  const session = sessionPayload?.session
  const openTasks = useMemo(
    () => tasks.filter(isOpenTask).filter((task) => isYtfFactoryFacingTask(task) && !isYtfInternalOrBuildTask(task)),
    [tasks],
  )
  const highPriority = useMemo(() => openTasks.filter((task) => taskPriorityWeight(task) >= 3).length, [openTasks])
  const pendingApprovals = useMemo(() => openTasks.filter(isApprovalTask).length, [openTasks])
  const cards = useMemo(() => topOperationalCards(metrics), [metrics])
  const lastUpdatedAt = metrics?.generated_at || null

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row sm-ytf-hero-compact" aria-busy={loading}>
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Settings</p>
          <h1>Admin control.</h1>
          <p>Role access, operational view defaults, and team collaboration setup.</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{allowed ? 'Admin access' : 'Read only'}</span>
          <span>{session?.display_name || session?.username || 'YTF Admin'}</span>
          <span>{session?.workspace_slug || 'ytf-plant-a'}</span>
          <span>{formatDate(lastUpdatedAt)}</span>
        </div>
      </section>

      {message ? <section className="sm-ytf-alert">{message}</section> : null}

      <section className="sm-ytf-metric-strip is-compact">
        <Link to="/app/action-board">
          <span>Open work</span>
          <strong>{compactNumber(openTasks.length)}</strong>
          <small>{compactNumber(highPriority)} high priority</small>
        </Link>
        <Link to="/app/action-board">
          <span>Pending approvals</span>
          <strong>{compactNumber(pendingApprovals)}</strong>
          <small>Needs owner decision</small>
        </Link>
        {(cards.length ? cards : [{ label: 'Production output', value: 'No value', detail: 'Save daily entries to load operations.', route: '/app/daily-entry' }]).slice(0, 2).map((card) => (
          <Link key={card.label} to={card.route}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </Link>
        ))}
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Accounts</p>
            <h2>Role accounts and module access.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/erp">
            ERP
          </Link>
        </div>
        <div className="sm-ytf-compact-list">
          {ROLE_ACCOUNT_ROWS.map((row) => (
            <Link className="sm-ytf-list-row" key={row.username} to={row.route}>
              <span>
                <strong>{row.label} / {row.username}</strong>
                <small>{row.modules}</small>
              </span>
              <em>Open</em>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Module defaults</p>
            <h2>Keep the app focused on operation and team work.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/live-data?view=kpi">
            Data
          </Link>
        </div>
        <div className="sm-ytf-action-grid">
          <Link className="sm-ytf-action-tile is-primary" to="/app/erp">
            <span>
              <strong>ERP cockpit</strong>
              <small>Operational metrics and fast data entry.</small>
            </span>
            <span className="sm-ytf-action-arrow">Open</span>
          </Link>
          <Link className="sm-ytf-action-tile" to="/app/live-data?view=kpi">
            <span>
              <strong>Operational data</strong>
              <small>Production, quality, stock, and purchase metrics.</small>
            </span>
            <span className="sm-ytf-action-arrow">Open</span>
          </Link>
          <Link className="sm-ytf-action-tile" to="/app/action-board">
            <span>
              <strong>Team workboard</strong>
              <small>Assign, follow up, approve, and close actions.</small>
            </span>
            <span className="sm-ytf-action-arrow">Open</span>
          </Link>
          <Link className="sm-ytf-action-tile" to="/app/daily-entry?mode=daily_routine">
            <span>
              <strong>5W1H and WCM/ISO entry</strong>
              <small>Structured daily updates with evidence and ownership.</small>
            </span>
            <span className="sm-ytf-action-arrow">Open</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
