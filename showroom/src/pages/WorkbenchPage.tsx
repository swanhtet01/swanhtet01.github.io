import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  AGENT_TECHNIQUE_PATTERNS,
  DELEGATED_POD_CHARTERS,
  EXECUTION_TRACKS,
  FRAMEWORK_DECISIONS,
  INFRASTRUCTURE_PHASES,
  STRATEGIC_DIALECTICS,
} from '../lib/controlWorkbenchModel'
import {
  buildFactoryProgramBoard,
  summarizeFactoryProgramBoard,
} from '../lib/moduleFactoryRuntime'
import {
  getSeedRuntimeControlDataset,
  loadRuntimeControlDataset,
  type RuntimeControlDataset,
} from '../lib/runtimeControlApi'
import {
  checkWorkspaceHealth,
  createApprovalEntry,
  createDecisionEntry,
  createWorkspaceTasks,
  getCapabilityProfileForRole,
  getAgentTeams,
  getPlatformControlPlane,
  getWorkspaceSession,
  listDecisionEntries,
  listExceptionRows,
  listWorkspaceTasks,
  listAgentRuns,
  sessionHasCapability,
  workspaceApiBase,
  workspaceFetch,
  type AgentRunRow,
  type AgentTeamsPayload,
  type DecisionRow,
  type DecisionSummary,
  type ExceptionRow,
  type ExceptionSummary,
  type PlatformControlPlanePayload,
} from '../lib/workspaceApi'

type SummaryPayload = {
  coverage_score?: number
  actions?: {
    total_items?: number
  }
  quality?: {
    incident_count?: number
    capa_count?: number
  }
  supplier_watch?: {
    risk_count?: number
  }
  receiving?: {
    receiving_count?: number
    variance_count?: number
  }
  inventory?: {
    inventory_count?: number
    reorder_count?: number
  }
  metrics?: {
    metric_count?: number
  }
  feedback?: {
    feedback_count?: number
    open_count?: number
    high_priority_count?: number
  }
  agent_system?: {
    team_count?: number
    autonomy_score?: number
  }
  supervisor?: {
    status?: string
    interval_minutes?: number
  }
  review?: {
    top_priorities?: string[]
  }
}

type ActionRow = {
  action_id: string
  title: string
  action: string
  owner: string
  priority: string
  due: string
  lane: string
}

type MetricRow = {
  metric_id: string
  metric_name: string
  metric_group: string
  metric_value: string
  unit: string
  owner: string
  captured_at: string
  status: string
}

type FeedbackRow = {
  feedback_id: string
  created_at: string
  surface: string
  category: string
  priority: string
  status: string
  note: string
}

type FeedbackForm = {
  surface: string
  category: string
  priority: string
  note: string
}

type DecisionForm = {
  title: string
  context: string
  decision_text: string
  rationale: string
  owner: string
  status: string
  due: string
  related_route: string
}

const quickLaunches = [
  {
    name: 'Director Dashboard',
    detail: 'See actions, exceptions, decisions, and leads.',
    to: '/app/director',
  },
  {
    name: 'Decision Journal',
    detail: 'Save decisions, owners, and rationale.',
    to: '/app/decisions',
  },
  {
    name: 'Exception Queue',
    detail: 'See what is starting to break.',
    to: '/app/exceptions',
  },
  {
    name: 'Action OS',
    detail: 'Run the live owner board.',
    to: '/app/actions',
  },
  {
    name: 'DQMS and KPI Intake',
    detail: 'Upload evidence, capture KPI rows, and seed structured operating reviews.',
    to: '/app/intake',
  },
  {
    name: 'Metrics and Model Desk',
    detail: 'Run gap analysis, SWOT packs, anomalies, and forecast-backed operating insight.',
    to: '/app/insights',
  },
  {
    name: 'Operations Desk',
    detail: 'Run plant flow, inbound watch, approvals, and escalation from one desk.',
    to: '/app/operations',
  },
  {
    name: 'DQMS Desk',
    detail: 'Run incidents, CAPA, KPI review, fishbone, and 5W1H in one place.',
    to: '/app/dqms',
  },
  {
    name: 'Maintenance Desk',
    detail: 'Track breakdowns, preventive work, downtime, and spare-part blockers.',
    to: '/app/maintenance',
  },
  {
    name: 'Inventory',
    detail: 'Watch stock and reorder pressure.',
    to: '/app/inventory',
  },
  {
    name: 'Lead Finder',
    detail: 'Find leads and build offers.',
    to: '/app/sales',
  },
  {
    name: 'Platform Admin',
    detail: 'Review tenant roles, connectors, knowledge layers, and rollout gaps.',
    to: '/app/platform-admin',
  },
  {
    name: 'Model Ops',
    detail: 'Check provider readiness, routing contracts, and benchmark drills before wider autonomy.',
    to: '/app/model-ops',
  },
  {
    name: 'Foundry',
    detail: 'Run the release desk for research, prototype, rollout, and module promotion.',
    to: '/app/foundry',
  },
  {
    name: 'Build',
    detail: 'Run R&D, release gates, module programs, and tenant launch work.',
    to: '/app/factory',
  },
  {
    name: 'Runtime',
    detail: 'See the big-picture health of connectors, memory, autonomy, and guardrails.',
    to: '/app/runtime',
  },
  {
    name: 'Product Ops',
    detail: 'Track release trains, research cells, crews, and module readiness.',
    to: '/app/product-ops',
  },
  {
    name: 'Connectors',
    detail: 'Check sync freshness, backlog, source maps, and next automation.',
    to: '/app/connectors',
  },
  {
    name: 'Knowledge',
    detail: 'Review canon quality, relation coverage, and promotion queues.',
    to: '/app/knowledge',
  },
  {
    name: 'Security',
    detail: 'Inspect trust boundaries, sensitive-field posture, and audit coverage.',
    to: '/app/security',
  },
  {
    name: 'Policies',
    detail: 'Check release, autonomy, knowledge, and connector guardrails.',
    to: '/app/policies',
  },
  {
    name: 'News Brief',
    detail: 'Turn signals into one short brief.',
    to: '/app/news',
  },
] as const

const feedbackDefaults: FeedbackForm = {
  surface: 'workbench',
  category: 'ux',
  priority: 'medium',
  note: '',
}

const decisionDefaults: DecisionForm = {
  title: '',
  context: '',
  decision_text: '',
  rationale: '',
  owner: 'Management',
  status: 'open',
  due: '',
  related_route: '/app/workbench',
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not recorded'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function countRuntimeAttention(dataset: RuntimeControlDataset) {
  return (
    dataset.connectors.filter((item) => item.status !== 'Healthy').length +
    dataset.knowledgeCollections.filter((item) => item.status !== 'Healthy').length +
    dataset.policyGuardrails.filter((item) => item.status !== 'Healthy').length +
    dataset.autonomyLoops.filter((item) => item.status !== 'Healthy').length
  )
}

function toneForStatus(value: string | null | undefined) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  if (
    normalized === 'live' ||
    normalized === 'live sellable' ||
    normalized === 'adopt now' ||
    normalized === 'healthy' ||
    normalized === 'active' ||
    normalized === 'completed'
  ) {
    return 'text-emerald-300'
  }
  if (
    normalized === 'pilot now' ||
    normalized === 'pilot expansion' ||
    normalized === 'in build' ||
    normalized === 'standardize next' ||
    normalized === 'warning' ||
    normalized === 'running'
  ) {
    return 'text-amber-300'
  }
  if (normalized === 'degraded' || normalized === 'needs wiring' || normalized === 'mapped only' || normalized === 'blocked' || normalized === 'error') {
    return 'text-rose-300'
  }
  return 'text-white/80'
}

export function WorkbenchPage() {
  const [loading, setLoading] = useState(true)
  const [apiReady, setApiReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [roleLabel, setRoleLabel] = useState('Unknown')
  const [canViewControlTower, setCanViewControlTower] = useState(false)
  const [canManageControlTower, setCanManageControlTower] = useState(false)
  const [canSeeModuleControl, setCanSeeModuleControl] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [managementNote, setManagementNote] = useState<string | null>(null)
  const [executionMessage, setExecutionMessage] = useState<string | null>(null)
  const [executionBusyTrack, setExecutionBusyTrack] = useState<string | null>(null)
  const [controlMessage, setControlMessage] = useState<string | null>(null)
  const [controlError, setControlError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [decisionSaving, setDecisionSaving] = useState(false)
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null)
  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [actions, setActions] = useState<ActionRow[]>([])
  const [metrics, setMetrics] = useState<MetricRow[]>([])
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([])
  const [decisions, setDecisions] = useState<DecisionRow[]>([])
  const [decisionSummary, setDecisionSummary] = useState<DecisionSummary | null>(null)
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([])
  const [exceptionSummary, setExceptionSummary] = useState<ExceptionSummary | null>(null)
  const [runtimeDataset, setRuntimeDataset] = useState<RuntimeControlDataset>(getSeedRuntimeControlDataset())
  const [controlPlane, setControlPlane] = useState<PlatformControlPlanePayload | null>(null)
  const [agentTeams, setAgentTeams] = useState<AgentTeamsPayload | null>(null)
  const [agentRuns, setAgentRuns] = useState<AgentRunRow[]>([])
  const [feedbackForm, setFeedbackForm] = useState<FeedbackForm>(feedbackDefaults)
  const [decisionForm, setDecisionForm] = useState<DecisionForm>(decisionDefaults)

  async function loadWorkbench(canSeeModuleControl: boolean) {
    const [summaryPayload, actionPayload, metricPayload, feedbackPayload] = await Promise.all([
      workspaceFetch<SummaryPayload>('/api/summary'),
      workspaceFetch<{ items: ActionRow[] }>('/api/actions?limit=6'),
      workspaceFetch<{ rows: MetricRow[] }>('/api/metrics/records?limit=6'),
      workspaceFetch<{ rows: FeedbackRow[] }>('/api/product-feedback?limit=8'),
    ])
    setSummary(summaryPayload)
    setActions(actionPayload.items ?? [])
    setMetrics(metricPayload.rows ?? [])
    setFeedbackRows(feedbackPayload.rows ?? [])

    const settled = await Promise.allSettled([
      loadRuntimeControlDataset(),
      getAgentTeams(),
      listAgentRuns(8),
      canSeeModuleControl ? getPlatformControlPlane() : Promise.resolve(null),
      listDecisionEntries(undefined, undefined, 8),
      listExceptionRows(8),
    ])

    const nextMessages: string[] = []

    if (settled[0].status === 'fulfilled') {
      setRuntimeDataset(settled[0].value)
    } else {
      nextMessages.push('Runtime control fell back to the seed model.')
    }

    if (settled[1].status === 'fulfilled') {
      setAgentTeams(settled[1].value)
    } else {
      nextMessages.push('Agent-team state is unavailable.')
    }

    if (settled[2].status === 'fulfilled') {
      setAgentRuns(settled[2].value.rows ?? [])
    } else {
      nextMessages.push('Recent agent runs could not be loaded.')
    }

    if (settled[3].status === 'fulfilled') {
      setControlPlane(settled[3].value)
    } else if (canSeeModuleControl) {
      nextMessages.push('Module control-plane data could not be loaded.')
    } else {
      nextMessages.push('Module control-plane details require tenant-admin or platform-admin access.')
    }

    if (settled[4].status === 'fulfilled') {
      setDecisions(settled[4].value.rows ?? [])
      setDecisionSummary(settled[4].value.summary ?? null)
    } else {
      nextMessages.push('Decision register could not be loaded.')
    }

    if (settled[5].status === 'fulfilled') {
      setExceptions(settled[5].value.rows ?? [])
      setExceptionSummary(settled[5].value.summary ?? null)
    } else {
      nextMessages.push('Exception radar could not be loaded.')
    }

    setManagementNote(nextMessages.length > 0 ? nextMessages.join(' ') : null)
    setLastSyncAt(new Date().toISOString())
  }

  const liveModules = useMemo(() => controlPlane?.modules?.rows ?? [], [controlPlane?.modules?.rows])
  const liveProgramBoard = useMemo(() => buildFactoryProgramBoard(liveModules), [liveModules])
  const liveProgramSummary = useMemo(() => summarizeFactoryProgramBoard(liveProgramBoard), [liveProgramBoard])
  const runtimeAttentionCount = useMemo(() => countRuntimeAttention(runtimeDataset), [runtimeDataset])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const health = await checkWorkspaceHealth()
      if (cancelled) return
      setApiReady(health.ready)
      if (!health.ready) {
        setLoading(false)
        return
      }

      let canSeeModuleControl = false

      try {
        const session = await getWorkspaceSession()
        if (cancelled) return
        if (!session.authenticated) {
          setAuthenticated(false)
          setLoading(false)
          return
        }
        setAuthenticated(true)
        const capabilityProfile = getCapabilityProfileForRole(session.session?.role)
        const canView =
          sessionHasCapability(session.session, 'director.view') ||
          sessionHasCapability(session.session, 'agent_ops.view') ||
          sessionHasCapability(session.session, 'architect.view') ||
          sessionHasCapability(session.session, 'tenant_admin.view') ||
          sessionHasCapability(session.session, 'platform_admin.view')
        const canManage =
          sessionHasCapability(session.session, 'agent_ops.view') ||
          sessionHasCapability(session.session, 'architect.view') ||
          sessionHasCapability(session.session, 'tenant_admin.view') ||
          sessionHasCapability(session.session, 'platform_admin.view')
        setRoleLabel(capabilityProfile.label)
        setCanViewControlTower(canView)
        setCanManageControlTower(canManage)
        if (!canView) {
          setError(`Control-tower access is required. Current role: ${capabilityProfile.label}.`)
          setLoading(false)
          return
        }
        canSeeModuleControl =
          sessionHasCapability(session.session, 'tenant_admin.view') || sessionHasCapability(session.session, 'platform_admin.view')
        setCanSeeModuleControl(canSeeModuleControl)
      } catch {
        if (!cancelled) {
          setError('Workbench login could not be verified on this host.')
          setLoading(false)
        }
        return
      }

      try {
        await loadWorkbench(canSeeModuleControl)
      } catch {
        if (!cancelled) {
          setError('Workbench service is not responding yet.')
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

  useEffect(() => {
    if (!apiReady || !authenticated) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadWorkbench(canSeeModuleControl).catch(() => {
        setManagementNote((current) => current ?? 'Live refresh is waiting for the workspace service to respond.')
      })
    }, 60_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [apiReady, authenticated, canSeeModuleControl])

  async function saveFeedback() {
    if (!apiReady || !feedbackForm.note.trim()) {
      return
    }
    setSaving(true)
    setSaved(null)
    setError(null)
    try {
      const payload = await workspaceFetch<{ message?: string; rows?: FeedbackRow[]; summary?: SummaryPayload['feedback'] }>(
        '/api/product-feedback',
        {
          method: 'POST',
          body: JSON.stringify(feedbackForm),
        },
      )
      setFeedbackRows(payload.rows ?? [])
      setSummary((current) => ({
        ...(current ?? {}),
        feedback: payload.summary ?? current?.feedback,
      }))
      setFeedbackForm(feedbackDefaults)
      setSaved(payload.message ?? 'Feedback saved.')
    } catch {
      setError('Could not save the workbench note right now.')
    } finally {
      setSaving(false)
    }
  }

  async function executeTrack(trackId: string) {
    if (!canManageControlTower) {
      setControlError('Manage access is required to execute control tracks.')
      return
    }
    const track = EXECUTION_TRACKS.find((item) => item.id === trackId)
    if (!track) {
      return
    }

    setExecutionBusyTrack(trackId)
    setExecutionMessage(null)
    setControlError(null)
    setControlMessage(null)
    setError(null)

    try {
      const existingTaskPayload = await listWorkspaceTasks('', 300)
      const existingRows = existingTaskPayload.rows ?? []
      const existingKeySet = new Set(
        existingRows.map((row) => `${String(row.title || '').trim().toLowerCase()}::${String(row.notes || '').trim().toLowerCase()}`),
      )

      const rowsToCreate = track.tasks.filter((task) => {
        const dedupeKey = `${task.title.trim().toLowerCase()}::${task.notes.trim().toLowerCase()}`
        return !existingKeySet.has(dedupeKey)
      })

      if (rowsToCreate.length === 0) {
        setExecutionMessage(`${track.name} is already seeded into the workspace task board.`)
        return
      }

      await createWorkspaceTasks(
        rowsToCreate.map((task) => ({
          title: task.title,
          owner: task.owner,
          priority: task.priority,
          due: task.due,
          status: 'open',
          template: 'control_workbench',
          notes: task.notes,
        })),
      )

      const session = await getWorkspaceSession()
      const canSeeModuleControl =
        sessionHasCapability(session.session, 'tenant_admin.view') || sessionHasCapability(session.session, 'platform_admin.view')
      await loadWorkbench(canSeeModuleControl)
      setExecutionMessage(`${track.name} seeded ${rowsToCreate.length} execution tasks into the workspace.`)
    } catch {
      setError('Could not execute this track right now.')
    } finally {
      setExecutionBusyTrack(null)
    }
  }

  async function saveDecision() {
    if (!canManageControlTower) {
      setControlError('Manage access is required to save enterprise decisions.')
      return
    }
    if (!decisionForm.title.trim() || !decisionForm.decision_text.trim()) {
      return
    }
    setDecisionSaving(true)
    setControlMessage(null)
    setControlError(null)
    try {
      const payload = await createDecisionEntry(decisionForm)
      setDecisions((payload.rows ?? []).slice(0, 8))
      setDecisionSummary(payload.summary ?? null)
      setDecisionForm(decisionDefaults)
      setControlMessage(payload.message ?? 'Decision saved.')
    } catch {
      setControlError('Could not save the decision right now.')
    } finally {
      setDecisionSaving(false)
    }
  }

  async function sendExceptionToApprovals(row: ExceptionRow) {
    if (!canManageControlTower) {
      setControlError('Manage access is required to escalate exceptions.')
      return
    }
    setApprovalBusyId(row.exception_id)
    setControlMessage(null)
    setControlError(null)
    try {
      await createApprovalEntry({
        title: row.title,
        summary: row.summary,
        approval_gate: row.source_type,
        requested_by: row.owner || 'System',
        owner: 'Management',
        status: 'pending',
        due: row.due,
        related_route: row.route,
        related_entity: row.entity,
        payload: row,
      })
      setControlMessage(`Sent "${row.title}" to approvals.`)
    } catch {
      setControlError('Could not send this exception to approvals right now.')
    } finally {
      setApprovalBusyId(null)
    }
  }

  if (!loading && apiReady && authenticated && !canViewControlTower) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Enterprise control tower"
          title="Control-tower access required."
          description="This surface is reserved for leadership, platform, architecture, and operational control roles."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">Current role: {roleLabel}. Ask a tenant admin or platform admin to grant control-tower access.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/actions">
              Open My Queue
            </Link>
            <Link className="sm-button-secondary" to="/app/director">
              Open Director
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Enterprise control tower"
        title="Run platform architecture, operations, and delivery from one control surface."
        description="This is the enterprise control layer for architecture, infrastructure, runtime posture, agent operations, and execution management. It keeps direction and live system state on the same screen."
      />

      <section className="grid gap-3 md:grid-cols-6">
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Mode</p>
          <p className="mt-2">{apiReady && authenticated ? 'live workspace' : 'preview shell'}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Programs</p>
          <p className="mt-2">{liveProgramSummary.liveSellableCount} live sellable</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
          <p className="mt-2">{controlPlane?.modules?.enabled_count ?? 0} enabled / {controlPlane?.modules?.pilot_count ?? 0} pilot</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">AI workforce</p>
          <p className="mt-2">{agentTeams?.summary?.team_count ?? 0} teams / autonomy {agentTeams?.summary?.autonomy_score ?? 0}</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent)]">Runtime attention</p>
          <p className="mt-2">{runtimeAttentionCount} items need review</p>
        </div>
        <div className="sm-chip text-white">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Last sync</p>
          <p className="mt-2">{formatDateTime(lastSyncAt)}</p>
        </div>
      </section>

      {managementNote ? (
        <div className="sm-chip text-white">
          <strong>System note</strong>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{managementNote}</p>
        </div>
      ) : null}

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Operating principles</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Enterprise rules for scale, trust, and product depth.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These are the working rules for building an AI-native enterprise platform without fragmenting runtime, delivery, governance, or product quality.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {STRATEGIC_DIALECTICS.map((item) => (
            <article className="sm-proof-card" key={item.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white">{item.title}</p>
                <span className="sm-status-pill">{item.domain}</span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Scale goal</p>
                  <p className="mt-1 text-[var(--sm-muted)]">{item.thesis}</p>
                </div>
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Failure mode</p>
                  <p className="mt-1 text-[var(--sm-muted)]">{item.antithesis}</p>
                </div>
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Operating standard</p>
                  <p className="mt-1 text-white/85">{item.synthesis}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-[var(--sm-muted)]">{item.implementation}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.routes.map((route) => (
                  <Link className="sm-button-secondary" key={`${item.id}-${route.to}`} to={route.to}>
                    {route.label}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Adopted framework stack</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These are the frameworks to standardize into the machine.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            This is the current stack decision: one best-fit framework per layer, connected by clear contracts instead of framework sprawl.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {FRAMEWORK_DECISIONS.map((decision) => (
            <article className="sm-demo-link sm-demo-link-card" key={decision.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="sm-home-proof-label">{decision.category}</span>
                <span className={`sm-status-pill ${toneForStatus(decision.status)}`}>{decision.status}</span>
              </div>
              <strong>{decision.name}</strong>
              <small className="text-[var(--sm-muted)]">Primary role: {decision.thesis}</small>
              <small className="text-[var(--sm-muted)]">Tradeoff managed: {decision.antithesis}</small>
              <small className="text-[var(--sm-muted)]">Platform standard: {decision.synthesis}</small>
              <small className="text-[var(--sm-muted)]">{decision.why}</small>
              <small className="text-[var(--sm-muted)]">Use for: {decision.useCases.join(', ')}</small>
              <div className="mt-2 flex flex-wrap gap-2">
                {decision.docs.map((doc) => (
                  <a className="sm-link" href={doc.href} key={`${decision.id}-${doc.href}`} rel="noreferrer" target="_blank">
                    {doc.label}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Execution tracks</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Execute the adopted stack into the live queue.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Each track turns platform direction into a practical task set. Executing a track seeds the workspace with concrete architecture and delivery work.
          </p>
        </div>

        {executionMessage ? (
          <div className="mt-6 sm-chip text-white">{executionMessage}</div>
        ) : null}

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {EXECUTION_TRACKS.map((track) => (
            <article className="sm-proof-card" key={track.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white">{track.name}</p>
                <button
                  className="sm-button-primary"
                  disabled={!apiReady || !authenticated || !canManageControlTower || executionBusyTrack === track.id}
                  onClick={() => void executeTrack(track.id)}
                  type="button"
                >
                  {executionBusyTrack === track.id ? 'Executing...' : 'Execute'}
                </button>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{track.objective}</p>
              <div className="mt-4 space-y-2 text-sm">
                <p className="text-[var(--sm-muted)]">
                  <span className="text-white/85">Need:</span> {track.thesis}
                </p>
                <p className="text-[var(--sm-muted)]">
                  <span className="text-white/85">Risk:</span> {track.antithesis}
                </p>
                <p className="text-[var(--sm-muted)]">
                  <span className="text-white/85">Delivery standard:</span> {track.synthesis}
                </p>
              </div>
              <p className="mt-4 text-sm text-white/80">Outcome: {track.outcome}</p>
              <div className="mt-4 grid gap-2">
                {track.tasks.map((task) => (
                  <div className="sm-chip text-white" key={`${track.id}-${task.title}`}>
                    <p className="font-semibold">{task.title}</p>
                    <p className="mt-1 text-sm text-[var(--sm-muted)]">
                      {task.owner} | {task.priority} | {task.due}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Delegated pods</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Scale with bounded pods instead of vague agent swarms.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            These pods define how delegation works in production: explicit mission, explicit scope, and an explicit review gate before high-impact changes
            move forward.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {DELEGATED_POD_CHARTERS.map((pod) => (
            <article className="sm-proof-card" key={pod.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white">{pod.name}</p>
                <span className="sm-status-pill">Delegated pod</span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{pod.mission}</p>

              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Owns</p>
                  <p className="mt-1 text-[var(--sm-muted)]">{pod.owns.join(', ')}</p>
                </div>
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Read scope</p>
                  <p className="mt-1 text-[var(--sm-muted)]">{pod.readScope.join(', ')}</p>
                </div>
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Write scope</p>
                  <p className="mt-1 text-[var(--sm-muted)]">{pod.writeScope.join(', ')}</p>
                </div>
              </div>

              <p className="mt-4 text-sm text-white/80">Review gate: {pod.reviewGate}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {pod.routes.map((route) => (
                  <Link className="sm-button-secondary" key={`${pod.id}-${route.to}`} to={route.to}>
                    {route.label}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Infrastructure phases</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Build the machine in sequence so scale compounds.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            The platform should not adopt every runtime pattern at once. Each phase closes a strategic tension first, then becomes the base for the next
            layer of autonomy.
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {INFRASTRUCTURE_PHASES.map((phase) => (
            <article className="sm-demo-link sm-demo-link-card" key={phase.id}>
              <span className="sm-status-pill">{phase.phase}</span>
              <strong>{phase.outcome}</strong>
              <small className="text-[var(--sm-muted)]">Requirement: {phase.thesis}</small>
              <small className="text-[var(--sm-muted)]">Risk: {phase.antithesis}</small>
              <small className="text-[var(--sm-muted)]">Control standard: {phase.synthesis}</small>
              <small className="text-[var(--sm-muted)]">Focus: {phase.focus.join(', ')}</small>
              <div className="mt-2">
                <Link className="sm-link" to={phase.route}>
                  Open lane
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Technique patterns</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The agent company should run on explicit operating patterns.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {AGENT_TECHNIQUE_PATTERNS.map((pattern) => (
              <article className="sm-chip text-white" key={pattern.id}>
                <p className="font-semibold">{pattern.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{pattern.principle}</p>
                <p className="mt-2 text-sm text-white/80">Implementation: {pattern.implementation}</p>
                <p className="mt-2 text-sm text-white/80">Outcome: {pattern.outcome}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Live control pulse</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The management layer should always show where the machine stands.</h2>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Runtime posture</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{runtimeDataset.bigPicture.thesis}</p>
              <p className="mt-3 text-sm text-white/80">Updated: {formatDateTime(runtimeDataset.updatedAt)}</p>
            </article>
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Program readiness</p>
              <p className="mt-3 text-3xl font-bold text-white">{liveProgramSummary.averageReadiness}%</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                {liveProgramSummary.liveSellableCount} live sellable, {liveProgramSummary.pilotExpansionCount} pilot expansion, {liveProgramSummary.mappedOnlyCount} mapped only
              </p>
            </article>
          </div>
          <div className="mt-6 grid gap-3">
            {(summary?.review?.top_priorities ?? runtimeDataset.bigPicture.nextBuilds).slice(0, 4).map((item) => (
              <article className="sm-demo-mini" key={item}>
                <strong>Next build</strong>
                <span>{item}</span>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Daily cockpit</p>
          <h2 className="mt-3 text-3xl font-bold text-white">One place to open the real modules.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            Use this as the start screen. Open the module you need, do the work, and save fixes while the system is running.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {quickLaunches.map((item) => (
              <Link className="sm-command-row" key={item.name} to={item.to}>
                <div>
                  <p className="font-semibold text-white">{item.name}</p>
                  <p className="text-sm text-[var(--sm-muted)]">{item.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="sm-chip text-white">Open the module you need.</div>
            <div className="sm-chip text-white">Save what is broken before it gets lost.</div>
          </div>
        </article>

        <article className="sm-terminal p-6">
          {loading ? (
            <p className="text-sm text-[var(--sm-muted)]">Loading workbench pulse...</p>
          ) : !apiReady ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--sm-muted)]">Workbench API is not connected on this host yet.</p>
              <div className="sm-chip text-white">
                {workspaceApiBase
                  ? `Current API base: ${workspaceApiBase}`
                  : 'Run the local workspace service or deploy the single-app backend to use the live workbench.'}
              </div>
            </div>
          ) : !authenticated ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--sm-muted)]">Login is required to open the private workbench.</p>
              <Link className="sm-button-primary" to="/login?next=/app/workbench">
                Login to workbench
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Open actions</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.actions?.total_items ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Risk queue</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.supplier_watch?.risk_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent)]">Saved metrics</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.metrics?.metric_count ?? 0}</p>
                </div>
                <div className="sm-metric-card">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Product notes</p>
                  <p className="mt-3 text-3xl font-bold text-white">{summary?.feedback?.feedback_count ?? 0}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Receiving</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.receiving?.receiving_count ?? 0}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Variance: {summary?.receiving?.variance_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Inventory</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.inventory?.inventory_count ?? 0}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Reorder: {summary?.inventory?.reorder_count ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Agent teams</p>
                  <p className="mt-2 text-2xl font-bold">{summary?.agent_system?.team_count ?? 0}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Autonomy: {summary?.agent_system?.autonomy_score ?? 0}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Supervisor</p>
                  <p className="mt-2 text-lg font-bold">{summary?.supervisor?.status ?? 'manual'}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">
                    {summary?.supervisor?.interval_minutes ? `${summary.supervisor.interval_minutes} minute cycle` : 'No cycle'}
                  </p>
                </div>
              </div>

              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">What to improve next</p>
                <div className="mt-3 grid gap-2">
                  {(summary?.review?.top_priorities ?? []).slice(0, 4).map((item) => (
                    <div className="sm-chip bg-white/4 text-white" key={item}>
                      {item}
                    </div>
                  ))}
                  {!summary?.review?.top_priorities?.length ? (
                    <p className="text-sm text-[var(--sm-muted)]">No review priorities loaded yet.</p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Live program board</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What is actually staffed, live, or still mapped only</h2>
            </div>
            <Link className="sm-link" to="/app/factory">
              Open Build
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {liveProgramBoard.slice(0, 6).map((row) => (
              <article className="sm-proof-card" key={`workbench-program-${row.program.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{row.program.name}</p>
                  <span className={`sm-status-pill ${toneForStatus(row.posture)}`}>{row.posture}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{row.program.target}</p>
                <p className="mt-2 text-sm text-white/80">
                  Readiness {row.readinessScore}% | Enabled {row.enabledCount} | Pilot {row.pilotCount} | Missing {row.gapCount}
                </p>
                <p className="mt-2 text-sm text-white/80">Next move: {row.program.nextMove}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Recent agent loops</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What the workforce ran most recently</h2>
            </div>
            <Link className="sm-link" to="/app/teams">
              Open Agent Ops
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {agentRuns.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">No recent agent runs were returned for this workspace yet.</div>
            ) : (
              agentRuns.slice(0, 6).map((run) => (
                <article className="sm-chip text-white" key={run.run_id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{run.job_type}</p>
                    <span className={`sm-status-pill ${toneForStatus(run.status)}`}>{run.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{run.summary || 'No summary recorded yet.'}</p>
                  <p className="mt-2 text-sm text-white/80">Source: {run.source || 'system'}</p>
                  <p className="mt-2 text-sm text-white/80">Completed: {formatDateTime(run.completed_at || run.started_at || run.created_at)}</p>
                </article>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Escalation radar</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Work the issues that need management attention now.</h2>
            </div>
            <Link className="sm-link" to="/app/exceptions">
              Open exceptions
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Total</p>
              <p className="mt-2 text-2xl font-bold">{exceptionSummary?.total_items ?? exceptions.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">High priority</p>
              <p className="mt-2 text-2xl font-bold">{exceptionSummary?.by_priority?.high ?? 0}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Approval-ready</p>
              <p className="mt-2 text-2xl font-bold">{exceptions.filter((row) => String(row.priority).toLowerCase() === 'high').length}</p>
            </div>
          </div>

          {controlMessage ? <div className="mt-4 sm-chip text-white">{controlMessage}</div> : null}
          {controlError ? <div className="mt-4 sm-chip text-white">{controlError}</div> : null}
          {!canManageControlTower ? (
            <div className="mt-4 sm-chip text-white">Read-only access. Management actions require platform, architecture, or operational control permissions.</div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {exceptions.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">No live exception rows were returned for this workspace.</div>
            ) : (
              exceptions.map((row) => (
                <article className="sm-proof-card" key={row.exception_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{row.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary}</p>
                    </div>
                    <span className="sm-status-pill">{row.priority}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Source</p>
                      <p className="mt-2">{row.source_type}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Owner</p>
                      <p className="mt-2">{row.owner || 'System'}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Due</p>
                      <p className="mt-2">{row.due || 'Unscheduled'}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      className="sm-button-primary"
                      disabled={!canManageControlTower || approvalBusyId === row.exception_id}
                      onClick={() => void sendExceptionToApprovals(row)}
                      type="button"
                    >
                      {approvalBusyId === row.exception_id ? 'Sending...' : 'Send to approvals'}
                    </button>
                    <Link className="sm-button-secondary" to={row.route || '/app/exceptions'}>
                      Open source
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="sm-site-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Decision register</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Capture platform and operating decisions while work is live.</h2>
            </div>
            <Link className="sm-link" to="/app/decisions">
              Open journal
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Total</p>
              <p className="mt-2 text-2xl font-bold">{decisionSummary?.decision_count ?? decisions.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Open</p>
              <p className="mt-2 text-2xl font-bold">{decisionSummary?.by_status?.open ?? 0}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Decided</p>
              <p className="mt-2 text-2xl font-bold">{decisionSummary?.by_status?.decided ?? 0}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Title</span>
              <input
                className="sm-input"
                disabled={!canManageControlTower}
                onChange={(event) => setDecisionForm((current) => ({ ...current, title: event.target.value }))}
                value={decisionForm.title}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Decision</span>
              <textarea
                className="sm-textarea min-h-[120px]"
                disabled={!canManageControlTower}
                onChange={(event) => setDecisionForm((current) => ({ ...current, decision_text: event.target.value }))}
                value={decisionForm.decision_text}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Context</span>
              <textarea
                className="sm-textarea min-h-[110px]"
                disabled={!canManageControlTower}
                onChange={(event) => setDecisionForm((current) => ({ ...current, context: event.target.value }))}
                value={decisionForm.context}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Owner</span>
                <input
                  className="sm-input"
                  disabled={!canManageControlTower}
                  onChange={(event) => setDecisionForm((current) => ({ ...current, owner: event.target.value }))}
                  value={decisionForm.owner}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Due</span>
                <input
                  className="sm-input"
                  disabled={!canManageControlTower}
                  onChange={(event) => setDecisionForm((current) => ({ ...current, due: event.target.value }))}
                  value={decisionForm.due}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[var(--sm-muted)]">Route</span>
                <select
                  className="sm-input"
                  disabled={!canManageControlTower}
                  onChange={(event) => setDecisionForm((current) => ({ ...current, related_route: event.target.value }))}
                  value={decisionForm.related_route}
                >
                  <option value="/app/workbench">Workbench</option>
                  <option value="/app/runtime">Runtime</option>
                  <option value="/app/product-ops">Product Ops</option>
                  <option value="/app/platform-admin">Platform Admin</option>
                  <option value="/app/exceptions">Exception Queue</option>
                  <option value="/app/factory">Build</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="sm-button-primary"
                disabled={!canManageControlTower || decisionSaving || !decisionForm.title.trim() || !decisionForm.decision_text.trim()}
                onClick={() => void saveDecision()}
                type="button"
              >
                {decisionSaving ? 'Saving...' : 'Save decision'}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {decisions.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">No recent decisions were returned for this workspace.</div>
            ) : (
              decisions.map((row) => (
                <article className="sm-proof-card" key={row.decision_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-white">{row.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.decision_text}</p>
                    </div>
                    <span className="sm-status-pill">{row.status}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="sm-chip text-white">{row.owner || 'Management'}</span>
                    <span className="sm-chip text-white">{row.due || 'No due date'}</span>
                    <Link className="sm-chip text-white" to={row.related_route || '/app/decisions'}>
                      Open route
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Today queue</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What you can work right now</h2>
            </div>
            <Link className="sm-link" to="/app/actions">
              Full board
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {actions.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">No action rows yet. Use Action OS, Receiving, or Ops Intake to create the first live queue.</div>
            ) : (
              actions.map((row) => (
                <div className="sm-proof-card" key={row.action_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{row.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.action}</p>
                    </div>
                    <span className="sm-status-pill">{row.priority}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                      <p className="mt-2">{row.owner}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Lane</p>
                      <p className="mt-2">{row.lane}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Due</p>
                      <p className="mt-2">{row.due}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Testing notebook</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Save friction, bugs, and ideas while you use it.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This is the product improvement loop. Use the app, notice friction, save the note, and let that become the build backlog.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Surface</span>
              <select
                className="sm-input"
                value={feedbackForm.surface}
                onChange={(event) => setFeedbackForm((current) => ({ ...current, surface: event.target.value }))}
              >
                <option value="workbench">Workbench</option>
                <option value="action-os">Action OS</option>
                <option value="ops-intake">Ops Intake</option>
                <option value="receiving-control">Receiving Control</option>
                <option value="inventory-pulse">Inventory Pulse</option>
                <option value="lead-finder">Lead Finder</option>
                <option value="news-brief">News Brief</option>
                <option value="action-board">Action Board</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Category</span>
              <select
                className="sm-input"
                value={feedbackForm.category}
                onChange={(event) => setFeedbackForm((current) => ({ ...current, category: event.target.value }))}
              >
                <option value="ux">UX</option>
                <option value="bug">Bug</option>
                <option value="workflow">Workflow</option>
                <option value="data">Data</option>
                <option value="agent">Agent</option>
                <option value="idea">Idea</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--sm-muted)]">Priority</span>
              <select
                className="sm-input"
                value={feedbackForm.priority}
                onChange={(event) => setFeedbackForm((current) => ({ ...current, priority: event.target.value }))}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm text-[var(--sm-muted)]">Note</span>
            <textarea
              className="sm-textarea min-h-[150px]"
              placeholder="What felt clumsy, slow, missing, or especially useful?"
              value={feedbackForm.note}
              onChange={(event) => setFeedbackForm((current) => ({ ...current, note: event.target.value }))}
            />
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={!apiReady || saving || !feedbackForm.note.trim()} onClick={() => void saveFeedback()} type="button">
              {saving ? 'Saving...' : 'Save note'}
            </button>
            <Link className="sm-button-secondary" to="/platform">
              Review platform
            </Link>
          </div>

          {saved ? <div className="mt-4 sm-chip text-white">{saved}</div> : null}
          {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Fresh records</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Latest metric inputs</h2>
            </div>
            <Link className="sm-link" to="/app/intake">
              Add more
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {metrics.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">No saved metric rows yet. Use Ops Intake to capture KPIs or upload a source sheet.</div>
            ) : (
              metrics.map((row) => (
                <div className="sm-chip" key={row.metric_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{row.metric_name}</p>
                      <p className="mt-1 text-sm text-[var(--sm-muted)]">
                        {row.metric_group} | {row.owner} | {row.captured_at}
                      </p>
                    </div>
                    <span className="sm-status-pill">{row.status}</span>
                  </div>
                  <p className="mt-3 text-lg font-bold text-white">
                    {row.metric_value} {row.unit}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Product backlog</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Recent saved workbench notes</h2>
            </div>
            <span className="sm-status-pill">
              Open {summary?.feedback?.open_count ?? 0}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {feedbackRows.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">No saved product notes yet. Use the notebook above to start the improvement loop.</div>
            ) : (
              feedbackRows.map((row) => (
                <div className="sm-proof-card" key={row.feedback_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-white">{row.surface}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.note}</p>
                    </div>
                    <span className="sm-status-pill">{row.priority}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="sm-chip text-white">{row.category}</span>
                    <span className="sm-chip text-white">{row.status}</span>
                    <span className="sm-chip text-white">{row.created_at}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
