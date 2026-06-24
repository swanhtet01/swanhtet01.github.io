import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { getSeedDataFabricDataset, loadDataFabricDataset, type DataFabricDataset } from '../lib/dataFabricApi'
import { YTF_WORKSPACE_BLUEPRINTS, resolveYtfWorkspaceId, type YtfWorkspaceId } from '../lib/ytfWorkspaceModel'
import {
  getWorkspaceSession,
  getMetricRecords,
  getYtfDashboardSummary,
  getYtfKpiDefinitionsLatest,
  getYtfBotPipeline,
  getYtfGmailStatus,
  getYtfKnowledgeStatus,
  getYtfOperatingMetrics,
  getYtfPipelineStats,
  listWorkspaceTasks,
  loadCachedWorkspaceSession,
  queryYtfKnowledgeVector,
  type EnterpriseMetricRecord,
  type WorkspaceTaskRow,
  type WorkspaceSessionPayload,
  type YtfBotPipelineResult,
  type YtfDashboardSummaryResult,
  type YtfGmailStatusResult,
  type YtfKnowledgeStatusResult,
  type YtfOperatingMetricsResult,
  type YtfPipelineStatsResult,
} from '../lib/workspaceApi'
import { YTF_PLANT_A_ENTRY_PACKS, type YtfPlantAEntryPack } from '../lib/ytfPlantATeamModel'
import { getVerifiedYtfDashboardFallback, YTF_VERIFIED_PIPELINE_SNAPSHOT } from '../lib/ytfVerifiedSnapshot'
import {
  selectTopYtfOperatingRows,
  ytfOperatingMetricContext,
  ytfOperatingMetricSource,
  ytfOperatingMetricTitle,
  ytfOperatingMetricValue,
} from '../lib/ytfMetricRows'

type SessionState = Awaited<ReturnType<typeof getWorkspaceSession>>['session']
const VERIFIED_YTF_DASHBOARD = getVerifiedYtfDashboardFallback()

const PORTAL_WORKSPACE_MODES: Record<
  YtfWorkspaceId,
  {
    railLabel: string
    badge: string
    title: string
    detail: string
    primaryRoute: string
    primaryLabel: string
    secondaryRoute: string
    secondaryLabel: string
    steps: string[]
  }
> = {
  admin: {
    railLabel: 'Admin workspace',
    badge: YTF_WORKSPACE_BLUEPRINTS.admin.badge,
    title: YTF_WORKSPACE_BLUEPRINTS.admin.title,
    detail: YTF_WORKSPACE_BLUEPRINTS.admin.summary,
    primaryRoute: YTF_WORKSPACE_BLUEPRINTS.admin.route,
    primaryLabel: YTF_WORKSPACE_BLUEPRINTS.admin.primaryActionLabel,
    secondaryRoute: YTF_WORKSPACE_BLUEPRINTS.admin.secondaryRoute,
    secondaryLabel: YTF_WORKSPACE_BLUEPRINTS.admin.secondaryActionLabel,
    steps: ['Check users and roles.', 'Check data health.', 'Keep only the work areas the team needs this week.'],
  },
  manager: {
    railLabel: 'Manager workspace',
    badge: YTF_WORKSPACE_BLUEPRINTS.manager.badge,
    title: YTF_WORKSPACE_BLUEPRINTS.manager.title,
    detail: YTF_WORKSPACE_BLUEPRINTS.manager.summary,
    primaryRoute: YTF_WORKSPACE_BLUEPRINTS.manager.route,
    primaryLabel: YTF_WORKSPACE_BLUEPRINTS.manager.primaryActionLabel,
    secondaryRoute: YTF_WORKSPACE_BLUEPRINTS.manager.secondaryRoute,
    secondaryLabel: YTF_WORKSPACE_BLUEPRINTS.manager.secondaryActionLabel,
    steps: ['Record the fact and owner.', 'Add the board photo, quantity, or note on the same record.', 'Escalate only if the issue crosses teams or shifts.'],
  },
  plant: {
    railLabel: 'Plant Manager workspace',
    badge: YTF_WORKSPACE_BLUEPRINTS.plant.badge,
    title: YTF_WORKSPACE_BLUEPRINTS.plant.title,
    detail: YTF_WORKSPACE_BLUEPRINTS.plant.summary,
    primaryRoute: YTF_WORKSPACE_BLUEPRINTS.plant.route,
    primaryLabel: YTF_WORKSPACE_BLUEPRINTS.plant.primaryActionLabel,
    secondaryRoute: YTF_WORKSPACE_BLUEPRINTS.plant.secondaryRoute,
    secondaryLabel: YTF_WORKSPACE_BLUEPRINTS.plant.secondaryActionLabel,
    steps: ['Open the owning desk first if the issue is already clear.', 'Use Action Board if the update is still messy.', 'Use Plant Manager only for cross-team work and control action.'],
  },
}

type TodayAction = {
  label: string
  route: string
  metric: string
  detail: string
  evidence: string
}

type SourceChangeEvent = NonNullable<NonNullable<YtfPipelineStatsResult['source_changes']>['events']>[number]

type RoleDashboardBlueprint = {
  packId: YtfPlantAEntryPack['id']
  shortLabel: string
  dataLane: string
  primaryMetric: string
  nextEntry: string
  reviewRoute: string
  reviewLabel: string
  dataRoute: string
}

const PORTAL_TODAY_ACTIONS: Record<YtfWorkspaceId, TodayAction[]> = {
  manager: [
    {
      label: 'Enter today',
      route: '/app/daily-entry',
      metric: '2 min',
      detail: 'Log one fact, one owner, and the evidence.',
      evidence: 'Board photo, quantity, shift, or note.',
    },
    {
      label: 'Open work',
      route: '/app/action-board',
      metric: 'Open',
      detail: 'See the work already waiting for the team.',
      evidence: 'Owner and due window.',
    },
    {
      label: 'Find document',
      route: '/app/documents',
      metric: 'Records',
      detail: 'Use the controlled record or attach a new note.',
      evidence: 'SOP, COA, packet, or audit note.',
    },
  ],
  plant: [
    {
      label: 'Plant check',
      route: '/app/plant-manager',
      metric: 'Daily',
      detail: 'Start with cross-team holds and stale actions.',
      evidence: 'Receiving, quality, maintenance, and shift evidence.',
    },
    {
      label: 'Control quality',
      route: '/app/dqms',
      metric: 'CAPA',
      detail: 'Open containment, defect, and root-cause work.',
      evidence: 'Batch, defect, owner, containment, and result.',
    },
    {
      label: 'Plant data',
      route: '/app/live-data?view=operate',
      metric: 'Live',
      detail: 'Open plant map, latest numbers, and useful rows.',
      evidence: 'Output, rejects, downtime, stock, and evidence.',
    },
  ],
  admin: [
    {
      label: 'Open data',
      route: '/app/live-data?view=operate',
      metric: 'Live',
      detail: 'See operating values, team work, messages, and hidden data health.',
      evidence: 'Freshness, useful rows, work items, and role-safe views.',
    },
    {
      label: 'Setup portal',
      route: '/app/platform-admin',
      metric: 'Setup',
      detail: 'Manage users, roles, data checks, and launch settings.',
      evidence: 'Role access, data status, cloud jobs, and change trail.',
    },
    {
      label: 'System health',
      route: '/app/system',
      metric: 'Health',
      detail: 'Check if the private tenant, saved data, cloud jobs, and business records are stable.',
      evidence: 'Login, saved data, email, and search status.',
    },
  ],
}

const ROLE_DASHBOARD_BLUEPRINTS: RoleDashboardBlueprint[] = [
  {
    packId: 'production-flow',
    shortLabel: 'Production',
    dataLane: 'Plant A production, OT, shift, output, and whiteboard sources',
    primaryMetric: 'Plant A records',
    nextEntry: 'Output, issue, handoff, or whiteboard photo',
    reviewRoute: '/app/operations',
    reviewLabel: 'Operations',
    dataRoute: '/app/live-data?scope=plant-a&view=kpi',
  },
  {
    packId: 'reliability-utility',
    shortLabel: 'Maintenance',
    dataLane: 'Downtime, machine, repair, utility, and spare-part signals',
    primaryMetric: 'Maintenance signals',
    nextEntry: 'Machine stop, downtime minutes, next action, evidence',
    reviewRoute: '/app/maintenance',
    reviewLabel: 'Maintenance',
    dataRoute: '/app/live-data?scope=plant-a&view=kpi',
  },
  {
    packId: 'quality',
    shortLabel: 'QC',
    dataLane: 'Claims, defects, holds, ISO forms, and release evidence',
    primaryMetric: 'Quality records',
    nextEntry: 'Claim, defect, hold, containment, photo',
    reviewRoute: '/app/dqms',
    reviewLabel: 'DQMS',
    dataRoute: '/app/live-data?scope=plant-a&view=kpi',
  },
  {
    packId: 'admin-planning',
    shortLabel: 'Admin / Planning',
    dataLane: 'Planning, HR, document control, training, and daily close',
    primaryMetric: 'Admin records',
    nextEntry: 'Document, training, schedule, or daily close gap',
    reviewRoute: '/app/documents',
    reviewLabel: 'Files',
    dataRoute: '/app/live-data?scope=plant-a&view=data',
  },
  {
    packId: 'sales-inventory',
    shortLabel: 'Sales / Inventory',
    dataLane: 'Showroom, sales, stock movement, dealer, and money signals',
    primaryMetric: 'Commercial records',
    nextEntry: 'Stock movement, dealer issue, collection, or sales note',
    reviewRoute: '/app/revenue',
    reviewLabel: 'Sales',
    dataRoute: '/app/live-data?scope=plant-a&view=kpi',
  },
]

const ROLE_PACK_BY_ID = new Map<string, YtfPlantAEntryPack>(YTF_PLANT_A_ENTRY_PACKS.map((pack) => [pack.id, pack]))

function getSessionFallback(): WorkspaceSessionPayload {
  return loadCachedWorkspaceSession() ?? {
    status: 'cached_unavailable',
    auth_required: true,
    authenticated: false,
    session: null,
  }
}

async function getWorkspaceSessionWithFallback(timeoutMs = 1200) {
  return await Promise.race([
    getWorkspaceSession().catch(() => getSessionFallback()),
    new Promise<WorkspaceSessionPayload>((resolve) => {
      setTimeout(() => resolve(getSessionFallback()), timeoutMs)
    }),
  ])
}

async function loadDataFabricDatasetWithFallback(timeoutMs = 1200) {
  return await Promise.race([
    loadDataFabricDataset().catch(() => getSeedDataFabricDataset()),
    new Promise<DataFabricDataset>((resolve) => {
      setTimeout(() => resolve(getSeedDataFabricDataset()), timeoutMs)
    }),
  ])
}

async function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 1500) {
  return await Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs)
    }),
  ])
}

function getMetricRows(payload: Awaited<ReturnType<typeof getMetricRecords>> | null) {
  return ((payload?.enterprise?.rows ?? payload?.rows ?? []) as EnterpriseMetricRecord[]).filter((row) => row.metric_name)
}

function metricLabel(metric: EnterpriseMetricRecord) {
  const value = String(metric.metric_value ?? '').trim()
  const unit = String(metric.unit ?? '').trim()
  if (!value) return metric.status === 'approved_definition' ? 'Definition' : 'Pending'
  return [value, unit && unit !== 'definition' ? unit : ''].filter(Boolean).join(' ')
}

function compactDateTime(value?: string) {
  if (!value) return 'Updated'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function compactNumber(value: number) {
  return value ? value.toLocaleString() : '0'
}

function toPercent(value: number, total: number) {
  if (!total || total < 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

function formatVectorMode(mode: string) {
  const normalized = String(mode || '').trim().toLowerCase()
  if (normalized.includes('pgvector') && normalized.includes('ready')) return 'Search ready'
  if (normalized.includes('semantic')) return 'Semantic'
  if (normalized.includes('token')) return 'Text search'
  return mode ? mode.replace(/_/g, ' ') : 'System ready'
}

function sourceEventTitle(event: SourceChangeEvent) {
  return event.title || event.summary || event.domain || 'Factory update'
}

function sourceEventMeta(event: SourceChangeEvent) {
  return [event.change_type, event.department || event.domain, event.plant].filter(Boolean).join(' / ') || 'Data update'
}

function isHumanYtfWorkTask(task: WorkspaceTaskRow) {
  const haystack = `${task.title} ${task.template} ${task.notes} ${task.owner}`.toLowerCase()
  if (/qa smoke|ytf-smoke|test record|restaurant|founder|module pack|module proof|adaptive module|saas|supermega|product line|release gate|portfolio|client walkthrough|prototype|market wedge|go-to-market|r&d|research|platform build|product ops|portal factory/.test(haystack)) return false
  return !/extract kpi|kpi candidate|changed source|source record|review this record|needs review|service account|data manager|connector|pipeline|sync|refresh|governance update|open director|open plant|convert the signal|owner and admin|admin data steward|ranked for/.test(haystack)
}

function isNeedsUpdateTask(task: WorkspaceTaskRow) {
  const status = String(task.status || '').trim().toLowerCase()
  return status === 'needs_proof' || status === 'needs_source' || status === 'in_progress'
}

function taskDueLabel(task: WorkspaceTaskRow) {
  const due = String(task.due || '').trim()
  return due || 'No due'
}

export function TenantPortalHomePage() {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionState | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [dataFabric, setDataFabric] = useState<DataFabricDataset | null>(null)
  const [pipelineStats, setPipelineStats] = useState<YtfPipelineStatsResult | null>(() => YTF_VERIFIED_PIPELINE_SNAPSHOT)
  const [knowledgeStatus, setKnowledgeStatus] = useState<YtfKnowledgeStatusResult | null>(null)
  const [gmailStatus, setGmailStatus] = useState<YtfGmailStatusResult | null>(null)
  const [botPipeline, setBotPipeline] = useState<YtfBotPipelineResult | null>(null)
  const [dashboardSummary, setDashboardSummary] = useState<YtfDashboardSummaryResult | null>(() => VERIFIED_YTF_DASHBOARD)
  const [operatingMetrics, setOperatingMetrics] = useState<YtfOperatingMetricsResult | null>(null)
  const [workspaceTasks, setWorkspaceTasks] = useState<WorkspaceTaskRow[]>([])
  const [officialKpis, setOfficialKpis] = useState<EnterpriseMetricRecord[]>([])
  const [latestMetrics, setLatestMetrics] = useState<EnterpriseMetricRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [activeMode, setActiveMode] = useState<YtfWorkspaceId>('manager')
  const [question, setQuestion] = useState('What changed and what should I check first?')
  const [answer, setAnswer] = useState('')
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [payload, nextDataFabric, nextSummary, nextOperatingMetrics, nextWorkspaceTasks] = await Promise.all([
          getWorkspaceSessionWithFallback(),
          loadDataFabricDatasetWithFallback(),
          withTimeout(getYtfDashboardSummary({ compact: true }), VERIFIED_YTF_DASHBOARD, 1500),
          withTimeout(getYtfOperatingMetrics(), null, 1500),
          withTimeout(listWorkspaceTasks('open', 80), null, 1500),
        ])
        let nextPipeline = nextSummary?.pipeline_stats ?? null
        let nextKnowledge = nextSummary?.knowledge_status ?? null
        let nextGmail = nextSummary?.gmail_status ?? null
        let nextBots = nextSummary?.bot_pipeline ?? null
        let nextKpis = nextSummary?.kpi_definitions ?? null
        let nextMetrics = nextSummary?.latest_metrics ?? null

        if (!nextSummary) {
          ;[nextPipeline, nextKnowledge, nextGmail, nextBots, nextKpis, nextMetrics] = await Promise.all([
            withTimeout(getYtfPipelineStats(), null, 1200),
            withTimeout(getYtfKnowledgeStatus(), null, 1200),
            withTimeout(getYtfGmailStatus(), null, 1200),
            withTimeout(getYtfBotPipeline(), null, 1200),
            withTimeout(getYtfKpiDefinitionsLatest(), null, 1200),
            withTimeout(getMetricRecords({ status: 'reported', limit: 8 }), null, 1200),
          ])
        }
        if (cancelled) {
          return
        }

        setSession(payload.session ?? null)
        setAuthenticated(Boolean(payload.authenticated))
        setDataFabric(nextDataFabric)
        setPipelineStats(nextPipeline)
        setKnowledgeStatus(nextKnowledge)
        setGmailStatus(nextGmail)
        setBotPipeline(nextBots)
        setDashboardSummary(nextSummary)
        setOperatingMetrics(nextOperatingMetrics)
        setWorkspaceTasks(nextWorkspaceTasks?.rows ?? [])
        setOfficialKpis(nextKpis?.rows ?? [])
        setLatestMetrics(getMetricRows(nextMetrics).filter((row) => row.metric_value).slice(0, 6))
        setError(payload.stale_session ? 'Connection is unstable. Using the last good session while the app reconnects.' : null)
      } catch (nextError) {
        if (!cancelled) {
          setAuthenticated(false)
          setSession(null)
          setDataFabric(getSeedDataFabricDataset())
          setPipelineStats(YTF_VERIFIED_PIPELINE_SNAPSHOT)
          setKnowledgeStatus(null)
          setGmailStatus(null)
          setBotPipeline(null)
          setDashboardSummary(VERIFIED_YTF_DASHBOARD)
          setOperatingMetrics(null)
          setWorkspaceTasks([])
          setOfficialKpis([])
          setLatestMetrics([])
          setError(nextError instanceof Error ? nextError.message : 'Portal home could not be loaded.')
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

  const activeModeConfig = PORTAL_WORKSPACE_MODES[activeMode]
  const homeTitle = activeMode === 'admin' ? 'Admin settings.' : activeMode === 'plant' ? 'Plant manager.' : 'Manager home.'
  const todayActions = PORTAL_TODAY_ACTIONS[activeMode]
  const primaryTodayAction = todayActions[0]
  const sourceRecordCount = pipelineStats?.source_records?.count ?? 0
  const sourceChangeCount = pipelineStats?.source_changes?.event_count ?? 0
  const reviewTaskCount = pipelineStats?.source_changes?.promoted_task_count ?? pipelineStats?.source_changes?.task_promotion?.review_task_count ?? 0
  const workbookMetricCount = pipelineStats?.workbooks?.metric_candidate_count ?? 0
  const actualMetricValueCount = operatingMetrics?.summary?.extracted_metric_value_count ?? 0
  const operatingLaneCount = operatingMetrics?.summary?.lane_count ?? 0
  const knowledgeChunkCount = pipelineStats?.knowledge?.chunk_count ?? knowledgeStatus?.summary?.chunk_count ?? 0
  const vectorMode = formatVectorMode(knowledgeStatus?.vector_readiness?.mode ?? (pipelineStats?.knowledge?.pgvector_ready ? 'pgvector ready' : 'token search'))
  const emailReady = gmailStatus?.summary?.ready_count ?? pipelineStats?.communications?.gmail_ready_count ?? 0
  const emailTotal = gmailStatus?.summary?.source_count ?? pipelineStats?.communications?.gmail_source_count ?? 0
  const botReady = botPipeline?.summary?.ready_count ?? pipelineStats?.communications?.bot_ready_count ?? 0
  const botTotal = botPipeline?.summary?.bot_source_count ?? pipelineStats?.communications?.bot_source_count ?? 0
  const manualMessages = pipelineStats?.communications?.manual_message_count ?? 0
  const refreshStatus = pipelineStats?.refresh_loop?.status || 'empty'
  const refreshLatestAt = pipelineStats?.refresh_loop?.latest_at || ''
  const refreshRunCount = pipelineStats?.refresh_loop?.run_count ?? 0
  const officialKpiCount = dashboardSummary?.kpi_definitions?.approved_count ?? officialKpis.length
  const latestMetricCount = dashboardSummary?.latest_metrics?.count ?? latestMetrics.length
  const latestMetricLead = latestMetrics[0] ?? null
  const topOperatingRows = useMemo(
    () =>
      selectTopYtfOperatingRows(operatingMetrics?.top_rows ?? [], 6, {
        preferredScope: activeMode === 'plant' || activeMode === 'manager' ? 'plant-a' : 'all',
        minYear: 2024,
      }),
    [activeMode, operatingMetrics?.top_rows],
  )
  const humanWorkRows = useMemo(
    () =>
      workspaceTasks
        .filter((task) => String(task.status || '').trim().toLowerCase() !== 'done')
        .filter(isHumanYtfWorkTask),
    [workspaceTasks],
  )
  const humanWorkCount = humanWorkRows.length
  const humanNeedUpdateCount = humanWorkRows.filter(isNeedsUpdateTask).length
  const isoEvidenceCount = officialKpiCount + reviewTaskCount
  const latestSourceEvents = useMemo(() => {
    const events =
      pipelineStats?.source_changes?.events?.length
        ? pipelineStats.source_changes.events
        : dashboardSummary?.story?.source_events ?? []
    return events.slice(0, 3)
  }, [dashboardSummary?.story?.source_events, pipelineStats?.source_changes?.events])
  const kpiCaptureGap = Math.max(officialKpiCount - latestMetricCount, 0)
  const connectorReady = emailReady + botReady
  const connectorTotal = emailTotal + botTotal
  const storyHeadline =
    activeMode === 'admin'
      ? 'Business records, operating values, and comms are connected behind the admin screen.'
      : activeMode === 'plant'
        ? 'Source and entry data become plant checks, daily close, ISO evidence, and owner follow-up.'
        : 'The team only needs today: enter the missing value, add evidence, and close the next action.'
  const transformedDataRoute = activeMode === 'admin' ? '/app/live-data?view=data' : activeMode === 'plant' ? '/app/live-data?view=operate' : '/app/action-board'
  const storyCards = useMemo(
    () => [
      {
        label: 'Records mapped',
        value: compactNumber(sourceRecordCount),
        detail: `${sourceChangeCount} record updates organized behind the scenes.`,
        route: transformedDataRoute,
        tone: 'primary',
      },
      {
        label: 'Daily input',
        value: kpiCaptureGap ? `${kpiCaptureGap} missing` : 'Covered',
        detail: `${actualMetricValueCount || latestMetricCount}/${officialKpiCount || 0} values are visible now.`,
        route: '/app/daily-entry',
        tone: kpiCaptureGap ? 'warning' : 'primary',
      },
      {
        label: 'Evidence',
        value: compactNumber(knowledgeChunkCount),
        detail: `${workbookMetricCount} structured values and ${operatingLaneCount} operating lanes feed role views.`,
        route: transformedDataRoute,
        tone: 'neutral',
      },
      {
        label: 'Data updates',
        value: compactNumber(reviewTaskCount),
        detail: 'Changed records organized behind the scenes.',
        route: '/app/action-board',
        tone: reviewTaskCount ? 'warning' : 'neutral',
      },
    ],
    [actualMetricValueCount, kpiCaptureGap, knowledgeChunkCount, latestMetricCount, officialKpiCount, operatingLaneCount, reviewTaskCount, sourceChangeCount, sourceRecordCount, transformedDataRoute, workbookMetricCount],
  )
  const storyBars = useMemo(
    () => [
      {
        label: 'Operating values',
        percent: toPercent(actualMetricValueCount || latestMetricCount, Math.max(actualMetricValueCount || latestMetricCount, officialKpiCount || 1)),
        detail: `${actualMetricValueCount || latestMetricCount} extracted values across ${operatingLaneCount || 0} lanes`,
        route: '/app/daily-entry',
      },
      {
        label: 'Factory memory',
        percent: toPercent(Math.min(knowledgeChunkCount, 300), 300),
        detail: `${knowledgeChunkCount} searchable context rows`,
        route: transformedDataRoute,
      },
      {
        label: 'Record updates',
        percent: toPercent(reviewTaskCount, sourceChangeCount || 1),
        detail: `${reviewTaskCount}/${sourceChangeCount || 0} updates routed`,
        route: activeMode === 'admin' ? '/app/live-data?view=data' : '/app/action-board',
      },
      {
        label: 'Comms intake',
        percent: toPercent(connectorReady, connectorTotal || 1),
        detail: `${connectorReady}/${connectorTotal || 0} email and bot sources ready`,
        route: '/app/email',
      },
    ],
    [activeMode, actualMetricValueCount, connectorReady, connectorTotal, knowledgeChunkCount, latestMetricCount, officialKpiCount, operatingLaneCount, reviewTaskCount, sourceChangeCount, transformedDataRoute],
  )
  const ownerFocusRows = useMemo(() => {
    if (dashboardSummary?.story?.owner_focus?.length) {
      return dashboardSummary.story.owner_focus
        .map((row) => ({
          label: row.label || 'Unassigned',
          count: Number(row.count || 0),
          route: row.route || '/app/live-data?view=data',
          sample: row.sample || 'Owner from the trusted register',
        }))
        .filter((row) => row.count > 0)
        .slice(0, 3)
    }

    const ownerCounts = new Map<string, { count: number; route: string; sample: string }>()

    for (const event of pipelineStats?.source_changes?.events ?? []) {
      const label = event.owner_hint || event.department || event.domain || 'Unassigned'
      const current = ownerCounts.get(label) ?? {
        count: 0,
        route: event.owning_route || '/app/live-data?view=data',
        sample: sourceEventTitle(event),
      }
      current.count += 1
      current.route = current.route || event.owning_route || '/app/live-data?view=data'
      ownerCounts.set(label, current)
    }

    if (!ownerCounts.size) {
      const byDomain = pipelineStats?.source_changes?.summary?.by_domain ?? pipelineStats?.source_records?.by_domain ?? {}
      for (const [label, count] of Object.entries(byDomain)) {
        if (!count) continue
        ownerCounts.set(label, {
          count,
          route: activeMode === 'admin' ? '/app/live-data?view=data' : '/app/action-board',
          sample: 'Operating lane from the trusted register',
        })
      }
    }

    return Array.from(ownerCounts.entries())
      .map(([label, value]) => ({ label, ...value }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 3)
  }, [activeMode, dashboardSummary?.story?.owner_focus, pipelineStats?.source_changes?.events, pipelineStats?.source_changes?.summary?.by_domain, pipelineStats?.source_records?.by_domain])
  const plantCoverageRows = useMemo(() => {
    const recordCounts = pipelineStats?.source_records?.by_plant ?? {}
    const changeCounts = pipelineStats?.source_changes?.summary?.by_plant ?? {}
    return Object.entries(recordCounts)
      .map(([label, count]) => ({
        label,
        count,
        changes: changeCounts[label] ?? 0,
      }))
      .sort((left, right) => Number(right.count || 0) - Number(left.count || 0))
      .slice(0, 3)
  }, [pipelineStats?.source_changes?.summary?.by_plant, pipelineStats?.source_records?.by_plant])
  const activeSignals = useMemo(() => {
    const dataset = dataFabric ?? getSeedDataFabricDataset()
    const liveSources = dataset.sourceRegistry.filter((item) => item.status === 'live').length
    const connectorAttention = dataset.connectorSignals.filter((item) => item.status !== 'Healthy').length
    const trustScore = dataset.learningDatabase.trustScore ?? 0

    if (activeMode === 'plant') {
      return [
        { label: 'Receiving holds', value: String(dataset.summary.receivingHoldCount) },
        { label: 'Quality incidents', value: String(dataset.summary.qualityIncidentCount) },
        { label: 'Maintenance stops', value: String(dataset.summary.maintenanceCount) },
      ]
    }

    if (activeMode === 'admin') {
      return [
        { label: 'Data attention', value: String(connectorAttention) },
        { label: 'Data lanes live', value: `${liveSources}/${dataset.sourceRegistry.length}` },
        { label: 'Trust score', value: `${trustScore}%` },
      ]
    }

    return [
      { label: 'Open tasks', value: String(dataset.summary.openTaskCount) },
      { label: 'Follow-up', value: String(dataset.summary.pendingApprovalCount) },
      { label: 'Writeback lanes', value: String(dataset.writebackLanes.length) },
    ]
  }, [activeMode, dataFabric])

  const fiveScreens = useMemo(() => {
    const adminScreens = [
      { label: 'Settings', route: '/app/platform-admin', detail: 'Users, roles, data jobs, and cloud health.', metric: refreshStatus },
      { label: 'Data', route: '/app/live-data?view=operate', detail: 'Operating values and entered daily values.', metric: actualMetricValueCount || sourceRecordCount || 'Data' },
      { label: 'Work', route: '/app/action-board', detail: 'Real team work, evidence, and due date.', metric: humanWorkCount },
      { label: 'Entry', route: '/app/daily-entry', detail: 'Test the same manager entry flow.', metric: 'Form' },
    ]
    const plantScreens = [
      { label: 'Entry', route: '/app/daily-entry', detail: 'Add one missing fact or board update from the floor.', metric: 'Form' },
      { label: 'Work', route: '/app/action-board', detail: 'Open team work with evidence and next step.', metric: humanWorkCount },
      { label: 'Data', route: '/app/live-data?view=operate', detail: 'Latest output, rejects, downtime, WIP, and operating values.', metric: actualMetricValueCount || 'Live' },
      { label: 'QMS', route: '/app/dqms', detail: 'Defects, CAPA, 5W1H, and evidence closeout.', metric: 'ISO' },
    ]
    const managerScreens = [
      { label: 'Entry', route: '/app/daily-entry', detail: 'Today update, quantity, issue, whiteboard, or photo.', metric: 'Form' },
      { label: 'Work', route: '/app/action-board', detail: 'What the team must do next.', metric: humanWorkCount },
      { label: 'Data', route: '/app/live-data?view=operate', detail: 'Useful operating values and short summaries.', metric: actualMetricValueCount || 'Live' },
    ]
    return activeMode === 'admin' ? adminScreens : activeMode === 'plant' ? plantScreens : managerScreens
  }, [activeMode, actualMetricValueCount, humanWorkCount, refreshStatus, sourceRecordCount])

  const dashboardMetrics = useMemo(() => {
    const actions = {
      label: 'Team work',
      value: String(humanWorkCount),
      detail: `${humanNeedUpdateCount} need follow-up.`,
      route: '/app/action-board',
    }
    const latest = {
      label: 'Latest number',
      value: String(latestMetricCount),
      detail: latestMetricLead ? `${latestMetricLead.metric_name}: ${metricLabel(latestMetricLead)}` : 'Enter today from phone.',
      route: '/app/daily-entry',
    }
    const data = {
      label: 'Factory data',
      value: String(knowledgeChunkCount),
      detail: `${workbookMetricCount} structured operating numbers.`,
      route: activeMode === 'admin' ? '/app/live-data?view=data' : '/app/live-data?view=kpi',
    }

    if (activeMode === 'admin') {
      return [
        { label: 'Records', value: sourceRecordCount ? sourceRecordCount.toLocaleString() : '-', detail: 'Organized from business records and entry jobs.', route: '/app/live-data?view=data' },
        data,
        { label: 'Comms', value: `${emailReady}/${emailTotal || 0}`, detail: 'Admin-only mail and chat intake lanes.', route: '/app/live-data?view=comms' },
      ]
    }

    if (activeMode === 'plant') {
      return [
        actions,
        latest,
        { label: 'Evidence ready', value: String(isoEvidenceCount), detail: `${officialKpiCount} saved numbers / ${humanWorkCount} team items.`, route: '/app/action-board' },
      ]
    }

    return [
      actions,
      latest,
      { label: 'Follow-up', value: String(humanNeedUpdateCount), detail: 'Add a board photo, quantity, or short note once.', route: '/app/daily-entry' },
    ]
  }, [
    activeMode,
    emailReady,
    emailTotal,
    humanNeedUpdateCount,
    humanWorkCount,
    isoEvidenceCount,
    knowledgeChunkCount,
    latestMetricCount,
    latestMetricLead,
    officialKpiCount,
    sourceRecordCount,
    workbookMetricCount,
  ])

  const roleDashboardCards = useMemo(() => {
    const recordsByDomain = pipelineStats?.source_records?.by_domain ?? {}
    const recordsByPlant = pipelineStats?.source_records?.by_plant ?? {}
    const changesByPlant = pipelineStats?.source_changes?.summary?.by_plant ?? {}
    const plantARecordCount = (recordsByPlant['Plant A'] ?? 0) + (recordsByPlant['Plant A/B'] ?? 0)
    const plantAChangeCount = (changesByPlant['Plant A'] ?? 0) + (changesByPlant['Plant A/B'] ?? 0)
    const currentUsername = String(session?.username ?? '').trim().toLowerCase()

    const metricForPack = (packId: string) => {
      if (packId === 'production-flow') {
        return {
          value: compactNumber(plantARecordCount || recordsByDomain.plant || 0),
          detail: `${compactNumber(plantAChangeCount)} Plant A changes watched`,
        }
      }
      if (packId === 'reliability-utility') {
        return {
          value: compactNumber(plantAChangeCount || reviewTaskCount),
          detail: 'Downtime, utility, repeat-failure, and repair signals',
        }
      }
      if (packId === 'quality') {
        return {
          value: compactNumber(recordsByDomain.quality || 0),
          detail: `${compactNumber(officialKpiCount)} saved numbers can support QC checks`,
        }
      }
      if (packId === 'admin-planning') {
        return {
          value: compactNumber((recordsByDomain.governance || 0) + (recordsByDomain.finance || 0)),
          detail: `${compactNumber(refreshRunCount)} data refresh runs logged`,
        }
      }
      return {
        value: compactNumber(recordsByDomain.commercial || 0),
          detail: `${compactNumber(workbookMetricCount)} structured numbers available`,
      }
    }

    const cards = ROLE_DASHBOARD_BLUEPRINTS.map((blueprint) => {
      const pack = ROLE_PACK_BY_ID.get(blueprint.packId)
      const metric = metricForPack(blueprint.packId)
      const entryRoute = pack ? `/app/daily-entry?pack=${pack.id}` : '/app/daily-entry'
      return {
        ...blueprint,
        active: Boolean(currentUsername && pack?.username.toLowerCase() === currentUsername),
        entryRoute,
        roleLabel: pack?.role || blueprint.shortLabel,
        teamLabel: pack?.title || blueprint.shortLabel,
        ownerHint: pack?.defaultOwner || 'Team owner',
        metricValue: metric.value,
        metricDetail: metric.detail,
      }
    })

    return cards.sort((left, right) => Number(right.active) - Number(left.active))
  }, [
    officialKpiCount,
    pipelineStats?.source_changes?.summary?.by_plant,
    pipelineStats?.source_records?.by_domain,
    pipelineStats?.source_records?.by_plant,
    refreshRunCount,
    reviewTaskCount,
    session?.username,
    workbookMetricCount,
  ])
  const oneScreenHeadline = useMemo(() => {
    const topMetric = topOperatingRows[0]
    if (humanWorkCount === 0 && humanNeedUpdateCount === 0 && topMetric) {
      return `No critical blockage right now. Keep ${ytfOperatingMetricTitle(topMetric).toLowerCase()} stable and close daily entry on time.`
    }
    if (humanNeedUpdateCount > 0) {
      return `${humanNeedUpdateCount} work item${humanNeedUpdateCount > 1 ? 's need' : ' needs'} owner update before closing today.`
    }
    if (humanWorkCount > 0) {
      return `${humanWorkCount} open work item${humanWorkCount > 1 ? 's are' : ' is'} waiting for owner follow-through.`
    }
    return 'Enter one clean daily update to keep production, quality, stock, and purchasing visible.'
  }, [humanNeedUpdateCount, humanWorkCount, topOperatingRows])
  const collaborationRows = useMemo(
    () =>
      humanWorkRows.slice(0, 4).map((task) => ({
        key: task.task_id,
        title: task.title || task.template || 'Team follow-through',
        owner: task.owner || 'Team owner',
        due: taskDueLabel(task),
        status: String(task.status || 'open').replace(/[_-]+/g, ' '),
      })),
    [humanWorkRows],
  )
  const showExtendedPanels = false

  async function handleAskData() {
    if (!question.trim()) return
    setAsking(true)
    setAnswer('')
    try {
      const result = await queryYtfKnowledgeVector(question, 4)
      const matches = result.result?.matches ?? []
      const fallbackAnswer = result.fallback?.answer
      if (matches.length) {
        const top = matches[0]
        setAnswer(`${top.title || 'Matched source'}: ${String(top.text || '').slice(0, 220).trim()}`)
      } else {
        setAnswer(fallbackAnswer || result.next_step || 'No strong match yet. Try a simpler factory question.')
      }
    } catch {
      setAnswer('Search is unavailable right now. The dashboard data is still live.')
    } finally {
      setAsking(false)
    }
  }

  useEffect(() => {
    if (!session?.role) {
      return
    }

    setActiveMode(resolveYtfWorkspaceId(session.role))
  }, [session?.role])

  if (loading) {
    return (
      <section className="sm-ytf-simple-page">
        <div className="sm-ytf-panel">
          <h1>Opening YTF.</h1>
          <p>Loading the right home screen.</p>
        </div>
      </section>
    )
  }

  return (
    <div className="sm-ytf-simple-page sm-ytf-home sm-ytf-simple-dashboard">
      <section className="sm-ytf-hero-row sm-ytf-hero-compact sm-ytf-dashboard-hero">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">{activeModeConfig.railLabel}</p>
          <h1>{homeTitle}</h1>
          <p>
            {activeMode === 'admin'
              ? 'Data, email, setup, and entry in one admin view.'
              : activeMode === 'plant'
                ? 'Plant risks, actions, data, and entry without clutter.'
                : 'Today, entry, actions, and read-only data for the team.'}
          </p>
        </div>
        <div className="sm-ytf-status-stack">
          <span className="sm-status-pill">{authenticated ? 'Signed in' : 'Login needed'}</span>
          <span className="sm-status-pill">{primaryTodayAction.label}</span>
          <span className="sm-status-pill">{activeModeConfig.badge}</span>
          <span className="sm-status-pill">{actualMetricValueCount || sourceRecordCount || 0} data rows</span>
        </div>
      </section>

      {error ? <section className="sm-ytf-alert">{error}</section> : null}

      <section className="sm-ytf-action-grid sm-ytf-action-grid-four" aria-label="Main screens">
        {fiveScreens.map((item, index) => (
          <Link className={`sm-ytf-action-tile ${index === 0 ? 'is-primary' : ''}`.trim()} key={item.route} to={item.route}>
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            <span className="sm-ytf-action-arrow">{item.metric}</span>
          </Link>
        ))}
      </section>

      {showExtendedPanels ? (
        <>
          <section className="sm-ytf-panel sm-ytf-production-snapshot">
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Operating numbers</p>
                <h2>Use the data, not the folder list.</h2>
              </div>
              <Link className="sm-button-secondary" to="/app/live-data?view=operate">
                Open Data
              </Link>
            </div>
            <div className="sm-ytf-compact-list">
              {topOperatingRows.slice(0, 4).map((row, index) => (
                <Link className="sm-ytf-list-row" key={`${row.lane ?? 'lane'}-${row.metric_name ?? index}`} to="/app/live-data?view=operate">
                  <span>
                    <strong>{ytfOperatingMetricTitle(row)}</strong>
                    <small>{ytfOperatingMetricContext(row)}</small>
                    <small>{ytfOperatingMetricSource(row)}</small>
                  </span>
                  <em>{ytfOperatingMetricValue(row)}</em>
                </Link>
              ))}
              {!topOperatingRows.length ? (
                <Link className="sm-ytf-list-row" to="/app/daily-entry">
                  <span>
                    <strong>Daily close needs input</strong>
                    <small>Enter output, rejects, downtime, WIP, OT, stock, or a whiteboard photo.</small>
                  </span>
                  <em>Entry</em>
                </Link>
              ) : null}
            </div>
          </section>

          <section className="sm-ytf-metric-strip">
            {dashboardMetrics.map((item) => (
              <Link key={item.label} to={item.route}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </Link>
            ))}
          </section>
        </>
      ) : null}

      <section className="sm-ytf-live-grid">
        <article className="sm-ytf-panel sm-ytf-live-wide">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Today focus</p>
              <h2>What the data says.</h2>
            </div>
            <Link className="sm-button-secondary" to={activeMode === 'admin' ? '/app/live-data?view=operate' : '/app/live-data?view=kpi'}>
              Open Data
            </Link>
          </div>
          <p className="sm-ytf-live-answer">{oneScreenHeadline}</p>
          <div className="sm-ytf-compact-list">
            {(topOperatingRows.length ? topOperatingRows : []).slice(0, 3).map((row, index) => (
              <Link className="sm-ytf-list-row" key={`${row.lane ?? 'lane'}-${row.metric_name ?? index}`} to="/app/live-data?view=kpi">
                <span>
                  <strong>{ytfOperatingMetricTitle(row)}</strong>
                  <small>{ytfOperatingMetricContext(row)}</small>
                  <small>{ytfOperatingMetricSource(row)}</small>
                </span>
                <em>{ytfOperatingMetricValue(row)}</em>
              </Link>
            ))}
            {!topOperatingRows.length ? (
              <Link className="sm-ytf-list-row" to="/app/daily-entry">
                <span>
                  <strong>No clean row yet</strong>
                  <small>Record one production, quality, stock, or purchasing update now.</small>
                </span>
                <em>Entry</em>
              </Link>
            ) : null}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Collaboration</p>
              <h2>Team follow-through</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/action-board">
              Open Work
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {collaborationRows.length ? (
              collaborationRows.map((row) => (
                <Link className="sm-ytf-list-row" key={row.key} to="/app/action-board">
                  <span>
                    <strong>{row.title}</strong>
                    <small>{row.owner}</small>
                    <small>{row.due}</small>
                  </span>
                  <em>{row.status}</em>
                </Link>
              ))
            ) : (
              <Link className="sm-ytf-list-row" to="/app/daily-entry">
                <span>
                  <strong>No open team follow-through</strong>
                  <small>Log new issue or update directly from Entry.</small>
                </span>
                <em>Clear</em>
              </Link>
            )}
          </div>
        </article>
      </section>

      {showExtendedPanels && activeMode !== 'manager' ? (
        <section className="sm-ytf-panel sm-ytf-role-dashboard">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Plant A role dashboards</p>
              <h2>What each team uses today.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/daily-entry">
              New entry
            </Link>
          </div>
          <div className="sm-ytf-role-dashboard-grid">
            {roleDashboardCards.map((card) => (
              <article className={`sm-ytf-role-dashboard-card ${card.active ? 'is-active' : ''}`.trim()} key={card.packId}>
                <div>
                  <span>{card.shortLabel}</span>
                  <strong>{card.metricValue}</strong>
                  <small>{card.primaryMetric}</small>
                </div>
                <p>{card.nextEntry}</p>
                <em>{card.metricDetail}</em>
                <div className="sm-ytf-role-dashboard-actions">
                  <Link to={card.entryRoute}>Enter</Link>
                  <Link to={card.reviewRoute}>{card.reviewLabel}</Link>
                  <Link to={card.dataRoute}>Data</Link>
                </div>
                <small className="sm-ytf-role-dashboard-source">{card.dataLane}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {showExtendedPanels && activeMode !== 'manager' ? (
      <details className="sm-ytf-panel sm-ytf-details sm-ytf-story-panel">
        <summary>Data details</summary>
        <div>
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Data story</p>
            <h2>What changed.</h2>
            <p>{storyHeadline}</p>
          </div>
          <Link className="sm-button-secondary" to={activeMode === 'admin' ? '/app/live-data?view=data' : '/app/live-data?view=kpi'}>
            {activeMode === 'admin' ? 'Open Data' : 'Check numbers'}
          </Link>
        </div>

        <div className="sm-ytf-story-grid">
          {storyCards.map((card) => (
            <Link className={`sm-ytf-story-card is-${card.tone}`} key={card.label} to={card.route}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </Link>
          ))}
        </div>

        <div className="sm-ytf-story-split">
          <div className="sm-ytf-story-bars" aria-label="Data readiness">
            {storyBars.map((bar) => (
              <Link className="sm-ytf-story-bar" key={bar.label} to={bar.route}>
                <span>
                  <strong>{bar.label}</strong>
                  <em>{bar.percent}%</em>
                </span>
                <i className="sm-ytf-story-bar-track" aria-hidden="true">
                  <b style={{ width: `${bar.percent}%` }} />
                </i>
                <small>{bar.detail}</small>
              </Link>
            ))}
          </div>

          <div className="sm-ytf-story-events" aria-label="Latest file changes">
            <div className="sm-ytf-story-mini-head">
              <strong>Latest updates</strong>
              <Link to={activeMode === 'admin' ? '/app/live-data?view=data' : '/app/action-board'}>Open</Link>
            </div>
            {latestSourceEvents.length ? (
              latestSourceEvents.map((event) => (
                <Link className="sm-ytf-story-event" key={event.event_id || `${sourceEventTitle(event)}-${event.detected_at || event.current_modified_time || ''}`} to={activeMode === 'admin' ? event.owning_route || '/app/live-data?view=data' : '/app/action-board'}>
                  <span>
                    <strong>{sourceEventTitle(event)}</strong>
                    <small>{sourceEventMeta(event)}</small>
                  </span>
                  <em>{compactDateTime(event.detected_at || event.current_modified_time)}</em>
                </Link>
              ))
            ) : (
              <Link className="sm-ytf-story-event" to={activeMode === 'admin' ? '/app/live-data?view=data' : '/app/action-board'}>
                <span>
                  <strong>No signals loaded yet</strong>
                  <small>The next data update will show useful work here.</small>
                </span>
                <em>Waiting</em>
              </Link>
            )}

            {plantCoverageRows.length ? (
              <div className="sm-ytf-owner-focus">
                <strong>Plant coverage</strong>
                {plantCoverageRows.map((row) => (
                  <Link key={row.label} to="/app/live-data?view=data">
                    <span>{row.label}</span>
                    <em>{`${compactNumber(row.count)} / ${compactNumber(row.changes)}`}</em>
                  </Link>
                ))}
              </div>
            ) : null}

            {ownerFocusRows.length ? (
              <div className="sm-ytf-owner-focus">
                <strong>Work lanes</strong>
                {ownerFocusRows.map((row) => (
                  <Link key={row.label} to={activeMode === 'admin' ? row.route : '/app/action-board'}>
                    <span>{row.label}</span>
                    <em>{row.count}</em>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        </div>
      </details>
      ) : null}

      {showExtendedPanels && activeMode !== 'manager' ? (
      <details className="sm-ytf-panel sm-ytf-details">
        <summary>Search and next work</summary>
        <div className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Work</p>
              <h2>What matters now.</h2>
            </div>
            <Link className="sm-button-secondary" to={activeMode === 'plant' ? '/app/plant-manager' : '/app/action-board'}>
              Open
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            <Link className="sm-ytf-list-row" to={activeMode === 'admin' ? '/app/platform-admin' : '/app/action-board'}>
              <span>
                <strong>Learning loop</strong>
                <small>{refreshLatestAt ? `Last data update ${refreshLatestAt}` : 'Waiting for first data update.'}</small>
              </span>
              <em>{refreshRunCount}</em>
            </Link>
            {latestMetrics.slice(0, 3).map((metric) => (
              <Link className="sm-ytf-list-row" key={`${metric.metric_id || metric.metric_name}-${metric.captured_at || metric.updated_at || ''}`} to="/app/daily-entry">
                <span>
                  <strong>{metric.metric_name}</strong>
                  <small>{metric.period_label || compactDateTime(metric.captured_at || metric.updated_at)}</small>
                </span>
                <em>{metricLabel(metric)}</em>
              </Link>
            ))}
            {!latestMetrics.length ? (
              <Link className="sm-ytf-list-row" to="/app/daily-entry">
                <span>
                  <strong>Enter daily numbers</strong>
                  <small>{officialKpiCount} saved definitions are ready for daily capture.</small>
                </span>
                <em>Open</em>
              </Link>
            ) : null}
            {activeSignals.slice(0, 2).map((item) => (
              <Link className="sm-ytf-list-row" key={item.label} to={activeMode === 'admin' ? '/app/platform-admin' : activeMode === 'plant' ? '/app/plant-manager' : '/app/action-board'}>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.value} current signal.</small>
                </span>
                <em>{item.value}</em>
              </Link>
            ))}
            {todayActions.slice(0, 1).map((item) => (
              <Link className="sm-ytf-list-row" key={item.route} to={item.route}>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.evidence}</small>
                </span>
                <em>{item.metric}</em>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Search</p>
              <h2>Ask plant data.</h2>
            </div>
            <span className="sm-status-pill">{vectorMode}</span>
          </div>
          <form
            className="sm-ytf-ask-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handleAskData()
            }}
          >
            <input
              className="sm-ytf-input"
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about production, suppliers, quality, maintenance..."
              value={question}
            />
            <button className="sm-button-primary" disabled={asking} type="submit">
              {asking ? 'Searching...' : 'Ask'}
            </button>
          </form>
          <p className="sm-ytf-ask-result">
            {answer || 'Uses the Yangon Tyre knowledge index. Admin sees evidence; roles see filtered answers and work.'}
          </p>
        </article>
        </div>
      </details>
      ) : null}

      {showExtendedPanels && activeMode === 'admin' ? (
        <section className="sm-ytf-panel sm-ytf-admin-only">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Admin only</p>
              <h2>Email and chat intake.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/email">
              Open Email
            </Link>
          </div>
          <div className="sm-ytf-metric-strip is-compact">
            <Link to="/app/email">
              <span>Gmail</span>
              <strong>{emailReady}/{emailTotal || 0}</strong>
              <small>Yangon Tyre, supplier, and CEO-forwarded sources.</small>
            </Link>
            <Link to="/app/email">
              <span>Chat bots</span>
              <strong>{botReady}/{botTotal || 0}</strong>
              <small>Viber, LINE, and WeChat bridge readiness.</small>
            </Link>
            <Link to="/app/email">
              <span>Manual drops</span>
              <strong>{manualMessages}</strong>
              <small>Temporary safe intake until webhooks are connected.</small>
            </Link>
          </div>
        </section>
      ) : null}

    </div>
  )
}
