import {
  YANGON_TYRE_DATA_FABRIC_DIALECTIC,
  YANGON_TYRE_DATA_PIPELINE_STAGES,
  YANGON_TYRE_FEATURE_MARTS,
  YANGON_TYRE_ROLE_STORIES,
  YANGON_TYRE_TOPIC_PIPELINES,
  buildYangonTyreDataCopilots,
  buildYangonTyreWritebackLanes,
  summarizeYangonTyreDataFabric,
  type DataFabricStatus,
  type YangonTyreDataCopilot,
  type YangonTyreDataPipelineStage,
  type YangonTyreFeatureMart,
  type YangonTyreRoleStory,
  type YangonTyreTopicPipeline,
  type YangonTyreWritebackLane,
} from './yangonTyreDataFabricModel'
import { YANGON_TYRE_CONNECTOR_EXPANSION, YANGON_TYRE_SOURCE_PACKS } from './yangonTyreDriveModel'
import {
  YANGON_TYRE_DRIVE_BIG_PICTURE,
  YANGON_TYRE_DRIVE_CHANGE_LINEAGE_SEED,
  YANGON_TYRE_DRIVE_CONNECTOR_SIGNAL_SEED,
  YANGON_TYRE_DRIVE_DATASET_UPDATED_AT,
  YANGON_TYRE_DRIVE_LEARNING_SEED,
  YANGON_TYRE_DRIVE_SOURCE_EVENT_SEED,
  YANGON_TYRE_DRIVE_SOURCE_REGISTRY_SEED,
} from './yangonTyreDriveIntelligence'
import { checkWorkspaceHealth, workspaceFetch } from './workspaceApi'

export type DataFabricSource = 'seed' | 'live'

export type DataFabricLiveSummary = {
  leadCount: number
  receivingCount: number
  receivingHoldCount: number
  qualityIncidentCount: number
  supplierRiskCount: number
  maintenanceCount: number
  metricCount: number
  pendingApprovalCount: number
  openTaskCount: number
}

export type DataFabricBigPicture = {
  thesis: string
  currentTruth: string[]
  nextBuilds: string[]
}

export type DataFabricHealthStatus = 'Healthy' | 'Warning' | 'Degraded' | 'Needs wiring'

export type DataFabricSourceRegistryItem = {
  id: string
  name: string
  sourceType: string
  status: YangonTyreDataPipelineStage['status']
  coverage: string
  route: string
  evidenceCount: number
  lastSignalAt: string | null
  consumers: string[]
  nextAutomation: string
}

export type DataFabricConnectorSignal = {
  id: string
  name: string
  system: string
  status: DataFabricHealthStatus
  freshness: string
  backlog: string
  route: string
  surfaces: string[]
  firstJobs: string[]
  nextAutomation: string
  risks: string[]
}

export type DataFabricSourceEvent = {
  id: string
  source: string
  kind: string
  title: string
  detail: string
  route: string
  signalAt: string | null
  owner: string
}

export type DataFabricLearningDatabase = {
  status: DataFabricHealthStatus
  canonicalRecordCount: number
  graphNodeCount: number
  graphEdgeCount: number
  lineageEventCount: number
  featureSetCount: number
  trustScore: number
  lastLearnedAt: string | null
  qualitativeMethods: string[]
  quantitativeMethods: string[]
  nextAutomation: string
}

export type DataFabricKnowledgeGraphDomain = {
  id: string
  name: string
  status: DataFabricStatus
  nodeCount: number
  edgeCount: number
  owner: string
  route: string
  lastSignalAt: string | null
  entityTypes: string[]
  relationTypes: string[]
  questions: string[]
}

export type DataFabricChangeLineageEvent = {
  id: string
  source: string
  assetName: string
  changeType: string
  changedAt: string | null
  changedBy: string
  route: string
  impact: string
  nextStep: string
}

export type DataFabricManagerProgram = {
  id: string
  role: string
  name: string
  route: string
  mission: string
  watches: string[]
  metrics: string[]
  methods: string[]
  aiTeams: string[]
  writeback: string
  nextHandoff: string
}

export type DataFabricHandoffStatus = 'Active' | 'Queued' | 'Needs review'

export type DataFabricAgentHandoff = {
  id: string
  fromTeam: string
  toTeam: string
  status: DataFabricHandoffStatus
  topic: string
  reason: string
  route: string
  signalAt: string | null
  payload: string[]
}

export type DataFabricDataset = {
  source: DataFabricSource
  updatedAt: string | null
  summary: DataFabricLiveSummary
  sourceRegistry: DataFabricSourceRegistryItem[]
  connectorSignals: DataFabricConnectorSignal[]
  sourceEvents: DataFabricSourceEvent[]
  learningDatabase: DataFabricLearningDatabase
  knowledgeGraphDomains: DataFabricKnowledgeGraphDomain[]
  changeLineage: DataFabricChangeLineageEvent[]
  managerPrograms: DataFabricManagerProgram[]
  agentHandoffs: DataFabricAgentHandoff[]
  pipelineStages: YangonTyreDataPipelineStage[]
  topicPipelines: YangonTyreTopicPipeline[]
  featureMarts: YangonTyreFeatureMart[]
  roleStories: YangonTyreRoleStory[]
  copilots: YangonTyreDataCopilot[]
  writebackLanes: YangonTyreWritebackLane[]
  bigPicture: DataFabricBigPicture
}

export type DataFabricPayload = {
  status?: string
  updated_at?: string
  summary?: {
    lead_count?: number
    receiving_count?: number
    receiving_hold_count?: number
    quality_incident_count?: number
    supplier_risk_count?: number
    maintenance_count?: number
    metric_count?: number
    pending_approval_count?: number
    open_task_count?: number
  }
  source_registry?: Array<
    Partial<DataFabricSourceRegistryItem> & {
      source_type?: string
      evidence_count?: number
      last_signal_at?: string | null
      next_automation?: string
    }
  >
  connector_signals?: Array<
    Partial<DataFabricConnectorSignal> & {
      first_jobs?: string[]
      next_automation?: string
    }
  >
  source_events?: Array<
    Partial<DataFabricSourceEvent> & {
      signal_at?: string | null
    }
  >
  learning_database?: Partial<DataFabricLearningDatabase> & {
    canonical_record_count?: number
    graph_node_count?: number
    graph_edge_count?: number
    lineage_event_count?: number
    feature_set_count?: number
    trust_score?: number
    last_learned_at?: string | null
    qualitative_methods?: string[]
    quantitative_methods?: string[]
    next_automation?: string
  }
  knowledge_graph_domains?: Array<
    Partial<DataFabricKnowledgeGraphDomain> & {
      node_count?: number
      edge_count?: number
      last_signal_at?: string | null
      entity_types?: string[]
      relation_types?: string[]
    }
  >
  change_lineage?: Array<
    Partial<DataFabricChangeLineageEvent> & {
      asset_name?: string
      change_type?: string
      changed_at?: string | null
      changed_by?: string
      next_step?: string
    }
  >
  manager_programs?: Array<
    Partial<DataFabricManagerProgram> & {
      ai_teams?: string[]
      next_handoff?: string
    }
  >
  agent_handoffs?: Array<
    Partial<DataFabricAgentHandoff> & {
      from_team?: string
      to_team?: string
      signal_at?: string | null
    }
  >
  pipeline_stages?: YangonTyreDataPipelineStage[]
  topic_pipelines?: YangonTyreTopicPipeline[]
  feature_marts?: YangonTyreFeatureMart[]
  role_stories?: YangonTyreRoleStory[]
  copilots?: YangonTyreDataCopilot[]
  writeback_lanes?: YangonTyreWritebackLane[]
  big_picture?: {
    thesis?: string
    current_truth?: string[]
    next_builds?: string[]
  }
}

const seedSummary: DataFabricLiveSummary = {
  leadCount: 0,
  receivingCount: 0,
  receivingHoldCount: 0,
  qualityIncidentCount: 0,
  supplierRiskCount: 0,
  maintenanceCount: 0,
  metricCount: 0,
  pendingApprovalCount: 0,
  openTaskCount: 0,
}

const SOURCE_ROUTE_MAP: Record<string, string> = {
  'drive-ops-manual': '/app/knowledge',
  'drive-tyre-analysis': '/app/insights',
  'drive-plant-a': '/app/operations',
  'drive-ceo-data': '/app/director',
  'email-financials': '/app/approvals',
  'future-source-register': '/app/connectors',
}

const CONNECTOR_ROUTE_MAP: Record<string, string> = {
  'gmail-intake': '/app/revenue',
  'drive-spine': '/app/connectors',
  'website-catalog': '/app/revenue',
  'google-analytics': '/app/insights',
  'facebook-commerce': '/app/revenue',
  'chat-mesh': '/app/adoption-command',
  'shopfloor-forms': '/app/adoption-command',
}

function normalizeTextList(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return []
  }
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function normalizeSourceRegistryStatus(value: string | undefined): YangonTyreDataPipelineStage['status'] {
  return value === 'live' || value === 'mapped' || value === 'next' ? value : 'mapped'
}

function normalizeHealthStatus(value: string | undefined): DataFabricHealthStatus {
  return value === 'Healthy' || value === 'Warning' || value === 'Degraded' || value === 'Needs wiring' ? value : 'Needs wiring'
}

function normalizeSourceRegistryItem(
  item: NonNullable<DataFabricPayload['source_registry']>[number],
  fallbackItem: DataFabricSourceRegistryItem,
): DataFabricSourceRegistryItem {
  const consumers = normalizeTextList(item.consumers)
  return {
    id: item.id ?? fallbackItem.id,
    name: item.name ?? fallbackItem.name,
    sourceType: item.sourceType ?? item.source_type ?? fallbackItem.sourceType,
    status: normalizeSourceRegistryStatus(typeof item.status === 'string' ? item.status : fallbackItem.status),
    coverage: item.coverage ?? fallbackItem.coverage,
    route: item.route ?? fallbackItem.route,
    evidenceCount: item.evidenceCount ?? item.evidence_count ?? fallbackItem.evidenceCount,
    lastSignalAt: item.lastSignalAt ?? item.last_signal_at ?? fallbackItem.lastSignalAt,
    consumers: consumers.length ? consumers : fallbackItem.consumers,
    nextAutomation: item.nextAutomation ?? item.next_automation ?? fallbackItem.nextAutomation,
  }
}

function normalizeConnectorSignalItem(
  item: NonNullable<DataFabricPayload['connector_signals']>[number],
  fallbackItem: DataFabricConnectorSignal,
): DataFabricConnectorSignal {
  const surfaces = normalizeTextList(item.surfaces)
  const firstJobs = normalizeTextList(item.firstJobs ?? item.first_jobs)
  const risks = normalizeTextList(item.risks)
  return {
    id: item.id ?? fallbackItem.id,
    name: item.name ?? fallbackItem.name,
    system: item.system ?? fallbackItem.system,
    status: normalizeHealthStatus(typeof item.status === 'string' ? item.status : fallbackItem.status),
    freshness: item.freshness ?? fallbackItem.freshness,
    backlog: item.backlog ?? fallbackItem.backlog,
    route: item.route ?? fallbackItem.route,
    surfaces: surfaces.length ? surfaces : fallbackItem.surfaces,
    firstJobs: firstJobs.length ? firstJobs : fallbackItem.firstJobs,
    nextAutomation: item.nextAutomation ?? item.next_automation ?? fallbackItem.nextAutomation,
    risks: risks.length ? risks : fallbackItem.risks,
  }
}

function normalizeSourceEventItem(
  item: NonNullable<DataFabricPayload['source_events']>[number],
  fallbackItem: DataFabricSourceEvent,
): DataFabricSourceEvent {
  return {
    id: item.id ?? fallbackItem.id,
    source: item.source ?? fallbackItem.source,
    kind: item.kind ?? fallbackItem.kind,
    title: item.title ?? fallbackItem.title,
    detail: item.detail ?? fallbackItem.detail,
    route: item.route ?? fallbackItem.route,
    signalAt: item.signalAt ?? item.signal_at ?? fallbackItem.signalAt,
    owner: item.owner ?? fallbackItem.owner,
  }
}

function normalizeHandoffStatus(value: string | undefined): DataFabricHandoffStatus {
  return value === 'Active' || value === 'Queued' || value === 'Needs review' ? value : 'Queued'
}

function normalizeLearningDatabase(
  item: DataFabricPayload['learning_database'],
  fallbackItem: DataFabricLearningDatabase,
): DataFabricLearningDatabase {
  const qualitativeMethods = normalizeTextList(item?.qualitativeMethods ?? item?.qualitative_methods)
  const quantitativeMethods = normalizeTextList(item?.quantitativeMethods ?? item?.quantitative_methods)
  return {
    status: normalizeHealthStatus(typeof item?.status === 'string' ? item.status : fallbackItem.status),
    canonicalRecordCount: item?.canonicalRecordCount ?? item?.canonical_record_count ?? fallbackItem.canonicalRecordCount,
    graphNodeCount: item?.graphNodeCount ?? item?.graph_node_count ?? fallbackItem.graphNodeCount,
    graphEdgeCount: item?.graphEdgeCount ?? item?.graph_edge_count ?? fallbackItem.graphEdgeCount,
    lineageEventCount: item?.lineageEventCount ?? item?.lineage_event_count ?? fallbackItem.lineageEventCount,
    featureSetCount: item?.featureSetCount ?? item?.feature_set_count ?? fallbackItem.featureSetCount,
    trustScore: item?.trustScore ?? item?.trust_score ?? fallbackItem.trustScore,
    lastLearnedAt: item?.lastLearnedAt ?? item?.last_learned_at ?? fallbackItem.lastLearnedAt,
    qualitativeMethods: qualitativeMethods.length ? qualitativeMethods : fallbackItem.qualitativeMethods,
    quantitativeMethods: quantitativeMethods.length ? quantitativeMethods : fallbackItem.quantitativeMethods,
    nextAutomation: item?.nextAutomation ?? item?.next_automation ?? fallbackItem.nextAutomation,
  }
}

function normalizeKnowledgeGraphDomain(
  item: NonNullable<DataFabricPayload['knowledge_graph_domains']>[number],
  fallbackItem: DataFabricKnowledgeGraphDomain,
): DataFabricKnowledgeGraphDomain {
  const entityTypes = normalizeTextList(item.entityTypes ?? item.entity_types)
  const relationTypes = normalizeTextList(item.relationTypes ?? item.relation_types)
  const questions = normalizeTextList(item.questions)
  return {
    id: item.id ?? fallbackItem.id,
    name: item.name ?? fallbackItem.name,
    status: normalizeSourceRegistryStatus(typeof item.status === 'string' ? item.status : fallbackItem.status),
    nodeCount: item.nodeCount ?? item.node_count ?? fallbackItem.nodeCount,
    edgeCount: item.edgeCount ?? item.edge_count ?? fallbackItem.edgeCount,
    owner: item.owner ?? fallbackItem.owner,
    route: item.route ?? fallbackItem.route,
    lastSignalAt: item.lastSignalAt ?? item.last_signal_at ?? fallbackItem.lastSignalAt,
    entityTypes: entityTypes.length ? entityTypes : fallbackItem.entityTypes,
    relationTypes: relationTypes.length ? relationTypes : fallbackItem.relationTypes,
    questions: questions.length ? questions : fallbackItem.questions,
  }
}

function normalizeChangeLineageItem(
  item: NonNullable<DataFabricPayload['change_lineage']>[number],
  fallbackItem: DataFabricChangeLineageEvent,
): DataFabricChangeLineageEvent {
  return {
    id: item.id ?? fallbackItem.id,
    source: item.source ?? fallbackItem.source,
    assetName: item.assetName ?? item.asset_name ?? fallbackItem.assetName,
    changeType: item.changeType ?? item.change_type ?? fallbackItem.changeType,
    changedAt: item.changedAt ?? item.changed_at ?? fallbackItem.changedAt,
    changedBy: item.changedBy ?? item.changed_by ?? fallbackItem.changedBy,
    route: item.route ?? fallbackItem.route,
    impact: item.impact ?? fallbackItem.impact,
    nextStep: item.nextStep ?? item.next_step ?? fallbackItem.nextStep,
  }
}

function normalizeManagerProgram(
  item: NonNullable<DataFabricPayload['manager_programs']>[number],
  fallbackItem: DataFabricManagerProgram,
): DataFabricManagerProgram {
  const watches = normalizeTextList(item.watches)
  const metrics = normalizeTextList(item.metrics)
  const methods = normalizeTextList(item.methods)
  const aiTeams = normalizeTextList(item.aiTeams ?? item.ai_teams)
  return {
    id: item.id ?? fallbackItem.id,
    role: item.role ?? fallbackItem.role,
    name: item.name ?? fallbackItem.name,
    route: item.route ?? fallbackItem.route,
    mission: item.mission ?? fallbackItem.mission,
    watches: watches.length ? watches : fallbackItem.watches,
    metrics: metrics.length ? metrics : fallbackItem.metrics,
    methods: methods.length ? methods : fallbackItem.methods,
    aiTeams: aiTeams.length ? aiTeams : fallbackItem.aiTeams,
    writeback: item.writeback ?? fallbackItem.writeback,
    nextHandoff: item.nextHandoff ?? item.next_handoff ?? fallbackItem.nextHandoff,
  }
}

function normalizeAgentHandoff(
  item: NonNullable<DataFabricPayload['agent_handoffs']>[number],
  fallbackItem: DataFabricAgentHandoff,
): DataFabricAgentHandoff {
  const payload = normalizeTextList(item.payload)
  return {
    id: item.id ?? fallbackItem.id,
    fromTeam: item.fromTeam ?? item.from_team ?? fallbackItem.fromTeam,
    toTeam: item.toTeam ?? item.to_team ?? fallbackItem.toTeam,
    status: normalizeHandoffStatus(typeof item.status === 'string' ? item.status : fallbackItem.status),
    topic: item.topic ?? fallbackItem.topic,
    reason: item.reason ?? fallbackItem.reason,
    route: item.route ?? fallbackItem.route,
    signalAt: item.signalAt ?? item.signal_at ?? fallbackItem.signalAt,
    payload: payload.length ? payload : fallbackItem.payload,
  }
}

function toSeedSourceRegistryItem(pack: (typeof YANGON_TYRE_SOURCE_PACKS)[number]): DataFabricSourceRegistryItem {
  const status = pack.status === 'queued' ? 'next' : pack.status
  return {
    id: pack.id,
    name: pack.name,
    sourceType: pack.sourceType,
    status,
    coverage: pack.note,
    route: SOURCE_ROUTE_MAP[pack.id] ?? '/app/connectors',
    evidenceCount: 0,
    lastSignalAt: null,
    consumers: pack.feedsApps,
    nextAutomation: `Promote ${pack.name.toLowerCase()} into canonical records and desk-ready evidence bundles.`,
  }
}

function toSeedConnectorSignal(item: (typeof YANGON_TYRE_CONNECTOR_EXPANSION)[number]): DataFabricConnectorSignal {
  return {
    id: item.id,
    name: item.name,
    system:
      item.id === 'gmail-intake'
        ? 'Gmail'
        : item.id === 'drive-spine'
          ? 'Google Drive'
          : item.id === 'google-analytics'
            ? 'Analytics'
            : item.id === 'facebook-commerce'
              ? 'Social'
              : item.id === 'chat-mesh'
                ? 'Chat Mesh'
                : item.id === 'shopfloor-forms'
                  ? 'Human Entry'
                  : 'Connector',
    status: item.status === 'live' ? 'Healthy' : item.status === 'mapped' ? 'Warning' : 'Needs wiring',
    freshness: item.status === 'live' ? 'Seeded as a live connector track' : item.status === 'mapped' ? 'Scoped but not yet event-driven' : 'Queued for rollout',
    backlog: item.purpose,
    route: CONNECTOR_ROUTE_MAP[item.id] ?? '/app/connectors',
    surfaces: item.apps,
    firstJobs: item.firstJobs,
    nextAutomation: `Land ${item.firstJobs[0] ?? 'connector event capture'} and promote it into the shared tenant memory.`,
    risks:
      item.status === 'live'
        ? ['Still needs source-event visibility and lineage scoring to prove live freshness.']
        : ['Connector is scoped, but the portal still lacks direct event evidence from this channel.'],
  }
}

function getSeedLearningDatabase(): DataFabricLearningDatabase {
  return {
    ...YANGON_TYRE_DRIVE_LEARNING_SEED,
    qualitativeMethods: [...YANGON_TYRE_DRIVE_LEARNING_SEED.qualitativeMethods],
    quantitativeMethods: [...YANGON_TYRE_DRIVE_LEARNING_SEED.quantitativeMethods],
  }
}

function getSeedKnowledgeGraphDomains(): DataFabricKnowledgeGraphDomain[] {
  return [
    {
      id: 'plant-ops-graph',
      name: 'Plant operations graph',
      status: 'mapped',
      nodeCount: 0,
      edgeCount: 0,
      owner: 'Plant manager',
      route: '/app/operations',
      lastSignalAt: null,
      entityTypes: ['supplier receipt', 'material', 'asset', 'shift blocker', 'manager task'],
      relationTypes: ['receipt -> material', 'asset -> downtime', 'task -> blocker owner'],
      questions: ['Which receipts or assets block the next shift?', 'Which tasks are still open against live plant records?'],
    },
    {
      id: 'quality-genealogy-graph',
      name: 'Quality and genealogy graph',
      status: 'mapped',
      nodeCount: 0,
      edgeCount: 0,
      owner: 'Quality manager',
      route: '/app/dqms',
      lastSignalAt: null,
      entityTypes: ['incident', 'CAPA', 'defect family', 'batch evidence', 'quality KPI'],
      relationTypes: ['incident -> CAPA', 'incident -> defect family', 'KPI -> loss driver'],
      questions: ['Which defects are recurring?', 'Where is quality loss rising faster than containment closes it?'],
    },
    {
      id: 'supplier-recovery-graph',
      name: 'Supplier recovery graph',
      status: 'mapped',
      nodeCount: 0,
      edgeCount: 0,
      owner: 'Procurement lead',
      route: '/app/approvals',
      lastSignalAt: null,
      entityTypes: ['supplier', 'shipment discrepancy', 'approval packet', 'document debt'],
      relationTypes: ['supplier -> discrepancy', 'discrepancy -> approval', 'approval -> release impact'],
      questions: ['Which supplier issues are blocking release or payment?', 'Where is document debt aging without a complete packet?'],
    },
    {
      id: 'commercial-account-graph',
      name: 'Commercial account graph',
      status: 'mapped',
      nodeCount: 0,
      edgeCount: 0,
      owner: 'Sales lead',
      route: '/app/revenue',
      lastSignalAt: null,
      entityTypes: ['account', 'lead event', 'follow-up task', 'quote cue'],
      relationTypes: ['account -> stage', 'account -> next action', 'task -> owner'],
      questions: ['Which accounts changed stage?', 'Which tasks are stale against live commercial movement?'],
    },
    {
      id: 'director-control-graph',
      name: 'Director control graph',
      status: 'mapped',
      nodeCount: 0,
      edgeCount: 0,
      owner: 'Director / tenant admin',
      route: '/app/director',
      lastSignalAt: null,
      entityTypes: ['decision', 'KPI review', 'agent brief', 'priority pack'],
      relationTypes: ['decision -> owner', 'brief -> KPI', 'KPI -> escalation'],
      questions: ['Which decisions need cross-functional follow-through?', 'Which agent outputs are changing management focus?'],
    },
  ]
}

function getSeedManagerPrograms(): DataFabricManagerProgram[] {
  return [
    {
      id: 'plant-manager-program',
      role: 'Plant manager',
      name: 'Plant execution and bottleneck program',
      route: '/app/operations',
      mission: 'Run shift control, receiving friction, downtime, and operator follow-through from the same structured graph.',
      watches: ['receiving holds', 'downtime and repeat blockers', 'open manager tasks'],
      metrics: ['holds and variances', 'downtime minutes', 'repeat blocker rate'],
      methods: ['Pareto on downtime', 'bottleneck drilldown', '5W1H escalation'],
      aiTeams: ['Operations and Reliability Pod', 'Manufacturing Genealogy Pod'],
      writeback: 'Operations desk, receiving control, maintenance desk',
      nextHandoff: 'Escalate unresolved shift friction into quality and executive review.',
    },
    {
      id: 'quality-manager-program',
      role: 'Quality manager',
      name: 'Quality loss and closeout program',
      route: '/app/dqms',
      mission: 'Turn incidents, CAPA, and evidence into a learning loop that cuts recurrence and B+R.',
      watches: ['incident recurrence', 'CAPA age', 'evidence-backed release risk'],
      metrics: ['incident volume', 'CAPA age', 'quality KPI drift'],
      methods: ['Ishikawa', '5 Why', 'defect clustering', 'loss segmentation'],
      aiTeams: ['Quality Watch Pod', 'Data Science Pod'],
      writeback: 'DQMS incidents, CAPA, operations root-cause review',
      nextHandoff: 'Promote persistent defect clusters into data science and director review.',
    },
    {
      id: 'procurement-program',
      role: 'Procurement / finance',
      name: 'Supplier recovery and packet-control program',
      route: '/app/approvals',
      mission: 'Keep discrepancies, GRN evidence, and approvals moving before they block plant release or payment.',
      watches: ['supplier discrepancy age', 'approval queue debt', 'missing document packs'],
      metrics: ['supplier risk count', 'pending approvals', 'document debt age'],
      methods: ['document completeness scoring', 'aging ladder', 'financial-impact ranking'],
      aiTeams: ['Supplier Recovery Pod', 'Intake Router Pod'],
      writeback: 'Approvals queue, receiving control, supplier recovery entry',
      nextHandoff: 'Escalate high-value or slow-moving cases into executive review.',
    },
    {
      id: 'sales-program',
      role: 'Sales lead',
      name: 'Commercial demand and account-memory program',
      route: '/app/revenue',
      mission: 'Use account movement, follow-up, and demand cues to drive the next commercial action instead of ad hoc memory.',
      watches: ['fresh lead movement', 'stale account follow-up', 'dealer demand mix'],
      metrics: ['lead-source score', 'quote velocity', 'account freshness'],
      methods: ['funnel segmentation', 'lead-source scoring', 'quote velocity review'],
      aiTeams: ['Commercial Memory Pod', 'CEO Brief Pod'],
      writeback: 'Revenue desk, lead pipeline, account review',
      nextHandoff: 'Promote demand patterns into the data science and executive briefing loops.',
    },
    {
      id: 'data-admin-program',
      role: 'Tenant admin / data lead',
      name: 'Learning database and governance program',
      route: '/app/platform-admin',
      mission: 'Protect freshness, lineage, trust, and graph quality so every manager and agent works from governed memory.',
      watches: ['connector freshness', 'lineage event coverage', 'feature trust score', 'writeback completeness'],
      metrics: ['graph node count', 'lineage event count', 'trust score'],
      methods: ['lineage scoring', 'null-pattern audit', 'freshness controls', 'qual-plus-quant review'],
      aiTeams: ['Intake Router Pod', 'Data Science Pod', 'CEO Brief Pod'],
      writeback: 'Data fabric, connector control, platform admin',
      nextHandoff: 'Route low-trust zones into connector repair and manager training cycles.',
    },
  ]
}

function getSeedAgentHandoffs(): DataFabricAgentHandoff[] {
  return [
    {
      id: 'handoff-plant-reliability',
      fromTeam: 'Intake Router Pod',
      toTeam: 'Operations and Reliability Pod',
      status: 'Queued',
      topic: 'Plant friction and shift risk',
      reason: 'Fresh receiving or maintenance changes should trigger a plant-level bottleneck review and owner assignment.',
      route: '/app/operations',
      signalAt: null,
      payload: ['holds or variances', 'maintenance records', 'open manager tasks'],
    },
    {
      id: 'handoff-quality-learning',
      fromTeam: 'Quality Watch Pod',
      toTeam: 'Data Science Pod',
      status: 'Queued',
      topic: 'Defect recurrence and quality-loss learning',
      reason: 'Incidents and CAPA should feed a deeper qual-plus-quant loss study and recurrence ranking.',
      route: '/app/dqms',
      signalAt: null,
      payload: ['incidents', 'CAPA items', 'quality KPI rows'],
    },
    {
      id: 'handoff-supplier-exec',
      fromTeam: 'Supplier Recovery Pod',
      toTeam: 'CEO Brief Pod',
      status: 'Queued',
      topic: 'Supplier and approval escalation',
      reason: 'Open discrepancy, approval, or document debt should become a management-level priority packet.',
      route: '/app/approvals',
      signalAt: null,
      payload: ['supplier risks', 'pending approvals', 'lineage events for packet traceability'],
    },
  ]
}

export function getSeedDataFabricDataset(): DataFabricDataset {
  const aggregate = summarizeYangonTyreDataFabric()
  const sourceRegistry = YANGON_TYRE_DRIVE_SOURCE_REGISTRY_SEED.length
    ? YANGON_TYRE_DRIVE_SOURCE_REGISTRY_SEED.map((item) => ({ ...item, consumers: [...item.consumers] }))
    : YANGON_TYRE_SOURCE_PACKS.map(toSeedSourceRegistryItem)
  const connectorSignals = YANGON_TYRE_DRIVE_CONNECTOR_SIGNAL_SEED.length
    ? YANGON_TYRE_DRIVE_CONNECTOR_SIGNAL_SEED.map((item) => ({
        ...item,
        surfaces: [...item.surfaces],
        firstJobs: [...item.firstJobs],
        risks: [...item.risks],
      }))
    : YANGON_TYRE_CONNECTOR_EXPANSION.map(toSeedConnectorSignal)
  const learningDatabase = getSeedLearningDatabase()
  const knowledgeGraphDomains = getSeedKnowledgeGraphDomains()
  const managerPrograms = getSeedManagerPrograms()
  const agentHandoffs = getSeedAgentHandoffs()
  return {
    source: 'seed',
    updatedAt: YANGON_TYRE_DRIVE_DATASET_UPDATED_AT,
    summary: seedSummary,
    sourceRegistry,
    connectorSignals,
    sourceEvents: YANGON_TYRE_DRIVE_SOURCE_EVENT_SEED.map((item) => ({ ...item })),
    learningDatabase,
    knowledgeGraphDomains,
    changeLineage: YANGON_TYRE_DRIVE_CHANGE_LINEAGE_SEED.map((item) => ({ ...item })),
    managerPrograms,
    agentHandoffs,
    pipelineStages: YANGON_TYRE_DATA_PIPELINE_STAGES,
    topicPipelines: YANGON_TYRE_TOPIC_PIPELINES,
    featureMarts: YANGON_TYRE_FEATURE_MARTS,
    roleStories: YANGON_TYRE_ROLE_STORIES,
    copilots: buildYangonTyreDataCopilots(),
    writebackLanes: buildYangonTyreWritebackLanes(),
    bigPicture: {
      thesis: YANGON_TYRE_DRIVE_BIG_PICTURE.thesis || YANGON_TYRE_DATA_FABRIC_DIALECTIC.synthesis,
      currentTruth: YANGON_TYRE_DRIVE_BIG_PICTURE.currentTruth.length
        ? [...YANGON_TYRE_DRIVE_BIG_PICTURE.currentTruth]
        : [
            `${aggregate.sourcePackCount} source packs are mapped into the Yangon Tyre evidence spine.`,
            `${sourceRegistry.length} source registry entries define which data packs feed which desks.`,
            `${connectorSignals.length} connector signals define how Drive, Gmail, analytics, social, chat, and shopfloor inputs should mature.`,
            `${aggregate.topicPipelineCount} topic pipelines define how Google Drive, Gmail, ERP, and team writeback become reusable records.`,
            `${aggregate.featureMartCount} feature marts are specified for operations, quality, supplier recovery, commercial demand, and executive review.`,
          ],
      nextBuilds: YANGON_TYRE_DRIVE_BIG_PICTURE.nextBuilds.length
        ? [...YANGON_TYRE_DRIVE_BIG_PICTURE.nextBuilds]
        : [
            'Land delta-accurate source-event persistence and revision tracking behind the Data Fabric API.',
            'Promote feature freshness and lineage into manager-visible trust signals.',
            'Connect more topic pipelines to autonomous writeback, connector evidence, and bounded role storytelling.',
          ],
    },
  }
}

export function normalizeDataFabricDataset(payload?: DataFabricPayload | null, source: DataFabricSource = 'live'): DataFabricDataset {
  const fallback = getSeedDataFabricDataset()
  const sourceRegistry =
    payload?.source_registry?.length && fallback.sourceRegistry.length
      ? payload.source_registry.map((item, index) => normalizeSourceRegistryItem(item, fallback.sourceRegistry[index] ?? fallback.sourceRegistry[0]))
      : fallback.sourceRegistry
  const connectorSignals =
    payload?.connector_signals?.length && fallback.connectorSignals.length
      ? payload.connector_signals.map((item, index) => normalizeConnectorSignalItem(item, fallback.connectorSignals[index] ?? fallback.connectorSignals[0]))
      : fallback.connectorSignals
  const sourceEvents =
    payload?.source_events?.length
      ? payload.source_events.map((item, index) =>
          normalizeSourceEventItem(item, fallback.sourceEvents[index] ?? fallback.sourceEvents[0] ?? {
            id: `seed-event-${index}`,
            source: 'Source',
            kind: 'event',
            title: 'Source event',
            detail: '',
            route: '/app/connectors',
            signalAt: null,
            owner: 'System',
          }),
        )
      : fallback.sourceEvents
  const learningDatabase = normalizeLearningDatabase(payload?.learning_database, fallback.learningDatabase)
  const knowledgeGraphDomains =
    payload?.knowledge_graph_domains?.length
      ? payload.knowledge_graph_domains.map((item, index) =>
          normalizeKnowledgeGraphDomain(item, fallback.knowledgeGraphDomains[index] ?? fallback.knowledgeGraphDomains[0]),
        )
      : fallback.knowledgeGraphDomains
  const changeLineage =
    payload?.change_lineage?.length
      ? payload.change_lineage.map((item, index) =>
          normalizeChangeLineageItem(item, fallback.changeLineage[index] ?? {
            id: `lineage-${index}`,
            source: 'Connector runtime',
            assetName: 'Runtime change',
            changeType: 'event',
            changedAt: null,
            changedBy: 'System',
            route: '/app/connectors',
            impact: '',
            nextStep: 'Promote the change into the governed data fabric and next desk review.',
          }),
        )
      : fallback.changeLineage
  const managerPrograms =
    payload?.manager_programs?.length
      ? payload.manager_programs.map((item, index) =>
          normalizeManagerProgram(item, fallback.managerPrograms[index] ?? fallback.managerPrograms[0]),
        )
      : fallback.managerPrograms
  const agentHandoffs =
    payload?.agent_handoffs?.length
      ? payload.agent_handoffs.map((item, index) =>
          normalizeAgentHandoff(item, fallback.agentHandoffs[index] ?? fallback.agentHandoffs[0]),
        )
      : fallback.agentHandoffs

  return {
    source,
    updatedAt: payload?.updated_at ?? null,
    summary: {
      leadCount: payload?.summary?.lead_count ?? fallback.summary.leadCount,
      receivingCount: payload?.summary?.receiving_count ?? fallback.summary.receivingCount,
      receivingHoldCount: payload?.summary?.receiving_hold_count ?? fallback.summary.receivingHoldCount,
      qualityIncidentCount: payload?.summary?.quality_incident_count ?? fallback.summary.qualityIncidentCount,
      supplierRiskCount: payload?.summary?.supplier_risk_count ?? fallback.summary.supplierRiskCount,
      maintenanceCount: payload?.summary?.maintenance_count ?? fallback.summary.maintenanceCount,
      metricCount: payload?.summary?.metric_count ?? fallback.summary.metricCount,
      pendingApprovalCount: payload?.summary?.pending_approval_count ?? fallback.summary.pendingApprovalCount,
      openTaskCount: payload?.summary?.open_task_count ?? fallback.summary.openTaskCount,
    },
    sourceRegistry,
    connectorSignals,
    sourceEvents,
    learningDatabase,
    knowledgeGraphDomains,
    changeLineage,
    managerPrograms,
    agentHandoffs,
    pipelineStages: payload?.pipeline_stages ?? fallback.pipelineStages,
    topicPipelines: payload?.topic_pipelines ?? fallback.topicPipelines,
    featureMarts: payload?.feature_marts ?? fallback.featureMarts,
    roleStories: payload?.role_stories ?? fallback.roleStories,
    copilots: payload?.copilots ?? fallback.copilots,
    writebackLanes: payload?.writeback_lanes ?? fallback.writebackLanes,
    bigPicture: {
      thesis: payload?.big_picture?.thesis ?? fallback.bigPicture.thesis,
      currentTruth: payload?.big_picture?.current_truth ?? fallback.bigPicture.currentTruth,
      nextBuilds: payload?.big_picture?.next_builds ?? fallback.bigPicture.nextBuilds,
    },
  }
}

export async function loadDataFabricDataset(): Promise<DataFabricDataset> {
  const fallback = getSeedDataFabricDataset()
  const health = await checkWorkspaceHealth()

  if (!health.ready) {
    return fallback
  }

  try {
    const payload = await workspaceFetch<DataFabricPayload>('/api/data-fabric')
    return normalizeDataFabricDataset(payload, 'live')
  } catch {
    return fallback
  }
}
