export type MetaToolsStatus = 'Live' | 'Ready' | 'Needs wiring' | 'Blocked'

export type MetaToolControlLane = {
  id: string
  name: string
  purpose: string
  status: MetaToolsStatus
  owner: string
  route: string
  primaryAction: string
  infrastructure: string[]
  evidence: string
}

export type MetaToolRunAction = {
  id: string
  name: string
  trigger: string
  cadence: string
  owner: string
  route: string
  safeMode: string
  output: string
}

export type MetaToolExternalRuntime = {
  id: string
  name: string
  role: string
  status: MetaToolsStatus
  scalePath: string
  controlSurface: string
  route: string
}

export type MetaToolAccessResource = {
  id: string
  name: string
  category: string
  accessPattern: string
  controlRoute: string
  riskControl: string
}

export const META_TOOLS_SUMMARY = {
  controlLanes: 11,
  externalRuntimes: 8,
  runActions: 12,
  accessResources: 10,
  operatingRule: 'Separate the public site, internal builder, client portals, and experiments before scaling agents.',
} as const

export const META_TOOL_CONTROL_LANES: MetaToolControlLane[] = [
  {
    id: 'cloud-runtime',
    name: 'Cloud runtime',
    purpose: 'Move agent work from local sessions into scheduled jobs, worker services, and deployment environments.',
    status: 'Ready',
    owner: 'Runtime Pod',
    route: '/app/cloud',
    primaryAction: 'Promote repeatable jobs into cloud workers with queue, retry, and alert policy.',
    infrastructure: ['Vercel app host', 'Cloud Run worker lane', 'GitHub Actions', 'scheduled jobs'],
    evidence: 'Cloud control surfaces, topology, providers, and workspace resources.',
  },
  {
    id: 'agent-workforce',
    name: 'Agent workforce',
    purpose: 'Run specialized AI workers for revenue, ops, data quality, support, research, and release checks.',
    status: 'Ready',
    owner: 'Agent Ops',
    route: '/app/workforce',
    primaryAction: 'Assign jobs to role-specific crews with review gates and evidence logs.',
    infrastructure: ['worker registry', 'assignment queue', 'agent playbooks', 'review cycles'],
    evidence: 'Workforce registry, apply status, assignments, and automation lanes.',
  },
  {
    id: 'supermega-dev',
    name: 'supermega.dev control',
    purpose: 'Manage the public domain, app host, deploy scripts, smoke checks, and release posture.',
    status: 'Ready',
    owner: 'Release Pod',
    route: '/app/supermega-dev',
    primaryAction: 'Keep deploy, smoke, domain, and instruction resources visible before promotion.',
    infrastructure: ['root domain', 'app host', 'deployment scripts', 'smoke scripts'],
    evidence: 'Domain reports, edge hosts, machine summary, and deployment resources.',
  },
  {
    id: 'public-sales-machine',
    name: 'Public sales machine',
    purpose: 'Keep the public site simple, fast, contactable, and tied to the live lead ledger.',
    status: 'Ready',
    owner: 'Growth Pod',
    route: '/app/supermega-dev',
    primaryAction: 'Run the public live check, repair domain drift, and keep one clear customer CTA.',
    infrastructure: ['supermega.dev', 'contact intake', 'lead ledger', 'social assets'],
    evidence: 'Public alias lock, route smoke, lead smoke, and usability audit.',
  },
  {
    id: 'agent-tool-and-social-oauth',
    name: 'Agent tools and social OAuth',
    purpose: 'Track researched agent frameworks, social connector readiness, and approval-gated posting before any external automation.',
    status: 'Ready',
    owner: 'Growth and Agent Ops',
    route: '/app/supermega-dev',
    primaryAction: 'Run agent:tools and social:oauth, then approve posts manually until provider tokens and audit rows are verified.',
    infrastructure: ['agent tool radar', 'social OAuth readiness', 'LinkedIn/Facebook drafts', 'YouTube upload lane'],
    evidence: 'agent-tool-stack-radar.json, social-oauth-readiness.json, and social-post-queue.json.',
  },
  {
    id: 'client-portal-factory',
    name: 'Client portal factory',
    purpose: 'Create dedicated client portals from repeatable modules without mixing them into the public website.',
    status: 'Needs wiring',
    owner: 'Solution Pod',
    route: '/app/factory',
    primaryAction: 'Promote each client portal into its own project, domain, roles, data sources, and QA path.',
    infrastructure: ['tenant template', 'role modules', 'connector pack', 'client domain'],
    evidence: 'Portal manifest, source registry, role access, and rollout checklist.',
  },
  {
    id: 'side-job-factory',
    name: 'Side-job factory',
    purpose: 'Turn small sellable experiments into separate products with their own offer, demo, and support path.',
    status: 'Needs wiring',
    owner: 'Product Pod',
    route: '/app/product-ops',
    primaryAction: 'Use separate lab domains and only promote experiments after contact, QA, and support are real.',
    infrastructure: ['lab project', 'offer page', 'smoke test', 'support mailbox'],
    evidence: 'Experiment ledger, QA result, public proof, and conversion signal.',
  },
  {
    id: 'connector-plane',
    name: 'Connector plane',
    purpose: 'Link Google Drive, Gmail, Sheets, app APIs, and customer data into governed operating records.',
    status: 'Needs wiring',
    owner: 'Data Pod',
    route: '/app/connectors',
    primaryAction: 'Expose connector freshness, credentials, sync scope, and failure recovery in one plane.',
    infrastructure: ['Google Drive', 'Gmail', 'Sheets exports', 'customer app APIs'],
    evidence: 'Source registry, sync freshness, token posture, and extracted records.',
  },
  {
    id: 'model-control',
    name: 'Model control',
    purpose: 'Route work across model providers, evaluate results, and keep AI decisions inspectable.',
    status: 'Ready',
    owner: 'Model Ops',
    route: '/app/model-ops',
    primaryAction: 'Use provider lanes, routing rules, benchmark drills, and fallback policy before autonomy expands.',
    infrastructure: ['provider gateway', 'routing contracts', 'benchmark drills', 'crew lanes'],
    evidence: 'Provider status, model routing, benchmark runs, and operator decisions.',
  },
  {
    id: 'data-fabric',
    name: 'Data fabric',
    purpose: 'Turn messy folders and operational records into features, stories, alerts, and role-specific workspaces.',
    status: 'Ready',
    owner: 'Knowledge Pod',
    route: '/app/data-fabric',
    primaryAction: 'Keep ingestion, feature marts, trust scoring, and role stories tied to source evidence.',
    infrastructure: ['source registry', 'feature marts', 'learning database', 'role stories'],
    evidence: 'Trust score, source packs, writeback lanes, and pipeline stages.',
  },
  {
    id: 'security-policy',
    name: 'Security and policy',
    purpose: 'Control access, approvals, secrets, browser actions, data writes, and agent boundaries.',
    status: 'Needs wiring',
    owner: 'Control Pod',
    route: '/app/security',
    primaryAction: 'Separate safe read-only runs from write actions, credentials, and customer data mutation.',
    infrastructure: ['role capabilities', 'policy control', 'approval queue', 'secret boundaries'],
    evidence: 'Capability checks, audit rows, approval gates, and policy exceptions.',
  },
]

export const META_TOOL_RUN_ACTIONS: MetaToolRunAction[] = [
  {
    id: 'portal-smoke',
    name: 'Portal smoke',
    trigger: 'PowerShell wrapper or CI job',
    cadence: 'Every release and major route change',
    owner: 'Release Pod',
    route: '/app/meta-ops',
    safeMode: 'Uses local SQLite and skips protected public API checks.',
    output: 'Build result, route statuses, app health, role gates, workforce readiness.',
  },
  {
    id: 'public-live-check',
    name: 'Public live check',
    trigger: 'supermega_machine public-live',
    cadence: 'Before sharing the site and after every Vercel deploy',
    owner: 'Growth Pod',
    route: '/app/supermega-dev',
    safeMode: 'Repairs public aliases from the lock and skips extra live lead posts by default.',
    output: 'Public domain, contact API, lead ledger, route smoke, and browser usability status.',
  },
  {
    id: 'deploy-separation-check',
    name: 'Deploy separation check',
    trigger: 'supermega_machine separation-check',
    cadence: 'Before moving domains or deploying app/client surfaces',
    owner: 'Release Pod',
    route: '/app/supermega-dev',
    safeMode: 'Read-only Vercel project and alias inspection.',
    output: 'JSON showing missing projects, wrong aliases, public drift, and next commands.',
  },
  {
    id: 'route-export-audit',
    name: 'Static route export audit',
    trigger: 'Showroom build pipeline',
    cadence: 'Every public or app route addition',
    owner: 'Frontend Pod',
    route: '/app/supermega-dev',
    safeMode: 'Read-only route and asset verification.',
    output: 'Deep-link coverage for Vercel/static hosting.',
  },
  {
    id: 'workforce-apply',
    name: 'Workforce apply',
    trigger: 'Manager-controlled internal action',
    cadence: 'Daily or before sprint/release planning',
    owner: 'Agent Ops',
    route: '/app/workforce',
    safeMode: 'Manager writes only; member and finance roles are blocked.',
    output: 'Applied assignments, review tasks, queued jobs, processed jobs.',
  },
  {
    id: 'agent-batch',
    name: 'Agent batch',
    trigger: 'Agent queue worker',
    cadence: 'Hourly or event-driven',
    owner: 'Runtime Pod',
    route: '/app/agent-space',
    safeMode: 'Tagged runs with review and no silent customer writes.',
    output: 'Run rows, summaries, artifacts, next actions.',
  },
  {
    id: 'connector-sync',
    name: 'Connector sync',
    trigger: 'Connector scheduler',
    cadence: 'Every 15-60 minutes by source criticality',
    owner: 'Data Pod',
    route: '/app/connectors',
    safeMode: 'Read-first sync with explicit writeback lanes.',
    output: 'Freshness, token status, source counts, extraction deltas.',
  },
  {
    id: 'data-quality-check',
    name: 'Data quality check',
    trigger: 'Data fabric job',
    cadence: 'Daily and after ingestion changes',
    owner: 'Knowledge Pod',
    route: '/app/data-quality',
    safeMode: 'Flags issues before changing operating records.',
    output: 'Trust score, missing fields, source drift, recommended fixes.',
  },
  {
    id: 'model-eval-drill',
    name: 'Model eval drill',
    trigger: 'Model Ops benchmark run',
    cadence: 'Before model/provider/prompt changes',
    owner: 'Model Ops',
    route: '/app/model-ops',
    safeMode: 'Benchmarks against fixtures before production use.',
    output: 'Provider score, latency, cost, failure modes, routing decision.',
  },
  {
    id: 'release-promotion',
    name: 'Release promotion',
    trigger: 'GitHub/Vercel deploy workflow',
    cadence: 'After smoke, review, and domain checks pass',
    owner: 'Release Pod',
    route: '/app/product-ops',
    safeMode: 'Promotion only after app smoke and rollback path are visible.',
    output: 'Deployment URL, commit, env, smoke status, rollback note.',
  },
  {
    id: 'agent-tool-radar-refresh',
    name: 'Agent tool radar refresh',
    trigger: 'new framework, security pattern, or product module gap',
    cadence: 'Weekly and before major platform claims',
    owner: 'Agent Ops',
    route: '/app/agent-workbench',
    safeMode: 'Updates public-safe framework decisions and implementation queue only.',
    output: 'Agent tool stack radar JSON/MD with adoption lanes, source links, and next build queue.',
  },
  {
    id: 'social-oauth-readiness',
    name: 'Social OAuth readiness',
    trigger: 'new OAuth artifact, token, redirect URI, or posting connector work',
    cadence: 'Before posting automation and after secret rotation',
    owner: 'Growth Pod',
    route: '/app/revenue',
    safeMode: 'Reports only key names and artifact presence; never prints secret values.',
    output: 'Provider readiness, missing setup, private-test status, and publish-blocking gates.',
  },
]

export const META_TOOL_EXTERNAL_RUNTIMES: MetaToolExternalRuntime[] = [
  {
    id: 'github-actions',
    name: 'GitHub Actions',
    role: 'CI, release checks, static route verification, security drills.',
    status: 'Ready',
    scalePath: 'Promote every repeatable local check into a non-destructive workflow.',
    controlSurface: 'supermega.dev control and Meta Ops',
    route: '/app/supermega-dev',
  },
  {
    id: 'vercel-app',
    name: 'Vercel app host',
    role: 'Public site, app shell, serverless API, route and asset delivery.',
    status: 'Ready',
    scalePath: 'Keep public/app hosts isolated, then attach observability and queue-backed jobs.',
    controlSurface: 'supermega.dev control',
    route: '/app/supermega-dev',
  },
  {
    id: 'separated-vercel-projects',
    name: 'Separated Vercel projects',
    role: 'Dedicated public, internal app, client portal, and lab product deployment boundaries.',
    status: 'Needs wiring',
    scalePath: 'Create projects, copy env vars, attach domains, then deploy each surface independently.',
    controlSurface: 'supermega.dev control',
    route: '/app/supermega-dev',
  },
  {
    id: 'cloud-workers',
    name: 'Cloud workers',
    role: 'Long-running agent jobs, connector sync, browser automation, and data processing.',
    status: 'Needs wiring',
    scalePath: 'Start with scheduled worker pods, then add queues, retries, and run evidence.',
    controlSurface: 'Cloud Ops',
    route: '/app/cloud',
  },
  {
    id: 'connector-services',
    name: 'Connector services',
    role: 'Drive, Gmail, Sheets, and customer system ingestion outside manual sessions.',
    status: 'Needs wiring',
    scalePath: 'Use source scopes, token checks, freshness windows, and recovery playbooks.',
    controlSurface: 'Connectors',
    route: '/app/connectors',
  },
  {
    id: 'model-gateway',
    name: 'Model gateway',
    role: 'Provider routing, fallback, cost control, and benchmark-driven model selection.',
    status: 'Ready',
    scalePath: 'Route by task type, latency, price, reliability, and eval score.',
    controlSurface: 'Model Ops',
    route: '/app/model-ops',
  },
  {
    id: 'anthropic-claude-code',
    name: 'Claude Code / Anthropic',
    role: 'Independent provider lane for managed-agent manifests, second-model review, and code/design critique.',
    status: 'Needs wiring',
    scalePath: 'Install Claude Code, set ANTHROPIC_API_KEY in the right runtime, then promote it through Model Ops as a critic lane first.',
    controlSurface: 'Model Ops and Agent Workbench',
    route: '/app/model-ops',
  },
  {
    id: 'evidence-ledger',
    name: 'Evidence ledger',
    role: 'Saved outputs, screenshots, source links, tasks, approvals, and decisions for every run.',
    status: 'Needs wiring',
    scalePath: 'Make every agent action inspectable before increasing autonomy.',
    controlSurface: 'Runtime and Data Fabric',
    route: '/app/runtime',
  },
]

export const META_TOOL_ACCESS_RESOURCES: MetaToolAccessResource[] = [
  {
    id: 'repo',
    name: 'Repository workspace',
    category: 'Code and release',
    accessPattern: 'GitHub workflow plus local/developer execution lane.',
    controlRoute: '/app/supermega-dev',
    riskControl: 'Branch checks, smoke evidence, no destructive workspace commands.',
  },
  {
    id: 'tenant-db',
    name: 'Tenant database',
    category: 'Operating records',
    accessPattern: 'Role-gated API writes with local SQLite smoke fallback.',
    controlRoute: '/app/platform-admin',
    riskControl: 'Workspace isolation, role capabilities, write audit rows.',
  },
  {
    id: 'drive',
    name: 'Google Drive',
    category: 'Customer source data',
    accessPattern: 'Read-first source registry with explicit writeback routes.',
    controlRoute: '/app/connectors',
    riskControl: 'Token posture, folder scopes, source evidence links.',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    category: 'Communications',
    accessPattern: 'Cached status probes and controlled draft/send lanes.',
    controlRoute: '/app/connectors',
    riskControl: 'Draft-first operations and sender approval gates.',
  },
  {
    id: 'browser',
    name: 'Browser/computer worker',
    category: 'Knowledge-work actions',
    accessPattern: 'Sandboxed browser tasks with screenshots, text extraction, and run summaries.',
    controlRoute: '/app/agent-space',
    riskControl: 'Read-only default, domain allowlists, artifacts for review.',
  },
  {
    id: 'models',
    name: 'Model providers',
    category: 'LLM execution',
    accessPattern: 'Task-routed OpenAI, Anthropic, and fallback provider lanes with benchmark and fallback policy.',
    controlRoute: '/app/model-ops',
    riskControl: 'Eval before promotion, cost/latency monitoring, output review.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic / Claude Code',
    category: 'LLM execution',
    accessPattern: 'Second-model critic and managed-agent manifest lane for code, workflow, and module-review tasks.',
    controlRoute: '/app/model-ops',
    riskControl: 'Enable only after CLI/key checks pass; keep customer data behind source packets and staged output review.',
  },
  {
    id: 'secrets',
    name: 'Secrets and credentials',
    category: 'Security',
    accessPattern: 'Environment-level secrets, never product UI secrets.',
    controlRoute: '/app/security',
    riskControl: 'Least privilege, rotation reminders, no credential echoing.',
  },
  {
    id: 'marketing-mailbox',
    name: 'Marketing mailbox',
    category: 'Sales and support',
    accessPattern: 'Contact form and outreach workflows route to swanhtet@supermega.dev with saved lead records.',
    controlRoute: '/app/supermega-dev',
    riskControl: 'No secrets in public pages, mailbox checks stay operator controlled.',
  },
  {
    id: 'social-oauth',
    name: 'LinkedIn, Facebook, and YouTube OAuth',
    category: 'Sales and distribution',
    accessPattern: 'Draft-first social queues with provider OAuth checks and manual publish approval.',
    controlRoute: '/app/revenue',
    riskControl: 'No auto-posting until token scope, account identity, approval row, and provider compliance are verified.',
  },
]

export const META_TOOL_SCALE_SEQUENCE = [
  'Keep every useful local command represented as a run action.',
  'Move repeatable jobs to GitHub Actions, Vercel cron, or worker queues.',
  'Attach every worker to source access, policy, evidence, and review gates.',
  'Expose pause, retry, takeover, and rollback controls before increasing autonomy.',
  'Productize each stable workflow as a sellable app module with tenant-specific context.',
] as const
