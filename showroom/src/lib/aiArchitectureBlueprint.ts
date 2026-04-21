export type AgentTechnique = {
  id: string
  name: string
  pattern: string
  purpose: string
  ytfUse: string
  adoptNext: string
}

export type ArchitectureStackLayer = {
  id: string
  layer: string
  recommendation: string
  role: string
  whyNow: string
}

export const AGENT_TECHNIQUES: AgentTechnique[] = [
  {
    id: 'dialectic-redesign',
    name: 'Thesis-antithesis-synthesis loop',
    pattern: 'Frame the current workflow as thesis, the operational conflict as antithesis, and the AI-native operating system as synthesis.',
    purpose: 'This keeps redesign grounded in real business tension instead of copying menus or growing random features.',
    ytfUse: 'Use the triad on every Yangon Tyre module before promotion: current process, failure mode, then the new role-home and record loop.',
    adoptNext: 'Add thesis, antithesis, and synthesis fields to every tenant app brief and release review.',
  },
  {
    id: 'tool-loop',
    name: 'Reusable tool-loop agents',
    pattern: 'Standardize app agents around reusable tool-loop definitions instead of ad hoc prompt chains.',
    purpose: 'One agent contract can run in chat, jobs, API routes, and review flows with the same tools and output schema.',
    ytfUse: 'Use the same account, DQMS, supplier, and director agents in portal chat, scheduled loops, and operator-triggered actions.',
    adoptNext: 'Refactor tenant crews into named tool-loop agents with typed outputs and approval hooks.',
  },
  {
    id: 'stateful-runtime',
    name: 'Stateful per-tenant agents',
    pattern: 'Give important agents durable per-tenant memory, schedules, and live connections instead of rebuilding context every run.',
    purpose: 'Long-lived agents can keep thread state, watch loops, and review posture without stitching state together on every request.',
    ytfUse: 'Run Yangon Tyre watch loops as stateful tenant agents for director review, manufacturing drift, and supplier recovery.',
    adoptNext: 'Move always-on tenant crews into a stateful agent runtime with explicit tenant and workspace IDs.',
  },
  {
    id: 'durable-workflows',
    name: 'Durable human-in-the-loop workflows',
    pattern: 'Treat approvals, escalations, and multi-day follow-up as resumable workflows with retries and wait states.',
    purpose: 'The platform should survive deploys, crashes, and delayed human approvals without losing progress.',
    ytfUse: 'Use durable workflows for supplier approvals, CAPA closeout, launch checklists, and management decisions that pause for review.',
    adoptNext: 'Wrap approval-heavy flows in durable workflow primitives before expanding autonomous writes.',
  },
  {
    id: 'mcp-connectors',
    name: 'MCP connector plane',
    pattern: 'Expose external systems through MCP tools, resources, and prompts rather than bespoke connector code in every agent.',
    purpose: 'A shared connector plane makes Gmail, Drive, ERP, shopfloor, and future chat apps composable across the whole platform.',
    ytfUse: 'Promote Yangon Tyre data sources into reusable MCP servers so any tenant app or agent can read the same evidence spine.',
    adoptNext: 'Package connector domains as remote MCP servers with tenant-aware auth and rate controls.',
  },
  {
    id: 'browser-actions',
    name: 'Browser-action agents',
    pattern: 'Use structured browser automation for systems that do not expose clean APIs yet.',
    purpose: 'Browser agents bridge legacy software and validate UI flows without forcing brittle screenshot-only automation.',
    ytfUse: 'Handle ERP portals, supplier sites, and internal web flows while the direct connector layer is still maturing.',
    adoptNext: 'Standardize browser tasks around structured Playwright runs with trace capture and review gates.',
  },
  {
    id: 'evals-observability',
    name: 'Eval and observability loops',
    pattern: 'Every autonomous loop needs evals, cost visibility, failure capture, and freshness monitoring.',
    purpose: 'The system should know when agents are wrong, stale, expensive, or confusing before staff lose trust.',
    ytfUse: 'Measure data-entry friction, stale connectors, false alerts, and unresolved escalations across plant workflows.',
    adoptNext: 'Bind runtime metrics, UX evals, and agent outcomes into one promotion score before wider rollout.',
  },
]

export const AI_NATIVE_STACK_LAYERS: ArchitectureStackLayer[] = [
  {
    id: 'experience',
    layer: 'Experience and app shell',
    recommendation: 'React portal surfaces with typed AI UI streaming contracts.',
    role: 'Keep operator homes, reviews, and AI responses inside one role-based workspace.',
    whyNow: 'The portal already exists; the next step is to standardize every app around shared response and approval components.',
  },
  {
    id: 'agent-sdk',
    layer: 'Agent runtime',
    recommendation: 'Vercel AI SDK agents for reusable tool loops and typed UI integration.',
    role: 'Define portable agent contracts that can run in chat, API routes, and background jobs with shared tools.',
    whyNow: 'This reduces duplicated orchestration code as the number of tenant crews grows.',
  },
  {
    id: 'stateful-agents',
    layer: 'Stateful tenant memory',
    recommendation: 'Cloudflare Agents SDK backed by Durable Objects for always-on tenant and app crews.',
    role: 'Give each tenant or app crew durable state, scheduling, WebSockets, and tenant-scoped coordination.',
    whyNow: 'Yangon Tyre needs continuous watch loops, not just stateless prompt calls.',
  },
  {
    id: 'durable-orchestration',
    layer: 'Durable orchestration',
    recommendation: 'Vercel Workflow / Workflow DevKit for approvals, pauses, retries, and multi-day execution.',
    role: 'Run review-heavy flows that pause for people, webhooks, or external systems without custom queue glue.',
    whyNow: 'Supplier recovery, CAPA, and rollout tasks already behave like durable workflows.',
  },
  {
    id: 'connector-plane',
    layer: 'Connector and tool plane',
    recommendation: 'Remote MCP servers for Gmail, Drive, ERP, shopfloor, chat, and internal control surfaces.',
    role: 'Expose tools, resources, and prompts to all agents through a single contract layer.',
    whyNow: 'New channels like Viber, LINE, and WeChat should plug into the same tool contract instead of bespoke agent logic.',
  },
  {
    id: 'browser-runtime',
    layer: 'Browser and software action layer',
    recommendation: 'Playwright MCP and structured browser runs for legacy systems and UI validation.',
    role: 'Automate portals, collect traces, and verify end-to-end app flows with strong isolation.',
    whyNow: 'Some target systems will not expose reliable APIs early, but the agents still need controlled action paths.',
  },
  {
    id: 'model-routing',
    layer: 'Model access and routing',
    recommendation: 'AI Gateway style provider routing with failover, structured outputs, and cost observability.',
    role: 'Use the best model per job without hard-coding the platform to one vendor.',
    whyNow: 'The platform will need cheap classification, stronger reasoning, and failover under production load.',
  },
  {
    id: 'records-graph',
    layer: 'Canonical record graph',
    recommendation: 'Shared operational records with provenance, freshness, and vector-backed retrieval.',
    role: 'Keep every app and agent grounded in the same evidence-bearing business memory.',
    whyNow: 'If records split by app or connector, the AI layer becomes noisy and staff stop trusting it.',
  },
]
