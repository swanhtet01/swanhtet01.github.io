import { checkWorkspaceHealth, workspaceFetch } from './workspaceApi'

export type YtfRootWarehouseSummary = {
  rootName: string
  rootFolderUrl: string
  laneCount: number
  folderLaneCount: number
  fileLaneCount: number
  sourceItemCount: number
  shortcutCount: number
  liveItemCount: number
  workbookCount: number
  canonicalRecordCount: number
  highRiskCount: number
  recentItemCount: number
  ownerAttentionCount: number
  plantLaneCount: number
  commercialLaneCount: number
  governanceLaneCount: number
  knowledgeLaneCount: number
  cleanupLaneCount: number
}

export type YtfRootLane = {
  id: string
  driveItemId: string
  title: string
  mimeType: string
  driveUrl: string
  domain: string
  firstDeskRoute: string
  observedBehavior: string
  isFolder: boolean
  createdTime?: string | null
  modifiedTime?: string | null
  sourceItemCount: number
  shortcutCount: number
  liveItemCount: number
  workbookCount: number
  canonicalRecordCount: number
  highRiskCount: number
  lastActivityAt: string | null
  status: string
  ownerNote: string
}

export type YtfRootDomainSummary = {
  domain: string
  laneCount: number
  sourceItemCount: number
  liveItemCount: number
  shortcutCount: number
  workbookCount: number
  canonicalRecordCount: number
  highRiskCount: number
  primaryRoute: string
}

export type YtfRootWarehouseSync = {
  runId: string
  syncedAt: string
  mode: string
  connectorStatus: string
  itemCount: number
  canonicalCount: number
}

export type YtfKnowledgeRuntimeSummary = {
  graphNodeCount: number
  graphEdgeCount: number
  chunkCount: number
  entityCount: number
  relationCount: number
  communityCount: number
  retrievalPackCount: number
  agentLoopCount: number
  lastBuiltAt: string | null
  trustZone: string
}

export type YtfKnowledgeSetupStep = {
  id: string
  title: string
  detail: string
  route: string
  ctaLabel: string
}

export type YtfKnowledgeGraphCommunity = {
  id: string
  name: string
  nodeCount: number
  edgeCount: number
  retrievalFocus: string
  route: string
  questions: string[]
}

export type YtfRagCollection = {
  id: string
  name: string
  chunkCount: number
  freshness: string
  retrievalStrategy: string
  bestFor: string[]
  usedBy: string[]
}

export type YtfAgentLoop = {
  id: string
  name: string
  status: string
  trigger: string
  nextAction: string
  route: string
  usedTools: string[]
  memoryWrites: string[]
}

export type YtfMobileSurface = {
  id: string
  title: string
  whenToUse: string
  primaryAction: string
  route: string
}

export type YtfRootChangeWatchItem = {
  id: string
  title: string
  domain: string
  owner: string
  route: string
  priority: string
  sourceMode: string
  signal: string
  metricCandidates: string[]
  nextAction: string
  updatedAt: string
}

export type YtfRootOwnerHandoff = {
  id: string
  domain: string
  from: string
  to: string
  route: string
  cadence: string
  reason: string
  dataNeeded: string
}

export type YtfRootKpiCandidate = {
  id: string
  name: string
  domain: string
  owner: string
  route: string
  stage: string
  formulaHint: string
  sourceSignal: string
}

export type YtfKnowledgeRuntime = {
  status: string
  summary: YtfKnowledgeRuntimeSummary
  setupSteps: YtfKnowledgeSetupStep[]
  graphCommunities: YtfKnowledgeGraphCommunity[]
  ragCollections: YtfRagCollection[]
  agentLoops: YtfAgentLoop[]
  mobileSurfaces: YtfMobileSurface[]
  queryStarters: string[]
  designPrinciples: string[]
  nextAutomation: string
  inputCount: number
}

export type YtfRootWarehouseDataset = {
  status: string
  lastSyncedAt: string | null
  mode: string
  connectorStatus: string
  connectorMessage: string
  summary: YtfRootWarehouseSummary
  lanes: YtfRootLane[]
  recentLanes: YtfRootLane[]
  domainSummary: YtfRootDomainSummary[]
  topRecordTypes: Array<{ recordType: string; count: number }>
  topBehaviors: Array<{ sourceBehavior: string; count: number }>
  changeWatch: YtfRootChangeWatchItem[]
  ownerHandoffs: YtfRootOwnerHandoff[]
  kpiCandidates: YtfRootKpiCandidate[]
  recentSyncs: YtfRootWarehouseSync[]
  nextActions: string[]
  knowledgeRuntime: YtfKnowledgeRuntime
}

export type YtfKnowledgeEvidenceRow = {
  recordId: string
  domain: string
  title: string
  laneTitle: string
  recordType: string
  sourceBehavior: string
  riskLevel: string
  owningDeskRoute: string
  sourceMode: string
  webViewLink: string
  modifiedTime: string
}

export type YtfKnowledgeRouteHint = {
  name: string
  route: string
  retrievalFocus?: string
  status?: string
  nextAction?: string
}

export type YtfRootKnowledgeQueryResult = {
  status: string
  query: string
  mode: string
  answer: string
  focusArea: string
  matchedRecordCount: number
  retrievalStrategy: string
  rag: {
    status: string
    strategy: string
    summary: {
      chunkCount: number
      entityCount: number
      relationCount: number
      retrievalTraceCount: number
    }
    chunks: Array<{
      chunkId: string
      recordId: string
      chunkType: string
      text: string
      route: string
      sourceUrl: string
      modifiedTime: string
      entityIds: string[]
    }>
    semantic: {
      status: string
      strategy: string
      model: string
      chunkCount: number
      matchedChunkCount: number
      nextUpgrade: string
      topChunks: Array<{
        chunkId: string
        recordId: string
        chunkType: string
        route: string
        sourceUrl: string
        score: number
        tokenHits: string[]
        text: string
      }>
    }
    entities: Array<{
      entityId: string
      name: string
      type: string
      sourceField: string
      confidence: number
    }>
    relations: Array<{
      relationId: string
      from: string
      to: string
      type: string
      confidence: number
    }>
  }
  graphCommunities: YtfKnowledgeRouteHint[]
  agentLoops: YtfKnowledgeRouteHint[]
  nextMoves: string[]
  evidence: YtfKnowledgeEvidenceRow[]
}

type RootWarehousePayload = {
  status?: string
  last_synced_at?: string | null
  mode?: string
  connector_status?: string
  connector_message?: string
  summary?: {
    root_name?: string
    root_folder_url?: string
    lane_count?: number
    folder_lane_count?: number
    file_lane_count?: number
    source_item_count?: number
    shortcut_count?: number
    live_item_count?: number
    workbook_count?: number
    canonical_record_count?: number
    high_risk_count?: number
    recent_item_count?: number
    owner_attention_count?: number
    plant_lane_count?: number
    commercial_lane_count?: number
    governance_lane_count?: number
    knowledge_lane_count?: number
    cleanup_lane_count?: number
  }
  lanes?: Array<{
    id?: string
    drive_item_id?: string
    title?: string
    mime_type?: string
    drive_url?: string
    domain?: string
	    first_desk_route?: string
	    observed_behavior?: string
	    is_folder?: number
	    created_time?: string
	    modified_time?: string
	    source_item_count?: number
    shortcut_count?: number
    live_item_count?: number
    workbook_count?: number
    canonical_record_count?: number
    high_risk_count?: number
    last_activity_at?: string
    status?: string
	    owner_note?: string
	  }>
	  recent_lanes?: Array<{
	    id?: string
	    drive_item_id?: string
	    title?: string
	    mime_type?: string
	    drive_url?: string
	    domain?: string
	    first_desk_route?: string
	    observed_behavior?: string
	    is_folder?: number
	    created_time?: string
	    modified_time?: string
	    source_item_count?: number
	    shortcut_count?: number
	    live_item_count?: number
	    workbook_count?: number
	    canonical_record_count?: number
	    high_risk_count?: number
	    last_activity_at?: string
	    status?: string
	    owner_note?: string
	  }>
  domain_summary?: Array<{
    domain?: string
    lane_count?: number
    source_item_count?: number
    live_item_count?: number
    shortcut_count?: number
    workbook_count?: number
    canonical_record_count?: number
    high_risk_count?: number
    primary_route?: string
  }>
  top_record_types?: Array<{ record_type?: string; count?: number }>
  top_behaviors?: Array<{ source_behavior?: string; count?: number }>
  change_watch?: Array<{
    id?: string
    title?: string
    domain?: string
    owner?: string
    route?: string
    priority?: string
    source_mode?: string
    signal?: string
    metric_candidates?: string[]
    next_action?: string
    updated_at?: string
  }>
  owner_handoffs?: Array<{
    id?: string
    domain?: string
    from?: string
    to?: string
    route?: string
    cadence?: string
    reason?: string
    data_needed?: string
  }>
  kpi_candidates?: Array<{
    id?: string
    name?: string
    domain?: string
    owner?: string
    route?: string
    stage?: string
    formula_hint?: string
    source_signal?: string
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
      chunk_count?: number
      entity_count?: number
      relation_count?: number
      community_count?: number
      retrieval_pack_count?: number
      agent_loop_count?: number
      last_built_at?: string | null
      trust_zone?: string
    }
    setup_steps?: Array<{ id?: string; title?: string; detail?: string; route?: string; cta_label?: string }>
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

type RootKnowledgeQueryPayload = {
  status?: string
  query?: string
  mode?: string
  answer?: string
  focus_area?: string
  matched_record_count?: number
  retrieval_strategy?: string
  rag?: {
    status?: string
    strategy?: string
    summary?: {
      chunk_count?: number
      entity_count?: number
      relation_count?: number
      retrieval_trace_count?: number
    }
    chunks?: Array<{
      chunk_id?: string
      record_id?: string
      chunk_type?: string
      text?: string
      route?: string
      source_url?: string
      modified_time?: string
      entity_ids?: string[]
    }>
    semantic?: {
      status?: string
      strategy?: string
      model?: string
      chunk_count?: number
      matched_chunk_count?: number
      next_upgrade?: string
      top_chunks?: Array<{
        chunk_id?: string
        record_id?: string
        chunk_type?: string
        route?: string
        source_url?: string
        score?: number
        token_hits?: string[]
        text?: string
      }>
    }
    entities?: Array<{
      entity_id?: string
      name?: string
      type?: string
      source_field?: string
      confidence?: number
    }>
    relations?: Array<{
      relation_id?: string
      from?: string
      to?: string
      type?: string
      confidence?: number
    }>
  }
  graph_communities?: Array<{ name?: string; route?: string; retrieval_focus?: string }>
  agent_loops?: Array<{ name?: string; status?: string; route?: string; next_action?: string }>
  next_moves?: string[]
  evidence?: Array<{
    record_id?: string
    domain?: string
    title?: string
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

const ROOT_SEED_LANES: YtfRootLane[] = [
  {
    id: 'lane-plant-a',
    driveItemId: 'plant-a',
    title: 'Factory Floor',
    mimeType: 'application/vnd.google-apps.folder',
    driveUrl: 'https://drive.google.com/drive/folders/1lvNk73XNxIdPIagwal7YKEzlCtAkk-yv',
    domain: 'plant',
    firstDeskRoute: '/app/plant-a',
    observedBehavior: 'Primary Factory Floor operating root already used for planning, QC, admin, and sales-and-inventory evidence.',
    isFolder: true,
    sourceItemCount: 4,
    shortcutCount: 0,
    liveItemCount: 4,
    workbookCount: 0,
    canonicalRecordCount: 4,
    highRiskCount: 1,
    lastActivityAt: null,
    status: 'Live',
    ownerNote: 'Factory Floor is already the strongest operating lane and should stay the first plant-side review point.',
  },
  {
    id: 'lane-plant-b',
    driveItemId: 'plant-b',
    title: 'Floor B',
    mimeType: 'application/vnd.google-apps.folder',
    driveUrl: 'https://drive.google.com/drive/folders/1lvNk73XNxIdPIagwal7YKEzlCtAkk-yv',
    domain: 'plant',
    firstDeskRoute: '/app/plant-manager',
    observedBehavior: 'Second plant-side lane that should fold into the same plant-manager and owner pulse.',
    isFolder: true,
    sourceItemCount: 5,
    shortcutCount: 0,
    liveItemCount: 3,
    workbookCount: 1,
    canonicalRecordCount: 5,
    highRiskCount: 1,
    lastActivityAt: null,
    status: 'Needs attention',
    ownerNote: 'Floor B now needs the same typing and KPI treatment as Factory Floor.',
  },
  {
    id: 'lane-ceo',
    driveItemId: 'ceo-data',
    title: 'CEO data',
    mimeType: 'application/vnd.google-apps.folder',
    driveUrl: 'https://drive.google.com/drive/folders/1lvNk73XNxIdPIagwal7YKEzlCtAkk-yv',
    domain: 'governance',
    firstDeskRoute: '/app/director',
    observedBehavior: 'Executive review and owner-side lane.',
    isFolder: true,
    sourceItemCount: 4,
    shortcutCount: 0,
    liveItemCount: 2,
    workbookCount: 1,
    canonicalRecordCount: 4,
    highRiskCount: 1,
    lastActivityAt: null,
    status: 'Live',
    ownerNote: 'CEO data should now feed the owner brief and decision loop directly.',
  },
  {
    id: 'lane-commercial',
    driveItemId: 'retailer-database',
    title: 'Retailer Database',
    mimeType: 'application/vnd.google-apps.spreadsheet',
    driveUrl: 'https://drive.google.com/drive/folders/1lvNk73XNxIdPIagwal7YKEzlCtAkk-yv',
    domain: 'commercial',
    firstDeskRoute: '/app/revenue',
    observedBehavior: 'Commercial workbook lane for dealer and retailer intelligence.',
    isFolder: false,
    sourceItemCount: 1,
    shortcutCount: 0,
    liveItemCount: 1,
    workbookCount: 1,
    canonicalRecordCount: 1,
    highRiskCount: 0,
    lastActivityAt: null,
    status: 'Live',
    ownerNote: 'Retailer data is already workbook-ready for revenue KPIs and owner questions.',
  },
  {
    id: 'lane-catalog',
    driveItemId: 'catalog',
    title: 'E .CATALOG',
    mimeType: 'application/vnd.google-apps.folder',
    driveUrl: 'https://drive.google.com/drive/folders/1lvNk73XNxIdPIagwal7YKEzlCtAkk-yv',
    domain: 'commercial',
    firstDeskRoute: '/app/revenue',
    observedBehavior: 'Commercial library for product and promotion material.',
    isFolder: true,
    sourceItemCount: 3,
    shortcutCount: 0,
    liveItemCount: 2,
    workbookCount: 0,
    canonicalRecordCount: 3,
    highRiskCount: 0,
    lastActivityAt: null,
    status: 'Mapped',
    ownerNote: 'Catalog material should become cleaner commercial assets and supporting sales memory.',
  },
  {
    id: 'lane-sources',
    driveItemId: 'data-sources',
    title: 'data sources',
    mimeType: 'application/vnd.google-apps.document',
    driveUrl: 'https://drive.google.com/drive/folders/1lvNk73XNxIdPIagwal7YKEzlCtAkk-yv',
    domain: 'data',
    firstDeskRoute: '/app/data-fabric',
    observedBehavior: 'Root source-of-truth mapping lane for connectors and marts.',
    isFolder: false,
    sourceItemCount: 1,
    shortcutCount: 0,
    liveItemCount: 1,
    workbookCount: 0,
    canonicalRecordCount: 1,
    highRiskCount: 0,
    lastActivityAt: null,
    status: 'Live',
    ownerNote: 'The data-sources document should anchor the warehouse, marts, and retrieval setup.',
  },
  {
    id: 'lane-pc',
    driveItemId: 'showroom-pc',
    title: 'Showroom PC',
    mimeType: 'application/vnd.google-apps.folder',
    driveUrl: 'https://drive.google.com/drive/folders/1lvNk73XNxIdPIagwal7YKEzlCtAkk-yv',
    domain: 'cleanup',
    firstDeskRoute: '/app/action-board',
    observedBehavior: 'New PC or account-side lane that should be promoted into structured memory instead of left as a mirror.',
    isFolder: true,
    sourceItemCount: 1,
    shortcutCount: 0,
    liveItemCount: 0,
    workbookCount: 0,
    canonicalRecordCount: 1,
    highRiskCount: 1,
    lastActivityAt: null,
    status: 'Needs attention',
    ownerNote: 'Showroom PC is the clearest sign that new account and device imports need a promotion workflow.',
  },
  {
    id: 'lane-literature',
    driveItemId: 'industry-literature',
    title: 'Industry Literature',
    mimeType: 'application/vnd.google-apps.folder',
    driveUrl: 'https://drive.google.com/drive/folders/1lvNk73XNxIdPIagwal7YKEzlCtAkk-yv',
    domain: 'knowledge',
    firstDeskRoute: '/app/insights',
    observedBehavior: 'Reference lane that should be mined into training, benchmarks, and methods.',
    isFolder: true,
    sourceItemCount: 8,
    shortcutCount: 0,
    liveItemCount: 4,
    workbookCount: 0,
    canonicalRecordCount: 8,
    highRiskCount: 0,
    lastActivityAt: null,
    status: 'Mapped',
    ownerNote: 'Industry Literature should become a method and insight library, not just a static file dump.',
  },
]

function buildSeedKnowledgeRuntime(): YtfKnowledgeRuntime {
  const inputCount = ROOT_SEED_LANES.reduce((sum, lane) => sum + lane.canonicalRecordCount, 0)
  return {
    status: 'ready',
    summary: {
      graphNodeCount: inputCount + ROOT_SEED_LANES.length + 12,
      graphEdgeCount: inputCount * 4,
      chunkCount: inputCount * 3,
      entityCount: inputCount * 5,
      relationCount: inputCount * 6,
      communityCount: 5,
      retrievalPackCount: 4,
      agentLoopCount: 4,
      lastBuiltAt: null,
      trustZone: 'seeded fallback backed',
    },
    setupSteps: [
      {
        id: 'sync-root',
        title: 'Sync the whole root first',
        detail: 'Plant, commercial, governance, PC imports, and reference lanes should land in one owner warehouse.',
        route: '/app/director',
        ctaLabel: 'Open owner command',
      },
      {
        id: 'route-by-desk',
        title: 'Route by desk, not folder',
        detail: 'Keep plant, director, revenue, and action-board routes as the front doors instead of teaching the tree.',
        route: '/app/plant-manager',
        ctaLabel: 'Open plant manager',
      },
      {
        id: 'mine-metrics',
        title: 'Mine workbooks into metrics',
        detail: 'Workbooks, docs, and references should feed KPIs, marts, and review packs from the same canonical layer.',
        route: '/app/data-fabric',
        ctaLabel: 'Open data fabric',
      },
    ],
    graphCommunities: [
      {
        id: 'owner-plant-memory',
        name: 'Floor And shopfloor memory',
        nodeCount: 9,
        edgeCount: 36,
        retrievalFocus: 'Factory Floor, Floor B, production packets, and plant-side drift',
        route: '/app/plant-manager',
        questions: ['What changed across both plants?', 'What should become the next plant-manager KPI?'],
      },
      {
        id: 'owner-commercial-memory',
        name: 'Commercial and market memory',
        nodeCount: 4,
        edgeCount: 16,
        retrievalFocus: 'Retailer, promotion, catalog, and inventory-side evidence',
        route: '/app/revenue',
        questions: ['What commercial lanes should become KPIs next?', 'Which retailer and promotion files matter most?'],
      },
      {
        id: 'owner-governance-memory',
        name: 'Governance and executive memory',
        nodeCount: 5,
        edgeCount: 20,
        retrievalFocus: 'CEO data, finance-style workbooks, and review packets',
        route: '/app/director',
        questions: ['What should the owner review first?', 'Which files should become management-review metrics?'],
      },
      {
        id: 'owner-knowledge-memory',
        name: 'Knowledge and method memory',
        nodeCount: 8,
        edgeCount: 32,
        retrievalFocus: 'Industry literature and data-source materials',
        route: '/app/insights',
        questions: ['What should be mined into methods?', 'Which sources can become insight outputs next?'],
      },
    ],
    ragCollections: [
      {
        id: 'owner-root-rag',
        name: 'Owner control retrieval',
        chunkCount: inputCount,
        freshness: 'seeded',
        retrievalStrategy: 'root-lane ranking plus canonical records',
        bestFor: ['owner daily review', 'root cleanup', 'cross-functional retrieval'],
        usedBy: ['owner', 'director', 'tenant admin'],
      },
      {
        id: 'plant-rag',
        name: 'Plant retrieval',
        chunkCount: 9,
        freshness: 'seeded',
        retrievalStrategy: 'plant-first retrieval across roots and files',
        bestFor: ['plant-manager brief', 'cross-plant review', 'plant Q&A'],
        usedBy: ['owner', 'plant manager'],
      },
      {
        id: 'commercial-rag',
        name: 'Commercial retrieval',
        chunkCount: 4,
        freshness: 'seeded',
        retrievalStrategy: 'commercial workbook and catalog retrieval',
        bestFor: ['demand review', 'inventory questions', 'retailer analysis'],
        usedBy: ['owner', 'sales lead'],
      },
      {
        id: 'governance-rag',
        name: 'Governance retrieval',
        chunkCount: 6,
        freshness: 'seeded',
        retrievalStrategy: 'executive and finance packet retrieval',
        bestFor: ['owner brief', 'finance questions', 'ISO and review support'],
        usedBy: ['owner', 'director'],
      },
    ],
    agentLoops: [
      {
        id: 'owner-brief-loop',
        name: 'Owner brief loop',
        status: 'mapped',
        trigger: 'New root-level folders or workbook updates land',
        nextAction: 'Rank changes, route them to desks, and generate the next owner brief',
        route: '/app/director',
        usedTools: ['Drive root crawl', 'canonical warehouse', 'owner metrics'],
        memoryWrites: ['owner pulse', 'review pack memory'],
      },
      {
        id: 'plant-watch-loop',
        name: 'Plant watch loop',
        status: 'mapped',
        trigger: 'Plant-side files, folders, or quality packets change',
        nextAction: 'Turn those into plant-manager signals and follow-up loops',
        route: '/app/plant-manager',
        usedTools: ['plant retrieval', 'metrics mart'],
        memoryWrites: ['plant pulse', 'exception prompts'],
      },
      {
        id: 'cleanup-promotion-loop',
        name: 'Cleanup promotion loop',
        status: 'mapped',
        trigger: 'New PC or account-side folders appear',
        nextAction: 'Convert raw drops into typed records and owned actions',
        route: '/app/action-board',
        usedTools: ['classification', 'action board'],
        memoryWrites: ['cleanup debt queue'],
      },
      {
        id: 'method-mining-loop',
        name: 'Method mining loop',
        status: 'mapped',
        trigger: 'New literature or source docs appear',
        nextAction: 'Promote useful references into insights, training, and methods',
        route: '/app/insights',
        usedTools: ['reference retrieval', 'feature marts'],
        memoryWrites: ['method cards', 'training prompts'],
      },
    ],
    mobileSurfaces: [
      {
        id: 'owner-mobile',
        title: 'Owner pulse on phone',
        whenToUse: 'When you need the root-level change and next move fast',
        primaryAction: 'Open Director and ask what changed',
        route: '/app/director',
      },
      {
        id: 'plant-mobile',
        title: 'Plant review on phone',
        whenToUse: 'When plant-side folders or issues need a fast read',
        primaryAction: 'Open Plant Manager from the same root warehouse',
        route: '/app/plant-manager',
      },
      {
        id: 'cleanup-mobile',
        title: 'Messy uploads into action',
        whenToUse: 'When a new PC or loose folder dump appears',
        primaryAction: 'Use Action Board to promote it into structured work',
        route: '/app/action-board',
      },
    ],
    queryStarters: [
      'What changed across Factory Client today and what should the owner review first?',
      'Which new folders look like raw PC or account imports?',
      'What should become KPIs or marts next from the current root data?',
      'Which lanes carry the most workbook or cleanup debt?',
      'What should Plant Manager review first across Factory Floor and Floor B?',
    ],
    designPrinciples: [
      'One root warehouse should support owner, plant manager, quality, commercial, and AI retrieval without separate truth systems.',
      'New folders from new PCs or accounts should auto-appear as lanes, not disappear into misc storage.',
      'Metrics, retrieval, chat, and action routing should all depend on the same canonical records.',
      'Mobile use should stay short and obvious while the backend attaches ISO, graph, and KPI structure underneath.',
    ],
    nextAutomation: 'Resolve shortcuts, chunk workbooks, and publish owner and plant review packs from the same root warehouse.',
    inputCount,
  }
}

function getSeedRootKnowledgeQueryResult(query: string, dataset = getSeedYtfRootWarehouseDataset()): YtfRootKnowledgeQueryResult {
  const normalizedQuery = query.trim() || dataset.knowledgeRuntime.queryStarters[0]
  const lowerQuery = normalizedQuery.toLowerCase()
  const focusArea = lowerQuery.includes('pc') || lowerQuery.includes('chat') || lowerQuery.includes('shortcut') || lowerQuery.includes('mirror')
    ? 'cleanup'
    : lowerQuery.includes('finance') || lowerQuery.includes('cost') || lowerQuery.includes('pricing')
      ? 'finance'
      : lowerQuery.includes('retailer') || lowerQuery.includes('promotion') || lowerQuery.includes('sales') || lowerQuery.includes('catalog')
        ? 'commercial'
        : lowerQuery.includes('ceo') || lowerQuery.includes('owner') || lowerQuery.includes('iso') || lowerQuery.includes('director')
          ? 'governance'
          : lowerQuery.includes('literature') || lowerQuery.includes('knowledge') || lowerQuery.includes('source')
            ? 'knowledge'
            : 'operations'

  const preferredRoute =
    focusArea === 'cleanup'
      ? '/app/action-board'
      : focusArea === 'finance'
        ? '/app/approvals'
        : focusArea === 'commercial'
          ? '/app/revenue'
          : focusArea === 'governance'
            ? '/app/director'
            : focusArea === 'knowledge'
              ? '/app/insights'
              : '/app/plant-manager'

  const graphCommunities = dataset.knowledgeRuntime.graphCommunities.filter((item) => item.route === preferredRoute).slice(0, 1)
  const agentLoops = dataset.knowledgeRuntime.agentLoops.filter((item) => item.route === preferredRoute).slice(0, 1)
  const lane = dataset.lanes.find((item) => item.firstDeskRoute === preferredRoute) ?? dataset.lanes[0]
  const seedRecordId = `seed-${lane.id}`

  return {
    status: 'ready',
    query: normalizedQuery,
    mode: dataset.mode,
    answer:
      focusArea === 'cleanup'
        ? 'Cleanup memory is the strongest match. The current signal is that new PC or account-side folders need promotion into structured action before they become long-term folder debt.'
        : focusArea === 'finance'
          ? 'Finance memory is the strongest match. The next move is to extract workbook metrics and route the biggest finance and approval questions into typed owner review.'
          : focusArea === 'commercial'
            ? 'Commercial memory is the strongest match. The next move is to promote retailer, promotion, and catalog files into clean commercial metrics and follow-up records.'
            : focusArea === 'governance'
              ? 'Governance memory is the strongest match. The next move is to turn executive, owner, and ISO material into explicit review and follow-through.'
              : focusArea === 'knowledge'
                ? 'Knowledge memory is the strongest match. The next move is to mine source and literature files into methods, training, and insight outputs.'
                : 'Plant memory is the strongest match. The next move is to review cross-plant flow and promote the strongest files into plant-manager metrics and routines.',
    focusArea,
    matchedRecordCount: 1,
    retrievalStrategy: 'seeded root-lane ranking',
    rag: {
      status: 'ready',
      strategy: 'seeded canonical lane -> chunks -> entities -> source route',
      summary: {
        chunkCount: 3,
        entityCount: 3,
        relationCount: 5,
        retrievalTraceCount: 1,
      },
      chunks: [
        {
          chunkId: `chunk-${seedRecordId}-summary`,
          recordId: seedRecordId,
          chunkType: 'summary',
          text: `${lane.title} is routed to ${preferredRoute} and should become operating memory before it stays as folder browsing.`,
          route: preferredRoute,
          sourceUrl: lane.driveUrl,
          modifiedTime: '',
          entityIds: [`ent-${seedRecordId}-lane`, `ent-${seedRecordId}-route`],
        },
      ],
      semantic: {
        status: 'ready',
        strategy: 'seeded local token-vector cosine rerank over deterministic chunks',
        model: 'local-bow-v1',
        chunkCount: 1,
        matchedChunkCount: 1,
        nextUpgrade: 'Attach managed Postgres plus pgvector or an embeddings provider for persistent semantic search.',
        topChunks: [
          {
            chunkId: `chunk-${seedRecordId}-summary`,
            recordId: seedRecordId,
            chunkType: 'summary',
            route: preferredRoute,
            sourceUrl: lane.driveUrl,
            score: 0.42,
            tokenHits: [focusArea],
            text: `${lane.title} is routed to ${preferredRoute} and should become operating memory before it stays as folder browsing.`,
          },
        ],
      },
      entities: [
        { entityId: `ent-${seedRecordId}-lane`, name: lane.title, type: lane.domain || 'business', sourceField: 'source lane', confidence: 0.82 },
        { entityId: `ent-${seedRecordId}-route`, name: preferredRoute.replace('/app/', '').replace('-', ' '), type: 'desk', sourceField: 'owning desk', confidence: 0.78 },
        { entityId: `ent-${seedRecordId}-behavior`, name: lane.observedBehavior, type: 'source behavior', sourceField: 'observed behavior', confidence: 0.68 },
      ],
      relations: [
        { relationId: `rel-${seedRecordId}-lane`, from: seedRecordId, to: `ent-${seedRecordId}-lane`, type: 'mentions', confidence: 0.82 },
        { relationId: `rel-${seedRecordId}-route`, from: seedRecordId, to: preferredRoute, type: 'routes_to', confidence: 0.84 },
      ],
    },
    graphCommunities: graphCommunities.map((item) => ({ name: item.name, route: item.route, retrievalFocus: item.retrievalFocus })),
    agentLoops: agentLoops.map((item) => ({ name: item.name, route: item.route, status: item.status, nextAction: item.nextAction })),
    nextMoves: [
      `Open ${focusArea === 'operations' ? 'Plant Manager' : focusArea === 'cleanup' ? 'Action Board' : focusArea === 'governance' ? 'Director' : focusArea === 'knowledge' ? 'Insights' : focusArea === 'finance' ? 'Approvals' : 'Revenue'} first.`,
      'Use the same canonical warehouse to power the next KPI or insight.',
      'Promote any raw folder debt into structured records instead of leaving it in the tree.',
    ],
    evidence: [
      {
        recordId: seedRecordId,
        domain: lane.domain,
        title: lane.title,
        laneTitle: lane.title,
        recordType: lane.workbookCount ? 'workbook' : 'lane_record',
        sourceBehavior: lane.domain === 'cleanup' ? 'pc_import' : lane.domain === 'knowledge' ? 'reference_stack' : 'direct_file',
        riskLevel: lane.highRiskCount ? 'high' : 'medium',
        owningDeskRoute: lane.firstDeskRoute,
        sourceMode: lane.liveItemCount ? 'live' : 'fallback',
        webViewLink: lane.driveUrl,
        modifiedTime: '',
      },
    ],
  }
}

export function getSeedYtfRootWarehouseDataset(): YtfRootWarehouseDataset {
  const summary: YtfRootWarehouseSummary = {
    rootName: 'Factory Client',
    rootFolderUrl: 'https://drive.google.com/drive/folders/1lvNk73XNxIdPIagwal7YKEzlCtAkk-yv',
    laneCount: ROOT_SEED_LANES.length,
    folderLaneCount: ROOT_SEED_LANES.filter((lane) => lane.isFolder).length,
    fileLaneCount: ROOT_SEED_LANES.filter((lane) => !lane.isFolder).length,
    sourceItemCount: ROOT_SEED_LANES.reduce((sum, lane) => sum + lane.sourceItemCount, 0),
    shortcutCount: ROOT_SEED_LANES.reduce((sum, lane) => sum + lane.shortcutCount, 0),
    liveItemCount: ROOT_SEED_LANES.reduce((sum, lane) => sum + lane.liveItemCount, 0),
    workbookCount: ROOT_SEED_LANES.reduce((sum, lane) => sum + lane.workbookCount, 0),
    canonicalRecordCount: ROOT_SEED_LANES.reduce((sum, lane) => sum + lane.canonicalRecordCount, 0),
    highRiskCount: ROOT_SEED_LANES.reduce((sum, lane) => sum + lane.highRiskCount, 0),
    recentItemCount: 4,
    ownerAttentionCount: ROOT_SEED_LANES.filter((lane) => lane.status === 'Needs attention').length,
    plantLaneCount: ROOT_SEED_LANES.filter((lane) => lane.domain === 'plant').length,
    commercialLaneCount: ROOT_SEED_LANES.filter((lane) => lane.domain === 'commercial').length,
    governanceLaneCount: ROOT_SEED_LANES.filter((lane) => lane.domain === 'governance' || lane.domain === 'finance').length,
    knowledgeLaneCount: ROOT_SEED_LANES.filter((lane) => lane.domain === 'knowledge' || lane.domain === 'data').length,
    cleanupLaneCount: ROOT_SEED_LANES.filter((lane) => lane.domain === 'cleanup' || lane.domain === 'archive').length,
  }

  const domainSummary: YtfRootDomainSummary[] = [
    {
      domain: 'plant',
      laneCount: 2,
      sourceItemCount: 9,
      liveItemCount: 7,
      shortcutCount: 0,
      workbookCount: 1,
      canonicalRecordCount: 9,
      highRiskCount: 2,
      primaryRoute: '/app/plant-manager',
    },
    {
      domain: 'commercial',
      laneCount: 2,
      sourceItemCount: 4,
      liveItemCount: 3,
      shortcutCount: 0,
      workbookCount: 1,
      canonicalRecordCount: 4,
      highRiskCount: 0,
      primaryRoute: '/app/revenue',
    },
    {
      domain: 'governance',
      laneCount: 1,
      sourceItemCount: 4,
      liveItemCount: 2,
      shortcutCount: 0,
      workbookCount: 1,
      canonicalRecordCount: 4,
      highRiskCount: 1,
      primaryRoute: '/app/director',
    },
    {
      domain: 'knowledge',
      laneCount: 2,
      sourceItemCount: 9,
      liveItemCount: 5,
      shortcutCount: 0,
      workbookCount: 0,
      canonicalRecordCount: 9,
      highRiskCount: 0,
      primaryRoute: '/app/insights',
    },
    {
      domain: 'cleanup',
      laneCount: 1,
      sourceItemCount: 1,
      liveItemCount: 0,
      shortcutCount: 0,
      workbookCount: 0,
      canonicalRecordCount: 1,
      highRiskCount: 1,
      primaryRoute: '/app/action-board',
    },
  ]
  const ownerByDomain: Record<string, { owner: string; route: string; cadence: string }> = {
    plant: { owner: 'Plant Manager', route: '/app/plant-manager', cadence: 'daily shift review' },
    commercial: { owner: 'Sales and inventory', route: '/app/revenue', cadence: 'daily showroom and weekly demand review' },
    governance: { owner: 'Owner and admin', route: '/app/director', cadence: 'weekly management review' },
    knowledge: { owner: 'Plant Manager and training owner', route: '/app/insights', cadence: 'weekly method mining' },
    data: { owner: 'Admin data steward', route: '/app/data-fabric', cadence: 'daily connector check' },
    cleanup: { owner: 'Admin data steward', route: '/app/action-board', cadence: 'daily cleanup queue' },
  }
  const kpisByDomain: Record<string, string[]> = {
    plant: ['Shift output by process', 'Downtime minutes by machine', 'Schedule adherence'],
    commercial: ['Dealer follow-up aging', 'Stock movement signal', 'Promotion response'],
    governance: ['Management-review closure', 'Document revision aging', 'Audit follow-through'],
    knowledge: ['Method adoption', 'Benchmark extraction'],
    data: ['Connector freshness', 'Source trust score'],
    cleanup: ['Unclassified import backlog', 'Promotion completion'],
  }
  const changeWatch: YtfRootChangeWatchItem[] = [...ROOT_SEED_LANES]
    .sort((left, right) => {
      const riskDelta = right.highRiskCount - left.highRiskCount
      if (riskDelta !== 0) {
        return riskDelta
      }
      return right.liveItemCount - left.liveItemCount
    })
    .slice(0, 6)
    .map((lane) => {
      const owner = ownerByDomain[lane.domain] ?? ownerByDomain.plant
      return {
        id: `watch-${lane.id}`,
        title: lane.title,
        domain: lane.domain,
        owner: owner.owner,
        route: lane.firstDeskRoute || owner.route,
        priority: lane.highRiskCount || lane.status === 'Needs attention' ? 'high' : lane.workbookCount ? 'medium' : 'normal',
        sourceMode: lane.liveItemCount ? 'live' : 'fallback',
        signal: lane.highRiskCount
          ? `${lane.title} has ${lane.highRiskCount} high-risk records that need owner review.`
          : lane.workbookCount
            ? `${lane.title} has ${lane.workbookCount} workbook-like sources ready for KPI extraction.`
            : `${lane.title} is already visible to the root warehouse.`,
        metricCandidates: (kpisByDomain[lane.domain] ?? kpisByDomain.plant).slice(0, 3),
        nextAction: 'Open the owning workspace, confirm the owner, then convert the signal into one KPI, task, or close decision.',
        updatedAt: lane.lastActivityAt ?? '',
      }
    })
  const ownerHandoffs: YtfRootOwnerHandoff[] = domainSummary.map((summaryItem) => {
    const owner = ownerByDomain[summaryItem.domain] ?? ownerByDomain.plant
    return {
      id: `handoff-${summaryItem.domain}`,
      domain: summaryItem.domain,
      from: 'Drive owners and source PCs',
      to: owner.owner,
      route: summaryItem.primaryRoute || owner.route,
      cadence: owner.cadence,
      reason: `${summaryItem.laneCount} lanes and ${summaryItem.canonicalRecordCount} canonical records need a stable owner path.`,
      dataNeeded: 'owner, date, process or account, evidence link, decision status',
    }
  })
  const kpiCandidates: YtfRootKpiCandidate[] = domainSummary.flatMap((summaryItem) => {
    const owner = ownerByDomain[summaryItem.domain] ?? ownerByDomain.plant
    return (kpisByDomain[summaryItem.domain] ?? kpisByDomain.plant).slice(0, 3).map((name, index) => ({
      id: `kpi-${summaryItem.domain}-${index + 1}`,
      name,
      domain: summaryItem.domain,
      owner: owner.owner,
      route: summaryItem.primaryRoute || owner.route,
      stage: summaryItem.liveItemCount ? 'extract now' : 'map source first',
      formulaHint: 'Use the current canonical records plus date, owner, process, and evidence fields.',
      sourceSignal: `${summaryItem.sourceItemCount} source items, ${summaryItem.workbookCount} workbook-like sources`,
    }))
  })

  return {
    status: 'ready',
    lastSyncedAt: null,
    mode: 'fallback',
    connectorStatus: 'fallback',
    connectorMessage: 'Seeded Factory Client root registry is active while the live root crawl is unavailable.',
    summary,
    lanes: ROOT_SEED_LANES,
    recentLanes: ROOT_SEED_LANES.slice(0, 3),
    domainSummary,
    topRecordTypes: [
      { recordType: 'folder_group', count: 5 },
      { recordType: 'workbook', count: 3 },
      { recordType: 'plant_signal', count: 2 },
      { recordType: 'reference_record', count: 2 },
    ],
    topBehaviors: [
      { sourceBehavior: 'plant_signal', count: 4 },
      { sourceBehavior: 'commercial_signal', count: 3 },
      { sourceBehavior: 'reference_stack', count: 2 },
      { sourceBehavior: 'pc_import', count: 1 },
    ],
    changeWatch,
    ownerHandoffs,
    kpiCandidates,
    recentSyncs: [],
    nextActions: [
      'Keep the root crawl active so new folders from new PCs or accounts appear as typed lanes.',
      'Promote workbook-heavy plant, finance, and commercial lanes into marts so metrics stop depending on manual review.',
      'Use the same canonical records for owner chat, plant-manager KPIs, insights, and action routing.',
    ],
    knowledgeRuntime: buildSeedKnowledgeRuntime(),
  }
}

function normalizeDatasetPayload(payload?: RootWarehousePayload | null): YtfRootWarehouseDataset {
  const seed = getSeedYtfRootWarehouseDataset()
  const normalizeLane = (lane: NonNullable<RootWarehousePayload['lanes']>[number]): YtfRootLane => ({
    id: String(lane.id ?? '').trim(),
    driveItemId: String(lane.drive_item_id ?? '').trim(),
    title: String(lane.title ?? '').trim(),
    mimeType: String(lane.mime_type ?? '').trim(),
    driveUrl: String(lane.drive_url ?? '').trim(),
    domain: String(lane.domain ?? '').trim(),
    firstDeskRoute: String(lane.first_desk_route ?? '').trim(),
    observedBehavior: String(lane.observed_behavior ?? '').trim(),
    isFolder: Boolean(lane.is_folder),
    createdTime: lane.created_time ? String(lane.created_time).trim() : null,
    modifiedTime: lane.modified_time ? String(lane.modified_time).trim() : null,
    sourceItemCount: Number(lane.source_item_count ?? 0),
    shortcutCount: Number(lane.shortcut_count ?? 0),
    liveItemCount: Number(lane.live_item_count ?? 0),
    workbookCount: Number(lane.workbook_count ?? 0),
    canonicalRecordCount: Number(lane.canonical_record_count ?? 0),
    highRiskCount: Number(lane.high_risk_count ?? 0),
    lastActivityAt: lane.last_activity_at ? String(lane.last_activity_at).trim() : null,
    status: String(lane.status ?? '').trim(),
    ownerNote: String(lane.owner_note ?? '').trim(),
  })
  return {
    status: String(payload?.status ?? seed.status).trim() || seed.status,
    lastSyncedAt: payload?.last_synced_at ?? seed.lastSyncedAt,
    mode: String(payload?.mode ?? seed.mode).trim() || seed.mode,
    connectorStatus: String(payload?.connector_status ?? seed.connectorStatus).trim() || seed.connectorStatus,
    connectorMessage: String(payload?.connector_message ?? seed.connectorMessage).trim() || seed.connectorMessage,
    summary: {
      rootName: String(payload?.summary?.root_name ?? seed.summary.rootName).trim() || seed.summary.rootName,
      rootFolderUrl: String(payload?.summary?.root_folder_url ?? seed.summary.rootFolderUrl).trim() || seed.summary.rootFolderUrl,
      laneCount: Number(payload?.summary?.lane_count ?? seed.summary.laneCount),
      folderLaneCount: Number(payload?.summary?.folder_lane_count ?? seed.summary.folderLaneCount),
      fileLaneCount: Number(payload?.summary?.file_lane_count ?? seed.summary.fileLaneCount),
      sourceItemCount: Number(payload?.summary?.source_item_count ?? seed.summary.sourceItemCount),
      shortcutCount: Number(payload?.summary?.shortcut_count ?? seed.summary.shortcutCount),
      liveItemCount: Number(payload?.summary?.live_item_count ?? seed.summary.liveItemCount),
      workbookCount: Number(payload?.summary?.workbook_count ?? seed.summary.workbookCount),
      canonicalRecordCount: Number(payload?.summary?.canonical_record_count ?? seed.summary.canonicalRecordCount),
      highRiskCount: Number(payload?.summary?.high_risk_count ?? seed.summary.highRiskCount),
      recentItemCount: Number(payload?.summary?.recent_item_count ?? seed.summary.recentItemCount),
      ownerAttentionCount: Number(payload?.summary?.owner_attention_count ?? seed.summary.ownerAttentionCount),
      plantLaneCount: Number(payload?.summary?.plant_lane_count ?? seed.summary.plantLaneCount),
      commercialLaneCount: Number(payload?.summary?.commercial_lane_count ?? seed.summary.commercialLaneCount),
      governanceLaneCount: Number(payload?.summary?.governance_lane_count ?? seed.summary.governanceLaneCount),
      knowledgeLaneCount: Number(payload?.summary?.knowledge_lane_count ?? seed.summary.knowledgeLaneCount),
      cleanupLaneCount: Number(payload?.summary?.cleanup_lane_count ?? seed.summary.cleanupLaneCount),
    },
    lanes: Array.isArray(payload?.lanes) && payload!.lanes.length
      ? payload!.lanes.map(normalizeLane)
      : seed.lanes,
    recentLanes: Array.isArray(payload?.recent_lanes) && payload!.recent_lanes.length ? payload!.recent_lanes.map(normalizeLane) : seed.recentLanes,
    domainSummary: Array.isArray(payload?.domain_summary) && payload!.domain_summary.length
      ? payload!.domain_summary.map((item) => ({
          domain: String(item.domain ?? '').trim(),
          laneCount: Number(item.lane_count ?? 0),
          sourceItemCount: Number(item.source_item_count ?? 0),
          liveItemCount: Number(item.live_item_count ?? 0),
          shortcutCount: Number(item.shortcut_count ?? 0),
          workbookCount: Number(item.workbook_count ?? 0),
          canonicalRecordCount: Number(item.canonical_record_count ?? 0),
          highRiskCount: Number(item.high_risk_count ?? 0),
          primaryRoute: String(item.primary_route ?? '').trim(),
        }))
      : seed.domainSummary,
    topRecordTypes: Array.isArray(payload?.top_record_types) && payload!.top_record_types.length
      ? payload!.top_record_types.map((item) => ({
          recordType: String(item.record_type ?? '').trim(),
          count: Number(item.count ?? 0),
        }))
      : seed.topRecordTypes,
    topBehaviors: Array.isArray(payload?.top_behaviors) && payload!.top_behaviors.length
      ? payload!.top_behaviors.map((item) => ({
          sourceBehavior: String(item.source_behavior ?? '').trim(),
          count: Number(item.count ?? 0),
        }))
      : seed.topBehaviors,
    changeWatch: Array.isArray(payload?.change_watch) && payload!.change_watch.length
      ? payload!.change_watch.map((item) => ({
          id: String(item.id ?? '').trim(),
          title: String(item.title ?? '').trim(),
          domain: String(item.domain ?? '').trim(),
          owner: String(item.owner ?? '').trim(),
          route: String(item.route ?? '').trim(),
          priority: String(item.priority ?? '').trim(),
          sourceMode: String(item.source_mode ?? '').trim(),
          signal: String(item.signal ?? '').trim(),
          metricCandidates: Array.isArray(item.metric_candidates) ? item.metric_candidates.map((entry) => String(entry).trim()).filter(Boolean) : [],
          nextAction: String(item.next_action ?? '').trim(),
          updatedAt: String(item.updated_at ?? '').trim(),
        }))
      : seed.changeWatch,
    ownerHandoffs: Array.isArray(payload?.owner_handoffs) && payload!.owner_handoffs.length
      ? payload!.owner_handoffs.map((item) => ({
          id: String(item.id ?? '').trim(),
          domain: String(item.domain ?? '').trim(),
          from: String(item.from ?? '').trim(),
          to: String(item.to ?? '').trim(),
          route: String(item.route ?? '').trim(),
          cadence: String(item.cadence ?? '').trim(),
          reason: String(item.reason ?? '').trim(),
          dataNeeded: String(item.data_needed ?? '').trim(),
        }))
      : seed.ownerHandoffs,
    kpiCandidates: Array.isArray(payload?.kpi_candidates) && payload!.kpi_candidates.length
      ? payload!.kpi_candidates.map((item) => ({
          id: String(item.id ?? '').trim(),
          name: String(item.name ?? '').trim(),
          domain: String(item.domain ?? '').trim(),
          owner: String(item.owner ?? '').trim(),
          route: String(item.route ?? '').trim(),
          stage: String(item.stage ?? '').trim(),
          formulaHint: String(item.formula_hint ?? '').trim(),
          sourceSignal: String(item.source_signal ?? '').trim(),
        }))
      : seed.kpiCandidates,
    recentSyncs: Array.isArray(payload?.recent_syncs) && payload!.recent_syncs.length
      ? payload!.recent_syncs.map((item) => ({
          runId: String(item.run_id ?? '').trim(),
          syncedAt: String(item.synced_at ?? '').trim(),
          mode: String(item.mode ?? '').trim(),
          connectorStatus: String(item.connector_status ?? '').trim(),
          itemCount: Number(item.item_count ?? 0),
          canonicalCount: Number(item.canonical_count ?? 0),
        }))
      : seed.recentSyncs,
    nextActions: Array.isArray(payload?.next_actions) && payload!.next_actions.length ? payload!.next_actions.map((item) => String(item).trim()).filter(Boolean) : seed.nextActions,
    knowledgeRuntime: payload?.knowledge_runtime
      ? {
          status: String(payload.knowledge_runtime.status ?? seed.knowledgeRuntime.status).trim() || seed.knowledgeRuntime.status,
          summary: {
            graphNodeCount: Number(payload.knowledge_runtime.summary?.graph_node_count ?? seed.knowledgeRuntime.summary.graphNodeCount),
            graphEdgeCount: Number(payload.knowledge_runtime.summary?.graph_edge_count ?? seed.knowledgeRuntime.summary.graphEdgeCount),
            chunkCount: Number(payload.knowledge_runtime.summary?.chunk_count ?? seed.knowledgeRuntime.summary.chunkCount),
            entityCount: Number(payload.knowledge_runtime.summary?.entity_count ?? seed.knowledgeRuntime.summary.entityCount),
            relationCount: Number(payload.knowledge_runtime.summary?.relation_count ?? seed.knowledgeRuntime.summary.relationCount),
            communityCount: Number(payload.knowledge_runtime.summary?.community_count ?? seed.knowledgeRuntime.summary.communityCount),
            retrievalPackCount: Number(payload.knowledge_runtime.summary?.retrieval_pack_count ?? seed.knowledgeRuntime.summary.retrievalPackCount),
            agentLoopCount: Number(payload.knowledge_runtime.summary?.agent_loop_count ?? seed.knowledgeRuntime.summary.agentLoopCount),
            lastBuiltAt: payload.knowledge_runtime.summary?.last_built_at ?? seed.knowledgeRuntime.summary.lastBuiltAt,
            trustZone: String(payload.knowledge_runtime.summary?.trust_zone ?? seed.knowledgeRuntime.summary.trustZone).trim() || seed.knowledgeRuntime.summary.trustZone,
          },
          setupSteps: Array.isArray(payload.knowledge_runtime.setup_steps) && payload.knowledge_runtime.setup_steps.length
            ? payload.knowledge_runtime.setup_steps.map((item) => ({
                id: String(item.id ?? '').trim(),
                title: String(item.title ?? '').trim(),
                detail: String(item.detail ?? '').trim(),
                route: String(item.route ?? '').trim(),
                ctaLabel: String(item.cta_label ?? '').trim(),
              }))
            : seed.knowledgeRuntime.setupSteps,
          graphCommunities: Array.isArray(payload.knowledge_runtime.graph_communities) && payload.knowledge_runtime.graph_communities.length
            ? payload.knowledge_runtime.graph_communities.map((item) => ({
                id: String(item.id ?? '').trim(),
                name: String(item.name ?? '').trim(),
                nodeCount: Number(item.node_count ?? 0),
                edgeCount: Number(item.edge_count ?? 0),
                retrievalFocus: String(item.retrieval_focus ?? '').trim(),
                route: String(item.route ?? '').trim(),
                questions: Array.isArray(item.questions) ? item.questions.map((question) => String(question).trim()).filter(Boolean) : [],
              }))
            : seed.knowledgeRuntime.graphCommunities,
          ragCollections: Array.isArray(payload.knowledge_runtime.rag_collections) && payload.knowledge_runtime.rag_collections.length
            ? payload.knowledge_runtime.rag_collections.map((item) => ({
                id: String(item.id ?? '').trim(),
                name: String(item.name ?? '').trim(),
                chunkCount: Number(item.chunk_count ?? 0),
                freshness: String(item.freshness ?? '').trim(),
                retrievalStrategy: String(item.retrieval_strategy ?? '').trim(),
                bestFor: Array.isArray(item.best_for) ? item.best_for.map((entry) => String(entry).trim()).filter(Boolean) : [],
                usedBy: Array.isArray(item.used_by) ? item.used_by.map((entry) => String(entry).trim()).filter(Boolean) : [],
              }))
            : seed.knowledgeRuntime.ragCollections,
          agentLoops: Array.isArray(payload.knowledge_runtime.agent_loops) && payload.knowledge_runtime.agent_loops.length
            ? payload.knowledge_runtime.agent_loops.map((item) => ({
                id: String(item.id ?? '').trim(),
                name: String(item.name ?? '').trim(),
                status: String(item.status ?? '').trim(),
                trigger: String(item.trigger ?? '').trim(),
                nextAction: String(item.next_action ?? '').trim(),
                route: String(item.route ?? '').trim(),
                usedTools: Array.isArray(item.used_tools) ? item.used_tools.map((entry) => String(entry).trim()).filter(Boolean) : [],
                memoryWrites: Array.isArray(item.memory_writes) ? item.memory_writes.map((entry) => String(entry).trim()).filter(Boolean) : [],
              }))
            : seed.knowledgeRuntime.agentLoops,
          mobileSurfaces: Array.isArray(payload.knowledge_runtime.mobile_surfaces) && payload.knowledge_runtime.mobile_surfaces.length
            ? payload.knowledge_runtime.mobile_surfaces.map((item) => ({
                id: String(item.id ?? '').trim(),
                title: String(item.title ?? '').trim(),
                whenToUse: String(item.when_to_use ?? '').trim(),
                primaryAction: String(item.primary_action ?? '').trim(),
                route: String(item.route ?? '').trim(),
              }))
            : seed.knowledgeRuntime.mobileSurfaces,
          queryStarters: Array.isArray(payload.knowledge_runtime.query_starters) && payload.knowledge_runtime.query_starters.length
            ? payload.knowledge_runtime.query_starters.map((item) => String(item).trim()).filter(Boolean)
            : seed.knowledgeRuntime.queryStarters,
          designPrinciples: Array.isArray(payload.knowledge_runtime.design_principles) && payload.knowledge_runtime.design_principles.length
            ? payload.knowledge_runtime.design_principles.map((item) => String(item).trim()).filter(Boolean)
            : seed.knowledgeRuntime.designPrinciples,
          nextAutomation: String(payload.knowledge_runtime.next_automation ?? seed.knowledgeRuntime.nextAutomation).trim() || seed.knowledgeRuntime.nextAutomation,
          inputCount: Number(payload.knowledge_runtime.input_count ?? seed.knowledgeRuntime.inputCount),
        }
      : seed.knowledgeRuntime,
  }
}

function normalizeQueryPayload(payload?: RootKnowledgeQueryPayload | null, fallbackQuery = ''): YtfRootKnowledgeQueryResult {
  const seed = getSeedRootKnowledgeQueryResult(fallbackQuery)
  return {
    status: String(payload?.status ?? seed.status).trim() || seed.status,
    query: String(payload?.query ?? seed.query).trim() || seed.query,
    mode: String(payload?.mode ?? seed.mode).trim() || seed.mode,
    answer: String(payload?.answer ?? seed.answer).trim() || seed.answer,
    focusArea: String(payload?.focus_area ?? seed.focusArea).trim() || seed.focusArea,
    matchedRecordCount: Number(payload?.matched_record_count ?? seed.matchedRecordCount),
    retrievalStrategy: String(payload?.retrieval_strategy ?? seed.retrievalStrategy).trim() || seed.retrievalStrategy,
    rag: {
      status: String(payload?.rag?.status ?? seed.rag.status).trim() || seed.rag.status,
      strategy: String(payload?.rag?.strategy ?? seed.rag.strategy).trim() || seed.rag.strategy,
      summary: {
        chunkCount: Number(payload?.rag?.summary?.chunk_count ?? seed.rag.summary.chunkCount),
        entityCount: Number(payload?.rag?.summary?.entity_count ?? seed.rag.summary.entityCount),
        relationCount: Number(payload?.rag?.summary?.relation_count ?? seed.rag.summary.relationCount),
        retrievalTraceCount: Number(payload?.rag?.summary?.retrieval_trace_count ?? seed.rag.summary.retrievalTraceCount),
      },
      chunks: Array.isArray(payload?.rag?.chunks) && payload!.rag!.chunks!.length
        ? payload!.rag!.chunks!.map((item) => ({
            chunkId: String(item.chunk_id ?? '').trim(),
            recordId: String(item.record_id ?? '').trim(),
            chunkType: String(item.chunk_type ?? '').trim(),
            text: String(item.text ?? '').trim(),
            route: String(item.route ?? '').trim(),
            sourceUrl: String(item.source_url ?? '').trim(),
            modifiedTime: String(item.modified_time ?? '').trim(),
            entityIds: Array.isArray(item.entity_ids) ? item.entity_ids.map((entityId) => String(entityId).trim()).filter(Boolean) : [],
          }))
        : seed.rag.chunks,
      semantic: {
        status: String(payload?.rag?.semantic?.status ?? seed.rag.semantic.status).trim() || seed.rag.semantic.status,
        strategy: String(payload?.rag?.semantic?.strategy ?? seed.rag.semantic.strategy).trim() || seed.rag.semantic.strategy,
        model: String(payload?.rag?.semantic?.model ?? seed.rag.semantic.model).trim() || seed.rag.semantic.model,
        chunkCount: Number(payload?.rag?.semantic?.chunk_count ?? seed.rag.semantic.chunkCount),
        matchedChunkCount: Number(payload?.rag?.semantic?.matched_chunk_count ?? seed.rag.semantic.matchedChunkCount),
        nextUpgrade: String(payload?.rag?.semantic?.next_upgrade ?? seed.rag.semantic.nextUpgrade).trim() || seed.rag.semantic.nextUpgrade,
        topChunks: Array.isArray(payload?.rag?.semantic?.top_chunks) && payload!.rag!.semantic!.top_chunks!.length
          ? payload!.rag!.semantic!.top_chunks!.map((item) => ({
              chunkId: String(item.chunk_id ?? '').trim(),
              recordId: String(item.record_id ?? '').trim(),
              chunkType: String(item.chunk_type ?? '').trim(),
              route: String(item.route ?? '').trim(),
              sourceUrl: String(item.source_url ?? '').trim(),
              score: Number(item.score ?? 0),
              tokenHits: Array.isArray(item.token_hits) ? item.token_hits.map((token) => String(token).trim()).filter(Boolean) : [],
              text: String(item.text ?? '').trim(),
            }))
          : seed.rag.semantic.topChunks,
      },
      entities: Array.isArray(payload?.rag?.entities) && payload!.rag!.entities!.length
        ? payload!.rag!.entities!.map((item) => ({
            entityId: String(item.entity_id ?? '').trim(),
            name: String(item.name ?? '').trim(),
            type: String(item.type ?? '').trim(),
            sourceField: String(item.source_field ?? '').trim(),
            confidence: Number(item.confidence ?? 0),
          }))
        : seed.rag.entities,
      relations: Array.isArray(payload?.rag?.relations) && payload!.rag!.relations!.length
        ? payload!.rag!.relations!.map((item) => ({
            relationId: String(item.relation_id ?? '').trim(),
            from: String(item.from ?? '').trim(),
            to: String(item.to ?? '').trim(),
            type: String(item.type ?? '').trim(),
            confidence: Number(item.confidence ?? 0),
          }))
        : seed.rag.relations,
    },
    graphCommunities: Array.isArray(payload?.graph_communities) && payload!.graph_communities.length
      ? payload!.graph_communities.map((item) => ({
          name: String(item.name ?? '').trim(),
          route: String(item.route ?? '').trim(),
          retrievalFocus: String(item.retrieval_focus ?? '').trim(),
        }))
      : seed.graphCommunities,
    agentLoops: Array.isArray(payload?.agent_loops) && payload!.agent_loops.length
      ? payload!.agent_loops.map((item) => ({
          name: String(item.name ?? '').trim(),
          route: String(item.route ?? '').trim(),
          status: String(item.status ?? '').trim(),
          nextAction: String(item.next_action ?? '').trim(),
        }))
      : seed.agentLoops,
    nextMoves: Array.isArray(payload?.next_moves) && payload!.next_moves.length ? payload!.next_moves.map((item) => String(item).trim()).filter(Boolean) : seed.nextMoves,
    evidence: Array.isArray(payload?.evidence) && payload!.evidence.length
      ? payload!.evidence.map((item) => ({
          recordId: String(item.record_id ?? '').trim(),
          domain: String(item.domain ?? '').trim(),
          title: String(item.title ?? '').trim(),
          laneTitle: String(item.lane_title ?? '').trim(),
          recordType: String(item.record_type ?? '').trim(),
          sourceBehavior: String(item.source_behavior ?? '').trim(),
          riskLevel: String(item.risk_level ?? '').trim(),
          owningDeskRoute: String(item.owning_desk_route ?? '').trim(),
          sourceMode: String(item.source_mode ?? '').trim(),
          webViewLink: String(item.web_view_link ?? '').trim(),
          modifiedTime: String(item.modified_time ?? '').trim(),
        }))
      : seed.evidence,
  }
}

export async function loadYtfRootWarehouseDataset() {
  const health = await checkWorkspaceHealth().catch(() => ({ ready: false as const }))
  if (!health.ready) {
    return getSeedYtfRootWarehouseDataset()
  }

  try {
    const payload = await workspaceFetch<RootWarehousePayload>('/api/ytf/warehouse')
    return normalizeDatasetPayload(payload)
  } catch {
    return getSeedYtfRootWarehouseDataset()
  }
}

export async function syncYtfRootWarehouseDataset() {
  const payload = await workspaceFetch<RootWarehousePayload>('/api/ytf/warehouse/sync', {
    method: 'POST',
  })
  return normalizeDatasetPayload(payload)
}

export async function queryYtfRootKnowledge(query: string, limit = 6) {
  try {
    const payload = await workspaceFetch<RootKnowledgeQueryPayload>('/api/ytf/knowledge/query', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    })
    return normalizeQueryPayload(payload, query)
  } catch {
    return getSeedRootKnowledgeQueryResult(query)
  }
}
