export type AgentSkillToolTier = 'reader' | 'orchestrator' | 'critic' | 'resolver'

export type AgentSkillIndustryKit = 'industrial' | 'restaurant-pos' | 'service-desk' | 'retail-ops' | 'custom'

export type AgentSkillVertical = AgentSkillIndustryKit | 'shared' | 'security'

export type AgentSkill = {
  id: string
  name: string
  vertical: AgentSkillVertical
  summary: string
  toolTier: AgentSkillToolTier
  sourceScope: string
  allowedTools: string[]
  blockedActions: string[]
  inputs: string[]
  outputs: string[]
  reviewGate: string
  evidence: string
  promotedModules: string[]
}

export type AgentCommand = {
  id: string
  label: string
  command: string
  purpose: string
  requires: string[]
  output: string
  reviewPolicy: string
  moduleIds: string[]
}

export type ConnectorBlueprint = {
  id: string
  name: string
  provider: 'Google' | 'GitHub' | 'Vercel' | 'Stripe' | 'Anthropic' | 'OpenAI' | 'Browser' | 'Local files' | 'Local Runtime' | 'Open Source'
  mode: 'read-only' | 'draft-only' | 'staged-write' | 'operator-controlled'
  scope: string
  route: string
  policy: string
  status: 'Ready' | 'Needs secret' | 'Needs install' | 'Prototype'
}

export type AgentTeamTemplate = {
  id: string
  name: string
  industryKits: AgentSkillIndustryKit[]
  mission: string
  route: string
  skills: string[]
  connectors: string[]
  toolTiers: AgentSkillToolTier[]
  handoff: string
  outputArtifact: string
}

export type SuperMegaAgentPattern = {
  name: string
  source: string
  sourceUrl: string
  layers: string[]
  guardrails: string[]
}

export type ManagedAgentManifest = {
  name: string
  model: string
  system: string
  tools: string[]
  callableAgents: string[]
  skills: string[]
  outputs: string[]
}

export type AgentSkillPack = {
  pattern: SuperMegaAgentPattern
  agents: AgentTeamTemplate[]
  skills: AgentSkill[]
  commands: AgentCommand[]
  connectors: ConnectorBlueprint[]
  securityRules: string[]
  managedAgentManifest: ManagedAgentManifest
  claudeSetup: {
    statusChecks: string[]
    missingIf: string[]
    enablementNotes: string[]
  }
}

export const SUPERMEGA_AGENT_REFERENCE_PATTERN: SuperMegaAgentPattern = {
  name: 'Managed skill packs with reader, orchestrator, critic, and resolver agents',
  source: 'Anthropic financial-services reference patterns adapted for SuperMega portal builds',
  sourceUrl: 'https://github.com/anthropics/financial-services',
  layers: [
    'Plugin-style skills: reusable task instructions live beside the product module, not in a one-off chat.',
    'Managed agent manifests: each workcell declares model lane, system prompt, allowed tools, source scope, and callable subagents.',
    'Reader agents handle untrusted files and customer sources without write permission.',
    'Orchestrators dispatch work and aggregate evidence, but do not mutate customer systems.',
    'Critics independently check source coverage, missing evidence, KPI logic, and unsafe tool use.',
    'Resolvers create the final staged artifact only after the critic and human gate are satisfied.',
  ],
  guardrails: [
    'No customer writeback from a reader, critic, or orchestrator.',
    'No browser, Gmail, Drive, Stripe, GitHub, or Vercel action without a named source scope and review owner.',
    'Every handoff must name the target agent, artifact, source references, and approval policy.',
    'Every module promotion needs a smoke check, evidence link, and rollback or manual takeover path.',
  ],
}

export const CONNECTOR_BLUEPRINTS: ConnectorBlueprint[] = [
  {
    id: 'drive-source-registry',
    name: 'Drive source registry',
    provider: 'Google',
    mode: 'read-only',
    scope: 'Folder inventory, file metadata, and approved source packets.',
    route: '/app/connectors',
    policy: 'Read first; writeback requires a module-specific owner gate.',
    status: 'Ready',
  },
  {
    id: 'gmail-intake',
    name: 'Gmail intake lane',
    provider: 'Google',
    mode: 'draft-only',
    scope: 'Labels, sender threads, customer examples, and draft replies.',
    route: '/app/connectors',
    policy: 'Draft responses and classify threads; sending stays human approved.',
    status: 'Ready',
  },
  {
    id: 'sheets-csv-lane',
    name: 'Sheets and CSV lane',
    provider: 'Google',
    mode: 'read-only',
    scope: 'Exports, operational sheets, stock tables, KPI sheets, and close records.',
    route: '/app/data-fabric',
    policy: 'Read and normalize into operating records before any worksheet mutation.',
    status: 'Ready',
  },
  {
    id: 'stripe-package-lane',
    name: 'Stripe package lane',
    provider: 'Stripe',
    mode: 'operator-controlled',
    scope: 'Products, prices, checkout links, invoices, and billing readiness.',
    route: '/app/pricing',
    policy: 'Create or update billing objects only from approved package manifests.',
    status: 'Needs secret',
  },
  {
    id: 'github-release-lane',
    name: 'GitHub release lane',
    provider: 'GitHub',
    mode: 'operator-controlled',
    scope: 'Branch state, PR checks, workflow logs, release notes, and repo hygiene.',
    route: '/app/supermega-dev',
    policy: 'Use GitHub CLI/app auth; never embed tokens in git remotes or product copy.',
    status: 'Ready',
  },
  {
    id: 'vercel-cloud-lane',
    name: 'Vercel deployment lane',
    provider: 'Vercel',
    mode: 'operator-controlled',
    scope: 'Deployments, aliases, domain health, env readiness, cron, and logs.',
    route: '/app/meta-ops',
    policy: 'Promote aliases only after smoke evidence and rollback route are visible.',
    status: 'Ready',
  },
  {
    id: 'anthropic-claude-code-lane',
    name: 'Claude Code and Anthropic lane',
    provider: 'Anthropic',
    mode: 'operator-controlled',
    scope: 'Second-model reviewer, finance-style managed-agent manifests, and code/design critique.',
    route: '/app/model-ops',
    policy: 'Use as a provider lane once CLI and key are installed; keep customer data behind source scopes.',
    status: 'Needs install',
  },
  {
    id: 'openai-agent-execution-lane',
    name: 'OpenAI agent execution lane',
    provider: 'OpenAI',
    mode: 'operator-controlled',
    scope: 'Codex workspaces, tool calls, file patches, test runs, and evidence summaries.',
    route: '/app/workforce',
    policy: 'Patch, verify, and summarize in bounded workspace tasks with human release approval.',
    status: 'Ready',
  },
  {
    id: 'browser-worker-lane',
    name: 'Browser worker lane',
    provider: 'Browser',
    mode: 'staged-write',
    scope: 'Website/app QA, screenshots, source extraction, and repetitive browser workflows.',
    route: '/app/workforce',
    policy: 'Default to read-only and screenshots; form submits or destructive clicks require approval.',
    status: 'Prototype',
  },
  {
    id: 'openclaw-local-lab-lane',
    name: 'OpenClaw local lab lane',
    provider: 'Local Runtime',
    mode: 'operator-controlled',
    scope: 'Local folders, approved desktop/browser workflows, screenshots, redacted source packets, and operator notes.',
    route: '/app/open-source-radar',
    policy: 'R&D only. No production tenant secrets, no external writeback, and every captured source requires operator approval before promotion.',
    status: 'Prototype',
  },
  {
    id: 'openhands-code-bench-lane',
    name: 'OpenHands code bench lane',
    provider: 'Open Source',
    mode: 'operator-controlled',
    scope: 'Isolated repo tasks, patch proposals, QA comparisons, and coding-agent benchmark evidence.',
    route: '/app/agent-workbench',
    policy: 'Use on sandbox or assigned branches only; production release still requires SuperMega QA and founder approval.',
    status: 'Prototype',
  },
  {
    id: 'composio-tool-broker-bench',
    name: 'Composio tool broker bench',
    provider: 'Open Source',
    mode: 'staged-write',
    scope: 'OAuth-backed tool access patterns for Gmail, Drive, GitHub, Slack, Stripe, and other SaaS connectors.',
    route: '/app/meta-tools',
    policy: 'Prototype as a connector broker only after OAuth scope, tenant capability, audit row, and dry-run policy are declared.',
    status: 'Prototype',
  },
  {
    id: 'crawl4ai-web-extraction-lane',
    name: 'Crawl4AI web extraction lane',
    provider: 'Open Source',
    mode: 'read-only',
    scope: 'Permissioned crawl, structured extraction, and source snapshots for monitored websites and portals.',
    route: '/app/open-source-radar',
    policy: 'Allowlist domains, block credential pages, and route every extracted field through reviewer checkpoints.',
    status: 'Prototype',
  },
  {
    id: 'docling-document-intake-lane',
    name: 'Docling document intake lane',
    provider: 'Open Source',
    mode: 'read-only',
    scope: 'Layout-aware parsing for scans, PDF reports, and office docs before KPI extraction.',
    route: '/app/documents',
    policy: 'Treat parsed rows as candidate records until owner review confirms source, date, and metric mapping.',
    status: 'Prototype',
  },
  {
    id: 'qdrant-tenant-memory-lane',
    name: 'Qdrant tenant memory lane',
    provider: 'Open Source',
    mode: 'operator-controlled',
    scope: 'Tenant-scoped vector memory for source-grounded retrieval and operational context search.',
    route: '/app/data-fabric',
    policy: 'Use strict tenant namespace keys and retention policy; keep secrets and raw credentials out of embeddings.',
    status: 'Prototype',
  },
  {
    id: 'litellm-gateway-lane',
    name: 'LiteLLM gateway lane',
    provider: 'Open Source',
    mode: 'operator-controlled',
    scope: 'Model provider routing, fallback policy, spend caps, and request tracing across multiple LLM vendors.',
    route: '/app/model-ops',
    policy: 'Use gateway policy for runtime control but keep approval gates and audit ledgers in SuperMega.',
    status: 'Prototype',
  },
]

export const AGENT_SKILLS: AgentSkill[] = [
  {
    id: 'source-register-reader',
    name: 'Source Register Reader',
    vertical: 'shared',
    summary: 'Classifies Drive, Gmail, Sheets, CSV, PDF, and browser evidence into a source map before module work starts.',
    toolTier: 'reader',
    sourceScope: 'Client-approved source list only.',
    allowedTools: ['Drive list/read', 'Gmail search/read', 'Sheets read', 'PDF/text extraction'],
    blockedActions: ['writeback', 'sending email', 'deleting files', 'changing source files'],
    inputs: ['source links', 'file examples', 'current systems', 'role list'],
    outputs: ['source map', 'missing fields', 'trust score', 'source owner'],
    reviewGate: 'Owner approves source map before ingestion or automation.',
    evidence: 'Every output row links back to a file, thread, sheet, or uploaded example.',
    promotedModules: ['source-intake', 'evidence-brief', 'agent-workcell'],
  },
  {
    id: 'module-manifest-architect',
    name: 'Module Manifest Architect',
    vertical: 'shared',
    summary: 'Turns a client spec into routes, roles, data inputs, KPI, review gate, smoke test, and first-screen UX.',
    toolTier: 'orchestrator',
    sourceScope: 'Approved client brief and source map.',
    allowedTools: ['repo read', 'manifest generation', 'route inventory', 'module contract checks'],
    blockedActions: ['production deploy', 'billing changes', 'customer writeback'],
    inputs: ['client build brief', 'industry kit', 'selected modules', 'source map'],
    outputs: ['portal manifest', 'module contracts', 'build steps', 'QA checklist'],
    reviewGate: 'Founder approves the build brief before code generation or client promises.',
    evidence: 'Manifest includes route, data source, role, KPI, action, and smoke coverage per module.',
    promotedModules: ['login-roles', 'action-board', 'agent-workcell'],
  },
  {
    id: 'industrial-capa-critic',
    name: 'Industrial CAPA Critic',
    vertical: 'industrial',
    summary: 'Checks nonconformance, 5 Why, Ishikawa, containment, corrective action, due owner, and proof quality.',
    toolTier: 'critic',
    sourceScope: 'Quality records, photos, maintenance notes, receiving docs, and CAPA logs.',
    allowedTools: ['source read', 'KPI calculation', 'gap checklist', 'ISO-style evidence review'],
    blockedActions: ['closing CAPA', 'supplier release', 'changing quality records'],
    inputs: ['QC record', 'incident note', 'repeat defect history', 'evidence packet'],
    outputs: ['missing evidence', 'repeat-risk score', 'CAPA critique', 'approval blockers'],
    reviewGate: 'Quality manager approves CAPA closeout.',
    evidence: 'Every critique points to the exact missing record or unsupported claim.',
    promotedModules: ['dqms-capa', 'maintenance-reliability', 'receiving-control'],
  },
  {
    id: 'industrial-ops-resolver',
    name: 'Industrial Ops Resolver',
    vertical: 'industrial',
    summary: 'Drafts the final Floor Action packet after reader and critic evidence are complete.',
    toolTier: 'resolver',
    sourceScope: 'Approved source packet and critic notes.',
    allowedTools: ['draft action packet', 'prepare owner brief', 'create staged task'],
    blockedActions: ['unapproved ERP writeback', 'supplier email send', 'CAPA close without owner'],
    inputs: ['source map', 'critic result', 'owner policy', 'KPI target'],
    outputs: ['owner action brief', 'CAPA draft', 'maintenance action', 'receiving disposition draft'],
    reviewGate: 'Plant or quality owner approves the staged output.',
    evidence: 'Output has action, owner, due date, source references, and close proof requirement.',
    promotedModules: ['plant-manager-home', 'dqms-capa', 'executive-brief'],
  },
  {
    id: 'menu-import-reader',
    name: 'Menu Import Reader',
    vertical: 'restaurant-pos',
    summary: 'Extracts menu items, categories, prices, modifiers, photos, allergens, and missing data from menu files.',
    toolTier: 'reader',
    sourceScope: 'Uploaded menu PDF, images, spreadsheet, website, or chat text.',
    allowedTools: ['OCR', 'table extraction', 'image read', 'CSV parsing'],
    blockedActions: ['publishing menu', 'charging payments', 'editing live catalog'],
    inputs: ['menu image', 'PDF', 'price list', 'category notes'],
    outputs: ['menu item table', 'missing fields', 'normalization notes', 'publish checklist'],
    reviewGate: 'Restaurant owner approves menu before publish.',
    evidence: 'Each item keeps source page/image reference and confidence notes.',
    promotedModules: ['menu-transition', 'prep-stock'],
  },
  {
    id: 'cashup-reconciliation-critic',
    name: 'Cash-Up Reconciliation Critic',
    vertical: 'restaurant-pos',
    summary: 'Checks POS sales, payment settlements, cash count, refunds, discounts, and daily close variance.',
    toolTier: 'critic',
    sourceScope: 'POS export, payment report, cashier note, expense log, and close sheet.',
    allowedTools: ['calculation', 'variance check', 'settlement matching'],
    blockedActions: ['settling payouts', 'voiding transactions', 'editing payment records'],
    inputs: ['payment export', 'cash count', 'POS sales', 'refund list'],
    outputs: ['variance explanation', 'missing proof', 'closeout blockers'],
    reviewGate: 'Owner approves daily close.',
    evidence: 'Variance rows cite source total, counted total, and explanation status.',
    promotedModules: ['payment-cashup', 'shift-board', 'daily-close'],
  },
  {
    id: 'service-closeout-resolver',
    name: 'Service Closeout Resolver',
    vertical: 'service-desk',
    summary: 'Creates the daily close packet for bookings, services, payments, expenses, and client follow-ups.',
    toolTier: 'resolver',
    sourceScope: 'Front desk ledger, booking sheet, payment log, expenses, and follow-up notes.',
    allowedTools: ['draft close note', 'prepare follow-up list', 'stage manager task'],
    blockedActions: ['sending customer messages', 'changing booking/payment records'],
    inputs: ['daily ledger', 'payments', 'expenses', 'client notes'],
    outputs: ['daily close packet', 'follow-up queue', 'variance note'],
    reviewGate: 'Owner or front desk manager approves close.',
    evidence: 'Close packet links service, payment, expense, and follow-up source rows.',
    promotedModules: ['front-desk-ledger', 'appointment-flow', 'client-followup', 'daily-close'],
  },
  {
    id: 'retail-variance-analyst',
    name: 'Retail Variance Analyst',
    vertical: 'retail-ops',
    summary: 'Explains stockout risk, shrinkage, branch variance, supplier claims, and sales/return movement.',
    toolTier: 'critic',
    sourceScope: 'Sales exports, stock sheets, supplier invoices, return logs, and branch notes.',
    allowedTools: ['variance analysis', 'reorder risk scoring', 'supplier claim drafting'],
    blockedActions: ['inventory adjustment writeback', 'supplier message send', 'price change'],
    inputs: ['inventory sheet', 'sales export', 'return log', 'supplier invoice'],
    outputs: ['variance reasons', 'stock action candidates', 'claim packet draft'],
    reviewGate: 'Store manager or owner approves stock and supplier actions.',
    evidence: 'Each recommendation cites SKU, branch, supplier, and source row.',
    promotedModules: ['stock-ledger', 'sales-register', 'supplier-claims', 'branch-variance'],
  },
  {
    id: 'browser-workflow-recorder',
    name: 'Browser Workflow Recorder',
    vertical: 'custom',
    summary: 'Turns repeated SaaS/browser steps into a safe automation candidate with screenshots, fields, and stop points.',
    toolTier: 'reader',
    sourceScope: 'User-approved browser workflow only.',
    allowedTools: ['browser navigation', 'screenshot capture', 'DOM text extraction'],
    blockedActions: ['submitting destructive forms', 'payments', 'deleting records', 'credential capture'],
    inputs: ['workflow URL', 'manual steps', 'sample screenshots', 'done state'],
    outputs: ['automation map', 'risk points', 'fields', 'human approval checkpoints'],
    reviewGate: 'Operator approves automation map before any staged write action.',
    evidence: 'Screenshots and extracted fields are attached to each step.',
    promotedModules: ['agent-workcell', 'action-board', 'approval-review'],
  },
  {
    id: 'local-operator-cartographer',
    name: 'Local Operator Cartographer',
    vertical: 'custom',
    summary: 'Maps local files, desktop/browser steps, repeated manual work, and privacy boundaries into a SuperMega-ready workflow packet.',
    toolTier: 'reader',
    sourceScope: 'Only folders, apps, and URLs named in the local run manifest.',
    allowedTools: ['local file inventory', 'screenshot capture', 'workflow notes', 'redacted evidence export'],
    blockedActions: ['secret capture', 'production writeback', 'background persistence without approval', 'unapproved file upload'],
    inputs: ['allowed folders', 'manual workflow steps', 'sample files', 'privacy exclusions'],
    outputs: ['local workflow packet', 'source redaction checklist', 'automation candidates', 'module manifest inputs'],
    reviewGate: 'Operator approves the workflow packet before any client build or cloud upload.',
    evidence: 'Every captured file or screenshot keeps allowed-source, redaction, and owner-review state.',
    promotedModules: ['source-intake', 'agent-workcell', 'portal-factory'],
  },
  {
    id: 'tool-broker-critic',
    name: 'Tool Broker Critic',
    vertical: 'security',
    summary: 'Checks whether every agent tool has source scope, OAuth scope, action class, risk tier, approval gate, audit row, and rollback note.',
    toolTier: 'critic',
    sourceScope: 'Tool registry, connector manifest, OAuth scopes, and module contracts only.',
    allowedTools: ['tool registry read', 'scope diff', 'policy fixture tests', 'audit evidence review'],
    blockedActions: ['granting OAuth scopes', 'executing action tools', 'changing connector secrets'],
    inputs: ['tool manifest', 'module route', 'capability list', 'OAuth scope list'],
    outputs: ['tool promotion verdict', 'missing policy fields', 'safe-mode recommendation'],
    reviewGate: 'Platform admin approves tool promotion before action tools leave dry-run mode.',
    evidence: 'Findings cite exact tool id, scope, action class, module route, and blocked policy.',
    promotedModules: ['meta-tools', 'connector-ops', 'agent-workcell'],
  },
  {
    id: 'agent-security-redteam',
    name: 'Agent Security Red-Team Critic',
    vertical: 'security',
    summary: 'Tests goal hijack, prompt injection, unsafe tool use, poisoned memory, cross-tenant leakage, and bad delegation.',
    toolTier: 'critic',
    sourceScope: 'Agent manifests, tool permissions, test fixtures, and synthetic adversarial tasks.',
    allowedTools: ['manifest read', 'fixture tests', 'policy checks', 'QA evidence'],
    blockedActions: ['real customer writeback', 'credential inspection', 'secret echoing'],
    inputs: ['agent manifest', 'module contract', 'tool allowlist', 'test fixtures'],
    outputs: ['red-team findings', 'promotion blockers', 'safe-mode recommendation'],
    reviewGate: 'Security or platform admin approves promotion.',
    evidence: 'Each finding links to manifest field, route, tool permission, or failed fixture.',
    promotedModules: ['agent-workcell', 'approval-review', 'login-roles'],
  },
]

export const AGENT_TEMPLATE_LIBRARY: AgentTeamTemplate[] = [
  {
    id: 'client-portal-architect-team',
    name: 'Client Portal Architect Team',
    industryKits: ['industrial', 'restaurant-pos', 'service-desk', 'retail-ops', 'custom'],
    mission: 'Convert a client intake into a portal manifest, module list, source map, first route, and smoke checklist.',
    route: '/app/client-build',
    skills: ['source-register-reader', 'module-manifest-architect', 'agent-security-redteam'],
    connectors: ['drive-source-registry', 'gmail-intake', 'github-release-lane', 'vercel-cloud-lane'],
    toolTiers: ['reader', 'orchestrator', 'critic'],
    handoff: 'Reader builds source map, architect drafts manifest, critic blocks unsafe automation before code work.',
    outputArtifact: 'Portal manifest with modules, roles, sources, review gates, and QA coverage.',
  },
  {
    id: 'industrial-plant-workcell',
    name: 'Industrial Plant Workcell',
    industryKits: ['industrial'],
    mission: 'Run Floor Blockers, CAPA, maintenance, receiving, and owner brief through source-aware review.',
    route: '/app/plant-manager',
    skills: ['source-register-reader', 'industrial-capa-critic', 'industrial-ops-resolver', 'agent-security-redteam'],
    connectors: ['drive-source-registry', 'sheets-csv-lane', 'gmail-intake'],
    toolTiers: ['reader', 'critic', 'resolver'],
    handoff: 'Reader maps source evidence, critic checks quality and KPI logic, resolver prepares the owner packet.',
    outputArtifact: 'Floor Action packet with owner, due date, source proof, KPI impact, and approval state.',
  },
  {
    id: 'restaurant-pos-workcell',
    name: 'Restaurant POS + Inventory Workcell',
    industryKits: ['restaurant-pos'],
    mission: 'Turn menus, payments, shift notes, stock, and guest recovery into a simple store control desk.',
    route: '/app/restaurant-os',
    skills: ['menu-import-reader', 'cashup-reconciliation-critic', 'source-register-reader', 'agent-security-redteam'],
    connectors: ['drive-source-registry', 'sheets-csv-lane', 'stripe-package-lane'],
    toolTiers: ['reader', 'critic', 'resolver'],
    handoff: 'Reader imports menu and close data, critic checks variance, resolver stages owner-approved updates.',
    outputArtifact: 'Store packet with menu table, close variance, stock risks, and manager actions.',
  },
  {
    id: 'service-desk-workcell',
    name: 'Service Desk Workcell',
    industryKits: ['service-desk'],
    mission: 'Run bookings, payments, expenses, client notes, and daily close for small service businesses.',
    route: '/app/service-desk',
    skills: ['service-closeout-resolver', 'source-register-reader', 'cashup-reconciliation-critic', 'agent-security-redteam'],
    connectors: ['gmail-intake', 'sheets-csv-lane', 'stripe-package-lane'],
    toolTiers: ['reader', 'critic', 'resolver'],
    handoff: 'Reader maps ledger sources, critic checks payment/expense variance, resolver stages closeout and follow-up.',
    outputArtifact: 'Daily close packet with payment variance, follow-up list, and manager approval state.',
  },
  {
    id: 'retail-ops-workcell',
    name: 'Retail Ops Workcell',
    industryKits: ['retail-ops'],
    mission: 'Control stock, branch variance, supplier claims, returns, and daily store action review.',
    route: '/app/inventory',
    skills: ['retail-variance-analyst', 'source-register-reader', 'agent-security-redteam'],
    connectors: ['drive-source-registry', 'sheets-csv-lane', 'gmail-intake'],
    toolTiers: ['reader', 'critic', 'resolver'],
    handoff: 'Reader registers stock/sales sources, analyst explains variance, resolver stages approved action.',
    outputArtifact: 'Retail action packet with SKU/branch risks, supplier claims, and owner decisions.',
  },
  {
    id: 'custom-workflow-replacement-team',
    name: 'Custom Workflow Replacement Team',
    industryKits: ['custom'],
    mission: 'Record a repeated SaaS, browser, inbox, or spreadsheet workflow and turn it into a custom portal module.',
    route: '/app/client-build',
    skills: ['browser-workflow-recorder', 'local-operator-cartographer', 'source-register-reader', 'module-manifest-architect', 'agent-security-redteam'],
    connectors: ['browser-worker-lane', 'openclaw-local-lab-lane', 'github-release-lane', 'vercel-cloud-lane', 'openai-agent-execution-lane'],
    toolTiers: ['reader', 'orchestrator', 'critic'],
    handoff: 'Recorder captures the workflow, architect creates the module, critic blocks unsafe automation.',
    outputArtifact: 'Workflow replacement manifest with route, fields, automation candidates, and stop points.',
  },
  {
    id: 'agent-platform-rd-team',
    name: 'Agent Platform R&D Team',
    industryKits: ['custom', 'industrial', 'restaurant-pos', 'service-desk', 'retail-ops'],
    mission: 'Benchmark OpenClaw, OpenHands, browser workers, Docling, Crawl4AI, Qdrant, LiteLLM, tool brokers, and native SuperMega workcells against one real workflow before adopting anything.',
    route: '/app/open-source-radar',
    skills: ['local-operator-cartographer', 'browser-workflow-recorder', 'module-manifest-architect', 'tool-broker-critic', 'agent-security-redteam'],
    connectors: [
      'openclaw-local-lab-lane',
      'openhands-code-bench-lane',
      'browser-worker-lane',
      'composio-tool-broker-bench',
      'crawl4ai-web-extraction-lane',
      'docling-document-intake-lane',
      'qdrant-tenant-memory-lane',
      'litellm-gateway-lane',
    ],
    toolTiers: ['reader', 'orchestrator', 'critic'],
    handoff: 'R&D captures and benchmarks; critic blocks unsafe tool access; architect promotes only the validated module contract.',
    outputArtifact: 'Agent framework bench report with workflow packet, tool policy, security verdict, and production promotion recommendation.',
  },
]

export const AGENT_COMMAND_LIBRARY: AgentCommand[] = [
  {
    id: 'intake-to-manifest',
    label: 'Intake to manifest',
    command: '/supermega-intake-to-manifest',
    purpose: 'Convert client requirements into a portal manifest, first module, source scope, and delivery plan.',
    requires: ['client company', 'industry kit', 'roles', 'current systems', 'workflow pain'],
    output: 'Portal manifest JSON and first-sprint checklist.',
    reviewPolicy: 'Founder approval before client promise or code generation.',
    moduleIds: ['login-roles', 'source-intake', 'agent-workcell'],
  },
  {
    id: 'map-sources',
    label: 'Map sources',
    command: '/supermega-map-sources',
    purpose: 'Classify files, folders, inboxes, sheets, exports, and browser sources into a governed source map.',
    requires: ['approved source list', 'tenant id', 'owner'],
    output: 'Source map, missing fields, trust score, and ingestion risk.',
    reviewPolicy: 'Source owner approval before ingestion.',
    moduleIds: ['source-intake', 'evidence-brief'],
  },
  {
    id: 'draft-capa',
    label: 'Draft CAPA',
    command: '/supermega-draft-capa',
    purpose: 'Prepare containment, root cause, corrective action, evidence gaps, and owner brief for quality incidents.',
    requires: ['QC record', 'incident note', 'repeat history', 'quality owner'],
    output: 'CAPA packet with missing evidence and closeout criteria.',
    reviewPolicy: 'Quality manager approval before CAPA close or supplier/customer message.',
    moduleIds: ['dqms-capa', 'maintenance-reliability', 'receiving-control'],
  },
  {
    id: 'menu-import',
    label: 'Import menu',
    command: '/supermega-menu-import',
    purpose: 'Turn restaurant menu images, PDFs, or sheets into a clean item catalog and publish checklist.',
    requires: ['menu file', 'currency', 'category rules', 'owner'],
    output: 'Menu table, missing data, confidence notes, and publish packet.',
    reviewPolicy: 'Restaurant owner approval before publishing or payment setup.',
    moduleIds: ['menu-transition', 'prep-stock'],
  },
  {
    id: 'cashup-review',
    label: 'Review cash-up',
    command: '/supermega-cashup-review',
    purpose: 'Compare POS totals, payment settlements, cash count, refunds, expenses, and close note.',
    requires: ['POS export', 'settlement report', 'cash count', 'owner'],
    output: 'Variance explanation, missing proof, and closeout recommendation.',
    reviewPolicy: 'Owner approval before daily close is marked complete.',
    moduleIds: ['payment-cashup', 'daily-close'],
  },
  {
    id: 'agent-redteam',
    label: 'Agent red-team',
    command: '/supermega-agent-redteam',
    purpose: 'Test a module agent for prompt injection, unsafe tool use, cross-tenant leakage, and bad delegation.',
    requires: ['agent manifest', 'tool allowlist', 'module route', 'fixtures'],
    output: 'Promotion blockers, safe-mode settings, and QA evidence.',
    reviewPolicy: 'Platform admin approval before autonomous writeback or client release.',
    moduleIds: ['agent-workcell', 'approval-review', 'login-roles'],
  },
  {
    id: 'agent-framework-bench',
    label: 'Bench agent stack',
    command: '/supermega-bench-agent-stack',
    purpose: 'Run one workflow through native SuperMega, OpenClaw local capture, OpenHands code agent, Browser Use/Crawl4AI extraction, Docling parsing, Qdrant retrieval, LiteLLM routing, and tool-broker policy review.',
    requires: ['workflow brief', 'safe sample data', 'allowed sources', 'review owner'],
    output: 'Bench report with score, risks, tool policy, and recommendation to adopt, prototype, or reject.',
    reviewPolicy: 'R&D lead and platform admin approve before framework use touches client data or production writeback.',
    moduleIds: ['agent-workcell', 'meta-tools', 'portal-factory'],
  },
]

const DEFAULT_SECURITY_RULES = [
  'Reader agents can inspect untrusted customer data but cannot write to customer systems.',
  'Orchestrators can assign work and aggregate evidence but cannot silently mutate production records.',
  'Critics are independent and can block promotion when source evidence, KPI logic, or permissions are weak.',
  'Resolvers produce staged artifacts only; a human owner approves writeback, publish, deploy, billing, and external messages.',
  'Every agent run must keep tenant id, source scope, tool allowlist, artifact path, and review owner together.',
] as const

function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

function sourceMatches(sourceInputs: string[], tokens: string[]) {
  const haystack = sourceInputs.join(' ').toLowerCase()
  return tokens.some((token) => haystack.includes(token))
}

function connectorScore(connector: ConnectorBlueprint, sourceInputs: string[]) {
  const checks: Record<string, string[]> = {
    'drive-source-registry': ['drive', 'folder', 'doc', 'pdf', 'file'],
    'gmail-intake': ['gmail', 'email', 'inbox', 'mail', 'whatsapp', 'chat'],
    'sheets-csv-lane': ['sheet', 'csv', 'export', 'excel', 'workbook', 'table'],
    'stripe-package-lane': ['stripe', 'payment', 'checkout', 'invoice', 'billing'],
    'github-release-lane': ['github', 'repo', 'code', 'ci', 'release'],
    'vercel-cloud-lane': ['vercel', 'deploy', 'domain', 'cloud'],
    'anthropic-claude-code-lane': ['claude', 'anthropic', 'critic', 'second model'],
    'browser-worker-lane': ['browser', 'website', 'saas', 'portal', 'click'],
    'openai-agent-execution-lane': ['agent', 'codex', 'openai', 'llm'],
    'openclaw-local-lab-lane': ['local', 'desktop', 'computer', 'folder', 'file', 'workflow'],
    'openhands-code-bench-lane': ['code', 'repo', 'patch', 'developer', 'github', 'module'],
    'composio-tool-broker-bench': ['oauth', 'connector', 'tool', 'saas', 'gmail', 'slack'],
    'crawl4ai-web-extraction-lane': ['website', 'portal', 'crawl', 'web', 'url', 'extract'],
    'docling-document-intake-lane': ['pdf', 'scan', 'document', 'report', 'invoice', 'ocr'],
    'qdrant-tenant-memory-lane': ['knowledge', 'retrieval', 'search', 'memory', 'vector', 'rag'],
    'litellm-gateway-lane': ['model', 'llm', 'provider', 'routing', 'fallback', 'cost'],
  }
  return sourceMatches(sourceInputs, checks[connector.id] ?? []) ? 3 : 0
}

export function buildAgentSkillPack(input: {
  industryKit: AgentSkillIndustryKit
  moduleIds: string[]
  sourceInputs: string[]
}): AgentSkillPack {
  const { industryKit, moduleIds, sourceInputs } = input
  const selectedSkillIds = new Set<string>()
  const matchingAgents = AGENT_TEMPLATE_LIBRARY.filter((agent) => agent.industryKits.includes(industryKit))
  for (const agent of matchingAgents) {
    for (const skillId of agent.skills) selectedSkillIds.add(skillId)
  }
  for (const skill of AGENT_SKILLS) {
    if (skill.vertical === 'shared' || skill.vertical === 'security' || skill.vertical === industryKit) {
      selectedSkillIds.add(skill.id)
    }
    if (skill.promotedModules.some((moduleId) => moduleIds.includes(moduleId))) {
      selectedSkillIds.add(skill.id)
    }
  }
  const skills = AGENT_SKILLS.filter((skill) => selectedSkillIds.has(skill.id)).slice(0, 7)
  const agents = matchingAgents.length ? matchingAgents : AGENT_TEMPLATE_LIBRARY.filter((agent) => agent.industryKits.includes('custom'))
  const commands = AGENT_COMMAND_LIBRARY.filter((command) => {
    if (['intake-to-manifest', 'map-sources', 'agent-redteam'].includes(command.id)) return true
    return command.moduleIds.some((moduleId) => moduleIds.includes(moduleId))
  }).slice(0, 5)
  const connectorIds = unique([
    ...agents.flatMap((agent) => agent.connectors),
    'anthropic-claude-code-lane',
    'openai-agent-execution-lane',
    'vercel-cloud-lane',
    'composio-tool-broker-bench',
  ])
  const connectors = CONNECTOR_BLUEPRINTS
    .filter((connector) => connectorIds.includes(connector.id))
    .map((connector) => ({ connector, score: connectorScore(connector, sourceInputs) }))
    .sort((a, b) => b.score - a.score || a.connector.name.localeCompare(b.connector.name))
    .map((item) => item.connector)
    .slice(0, 8)
  const callableAgents = unique(skills.map((skill) => skill.toolTier))
  return {
    pattern: SUPERMEGA_AGENT_REFERENCE_PATTERN,
    agents,
    skills,
    commands,
    connectors,
    securityRules: [...DEFAULT_SECURITY_RULES],
    managedAgentManifest: {
      name: `supermega-${industryKit}-workcell`,
      model: 'provider-routed-large-model',
      system: 'Use the client portal manifest, source map, and AGENTS.md rules. Produce staged artifacts only.',
      tools: unique(connectors.map((connector) => `${connector.provider}: ${connector.mode}`)),
      callableAgents: callableAgents.map((tier) => `${tier}-agent`),
      skills: skills.map((skill) => skill.name),
      outputs: ['source map', 'module manifest', 'review packet', 'staged task', 'smoke checklist'],
    },
    claudeSetup: {
      statusChecks: ['claude CLI installed', 'ANTHROPIC_API_KEY configured', 'Claude lane approved in Model Ops'],
      missingIf: ['claude command missing', 'anthropic CLI missing', 'ANTHROPIC_API_KEY missing'],
      enablementNotes: [
        'Use Claude as an independent critic/reviewer lane first, not as an unsupervised production writer.',
        'Mirror the managed-agent manifest pattern: reader, orchestrator, critic, resolver, source scope, and callable agents.',
        'Keep customer data behind tenant-scoped source packets and review gates before passing it to any provider.',
      ],
    },
  }
}
