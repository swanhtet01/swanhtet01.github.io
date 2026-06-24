export type ProcessStatus = 'working' | 'watch' | 'blocked' | 'next'

export type ProcessWorkstream = {
  id: string
  name: string
  status: ProcessStatus
  owner: string
  route: string
  currentState: string
  supportAction: string
  evidence: string[]
}

export type ProcessLoop = {
  id: string
  name: string
  cadence: string
  owner: string
  route: string
  definition: string
  output: string
}

export type SupportAgentRole = {
  id: string
  name: string
  role: string
  whenToUse: string
  handoff: string
}

export const PROCESS_ORGANIZER_MISSION = {
  title: 'Process Organizer',
  operatingRule:
    'Every Codex thread, agent run, and product change should leave a visible artifact: decision, task, owner, evidence, and next check.',
  reviewQuestion: 'What changed, what is blocked, who owns it, and what must be verified before the next push?',
} as const

export const PROCESS_WORKSTREAMS: ProcessWorkstream[] = [
  {
    id: 'public-site',
    name: 'Public site and offer',
    status: 'working',
    owner: 'Revenue Pod',
    route: '/app/supermega-dev',
    currentState: 'supermega.dev is reachable and route/domain checks pass.',
    supportAction: 'Keep the homepage focused on one sellable workflow offer and keep public smoke reliable.',
    evidence: ['audit:routes', 'smoke:domains', 'qa:public-live'],
  },
  {
    id: 'app-portal',
    name: 'App portal and tenant shell',
    status: 'watch',
    owner: 'Platform Pod',
    route: '/app/meta',
    currentState: 'The portal has broad route coverage and role-aware navigation, but the route count is high.',
    supportAction: 'Reduce each role to the smallest useful set of screens and keep advanced tools in operator areas.',
    evidence: ['AppFrame.tsx', 'App.tsx', 'prepare-static-routes.mjs'],
  },
  {
    id: 'meta-tools',
    name: 'Meta Tools and operator console',
    status: 'working',
    owner: 'Runtime Pod',
    route: '/app/meta-tools',
    currentState: 'The infra access map is live for cloud, agents, connectors, model control, data fabric, and security.',
    supportAction: 'Turn static control lanes into live run records and queue controls.',
    evidence: ['MetaToolsPage.tsx', 'metaToolsControl.ts', 'internal_routes.meta_tools'],
  },
  {
    id: 'agent-runtime',
    name: 'AI workforce runtime',
    status: 'watch',
    owner: 'Runtime Pod',
    route: '/app/workforce',
    currentState: 'Workforce registry, cloud autonomy checks, and preferred run modes exist; Cloud Tasks remains the scale upgrade.',
    supportAction: 'Add recursive workcell manifests, run evals, retry policy, and security drills before client writeback.',
    evidence: ['workforce_registry_status', 'workforce_apply_status', 'agent_run_count'],
  },
  {
    id: 'evidence-ledger',
    name: 'Evidence ledger',
    status: 'working',
    owner: 'QA/Security Pod',
    route: '/app/runtime',
    currentState: 'Durable QA evidence and runtime routes exist; the next gap is attaching security drills and recursive-agent eval artifacts.',
    supportAction: 'Require every agent run to record source scope, output, approval state, security drill status, and rollback path.',
    evidence: ['agent runs', 'approvals', 'release guard', 'meta_ops.qa_run'],
  },
  {
    id: 'ytf-tenant',
    name: 'YTF industrial tenant',
    status: 'working',
    owner: 'Delivery Pod',
    route: '/app/data-fabric',
    currentState: 'YTF tenant routing and data storytelling are the strongest concrete client blueprint.',
    supportAction: 'Use YTF as the industrial proof path; do not add another tenant until onboarding is repeatable.',
    evidence: ['ytf.supermega.dev', 'data fabric trust score', 'Drive/source register'],
  },
  {
    id: 'pos-module',
    name: 'POS / service business desk',
    status: 'watch',
    owner: 'Product Pod',
    route: '/app/service-desk',
    currentState: 'pos.supermega.dev is reachable and the POS/support desk should become a reusable module.',
    supportAction: 'Merge POS into the module factory as Service Business Desk instead of treating it as a separate direction.',
    evidence: ['pos.supermega.dev', 'support desk QA', 'local-first backup'],
  },
  {
    id: 'growth-machine',
    name: 'Growth machine',
    status: 'next',
    owner: 'Revenue Pod',
    route: '/app/revenue/growth',
    currentState: 'Growth queue generation and operator briefs exist; daily autonomous operation is not fully wired.',
    supportAction: 'Schedule queue generation, lead ledger verification, and reviewed follow-up tasks.',
    evidence: ['growth queue', 'lead ledger', 'founder brief'],
  },
]

export const PROCESS_LOOPS: ProcessLoop[] = [
  {
    id: 'daily-review',
    name: 'Daily progress review',
    cadence: 'Daily',
    owner: 'Process Organizer',
    route: '/app/process',
    definition: 'Read latest ops report, smoke results, worktree status, and product blockers.',
    output: 'One short brief: wins, blockers, next owner actions, and verification needed.',
  },
  {
    id: 'thread-handoff',
    name: 'Codex thread handoff',
    cadence: 'Every thread close or long task handoff',
    owner: 'Process Organizer',
    route: '/app/meta',
    definition: 'Each thread should leave files changed, checks run, remaining risk, and next owner action.',
    output: 'Handoff note suitable for the next Codex thread or agent.',
  },
  {
    id: 'release-guard',
    name: 'Release guard',
    cadence: 'Before deploy',
    owner: 'QA/Security Pod',
    route: '/app/meta-ops',
    definition: 'Run build, route/domain checks, local smoke, and public/live checks where reliable.',
    output: 'Pass/fail evidence and blocked deploy notes.',
  },
  {
    id: 'agent-support',
    name: 'Agent support review',
    cadence: 'Before increasing autonomy',
    owner: 'Runtime Pod',
    route: '/app/workforce',
    definition: 'Check scheduled jobs, queue state, run evidence, approval gates, and failure visibility.',
    output: 'Agent readiness score and required safety tasks.',
  },
  {
    id: 'product-cut',
    name: 'Product cut meeting',
    cadence: 'Weekly',
    owner: 'Founder Desk',
    route: '/app/product-ops',
    definition: 'Decide what to sell, stop, merge, or promote based on proof and delivery load.',
    output: 'Updated module ladder and one priority build lane.',
  },
]

export const SUPPORT_AGENT_ROLES: SupportAgentRole[] = [
  {
    id: 'release-guard',
    name: 'Release Guard',
    role: 'Runs build, route, domain, visual, and smoke checks before promotion.',
    whenToUse: 'Before deploys, after routing changes, or when a live domain looks wrong.',
    handoff: 'Return exact command, result, failed route, and rollback note.',
  },
  {
    id: 'codebase-cartographer',
    name: 'Codebase Cartographer',
    role: 'Maps route ownership, duplicate surfaces, and risky seams across the repo.',
    whenToUse: 'Before big refactors or when work crosses app, backend, and scripts.',
    handoff: 'Return file paths, current behavior, and the smallest safe edit plan.',
  },
  {
    id: 'product-editor',
    name: 'Product Editor',
    role: 'Cuts platform sprawl into sellable workflow offers and module contracts.',
    whenToUse: 'Before public copy, pricing, packaging, or sales follow-up.',
    handoff: 'Return buyer, pain, input, output, KPI, review gate, and next CTA.',
  },
  {
    id: 'customer-delivery',
    name: 'Customer Delivery Agent',
    role: 'Turns customer context into roles, source inputs, launch checklist, and first queue.',
    whenToUse: 'When onboarding a tenant or converting a demo into a real workspace.',
    handoff: 'Return setup gaps, data needed, launch owner, and first-week tasks.',
  },
  {
    id: 'evidence-ledger',
    name: 'Evidence Ledger Agent',
    role: 'Records input, output, source links, owner, approval state, and result for AI work.',
    whenToUse: 'Before any agent writes to customer data, sends messages, or changes production state.',
    handoff: 'Return run id, evidence ids, approval state, and unresolved risk.',
  },
]

export const PROCESS_MEETING_AGENDA = [
  'What shipped since the last review?',
  'Which live checks passed and which checks are unreliable?',
  'Which thread or agent is blocked?',
  'Which route/module should be simplified or merged?',
  'What is the next sellable workflow and who owns it?',
] as const

export const PROCESS_REPORT_COMMANDS = [
  'npm run process:report',
  'npm run audit:routes',
  'npm run smoke:domains',
  'npm run smoke:process-cloud',
  'powershell -NoProfile -ExecutionPolicy Bypass -File .\\tools\\run_local_portal_smoke.ps1',
] as const
