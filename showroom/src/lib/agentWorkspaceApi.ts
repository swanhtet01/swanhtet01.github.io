import { workspaceFetch } from './workspaceApi'

export type AgentWorkspaceCompany = {
  name: string
  publicLabel: string
  domain: string
  sector: string
}

export type AgentWorkspaceDialectic = {
  thesis: string
  antithesis: string
  synthesis: string
}

export type AgentWorkspaceNode = {
  id: string
  name: string
  route: string
  mission: string
  ownerRoles: string[]
}

export type AgentWorkspaceRoleProfile = {
  id: string
  name: string
  home: string
  mission: string
  capabilities: string[]
  toolProfile: string
}

export type AgentWorkspaceToolProfile = {
  id: string
  name: string
  users: string[]
  tools: string[]
  guardrails: string[]
}

export type AgentWorkspaceKnowledgeResource = {
  id: string
  name: string
  source: string
  trustTier: string
  cadence: string
  usedBy: string[]
}

export type AgentWorkspaceTrustBoundary = {
  id: string
  name: string
  rule: string
  surfaces: string[]
}

export type AgentWorkspaceTeam = {
  id: string
  name: string
  workspace: string
  mission: string
  reads: string[]
  writes: string[]
  approvalGate: string
}

export type AgentWorkspaceExecutionLoop = {
  id: string
  name: string
  trigger: string
  outputs: string[]
  kpis: string[]
}

export type AgentWorkspaceQuickLink = {
  label: string
  route: string
}

export type AgentWorkspaceCount = {
  key: string
  count: number
}

export type AgentWorkspaceModuleRow = {
  moduleId: string
  name: string
  workspaceStatus: string
  summary: string
}

export type AgentWorkspaceAuditRow = {
  eventType: string
  summary: string
  detail: string
  createdAt: string
}

export type AgentWorkspaceCommand = {
  id: string
  label: string
  command: string
  detail: string
}

export type AgentWorkspacePayload = {
  status: string
  updatedAt: string | null
  resourceId: string
  tenantKey: string
  company: AgentWorkspaceCompany
  dialectic: AgentWorkspaceDialectic
  workspace: {
    workspaceId: string
    workspaceSlug: string
    workspaceName: string
    workspacePlan: string
    role: string
    displayName: string
  }
  summary: {
    workspaceCount: number
    roleCount: number
    toolProfileCount: number
    knowledgeResourceCount: number
    trustBoundaryCount: number
    aiTeamCount: number
    executionLoopCount: number
    enabledModuleCount: number
    pilotModuleCount: number
    disabledModuleCount: number
    memberCount: number
    openTaskCount: number
    auditEventCount: number
    coverageScore: number
    roleCoverageScore: number
    cloudReadyCount: number
    cloudAttentionCount: number
    cloudBlockerCount: number
    staleJobCount: number
  }
  workspaces: AgentWorkspaceNode[]
  roleProfiles: AgentWorkspaceRoleProfile[]
  toolProfiles: AgentWorkspaceToolProfile[]
  knowledgeResources: AgentWorkspaceKnowledgeResource[]
  trustBoundaries: AgentWorkspaceTrustBoundary[]
  aiTeams: AgentWorkspaceTeam[]
  executionLoops: AgentWorkspaceExecutionLoop[]
  quickLinks: AgentWorkspaceQuickLink[]
  references: string[]
  live: {
    moduleStatusCounts: AgentWorkspaceCount[]
    moduleRows: AgentWorkspaceModuleRow[]
    memberRoleCounts: AgentWorkspaceCount[]
    recentAudits: AgentWorkspaceAuditRow[]
    commands: AgentWorkspaceCommand[]
    nextMoves: string[]
    supervisor: {
      status: string
      cycleCount: number
      lastFinishedAt: string | null
      intervalMinutes: number
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
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

function asArray<T>(value: unknown, mapItem: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map((item) => mapItem(item)) : []
}

function normalizeCount(item: unknown): AgentWorkspaceCount {
  const record = asRecord(item)
  return {
    key: asString(record.key),
    count: asNumber(record.count),
  }
}

function normalizeModuleRow(item: unknown): AgentWorkspaceModuleRow {
  const record = asRecord(item)
  return {
    moduleId: asString(record.module_id),
    name: asString(record.name),
    workspaceStatus: asString(record.workspace_status),
    summary: asString(record.summary),
  }
}

function normalizeAuditRow(item: unknown): AgentWorkspaceAuditRow {
  const record = asRecord(item)
  return {
    eventType: asString(record.event_type),
    summary: asString(record.summary),
    detail: asString(record.detail),
    createdAt: asString(record.created_at),
  }
}

function normalizeCommand(item: unknown): AgentWorkspaceCommand {
  const record = asRecord(item)
  return {
    id: asString(record.id),
    label: asString(record.label),
    command: asString(record.command),
    detail: asString(record.detail),
  }
}

export async function loadAgentWorkspaceContext(): Promise<AgentWorkspacePayload> {
  const payload = await workspaceFetch<Record<string, unknown>>('/api/agent-workspace/context')
  const company = asRecord(payload.company)
  const dialectic = asRecord(payload.dialectic)
  const workspace = asRecord(payload.workspace)
  const summary = asRecord(payload.summary)
  const live = asRecord(payload.live)
  const supervisor = asRecord(live.supervisor)

  return {
    status: asString(payload.status),
    updatedAt: asString(payload.updated_at) || null,
    resourceId: asString(payload.resource_id),
    tenantKey: asString(payload.tenant_key),
    company: {
      name: asString(company.name),
      publicLabel: asString(company.public_label),
      domain: asString(company.domain),
      sector: asString(company.sector),
    },
    dialectic: {
      thesis: asString(dialectic.thesis),
      antithesis: asString(dialectic.antithesis),
      synthesis: asString(dialectic.synthesis),
    },
    workspace: {
      workspaceId: asString(workspace.workspace_id),
      workspaceSlug: asString(workspace.workspace_slug),
      workspaceName: asString(workspace.workspace_name),
      workspacePlan: asString(workspace.workspace_plan),
      role: asString(workspace.role),
      displayName: asString(workspace.display_name),
    },
    summary: {
      workspaceCount: asNumber(summary.workspace_count),
      roleCount: asNumber(summary.role_count),
      toolProfileCount: asNumber(summary.tool_profile_count),
      knowledgeResourceCount: asNumber(summary.knowledge_resource_count),
      trustBoundaryCount: asNumber(summary.trust_boundary_count),
      aiTeamCount: asNumber(summary.ai_team_count),
      executionLoopCount: asNumber(summary.execution_loop_count),
      enabledModuleCount: asNumber(summary.enabled_module_count),
      pilotModuleCount: asNumber(summary.pilot_module_count),
      disabledModuleCount: asNumber(summary.disabled_module_count),
      memberCount: asNumber(summary.member_count),
      openTaskCount: asNumber(summary.open_task_count),
      auditEventCount: asNumber(summary.audit_event_count),
      coverageScore: asNumber(summary.coverage_score),
      roleCoverageScore: asNumber(summary.role_coverage_score),
      cloudReadyCount: asNumber(summary.cloud_ready_count),
      cloudAttentionCount: asNumber(summary.cloud_attention_count),
      cloudBlockerCount: asNumber(summary.cloud_blocker_count),
      staleJobCount: asNumber(summary.stale_job_count),
    },
    workspaces: asArray(payload.workspaces, (item) => {
      const record = asRecord(item)
      return {
        id: asString(record.id),
        name: asString(record.name),
        route: asString(record.route),
        mission: asString(record.mission),
        ownerRoles: asStringList(record.owner_roles),
      }
    }),
    roleProfiles: asArray(payload.role_profiles, (item) => {
      const record = asRecord(item)
      return {
        id: asString(record.id),
        name: asString(record.name),
        home: asString(record.home),
        mission: asString(record.mission),
        capabilities: asStringList(record.capabilities),
        toolProfile: asString(record.tool_profile),
      }
    }),
    toolProfiles: asArray(payload.tool_profiles, (item) => {
      const record = asRecord(item)
      return {
        id: asString(record.id),
        name: asString(record.name),
        users: asStringList(record.users),
        tools: asStringList(record.tools),
        guardrails: asStringList(record.guardrails),
      }
    }),
    knowledgeResources: asArray(payload.knowledge_resources, (item) => {
      const record = asRecord(item)
      return {
        id: asString(record.id),
        name: asString(record.name),
        source: asString(record.source),
        trustTier: asString(record.trust_tier),
        cadence: asString(record.cadence),
        usedBy: asStringList(record.used_by),
      }
    }),
    trustBoundaries: asArray(payload.trust_boundaries, (item) => {
      const record = asRecord(item)
      return {
        id: asString(record.id),
        name: asString(record.name),
        rule: asString(record.rule),
        surfaces: asStringList(record.surfaces),
      }
    }),
    aiTeams: asArray(payload.ai_teams, (item) => {
      const record = asRecord(item)
      return {
        id: asString(record.id),
        name: asString(record.name),
        workspace: asString(record.workspace),
        mission: asString(record.mission),
        reads: asStringList(record.reads),
        writes: asStringList(record.writes),
        approvalGate: asString(record.approval_gate),
      }
    }),
    executionLoops: asArray(payload.execution_loops, (item) => {
      const record = asRecord(item)
      return {
        id: asString(record.id),
        name: asString(record.name),
        trigger: asString(record.trigger),
        outputs: asStringList(record.outputs),
        kpis: asStringList(record.kpis),
      }
    }),
    quickLinks: asArray(payload.quick_links, (item) => {
      const record = asRecord(item)
      return {
        label: asString(record.label),
        route: asString(record.route),
      }
    }),
    references: asStringList(payload.references),
    live: {
      moduleStatusCounts: asArray(live.module_status_counts, normalizeCount),
      moduleRows: asArray(live.module_rows, normalizeModuleRow),
      memberRoleCounts: asArray(live.member_role_counts, normalizeCount),
      recentAudits: asArray(live.recent_audits, normalizeAuditRow),
      commands: asArray(live.commands, normalizeCommand),
      nextMoves: asStringList(live.next_moves),
      supervisor: {
        status: asString(supervisor.status),
        cycleCount: asNumber(supervisor.cycle_count),
        lastFinishedAt: asString(supervisor.last_finished_at) || null,
        intervalMinutes: asNumber(supervisor.interval_minutes),
      },
    },
  }
}
