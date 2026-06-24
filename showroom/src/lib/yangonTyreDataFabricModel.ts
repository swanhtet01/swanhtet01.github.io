import { getAgentOperatingModel } from './agentOperatingModel'
import { YANGON_TYRE_CONNECTOR_EXPANSION, YANGON_TYRE_SOURCE_PACKS } from './yangonTyreDriveModel'
import { YANGON_TYRE_MODEL } from './tenantOperatingModel'

type AgentPlaybook = ReturnType<typeof getAgentOperatingModel>['playbooks'][number]
type EntrySurface = (typeof YANGON_TYRE_MODEL.dataEntrySurfaces)[number]

export type DataFabricStatus = 'live' | 'mapped' | 'next'

export type YangonTyreDataPipelineStage = {
  id: string
  name: string
  status: DataFabricStatus
  purpose: string
  sources: string[]
  outputs: string[]
  agents: string[]
  reviewGate: string
}

export type YangonTyreTopicPipeline = {
  id: string
  name: string
  status: DataFabricStatus
  scope: string
  sourcePacks: string[]
  connectorTracks: string[]
  transforms: string[]
  outputs: string[]
  roleStories: string[]
}

export type YangonTyreFeatureMart = {
  id: string
  name: string
  status: DataFabricStatus
  grain: string
  sources: string[]
  features: string[]
  consumers: string[]
  cadence: string
}

export type YangonTyreRoleStory = {
  id: string
  role: string
  name: string
  route: string
  inputs: string[]
  questions: string[]
  outputs: string[]
}

export type YangonTyreDataCopilot = {
  id: string
  name: string
  leadRole: string
  mission: string
  cadence: string[]
  outputs: string[]
  writePolicy: string
}

export type YangonTyreWritebackLane = {
  id: string
  name: string
  route: string
  users: string[]
  captures: string[]
  qualityRules: string[]
  downstreamMarts: string[]
  downstreamStories: string[]
}

export const YANGON_TYRE_DATA_FABRIC_DIALECTIC = {
  thesis:
    'Every folder, sheet, email thread, and team update should become reusable tenant memory that can feed operational control, data science, and role-specific briefing.',
  antithesis:
    'Yangon Tyre still spreads signal across Drive folders, procurement and internal mail, ERP exports, chat, and retrospective spreadsheets, so analysis and action drift apart.',
  synthesis:
    'Data Fabric watches the source mesh, extracts topic-aware records, builds feature marts, generates role stories, and loops humans back into structured writeback lanes.',
} as const

export const YANGON_TYRE_DATA_PIPELINE_STAGES: YangonTyreDataPipelineStage[] = [
  {
    id: 'source-watch',
    name: 'Source Watch and Whole-Folder Intake',
    status: 'live',
    purpose: 'Continuously watch the full Google Drive folder tree, Gmail threads, attachments, and operator writeback surfaces for new evidence.',
    sources: ['Plant A shared folders', 'CEO data hub', 'Finance and purchase-order mail packs', 'Sales and procurement Gmail', 'Structured app entry'],
    outputs: ['source event registry', 'attachment manifests', 'sheet snapshots', 'topic candidate queue'],
    agents: ['Intake Router Pod', 'Connector Control', 'Document Intake'],
    reviewGate: 'Source scope and connector permissions stay under tenant-admin review.',
  },
  {
    id: 'topic-extraction',
    name: 'Topic Extraction and Record Classification',
    status: 'mapped',
    purpose: 'Split the full source stream into topic pipelines for manufacturing, quality, supplier recovery, commercial demand, and leadership review.',
    sources: ['Drive revision deltas', 'mail thread clusters', 'manual forms', 'ERP exports'],
    outputs: ['supplier issue candidates', 'GRN exceptions', 'batch and lot references', 'account timeline events', 'decision candidates'],
    agents: ['Intake Router Pod', 'Supplier Recovery Pod', 'Commercial Memory Pod'],
    reviewGate: 'Cross-topic merges and sensitive classifications require manager acceptance.',
  },
  {
    id: 'canonical-records',
    name: 'Canonical Records and Knowledge Promotion',
    status: 'mapped',
    purpose: 'Promote extracted facts into durable tenant records with provenance and links back to the source evidence.',
    sources: ['classified intake', 'document canon review', 'manual issue records', 'director and manager notes'],
    outputs: ['canonical supplier issues', 'quality incidents', 'shift blockers', 'dealer account events', 'decision records'],
    agents: ['Knowledge Graph and SOP Vault', 'Quality Watch Pod', 'Decision Journal'],
    reviewGate: 'Human review is required before high-risk records change supplier, quality, or commercial posture.',
  },
  {
    id: 'feature-engineering',
    name: 'Feature Engineering and KPI Marts',
    status: 'mapped',
    purpose: 'Build durable, reusable feature tables for management, industrial engineering, and forecasting instead of one-off analysis sheets.',
    sources: ['canonical records', 'Tyre Analysis workbook', 'ERP and GRN exports', 'shift and downtime entry'],
    outputs: ['feature marts', 'KPI baselines', 'anomaly signals', 'industrial engineering cuts', 'forecast inputs'],
    agents: ['Data Science Pod', 'Operating Intelligence Studio'],
    reviewGate: 'Freshness, lineage, and explanation checks are required before features are used in live review.',
  },
  {
    id: 'analysis-modeling',
    name: 'Analysis, Modeling, and Industrial Engineering',
    status: 'mapped',
    purpose: 'Turn feature marts into management analysis, bottleneck review, yield studies, demand signals, and risk ranking.',
    sources: ['feature marts', 'quality baselines', 'sales movement', 'downtime and root-cause history'],
    outputs: ['gap-analysis packs', 'yield and bottleneck studies', 'quality-loss analysis', 'supplier debt ranking', 'demand and revenue signals'],
    agents: ['Data Science Pod', 'Operations and Reliability Pod', 'Manufacturing Genealogy Pod'],
    reviewGate: 'Model outputs remain advisory until a manager accepts them into operating decisions.',
  },
  {
    id: 'role-storytelling',
    name: 'Role Storytelling and Section-Specific Insight',
    status: 'mapped',
    purpose: 'Convert analysis into narratives that match the user and desk: director, plant, quality, procurement, sales, and admin.',
    sources: ['feature marts', 'canonical records', 'manager notes', 'runtime posture'],
    outputs: ['director brief', 'shift brief', 'quality board story', 'supplier recovery story', 'dealer and demand story', 'admin data-quality brief'],
    agents: ['CEO Brief Pod', 'Data Science Pod', 'Commercial Memory Pod', 'Quality Watch Pod'],
    reviewGate: 'Stories must link to the underlying records, not just summarize them.',
  },
  {
    id: 'human-writeback',
    name: 'Human Writeback and Continuous Improvement',
    status: 'live',
    purpose: 'Push the right fields back into the operational desks so the team can update data where the work actually happens.',
    sources: ['Receiving Control', 'DQMS', 'Maintenance', 'Supplier Control', 'Revenue Desk', 'Director and KPI entry'],
    outputs: ['cleaner forms', 'missing-field prompts', 'new issue records', 'manager corrections', 'training signals'],
    agents: ['Workforce Command', 'Experience Assurance Pod', 'Document Intelligence'],
    reviewGate: 'The portal remains the writeback lane; chat and shadow sheets are treated as exceptions, not the system of record.',
  },
] as const

export const YANGON_TYRE_TOPIC_PIPELINES: YangonTyreTopicPipeline[] = [
  {
    id: 'whole-folder',
    name: 'Whole-folder operating memory',
    status: 'live',
    scope: 'Crawl the entire Yangon Tyre Google Drive structure and mailbox evidence so no important file or update stays invisible to the platform.',
    sourcePacks: ['Plant A operations manual', 'Plant A shared folders', 'CEO data hub', 'Data source register'],
    connectorTracks: ['Google Drive evidence spine', 'Gmail and attachment intake'],
    transforms: ['folder and shortcut indexing', 'sheet snapshotting', 'file-to-topic routing', 'attachment lineage'],
    outputs: ['tenant evidence spine', 'topic queues', 'knowledge candidates', 'stale-source alerts'],
    roleStories: ['Admin data-quality story', 'CEO daily brief'],
  },
  {
    id: 'manufacturing-industrial',
    name: 'Manufacturing and industrial engineering',
    status: 'mapped',
    scope: 'Use production, downtime, genealogy, and planning data to study throughput, bottlenecks, yield, and line balance.',
    sourcePacks: ['Plant A operations manual', 'Plant A shared folders', 'Tyre Analysis workbook'],
    connectorTracks: ['Google Drive evidence spine', 'Shopfloor mobile forms and line logs'],
    transforms: ['stage tagging', 'batch and asset linkage', 'yield normalization', 'bottleneck feature engineering'],
    outputs: ['plant flow mart', 'downtime reason cuts', 'bottleneck watchlist', 'shift engineering brief'],
    roleStories: ['Plant shift and engineering story', 'CEO daily brief'],
  },
  {
    id: 'quality-genealogy',
    name: 'Quality, genealogy, and release',
    status: 'mapped',
    scope: 'Bind incidents, batch evidence, closeout actions, and release history into one quality-learning loop.',
    sourcePacks: ['Plant A operations manual', 'Plant A shared folders', 'Tyre Analysis workbook'],
    connectorTracks: ['Google Drive evidence spine', 'Gmail and attachment intake', 'Shopfloor mobile forms and line logs'],
    transforms: ['incident extraction', 'batch reference repair', 'photo-to-issue linkage', 'quality-loss feature generation'],
    outputs: ['quality loss mart', 'incident canon', 'release evidence packs', 'weekly defect storyline'],
    roleStories: ['Quality technical story', 'CEO daily brief'],
  },
  {
    id: 'supplier-finance',
    name: 'Supplier, GRN, and finance recovery',
    status: 'mapped',
    scope: 'Keep supplier discrepancies, missing documents, GRN mismatches, and financial exposure on one recovery graph.',
    sourcePacks: ['Finance and purchase-order mail packs', 'Plant A shared folders', 'Data source register'],
    connectorTracks: ['Gmail and attachment intake', 'Google Drive evidence spine', 'Viber, LINE, and WeChat internal and external chat mesh'],
    transforms: ['supplier identity normalization', 'mail-to-GRN binding', 'evidence completeness scoring', 'delay aging'],
    outputs: ['supplier recovery mart', 'document debt ranking', 'plant-blocking discrepancy board', 'approval-ready packets'],
    roleStories: ['Supplier recovery story', 'Finance approval story'],
  },
  {
    id: 'commercial-demand',
    name: 'Commercial demand and market response',
    status: 'mapped',
    scope: 'Merge dealer memory, quotes, inquiries, campaigns, and catalog movement into one demand intelligence layer.',
    sourcePacks: ['Tyre Analysis workbook', 'CEO data hub'],
    connectorTracks: ['Gmail and attachment intake', 'Website and product catalog signals', 'Google Analytics and funnel telemetry', 'Facebook and social commercial inbox'],
    transforms: ['account timeline stitching', 'lead-source scoring', 'quote classification', 'product-demand features'],
    outputs: ['commercial demand mart', 'dealer health cues', 'campaign response summary', 'revenue-risk storyline'],
    roleStories: ['Sales and demand story', 'CEO daily brief'],
  },
  {
    id: 'director-strategy',
    name: 'Director strategy and cross-functional control',
    status: 'mapped',
    scope: 'Fuse plant, supplier, commercial, and quality signals into management-level priorities with evidence links.',
    sourcePacks: ['CEO data hub', 'Tyre Analysis workbook', 'Finance and purchase-order mail packs'],
    connectorTracks: ['Gmail and attachment intake', 'Google Drive evidence spine', 'Google Analytics and funnel telemetry'],
    transforms: ['cross-topic risk ranking', 'KPI baseline comparison', 'decision-memory linking', 'narrative assembly'],
    outputs: ['executive KPI mart', 'priority packs', 'decision prompts', 'storytelling for sections and reviews'],
    roleStories: ['CEO daily brief', 'Admin data-quality story'],
  },
] as const

export const YANGON_TYRE_FEATURE_MARTS: YangonTyreFeatureMart[] = [
  {
    id: 'plant-flow-mart',
    name: 'Plant flow and industrial engineering mart',
    status: 'mapped',
    grain: 'shift x stage x asset x product family',
    sources: ['Plant A folders', 'shopfloor logs', 'maintenance entry', 'production sheets'],
    features: ['throughput by stage', 'downtime minutes', 'line-balance pressure', 'yield loss by asset', 'repeat-blocker rate'],
    consumers: ['Operations Control', 'Workforce Command', 'Operating Intelligence Studio'],
    cadence: 'Every shift',
  },
  {
    id: 'quality-loss-mart',
    name: 'Quality loss and release mart',
    status: 'mapped',
    grain: 'incident x batch x defect x release decision',
    sources: ['DQMS entry', 'inspection files', 'quality notes', 'batch evidence'],
    features: ['B+R by month', 'defect cluster score', 'release lag', 'repeat defect recurrence', 'closeout age'],
    consumers: ['DQMS and Quality Methods', 'CEO Command Center', 'Operating Intelligence Studio'],
    cadence: 'Daily and weekly',
  },
  {
    id: 'supplier-recovery-mart',
    name: 'Supplier recovery and GRN mart',
    status: 'mapped',
    grain: 'supplier x shipment x discrepancy case',
    sources: ['procurement Gmail', 'GRN exceptions', 'document intake', 'finance evidence'],
    features: ['document debt age', 'unresolved discrepancy value', 'release block count', 'supplier response lag', 'claim recurrence'],
    consumers: ['Supplier and Approval Control', 'Receiving Control', 'CEO Command Center'],
    cadence: 'Daily',
  },
  {
    id: 'commercial-demand-mart',
    name: 'Commercial demand and dealer mart',
    status: 'mapped',
    grain: 'account x inquiry x quote x product family',
    sources: ['sales Gmail', 'account reviews', 'web inquiries', 'campaign signals'],
    features: ['lead-source score', 'quote velocity', 'dealer activity freshness', 'product demand mix', 'revenue-risk cues'],
    consumers: ['Revenue Desk', 'Lead Pipeline', 'CEO Command Center'],
    cadence: 'Daily',
  },
  {
    id: 'executive-kpi-mart',
    name: 'Executive KPI and storytelling mart',
    status: 'mapped',
    grain: 'review cycle x business theme',
    sources: ['feature marts', 'director notes', 'quality and supplier signals', 'sales movement'],
    features: ['priority gap ranking', 'cross-functional risk score', 'intervention backlog', 'story freshness', 'trend deltas'],
    consumers: ['Operating Intelligence Studio', 'CEO Command Center', 'Workforce Command'],
    cadence: 'Daily and weekly',
  },
] as const

export const YANGON_TYRE_ROLE_STORIES: YangonTyreRoleStory[] = [
  {
    id: 'director-brief',
    role: 'CEO / director',
    name: 'CEO daily brief',
    route: '/app/director',
    inputs: ['executive KPI mart', 'supplier recovery mart', 'quality loss mart', 'commercial demand mart'],
    questions: ['What changed materially today?', 'Where is cross-functional risk rising?', 'Which decisions need owner and due date now?'],
    outputs: ['priority reset', 'decision prompts', 'linked evidence pack'],
  },
  {
    id: 'plant-shift-story',
    role: 'Plant manager',
    name: 'Plant shift and engineering story',
    route: '/app/operations',
    inputs: ['plant flow mart', 'quality loss mart', 'maintenance and receiving records'],
    questions: ['Where is throughput being lost?', 'Which blocker is repeating?', 'Which shift issue needs escalation before next handoff?'],
    outputs: ['shift brief', 'bottleneck watch', 'root-cause priority list'],
  },
  {
    id: 'quality-board-story',
    role: 'Quality manager',
    name: 'Quality technical story',
    route: '/app/dqms',
    inputs: ['quality loss mart', 'incident canon', 'release evidence packs'],
    questions: ['Which defects are recurring?', 'What is driving B+R and release delay?', 'Which CAPA items are not closing the loop?'],
    outputs: ['weekly defect story', 'CAPA focus list', 'evidence-linked closeout board'],
  },
  {
    id: 'supplier-recovery-story',
    role: 'Procurement / finance',
    name: 'Supplier recovery story',
    route: '/app/approvals',
    inputs: ['supplier recovery mart', 'finance mail evidence', 'GRN exceptions'],
    questions: ['Which discrepancies are blocking production or payment?', 'Which suppliers are slow or incomplete?', 'Which approvals are aging without evidence?'],
    outputs: ['supplier debt view', 'approval packets', 'escalation shortlist'],
  },
  {
    id: 'sales-demand-story',
    role: 'Sales lead',
    name: 'Sales and demand story',
    route: '/app/revenue',
    inputs: ['commercial demand mart', 'dealer account reviews', 'campaign and web signals'],
    questions: ['Which accounts or products are moving?', 'Which inquiries are not converting?', 'Where should follow-up or pricing focus next?'],
    outputs: ['dealer movement brief', 'follow-up priorities', 'demand mix summary'],
  },
  {
    id: 'admin-data-quality-story',
    role: 'Tenant admin',
    name: 'Admin data-quality story',
    route: '/app/platform-admin',
    inputs: ['whole-folder operating memory', 'source event registry', 'feature mart freshness', 'writeback completeness'],
    questions: ['Which feeds are stale?', 'Which topics are missing structured records?', 'Where is human writeback incomplete or duplicated?'],
    outputs: ['data-quality brief', 'connector gap queue', 'training and form fixes'],
  },
] as const

const WRITEBACK_DOWNSTREAM_MAP: Record<
  string,
  {
    marts: string[]
    stories: string[]
  }
> = {
  'receiving-intake-entry': {
    marts: ['supplier recovery and GRN mart', 'plant flow and industrial engineering mart'],
    stories: ['Supplier recovery story', 'Plant shift and engineering story'],
  },
  'quality-closeout-entry': {
    marts: ['quality loss and release mart', 'executive KPI and storytelling mart'],
    stories: ['Quality technical story', 'CEO daily brief'],
  },
  'strategy-gap-entry': {
    marts: ['executive KPI and storytelling mart'],
    stories: ['CEO daily brief', 'Admin data-quality story'],
  },
  'maintenance-work-entry': {
    marts: ['plant flow and industrial engineering mart', 'quality loss and release mart'],
    stories: ['Plant shift and engineering story', 'Quality technical story'],
  },
  'operations-root-cause-entry': {
    marts: ['plant flow and industrial engineering mart', 'quality loss and release mart'],
    stories: ['Plant shift and engineering story', 'CEO daily brief'],
  },
  'supplier-recovery-entry': {
    marts: ['supplier recovery and GRN mart', 'executive KPI and storytelling mart'],
    stories: ['Supplier recovery story', 'Finance approval story'],
  },
  'account-review-entry': {
    marts: ['commercial demand and dealer mart', 'executive KPI and storytelling mart'],
    stories: ['Sales and demand story', 'CEO daily brief'],
  },
  'director-exception-note': {
    marts: ['executive KPI and storytelling mart'],
    stories: ['CEO daily brief', 'Admin data-quality story'],
  },
}

const DATA_COPILOT_IDS = [
  'intake-router',
  'operations-reliability',
  'manufacturing-genealogy',
  'quality-watch',
  'supplier-recovery',
  'commercial-memory',
  'data-science',
  'director-brief',
] as const

function toDataCopilot(playbook: AgentPlaybook): YangonTyreDataCopilot {
  return {
    id: playbook.id,
    name: playbook.name,
    leadRole: playbook.leadRole,
    mission: playbook.mission,
    cadence: playbook.cadence,
    outputs: playbook.outputs,
    writePolicy: playbook.writePolicy,
  }
}

export function buildYangonTyreDataCopilots() {
  const model = getAgentOperatingModel('ytf-plant-a')
  const playbookIndex = new Map(model.playbooks.map((playbook) => [playbook.id, playbook]))
  return DATA_COPILOT_IDS.map((id) => playbookIndex.get(id)).filter((playbook): playbook is AgentPlaybook => Boolean(playbook)).map(toDataCopilot)
}

function toWritebackLane(surface: EntrySurface): YangonTyreWritebackLane {
  const downstream = WRITEBACK_DOWNSTREAM_MAP[surface.id] ?? { marts: [], stories: [] }

  return {
    id: surface.id,
    name: surface.name,
    route: surface.route ?? '/app/meta',
    users: surface.users,
    captures: surface.captures,
    qualityRules: surface.qualityRules,
    downstreamMarts: downstream.marts,
    downstreamStories: downstream.stories,
  }
}

export function buildYangonTyreWritebackLanes() {
  return YANGON_TYRE_MODEL.dataEntrySurfaces.map(toWritebackLane)
}

export function summarizeYangonTyreDataFabric() {
  const copilots = buildYangonTyreDataCopilots()
  const writebackLanes = buildYangonTyreWritebackLanes()
  const liveSourcePacks = YANGON_TYRE_SOURCE_PACKS.filter((pack) => pack.status === 'live').length
  const liveConnectors = YANGON_TYRE_CONNECTOR_EXPANSION.filter((item) => item.status === 'live').length
  const mappedConnectors = YANGON_TYRE_CONNECTOR_EXPANSION.filter((item) => item.status === 'mapped').length

  return {
    sourcePackCount: YANGON_TYRE_SOURCE_PACKS.length,
    liveSourcePacks,
    connectorTrackCount: YANGON_TYRE_CONNECTOR_EXPANSION.length,
    liveConnectors,
    mappedConnectors,
    pipelineStageCount: YANGON_TYRE_DATA_PIPELINE_STAGES.length,
    topicPipelineCount: YANGON_TYRE_TOPIC_PIPELINES.length,
    featureMartCount: YANGON_TYRE_FEATURE_MARTS.length,
    roleStoryCount: YANGON_TYRE_ROLE_STORIES.length,
    copilotCount: copilots.length,
    writebackLaneCount: writebackLanes.length,
  }
}
