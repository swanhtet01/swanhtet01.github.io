import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { ENTERPRISE_META_TOOLS, WORKSPACE_FRAMEWORKS } from '../lib/enterprisePortalBlueprint'
import { type AgentOperatingModel } from '../lib/agentOperatingModel'
import { SUPERMEGA_CLOUD_OPS_MODEL } from '../lib/cloudOpsModel'
import {
  getSeedRuntimeControlDataset,
  normalizeRuntimeControlDataset,
  type RuntimeControlDataset,
  type RuntimeControlPayload,
} from '../lib/runtimeControlApi'
import {
  checkWorkspaceHealth,
  createApprovalEntry,
  createWorkspaceTasks,
  getCapabilityProfileForRole,
  runDefaultAgentJobs,
  type ApprovalRow,
  type AgentRunRow,
  type ExceptionRow,
  type TeamMemberRow,
  type WorkspaceTaskRow,
  updateApprovalEntryStatus,
  updateWorkspaceTask,
  workspaceFetch,
} from '../lib/workspaceApi'
import { getTenantConfig } from '../lib/tenantConfig'
import { resolveTenantRoleExperience } from '../lib/tenantRoleExperience'
import { YANGON_TYRE_DATA_PROFILE } from '../lib/yangonTyreDataProfile'
import { SUPERMEGA_CORE_MODEL, getTenantOperatingModel } from '../lib/tenantOperatingModel'

type SummaryPayload = {
  review?: {
    top_priorities?: string[]
  }
  actions?: {
    total_items?: number
  }
  agent_system?: {
    team_count?: number
    autonomy_score?: number
    manifest_version?: string
    manifest_tool_count?: number
    manifest_playbook_count?: number
  }
  agent_jobs?: {
    latest?: Array<{
      job_type?: string
      name?: string
      cadence?: string
      last_run?: AgentRunRow | null
    }>
  }
  quality?: {
    incident_count?: number
    capa_count?: number
  }
  supplier_watch?: {
    risk_count?: number
  }
  lead_pipeline?: {
    lead_count?: number
  }
  receiving?: {
    receiving_count?: number
    variance_count?: number
    review_count?: number
  }
  inventory?: {
    inventory_count?: number
    reorder_count?: number
    watch_count?: number
  }
  maintenance?: {
    maintenance_count?: number
    breakdown_count?: number
  }
  approvals?: {
    approval_count?: number
    by_status?: Record<string, number>
  }
  metrics?: {
    metric_count?: number
  }
  feedback?: {
    feedback_count?: number
    open_count?: number
    high_priority_count?: number
  }
  supervisor?: {
    status?: string
    last_finished_at?: string
    interval_minutes?: number
  }
  session?: {
    display_name?: string
    role?: string
    username?: string
  }
}

type ExceptionPayload = {
  summary?: {
    total_items?: number
    by_priority?: Record<string, number>
  }
  rows?: ExceptionRow[]
}

type ApprovalQueuePayload = {
  summary?: {
    approval_count?: number
    by_status?: Record<string, number>
  }
  rows?: ApprovalRow[]
}

type InsightPayload = {
  headline?: string
  insights?: Array<{
    key: string
    title: string
    summary: string
    category: string
    route: string
  }>
  recommended_actions?: string[]
}

type AgentTeamsPayload = {
  summary?: {
    team_count?: number
    autonomy_score?: number
    manifest_version?: string
    manifest_tool_count?: number
    manifest_playbook_count?: number
  }
  manifest?: AgentOperatingModel | null
  next_moves?: string[]
  gaps?: Array<{
    gap_id?: string
    severity?: string
    problem?: string
    next_step?: string
  }>
}

type LaunchSnapshotPayload = {
  generated_at?: string
  rollout_id?: string
  workspace_snapshot_key?: string
  workspace?: {
    workspace_name?: string
    workspace_slug?: string
  }
  task_summary?: {
    saved_count?: number
    saved_task_ids?: string[]
    live_total_count?: number
    live_open_count?: number
    live_done_count?: number
    rows?: WorkspaceTaskRow[]
  }
  rollout_pack?: {
    rollout_id?: string
    company_name?: string
    primary_pack?: string
    wedge_product?: string
    flagship?: string
    recommended_modules?: string[]
    implementation_order?: string[]
    first_30_days?: string[]
    agent_teams?: string[]
  }
}

type MetaWorkspacePayload = {
  status?: string
  summary?: SummaryPayload
  runtime_control?: RuntimeControlPayload
  insights?: InsightPayload
  agent_teams?: AgentTeamsPayload | null
  agent_runs?: {
    rows?: AgentRunRow[]
  }
  team_members?: {
    rows?: TeamMemberRow[]
  }
  workspace_tasks?: {
    rows?: WorkspaceTaskRow[]
  }
  latest_rollout?: LaunchSnapshotPayload | null
  approval_queue?: ApprovalQueuePayload | null
  exceptions?: ExceptionPayload | null
  attention?: AttentionItem[]
}

type AttentionItem = {
  id: string
  severity: 'Critical' | 'High' | 'Medium'
  area: 'Runtime' | 'Exception' | 'Agent' | 'Priority'
  title: string
  owner: string
  detail: string
  route: string
}

type AccessState = {
  loading: boolean
  apiReady: boolean
  authenticated: boolean
  roleLabel: string
  error: string | null
}

const workstreamRooms = [
  { name: 'Sales', route: '/app/sales', metric: 'leads', note: 'Pipeline and commercial follow-up' },
  { name: 'Operations', route: '/app/operations', metric: 'actions', note: 'Queue pressure and cross-functional flow' },
  { name: 'Receiving', route: '/app/receiving', metric: 'receiving', note: 'Inbound variances and review work' },
  { name: 'Quality', route: '/app/dqms', metric: 'quality', note: 'Incidents, CAPA, and closeout work' },
  { name: 'Maintenance', route: '/app/maintenance', metric: 'maintenance', note: 'Breakdowns, PM work, and downtime' },
  { name: 'Approvals', route: '/app/approvals', metric: 'approvals', note: 'Manager calls and blocked writes' },
] as const

const quickRooms = [
  { name: 'Meta workspace', route: '/app/meta', group: 'Meta', detail: 'The single internal cockpit', keywords: ['meta', 'workspace', 'overview', 'home', 'control tower'] },
  { name: 'My Queue', route: '/app/actions', group: 'Today', detail: 'Live owner queue', keywords: ['queue', 'tasks', 'actions', 'owner'] },
  { name: 'Director', route: '/app/director', group: 'Leadership', detail: 'Executive view and review', keywords: ['director', 'ceo', 'leadership', 'brief'] },
  { name: 'Insights', route: '/app/insights', group: 'Today', detail: 'Operating brief and recommendations', keywords: ['insights', 'brief', 'analysis'] },
  { name: 'Exceptions', route: '/app/exceptions', group: 'Today', detail: 'What is starting to break', keywords: ['exceptions', 'risk', 'issues'] },
  { name: 'Approvals', route: '/app/approvals', group: 'Today', detail: 'Pending approval calls', keywords: ['approvals', 'review', 'decision'] },
  { name: 'Adoption Command', route: '/app/adoption-command', group: 'Today', detail: 'Live role scoring, writeback health, and manager rituals', keywords: ['adoption', 'command', 'training', 'data entry', 'ritual', 'usage'] },
  { name: 'Workforce', route: '/app/workforce', group: 'Today', detail: 'Role routines, AI coworkers, and manager review loops', keywords: ['workforce', 'roles', 'daily routine', 'staff', 'manager review'] },
  { name: 'Sales', route: '/app/sales', group: 'Workstreams', detail: 'Commercial workspace', keywords: ['sales', 'crm', 'pipeline', 'leads'] },
  { name: 'Operations', route: '/app/operations', group: 'Workstreams', detail: 'Operations workspace', keywords: ['operations', 'ops', 'plant'] },
  { name: 'Receiving', route: '/app/receiving', group: 'Workstreams', detail: 'Receiving control', keywords: ['receiving', 'grn', 'inbound'] },
  { name: 'DQMS', route: '/app/dqms', group: 'Workstreams', detail: 'Quality and CAPA', keywords: ['quality', 'dqms', 'capa', 'fishbone', '5w1h'] },
  { name: 'Maintenance', route: '/app/maintenance', group: 'Workstreams', detail: 'Asset reliability and downtime', keywords: ['maintenance', 'breakdown', 'pm'] },
  { name: 'Cloud Ops', route: '/app/cloud', group: 'Runtime', detail: 'Cloud pods, environments, and internal control surfaces', keywords: ['cloud', 'ops', 'pods', 'environments', 'internal tools'] },
  { name: 'supermega.dev', route: '/app/supermega-dev', group: 'Runtime', detail: 'Domain, deploy, smoke, and machine control for the whole platform', keywords: ['supermega.dev', 'domain', 'deploy', 'smoke', 'machine', 'site'] },
  { name: 'Model Ops', route: '/app/model-ops', group: 'Runtime', detail: 'Provider lanes, routing contracts, and benchmark drills', keywords: ['model ops', 'provider routing', 'benchmarks', 'evals', 'llm'] },
  { name: 'Runtime', route: '/app/runtime', group: 'Runtime', detail: 'Runtime health and trust', keywords: ['runtime', 'connectors', 'autonomy'] },
  { name: 'Connectors', route: '/app/connectors', group: 'Runtime', detail: 'Feed freshness and sync posture', keywords: ['connectors', 'gmail', 'drive', 'sync'] },
  { name: 'Data Fabric', route: '/app/data-fabric', group: 'Runtime', detail: 'Whole-folder ingestion, feature marts, and role stories', keywords: ['data', 'pipeline', 'fabric', 'feature engineering', 'storytelling', 'kpi'] },
  { name: 'Knowledge', route: '/app/knowledge', group: 'Runtime', detail: 'Canon quality and promotion', keywords: ['knowledge', 'graph', 'canon'] },
  { name: 'Security', route: '/app/security', group: 'Runtime', detail: 'Boundary and access posture', keywords: ['security', 'trust', 'audit'] },
  { name: 'Policies', route: '/app/policies', group: 'Runtime', detail: 'Guardrails and release rules', keywords: ['policies', 'guardrails', 'policy'] },
  { name: 'Workbench', route: '/app/workbench', group: 'Change', detail: 'Strategy, architecture, and infrastructure control cockpit', keywords: ['workbench', 'strategy', 'architecture', 'infrastructure', 'thesis', 'synthesis'] },
  { name: 'Agent Ops', route: '/app/teams', group: 'Change', detail: 'AI workforce and run control', keywords: ['agents', 'teams', 'ai', 'ops'] },
  { name: 'Foundry', route: '/app/foundry', group: 'Change', detail: 'Release desk for hackathons, promotion lanes, and module graduation', keywords: ['foundry', 'release desk', 'hackathon', 'promotion'] },
  { name: 'Build', route: '/app/factory', group: 'Change', detail: 'Build and module factory', keywords: ['build', 'factory', 'r&d'] },
  { name: 'Product Ops', route: '/app/product-ops', group: 'Change', detail: 'Programs and release posture', keywords: ['product', 'ops', 'release'] },
  { name: 'Platform Admin', route: '/app/platform-admin', group: 'Change', detail: 'Tenant model and rollout posture', keywords: ['platform', 'admin', 'tenant'] },
  { name: 'Architect', route: '/app/architect', group: 'Change', detail: 'Blueprint and rollout design', keywords: ['architect', 'blueprint', 'solution'] },
] as const

const platformMetaTools = ENTERPRISE_META_TOOLS.filter((tool) =>
  ['cloud-ops', 'model-ops', 'runtime-control', 'platform-admin', 'tenant-architect', 'policy-control', 'agent-ops'].includes(tool.id),
)

const severityRank: Record<AttentionItem['severity'], number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
}

const metaRunJobTypes = ['revenue_scout', 'list_clerk', 'task_triage', 'ops_watch', 'founder_brief', 'github_release_watch'] as const

const autonomousControlGaps = [
  {
    id: 'queue-control',
    title: 'Queue and scheduler control',
    summary: 'Operators still need one place to pause jobs, inspect stuck queues, and rebalance work across agent pods.',
    owner: 'Runtime Pod',
    route: '/app/runtime',
    taskTitle: 'Ship queue, retry, and scheduler control inside Meta workspace',
  },
  {
    id: 'trace-and-evals',
    title: 'Run trace and eval drill-down',
    summary: 'Agent runs need trace-level evidence, artifacts, and eval scores before autonomy can scale safely.',
    owner: 'Knowledge Pod',
    route: '/app/data-fabric',
    taskTitle: 'Add run trace, artifact, and eval review to Meta workspace',
  },
  {
    id: 'record-first-state',
    title: 'Record-first control layer',
    summary: 'Agents need a governed record layer for leads, approvals, tasks, documents, and decisions instead of ad hoc notes.',
    owner: 'Platform Pod',
    route: '/app/platform-admin',
    taskTitle: 'Define record-first control objects for agent-owned work',
  },
  {
    id: 'sandbox-and-credentials',
    title: 'Tool, browser, and credential sandbox',
    summary: 'Cloud agents need explicit tool access, sandbox routes, and secret boundaries before browser work can be trusted.',
    owner: 'Control Pod',
    route: '/app/cloud',
    taskTitle: 'Launch sandbox, browser, and credential policy controls',
  },
  {
    id: 'role-takeover',
    title: 'Role-based oversight and takeover',
    summary: 'Managers need fast takeover, approval, and recovery paths when an agent escalates or a workflow stalls.',
    owner: 'Founder Control',
    route: '/app/workbench',
    taskTitle: 'Add manager takeover and escalation controls to Meta workspace',
  },
] as const

function formatDateTime(value: string | null | undefined) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return 'Not yet'
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return raw
  }
  return parsed.toLocaleString()
}

function runtimeStatusSeverity(status: string) {
  const normalized = String(status || '').trim()
  if (normalized === 'Degraded') {
    return 'Critical' as const
  }
  if (normalized === 'Warning' || normalized === 'Needs wiring') {
    return 'High' as const
  }
  return 'Medium' as const
}

export function MetaWorkspacePage() {
  const tenant = getTenantConfig()
  const cloudModel = SUPERMEGA_CLOUD_OPS_MODEL
  const [access, setAccess] = useState<AccessState>({
    loading: true,
    apiReady: false,
    authenticated: false,
    roleLabel: 'Unknown',
    error: null,
  })
  const [metaPayload, setMetaPayload] = useState<MetaWorkspacePayload | null>(null)
  const [runtimeData, setRuntimeData] = useState<RuntimeControlDataset>(getSeedRuntimeControlDataset())
  const [commandQuery, setCommandQuery] = useState('')
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [taskUpdateId, setTaskUpdateId] = useState<string | null>(null)
  const [taskCreateKey, setTaskCreateKey] = useState<string | null>(null)
  const [taskNotice, setTaskNotice] = useState<{ tone: 'default' | 'error'; message: string } | null>(null)
  const [approvalUpdateId, setApprovalUpdateId] = useState<string | null>(null)
  const [exceptionApprovalId, setExceptionApprovalId] = useState<string | null>(null)
  const [agentCycleBusy, setAgentCycleBusy] = useState(false)
  const [actionNotice, setActionNotice] = useState<{ tone: 'default' | 'error'; message: string } | null>(null)

  const summary = metaPayload?.summary ?? null
  const agentPayload = metaPayload?.agent_teams ?? null
  const agentRuns = metaPayload?.agent_runs?.rows ?? []
  const members = metaPayload?.team_members?.rows ?? []
  const approvalPayload = metaPayload?.approval_queue ?? null
  const exceptionPayload = metaPayload?.exceptions ?? null
  const insightPayload = metaPayload?.insights ?? null
  const latestRollout = metaPayload?.latest_rollout ?? null
  const currentModel = getTenantOperatingModel(tenant.key)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const health = await checkWorkspaceHealth()
      if (cancelled) {
        return
      }

      if (!health.ready) {
        setAccess({
          loading: false,
          apiReady: false,
          authenticated: false,
          roleLabel: 'Preview',
          error: 'Workspace API is not connected on this host yet.',
        })
        return
      }

      try {
        const payload = await workspaceFetch<MetaWorkspacePayload>('/api/meta/workspace')
        if (cancelled) {
          return
        }

        setMetaPayload(payload)
        setRuntimeData(normalizeRuntimeControlDataset(payload.runtime_control ?? null, payload.runtime_control ? 'live' : 'seed'))
        setAccess({
          loading: false,
          apiReady: true,
          authenticated: true,
          roleLabel: getCapabilityProfileForRole(payload.summary?.session?.role).label,
          error: null,
        })
        } catch (error) {
        if (!cancelled) {
          const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status ?? 0) : 0
          if (status === 401) {
            setMetaPayload(null)
            setRuntimeData(getSeedRuntimeControlDataset())
            setAccess({
              loading: false,
              apiReady: true,
              authenticated: false,
              roleLabel: 'Guest',
              error: 'Login is required to open the internal workspace.',
            })
            return
          }
          if (status === 403) {
            setMetaPayload(null)
            setRuntimeData(getSeedRuntimeControlDataset())
            setAccess({
              loading: false,
              apiReady: true,
              authenticated: true,
              roleLabel: 'Restricted',
              error: 'This role does not have access to the Meta workspace.',
            })
            return
          }
          setAccess((current) => ({
            ...current,
            loading: false,
            error: 'The internal workspace could not load live state right now.',
          }))
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function reloadMetaWorkspace() {
    const payload = await workspaceFetch<MetaWorkspacePayload>('/api/meta/workspace')
    setMetaPayload(payload)
    setRuntimeData(normalizeRuntimeControlDataset(payload.runtime_control ?? null, payload.runtime_control ? 'live' : 'seed'))
    setAccess({
      loading: false,
      apiReady: true,
      authenticated: true,
      roleLabel: getCapabilityProfileForRole(payload.summary?.session?.role).label,
      error: null,
    })
  }

  async function handleCompleteTask(taskId: string) {
    setTaskUpdateId(taskId)
    setTaskNotice(null)
    setActionNotice(null)
    try {
      await updateWorkspaceTask(taskId, { status: 'done' })
      await reloadMetaWorkspace()
      setTaskNotice({ tone: 'default', message: 'Task marked done.' })
    } catch (error) {
      setTaskNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Task update failed.',
      })
    } finally {
      setTaskUpdateId(null)
    }
  }

  async function handleCreateTask(
    task: {
      key: string
      title: string
      owner?: string
      priority?: string
      due?: string
      notes?: string
    },
    options?: { clearInput?: boolean; successMessage?: string },
  ) {
    setTaskCreateKey(task.key)
    setTaskNotice(null)
    setActionNotice(null)
    try {
      await createWorkspaceTasks([
        {
          title: task.title,
          owner: task.owner ?? '',
          priority: task.priority ?? 'High',
          due: task.due ?? 'Today',
          status: 'open',
          notes: task.notes ?? '',
        },
      ])
      await reloadMetaWorkspace()
      if (options?.clearInput) {
        setQuickTaskTitle('')
      }
      setTaskNotice({
        tone: 'default',
        message: options?.successMessage ?? 'Task added to the queue.',
      })
    } catch (error) {
      setTaskNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Task creation failed.',
      })
    } finally {
      setTaskCreateKey(null)
    }
  }

  async function handleApprovalDecision(approvalId: string, status: 'approved' | 'review' | 'rejected') {
    setApprovalUpdateId(`${approvalId}:${status}`)
    setActionNotice(null)
    try {
      await updateApprovalEntryStatus(approvalId, { status })
      await reloadMetaWorkspace()
      setActionNotice({
        tone: 'default',
        message: status === 'approved' ? 'Approval cleared.' : status === 'rejected' ? 'Approval rejected.' : 'Approval marked for review.',
      })
    } catch (error) {
      setActionNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Approval update failed.',
      })
    } finally {
      setApprovalUpdateId(null)
    }
  }

  async function handleSendExceptionToApprovals(row: ExceptionRow) {
    setExceptionApprovalId(row.exception_id)
    setActionNotice(null)
    try {
      await createApprovalEntry({
        title: row.title,
        summary: row.summary,
        approval_gate: row.source_type,
        requested_by: row.owner || 'System',
        owner: 'Management',
        status: 'pending',
        due: row.due,
        related_route: row.route || '/app/exceptions',
        related_entity: row.entity || '',
        payload: row,
      })
      await reloadMetaWorkspace()
      setActionNotice({
        tone: 'default',
        message: `"${row.title}" was sent to approvals.`,
      })
    } catch (error) {
      setActionNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not send the exception to approvals.',
      })
    } finally {
      setExceptionApprovalId(null)
    }
  }

  async function handleRunAgentCycle() {
    setAgentCycleBusy(true)
    setActionNotice(null)
    try {
      const payload = await runDefaultAgentJobs([...metaRunJobTypes])
      await reloadMetaWorkspace()
      setActionNotice({
        tone: 'default',
        message: `Ran ${payload.count ?? 0} core agent job${payload.count === 1 ? '' : 's'}.`,
      })
    } catch (error) {
      setActionNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not run the agent cycle.',
      })
    } finally {
      setAgentCycleBusy(false)
    }
  }

  const runtimeAttention = useMemo(() => {
    const items = [
      ...runtimeData.connectors
        .filter((item) => item.status !== 'Healthy')
        .map((item) => ({
          id: item.id,
          severity: runtimeStatusSeverity(item.status),
          area: 'Runtime' as const,
          title: item.name,
          owner: item.owner,
          detail: item.backlog,
          route: '/app/runtime',
        })),
      ...runtimeData.knowledgeCollections
        .filter((item) => item.status !== 'Healthy')
        .map((item) => ({
          id: item.id,
          severity: runtimeStatusSeverity(item.status),
          area: 'Runtime' as const,
          title: item.name,
          owner: item.owner,
          detail: item.nextMove,
          route: '/app/knowledge',
        })),
      ...runtimeData.autonomyLoops
        .filter((item) => item.status !== 'Healthy')
        .map((item) => ({
          id: item.id,
          severity: runtimeStatusSeverity(item.status),
          area: 'Runtime' as const,
          title: item.name,
          owner: item.owner,
          detail: item.backlog,
          route: '/app/teams',
        })),
    ]

    return items.sort((left, right) => severityRank[left.severity] - severityRank[right.severity])
  }, [runtimeData])

  const attentionItems = metaPayload?.attention ?? []
  const actionableApprovals = useMemo(
    () =>
      (approvalPayload?.rows ?? [])
        .filter((row) => {
          const normalizedStatus = String(row.status || '').trim().toLowerCase()
          return normalizedStatus === 'pending' || normalizedStatus === 'review'
        })
        .slice(0, 3),
    [approvalPayload?.rows],
  )
  const exceptionRows = useMemo(() => (exceptionPayload?.rows ?? []).slice(0, 3), [exceptionPayload?.rows])

  const openTasks = useMemo(
    () =>
      (metaPayload?.workspace_tasks?.rows ?? [])
        .filter((row) => String(row.status || '').trim().toLowerCase() !== 'done')
        .slice(0, 4),
    [metaPayload?.workspace_tasks?.rows],
  )

  const rolloutTaskIds = useMemo(
    () =>
      new Set(
        (latestRollout?.task_summary?.saved_task_ids ?? [])
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      ),
    [latestRollout?.task_summary?.saved_task_ids],
  )

  const rolloutTasks = useMemo(
    () => {
      const snapshotRows = (latestRollout?.task_summary?.rows ?? []).filter(
        (row) => String(row.status || '').trim().toLowerCase() !== 'done',
      )
      if (snapshotRows.length) {
        return snapshotRows.slice(0, 6)
      }
      return (metaPayload?.workspace_tasks?.rows ?? [])
        .filter((row) => rolloutTaskIds.has(String(row.task_id || '').trim()))
        .filter((row) => String(row.status || '').trim().toLowerCase() !== 'done')
        .slice(0, 6)
    },
    [latestRollout?.task_summary?.rows, metaPayload?.workspace_tasks?.rows, rolloutTaskIds],
  )
  const rolloutQueueMeta = useMemo(() => {
    const openCount = latestRollout?.task_summary?.live_open_count ?? rolloutTasks.length
    const workspaceSnapshotKey = String(latestRollout?.workspace_snapshot_key || '').trim()
    const scopeNote = workspaceSnapshotKey
      ? `Showing only tasks attached to ${workspaceSnapshotKey}.`
      : rolloutTaskIds.size > 0
        ? 'Showing only tasks attached to the current rollout snapshot.'
        : 'No saved launch tasks are attached to this rollout yet.'
    return { openCount, scopeNote }
  }, [latestRollout?.task_summary?.live_open_count, latestRollout?.workspace_snapshot_key, rolloutTaskIds, rolloutTasks.length])

  const pendingApprovals =
    Number(summary?.approvals?.by_status?.pending ?? 0) + Number(summary?.approvals?.by_status?.review ?? 0)

  const workstreamData = useMemo(
    () =>
      workstreamRooms.map((item) => {
        if (item.metric === 'leads') {
          return { ...item, value: Number(summary?.lead_pipeline?.lead_count ?? 0), helper: 'Leads in pipeline' }
        }
        if (item.metric === 'actions') {
          return { ...item, value: Number(summary?.actions?.total_items ?? 0), helper: 'Open actions' }
        }
        if (item.metric === 'receiving') {
          return { ...item, value: Number(summary?.receiving?.receiving_count ?? 0), helper: 'Receiving rows' }
        }
        if (item.metric === 'quality') {
          return { ...item, value: Number(summary?.quality?.incident_count ?? 0), helper: 'Open incidents' }
        }
        if (item.metric === 'maintenance') {
          return { ...item, value: Number(summary?.maintenance?.maintenance_count ?? 0), helper: 'Maintenance records' }
        }
        return { ...item, value: pendingApprovals, helper: 'Pending approvals' }
      }),
    [pendingApprovals, summary?.actions?.total_items, summary?.lead_pipeline?.lead_count, summary?.maintenance?.maintenance_count, summary?.quality?.incident_count, summary?.receiving?.receiving_count],
  )

  const filteredRooms = useMemo(() => {
    const normalizedQuery = commandQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return quickRooms
    }
    return quickRooms.filter((item) => {
      const haystack = [item.name, item.group, item.detail, ...item.keywords].join(' ').toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [commandQuery])

  const capabilityProfile = useMemo(
    () => getCapabilityProfileForRole(summary?.session?.role),
    [summary?.session?.role],
  )
  const roleLabel = summary?.session?.role ? capabilityProfile.label : access.roleLabel
  const canRunAgentCycle = useMemo(() => {
    const capabilities = new Set(capabilityProfile.capabilities ?? [])
    return (
      capabilities.has('agent_ops.view') ||
      capabilities.has('architect.view') ||
      capabilities.has('tenant_admin.view') ||
      capabilities.has('platform_admin.view')
    )
  }, [capabilityProfile.capabilities])
  const roleExperience = useMemo(
    () => resolveTenantRoleExperience(tenant.key, summary?.session?.role),
    [tenant.key, summary?.session?.role],
  )
  const tenantSystemModel = tenant.key === 'ytf-plant-a' ? currentModel : SUPERMEGA_CORE_MODEL

  if (access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow={tenant.key === 'ytf-plant-a' ? 'Yangon Tyre Meta' : 'Meta'}
          title="Loading internal workspace."
          description="Loading company state, runtime health, and the latest work queue."
        />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow={tenant.key === 'ytf-plant-a' ? 'Yangon Tyre Meta' : 'Meta'}
          title={tenant.key === 'ytf-plant-a' ? 'Open the Yangon Tyre control room.' : 'Open the internal workspace.'}
          description={
            tenant.key === 'ytf-plant-a'
              ? 'This is the role-aware control room for Yangon Tyre sales, plant, quality, maintenance, supplier control, and management review.'
              : 'This is the internal control room for live work, system health, and role-based execution.'
          }
        />
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error || 'Login is required.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/meta">
              Login
            </Link>
            <Link className="sm-button-secondary" to="/">
              Back to site
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      <PageIntro
        eyebrow={tenant.key === 'ytf-plant-a' ? 'Yangon Tyre Meta' : 'Meta'}
        title={tenant.key === 'ytf-plant-a' ? 'One control room for Yangon Tyre.' : 'One screen to run the company.'}
        description={
          tenant.key === 'ytf-plant-a'
            ? 'Start here to see what needs attention, open the role-appropriate workspace, and move Yangon Tyre work forward with real plant context.'
            : 'Start here to see what needs attention, open the right workspace, and move real work forward.'
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Workspace</p>
              <h2 className="mt-2 text-3xl font-bold text-white">{summary?.session?.display_name || summary?.session?.username || 'Operator'}</h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {roleLabel} · Supervisor {summary?.supervisor?.status || 'unknown'} · Last cycle {formatDateTime(summary?.supervisor?.last_finished_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="sm-status-pill">Runtime {runtimeData.source === 'live' ? 'live' : 'seeded'}</span>
              <span className="sm-status-pill">Manifest {agentPayload?.summary?.manifest_version || 'n/a'}</span>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/actions">
              Open queue
            </Link>
            <Link className="sm-button-secondary" to="/app/runtime">
              Open runtime
            </Link>
            <Link className="sm-button-secondary" to="/app/teams">
              Open agent ops
            </Link>
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Live brief</p>
          <h2 className="mt-2 text-2xl font-bold text-white">{insightPayload?.headline || 'No brief generated yet.'}</h2>
          <div className="mt-4 space-y-2">
            {(insightPayload?.recommended_actions ?? []).slice(0, 4).map((item, index) => (
              <div className="sm-proof-card" key={`${item}-${index}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-white">{item}</p>
                  <button
                    className="sm-button-secondary"
                    disabled={taskCreateKey === `brief-${index}`}
                    onClick={() =>
                      void handleCreateTask(
                        {
                          key: `brief-${index}`,
                          title: item,
                          owner: 'Leadership',
                          priority: 'High',
                          due: 'Today',
                          notes: 'Created from the live brief in Meta workspace.',
                        },
                        { successMessage: 'Brief item added to the queue.' },
                      )
                    }
                    type="button"
                  >
                    {taskCreateKey === `brief-${index}` ? 'Adding...' : 'Add task'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-white/10 pt-5">
            <p className="sm-kicker text-[var(--sm-accent)]">Capture next task</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                className="sm-input flex-1"
                onChange={(event) => setQuickTaskTitle(event.target.value)}
                placeholder="Write one concrete next task..."
                value={quickTaskTitle}
              />
              <button
                className="sm-button-primary"
                disabled={!quickTaskTitle.trim() || taskCreateKey === 'quick-capture'}
                onClick={() =>
                  void handleCreateTask(
                    {
                      key: 'quick-capture',
                      title: quickTaskTitle.trim(),
                      owner: summary?.session?.display_name || summary?.session?.username || 'Operator',
                      priority: 'High',
                      due: 'Today',
                      notes: 'Captured from the Meta workspace quick task input.',
                    },
                    { clearInput: true, successMessage: 'Quick task added to the queue.' },
                  )
                }
                type="button"
              >
                {taskCreateKey === 'quick-capture' ? 'Adding...' : 'Add to queue'}
              </button>
            </div>
          </div>
        </article>
      </section>

      {tenant.key === 'ytf-plant-a' ? (
        <section className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
          <article className="sm-surface-deep p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Role launchpad</p>
                <h2 className="mt-2 text-3xl font-bold text-white">{roleExperience.title}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">{roleExperience.mission}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="sm-status-pill">{roleLabel}</span>
                <Link className="sm-link" to="/app/adoption-command">
                  Open adoption command
                </Link>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {roleExperience.sections.map((section) => (
                <Link className="sm-proof-card block" key={section.title} to={section.route}>
                  <p className="text-lg font-bold text-white">{section.title}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{section.detail}</p>
                </Link>
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Focus modules</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {roleExperience.focusModules.map((item) => (
                    <span className="sm-status-pill" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Next modules</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(roleExperience.nextModules.length ? roleExperience.nextModules : ['No role-specific next module flagged yet.']).map((item) => (
                    <span className="sm-status-pill" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <article className="sm-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Yangon Tyre data profile</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Real plant context from local YTF workbooks.</h2>
              </div>
              <span className="sm-status-pill">Data-backed</span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {roleExperience.insights.map((insight) => (
                <article className="sm-chip text-white" key={insight.label}>
                  <p className="sm-kicker text-[var(--sm-accent)]">{insight.label}</p>
                  <p className="mt-2 text-xl font-bold">{insight.value}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{insight.detail}</p>
                </article>
              ))}
            </div>

            <div className="mt-6 grid gap-3">
              <div className="sm-proof-card">
                <p className="sm-kicker text-[var(--sm-accent)]">Top defects</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{YANGON_TYRE_DATA_PROFILE.topDefects.join(' / ')}</p>
              </div>
              <div className="sm-proof-card">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Production lines</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{YANGON_TYRE_DATA_PROFILE.productionLines.join(' / ')}</p>
              </div>
              <div className="sm-proof-card">
                <p className="sm-kicker text-[var(--sm-accent)]">Top 2025 SKUs</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
                  {YANGON_TYRE_DATA_PROFILE.focusProducts2025
                    .slice(0, 3)
                    .map((item) => `${item.name} (${item.units.toLocaleString()} units, B+R ${item.bPlusRRate}%)`)
                    .join(' / ')}
                </p>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Rollout pack</p>
              <h2 className="mt-2 text-2xl font-bold text-white">
                {latestRollout?.rollout_pack?.company_name || latestRollout?.workspace?.workspace_name || 'No rollout pack saved yet.'}
              </h2>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {latestRollout
                  ? `Saved ${formatDateTime(latestRollout.generated_at)} · ${latestRollout.rollout_pack?.primary_pack || 'Pack not named'}`
                  : 'Use Solution Architect to turn one client profile into a real rollout pack with roles, modules, agent teams, and launch tasks.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="sm-status-pill">{latestRollout?.rollout_pack?.wedge_product || 'No wedge set'}</span>
              {latestRollout?.rollout_pack?.flagship ? <span className="sm-status-pill">{latestRollout.rollout_pack.flagship}</span> : null}
              {latestRollout?.rollout_id ? <span className="sm-status-pill">{latestRollout.rollout_id}</span> : null}
            </div>
          </div>

          {latestRollout ? (
            <>
              <div className="mt-5">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Recommended modules</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(latestRollout.rollout_pack?.recommended_modules ?? []).slice(0, 8).map((item) => (
                    <div className="sm-chip text-white" key={item}>
                      {item}
                    </div>
                  ))}
                  {!(latestRollout.rollout_pack?.recommended_modules ?? []).length ? (
                    <div className="sm-chip text-[var(--sm-muted)]">No modules saved yet.</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Agent teams</p>
                  <p className="mt-2 text-sm">
                    {(latestRollout.rollout_pack?.agent_teams ?? []).slice(0, 3).join(' · ') || 'No agent teams attached yet.'}
                  </p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Launch tasks created</p>
                  <p className="mt-2 text-2xl font-bold">{latestRollout.task_summary?.saved_count ?? rolloutTasks.length}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Role, connector, wedge, security, and agent setup</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Open now</p>
                  <p className="mt-2 text-2xl font-bold">{rolloutQueueMeta.openCount}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Live rollout tasks still not done</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Closed</p>
                  <p className="mt-2 text-2xl font-bold">{latestRollout.task_summary?.live_done_count ?? 0}</p>
                  <p className="mt-1 text-sm text-[var(--sm-muted)]">Launch tasks completed from this rollout</p>
                </div>
              </div>
            </>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/architect">
              Open architect
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Open platform admin
            </Link>
            <Link className="sm-button-secondary" to="/app/actions">
              Open rollout queue
            </Link>
          </div>
        </article>

        <article className="sm-terminal p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">First 30 days</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What gets delivered next.</h2>
            </div>
            <span className="sm-status-pill">{rolloutQueueMeta.openCount} open rollout tasks</span>
          </div>

          <div className="mt-5 space-y-3">
            {(latestRollout?.rollout_pack?.first_30_days ?? []).slice(0, 4).map((item) => (
              <div className="sm-proof-card" key={item}>
                <p className="text-sm text-white">{item}</p>
              </div>
            ))}
            {!(latestRollout?.rollout_pack?.first_30_days ?? []).length ? (
              <div className="sm-chip text-[var(--sm-muted)]">No 30-day rollout plan saved yet.</div>
            ) : null}
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="sm-kicker text-[var(--sm-accent)]">Launch queue</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{rolloutQueueMeta.scopeNote}</p>
            <div className="mt-3 space-y-3">
              {rolloutTasks.map((task) => (
                <article className="sm-proof-card" key={task.task_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-white">{task.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {task.owner || 'Unassigned'} · {task.priority || 'Normal'} · {task.due || 'No due date'}
                      </p>
                    </div>
                    <Link className="sm-link" to="/app/actions">
                      Open
                    </Link>
                  </div>
                </article>
              ))}
              {!rolloutTasks.length ? <div className="sm-chip text-[var(--sm-muted)]">No open tasks are attached to this rollout snapshot.</div> : null}
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Actions</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.actions?.total_items ?? 0}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Open queue items</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Leads</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.lead_pipeline?.lead_count ?? 0}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Commercial pipeline</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Approvals</p>
          <p className="mt-3 text-3xl font-bold text-white">{pendingApprovals}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Pending and review</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Exceptions</p>
          <p className="mt-3 text-3xl font-bold text-white">{exceptionPayload?.summary?.total_items ?? 0}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Cross-system issues</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Runtime issues</p>
          <p className="mt-3 text-3xl font-bold text-white">{runtimeAttention.length}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">Non-healthy runtime items</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">AI workforce</p>
          <p className="mt-3 text-3xl font-bold text-white">{agentPayload?.summary?.team_count ?? 0}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">{members.length} members in workspace</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Autonomous cloud system</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Where the agent company actually runs.</h2>
              <p className="mt-3 max-w-2xl text-sm text-[var(--sm-muted)]">
                The internal control room needs a real cloud operating model: pods, environments, service lanes, and setup steps tied to actual operator surfaces.
              </p>
            </div>
            <Link className="sm-button-secondary" to="/app/cloud">
              Open cloud ops
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Pods</p>
              <p className="mt-2 text-2xl font-bold">{cloudModel.pods.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Environments</p>
              <p className="mt-2 text-2xl font-bold">{cloudModel.environments.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Service lanes</p>
              <p className="mt-2 text-2xl font-bold">{cloudModel.serviceLanes.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Setup steps</p>
              <p className="mt-2 text-2xl font-bold">{cloudModel.setupSteps.length}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {cloudModel.environments.map((environment) => (
              <Link className="sm-proof-card block" key={environment.id} to={environment.route}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{environment.name}</p>
                    <p className="mt-1 text-sm text-white/75">{environment.strap}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{environment.purpose}</p>
                  </div>
                  <span className="sm-status-pill">{environment.workloads.length} lanes</span>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.24em] text-[var(--sm-accent)]">
                  {environment.controls.slice(0, 2).join(' · ')}
                </p>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Missing control layer</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What still blocks cloud autonomy.</h2>
              <p className="mt-3 max-w-xl text-sm text-[var(--sm-muted)]">
                These are the remaining operator controls required before agent work can safely run as an always-on cloud system.
              </p>
            </div>
            <Link className="sm-button-secondary" to="/app/workbench">
              Open workbench
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {autonomousControlGaps.map((gap) => (
              <article className="sm-proof-card" key={gap.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{gap.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{gap.summary}</p>
                  </div>
                  <span className="sm-status-pill">{gap.owner}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="sm-button-primary"
                    disabled={taskCreateKey === gap.id}
                    onClick={() =>
                      void handleCreateTask(
                        {
                          key: gap.id,
                          title: gap.taskTitle,
                          owner: gap.owner,
                          priority: 'High',
                          due: 'This week',
                          notes: gap.summary,
                        },
                        { successMessage: 'Gap added to the execution queue.' },
                      )
                    }
                    type="button"
                  >
                    {taskCreateKey === gap.id ? 'Adding...' : 'Create task'}
                  </button>
                  <Link className="sm-link" to={gap.route}>
                    Open surface
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Decide now</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Clear blocked approvals from here.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/approvals">
              Open approvals
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {actionableApprovals.map((row) => (
              <article className="sm-proof-card" key={row.approval_id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{row.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary || 'Review and decide.'}</p>
                  </div>
                  <span className="sm-status-pill">{row.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/80">
                  <span>{row.approval_gate}</span>
                  <span>{row.owner || 'Management'}</span>
                  <span>{row.due || 'Review now'}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="sm-button-primary"
                    disabled={approvalUpdateId === `${row.approval_id}:approved`}
                    onClick={() => void handleApprovalDecision(row.approval_id, 'approved')}
                    type="button"
                  >
                    {approvalUpdateId === `${row.approval_id}:approved` ? 'Saving...' : 'Approve'}
                  </button>
                  <button
                    className="sm-button-secondary"
                    disabled={approvalUpdateId === `${row.approval_id}:review`}
                    onClick={() => void handleApprovalDecision(row.approval_id, 'review')}
                    type="button"
                  >
                    {approvalUpdateId === `${row.approval_id}:review` ? 'Saving...' : 'Mark review'}
                  </button>
                  <button
                    className="sm-button-secondary"
                    disabled={approvalUpdateId === `${row.approval_id}:rejected`}
                    onClick={() => void handleApprovalDecision(row.approval_id, 'rejected')}
                    type="button"
                  >
                    {approvalUpdateId === `${row.approval_id}:rejected` ? 'Saving...' : 'Reject'}
                  </button>
                  <Link className="sm-link" to={row.related_route || '/app/approvals'}>
                    Open source
                  </Link>
                </div>
              </article>
            ))}
            {!actionableApprovals.length ? <div className="sm-chip text-[var(--sm-muted)]">No pending approvals right now.</div> : null}
          </div>
        </article>

        <div className="grid gap-6">
          <article className="sm-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Escalate</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Push the right exceptions into approvals.</h2>
              </div>
              <Link className="sm-button-secondary" to="/app/exceptions">
                Open exceptions
              </Link>
            </div>
            <div className="mt-5 space-y-3">
              {exceptionRows.map((row) => (
                <article className="sm-proof-card" key={row.exception_id}>
                  <p className="text-base font-bold text-white">{row.title}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/80">
                    <span>{row.source_type}</span>
                    <span>{row.priority}</span>
                    <span>{row.owner || 'System'}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      className="sm-button-primary"
                      disabled={exceptionApprovalId === row.exception_id}
                      onClick={() => void handleSendExceptionToApprovals(row)}
                      type="button"
                    >
                      {exceptionApprovalId === row.exception_id ? 'Sending...' : 'Send to approvals'}
                    </button>
                    <Link className="sm-link" to={row.route || '/app/exceptions'}>
                      Open source
                    </Link>
                  </div>
                </article>
              ))}
              {!exceptionRows.length ? <div className="sm-chip text-[var(--sm-muted)]">No live exceptions to escalate.</div> : null}
            </div>
          </article>

          <article className="sm-terminal p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Run cycle</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Refresh the agent review loop.</h2>
              </div>
              <span className="sm-status-pill">5 core jobs</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Autonomy</p>
                <p className="mt-2 text-2xl font-bold">{agentPayload?.summary?.autonomy_score ?? 0}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Last run</p>
                <p className="mt-2 text-sm">{formatDateTime(agentRuns[0]?.completed_at || agentRuns[0]?.created_at)}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {canRunAgentCycle ? (
                <button className="sm-button-primary" disabled={agentCycleBusy} onClick={() => void handleRunAgentCycle()} type="button">
                  {agentCycleBusy ? 'Running...' : 'Run review cycle'}
                </button>
              ) : (
                <span className="sm-chip text-[var(--sm-muted)]">Agent cycle is reserved for agent-ops and architecture roles.</span>
              )}
              <Link className="sm-button-secondary" to="/app/teams">
                Open agent ops
              </Link>
              <Link className="sm-button-secondary" to="/app/insights">
                Open insights
              </Link>
            </div>
          </article>
        </div>
        {actionNotice ? (
          <div className={`sm-chip xl:col-span-2 ${actionNotice.tone === 'error' ? 'text-rose-200' : 'text-white'}`}>{actionNotice.message}</div>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Today</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What needs attention now.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/exceptions">
              Open exceptions
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {attentionItems.map((item) => (
              <article className="sm-proof-card" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                  </div>
                  <span className="sm-status-pill">
                    {item.area} / {item.severity}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/80">
                  <span>Owner: {item.owner}</span>
                  <button
                    className="sm-button-secondary"
                    disabled={taskCreateKey === `attention-${item.id}`}
                    onClick={() =>
                      void handleCreateTask(
                        {
                          key: `attention-${item.id}`,
                          title: item.title,
                          owner: item.owner,
                          priority: item.severity === 'Critical' ? 'High' : 'Medium',
                          due: item.severity === 'Critical' ? 'Today' : 'This week',
                          notes: `${item.area}: ${item.detail}`,
                        },
                        { successMessage: 'Attention item added to the queue.' },
                      )
                    }
                    type="button"
                  >
                    {taskCreateKey === `attention-${item.id}` ? 'Adding...' : 'Make task'}
                  </button>
                  <Link className="sm-link" to={item.route}>
                    Open
                  </Link>
                </div>
              </article>
            ))}
            {!attentionItems.length ? <div className="sm-chip text-[var(--sm-muted)]">No immediate attention items loaded.</div> : null}
          </div>
          <div className="mt-6 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Next tasks</p>
                <h3 className="mt-2 text-xl font-bold text-white">Close work from here.</h3>
              </div>
              <Link className="sm-button-secondary" to="/app/actions">
                Open queue
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {openTasks.map((task) => (
                <article className="sm-proof-card" key={task.task_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">{task.title}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {task.owner || 'Unassigned'} · {task.priority || 'Normal'} · {task.due || 'No due date'}
                      </p>
                    </div>
                    <button
                      className="sm-button-secondary"
                      disabled={taskUpdateId === task.task_id}
                      onClick={() => void handleCompleteTask(task.task_id)}
                      type="button"
                    >
                      {taskUpdateId === task.task_id ? 'Saving...' : 'Mark done'}
                    </button>
                  </div>
                </article>
              ))}
              {!openTasks.length ? <div className="sm-chip text-[var(--sm-muted)]">No open tasks loaded.</div> : null}
              {taskNotice ? (
                <div className={`sm-chip ${taskNotice.tone === 'error' ? 'text-rose-200' : 'text-white'}`}>{taskNotice.message}</div>
              ) : null}
            </div>
          </div>
        </article>

        <article className="sm-surface p-6">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Command</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Open any room fast.</h2>
          </div>
          <label className="mt-5 block">
            <span className="sr-only">Search rooms</span>
            <input
              className="sm-input"
              onChange={(event) => setCommandQuery(event.target.value)}
              placeholder="Search runtime, agents, receiving, build..."
              value={commandQuery}
            />
          </label>
          <div className="mt-4 grid gap-3">
            {filteredRooms.slice(0, 8).map((item) => (
              <Link className="sm-proof-card block" key={item.route} to={item.route}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{item.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                  </div>
                  <span className="sm-status-pill">{item.group}</span>
                </div>
              </Link>
            ))}
            {!filteredRooms.length ? <div className="sm-chip text-[var(--sm-muted)]">No room matches that search.</div> : null}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Workstreams</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Open the right workspace.</h2>
          </div>
          <span className="sm-status-pill">Use these as drill-down rooms</span>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {workstreamData.map((item) => (
            <Link className="sm-proof-card block" key={item.name} to={item.route}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-bold text-white">{item.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.note}</p>
                </div>
                <span className="sm-status-pill">{item.helper}</span>
              </div>
              <p className="mt-4 text-3xl font-bold text-white">{item.value}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">{tenant.key === 'ytf-plant-a' ? 'Tenant system' : 'Platform system'}</p>
              <h2 className="mt-2 text-2xl font-bold text-white">
                {tenant.key === 'ytf-plant-a' ? 'The Yangon Tyre runtime behind this role-based portal.' : 'Reusable standards behind every rollout.'}
              </h2>
            </div>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Open control plane
            </Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
              <p className="mt-2 text-2xl font-bold">{tenantSystemModel.modules.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Roles</p>
              <p className="mt-2 text-2xl font-bold">{tenantSystemModel.roles.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Connectors</p>
              <p className="mt-2 text-2xl font-bold">{tenantSystemModel.connectors.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Agent pods</p>
              <p className="mt-2 text-2xl font-bold">{tenantSystemModel.agentPods.length}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {platformMetaTools.map((tool) => (
              <Link className="sm-proof-card block" key={tool.id} to={tool.route}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{tool.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{tool.purpose}</p>
                  </div>
                  <span className="sm-status-pill">Meta tool</span>
                </div>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Frameworks</p>
              <h2 className="mt-2 text-2xl font-bold text-white">The workspace patterns that scale cleanly.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/factory">
              Open build
            </Link>
          </div>
          <div className="mt-5 grid gap-3">
            {WORKSPACE_FRAMEWORKS.slice(0, 3).map((framework) => (
              <article className="sm-proof-card" key={framework.id}>
                <p className="text-lg font-bold text-white">{framework.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{framework.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Surfaces: {framework.surfaces.join(' · ')}</p>
                <p className="mt-2 text-sm text-white/80">Controls: {framework.controls.join(' · ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-surface p-6">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Leadership</p>
            <h2 className="mt-2 text-2xl font-bold text-white">What leadership needs to know.</h2>
          </div>
          <div className="mt-5 space-y-3">
            {(summary?.review?.top_priorities ?? []).slice(0, 6).map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
            {!(summary?.review?.top_priorities ?? []).length ? <div className="sm-chip text-[var(--sm-muted)]">No leadership priorities loaded.</div> : null}
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Quality</p>
              <p className="mt-2 text-2xl font-bold">{summary?.quality?.incident_count ?? 0}</p>
              <p className="mt-1 text-sm text-[var(--sm-muted)]">Open incidents</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Supplier</p>
              <p className="mt-2 text-2xl font-bold">{summary?.supplier_watch?.risk_count ?? 0}</p>
              <p className="mt-1 text-sm text-[var(--sm-muted)]">Risk rows</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Inventory</p>
              <p className="mt-2 text-2xl font-bold">{summary?.inventory?.reorder_count ?? 0}</p>
              <p className="mt-1 text-sm text-[var(--sm-muted)]">Reorder items</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Feedback</p>
              <p className="mt-2 text-2xl font-bold">{summary?.feedback?.open_count ?? 0}</p>
              <p className="mt-1 text-sm text-[var(--sm-muted)]">Open product notes</p>
            </div>
          </div>
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Runtime</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What is healthy, stale, or blocked.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/runtime">
              Open runtime
            </Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Connectors</p>
              <p className="mt-2 text-2xl font-bold">{runtimeData.connectors.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Knowledge</p>
              <p className="mt-2 text-2xl font-bold">{runtimeData.knowledgeCollections.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Guardrails</p>
              <p className="mt-2 text-2xl font-bold">{runtimeData.policyGuardrails.length}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Loops</p>
              <p className="mt-2 text-2xl font-bold">{runtimeData.autonomyLoops.length}</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {runtimeAttention.slice(0, 4).map((item) => (
              <div className="sm-proof-card" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                  </div>
                  <span className="sm-status-pill">{item.severity}</span>
                </div>
                <p className="mt-3 text-sm text-white/80">Owner: {item.owner}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">AI workforce</p>
              <h2 className="mt-2 text-2xl font-bold text-white">AI teams and recent runs.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/teams">
              Open agent ops
            </Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Teams</p>
              <p className="mt-2 text-2xl font-bold">{agentPayload?.summary?.team_count ?? 0}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Playbooks</p>
              <p className="mt-2 text-2xl font-bold">{agentPayload?.summary?.manifest_playbook_count ?? 0}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Tools</p>
              <p className="mt-2 text-2xl font-bold">{agentPayload?.summary?.manifest_tool_count ?? 0}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Autonomy</p>
              <p className="mt-2 text-2xl font-bold">{agentPayload?.summary?.autonomy_score ?? 0}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="space-y-3">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Workspace members</p>
                <p className="mt-2 text-2xl font-bold">{members.length}</p>
                <p className="mt-1 text-sm text-[var(--sm-muted)]">People with access</p>
              </div>
              {(agentPayload?.next_moves ?? []).slice(0, 3).map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {agentRuns.slice(0, 5).map((row) => (
                <div className="sm-proof-card" key={row.run_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{row.job_type}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary || row.error_text || 'No summary captured.'}</p>
                    </div>
                    <span className="sm-status-pill">{row.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-white/80">{formatDateTime(row.completed_at || row.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="sm-surface p-6">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Change</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Change controls.</h2>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">These rooms manage rollout, release, policy, and platform posture.</p>
          </div>
          <div className="mt-5 grid gap-3">
            {[
              { name: 'Platform Admin', route: '/app/platform-admin', state: 'Model / config', detail: 'Tenant model, roles, connectors, and rollout posture.' },
              { name: 'Cloud Ops', route: '/app/cloud', state: 'Shared control', detail: 'Cloud team topology, environments, and internal console map.' },
              { name: 'Agent Ops', route: '/app/teams', state: 'Live', detail: 'Run jobs, manage members, and review the agent operating contract.' },
              { name: 'Runtime', route: '/app/runtime', state: 'Live', detail: 'Track connector freshness, canon quality, autonomy loops, and guardrails.' },
              { name: 'Foundry', route: '/app/foundry', state: 'Live + model', detail: 'Run hackathon tracks, release desks, and module promotion flow.' },
              { name: 'Build', route: '/app/factory', state: 'Model / planning', detail: 'Build workspaces, release gates, and module-factory lanes.' },
              { name: 'Product Ops', route: '/app/product-ops', state: 'Model / planning', detail: 'Programs, release trains, and delivery posture.' },
              { name: 'Architect', route: '/app/architect', state: 'Live + model', detail: 'Translate client problems into rollout blueprints.' },
            ].map((item) => (
              <Link className="sm-proof-card block" key={item.name} to={item.route}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{item.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                  </div>
                  <span className="sm-status-pill">{item.state}</span>
                </div>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
