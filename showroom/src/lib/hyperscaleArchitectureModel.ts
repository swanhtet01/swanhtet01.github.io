export type HyperscalePlane = {
  id: string
  name: string
  strap: string
  mission: string
  route: string
  scaleTarget: string
  responsibilities: string[]
  controls: string[]
}

export type HyperscaleWorkloadClass = {
  id: string
  name: string
  purpose: string
  route: string
  queueClass: string
  computeShape: string
  stateBoundary: string
  examples: string[]
}

export type HyperscalePartitionRule = {
  id: string
  name: string
  strategy: string
  trigger: string
  route: string
  result: string
}

export type HyperscaleBottleneck = {
  id: string
  title: string
  symptom: string
  replaceWith: string
  route: string
}

export type HyperscaleMilestone = {
  id: string
  stage: string
  target: string
  objective: string
  mustHave: string[]
  graduationRule: string
}

export type HyperscaleArchitectureModel = {
  title: string
  summary: string
  northStar: string
  planes: HyperscalePlane[]
  workloadClasses: HyperscaleWorkloadClass[]
  partitionRules: HyperscalePartitionRule[]
  bottlenecks: HyperscaleBottleneck[]
  milestones: HyperscaleMilestone[]
}

export const SUPERMEGA_HYPERSCALE_ARCHITECTURE_MODEL: HyperscaleArchitectureModel = {
  title: 'SUPERMEGA hyperscale architecture',
  summary:
    'Scale comes from separating the control plane from execution, classifying workloads correctly, and partitioning tenants, queues, and data before the fleet gets noisy.',
  northStar:
    'One thin control plane should be able to steer a very large fleet of sellable workspaces and AI workforces because heavy execution, state, data, and spend control are broken into dedicated planes.',
  planes: [
    {
      id: 'control-plane',
      name: 'Control plane',
      strap: 'Thin governance and provisioning shell',
      mission:
        'Hold identity, policy, module provisioning, approvals, release posture, and executive steering without also doing the heavy work.',
      route: '/app/workbench',
      scaleTarget: 'Thousands of workspaces should be operable from one shell because this plane stays thin and audit-heavy.',
      responsibilities: ['identity and RBAC', 'tenant provisioning', 'policy and approval control', 'release and exception steering'],
      controls: ['SSO and MFA', 'role graph', 'approval gates', 'tenant policy packs'],
    },
    {
      id: 'experience-edge',
      name: 'Experience and API edge',
      strap: 'The branded portal, APIs, and session entrypoint',
      mission:
        'Serve user sessions, stream results, accept uploads, and route requests into the right execution lane without blocking on long jobs.',
      route: '/app/cloud',
      scaleTarget: 'Keep operator and customer sessions responsive while execution fans out behind queues and durable workflows.',
      responsibilities: ['portal UI', 'API ingress', 'session streaming', 'request admission and routing'],
      controls: ['rate limits', 'request tracing', 'edge auth checks', 'synchronous timeout boundaries'],
    },
    {
      id: 'worker-plane',
      name: 'Worker plane',
      strap: 'Autoscaled async execution fleet',
      mission:
        'Drain queue families for enrichment, extraction, sync, batch generation, and other bounded jobs without coupling them to the portal runtime.',
      route: '/app/runtime',
      scaleTarget: 'Burst compute independently of the control plane and scale queue consumers by job family and SLO.',
      responsibilities: ['queue consumers', 'connector jobs', 'batch enrichment', 'retry and dead-letter handling'],
      controls: ['queue classes', 'autoscaling workers', 'retry budgets', 'dead-letter review'],
    },
    {
      id: 'stateful-agent-plane',
      name: 'Stateful agent plane',
      strap: 'Long-lived crews and human-in-the-loop state',
      mission:
        'Run tenant crews, approval waits, browser sessions, and real-time operator collaboration where state must survive reconnects and pauses.',
      route: '/app/teams',
      scaleTarget: 'Reserve stateful capacity for the crews that genuinely need memory, sockets, or human checkpoints.',
      responsibilities: ['tenant agent crews', 'approval waits', 'real-time sessions', 'browser and computer action coordination'],
      controls: ['durable state', 'tool write scopes', 'session replay', 'operator takeover'],
    },
    {
      id: 'data-plane',
      name: 'Data plane',
      strap: 'Tenant records, memory, and analytics spine',
      mission:
        'Separate operational records, files, retrieval state, events, and analytics so the product can scale reads and writes without corrupting tenant boundaries.',
      route: '/app/data-fabric',
      scaleTarget: 'Partition relational, object, retrieval, and warehouse workloads before one hot tenant degrades the fleet.',
      responsibilities: ['system-of-record tables', 'object and document storage', 'retrieval indexes', 'analytics events and marts'],
      controls: ['backup rules', 'schema contracts', 'retention classes', 'tenant partitioning'],
    },
    {
      id: 'economics-observability',
      name: 'Economics and observability plane',
      strap: 'Trace, budget, and route every job with intent',
      mission:
        'Turn agent scale into a governable business by tracing runs, metering spend, routing models by workload, and exposing margin at the tenant and module level.',
      route: '/app/insights',
      scaleTarget: 'Maintain gross margin and operator trust even when usage becomes noisy, bursty, and highly multi-tenant.',
      responsibilities: ['trace collection', 'cost attribution', 'model routing', 'fleet SLO reporting'],
      controls: ['per-tenant budgets', 'model policy', 'latency and error SLOs', 'anomaly alerts'],
    },
  ],
  workloadClasses: [
    {
      id: 'interactive',
      name: 'Interactive copilots',
      purpose: 'Fast user-facing sessions that stream answers, forms, or tool results inside the portal.',
      route: '/app/runtime',
      queueClass: 'Interactive, latency-priority lane',
      computeShape: 'Short-lived API and stream workers with strict timeout budgets',
      stateBoundary: 'Ephemeral session context plus persisted thread and trace IDs',
      examples: ['operator copilots', 'sales desk assistants', 'decision drafting'],
    },
    {
      id: 'batch-enrichment',
      name: 'Batch enrichment and extraction',
      purpose: 'Large volumes of document, data, and external-source work that should never block user sessions.',
      route: '/app/actions',
      queueClass: 'High-throughput batch lane',
      computeShape: 'Queue consumers and fan-out jobs with retry and backpressure controls',
      stateBoundary: 'Job-level checkpoints and idempotent writes',
      examples: ['document extraction', 'lead enrichment', 'backfills', 'source sync cleanup'],
    },
    {
      id: 'durable-business-flow',
      name: 'Durable business workflows',
      purpose: 'Multi-step flows with approvals, waits, escalation, and resumability across hours or days.',
      route: '/app/workbench',
      queueClass: 'Workflow orchestration lane',
      computeShape: 'Durable workflow engine with explicit step history and compensations',
      stateBoundary: 'Workflow state, step outputs, approval checkpoints',
      examples: ['tenant launch', 'release promotion', 'procurement approval', 'incident recovery'],
    },
    {
      id: 'browser-computer-actions',
      name: 'Browser and computer actions',
      purpose: 'High-risk or brittle UI automations that need stronger isolation and replay than normal tool jobs.',
      route: '/app/lab',
      queueClass: 'Sandboxed execution lane',
      computeShape: 'Isolated browser or sandbox pools with short-lived credentials',
      stateBoundary: 'Run recording, artifact capture, and bounded secrets',
      examples: ['web research', 'portal automation', 'UI reconciliation', 'knowledge-worker replacement loops'],
    },
    {
      id: 'tenant-crews',
      name: 'Dedicated tenant crews',
      purpose: 'Named always-on teams that own one tenant or one high-value operational lane with memory and schedules.',
      route: '/app/teams',
      queueClass: 'Stateful crew lane',
      computeShape: 'Durable agent containers or objects with scheduled and event-driven wakeups',
      stateBoundary: 'Tenant memory, crew state, operator inbox, and policy pack',
      examples: ['executive brief crew', 'operations watch crew', 'supplier recovery crew'],
    },
  ],
  partitionRules: [
    {
      id: 'tenant-policy',
      name: 'Tenant and policy partition',
      strategy: 'Keep auth, roles, secrets, and policy packs tenant-scoped from the first commercial deployment.',
      trigger: 'Do this immediately. Do not wait for scale.',
      route: '/app/platform-admin',
      result: 'A bug or operator mistake in one workspace cannot silently widen access to another.',
    },
    {
      id: 'queue-family',
      name: 'Queue-family partition',
      strategy: 'Split interactive, batch, workflow, and sandbox jobs into separate queues with separate SLOs and dead-letter handling.',
      trigger: 'The moment one job class starts starving another or tail latency becomes noisy.',
      route: '/app/runtime',
      result: 'A batch storm no longer degrades approvals, chats, or revenue-critical workflows.',
    },
    {
      id: 'data-retrieval',
      name: 'Data and retrieval partition',
      strategy: 'Partition relational records, object storage, retrieval indexes, and analytics events independently by tenant or regulatory tier.',
      trigger: 'Before large attachments, vector growth, or regulated tenants enter the same fleet.',
      route: '/app/data-fabric',
      result: 'Hot tenants and heavy retrieval loads stop poisoning the shared record layer.',
    },
    {
      id: 'model-routing',
      name: 'Model-routing partition',
      strategy: 'Route workloads through policy-based model tiers instead of sending every job to the most capable model.',
      trigger: 'As soon as model spend becomes material to margin or latency variability affects user trust.',
      route: '/app/insights',
      result: 'The platform scales gross margin and quality together instead of treating model cost as an afterthought.',
    },
    {
      id: 'deployment-tier',
      name: 'Deployment-tier partition',
      strategy: 'Support shared multi-tenant, isolated single-tenant, and regulated dedicated deployments from one product contract.',
      trigger: 'When enterprise sales starts seeing security, residency, or procurement objections.',
      route: '/app/product-ops',
      result: 'Sales can keep one product line while delivery chooses the right runtime isolation tier for each customer.',
    },
    {
      id: 'regional-cell',
      name: 'Regional cell and rollout-ring partition',
      strategy: 'Group workspaces into region-aware cells and rollout rings so capacity, incidents, and releases do not hit the whole fleet at once.',
      trigger: 'Before 24/7 enterprise customers or global traffic force tighter recovery and residency guarantees.',
      route: '/app/factory',
      result: 'The fleet gets safer releases, clearer blast-radius control, and a path to regional failover.',
    },
  ],
  bottlenecks: [
    {
      id: 'ui-doing-worker-jobs',
      title: 'Portal runtime still doing worker work',
      symptom: 'The same service handles interactive sessions, long jobs, and operator control, so load spikes degrade everything together.',
      replaceWith: 'Keep the portal thin. Push long and bursty work into worker fleets and durable workflows.',
      route: '/app/runtime',
    },
    {
      id: 'single-queue',
      title: 'One queue shape for every job',
      symptom: 'Interactive, workflow, batch, and sandbox jobs compete for the same capacity and create unstable latency.',
      replaceWith: 'Introduce queue families, per-class autoscaling, and dead-letter review by workload type.',
      route: '/app/actions',
    },
    {
      id: 'shared-tenant-state',
      title: 'Tenant state not partitioned deeply enough',
      symptom: 'One noisy tenant or retrieval-heavy workflow can distort the shared data and memory layer.',
      replaceWith: 'Shard tenant records, documents, vectors, and events with explicit isolation tiers.',
      route: '/app/data-fabric',
    },
    {
      id: 'no-durable-crew-state',
      title: 'Agent memory still too session-bound',
      symptom: 'Always-on crews depend on request cycles or design-console sessions instead of durable state and wakeups.',
      replaceWith: 'Run long-lived crews in a dedicated stateful lane with schedulers, replay, and operator recovery.',
      route: '/app/teams',
    },
    {
      id: 'no-spend-governor',
      title: 'Scale without an economics governor',
      symptom: 'Usage can grow faster than margin because models, browser actions, and storage have no per-tenant spend posture.',
      replaceWith: 'Meter cost by tenant, workload, and module, then enforce model and sandbox policies from the control layer.',
      route: '/app/insights',
    },
    {
      id: 'manual-workspace-factory',
      title: 'Tenant launches still rely on manual assembly',
      symptom: 'Each new workspace needs custom provisioning and operator glue, so growth scales headcount instead of platform leverage.',
      replaceWith: 'Build a workspace factory that provisions runtime tier, policy pack, module set, queues, and deployment cell from templates.',
      route: '/app/factory',
    },
  ],
  milestones: [
    {
      id: 'foundation',
      stage: 'Foundation',
      target: 'Internal operation + first anchor tenants',
      objective: 'Prove the shared control plane, the queue backbone, and the first sellable workspace programs on real data.',
      mustHave: ['tenant-scoped auth and policy', 'preview and release lane', 'queue-backed job execution', 'core telemetry'],
      graduationRule: 'Graduate only when the platform can recover from worker failure and replay tenant-critical jobs cleanly.',
    },
    {
      id: 'repeatable',
      stage: 'Repeatable fleet',
      target: 'Dozens to low hundreds of workspaces',
      objective: 'Standardize deployment patterns, workforce packs, onboarding, and budget-aware model routing.',
      mustHave: ['deployment tiers', 'module packaging discipline', 'queue-family separation', 'workspace factory templates', 'per-tenant cost attribution'],
      graduationRule: 'Graduate only when a new tenant workspace can launch from productized templates instead of custom heroics.',
    },
    {
      id: 'regional-scale',
      stage: 'Regional scale',
      target: 'Hundreds to thousands of workspaces and large daily job volume',
      objective: 'Shard data, isolate noisy tenants, and move always-on crews into a dedicated stateful runtime.',
      mustHave: ['tenant and data sharding', 'stateful crew runtime', 'workflow durability', 'regional cells and rollout rings', 'fleet SLO dashboards'],
      graduationRule: 'Graduate only when no single tenant or workload class can materially destabilize the whole region.',
    },
    {
      id: 'platform-scale',
      stage: 'Platform scale',
      target: 'A very large global fleet of sellable workspaces and workforce programs',
      objective: 'Run multi-region control, dedicated enterprise tiers, and strong economic governance without exploding operator count.',
      mustHave: ['multi-region failover', 'dedicated deployment options', 'automated fleet remediation', 'gross-margin controls'],
      graduationRule: 'Graduate only when operator leverage improves faster than tenant count and the control plane remains thin.',
    },
  ],
}
