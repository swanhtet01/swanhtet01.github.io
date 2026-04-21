import { workspaceFetch } from './workspaceApi'

type RecordLike = Record<string, unknown>

function asRecord(value: unknown): RecordLike {
  return value && typeof value === 'object' ? (value as RecordLike) : {}
}

function asString(value: unknown) {
  return String(value ?? '').trim()
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : []
}

function asArray<T>(value: unknown, mapper: (value: unknown) => T): T[] {
  return Array.isArray(value) ? value.map((item) => mapper(item)) : []
}

export type WorkforceRouteLink = {
  label: string
  to: string
}

export type WorkforceRoleCell = {
  id: string
  role: string
  home: string
  route: string
  frequency: string
  managerCadence: string
  mustCapture: string[]
  usefulOutputs: string[]
}

export type WorkforceBuildTeam = {
  id: string
  name: string
  workspace: string
  mission: string
  ownership: string[]
  outputs: string[]
  agentPods: string[]
  rituals: string[]
  metric: string
}

export type WorkforceWorkspace = {
  id: string
  name: string
  purpose: string
  owners: string[]
  surfaces: string[]
  reviewCadence: string
}

export type WorkforceDelegatedPod = {
  id: string
  name: string
  mission: string
  owns: string[]
  readScope: string[]
  writeScope: string[]
  reviewGate: string
  routes: WorkforceRouteLink[]
}

export type WorkforceInstructionPack = {
  id: string
  name: string
  audience: string
  workspace: string
  instructions: string[]
  doneWhen: string
}

export type WorkforceManifestTool = {
  id: string
  name: string
  category: string
  purpose: string
}

export type WorkforceManifestToolAccess = {
  toolId: string
  mode: string
  scope: string
}

export type WorkforceManifestKpi = {
  name: string
  target: string
}

export type WorkforceManifestPlaybook = {
  id: string
  teamId: string
  name: string
  workspace: string
  leadRole: string
  mission: string
  outputs: string[]
  cadence: string[]
  tools: WorkforceManifestToolAccess[]
  instructions: string[]
  escalateWhen: string[]
  writePolicy: string
  kpis: WorkforceManifestKpi[]
}

export type WorkforceCount = {
  key: string
  count: number
}

export type WorkforceCommand = {
  id: string
  label: string
  command: string
  detail: string
}

export type WorkforceRun = {
  runId: string
  jobType: string
  status: string
  source: string
  summary: string
  startedAt: string | null
  finishedAt: string | null
}

export type WorkforceCoreTeamMember = {
  memberId: string
  name: string
  role: string
  status: string
  homeRoute: string
  capabilityFocus: string[]
  assignedOpenTaskCount: number
  assignedHighPriorityTaskCount: number
  linkedPrograms: string[]
  linkedDataDomains: string[]
  nextMove: string
}

export type WorkforceAssignmentLane = {
  id: string
  title: string
  priority: string
  status: string
  route: string
  currentOwner: string
  suggestedOwner: string
  suggestedRole: string
  due: string | null
  dataSignals: string[]
  reason: string
  nextAction: string
}

export type WorkforceReviewCycle = {
  id: string
  name: string
  cadence: string
  status: string
  route: string
  ownerRole: string
  queueCount: number
  dataSignals: string[]
  focus: string[]
  nextMove: string
}

export type WorkforceAutomationLane = {
  id: string
  name: string
  cadence: string
  status: string
  route: string
  mode: string
  sourceSystems: string[]
  latestRunAt: string | null
  queueSignal: string
  nextMove: string
}

export type WorkforceDataLink = {
  id: string
  name: string
  status: string
  route: string
  sourceType: string
  evidenceCount: number
  consumers: string[]
  nextAutomation: string
}

export type WorkforceAutomationResult = {
  status: string
  message: string
  appliedAssignmentCount: number
  seededReviewCount: number
  queuedJobCount: number
  processedJobCount: number
  registry: WorkforceRegistryPayload | null
}

export type WorkforceRegistryPayload = {
  status: string
  updatedAt: string | null
  resourceId: string
  tenantKey: string
  title: string
  dialectic: {
    thesis: string
    antithesis: string
    synthesis: string
  }
  managerMoves: string[]
  workspace: {
    workspaceId: string
    workspaceSlug: string
    workspaceName: string
    workspacePlan: string
    role: string
    displayName: string
  }
  summary: {
    roleCount: number
    buildTeamCount: number
    workspaceCount: number
    delegatedPodCount: number
    instructionPackCount: number
    playbookCount: number
    toolCount: number
    aiPodCount: number
    memberCount: number
    openTaskCount: number
    activePlaybookCount: number
    enabledModuleCount: number
    coverageScore: number
    cloudReadyCount: number
    cloudAttentionCount: number
    cloudBlockerCount: number
    coreTeamCount: number
    assignmentCount: number
    reviewCycleCount: number
    automationLaneCount: number
    dataLinkCount: number
  }
  roleCells: WorkforceRoleCell[]
  buildTeams: WorkforceBuildTeam[]
  workspaces: WorkforceWorkspace[]
  delegatedPods: WorkforceDelegatedPod[]
  instructionPacks: WorkforceInstructionPack[]
  manifest: {
    version: string
    tenantKey: string
    title: string
    summary: string
    managerMoves: string[]
    tools: WorkforceManifestTool[]
    playbooks: WorkforceManifestPlaybook[]
  }
  live: {
    memberRoleCounts: WorkforceCount[]
    recentRuns: WorkforceRun[]
    commands: WorkforceCommand[]
    nextMoves: string[]
    preferredWorkforceMode: string
    coreTeam: WorkforceCoreTeamMember[]
    assignmentBoard: WorkforceAssignmentLane[]
    reviewCycles: WorkforceReviewCycle[]
    automationLanes: WorkforceAutomationLane[]
    dataLinks: WorkforceDataLink[]
    supervisor: {
      status: string
      cycleCount: number
      lastFinishedAt: string | null
      intervalMinutes: number
    }
  }
}

function normalizeRouteLink(value: unknown): WorkforceRouteLink {
  const record = asRecord(value)
  return {
    label: asString(record.label),
    to: asString(record.to),
  }
}

function normalizeCount(value: unknown): WorkforceCount {
  const record = asRecord(value)
  return {
    key: asString(record.key),
    count: asNumber(record.count),
  }
}

function normalizeCommand(value: unknown): WorkforceCommand {
  const record = asRecord(value)
  return {
    id: asString(record.id),
    label: asString(record.label),
    command: asString(record.command),
    detail: asString(record.detail),
  }
}

function normalizeRun(value: unknown): WorkforceRun {
  const record = asRecord(value)
  return {
    runId: asString(record.run_id),
    jobType: asString(record.job_type),
    status: asString(record.status),
    source: asString(record.source),
    summary: asString(record.summary),
    startedAt: asString(record.started_at) || null,
    finishedAt: asString(record.finished_at) || null,
  }
}

function normalizeCoreTeamMember(value: unknown): WorkforceCoreTeamMember {
  const record = asRecord(value)
  return {
    memberId: asString(record.member_id),
    name: asString(record.name),
    role: asString(record.role),
    status: asString(record.status),
    homeRoute: asString(record.home_route),
    capabilityFocus: asStringList(record.capability_focus),
    assignedOpenTaskCount: asNumber(record.assigned_open_task_count),
    assignedHighPriorityTaskCount: asNumber(record.assigned_high_priority_task_count),
    linkedPrograms: asStringList(record.linked_programs),
    linkedDataDomains: asStringList(record.linked_data_domains),
    nextMove: asString(record.next_move),
  }
}

function normalizeAssignmentLane(value: unknown): WorkforceAssignmentLane {
  const record = asRecord(value)
  return {
    id: asString(record.id),
    title: asString(record.title),
    priority: asString(record.priority),
    status: asString(record.status),
    route: asString(record.route),
    currentOwner: asString(record.current_owner),
    suggestedOwner: asString(record.suggested_owner),
    suggestedRole: asString(record.suggested_role),
    due: asString(record.due) || null,
    dataSignals: asStringList(record.data_signals),
    reason: asString(record.reason),
    nextAction: asString(record.next_action),
  }
}

function normalizeReviewCycle(value: unknown): WorkforceReviewCycle {
  const record = asRecord(value)
  return {
    id: asString(record.id),
    name: asString(record.name),
    cadence: asString(record.cadence),
    status: asString(record.status),
    route: asString(record.route),
    ownerRole: asString(record.owner_role),
    queueCount: asNumber(record.queue_count),
    dataSignals: asStringList(record.data_signals),
    focus: asStringList(record.focus),
    nextMove: asString(record.next_move),
  }
}

function normalizeAutomationLane(value: unknown): WorkforceAutomationLane {
  const record = asRecord(value)
  return {
    id: asString(record.id),
    name: asString(record.name),
    cadence: asString(record.cadence),
    status: asString(record.status),
    route: asString(record.route),
    mode: asString(record.mode),
    sourceSystems: asStringList(record.source_systems),
    latestRunAt: asString(record.latest_run_at) || null,
    queueSignal: asString(record.queue_signal),
    nextMove: asString(record.next_move),
  }
}

function normalizeDataLink(value: unknown): WorkforceDataLink {
  const record = asRecord(value)
  return {
    id: asString(record.id),
    name: asString(record.name),
    status: asString(record.status),
    route: asString(record.route),
    sourceType: asString(record.source_type),
    evidenceCount: asNumber(record.evidence_count),
    consumers: asStringList(record.consumers),
    nextAutomation: asString(record.next_automation),
  }
}

function normalizeWorkforceRegistryPayload(payload: RecordLike): WorkforceRegistryPayload {
  const dialectic = asRecord(payload.dialectic)
  const workspace = asRecord(payload.workspace)
  const summary = asRecord(payload.summary)
  const manifest = asRecord(payload.manifest)
  const live = asRecord(payload.live)
  const supervisor = asRecord(live.supervisor)

  return {
    status: asString(payload.status),
    updatedAt: asString(payload.updated_at) || null,
    resourceId: asString(payload.resource_id),
    tenantKey: asString(payload.tenant_key),
    title: asString(payload.title),
    dialectic: {
      thesis: asString(dialectic.thesis),
      antithesis: asString(dialectic.antithesis),
      synthesis: asString(dialectic.synthesis),
    },
    managerMoves: asStringList(payload.manager_moves),
    workspace: {
      workspaceId: asString(workspace.workspace_id),
      workspaceSlug: asString(workspace.workspace_slug),
      workspaceName: asString(workspace.workspace_name),
      workspacePlan: asString(workspace.workspace_plan),
      role: asString(workspace.role),
      displayName: asString(workspace.display_name),
    },
    summary: {
      roleCount: asNumber(summary.role_count),
      buildTeamCount: asNumber(summary.build_team_count),
      workspaceCount: asNumber(summary.workspace_count),
      delegatedPodCount: asNumber(summary.delegated_pod_count),
      instructionPackCount: asNumber(summary.instruction_pack_count),
      playbookCount: asNumber(summary.playbook_count),
      toolCount: asNumber(summary.tool_count),
      aiPodCount: asNumber(summary.ai_pod_count),
      memberCount: asNumber(summary.member_count),
      openTaskCount: asNumber(summary.open_task_count),
      activePlaybookCount: asNumber(summary.active_playbook_count),
      enabledModuleCount: asNumber(summary.enabled_module_count),
      coverageScore: asNumber(summary.coverage_score),
      cloudReadyCount: asNumber(summary.cloud_ready_count),
      cloudAttentionCount: asNumber(summary.cloud_attention_count),
      cloudBlockerCount: asNumber(summary.cloud_blocker_count),
      coreTeamCount: asNumber(summary.core_team_count),
      assignmentCount: asNumber(summary.assignment_count),
      reviewCycleCount: asNumber(summary.review_cycle_count),
      automationLaneCount: asNumber(summary.automation_lane_count),
      dataLinkCount: asNumber(summary.data_link_count),
    },
    roleCells: asArray(payload.role_cells, (value) => {
      const record = asRecord(value)
      return {
        id: asString(record.id),
        role: asString(record.role),
        home: asString(record.home),
        route: asString(record.route),
        frequency: asString(record.frequency),
        managerCadence: asString(record.manager_cadence),
        mustCapture: asStringList(record.must_capture),
        usefulOutputs: asStringList(record.useful_outputs),
      }
    }),
    buildTeams: asArray(payload.build_teams, (value) => {
      const record = asRecord(value)
      return {
        id: asString(record.id),
        name: asString(record.name),
        workspace: asString(record.workspace),
        mission: asString(record.mission),
        ownership: asStringList(record.ownership),
        outputs: asStringList(record.outputs),
        agentPods: asStringList(record.agent_pods),
        rituals: asStringList(record.rituals),
        metric: asString(record.metric),
      }
    }),
    workspaces: asArray(payload.workspaces, (value) => {
      const record = asRecord(value)
      return {
        id: asString(record.id),
        name: asString(record.name),
        purpose: asString(record.purpose),
        owners: asStringList(record.owners),
        surfaces: asStringList(record.surfaces),
        reviewCadence: asString(record.review_cadence),
      }
    }),
    delegatedPods: asArray(payload.delegated_pods, (value) => {
      const record = asRecord(value)
      return {
        id: asString(record.id),
        name: asString(record.name),
        mission: asString(record.mission),
        owns: asStringList(record.owns),
        readScope: asStringList(record.read_scope),
        writeScope: asStringList(record.write_scope),
        reviewGate: asString(record.review_gate),
        routes: asArray(record.routes, normalizeRouteLink),
      }
    }),
    instructionPacks: asArray(payload.instruction_packs, (value) => {
      const record = asRecord(value)
      return {
        id: asString(record.id),
        name: asString(record.name),
        audience: asString(record.audience),
        workspace: asString(record.workspace),
        instructions: asStringList(record.instructions),
        doneWhen: asString(record.done_when),
      }
    }),
    manifest: {
      version: asString(manifest.version),
      tenantKey: asString(manifest.tenantKey),
      title: asString(manifest.title),
      summary: asString(manifest.summary),
      managerMoves: asStringList(manifest.managerMoves),
      tools: asArray(manifest.tools, (value) => {
        const record = asRecord(value)
        return {
          id: asString(record.id),
          name: asString(record.name),
          category: asString(record.category),
          purpose: asString(record.purpose),
        }
      }),
      playbooks: asArray(manifest.playbooks, (value) => {
        const record = asRecord(value)
        return {
          id: asString(record.id),
          teamId: asString(record.teamId),
          name: asString(record.name),
          workspace: asString(record.workspace),
          leadRole: asString(record.leadRole),
          mission: asString(record.mission),
          outputs: asStringList(record.outputs),
          cadence: asStringList(record.cadence),
          tools: asArray(record.tools, (item) => {
            const tool = asRecord(item)
            return {
              toolId: asString(tool.toolId),
              mode: asString(tool.mode),
              scope: asString(tool.scope),
            }
          }),
          instructions: asStringList(record.instructions),
          escalateWhen: asStringList(record.escalateWhen),
          writePolicy: asString(record.writePolicy),
          kpis: asArray(record.kpis, (item) => {
            const kpi = asRecord(item)
            return {
              name: asString(kpi.name),
              target: asString(kpi.target),
            }
          }),
        }
      }),
    },
    live: {
      memberRoleCounts: asArray(live.member_role_counts, normalizeCount),
      recentRuns: asArray(live.recent_runs, normalizeRun),
      commands: asArray(live.commands, normalizeCommand),
      nextMoves: asStringList(live.next_moves),
      preferredWorkforceMode: asString(live.preferred_workforce_mode),
      coreTeam: asArray(live.core_team, normalizeCoreTeamMember),
      assignmentBoard: asArray(live.assignment_board, normalizeAssignmentLane),
      reviewCycles: asArray(live.review_cycles, normalizeReviewCycle),
      automationLanes: asArray(live.automation_lanes, normalizeAutomationLane),
      dataLinks: asArray(live.data_links, normalizeDataLink),
      supervisor: {
        status: asString(supervisor.status),
        cycleCount: asNumber(supervisor.cycle_count),
        lastFinishedAt: asString(supervisor.last_finished_at) || null,
        intervalMinutes: asNumber(supervisor.interval_minutes),
      },
    },
  }
}

export async function loadWorkforceRegistry(): Promise<WorkforceRegistryPayload> {
  const payload = await workspaceFetch<RecordLike>('/api/workforce/registry')
  return normalizeWorkforceRegistryPayload(payload)
}

export async function applyWorkforceAutomation(payload?: {
  applyAssignments?: boolean
  seedReviewCycles?: boolean
  queueDefaultJobs?: boolean
  processQueue?: boolean
  limit?: number
  source?: string
}): Promise<WorkforceAutomationResult> {
  const response = await workspaceFetch<RecordLike>('/api/workforce/automation/apply', {
    method: 'POST',
    body: JSON.stringify({
      apply_assignments: payload?.applyAssignments ?? true,
      seed_review_cycles: payload?.seedReviewCycles ?? true,
      queue_default_jobs: payload?.queueDefaultJobs ?? false,
      process_queue: payload?.processQueue ?? false,
      limit: payload?.limit ?? 8,
      source: payload?.source ?? 'workforce_command',
    }),
  })

  const registryPayload = response.registry && typeof response.registry === 'object'
    ? ({
        ...response.registry,
      } as RecordLike)
    : null

  return {
    status: asString(response.status),
    message: asString(response.message),
    appliedAssignmentCount: asNumber(response.applied_assignment_count),
    seededReviewCount: asNumber(response.seeded_review_count),
    queuedJobCount: asNumber(response.queued_job_count),
    processedJobCount: asNumber(response.processed_job_count),
    registry: registryPayload ? normalizeWorkforceRegistryPayload(registryPayload) : null,
  }
}
