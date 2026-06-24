import {
  AGENT_CAPABILITY_CELLS,
  AUTONOMY_RUNTIME_LOOPS,
  KNOWLEDGE_COLLECTIONS,
  MODEL_ROUTING_PROFILES,
  POLICY_GUARDRAILS,
  RUNTIME_CONNECTOR_FEEDS,
  type AgentCapabilityCell,
  type AutonomyRuntimeLoop,
  type KnowledgeCollection,
  type ModelRoutingProfile,
  type PolicyGuardrail,
  type RuntimeConnectorEvent,
  type RuntimeConnectorFeed,
} from './runtimeControlModel'
import { checkWorkspaceHealth, workspaceFetch } from './workspaceApi'

export type RuntimeControlSource = 'seed' | 'live'

export type RuntimeTenantState = {
  status: string
  blocked: boolean
  expectedTenantKey: string
  resourceTenantKey: string
  persistedManifestTenantKey: string
  currentStateTenantKey: string
  snapshotTenantKey: string
  workspaceSlug: string
  workspaceName: string
  detail: string
}

export type RuntimeBigPicture = {
  thesis: string
  currentTruth: string[]
  nextBuilds: string[]
}

export type RuntimeControlDataset = {
  source: RuntimeControlSource
  updatedAt: string | null
  tenantState: RuntimeTenantState
  connectors: RuntimeConnectorFeed[]
  connectorEvents: RuntimeConnectorEvent[]
  knowledgeCollections: KnowledgeCollection[]
  policyGuardrails: PolicyGuardrail[]
  autonomyLoops: AutonomyRuntimeLoop[]
  agentCapabilityCells: AgentCapabilityCell[]
  modelRoutingProfiles: ModelRoutingProfile[]
  bigPicture: RuntimeBigPicture
}

export type RuntimeControlPayload = {
  status?: string
  updated_at?: string
  tenant_state?: {
    status?: string
    blocked?: boolean
    expected_tenant_key?: string
    resource_tenant_key?: string
    persisted_manifest_tenant_key?: string
    current_state_tenant_key?: string
    snapshot_tenant_key?: string
    workspace_slug?: string
    workspace_name?: string
    detail?: string
  }
  connectors?: RuntimeConnectorFeed[]
  connector_events?: Array<
    Partial<RuntimeConnectorEvent> & {
      connector_id?: string
      connector_name?: string
      created_at?: string | null
    }
  >
  knowledge_collections?: KnowledgeCollection[]
  policy_guardrails?: PolicyGuardrail[]
  autonomy_loops?: AutonomyRuntimeLoop[]
  agent_capability_cells?: AgentCapabilityCell[]
  model_routing_profiles?: ModelRoutingProfile[]
  big_picture?: {
    thesis?: string
    current_truth?: string[]
    next_builds?: string[]
  }
}

function normalizeRuntimeTenantState(item?: RuntimeControlPayload['tenant_state'] | null): RuntimeTenantState {
  return {
    status: item?.status ?? 'seed',
    blocked: item?.blocked ?? false,
    expectedTenantKey: item?.expected_tenant_key ?? '',
    resourceTenantKey: item?.resource_tenant_key ?? '',
    persistedManifestTenantKey: item?.persisted_manifest_tenant_key ?? '',
    currentStateTenantKey: item?.current_state_tenant_key ?? '',
    snapshotTenantKey: item?.snapshot_tenant_key ?? '',
    workspaceSlug: item?.workspace_slug ?? '',
    workspaceName: item?.workspace_name ?? '',
    detail: item?.detail ?? 'Seed runtime model in use.',
  }
}

function normalizeRuntimeConnectorFeed(item: Partial<RuntimeConnectorFeed>, fallbackFeed?: RuntimeConnectorFeed): RuntimeConnectorFeed {
  return {
    id: item.id ?? fallbackFeed?.id ?? '',
    name: item.name ?? fallbackFeed?.name ?? 'Connector feed',
    tenant: item.tenant ?? fallbackFeed?.tenant ?? 'yangon-tyre',
    system: item.system ?? fallbackFeed?.system ?? 'Human Entry',
    status: item.status ?? fallbackFeed?.status ?? 'Needs wiring',
    installState: item.installState ?? fallbackFeed?.installState ?? 'Needs wiring',
    credentialMode: item.credentialMode ?? fallbackFeed?.credentialMode ?? 'Not reported',
    cursorMode: item.cursorMode ?? fallbackFeed?.cursorMode ?? 'Not reported',
    lastSuccessAt: item.lastSuccessAt ?? fallbackFeed?.lastSuccessAt ?? 'Not reported',
    replayMode: item.replayMode ?? fallbackFeed?.replayMode ?? 'Manual review only',
    blastRadius: item.blastRadius ?? fallbackFeed?.blastRadius ?? 'Tenant lane',
    freshness: item.freshness ?? fallbackFeed?.freshness ?? 'Not reported',
    owner: item.owner ?? fallbackFeed?.owner ?? 'Connector Systems',
    workspace: item.workspace ?? fallbackFeed?.workspace ?? 'runtime/unknown',
    inputs: item.inputs ?? fallbackFeed?.inputs ?? [],
    outputs: item.outputs ?? fallbackFeed?.outputs ?? [],
    backlog: item.backlog ?? fallbackFeed?.backlog ?? 'Not reported',
    writeBack: item.writeBack ?? fallbackFeed?.writeBack ?? 'Not reported',
    nextAutomation: item.nextAutomation ?? fallbackFeed?.nextAutomation ?? 'Not reported',
    risks: item.risks ?? fallbackFeed?.risks ?? [],
  }
}

function normalizeRuntimeConnectorEvent(
  item: NonNullable<RuntimeControlPayload['connector_events']>[number],
): RuntimeConnectorEvent {
  return {
    id: item.id ?? '',
    connectorId: item.connectorId ?? item.connector_id ?? '',
    connectorName: item.connectorName ?? item.connector_name ?? 'Connector event',
    tenant: item.tenant === 'core' ? 'core' : 'yangon-tyre',
    source: item.source ?? 'Connector runtime',
    kind: item.kind ?? 'event',
    title: item.title ?? 'Connector event',
    detail: item.detail ?? '',
    route: item.route ?? '/app/connectors',
    severity: item.severity ?? 'info',
    actor: item.actor ?? 'System',
    createdAt: item.createdAt ?? item.created_at ?? null,
  }
}

export function normalizeRuntimeControlDataset(
  payload?: RuntimeControlPayload | null,
  source: RuntimeControlSource = 'live',
): RuntimeControlDataset {
  const fallback = getSeedRuntimeControlDataset()
  const fallbackConnectorMap = new Map(fallback.connectors.map((feed) => [feed.id, feed]))
  return {
    source,
    updatedAt: payload?.updated_at ?? null,
    tenantState: normalizeRuntimeTenantState(payload?.tenant_state),
    connectors:
      payload?.connectors?.map((item) => normalizeRuntimeConnectorFeed(item, fallbackConnectorMap.get(String(item.id ?? '').trim()))) ?? fallback.connectors,
    connectorEvents: payload?.connector_events?.map((item) => normalizeRuntimeConnectorEvent(item)) ?? fallback.connectorEvents,
    knowledgeCollections: payload?.knowledge_collections ?? fallback.knowledgeCollections,
    policyGuardrails: payload?.policy_guardrails ?? fallback.policyGuardrails,
    autonomyLoops: payload?.autonomy_loops ?? fallback.autonomyLoops,
    agentCapabilityCells: payload?.agent_capability_cells ?? fallback.agentCapabilityCells,
    modelRoutingProfiles: payload?.model_routing_profiles ?? fallback.modelRoutingProfiles,
    bigPicture: {
      thesis: payload?.big_picture?.thesis ?? fallback.bigPicture.thesis,
      currentTruth: payload?.big_picture?.current_truth ?? fallback.bigPicture.currentTruth,
      nextBuilds: payload?.big_picture?.next_builds ?? fallback.bigPicture.nextBuilds,
    },
  }
}

const seedBigPicture: RuntimeBigPicture = {
  thesis: 'SuperMega replaces scattered SaaS categories with one AI-native runtime: shared memory, guarded autonomy, and reusable modules on the same operating substrate.',
  currentTruth: [
    'Control surfaces already exist for connectors, knowledge, policy, security, runtime, and product operations.',
    'Starter wedges, product lines, and tenant operating models are now mapped into the same internal shell.',
    'The next step is backend truth: live connector events, delivery state, and canonical record promotion.',
  ],
  nextBuilds: [
    'Wire Gmail, Drive, and ERP deltas into the runtime control payload.',
    'Tie GitHub release state and rollout milestones directly to Product Ops.',
    'Promote file and workflow changes into canonical records that open and resolve work automatically.',
  ],
}

export function getSeedRuntimeControlDataset(): RuntimeControlDataset {
  return {
    source: 'seed',
    updatedAt: null,
    tenantState: normalizeRuntimeTenantState(),
    connectors: RUNTIME_CONNECTOR_FEEDS,
    connectorEvents: [],
    knowledgeCollections: KNOWLEDGE_COLLECTIONS,
    policyGuardrails: POLICY_GUARDRAILS,
    autonomyLoops: AUTONOMY_RUNTIME_LOOPS,
    agentCapabilityCells: AGENT_CAPABILITY_CELLS,
    modelRoutingProfiles: MODEL_ROUTING_PROFILES,
    bigPicture: seedBigPicture,
  }
}

export async function loadRuntimeControlDataset(): Promise<RuntimeControlDataset> {
  const fallback = getSeedRuntimeControlDataset()
  const health = await checkWorkspaceHealth()

  if (!health.ready) {
    return fallback
  }

  try {
    const payload = await workspaceFetch<RuntimeControlPayload>('/api/runtime/control')
    return normalizeRuntimeControlDataset(payload, 'live')
  } catch {
    return fallback
  }
}
