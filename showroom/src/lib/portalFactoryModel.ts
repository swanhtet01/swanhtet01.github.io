import type { IndustryPortalKit } from './industryPortalKits'

export type PortalFactoryRuntime = {
  id: string
  name: string
  status: 'Adopt now' | 'Prototype' | 'Watch'
  bestFor: string
  useInSuperMega: string
  tools: string[]
  guardrail: string
  source: string
  sourceUrl: string
}

export type PortalFactoryAgentLayer = {
  id: string
  level: string
  name: string
  job: string
  canCall: string[]
  toolAccess: string[]
  writes: string
  humanGate: string
}

export type PortalFactoryDeliveryStep = {
  id: string
  name: string
  owner: string
  output: string
  passRule: string
}

export type PortalFactoryAssemblyRule = {
  id: string
  rule: string
  why: string
}

export type PortalFactoryIntakeQuestion = {
  id: string
  label: string
  prompt: string
  example: string
  mapsTo: string
}

export type PortalGeneratorStage = {
  id: string
  name: string
  input: string
  output: string
  agentOwner: string
  gate: string
}

export type PortalFactoryWorkforceCell = {
  id: string
  name: string
  mission: string
  agents: string[]
  workspace: string
  toolAccess: string[]
  output: string
  promotionGate: string
}

export type PortalFactoryControlMetric = {
  id: string
  name: string
  target: string
  owner: string
  why: string
}

export const PORTAL_FACTORY_RUNTIMES: PortalFactoryRuntime[] = [
  {
    id: 'openai-agents-sdk',
    name: 'OpenAI Agents SDK',
    status: 'Adopt now',
    bestFor: 'Coded work cells, multi-agent handoffs, tool calls, tracing, reviewable agent runs, and production-system workflows.',
    useInSuperMega: 'Default runtime for Portal Architect, Module Builder, Data Cleaner, QA Reviewer, and Sales Pack agents.',
    tools: ['repo tools', 'browser checks', 'file analysis', 'structured outputs', 'handoffs', 'tracing'],
    guardrail: 'Agents can draft, patch, analyze, and prepare actions; client-facing writeback still requires a human-approved evidence packet.',
    source: 'OpenAI Agents SDK docs',
    sourceUrl: 'https://openai.github.io/openai-agents-python/',
  },
  {
    id: 'vercel-ai-sdk-gateway',
    name: 'Vercel AI SDK + AI Gateway',
    status: 'Adopt now',
    bestFor: 'Deployed app agents, chat/tool UX, model routing, fallback providers, cost visibility, and portal-native AI actions.',
    useInSuperMega: 'Power role copilots inside the portal and route model calls through one observable gateway.',
    tools: ['AI SDK tools', 'streaming UI', 'AI Gateway routing', 'usage tracking', 'model fallback'],
    guardrail: 'Every app agent must show source scope, output owner, and whether it is draft-only or allowed to create a queued action.',
    source: 'Vercel AI SDK docs',
    sourceUrl: 'https://ai-sdk.dev/docs',
  },
  {
    id: 'langgraph',
    name: 'LangGraph',
    status: 'Adopt now',
    bestFor: 'Stateful workflows, human-in-the-loop approvals, retries, long-running graph flows, memory, and deterministic agent state.',
    useInSuperMega: 'Run source-change review, CAPA generation, weekly KPI story, and approval workflows as durable graphs.',
    tools: ['state graph', 'checkpoints', 'human review nodes', 'memory', 'retry control'],
    guardrail: 'Use graph state for repeatable business workflows; do not hide unresolved decisions inside a chat transcript.',
    source: 'LangGraph docs',
    sourceUrl: 'https://docs.langchain.com/oss/python/langgraph/overview',
  },
  {
    id: 'cloudflare-agents',
    name: 'Cloudflare Agents + Workflows',
    status: 'Prototype',
    bestFor: 'Edge-hosted agents, durable objects, WebSockets, background jobs, scheduled monitoring, and globally close tenant workers.',
    useInSuperMega: 'Prototype always-on connector monitors and lightweight tenant edge agents after the Vercel core is stable.',
    tools: ['Durable Objects', 'Workers', 'Workflows', 'queues', 'WebSockets'],
    guardrail: 'Use for bounded background workers, not for uncontrolled autonomous write access.',
    source: 'Cloudflare Agents docs',
    sourceUrl: 'https://developers.cloudflare.com/agents/',
  },
  {
    id: 'google-agent-engine-adk',
    name: 'Google ADK + Vertex AI Agent Engine',
    status: 'Prototype',
    bestFor: 'Google Workspace-heavy clients, managed agent sessions, identity, memory, evaluations, deployment, and observability.',
    useInSuperMega: 'Use for Factory Client Drive/Gmail/Sheets intelligence lanes when Google-native governance matters.',
    tools: ['Google Drive', 'Gmail', 'Sheets', 'Agent Engine', 'sessions', 'memory', 'evaluations'],
    guardrail: 'Map Google agent identity and data scope into the SuperMega evidence ledger before client production use.',
    source: 'Vertex AI Agent Engine docs',
    sourceUrl: 'https://cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/overview',
  },
  {
    id: 'llamaindex-rag',
    name: 'LlamaIndex',
    status: 'Adopt now',
    bestFor: 'RAG, document parsing, indexes, knowledge graph enrichment, retrieval tools, and source-grounded answers.',
    useInSuperMega: 'Build the tenant knowledge layer from Drive, PDFs, Docs, Sheets, and SOP folders.',
    tools: ['document loaders', 'indexes', 'retrievers', 'knowledge graph', 'query engines'],
    guardrail: 'Every answer needs citations, source freshness, and a human owner for incorrect or stale records.',
    source: 'LlamaIndex docs',
    sourceUrl: 'https://docs.llamaindex.ai/',
  },
  {
    id: 'crewai-autogen-lab',
    name: 'CrewAI / AutoGen R&D lane',
    status: 'Watch',
    bestFor: 'Research crews, debate, design alternatives, multi-agent critique, and prototype exploration.',
    useInSuperMega: 'Use as an R&D comparison lane for module ideation, not as the default production runtime.',
    tools: ['role crews', 'multi-agent chat', 'prototype tasks', 'critic loops'],
    guardrail: 'Research agents can propose modules; only release-gated SuperMega module contracts ship to clients.',
    source: 'CrewAI and AutoGen docs',
    sourceUrl: 'https://docs.crewai.com/',
  },
]

export const PORTAL_FACTORY_AGENT_LAYERS: PortalFactoryAgentLayer[] = [
  {
    id: 'l0-copilot',
    level: 'L0',
    name: 'Role Copilot',
    job: 'Helps one human in one module: summarize, draft, classify, and explain next action.',
    canCall: ['Module Specialist Agent'],
    toolAccess: ['current module data', 'approved source records', 'task API'],
    writes: 'Draft notes and queued tasks only.',
    humanGate: 'User confirms before save or send.',
  },
  {
    id: 'l1-module-agent',
    level: 'L1',
    name: 'Module Specialist Agent',
    job: 'Owns a business workflow such as CAPA, shift handover, supplier recovery, menu import, or CRM follow-up.',
    canCall: ['Data Cleaner', 'Policy Checker', 'Evidence Agent'],
    toolAccess: ['module schema', 'connector ledger', 'workflow queue', 'standards rules'],
    writes: 'Creates evidence packets, proposed records, and review tasks.',
    humanGate: 'Manager approves writeback and policy-sensitive actions.',
  },
  {
    id: 'l2-tool-agents',
    level: 'L2',
    name: 'Tool Agents',
    job: 'Use specific computer tools: Drive/Gmail/Sheets, browser, code, PDF extraction, image/menu OCR, and data analysis.',
    canCall: ['Reviewer Agent'],
    toolAccess: ['scoped connector tokens', 'sandbox files', 'browser session', 'analysis workspace'],
    writes: 'Writes extracted artifacts and proposed normalized records to staging.',
    humanGate: 'No direct production write without a staged diff and evidence trail.',
  },
  {
    id: 'l3-reviewer',
    level: 'L3',
    name: 'Reviewer Agent',
    job: 'Checks quality, security, source citations, missing evidence, and whether the output matches the module contract.',
    canCall: ['Module Specialist Agent', 'Release Controller'],
    toolAccess: ['audit log', 'policy rules', 'test fixtures', 'evaluation rubrics'],
    writes: 'Approves, blocks, or requests revision with reason.',
    humanGate: 'Human owner can override, reject, or require another review.',
  },
  {
    id: 'l4-release-controller',
    level: 'L4',
    name: 'Release Controller',
    job: 'Promotes proven workflows into reusable modules, tenant templates, and onboarding packs.',
    canCall: ['Portal Architect', 'QA Agent', 'Sales Pack Agent'],
    toolAccess: ['template registry', 'module registry', 'deployment checklist', 'go-live checker'],
    writes: 'Creates release packet, rollout checklist, and sellable template update.',
    humanGate: 'Platform admin approves production release.',
  },
]

export const PORTAL_FACTORY_DELIVERY_STEPS: PortalFactoryDeliveryStep[] = [
  {
    id: 'select-template',
    name: 'Select template',
    owner: 'Portal Architect',
    output: 'Industry OS, buyer pain, roles, data plugs, starter wedge, and proof account.',
    passRule: 'A buyer can understand the first use case in one sentence.',
  },
  {
    id: 'assemble-modules',
    name: 'Assemble modules',
    owner: 'Module Builder',
    output: 'Shell modules, shared modules, industry modules, role visibility, and launch sequence.',
    passRule: 'Every module has input, owner, output, agent assist, KPI, and review gate.',
  },
  {
    id: 'connect-data',
    name: 'Connect data',
    owner: 'Data Engineer Agent',
    output: 'Source ledger, sync state, changed-file queue, extraction plan, and data-quality queue.',
    passRule: 'No AI answer exists without source provenance and freshness state.',
  },
  {
    id: 'employ-agents',
    name: 'Employ agents',
    owner: 'Agent Ops',
    output: 'Agent roster, tool permissions, delegated subagents, review policy, and run evidence.',
    passRule: 'Agents can use AI and tools, but risky actions are staged and reviewed.',
  },
  {
    id: 'launch-proof',
    name: 'Launch proof',
    owner: 'Launch Pod',
    output: 'Domain, login, sample data, walkthrough script, screenshots, and go-live check.',
    passRule: 'Client can log in, complete the first task, and see value within five minutes.',
  },
  {
    id: 'learn-promote',
    name: 'Learn and promote',
    owner: 'R&D Release Cell',
    output: 'Usage signals, friction queue, ERRC gap review, and promoted module improvements.',
    passRule: 'Only repeated, measured pain becomes a new reusable module.',
  },
]

export const PORTAL_FACTORY_ASSEMBLY_RULES: PortalFactoryAssemblyRule[] = [
  {
    id: 'portal-is-wrapper',
    rule: 'The portal is a wrapper, not the product.',
    why: 'The product is the reusable module contract, agent runtime, data mapping, and onboarding system.',
  },
  {
    id: 'one-wedge-first',
    rule: 'Start every client with one painful workflow.',
    why: 'A small wedge becomes sellable and usable faster than a full ERP clone.',
  },
  {
    id: 'kernel-everywhere',
    rule: 'Every portal gets the same kernel.',
    why: 'Login, roles, connectors, evidence, approvals, audit, and agent control must compound across tenants.',
  },
  {
    id: 'customize-by-config',
    rule: 'Customize by template and module registry before writing bespoke code.',
    why: 'This keeps delivery scalable and stops client work from becoming agency work.',
  },
  {
    id: 'agents-are-employed',
    rule: 'Agents are employees with tools, workspaces, supervisors, and review gates.',
    why: 'AI using AI agents is powerful only when each layer has scope, evidence, and promotion rules.',
  },
]

export const PORTAL_FACTORY_INTAKE_QUESTIONS: PortalFactoryIntakeQuestion[] = [
  {
    id: 'company-type',
    label: 'Company type',
    prompt: 'What does the company do and which department is most painful right now?',
    example: 'Tyre factory, three plants, first pain is quality and maintenance handover.',
    mapsTo: 'industry kit, first wedge, role map',
  },
  {
    id: 'first-workflow',
    label: 'First workflow',
    prompt: 'What is one repeated workflow that wastes time, creates mistakes, or needs manager follow-up?',
    example: 'Supplier delivery mismatch creates WhatsApp follow-up, QC holds, and manual Excel updates.',
    mapsTo: 'day-one module, action queue, KPI',
  },
  {
    id: 'roles',
    label: 'Roles',
    prompt: 'Who uses it daily, who approves, who only needs reports, and who administers the system?',
    example: 'Operator captures, quality lead approves CAPA, plant manager reviews, CEO sees brief.',
    mapsTo: 'permissions, workspace type, landing route',
  },
  {
    id: 'source-systems',
    label: 'Source systems',
    prompt: 'Which files, inboxes, sheets, exports, apps, or folders already contain the truth?',
    example: 'Google Drive QC folder, Gmail supplier lane, ERP CSV export, receiving workbook.',
    mapsTo: 'connector ledger, extraction jobs, freshness checks',
  },
  {
    id: 'desired-ai-actions',
    label: 'AI actions',
    prompt: 'What should AI prepare, and what must stay human-approved?',
    example: 'Draft 5W1H and claim packet, but quality manager approves CAPA and supplier emails.',
    mapsTo: 'agent tools, review gate, writeback policy',
  },
  {
    id: 'proof-constraints',
    label: 'Proof constraints',
    prompt: 'What domain, proof account, mobile need, language, and deadline should the product proof support?',
    example: 'client.supermega.dev, owner proof login, mobile capture, English first, proof by Friday.',
    mapsTo: 'domain plan, verification tests, launch pack',
  },
]

export const PORTAL_GENERATOR_PIPELINE: PortalGeneratorStage[] = [
  {
    id: 'parse-intake',
    name: 'Parse intake',
    input: 'Client checklist, notes, sample files, and role descriptions.',
    output: 'Structured company profile with pain, roles, data sources, and first value workflow.',
    agentOwner: 'Portal Architect Agent',
    gate: 'Human confirms the first workflow before build starts.',
  },
  {
    id: 'select-kit',
    name: 'Select kit and modules',
    input: 'Company profile plus industry kit registry.',
    output: 'Portal manifest with shared shell, day-one modules, adaptive modules, routes, and proof account.',
    agentOwner: 'Module Contract Agent',
    gate: 'Every module has input, owner, output, KPI, AI action, and review policy.',
  },
  {
    id: 'map-data',
    name: 'Map source truth',
    input: 'Drive, Gmail, Sheets, uploads, ERP exports, POS data, or client-provided files.',
    output: 'Connector scope, source ledger, freshness state, extraction queue, and data-quality rules.',
    agentOwner: 'Data Fabric Agent',
    gate: 'No insight is shown without source scope and freshness.',
  },
  {
    id: 'generate-app',
    name: 'Generate app packet',
    input: 'Portal manifest, route library, component library, and module contracts.',
    output: 'Route plan, page copy, starter records, screenshots list, and deployment checklist.',
    agentOwner: 'Codex Builder Agent',
    gate: 'Build, lint, typecheck, route audit, and login verification must pass.',
  },
  {
    id: 'learn-adapt',
    name: 'Learn and adapt',
    input: 'Usage, support notes, failed actions, source changes, and manager feedback.',
    output: 'ERRC queue, module simplification, promoted modules, removed clutter, and next sprint packet.',
    agentOwner: 'Learning and ERRC Agent',
    gate: 'Only measured repeated pain becomes a new module.',
  },
]

export const PORTAL_FACTORY_WORKFORCE_CELLS: PortalFactoryWorkforceCell[] = [
  {
    id: 'portal-architecture-cell',
    name: 'Portal Architecture Cell',
    mission: 'Convert a prospect into a sellable portal blueprint with roles, modules, wedge workflow, data plugs, and proof path.',
    agents: ['Portal Architect', 'Module Contract Agent', 'UX Simplifier', 'Buyer Story Agent'],
    workspace: 'Portal Factory and Build Studio',
    toolAccess: ['industry templates', 'module registry', 'route map', 'buyer script', 'standards library'],
    output: 'A launchable template packet with first workflow, enabled modules, role map, and proof script.',
    promotionGate: 'A new buyer can understand the portal and first value moment in under five minutes.',
  },
  {
    id: 'data-fabric-cell',
    name: 'Data Fabric Cell',
    mission: 'Watch company files, email, spreadsheets, exports, uploads, and forms so changed source data becomes clean operating records.',
    agents: ['Source Monitor', 'Extractor', 'Data Cleaner', 'Feature Engineer', 'KPI Story Agent'],
    workspace: 'Connector Hub and Data Fabric',
    toolAccess: ['Drive', 'Gmail', 'Sheets', 'uploads', 'ERP exports', 'staging tables', 'source ledger'],
    output: 'Freshness state, changed-file queue, cleaned records, metrics, and evidence-backed insight cards.',
    promotionGate: 'No module can ship without source provenance, owner, freshness, and data-quality state.',
  },
  {
    id: 'module-prototyping-cell',
    name: 'Module Prototyping Cell',
    mission: 'Build disruptive module prototypes for industrial, restaurant, retail, service, and custom client workflows.',
    agents: ['Industrial Engineer Agent', 'Restaurant Ops Agent', 'Retail Ops Agent', 'Workflow Designer', 'Prototype Builder'],
    workspace: 'R&D Lab and module sandbox',
    toolAccess: ['standards library', 'agent frameworks', 'UI sandbox', 'fixtures', 'synthetic sample data', 'module tests'],
    output: 'Small tested modules with input, owner, output, AI assist, KPI, review gate, and escalation logic.',
    promotionGate: 'Prototype graduates only after it removes a real step, reduces decision time, or creates a measurable KPI action.',
  },
  {
    id: 'qa-security-cell',
    name: 'QA and Security Cell',
    mission: 'Keep every portal tenant-safe, reviewable, testable, and resistant to AI-agent failure modes.',
    agents: ['Access Reviewer', 'Prompt-Injection Tester', 'Evidence Auditor', 'Route Verification Agent', 'Policy Reviewer'],
    workspace: 'Platform Admin and test evidence ledger',
    toolAccess: ['capability registry', 'audit logs', 'test accounts', 'go-live checker', 'security rubrics'],
    output: 'Route checks, access findings, prompt-risk notes, test evidence, and release blockers.',
    promotionGate: 'No cross-tenant read, no unreviewed writeback, no hidden source, and no broken direct route.',
  },
  {
    id: 'launch-gtm-cell',
    name: 'Launch and GTM Cell',
    mission: 'Turn working modules into client-facing proof: proof login, screenshots, walkthrough, pricing angle, and first onboarding task.',
    agents: ['Proof Producer', 'Sales Pack Agent', 'Onboarding Agent', 'Screenshot Agent', 'Client Handoff Agent'],
    workspace: 'Products, case study, and go-live console',
    toolAccess: ['public catalog', 'tenant workspace', 'proof credentials', 'lead forms', 'domain checks'],
    output: 'A sellable proof pack with live route, proof account, screenshot set, first-task guide, and client handoff checklist.',
    promotionGate: 'A client can log in, complete one valuable workflow, and know what to buy next.',
  },
  {
    id: 'learning-cell',
    name: 'Learning and ERRC Cell',
    mission: 'Use real usage, errors, friction, and client feedback to decide what to eliminate, reduce, raise, and create next.',
    agents: ['Friction Miner', 'ERRC Analyst', 'Usage Reviewer', 'Roadmap Agent', 'Release Controller'],
    workspace: 'Meta workspace and evidence ledger',
    toolAccess: ['usage events', 'support notes', 'task queues', 'module metrics', 'release history'],
    output: 'Weekly ERRC queue, module promotions, removed clutter, and next experiment shortlist.',
    promotionGate: 'Only repeated evidence, not hype, creates new modules or navigation.',
  },
]

export const PORTAL_FACTORY_CONTROL_METRICS: PortalFactoryControlMetric[] = [
  {
    id: 'first-value-time',
    name: 'First value time',
    target: '<= 5 minutes',
    owner: 'Portal Architecture Cell',
    why: 'A portal is not sellable if the user cannot quickly complete one useful workflow.',
  },
  {
    id: 'source-provenance',
    name: 'Source provenance coverage',
    target: '100% of AI insights cite source scope and freshness',
    owner: 'Data Fabric Cell',
    why: 'AI-native ERP depends on trusted source traceability, not generic chatbot answers.',
  },
  {
    id: 'module-contract-coverage',
    name: 'Module contract coverage',
    target: 'Every enabled module has input, owner, output, KPI, agent assist, and review gate',
    owner: 'Module Prototyping Cell',
    why: 'This keeps modules consequential and stops the product from becoming random pages.',
  },
  {
    id: 'reviewed-writeback',
    name: 'Reviewed writeback',
    target: '0 direct risky writes without staged diff and approval',
    owner: 'QA and Security Cell',
    why: 'Agents can move fast only when production changes are governed and auditable.',
  },
  {
    id: 'route-health',
    name: 'Route and deploy health',
    target: '100% direct routes exported, custom domains ready, login verification passing',
    owner: 'Launch and GTM Cell',
    why: 'A live proof route cannot depend on fragile local navigation or hidden setup steps.',
  },
  {
    id: 'reuse-rate',
    name: 'Reusable module promotion',
    target: '>= 70% of client work assembled from registry modules',
    owner: 'Learning and ERRC Cell',
    why: 'The business scales by compounding templates and modules, not by custom agency delivery.',
  },
]

export function buildPortalFactorySummary(kit: IndustryPortalKit) {
  const dayOneModules = kit.moduleBlueprints.filter((module) => module.launchMode === 'Day 1')
  const weekTwoModules = kit.moduleBlueprints.filter((module) => module.launchMode === 'Week 2')
  const adaptiveModules = kit.moduleBlueprints.filter((module) => module.launchMode === 'Adaptive')

  return {
    dayOneModules,
    weekTwoModules,
    adaptiveModules,
    totalModules: kit.moduleBlueprints.length,
    launchReadiness: `${dayOneModules.length} day-one modules, ${weekTwoModules.length} week-two modules, ${adaptiveModules.length} adaptive modules`,
    agentCrew: [
      `${kit.industry} Portal Architect`,
      'Data Cleaner',
      'Workflow Agent',
      'Evidence Reviewer',
      'Release Controller',
    ],
  }
}
