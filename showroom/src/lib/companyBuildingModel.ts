export type BuildTeam = {
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

export type BuildWorkspace = {
  id: string
  name: string
  purpose: string
  owners: string[]
  surfaces: string[]
  reviewCadence: string
}

export type ModuleFactoryStage = {
  id: string
  name: string
  detail: string
  artifacts: string[]
}

export type ReleaseGate = {
  id: string
  name: string
  question: string
  requiredSignals: string[]
  exitCriteria: string
}

export type ModuleProgram = {
  id: string
  name: string
  target: string
  market: string
  stage: string
  owner: string
  researchCell: string
  starterWedge: string
  tenantProof: string
  modules: string[]
  commercialStory: string
  differentiator: string
  releaseTrain: string
  agentCrews: string[]
  successSignals: string[]
  nextMove: string
  nextReleases: string[]
  route: string
}

export type CompetitiveFront = {
  id: string
  name: string
  incumbents: string
  supermegaAngle: string
  whyItMatters: string
}

export type ResearchPriority = {
  id: string
  name: string
  thesis: string
  graduation: string
}

export type ResearchCell = {
  id: string
  name: string
  mandate: string
  ownedBy: string
  supports: string[]
  inputs: string[]
  outputs: string[]
}

export type InternalAgentCrew = {
  id: string
  name: string
  workspace: string
  mission: string
  readScope: string[]
  writeScope: string[]
  cadence: string
  approvalGate: string
}

export const BUILD_TEAMS: BuildTeam[] = [
  {
    id: 'rd-lab',
    name: 'R&D Lab',
    workspace: 'factory/research',
    mission: 'Find the next painful workflow, connector gap, or decision loop worth turning into software.',
    ownership: ['workflow research', 'incumbent teardown', 'eval design', 'problem ranking'],
    outputs: ['problem briefs', 'category maps', 'prototype specs', 'graduation decisions'],
    agentPods: ['Workflow Scout', 'Release Judge'],
    rituals: ['weekly wedge review', 'competitor teardown', 'postmortem mining'],
    metric: 'Turns ambiguous workflow pain into build-ready wedges with evidence and a named owner.',
  },
  {
    id: 'prototype-studio',
    name: 'Prototype Studio',
    workspace: 'factory/prototypes',
    mission: 'Build fast proof systems against real company data before the full module is generalized.',
    ownership: ['tenant proofs', 'pilot UI', 'operator loops', 'human entry experiments'],
    outputs: ['live pilots', 'operator surfaces', 'workflow tests', 'usage evidence'],
    agentPods: ['Prototype Analyst', 'Workflow Scout'],
    rituals: ['daily operator replay', 'pilot acceptance review', 'handoff audit'],
    metric: 'Ships live tenant proofs that teach the platform what the generalized module should be.',
  },
  {
    id: 'module-factory',
    name: 'Module Factory',
    workspace: 'factory/modules',
    mission: 'Turn repeated proofs into reusable products that can scale across tenants.',
    ownership: ['module generalization', 'shared components', 'runtime contracts', 'product packaging'],
    outputs: ['reusable modules', 'module templates', 'launch-ready routes', 'release notes'],
    agentPods: ['Release Judge', 'Knowledge Curator'],
    rituals: ['release gate review', 'module contract review', 'portfolio packaging'],
    metric: 'Graduates prototypes into modules that can be sold, deployed, and supported repeatedly.',
  },
  {
    id: 'connector-systems',
    name: 'Connector Systems',
    workspace: 'platform/connectors',
    mission: 'Own Gmail, Drive, ERP extract, file-event, and source-sync depth so the runtime stays real.',
    ownership: ['sync health', 'source maps', 'event ingestion', 'connector observability'],
    outputs: ['connector runtimes', 'health controls', 'ingest schemas', 'sync policies'],
    agentPods: ['Connector Watch'],
    rituals: ['source reliability review', 'schema drift review', 'sync incident drill'],
    metric: 'Keeps the system attached to live company inputs instead of demo-only data.',
  },
  {
    id: 'knowledge-systems',
    name: 'Knowledge Systems',
    workspace: 'platform/knowledge',
    mission: 'Turn files, messages, notes, and decisions into canonical records and relations.',
    ownership: ['document canon', 'entity extraction', 'knowledge graph', 'retrieval policy'],
    outputs: ['document schemas', 'entity models', 'relation rules', 'knowledge services'],
    agentPods: ['Knowledge Curator', 'Connector Watch'],
    rituals: ['provenance audit', 'entity quality review', 'retrieval test pack'],
    metric: 'Makes the same company memory reusable across every module and agent.',
  },
  {
    id: 'governance-runtime',
    name: 'Governance Runtime',
    workspace: 'platform/governance',
    mission: 'Own roles, policy, audit, approval boundaries, and safe autonomous writes.',
    ownership: ['RBAC', 'approval policy', 'audit posture', 'write gates'],
    outputs: ['role templates', 'security policies', 'approval flows', 'tenant controls'],
    agentPods: ['Release Judge'],
    rituals: ['write-safety review', 'policy diff review', 'tenant access audit'],
    metric: 'Lets the platform scale without becoming unsafe or ungovernable.',
  },
  {
    id: 'tenant-launch',
    name: 'Tenant Launch Pod',
    workspace: 'factory/launch',
    mission: 'Turn the platform into real deployments for named companies, sites, and operating teams.',
    ownership: ['tenant setup', 'domain rollout', 'migration path', 'onboarding discipline'],
    outputs: ['live tenants', 'launch checklists', 'rollout plans', 'adoption loops'],
    agentPods: ['Prototype Analyst', 'Connector Watch'],
    rituals: ['launch readiness review', 'first-week adoption readout', 'tenant gap triage'],
    metric: 'Gets real companies live quickly enough that the platform learns from production.',
  },
]

export const BUILD_WORKSPACES: BuildWorkspace[] = [
  {
    id: 'research-backlog',
    name: 'Research Backlog',
    purpose: 'Ranks workflow pain, market wedges, and product opportunities before engineers build.',
    owners: ['R&D Lab', 'Founder', 'Product lead'],
    surfaces: ['problem briefs', 'competitor teardowns', 'priority scorecards'],
    reviewCadence: 'Weekly wedge review',
  },
  {
    id: 'prototype-floor',
    name: 'Prototype Floor',
    purpose: 'Holds live pilots, operator recordings, data-entry experiments, and acceptance notes.',
    owners: ['Prototype Studio', 'Tenant Launch Pod'],
    surfaces: ['pilot tenants', 'operator loops', 'usability gaps', 'acceptance tests'],
    reviewCadence: 'Daily operator replay',
  },
  {
    id: 'module-release-desk',
    name: 'Module Release Desk',
    purpose: 'Owns generalized module contracts, release gates, pricing narrative, and launch readiness.',
    owners: ['Module Factory', 'Governance Runtime'],
    surfaces: ['module contracts', 'release gates', 'launch notes', 'support posture'],
    reviewCadence: 'Twice-weekly graduation review',
  },
  {
    id: 'runtime-observability',
    name: 'Runtime Observatory',
    purpose: 'Tracks connector health, policy drift, agent runtime reliability, and sync gaps across tenants.',
    owners: ['Connector Systems', 'Knowledge Systems', 'Governance Runtime'],
    surfaces: ['connector health', 'schema drift', 'retry queues', 'audit coverage'],
    reviewCadence: 'Daily runtime health review',
  },
  {
    id: 'tenant-launch-room',
    name: 'Tenant Launch Room',
    purpose: 'Coordinates domains, onboarding, data migration, access, and first-week adoption for named customers.',
    owners: ['Tenant Launch Pod', 'Implementation lead'],
    surfaces: ['tenant checklists', 'domain status', 'migration runs', 'training loops'],
    reviewCadence: 'Launch standup during active rollout',
  },
]

export const MODULE_FACTORY_STAGES: ModuleFactoryStage[] = [
  {
    id: 'pain',
    name: 'Find the painful workflow',
    detail: 'Do not begin from a category page. Begin from a queue, handoff, approval, or data mess that already hurts every day.',
    artifacts: ['problem brief', 'current-tool map', 'role map'],
  },
  {
    id: 'prototype',
    name: 'Prototype on real data',
    detail: 'Build the smallest live surface that can run with actual files, inboxes, exports, and owners.',
    artifacts: ['live proof', 'operator loop', 'data-entry surface'],
  },
  {
    id: 'tenant',
    name: 'Land it in a named tenant',
    detail: 'Run it inside a real company or site workspace so roles, controls, and trust requirements become visible.',
    artifacts: ['tenant rollout', 'role model', 'approval gates'],
  },
  {
    id: 'generalize',
    name: 'Generalize into a reusable module',
    detail: 'Extract what repeats across tenants and move it into shared module logic instead of keeping it as client-only code.',
    artifacts: ['module contract', 'shared UI', 'runtime hooks'],
  },
  {
    id: 'runtime',
    name: 'Attach runtime and agents',
    detail: 'Add connector posture, company memory, policy, and agent loops only after the human workflow is trusted.',
    artifacts: ['agent jobs', 'connector map', 'policy rules'],
  },
  {
    id: 'portfolio',
    name: 'Graduate into the portfolio',
    detail: 'Once the module can survive several tenants, it becomes part of the platform catalog and command layer.',
    artifacts: ['product page', 'sales narrative', 'rollout playbook'],
  },
]

export const RELEASE_GATES: ReleaseGate[] = [
  {
    id: 'research-brief',
    name: 'Research brief cleared',
    question: 'Is the workflow painful enough and common enough to deserve a product bet?',
    requiredSignals: ['named buyer pain', 'current-tool map', 'measurable workflow loss'],
    exitCriteria: 'A build team, a tenant candidate, and a first proof scope are committed.',
  },
  {
    id: 'prototype-proof',
    name: 'Prototype proof accepted',
    question: 'Can a live operator finish the job on real data without falling back to the old tool stack?',
    requiredSignals: ['operator replay', 'first data import', 'time-to-resolution evidence'],
    exitCriteria: 'A tenant uses the proof for live work and the next workflow state is clearer than before.',
  },
  {
    id: 'tenant-ready',
    name: 'Tenant rollout ready',
    question: 'Can the workflow survive real roles, approvals, data mess, and daily review habits?',
    requiredSignals: ['role model', 'approval boundaries', 'tenant onboarding checklist'],
    exitCriteria: 'A named tenant can onboard users, sources, and managers without custom rescue work.',
  },
  {
    id: 'module-ready',
    name: 'Reusable module ready',
    question: 'Has the proof been generalized enough that another tenant can use the same module contract?',
    requiredSignals: ['shared UI contract', 'runtime hooks', 'support notes'],
    exitCriteria: 'The module can launch in another tenant without rebuilding the product from scratch.',
  },
  {
    id: 'autonomy-safe',
    name: 'Autonomy safe',
    question: 'Can agent crews prepare or update work without causing trust failures?',
    requiredSignals: ['eval pack', 'approval gate', 'failure classes', 'audit coverage'],
    exitCriteria: 'Autonomous or semi-autonomous writes are governed, reviewable, and reversible.',
  },
  {
    id: 'portfolio-ready',
    name: 'Portfolio ready',
    question: 'Is this a real product line, not just a successful pilot?',
    requiredSignals: ['sales narrative', 'implementation playbook', 'support posture', 'repeatable pricing story'],
    exitCriteria: 'The module is demoable, sellable, deployable, and supportable as part of the portfolio.',
  },
]

export const MODULE_PROGRAMS: ModuleProgram[] = [
  {
    id: 'revenue-os',
    name: 'Revenue OS',
    target: 'Disrupt CRM stacks by turning sales into an operating system instead of a record silo.',
    market: 'Commercial teams, founders, owner-led distributors, and revenue operators',
    stage: 'Tenant proof + module graduation',
    owner: 'Prototype Studio + Module Factory',
    researchCell: 'Workflow Systems Cell',
    starterWedge: 'Find Clients and Company List',
    tenantProof: 'Distributor prospecting, account cleanup, founder brief',
    modules: ['Sales System', 'Founder Brief', 'Decision Journal'],
    commercialStory: 'Sell a commercial operating system that starts with live prospecting wedges, then expands into account memory, quoting, and director review.',
    differentiator: 'The commercial layer runs from inboxes, lists, tasks, and decisions on one runtime.',
    releaseTrain: 'Weekly revenue-system release train',
    agentCrews: ['Workflow Scout', 'Prototype Analyst', 'Knowledge Curator'],
    successSignals: ['Sales operators trust the account record', 'Follow-up stays current without spreadsheet cleanup', 'Founder review comes from live revenue state'],
    nextMove: 'Deepen Gmail thread ingest, quote handoff, and account memory across several tenants.',
    nextReleases: ['thread-backed account memory', 'quote handoff lane', 'territory review surface'],
    route: '/products/sales-system',
  },
  {
    id: 'ops-erp-core',
    name: 'Ops ERP Core',
    target: 'Disrupt ERP suites by starting from live operational wedges instead of giant suite rollouts.',
    market: 'Plants, procurement teams, warehouses, service operators, and operations leaders',
    stage: 'Named tenant rollout',
    owner: 'Tenant Launch Pod + Connector Systems',
    researchCell: 'Input Systems Cell',
    starterWedge: 'Receiving Control',
    tenantProof: 'Yangon Tyre receiving, supplier recovery, quality closeout',
    modules: ['Operations Inbox', 'Approval Policy Engine', 'Document Intelligence'],
    commercialStory: 'Sell operations control from the plant floor upward, then replace more of the ERP exception, approval, and document stack behind it.',
    differentiator: 'Operational queues, documents, approvals, and exceptions live in one operator-facing layer.',
    releaseTrain: 'Daily operations-hardening release train',
    agentCrews: ['Connector Watch', 'Prototype Analyst', 'Release Judge'],
    successSignals: ['Exceptions are captured the same day', 'Supplier recovery is visible and owned', 'Quality and finance controls survive live rollout'],
    nextMove: 'Finish tenant-scoped state, event-driven file sync, and field-level policy for production rollout.',
    nextReleases: ['supplier recovery lane', 'ERP event ingestion', 'quality closeout workflow'],
    route: '/clients/yangon-tyre',
  },
  {
    id: 'portal-network',
    name: 'Portal Network',
    target: 'Disrupt portal, helpdesk, and client-workspace stacks with one external runtime.',
    market: 'Client service teams, supplier-facing operators, external partners, and support orgs',
    stage: 'Module design',
    owner: 'Module Factory + Governance Runtime',
    researchCell: 'Workflow Systems Cell',
    starterWedge: 'Approval Flow and shared status workspaces',
    tenantProof: 'Client-facing approvals, supplier document requests, shared status rooms',
    modules: ['Client Portal', 'Supplier Portal', 'Support and Service Desk'],
    commercialStory: 'Sell external workspaces that keep clients, suppliers, and service teams on the same memory and approval runtime as internal operators.',
    differentiator: 'External workspaces reuse the same memory, approvals, and agent crews as internal work.',
    releaseTrain: 'Biweekly external-workspace contract train',
    agentCrews: ['Workflow Scout', 'Knowledge Curator', 'Release Judge'],
    successSignals: ['External users stay inside the workspace instead of email loops', 'Approval context stays attached to records', 'Branding and permissions survive multi-tenant rollout'],
    nextMove: 'Generalize branded workspaces, identity boundaries, and support queue contracts.',
    nextReleases: ['supplier discrepancy portal', 'client status room', 'support SLA lane'],
    route: '/products/client-portal',
  },
  {
    id: 'knowledge-runtime',
    name: 'Knowledge Runtime',
    target: 'Disrupt folder-and-note sprawl by turning company knowledge into reusable operating records.',
    market: 'Knowledge-heavy operators, leadership teams, quality teams, and document-heavy businesses',
    stage: 'R&D + infrastructure wiring',
    owner: 'Knowledge Systems + Connector Systems',
    researchCell: 'Knowledge Systems Cell',
    starterWedge: 'Document Intake and Decision Journal',
    tenantProof: 'Markdown vault sync, document intake, decision linkage',
    modules: ['Decision Journal', 'Document Intelligence', 'Director Command Center'],
    commercialStory: 'Sell the memory layer that keeps documents, notes, decisions, and thread evidence reusable across every module and tenant.',
    differentiator: 'Notes, files, threads, and approvals become provenance-backed business memory instead of dead attachments.',
    releaseTrain: 'Twice-weekly memory-canon train',
    agentCrews: ['Connector Watch', 'Knowledge Curator', 'Release Judge'],
    successSignals: ['Documents resolve into canonical records', 'Source provenance survives extraction', 'Several modules reuse the same entity and relation layer'],
    nextMove: 'Ship tenant-scoped documents, chunks, entities, relations, and source-level provenance.',
    nextReleases: ['tenant document canon', 'entity relation services', 'provenance-backed retrieval'],
    route: '/platform',
  },
  {
    id: 'director-os',
    name: 'Director OS',
    target: 'Disrupt dashboards and manual reporting with a live leadership control plane.',
    market: 'Founders, directors, portfolio operators, and multi-site leadership teams',
    stage: 'Control-layer consolidation',
    owner: 'R&D Lab + Governance Runtime',
    researchCell: 'Decision Systems Cell',
    starterWedge: 'Founder Brief and director review',
    tenantProof: 'Founder brief, director command, platform admin',
    modules: ['Founder Brief', 'Director Command Center', 'Platform Admin'],
    commercialStory: 'Sell leadership control as a live operating system built from queues, approvals, risks, and interventions instead of reporting projects.',
    differentiator: 'Leadership review is built from live queues and policy state, not stale reporting projects.',
    releaseTrain: 'Weekly leadership-control train',
    agentCrews: ['Workflow Scout', 'Knowledge Curator', 'Release Judge'],
    successSignals: ['Directors open one control surface instead of requesting updates', 'Cross-tenant risk ranking stays current', 'Interventions are tied to live operating records'],
    nextMove: 'Unify portfolio review, risk ranking, and cross-tenant intervention into one executive surface.',
    nextReleases: ['cross-tenant health scoring', 'intervention log', 'director exception radar'],
    route: '/products/director-command-center',
  },
]

export const COMPETITIVE_FRONTS: CompetitiveFront[] = [
  {
    id: 'erp-suites',
    name: 'ERP suites',
    incumbents: 'Odoo, SAP, NetSuite',
    supermegaAngle: 'Start from live operational wedges and unify the runtime underneath, instead of forcing a giant suite rollout first.',
    whyItMatters: 'Winning here means better adoption, faster rollout, and less process theater.',
  },
  {
    id: 'crm-stacks',
    name: 'CRM and revenue stacks',
    incumbents: 'Salesforce, HubSpot, Pipedrive',
    supermegaAngle: 'Turn CRM from a record silo into a live operating surface tied to inboxes, tasks, approvals, and company memory.',
    whyItMatters: 'The commercial system becomes part of the business, not a separate admin burden.',
  },
  {
    id: 'portal-helpdesk',
    name: 'Portal and service stacks',
    incumbents: 'Zendesk, Intercom, Monday, portal builders',
    supermegaAngle: 'Use one shared runtime for client portals, supplier workspaces, support queues, and delivery control.',
    whyItMatters: 'External work stops spawning separate tools and duplicate context.',
  },
  {
    id: 'bi-ops-glue',
    name: 'BI, spreadsheets, and ops glue',
    incumbents: 'Looker, Power BI, Airtable, spreadsheet ops',
    supermegaAngle: 'Build leadership view and operating memory from live workflow state, not from disconnected reporting projects.',
    whyItMatters: 'Decision speed becomes a product feature, not a reporting afterthought.',
  },
]

export const RESEARCH_PRIORITIES: ResearchPriority[] = [
  {
    id: 'connector-depth',
    name: 'Connector depth',
    thesis: 'The platform only wins if Gmail, Drive, ERP extracts, and file changes become durable runtime inputs.',
    graduation: 'Full thread, attachment, revision, and event depth with health controls.',
  },
  {
    id: 'knowledge-canon',
    name: 'Canonical knowledge layer',
    thesis: 'Documents, notes, and messages need stable document, chunk, entity, relation, and provenance models.',
    graduation: 'Shared knowledge services used by several modules and tenants.',
  },
  {
    id: 'policy-runtime',
    name: 'Policy and governance runtime',
    thesis: 'AI-native software only scales if writes, approvals, and visibility are constrained by real policy.',
    graduation: 'Scoped RBAC, approval engines, sensitive-field rules, and audit coverage.',
  },
  {
    id: 'agent-evals',
    name: 'Agent evaluation and reliability',
    thesis: 'Agent teams need measurable quality, retry logic, and failure classes before they can run the prep layer at scale.',
    graduation: 'Eval packs, runtime scoring, human review loops, and promotion gates.',
  },
]

export const RESEARCH_CELLS: ResearchCell[] = [
  {
    id: 'input-systems',
    name: 'Input Systems Cell',
    mandate: 'Turn Gmail, Drive, ERP exports, uploads, and future system events into dependable runtime inputs.',
    ownedBy: 'Connector Systems',
    supports: ['Ops ERP Core', 'Knowledge Runtime', 'Revenue OS'],
    inputs: ['Gmail threads', 'Drive folders', 'ERP exports', 'uploaded files'],
    outputs: ['connector contracts', 'event ingestion', 'sync observability'],
  },
  {
    id: 'workflow-systems',
    name: 'Workflow Systems Cell',
    mandate: 'Design repeatable operator flows that can survive several tenants instead of staying client-specific.',
    ownedBy: 'Prototype Studio',
    supports: ['Revenue OS', 'Portal Network', 'Ops ERP Core'],
    inputs: ['operator replay', 'tenant pain maps', 'acceptance tests', 'handoff failure notes'],
    outputs: ['workflow contracts', 'starter wedges', 'module-ready surfaces'],
  },
  {
    id: 'knowledge-systems-cell',
    name: 'Knowledge Systems Cell',
    mandate: 'Create the canonical memory layer that turns files, notes, decisions, and messages into reusable business records.',
    ownedBy: 'Knowledge Systems',
    supports: ['Knowledge Runtime', 'Director OS', 'Ops ERP Core'],
    inputs: ['documents', 'markdown vaults', 'decision logs', 'entity proposals'],
    outputs: ['document canon', 'entity models', 'relation rules'],
  },
  {
    id: 'decision-systems',
    name: 'Decision Systems Cell',
    mandate: 'Convert leadership review, approvals, and exceptions into live control systems instead of stale reporting.',
    ownedBy: 'R&D Lab',
    supports: ['Director OS', 'Revenue OS', 'Portal Network'],
    inputs: ['approval drift', 'director reviews', 'policy exceptions', 'escalation patterns'],
    outputs: ['command surfaces', 'exception models', 'decision loops'],
  },
  {
    id: 'autonomy-safety',
    name: 'Autonomy and Safety Cell',
    mandate: 'Make agent crews reliable enough to run continuously without weakening trust, auditability, or policy boundaries.',
    ownedBy: 'Governance Runtime',
    supports: ['All product lines'],
    inputs: ['agent failures', 'eval packs', 'approval logs', 'write-risk reviews'],
    outputs: ['promotion gates', 'eval standards', 'approval patterns'],
  },
]

export function getModuleProgramsForModule(moduleName: string | null | undefined) {
  const normalized = String(moduleName || '')
    .trim()
    .toLowerCase()
  return MODULE_PROGRAMS.filter((program) => program.modules.some((item) => item.toLowerCase() === normalized))
}

export function getResearchCellByName(nameOrId: string | null | undefined) {
  const normalized = String(nameOrId || '')
    .trim()
    .toLowerCase()
  return RESEARCH_CELLS.find((cell) => cell.id === normalized || cell.name.toLowerCase() === normalized) ?? null
}

export const INTERNAL_AGENT_CREWS: InternalAgentCrew[] = [
  {
    id: 'workflow-scout',
    name: 'Workflow Scout',
    workspace: 'factory/research',
    mission: 'Mine tenant pain, support notes, and internal ops drift for the next module-worthy pattern.',
    readScope: ['problem briefs', 'tenant feedback', 'support backlog', 'operator notes'],
    writeScope: ['opportunity ranking', 'research briefs', 'prototype candidates'],
    cadence: 'Daily sweep with weekly review',
    approvalGate: 'R&D lead approves anything promoted into the build queue.',
  },
  {
    id: 'prototype-analyst',
    name: 'Prototype Analyst',
    workspace: 'factory/prototypes',
    mission: 'Compare prototype behavior against real operator behavior and surface the missing human steps.',
    readScope: ['pilot activity', 'operator recordings', 'tenant notes', 'task churn'],
    writeScope: ['gap summaries', 'next experiments', 'acceptance blockers'],
    cadence: 'On every pilot release',
    approvalGate: 'Prototype lead signs off before the next workflow experiment lands.',
  },
  {
    id: 'connector-watch',
    name: 'Connector Watch',
    workspace: 'platform/connectors',
    mission: 'Watch source reliability, schema drift, and sync failure before tenant memory degrades.',
    readScope: ['connector logs', 'source health', 'schema changes', 'retry queues'],
    writeScope: ['health alerts', 'sync priorities', 'runtime incident notes'],
    cadence: 'Continuous monitoring with daily triage',
    approvalGate: 'Connector Systems approves writeback or source-policy changes.',
  },
  {
    id: 'knowledge-curator',
    name: 'Knowledge Curator',
    workspace: 'platform/knowledge',
    mission: 'Keep entities, decisions, and document canon clean enough for several modules to trust.',
    readScope: ['documents', 'decisions', 'entity candidates', 'markdown vault changes'],
    writeScope: ['relation suggestions', 'entity merges', 'knowledge quality notes'],
    cadence: 'Scheduled sync plus exception review',
    approvalGate: 'Knowledge Systems approves canonical merges and sensitive links.',
  },
  {
    id: 'release-judge',
    name: 'Release Judge',
    workspace: 'factory/modules',
    mission: 'Score module readiness against gates so weak pilots do not get mislabeled as products.',
    readScope: ['release notes', 'eval packs', 'tenant readiness', 'support posture'],
    writeScope: ['gate scores', 'release blockers', 'graduation recommendations'],
    cadence: 'At every release gate',
    approvalGate: 'Module Factory and Governance Runtime approve promotion into the portfolio.',
  },
]

export function getInternalAgentCrewDetail(nameOrId: string | null | undefined) {
  const normalized = String(nameOrId || '')
    .trim()
    .toLowerCase()
  return INTERNAL_AGENT_CREWS.find((crew) => crew.id === normalized || crew.name.toLowerCase() === normalized) ?? null
}

export function getInternalAgentCrewDetails(names: string[]) {
  return names
    .map((name) => getInternalAgentCrewDetail(name))
    .filter((crew): crew is InternalAgentCrew => Boolean(crew))
}
