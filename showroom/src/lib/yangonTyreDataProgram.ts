export type YangonTyreSystemLaneStatus = 'Live now' | 'Hybrid now' | 'Next wiring'

export type YangonTyreSystemLane = {
  id: string
  name: string
  status: YangonTyreSystemLaneStatus
  detail: string
  unlocks: string
  route: string
}

export type YangonTyreDataPodStatus = 'Active' | 'Scaling' | 'Needs connector wiring'

export type YangonTyreDataPod = {
  id: string
  name: string
  status: YangonTyreDataPodStatus
  lead: string
  mission: string
  now: string[]
  outputs: string[]
  route: string
}

export const YANGON_TYRE_SYSTEM_LANES: YangonTyreSystemLane[] = [
  {
    id: 'tenant-preview',
    name: 'Tenant portal and plant-manager preview',
    status: 'Live now',
    detail: 'The YTF tenant host, portal, plant manager, operations, DQMS, maintenance, and data-fabric pages are already reachable in preview mode.',
    unlocks: 'Immediate route entry, UI review, seeded operational rehearsal, and tenant-host navigation.',
    route: '/app/portal',
  },
  {
    id: 'auth-role-runtime',
    name: 'Login and role runtime',
    status: 'Live now',
    detail: 'Workspace auth, role mapping, and route gating already exist. Login switches the experience from guest preview into role-aware live access.',
    unlocks: 'Role-safe desks, live workspace reads, and manager-approved writeback lanes.',
    route: '/login',
  },
  {
    id: 'writeback-and-canonical',
    name: 'Canonical records and desk writeback',
    status: 'Hybrid now',
    detail: 'The desks and writeback lanes are modeled and usable, but some lanes still fall back to seeds until the backing runtime is connected for every role and record family.',
    unlocks: 'Persistent incidents, actions, approvals, receiving records, and replayable operator history.',
    route: '/app/data-fabric',
  },
  {
    id: 'drive-and-mail-mining',
    name: 'Drive and mailbox mining',
    status: 'Hybrid now',
    detail: 'Whole-folder source behavior, shortcut-heavy lanes, workbook evidence, and mailbox topics are mapped, but continuous delta extraction still needs more connector depth.',
    unlocks: 'Incremental source events, attachment manifests, shortcut target resolution, and topic-ready extraction queues.',
    route: '/app/connectors',
  },
  {
    id: 'feature-marts-and-science',
    name: 'Feature marts and industrial analytics',
    status: 'Hybrid now',
    detail: 'Analytical marts, watchlists, KPI features, and role stories are already in-product, but they still mix seed data with live records until the warehouse spine is fully persisted.',
    unlocks: 'Trend monitors, anomaly scoring, bottleneck study, defect clustering, dealer and supplier concentration, and engineered KPIs.',
    route: '/app/insights',
  },
  {
    id: 'scheduled-agent-loop',
    name: 'Always-on extraction and briefing loop',
    status: 'Next wiring',
    detail: 'The product has the surfaces and pod assignments, but the unattended change-tracking, scheduled extraction, and briefing promotion loop still needs to be bound to durable workers.',
    unlocks: 'Automatic deltas, nightly marts, manager alerts, and recurring insight briefs without manual refresh.',
    route: '/app/cloud',
  },
] as const

export const YANGON_TYRE_DATA_PODS: YangonTyreDataPod[] = [
  {
    id: 'connector-intake',
    name: 'Connector Intake Pod',
    status: 'Active',
    lead: 'Tenant admin + connector systems',
    mission: 'Resolve shared Drive shortcuts, crawl source lanes, register mailbox packets, and keep the source-event spine current.',
    now: ['shortcut target resolution', 'whole-folder index refresh', 'mailbox packet registry'],
    outputs: ['source event registry', 'attachment manifests', 'connector backlog board'],
    route: '/app/connectors',
  },
  {
    id: 'canon-and-provenance',
    name: 'Canon and Provenance Pod',
    status: 'Active',
    lead: 'Document intelligence + data engineering',
    mission: 'Turn files, mail, workbook blocks, and operator entry into canonical records with durable provenance and promotion rules.',
    now: ['file-to-topic routing', 'entity normalization', 'lineage and confidence review'],
    outputs: ['canonical records', 'knowledge candidates', 'promotion-ready evidence packs'],
    route: '/app/data-fabric',
  },
  {
    id: 'industrial-engineering',
    name: 'Industrial Engineering Pod',
    status: 'Scaling',
    lead: 'Plant manager + data science',
    mission: 'Model stage flow, downtime, genealogy, throughput, and yield so managers can read micro and macro plant behavior from the same mart.',
    now: ['stage tagging', 'bottleneck features', 'downtime reason cuts'],
    outputs: ['plant flow mart', 'shift engineering brief', 'bottleneck watchlist'],
    route: '/app/plant-manager',
  },
  {
    id: 'quality-intelligence',
    name: 'Quality Intelligence Pod',
    status: 'Scaling',
    lead: 'Quality manager + lab methods',
    mission: 'Mine incidents, CAPA, batch evidence, and release logic into one quality-learning loop with real closeout discipline.',
    now: ['incident canon', 'defect clustering', 'release-lag features'],
    outputs: ['quality loss mart', 'weekly defect story', 'closeout and recurrence board'],
    route: '/app/dqms',
  },
  {
    id: 'commercial-recovery',
    name: 'Commercial and Recovery Pod',
    status: 'Needs connector wiring',
    lead: 'Sales lead + finance controller',
    mission: 'Mine supplier discrepancy, dealer movement, quote response, and commercial risk into recovery and demand intelligence.',
    now: ['supplier document debt', 'dealer share tracking', 'approval packet assembly'],
    outputs: ['supplier recovery mart', 'commercial demand mart', 'director escalation shortlist'],
    route: '/app/revenue',
  },
  {
    id: 'insight-narrative',
    name: 'Insight Narrative Pod',
    status: 'Scaling',
    lead: 'Director + AI ops',
    mission: 'Convert cleaned records and engineered features into role-specific briefs, contradictions, and next-action framing for managers and leadership.',
    now: ['daily brief templates', 'contradiction review', 'story-pack automation'],
    outputs: ['CEO daily brief', 'plant shift brief', 'data-quality story', 'manager exception pack'],
    route: '/app/insights',
  },
] as const

export const YANGON_TYRE_DATA_NEXT_MOVES = [
  'Bind the shared Drive change tracker and shortcut resolution into a durable incremental connector loop.',
  'Promote mailbox and attachment intake into canonical supplier, approval, and discrepancy records.',
  'Persist canonical records and feature marts into the real warehouse instead of relying on seed slices.',
  'Schedule recurring manager, quality, and director briefs from the same lineage-backed marts.',
  'Keep writeback inside the desks so every new fact immediately improves the next model and story.',
] as const
