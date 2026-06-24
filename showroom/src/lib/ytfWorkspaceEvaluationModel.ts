import type { YtfWorkspaceId } from './ytfWorkspaceModel'

export type YtfWorkspaceEvaluation = {
  current: string[]
  missing: string[]
  next: string[]
}

export type YtfWorkspaceComparison = {
  id: string
  label: string
  route: string
  owner: string
  useWhen: string
  notFor: string
  dataWrites: string[]
  dataReads: string[]
  mobilePromise: string
}

export type YtfWorkspaceScorecard = {
  workspaceId: YtfWorkspaceId
  label: string
  desktopScore: number
  mobileScore: number
  dataScore: number
  workflowScore: number
  verdict: string
  gaps: string[]
  nextTests: string[]
}

export type YtfErrcItem = {
  quadrant: 'Eliminate' | 'Reduce' | 'Raise' | 'Create'
  title: string
  detail: string
}

export type YtfContinuousLearningLoop = {
  id: string
  title: string
  trigger: string
  humanRole: string
  platformResponse: string
  output: string
}

export type YtfStackItem = {
  id: string
  name: string
  category: string
  posture: 'Use now' | 'Selective' | 'Later'
  why: string
  fit: string
  href: string
}

export const YTF_WORKSPACE_COMPARISON: YtfWorkspaceComparison[] = [
  {
    id: 'admin',
    label: 'Admin workspace',
    route: '/app/platform-admin',
    owner: 'Tenant admin / owner operator',
    useWhen: 'You need to control roles, connectors, modules, data-source posture, cron, AI runtime, and rollout order.',
    notFor: 'Daily shopfloor entry. Admin should not become the place every operator has to visit.',
    dataWrites: ['module status', 'domain config', 'connector posture', 'role/account split', 'runtime policy'],
    dataReads: ['audit events', 'source coverage', 'module readiness', 'workspace evaluation', 'agent runtime posture'],
    mobilePromise: 'Useful on phone for review and emergency toggles, but not optimized as the main daily capture surface.',
  },
  {
    id: 'plant',
    label: 'Plant Manager workspace',
    route: '/app/plant-manager',
    owner: 'Plant manager / senior factory review',
    useWhen: 'A topic crosses shifts, departments, quality release, maintenance, production, or customer exposure.',
    notFor: 'Tiny one-person updates that a department manager can close inside Daily Entry or Action Board.',
    dataWrites: ['Floor Actions', 'quality escalation', 'approval gates', 'KPI extraction run', 'cross-team closure'],
    dataReads: ['manager entries', 'DQMS', 'maintenance', 'Drive source changes', 'candidate KPI queue'],
    mobilePromise: 'Compact enough to review on phone; best on tablet or desktop for cross-team review.',
  },
  {
    id: 'shared-manager',
    label: 'Shared Manager workspace',
    route: '/app/manager-system',
    owner: 'Current shared Factory Floor manager account: ytf-manager',
    useWhen: 'Several real managers still need one simple shared entry and review account before named logins are split.',
    notFor: 'Sensitive user accountability, personal task ownership, or final long-term production identity.',
    dataWrites: ['daily entries', 'documents', 'action items', 'photos/evidence', 'candidate KPI review'],
    dataReads: ['simple manager rules', 'current tasks', 'document intake', 'Plant Manager feedback'],
    mobilePromise: 'The main phone-first workspace: short forms, few fields, upload evidence, then route the next move.',
  },
  {
    id: 'named-manager',
    label: 'Named Manager workspaces',
    route: '/app/daily-entry',
    owner: 'Next split: operations, maintenance, quality, admin/planning, sales/inventory, then individual users',
    useWhen: 'The shared manager workspace is working and the company is ready to measure person/team accountability cleanly.',
    notFor: 'The first rollout week if users still need training and the source data is still being normalized.',
    dataWrites: ['role-specific entry', 'department evidence', 'owned follow-up', 'training acknowledgements'],
    dataReads: ['role-specific checklist', 'department source files', 'action board', 'Plant Manager coaching'],
    mobilePromise: 'The target state for daily use: each role gets one compact phone workflow and one desktop review lane.',
  },
]

export const YTF_WORKSPACE_EVALUATIONS: Record<YtfWorkspaceId, YtfWorkspaceEvaluation> = {
  admin: {
    current: [
      'Tenant bootstrap, starter accounts, and runtime-control posture are working locally.',
      'Admin already sees rollout, module posture, connectors, agent/runtime signals, and data-fabric health.',
      'The platform now has a clear three-workspace product model instead of a route list.',
    ],
    missing: [
      'Direct cloud telemetry is still thinner than the local product surface.',
      'Real production deploys are currently blocked by Vercel upload/network instability from this environment.',
      'Role management still needs a cleaner named-user flow for live manager onboarding beyond pilot accounts.',
    ],
    next: [
      'Wire real Drive, Gmail, showroom, and head-office sources more deeply into the connector spine.',
      'Add stronger user-management, password reset, and role-specialization flows.',
      'Promote runtime, connector, and release posture into a true daily admin operating loop.',
    ],
  },
  plant: {
    current: [
      'Plant Manager already has a usable factory review loop with shift order, DQMS, operations, and data-fabric cues.',
      'Invisible ISO and owner-based closure are already embedded in the plant control logic.',
      'Root warehouse and data-fabric signals are already visible for cross-team review.',
    ],
    missing: [
      'More role-specific production, QC, receiving, and maintenance views still need to be split out for daily use.',
      'Shopfloor photo evidence and controlled attachment flow can still be more direct on phone.',
      'Line-level SPC, downtime drilldown, and release/lab quality routines still need deeper live data backing.',
    ],
    next: [
      'Add plant review packs by department: Production, QC, Stores, Maintenance, Commercial.',
      'Add richer photo-first incident, containment, and root-cause flows.',
      'Promote plant-level dashboards from seed-plus-signals into fully data-backed operational review.',
    ],
  },
  manager: {
    current: [
      'Manager Workspace is already the cleanest front door for daily entry, documents, action routing, and simple review.',
      'Writeback lanes already exist for incident, maintenance, receiving, KPI, training, audit, and document changes.',
      'The workspace already follows the hidden quality pattern: issue, owner, due, evidence, review.',
    ],
    missing: [
      'Dedicated mobile entry flows by department are still too generalized.',
      'Manager upload and capture should get even simpler for photos, voice, and controlled-document intake.',
      'A lighter role-aware coaching layer is still needed so managers know exactly which form to use without browsing.',
    ],
    next: [
      'Split manager entry into department-specific mobile forms with fewer fields.',
      'Add tighter photo upload, voice note, and quick evidence prompts.',
      'Add per-role daily checklists and training nudges based on usage gaps and missing data.',
    ],
  },
}

export const YTF_WORKSPACE_SCORECARDS: YtfWorkspaceScorecard[] = [
  {
    workspaceId: 'admin',
    label: 'Admin workspace',
    desktopScore: 88,
    mobileScore: 66,
    dataScore: 76,
    workflowScore: 82,
    verdict: 'Strong control-plane workspace. Needs durable storage and cleaner user provisioning before enterprise rollout.',
    gaps: [
      'Durable database must become mandatory for production history.',
      'Role splitting needs named-user onboarding, reset, and audit controls.',
      'Admin should show Drive sync freshness and cron outcome without needing developer tools.',
    ],
    nextTests: ['Verify module controls on phone', 'Verify cron/token health', 'Verify account split from ytf-manager into role logins'],
  },
  {
    workspaceId: 'plant',
    label: 'Plant Manager workspace',
    desktopScore: 86,
    mobileScore: 74,
    dataScore: 82,
    workflowScore: 88,
    verdict: 'Best executive factory surface now. Needs deeper drilldown and official KPI promotion discipline.',
    gaps: [
      'Cross-team view is strong, but individual line/press drilldown is still shallow.',
      'Candidate KPI queue exists, but official KPI ownership and review cadence must be enforced.',
      'Mobile review works, but plant meetings still benefit from wider screens.',
    ],
    nextTests: ['Run database manager from phone', 'Open KPI review after extraction', 'Close one candidate KPI and one action from the same review loop'],
  },
  {
    workspaceId: 'manager',
    label: 'Manager/shared manager workspace',
    desktopScore: 78,
    mobileScore: 84,
    dataScore: 72,
    workflowScore: 80,
    verdict: 'Right front door for simple daily use. Needs role-specific packs and lower-friction evidence capture.',
    gaps: [
      'One shared account is easy to start but weak for accountability.',
      'Daily Entry must become even more phone-native: camera, voice, fewer fields, stronger defaults.',
      'Department-specific manager packs should replace generic forms over time.',
    ],
    nextTests: ['Use manager route on phone width', 'Submit one issue with evidence', 'Confirm Plant Manager sees the routed work'],
  },
]

export const YTF_WORKSPACE_ERRC: YtfErrcItem[] = [
  {
    quadrant: 'Eliminate',
    title: 'Parallel hidden trackers',
    detail: 'Stop creating separate chat, folder, and spreadsheet queues for the same issue. One record should hold owner, due time, evidence, and status.',
  },
  {
    quadrant: 'Reduce',
    title: 'Manual dashboard building',
    detail: 'Reduce owner time spent opening files and making one-off reports by turning Drive changes into candidate KPIs, actions, and review prompts.',
  },
  {
    quadrant: 'Raise',
    title: 'Evidence quality and review cadence',
    detail: 'Raise the standard for every KPI and issue: source file, owner, scope, status, and human approval before official reporting.',
  },
  {
    quadrant: 'Create',
    title: 'Living file-owner collaboration',
    detail: 'Create an always-updating loop where the system detects file changes, extracts possible meaning, and asks the human owner to confirm, correct, or promote.',
  },
]

export const YTF_CONTINUOUS_LEARNING_LOOP: YtfContinuousLearningLoop[] = [
  {
    id: 'detect',
    title: 'Detect changed files',
    trigger: 'Drive file added, renamed, modified, moved, or newly shared from a PC/account folder.',
    humanRole: 'File owner keeps using their normal computer folders and Drive sharing pattern.',
    platformResponse: 'Change tracker refreshes the warehouse, records freshness, and flags new or risky source lanes.',
    output: 'Freshness signal, changed-lane action, and source lineage for audit.',
  },
  {
    id: 'extract',
    title: 'Extract candidate meaning',
    trigger: 'A changed file is a Sheet, XLSX, PDF, document, image-backed evidence, or folder bundle.',
    humanRole: 'Manager uploads or edits normally; no need to manually build a dashboard first.',
    platformResponse: 'Parser extracts metrics, likely KPI groups, action candidates, quality risk, and evidence links.',
    output: 'Candidate KPI rows, action items, DQMS hints, and evidence-backed summaries.',
  },
  {
    id: 'review',
    title: 'Human confirms truth',
    trigger: 'Candidate KPI, action, or incident appears in the review board.',
    humanRole: 'Manager/Plant Manager promotes, rejects, fixes owner/scope, or asks for more evidence.',
    platformResponse: 'Status, notes, source metadata, and audit trail update without losing the original evidence.',
    output: 'Official KPI, rejected noise, or follow-up task.',
  },
  {
    id: 'learn',
    title: 'Learn the workflow pattern',
    trigger: 'Repeated approvals, rejected noise, recurring folders, recurring defects, or missing fields.',
    humanRole: 'Owner keeps correcting the system in the flow of work.',
    platformResponse: 'Rules, defaults, prompts, role packs, and extraction heuristics improve around the real behavior.',
    output: 'Better defaults, cleaner forms, smarter routing, and fewer repeated manual decisions.',
  },
]

export const YTF_NEXT_BUILD_SEQUENCE = [
  {
    title: 'Durable operating database',
    why: 'Official KPI approvals, rejected rows, file-change history, and manager actions need production-grade persistence beyond serverless local storage.',
    nextStep: 'Wire state records into Postgres/Supabase/Cloud SQL or a managed SQL store, then migrate metric/actions/audit reads to the durable source.',
  },
  {
    title: 'Drive change monitor and owner brief',
    why: 'The system must know when a human changed files on their computer/Drive and convert that into a review packet.',
    nextStep: 'Run scheduled Drive delta sync, compare item fingerprints, and produce owner-specific change summaries.',
  },
  {
    title: 'RAG and entity graph over approved evidence',
    why: 'Internal chat should answer from approved KPIs, source files, people, departments, machines, product lines, and actions instead of generic memory.',
    nextStep: 'Chunk source previews, extract entities, store embeddings plus graph links, and cite source file evidence in chat.',
  },
  {
    title: 'Mobile-first manager capture',
    why: 'The adoption bottleneck is not dashboards; it is fast evidence capture by people doing the work.',
    nextStep: 'Build role-specific phone packs for production, QC, maintenance, admin/planning, and sales/inventory with camera/voice-friendly defaults.',
  },
] as const

export const YTF_PRODUCT_STACK: YtfStackItem[] = [
  {
    id: 'postgres-pgvector',
    name: 'Postgres + pgvector',
    category: 'Durable database and RAG',
    posture: 'Use now',
    why: 'Best next persistence layer for official KPIs, approvals, audit events, embeddings, and source-linked retrieval.',
    fit: 'Use as the durable operating database behind YTF instead of relying on serverless-local state.',
    href: 'https://github.com/pgvector/pgvector',
  },
  {
    id: 'duckdb',
    name: 'DuckDB',
    category: 'Local analytics mart',
    posture: 'Use now',
    why: 'Excellent for fast spreadsheet-heavy analysis, feature engineering, local marts, and repeatable notebook-style analytics.',
    fit: 'Use for offline/Colab-style exploration and batch KPI mart generation from exported Drive files.',
    href: 'https://github.com/duckdb/duckdb',
  },
  {
    id: 'evidence',
    name: 'Evidence.dev',
    category: 'Data storytelling',
    posture: 'Selective',
    why: 'Useful for turning SQL-backed metrics into readable narrative reports and client-facing data stories.',
    fit: 'Use for owner/board reports after the KPI mart is stable enough to publish.',
    href: 'https://github.com/evidence-dev/evidence',
  },
  {
    id: 'great-expectations',
    name: 'Great Expectations',
    category: 'Data quality',
    posture: 'Selective',
    why: 'Good for explicit data-quality rules when workbook extraction becomes critical to decisions.',
    fit: 'Use to validate official KPI tables, required columns, freshness, and outlier assumptions.',
    href: 'https://github.com/great-expectations/great_expectations',
  },
  {
    id: 'unstructured',
    name: 'Unstructured',
    category: 'Document extraction',
    posture: 'Selective',
    why: 'Helpful when PDFs, scans, docs, and mixed office files become a large part of the evidence base.',
    fit: 'Use for document chunks that need richer parsing before RAG/entity extraction.',
    href: 'https://github.com/Unstructured-IO/unstructured',
  },
  {
    id: 'openai-agents',
    name: 'OpenAI Agents SDK',
    category: 'Agent runtime',
    posture: 'Use now',
    why: 'Best fit for durable backend crews, guardrails, tracing, sessions, and human-in-the-loop on the current product direction.',
    fit: 'Use for backend agent teams that review entries, route tasks, summarize evidence, and hand work between desks.',
    href: 'https://github.com/openai/openai-agents-python',
  },
  {
    id: 'pydantic-ai',
    name: 'PydanticAI',
    category: 'Typed extraction',
    posture: 'Use now',
    why: 'Strong fit for structured extraction, validation, and typed workflows from messy factory files, emails, and forms.',
    fit: 'Use for document parsing, quality record extraction, supplier packet structuring, and controlled AI outputs.',
    href: 'https://github.com/pydantic/pydantic-ai',
  },
  {
    id: 'litellm',
    name: 'LiteLLM',
    category: 'Model gateway',
    posture: 'Use now',
    why: 'Good multi-provider routing and normalization layer when you want one product to use OpenAI, Gemini, or others without reworking every service.',
    fit: 'Use behind Model Ops and agent-runtime routing once production model diversity matters.',
    href: 'https://github.com/BerriAI/litellm',
  },
  {
    id: 'n8n',
    name: 'n8n',
    category: 'Automation bridge',
    posture: 'Use now',
    why: 'Fast bridge tool for Gmail, Sheets, Drive, approvals, and notification workflows while the native product continues to harden.',
    fit: 'Use for connector-side automations, alerts, escalations, and bridge workflows into the YTF platform.',
    href: 'https://github.com/n8n-io/n8n',
  },
  {
    id: 'appsheet',
    name: 'Google AppSheet',
    category: 'Mobile bridge',
    posture: 'Use now',
    why: 'Useful for fast field/mobile data entry on shared phones or lightweight manager workflows while native mobile UX keeps improving.',
    fit: 'Use as a bridge for high-friction mobile capture if a native YTF screen is not ready yet.',
    href: 'https://support.google.com/appsheet',
  },
  {
    id: 'temporal',
    name: 'Temporal',
    category: 'Durable workflows',
    posture: 'Later',
    why: 'Best when long-running industrial workflows, retries, approvals, and multi-day agent processes need stronger durable execution.',
    fit: 'Use later for deep production-grade orchestrations beyond the current app and queue loops.',
    href: 'https://github.com/temporalio/temporal',
  },
  {
    id: 'langgraph',
    name: 'LangGraph',
    category: 'Graph orchestration',
    posture: 'Selective',
    why: 'Powerful for explicit graph/state workflows, but should be introduced only where graph control adds value beyond the simpler current runtime.',
    fit: 'Use selectively for complex reasoning workflows or research-heavy agent graphs, not for every manager action.',
    href: 'https://github.com/langchain-ai/langgraph',
  },
  {
    id: 'metabase',
    name: 'Metabase',
    category: 'BI bridge',
    posture: 'Later',
    why: 'Useful if stakeholders need conventional BI exploration alongside the native YTF workspace.',
    fit: 'Use after durable SQL marts exist, not before the workflow layer is trusted.',
    href: 'https://github.com/metabase/metabase',
  },
] as const
