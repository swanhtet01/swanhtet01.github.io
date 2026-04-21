export type DialecticCard = {
  id: string
  domain: string
  title: string
  thesis: string
  antithesis: string
  synthesis: string
  implementation: string
  routes: Array<{
    label: string
    to: string
  }>
}

export type FrameworkDecision = {
  id: string
  name: string
  category: 'Orchestration' | 'Workflow' | 'Stateful Runtime' | 'Protocol' | 'Observability' | 'PromptOps' | 'UI'
  status: 'Adopt now' | 'Pilot now' | 'Standardize next'
  thesis: string
  antithesis: string
  synthesis: string
  why: string
  useCases: string[]
  docs: Array<{
    label: string
    href: string
  }>
}

export type AgentTechniquePattern = {
  id: string
  name: string
  principle: string
  implementation: string
  outcome: string
}

export type ExecutionTaskSeed = {
  title: string
  owner: string
  priority: 'High' | 'Medium' | 'Low'
  due: string
  notes: string
}

export type ExecutionTrack = {
  id: string
  name: string
  objective: string
  thesis: string
  antithesis: string
  synthesis: string
  outcome: string
  tasks: ExecutionTaskSeed[]
}

export type DelegatedPodCharter = {
  id: string
  name: string
  mission: string
  owns: string[]
  readScope: string[]
  writeScope: string[]
  reviewGate: string
  routes: Array<{
    label: string
    to: string
  }>
}

export type InfrastructurePhase = {
  id: string
  phase: string
  outcome: string
  thesis: string
  antithesis: string
  synthesis: string
  focus: string[]
  route: string
}

export const STRATEGIC_DIALECTICS: DialecticCard[] = [
  {
    id: 'suite-vs-wedge',
    domain: 'Product strategy',
    title: 'Do not clone giant suites first',
    thesis: 'Replicate major SaaS categories so the platform can eventually replace CRM, ERP, office, and ops software.',
    antithesis: 'Suite cloning creates shallow surfaces, weak adoption, and a giant backlog that never becomes operationally trusted.',
    synthesis: 'Use wedge-first modules on top of one portal kernel, one memory layer, and one guarded agent runtime.',
    implementation: 'Keep the shared platform deep while each app line starts from one painful workflow with live operators, files, and approvals.',
    routes: [
      { label: 'Build', to: '/app/factory' },
      { label: 'Product Ops', to: '/app/product-ops' },
      { label: 'Platform Admin', to: '/app/platform-admin' },
    ],
  },
  {
    id: 'autonomy-vs-trust',
    domain: 'Agent operations',
    title: 'Autonomy without trust is a liability',
    thesis: 'Agents should run the company 24/7, continuously preparing work, routing tasks, and executing repeatable operations.',
    antithesis: 'Unbounded agents create unsafe writes, hidden state changes, and brittle trust across tenants, teams, and records.',
    synthesis: 'Run bounded loops with typed outputs, visible traces, reversible actions, and human approval hooks for risky work.',
    implementation: 'Default to semi-autonomous prep loops. Promote writes only after guardrails, audit coverage, and rollback paths are visible.',
    routes: [
      { label: 'Agent Ops', to: '/app/teams' },
      { label: 'Runtime', to: '/app/runtime' },
      { label: 'Policies', to: '/app/policies' },
    ],
  },
  {
    id: 'framework-sprawl-vs-lockin',
    domain: 'Architecture',
    title: 'Avoid both framework sprawl and single-vendor lock-in',
    thesis: 'One framework everywhere feels simpler and faster to standardize.',
    antithesis: 'No single framework cleanly covers orchestration, durable execution, real-time state, UI streaming, observability, and prompt ops.',
    synthesis: 'Adopt a layered stack with a primary tool for each concern and a clean contract between layers.',
    implementation: 'Use OpenAI for orchestration, MCP for tool contracts, a durable workflow engine for long-running work, and standard observability across all of it.',
    routes: [
      { label: 'Workbench', to: '/app/workbench' },
      { label: 'Architect', to: '/app/architect' },
      { label: 'Runtime', to: '/app/runtime' },
    ],
  },
  {
    id: 'prompt-speed-vs-governance',
    domain: 'Prompt and eval operations',
    title: 'Prompt speed must not outrun quality control',
    thesis: 'Prompt-driven systems let us iterate much faster than legacy software release cycles.',
    antithesis: 'Prompt-only systems drift, regress silently, and become impossible to audit or compare over time.',
    synthesis: 'Move prompts into a versioned prompt-ops layer and tie every major prompt or tool loop to traces, datasets, and eval scores.',
    implementation: 'Treat prompts like deployed system assets: version them, label them, link them to traces, and evaluate changes before promotion.',
    routes: [
      { label: 'Workbench', to: '/app/workbench' },
      { label: 'Insights', to: '/app/insights' },
      { label: 'Knowledge', to: '/app/knowledge' },
    ],
  },
]

export const FRAMEWORK_DECISIONS: FrameworkDecision[] = [
  {
    id: 'openai-agents',
    name: 'OpenAI Responses API + Agents SDK',
    category: 'Orchestration',
    status: 'Adopt now',
    thesis: 'Use a code-first orchestration layer for specialist agents, tools, handoffs, guardrails, and stateful runs.',
    antithesis: 'Pure chat endpoints are weak for multi-agent ownership, tool semantics, and long-running execution.',
    synthesis: 'Make OpenAI the default orchestration layer for specialist agents and use background Responses for long-running work.',
    why: 'This gives us code-first agent definitions, orchestration and handoff guidance, guardrails, MCP/tool support, and background execution for long tasks.',
    useCases: ['specialist agent contracts', 'tool orchestration', 'research loops', 'guarded multi-step runs'],
    docs: [
      { label: 'Agents SDK', href: 'https://developers.openai.com/api/docs/guides/agents' },
      { label: 'Background mode', href: 'https://developers.openai.com/api/docs/guides/background' },
      { label: 'Model guide', href: 'https://developers.openai.com/api/docs/models' },
    ],
  },
  {
    id: 'vercel-ai-sdk',
    name: 'Vercel AI SDK',
    category: 'UI',
    status: 'Adopt now',
    thesis: 'The portal needs streamed AI-native interfaces and typed structured outputs at the app layer.',
    antithesis: 'Hand-rolling streaming UI, tool rendering, and schema enforcement across every app becomes repetitive and fragile.',
    synthesis: 'Use Vercel AI SDK as the default UI/runtime integration layer for streaming responses, tool calls, and schema-bound outputs.',
    why: 'AI SDK gives us structured generation, streaming, and tool calling in one frontend-friendly package that fits the existing web product.',
    useCases: ['chat and copilots', 'structured extraction UIs', 'tool-result rendering', 'typed workflow forms'],
    docs: [
      { label: 'AI SDK', href: 'https://vercel.com/docs/ai-sdk' },
      { label: 'Workflow', href: 'https://vercel.com/docs/workflow/' },
    ],
  },
  {
    id: 'cloudflare-agents',
    name: 'Cloudflare Agents SDK',
    category: 'Stateful Runtime',
    status: 'Pilot now',
    thesis: 'Some agent teams need real-time state, WebSockets, scheduling, browser tools, and always-resumable conversations.',
    antithesis: 'Serverless request-response runtimes are awkward for highly interactive, stateful, multi-client agent sessions.',
    synthesis: 'Pilot Cloudflare Agents where we need stateful edge agents, live sessions, and human-in-the-loop approvals with durable state.',
    why: 'Cloudflare Agents runs each agent on a Durable Object with built-in state, SQL, sockets, scheduling, and HITL patterns.',
    useCases: ['stateful customer copilots', 'real-time operator rooms', 'long-lived control agents', 'browser-assisted agents'],
    docs: [
      { label: 'Agents', href: 'https://developers.cloudflare.com/agents/' },
      { label: 'Client SDK', href: 'https://developers.cloudflare.com/agents/api-reference/client-sdk/' },
    ],
  },
  {
    id: 'durable-workflows',
    name: 'Temporal / Vercel Workflow',
    category: 'Workflow',
    status: 'Standardize next',
    thesis: 'The platform needs durable, resumable, multi-step workflows for approvals, launch sequences, and long-running agent jobs.',
    antithesis: 'Cron plus ad hoc queues plus retry wrappers will become operational debt as workflows grow longer and more business-critical.',
    synthesis: 'Standardize a durable workflow lane: Vercel Workflow for Next.js-native product flows, Temporal for cross-cloud or deeper backend orchestration.',
    why: 'Both platforms explicitly target durable execution. Vercel gives a managed path for our web product; Temporal is the stronger cross-service durability engine.',
    useCases: ['tenant launches', 'approval orchestration', 'long-running enrichment', 'multi-day follow-up sequences'],
    docs: [
      { label: 'Vercel Workflow', href: 'https://vercel.com/docs/workflow/' },
      { label: 'Temporal Workflows', href: 'https://docs.temporal.io/workflows' },
    ],
  },
  {
    id: 'mcp-contract',
    name: 'Model Context Protocol',
    category: 'Protocol',
    status: 'Adopt now',
    thesis: 'Tools, resources, and connectors should be portable across agents, apps, and execution runtimes.',
    antithesis: 'Framework-specific tool contracts create connector silos and make our platform harder to compose or swap.',
    synthesis: 'Use MCP as the standard contract for tool and context exposure, with internal servers for platform data and external servers for third-party systems.',
    why: 'MCP gives us a clean client-server protocol for tools, resources, prompts, and remote or local context exchange without dictating the model layer.',
    useCases: ['connector abstraction', 'internal platform tools', 'remote tool federation', 'research connectors'],
    docs: [
      { label: 'Architecture', href: 'https://modelcontextprotocol.io/docs/learn/architecture' },
      { label: 'SDKs', href: 'https://modelcontextprotocol.io/docs/sdk' },
      { label: 'Tools spec', href: 'https://modelcontextprotocol.io/specification/draft/server/tools' },
    ],
  },
  {
    id: 'otel',
    name: 'OpenTelemetry',
    category: 'Observability',
    status: 'Adopt now',
    thesis: 'The agent company needs traces, metrics, and logs across app requests, tool calls, jobs, and workflows.',
    antithesis: 'Vendor-specific telemetry without a standard signal model will fragment the debugging and ops surface.',
    synthesis: 'Standardize telemetry around OpenTelemetry and export it to whichever vendor or warehouse we use.',
    why: 'OTel is vendor-neutral and gives a standard basis for traces, metrics, and logs across runtimes.',
    useCases: ['distributed traces', 'agent run spans', 'workflow metrics', 'runtime dashboards'],
    docs: [
      { label: 'OpenTelemetry docs', href: 'https://opentelemetry.io/docs/' },
    ],
  },
  {
    id: 'langfuse',
    name: 'Langfuse',
    category: 'PromptOps',
    status: 'Pilot now',
    thesis: 'Prompt versions, traces, experiments, and evaluation scores should be managed as first-class production assets.',
    antithesis: 'Keeping prompts in code only makes prompt iteration slow and breaks collaboration between product, operators, and engineering.',
    synthesis: 'Pilot Langfuse for prompt versioning, trace-linked prompt analysis, and production/development eval loops.',
    why: 'Langfuse links traces, sessions, prompt management, experiments, and online evaluations in one system that can be self-hosted or integrated by API.',
    useCases: ['prompt versioning', 'trace-linked prompt analysis', 'LLM-as-judge', 'dataset experiments'],
    docs: [
      { label: 'Langfuse overview', href: 'https://langfuse.com/docs' },
      { label: 'Prompt management', href: 'https://langfuse.com/docs/prompt-management/overview' },
    ],
  },
]

export const AGENT_TECHNIQUE_PATTERNS: AgentTechniquePattern[] = [
  {
    id: 'specialist-ownership',
    name: 'Specialist ownership',
    principle: 'Each agent owns one bounded role, one write scope, and one escalation surface.',
    implementation: 'Use multi-agent orchestration only when ownership is explicit and handoffs are observable.',
    outcome: 'Fewer vague “general assistants,” better debugging, and clearer accountability.',
  },
  {
    id: 'schema-first',
    name: 'Schema-first outputs',
    principle: 'Important agent work should resolve into typed objects, not prose that downstream systems must reinterpret.',
    implementation: 'Use structured generation and typed output schemas for tasks, records, approvals, and analysis packs.',
    outcome: 'Lower integration risk and cleaner promotion from AI work into product state.',
  },
  {
    id: 'durable-execution',
    name: 'Durable execution',
    principle: 'Long-running work should pause and resume safely instead of depending on fragile process uptime.',
    implementation: 'Move long research, launch, approval, and follow-up sequences onto background or durable workflow lanes.',
    outcome: 'Fewer timeout failures and clearer operational recovery.',
  },
  {
    id: 'human-review',
    name: 'Human review for risky work',
    principle: 'Autonomy should expand only where review gates, denial paths, and rollback paths are explicit.',
    implementation: 'Attach approval hooks to risky writes, cross-functional decisions, and tenant-affecting changes.',
    outcome: 'Higher trust and safer automation expansion.',
  },
  {
    id: 'trace-eval-loop',
    name: 'Trace-to-eval loop',
    principle: 'What happened in production should feed directly into evaluation and prompt/model improvement.',
    implementation: 'Link traces, prompt versions, user feedback, and datasets into one review cycle.',
    outcome: 'Faster diagnosis and more defensible improvements.',
  },
]

export const EXECUTION_TRACKS: ExecutionTrack[] = [
  {
    id: 'orchestration-foundation',
    name: 'Orchestration foundation',
    objective: 'Standardize the first production orchestration lane for specialist agents and guarded long-running work.',
    thesis: 'We need a primary orchestration model for agent roles, tool use, and background execution.',
    antithesis: 'Leaving orchestration fragmented across scripts and pages creates drift and weak ownership.',
    synthesis: 'Adopt one code-first orchestration contract and tie it to explicit task ownership, tool contracts, and traces.',
    outcome: 'The platform gets one default way to define specialist agents and launch long-running tasks safely.',
    tasks: [
      {
        title: 'Adopt OpenAI agent contract for specialist teams',
        owner: 'Platform',
        priority: 'High',
        due: 'This week',
        notes: 'Track: orchestration-foundation. Define the first production contract for specialist agents, handoffs, guardrails, and background execution.',
      },
      {
        title: 'Map current internal tools to one MCP exposure plan',
        owner: 'Platform',
        priority: 'High',
        due: 'This week',
        notes: 'Track: orchestration-foundation. Inventory internal tools and define which should become MCP tools, resources, or prompts first.',
      },
      {
        title: 'Instrument first agent loop with trace and task correlation',
        owner: 'Runtime',
        priority: 'Medium',
        due: 'Next',
        notes: 'Track: orchestration-foundation. Add trace IDs and workspace task correlation to one live agent loop.',
      },
    ],
  },
  {
    id: 'durable-runtime',
    name: 'Durable runtime lane',
    objective: 'Stand up a durable execution path for launches, approvals, retries, and multi-day runs.',
    thesis: 'Long-running work needs durable execution and resumability.',
    antithesis: 'Cron-plus-queue sprawl will become brittle as tenant launches and approval flows deepen.',
    synthesis: 'Pick one durable workflow lane for portal-native work and one deeper backend lane if needed.',
    outcome: 'The platform gains resumable launch and approval workflows instead of timeout-prone background jobs.',
    tasks: [
      {
        title: 'Select first durable workflow lane for launch sequences',
        owner: 'Architecture',
        priority: 'High',
        due: 'This week',
        notes: 'Track: durable-runtime. Compare Vercel Workflow and Temporal for the first tenant-launch and approval use cases.',
      },
      {
        title: 'Model tenant launch as a resumable workflow',
        owner: 'Launch',
        priority: 'High',
        due: 'Next',
        notes: 'Track: durable-runtime. Convert tenant launch from checklist-only into a resumable multi-step workflow design.',
      },
      {
        title: 'Define retry and rollback policy for long-running jobs',
        owner: 'Runtime',
        priority: 'Medium',
        due: 'Next',
        notes: 'Track: durable-runtime. Standardize retry classes, rollback points, and operator-visible recovery states.',
      },
    ],
  },
  {
    id: 'prompt-and-eval-ops',
    name: 'Prompt and eval operations',
    objective: 'Move prompt work from ad hoc edits into a governed trace-linked improvement loop.',
    thesis: 'Prompt iteration should stay fast so the platform can improve quickly.',
    antithesis: 'Prompt changes without versioning and evaluation create silent regressions.',
    synthesis: 'Treat prompts like production assets and link them to traces, experiments, and evaluation data.',
    outcome: 'Prompt changes become reviewable, testable, and easier to scale across several products.',
    tasks: [
      {
        title: 'Pilot prompt registry for core agent prompts',
        owner: 'AI Product',
        priority: 'High',
        due: 'This week',
        notes: 'Track: prompt-and-eval-ops. Move a first set of high-leverage prompts into a managed registry with version labels.',
      },
      {
        title: 'Define evaluation dataset for agent loop regressions',
        owner: 'AI Product',
        priority: 'High',
        due: 'Next',
        notes: 'Track: prompt-and-eval-ops. Build an eval dataset from traces, saved notes, and failed outputs for prompt and model review.',
      },
      {
        title: 'Link feedback notes to trace and prompt versions',
        owner: 'Product Ops',
        priority: 'Medium',
        due: 'Next',
        notes: 'Track: prompt-and-eval-ops. Make workbench feedback rows feed the prompt/eval review cycle.',
      },
    ],
  },
  {
    id: 'stateful-agent-pilot',
    name: 'Stateful agent pilot',
    objective: 'Pilot a stateful real-time agent environment for the control layer and operator rooms.',
    thesis: 'Some agent interactions need durable state, WebSockets, and real-time operator collaboration.',
    antithesis: 'Pure request-response flows cannot express long-lived control rooms or live human-in-the-loop sessions well.',
    synthesis: 'Pilot a stateful agent runtime only where real-time state matters and keep the rest of the platform simpler.',
    outcome: 'We get one serious testbed for real-time agent operations without overcommitting the whole stack.',
    tasks: [
      {
        title: 'Define first stateful agent room use case',
        owner: 'Architecture',
        priority: 'Medium',
        due: 'Next',
        notes: 'Track: stateful-agent-pilot. Choose the first use case that truly needs real-time shared state, likely control-room approvals or operator rooms.',
      },
      {
        title: 'Pilot stateful runtime for human-in-the-loop control agent',
        owner: 'Platform',
        priority: 'Medium',
        due: 'Later',
        notes: 'Track: stateful-agent-pilot. Prototype a stateful agent runtime for one control-room or operator-room workflow.',
      },
      {
        title: 'Define success criteria for stateful-agent expansion',
        owner: 'Product Ops',
        priority: 'Low',
        due: 'Later',
        notes: 'Track: stateful-agent-pilot. Write measurable expansion criteria before promoting the pilot into core architecture.',
      },
    ],
  },
]

export const DELEGATED_POD_CHARTERS: DelegatedPodCharter[] = [
  {
    id: 'orchestration-pod',
    name: 'Orchestration Pod',
    mission: 'Own specialist agent definitions, tool-routing discipline, and the default orchestration contract for the company.',
    owns: ['agent contracts', 'handoff rules', 'guardrail wiring', 'background run policy'],
    readScope: ['agent traces', 'tool registry', 'task outcomes', 'playbook definitions'],
    writeScope: ['agent prompts', 'tool-call contracts', 'handoff schemas', 'orchestration templates'],
    reviewGate: 'Platform lead approves orchestration changes that affect several products or write boundaries.',
    routes: [
      { label: 'Workbench', to: '/app/workbench' },
      { label: 'Agent Ops', to: '/app/teams' },
    ],
  },
  {
    id: 'connector-protocol-pod',
    name: 'Connector and Protocol Pod',
    mission: 'Turn internal and external systems into reusable MCP tools, resources, and controlled connector surfaces.',
    owns: ['MCP servers', 'connector contracts', 'source mapping', 'context exposure policy'],
    readScope: ['connector health', 'source metadata', 'oauth posture', 'schema drift'],
    writeScope: ['tool registry entries', 'source adapters', 'resource schemas', 'connector policies'],
    reviewGate: 'Connector Systems and Governance Runtime review scope increases or new privileged sources.',
    routes: [
      { label: 'Connectors', to: '/app/connectors' },
      { label: 'Runtime', to: '/app/runtime' },
    ],
  },
  {
    id: 'durable-runtime-pod',
    name: 'Durable Runtime Pod',
    mission: 'Convert long-running business sequences into resumable workflows with explicit retries, checkpoints, and rollback rules.',
    owns: ['workflow engine selection', 'launch orchestration', 'approval choreography', 'retry policy'],
    readScope: ['launch tasks', 'agent runs', 'approval history', 'runtime incidents'],
    writeScope: ['workflow definitions', 'checkpoint rules', 'retry classes', 'recovery playbooks'],
    reviewGate: 'Architecture and Runtime leads approve workflows that can mutate tenant-critical business state.',
    routes: [
      { label: 'Workbench', to: '/app/workbench' },
      { label: 'Platform Admin', to: '/app/platform-admin' },
    ],
  },
  {
    id: 'observability-pod',
    name: 'Observability Pod',
    mission: 'Make every request, tool call, agent loop, workflow, and approval traceable enough to diagnose and govern.',
    owns: ['trace model', 'runtime telemetry', 'incident drill-down', 'cross-system correlation'],
    readScope: ['runtime data', 'agent failures', 'workflow latency', 'task churn'],
    writeScope: ['telemetry hooks', 'trace attributes', 'dashboard contracts', 'alert rules'],
    reviewGate: 'Runtime lead approves changes to production telemetry sampling or alerting posture.',
    routes: [
      { label: 'Runtime', to: '/app/runtime' },
      { label: 'Insights', to: '/app/insights' },
    ],
  },
  {
    id: 'prompt-eval-pod',
    name: 'Prompt and Eval Pod',
    mission: 'Treat prompts, datasets, and evaluation rules as production assets tied to trace evidence and release decisions.',
    owns: ['prompt registry', 'eval datasets', 'model comparison', 'regression review'],
    readScope: ['traces', 'feedback notes', 'output examples', 'review decisions'],
    writeScope: ['prompt versions', 'eval configs', 'quality thresholds', 'comparison reports'],
    reviewGate: 'AI Product lead approves changes to production prompts, eval thresholds, and model defaults.',
    routes: [
      { label: 'Workbench', to: '/app/workbench' },
      { label: 'Knowledge', to: '/app/knowledge' },
    ],
  },
  {
    id: 'productization-pod',
    name: 'Productization Pod',
    mission: 'Translate infrastructure depth into tenant-ready modules, release trains, and rollout packs instead of pure platform work.',
    owns: ['module packaging', 'release gates', 'rollout narrative', 'cross-product standardization'],
    readScope: ['factory board', 'rollout data', 'module states', 'tenant feedback'],
    writeScope: ['release packets', 'program readiness updates', 'task seeds', 'promotion criteria'],
    reviewGate: 'Product Ops and Module Factory approve release claims or cross-tenant promotion.',
    routes: [
      { label: 'Build', to: '/app/factory' },
      { label: 'Product Ops', to: '/app/product-ops' },
    ],
  },
]

export const INFRASTRUCTURE_PHASES: InfrastructurePhase[] = [
  {
    id: 'kernel',
    phase: 'Phase 1: Portal kernel',
    outcome: 'One authenticated portal with module routing, role homes, shared queues, and tenant control.',
    thesis: 'The company needs one place to work.',
    antithesis: 'A portal alone does not create a real AI-native operating system.',
    synthesis: 'Use the portal as the command shell while deeper runtime layers standardize underneath it.',
    focus: ['role homes', 'module routing', 'workspace tasks', 'tenant controls'],
    route: '/app/platform-admin',
  },
  {
    id: 'protocol',
    phase: 'Phase 2: Tool and connector contract layer',
    outcome: 'Internal and external systems are exposed through one reusable tool/context protocol.',
    thesis: 'Every app needs tools and context.',
    antithesis: 'Connector sprawl creates bespoke integration debt for every new agent or app.',
    synthesis: 'Make MCP the default contract layer for tools, resources, and context.',
    focus: ['MCP servers', 'source mapping', 'connector policies', 'tool registry'],
    route: '/app/connectors',
  },
  {
    id: 'durable',
    phase: 'Phase 3: Durable workflow lane',
    outcome: 'Launches, approvals, and long-running enrichment move onto resumable workflow execution.',
    thesis: 'Long jobs must survive time, retries, and partial failure.',
    antithesis: 'Background jobs without durable execution become brittle.',
    synthesis: 'Adopt one durable workflow lane and formalize retries, checkpoints, and rollback paths.',
    focus: ['workflow engine', 'launch sequences', 'approval choreography', 'recovery'],
    route: '/app/workbench',
  },
  {
    id: 'observability',
    phase: 'Phase 4: Observability spine',
    outcome: 'Requests, tool calls, workflows, and agent loops share one telemetry model.',
    thesis: 'The system must be measurable.',
    antithesis: 'Fragmented telemetry keeps incidents expensive and governance weak.',
    synthesis: 'Adopt OpenTelemetry as the shared instrumentation base and correlate it to work objects.',
    focus: ['traces', 'metrics', 'alerts', 'cross-system correlation'],
    route: '/app/runtime',
  },
  {
    id: 'prompts',
    phase: 'Phase 5: Prompt and eval governance',
    outcome: 'Prompts, traces, datasets, and evaluations become a managed production layer.',
    thesis: 'Prompt iteration should stay fast.',
    antithesis: 'Prompt changes without evaluation do not scale safely.',
    synthesis: 'Build a trace-linked prompt/eval loop as part of product operations.',
    focus: ['prompt registry', 'eval datasets', 'regression review', 'quality gates'],
    route: '/app/workbench',
  },
  {
    id: 'stateful',
    phase: 'Phase 6: Stateful real-time agent pilots',
    outcome: 'Selected control-room and operator-room use cases move onto a stateful real-time agent runtime.',
    thesis: 'Some agent experiences need shared state and live interaction.',
    antithesis: 'Making every agent stateful would add unnecessary complexity.',
    synthesis: 'Pilot stateful agent runtimes only where real-time collaboration clearly matters.',
    focus: ['control rooms', 'human-in-the-loop', 'session state', 'real-time approvals'],
    route: '/app/teams',
  },
]
