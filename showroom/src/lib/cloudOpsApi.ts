import { getSeedDataFabricDataset, loadDataFabricDataset, type DataFabricConnectorSignal, type DataFabricDataset } from './dataFabricApi'
import { getSeedRuntimeControlDataset, loadRuntimeControlDataset, type RuntimeControlDataset } from './runtimeControlApi'
import {
  type AgentJobTemplate,
  checkWorkspaceHealth,
  getAgentTeams,
  getPlatformControlPlane,
  listAgentRuns,
  listApprovalEntries,
  listDecisionEntries,
  listExceptionRows,
  listTeamMembers,
  listWorkspaceTasks,
  type AgentRunRow,
  type AgentTeamsPayload,
  type ApprovalRow,
  type ApprovalSummary,
  type DecisionRow,
  type DecisionSummary,
  type ExceptionRow,
  type ExceptionSummary,
  type PlatformControlPlanePayload,
  type TeamMemberRow,
  type WorkspaceTaskRow,
  workspaceFetch,
} from './workspaceApi'

export type CloudOpsSource = 'seed' | 'partial' | 'live'

export type CloudEnvironmentPosture = {
  id: string
  name: string
  route: string
  status: 'Healthy' | 'Attention' | 'Modeled'
  summary: string
  stats: string[]
}

export type CloudQueueSignal = {
  id: string
  name: string
  count: number
  route: string
  detail: string
}

export type CloudOpsStatus = 'Healthy' | 'Attention' | 'Modeled'

export type CloudControlStatus = 'ready' | 'attention' | 'blocked'

export type CloudControlCard = {
  id: string
  name: string
  status: CloudControlStatus
  detail: string
  chips: string[]
  route: string
}

export type CloudControlCommand = {
  id: string
  label: string
  command: string
  detail: string
}

export type CloudControlJob = {
  jobType: string
  name: string
  cadence: string
  status: CloudControlStatus
  lastRunAt: string | null
  detail: string
}

export type CloudTopologyDomain = {
  domainId: string
  workspaceId: string
  workspaceSlug: string
  workspaceName: string
  hostname: string
  name: string
  summary: string
  scope: string
  provider: string
  runtimeTarget: string
  desiredState: string
  routeRoot: string
  dnsStatus: string
  tlsStatus: string
  httpStatus: string
  verifiedAt: string | null
  deploymentUrl: string
  lastDeployedAt: string | null
  notes: string
  config: Record<string, unknown>
  liveUrl: string
  displayName: string
  proofPaths: string[]
  managedBy: string[]
  status: CloudControlStatus
}

export type CloudTopologyPayload = {
  resourceId: string
  rootDomain: string
  sharedAppHost: string
  summary: {
    count: number
    readyCount: number
    attentionCount: number
    blockerCount: number
  }
  rows: CloudTopologyDomain[]
}

export type CloudControlPayload = {
  status: string
  updatedAt: string | null
  preferredWorkforceMode: 'queueWorker' | 'directBatch'
  summary: {
    readyCount: number
    attentionCount: number
    blockerCount: number
    coverageScore: number
    staleJobCount: number
    queueReady: boolean
    deployReady: boolean
  }
  surfaces: CloudControlCard[]
  connectors: CloudControlCard[]
  development: CloudControlCard[]
  infrastructure: CloudControlCard[]
  agentToolchain: CloudControlCard[]
  modelProviders: CloudControlCard[]
  workspaceResources: CloudControlCard[]
  topology: CloudTopologyPayload | null
  jobs: CloudControlJob[]
  commands: CloudControlCommand[]
  nextMoves: string[]
}

export type CloudJobHealth = {
  id: string
  jobType: string
  name: string
  cadence: string
  status: CloudOpsStatus
  lastRunAt: string | null
  lastSource: string
  freshness: string
  summary: string
  nextMove: string
}

export type CloudRuntimeHealth = {
  status: CloudOpsStatus
  activeFamilyCount: number
  staleFamilyCount: number
  queuedRunCount: number
  runningRunCount: number
  failedRunCount: number
  nextDueJob: string
  lastSchedulerRunAt: string | null
  lastWorkerRunAt: string | null
  lastRunAt: string | null
  note: string
  controls: string[]
  jobHealth: CloudJobHealth[]
}

export type CloudExecutionCell = {
  id: string
  name: string
  status: CloudOpsStatus
  route: string
  owner: string
  summary: string
  proof: string[]
  nextMove: string
}

export type CloudAutonomousCrew = {
  id: string
  name: string
  status: CloudOpsStatus
  owner: string
  route: string
  cadence: string
  latestSignal: string | null
  summary: string
  backlog: string
  nextMove: string
  risks: string[]
}

export type CloudConnectorActivation = {
  id: string
  name: string
  status: CloudOpsStatus
  system: string
  route: string
  activation: 'Event-driven' | 'Mapped' | 'Queued'
  freshness: string
  eventCount: number
  touchpoint: string
  surfaces: string[]
  nextMove: string
  risks: string[]
}

export type CloudOpsDashboard = {
  source: CloudOpsSource
  updatedAt: string | null
  cloudControl: CloudControlPayload | null
  runtime: RuntimeControlDataset
  dataFabric: DataFabricDataset
  platformControl: PlatformControlPlanePayload | null
  agentTeams: AgentTeamsPayload | null
  teamMembers: TeamMemberRow[]
  agentRuns: AgentRunRow[]
  agentJobs: AgentJobTemplate[]
  workspaceTasks: WorkspaceTaskRow[]
  approvals: {
    summary: ApprovalSummary | null
    rows: ApprovalRow[]
  }
  decisions: {
    summary: DecisionSummary | null
    rows: DecisionRow[]
  }
  exceptions: {
    summary: ExceptionSummary | null
    rows: ExceptionRow[]
  }
  summary: {
    workspaceName: string
    enabledModules: number
    pilotModules: number
    disabledModules: number
    teamCount: number
    memberCount: number
    autonomyScore: number
    openTasks: number
    pendingApprovals: number
    openDecisions: number
    highExceptions: number
    runtimeAttention: number
  }
  environments: CloudEnvironmentPosture[]
  queueSignals: CloudQueueSignal[]
  runtimeHealth: CloudRuntimeHealth
  executionCells: CloudExecutionCell[]
  autonomousCrews: CloudAutonomousCrew[]
  connectorActivations: CloudConnectorActivation[]
}

function toRows<T>(value: { rows?: T[] } | null | undefined): T[] {
  return Array.isArray(value?.rows) ? value.rows : []
}

function countRuntimeAttention(runtime: RuntimeControlDataset) {
  const runtimeItems = [...runtime.connectors, ...runtime.knowledgeCollections, ...runtime.policyGuardrails, ...runtime.autonomyLoops]
  return runtimeItems.filter((item) => String(item.status || '').trim() !== 'Healthy').length
}

function latestTimestamp(values: Array<string | null | undefined>) {
  const timestamps = values
    .map((value) => {
      const raw = String(value ?? '').trim()
      if (!raw) {
        return null
      }
      const parsed = new Date(raw)
      return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
    })
    .filter((value): value is number => value !== null)

  if (!timestamps.length) {
    return null
  }

  return new Date(Math.max(...timestamps)).toISOString()
}

function ageInMinutes(value?: string | null) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return null
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000))
}

function relativeAgeLabel(value?: string | null, fallback = 'Not synced yet') {
  const minutes = ageInMinutes(value)
  if (minutes === null) {
    return fallback
  }
  if (minutes < 90) {
    return `${minutes} minutes ago`
  }
  const hours = Math.max(1, Math.round(minutes / 60))
  if (hours < 48) {
    return `${hours} hours ago`
  }
  const days = Math.max(1, Math.round(hours / 24))
  return `${days} days ago`
}

function cadenceThresholdMinutes(cadence: string) {
  const normalized = String(cadence || '').trim().toLowerCase()
  if (normalized.includes('15')) {
    return 60
  }
  if (normalized.includes('30')) {
    return 120
  }
  if (normalized.includes('twice daily') || normalized.includes('twice-daily')) {
    return 18 * 60
  }
  if (normalized.includes('hour')) {
    return 4 * 60
  }
  if (normalized.includes('day') || normalized.includes('daily')) {
    return 36 * 60
  }
  return 24 * 60
}

function toCloudStatus(value?: string | null): CloudOpsStatus {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'healthy' || normalized === 'live' || normalized === 'active' || normalized === 'ready') {
    return 'Healthy'
  }
  if (normalized === 'modeled' || normalized === 'needs wiring' || normalized === 'queued' || normalized === 'mapped') {
    return 'Modeled'
  }
  return 'Attention'
}

function mostSevereStatus(values: CloudOpsStatus[]): CloudOpsStatus {
  if (values.includes('Attention')) {
    return 'Attention'
  }
  if (values.includes('Modeled')) {
    return 'Modeled'
  }
  return 'Healthy'
}

function buildJobHealth(agentJobs: AgentJobTemplate[]): CloudJobHealth[] {
  return agentJobs.map((job) => {
    const lastRun = job.last_run ?? null
    const lastRunAt = lastRun?.completed_at || lastRun?.created_at || null
    const ageMinutes = ageInMinutes(lastRunAt)
    const thresholdMinutes = cadenceThresholdMinutes(job.cadence)
    const status: CloudOpsStatus =
      ageMinutes === null ? 'Modeled' : ageMinutes <= thresholdMinutes * 0.5 ? 'Healthy' : 'Attention'

    return {
      id: job.job_type,
      jobType: job.job_type,
      name: job.name,
      cadence: job.cadence,
      status,
      lastRunAt,
      lastSource: String(lastRun?.source || '').trim() || 'No recent run',
      freshness: ageMinutes === null ? 'No recent run captured' : `Last run ${relativeAgeLabel(lastRunAt)}`,
      summary: String(lastRun?.summary || '').trim() || job.description,
      nextMove:
        status === 'Healthy'
          ? 'Keep this family on cadence and review output quality, not just job success.'
          : ageMinutes === null
            ? 'Queue and process this family once the cloud worker lane is ready.'
            : 'This family is stale for its cadence window; queue and drain it from Cloud Ops.',
    }
  })
}

function buildRuntimeHealth(agentRuns: AgentRunRow[], agentJobs: AgentJobTemplate[]): CloudRuntimeHealth {
  const jobHealth = buildJobHealth(agentJobs)
  const queuedRunCount = agentRuns.filter((row) => ['queued', 'claimed'].includes(String(row.status || '').trim().toLowerCase())).length
  const runningRunCount = agentRuns.filter((row) => String(row.status || '').trim().toLowerCase() === 'running').length
  const failedRunCount = agentRuns.filter((row) => String(row.status || '').trim().toLowerCase() === 'error').length
  const staleJobs = jobHealth.filter((job) => job.status !== 'Healthy')
  const nextDueJob =
    staleJobs
      .slice()
      .sort((left, right) => {
        const leftMinutes = ageInMinutes(left.lastRunAt) ?? Number.POSITIVE_INFINITY
        const rightMinutes = ageInMinutes(right.lastRunAt) ?? Number.POSITIVE_INFINITY
        return rightMinutes - leftMinutes
      })[0]?.name ?? 'No stale family'
  const lastSchedulerRunAt = latestTimestamp(
    agentRuns
      .filter((row) => {
        const source = String(row.source || '').trim().toLowerCase()
        const actor = String(row.triggered_by || '').trim().toLowerCase()
        return source.includes('scheduler') || actor.includes('cloud_scheduler')
      })
      .map((row) => row.completed_at || row.created_at),
  )
  const lastWorkerRunAt = latestTimestamp(
    agentRuns
      .filter((row) => {
        const source = String(row.source || '').trim().toLowerCase()
        const actor = String(row.triggered_by || '').trim().toLowerCase()
        return source.includes('worker') || actor.includes('worker')
      })
      .map((row) => row.completed_at || row.created_at),
  )
  const lastRunAt = latestTimestamp(agentRuns.map((row) => row.completed_at || row.created_at))
  const status: CloudOpsStatus = failedRunCount || staleJobs.length || queuedRunCount > 2 ? 'Attention' : jobHealth.length ? 'Healthy' : 'Modeled'

  return {
    status,
    activeFamilyCount: jobHealth.filter((job) => job.lastRunAt).length,
    staleFamilyCount: staleJobs.length,
    queuedRunCount,
    runningRunCount,
    failedRunCount,
    nextDueJob,
    lastSchedulerRunAt,
    lastWorkerRunAt,
    lastRunAt,
    note:
      status === 'Healthy'
        ? 'The scheduler and worker lanes have recent evidence across the modeled job families.'
        : failedRunCount
          ? 'At least one autonomous family failed recently and needs runtime review.'
          : staleJobs.length
            ? 'One or more job families are stale for their expected cadence window.'
            : 'Cloud execution exists, but recent worker evidence is still thin.',
    controls: ['Queue default families', 'Process queued runs', 'Review Runtime Desk', 'Check Cloud Scheduler and Cloud Tasks wiring'],
    jobHealth,
  }
}

function cloudRouteForLoop(loopId: string, surface: string) {
  if (loopId.includes('commercial') || surface.toLowerCase().includes('sales')) {
    return '/app/revenue'
  }
  if (loopId.includes('supplier') || surface.toLowerCase().includes('operations')) {
    return '/app/operations'
  }
  if (loopId.includes('quality') || surface.toLowerCase().includes('dqms')) {
    return '/app/dqms'
  }
  if (surface.toLowerCase().includes('build')) {
    return '/app/factory'
  }
  return '/app/runtime'
}

function buildAutonomousCrews(runtime: RuntimeControlDataset, runtimeHealth: CloudRuntimeHealth): CloudAutonomousCrew[] {
  const jobMap = new Map(runtimeHealth.jobHealth.map((job) => [job.jobType, job]))
  const loopJobs: Record<string, string[]> = {
    'ytf-commercial-memory-loop': ['revenue_scout', 'task_triage'],
    'ytf-supplier-recovery-loop': ['ops_watch', 'task_triage'],
    'ytf-quality-watch-loop': ['ops_watch'],
    'core-release-watch-loop': ['founder_brief', 'github_release_watch'],
    'core-runtime-governance-loop': ['ops_watch', 'founder_brief', 'github_release_watch'],
  }

  return runtime.autonomyLoops.map((loop) => {
    const linkedJobs = (loopJobs[loop.id] ?? []).map((jobType) => jobMap.get(jobType)).filter(Boolean) as CloudJobHealth[]
    const latestSignal = latestTimestamp(linkedJobs.map((job) => job.lastRunAt))
    return {
      id: loop.id,
      name: loop.name,
      status: mostSevereStatus([toCloudStatus(loop.status), linkedJobs.some((job) => job.status === 'Attention') ? 'Attention' : 'Healthy']),
      owner: loop.owner,
      route: cloudRouteForLoop(loop.id, loop.surface),
      cadence: loop.cadence,
      latestSignal,
      summary: loop.automation,
      backlog: loop.backlog,
      nextMove: loop.nextMove,
      risks: loop.risks,
    }
  })
}

function dataFabricSignalForRuntimeConnector(signalMap: Map<string, DataFabricConnectorSignal>, runtimeConnectorId: string) {
  const connectorMap: Record<string, string> = {
    'ytf-sales-gmail': 'gmail-intake',
    'ytf-procurement-gmail': 'gmail-intake',
    'ytf-drive-quality': 'drive-spine',
    'ytf-markdown-vault': 'drive-spine',
    'ytf-shopfloor-entry': 'shopfloor-forms',
  }
  return signalMap.get(connectorMap[runtimeConnectorId] ?? '')
}

function buildConnectorActivations(runtime: RuntimeControlDataset, dataFabric: DataFabricDataset): CloudConnectorActivation[] {
  const signalMap = new Map(dataFabric.connectorSignals.map((signal) => [signal.id, signal]))
  const matchedSignalIds = new Set<string>()
  const eventCountMap = new Map<string, number>()

  runtime.connectorEvents.forEach((event) => {
    eventCountMap.set(event.connectorId, (eventCountMap.get(event.connectorId) ?? 0) + 1)
  })

  const runtimeActivations = runtime.connectors.map((connector): CloudConnectorActivation => {
    const signal = dataFabricSignalForRuntimeConnector(signalMap, connector.id)
    if (signal) {
      matchedSignalIds.add(signal.id)
    }
    const eventCount = eventCountMap.get(connector.id) ?? 0
    const statusInputs: CloudOpsStatus[] = [toCloudStatus(connector.status)]
    if (signal) {
      statusInputs.push(toCloudStatus(signal.status))
    }
    return {
      id: connector.id,
      name: connector.name,
      status: mostSevereStatus(statusInputs),
      system: connector.system,
      route: signal?.route ?? '/app/connectors',
      activation: eventCount > 0 ? 'Event-driven' : signal ? 'Mapped' : 'Queued',
      freshness: connector.freshness,
      eventCount,
      touchpoint: connector.writeBack,
      surfaces: signal?.surfaces?.length ? signal.surfaces : connector.outputs,
      nextMove: signal?.nextAutomation ?? connector.nextAutomation,
      risks: [...connector.risks, ...(signal?.risks ?? [])].slice(0, 4),
    }
  })

  const unmatchedSignals = dataFabric.connectorSignals
    .filter((signal) => !matchedSignalIds.has(signal.id))
    .map((signal): CloudConnectorActivation => ({
      id: `signal-${signal.id}`,
      name: signal.name,
      status: toCloudStatus(signal.status),
      system: signal.system,
      route: signal.route,
      activation: signal.status === 'Healthy' ? 'Event-driven' : signal.status === 'Warning' ? 'Mapped' : 'Queued',
      freshness: signal.freshness,
      eventCount: 0,
      touchpoint: signal.backlog,
      surfaces: signal.surfaces,
      nextMove: signal.nextAutomation,
      risks: signal.risks.slice(0, 4),
    }))

  return [...runtimeActivations, ...unmatchedSignals]
}

function buildExecutionCells(payload: {
  runtime: RuntimeControlDataset
  dataFabric: DataFabricDataset
  runtimeHealth: CloudRuntimeHealth
  workspaceName: string
  memberCount: number
  enabledModules: number
  openTasks: number
}): CloudExecutionCell[] {
  const shopfloorConnector = payload.runtime.connectors.find((item) => item.id === 'ytf-shopfloor-entry')
  return [
    {
      id: 'portal-control-plane',
      name: 'Portal control plane',
      status: payload.enabledModules ? 'Healthy' : 'Modeled',
      route: '/app/workbench',
      owner: 'Platform Pod',
      summary: 'The enterprise portal is the audited shell for decisions, operator actions, access, and runtime intervention.',
      proof: [`${payload.workspaceName} workspace`, `${payload.memberCount} members visible`, `${payload.enabledModules} enabled modules`],
      nextMove: 'Keep identity, approvals, and rollout changes inside the shared control plane.',
    },
    {
      id: 'scheduler-lane',
      name: 'Cloud scheduler lane',
      status: payload.runtimeHealth.lastSchedulerRunAt ? (payload.runtimeHealth.staleFamilyCount ? 'Attention' : 'Healthy') : 'Modeled',
      route: '/app/runtime',
      owner: 'Runtime Pod',
      summary: 'Cloud Scheduler should enqueue the default job families and keep the autonomous work cadence alive outside the portal session.',
      proof: [
        `Last scheduler signal: ${relativeAgeLabel(payload.runtimeHealth.lastSchedulerRunAt)}`,
        `${payload.runtimeHealth.jobHealth.length} job families tracked`,
        `Next due family: ${payload.runtimeHealth.nextDueJob}`,
      ],
      nextMove: 'Keep enqueue cadence aligned to the real job families, not one giant batch.',
    },
    {
      id: 'queue-worker-lane',
      name: 'Queue and worker lane',
      status:
        payload.runtimeHealth.queuedRunCount && !payload.runtimeHealth.lastWorkerRunAt
          ? 'Attention'
          : payload.runtimeHealth.lastWorkerRunAt
            ? 'Healthy'
            : 'Modeled',
      route: '/app/teams',
      owner: 'Agent Ops',
      summary: 'Queued runs should drain through the worker lane so the autonomous crews continue even when nobody is manually triggering the jobs.',
      proof: [
        `${payload.runtimeHealth.queuedRunCount} queued runs`,
        `${payload.runtimeHealth.runningRunCount} running runs`,
        `Last worker signal: ${relativeAgeLabel(payload.runtimeHealth.lastWorkerRunAt)}`,
      ],
      nextMove: 'Use queue-first execution for repeatable cloud work, then reserve synchronous runs for operator intervention.',
    },
    {
      id: 'learning-plane',
      name: 'Learning and knowledge plane',
      status: toCloudStatus(payload.dataFabric.learningDatabase.status),
      route: '/app/data-fabric',
      owner: 'Knowledge Pod',
      summary: 'The data fabric has to keep canonical records, lineage, graph structure, and feature learning available to every app and agent.',
      proof: [
        `${payload.dataFabric.learningDatabase.canonicalRecordCount} canonical records`,
        `${payload.dataFabric.learningDatabase.lineageEventCount} lineage events`,
        `${payload.dataFabric.learningDatabase.trustScore}% trust score`,
      ],
      nextMove: payload.dataFabric.learningDatabase.nextAutomation,
    },
    {
      id: 'manager-writeback',
      name: 'Manager writeback lane',
      status: toCloudStatus(shopfloorConnector?.status),
      route: '/app/adoption-command',
      owner: 'Workforce Command',
      summary: 'Managers and plant staff need one live writeback lane so human entry, AI suggestions, and follow-up tasks reinforce each other.',
      proof: [
        `${payload.dataFabric.managerPrograms.length} manager programs`,
        `${payload.dataFabric.agentHandoffs.length} AI handoffs`,
        `${payload.openTasks} open queue tasks`,
      ],
      nextMove: shopfloorConnector?.nextAutomation ?? 'Strengthen role-based desks and coaching loops from the same writeback surface.',
    },
  ]
}

function buildEnvironmentPosture(payload: {
  runtime: RuntimeControlDataset
  platformControl: PlatformControlPlanePayload | null
  pendingApprovals: number
  openDecisions: number
  highExceptions: number
  runtimeAttention: number
}): CloudEnvironmentPosture[] {
  const platformModules = payload.platformControl?.modules
  const auditCount = intOrZero(payload.platformControl?.audit_events?.count)
  const knowledgeAttention = payload.runtime.knowledgeCollections.filter((item) => String(item.status || '').trim() !== 'Healthy').length

  return [
    {
      id: 'control',
      name: 'Control environment',
      route: '/app/workbench',
      status: payload.pendingApprovals || payload.openDecisions || payload.highExceptions ? 'Attention' : 'Healthy',
      summary:
        payload.pendingApprovals || payload.openDecisions || payload.highExceptions
          ? 'Executive review pressure is building across approvals, decisions, or escalations.'
          : 'Decision and approval posture is under control from the current live snapshot.',
      stats: [
        `${payload.pendingApprovals} pending approvals`,
        `${payload.openDecisions} open decisions`,
        `${payload.highExceptions} high-priority exceptions`,
      ],
    },
    {
      id: 'runtime',
      name: 'Runtime environment',
      route: '/app/runtime',
      status: payload.runtimeAttention ? 'Attention' : 'Healthy',
      summary:
        payload.runtimeAttention
          ? 'Connector, autonomy, or policy signals still need intervention before more agent scope expands.'
          : 'Runtime feeds, loops, and guardrails are healthy in the current control payload.',
      stats: [
        `${payload.runtime.connectors.length} connectors`,
        `${payload.runtime.autonomyLoops.length} autonomy loops`,
        `${payload.runtimeAttention} runtime items need attention`,
      ],
    },
    {
      id: 'data',
      name: 'Data environment',
      route: '/app/data-fabric',
      status: knowledgeAttention ? 'Attention' : 'Healthy',
      summary:
        knowledgeAttention
          ? 'Knowledge collections still show drift or incomplete promotion that will weaken retrieval trust.'
          : 'Knowledge collections are healthy in the current runtime snapshot.',
      stats: [
        `${payload.runtime.knowledgeCollections.length} knowledge collections`,
        `${knowledgeAttention} collections need review`,
        `${payload.runtime.connectorEvents.length} connector events captured`,
      ],
    },
    {
      id: 'build',
      name: 'Build environment',
      route: '/app/factory',
      status: 'Modeled',
      summary: 'Build and deploy telemetry is still inferred from module posture and audit events until dedicated pipeline signals are wired.',
      stats: [
        `${intOrZero(platformModules?.enabled_count)} enabled modules`,
        `${intOrZero(platformModules?.pilot_count)} pilot modules`,
        `${auditCount} recent audit events`,
      ],
    },
    {
      id: 'sandbox',
      name: 'Sandbox environment',
      route: '/app/lab',
      status: 'Modeled',
      summary: 'Sandbox posture is still governed by operating rules; dedicated isolated-execution telemetry is the next backend gap to close.',
      stats: [
        `${payload.runtime.autonomyLoops.length} loops available for guarded experimentation`,
        `${payload.runtime.policyGuardrails.length} policy guardrails`,
        'isolated execution telemetry pending',
      ],
    },
  ]
}

function buildQueueSignals(payload: {
  openTasks: number
  pendingApprovals: number
  openDecisions: number
  highExceptions: number
  runtimeAttention: number
  pilotModules: number
}) {
  return [
    {
      id: 'tasks',
      name: 'Open tasks',
      count: payload.openTasks,
      route: '/app/actions',
      detail: 'Operational and setup work currently sitting in the workspace queue.',
    },
    {
      id: 'approvals',
      name: 'Pending approvals',
      count: payload.pendingApprovals,
      route: '/app/approvals',
      detail: 'Decisions that are blocked on an approval gate or evidence review.',
    },
    {
      id: 'exceptions',
      name: 'High exceptions',
      count: payload.highExceptions,
      route: '/app/exceptions',
      detail: 'The highest-severity live issues crossing quality, supplier, runtime, or operating queues.',
    },
    {
      id: 'decisions',
      name: 'Open decisions',
      count: payload.openDecisions,
      route: '/app/decisions',
      detail: 'Directional or architectural calls that are still unresolved in the operating register.',
    },
    {
      id: 'runtime',
      name: 'Runtime attention',
      count: payload.runtimeAttention,
      route: '/app/runtime',
      detail: 'Connector, knowledge, autonomy, or guardrail items that still need intervention.',
    },
    {
      id: 'modules',
      name: 'Pilot modules',
      count: payload.pilotModules,
      route: '/app/platform-admin',
      detail: 'Modules that still need graduation work before they can be treated as steady-state platform surfaces.',
    },
  ]
}

function intOrZero(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

function getResultValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback
}

function normalizeCloudControlCard(value: Record<string, unknown> | null | undefined): CloudControlCard {
  return {
    id: String(value?.id ?? '').trim(),
    name: String(value?.name ?? '').trim(),
    status: ['ready', 'attention', 'blocked'].includes(String(value?.status ?? '').trim()) ? (String(value?.status ?? '').trim() as CloudControlStatus) : 'blocked',
    detail: String(value?.detail ?? '').trim(),
    chips: Array.isArray(value?.chips) ? value.chips.map((item) => String(item ?? '').trim()).filter(Boolean) : [],
    route: String(value?.route ?? '').trim(),
  }
}

function normalizeCloudControlCommand(value: Record<string, unknown> | null | undefined): CloudControlCommand {
  return {
    id: String(value?.id ?? '').trim(),
    label: String(value?.label ?? '').trim(),
    command: String(value?.command ?? '').trim(),
    detail: String(value?.detail ?? '').trim(),
  }
}

function normalizeCloudControlJob(value: Record<string, unknown> | null | undefined): CloudControlJob {
  return {
    jobType: String(value?.job_type ?? '').trim(),
    name: String(value?.name ?? '').trim(),
    cadence: String(value?.cadence ?? '').trim(),
    status: ['ready', 'attention', 'blocked'].includes(String(value?.status ?? '').trim()) ? (String(value?.status ?? '').trim() as CloudControlStatus) : 'blocked',
    lastRunAt: value?.last_run_at ? String(value.last_run_at).trim() : null,
    detail: String(value?.detail ?? '').trim(),
  }
}

function normalizeCloudTopologyDomain(value: Record<string, unknown> | null | undefined): CloudTopologyDomain {
  return {
    domainId: String(value?.domain_id ?? '').trim(),
    workspaceId: String(value?.workspace_id ?? '').trim(),
    workspaceSlug: String(value?.workspace_slug ?? '').trim(),
    workspaceName: String(value?.workspace_name ?? '').trim(),
    hostname: String(value?.hostname ?? '').trim(),
    name: String(value?.name ?? value?.display_name ?? '').trim(),
    summary: String(value?.summary ?? '').trim(),
    scope: String(value?.scope ?? '').trim(),
    provider: String(value?.provider ?? '').trim(),
    runtimeTarget: String(value?.runtime_target ?? '').trim(),
    desiredState: String(value?.desired_state ?? '').trim(),
    routeRoot: String(value?.route_root ?? '').trim(),
    dnsStatus: String(value?.dns_status ?? '').trim(),
    tlsStatus: String(value?.tls_status ?? '').trim(),
    httpStatus: String(value?.http_status ?? '').trim(),
    verifiedAt: value?.verified_at ? String(value.verified_at).trim() : null,
    deploymentUrl: String(value?.deployment_url ?? '').trim(),
    lastDeployedAt: value?.last_deployed_at ? String(value.last_deployed_at).trim() : null,
    notes: String(value?.notes ?? '').trim(),
    config: typeof value?.config === 'object' && value?.config !== null ? (value.config as Record<string, unknown>) : {},
    liveUrl: String(value?.live_url ?? '').trim(),
    displayName: String(value?.display_name ?? value?.name ?? '').trim(),
    proofPaths: Array.isArray(value?.proof_paths) ? value.proof_paths.map((item) => String(item ?? '').trim()).filter(Boolean) : [],
    managedBy: Array.isArray(value?.managed_by) ? value.managed_by.map((item) => String(item ?? '').trim()).filter(Boolean) : [],
    status: ['ready', 'attention', 'blocked'].includes(String(value?.status ?? '').trim()) ? (String(value?.status ?? '').trim() as CloudControlStatus) : 'blocked',
  }
}

function normalizeCloudTopologyPayload(value: Record<string, unknown> | null | undefined): CloudTopologyPayload | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return {
    resourceId: String(value.resource_id ?? '').trim() || 'supermega-cloud-topology',
    rootDomain: String(value.root_domain ?? '').trim() || 'supermega.dev',
    sharedAppHost: String(value.shared_app_host ?? '').trim() || 'app.supermega.dev',
    summary: {
      count: intOrZero(Number((value.summary as Record<string, unknown> | undefined)?.count ?? 0)),
      readyCount: intOrZero(Number((value.summary as Record<string, unknown> | undefined)?.ready_count ?? 0)),
      attentionCount: intOrZero(Number((value.summary as Record<string, unknown> | undefined)?.attention_count ?? 0)),
      blockerCount: intOrZero(Number((value.summary as Record<string, unknown> | undefined)?.blocker_count ?? 0)),
    },
    rows: Array.isArray(value.rows) ? value.rows.map((item) => normalizeCloudTopologyDomain(item as Record<string, unknown>)) : [],
  }
}

function normalizeCloudControlPayload(value: Record<string, unknown> | null | undefined): CloudControlPayload {
  const preferredWorkforceMode = String(value?.preferred_workforce_mode ?? '').trim() === 'queue_worker' ? 'queueWorker' : 'directBatch'

  return {
    status: String(value?.status ?? '').trim() || 'ready',
    updatedAt: value?.updated_at ? String(value.updated_at).trim() : null,
    preferredWorkforceMode,
    summary: {
      readyCount: intOrZero(Number((value?.summary as Record<string, unknown> | undefined)?.ready_count ?? 0)),
      attentionCount: intOrZero(Number((value?.summary as Record<string, unknown> | undefined)?.attention_count ?? 0)),
      blockerCount: intOrZero(Number((value?.summary as Record<string, unknown> | undefined)?.blocker_count ?? 0)),
      coverageScore: intOrZero(Number((value?.summary as Record<string, unknown> | undefined)?.coverage_score ?? 0)),
      staleJobCount: intOrZero(Number((value?.summary as Record<string, unknown> | undefined)?.stale_job_count ?? 0)),
      queueReady: Boolean((value?.summary as Record<string, unknown> | undefined)?.queue_ready),
      deployReady: Boolean((value?.summary as Record<string, unknown> | undefined)?.deploy_ready),
    },
    surfaces: Array.isArray(value?.surfaces) ? value.surfaces.map((item) => normalizeCloudControlCard(item as Record<string, unknown>)) : [],
    connectors: Array.isArray(value?.connectors) ? value.connectors.map((item) => normalizeCloudControlCard(item as Record<string, unknown>)) : [],
    development: Array.isArray(value?.development) ? value.development.map((item) => normalizeCloudControlCard(item as Record<string, unknown>)) : [],
    infrastructure: Array.isArray(value?.infrastructure) ? value.infrastructure.map((item) => normalizeCloudControlCard(item as Record<string, unknown>)) : [],
    agentToolchain: Array.isArray(value?.agent_toolchain) ? value.agent_toolchain.map((item) => normalizeCloudControlCard(item as Record<string, unknown>)) : [],
    modelProviders: Array.isArray(value?.model_providers) ? value.model_providers.map((item) => normalizeCloudControlCard(item as Record<string, unknown>)) : [],
    workspaceResources: Array.isArray(value?.workspace_resources) ? value.workspace_resources.map((item) => normalizeCloudControlCard(item as Record<string, unknown>)) : [],
    topology: normalizeCloudTopologyPayload((value?.topology as Record<string, unknown> | undefined) ?? null),
    jobs: Array.isArray(value?.jobs) ? value.jobs.map((item) => normalizeCloudControlJob(item as Record<string, unknown>)) : [],
    commands: Array.isArray(value?.commands) ? value.commands.map((item) => normalizeCloudControlCommand(item as Record<string, unknown>)) : [],
    nextMoves: Array.isArray(value?.next_moves) ? value.next_moves.map((item) => String(item ?? '').trim()).filter(Boolean) : [],
  }
}

export async function loadCloudControlRuntime(): Promise<CloudControlPayload> {
  const payload = await workspaceFetch<Record<string, unknown>>('/api/cloud/control')
  return normalizeCloudControlPayload(payload)
}

export async function loadCloudOpsDashboard(): Promise<CloudOpsDashboard> {
  const runtimeSeed = getSeedRuntimeControlDataset()
  const dataFabricSeed = getSeedDataFabricDataset()
  const health = await checkWorkspaceHealth()

  if (!health.ready) {
    const runtimeHealth = buildRuntimeHealth([], [])
    return {
      source: 'seed',
      updatedAt: null,
      cloudControl: null,
      runtime: runtimeSeed,
      dataFabric: dataFabricSeed,
      platformControl: null,
      agentTeams: null,
      teamMembers: [],
      agentRuns: [],
      agentJobs: [],
      workspaceTasks: [],
      approvals: {
        summary: null,
        rows: [],
      },
      decisions: {
        summary: null,
        rows: [],
      },
      exceptions: {
        summary: null,
        rows: [],
      },
      summary: {
        workspaceName: 'Workspace preview',
        enabledModules: 0,
        pilotModules: 0,
        disabledModules: 0,
        teamCount: 0,
        memberCount: 0,
        autonomyScore: 0,
        openTasks: 0,
        pendingApprovals: 0,
        openDecisions: 0,
        highExceptions: 0,
        runtimeAttention: countRuntimeAttention(runtimeSeed),
      },
      environments: buildEnvironmentPosture({
        runtime: runtimeSeed,
        platformControl: null,
        pendingApprovals: 0,
        openDecisions: 0,
        highExceptions: 0,
        runtimeAttention: countRuntimeAttention(runtimeSeed),
      }),
      queueSignals: buildQueueSignals({
        openTasks: 0,
        pendingApprovals: 0,
        openDecisions: 0,
        highExceptions: 0,
        runtimeAttention: countRuntimeAttention(runtimeSeed),
        pilotModules: 0,
      }),
      runtimeHealth,
      executionCells: buildExecutionCells({
        runtime: runtimeSeed,
        dataFabric: dataFabricSeed,
        runtimeHealth,
        workspaceName: 'Workspace preview',
        memberCount: 0,
        enabledModules: 0,
        openTasks: 0,
      }),
      autonomousCrews: buildAutonomousCrews(runtimeSeed, runtimeHealth),
      connectorActivations: buildConnectorActivations(runtimeSeed, dataFabricSeed),
    }
  }

  const [
    platformControlResult,
    agentTeamsResult,
    teamMembersResult,
    agentRunsResult,
    workspaceTasksResult,
    approvalsResult,
    decisionsResult,
    exceptionsResult,
    runtimeResult,
    dataFabricResult,
    cloudControlResult,
  ] = await Promise.allSettled([
    getPlatformControlPlane(),
    getAgentTeams(),
    listTeamMembers(),
    listAgentRuns(12),
    listWorkspaceTasks(undefined, 120),
    listApprovalEntries(40),
    listDecisionEntries(undefined, undefined, 40),
    listExceptionRows(40),
    loadRuntimeControlDataset(),
    loadDataFabricDataset(),
    loadCloudControlRuntime(),
  ])

  const platformControl = getResultValue(platformControlResult, null as PlatformControlPlanePayload | null)
  const agentTeams = getResultValue(agentTeamsResult, null as AgentTeamsPayload | null)
  const teamMembers = toRows(getResultValue(teamMembersResult, { rows: [] as TeamMemberRow[] }))
  const agentRunsPayload = getResultValue(agentRunsResult, { rows: [] as AgentRunRow[], jobs: [] as AgentJobTemplate[] })
  const agentRuns = toRows(agentRunsPayload)
  const agentJobs = Array.isArray(agentRunsPayload.jobs) ? agentRunsPayload.jobs : []
  const workspaceTasks = toRows(getResultValue(workspaceTasksResult, { rows: [] as WorkspaceTaskRow[] }))
  const approvalPayload = getResultValue(approvalsResult, { summary: undefined as ApprovalSummary | undefined, rows: [] as ApprovalRow[] })
  const decisionPayload = getResultValue(decisionsResult, { summary: undefined as DecisionSummary | undefined, rows: [] as DecisionRow[] })
  const exceptionPayload = getResultValue(exceptionsResult, { summary: undefined as ExceptionSummary | undefined, rows: [] as ExceptionRow[] })
  const runtime = getResultValue(runtimeResult, runtimeSeed)
  const dataFabric = getResultValue(dataFabricResult, dataFabricSeed)
  const cloudControl = getResultValue(cloudControlResult, null as CloudControlPayload | null)
  const approvalRows = toRows(approvalPayload)
  const decisionRows = toRows(decisionPayload)
  const exceptionRows = toRows(exceptionPayload)

  const successfulResults = [
    platformControlResult,
    agentTeamsResult,
    teamMembersResult,
    agentRunsResult,
    workspaceTasksResult,
    approvalsResult,
    decisionsResult,
    exceptionsResult,
    runtimeResult,
    dataFabricResult,
    cloudControlResult,
  ].filter((result) => result.status === 'fulfilled').length

  const totalResults = 11
  const source: CloudOpsSource = successfulResults === 0 ? 'seed' : successfulResults === totalResults ? 'live' : 'partial'
  const openTasks = workspaceTasks.filter((row) => String(row.status || '').trim().toLowerCase() !== 'done').length
  const pendingApprovals = intOrZero(approvalPayload.summary?.by_status?.pending) || approvalRows.filter((row) => String(row.status || '').trim().toLowerCase() === 'pending').length
  const openDecisions = intOrZero(decisionPayload.summary?.by_status?.open) || decisionRows.filter((row) => String(row.status || '').trim().toLowerCase() === 'open').length
  const highExceptions =
    exceptionRows.filter((row) => ['high', 'critical'].includes(String(row.priority || '').trim().toLowerCase())).length ||
    intOrZero(exceptionPayload.summary?.by_priority?.high)
  const runtimeAttention = countRuntimeAttention(runtime)
  const enabledModules = intOrZero(platformControl?.modules?.enabled_count)
  const pilotModules = intOrZero(platformControl?.modules?.pilot_count)
  const disabledModules = intOrZero(platformControl?.modules?.disabled_count)
  const teamCount = intOrZero(agentTeams?.summary?.team_count) || (Array.isArray(agentTeams?.teams) ? agentTeams?.teams?.length ?? 0 : 0)
  const memberCount = intOrZero(platformControl?.members?.count) || teamMembers.length
  const autonomyScore = intOrZero(agentTeams?.summary?.autonomy_score)
  const workspaceName = String(platformControl?.workspace?.workspace_name || platformControl?.workspace?.workspace_slug || 'Workspace control').trim()
  const runtimeHealth = buildRuntimeHealth(agentRuns, agentJobs)
  const updatedAt = latestTimestamp([
    cloudControl?.updatedAt,
    runtime.updatedAt,
    dataFabric.updatedAt,
    ...agentRuns.map((row) => row.completed_at || row.created_at),
    ...workspaceTasks.map((row) => row.updated_at || row.created_at),
    ...approvalRows.map((row) => row.created_at),
    ...decisionRows.map((row) => row.created_at),
  ])

  return {
    source,
    updatedAt,
    cloudControl,
    runtime,
    dataFabric,
    platformControl,
    agentTeams,
    teamMembers,
    agentRuns,
    agentJobs,
    workspaceTasks,
    approvals: {
      summary: approvalPayload.summary ?? null,
      rows: approvalRows,
    },
    decisions: {
      summary: decisionPayload.summary ?? null,
      rows: decisionRows,
    },
    exceptions: {
      summary: exceptionPayload.summary ?? null,
      rows: exceptionRows,
    },
    summary: {
      workspaceName,
      enabledModules,
      pilotModules,
      disabledModules,
      teamCount,
      memberCount,
      autonomyScore,
      openTasks,
      pendingApprovals,
      openDecisions,
      highExceptions,
      runtimeAttention,
    },
    environments: buildEnvironmentPosture({
      runtime,
      platformControl,
      pendingApprovals,
      openDecisions,
      highExceptions,
      runtimeAttention,
    }),
    queueSignals: buildQueueSignals({
      openTasks,
      pendingApprovals,
      openDecisions,
      highExceptions,
      runtimeAttention,
      pilotModules,
    }),
    runtimeHealth,
    executionCells: buildExecutionCells({
      runtime,
      dataFabric,
      runtimeHealth,
      workspaceName,
      memberCount,
      enabledModules,
      openTasks,
    }),
    autonomousCrews: buildAutonomousCrews(runtime, runtimeHealth),
    connectorActivations: buildConnectorActivations(runtime, dataFabric),
  }
}
