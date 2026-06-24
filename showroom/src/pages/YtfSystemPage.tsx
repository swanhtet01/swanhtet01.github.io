import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  getWorkspaceSession,
  getYtfDashboardSummary,
  loadCachedWorkspaceSession,
  sessionHasCapability,
  type WorkspaceCapability,
  type WorkspaceSessionPayload,
  type YtfDashboardSummaryResult,
} from '../lib/workspaceApi'
import { buildYtfErpCapabilityCards, summarizeYtfErpCapabilities } from '../lib/ytfErpCapabilityModel'

type SystemState = {
  session: WorkspaceSessionPayload['session'] | null
  summary: YtfDashboardSummaryResult | null
  loading: boolean
  error: string | null
}

type ChecklistItem = {
  label: string
  value: string
  detail: string
  route: string
}

const emptyState: SystemState = {
  session: null,
  summary: null,
  loading: true,
  error: null,
}

function settledValue<T>(result: PromiseSettledResult<T>) {
  return result.status === 'fulfilled' ? result.value : null
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCount(value: unknown) {
  return numberValue(value).toLocaleString()
}

function compactTime(value?: string) {
  if (!value) return 'No timestamp'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusValue(condition: boolean, ready = 'Live', blocked = 'Check') {
  return condition ? ready : blocked
}

function topEntries(values?: Record<string, number>) {
  return Object.entries(values ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
}

const RAW_DATA_CAPABILITIES: WorkspaceCapability[] = [
  'tenant_admin.view',
  'platform_admin.view',
  'connector_admin.view',
  'knowledge_admin.view',
]

function hasAnyCapability(session: WorkspaceSessionPayload['session'] | null | undefined, capabilities: WorkspaceCapability[]) {
  return capabilities.some((capability) => sessionHasCapability(session, capability))
}

function useYtfSystemState() {
  const [state, setState] = useState<SystemState>(emptyState)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState((current) => ({ ...current, loading: true, error: null }))
      const results = await Promise.allSettled([
        getWorkspaceSession().catch(() => loadCachedWorkspaceSession()),
        getYtfDashboardSummary({ compact: true }),
      ])

      if (cancelled) return

      const sessionPayload = settledValue(results[0])
      const summary = settledValue(results[1])
      const criticalError =
        !sessionPayload?.session && !summary
          ? 'Could not load the YTF system summary. Check login, database, or tenant access.'
          : null

      setState({
        session: sessionPayload?.session ?? null,
        summary,
        loading: false,
        error: criticalError,
      })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function YtfSystemPage() {
  const state = useYtfSystemState()
  const pipeline = state.summary?.pipeline_stats ?? null
  const knowledge = state.summary?.knowledge_status ?? null
  const gmail = state.summary?.gmail_status ?? null
  const bots = state.summary?.bot_pipeline ?? null
  const latestRefresh = pipeline?.refresh_loop ?? null
  const latestRefreshTime = latestRefresh?.latest_at || state.summary?.generated_at

  const sourceRecords = numberValue(pipeline?.source_records?.count)
  const sourceChanges = numberValue(pipeline?.source_changes?.event_count)
  const reviewTasks = numberValue(
    pipeline?.source_changes?.promoted_task_count ?? pipeline?.source_changes?.task_promotion?.review_task_count,
  )
  const kpiCandidates = numberValue(pipeline?.source_records?.kpi_candidate_count)
  const knowledgeChunks = numberValue(knowledge?.summary?.chunk_count)
  const gmailReady = (gmail?.summary?.token_status || gmail?.gmail?.status) === 'ready'
  const botReadyCount = numberValue(bots?.summary?.ready_count)
  const botTotal = numberValue(bots?.summary?.bot_source_count)
  const databaseReady = Boolean(pipeline?.database?.configured && pipeline.database.external)
  const refreshStatus = String(latestRefresh?.status || '').trim()
  const refreshReady = Boolean(latestRefresh && !['failed', 'error', 'stale'].includes(refreshStatus))
  const refreshLabel = refreshStatus === 'stale' ? 'Stale' : refreshStatus === 'running' ? 'Running' : refreshReady ? 'Ready' : 'Check'
  const dataReady = databaseReady && sourceRecords > 0 && knowledgeChunks > 0
  const roleName = String(state.session?.role || state.session?.username || 'workspace')
  const canOpenRawData = hasAnyCapability(state.session, RAW_DATA_CAPABILITIES)
  const sourceRoute = canOpenRawData ? '/app/live-data?view=database' : '/app/data-quality'
  const changeRoute = canOpenRawData ? '/app/live-data?view=actions' : '/app/action-board'
  const emailRoute = canOpenRawData ? '/app/email' : '/app/action-board'
  const setupRoute = canOpenRawData ? '/app/platform-admin' : '/app/portal'
  const officialKpis = numberValue(state.summary?.kpi_definitions?.approved_count ?? state.summary?.kpi_definitions?.rows?.length)
  const plantRows = topEntries(pipeline?.source_records?.by_plant)
  const domainRows = topEntries(pipeline?.source_records?.by_domain)
  const erpCapabilities = buildYtfErpCapabilityCards({
    databaseReady,
    gmailReady,
    sourceRecords,
    sourceChanges,
    kpiCandidates,
    officialKpis,
    knowledgeChunks,
    botReadyCount,
    botTotal,
    byDomain: pipeline?.source_records?.by_domain,
    byPlant: pipeline?.source_records?.by_plant,
  })
  const erpReadiness = summarizeYtfErpCapabilities(erpCapabilities)

  const checklist: ChecklistItem[] = [
    {
      label: 'Private portal',
      value: 'Live',
      detail: 'Only YTF role homes and YTF routes are exposed on this host.',
      route: '/app/portal',
    },
    {
      label: 'Source connection',
      value: statusValue(sourceRecords > 0, `${formatCount(sourceRecords)} records`, 'No records'),
      detail: `Latest transformed record: ${compactTime(pipeline?.source_records?.latest_modified_time)}`,
      route: sourceRoute,
    },
    {
      label: 'Cloud refresh',
      value: refreshLabel,
      detail: `${formatCount(latestRefresh?.run_count)} refresh runs. Last run: ${compactTime(latestRefreshTime)}`,
      route: sourceRoute,
    },
    {
      label: 'Evidence search',
      value: statusValue(knowledgeChunks > 0, `${formatCount(knowledgeChunks)} chunks`, 'Build'),
      detail: `${formatCount(kpiCandidates)} KPI candidates and confirmed operating records feed the dashboards.`,
      route: sourceRoute,
    },
    {
      label: 'Email intake',
      value: statusValue(gmailReady, 'Ready', 'OAuth'),
      detail: gmailReady ? 'Admin-only email can create redacted routed work.' : 'Needs Google re-auth before live inbox mining.',
      route: emailRoute,
    },
    {
      label: 'Chat bridges',
      value: botTotal ? `${formatCount(botReadyCount)}/${formatCount(botTotal)}` : 'Manual',
      detail: 'Viber, LINE, WeChat, and manual drops can land in one communication pipeline.',
      route: emailRoute,
    },
    {
      label: 'Role dashboards',
      value: '3 core',
      detail: 'Manager, Plant Manager, and Admin have separate dashboards with filtered work.',
      route: '/app/portal',
    },
  ]

  const roleDashboards = [
    {
      label: 'Manager',
      route: '/app/daily-entry',
      value: 'Entry',
      detail: 'One short phone form: issue, owner, due date, evidence, then route.',
    },
    {
      label: 'Plant Manager',
      route: '/app/plant-manager',
      value: 'Review',
      detail: 'Open actions, record changes, quality, maintenance, and KPI candidates.',
    },
    {
      label: 'Admin',
      route: '/app/platform-admin',
      value: 'Setup',
      detail: 'Users, connectors, cron, privacy, and data jobs.',
    },
  ]

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-panel sm-ytf-hero-row">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">System</p>
          <h1>Data to action.</h1>
          <p>
            Business records, entries, and admin-only messages become KPI candidates, actions, evidence, and manager dashboards.
          </p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{roleName}</span>
          <strong>{state.loading ? 'Loading' : statusValue(dataReady, 'Ready', 'Needs review')}</strong>
        </div>
      </section>

      {state.error ? <div className="sm-ytf-panel">{state.error}</div> : null}

      <section className="sm-ytf-metric-strip is-compact">
        <Link to={sourceRoute}>
          <span>Transformed records</span>
          <strong>{formatCount(sourceRecords)}</strong>
          <small>{compactTime(pipeline?.source_records?.latest_modified_time)}</small>
        </Link>
        <Link to={changeRoute}>
          <span>Review signals</span>
          <strong>{formatCount(sourceChanges)}</strong>
          <small>{formatCount(reviewTasks)} review tasks</small>
        </Link>
        <Link to="/app/data-quality">
          <span>KPI candidates</span>
          <strong>{formatCount(kpiCandidates)}</strong>
          <small>Manager confirms before official use.</small>
        </Link>
        <Link to="/app/data-quality">
          <span>Official KPIs</span>
          <strong>{formatCount(officialKpis)}</strong>
          <small>Confirmed definitions, not raw guesses.</small>
        </Link>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">ERP coverage</p>
            <h2>Better than a generic ERP.</h2>
          </div>
          <div className="sm-ytf-chip-line">
            <span>{erpReadiness.score}/100</span>
            <span>{erpReadiness.live} live</span>
            <span>{erpReadiness.gaps} gaps</span>
          </div>
        </div>
        <div className="sm-ytf-action-grid sm-ytf-action-grid-four">
          {erpCapabilities.slice(0, 8).map((item) => (
            <Link className="sm-ytf-action-tile" key={item.id} to={item.route}>
              <span>{item.status}</span>
              <strong>{item.title}</strong>
              <small>{item.ytfEdge}</small>
              <em>{item.score}/100</em>
            </Link>
          ))}
        </div>
        <details className="sm-ytf-details mt-3">
          <summary>Next gaps to close</summary>
          <div className="sm-ytf-compact-list mt-3">
            {erpReadiness.next.map((item) => (
              <Link className="sm-ytf-list-row" key={item.id} to={item.route}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.nextAction}</small>
                </span>
                <em>{item.score}/100</em>
              </Link>
            ))}
          </div>
        </details>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next-gen ERP + ISO</p>
            <h2>One loop, four steps.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/daily-entry">
            Start entry
          </Link>
        </div>
        <div className="sm-ytf-action-grid sm-ytf-action-grid-four">
          {[ 
            ['Capture once', 'Manager enters a short note, evidence, owner, and due date.', '/app/daily-entry'],
            ['System reads', 'The system suggests KPI, owner, category, and missing evidence.', '/app/data-quality'],
            ['Manager confirms', 'Nothing becomes official until a human confirms record, owner, and meaning.', '/app/action-board'],
            ['History updates', 'Quality, maintenance, KPI, and review history stay attached.', '/app/dqms'],
          ].map(([label, detail, route]) => (
            <Link className="sm-ytf-action-tile" key={label} to={route}>
              <span>{label}</span>
              <strong>Open</strong>
              <small>{detail}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Dashboards</p>
            <h2>Use three homes.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/portal">
            Open dashboard
          </Link>
        </div>
        <div className="sm-ytf-action-grid sm-ytf-action-grid-three">
          {roleDashboards.map((role) => (
            <Link className="sm-ytf-action-tile" key={role.label} to={role.route}>
              <span>{role.label}</span>
              <strong>{role.value}</strong>
              <small>{role.detail}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Connected data</p>
            <h2>Only show usable output.</h2>
          </div>
          <Link className="sm-button-secondary" to={sourceRoute}>
            Open review
          </Link>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="sm-ytf-compact-list">
            <strong>Plant lanes</strong>
            {plantRows.length ? (
              plantRows.map(([label, count]) => (
                <Link className="sm-ytf-list-row" key={label} to={changeRoute}>
                  <span>
                    <strong>{label}</strong>
                    <small>Transformed source records.</small>
                  </span>
                  <em>{formatCount(count)}</em>
                </Link>
              ))
            ) : (
              <Link className="sm-ytf-list-row" to={sourceRoute}>
                <span>
                  <strong>No plant split loaded</strong>
                  <small>Run the data refresh and review source mapping.</small>
                </span>
                <em>Check</em>
              </Link>
            )}
          </div>
          <div className="sm-ytf-compact-list">
            <strong>Business lanes</strong>
            {domainRows.length ? (
              domainRows.map(([label, count]) => (
                <Link className="sm-ytf-list-row" key={label} to={sourceRoute}>
                  <span>
                    <strong>{label}</strong>
                    <small>Ready for dashboard, KPI, action, or knowledge use.</small>
                  </span>
                  <em>{formatCount(count)}</em>
                </Link>
              ))
            ) : (
              <Link className="sm-ytf-list-row" to={sourceRoute}>
                <span>
                  <strong>No business lanes loaded</strong>
                  <small>Refresh source records before manager review.</small>
                </span>
                <em>Check</em>
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Launch checklist</p>
            <h2>What must stay working.</h2>
          </div>
          <Link className="sm-button-secondary" to={setupRoute}>
            Setup
          </Link>
        </div>
        <div className="sm-ytf-compact-list">
          {checklist.map((item) => (
            <Link className="sm-ytf-list-row" key={item.label} to={item.route}>
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <em>{item.value}</em>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Operating loop</p>
            <h2>Keep the tenant simple.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/action-board">
            Board
          </Link>
        </div>
        <div className="sm-ytf-compact-list">
          {[
            ['Private portal', 'Only authorised role homes, data health, actions, and ISO workflows stay visible here.', '/app/portal'],
            ['Data connection', 'Transformed source changes, KPI candidates, and owner review status.', sourceRoute],
            ['Daily workflow', 'Entry, action board, evidence, owner, due date, status, and closeout.', '/app/action-board'],
            ['Invisible ISO', 'DQMS, CAPA, maintenance, document control, audits, and training as simple forms.', '/app/dqms'],
          ].map(([label, detail, route]) => (
            <Link className="sm-ytf-list-row" key={label} to={route}>
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              <em>Open</em>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
