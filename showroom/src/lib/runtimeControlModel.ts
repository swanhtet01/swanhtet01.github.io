export type RuntimeHealthStatus = 'Healthy' | 'Warning' | 'Degraded' | 'Needs wiring'

export type RuntimeConnectorFeed = {
  id: string
  name: string
  tenant: 'core' | 'yangon-tyre'
  system: 'Gmail' | 'Google Drive' | 'ERP Export' | 'GitHub' | 'Markdown Vault' | 'Human Entry'
  status: RuntimeHealthStatus
  installState: 'Live' | 'Pilot' | 'Needs wiring'
  credentialMode: string
  cursorMode: string
  lastSuccessAt: string
  replayMode: string
  blastRadius: string
  freshness: string
  owner: string
  workspace: string
  inputs: string[]
  outputs: string[]
  backlog: string
  writeBack: string
  nextAutomation: string
  risks: string[]
}

export type RuntimeConnectorEvent = {
  id: string
  connectorId: string
  connectorName: string
  tenant: 'core' | 'yangon-tyre'
  source: string
  kind: string
  title: string
  detail: string
  route: string
  severity: string
  actor: string
  createdAt: string | null
}

export type KnowledgeCollection = {
  id: string
  name: string
  tenant: 'core' | 'yangon-tyre'
  status: RuntimeHealthStatus
  owner: string
  purpose: string
  sources: string[]
  canonicalRecords: string[]
  relations: string[]
  consumers: string[]
  qualityChecks: string[]
  nextMove: string
}

export type PolicyGuardrail = {
  id: string
  name: string
  domain: 'Connector' | 'Knowledge' | 'Security' | 'Autonomy' | 'Release'
  status: RuntimeHealthStatus
  scope: string
  trigger: string
  automation: string
  approvalGate: string
  auditSignals: string[]
  failureMode: string
}

export type AutonomyRuntimeLoop = {
  id: string
  name: string
  tenant: 'core' | 'yangon-tyre'
  status: RuntimeHealthStatus
  owner: string
  workspace: string
  surface: string
  cadence: string
  automation: string
  approvalGate: string
  backlog: string
  nextMove: string
  risks: string[]
}

export type AgentCapabilityCell = {
  id: string
  name: string
  tenant: 'core' | 'yangon-tyre'
  status: RuntimeHealthStatus
  workspace: string
  mission: string
  trustBoundary: string
  toolClasses: string[]
  dataSources: string[]
  allowedActions: string[]
  approvalGate: string
  observability: string[]
  nextMove: string
  risks: string[]
}

export type ModelRoutingProfile = {
  id: string
  name: string
  status: RuntimeHealthStatus
  preferredModel: string
  fallbackModel: string
  reasoning: string
  useCase: string
  tools: string[]
  safeguards: string[]
  nextMove: string
}

export const RUNTIME_CONNECTOR_FEEDS: RuntimeConnectorFeed[] = [
  {
    id: 'ytf-sales-gmail',
    name: 'YTF Sales Gmail Threads',
    tenant: 'yangon-tyre',
    system: 'Gmail',
    status: 'Warning',
    installState: 'Live',
    credentialMode: 'OAuth mailbox access',
    cursorMode: 'thread delta cursor',
    lastSuccessAt: 'Within the last sync window',
    replayMode: 'Task replay plus manager review',
    blastRadius: 'Yangon Tyre commercial lane',
    freshness: '15 minutes behind mailbox state',
    owner: 'Connector Systems',
    workspace: 'ytf/commercial-memory',
    inputs: ['sales@yangontyre.com threads', 'quote replies', 'inbound prospect messages'],
    outputs: ['account memory updates', 'quote handoff tasks', 'founder brief evidence'],
    backlog: '24 threads waiting attachment and quote-stage classification',
    writeBack: 'Draft replies only after manager review',
    nextAutomation: 'Thread-to-account memory promotion with quote and territory tagging',
    risks: ['Missing attachment lineage on forwarded quote packs', 'Same customer discussed in several aliases'],
  },
  {
    id: 'ytf-procurement-gmail',
    name: 'YTF Procurement Gmail Threads',
    tenant: 'yangon-tyre',
    system: 'Gmail',
    status: 'Degraded',
    installState: 'Pilot',
    credentialMode: 'Mailbox access with manual review',
    cursorMode: 'partial thread replay',
    lastSuccessAt: 'Manual refresh on weekday review cycle',
    replayMode: 'Manual recovery only',
    blastRadius: 'Yangon Tyre supplier recovery lane',
    freshness: 'Manual refresh on weekday review cycle',
    owner: 'Connector Systems',
    workspace: 'ytf/supplier-recovery',
    inputs: ['supplier discrepancy threads', 'shipment notices', 'document requests'],
    outputs: ['supplier recovery board', 'document chase tasks', 'approval evidence'],
    backlog: '42 unresolved discrepancy conversations not linked to a canonical supplier issue',
    writeBack: 'No writeback beyond tagged draft suggestions',
    nextAutomation: 'Bind supplier thread clusters to GRN exceptions and receiving holds',
    risks: ['Supplier names are inconsistent across mailboxes', 'No automated attachment-to-issue mapping yet'],
  },
  {
    id: 'ytf-drive-quality',
    name: 'YTF Drive DQMS and Receiving Folders',
    tenant: 'yangon-tyre',
    system: 'Google Drive',
    status: 'Warning',
    installState: 'Live',
    credentialMode: 'Drive service account index',
    cursorMode: 'folder scan and revision polling',
    lastSuccessAt: 'Hourly index refresh',
    replayMode: 'Folder replay with reviewer tasking',
    blastRadius: 'Yangon Tyre quality and receiving lane',
    freshness: 'Hourly index refresh',
    owner: 'Knowledge Systems',
    workspace: 'ytf/plant-quality',
    inputs: ['receiving photos', 'inspection forms', 'DQMS folders'],
    outputs: ['document intake records', 'DQMS evidence', 'plant review bundles'],
    backlog: '18 files indexed without canonical issue or batch linkage',
    writeBack: 'Folder tagging and review sheet updates',
    nextAutomation: 'Detect file revisions that change inspection status or supplier evidence completeness',
    risks: ['Operators rename folders ad hoc', 'Batch and PO references are missing in several photos'],
  },
  {
    id: 'ytf-erp-export',
    name: 'YTF ERP and GRN Export Lane',
    tenant: 'yangon-tyre',
    system: 'ERP Export',
    status: 'Needs wiring',
    installState: 'Needs wiring',
    credentialMode: 'Manual export handoff',
    cursorMode: 'daily snapshot diff planned',
    lastSuccessAt: 'No native delta feed yet',
    replayMode: 'Snapshot re-import only',
    blastRadius: 'Yangon Tyre operations and finance lane',
    freshness: 'Daily manual export',
    owner: 'Tenant Launch Pod',
    workspace: 'ytf/ops-erp-core',
    inputs: ['GRN exports', 'stock movement files', 'supplier ledger extracts'],
    outputs: ['receiving exception joins', 'inventory pressure signals', 'finance review evidence'],
    backlog: 'Field map is stable but event delta detection is not live',
    writeBack: 'None until field-level policy and reconciliation pass are complete',
    nextAutomation: 'Diff export snapshots and open exceptions when quantities, batch state, or supplier fields drift',
    risks: ['No event stream from source ERP', 'Field names shift between exports and staff-maintained files'],
  },
  {
    id: 'ytf-markdown-vault',
    name: 'YTF Ops Markdown Vault',
    tenant: 'yangon-tyre',
    system: 'Markdown Vault',
    status: 'Healthy',
    installState: 'Live',
    credentialMode: 'Controlled app and vault access',
    cursorMode: 'append and note-save sync',
    lastSuccessAt: 'Synced on note save',
    replayMode: 'Append-only replay',
    blastRadius: 'Yangon Tyre director and knowledge lane',
    freshness: 'Synced on note save',
    owner: 'Knowledge Systems',
    workspace: 'ytf/director-review',
    inputs: ['director notes', 'quality findings', 'supplier follow-up notes'],
    outputs: ['decision journal links', 'entity hints', 'intervention history'],
    backlog: 'Low; main remaining work is normalizing recurring note templates',
    writeBack: 'Append-only summaries into structured operating records',
    nextAutomation: 'Promote recurring note structures into controlled human-entry templates',
    risks: ['Free-form notes still hide some numeric fields', 'Terminology differs by department'],
  },
  {
    id: 'ytf-shopfloor-entry',
    name: 'YTF Shopfloor and Manager Writeback',
    tenant: 'yangon-tyre',
    system: 'Human Entry',
    status: 'Warning',
    installState: 'Live',
    credentialMode: 'Portal login and role-based writeback',
    cursorMode: 'live record writes',
    lastSuccessAt: 'Current app session and daily manager review',
    replayMode: 'Record replay plus coaching loop',
    blastRadius: 'Yangon Tyre writeback and queue lane',
    freshness: 'Live app entry with daily manager review',
    owner: 'Workforce Command',
    workspace: 'ytf/shopfloor-writeback',
    inputs: ['receiving desks', 'DQMS forms', 'maintenance records', 'metric intake', 'manager tasks'],
    outputs: ['structured records', 'role-specific escalations', 'writeback coverage signals'],
    backlog: 'Writeback is live, but stale-lane enforcement and coaching still depend on manual review.',
    writeBack: 'Primary role-based writeback through the portal and guided desks',
    nextAutomation: 'Open manager coaching and connector review work automatically when desks go stale or incomplete.',
    risks: ['Usage discipline still varies by role and shift', 'Some supervisors still rely on chat or side notes before app entry lands'],
  },
  {
    id: 'core-github-build',
    name: 'SuperMega Build GitHub Feed',
    tenant: 'core',
    system: 'GitHub',
    status: 'Warning',
    installState: 'Pilot',
    credentialMode: 'Repository token and release read scope',
    cursorMode: 'issue and release polling',
    lastSuccessAt: 'Every 30 minutes',
    replayMode: 'Release sync rerun',
    blastRadius: 'Core build and release lane',
    freshness: 'Every 30 minutes',
    owner: 'Module Factory',
    workspace: 'core/build-studio',
    inputs: ['issues', 'release notes', 'project state', 'PR status'],
    outputs: ['release desk state', 'program risk flags', 'deployment readiness'],
    backlog: 'PR and release mapping is live, but issue-to-product-line attribution is partial',
    writeBack: 'Status note publishing and release checklist sync',
    nextAutomation: 'Tie product-line release trains directly to issue state and PR readiness',
    risks: ['Several tickets are not labeled by product line', 'Release notes are still partly manual'],
  },
  {
    id: 'core-human-entry',
    name: 'Structured Human Entry Surfaces',
    tenant: 'core',
    system: 'Human Entry',
    status: 'Healthy',
    installState: 'Live',
    credentialMode: 'Portal login and role validation',
    cursorMode: 'live structured writes',
    lastSuccessAt: 'Live app state',
    replayMode: 'Record replay and operator review',
    blastRadius: 'Core platform structured entry lane',
    freshness: 'Live app state',
    owner: 'Prototype Studio',
    workspace: 'core/data-entry',
    inputs: ['architect blueprints', 'receiving logs', 'metric intake', 'decision notes'],
    outputs: ['canonical records', 'quality-controlled forms', 'operator-ready queues'],
    backlog: 'Need more sector templates for procurement, QA, and service operations',
    writeBack: 'Primary app writes with role-based validation',
    nextAutomation: 'Generate sector-specific forms from accepted knowledge and policy templates',
    risks: ['Some tenants still rely on spreadsheet fallback during onboarding'],
  },
]

export const KNOWLEDGE_COLLECTIONS: KnowledgeCollection[] = [
  {
    id: 'ytf-account-memory',
    name: 'YTF Account Memory',
    tenant: 'yangon-tyre',
    status: 'Warning',
    owner: 'Commercial Memory Pod',
    purpose: 'Keep commercial threads, lists, quotes, and director notes attached to canonical account records.',
    sources: ['sales Gmail threads', 'company list rows', 'quote packs', 'founder brief notes'],
    canonicalRecords: ['account', 'contact', 'quote thread', 'territory note'],
    relations: ['account -> contact', 'account -> quote', 'account -> director decision'],
    consumers: ['sales system', 'founder brief', 'director OS'],
    qualityChecks: ['duplicate account detection', 'thread-to-account match confidence', 'quote attachment lineage'],
    nextMove: 'Promote quoted products, customer segments, and next actions into reusable account-memory fields.',
  },
  {
    id: 'ytf-supplier-recovery-graph',
    name: 'YTF Supplier Recovery Graph',
    tenant: 'yangon-tyre',
    status: 'Degraded',
    owner: 'Supplier Recovery Pod',
    purpose: 'Map suppliers, shipments, GRNs, shortages, claims, and approval evidence into one operational graph.',
    sources: ['procurement Gmail', 'ERP exports', 'receiving logs', 'Drive document folders'],
    canonicalRecords: ['supplier', 'shipment', 'GRN exception', 'claim', 'approval packet'],
    relations: ['supplier -> shipment', 'shipment -> GRN exception', 'claim -> approval packet'],
    consumers: ['operations inbox', 'approval policy engine', 'director OS'],
    qualityChecks: ['supplier identity normalization', 'GRN-to-email mapping', 'evidence completeness'],
    nextMove: 'Make GRN and document changes open or resolve supplier recovery work automatically.',
  },
  {
    id: 'ytf-quality-canon',
    name: 'YTF DQMS Canon',
    tenant: 'yangon-tyre',
    status: 'Warning',
    owner: 'Quality Watch Pod',
    purpose: 'Convert inspection files, photos, notes, KPI gaps, and holds into auditable DQMS records.',
    sources: ['Drive quality folders', 'receiving photos', 'markdown notes', 'human-entry DQMS forms'],
    canonicalRecords: ['quality issue', 'inspection run', 'batch evidence', 'closeout decision', 'KPI gap'],
    relations: ['quality issue -> batch evidence', 'quality issue -> supplier', 'closeout decision -> approver'],
    consumers: ['receiving control', 'DQMS and quality methods', 'director review'],
    qualityChecks: ['batch reference completeness', 'approver linkage', 'photo-to-issue traceability'],
    nextMove: 'Bind file revisions, KPI drift, and closeout approvals into the same canonical DQMS issue lifecycle.',
  },
  {
    id: 'core-product-memory',
    name: 'SuperMega Product Memory',
    tenant: 'core',
    status: 'Healthy',
    owner: 'Knowledge Systems',
    purpose: 'Keep product lines, release trains, implementation notes, and competitor teardowns reusable across build teams.',
    sources: ['build notes', 'GitHub release feed', 'tenant rollout notes', 'research backlog'],
    canonicalRecords: ['product line', 'release train', 'tenant proof', 'competitive front'],
    relations: ['product line -> release train', 'tenant proof -> product line', 'competitive front -> product line'],
    consumers: ['build', 'platform admin', 'product portfolio'],
    qualityChecks: ['program ownership completeness', 'release-train freshness', 'tenant-proof evidence links'],
    nextMove: 'Attach real GitHub delivery state and rollout milestones to every product program card.',
  },
  {
    id: 'core-knowledge-runtime',
    name: 'Core Knowledge Runtime',
    tenant: 'core',
    status: 'Needs wiring',
    owner: 'Knowledge Graph Pod',
    purpose: 'Maintain canonical documents, chunks, entities, relations, and provenance as platform services.',
    sources: ['Drive indexes', 'document intake', 'markdown vaults', 'structured human entry'],
    canonicalRecords: ['document', 'chunk', 'entity', 'relation', 'provenance link'],
    relations: ['document -> chunk', 'chunk -> entity', 'entity -> relation', 'relation -> source'],
    consumers: ['document intelligence', 'decision journal', 'director OS', 'future retrieval services'],
    qualityChecks: ['chunk freshness', 'provenance completeness', 'entity collision review'],
    nextMove: 'Land shared retrieval and relation repair so several modules use the same memory services.',
  },
]

export const POLICY_GUARDRAILS: PolicyGuardrail[] = [
  {
    id: 'connector-scope-change',
    name: 'Connector scope change review',
    domain: 'Connector',
    status: 'Healthy',
    scope: 'OAuth scopes, mailbox access, Drive folder access, and source credentials',
    trigger: 'New connector install or scope expansion request',
    automation: 'Prepare requested scopes, impacted workspaces, and source owner summary',
    approvalGate: 'Platform Admin approval required before any scope change lands',
    auditSignals: ['scope diff', 'workspace impact list', 'credential rotation log'],
    failureMode: 'Over-broad access or silent connector sprawl across tenants',
  },
  {
    id: 'knowledge-promotion',
    name: 'Knowledge canon promotion',
    domain: 'Knowledge',
    status: 'Warning',
    scope: 'Promotion of extracted entities, relations, and document structures into canonical records',
    trigger: 'Entity confidence below threshold or schema change proposed',
    automation: 'Queue relation proposals, attach provenance, and route uncertain promotions to knowledge review',
    approvalGate: 'Implementation Lead or Knowledge Systems sign-off required for schema-impacting promotions',
    auditSignals: ['promotion confidence', 'relation rejection rate', 'schema change log'],
    failureMode: 'Bad extractions become source of truth and poison several modules',
  },
  {
    id: 'autonomous-write-boundary',
    name: 'Autonomous write boundary',
    domain: 'Autonomy',
    status: 'Warning',
    scope: 'Agent-created tasks, summaries, draft replies, and record updates',
    trigger: 'Any agent attempts a non-draft write outside approved low-risk fields',
    automation: 'Downgrade to proposed write, attach evidence bundle, and send to owner queue',
    approvalGate: 'Manager or tenant admin review required for medium-risk writes',
    auditSignals: ['proposed vs accepted writes', 'reversal rate', 'failure-class histogram'],
    failureMode: 'Agents move from prep work into unreviewed operational edits',
  },
  {
    id: 'sensitive-field-protection',
    name: 'Sensitive field protection',
    domain: 'Security',
    status: 'Needs wiring',
    scope: 'Pricing, settlement, supplier claims, finance adjustments, and personnel notes',
    trigger: 'Read or write request touches a protected field class',
    automation: 'Apply row and field masking, log access reason, and route write requests through approval policy',
    approvalGate: 'Tenant Admin and Finance Controller approval for write access',
    auditSignals: ['masked-field access log', 'approval latency', 'policy bypass attempts'],
    failureMode: 'Sensitive commercial or finance fields leak across roles or agent runs',
  },
  {
    id: 'sandbox-regression-pack',
    name: 'Sandbox regression pack',
    domain: 'Security',
    status: 'Warning',
    scope: 'Shell execution, workspace isolation, filesystem boundaries, and tool permissions',
    trigger: 'New agent runtime template, tool permission change, or workspace image update',
    automation: 'Run sandbox escape and least-privilege regression scenarios before the runtime is promoted',
    approvalGate: 'Platform Admin and Security Admin sign-off required before runtime promotion',
    auditSignals: ['sandbox regression results', 'tool permission diff', 'workspace template diff'],
    failureMode: 'A coding or browser agent escapes its bounded workspace or gains unintended reach',
  },
  {
    id: 'untrusted-content-quarantine',
    name: 'Untrusted content quarantine',
    domain: 'Connector',
    status: 'Warning',
    scope: 'Web results, emails, docs, chat, and uploaded content entering agent context',
    trigger: 'Any external content is introduced into a tool-using or write-capable run',
    automation: 'Separate raw content from action prompts, preserve provenance, and downgrade risky actions to review tasks',
    approvalGate: 'Connector or manager review required before untrusted content can drive writes',
    auditSignals: ['content provenance links', 'downgraded action count', 'tool-triggered review tasks'],
    failureMode: 'Prompt injection or hostile instructions travel from external content into tool use',
  },
  {
    id: 'memory-poisoning-review',
    name: 'Memory poisoning review',
    domain: 'Knowledge',
    status: 'Needs wiring',
    scope: 'Persistent memory, reusable skills, learned preferences, and canonical knowledge promotions',
    trigger: 'A new memory record, skill pack, or canon promotion is proposed for reuse',
    automation: 'Require provenance, confidence, and rollback path before memory or skill state becomes shared',
    approvalGate: 'Knowledge Systems review required for reusable memory and skill changes',
    auditSignals: ['memory rollback log', 'skill change approvals', 'shared-canon rejection rate'],
    failureMode: 'A poisoned memory or unsafe skill silently spreads to several agents and workspaces',
  },
  {
    id: 'release-gate-enforcement',
    name: 'Release gate enforcement',
    domain: 'Release',
    status: 'Healthy',
    scope: 'Promotion of tenant proofs into reusable product modules and public portfolio claims',
    trigger: 'Product line marked ready for new release train or portfolio graduation',
    automation: 'Assemble proof links, delivery state, tenant signals, and unresolved blockers into one gate packet',
    approvalGate: 'Module Factory plus Governance Runtime approval required for release promotion',
    auditSignals: ['release packet completeness', 'tenant proof count', 'support posture sign-off'],
    failureMode: 'Prototype-level features get marketed as enterprise-ready modules',
  },
]

export const AUTONOMY_RUNTIME_LOOPS: AutonomyRuntimeLoop[] = [
  {
    id: 'ytf-commercial-memory-loop',
    name: 'YTF commercial memory loop',
    tenant: 'yangon-tyre',
    status: 'Warning',
    owner: 'Commercial Memory Pod',
    workspace: 'ytf/commercial-memory',
    surface: 'Sales System',
    cadence: 'Every 30 minutes',
    automation: 'Promote Gmail and company-list changes into account memory and prepare next-step drafts.',
    approvalGate: 'Sales lead review for customer-facing drafts',
    backlog: '17 accounts still need quote-stage normalization and owner confirmation.',
    nextMove: 'Bind company-list changes, quote files, and Gmail threads into one account timeline.',
    risks: ['Duplicate accounts still appear across inbox aliases', 'Quote attachments are not always tied to the same account record'],
  },
  {
    id: 'ytf-supplier-recovery-loop',
    name: 'YTF supplier recovery loop',
    tenant: 'yangon-tyre',
    status: 'Degraded',
    owner: 'Supplier Recovery Pod',
    workspace: 'ytf/supplier-recovery',
    surface: 'Operations Inbox',
    cadence: 'Twice daily',
    automation: 'Cluster procurement threads, receiving holds, and ERP deltas into one recovery queue.',
    approvalGate: 'Procurement lead review for claim and supplier-escalation writes',
    backlog: '11 unresolved supplier claims lack a confirmed GRN or shipment link.',
    nextMove: 'Open and close supplier recovery work automatically when GRN, document, or claim state changes.',
    risks: ['Supplier names drift across inboxes and exports', 'Claims can stay open after the document trail changes'],
  },
  {
    id: 'ytf-quality-watch-loop',
    name: 'YTF DQMS watch loop',
    tenant: 'yangon-tyre',
    status: 'Warning',
    owner: 'Quality Watch Pod',
    workspace: 'ytf/plant-quality',
    surface: 'DQMS and Quality Methods',
    cadence: 'Hourly',
    automation: 'Watch inspection files, receiving issues, KPI drift, and closeout notes for new quality risk or stale evidence.',
    approvalGate: 'Quality manager review for closeout and supplier-impact writes',
    backlog: '9 quality issues still depend on manual photo and batch reconciliation.',
    nextMove: 'Attach Drive revisions, KPI changes, and closeout approvals to the same canonical DQMS lifecycle.',
    risks: ['Photo evidence still arrives without batch references', 'Closeout notes can diverge from the receiving queue'],
  },
  {
    id: 'core-release-watch-loop',
    name: 'Core release watch loop',
    tenant: 'core',
    status: 'Healthy',
    owner: 'Release Watch Pod',
    workspace: 'core/build',
    surface: 'Build',
    cadence: 'Every 15 minutes',
    automation: 'Watch GitHub release state, product-line proofs, and unresolved blockers before a module is promoted.',
    approvalGate: 'Build and Platform Admin review for portfolio or tenant-promotion claims',
    backlog: 'Low; main remaining work is fuller issue-to-program attribution.',
    nextMove: 'Attach PR readiness and rollout milestone state directly to each product program.',
    risks: ['A few tickets still miss product-line labels'],
  },
  {
    id: 'core-runtime-governance-loop',
    name: 'Core runtime governance loop',
    tenant: 'core',
    status: 'Needs wiring',
    owner: 'Governance Runtime',
    workspace: 'core/runtime-governance',
    surface: 'Runtime',
    cadence: 'Daily',
    automation: 'Compare connector, canon, and guardrail posture before new autonomy is allowed to write back.',
    approvalGate: 'Platform Admin approval for any new medium-risk autonomous write path',
    backlog: 'Policy and runtime summaries exist, but the cross-surface promotion gate is still manual.',
    nextMove: 'Join connector lag, knowledge confidence, and policy health into one promotion gate.',
    risks: ['Autonomy can expand faster than the shared runtime evidence', 'No single runtime desk yet blocks unsafe promotion automatically'],
  },
]

export const AGENT_CAPABILITY_CELLS: AgentCapabilityCell[] = [
  {
    id: 'ytf-commercial-pod',
    name: 'YTF commercial pod',
    tenant: 'yangon-tyre',
    status: 'Warning',
    workspace: 'ytf/commercial-memory',
    mission: 'Turn inbox, quote, and lead movement into controlled account memory and next-step drafts.',
    trustBoundary: 'Sandboxed workspace, connector-limited mailbox access, and draft-only external writes.',
    toolClasses: ['Gmail connector', 'knowledge memory', 'skills', 'task writeback'],
    dataSources: ['sales Gmail', 'lead pipeline', 'quote packs', 'manager tasks'],
    allowedActions: ['read evidence', 'classify threads', 'open tasks', 'draft follow-ups', 'propose account updates'],
    approvalGate: 'Sales lead review for customer-facing writes',
    observability: ['connector ledger', 'workspace task review', 'founder brief trace'],
    nextMove: 'Persist thread and attachment deltas as first-class account events instead of summary-only memory.',
    risks: ['External mail can carry prompt injection', 'Attachment lineage is still thinner than account memory needs'],
  },
  {
    id: 'ytf-supplier-recovery-pod',
    name: 'YTF supplier recovery pod',
    tenant: 'yangon-tyre',
    status: 'Degraded',
    workspace: 'ytf/supplier-recovery',
    mission: 'Bind supplier mail, approvals, GRN drift, and receiving holds into one recovery queue.',
    trustBoundary: 'Read-heavy evidence gathering with packet drafting only; no direct supplier writes.',
    toolClasses: ['Gmail connector', 'approvals runtime', 'ERP evidence', 'skills'],
    dataSources: ['procurement Gmail', 'approvals', 'receiving exceptions', 'ERP exports'],
    allowedActions: ['cluster evidence', 'score packet completeness', 'open escalation tasks', 'draft claims'],
    approvalGate: 'Procurement lead review for supplier-facing or finance-sensitive writes',
    observability: ['approval history', 'connector events', 'hold queue aging', 'review tasks'],
    nextMove: 'Add mailbox-native and ERP-native deltas so supplier recovery stops depending on inferred state.',
    risks: ['Supplier identity drifts across systems', 'Claims can move faster than supporting evidence joins'],
  },
  {
    id: 'ytf-quality-watch-pod',
    name: 'YTF quality watch pod',
    tenant: 'yangon-tyre',
    status: 'Warning',
    workspace: 'ytf/plant-quality',
    mission: 'Keep DQMS evidence, receiving variance, and closeout state attached to the same quality lifecycle.',
    trustBoundary: 'Drive and writeback evidence can trigger tasks, but closeout writes stay manager-gated.',
    toolClasses: ['Drive connector', 'document intake', 'human entry', 'skills'],
    dataSources: ['Drive folders', 'receiving photos', 'DQMS forms', 'metric intake'],
    allowedActions: ['index evidence', 'open quality tasks', 'score freshness', 'propose closeout packets'],
    approvalGate: 'Quality manager review for supplier-impact and closeout writes',
    observability: ['file lineage', 'issue aging', 'variance queue', 'metric drift'],
    nextMove: 'Promote file revisions and KPI changes into the same canonical DQMS event stream.',
    risks: ['Folder structure is still partly human-disciplined', 'Photo evidence can land without batch identifiers'],
  },
  {
    id: 'core-build-pod',
    name: 'Core build pod',
    tenant: 'core',
    status: 'Healthy',
    workspace: 'core/build-studio',
    mission: 'Design, code, test, and package reusable modules from bounded cloud workspaces.',
    trustBoundary: 'Sandboxed coding workspace, branch isolation, CI checks, and release-gated promotion.',
    toolClasses: ['GitHub feed', 'shell', 'apply patch', 'skills', 'QA tooling'],
    dataSources: ['repo state', 'release notes', 'product memory', 'runtime findings'],
    allowedActions: ['code changes', 'test runs', 'release packet prep', 'preview packaging'],
    approvalGate: 'Build and Platform Admin review for release and portfolio promotion',
    observability: ['run history', 'release desk', 'CI status', 'runtime governance'],
    nextMove: 'Attach live issue, PR, and release state directly to every product line and launch packet.',
    risks: ['Long-horizon coding still needs stronger automated evals', 'Release truth is ahead of delivery telemetry'],
  },
  {
    id: 'core-governance-pod',
    name: 'Core governance pod',
    tenant: 'core',
    status: 'Warning',
    workspace: 'core/runtime-governance',
    mission: 'Decide when a connector, skill, or autonomous write path is safe enough to scale.',
    trustBoundary: 'Read across runtime evidence, but all medium-risk autonomy expansion stays approval-backed.',
    toolClasses: ['policy engine', 'connector ledger', 'knowledge review', 'audit logs'],
    dataSources: ['runtime control', 'cloud ops', 'connector events', 'approval queues'],
    allowedActions: ['open review tasks', 'downgrade writes', 'block promotion', 'package evidence'],
    approvalGate: 'Platform Admin approval for new medium-risk autonomous capabilities',
    observability: ['guardrail status', 'connector lag', 'approval pressure', 'rollback evidence'],
    nextMove: 'Join eval traces, sandbox regressions, and connector trust into one promotion gate.',
    risks: ['Governance posture is visible before it is fully enforced', 'Memory and skill rollback still need harder controls'],
  },
]

export const MODEL_ROUTING_PROFILES: ModelRoutingProfile[] = [
  {
    id: 'frontier-governance',
    name: 'Frontier planner and reviewer',
    status: 'Healthy',
    preferredModel: 'gpt-5.4',
    fallbackModel: 'gpt-5.4-mini',
    reasoning: 'high to xhigh',
    useCase: 'Architecture, policy synthesis, executive review, cross-workspace root-cause analysis, and approval packets.',
    tools: ['file search', 'web research', 'connector context', 'structured outputs'],
    safeguards: ['citation-backed research', 'approval before medium-risk writes', 'evidence packet required'],
    nextMove: 'Attach scored evals for approval quality, architecture diffs, and escalation decisions.',
  },
  {
    id: 'codex-builder',
    name: 'Long-horizon coding builder',
    status: 'Healthy',
    preferredModel: 'gpt-5.3-codex',
    fallbackModel: 'gpt-5.4-mini',
    reasoning: 'medium to high',
    useCase: 'Repo navigation, controlled code changes, refactors, and production-grade software implementation.',
    tools: ['shell', 'apply patch', 'tests', 'repo history', 'skills'],
    safeguards: ['sandboxed workspaces', 'bounded write scope', 'build or syntax verification'],
    nextMove: 'Route larger migrations and multi-file implementation work here by default, then feed results to review and QA lanes.',
  },
  {
    id: 'crew-operator',
    name: 'High-volume crew operator',
    status: 'Healthy',
    preferredModel: 'gpt-5.4-mini',
    fallbackModel: 'gpt-5.4-nano',
    reasoning: 'low to medium',
    useCase: 'Subagents, browser-based verification, skill execution, daily bug sweeps, and repetitive workflow steps.',
    tools: ['computer use', 'connector calls', 'task queues', 'skills', 'tool search'],
    safeguards: ['task scoping', 'queue isolation', 'approval for external writes', 'trace logging'],
    nextMove: 'Move routine QA, bug triage, and connector review loops into this lane with stronger eval coverage.',
  },
  {
    id: 'extract-classify',
    name: 'Extraction and ranking lane',
    status: 'Warning',
    preferredModel: 'gpt-5.4-nano',
    fallbackModel: 'gpt-5.4-mini',
    reasoning: 'low',
    useCase: 'Classification, data extraction, ranking, feature generation, and cheap background workers.',
    tools: ['structured outputs', 'retrieval', 'batch jobs', 'MCP/connectors'],
    safeguards: ['schema validation', 'confidence thresholds', 'promotion review before canon writeback'],
    nextMove: 'Push inbox triage, document parsing, revision scoring, and KPI feature extraction into durable background jobs.',
  },
]

export function getRuntimeConnectorFeedsForTenant(tenant: RuntimeConnectorFeed['tenant']) {
  return RUNTIME_CONNECTOR_FEEDS.filter((feed) => feed.tenant === tenant)
}

export function getKnowledgeCollectionsForTenant(tenant: KnowledgeCollection['tenant']) {
  return KNOWLEDGE_COLLECTIONS.filter((collection) => collection.tenant === tenant)
}

export function getAutonomyRuntimeLoopsForTenant(tenant: AutonomyRuntimeLoop['tenant']) {
  return AUTONOMY_RUNTIME_LOOPS.filter((loop) => loop.tenant === tenant)
}
