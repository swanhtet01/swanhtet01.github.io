import {
  AUTONOMY_RUNTIME_LOOPS,
  KNOWLEDGE_COLLECTIONS,
  POLICY_GUARDRAILS,
  RUNTIME_CONNECTOR_FEEDS,
  type AutonomyRuntimeLoop,
  type KnowledgeCollection,
  type PolicyGuardrail,
  type RuntimeConnectorFeed,
} from './runtimeControlModel'
import { checkWorkspaceHealth, workspaceFetch } from './workspaceApi'

export type RuntimeControlSource = 'seed' | 'live'

export type RuntimeControlDataset = {
  source: RuntimeControlSource
  updatedAt: string | null
  connectors: RuntimeConnectorFeed[]
  knowledgeCollections: KnowledgeCollection[]
  policyGuardrails: PolicyGuardrail[]
  autonomyLoops: AutonomyRuntimeLoop[]
}

type RuntimeControlPayload = {
  status?: string
  updated_at?: string
  connectors?: RuntimeConnectorFeed[]
  knowledge_collections?: KnowledgeCollection[]
  policy_guardrails?: PolicyGuardrail[]
  autonomy_loops?: AutonomyRuntimeLoop[]
}

export function getSeedRuntimeControlDataset(): RuntimeControlDataset {
  return {
    source: 'seed',
    updatedAt: null,
    connectors: RUNTIME_CONNECTOR_FEEDS,
    knowledgeCollections: KNOWLEDGE_COLLECTIONS,
    policyGuardrails: POLICY_GUARDRAILS,
    autonomyLoops: AUTONOMY_RUNTIME_LOOPS,
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
    return {
      source: 'live',
      updatedAt: payload.updated_at ?? null,
      connectors: payload.connectors ?? fallback.connectors,
      knowledgeCollections: payload.knowledge_collections ?? fallback.knowledgeCollections,
      policyGuardrails: payload.policy_guardrails ?? fallback.policyGuardrails,
      autonomyLoops: payload.autonomy_loops ?? fallback.autonomyLoops,
    }
  } catch {
    return fallback
  }
}
