import { checkWorkspaceHealth, workspaceFetch } from './workspaceApi'
import { YANGON_TYRE_PLANT_A_DEPARTMENTS } from './yangonTyrePlantATransition'

export type PlantAWarehouseDepartment = {
  id: string
  title: string
  department: string
  folderUrl: string
  firstDeskRoute: string
  observedBehavior: string
  sourceItemCount: number
  shortcutCount: number
  liveItemCount: number
  canonicalRecordCount: number
}

export type PlantAWarehouseBreakdownItem = {
  count: number
  recordType?: string
  sourceBehavior?: string
}

export type PlantAWarehouseSync = {
  runId: string
  syncedAt: string
  mode: string
  connectorStatus: string
  itemCount: number
  canonicalCount: number
}

export type PlantAKnowledgeRuntimeSummary = {
  graphNodeCount: number
  graphEdgeCount: number
  communityCount: number
  retrievalPackCount: number
  agentLoopCount: number
  lastBuiltAt: string | null
  trustZone: string
}

export type PlantAKnowledgeSetupStep = {
  id: string
  title: string
  detail: string
  route: string
  ctaLabel: string
}

export type PlantAKnowledgeGraphCommunity = {
  id: string
  name: string
  nodeCount: number
  edgeCount: number
  retrievalFocus: string
  route: string
  questions: string[]
}

export type PlantARagCollection = {
  id: string
  name: string
  chunkCount: number
  freshness: string
  retrievalStrategy: string
  bestFor: string[]
  usedBy: string[]
}

export type PlantAAgentLoop = {
  id: string
  name: string
  status: string
  trigger: string
  nextAction: string
  route: string
  usedTools: string[]
  memoryWrites: string[]
}

export type PlantAMobileSurface = {
  id: string
  title: string
  whenToUse: string
  primaryAction: string
  route: string
}

export type PlantAKnowledgeRuntime = {
  status: string
  summary: PlantAKnowledgeRuntimeSummary
  setupSteps: PlantAKnowledgeSetupStep[]
  graphCommunities: PlantAKnowledgeGraphCommunity[]
  ragCollections: PlantARagCollection[]
  agentLoops: PlantAAgentLoop[]
  mobileSurfaces: PlantAMobileSurface[]
  queryStarters: string[]
  designPrinciples: string[]
  nextAutomation: string
  inputCount: number
}

export type PlantAKnowledgeEvidenceRow = {
  recordId: string
  title: string
  department: string
  laneTitle: string
  recordType: string
  sourceBehavior: string
  riskLevel: string
  owningDeskRoute: string
  sourceMode: string
  webViewLink: string
  modifiedTime: string
}

export type PlantAKnowledgeRouteHint = {
  name: string
  route: string
  retrievalFocus?: string
  status?: string
  nextAction?: string
}

export type PlantAKnowledgeQueryResult = {
  status: string
  query: string
  mode: string
  answer: string
  focusArea: string
  matchedRecordCount: number
  retrievalStrategy: string
  graphCommunities: PlantAKnowledgeRouteHint[]
  agentLoops: PlantAKnowledgeRouteHint[]
  nextMoves: string[]
  evidence: PlantAKnowledgeEvidenceRow[]
}

export type PlantAWarehouseDataset = {
  status: string
  lastSyncedAt: string | null
  mode: string
  connectorStatus: string
  connectorMessage: string
  sourceLaneCount: number
  sourceItemCount: number
  shortcutCount: number
  liveItemCount: number
  canonicalRecordCount: number
  departments: PlantAWarehouseDepartment[]
  topRecordTypes: PlantAWarehouseBreakdownItem[]
  topBehaviors: PlantAWarehouseBreakdownItem[]
  recentSyncs: PlantAWarehouseSync[]
  nextActions: string[]
  knowledgeRuntime: PlantAKnowledgeRuntime
}

type PlantAWarehousePayload = {
  status?: string
  last_synced_at?: string | null
  mode?: string
  connector_status?: string
  connector_message?: string
  source_lane_count?: number
  source_item_count?: number
  shortcut_count?: number
  live_item_count?: number
  canonical_record_count?: number
  departments?: Array<{
    id?: string
    title?: string
    department?: string
    folder_url?: string
    first_desk_route?: string
    observed_behavior?: string
    source_item_count?: number
    shortcut_count?: number
    live_item_count?: number
    canonical_record_count?: number
  }>
  top_record_types?: Array<{
    record_type?: string
    count?: number
  }>
  top_behaviors?: Array<{
    source_behavior?: string
    count?: number
  }>
  recent_syncs?: Array<{
    run_id?: string
    synced_at?: string
    mode?: string
    connector_status?: string
    item_count?: number
    canonical_count?: number
  }>
  next_actions?: string[]
  knowledge_runtime?: {
    status?: string
    summary?: {
      graph_node_count?: number
      graph_edge_count?: number
      community_count?: number
      retrieval_pack_count?: number
      agent_loop_count?: number
      last_built_at?: string | null
      trust_zone?: string
    }
    setup_steps?: Array<{
      id?: string
      title?: string
      detail?: string
      route?: string
      cta_label?: string
    }>
    graph_communities?: Array<{
      id?: string
      name?: string
      node_count?: number
      edge_count?: number
      retrieval_focus?: string
      route?: string
      questions?: string[]
    }>
    rag_collections?: Array<{
      id?: string
      name?: string
      chunk_count?: number
      freshness?: string
      retrieval_strategy?: string
      best_for?: string[]
      used_by?: string[]
    }>
    agent_loops?: Array<{
      id?: string
      name?: string
      status?: string
      trigger?: string
      next_action?: string
      route?: string
      used_tools?: string[]
      memory_writes?: string[]
    }>
    mobile_surfaces?: Array<{
      id?: string
      title?: string
      when_to_use?: string
      primary_action?: string
      route?: string
    }>
    query_starters?: string[]
    design_principles?: string[]
    next_automation?: string
    input_count?: number
  }
}

type PlantAKnowledgeQueryPayload = {
  status?: string
  query?: string
  mode?: string
  answer?: string
  focus_area?: string
  matched_record_count?: number
  retrieval_strategy?: string
  graph_communities?: Array<{
    name?: string
    route?: string
    retrieval_focus?: string
  }>
  agent_loops?: Array<{
    name?: string
    status?: string
    route?: string
    next_action?: string
  }>
  next_moves?: string[]
  evidence?: Array<{
    record_id?: string
    title?: string
    department?: string
    lane_title?: string
    record_type?: string
    source_behavior?: string
    risk_level?: string
    owning_desk_route?: string
    source_mode?: string
    web_view_link?: string
    modified_time?: string
  }>
}

function getSeedKnowledgeRuntime(): PlantAKnowledgeRuntime {
  const canonicalRecordCount = YANGON_TYRE_PLANT_A_DEPARTMENTS.reduce((sum, item) => sum + item.evidenceExamples.length, 0)
  return {
    status: 'ready',
    summary: {
      graphNodeCount: canonicalRecordCount + YANGON_TYRE_PLANT_A_DEPARTMENTS.length + 8,
      graphEdgeCount: canonicalRecordCount * 4,
      communityCount: 4,
      retrievalPackCount: 4,
      agentLoopCount: 4,
      lastBuiltAt: null,
      trustZone: 'seeded fallback backed',
    },
    setupSteps: [
      {
        id: 'setup-login',
        title: 'Start with one front door per person',
        detail: 'Managers use Plant Manager. Staff use Daily Entry or Action Board. Nobody should need to browse folders first.',
        route: '/app/plant-manager',
        ctaLabel: 'Open Plant Manager',
      },
      {
        id: 'setup-sync',
        title: 'Sync Factory Floor memory',
        detail: 'Keep Drive evidence, canonical records, graph communities, and retrieval packs aligned through the warehouse.',
        route: '/app/plant-a',
        ctaLabel: 'Open Factory Floor',
      },
      {
        id: 'setup-retrieve',
        title: 'Ask by desk, not by folder',
        detail: 'Use operations, DQMS, revenue, or invisible ISO as the retrieval door so the same memory works for people and AI.',
        route: '/app/data-fabric',
        ctaLabel: 'Open Data Fabric',
      },
      {
        id: 'setup-promote',
        title: 'Promote loose files into action',
        detail: 'When evidence comes from chat or screenshots, turn it into structured work through Action Board or Daily Entry.',
        route: '/app/action-board',
        ctaLabel: 'Open Action Board',
      },
    ],
    graphCommunities: [
      {
        id: 'ops-memory',
        name: 'Operations memory',
        nodeCount: 6,
        edgeCount: 24,
        retrievalFocus: 'shift blockers, production logs, OT, tube and flap, and ISO-linked operations evidence',
        route: '/app/operations',
        questions: ['What changed in the last shift?', 'What should the plant manager review next?'],
      },
      {
        id: 'quality-memory',
        name: 'Quality memory',
        nodeCount: 6,
        edgeCount: 24,
        retrievalFocus: 'claims, quality files, recurring defect evidence, and compliance packets',
        route: '/app/dqms',
        questions: ['Which quality cases are recurring?', 'What evidence is attached to the next claim review?'],
      },
      {
        id: 'commercial-memory',
        name: 'Commercial and inventory memory',
        nodeCount: 4,
        edgeCount: 16,
        retrievalFocus: 'Viber drops, inventory evidence, and loose commercial documents',
        route: '/app/revenue',
        questions: ['Which stock evidence still lives in chat drops?', 'What should be promoted into clean commercial memory?'],
      },
      {
        id: 'admin-memory',
        name: 'Admin and competence memory',
        nodeCount: 3,
        edgeCount: 12,
        retrievalFocus: 'desktop mirrors, admin records, and training follow-up',
        route: '/app/action-board',
        questions: ['Which admin records still live only as mirrored folders?', 'What training follow-up should be promoted next?'],
      },
    ],
    ragCollections: [
      {
        id: 'ops-rag',
        name: 'Operations retrieval',
        chunkCount: 6,
        freshness: 'seeded',
        retrievalStrategy: 'hybrid folder lineage plus record-type filtering',
        bestFor: ['shift summary', 'bottleneck review', '5W1H escalation'],
        usedBy: ['plant manager', 'operations copilot'],
      },
      {
        id: 'quality-rag',
        name: 'Quality retrieval',
        chunkCount: 6,
        freshness: 'seeded',
        retrievalStrategy: 'claim-first retrieval with source-behavior ranking',
        bestFor: ['claim triage', 'defect clustering', 'CAPA prep'],
        usedBy: ['quality manager', 'quality-watch agent'],
      },
      {
        id: 'commercial-rag',
        name: 'Commercial and inventory retrieval',
        chunkCount: 4,
        freshness: 'seeded',
        retrievalStrategy: 'chat-drop and workbook promotion with desk-route ranking',
        bestFor: ['inventory follow-up', 'commercial cleanup', 'dealer review'],
        usedBy: ['sales lead', 'revenue copilot'],
      },
      {
        id: 'governance-rag',
        name: 'Governance retrieval',
        chunkCount: 9,
        freshness: 'seeded',
        retrievalStrategy: 'cross-desk retrieval over ISO, admin, and training evidence',
        bestFor: ['management review', 'audit prep', 'training follow-up'],
        usedBy: ['director', 'tenant admin', 'invisible-ISO copilot'],
      },
    ],
    agentLoops: [
      {
        id: 'ops-brief-loop',
        name: 'Operations brief loop',
        status: 'mapped',
        trigger: 'new production or shift evidence lands in Planning',
        nextAction: 'promote files into shift summary and bottleneck review',
        route: '/app/operations',
        usedTools: ['Drive crawl', 'canonical warehouse', 'manager workspace'],
        memoryWrites: ['shift blocker memory', 'owner routing'],
      },
      {
        id: 'quality-watch-loop',
        name: 'Quality watch loop',
        status: 'mapped',
        trigger: 'claim or quality evidence appears in QC',
        nextAction: 'rank recurrence and prepare DQMS follow-up',
        route: '/app/dqms',
        usedTools: ['claim retrieval', 'graph clustering', 'DQMS desk'],
        memoryWrites: ['defect family memory', 'CAPA prompts'],
      },
      {
        id: 'commercial-cleanup-loop',
        name: 'Commercial cleanup loop',
        status: 'mapped',
        trigger: 'chat-drop or desktop-mirror evidence appears in Tyre Sales and Inventory',
        nextAction: 'promote loose files into clean account or stock records',
        route: '/app/revenue',
        usedTools: ['warehouse classification', 'action board', 'revenue desk'],
        memoryWrites: ['dealer memory', 'stock story'],
      },
      {
        id: 'iso-governance-loop',
        name: 'Invisible ISO loop',
        status: 'mapped',
        trigger: 'new ISO, admin, or training evidence lands in Factory Floor',
        nextAction: 'attach control context without forcing users into paperwork',
        route: '/app/invisible-iso',
        usedTools: ['governance retrieval', 'training prompts', 'action routing'],
        memoryWrites: ['audit trail memory', 'training follow-through'],
      },
    ],
    mobileSurfaces: [
      {
        id: 'mobile-handoff',
        title: 'Shift handoff on phone',
        whenToUse: 'Right after a shift or receiving event',
        primaryAction: 'Use Daily Entry instead of chat fragments only',
        route: '/app/daily-entry',
      },
      {
        id: 'mobile-action',
        title: 'Messy notes into action',
        whenToUse: 'When people send Viber or screenshots',
        primaryAction: 'Paste into Action Board for owner and next step',
        route: '/app/action-board',
      },
      {
        id: 'mobile-manager',
        title: 'Micro and macro review',
        whenToUse: 'When a manager needs the next move fast on mobile',
        primaryAction: 'Use Plant Manager for bottlenecks, counts, and handoffs',
        route: '/app/plant-manager',
      },
    ],
    queryStarters: [
      'What changed in Factory Floor today and which desk owns the next move?',
      'Show recurring quality evidence linked to claim behavior.',
      'Which records still live only as shortcuts or chat drops?',
      'What should the plant manager review before the next shift handoff?',
      'Which ISO or admin records need promotion into clean actions?',
    ],
    designPrinciples: [
      'One obvious front door per task so staff do not need to browse Drive trees.',
      'AI should retrieve by desk, behavior, and evidence type before it retrieves by filename.',
      'Every memory object needs an owner, route, and next action so graph intelligence becomes work.',
      'Mobile input should stay short while the backend promotes it into richer canonical records.',
    ],
    nextAutomation: 'Keep shortcut resolution, chunking, graph updates, and role-brief generation behind the same canonical warehouse so setup stays simple.',
    inputCount: canonicalRecordCount,
  }
}

function buildSeedKnowledgeQueryResult(query: string, warehouse = getSeedPlantAWarehouseDataset()): PlantAKnowledgeQueryResult {
  const normalizedQuery = query.trim() || warehouse.knowledgeRuntime.queryStarters[0]
  const lowerQuery = normalizedQuery.toLowerCase()
  const focusArea = lowerQuery.includes('shortcut') || lowerQuery.includes('chat') || lowerQuery.includes('drop') || lowerQuery.includes('mirror')
    ? 'cleanup'
    : lowerQuery.includes('quality') || lowerQuery.includes('claim') || lowerQuery.includes('defect')
    ? 'quality'
    : lowerQuery.includes('stock') || lowerQuery.includes('inventory') || lowerQuery.includes('sales') || lowerQuery.includes('dealer')
      ? 'commercial'
      : lowerQuery.includes('iso') || lowerQuery.includes('audit') || lowerQuery.includes('training') || lowerQuery.includes('admin')
        ? 'governance'
        : 'operations'

  const route =
    focusArea === 'cleanup'
      ? '/app/action-board'
      : focusArea === 'quality'
      ? '/app/dqms'
      : focusArea === 'commercial'
        ? '/app/revenue'
        : focusArea === 'governance'
          ? '/app/invisible-iso'
          : '/app/operations'
  const graphCommunities = warehouse.knowledgeRuntime.graphCommunities.filter((item) => item.route === route).slice(0, 1)
  const agentLoops = warehouse.knowledgeRuntime.agentLoops.filter((item) => item.route === route).slice(0, 1)
  const matchingDepartment = warehouse.departments.find((item) => item.firstDeskRoute === route) ?? warehouse.departments[0]
  const evidence = (matchingDepartment
    ? [
        {
          recordId: `seed-${matchingDepartment.id}-1`,
          title: `${matchingDepartment.title} evidence lane`,
          department: matchingDepartment.department,
          laneTitle: matchingDepartment.title,
          recordType: focusArea === 'quality' ? 'claim_record' : focusArea === 'commercial' || focusArea === 'cleanup' ? 'chat_drop' : focusArea === 'governance' ? 'iso_bundle' : 'production_record',
          sourceBehavior: focusArea === 'commercial' || focusArea === 'cleanup' ? 'chat_drop' : focusArea === 'governance' ? 'iso_folder' : focusArea === 'quality' ? 'claim_case' : 'production_sheet',
          riskLevel: focusArea === 'commercial' || focusArea === 'quality' || focusArea === 'cleanup' ? 'high' : 'medium',
          owningDeskRoute: route,
          sourceMode: warehouse.mode,
          webViewLink: matchingDepartment.folderUrl,
          modifiedTime: warehouse.lastSyncedAt ?? '',
        },
      ]
    : []) satisfies PlantAKnowledgeEvidenceRow[]

  return {
    status: 'ready',
    query: normalizedQuery,
    mode: warehouse.mode,
    answer:
      focusArea === 'cleanup'
        ? 'Cleanup memory is the strongest seed match. Start in Action Board, promote shortcuts or chat-side evidence into owned work, and keep people out of folder archaeology.'
        : focusArea === 'quality'
        ? 'Quality memory is the strongest seed match. Start in DQMS, review the current claim-like evidence, and use Action Board only if ownership is still unclear.'
        : focusArea === 'commercial'
          ? 'Commercial memory is the strongest seed match. Start in Revenue, convert loose stock or chat evidence into a typed follow-up, and keep the rest out of folder browsing.'
          : focusArea === 'governance'
            ? 'Governance memory is the strongest seed match. Start in Invisible ISO or Action Board so the control step stays simple for users.'
            : 'Operations memory is the strongest seed match. Start in Operations, review the shift or production evidence, and escalate to Plant Manager only if multiple desks are involved.',
    focusArea,
    matchedRecordCount: evidence.length,
    retrievalStrategy: 'Seeded graph-community routing plus canonical fallback evidence.',
    graphCommunities: graphCommunities.map((item) => ({
      name: item.name,
      route: item.route,
      retrievalFocus: item.retrievalFocus,
    })),
    agentLoops: agentLoops.map((item) => ({
      name: item.name,
      route: item.route,
      status: item.status,
      nextAction: item.nextAction,
    })),
    nextMoves: [
      `Open ${graphCommunities[0]?.name ?? 'the owning desk'} first.`,
      'Use Daily Entry or Action Board for short capture so the backend can attach richer context underneath.',
      warehouse.nextActions[0] ?? 'Resolve shortcuts into cleaner canonical memory next.',
    ],
    evidence,
  }
}

export function getSeedPlantAWarehouseDataset(): PlantAWarehouseDataset {
  return {
    status: 'ready',
    lastSyncedAt: null,
    mode: 'fallback',
    connectorStatus: 'fallback',
    connectorMessage: 'Using the known Factory Floor folder behavior until live Drive crawl and service-account sync are available.',
    sourceLaneCount: YANGON_TYRE_PLANT_A_DEPARTMENTS.length,
    sourceItemCount: YANGON_TYRE_PLANT_A_DEPARTMENTS.reduce((sum, item) => sum + item.evidenceExamples.length, 0),
    shortcutCount: YANGON_TYRE_PLANT_A_DEPARTMENTS.reduce((sum, item) => sum + item.evidenceExamples.length, 0),
    liveItemCount: 0,
    canonicalRecordCount: YANGON_TYRE_PLANT_A_DEPARTMENTS.reduce((sum, item) => sum + item.evidenceExamples.length, 0),
    departments: YANGON_TYRE_PLANT_A_DEPARTMENTS.map((item) => ({
      id: item.id,
      title: item.title,
      department: item.title,
      folderUrl: item.folderUrl,
      firstDeskRoute: item.firstDoorRoute,
      observedBehavior: item.observedBehavior,
      sourceItemCount: item.evidenceExamples.length,
      shortcutCount: item.evidenceExamples.length,
      liveItemCount: 0,
      canonicalRecordCount: item.evidenceExamples.length,
    })),
    topRecordTypes: [
      { recordType: 'shortcut_pointer', count: 10 },
      { recordType: 'production_record', count: 4 },
      { recordType: 'claim_record', count: 2 },
      { recordType: 'desktop_mirror', count: 6 },
    ],
    topBehaviors: [
      { sourceBehavior: 'shortcut_hub', count: 12 },
      { sourceBehavior: 'desktop_mirror', count: 6 },
      { sourceBehavior: 'production_sheet', count: 4 },
      { sourceBehavior: 'chat_drop', count: 1 },
    ],
    recentSyncs: [],
    nextActions: [
      'Resolve Drive shortcuts into target-level canonical IDs before building more KPI automation.',
      'Promote production, claim, and chat-drop records into typed marts for operations, DQMS, and revenue.',
      'Add the separate Factory Floor production-office root and finance or PO packets into the same canonical warehouse.',
    ],
    knowledgeRuntime: getSeedKnowledgeRuntime(),
  }
}

function normalizePayload(payload?: PlantAWarehousePayload | null): PlantAWarehouseDataset {
  const fallback = getSeedPlantAWarehouseDataset()
  return {
    status: String(payload?.status ?? fallback.status).trim() || fallback.status,
    lastSyncedAt: payload?.last_synced_at ?? fallback.lastSyncedAt,
    mode: String(payload?.mode ?? fallback.mode).trim() || fallback.mode,
    connectorStatus: String(payload?.connector_status ?? fallback.connectorStatus).trim() || fallback.connectorStatus,
    connectorMessage: String(payload?.connector_message ?? fallback.connectorMessage).trim() || fallback.connectorMessage,
    sourceLaneCount: payload?.source_lane_count ?? fallback.sourceLaneCount,
    sourceItemCount: payload?.source_item_count ?? fallback.sourceItemCount,
    shortcutCount: payload?.shortcut_count ?? fallback.shortcutCount,
    liveItemCount: payload?.live_item_count ?? fallback.liveItemCount,
    canonicalRecordCount: payload?.canonical_record_count ?? fallback.canonicalRecordCount,
    departments:
      payload?.departments?.map((item, index) => ({
        id: item.id ?? fallback.departments[index]?.id ?? `dept-${index}`,
        title: item.title ?? fallback.departments[index]?.title ?? `Department ${index + 1}`,
        department: item.department ?? fallback.departments[index]?.department ?? `Department ${index + 1}`,
        folderUrl: item.folder_url ?? fallback.departments[index]?.folderUrl ?? '',
        firstDeskRoute: item.first_desk_route ?? fallback.departments[index]?.firstDeskRoute ?? '/app/plant-manager',
        observedBehavior: item.observed_behavior ?? fallback.departments[index]?.observedBehavior ?? '',
        sourceItemCount: item.source_item_count ?? fallback.departments[index]?.sourceItemCount ?? 0,
        shortcutCount: item.shortcut_count ?? fallback.departments[index]?.shortcutCount ?? 0,
        liveItemCount: item.live_item_count ?? fallback.departments[index]?.liveItemCount ?? 0,
        canonicalRecordCount: item.canonical_record_count ?? fallback.departments[index]?.canonicalRecordCount ?? 0,
      })) ?? fallback.departments,
    topRecordTypes:
      payload?.top_record_types?.map((item) => ({
        recordType: item.record_type,
        count: item.count ?? 0,
      })) ?? fallback.topRecordTypes,
    topBehaviors:
      payload?.top_behaviors?.map((item) => ({
        sourceBehavior: item.source_behavior,
        count: item.count ?? 0,
      })) ?? fallback.topBehaviors,
    recentSyncs:
      payload?.recent_syncs?.map((item) => ({
        runId: String(item.run_id ?? '').trim(),
        syncedAt: String(item.synced_at ?? '').trim(),
        mode: String(item.mode ?? '').trim(),
        connectorStatus: String(item.connector_status ?? '').trim(),
        itemCount: item.item_count ?? 0,
        canonicalCount: item.canonical_count ?? 0,
      })) ?? fallback.recentSyncs,
    nextActions: payload?.next_actions?.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) ?? fallback.nextActions,
    knowledgeRuntime: {
      status: String(payload?.knowledge_runtime?.status ?? fallback.knowledgeRuntime.status).trim() || fallback.knowledgeRuntime.status,
      summary: {
        graphNodeCount: payload?.knowledge_runtime?.summary?.graph_node_count ?? fallback.knowledgeRuntime.summary.graphNodeCount,
        graphEdgeCount: payload?.knowledge_runtime?.summary?.graph_edge_count ?? fallback.knowledgeRuntime.summary.graphEdgeCount,
        communityCount: payload?.knowledge_runtime?.summary?.community_count ?? fallback.knowledgeRuntime.summary.communityCount,
        retrievalPackCount: payload?.knowledge_runtime?.summary?.retrieval_pack_count ?? fallback.knowledgeRuntime.summary.retrievalPackCount,
        agentLoopCount: payload?.knowledge_runtime?.summary?.agent_loop_count ?? fallback.knowledgeRuntime.summary.agentLoopCount,
        lastBuiltAt: payload?.knowledge_runtime?.summary?.last_built_at ?? fallback.knowledgeRuntime.summary.lastBuiltAt,
        trustZone: String(payload?.knowledge_runtime?.summary?.trust_zone ?? fallback.knowledgeRuntime.summary.trustZone).trim() || fallback.knowledgeRuntime.summary.trustZone,
      },
      setupSteps:
        payload?.knowledge_runtime?.setup_steps?.map((item, index) => ({
          id: item.id ?? fallback.knowledgeRuntime.setupSteps[index]?.id ?? `setup-${index}`,
          title: item.title ?? fallback.knowledgeRuntime.setupSteps[index]?.title ?? `Setup ${index + 1}`,
          detail: item.detail ?? fallback.knowledgeRuntime.setupSteps[index]?.detail ?? '',
          route: item.route ?? fallback.knowledgeRuntime.setupSteps[index]?.route ?? '/app/plant-a',
          ctaLabel: item.cta_label ?? fallback.knowledgeRuntime.setupSteps[index]?.ctaLabel ?? 'Open',
        })) ?? fallback.knowledgeRuntime.setupSteps,
      graphCommunities:
        payload?.knowledge_runtime?.graph_communities?.map((item, index) => ({
          id: item.id ?? fallback.knowledgeRuntime.graphCommunities[index]?.id ?? `community-${index}`,
          name: item.name ?? fallback.knowledgeRuntime.graphCommunities[index]?.name ?? `Community ${index + 1}`,
          nodeCount: item.node_count ?? fallback.knowledgeRuntime.graphCommunities[index]?.nodeCount ?? 0,
          edgeCount: item.edge_count ?? fallback.knowledgeRuntime.graphCommunities[index]?.edgeCount ?? 0,
          retrievalFocus: item.retrieval_focus ?? fallback.knowledgeRuntime.graphCommunities[index]?.retrievalFocus ?? '',
          route: item.route ?? fallback.knowledgeRuntime.graphCommunities[index]?.route ?? '/app/plant-a',
          questions: item.questions?.filter((question): question is string => typeof question === 'string' && question.trim().length > 0) ?? fallback.knowledgeRuntime.graphCommunities[index]?.questions ?? [],
        })) ?? fallback.knowledgeRuntime.graphCommunities,
      ragCollections:
        payload?.knowledge_runtime?.rag_collections?.map((item, index) => ({
          id: item.id ?? fallback.knowledgeRuntime.ragCollections[index]?.id ?? `rag-${index}`,
          name: item.name ?? fallback.knowledgeRuntime.ragCollections[index]?.name ?? `Retrieval ${index + 1}`,
          chunkCount: item.chunk_count ?? fallback.knowledgeRuntime.ragCollections[index]?.chunkCount ?? 0,
          freshness: item.freshness ?? fallback.knowledgeRuntime.ragCollections[index]?.freshness ?? 'seeded',
          retrievalStrategy: item.retrieval_strategy ?? fallback.knowledgeRuntime.ragCollections[index]?.retrievalStrategy ?? '',
          bestFor: item.best_for?.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? fallback.knowledgeRuntime.ragCollections[index]?.bestFor ?? [],
          usedBy: item.used_by?.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? fallback.knowledgeRuntime.ragCollections[index]?.usedBy ?? [],
        })) ?? fallback.knowledgeRuntime.ragCollections,
      agentLoops:
        payload?.knowledge_runtime?.agent_loops?.map((item, index) => ({
          id: item.id ?? fallback.knowledgeRuntime.agentLoops[index]?.id ?? `loop-${index}`,
          name: item.name ?? fallback.knowledgeRuntime.agentLoops[index]?.name ?? `Agent loop ${index + 1}`,
          status: item.status ?? fallback.knowledgeRuntime.agentLoops[index]?.status ?? 'mapped',
          trigger: item.trigger ?? fallback.knowledgeRuntime.agentLoops[index]?.trigger ?? '',
          nextAction: item.next_action ?? fallback.knowledgeRuntime.agentLoops[index]?.nextAction ?? '',
          route: item.route ?? fallback.knowledgeRuntime.agentLoops[index]?.route ?? '/app/plant-a',
          usedTools: item.used_tools?.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? fallback.knowledgeRuntime.agentLoops[index]?.usedTools ?? [],
          memoryWrites: item.memory_writes?.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? fallback.knowledgeRuntime.agentLoops[index]?.memoryWrites ?? [],
        })) ?? fallback.knowledgeRuntime.agentLoops,
      mobileSurfaces:
        payload?.knowledge_runtime?.mobile_surfaces?.map((item, index) => ({
          id: item.id ?? fallback.knowledgeRuntime.mobileSurfaces[index]?.id ?? `mobile-${index}`,
          title: item.title ?? fallback.knowledgeRuntime.mobileSurfaces[index]?.title ?? `Surface ${index + 1}`,
          whenToUse: item.when_to_use ?? fallback.knowledgeRuntime.mobileSurfaces[index]?.whenToUse ?? '',
          primaryAction: item.primary_action ?? fallback.knowledgeRuntime.mobileSurfaces[index]?.primaryAction ?? '',
          route: item.route ?? fallback.knowledgeRuntime.mobileSurfaces[index]?.route ?? '/app/plant-a',
        })) ?? fallback.knowledgeRuntime.mobileSurfaces,
      queryStarters: payload?.knowledge_runtime?.query_starters?.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? fallback.knowledgeRuntime.queryStarters,
      designPrinciples: payload?.knowledge_runtime?.design_principles?.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? fallback.knowledgeRuntime.designPrinciples,
      nextAutomation: String(payload?.knowledge_runtime?.next_automation ?? fallback.knowledgeRuntime.nextAutomation).trim() || fallback.knowledgeRuntime.nextAutomation,
      inputCount: payload?.knowledge_runtime?.input_count ?? fallback.knowledgeRuntime.inputCount,
    },
  }
}

export async function loadPlantAWarehouseDataset(): Promise<PlantAWarehouseDataset> {
  const health = await checkWorkspaceHealth()
  if (!health.ready) {
    return getSeedPlantAWarehouseDataset()
  }

  try {
    const payload = await workspaceFetch<PlantAWarehousePayload>('/api/ytf/plant-a/warehouse')
    return normalizePayload(payload)
  } catch {
    return getSeedPlantAWarehouseDataset()
  }
}

export async function syncPlantAWarehouseDataset(): Promise<PlantAWarehouseDataset> {
  const payload = await workspaceFetch<PlantAWarehousePayload>('/api/ytf/plant-a/warehouse/sync', {
    method: 'POST',
  })
  return normalizePayload(payload)
}

export async function queryPlantAKnowledge(query: string): Promise<PlantAKnowledgeQueryResult> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return buildSeedKnowledgeQueryResult(query)
  }

  const health = await checkWorkspaceHealth()
  if (!health.ready) {
    return buildSeedKnowledgeQueryResult(trimmedQuery)
  }

  try {
    const payload = await workspaceFetch<PlantAKnowledgeQueryPayload>('/api/ytf/plant-a/knowledge/query', {
      method: 'POST',
      body: JSON.stringify({ query: trimmedQuery, limit: 5 }),
    })
    return {
      status: String(payload?.status ?? 'ready').trim() || 'ready',
      query: String(payload?.query ?? trimmedQuery).trim() || trimmedQuery,
      mode: String(payload?.mode ?? 'fallback').trim() || 'fallback',
      answer: String(payload?.answer ?? '').trim(),
      focusArea: String(payload?.focus_area ?? 'operations').trim() || 'operations',
      matchedRecordCount: payload?.matched_record_count ?? 0,
      retrievalStrategy: String(payload?.retrieval_strategy ?? '').trim(),
      graphCommunities:
        payload?.graph_communities?.map((item) => ({
          name: String(item.name ?? '').trim(),
          route: String(item.route ?? '/app/plant-a').trim() || '/app/plant-a',
          retrievalFocus: String(item.retrieval_focus ?? '').trim(),
        })) ?? [],
      agentLoops:
        payload?.agent_loops?.map((item) => ({
          name: String(item.name ?? '').trim(),
          route: String(item.route ?? '/app/plant-a').trim() || '/app/plant-a',
          status: String(item.status ?? '').trim(),
          nextAction: String(item.next_action ?? '').trim(),
        })) ?? [],
      nextMoves: payload?.next_moves?.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? [],
      evidence:
        payload?.evidence?.map((item, index) => ({
          recordId: String(item.record_id ?? `record-${index}`).trim() || `record-${index}`,
          title: String(item.title ?? 'Factory Floor evidence').trim() || 'Factory Floor evidence',
          department: String(item.department ?? 'Factory Floor').trim() || 'Factory Floor',
          laneTitle: String(item.lane_title ?? 'Factory Floor lane').trim() || 'Factory Floor lane',
          recordType: String(item.record_type ?? 'document').trim() || 'document',
          sourceBehavior: String(item.source_behavior ?? 'canonical').trim() || 'canonical',
          riskLevel: String(item.risk_level ?? 'medium').trim() || 'medium',
          owningDeskRoute: String(item.owning_desk_route ?? '/app/plant-a').trim() || '/app/plant-a',
          sourceMode: String(item.source_mode ?? 'fallback').trim() || 'fallback',
          webViewLink: String(item.web_view_link ?? '').trim(),
          modifiedTime: String(item.modified_time ?? '').trim(),
        })) ?? [],
    }
  } catch {
    return buildSeedKnowledgeQueryResult(trimmedQuery)
  }
}
