export type CloudPod = {
  id: string
  name: string
  mission: string
  lead: string
  technicalOwner: string
  operatorOwner: string
  approvalPath: string
  route: string
  responsibilities: string[]
  defaultSurfaces: string[]
  playbookIds: string[]
}

export type CloudEnvironment = {
  id: string
  name: string
  strap: string
  purpose: string
  route: string
  workloads: string[]
  controls: string[]
}

export type InternalToolSurface = {
  id: string
  name: string
  strap: string
  purpose: string
  route: string
  operators: string[]
  controls: string[]
}

export type CloudServiceLane = {
  id: string
  name: string
  purpose: string
  coverage: string
  stack: string[]
  safeguards: string[]
}

export type OperatingRule = {
  id: string
  title: string
  detail: string
}

export type SetupStep = {
  id: string
  title: string
  owner: string
  outcome: string
  route?: string
}

export type CloudOpsModel = {
  title: string
  summary: string
  northStar: string
  pods: CloudPod[]
  environments: CloudEnvironment[]
  internalTools: InternalToolSurface[]
  serviceLanes: CloudServiceLane[]
  operatingRules: OperatingRule[]
  setupSteps: SetupStep[]
  nextMoves: string[]
}

export const SUPERMEGA_CLOUD_OPS_MODEL: CloudOpsModel = {
  title: 'SUPERMEGA cloud operations',
  summary: 'The internal operating model for running the platform, the AI workforce, and customer rollouts from audited cloud surfaces instead of local machines.',
  northStar: 'Every pod, every environment, and every agent run should be observable, role-bound, and recoverable from one shared control layer.',
  pods: [
    {
      id: 'platform',
      name: 'Platform Pod',
      mission: 'Own the portal kernel, tenant boundaries, authentication, RBAC, and internal control surfaces.',
      lead: 'Platform lead',
      technicalOwner: 'Identity and portal architect',
      operatorOwner: 'Tenant control operator',
      approvalPath: 'Platform changes promote through Workbench and Platform Admin review.',
      route: '/app/platform-admin',
      responsibilities: ['portal kernel', 'authentication and RBAC', 'tenant provisioning', 'internal admin surfaces'],
      defaultSurfaces: ['Platform Admin', 'Policies', 'Cloud Ops'],
      playbookIds: ['tenant-launch'],
    },
    {
      id: 'runtime',
      name: 'Runtime Pod',
      mission: 'Keep agent runners, queues, schedules, and human-in-the-loop workflows healthy enough to scale.',
      lead: 'Runtime lead',
      technicalOwner: 'Workflow architect',
      operatorOwner: 'Agent operations lead',
      approvalPath: 'Autonomy and guardrail changes promote through runtime review and policy approval.',
      route: '/app/runtime',
      responsibilities: ['agent runners', 'workflow orchestration', 'queues and retries', 'execution safeguards'],
      defaultSurfaces: ['Runtime Desk', 'Agent Ops', 'Cloud Ops'],
      playbookIds: ['connector-reliability', 'runtime-safety'],
    },
    {
      id: 'knowledge',
      name: 'Knowledge Pod',
      mission: 'Run ingestion, cleaning, retrieval quality, eval loops, and canonical business memory.',
      lead: 'Knowledge lead',
      technicalOwner: 'Data platform architect',
      operatorOwner: 'Knowledge steward',
      approvalPath: 'Schema, canon, and evaluation changes promote through data review and Workbench governance.',
      route: '/app/data-fabric',
      responsibilities: ['ingestion and normalization', 'retrieval quality', 'eval datasets and trace review', 'canonical memory'],
      defaultSurfaces: ['Data Fabric', 'Knowledge Control', 'Cloud Ops'],
      playbookIds: ['knowledge-graph'],
    },
    {
      id: 'product-ops',
      name: 'Product Ops Pod',
      mission: 'Package modules, run release readiness, and turn internal tools into repeatable products.',
      lead: 'Product ops lead',
      technicalOwner: 'Module architect',
      operatorOwner: 'Release manager',
      approvalPath: 'Product promotion goes through Build Studio, Foundry, and executive release gates.',
      route: '/app/product-ops',
      responsibilities: ['module packaging', 'rollout readiness', 'customer workflow design', 'launch gates'],
      defaultSurfaces: ['Product Ops', 'Build Studio', 'Foundry'],
      playbookIds: ['growth-proof'],
    },
    {
      id: 'control',
      name: 'Control Pod',
      mission: 'Set priorities, arbitrate escalations, and keep company-level decisions attached to live operating evidence.',
      lead: 'Operating lead',
      technicalOwner: 'Control-plane architect',
      operatorOwner: 'Chief of staff or program operator',
      approvalPath: 'High-risk changes and cross-pod conflicts resolve through Workbench decisions and approvals.',
      route: '/app/workbench',
      responsibilities: ['priorities', 'approvals and escalations', 'KPI review', 'cross-pod arbitration'],
      defaultSurfaces: ['Control Workbench', 'Approvals', 'Decisions'],
      playbookIds: [],
    },
  ],
  environments: [
    {
      id: 'control',
      name: 'Control environment',
      strap: 'Leadership and operator command surface',
      purpose: 'Run decisions, reviews, approvals, and release posture from one auditable control layer.',
      route: '/app/workbench',
      workloads: ['executive review', 'approvals', 'incident triage', 'release gates'],
      controls: ['role-bound access', 'decision logs', 'approval audit', 'manual intervention path'],
    },
    {
      id: 'build',
      name: 'Build environment',
      strap: 'Ephemeral engineering and preview workspaces',
      purpose: 'Let teams build, test, review, and ship without taking production secrets onto personal devices.',
      route: '/app/factory',
      workloads: ['coding', 'preview deployments', 'branch reviews', 'integration testing'],
      controls: ['ephemeral workspaces', 'branch isolation', 'CI checks', 'release promotion rules'],
    },
    {
      id: 'runtime',
      name: 'Runtime environment',
      strap: 'Always-on workflow and agent execution plane',
      purpose: 'Run scheduled jobs, event-driven flows, tool calls, and retries behind explicit guardrails.',
      route: '/app/runtime',
      workloads: ['scheduled jobs', 'event-driven runs', 'tool execution', 'queue processing'],
      controls: ['run tracing', 'retry policy', 'queue depth alerts', 'rollback hooks'],
    },
    {
      id: 'data',
      name: 'Data environment',
      strap: 'Canonical records, feature marts, and retrieval state',
      purpose: 'Keep ingestion, transformation, reporting, and retrieval quality in a governed data plane.',
      route: '/app/data-fabric',
      workloads: ['source onboarding', 'transform jobs', 'vector and relational storage', 'evaluation datasets'],
      controls: ['freshness checks', 'schema contracts', 'backup rules', 'promotion review'],
    },
    {
      id: 'sandbox',
      name: 'Sandbox environment',
      strap: 'Controlled execution for high-risk tasks',
      purpose: 'Isolate untrusted code, browser tasks, prompt experiments, and connector trials before promotion.',
      route: '/app/lab',
      workloads: ['untrusted tool execution', 'prompt experiments', 'connector trials', 'browser-action tests'],
      controls: ['isolated credentials', 'time limits', 'trace capture', 'promotion gates'],
    },
  ],
  internalTools: [
    {
      id: 'cloud-ops',
      name: 'Cloud Ops',
      strap: 'The internal map of pods, environments, service lanes, and operating rules.',
      purpose: 'Keep the whole internal team aligned on where work runs, who owns it, and which control surface governs it.',
      route: '/app/cloud',
      operators: ['platform lead', 'runtime lead', 'product ops lead', 'director'],
      controls: ['team topology', 'environment map', 'operating rules', 'setup checklist'],
    },
    {
      id: 'control-workbench',
      name: 'Control Workbench',
      strap: 'Enterprise governance and executive steering',
      purpose: 'Hold decisions, delegated pods, approvals, escalations, and cross-functional execution posture together.',
      route: '/app/workbench',
      operators: ['director', 'platform admin', 'implementation lead'],
      controls: ['decision register', 'exception routing', 'execution tracks', 'infrastructure sequencing'],
    },
    {
      id: 'agent-ops',
      name: 'Agent Ops',
      strap: 'The AI workforce console',
      purpose: 'Manage team registry, job posture, manual interventions, and workforce capacity for the agent crews.',
      route: '/app/teams',
      operators: ['runtime lead', 'agent ops lead', 'implementation lead'],
      controls: ['agent roster', 'job review', 'batch execution', 'approval boundaries'],
    },
    {
      id: 'runtime-desk',
      name: 'Runtime Desk',
      strap: 'Shared reliability board for the live runtime',
      purpose: 'Monitor connector freshness, knowledge drift, queue pressure, guardrails, and autonomy health.',
      route: '/app/runtime',
      operators: ['runtime lead', 'connector pod', 'knowledge pod'],
      controls: ['incident review', 'staleness alerts', 'promotion gates', 'runtime escalation'],
    },
    {
      id: 'data-fabric',
      name: 'Data Fabric',
      strap: 'The data and story layer behind every app and agent',
      purpose: 'Own source onboarding, transformation, feature engineering, eval quality, and decision-ready operating stories.',
      route: '/app/data-fabric',
      operators: ['knowledge lead', 'data scientist', 'director'],
      controls: ['source health', 'schema fitness', 'eval review', 'analyst stories'],
    },
    {
      id: 'build-studio',
      name: 'Build Studio',
      strap: 'The internal module factory',
      purpose: 'Turn internal tools, rollout patterns, and proven workflows into repeatable enterprise products.',
      route: '/app/factory',
      operators: ['product ops lead', 'architect', 'implementation lead'],
      controls: ['module programs', 'shared stack planning', 'release tracks', 'graduation rules'],
    },
    {
      id: 'platform-admin',
      name: 'Platform Admin',
      strap: 'Provisioning and tenancy control plane',
      purpose: 'Manage tenants, modules, domains, roles, rollout posture, and security-adjacent configuration from one place.',
      route: '/app/platform-admin',
      operators: ['platform admin', 'tenant admin', 'security lead'],
      controls: ['tenant posture', 'module enablement', 'role scope', 'deployment controls'],
    },
  ],
  serviceLanes: [
    {
      id: 'identity',
      name: 'Identity and access lane',
      purpose: 'Every human and every agent acts inside the same tenant and approval boundaries.',
      coverage: 'Covers SSO, MFA, role templates, capability checks, and audit-ready access changes.',
      stack: ['identity provider', 'workspace session layer', 'RBAC graph', 'approval-backed access changes'],
      safeguards: ['MFA enforced for privileged roles', 'no shared admin accounts', 'role changes are auditable'],
    },
    {
      id: 'preview-release',
      name: 'Preview and release lane',
      purpose: 'Teams build and review from cloud workspaces before anything is promoted.',
      coverage: 'Covers ephemeral development environments, preview deployments, CI, release desks, and rollback posture.',
      stack: ['ephemeral build workspaces', 'preview deployments', 'CI checks', 'release gates'],
      safeguards: ['no direct production edits', 'promotion via release controls only', 'rollback owner on every release'],
    },
    {
      id: 'workflow',
      name: 'Workflow and queue lane',
      purpose: 'Long-running work survives pauses, retries, and approvals without losing state.',
      coverage: 'Covers durable orchestration, queues, schedules, retries, and wait states for human review.',
      stack: ['durable workflows', 'event queues', 'scheduled jobs', 'retry workers'],
      safeguards: ['bounded retries', 'dead-letter review', 'human takeover path'],
    },
    {
      id: 'records-memory',
      name: 'Records and memory lane',
      purpose: 'Apps and agents should read from the same evidence-bearing record layer.',
      coverage: 'Covers relational records, object storage, retrieval state, provenance, and evaluation datasets.',
      stack: ['relational store', 'object store', 'vector retrieval', 'eval datasets'],
      safeguards: ['source provenance retained', 'backup and restore rules', 'schema review for breaking changes'],
    },
    {
      id: 'agent-execution',
      name: 'Agent execution lane',
      purpose: 'Run tool-using crews, stateful watches, and browser actions with explicit boundaries.',
      coverage: 'Covers typed tool loops, stateful crews, browser tasks, and approval-aware write operations.',
      stack: ['tool-loop agents', 'stateful crews', 'browser automation', 'approval hooks'],
      safeguards: ['trace capture on every run', 'write scope by role', 'manual rollback path for autonomous writes'],
    },
    {
      id: 'observability',
      name: 'Observability and recovery lane',
      purpose: 'Leadership should know when the cloud machine is wrong, stale, slow, or unsafe.',
      coverage: 'Covers logs, traces, evals, freshness monitoring, incident response, and recovery playbooks.',
      stack: ['runtime logs', 'traces and metrics', 'alerting', 'incident playbooks'],
      safeguards: ['named on-call owner', 'incident classes', 'recovery drills', 'promotion blocked on repeated failures'],
    },
  ],
  operatingRules: [
    {
      id: 'no-local-secrets',
      title: 'No production secrets on personal devices.',
      detail: 'All privileged access should flow through audited cloud surfaces, ephemeral workspaces, or approved secret stores.',
    },
    {
      id: 'no-direct-prod',
      title: 'No manual production changes outside control surfaces.',
      detail: 'Production changes move through release gates, admin planes, or explicit incident procedures with an audit trail.',
    },
    {
      id: 'named-owners',
      title: 'Every environment has named owners and rollback rules.',
      detail: 'There should be one accountable lead, one technical owner, and one operator owner before new scope goes live.',
    },
    {
      id: 'bounded-autonomy',
      title: 'Autonomous writes stay inside reviewable boundaries.',
      detail: 'If a workflow crosses money, security, customer commitments, or tenant isolation, approval hooks must be visible first.',
    },
    {
      id: 'trace-every-run',
      title: 'Every agent run needs source, tool, and outcome traceability.',
      detail: 'The cloud machine is only trustworthy when teams can explain what ran, what it touched, and why it made a decision.',
    },
  ],
  setupSteps: [
    {
      id: 'identity-access',
      title: 'Provision identity, MFA, and role-based access.',
      owner: 'Platform Pod',
      outcome: 'Every human and agent account is scoped before any production work begins.',
      route: '/app/platform-admin',
    },
    {
      id: 'cloud-workspaces',
      title: 'Stand up control, build, runtime, data, and sandbox environments.',
      owner: 'Platform Pod + Runtime Pod',
      outcome: 'The team works from cloud environments instead of local ad hoc setups.',
      route: '/app/cloud',
    },
    {
      id: 'control-surfaces',
      title: 'Bring Cloud Ops, Workbench, Agent Ops, and Platform Admin online together.',
      owner: 'Control Pod',
      outcome: 'Leadership and operators can steer the company from one shared shell.',
      route: '/app/workbench',
    },
    {
      id: 'delivery-pipeline',
      title: 'Connect source control, CI, preview deployments, and release promotion.',
      owner: 'Product Ops Pod',
      outcome: 'Every change has a repeatable path from build to production.',
      route: '/app/factory',
    },
    {
      id: 'workflow-backbone',
      title: 'Provision queues, durable workflows, scheduled runners, and sandbox execution.',
      owner: 'Runtime Pod',
      outcome: 'The AI workforce can run 24/7 with retries, pauses, and bounded automation.',
      route: '/app/runtime',
    },
    {
      id: 'records-memory',
      title: 'Provision relational, object, and retrieval stores with backup rules.',
      owner: 'Knowledge Pod',
      outcome: 'Every app and every agent reads from the same governed evidence spine.',
      route: '/app/data-fabric',
    },
    {
      id: 'source-onboarding',
      title: 'Load source systems and define canonical entities and schemas.',
      owner: 'Knowledge Pod + Product Ops Pod',
      outcome: 'The first customer workflows can run on real data, not isolated demos.',
      route: '/app/knowledge',
    },
    {
      id: 'governance',
      title: 'Define incident classes, approval thresholds, and executive review cadence.',
      owner: 'Control Pod',
      outcome: 'The cloud machine can scale without leadership losing oversight.',
      route: '/app/approvals',
    },
  ],
  nextMoves: [
    'Split interactive, batch, workflow, sandbox, and stateful crew work into separate queue families and worker tiers.',
    'Build a workspace factory that provisions deployment tier, policy pack, workforce pack, and regional cell from templates.',
    'Promote per-tenant cost, saturation, and rollout-ring telemetry into Cloud Ops before the fleet expands further.',
  ],
}
