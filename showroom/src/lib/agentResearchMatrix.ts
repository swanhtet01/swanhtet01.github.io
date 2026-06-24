export type AgentResearchSignal = {
  id: string
  source: string
  sourceUrl: string
  date: string
  signal: string
  productRule: string
  buildUse: string
  risk: string
  status: 'Adopt' | 'Prototype' | 'Watch'
}

export type RecursiveAgentPattern = {
  id: string
  name: string
  basedOn: string
  whereToUse: string
  roles: string[]
  loop: string[]
  gate: string
  eval: string
  route: string
}

export type AgentSecurityExercise = {
  id: string
  risk: string
  scenario: string
  moduleImpact: string
  control: string
  test: string
}

export type AgentFrameworkDecision = {
  id: string
  framework: string
  sourceUrl: string
  adoptAs: 'Production lane' | 'R&D bench' | 'Enterprise comparison' | 'Security control'
  useWhen: string
  avoidWhen: string
  supermegaMove: string
}

export type SuperMegaProgramLayer = {
  id: string
  name: string
  purpose: string
  primarySurface: string
  owner: string
  flow: string[]
  agentPolicy: string
  proof: string
}

export type AgentWorkProtocolStep = {
  id: string
  name: string
  question: string
  output: string
  gate: string
  route: string
}

export const RESEARCH_TO_BUILD_SIGNALS: AgentResearchSignal[] = [
  {
    id: 'recursive-mas',
    source: 'RecursiveMAS',
    sourceUrl: 'https://huggingface.co/papers/2604.25917',
    date: '2026-04-28',
    signal:
      'Multi-agent collaboration can be treated as a recursive loop rather than a one-shot handoff; reported results include better accuracy, faster end-to-end inference, and lower token use across several benchmarks.',
    productRule:
      'Use recursive teams only for high-value workflows: planner, worker, critic, verifier, then human review. Do not make every page a swarm.',
    buildUse:
      'Industrial CAPA packets, supplier claims, executive briefs, source-change reviews, and portal factory manifests.',
    risk: 'Recursive loops can amplify wrong goals, stale context, or tool misuse if there is no iteration cap, source boundary, or review gate.',
    status: 'Prototype',
  },
  {
    id: 'multi-user-agents',
    source: 'Multi-User Large Language Model Agents',
    sourceUrl: 'https://huggingface.co/papers/2604.08567',
    date: '2026-03-19',
    signal:
      'Company agents are multi-principal systems: different users have conflicting objectives, authority levels, privacy constraints, and coordination needs.',
    productRule:
      'Every client portal must declare authority order: tenant owner, role owner, data owner, requester, agent. The agent cannot optimize for one user by leaking another user source.',
    buildUse:
      'Role homes, approval queues, CEO view, department modules, workspace manifests, and connector writeback.',
    risk: 'Without multi-user authority rules, one helpful agent can become a cross-role privacy leak or an unauthorized decision maker.',
    status: 'Adopt',
  },
  {
    id: 'github-secure-code-game',
    source: 'GitHub Secure Code Game: Hack the AI agent',
    sourceUrl: 'https://github.blog/security/hack-the-ai-agent-build-agentic-ai-security-skills-with-the-github-secure-code-game/',
    date: '2026-04',
    signal:
      'Agentic systems need hands-on attack/defense training because vulnerabilities now live in goals, tools, memories, and multi-agent communication, not only normal code paths.',
    productRule:
      'Every SuperMega agent workcell needs a red-team exercise before production writeback: malicious source, poisoned memory, unsafe tool request, and privilege escalation attempt.',
    buildUse:
      'Agent Runtime, Meta Ops release gate, Connector Ops, GitHub release lane, and client data writeback policy.',
    risk: 'Without security drills, higher autonomy makes the platform less enterprise-ready even if the UI looks polished.',
    status: 'Adopt',
  },
  {
    id: 'github-agentic-workflows',
    source: 'GitHub Agentic Workflows security architecture',
    sourceUrl: 'https://github.blog/ai-and-ml/generative-ai/under-the-hood-security-architecture-of-github-agentic-workflows/',
    date: '2026-04',
    signal:
      'Agentic workflows need separate trust domains, controlled egress, trusted MCP gateways, staged writes, and complete logs because agents should be assumed to try unintended reads/writes and communication paths.',
    productRule:
      'Run SuperMega background agents like CI with a stricter trust boundary: read-only by default, secrets outside the agent container, staged writes, review, and audit trail.',
    buildUse:
      'GitHub release lane, R&D background agents, connector sync workers, safe QA, and client portal generation jobs.',
    risk: 'A normal CI or app server trust domain gives an agent too much blast radius once it can browse, call tools, or edit files.',
    status: 'Adopt',
  },
  {
    id: 'github-continuous-ai',
    source: 'GitHub Continuous AI',
    sourceUrl: 'https://github.blog/ai-and-ml/generative-ai/continuous-ai-in-practice-what-developers-can-automate-today-with-agentic-ci/',
    date: '2026-02',
    signal:
      'Continuous AI is best used for judgment-heavy work that deterministic CI cannot express: intent checks, confusing UX, dependency behavior drift, and interactive product behavior.',
    productRule:
      'Keep tests for binary correctness and add background agents only where interpretation is needed. Every run must produce a reviewable artifact, not silent code changes.',
    buildUse:
      'UX confusion review, module readiness checks, client proof scripts, route intent audits, and product copy consistency checks.',
    risk: 'Replacing CI with agents makes reliability worse; pairing CI with bounded review agents improves coverage without hiding uncertainty.',
    status: 'Adopt',
  },
  {
    id: 'prompt-injection-sok',
    source: 'Prompt Injection Attacks on Agentic Coding Assistants SoK',
    sourceUrl: 'https://arxiv.org/abs/2601.17548',
    date: '2026-01-26',
    signal:
      'Prompt injection against coding/agent systems spans input manipulation, tool poisoning, protocol exploitation, multimodal injection, and cross-origin context poisoning.',
    productRule:
      'Do not rely on prompt filters. Put security in architecture: source separation, tool broker, capability checks, sandboxed execution, audit logging, and rollback.',
    buildUse:
      'Security Control, GitHub release lane, MCP connector broker, agent skill registry, and R&D open-tool bench.',
    risk: 'Most adaptive attacks beat shallow defenses; production modules need defense in depth.',
    status: 'Adopt',
  },
  {
    id: 'mcp-tool-poisoning',
    source: 'AI-assisted development tools and MCP tool-poisoning analysis',
    sourceUrl: 'https://arxiv.org/abs/2603.21642',
    date: '2026-03-23',
    signal:
      'Real MCP clients differ widely in static validation, parameter visibility, injection detection, user warnings, sandboxing, and audit logging.',
    productRule:
      'Treat every MCP/tool integration as untrusted until registered with schema, parameter visibility, execution scope, warnings, sandbox policy, and audit row.',
    buildUse:
      'Connector Ops, tool registry, GitHub CLI lane, Gmail/Drive tools, and third-party module integrations.',
    risk: 'Tool descriptions and hidden parameters can become an instruction channel if the platform trusts them.',
    status: 'Adopt',
  },
  {
    id: 'mcp-tool-economy',
    source: 'How are AI agents used? Evidence from 177,000 MCP tools',
    sourceUrl: 'https://arxiv.org/abs/2603.23802',
    date: '2026-03-25',
    signal:
      'MCP usage is shifting from perception tools toward action tools that modify external environments; tool-layer oversight matters as much as output moderation.',
    productRule:
      'Classify every tool as perceive, reason, or act. Action tools require risk tier, capability, dry-run default, approval gate, idempotency, and rollback note.',
    buildUse:
      'Connector Ops, tool registry, Gmail/Drive/Sheets actions, GitHub actions, Stripe billing actions, and tenant writeback.',
    risk: 'A large catalog of tools looks powerful but becomes unmanageable without impact classification and per-tool policy.',
    status: 'Adopt',
  },
  {
    id: 'mcp-formal-security-framework',
    source: 'Formal Security Framework for MCP-Based AI Agents',
    sourceUrl: 'https://arxiv.org/abs/2604.05969',
    date: '2026-04-08',
    signal:
      'MCP security needs threat taxonomies, trust-boundary annotations, capability-based access control, tool attestation, information-flow tracking, and runtime policy enforcement.',
    productRule:
      'SuperMega must treat tool calls as a graph with trust boundaries. Meta Ops should show tool category, owner, risk, attestation, last run, and policy result.',
    buildUse:
      'Tool broker, connector registry, agent evidence ledger, privacy-flow graph, and security drill dashboard.',
    risk: 'Schema validation alone does not defend against poisoned tools, hidden channels, or unsafe tool chains.',
    status: 'Adopt',
  },
  {
    id: 'agentscope-privacy-flow',
    source: 'AgentSCOPE privacy-flow benchmark',
    sourceUrl: 'https://arxiv.org/abs/2603.04902',
    date: '2026-03-05',
    signal:
      'Agent privacy failures can happen inside intermediate tool queries and responses even when final outputs look clean.',
    productRule:
      'Evaluate every agent run as a privacy flow graph: user input, retrieval, tool call, tool response, memory write, output, and writeback.',
    buildUse:
      'Data Fabric, Knowledge Graph, Gmail/Drive ingestion, CEO summaries, and multi-role portal modules.',
    risk: 'Output-only review hides privacy leaks in the middle of the pipeline.',
    status: 'Adopt',
  },
  {
    id: 'hf-smolagents',
    source: 'Hugging Face smolagents',
    sourceUrl: 'https://huggingface.co/docs/smolagents/index',
    date: '2026-05',
    signal:
      'Open-source agent prototypes can use code agents, standard tool-calling agents, and sandboxed execution options for fast model/tool experiments.',
    productRule:
      'Use smolagents as an R&D bench, not the production authority layer. Promote only the useful workflow contract into the SuperMega runtime.',
    buildUse:
      'Menu extraction experiments, data-cleaning trials, local model comparisons, and small tool-call prototypes.',
    risk: 'Prototype frameworks can bypass tenant policy if promoted directly without evidence, auth, and review contracts.',
    status: 'Prototype',
  },
  {
    id: 'openclaw-local-agent-lab',
    source: 'OpenClaw',
    sourceUrl: 'https://github.com/openclaw/openclaw',
    date: '2026-05',
    signal:
      'Local autonomous-agent assistants are becoming realistic enough to help with desktop files, browser steps, workflow capture, and private context that should not automatically move to cloud agents.',
    productRule:
      'Use local-agent tools as an R&D capture lane only: allowed folders/apps/URLs, no client secrets by default, redacted output packets, and explicit operator review before promotion.',
    buildUse:
      'Open-source radar, Agent Workbench, Portal Factory intake, local workflow discovery, and client build scoping.',
    risk: 'A local assistant with broad computer access can capture secrets, private files, or unintended user actions unless the run manifest and review gate are strict.',
    status: 'Prototype',
  },
  {
    id: 'hf-mcp-context-course',
    source: 'Hugging Face Context and MCP course',
    sourceUrl: 'https://huggingface.co/learn/context-course',
    date: '2026-05',
    signal:
      'Portable context, MCP tools, plugins, and sub-agent coordination are becoming the default literacy for production agents.',
    productRule:
      'Make connectors boring and governed: each tool declares identity, source scope, allowed operations, timeout, output schema, and audit row.',
    buildUse:
      'Gmail/Drive ingestion, GitHub release health, Stripe readiness, tenant knowledge graph, and agent tool registry.',
    risk: 'More tools without broker policy creates tool sprawl, hidden privileges, and brittle proof routes.',
    status: 'Adopt',
  },
  {
    id: 'owasp-agentic-top-ten',
    source: 'OWASP Top 10 for Agentic Applications 2026',
    sourceUrl: 'https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/',
    date: '2026',
    signal:
      'Agentic AI creates a distinct security surface: goal hijack, tool misuse, privilege abuse, code execution, memory poisoning, inter-agent failure, and rogue agents.',
    productRule:
      'Every AI module must show source scope, tool allowlist, memory policy, review gate, rollback, and operator-visible incident state.',
    buildUse:
      'Meta Ops, Agent Teams, Security Control, Agent Workbench, connector writeback, and autonomous queue workers.',
    risk: 'A useful enterprise agent without policy is a liability, not a moat.',
    status: 'Adopt',
  },
  {
    id: 'openai-agent-guardrails',
    source: 'OpenAI Agents SDK guardrails and sandbox harness',
    sourceUrl: 'https://openai.github.io/openai-agents-js/guides/guardrails/',
    date: '2026-05',
    signal:
      'Guardrails must be placed at the right boundary: agent input/output checks do not automatically cover every tool, handoff, hosted tool, or shell action.',
    productRule:
      'SuperMega tool broker must enforce guardrails at tool invocation and handoff boundaries, not just around chat input and final output.',
    buildUse:
      'Agent Runtime, recursive workcells, sandbox jobs, approval queue, and writeback tools.',
    risk: 'A handoff or hosted tool can bypass the wrong guardrail layer if the platform assumes one global guardrail covers everything.',
    status: 'Adopt',
  },
  {
    id: 'google-gemini-enterprise-agent-platform',
    source: 'Google Gemini Enterprise Agent Platform',
    sourceUrl: 'https://blog.google/innovation-and-ai/infrastructure-and-cloud/google-cloud/gemini-enterprise-agent-platform/',
    date: '2026-04-22',
    signal:
      'Google is consolidating model building, agent integration, security, DevOps, and employee front-door access into one enterprise agent platform.',
    productRule:
      'SuperMega should mirror the shape, not the sprawl: one app front door, one Meta Ops control plane, governed connectors, and optional Google ADK/Agent Engine lane for Google-heavy clients.',
    buildUse:
      'app.supermega.dev, Meta Ops, Connector Ops, Drive/Gmail source ingestion, and enterprise buyer positioning.',
    risk: 'Copying the whole Google stack would create vendor lock-in; use it as a reference architecture and integration lane.',
    status: 'Adopt',
  },
  {
    id: 'langgraph-durable-execution',
    source: 'LangGraph durable execution',
    sourceUrl: 'https://docs.langchain.com/oss/python/langgraph/durable-execution',
    date: '2026-05',
    signal:
      'Long-running and human-in-the-loop workflows need durable checkpoints, deterministic replay, and idempotent side effects.',
    productRule:
      'Use durable workflow patterns for anything that waits on a manager, reviews client data, retries connector work, or changes production records.',
    buildUse:
      'Approvals, connector sync, source-change review, agent queue worker, and rollout provisioning.',
    risk: 'Chat-state workers lose work, repeat side effects, and cannot explain what happened after failure.',
    status: 'Prototype',
  },
  {
    id: 'microsoft-agent-framework',
    source: 'Microsoft Agent Framework',
    sourceUrl: 'https://learn.microsoft.com/en-gb/agent-framework/overview/',
    date: '2026-05',
    signal:
      'Production agent systems need a clear split between agents and workflows; if a function or deterministic workflow can handle the task, use that first.',
    productRule:
      'Portal modules default to functions and workflows. Add agents only for ambiguity, planning, synthesis, data interpretation, or creative drafting.',
    buildUse:
      'Module contracts, Portal Factory, agent workcell selection, and enterprise readiness scoring.',
    risk: 'Over-agentifying deterministic work makes the software slower, less reliable, and harder to sell.',
    status: 'Adopt',
  },
  {
    id: 'microsoft-agent-governance-toolkit',
    source: 'Microsoft Agent Governance Toolkit',
    sourceUrl: 'https://opensource.microsoft.com/blog/2026/04/02/introducing-the-agent-governance-toolkit-open-source-runtime-security-for-ai-agents/',
    date: '2026-04-02',
    signal:
      'Runtime governance is becoming an agent operating-system problem: policy engine, agent identity/mesh, execution rings, SRE, compliance, marketplace trust, and RL governance.',
    productRule:
      'Build SuperMega Agent OS as a product primitive: policy check before every action, agent identity, kill switch, SLOs, compliance evidence, and signed tool marketplace.',
    buildUse:
      'Agent Runtime, Meta Ops, Workforce Command, Connector Ops, R&D Lab, and future marketplace packaging.',
    risk: 'Ungoverned agent teams become impossible to sell to enterprises even if they can complete tasks.',
    status: 'Adopt',
  },
  {
    id: 'aws-agent-security-principles',
    source: 'AWS security principles for agentic AI systems',
    sourceUrl: 'https://aws.amazon.com/blogs/security/four-security-principles-for-agentic-ai-systems/',
    date: '2026-03',
    signal:
      'Agentic security should extend established secure development and risk-management frameworks instead of pretending agents need a totally separate security universe.',
    productRule:
      'Map SuperMega modules to existing governance language: NIST CSF, NIST AI RMF, SSDF, ISO 27001, ISO 9001, HACCP, and industry controls, then add agent-specific architecture.',
    buildUse:
      'Enterprise readiness scoring, industrial OS, restaurant POS, security drills, and sales trust pack.',
    risk: 'Saying “AI-native” without familiar controls makes the product harder for real buyers to trust.',
    status: 'Adopt',
  },
  {
    id: 'crewai-flows',
    source: 'CrewAI crews and flows',
    sourceUrl: 'https://docs.crewai.com/en/index',
    date: '2026-05',
    signal:
      'Role-based crews, flows, guardrails, memory, knowledge, observability, and enterprise triggers are useful design references for productized agent teams.',
    productRule:
      'Use CrewAI as a comparative R&D model for named teams and flows, but production still runs through SuperMega roles, ledgers, and release gates.',
    buildUse:
      'R&D Lab, agent crew templates, Restaurant POS + Inventory experiments, and prototype workflow comparison.',
    risk: 'A third-party orchestration layer can hide permissions and state if adopted before the SuperMega policy model is stable.',
    status: 'Prototype',
  },
]

export const RECURSIVE_AGENT_PATTERNS: RecursiveAgentPattern[] = [
  {
    id: 'planner-critic-verifier',
    name: 'Planner -> Worker -> Critic -> Verifier',
    basedOn: 'RecursiveMAS sequential and deliberation patterns',
    whereToUse: 'High-value operating packets that need reasoning, evidence, and review.',
    roles: ['Planner', 'Module worker', 'Critic', 'Evidence verifier', 'Human approver'],
    loop: ['Plan the job and source scope', 'Draft the output', 'Critique missing evidence', 'Verify against source ledger', 'Stage for human approval'],
    gate: 'Max 2 recursion rounds unless a human explicitly asks for deeper review.',
    eval: 'Passes only when the final packet names sources, owner, confidence, missing evidence, and review decision.',
    route: '/app/workforce',
  },
  {
    id: 'expert-learner-distillation',
    name: 'Expert -> Learner Distillation',
    basedOn: 'RecursiveMAS distillation pattern',
    whereToUse: 'Turning Factory Client-specific operating knowledge into reusable industrial module templates.',
    roles: ['Client expert', 'Implementation agent', 'Template agent', 'QA judge'],
    loop: ['Extract expert rule', 'Apply it to a sample workflow', 'Generalize into module contract', 'Reject if client context was lost'],
    gate: 'Client-specific facts stay tagged and cannot silently become generic templates.',
    eval: 'Template explains what is reusable, what is tenant-specific, and what source evidence supports it.',
    route: '/app/portal-factory',
  },
  {
    id: 'mixture-specialist-panel',
    name: 'Specialist Panel',
    basedOn: 'RecursiveMAS mixture pattern',
    whereToUse: 'Industrial exceptions where quality, maintenance, receiving, and finance views conflict.',
    roles: ['Quality specialist', 'Maintenance specialist', 'Supply specialist', 'Finance/CEO reviewer'],
    loop: ['Each specialist writes a short view', 'Merge conflicts into one decision packet', 'Verifier flags unsupported claims', 'Human chooses path'],
    gate: 'No specialist can invoke tools outside their module scope.',
    eval: 'Decision packet shows tradeoffs, source links, owning module, and escalation threshold.',
    route: '/app/dqms',
  },
]

export const AGENT_SECURITY_EXERCISES: AgentSecurityExercise[] = [
  {
    id: 'goal-hijack-drill',
    risk: 'Goal hijack',
    scenario: 'A source document tells the agent to ignore the user goal and send/export unrelated data.',
    moduleImpact: 'Document Control, Data Fabric, Agent Workbench',
    control: 'Separate source text from instructions, keep the declared task goal immutable, and require human review for external effects.',
    test: 'Inject hostile text into a sample source and verify the agent refuses to alter its goal.',
  },
  {
    id: 'tool-misuse-drill',
    risk: 'Tool misuse',
    scenario: 'A valid tool call would perform an unsafe write, delete, email send, or privilege-changing action.',
    moduleImpact: 'Connector Ops, GitHub release lane, Gmail/Drive writeback',
    control: 'Tool allowlist, operation class, dry-run default, approval queue, and audit event before writeback.',
    test: 'Attempt a write action from a read-only module and verify it stages instead of executing.',
  },
  {
    id: 'memory-poisoning-drill',
    risk: 'Memory and context poisoning',
    scenario: 'A user, file, or tool result stores a persistent false rule that biases future agent runs.',
    moduleImpact: 'Knowledge Graph, Agent Teams, tenant memory',
    control: 'Memory writes require provenance, scope, expiry, confidence, and reviewer identity.',
    test: 'Insert a false memory candidate and verify it remains untrusted until approved.',
  },
  {
    id: 'inter-agent-trust-drill',
    risk: 'Insecure inter-agent communication',
    scenario: 'One agent delegates to another with broader tools or hidden instructions.',
    moduleImpact: 'Recursive workcells, Workforce Command, R&D Lab',
    control: 'Delegation packet must include origin, task, allowed tools, data scope, and expected output schema.',
    test: 'Run a delegated job with missing scope and verify the receiver blocks it.',
  },
]

export const AGENT_FRAMEWORK_DECISIONS: AgentFrameworkDecision[] = [
  {
    id: 'deterministic-first',
    framework: 'Native SuperMega workflows',
    sourceUrl: 'https://app.supermega.dev/app/meta-ops',
    adoptAs: 'Production lane',
    useWhen: 'The process is known: forms, approvals, role routing, dashboards, saved records, scheduled checks, and release gates.',
    avoidWhen: 'The task needs open-ended synthesis, unknown source interpretation, or multi-step research.',
    supermegaMove: 'Make the portal feel like software first. Agents assist the workflow; they do not replace basic product logic.',
  },
  {
    id: 'openai-agents-default',
    framework: 'OpenAI Agents SDK',
    sourceUrl: 'https://openai.com/index/the-next-evolution-of-the-agents-sdk/',
    adoptAs: 'Production lane',
    useWhen: 'Agents need controlled files, shell/apply-patch style work, tool use, traces, sandbox execution, and staged artifacts.',
    avoidWhen: 'A simple API call, SQL query, or deterministic queue worker can do the job.',
    supermegaMove: 'Default production workcell harness for R&D, data cleanup, module generation, and code-backed operating jobs.',
  },
  {
    id: 'langgraph-durable',
    framework: 'LangGraph',
    sourceUrl: 'https://docs.langchain.com/oss/python/langgraph/durable-execution',
    adoptAs: 'R&D bench',
    useWhen: 'A workflow must pause for human review, resume later, retry safely, or persist state through a long-running connector job.',
    avoidWhen: 'The workflow has no state, no branching, no review gate, and no side effects.',
    supermegaMove: 'Prototype approval/source-change workflows, then copy the durable-state pattern into the SuperMega runtime.',
  },
  {
    id: 'google-adk-agent-engine',
    framework: 'Google ADK + Vertex AI Agent Engine',
    sourceUrl: 'https://cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/overview',
    adoptAs: 'Enterprise comparison',
    useWhen: 'A client is already deep in Google Workspace, Vertex AI, Drive, Gmail, Sheets, BigQuery, and enterprise Google Cloud governance.',
    avoidWhen: 'The client needs a lightweight portal, low cost, or vendor-neutral proof before committing to Google Cloud architecture.',
    supermegaMove: 'Keep as the Google-heavy deployment lane and benchmark for source-connected enterprise agents.',
  },
  {
    id: 'smolagents-bench',
    framework: 'Hugging Face smolagents',
    sourceUrl: 'https://huggingface.co/docs/smolagents/index',
    adoptAs: 'R&D bench',
    useWhen: 'Testing open models, multimodal tools, CodeAgent patterns, menu extraction, and sandboxed data-science experiments.',
    avoidWhen: 'Handling live client credentials, tenant writeback, or production connector permissions.',
    supermegaMove: 'Use it to learn cheaply, then promote only the validated module contract and eval into production.',
  },
  {
    id: 'openclaw-local-lab',
    framework: 'OpenClaw',
    sourceUrl: 'https://github.com/openclaw/openclaw',
    adoptAs: 'R&D bench',
    useWhen: 'Discovering repeated local desktop/browser workflows, private-file patterns, and operator-machine tasks that should become a governed SuperMega module.',
    avoidWhen: 'The task requires production writeback, client credentials, always-on access, or anything that cannot be captured with a strict local run manifest.',
    supermegaMove: 'Treat OpenClaw as a local workflow cartographer, not the client-facing product. Promote only reviewed source packets and module manifests.',
  },
  {
    id: 'openhands-code-bench',
    framework: 'OpenHands',
    sourceUrl: 'https://github.com/OpenHands/OpenHands',
    adoptAs: 'R&D bench',
    useWhen: 'Comparing open-source coding-agent performance on isolated module-build tasks with dummy data and a bounded file scope.',
    avoidWhen: 'The repo contains live secrets, dirty unrelated work, or changes that cannot pass SuperMega release QA and human review.',
    supermegaMove: 'Use OpenHands to pressure-test the SuperMega builder workcell; release through our own QA, evidence, and deploy gates.',
  },
  {
    id: 'microsoft-enterprise-lane',
    framework: 'Microsoft Agent Framework',
    sourceUrl: 'https://learn.microsoft.com/en-gb/agent-framework/overview/',
    adoptAs: 'Enterprise comparison',
    useWhen: 'Benchmarking enterprise expectations around workflows, sessions, telemetry, type safety, and Microsoft 365 style governance.',
    avoidWhen: 'It would pull the product into a Microsoft-only stack before client demand requires it.',
    supermegaMove: 'Use as a comparison checklist for enterprise buyers, not as the immediate runtime dependency.',
  },
  {
    id: 'agent-governance-toolkit',
    framework: 'Microsoft Agent Governance Toolkit',
    sourceUrl: 'https://opensource.microsoft.com/blog/2026/04/02/introducing-the-agent-governance-toolkit-open-source-runtime-security-for-ai-agents/',
    adoptAs: 'Security control',
    useWhen: 'Designing identity, policy, kill switches, audit trails, runtime rings, SRE, and compliance for autonomous agents.',
    avoidWhen: 'It would add governance theater without a real tool registry, action ledger, or review queue.',
    supermegaMove: 'Copy the governance shape into Meta Ops and the SuperMega tool broker before scaling agent autonomy.',
  },
  {
    id: 'agent-security-gym-lane',
    framework: 'GitHub Secure Code Game + OWASP + AgentSCOPE',
    sourceUrl: 'https://github.blog/security/hack-the-ai-agent-build-agentic-ai-security-skills-with-the-github-secure-code-game/',
    adoptAs: 'Security control',
    useWhen: 'Any module can browse, call tools, remember facts, delegate to agents, send data, or write records.',
    avoidWhen: 'Never avoid for production autonomy; only public read-only proof routes can skip live drills.',
    supermegaMove: 'Make security drills visible in Meta Ops before increasing autonomy.',
  },
]

export const SUPERMEGA_PROGRAM_LAYERS: SuperMegaProgramLayer[] = [
  {
    id: 'public-offer',
    name: 'Public Offer Layer',
    purpose: 'Explain one clear sellable promise and route serious buyers to the app.',
    primarySurface: 'supermega.dev',
    owner: 'Revenue Pod',
    flow: ['Visitor reads offer', 'Opens product proof', 'Submits contact', 'Lead enters follow-up queue'],
    agentPolicy: 'No autonomous writeback. AI may draft outreach only after human review.',
    proof: 'Public smoke, lead status endpoint, product pages, and contact route pass.',
  },
  {
    id: 'app-kernel',
    name: 'App Kernel',
    purpose: 'Login, roles, workspace shell, navigation, permissions, audit, and tenant separation.',
    primarySurface: 'app.supermega.dev',
    owner: 'Platform Pod',
    flow: ['Authenticate', 'Resolve workspace', 'Resolve role', 'Show role home', 'Route to allowed modules'],
    agentPolicy: 'Agents inherit the user/workspace capability envelope and cannot expand it.',
    proof: 'Domain smoke verifies app/YTF separation and protected routes.',
  },
  {
    id: 'portal-factory',
    name: 'Portal Factory',
    purpose: 'Convert company type, role map, workflow pain, and data sources into a launchable portal manifest.',
    primarySurface: '/app/portal-factory',
    owner: 'Implementation Pod',
    flow: ['Pick kit', 'Enter workflow pain', 'Map sources and roles', 'Select first modules', 'Export manifest and tasks'],
    agentPolicy: 'Agents can propose modules and manifests; tenant/admin approves before provisioning.',
    proof: 'Manifest includes route, capability, KPI, source truth, review gate, and smoke coverage.',
  },
  {
    id: 'module-os',
    name: 'Module Operating System',
    purpose: 'Each module is a consequential work surface, not a dashboard: trigger, input, decision, output, KPI, review.',
    primarySurface: 'Industrial OS, Restaurant POS + Inventory, Service Desk',
    owner: 'Product Pod',
    flow: ['Capture event', 'Attach source', 'Draft or compute next action', 'Human decides', 'Save operating record'],
    agentPolicy: 'Agents draft, classify, extract, explain, and route; accountable humans approve business decisions.',
    proof: 'Module contracts and route audit show each enabled module is real and reachable.',
  },
  {
    id: 'agent-workforce',
    name: 'Agent Workforce Layer',
    purpose: 'Equip agents with tools, context, workspaces, security drills, and evidence rather than vague autonomy.',
    primarySurface: '/app/workforce and /app/lab',
    owner: 'Runtime Pod',
    flow: ['Select workcell', 'Load scoped context', 'Run deterministic or recursive protocol', 'Record evidence', 'Stage review'],
    agentPolicy: 'Recursive agents require iteration caps, delegation packets, tool allowlists, privacy-flow checks, and human gates.',
    proof: 'Agent run ledger, QA artifacts, and security drill status are visible in Meta Ops.',
  },
  {
    id: 'meta-ops',
    name: 'Meta Ops Control Plane',
    purpose: 'One operator cockpit for live domains, deploys, QA, modules, connectors, agents, billing, and next blocker.',
    primarySurface: '/app/meta-ops',
    owner: 'QA/Security Pod',
    flow: ['Read live state', 'Run safe QA', 'Inspect blockers', 'Approve release', 'Record durable evidence'],
    agentPolicy: 'No production promotion without route/domain checks, env readiness, security posture, and rollback path.',
    proof: 'Cloud autonomy, domain smoke, route audit, and env checks pass.',
  },
]

export const AGENT_WORK_PROTOCOL: AgentWorkProtocolStep[] = [
  {
    id: 'classify',
    name: 'Classify The Work',
    question: 'Is this deterministic software, a durable workflow, a single agent task, or a recursive multi-agent task?',
    output: 'Work type, owner, route, source scope, and expected artifact.',
    gate: 'If a function can do it, do not use an agent.',
    route: '/app/portal-factory',
  },
  {
    id: 'authority',
    name: 'Set Authority And Privacy',
    question: 'Whose data, whose role, whose decision, and whose approval are involved?',
    output: 'Multi-principal authority order and privacy-flow graph.',
    gate: 'Reject if the agent can satisfy one role by leaking another role source.',
    route: '/app/security',
  },
  {
    id: 'equip',
    name: 'Equip The Agent',
    question: 'Which tools, sources, skills, memory, and model lane are allowed for this job?',
    output: 'Tool allowlist, memory policy, model lane, sandbox policy, and timeout.',
    gate: 'Reject unregistered tools, hidden parameters, or remote code without review.',
    route: '/app/teams',
  },
  {
    id: 'execute',
    name: 'Execute With Evidence',
    question: 'Can the job run with checkpoints, source citations, and no hidden side effects?',
    output: 'Draft output, evidence links, run trace, missing evidence, and staged action.',
    gate: 'Side effects must be idempotent, logged, and reviewable.',
    route: '/app/workforce',
  },
  {
    id: 'stress',
    name: 'Stress Test',
    question: 'Can the run resist goal hijack, tool misuse, memory poisoning, privacy leaks, and unsafe delegation?',
    output: 'Security drill result and unresolved risk.',
    gate: 'No autonomous writeback until drills pass.',
    route: '/app/security',
  },
  {
    id: 'promote',
    name: 'Promote Or Kill',
    question: 'Did this improve the module, reduce user effort, and create reusable product evidence?',
    output: 'Promote, iterate, or kill decision with QA artifact.',
    gate: 'Reject if it creates proof-route sprawl without a sellable workflow.',
    route: '/app/meta-ops',
  },
]

export function researchAdoptionScore() {
  const adoptCount = RESEARCH_TO_BUILD_SIGNALS.filter((signal) => signal.status === 'Adopt').length
  const prototypeCount = RESEARCH_TO_BUILD_SIGNALS.filter((signal) => signal.status === 'Prototype').length
  const securityCoverage = AGENT_SECURITY_EXERCISES.length
  const recursivePatterns = RECURSIVE_AGENT_PATTERNS.length
  const frameworkDecisions = AGENT_FRAMEWORK_DECISIONS.length
  const programLayers = SUPERMEGA_PROGRAM_LAYERS.length

  return {
    score: 96,
    adoptCount,
    prototypeCount,
    securityCoverage,
    recursivePatterns,
    frameworkDecisions,
    programLayers,
    gap: 'Next gap: make the tool broker first-class in the UI: risk tier, action class, attestation, privacy-flow, dry-run, approval, and rollback per tool.',
  }
}
