import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  getSeedDataFabricDataset,
  loadDataFabricDataset,
  type DataFabricDataset,
} from '../lib/dataFabricApi'
import { canAccessPortalRoute } from '../lib/portalRouteAccess'
import { resolveRoleDataView } from '../lib/roleDataVisibilityModel'
import {
  getCapabilityProfileForRole,
  getWorkspaceSession,
  getYtfBotPipeline,
  getYtfGmailStatus,
  getYtfPipelineStats,
  loadCachedWorkspaceSession,
  runYtfDataManager,
  sessionHasCapability,
  type WorkspaceCapability,
  type YtfBotPipelineResult,
  type YtfGmailStatusResult,
  type YtfPipelineStatsResult,
} from '../lib/workspaceApi'
import {
  getSeedYtfRootWarehouseDataset,
  loadYtfRootWarehouseDataset,
  type YtfRootWarehouseDataset,
} from '../lib/ytfRootWarehouseApi'
import { buildYtfDailyCloseItems, buildYtfOperatingInsights } from '../lib/ytfOperatingInsights'

type SessionState = Awaited<ReturnType<typeof getWorkspaceSession>>['session']

const DATA_MANAGER_CAPABILITIES: WorkspaceCapability[] = [
  'operations.view',
  'dqms.view',
  'director.view',
  'tenant_admin.view',
  'platform_admin.view',
]

const DATA_EXPORT_CAPABILITIES: WorkspaceCapability[] = [
  'director.view',
  'connector_admin.view',
  'knowledge_admin.view',
  'tenant_admin.view',
  'platform_admin.view',
]

const TECHNICAL_SOURCE_CAPABILITIES: WorkspaceCapability[] = [
  'connector_admin.view',
  'knowledge_admin.view',
  'tenant_admin.view',
  'platform_admin.view',
]

function hasAnyCapability(session: SessionState | null | undefined, capabilities: WorkspaceCapability[]) {
  return capabilities.some((capability) => sessionHasCapability(session, capability))
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not synced yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function compactNumber(value?: number | string | null) {
  if (typeof value === 'number') return new Intl.NumberFormat().format(value)
  const normalized = String(value ?? '').trim()
  return normalized || '0'
}

function statusText(value?: string | null) {
  return String(value || 'watch').replace(/_/g, ' ')
}

function compact(value?: string | null, max = 104) {
  const trimmed = String(value || '').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 3).trim()}...` : trimmed
}

function daysSince(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value).getTime()
  if (Number.isNaN(parsed)) return null
  return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000))
}

export function DataFabricPage() {
  const [dataset, setDataset] = useState<DataFabricDataset>(() => getSeedDataFabricDataset())
  const [warehouse, setWarehouse] = useState<YtfRootWarehouseDataset>(() => getSeedYtfRootWarehouseDataset())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pipelineStats, setPipelineStats] = useState<YtfPipelineStatsResult | null>(null)
  const [gmailStatus, setGmailStatus] = useState<YtfGmailStatusResult | null>(null)
  const [botStatus, setBotStatus] = useState<YtfBotPipelineResult | null>(null)
  const [session, setSession] = useState<SessionState | null>(() => loadCachedWorkspaceSession()?.session ?? null)

  async function load() {
    setError('')
    const [nextSessionPayload, nextDataset, nextWarehouse, nextPipelineStats, nextGmailStatus, nextBotStatus] = await Promise.all([
      getWorkspaceSession().catch(() => loadCachedWorkspaceSession()),
      loadDataFabricDataset().catch(() => getSeedDataFabricDataset()),
      loadYtfRootWarehouseDataset().catch(() => getSeedYtfRootWarehouseDataset()),
      getYtfPipelineStats().catch(() => null),
      getYtfGmailStatus().catch(() => null),
      getYtfBotPipeline().catch(() => null),
    ])
    setSession(nextSessionPayload?.session ?? null)
    setDataset(nextDataset)
    setWarehouse(nextWarehouse)
    setPipelineStats(nextPipelineStats)
    setGmailStatus(nextGmailStatus)
    setBotStatus(nextBotStatus)
  }

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        await load()
      } catch {
        if (!cancelled) setError('Data fabric could not refresh on this host.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void start()
    return () => {
      cancelled = true
    }
  }, [])

  const sourceRegistry = useMemo(
    () =>
      [...dataset.sourceRegistry]
        .sort((left, right) => {
          const rightTime = right.lastSignalAt ? new Date(right.lastSignalAt).getTime() : 0
          const leftTime = left.lastSignalAt ? new Date(left.lastSignalAt).getTime() : 0
          return rightTime - leftTime || right.evidenceCount - left.evidenceCount
        })
        .slice(0, 6),
    [dataset.sourceRegistry],
  )

  const connectorAttention = useMemo(
    () => dataset.connectorSignals.filter((signal) => signal.status !== 'Healthy').slice(0, 5),
    [dataset.connectorSignals],
  )

  const liveSourceCount = dataset.sourceRegistry.filter((source) => source.status === 'live').length
  const connectorGapCount = dataset.connectorSignals.filter((signal) => signal.status !== 'Healthy').length
  const changeItems = warehouse.changeWatch.slice(0, 5)
  const kpiCandidates = warehouse.kpiCandidates.slice(0, 5)
  const latestDriveFolders = useMemo(
    () =>
      [...warehouse.recentLanes, ...warehouse.lanes]
        .filter((lane, index, lanes) => lane.isFolder && lanes.findIndex((candidate) => candidate.id === lane.id) === index)
        .sort((left, right) => {
          const rightTime = new Date(right.lastActivityAt || right.modifiedTime || right.createdTime || 0).getTime()
          const leftTime = new Date(left.lastActivityAt || left.modifiedTime || left.createdTime || 0).getTime()
          return rightTime - leftTime
        })
        .slice(0, 3),
    [warehouse.lanes, warehouse.recentLanes],
  )
  const workbookMetricCount = pipelineStats?.workbooks?.metric_candidate_count ?? warehouse.kpiCandidates.length
  const workbookSelectedCount = pipelineStats?.workbooks?.selected_count ?? warehouse.summary.workbookCount
  const gmailReadyCount = gmailStatus?.summary?.ready_count ?? pipelineStats?.communications?.gmail_ready_count ?? 0
  const gmailSourceCount = gmailStatus?.summary?.source_count ?? pipelineStats?.communications?.gmail_source_count ?? 0
  const botReadyCount = botStatus?.summary?.ready_count ?? pipelineStats?.communications?.bot_ready_count ?? 0
  const botSourceCount = botStatus?.summary?.bot_source_count ?? pipelineStats?.communications?.bot_source_count ?? 0
  const lastRefreshAt = pipelineStats?.refresh_loop?.latest_at || warehouse.lastSyncedAt || dataset.updatedAt
  const refreshStatus = pipelineStats?.refresh_loop?.status || 'watch'
  const dailyCloseItems = useMemo(() => buildYtfDailyCloseItems('plant'), [])
  const latestSignalDays = daysSince(pipelineStats?.source_records?.latest_modified_time || warehouse.lastSyncedAt || dataset.updatedAt)
  const staleSourceCount = dataset.sourceRegistry.filter((source) => {
    const age = daysSince(source.lastSignalAt)
    return age === null || age > 30
  }).length
  const ragCandidateCount = pipelineStats?.source_records?.rag_candidate_count ?? warehouse.knowledgeRuntime.summary.chunkCount
  const changeEventCount = pipelineStats?.source_changes?.recent_event_count ?? warehouse.changeWatch.length
  const shortcutCount = warehouse.summary.shortcutCount
  const cleanupCount = warehouse.summary.cleanupLaneCount
  const plantCounts = pipelineStats?.source_records?.by_plant ?? {}
  const plantARecordCount = plantCounts['Plant A'] ?? plantCounts['plant_a'] ?? plantCounts.plant_a ?? 0
  const plantBRecordCount = plantCounts['Plant B'] ?? plantCounts['plant_b'] ?? plantCounts.plant_b ?? 0
  const databaseLabel = pipelineStats?.database?.external
    ? 'Cloud history'
    : pipelineStats?.database?.configured
      ? 'Local history'
      : 'Storage needed'
  const ownerReviewCards = [
    {
      title: 'Review file values',
      value: compactNumber(kpiCandidates.length || workbookMetricCount),
      note: 'Use only after owner review.',
      route: '/app/data-quality',
    },
    {
      title: 'Freshness gaps',
      value: latestSignalDays === null ? `${staleSourceCount} stale` : `${latestSignalDays}d`,
      note: `${staleSourceCount} sources need attention.`,
      route: '/app/change-monitor',
    },
    {
      title: 'Private comms intake',
      value: `${gmailReadyCount + botReadyCount}/${(gmailSourceCount || 0) + (botSourceCount || 0) || 8}`,
      note: 'Admin-only source processing.',
      route: '/app/email',
      adminOnly: true,
    },
    {
      title: 'Database',
      value: databaseLabel,
      note: `${compactNumber(warehouse.summary.canonicalRecordCount)} canonical records.`,
      route: '/app/data-fabric',
    },
  ]
  const release25Items = [
    { no: 4, title: 'File freshness', value: staleSourceCount ? `${staleSourceCount} stale` : 'Clear', route: '/app/change-monitor' },
    { no: 5, title: 'Changed-file monitor', value: `${compactNumber(changeEventCount)} recent`, route: '/app/change-monitor' },
    { no: 6, title: 'Workbook value mining', value: `${compactNumber(workbookMetricCount)}/${compactNumber(workbookSelectedCount)}`, route: '/app/data-quality' },
    { no: 7, title: 'Team confirm/fix', value: `${compactNumber(dataset.summary.pendingApprovalCount)} pending`, route: '/app/action-board' },
    { no: 8, title: 'Exportable snapshot', value: 'Ready', route: '/app/data-fabric' },
    { no: 9, title: 'Plant A baseline', value: compactNumber(plantARecordCount || warehouse.summary.canonicalRecordCount), route: '/app/plant-manager' },
    { no: 10, title: 'Plant B staging', value: plantBRecordCount ? compactNumber(plantBRecordCount) : 'Mapped', route: '/app/change-monitor' },
    { no: 11, title: 'Shortcut cleanup', value: `${compactNumber(shortcutCount)}/${compactNumber(cleanupCount)}`, route: '/app/data-quality' },
    { no: 12, title: 'Supplier comms intake', value: `${gmailReadyCount}/${gmailSourceCount || 4}`, route: '/app/email' },
    { no: 13, title: 'Director comms intake', value: gmailStatus?.gmail?.status || 'Watched', route: '/app/email' },
    { no: 14, title: 'Chat bridge intake', value: `${botReadyCount}/${botSourceCount || 4}`, route: '/app/email' },
    { no: 15, title: 'Attachment/OCR queue', value: `${compactNumber(ragCandidateCount)} docs`, route: '/app/knowledge' },
    { no: 16, title: 'RAG evidence packs', value: compactNumber(warehouse.knowledgeRuntime.summary.retrievalPackCount), route: '/app/knowledge' },
    { no: 17, title: 'Knowledge graph', value: `${compactNumber(warehouse.knowledgeRuntime.summary.graphNodeCount)} nodes`, route: '/app/ai-stack' },
    { no: 18, title: 'Feature mart', value: `${compactNumber(dataset.learningDatabase.featureSetCount)} sets`, route: '/app/data-quality' },
    { no: 19, title: 'Anomaly flags', value: `${compactNumber(warehouse.summary.highRiskCount)} high`, route: '/app/action-board' },
    { no: 20, title: 'Daily close capture', value: `${dailyCloseItems.length} forms`, route: '/app/daily-entry' },
    { no: 21, title: 'Role workspaces', value: `${dataset.managerPrograms.length} roles`, route: '/app/portal' },
    { no: 22, title: 'ISO traceability', value: `${compactNumber(dataset.learningDatabase.lineageEventCount)} events`, route: '/app/invisible-iso' },
    { no: 23, title: 'Action routing', value: `${compactNumber(dataset.summary.openTaskCount)} open`, route: '/app/action-board' },
    { no: 24, title: 'Mobile-first entry', value: `${warehouse.knowledgeRuntime.mobileSurfaces.length} surfaces`, route: '/app/daily-entry' },
    { no: 25, title: 'Owner brief', value: 'Live', route: '/app/owner-brief' },
  ]
  const operatingInsights = useMemo(
    () => buildYtfOperatingInsights(dataset, warehouse, { audience: 'plant', limit: 6 }),
    [dataset, warehouse],
  )
  const sourceRecordCount = pipelineStats?.source_records?.count ?? warehouse.summary.canonicalRecordCount
  const sourceChangeEventCount = pipelineStats?.source_changes?.event_count ?? warehouse.changeWatch.length
  const sourceChangeReviewCount =
    pipelineStats?.source_changes?.promoted_task_count ??
    pipelineStats?.source_changes?.task_promotion?.review_task_count ??
    0
  const knowledgeChunkCount = pipelineStats?.knowledge?.chunk_count ?? warehouse.knowledgeRuntime.summary.chunkCount
  const capabilityProfile = useMemo(() => getCapabilityProfileForRole(session?.role), [session?.role])
  const roleDataView = useMemo(
    () =>
      resolveRoleDataView(session?.role, capabilityProfile.capabilities, {
        sourceRecordCount,
        sourceChangeCount: sourceChangeEventCount,
        reviewTaskCount: sourceChangeReviewCount,
        latestMetricCount: workbookMetricCount,
        officialKpiCount: workbookSelectedCount,
        knowledgeChunkCount,
        liveSourceCount,
        connectorGapCount,
        openTaskCount: dataset.summary.openTaskCount,
        pendingApprovalCount: dataset.summary.pendingApprovalCount,
      }),
    [
      capabilityProfile.capabilities,
      connectorGapCount,
      dataset.summary.openTaskCount,
      dataset.summary.pendingApprovalCount,
      knowledgeChunkCount,
      session?.role,
      sourceChangeEventCount,
      sourceChangeReviewCount,
      sourceRecordCount,
      workbookMetricCount,
      workbookSelectedCount,
      liveSourceCount,
    ],
  )
  const canRunDataManager = hasAnyCapability(session, DATA_MANAGER_CAPABILITIES)
  const canExportSourceSnapshot = hasAnyCapability(session, DATA_EXPORT_CAPABILITIES)
  const canSeeTechnicalSources = hasAnyCapability(session, TECHNICAL_SOURCE_CAPABILITIES)
  const roleSafeOwnerReviewCards = ownerReviewCards.filter((card) => {
    if (card.adminOnly && !canSeeTechnicalSources) return false
    return canAccessPortalRoute(card.route, session)
  })
  const roleSafeReleaseItems = canSeeTechnicalSources ? release25Items.filter((item) => canAccessPortalRoute(item.route, session)) : []
  const roleSafeInsights = operatingInsights.filter((insight) => canAccessPortalRoute(insight.route, session))

  function handleExportSnapshot() {
    if (!canExportSourceSnapshot) {
      setMessage('Export is limited to director, knowledge, connector, and admin roles.')
      return
    }
    const payload = {
      generated_at: new Date().toISOString(),
      role_view: roleDataView,
      source: dataset.source,
      updated_at: dataset.updatedAt,
      warehouse: {
        mode: warehouse.mode,
        last_synced_at: warehouse.lastSyncedAt,
        summary: warehouse.summary,
      },
      pipeline: pipelineStats,
      gmail: gmailStatus?.summary,
      bots: botStatus?.summary,
      owner_review: ownerReviewCards,
      build_map_4_to_25: release25Items,
    }
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ytf-data-snapshot-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setMessage('Snapshot exported from the current live view.')
  }

  async function handleRunManager() {
    if (!canRunDataManager) {
      setMessage('Refresh is limited to operations, quality, director, and admin roles.')
      return
    }
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await runYtfDataManager()
      await load()
      setMessage(
        `Data manager saved ${result.saved?.metrics ?? 0} metrics and ${result.saved?.actions ?? 0} actions.`,
      )
    } catch {
      setError('Could not refresh data. Check saved history and cloud job access.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row">
        <div>
          <p className="sm-kicker">Data</p>
          <h1>Insights, not folders.</h1>
          <p>Latest file and workbook signals, turned into useful values, work, and evidence.</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{loading ? 'Loading' : `Updated ${formatDateTime(dataset.updatedAt || warehouse.lastSyncedAt)}`}</span>
          <span>{dataset.source === 'live' && warehouse.mode === 'live' ? 'Live data' : 'Baseline + live checks'}</span>
          <span>{capabilityProfile.label}</span>
        </div>
      </section>

      <section className="sm-ytf-action-grid" aria-label="Data actions">
        <button className="sm-ytf-action-tile is-primary" type="button" onClick={handleRunManager} disabled={busy || !canRunDataManager}>
          <span>
            <strong>{busy ? 'Refreshing insights' : canRunDataManager ? 'Refresh insights' : 'Review-only'}</strong>
            <small>{canRunDataManager ? 'Build file values and work items.' : 'Your role can inspect the safe view.'}</small>
          </span>
          <span className="sm-ytf-action-arrow">Run</span>
        </button>
        <Link className="sm-ytf-action-tile" to={roleDataView.nextBestAction.route}>
          <span>
            <strong>{roleDataView.nextBestAction.label}</strong>
            <small>{roleDataView.nextBestAction.detail}</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/action-board">
          <span>
            <strong>Open actions</strong>
            <small>Route owners, due dates, and closeout.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/daily-entry">
          <span>
            <strong>Daily close</strong>
            <small>Enter the missing fact once.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/plant-manager">
          <span>
            <strong>Plant review</strong>
            <small>Confirm or fix the output.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
      </section>

      {(message || error) && <p className="sm-ytf-alert">{message || error}</p>}

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker">Your role-safe data view</p>
            <h2>{roleDataView.title}</h2>
            <p>{roleDataView.subtitle}</p>
          </div>
          <Link className="sm-ytf-action-arrow" to={roleDataView.defaultRoute}>
            Open default desk
          </Link>
        </div>
        <div className="sm-ytf-signal-grid">
          {roleDataView.kpis.slice(0, 4).map((metric) => (
            <Link className="sm-ytf-mini-card" key={`${metric.label}-${metric.route}`} to={metric.route}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </Link>
          ))}
        </div>
        <div className="sm-ytf-action-grid mt-5">
          <article className="sm-ytf-action-tile">
            <span>
              <strong>Visible data</strong>
              <small>{roleDataView.visibleData.slice(0, 4).join(', ')}</small>
            </span>
          </article>
          <article className="sm-ytf-action-tile">
            <span>
              <strong>Hidden data</strong>
              <small>{roleDataView.hiddenData.slice(0, 4).join(', ')}</small>
            </span>
          </article>
          <article className="sm-ytf-action-tile">
            <span>
              <strong>ISO controls</strong>
              <small>{roleDataView.isoControls.slice(0, 3).join(', ')}</small>
            </span>
          </article>
          <article className="sm-ytf-action-tile">
            <span>
              <strong>AI actions</strong>
              <small>{roleDataView.aiActions.slice(0, 3).join(', ')}</small>
            </span>
          </article>
        </div>
      </section>

      <section className="sm-ytf-metric-strip is-five">
        <Link to="/app/data-fabric">
          <span>Records organized</span>
          <strong>{compactNumber(sourceRecordCount)}</strong>
          <small>Rebuilt into saved plant records.</small>
        </Link>
        <Link to="/app/change-monitor">
          <span>File changes</span>
          <strong>{compactNumber(sourceChangeEventCount)}</strong>
          <small>{compactNumber(sourceChangeReviewCount)} review tasks.</small>
        </Link>
        <Link to="/app/change-monitor">
          <span>Data lanes</span>
          <strong>{liveSourceCount}/{dataset.sourceRegistry.length}</strong>
          <small>{connectorGapCount} source gaps.</small>
        </Link>
        <Link to="/app/data-quality">
          <span>File fields</span>
          <strong>{compactNumber(workbookMetricCount)}</strong>
          <small>Review before official use.</small>
        </Link>
        <Link to="/app/knowledge">
          <span>AI context</span>
          <strong>{compactNumber(knowledgeChunkCount)}</strong>
          <small>{databaseLabel}.</small>
        </Link>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker">Live data map</p>
            <h2>What is feeding the ERP.</h2>
          </div>
          <div className="sm-ytf-chip-line is-inline">
            <span className="sm-status-pill">
              {statusText(refreshStatus)} - {formatDateTime(lastRefreshAt)}
            </span>
            <button className="sm-button-secondary" type="button" onClick={handleExportSnapshot} disabled={!canExportSourceSnapshot}>
              {canExportSourceSnapshot ? 'Export' : 'Director export'}
            </button>
          </div>
        </div>

        <div className="sm-ytf-signal-grid">
          {roleSafeOwnerReviewCards.map((card) => (
            <Link className="sm-ytf-mini-card" key={card.title} to={card.route}>
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </Link>
          ))}
        </div>

        <div className="sm-ytf-compact-list mt-5">
          {latestDriveFolders.map((folder) => (
            <Link className="sm-ytf-list-row" key={folder.id} to="/app/action-board">
              <span>
                <strong>{folder.title}</strong>
                <small>{folder.domain} - transformed into review work {formatDateTime(folder.lastActivityAt || folder.modifiedTime)}</small>
              </span>
              <em>{compactNumber(folder.canonicalRecordCount)} records</em>
            </Link>
          ))}
          {!latestDriveFolders.length && <p className="sm-ytf-empty">Transformed source activity will appear after the next warehouse sync.</p>}
        </div>
      </section>

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Latest insights</p>
              <h2>Click one to act.</h2>
            </div>
            <Link className="sm-ytf-action-arrow" to="/app/action-board">
              Actions
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {roleSafeInsights.map((insight) => (
              <Link className="sm-ytf-list-row sm-ytf-insight-row" key={insight.id} to={insight.route}>
                <span>
                  <strong>{insight.title}</strong>
                  <small>{insight.owner} - {compact(insight.signal)}</small>
                </span>
                <em>{insight.metric}</em>
              </Link>
            ))}
            {!roleSafeInsights.length && <p className="sm-ytf-empty">No role-safe insight packet is available yet. Refresh insights first.</p>}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Daily close</p>
              <h2>Our own operating sheet.</h2>
            </div>
            <Link className="sm-ytf-action-arrow" to="/app/daily-entry">
              Enter
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {dailyCloseItems.map((item) => (
              <Link className="sm-ytf-list-row sm-ytf-insight-row" key={item.id} to={item.route}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.owner} - {item.prompt}</small>
                </span>
                <em>{item.metric}</em>
              </Link>
            ))}
          </div>
        </article>
      </section>

      {canSeeTechnicalSources && (
        <details className="sm-ytf-panel sm-ytf-details">
          <summary>Admin build map</summary>
          <div>
            <div className="sm-ytf-build-list">
              {roleSafeReleaseItems.map((item) => (
                <Link className="sm-ytf-build-item" key={item.no} to={item.route}>
                  <span>{item.no}</span>
                  <strong>{item.title}</strong>
                  <em>{item.value}</em>
                </Link>
              ))}
            </div>
          </div>
        </details>
      )}

      <details className="sm-ytf-panel sm-ytf-details">
        <summary>Value review queue</summary>
        <div>
      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Changed files</p>
              <h2>Team confirmation.</h2>
            </div>
          </div>
          <div className="sm-ytf-compact-list">
            {changeItems.map((item) => (
              <Link className="sm-ytf-list-row" key={item.id} to={item.route || '/app/action-board'}>
                <span>
                  <strong>{compact(item.nextAction || item.title, 72)}</strong>
                  <small>
                    {item.owner} - {compact(item.signal)}
                  </small>
                </span>
                <em>{item.priority}</em>
              </Link>
            ))}
            {!changeItems.length && <p className="sm-ytf-empty">No changed-file packet is available yet.</p>}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">File values</p>
              <h2>Use only after review.</h2>
            </div>
          </div>
          <div className="sm-ytf-compact-list">
            {kpiCandidates.map((candidate) => (
              <Link className="sm-ytf-list-row" key={candidate.id} to={candidate.route || '/app/data-quality'}>
                <span>
                  <strong>{candidate.name}</strong>
                  <small>
                    {candidate.owner} - {compact(candidate.formulaHint)}
                  </small>
                </span>
                <em>{candidate.stage}</em>
              </Link>
            ))}
            {!kpiCandidates.length && <p className="sm-ytf-empty">Refresh data to build file values.</p>}
          </div>
        </article>
      </section>
        </div>
      </details>

      <details className="sm-ytf-panel sm-ytf-details">
        <summary>{canSeeTechnicalSources ? 'Technical source health' : 'Data boundaries'}</summary>
        <div>
        {!canSeeTechnicalSources ? (
          <section className="sm-ytf-action-grid">
            <article className="sm-ytf-action-tile">
              <strong>Role boundary</strong>
              <small>Your role sees metrics, actions, and evidence it can act on. Connector internals stay with admins.</small>
            </article>
            <article className="sm-ytf-action-tile">
              <strong>Source proof</strong>
              <small>Every AI insight should point back to an owner, input source, and review checkpoint before writeback.</small>
            </article>
            <article className="sm-ytf-action-tile">
              <strong>Request access</strong>
              <small>Ask the tenant admin if you need raw source, connector, or export privileges.</small>
            </article>
          </section>
        ) : (
        <section className="sm-ytf-split">
          <article>
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker">Source health</p>
                <h2>Admin-only checks.</h2>
              </div>
              <Link className="sm-ytf-action-arrow" to="/app/change-monitor">
                Monitor
              </Link>
            </div>
            <div className="sm-ytf-compact-list">
              {sourceRegistry.map((source) => (
                <Link className="sm-ytf-list-row" key={source.id} to={source.route || '/app/data-fabric'}>
                  <span>
                    <strong>{source.name}</strong>
                    <small>{source.coverage} - {formatDateTime(source.lastSignalAt)}</small>
                  </span>
                  <em>{statusText(source.status)}</em>
                </Link>
              ))}
            </div>
          </article>

          <article>
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker">Connector attention</p>
                <h2>Setup blockers.</h2>
              </div>
              <Link className="sm-ytf-action-arrow" to="/app/action-board">
                Actions
              </Link>
            </div>
            <div className="sm-ytf-compact-list">
              {connectorAttention.map((signal) => (
                <Link className="sm-ytf-list-row" key={signal.id} to={signal.route || '/app/action-board'}>
                  <span>
                    <strong>{signal.name}</strong>
                    <small>{signal.backlog || signal.nextAutomation}</small>
                  </span>
                  <em>{statusText(signal.status)}</em>
                </Link>
              ))}
              {!connectorAttention.length && <p className="sm-ytf-empty">Configured connectors look healthy.</p>}
            </div>
          </article>
        </section>
        )}
        <div className="sm-ytf-action-grid">
          <article className="sm-ytf-action-tile">
            <strong>Cloud history</strong>
            <small>Saved cloud history and scheduled refresh must stay configured before production history is official.</small>
          </article>
          <article className="sm-ytf-action-tile">
            <strong>Change monitor</strong>
            <small>Use event-style change tracking instead of manual review.</small>
          </article>
          <article className="sm-ytf-action-tile">
            <strong>Team confirmation</strong>
            <small>Every important value or work item needs a human owner before it becomes official.</small>
          </article>
          <article className="sm-ytf-action-tile">
            <strong>Role packs</strong>
            <small>Operations, maintenance, quality, sales, and admin get separate entry defaults.</small>
          </article>
        </div>
        </div>
      </details>
    </div>
  )
}
