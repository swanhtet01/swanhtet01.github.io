import { loadCloudOpsDashboard, type CloudControlCard, type CloudOpsDashboard } from './cloudOpsApi'
import type { AgentCapabilityCell, ModelRoutingProfile } from './runtimeControlModel'
import { workspaceFetch } from './workspaceApi'

export type ModelOpsSource = 'seed' | 'partial' | 'live'

export type ModelOpsDialectic = {
  thesis: string
  antithesis: string
  synthesis: string
}

export type ModelOpsSummary = {
  providerCount: number
  readyProviderCount: number
  routingProfileCount: number
  healthyRoutingCount: number
  crewCount: number
  guardedCrewCount: number
  drillCount: number
  readyDrillCount: number
  toolchainReadyCount: number
  staleJobCount: number
  learningTrustScore: number
}

export type ModelOpsProviderLane = CloudControlCard & {
  primaryProfiles: string[]
  fallbackProfiles: string[]
  recommendedUses: string[]
}

export type ModelOpsRoutingLane = ModelRoutingProfile & {
  preferredProviderId: string
  preferredProviderName: string
  preferredProviderStatus: string
  fallbackProviderId: string
  fallbackProviderName: string
  fallbackProviderStatus: string
}

export type ModelOpsCrewLane = {
  id: string
  name: string
  status: string
  workspace: string
  mission: string
  trustBoundary: string
  approvalGate: string
  suggestedProfileId: string
  suggestedProfileName: string
  suggestedProviderName: string
  suggestedProviderStatus: string
  signals: string[]
  risks: string[]
  route: string
}

export type ModelOpsBenchmarkDrill = {
  id: string
  name: string
  status: 'Healthy' | 'Attention' | 'Blocked'
  owner: string
  route: string
  profileName: string
  providerName: string
  objective: string
  checks: string[]
  nextMove: string
}

export type ModelOpsPayload = {
  source: ModelOpsSource
  updatedAt: string | null
  workspaceName: string
  dialectic: ModelOpsDialectic
  summary: ModelOpsSummary
  providerLanes: ModelOpsProviderLane[]
  routingLanes: ModelOpsRoutingLane[]
  crewLanes: ModelOpsCrewLane[]
  benchmarkDrills: ModelOpsBenchmarkDrill[]
  nextMoves: string[]
}

type DrillTemplate = {
  id: string
  profileId: string
  name: string
  owner: string
  route: string
  objective: string
  checks: string[]
}

const DRILL_TEMPLATES: DrillTemplate[] = [
  {
    id: 'director-decision-packet',
    profileId: 'frontier-governance',
    name: 'Director decision packet',
    owner: 'Director review',
    route: '/app/director',
    objective: 'Turn cross-functional evidence into one reviewed decision packet with clear tradeoffs, owner, and next action.',
    checks: ['Citations or evidence links attached', 'Escalation path named', 'Decision and next move recorded'],
  },
  {
    id: 'foundry-builder-release',
    profileId: 'codex-builder',
    name: 'Foundry builder release',
    owner: 'Platform pod',
    route: '/app/factory',
    objective: 'Ship multi-file module work with bounded write scope, verification, and release handoff back into the control plane.',
    checks: ['Write scope is explicit', 'Build or syntax check passes', 'Release lane and rollback path are visible'],
  },
  {
    id: 'browser-ops-sweep',
    profileId: 'crew-operator',
    name: 'Browser and operator sweep',
    owner: 'Agent ops',
    route: '/app/cloud',
    objective: 'Run repetitive UI, connector, and queue checks in the cheaper crew lane before operators spend manual time on them.',
    checks: ['Task boundary is scoped', 'External writes stay approved', 'Trace logging is present'],
  },
  {
    id: 'evidence-extraction-lane',
    profileId: 'extract-classify',
    name: 'Gmail and Drive evidence extraction',
    owner: 'Knowledge systems',
    route: '/app/data-fabric',
    objective: 'Convert inbox, folder, and document changes into scored evidence, feature signals, and promotable records.',
    checks: ['Structured output validates', 'Confidence threshold is recorded', 'Promotion review is required before canon writeback'],
  },
] as const

function providerIdForModel(modelName: string) {
  const normalized = String(modelName).trim().toLowerCase()
  if (normalized.startsWith('gpt-')) {
    return 'provider-openai'
  }
  if (normalized.startsWith('claude')) {
    return 'provider-anthropic'
  }
  if (normalized.startsWith('gemini')) {
    return 'provider-gemini'
  }
  return ''
}

function providerName(card?: CloudControlCard | null) {
  return card?.name ?? 'Unmapped provider'
}

function providerStatus(card?: CloudControlCard | null) {
  return card?.status ?? 'blocked'
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

function suggestedProfileIdForCrew(cell: AgentCapabilityCell) {
  const haystack = [cell.name, cell.workspace, cell.mission, ...cell.toolClasses, ...cell.dataSources, ...cell.allowedActions].join(' ').toLowerCase()

  if (/(repo|code|build|patch|shell|release|github|refactor)/.test(haystack)) {
    return 'codex-builder'
  }
  if (/(browser|computer use|queue|subagent|qa|skill|tool search)/.test(haystack)) {
    return 'crew-operator'
  }
  if (/(extract|classification|ranking|feature|gmail|drive|erp|document|mail|intake|retrieval)/.test(haystack)) {
    return 'extract-classify'
  }
  return 'frontier-governance'
}

function buildProviderLanes(dashboard: CloudOpsDashboard) {
  const providers = dashboard.cloudControl?.modelProviders ?? []
  const routingProfiles = dashboard.runtime.modelRoutingProfiles

  return providers.map((card) => {
    const primaryProfiles = routingProfiles
      .filter((profile) => providerIdForModel(profile.preferredModel) === card.id)
      .map((profile) => profile.name)
    const fallbackProfiles = routingProfiles
      .filter((profile) => providerIdForModel(profile.fallbackModel) === card.id)
      .map((profile) => profile.name)

    return {
      ...card,
      primaryProfiles,
      fallbackProfiles,
      recommendedUses: [
        ...(primaryProfiles.length ? primaryProfiles.map((profile) => `Primary for ${profile}`) : ['No preferred routing lane assigned yet']),
        ...fallbackProfiles.map((profile) => `Fallback for ${profile}`),
      ],
    }
  })
}

function buildRoutingLanes(dashboard: CloudOpsDashboard, providerMap: Map<string, CloudControlCard>) {
  return dashboard.runtime.modelRoutingProfiles.map((profile) => {
    const preferredProvider = providerMap.get(providerIdForModel(profile.preferredModel))
    const fallbackProvider = providerMap.get(providerIdForModel(profile.fallbackModel))

    return {
      ...profile,
      preferredProviderId: providerIdForModel(profile.preferredModel),
      preferredProviderName: providerName(preferredProvider),
      preferredProviderStatus: providerStatus(preferredProvider),
      fallbackProviderId: providerIdForModel(profile.fallbackModel),
      fallbackProviderName: providerName(fallbackProvider),
      fallbackProviderStatus: providerStatus(fallbackProvider),
    }
  })
}

function buildCrewLanes(dashboard: CloudOpsDashboard, routingMap: Map<string, ModelOpsRoutingLane>) {
  return dashboard.runtime.agentCapabilityCells.map((cell) => {
    const profile = routingMap.get(suggestedProfileIdForCrew(cell))

    return {
      id: cell.id,
      name: cell.name,
      status: cell.status,
      workspace: cell.workspace,
      mission: cell.mission,
      trustBoundary: cell.trustBoundary,
      approvalGate: cell.approvalGate,
      suggestedProfileId: profile?.id ?? '',
      suggestedProfileName: profile?.name ?? 'Unassigned routing lane',
      suggestedProviderName: profile?.preferredProviderName ?? 'Unmapped provider',
      suggestedProviderStatus: profile?.preferredProviderStatus ?? 'blocked',
      signals: [...cell.toolClasses.slice(0, 2), ...cell.dataSources.slice(0, 2)],
      risks: cell.risks,
      route: '/app/agent-space',
    }
  })
}

function buildBenchmarkDrills(routingMap: Map<string, ModelOpsRoutingLane>, toolchainReadyCount: number) {
  return DRILL_TEMPLATES.map((template) => {
    const lane = routingMap.get(template.profileId)
    const providerState = String(lane?.preferredProviderStatus ?? 'blocked').trim().toLowerCase()
    const profileState = String(lane?.status ?? 'Blocked').trim().toLowerCase()
    const status: ModelOpsBenchmarkDrill['status'] =
      providerState === 'blocked' || toolchainReadyCount <= 0
        ? 'Blocked'
        : providerState === 'attention' || profileState === 'warning'
          ? 'Attention'
          : 'Healthy'

    return {
      id: template.id,
      name: template.name,
      status,
      owner: template.owner,
      route: template.route,
      profileName: lane?.name ?? 'Unassigned routing lane',
      providerName: lane?.preferredProviderName ?? 'Unmapped provider',
      objective: template.objective,
      checks: template.checks,
      nextMove: lane?.nextMove ?? 'Define a routing lane and approval boundary before scaling this workflow.',
    }
  })
}

function buildDialectic(dashboard: CloudOpsDashboard, providerLanes: ModelOpsProviderLane[]) {
  const attentionProviders = providerLanes.filter((lane) => lane.status !== 'ready').map((lane) => lane.name)
  const antithesis =
    attentionProviders.length > 0
      ? `Autonomy degrades when ${attentionProviders.join(', ')} remain partial and crews infer routing or writeback policy from context instead of explicit contracts.`
      : 'Autonomy still fails when crews infer routing, approval, or eval policy instead of working from explicit contracts.'

  return {
    thesis: dashboard.runtime.bigPicture.thesis,
    antithesis,
    synthesis:
      'Model Ops is the synthesis layer: every crew gets a declared lane, every lane maps to a provider and fallback, and every high-impact workflow gets benchmark drills before autonomy expands.',
  }
}

function buildModelOpsPayloadFromDashboard(dashboard: CloudOpsDashboard): ModelOpsPayload {
  const providerMap = new Map((dashboard.cloudControl?.modelProviders ?? []).map((card) => [card.id, card]))
  const providerLanes = buildProviderLanes(dashboard)
  const routingLanes = buildRoutingLanes(dashboard, providerMap)
  const routingMap = new Map(routingLanes.map((lane) => [lane.id, lane]))
  const crewLanes = buildCrewLanes(dashboard, routingMap)
  const toolchainReadyCount = (dashboard.cloudControl?.agentToolchain ?? []).filter((item) => item.status === 'ready').length
  const benchmarkDrills = buildBenchmarkDrills(routingMap, toolchainReadyCount)
  const dialectic = buildDialectic(dashboard, providerLanes)

  return {
    source: dashboard.source,
    updatedAt: latestTimestamp([dashboard.updatedAt, dashboard.cloudControl?.updatedAt, dashboard.runtime.updatedAt]),
    workspaceName: dashboard.summary.workspaceName,
    dialectic,
    summary: {
      providerCount: providerLanes.length,
      readyProviderCount: providerLanes.filter((lane) => lane.status === 'ready').length,
      routingProfileCount: routingLanes.length,
      healthyRoutingCount: routingLanes.filter((lane) => lane.status === 'Healthy').length,
      crewCount: crewLanes.length,
      guardedCrewCount: crewLanes.filter((lane) => lane.status === 'Healthy').length,
      drillCount: benchmarkDrills.length,
      readyDrillCount: benchmarkDrills.filter((drill) => drill.status === 'Healthy').length,
      toolchainReadyCount,
      staleJobCount: dashboard.runtimeHealth.staleFamilyCount,
      learningTrustScore: dashboard.dataFabric.learningDatabase.trustScore,
    },
    providerLanes,
    routingLanes,
    crewLanes,
    benchmarkDrills,
    nextMoves: [
      ...((dashboard.cloudControl?.nextMoves ?? []).slice(0, 3)),
      ...routingLanes
        .filter((lane) => lane.status !== 'Healthy')
        .map((lane) => lane.nextMove)
        .slice(0, 2),
    ],
  }
}

type LiveModelOpsPayload = ModelOpsPayload & {
  status?: string
  resourceId?: string
  tenantKey?: string
}

export async function loadModelOpsPayload(): Promise<ModelOpsPayload> {
  try {
    return await workspaceFetch<LiveModelOpsPayload>('/api/model-ops')
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status?: number }).status ?? 0) : 0
    if (status === 401 || status === 403) {
      throw error
    }
  }

  const dashboard = await loadCloudOpsDashboard()
  return buildModelOpsPayloadFromDashboard(dashboard)
}
