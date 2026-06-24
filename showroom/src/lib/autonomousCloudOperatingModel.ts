export type CloudModelLane = {
  id: string
  name: string
  mission: string
  placement: string
  workloads: string[]
  guardrails: string[]
  route: string
}

export type ConnectorClass = {
  id: string
  name: string
  mission: string
  examples: string[]
  unlockRule: string
  outputs: string[]
  route: string
}

export type ActionLane = {
  id: string
  name: string
  mission: string
  executionPlane: string
  queueClass: string
  defaultCrews: string[]
  triggers: string[]
  outputs: string[]
  route: string
}

export type AutonomousDevelopmentLoop = {
  id: string
  name: string
  mission: string
  cadence: string
  reads: string[]
  writes: string[]
  successMetric: string
  route: string
}

export type AntifragilityRule = {
  id: string
  title: string
  detail: string
}

export type AutonomousCloudOperatingModel = {
  title: string
  summary: string
  northStar: string
  modelLanes: CloudModelLane[]
  connectorClasses: ConnectorClass[]
  actionLanes: ActionLane[]
  developmentLoops: AutonomousDevelopmentLoop[]
  antifragilityRules: AntifragilityRule[]
}

export const SUPERMEGA_AUTONOMOUS_CLOUD_MODEL: AutonomousCloudOperatingModel = {
  title: 'SUPERMEGA autonomous cloud operating contract',
  summary:
    'The platform becomes useful and scalable only when models, connectors, actions, and development loops are treated as one cloud runtime contract instead of separate features.',
  northStar:
    'Every agent crew should know which model lane it belongs to, which connectors it can trust, which queue lane it runs in, and which human gate owns the risky writes.',
  modelLanes: [
    {
      id: 'control-reasoning',
      name: 'Control reasoning lane',
      mission: 'Handle cross-system planning, executive synthesis, approval prep, and high-stakes runtime decisions.',
      placement: 'Control plane and durable workflow checkpoints',
      workloads: ['cross-surface planning', 'approval synthesis', 'director brief', 'exception arbitration'],
      guardrails: ['typed outputs', 'approval on risky writes', 'trace retention', 'rollback path'],
      route: '/app/workbench',
    },
    {
      id: 'ops-throughput',
      name: 'Ops throughput lane',
      mission: 'Run large volumes of queue shaping, triage, extraction, and cleanup without starving the control plane.',
      placement: 'Worker plane and queue consumers',
      workloads: ['task triage', 'document extraction', 'connector cleanup', 'list hygiene'],
      guardrails: ['idempotent writes', 'retry budget', 'dead-letter review', 'tenant quotas'],
      route: '/app/runtime',
    },
    {
      id: 'stateful-crew',
      name: 'Stateful crew lane',
      mission: 'Keep long-lived tenant crews, browser sessions, and human-in-the-loop agents alive outside request-response cycles.',
      placement: 'Stateful runtime with wakeups and replay',
      workloads: ['executive brief crew', 'operations watch crew', 'supplier recovery crew', 'browser task crews'],
      guardrails: ['durable memory', 'session replay', 'operator takeover', 'credential isolation'],
      route: '/app/teams',
    },
    {
      id: 'build-coding',
      name: 'Build and coding lane',
      mission: 'Let specialized builder agents design, code, test, and ship product changes from cloud workspaces rather than local heroics.',
      placement: 'Build environment, preview lane, and release desk',
      workloads: ['app design', 'feature implementation', 'test repair', 'release packaging'],
      guardrails: ['branch isolation', 'preview verification', 'release gate', 'artifact traceability'],
      route: '/app/factory',
    },
    {
      id: 'retrieval-analysis',
      name: 'Retrieval and analysis lane',
      mission: 'Turn source deltas into cleaned records, narrative insight, and decision-ready context.',
      placement: 'Data plane and insight services',
      workloads: ['canon promotion', 'graph repair', 'forecast prep', 'storytelling and reporting'],
      guardrails: ['source provenance', 'schema review', 'quality thresholds', 'analyst checkpoint'],
      route: '/app/data-fabric',
    },
  ],
  connectorClasses: [
    {
      id: 'communications',
      name: 'Communications connectors',
      mission: 'Read the company conversations that create work, approvals, and revenue intent.',
      examples: ['Gmail', 'Calendar', 'chat mesh', 'meeting notes'],
      unlockRule: 'Enable only when account identity, owner routing, and draft-write policy are already clear in the app surface.',
      outputs: ['task proposals', 'approval evidence', 'account memory updates', 'brief signals'],
      route: '/app/connectors',
    },
    {
      id: 'evidence',
      name: 'Evidence and file connectors',
      mission: 'Convert files, photos, sheets, and notes into source-linked operational records.',
      examples: ['Google Drive', 'document vaults', 'shared folders', 'object stores'],
      unlockRule: 'Enable only after canonical entities and folder-to-record mapping exist.',
      outputs: ['document intake', 'knowledge candidates', 'evidence bundles', 'review packets'],
      route: '/app/data-fabric',
    },
    {
      id: 'transactional',
      name: 'Transactional system connectors',
      mission: 'Bring ERP, CRM, finance, and system-of-record deltas into the runtime without breaking trust.',
      examples: ['ERP exports', 'CRM feeds', 'inventory systems', 'billing state'],
      unlockRule: 'Enable only after field contracts, writeback boundaries, and reconciliation rules are defined.',
      outputs: ['exception joins', 'inventory and revenue signals', 'canonical operational records', 'workflow triggers'],
      route: '/app/platform-admin',
    },
    {
      id: 'human-writeback',
      name: 'Human writeback surfaces',
      mission: 'Turn operator actions into structured records that the AI runtime can safely build on.',
      examples: ['portal forms', 'manager review desks', 'mobile entry', 'guided work queues'],
      unlockRule: 'Enable first and use as the trust anchor before widening passive data sources.',
      outputs: ['structured records', 'approval rows', 'task ownership', 'coaching signals'],
      route: '/app/actions',
    },
    {
      id: 'delivery',
      name: 'Delivery and engineering connectors',
      mission: 'Keep product development attached to issues, releases, incidents, and rollout posture.',
      examples: ['GitHub', 'Sentry', 'release notes', 'deployment status'],
      unlockRule: 'Enable once build, preview, and release surfaces already have named owners and promotion rules.',
      outputs: ['release readiness', 'incident triggers', 'product risk signals', 'build priorities'],
      route: '/app/product-ops',
    },
  ],
  actionLanes: [
    {
      id: 'triage-cleanup',
      name: 'Triage and cleanup lane',
      mission: 'Keep inboxes, queues, and raw sources usable enough for the rest of the system to trust.',
      executionPlane: 'Worker plane',
      queueClass: 'High-throughput batch',
      defaultCrews: ['task triage', 'list clerk', 'connector reliability'],
      triggers: ['new inbound volume', 'stale queue growth', 'connector backlog'],
      outputs: ['clean queue', 'owner suggestions', 'deduplicated records'],
      route: '/app/actions',
    },
    {
      id: 'insight-briefing',
      name: 'Insight and briefing lane',
      mission: 'Turn live records into leadership insight, narrative context, and next-action framing.',
      executionPlane: 'Control reasoning plus data plane',
      queueClass: 'Priority synthesis',
      defaultCrews: ['founder brief', 'director review', 'operating intelligence'],
      triggers: ['daily review cadence', 'risk threshold crossed', 'launch decision'],
      outputs: ['briefs', 'decision options', 'executive actions'],
      route: '/app/insights',
    },
    {
      id: 'workflow-recovery',
      name: 'Workflow and recovery lane',
      mission: 'Drive approvals, escalations, and exception recovery until a human or durable workflow closes the loop.',
      executionPlane: 'Durable workflow lane',
      queueClass: 'Long-running orchestration',
      defaultCrews: ['supplier recovery', 'runtime safety', 'approval preparation'],
      triggers: ['approval waiting', 'exception created', 'missing evidence'],
      outputs: ['approval packets', 'escalations', 'recovery tasks'],
      route: '/app/approvals',
    },
    {
      id: 'product-build',
      name: 'Product build lane',
      mission: 'Continuously design, implement, verify, and package the platform itself from cloud workspaces.',
      executionPlane: 'Build plane',
      queueClass: 'Preview and release',
      defaultCrews: ['app foundry', 'experience evals', 'module factory'],
      triggers: ['new priority accepted', 'runtime gap found', 'customer rollout blocker'],
      outputs: ['code changes', 'tests', 'release notes', 'promotion candidates'],
      route: '/app/factory',
    },
    {
      id: 'tenant-crew',
      name: 'Dedicated tenant crew lane',
      mission: 'Run always-on, tenant-specific agents that hold memory, policy, and schedules for one workspace or operational domain.',
      executionPlane: 'Stateful agent plane',
      queueClass: 'Durable crew state',
      defaultCrews: ['executive brief crew', 'operations watch crew', 'commercial memory crew'],
      triggers: ['tenant wakeup schedule', 'new source delta', 'operator intervention'],
      outputs: ['tenant memory updates', 'next steps', 'policy-aware automations'],
      route: '/app/teams',
    },
  ],
  developmentLoops: [
    {
      id: 'architecture-loop',
      name: 'Architecture loop',
      mission: 'Continuously refine control-plane, data-plane, and runtime contracts before the codebase sprawls.',
      cadence: 'Daily design review and milestone promotion',
      reads: ['Cloud Ops', 'Workbench', 'Runtime', 'Product Ops'],
      writes: ['architecture models', 'platform decisions', 'promotion rules'],
      successMetric: 'Fewer manual exceptions and clearer rollout contracts each week.',
      route: '/app/cloud',
    },
    {
      id: 'builder-loop',
      name: 'Builder loop',
      mission: 'Turn accepted priorities into implemented features, validated previews, and promotion candidates from cloud workspaces.',
      cadence: 'Continuous on accepted backlog',
      reads: ['Build Studio', 'Foundry', 'GitHub feed', 'runtime attention items'],
      writes: ['code changes', 'release tasks', 'verification outputs'],
      successMetric: 'New work ships through preview and release without relying on local-machine heroics.',
      route: '/app/factory',
    },
    {
      id: 'connector-loop',
      name: 'Connector loop',
      mission: 'Keep data sources fresh, expand connector scope safely, and convert stale feeds into explicit operator work.',
      cadence: '15-minute watch with daily review',
      reads: ['Connector Ops', 'Data Fabric', 'Platform Admin'],
      writes: ['review tasks', 'connector events', 'source-map promotions'],
      successMetric: 'Critical feeds stay fresh and every stale source becomes owned work instead of silent drift.',
      route: '/app/connectors',
    },
    {
      id: 'crew-learning-loop',
      name: 'Crew learning loop',
      mission: 'Use run history, manual recovery, and approval friction to refine playbooks and crew boundaries.',
      cadence: 'Daily operator review and weekly policy adjustment',
      reads: ['Agent Ops', 'Runtime', 'Approvals'],
      writes: ['playbook updates', 'guardrail changes', 'new crew instructions'],
      successMetric: 'Manual recovery pressure falls while safe automation coverage rises.',
      route: '/app/teams',
    },
    {
      id: 'insight-story-loop',
      name: 'Insight and story loop',
      mission: 'Turn cleaned data and run traces into customer value, internal learning, and sharper product positioning.',
      cadence: 'Daily brief plus weekly synthesis',
      reads: ['Insights', 'Data Fabric', 'Director'],
      writes: ['briefs', 'stories', 'forecast packs', 'customer-proof material'],
      successMetric: 'Managers and customers receive shorter, more decision-ready outputs from the same data spine.',
      route: '/app/insights',
    },
  ],
  antifragilityRules: [
    {
      id: 'make-drift-visible',
      title: 'Make drift visible immediately.',
      detail: 'Every stale connector, overdue loop, or manual workaround should become an event, a task, or a dashboard signal.',
    },
    {
      id: 'human-writeback-first',
      title: 'Use human writeback as the trust anchor.',
      detail: 'Before widening passive connectors, make sure the system can capture clean human corrections and decisions.',
    },
    {
      id: 'separate-think-from-throughput',
      title: 'Separate deep reasoning from high-throughput automation.',
      detail: 'Control reasoning, batch cleanup, and stateful crews should not compete for the same runtime lane.',
    },
    {
      id: 'treat-recovery-as-product',
      title: 'Treat recovery as product, not heroics.',
      detail: 'If operators repeatedly rescue a workflow, the rescue path belongs in the product contract.',
    },
    {
      id: 'keep-economics-in-the-loop',
      title: 'Keep cost and margin in the operating loop.',
      detail: 'Model routing, browser use, and storage growth should be governed at the same level as feature velocity.',
    },
  ],
}
