export type CloudDeploymentPattern = {
  id: string
  name: string
  strap: string
  purpose: string
  tenancy: string
  controlPlane: string[]
  runtime: string[]
  sellAs: string[]
}

export type SellableWorkspaceProgram = {
  id: string
  name: string
  strap: string
  buyer: string
  outcome: string
  apps: string[]
  workforcePacks: string[]
  deploymentPatternId: string
  pricingMotion: string
  launchMotion: string
  route: string
}

export type WorkforcePackage = {
  id: string
  name: string
  strap: string
  mission: string
  mode: string
  jobFamilies: string[]
  guardrails: string[]
  soldWith: string[]
  route: string
}

export const CLOUD_DEPLOYMENT_PATTERNS: CloudDeploymentPattern[] = [
  {
    id: 'tenant-workspace',
    name: 'Tenant workspace cloud',
    strap: 'One company, one branded workspace, one bounded workforce.',
    purpose: 'Ship a single-tenant app shell with role homes, queues, memory, and guarded automation.',
    tenancy: 'Single-tenant',
    controlPlane: ['Cloud Ops', 'Platform Admin', 'Agent Ops', 'Workforce Command'],
    runtime: ['queue-backed jobs', 'workspace tasks', 'runtime health', 'approval gates'],
    sellAs: ['implementation + subscription', 'private tenant portal', 'AI workforce add-on'],
  },
  {
    id: 'multi-site-grid',
    name: 'Multi-site enterprise grid',
    strap: 'Several sites, teams, or business units on one control layer.',
    purpose: 'Run several workspaces under a shared control plane with executive review, policy, and rollout visibility.',
    tenancy: 'Multi-site / portfolio',
    controlPlane: ['Control Workbench', 'Director', 'Platform Admin', 'Data Fabric'],
    runtime: ['site-level queues', 'cross-site exceptions', 'shared knowledge and policy', 'portfolio scoring'],
    sellAs: ['enterprise rollout program', 'regional control tower', 'multi-site operating platform'],
  },
  {
    id: 'external-portal-network',
    name: 'External portal network',
    strap: 'Extend the same runtime out to clients, suppliers, and partners.',
    purpose: 'Reuse the internal record, approval, and agent layers across external-facing workspaces.',
    tenancy: 'Networked portals',
    controlPlane: ['Platform Admin', 'Policies', 'Knowledge Control', 'Decision Journal'],
    runtime: ['client or supplier queues', 'document and approval workflows', 'shared status publishing'],
    sellAs: ['client portal package', 'supplier recovery package', 'partner workspace network'],
  },
  {
    id: 'workforce-runtime-add-on',
    name: 'AI workforce runtime add-on',
    strap: 'Sell the workforce, not only the screen.',
    purpose: 'Attach named recurring job packs, summaries, and bounded intervention loops to any workspace product.',
    tenancy: 'Add-on runtime',
    controlPlane: ['Cloud Ops', 'Agent Ops', 'Runtime', 'Workbench'],
    runtime: ['scheduled defaults', 'queue workers', 'brief generation', 'intervention thresholds'],
    sellAs: ['AI workforce subscription', 'automation bundle', 'always-on operations pack'],
  },
]

export const SELLABLE_WORKSPACE_PROGRAMS: SellableWorkspaceProgram[] = [
  {
    id: 'revenue-command-workspace',
    name: 'Revenue Command Workspace',
    strap: 'A cloud-native sales and pipeline desk with a built-in AI workforce.',
    buyer: 'Founders, revenue leaders, distributors, commercial teams',
    outcome: 'Run prospecting, account cleanup, follow-up, quoting, and leadership review from one cloud workspace.',
    apps: ['Sales System', 'Founder Brief', 'Decision Journal'],
    workforcePacks: ['Revenue Scout Pack', 'Executive Brief Pack'],
    deploymentPatternId: 'tenant-workspace',
    pricingMotion: 'Sell as a wedge workspace first, then expand into a commercial operating system with workforce add-ons.',
    launchMotion: 'Launch one revenue desk, one queue, one shortlist, then attach recurring scouts and briefs.',
    route: '/products/sales-system',
  },
  {
    id: 'operations-control-workspace',
    name: 'Operations Control Workspace',
    strap: 'One cloud queue for requests, blockers, approvals, and operational exceptions.',
    buyer: 'Operations leaders, warehouses, service teams, branch operators',
    outcome: 'Replace chat-driven ops and tracker sprawl with one owned control room plus bounded escalation agents.',
    apps: ['Operations Inbox', 'Approval Policy Engine', 'Document Intelligence'],
    workforcePacks: ['Operations Watch Pack', 'Approval and Supplier Pack'],
    deploymentPatternId: 'tenant-workspace',
    pricingMotion: 'Sell as an operational control desk with expansion into documents, approvals, and external portals.',
    launchMotion: 'Start with the live queue, then attach approvals, documents, and recurring drift detection.',
    route: '/products/operations-inbox',
  },
  {
    id: 'industrial-plant-os',
    name: 'Industrial Plant OS',
    strap: 'An AI-native plant, quality, and maintenance operating system running in cloud.',
    buyer: 'Factories, plants, industrial groups, manufacturing operators',
    outcome: 'Run receiving, DQMS, CAPA, downtime, inventory, and executive review in one tenant workspace.',
    apps: ['Industrial DQMS', 'Director Command Center', 'Data Science Studio'],
    workforcePacks: ['Operations Watch Pack', 'Knowledge Spine Pack', 'Executive Brief Pack'],
    deploymentPatternId: 'multi-site-grid',
    pricingMotion: 'Sell as a plant operating system with multi-site expansion and executive control tower upsell.',
    launchMotion: 'Deploy one plant tenant first, then expand to site groups, labs, suppliers, and leadership review.',
    route: '/products/industrial-dqms',
  },
  {
    id: 'supplier-recovery-network',
    name: 'Supplier Recovery Network',
    strap: 'A cloud workspace for supplier evidence, holds, discrepancies, and approvals.',
    buyer: 'Procurement leaders, inbound teams, finance controllers, supplier operations',
    outcome: 'Move supplier and inbound recovery out of inbox chaos into one shared external and internal control path.',
    apps: ['Supplier Portal', 'Approval Policy Engine', 'Document Intelligence'],
    workforcePacks: ['Approval and Supplier Pack', 'Knowledge Spine Pack'],
    deploymentPatternId: 'external-portal-network',
    pricingMotion: 'Sell as a supplier-control layer attached to procurement, receiving, and finance operations.',
    launchMotion: 'Launch on the highest-friction supplier workflow first, then extend to the external portal network.',
    route: '/products/supplier-portal',
  },
  {
    id: 'director-control-tower',
    name: 'Director Control Tower',
    strap: 'A cloud control layer for portfolio, multi-site, and executive decision cadence.',
    buyer: 'Founders, CEOs, COOs, portfolio operators, regional leaders',
    outcome: 'Condense live queue, approval, exception, and runtime state into one executive review workspace.',
    apps: ['Director Command Center', 'Decision Journal', 'Knowledge Graph'],
    workforcePacks: ['Executive Brief Pack', 'Knowledge Spine Pack'],
    deploymentPatternId: 'multi-site-grid',
    pricingMotion: 'Sell as an executive control tower on top of live operating workspaces, not as a standalone dashboard.',
    launchMotion: 'Attach to one live tenant first, then widen into multi-site review and shared policy governance.',
    route: '/products/director-command-center',
  },
  {
    id: 'agent-company-starter',
    name: 'Agent Company Starter',
    strap: 'A packaged AI workforce and workspace layer for teams that want operations to run in cloud.',
    buyer: 'Agencies, operators, founders, services firms, internal innovation teams',
    outcome: 'Stand up a branded workspace, queue runtime, memory layer, and recurring job packs that keep working outside any assistant session.',
    apps: ['Agent Runtime', 'Tenant Control Plane', 'Knowledge Graph'],
    workforcePacks: ['Revenue Scout Pack', 'Operations Watch Pack', 'Executive Brief Pack', 'Tenant Launch Pack'],
    deploymentPatternId: 'workforce-runtime-add-on',
    pricingMotion: 'Sell as a base workspace platform plus workforce subscriptions and custom module packaging.',
    launchMotion: 'Start with one workspace and one workforce pack, then expand into a portfolio of sellable internal tools.',
    route: '/products/agent-runtime',
  },
]

export const WORKFORCE_PACKAGES: WorkforcePackage[] = [
  {
    id: 'revenue-scout-pack',
    name: 'Revenue Scout Pack',
    strap: 'Recurring commercial prep, enrichment, and shortlist work.',
    mission: 'Keep the revenue workspace fresh without manual list cleanup and stale follow-up.',
    mode: 'Scheduled + operator-assisted',
    jobFamilies: ['revenue_scout', 'list_clerk', 'template_clerk'],
    guardrails: ['advisory drafting only', 'human review on outward-facing claims', 'tracked queue handoff'],
    soldWith: ['Revenue Command Workspace', 'Agent Company Starter'],
    route: '/app/teams',
  },
  {
    id: 'operations-watch-pack',
    name: 'Operations Watch Pack',
    strap: 'Exception monitoring and next-action shaping for live operational queues.',
    mission: 'Keep ops queues readable and escalate only the few issues that deserve intervention.',
    mode: 'Scheduled + queue-backed',
    jobFamilies: ['task_triage', 'ops_watch'],
    guardrails: ['no autonomous sensitive writes', 'approval routing stays visible', 'retries stay bounded'],
    soldWith: ['Operations Control Workspace', 'Industrial Plant OS', 'Agent Company Starter'],
    route: '/app/runtime',
  },
  {
    id: 'approval-supplier-pack',
    name: 'Approval and Supplier Pack',
    strap: 'Evidence chase, approval prep, and supplier recovery loops.',
    mission: 'Shorten decision latency and stop supplier recovery from fragmenting across inboxes and chats.',
    mode: 'Queue-backed + review-gated',
    jobFamilies: ['task_triage', 'ops_watch'],
    guardrails: ['manager approval on decision boundaries', 'evidence link required', 'sensitive flows remain reviewable'],
    soldWith: ['Operations Control Workspace', 'Supplier Recovery Network'],
    route: '/app/approvals',
  },
  {
    id: 'executive-brief-pack',
    name: 'Executive Brief Pack',
    strap: 'Daily or scheduled leadership review from live state.',
    mission: 'Turn queue, runtime, and decision pressure into one brief leadership actually reads.',
    mode: 'Scheduled briefing',
    jobFamilies: ['founder_brief'],
    guardrails: ['summary is advisory', 'source links preserved', 'high-severity items escalate visibly'],
    soldWith: ['Revenue Command Workspace', 'Industrial Plant OS', 'Director Control Tower', 'Agent Company Starter'],
    route: '/app/director',
  },
  {
    id: 'knowledge-spine-pack',
    name: 'Knowledge Spine Pack',
    strap: 'Shared memory, record cleanup, and provenance management.',
    mission: 'Keep every workspace and every agent grounded in canonical records instead of folder sprawl.',
    mode: 'Continuous curation + promotion review',
    jobFamilies: ['task_triage', 'founder_brief'],
    guardrails: ['provenance retained', 'schema changes reviewed', 'publishing is gated'],
    soldWith: ['Industrial Plant OS', 'Supplier Recovery Network', 'Director Control Tower'],
    route: '/app/knowledge',
  },
  {
    id: 'tenant-launch-pack',
    name: 'Tenant Launch Pack',
    strap: 'Provisioning, onboarding, and rollout hardening for new cloud workspaces.',
    mission: 'Turn the first tenant rollout into a repeatable launch loop with visible blockers and control surfaces.',
    mode: 'Project-based + scheduled checkpoints',
    jobFamilies: ['task_triage', 'ops_watch', 'founder_brief'],
    guardrails: ['tenant-critical changes reviewed', 'domain and role decisions audited', 'launch blockers named'],
    soldWith: ['Agent Company Starter', 'Director Control Tower'],
    route: '/app/platform-admin',
  },
]
