import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getTenantConfig } from '../lib/tenantConfig'
import {
  checkWorkspaceHealth,
  getCapabilityProfileForRole,
  getWorkspaceSession,
  sessionHasCapability,
  workspaceFetch,
} from '../lib/workspaceApi'
import {
  getSeedYtfRootWarehouseDataset,
  loadYtfRootWarehouseDataset,
  queryYtfRootKnowledge,
  syncYtfRootWarehouseDataset,
  type YtfKnowledgeEvidenceRow,
  type YtfRootKnowledgeQueryResult,
  type YtfRootWarehouseDataset,
} from '../lib/ytfRootWarehouseApi'

type SummaryPayload = {
  actions?: { total_items?: number }
  approvals?: { approval_count?: number }
  supplier_watch?: { risk_count?: number }
  quality?: { incident_count?: number }
  receiving?: { hold_count?: number }
}

type ExceptionRow = {
  exception_id: string
  priority: string
  title: string
  summary: string
  owner: string
}

type DecisionRow = {
  decision_id: string
  title: string
  decision_text: string
  owner: string
  status: string
}

type LeadPipelineRow = {
  lead_id: string
  company_name: string
  stage: string
  service_pack: string
  wedge_product: string
  owner: string
}

type RoleRow = {
  title?: string
  action?: string
  owner?: string
  due?: string
  priority?: string
  evidence?: string
}

type DirectorViewId = 'pulse' | 'lanes' | 'ask'

type RootChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  note?: string
  chips?: string[]
}

const DIRECTOR_VIEWS: Record<
  DirectorViewId,
  {
    label: string
    title: string
    detail: string
    primaryRoute: string
    primaryLabel: string
    secondaryRoute: string
    secondaryLabel: string
  }
> = {
  pulse: {
    label: 'Pulse',
    title: 'Run Yangon Tyre from one living tree.',
    detail: 'The owner page reads the shared Yangon Tyre root as one operating system instead of a pile of folders.',
    primaryRoute: '/app/plant-manager',
    primaryLabel: 'Open plant manager',
    secondaryRoute: '/app/data-fabric',
    secondaryLabel: 'Open data fabric',
  },
  lanes: {
    label: 'Lanes',
    title: 'Every new folder becomes a typed lane.',
    detail: 'Plant, CEO, commercial, literature, and new PC drops all land in one root warehouse with a route and a next move.',
    primaryRoute: '/app/action-board',
    primaryLabel: 'Open action board',
    secondaryRoute: '/app/revenue',
    secondaryLabel: 'Open revenue',
  },
  ask: {
    label: 'Ask',
    title: 'Query the root in normal language.',
    detail: 'The workspace surface uses the same live root warehouse, graph communities, and desk routing underneath.',
    primaryRoute: '/app/director',
    primaryLabel: 'Run owner review',
    secondaryRoute: '/app/insights',
    secondaryLabel: 'Open insights',
  },
}

const DEFAULT_DIRECTOR_VIEWS: typeof DIRECTOR_VIEWS = {
  pulse: {
    label: 'Pulse',
    title: 'See what needs a decision.',
    detail: 'Actions, exceptions, approvals, pipeline, and data changes stay in one leadership view.',
    primaryRoute: '/app/owner-brief',
    primaryLabel: 'Open brief',
    secondaryRoute: '/app/action-board',
    secondaryLabel: 'Open queue',
  },
  lanes: {
    label: 'Lanes',
    title: 'Open the active work lanes.',
    detail: 'Each lane shows what changed, who owns it, and which record or customer needs the next move.',
    primaryRoute: '/app/action-board',
    primaryLabel: 'Open actions',
    secondaryRoute: '/app/data-fabric',
    secondaryLabel: 'Open data',
  },
  ask: {
    label: 'Ask',
    title: 'Ask the workspace.',
    detail: 'Prepare answers from source-backed context, then keep decisions human-approved before anything becomes official.',
    primaryRoute: '/app/insights',
    primaryLabel: 'Open insights',
    secondaryRoute: '/app/approvals',
    secondaryLabel: 'Open approvals',
  },
}

const OWNER_REVIEW_RHYTHMS = [
  {
    id: 'daily',
    title: 'Daily owner pulse',
    detail: 'Read change, risk, and unresolved ownership across the full tree in under ten minutes.',
    route: '/app/director',
  },
  {
    id: 'weekly',
    title: 'Weekly plant and commercial review',
    detail: 'Review lane drift, canonical promotion, recurring defects, and stock or sales movement together.',
    route: '/app/plant-manager',
  },
  {
    id: 'monthly',
    title: 'Monthly ISO and capital review',
    detail: 'Track whether repeated pain became a method, CAPA, control, or investment decision.',
    route: '/app/invisible-iso',
  },
] as const

function toneForConnector(status: string) {
  if (status === 'ready') return 'text-emerald-300'
  if (status === 'warning') return 'text-amber-300'
  return 'text-sky-300'
}

function toneForMode(mode: string) {
  if (mode === 'live') return 'text-emerald-300'
  if (mode === 'fallback') return 'text-sky-300'
  return 'text-amber-300'
}

function toneForLaneStatus(status: string) {
  if (status === 'Live') return 'text-emerald-300'
  if (status === 'Needs attention') return 'text-rose-300'
  if (status === 'Mapped') return 'text-sky-300'
  return 'text-slate-300'
}

function toneForRisk(riskLevel: string) {
  if (riskLevel === 'high') return 'text-rose-300'
  if (riskLevel === 'medium') return 'text-amber-300'
  return 'text-emerald-300'
}

function routeLabel(route: string) {
  if (route === '/app/plant-a') return 'Plant A'
  if (route === '/app/plant-manager') return 'Plant Manager'
  if (route === '/app/operations') return 'Operations'
  if (route === '/app/dqms') return 'DQMS'
  if (route === '/app/revenue') return 'Revenue'
  if (route === '/app/approvals') return 'Approvals'
  if (route === '/app/data-fabric') return 'Data Fabric'
  if (route === '/app/action-board') return 'Action Board'
  if (route === '/app/invisible-iso') return 'Invisible ISO'
  if (route === '/app/insights') return 'Insights'
  return 'Director'
}

function viewButtonClass(active: boolean) {
  return active
    ? 'rounded-full border border-[var(--sm-accent)] bg-[rgba(93,255,176,0.16)] px-4 py-2 text-sm font-semibold text-white'
    : 'rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--sm-muted)] transition hover:border-white/20 hover:text-white'
}

function formatPercent(numerator: number, denominator: number) {
  if (!denominator) return '0%'
  return `${Math.round((numerator / denominator) * 100)}%`
}

function buildAssistantChips(result: YtfRootKnowledgeQueryResult) {
  return [
    result.mode === 'live' ? 'Live warehouse' : 'Seeded warehouse',
    `Focus: ${result.focusArea || 'general'}`,
    `${result.matchedRecordCount} matched records`,
    result.retrievalStrategy || 'ranked evidence',
  ]
}

function buildAssistantNote(result: YtfRootKnowledgeQueryResult) {
  if (!result.evidence.length) {
    return 'No direct evidence rows were returned yet.'
  }

  const firstRow = result.evidence[0]
  return `${firstRow.laneTitle} routes to ${routeLabel(firstRow.owningDeskRoute)}.`
}

function buildChatMessages(query: string, result: YtfRootKnowledgeQueryResult): RootChatMessage[] {
  return [
    {
      id: `user-${Date.now()}`,
      role: 'user',
      text: query,
    },
    {
      id: `assistant-${Date.now() + 1}`,
      role: 'assistant',
      text: result.answer,
      note: buildAssistantNote(result),
      chips: buildAssistantChips(result),
    },
  ]
}

function defaultDirectorQuestion(tenantKey: string) {
  return tenantKey === 'ytf-plant-a'
    ? 'What changed across Yangon Tyre today and what should the owner review first?'
    : 'What changed today and what should the owner review first?'
}

export function DirectorDashboardPage() {
  const location = useLocation()
  const tenant = getTenantConfig()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [sessionName, setSessionName] = useState<string | null>(null)
  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([])
  const [decisions, setDecisions] = useState<DecisionRow[]>([])
  const [leads, setLeads] = useState<LeadPipelineRow[]>([])
  const [roleRows, setRoleRows] = useState<RoleRow[]>([])
  const [rootWarehouse, setRootWarehouse] = useState<YtfRootWarehouseDataset>(() => getSeedYtfRootWarehouseDataset())
  const [rootNote, setRootNote] = useState(() =>
    tenant.key === 'ytf-plant-a' ? 'Checking private root warehouse runtime.' : 'Checking workspace runtime.',
  )
  const [syncingRoot, setSyncingRoot] = useState(false)
  const [rootQuery, setRootQuery] = useState(() => defaultDirectorQuestion(tenant.key))
  const [rootQueryNote, setRootQueryNote] = useState('Ask in normal language. The root warehouse does the routing underneath.')
  const [rootQueryResult, setRootQueryResult] = useState<YtfRootKnowledgeQueryResult | null>(null)
  const [rootChatHistory, setRootChatHistory] = useState<RootChatMessage[]>([])
  const [queryingRoot, setQueryingRoot] = useState(false)
  const [activeView, setActiveView] = useState<DirectorViewId>('pulse')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const health = await checkWorkspaceHealth().catch(() => ({ ready: false as const }))
      const seedWarehouse = getSeedYtfRootWarehouseDataset()

      if (!health.ready) {
        if (!cancelled) {
          setRootWarehouse(seedWarehouse)
          setRootNote('Workspace API is not connected on this host yet, so the seeded root warehouse is shown.')
          setError('Workspace API is not connected on this host yet.')
          setLoading(false)
        }
        return
      }

      try {
        const session = await getWorkspaceSession()
        if (cancelled) return
        if (!session.authenticated) {
          setRootWarehouse(seedWarehouse)
          setRootNote('Login is required for live root sync and live query. The seeded owner view is still visible below.')
          setError('Login is required to open the director dashboard.')
          setLoading(false)
          return
        }

        setAuthenticated(true)
        setSessionName(session.session?.display_name ?? null)
        if (!sessionHasCapability(session.session, 'director.view')) {
          setError(`Director access is required for this dashboard. Current role: ${getCapabilityProfileForRole(session.session?.role).label}.`)
          setLoading(false)
          return
        }
      } catch {
        if (!cancelled) {
          setRootWarehouse(seedWarehouse)
          setRootNote('Workspace login could not be verified, so the seeded owner view is shown while the live session check catches up.')
          setError('Workspace login could not be verified on this host yet.')
          setLoading(false)
        }
        return
      }

      try {
        const [summaryPayload, exceptionPayload, decisionPayload, leadPayload, rolePayload, liveWarehouse] = await Promise.all([
          workspaceFetch<SummaryPayload>('/api/summary'),
          workspaceFetch<{ rows?: ExceptionRow[] }>('/api/exceptions?limit=6'),
          workspaceFetch<{ rows?: DecisionRow[] }>('/api/decisions?limit=6'),
          workspaceFetch<{ rows?: LeadPipelineRow[] }>('/api/lead-pipeline'),
          workspaceFetch<{ rows?: RoleRow[] }>('/api/reports/role/director'),
          loadYtfRootWarehouseDataset(),
        ])
        if (cancelled) return

        setSummary(summaryPayload)
        setExceptions(exceptionPayload.rows ?? [])
        setDecisions((decisionPayload.rows ?? []).slice(0, 4))
        setLeads((leadPayload.rows ?? []).slice(0, 4))
        setRoleRows((rolePayload.rows ?? []).slice(0, 4))
        setRootWarehouse(liveWarehouse)
        setRootNote(
          liveWarehouse.mode === 'live'
            ? `Live root warehouse is connected with ${liveWarehouse.summary.laneCount} lanes and ${liveWarehouse.summary.liveItemCount} live items.`
            : liveWarehouse.connectorMessage,
        )

        const starterQuery =
          tenant.key === 'ytf-plant-a'
            ? liveWarehouse.knowledgeRuntime.queryStarters[0] ?? defaultDirectorQuestion(tenant.key)
            : defaultDirectorQuestion(tenant.key)
        setRootQuery(starterQuery)
        setQueryingRoot(true)
        const starterResult = await queryYtfRootKnowledge(starterQuery).catch(() => null)
        if (!cancelled && starterResult) {
          setRootQueryResult(starterResult)
          setRootChatHistory(buildChatMessages(starterQuery, starterResult))
          setRootQueryNote(
            starterResult.mode === 'live'
              ? 'Live root memory is answering with warehouse-backed evidence.'
              : 'Seeded root memory is answering while live retrieval catches up.',
          )
        }
      } catch {
        if (!cancelled) {
          setError('Director dashboard could not be loaded right now.')
        }
      } finally {
        if (!cancelled) {
          setQueryingRoot(false)
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [tenant.key])

  const loginHref = `/login?next=${encodeURIComponent(`${location.pathname}${location.search}` || '/app/director')}`
  const directorViews = tenant.key === 'ytf-plant-a' ? DIRECTOR_VIEWS : DEFAULT_DIRECTOR_VIEWS
  const activeViewConfig = directorViews[activeView]
  const laneCards = useMemo(
    () =>
      [...rootWarehouse.lanes].sort((left, right) => {
        const riskDelta = right.highRiskCount - left.highRiskCount
        if (riskDelta !== 0) return riskDelta
        return right.liveItemCount - left.liveItemCount
      }),
    [rootWarehouse.lanes],
  )
  const topPriorities = roleRows.slice(0, 3)

  const ownerKpis = useMemo(() => {
    const summaryPayload = rootWarehouse.summary
    const liveItems = summaryPayload.liveItemCount || 0
    const sourceItems = summaryPayload.sourceItemCount || 0
    const canonicalRecords = summaryPayload.canonicalRecordCount || 0
    const recentItems = summaryPayload.recentItemCount || 0
    const attention = summaryPayload.ownerAttentionCount || 0
    const knowledgeSummary = rootWarehouse.knowledgeRuntime.summary

    return [
      {
        id: 'coverage',
        label: 'Warehouse coverage',
        value: formatPercent(canonicalRecords, Math.max(liveItems, sourceItems)),
        detail: `${canonicalRecords} canonical records from ${Math.max(liveItems, sourceItems)} source or live items.`,
      },
      {
        id: 'freshness',
        label: 'Recent activity',
        value: formatPercent(recentItems, liveItems),
        detail: `${recentItems} recently changed items still visible at the owner layer.`,
      },
      {
        id: 'attention',
        label: 'Attention load',
        value: formatPercent(attention, liveItems),
        detail: `${attention} owner-attention records across the current live tree.`,
      },
      {
        id: 'knowledge',
        label: 'Knowledge depth',
        value: `${knowledgeSummary.communityCount + knowledgeSummary.agentLoopCount}`,
        detail: `${knowledgeSummary.communityCount} graph communities and ${knowledgeSummary.agentLoopCount} active loops.`,
      },
    ]
  }, [rootWarehouse])

  const latestEvidence = rootQueryResult?.evidence ?? []
  const topRecordTypes = rootWarehouse.topRecordTypes.slice(0, 4)
  const topBehaviors = rootWarehouse.topBehaviors.slice(0, 4)
  const graphCommunities = rootWarehouse.knowledgeRuntime.graphCommunities.slice(0, 4)
  const agentLoops = rootWarehouse.knowledgeRuntime.agentLoops.slice(0, 4)
  const mobileSurfaces = rootWarehouse.knowledgeRuntime.mobileSurfaces.slice(0, 4)
  const assistantLabel = tenant.key === 'ytf-plant-a' ? 'YTF Assistant' : 'Workspace Assistant'
  const directorQueryStarters =
    tenant.key === 'ytf-plant-a'
      ? rootWarehouse.knowledgeRuntime.queryStarters.slice(0, 5)
      : ['What changed today?', 'Which work needs a decision?', 'What should we follow up first?']

  async function handleSyncRoot() {
    if (!authenticated || syncingRoot) return
    setSyncingRoot(true)
    setRootNote(tenant.key === 'ytf-plant-a' ? 'Syncing the private root warehouse now.' : 'Syncing the workspace data layer now.')
    try {
      const nextWarehouse = await syncYtfRootWarehouseDataset()
      setRootWarehouse(nextWarehouse)
      setRootNote(
        nextWarehouse.mode === 'live'
          ? `Live data synced with ${nextWarehouse.summary.liveItemCount} live items and ${nextWarehouse.summary.canonicalRecordCount} canonical records.`
          : nextWarehouse.connectorMessage,
      )
      const nextQuery = rootQuery.trim() || nextWarehouse.knowledgeRuntime.queryStarters[0]
      if (nextQuery) {
        setQueryingRoot(true)
        const nextResult = await queryYtfRootKnowledge(nextQuery)
        setRootQueryResult(nextResult)
        setRootChatHistory((current) => [...current.slice(-4), ...buildChatMessages(nextQuery, nextResult)])
        setRootQueryNote(nextResult.mode === 'live' ? 'Live root memory refreshed after sync.' : 'Seeded root memory refreshed after sync.')
      }
    } finally {
      setQueryingRoot(false)
      setSyncingRoot(false)
    }
  }

  async function handleRunQuery(queryOverride?: string) {
    const effectiveQuery =
      (queryOverride ?? rootQuery).trim() ||
      (tenant.key === 'ytf-plant-a' ? rootWarehouse.knowledgeRuntime.queryStarters[0] : '') ||
      defaultDirectorQuestion(tenant.key)
    setRootQuery(effectiveQuery)
    setQueryingRoot(true)
    setRootQueryNote('Running the root query now.')
    try {
      const result = await queryYtfRootKnowledge(effectiveQuery)
      setRootQueryResult(result)
      setRootChatHistory((current) => [...current.slice(-6), ...buildChatMessages(effectiveQuery, result)])
      setRootQueryNote(
        result.mode === 'live'
          ? 'Live root memory answered with warehouse-backed evidence.'
          : 'Seeded root memory answered while live retrieval catches up.',
      )
      setActiveView('ask')
    } finally {
      setQueryingRoot(false)
    }
  }

  if (loading) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Opening owner command...</section>
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Director"
        title={tenant.key === 'ytf-plant-a' ? 'Run Yangon Tyre from one living tree.' : 'See what matters today.'}
        description={
          tenant.key === 'ytf-plant-a'
            ? 'The owner command surface now uses the shared Yangon Tyre Drive root as one warehouse for metrics, evidence search, and action routing.'
            : 'This is the simplest leadership view: actions, exceptions, decisions, pipeline, and evidence in one screen.'
        }
      />

      <section className="sm-surface-deep p-5 lg:p-6">
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className={`sm-status-pill ${toneForMode(rootWarehouse.mode)}`}>{rootWarehouse.mode === 'live' ? 'Live root' : 'Seeded root'}</span>
              <span className={`sm-status-pill ${toneForConnector(rootWarehouse.connectorStatus)}`}>{rootWarehouse.connectorStatus || 'fallback'}</span>
              <span className="sm-status-pill">{authenticated ? sessionName || 'Signed in' : 'Preview mode'}</span>
            </div>
            <h2 className="mt-4 text-4xl font-bold text-white">{activeViewConfig.title}</h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">{activeViewConfig.detail}</p>
            <p className="mt-4 text-sm text-[var(--sm-muted)]">{rootNote}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={activeViewConfig.primaryRoute}>
                {activeViewConfig.primaryLabel}
              </Link>
              <Link className="sm-button-secondary" to={activeViewConfig.secondaryRoute}>
                {activeViewConfig.secondaryLabel}
              </Link>
              <button className="sm-button-secondary" disabled={!authenticated || syncingRoot} onClick={() => void handleSyncRoot()} type="button">
                {syncingRoot ? 'Syncing...' : 'Sync root'}
              </button>
              <a className="sm-button-secondary" href={rootWarehouse.summary.rootFolderUrl} rel="noreferrer" target="_blank">
                Open Drive
              </a>
              {!authenticated ? (
                <Link className="sm-button-secondary" to={loginHref}>
                  Login
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="sm-manager-stat">
              <p className="sm-kicker text-[var(--sm-accent)]">Root lanes</p>
              <p className="mt-3 text-2xl font-bold text-white">{rootWarehouse.summary.laneCount}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {rootWarehouse.summary.plantLaneCount} plant / {rootWarehouse.summary.commercialLaneCount} commercial
              </p>
            </article>
            <article className="sm-manager-stat">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Live items</p>
              <p className="mt-3 text-2xl font-bold text-white">{rootWarehouse.summary.liveItemCount}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{rootWarehouse.summary.workbookCount} workbook-like sources</p>
            </article>
            <article className="sm-manager-stat">
              <p className="sm-kicker text-[var(--sm-accent)]">Canonical</p>
              <p className="mt-3 text-2xl font-bold text-white">{rootWarehouse.summary.canonicalRecordCount}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{rootWarehouse.summary.shortcutCount} shortcuts still need promotion</p>
            </article>
            <article className="sm-manager-stat">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Owner attention</p>
              <p className="mt-3 text-2xl font-bold text-white">{rootWarehouse.summary.ownerAttentionCount}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{rootWarehouse.summary.highRiskCount} high-risk records across the root</p>
            </article>
          </div>
        </div>
      </section>

      <section className="sm-calm-surface p-5 lg:p-6">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(directorViews) as DirectorViewId[]).map((view) => (
            <button className={viewButtonClass(activeView === view)} key={view} onClick={() => setActiveView(view)} type="button">
              {directorViews[view].label}
            </button>
          ))}
        </div>
      </section>

      {activeView === 'pulse' ? (
        <section className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {ownerKpis.map((item) => (
              <article className="sm-manager-stat" key={item.id}>
                <p className="sm-kicker text-[var(--sm-accent)]">{item.label}</p>
                <p className="mt-3 text-2xl font-bold text-white">{item.value}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <article className="sm-calm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Owner pulse</p>
              <h2 className="mt-2 text-3xl font-bold text-white">What the whole tree is saying</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {rootWarehouse.domainSummary.slice(0, 6).map((item) => (
                  <article className="sm-manager-method" key={item.domain}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold capitalize text-white">{item.domain}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">
                          {item.laneCount} lanes / {item.liveItemCount} live items
                        </p>
                      </div>
                      <span className="sm-status-pill">{routeLabel(item.primaryRoute)}</span>
                    </div>
                    <p className="mt-4 text-sm text-white/84">
                      {item.canonicalRecordCount} canonical records / {item.highRiskCount} high-risk / {item.shortcutCount} shortcuts
                    </p>
                  </article>
                ))}
              </div>
            </article>

            <article className="sm-calm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Leadership queue</p>
              <h2 className="mt-2 text-3xl font-bold text-white">What still needs attention today</h2>
              <div className="mt-6 grid gap-3">
                {topPriorities.length ? (
                  topPriorities.map((row, index) => (
                    <article className="sm-proof-card" key={`${row.title ?? row.action ?? 'priority'}-${index}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-white">{row.title || row.action || 'Priority'}</p>
                          {row.action ? <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.action}</p> : null}
                        </div>
                        {row.priority ? <span className="sm-status-pill">{row.priority}</span> : null}
                      </div>
                      <p className="mt-4 text-sm text-white/84">{row.owner || 'Management'} · {row.evidence || 'Workspace'} · {row.due || 'Review'}</p>
                    </article>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">No live leadership rows are available yet.</div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Open actions</p>
                    <p className="mt-2 text-2xl font-bold">{summary?.actions?.total_items ?? 0}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Approvals</p>
                    <p className="mt-2 text-2xl font-bold">{summary?.approvals?.approval_count ?? 0}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Quality incidents</p>
                    <p className="mt-2 text-2xl font-bold">{summary?.quality?.incident_count ?? 0}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Receiving holds</p>
                    <p className="mt-2 text-2xl font-bold">{summary?.receiving?.hold_count ?? 0}</p>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <article className="sm-calm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Runtime</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Knowledge graph, retrieval, and workflow loops</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Graph</p>
                  <p className="mt-2 text-2xl font-bold">
                    {rootWarehouse.knowledgeRuntime.summary.graphNodeCount} / {rootWarehouse.knowledgeRuntime.summary.graphEdgeCount}
                  </p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Nodes / edges in the current owner memory graph.</p>
                </article>
                <article className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Collections</p>
                  <p className="mt-2 text-2xl font-bold">{rootWarehouse.knowledgeRuntime.summary.retrievalPackCount}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Retrieval packs that back the workspace query surface.</p>
                </article>
              </div>
              <div className="mt-6 space-y-3">
                {graphCommunities.map((item) => (
                  <article className="sm-manager-method" key={item.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{item.name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">
                          {item.nodeCount} nodes / {item.edgeCount} edges / {item.retrievalFocus}
                        </p>
                      </div>
                      <Link className="sm-link" to={item.route}>
                        {routeLabel(item.route)}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="sm-calm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Evaluation flows</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Review rhythms for owner, ISO, and operations</h2>
              <div className="mt-6 space-y-3">
                {OWNER_REVIEW_RHYTHMS.map((item) => (
                  <article className="sm-proof-card" key={item.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{item.title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                      </div>
                      <Link className="sm-link" to={item.route}>
                        Open
                      </Link>
                    </div>
                  </article>
                ))}
                <div className="grid gap-3 sm:grid-cols-2">
                  {topRecordTypes.map((item) => (
                    <div className="sm-chip text-white" key={`record-${item.recordType}`}>
                      <p className="sm-kicker text-[var(--sm-accent)]">{item.recordType}</p>
                      <p className="mt-2 text-xl font-bold">{item.count}</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>
        </section>
      ) : null}

      {activeView === 'lanes' ? (
        <section className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <article className="sm-calm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Top behaviors</p>
              <h2 className="mt-2 text-3xl font-bold text-white">How the new folders behave</h2>
              <div className="mt-6 space-y-3">
                {topBehaviors.map((item) => (
                  <article className="sm-manager-method" key={item.sourceBehavior}>
                    <p className="font-semibold text-white">{item.sourceBehavior}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.count} records currently classified with this behavior.</p>
                  </article>
                ))}
              </div>
              <div className="mt-6 space-y-3">
                {mobileSurfaces.map((item) => (
                  <article className="sm-chip text-white" key={item.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.whenToUse}</p>
                      </div>
                      <Link className="sm-link" to={item.route}>
                        {item.primaryAction}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="sm-calm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Typed lanes</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Every root lane with a route and a next move</h2>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {laneCards.map((lane) => (
                  <article className="sm-proof-card" key={lane.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{lane.title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">
                          {lane.domain} / {routeLabel(lane.firstDeskRoute)}
                        </p>
                      </div>
                      <span className={`sm-status-pill ${toneForLaneStatus(lane.status)}`}>{lane.status}</span>
                    </div>
                    <p className="mt-4 text-sm text-[var(--sm-muted)]">{lane.observedBehavior}</p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Live items</p>
                        <p className="mt-2 text-lg font-bold">{lane.liveItemCount}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Canonical</p>
                        <p className="mt-2 text-lg font-bold">{lane.canonicalRecordCount}</p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-white/84">{lane.ownerNote}</p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link className="sm-button-secondary" to={lane.firstDeskRoute}>
                        Open {routeLabel(lane.firstDeskRoute)}
                      </Link>
                      <a className="sm-link" href={lane.driveUrl} rel="noreferrer" target="_blank">
                        Open Drive item
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </section>
        </section>
      ) : null}

      {activeView === 'ask' ? (
        <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <article className="space-y-6">
            <div className="sm-calm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Ask workspace</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Answers with source-backed context</h2>
              <div className="mt-6 space-y-4">
                <textarea
                  className="min-h-[120px] w-full rounded-3xl border border-white/10 bg-[rgba(6,14,24,0.92)] px-4 py-4 text-sm text-white outline-none transition focus:border-[var(--sm-accent)]"
                  onChange={(event) => setRootQuery(event.target.value)}
                  value={rootQuery}
                />
                <div className="flex flex-wrap gap-2">
                  {directorQueryStarters.map((item) => (
                    <button className="sm-status-pill text-left" key={item} onClick={() => void handleRunQuery(item)} type="button">
                      {item}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className="sm-button-primary" disabled={queryingRoot} onClick={() => void handleRunQuery()} type="button">
                    {queryingRoot ? 'Searching...' : 'Ask'}
                  </button>
                  <Link className="sm-button-secondary" to="/app/data-fabric">
                    Open data fabric
                  </Link>
                </div>
                <p className="text-sm text-[var(--sm-muted)]">{rootQueryNote}</p>
              </div>
            </div>

            <div className="sm-calm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">System loops</p>
              <div className="mt-4 space-y-3">
                {agentLoops.map((item) => (
                  <article className="sm-manager-method" key={item.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{item.name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.trigger}</p>
                      </div>
                      <span className="sm-status-pill">{item.status}</span>
                    </div>
                    <p className="mt-4 text-sm text-white/84">{item.nextAction}</p>
                  </article>
                ))}
              </div>
            </div>
          </article>

          <article className="space-y-6">
            <div className="sm-calm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Conversation</p>
              <div className="mt-4 space-y-3">
                {rootChatHistory.length ? (
                  rootChatHistory.map((message) => (
                    <article
                      className={message.role === 'assistant' ? 'sm-proof-card' : 'rounded-3xl border border-white/10 bg-white/5 p-4'}
                      key={message.id}
                    >
                      <p className="sm-kicker text-[var(--sm-accent)]">{message.role === 'assistant' ? assistantLabel : 'You'}</p>
                      <p className="mt-3 text-sm leading-7 text-white">{message.text}</p>
                      {message.note ? <p className="mt-3 text-sm text-[var(--sm-muted)]">{message.note}</p> : null}
                      {message.chips?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {message.chips.map((chip) => (
                            <span className="sm-status-pill" key={chip}>
                              {chip}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">Run a question to start the workspace conversation.</div>
                )}
              </div>
            </div>

            <div className="sm-calm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Evidence and next moves</p>
              <div className="mt-4 space-y-3">
                {(rootQueryResult?.nextMoves ?? rootWarehouse.nextActions.slice(0, 3)).map((item) => (
                  <article className="sm-chip" key={item}>
                    <p className="text-sm text-white">{item}</p>
                  </article>
                ))}
              </div>
              <div className="mt-6 space-y-3">
                {latestEvidence.length ? (
                  latestEvidence.map((row: YtfKnowledgeEvidenceRow) => (
                    <article className="sm-proof-card" key={row.recordId}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{row.title}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">
                            {row.laneTitle} / {row.recordType}
                          </p>
                        </div>
                        <span className={`sm-status-pill ${toneForRisk(row.riskLevel)}`}>{row.riskLevel || 'medium'}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="sm-status-pill">{row.domain}</span>
                        <span className="sm-status-pill">{routeLabel(row.owningDeskRoute)}</span>
                        <span className="sm-status-pill">{row.sourceBehavior || 'direct_file'}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link className="sm-link" to={row.owningDeskRoute}>
                          Open {routeLabel(row.owningDeskRoute)}
                        </Link>
                        {row.webViewLink ? (
                          <a className="sm-link" href={row.webViewLink} rel="noreferrer" target="_blank">
                            Open evidence
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">Run a root query to populate evidence-backed results.</div>
                )}
              </div>
            </div>
          </article>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Exceptions</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Keep the noisy edges visible</h2>
          <div className="mt-6 grid gap-3">
            {exceptions.length ? (
              exceptions.map((row) => (
                <article className="sm-proof-card" key={row.exception_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{row.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary}</p>
                    </div>
                    <span className="sm-status-pill">{row.priority}</span>
                  </div>
                  <p className="mt-4 text-sm text-white/84">{row.owner}</p>
                </article>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">No open exceptions right now.</div>
            )}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Decisions and pipeline</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Keep commercial and internal follow-up visible</h2>
          <div className="mt-6 grid gap-3">
            {decisions.map((row) => (
              <article className="sm-manager-method" key={row.decision_id}>
                <p className="font-semibold text-white">{row.title}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.decision_text}</p>
                <p className="mt-3 text-sm text-white/84">
                  {row.owner} · {row.status}
                </p>
              </article>
            ))}
            {leads.map((row) => (
              <article className="sm-manager-method" key={row.lead_id}>
                <p className="font-semibold text-white">{row.company_name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">
                  {row.stage} · {row.service_pack} · {row.wedge_product}
                </p>
                <p className="mt-3 text-sm text-white/84">{row.owner}</p>
              </article>
            ))}
            {!decisions.length && !leads.length ? <div className="sm-chip text-[var(--sm-muted)]">No decision or lead rows available yet.</div> : null}
          </div>
        </article>
      </section>

      {error ? <section className="sm-chip text-[var(--sm-muted)]">{error}</section> : null}
    </div>
  )
}
