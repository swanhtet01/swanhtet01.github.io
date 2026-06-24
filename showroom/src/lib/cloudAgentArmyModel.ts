export type CloudAgentLane = {
  id: string
  name: string
  provider: string
  trigger: string
  cadence: string
  state: string
  work: string[]
  evidence: string
  gate: string
}

export type CloudAgentPod = {
  id: string
  name: string
  mission: string
  agents: string[]
  owns: string[]
  successMetric: string
  blockedUntil: string
}

export type CloudGrowthStage = {
  id: string
  label: string
  target: string
  agentPod: string
  output: string
  revenueLogic: string
}

export type CloudDispatchItem = {
  id: string
  title: string
  owner: string
  cloudLane: string
  status: 'ready' | 'blocked' | 'designing' | 'approval'
  nextAction: string
  proof: string
}

export type CloudActivationState = {
  id: string
  label: string
  state: 'ready' | 'blocked' | 'designing' | 'approval'
  value: string
  proof: string
  humanUnlock: string
}

export type InvisibleClientRule = {
  id: string
  rule: string
  clientSees: string
  operatorSees: string
  auditSignal: string
}

export type BackgroundWorkcell = {
  id: string
  name: string
  trigger: string
  clientOutput: string
  operatorControl: string
  allowedTools: string[]
  blockedActions: string[]
  evidence: string[]
  reviewGate: string
  route: string
  api: string
  maturity: 'live' | 'ready' | 'prototype' | 'blocked'
}

export type WorkcellQueuePacket = {
  id: string
  workcellId: string
  source: string
  output: string
  reviewOwner: string
  rollback: string
}

export const CLOUD_AGENT_ARMY_CONTRACT = {
  route: '/app/cloud-agent-army',
  name: 'Hosted Operations Control',
  operatingMode: 'Hosted work queues with founder-controlled external action.',
  rule: 'No local recurring task, No outbound publishing, no billing, no production writeback, and no client-facing claim without approval.',
  target: '$100k revenue path from Factory Operations App, Factory Operations App Live State, and Restaurant POS + Inventory starter deployments.',
  ventureTarget: 'Billion-scale platform path from repeatable operations software across factories, distributors, service, retail, and owner-led SMEs.',
  nearTermTarget: '$100k wedge validation through first-screen sprints, paid pilots, and recurring managed app workspaces.',
  activation: 'Ready for Vercel Cron, Cloud Tasks, GitHub Actions, and connector workers after cloud secrets and deployment approval.',
  ledger: 'EnterpriseAgentRun is the durable source of truth for queued jobs, evidence, approval state, risk, and write policy.',
} as const

export const INVISIBLE_CLIENT_AGENT_RULES: InvisibleClientRule[] = [
  {
    id: 'client-sees-software',
    rule: 'Client screens must look like software, not an agent lab.',
    clientSees: 'Dashboard, queue, record, KPI, approval, export, and next action.',
    operatorSees: 'Workcell run, tool scope, prompt class, evidence, risk, and review state.',
    auditSignal: 'Demo routes do not expose Builder, Agent Workbench, cloud runtime, or prompt-library controls.',
  },
  {
    id: 'automation-is-a-button',
    rule: 'AI appears as a useful action only where ambiguity creates value.',
    clientSees: 'Explain KPI, draft CAPA, clean menu, reconcile payment, create brief, or prepare export.',
    operatorSees: 'Model/tool selection, source boundary, structured output schema, and blocked side effects.',
    auditSignal: 'Every AI action has sourceInputs, outputType, reviewGate, and rollback policy.',
  },
  {
    id: 'approval-before-effects',
    rule: 'Autonomy earns permission one level at a time.',
    clientSees: 'Draft, pending review, approved, or sent state.',
    operatorSees: 'L0 draft, L1 staged work, L2 tool run, L3 approved writeback, L4 recurring monitor.',
    auditSignal: 'Outbound, billing, production deploy, credentialed browser action, and writeback stay blocked by default.',
  },
]

export const BACKGROUND_WORKCELLS: BackgroundWorkcell[] = [
  {
    id: 'intake-router',
    name: 'Intake Router',
    trigger: 'New website request, client source upload, proof signup, or founder note.',
    clientOutput: 'One recommended first product, one first workflow, and one missing-source checklist.',
    operatorControl: 'Route lead into Factory Operations App, Factory Operations App Live State, Restaurant POS + Inventory, or custom app sprint.',
    allowedTools: ['contact ledger', 'value intake router', 'Gmail read-only search', 'Drive source packet'],
    blockedActions: ['quote final price', 'send reply', 'request credentials', 'create production workspace'],
    evidence: ['lead id', 'source link', 'first workflow', 'recommended product', 'missing source list'],
    reviewGate: 'Founder approves first reply, scope, and price band.',
    route: '/app/client-build',
    api: '/api/contact-submissions',
    maturity: 'live',
  },
  {
    id: 'source-cleanroom',
    name: 'Source Cleanroom',
    trigger: 'Approved Drive folder, PDF batch, Sheet export, Gmail thread, CSV, or screenshot set.',
    clientOutput: 'Clean source table with exceptions, owner, freshness, and confidence.',
    operatorControl: 'Extraction run, field map, sensitive fields, source freshness, and review owner.',
    allowedTools: ['Google Drive', 'Gmail', 'Sheets', 'PDF/OCR', 'LlamaIndex retrieval'],
    blockedActions: ['delete files', 'overwrite canonical records', 'share private data', 'store secrets'],
    evidence: ['source id', 'file path', 'row count', 'field map', 'freshness timestamp'],
    reviewGate: 'Source owner approves clean fields before writeback or dashboard use.',
    route: '/app/data-quality',
    api: '/api/ytf/workbook-extraction/latest',
    maturity: 'ready',
  },
  {
    id: 'module-builder',
    name: 'Module Builder',
    trigger: 'Approved build packet from Portal Factory or Client Build.',
    clientOutput: 'A working app screen with roles, sample data, action queue, and proof state.',
    operatorControl: 'Scoped files, route, acceptance checks, QA commands, preview URL, and rollback.',
    allowedTools: ['Codex', 'GitHub branch', 'Vercel preview', 'audit scripts', 'Playwright smoke'],
    blockedActions: ['touch unrelated files', 'merge without review', 'deploy production', 'change secrets'],
    evidence: ['diff summary', 'changed files', 'preview route', 'test output', 'rollback note'],
    reviewGate: 'QA and founder approval before production deploy or client handoff.',
    route: '/app/agent-workbench',
    api: '/api/agent-workbench/run-full-loop',
    maturity: 'live',
  },
  {
    id: 'factory-twin-monitor',
    name: 'Factory Operations App Live State Monitor',
    trigger: 'Meter event, operations log, maintenance issue, stock variance, or quality exception.',
    clientOutput: 'One exception card with severity, owner, evidence, and next action.',
    operatorControl: 'Anomaly rules, source stream, KPI movement, and blocked writeback policy.',
    allowedTools: ['operations ledger', 'telemetry import', 'Drive evidence', 'CAPA template', 'manager action board'],
    blockedActions: ['change PLC/device state', 'close issue without owner', 'claim ISO compliance without evidence'],
    evidence: ['event id', 'meter/source reading', 'KPI delta', 'root-cause draft', 'manager decision'],
    reviewGate: 'Plant manager or quality owner approves disposition.',
    route: '/app/operations-twin',
    api: '/api/ytf/operating-metrics',
    maturity: 'ready',
  },
  {
    id: 'restaurant-pos-control',
    name: 'Restaurant POS + Inventory Control',
    trigger: 'Menu upload, daily close, payment export, stock count, guest issue, or branch variance.',
    clientOutput: 'Menu, order/payment exceptions, stock alerts, and manager closeout.',
    operatorControl: 'Menu extraction confidence, payment reconciliation diff, branch variance, and recovery drafts.',
    allowedTools: ['menu importer', 'payment reconciliation', 'stock ledger', 'guest issue queue', 'branch dashboard'],
    blockedActions: ['charge card', 'publish menu', 'refund order', 'message customer without approval'],
    evidence: ['menu source', 'payment row', 'stock movement', 'branch id', 'manager approval'],
    reviewGate: 'Owner or branch manager approves menu, payment, and customer-facing changes.',
    route: '/app/restaurant-os',
    api: '/api/agent-runs',
    maturity: 'ready',
  },
  {
    id: 'proof-and-growth',
    name: 'Proof and Growth',
    trigger: 'Completed sprint, QA pass, proof route, lead reply, or approved proof asset.',
    clientOutput: 'Short proof pack, training checklist, and next paid step.',
    operatorControl: 'Claims, screenshots, route health, CTA, follow-up task, and billing readiness.',
    allowedTools: ['proof pack generator', 'lead ledger', 'Stripe readiness', 'Remotion/HyperFrames draft', 'Gmail draft'],
    blockedActions: ['publish post', 'send email', 'activate payment link', 'make public claim without proof'],
    evidence: ['route smoke', 'screenshot', 'client result', 'approved text', 'lead id'],
    reviewGate: 'Founder approves external message, public claim, and payment route.',
    route: '/app/revenue',
    api: '/api/agent-runs',
    maturity: 'ready',
  },
]

export const WORKCELL_QUEUE_PACKETS: WorkcellQueuePacket[] = [
  {
    id: 'packet-intake-to-product',
    workcellId: 'intake-router',
    source: 'New request with company type, current tools, one painful workflow, and optional source sample.',
    output: 'Recommended first product and scoped first screen for approval.',
    reviewOwner: 'Founder',
    rollback: 'Keep as lead note only; do not create workspace until scope is approved.',
  },
  {
    id: 'packet-source-to-records',
    workcellId: 'source-cleanroom',
    source: 'Drive folder, Sheet, PDF, screenshot, email export, or POS CSV.',
    output: 'Source register, clean rows, exception list, freshness score, and owner review task.',
    reviewOwner: 'Source owner',
    rollback: 'Discard generated rows and keep raw source unchanged.',
  },
  {
    id: 'packet-module-to-preview',
    workcellId: 'module-builder',
    source: 'Approved module contract with route, roles, fields, sample data, and acceptance checks.',
    output: 'Preview route plus QA report and release checklist.',
    reviewOwner: 'Founder plus QA',
    rollback: 'Close preview branch or revert scoped patch before production aliasing.',
  },
]

export const CLOUD_AGENT_ARMY_ACTIVATION_STATE: CloudActivationState[] = [
  {
    id: 'run-ledger',
    label: 'Run ledger',
    state: 'ready',
    value: 'EnterpriseAgentRun contract',
    proof: 'Queued work needs run id, tenant, owner, evidence, approval_state, risk, and write_policy before execution.',
    humanUnlock: 'Approve only the run class and maximum allowed action for each workcell.',
  },
  {
    id: 'cloud-scheduler',
    label: 'Cloud scheduler',
    state: 'approval',
    value: 'Vercel Cron or Cloud Tasks',
    proof: 'Production recurring jobs must call protected internal routes with CRON_SECRET or SUPERMEGA_INTERNAL_CRON_TOKEN.',
    humanUnlock: 'Approve first read-only queue payload, max run count, target project, and token source.',
  },
  {
    id: 'agent-runtime',
    label: 'Agent runtime',
    state: 'designing',
    value: 'Workflow lanes plus stateful agent rooms',
    proof: 'Vercel workflow lanes handle durable jobs; stateful agent rooms handle source watches, memory, and realtime status.',
    humanUnlock: 'Choose which runtime gets built first: Document Extraction Ledger, YTF source watch, or growth research pod.',
  },
  {
    id: 'external-actions',
    label: 'External actions',
    state: 'blocked',
    value: 'Outbound, billing, deploy, writeback, credentials',
    proof: 'Every risky action is staged as an approval packet before it can reach a client, payment system, production alias, or third-party account.',
    humanUnlock: 'Approve exact action text, target system, rollback plan, and evidence link.',
  },
]

export const CLOUD_AGENT_LANES: CloudAgentLane[] = [
  {
    id: 'vercel-workflow-orchestrator',
    name: 'Vercel Workflow Orchestrator',
    provider: 'Vercel Workflow',
    trigger: 'Lead, intake, proof pack, QA, or release event',
    cadence: 'Event-driven with retry and pause/resume gates',
    state: 'Workflow run, approval step, artifact id, source refs',
    work: ['split work into steps', 'retry transient failures', 'pause for founder approval', 'resume after client input'],
    evidence: 'workflow run id, step log, artifact links, approval record',
    gate: 'Founder approves external send, billing, deploy, and client promise.',
  },
  {
    id: 'cloudflare-stateful-agents',
    name: 'Cloudflare Stateful Agents',
    provider: 'Cloudflare Agents SDK',
    trigger: 'Scheduled watch, WebSocket command, or source-change event',
    cadence: 'Always-on edge room with scheduled checks',
    state: 'SQLite-backed agent state, tenant policy, queue position',
    work: ['watch allowed public/source feeds', 'hold realtime room state', 'stage task updates', 'notify control plane'],
    evidence: 'agent state diff, schedule log, queue event, tenant policy check',
    gate: 'Agents may observe and stage work; they cannot write externally without gate unlock.',
  },
  {
    id: 'github-secure-builder',
    name: 'GitHub Secure Builder Lane',
    provider: 'GitHub Actions and pull requests',
    trigger: 'Approved build packet or implementation proposal',
    cadence: 'Per approved task',
    state: 'Branch, PR, test run, code scan, review result',
    work: ['open branch', 'apply bounded patch', 'run tests', 'attach security checklist'],
    evidence: 'commit diff, CI run, security review, release note',
    gate: 'No merge or production deploy until QA and founder review pass.',
  },
  {
    id: 'browser-worker-cloud',
    name: 'Browser Worker Cloud',
    provider: 'Browser sandbox or managed browser service',
    trigger: 'Workflow map, QA script, competitor research, or SaaS replacement capture',
    cadence: 'On demand and scheduled only for approved URLs',
    state: 'URL allowlist, screenshot, DOM facts, stop point, credential policy',
    work: ['capture screenshots', 'map forms', 'verify routes', 'draft browser steps'],
    evidence: 'screenshot, URL, selector evidence, console/network notes',
    gate: 'No credential entry, payment, destructive submit, or account change without live approval.',
  },
  {
    id: 'mcp-connector-plane',
    name: 'MCP Connector Plane',
    provider: 'Scoped MCP tools and SaaS connectors',
    trigger: 'Approved source packet or client workspace event',
    cadence: 'Per connector policy',
    state: 'Tool scope, OAuth scope, source owner, action class, rollback path',
    work: ['read allowed sources', 'normalize records', 'draft tasks', 'prepare writeback packet'],
    evidence: 'tool call log, source id, extracted rows, approval packet',
    gate: 'Writebacks require source owner approval and rollback plan.',
  },
]

export const CLOUD_AGENT_PODS: CloudAgentPod[] = [
  {
    id: 'growth-intelligence',
    name: 'Growth Intelligence Pod',
    mission: 'Find buyers with obvious workflow pain and turn them into approved outreach drafts.',
    agents: ['Market scanner', 'ICP analyst', 'offer writer', 'reply classifier'],
    owns: ['lead list', 'buyer pain map', 'social draft queue', 'approved outreach packet'],
    successMetric: '10 qualified workflow-map opportunities per week before paid ads.',
    blockedUntil: 'Human approves every post, DM, email, ad, and public claim.',
  },
  {
    id: 'workflow-intake',
    name: 'Workflow Intake Pod',
    mission: 'Convert raw client input into one source register and one first proof loop.',
    agents: ['Intake analyst', 'source cleaner', 'workflow mapper', 'risk tagger'],
    owns: ['source register', 'workflow map', 'approval policy', 'first desk scope'],
    successMetric: 'Every lead gets one recommended Back Office Workflow Desk scope within 24 hours.',
    blockedUntil: 'Client or founder confirms allowed source boundaries.',
  },
  {
    id: 'product-architecture',
    name: 'Product Architecture Pod',
    mission: 'Turn the workflow map into screens, module contracts, and build packets.',
    agents: ['Solution architect', 'data modeler', 'UX planner', 'module librarian'],
    owns: ['module contract', 'screen spec', 'data schema', 'expansion map'],
    successMetric: 'Every paid sprint ships one usable screen and one repeatable module contract.',
    blockedUntil: 'Founder approves price, module boundary, and acceptance criteria.',
  },
  {
    id: 'builder-pod',
    name: 'Builder Pod',
    mission: 'Build bounded product slices in cloud branches and attach proof.',
    agents: ['Frontend builder', 'backend builder', 'integration builder', 'release packager'],
    owns: ['branch', 'patch', 'preview URL', 'release checklist'],
    successMetric: 'One safe product increment per approved build packet.',
    blockedUntil: 'No production deploy without release gate and founder approval.',
  },
  {
    id: 'qa-security',
    name: 'QA and Security Pod',
    mission: 'Break weak agent behavior before clients see it.',
    agents: ['Browser QA', 'security reviewer', 'policy tester', 'regression runner'],
    owns: ['smoke report', 'security checklist', 'policy violations', 'release blockers'],
    successMetric: 'Every release has route proof, screenshot proof, and forbidden-action proof.',
    blockedUntil: 'Failed proof blocks merge, deploy, and client handoff.',
  },
  {
    id: 'customer-proof',
    name: 'Customer Proof Pod',
    mission: 'Turn work into proof packs, owner briefs, and expansion proposals.',
    agents: ['Proof writer', 'ROI analyst', 'success planner', 'handoff coordinator'],
    owns: ['proof pack', 'owner brief', 'training checklist', 'expansion proposal'],
    successMetric: 'Each sprint ends with a visible result and a concrete next paid step.',
    blockedUntil: 'No client-facing promise, price, or timeline goes out without approval.',
  },
]

export const CLOUD_100K_GROWTH_LOOP: CloudGrowthStage[] = [
  {
    id: 'lead-to-map',
    label: 'Lead to workflow map',
    target: '100 qualified workflow maps',
    agentPod: 'Growth Intelligence Pod',
    output: 'Approved lead packet plus one likely Factory Operations App, Factory Operations App Live State, or Restaurant POS + Inventory angle.',
    revenueLogic: 'More pain clarity lowers sales friction and keeps outreach narrow.',
  },
  {
    id: 'map-to-sprint',
    label: 'Workflow map to sprint',
    target: '20 paid app sprints',
    agentPod: 'Workflow Intake Pod',
    output: '$2.5k to $5k scope with source register, queue, approval gate, and proof pack.',
    revenueLogic: '20 sprints at $5k creates the first $100k cash target.',
  },
  {
    id: 'sprint-to-pilot',
    label: 'Sprint to managed pilot',
    target: '5 managed pilots',
    agentPod: 'Product Architecture Pod',
    output: '$8k to $20k pilot with live connectors, role workspace, and QA cadence.',
    revenueLogic: 'Pilots convert custom work into repeatable platform modules.',
  },
  {
    id: 'pilot-to-retainer',
    label: 'Pilot to agent workspace retainer',
    target: '10 monthly retainers',
    agentPod: 'Customer Proof Pod',
    output: '$1.5k to $5k monthly managed app workspace and support desk.',
    revenueLogic: 'Recurring support compounds beyond one-off custom builds.',
  },
]

export const CLOUD_DISPATCH_BOARD: CloudDispatchItem[] = [
  {
    id: 'cloud-control-plane',
    title: 'Stand up cloud control plane contract',
    owner: 'Platform Architecture',
    cloudLane: 'Vercel Workflow Orchestrator',
    status: 'ready',
    nextAction: 'Promote this model into the app route, audit, and deployment gate.',
    proof: 'Visible route, static export, and product-system audit.',
  },
  {
    id: 'workflow-desk-cloud-sprint',
    title: 'Package Factory Operations App or Factory Operations App Live State as a managed operations sprint',
    owner: 'Product Architecture Pod',
    cloudLane: 'MCP Connector Plane',
    status: 'ready',
    nextAction: 'Attach source register, approval policy, proof pack, and expansion map to every intake.',
    proof: 'Product system, Factory Operations App Live State, and proof-link audits are green.',
  },
  {
    id: 'outbound-approval-queue',
    title: 'Create approved outbound queue',
    owner: 'Growth Intelligence Pod',
    cloudLane: 'Vercel Workflow Orchestrator',
    status: 'approval',
    nextAction: 'Draft posts and emails only; wait for founder approval before publishing.',
    proof: 'Outbound is blocked unless approval record exists.',
  },
  {
    id: 'cloud-secrets-and-crons',
    title: 'Activate cloud secrets and production crons',
    owner: 'Platform Admin',
    cloudLane: 'Cloudflare Stateful Agents',
    status: 'blocked',
    nextAction: 'Choose provider, set CRON_SECRET/OAuth scopes, and approve deployment.',
    proof: 'No local scheduler is used; production cloud job requires deployment approval.',
  },
  {
    id: 'secure-code-training',
    title: 'Train builder pod with secure agent-code game',
    owner: 'QA and Security Pod',
    cloudLane: 'GitHub Secure Builder Lane',
    status: 'designing',
    nextAction: 'Add every builder PR to a secure-agent checklist before merge.',
    proof: 'Security checklist attached to implementation packets.',
  },
]

export const CLOUD_APPROVAL_GATES = [
  ['Outbound publishing', 'draft only until founder approves exact text and channel'],
  ['Billing and checkout', 'proposal only until price and payment route are approved'],
  ['Production deploy', 'preview and release gate first, then explicit deploy approval'],
  ['External writeback', 'stage packet first; source owner approves before any change'],
  ['Credentialed browser action', 'URL allowlist, stop point, and live approval required'],
  ['Client-facing claim', 'must link to proof pack, source evidence, or route QA'],
] as const

export const CLOUD_AGENT_ARMY_BUILD_SEQUENCE = [
  'Public promise stays simple: Factory Operations App, Factory Operations App Live State, or Restaurant POS + Inventory replaces one painful workflow first.',
  'Cloud control plane owns lanes, run logs, approval gates, and proof packets.',
  'Each workcell gets one measurable job, one source boundary, one output artifact, and one blocked action list.',
  'Vercel Workflow handles durable orchestration; Cloudflare Agents handle stateful always-on rooms and scheduled watchers.',
  'GitHub builder lanes only work from approved build packets and must attach test/security evidence.',
  'Human approval remains the unlock for outbound, billing, production deploy, external writeback, and claims.',
] as const
