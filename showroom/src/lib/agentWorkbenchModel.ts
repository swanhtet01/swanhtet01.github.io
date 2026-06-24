export type AgentTaskStatus = 'queued' | 'running' | 'review' | 'approved' | 'blocked' | 'deployed'

export type AgentRole = {
  id: string
  name: string
  mission: string
  owns: string[]
  allowedActions: string[]
  blockedActions: string[]
  tools: string[]
}

export type AgentProject = {
  id: string
  client: string
  situation: string
  firstProduct: string
  firstScreen: string
  sourceInputs: string[]
  previewRoute: string
  valuePromise: string
  operatorPrompt: string
  approvalOwner: string
}

export type AgentTask = {
  id: string
  projectId: string
  title: string
  agentId: string
  status: AgentTaskStatus
  definitionOfDone: string[]
  outputArtifact: string
  approvalGate: string
}

export type CloudAgentGate = {
  id: string
  name: string
  blocks: string
  requiredEvidence: string[]
  unlocks: string
}

export type CloudRuntimeLane = {
  id: string
  name: string
  trigger: string
  cloudWorker: string
  commandSurface: string
  evidence: string
  humanGate: string
}

export type AgentOperatingStep = {
  id: string
  label: string
  purpose: string
  output: string
  defaultAgent: string
  humanGate: string
}

export type AgentStackDecision = {
  id: string
  name: string
  lane: 'Production core' | 'Workflow core' | 'Knowledge core' | 'Edge prototype' | 'R&D bench' | 'Security gate'
  useFor: string
  avoidFor: string
  supermegaIntegration: string
  sourceLabel: string
  sourceUrl: string
}

export type AgentAutonomyLevel = {
  id: string
  level: string
  name: string
  allowed: string
  blocked: string
  unlockCondition: string
}

export const AGENT_WORKBENCH_OPERATING_LOOP: AgentOperatingStep[] = [
  {
    id: 'capture',
    label: 'Capture',
    purpose: 'Collect the client workflow, files, forms, examples, and desired output.',
    output: 'Source packet with owner, scope, exclusions, and first module guess.',
    defaultAgent: 'Intake Agent',
    humanGate: 'Founder or client owner confirms the sources are allowed.',
  },
  {
    id: 'plan',
    label: 'Plan',
    purpose: 'Choose one useful module and one first screen before building a whole portal.',
    output: 'Project packet with module, route, fields, agent actions, and acceptance checks.',
    defaultAgent: 'Product Architect',
    humanGate: 'Founder approves the first paid deliverable and price band.',
  },
  {
    id: 'run',
    label: 'Run',
    purpose: 'Let scoped tool agents parse data, draft records, build UI, or prepare code changes.',
    output: 'Staged artifact: draft task, cleaned table, proposed patch, or proof route.',
    defaultAgent: 'Builder Agent',
    humanGate: 'No email, billing, production writeback, or deploy without explicit approval.',
  },
  {
    id: 'verify',
    label: 'Verify',
    purpose: 'Check source evidence, route health, security boundaries, and mobile usability.',
    output: 'QA verdict with failures, screenshots, test commands, and release blocker list.',
    defaultAgent: 'QA Agent',
    humanGate: 'Failed proof blocks promotion even if the agent output looks useful.',
  },
  {
    id: 'learn',
    label: 'Learn',
    purpose: 'Promote what worked into a module template and keep tenant-specific facts scoped.',
    output: 'Approved memory, updated module contract, reusable checklist, and next experiment.',
    defaultAgent: 'Sales Operator',
    humanGate: 'Only reviewed knowledge becomes reusable across clients.',
  },
]

export const AGENT_WORKBENCH_STACK_DECISIONS: AgentStackDecision[] = [
  {
    id: 'stack-native-workflows',
    name: 'Native SuperMega workflows',
    lane: 'Production core',
    useFor: 'Known business software: forms, queues, approvals, role routing, dashboards, records, and scheduled checks.',
    avoidFor: 'Open-ended reasoning, ambiguous documents, or creative synthesis.',
    supermegaIntegration: 'Default every module to deterministic software first; agents assist only where ambiguity creates value.',
    sourceLabel: 'SuperMega module contract',
    sourceUrl: 'https://app.supermega.dev/app/meta-ops',
  },
  {
    id: 'stack-vercel-ai-sdk',
    name: 'Vercel AI SDK',
    lane: 'Production core',
    useFor: 'Portal-native AI actions, streaming UI, typed tool calls, structured output, and model/provider routing through the app.',
    avoidFor: 'Long-running state machines, browser automation, or unmanaged external writeback.',
    supermegaIntegration: 'Power module buttons such as summarize, explain KPI movement, draft CAPA, build client script, and create queued task.',
    sourceLabel: 'Vercel AI SDK docs',
    sourceUrl: 'https://ai-sdk.dev/docs',
  },
  {
    id: 'stack-openai-agents-sdk',
    name: 'OpenAI Agents SDK',
    lane: 'Production core',
    useFor: 'Tool-using agents, handoffs, typed outputs, traces, guardrails, and controlled workcell runs.',
    avoidFor: 'Simple CRUD, deterministic calculations, or actions that bypass review gates.',
    supermegaIntegration: 'Default workcell harness for data cleanup, implementation proposals, code-backed tasks, and source-grounded artifacts.',
    sourceLabel: 'OpenAI Agents SDK docs',
    sourceUrl: 'https://openai.github.io/openai-agents-python/',
  },
  {
    id: 'stack-langgraph',
    name: 'LangGraph',
    lane: 'Workflow core',
    useFor: 'Durable workflows that branch, wait for humans, resume after failure, retry tools, or checkpoint state.',
    avoidFor: 'One-shot summaries, static dashboards, or workflows with no state and no side effects.',
    supermegaIntegration: 'Use for source-change review, CAPA approval chains, connector retry flows, and rollout provisioning graphs.',
    sourceLabel: 'LangGraph durable execution',
    sourceUrl: 'https://docs.langchain.com/oss/python/langgraph/durable-execution',
  },
  {
    id: 'stack-llamaindex-rag',
    name: 'LlamaIndex / retrieval layer',
    lane: 'Knowledge core',
    useFor: 'Document parsing, indexes, retrieval tools, knowledge graph enrichment, and source-grounded answers.',
    avoidFor: 'Uncited advice, stale source claims, or writeback decisions without an owner.',
    supermegaIntegration: 'Build tenant knowledge from Drive, PDFs, Sheets, SOPs, and emails with citations and source freshness.',
    sourceLabel: 'LlamaIndex docs',
    sourceUrl: 'https://docs.llamaindex.ai/',
  },
  {
    id: 'stack-docling-parser',
    name: 'Docling document parser',
    lane: 'Knowledge core',
    useFor: 'OCR and layout-aware parsing for PDFs, scans, and office documents before KPI extraction.',
    avoidFor: 'Publishing official KPI rows without human review, source ownership, and freshness checks.',
    supermegaIntegration: 'Use in the intake lane to normalize reports, invoices, and plant documents into typed rows for YTF metrics and review queues.',
    sourceLabel: 'Docling GitHub',
    sourceUrl: 'https://github.com/docling-project/docling',
  },
  {
    id: 'stack-crawl4ai',
    name: 'Crawl4AI extraction lane',
    lane: 'Edge prototype',
    useFor: 'Permissioned website crawling, extraction of structured fields, and recurring source snapshots for monitored portals.',
    avoidFor: 'Unbounded crawling, credential scraping, or autonomous external submits.',
    supermegaIntegration: 'Use for controlled browser-source capture with URL allowlists, schedule windows, and reviewer checkpoints before any writeback.',
    sourceLabel: 'Crawl4AI GitHub',
    sourceUrl: 'https://github.com/unclecode/crawl4ai',
  },
  {
    id: 'stack-qdrant-memory',
    name: 'Qdrant tenant memory lane',
    lane: 'Knowledge core',
    useFor: 'Tenant-scoped vector memory for source-grounded retrieval over production, inventory, and quality records.',
    avoidFor: 'Storing secrets in embeddings or mixing tenant namespaces.',
    supermegaIntegration: 'Use as the long-lived retrieval index behind Drive extraction, whiteboard OCR, and manager ask workflows with strict tenant isolation.',
    sourceLabel: 'Qdrant docs',
    sourceUrl: 'https://qdrant.tech/documentation/',
  },
  {
    id: 'stack-litellm-gateway',
    name: 'LiteLLM model gateway',
    lane: 'Security gate',
    useFor: 'Model routing, fallback policy, spend caps, and provider standardization when multiple model vendors are active.',
    avoidFor: 'Bypassing product-level approval gates or hiding run-level traces.',
    supermegaIntegration: 'Run as the model control plane behind workcells so YTF flows keep stable model policy, retries, and cost visibility.',
    sourceLabel: 'LiteLLM GitHub',
    sourceUrl: 'https://github.com/BerriAI/litellm',
  },
  {
    id: 'stack-cloudflare-agents',
    name: 'Cloudflare Agents',
    lane: 'Edge prototype',
    useFor: 'Stateful edge agents, WebSockets, scheduled source watchers, durable objects, and lightweight tenant workrooms.',
    avoidFor: 'Core product logic before Vercel app, database, and audit-ledger stability are already proven.',
    supermegaIntegration: 'Prototype always-on connector monitors and realtime agent rooms after the app control plane is stable.',
    sourceLabel: 'Cloudflare Agents docs',
    sourceUrl: 'https://developers.cloudflare.com/agents/',
  },
  {
    id: 'stack-browser-use',
    name: 'Browser Use',
    lane: 'Edge prototype',
    useFor: 'Managed browser workers for website QA, repeated SaaS workflow capture, competitor research, screenshots, and form-flow validation.',
    avoidFor: 'Credential capture, payments, destructive form submits, or any browser action without URL allowlist and stop points.',
    supermegaIntegration: 'Use for a browser-worker lane that records workflow maps, screenshots, extracted fields, and human approval checkpoints before automation.',
    sourceLabel: 'Browser Use docs',
    sourceUrl: 'https://docs.browser-use.com/introduction',
  },
  {
    id: 'stack-openclaw-local-lab',
    name: 'OpenClaw local operator lab',
    lane: 'R&D bench',
    useFor: 'Capturing local desktop, folder, and browser workflows with strict allowed sources before turning them into portal modules.',
    avoidFor: 'Production client writeback, hidden background access, unredacted private files, or any run without an operator-approved manifest.',
    supermegaIntegration: 'Use as a local workflow cartographer: output a redacted workflow packet, source map, and module candidates for Portal Factory.',
    sourceLabel: 'OpenClaw GitHub',
    sourceUrl: 'https://github.com/openclaw/openclaw',
  },
  {
    id: 'stack-openhands-code-bench',
    name: 'OpenHands coding-agent bench',
    lane: 'R&D bench',
    useFor: 'Benchmarking open-source coding agents on isolated module-build tasks, patch proposals, and QA behavior.',
    avoidFor: 'Live tenant secrets, broad repo write access, or release decisions outside SuperMega QA and founder review.',
    supermegaIntegration: 'Compare patch quality against native SuperMega/Codex workcells and promote only bounded implementation proposals.',
    sourceLabel: 'OpenHands GitHub',
    sourceUrl: 'https://github.com/OpenHands/OpenHands',
  },
  {
    id: 'stack-composio-tool-broker',
    name: 'Composio / tool broker comparison',
    lane: 'Security gate',
    useFor: 'Evaluating OAuth-backed SaaS tool access, connector catalogs, and tool-auth patterns for agents.',
    avoidFor: 'Letting a third-party tool layer own tenant policy, hidden scopes, or action logs without SuperMega audit rows.',
    supermegaIntegration: 'Normalize every tool into source scope, OAuth scope, action class, risk tier, approval gate, and rollback policy.',
    sourceLabel: 'Composio GitHub',
    sourceUrl: 'https://github.com/ComposioHQ/composio',
  },
  {
    id: 'stack-autogen',
    name: 'Microsoft AutoGen',
    lane: 'R&D bench',
    useFor: 'Testing multi-agent conversations, distributed runtimes, Docker code execution, MCP workbenches, and research-style agent teams.',
    avoidFor: 'Production tenant actions before SuperMega tool policy, evidence ledger, and approval gates own the external effects.',
    supermegaIntegration: 'Benchmark against SuperMega workcells and promote only the workflow contract, tests, and UI surface that survive review.',
    sourceLabel: 'AutoGen docs',
    sourceUrl: 'https://microsoft.github.io/autogen/stable/',
  },
  {
    id: 'stack-rd-agent-bench',
    name: 'Mastra / CrewAI / Pydantic AI',
    lane: 'R&D bench',
    useFor: 'Fast comparisons of agent teams, typed Python agents, workflows, critiques, and prototype module generation.',
    avoidFor: 'Live tenant credentials, production writeback, or hidden state that Meta Ops cannot audit.',
    supermegaIntegration: 'Use as experiments; promote only the workflow contract, eval, and UI module into production.',
    sourceLabel: 'R&D framework bench',
    sourceUrl: 'https://mastra.ai/docs',
  },
  {
    id: 'stack-mcp-tool-plane',
    name: 'MCP tool plane',
    lane: 'Security gate',
    useFor: 'Connector/tool discovery, tool allowlists, scoped permissions, and consistent agent access to Gmail, Drive, GitHub, Stripe, browser, and code tools.',
    avoidFor: 'Giving every agent every connector or treating tool calls as invisible chat internals.',
    supermegaIntegration: 'Every module declares source scope, allowed tools, output type, review gate, and rollback path before agents can act.',
    sourceLabel: 'OpenAI Agents SDK MCP guide',
    sourceUrl: 'https://openai.github.io/openai-agents-python/mcp/',
  },
]

export const AGENT_WORKBENCH_AUTONOMY_LADDER: AgentAutonomyLevel[] = [
  {
    id: 'l0-draft',
    level: 'L0',
    name: 'Draft only',
    allowed: 'Summaries, classifications, explanations, and proposed next actions.',
    blocked: 'Saving records, sending messages, billing, deleting, or deploying.',
    unlockCondition: 'Allowed for every module with visible source scope.',
  },
  {
    id: 'l1-stage',
    level: 'L1',
    name: 'Stage work',
    allowed: 'Create queued tasks, staged records, draft replies, and implementation proposals.',
    blocked: 'External effects and production writeback.',
    unlockCondition: 'Module has schema, owner, review queue, and audit row.',
  },
  {
    id: 'l2-tool-run',
    level: 'L2',
    name: 'Use tools',
    allowed: 'Read scoped connectors, run extraction, browser checks, code proposal, and QA scripts.',
    blocked: 'Unscoped connectors, privilege changes, and unmanaged secrets.',
    unlockCondition: 'Tool allowlist, tenant scope, run ID, rollback plan, and privacy check exist.',
  },
  {
    id: 'l3-writeback',
    level: 'L3',
    name: 'Approved writeback',
    allowed: 'Write to production systems only after a staged diff is approved.',
    blocked: 'Autonomous send/write/delete without human approval.',
    unlockCondition: 'Human approval, idempotency key, audit event, and rollback path are recorded.',
  },
  {
    id: 'l4-autonomous',
    level: 'L4',
    name: 'Recurring autonomy',
    allowed: 'Scheduled jobs that monitor, classify, notify, and create review tasks.',
    blocked: 'Changing policy, money, access, or external messaging without a gate.',
    unlockCondition: 'Clean QA history, security drill pass, kill switch, and incident owner are visible in Meta Ops.',
  },
]

export const AGENT_WORKBENCH_ROLES: AgentRole[] = [
  {
    id: 'intake-agent',
    name: 'Intake Agent',
    mission: 'Turn client words, source links, and examples into a clean project packet.',
    owns: ['client situation', 'source checklist', 'first product recommendation', 'missing context questions'],
    allowedActions: ['read submitted intake', 'draft project brief', 'score readiness', 'request missing source examples'],
    blockedActions: ['quote final price', 'promise delivery date', 'send client reply without approval'],
    tools: ['client start packets', 'value intake router', 'contact lead ledger'],
  },
  {
    id: 'product-architect',
    name: 'Product Architect',
    mission: 'Design the smallest useful workflow screen before a larger platform proposal.',
    owns: ['first screen scope', 'module selection', 'acceptance checks', 'upgrade path'],
    allowedActions: ['create implementation packet', 'choose module primitives', 'write acceptance criteria'],
    blockedActions: ['expand scope without founder approval', 'remove human approval gates'],
    tools: ['product catalog', 'proof packs', 'portal factory', 'founder machine'],
  },
  {
    id: 'data-agent',
    name: 'Data Agent',
    mission: 'Inspect permitted client sources and turn messy files into a trusted input map.',
    owns: ['source register', 'field map', 'quality risks', 'sensitive data notes'],
    allowedActions: ['parse approved files', 'profile schemas', 'flag missing fields', 'draft cleanup rules'],
    blockedActions: ['use unapproved private sources', 'write back to client systems', 'store payment secrets'],
    tools: ['Drive connector', 'document intake', 'data fabric', 'source quality checks'],
  },
  {
    id: 'builder-agent',
    name: 'Builder Agent',
    mission: 'Edit the SuperMega codebase in a scoped branch or worktree and produce the working surface.',
    owns: ['routes', 'components', 'models', 'API seams', 'local state'],
    allowedActions: ['edit assigned files', 'run tests', 'create preview build', 'write implementation notes'],
    blockedActions: ['overwrite unrelated work', 'deploy production without release approval', 'change secrets'],
    tools: ['Codex', 'repo workspace', 'Vercel preview', 'package scripts'],
  },
  {
    id: 'qa-agent',
    name: 'QA Agent',
    mission: 'Prove the build works before the founder or client sees it.',
    owns: ['route smoke', 'browser checks', 'privacy checks', 'acceptance evidence'],
    allowedActions: ['run audits', 'capture screenshots', 'verify forms', 'write defects'],
    blockedActions: ['approve its own failed build', 'ignore stale aliases', 'skip privacy checks'],
    tools: ['Playwright', 'smoke scripts', 'audit scripts', 'Vercel inspect'],
  },
  {
    id: 'sales-operator',
    name: 'Sales Operator',
    mission: 'Turn the working screen into the client reply, proof pack, price gate, and next proposal.',
    owns: ['proposal draft', 'proof handoff', 'pricing band', 'follow-up task'],
    allowedActions: ['draft client reply', 'prepare price options', 'summarize proof', 'queue follow-up'],
    blockedActions: ['send outbound message', 'activate billing', 'make legal or financial advice claims'],
    tools: ['proof packs', 'client start packets', 'sales OS', 'Stripe readiness'],
  },
]

export const AGENT_WORKBENCH_PROJECTS: AgentProject[] = [
  {
    id: 'lead-001-document-cleanroom',
    client: 'Operations team with messy file folders',
    situation: 'I have messy files or documents.',
    firstProduct: 'Document Intake and Data Cleanroom',
    firstScreen: 'Source register plus exception queue',
    sourceInputs: ['Drive folder link', 'sample PDF batch', 'target clean-record example', 'reviewer name'],
    previewRoute: '/app/documents',
    valuePromise: 'Turn files into reviewable records with owner, status, source, and exception reason.',
    operatorPrompt: 'Build the first source register and exception queue from the sample folder. Keep the client from choosing tools.',
    approvalOwner: 'Founder plus client reviewer',
  },
  {
    id: 'lead-002-revenue-radar',
    client: 'Founder-led services business',
    situation: 'I need leads or market clarity.',
    firstProduct: 'Lead Radar and Account Research Desk',
    firstScreen: 'Account shortlist plus outreach angle board',
    sourceInputs: ['ideal customer notes', 'sample customers', 'offer', 'no-go segments'],
    previewRoute: '/app/revenue/prospecting',
    valuePromise: 'Create a focused account list and human-approved outreach angles before any sending.',
    operatorPrompt: 'Research the first twenty accounts, score fit, and draft founder-reviewed outreach angles.',
    approvalOwner: 'Founder',
  },
  {
    id: 'lead-003-followup-desk',
    client: 'Team dropping decisions after meetings',
    situation: 'My team drops follow-ups.',
    firstProduct: 'Meeting to Action Desk',
    firstScreen: 'Decision, owner, deadline, and follow-up queue',
    sourceInputs: ['meeting notes', 'transcript', 'owner list', 'approved follow-up style'],
    previewRoute: '/app/actions',
    valuePromise: 'Convert meeting noise into decisions, owners, deadlines, and reviewed follow-up drafts.',
    operatorPrompt: 'Create the first meeting-to-actions desk and one approved follow-up draft.',
    approvalOwner: 'Project owner',
  },
  {
    id: 'lead-004-admin-ops',
    client: 'Owner with finance, support, or hiring admin chaos',
    situation: 'Money, support, or hiring is messy.',
    firstProduct: 'Workflow Simulator and ROI Calculator',
    firstScreen: 'Workflow map, ROI estimate, and first controlled queue',
    sourceInputs: ['invoice or ticket export', 'manual steps', 'weekly volume', 'approval rule'],
    previewRoute: '/app/workbench',
    valuePromise: 'Decide what to automate first, why it pays back, and what must remain human-approved.',
    operatorPrompt: 'Map the workflow, calculate the first ROI case, and build the first controlled queue.',
    approvalOwner: 'Business owner',
  },
]

export const AGENT_WORKBENCH_TASKS: AgentTask[] = [
  {
    id: 'task-brief',
    projectId: 'lead-001-document-cleanroom',
    title: 'Create source-grounded project brief',
    agentId: 'intake-agent',
    status: 'approved',
    definitionOfDone: ['client situation confirmed', 'source checklist attached', 'first product selected', 'approval owner named'],
    outputArtifact: 'Project packet with source checklist and first-screen scope.',
    approvalGate: 'Founder confirms the first paid step before scope expands.',
  },
  {
    id: 'task-data-map',
    projectId: 'lead-001-document-cleanroom',
    title: 'Map source fields and exception rules',
    agentId: 'data-agent',
    status: 'review',
    definitionOfDone: ['field map exists', 'missing fields flagged', 'sensitive fields marked', 'review queue sample created'],
    outputArtifact: 'Source register, field map, and quality-risk list.',
    approvalGate: 'Client reviewer approves field names and exclusions.',
  },
  {
    id: 'task-build-screen',
    projectId: 'lead-001-document-cleanroom',
    title: 'Build first cleanroom work screen',
    agentId: 'builder-agent',
    status: 'running',
    definitionOfDone: ['route opens', 'sample records render', 'status filters work', 'empty/error state exists'],
    outputArtifact: 'Preview route with source register and exception queue.',
    approvalGate: 'QA passes before preview is sent.',
  },
  {
    id: 'task-preview-qa',
    projectId: 'lead-001-document-cleanroom',
    title: 'Smoke preview and capture evidence',
    agentId: 'qa-agent',
    status: 'queued',
    definitionOfDone: ['route smoke passes', 'privacy scan passes', 'mobile layout checked', 'screenshots captured'],
    outputArtifact: 'QA verdict, screenshots, and failed-check list if any.',
    approvalGate: 'Release guard confirms no stale alias or private marker leak.',
  },
  {
    id: 'task-client-reply',
    projectId: 'lead-001-document-cleanroom',
    title: 'Draft client reply and price gate',
    agentId: 'sales-operator',
    status: 'queued',
    definitionOfDone: ['reply names first proof pack', 'price band stated', 'source request included', 'next approval clear'],
    outputArtifact: 'Founder-approved reply draft and proof-pack link.',
    approvalGate: 'Founder approves before sending or billing activation.',
  },
  {
    id: 'task-revenue-radar',
    projectId: 'lead-002-revenue-radar',
    title: 'Prepare first account research run',
    agentId: 'product-architect',
    status: 'blocked',
    definitionOfDone: ['target segment defined', 'research columns set', 'outreach gate set', 'first list size chosen'],
    outputArtifact: 'Account-research spec and outreach approval boundary.',
    approvalGate: 'Need founder-approved ICP and no-go segment list.',
  },
]

export const AGENT_WORKBENCH_GATES: CloudAgentGate[] = [
  {
    id: 'source-permission',
    name: 'Source Permission',
    blocks: 'Any run that reads client files without a permitted source list.',
    requiredEvidence: ['source link', 'permission note', 'reviewer', 'excluded data list'],
    unlocks: 'Data profiling, source register, and first artifact generation.',
  },
  {
    id: 'scope-price',
    name: 'Scope and Price',
    blocks: 'Billing, proposal sending, and scope expansion.',
    requiredEvidence: ['first deliverable', 'price band', 'approval owner', 'refund/terms note'],
    unlocks: 'Paid diagnostic, Stripe link setup, and client reply draft.',
  },
  {
    id: 'release-preview',
    name: 'Preview Release',
    blocks: 'Client-visible preview sharing.',
    requiredEvidence: ['build result', 'route smoke', 'privacy scan', 'preview URL'],
    unlocks: 'Client walkthrough and first proof-pack delivery.',
  },
  {
    id: 'external-action',
    name: 'External Action',
    blocks: 'Emails, social posts, CRM writes, billing activation, or production writes.',
    requiredEvidence: ['human approval', 'recipient/context', 'rollback or stop path', 'audit log'],
    unlocks: 'Approved send, writeback, or billing activation.',
  },
]

export const CLOUD_RUNTIME_LANES: CloudRuntimeLane[] = [
  {
    id: 'project-planner',
    name: 'Project Planner',
    trigger: 'new intake receipt or founder prompt',
    cloudWorker: 'planning run with Intake Agent plus Product Architect',
    commandSurface: '/app/agent-workbench',
    evidence: 'project packet, task graph, source checklist',
    humanGate: 'Founder approves first deliverable and priority.',
  },
  {
    id: 'builder-pod',
    name: 'Builder Pod',
    trigger: 'approved first screen',
    cloudWorker: 'scoped coding worker in branch or worktree',
    commandSurface: 'Codex task with file ownership and definition of done',
    evidence: 'changed files, audit output, preview route',
    humanGate: 'QA passes before preview sharing or production deploy.',
  },
  {
    id: 'qa-release',
    name: 'QA and Release',
    trigger: 'builder marks task review-ready',
    cloudWorker: 'QA worker plus release guard',
    commandSurface: 'audit scripts, browser smoke, Vercel inspect',
    evidence: 'screenshots, smoke result, deployment id, alias lock',
    humanGate: 'Founder approves client-visible release.',
  },
  {
    id: 'sales-handoff',
    name: 'Sales Handoff',
    trigger: 'first proof artifact exists',
    cloudWorker: 'sales operator run',
    commandSurface: 'proof pack, client reply, price gate',
    evidence: 'reply draft, pricing assumption, next action task',
    humanGate: 'Founder approves outbound reply and billing activation.',
  },
]

export const AGENT_WORKBENCH_PRINCIPLES = [
  'The project, not the chat, is the source of truth.',
  'Agents own narrow tasks with allowed actions, blocked actions, and definition of done.',
  'The founder/operator prompts direction, taste, priority, and approval; agents handle repeatable build and verification work.',
  'Every client-visible action needs source evidence, scope/price approval, QA, and an audit trail.',
] as const
