export type YtfAiStackStage = {
  id: string
  name: string
  purpose: string
  ytfUse: string
  status: 'live' | 'partial' | 'next'
  route: string
}

export type YtfAiCapabilityCluster = {
  id: string
  name: string
  skills: string[]
  technologies: string[]
  ytfOutcome: string
  route: string
}

export type YtfAiInfrastructureLayer = {
  id: string
  name: string
  current: string
  next: string
  risk: string
}

export type YtfAiOperatingAction = {
  id: string
  audience: string
  name: string
  action: string
  systemPath: string
  proof: string
  route: string
  status: 'live' | 'partial' | 'next'
}

export type YtfAiGovernanceControl = {
  id: string
  name: string
  risk: string
  control: string
  escalation: string
  route: string
}

export type YtfRecentAgentPlatformUpdate = {
  id: string
  platform: string
  update: string
  lesson: string
  ytfIntegration: string
  route: string
  status: 'live' | 'partial' | 'next'
}

export const ytfRecentAgentPlatformUpdates: YtfRecentAgentPlatformUpdate[] = [
  {
    id: 'gemini-enterprise-agent-governance',
    platform: 'Google Gemini Enterprise',
    update: 'Enterprise agents are moving toward one governed workplace front door with agents, connectors, security, and audit visibility in one platform.',
    lesson: 'Do not let YTF become a pile of separate bots. Agents need a shared control plane, route map, permissions, and audit posture.',
    ytfIntegration: 'Use Platform Admin, Connector Control, AI Stack, and Agent Ops as the local Gemini-Enterprise-style control plane for YTF agents.',
    route: '/app/platform-admin',
    status: 'partial',
  },
  {
    id: 'adk-a2a-agent-interoperability',
    platform: 'Google ADK / A2A',
    update: 'Code-first agent development, agent deployment/governance, and open agent-to-agent interoperability are becoming standard enterprise expectations.',
    lesson: 'YTF agent pods should publish clear input/output contracts instead of hidden prompt chains.',
    ytfIntegration: 'Treat Intake Router, Quality Watch, Supplier Recovery, Commercial Memory, Data Science, and CEO Brief as contract-based agent pods with handoffs.',
    route: '/app/workforce',
    status: 'partial',
  },
  {
    id: 'openai-agents-sdk-sandbox',
    platform: 'OpenAI Agents SDK',
    update: 'Agent runtimes now support model-native harnesses, controlled sandboxes, filesystem tools, MCP, skills, shell, patching, snapshots, and rehydration.',
    lesson: 'Long-running YTF agents should run in isolated workspaces with explicit mounted inputs, output folders, checkpoints, and no direct credential exposure.',
    ytfIntegration: 'Move heavy Drive extraction, workbook parsing, browser workflows, and code/data cleanup into sandboxed worker jobs behind approval gates.',
    route: '/app/runtime',
    status: 'next',
  },
  {
    id: 'mcp-connectors',
    platform: 'OpenAI Responses / MCP connectors',
    update: 'Remote MCP and managed connectors make Gmail, Google Drive, Calendar, SharePoint, and other tools usable as governed agent tools.',
    lesson: 'The YTF platform should expose its own narrow MCP-like tools for warehouse query, owner handoff, KPI candidate review, and writeback.',
    ytfIntegration: 'Keep Google Drive as the source pipeline now, then wrap YTF warehouse, Data Fabric, Action Board, and DQMS as safe tools for agents.',
    route: '/app/connectors',
    status: 'partial',
  },
  {
    id: 'agent-observability-evals',
    platform: 'Agent observability and evals',
    update: 'Production agent platforms are emphasizing trace capture, cost/performance analytics, evals, and automated improvement loops.',
    lesson: 'Every YTF agent action needs evidence, route, owner, result, cost/freshness posture, and review status.',
    ytfIntegration: 'Extend the evaluator and Agent Ops into recurring release checks for login, routes, Drive pipeline, graph, KPI candidates, and role handoffs.',
    route: '/app/evaluation',
    status: 'live',
  },
]

export const ytfRagRuntimeStages: YtfAiStackStage[] = [
  {
    id: 'input-guard',
    name: 'Input guard',
    purpose: 'Detect unsafe prompts, vague requests, and missing context before the AI acts.',
    ytfUse: 'Keep manager questions focused on Drive evidence, KPI review, ISO flow, and owner handoffs.',
    status: 'partial',
    route: '/app/change-monitor',
  },
  {
    id: 'memory-rewrite',
    name: 'Memory rewrite',
    purpose: 'Rewrite user questions into searchable operational language.',
    ytfUse: 'Map messy user wording to Factory Floor, QC, sales, inventory, planning, finance, maintenance, and admin lanes.',
    status: 'live',
    route: '/app/change-monitor',
  },
  {
    id: 'semantic-cache',
    name: 'Semantic cache',
    purpose: 'Reuse similar answers and reduce repeated expensive retrieval.',
    ytfUse: 'Cache repeated owner questions like newest Drive changes, official KPI candidates, and ISO gaps.',
    status: 'next',
    route: '/app/runtime',
  },
  {
    id: 'query-router',
    name: 'Query router',
    purpose: 'Classify the request and choose the correct retrieval path.',
    ytfUse: 'Route questions to production, DQMS, maintenance, sales, inventory, admin, or platform readiness.',
    status: 'live',
    route: '/app/data-fabric',
  },
  {
    id: 'hybrid-retrieval',
    name: 'Hybrid retrieval',
    purpose: 'Combine structured records, folder metadata, spreadsheets, and text chunks.',
    ytfUse: 'Use Drive warehouse rows, workbook metrics, owner briefs, and future chunks from SOP/PDF/doc files.',
    status: 'partial',
    route: '/app/data-fabric',
  },
  {
    id: 'reranker',
    name: 'Reranker',
    purpose: 'Sort retrieved evidence by relevance and operational risk.',
    ytfUse: 'Prioritize fresh, high-risk, workbook-heavy, shortcut-only, and owner-attention records.',
    status: 'partial',
    route: '/app/plant-manager',
  },
  {
    id: 'crag-grading',
    name: 'Retrieval grading',
    purpose: 'Grade whether the answer has enough evidence or needs re-retrieval.',
    ytfUse: 'Escalate weak answers into Action Board tasks instead of pretending the data is complete.',
    status: 'next',
    route: '/app/actions',
  },
  {
    id: 'citations',
    name: 'Citations and headers',
    purpose: 'Attach sources, owning desk, and entity names to every answer.',
    ytfUse: 'Show file/folder source, owner, route, risk, and next action so people can verify quickly.',
    status: 'live',
    route: '/app/change-monitor',
  },
  {
    id: 'output-guard',
    name: 'Output guard',
    purpose: 'Prevent unsupported claims, secret leakage, and fake precision.',
    ytfUse: 'Separate official KPIs from candidates and label missing external database persistence clearly.',
    status: 'partial',
    route: '/app/platform-admin',
  },
  {
    id: 'response',
    name: 'Response and trace',
    purpose: 'Return the answer, evidence, route, next move, and audit trace.',
    ytfUse: 'Convert questions into Plant Manager review, KPI promotion, daily entry, or action-board follow-up.',
    status: 'live',
    route: '/app/change-monitor',
  },
]

export const ytfOfflineDataPipelineStages: YtfAiStackStage[] = [
  {
    id: 'drive-ingest',
    name: 'Drive ingest',
    purpose: 'Watch Google Drive as the source of truth without forcing staff to change folders first.',
    ytfUse: 'Root folder, Factory Floor, Plant B, Showroom PC, and department lanes become canonical warehouse records.',
    status: 'live',
    route: '/app/change-monitor',
  },
  {
    id: 'format-detection',
    name: 'Format detection',
    purpose: 'Classify folders, shortcuts, Google Sheets, XLSX workbooks, PDFs, docs, images, and unknown files.',
    ytfUse: 'Separate preview-ready sheets, download-parser XLSX files, shortcut debt, and unsupported backlog.',
    status: 'live',
    route: '/app/data-fabric',
  },
  {
    id: 'extraction',
    name: 'Extraction',
    purpose: 'Extract rows, metrics, owner signals, and evidence metadata.',
    ytfUse: 'Save candidate KPIs, open actions, quality incidents, approvals, and workspace tasks.',
    status: 'live',
    route: '/app/intake',
  },
  {
    id: 'preprocessing',
    name: 'Preprocessing',
    purpose: 'Clean, normalize, de-duplicate, and score raw extracted records.',
    ytfUse: 'Normalize metric group, owner, source lane, period, status, and evidence link for review.',
    status: 'partial',
    route: '/app/intake',
  },
  {
    id: 'chunking',
    name: 'Chunking',
    purpose: 'Break documents and long sheets into retrievable source chunks.',
    ytfUse: 'Next pass for SOPs, QC records, claim docs, admin manuals, and planning sheets.',
    status: 'next',
    route: '/app/knowledge',
  },
  {
    id: 'embedding',
    name: 'Embedding',
    purpose: 'Create vector and keyword indexes for semantic search.',
    ytfUse: 'Next pass for full RAG over SOP, ISO, claims, production history, and maintenance notes.',
    status: 'next',
    route: '/app/knowledge',
  },
  {
    id: 'entity-graph',
    name: 'Knowledge graph',
    purpose: 'Link files, people, machines, products, dates, defects, actions, and KPIs into one operating graph.',
    ytfUse: 'Connect business records and manager entries to Factory Floor, QC, curing, mixing, tyre building, maintenance, sales, and finance context.',
    status: 'partial',
    route: '/app/knowledge',
  },
  {
    id: 'indexing',
    name: 'Indexing',
    purpose: 'Persist vector, keyword, entity, and metric indexes for fast retrieval.',
    ytfUse: 'Requires external Postgres/vector store or equivalent production database.',
    status: 'next',
    route: '/app/platform-admin',
  },
  {
    id: 'monitoring',
    name: 'Monitoring',
    purpose: 'Track freshness, failed extraction, stale owners, and review backlog.',
    ytfUse: 'Change Monitor shows changed lanes, owner briefs, KPI candidates, and open generated actions.',
    status: 'live',
    route: '/app/change-monitor',
  },
  {
    id: 'change-behavior',
    name: 'Change behavior',
    purpose: 'Track what changed, who owns it, which lane it belongs to, and whether it needs review.',
    ytfUse: 'Use record-change watch and owner handoffs to avoid stale data, hidden duplicate work, and unsupported KPI promotion.',
    status: 'live',
    route: '/app/change-monitor',
  },
]

export const ytfAiCapabilityClusters: YtfAiCapabilityCluster[] = [
  {
    id: 'agentic-ai',
    name: 'Agentic AI',
    skills: ['reasoning and planning', 'goal decomposition', 'tool orchestration', 'human review loops'],
    technologies: ['OpenAI API', 'FastAPI', 'scheduled jobs', 'workspace tools'],
    ytfOutcome: 'Turn new files and messy requests into owner briefs, actions, KPI review, and plant-manager follow-up.',
    route: '/app/workforce',
  },
  {
    id: 'rag-nlp',
    name: 'RAG and NLP',
    skills: ['text preprocessing', 'entity extraction', 'semantic retrieval', 'citations'],
    technologies: ['record warehouse', 'hybrid search', 'future vector index', 'knowledge graph'],
    ytfOutcome: 'Ask questions against Factory Client records, evidence, owner routes, quality gaps, and KPI candidates.',
    route: '/app/change-monitor',
  },
  {
    id: 'data-science',
    name: 'Data science and KPIs',
    skills: ['feature engineering', 'metric normalization', 'trend review', 'anomaly triage'],
    technologies: ['Sheets API', 'XLSX parser', 'SQLite bridge', 'future Postgres mart'],
    ytfOutcome: 'Promote production, DQMS, inventory, sales, finance, and maintenance data into official metrics.',
    route: '/app/intake',
  },
  {
    id: 'ai-governance',
    name: 'AI governance',
    skills: ['audit trail', 'approval gates', 'ISO evidence control', 'risk classification'],
    technologies: ['Action Board', 'DQMS', 'approvals', 'platform admin readiness'],
    ytfOutcome: 'Keep candidate data separate from official records and make ISO flow simple enough for daily use.',
    route: '/app/invisible-iso',
  },
  {
    id: 'computer-vision',
    name: 'Computer vision later',
    skills: ['image preprocessing', 'defect recognition', 'label review', 'visual QA'],
    technologies: ['phone upload', 'future CV model', 'DQMS image evidence', 'inspection workflow'],
    ytfOutcome: 'Future module for tyre defects, machine photos, shopfloor screenshots, and QC visual evidence.',
    route: '/app/dqms',
  },
  {
    id: 'ai-infra',
    name: 'AI infrastructure',
    skills: ['security', 'containerization', 'data services', 'observability', 'cost control'],
    technologies: ['Vercel', 'service account', 'cron', 'Postgres next', 'Sentry'],
    ytfOutcome: 'Keep the portal live while moving from local SQLite bridge to durable multi-user production persistence.',
    route: '/app/platform-admin',
  },
]

export const ytfAiInfrastructureLayers: YtfAiInfrastructureLayer[] = [
  {
    id: 'security',
    name: 'Security and compliance',
    current: 'Role login, controlled record access, candidate/official KPI separation, and visible readiness warnings.',
    next: 'Per-user accounts, audit review, least-privilege record scopes, and stronger output guards.',
    risk: 'Do not let AI-generated metrics become official without human promotion.',
  },
  {
    id: 'orchestration',
    name: 'Containerization and AI orchestration',
    current: 'FastAPI/Vercel runtime with scheduled data-manager endpoint and manual run buttons.',
    next: 'Queue-backed extraction workers, retry policy, and job-level trace visibility.',
    risk: 'Long spreadsheet runs need background jobs, not only request/response execution.',
  },
  {
    id: 'data-services',
    name: 'Integrated data services',
    current: 'Record warehouse, metric intake, enterprise metric mirror, action board, DQMS, and approvals.',
    next: 'Managed Postgres with vector extension or dedicated vector store.',
    risk: 'A shared production database connection is still required for true shared production persistence.',
  },
  {
    id: 'storage',
    name: 'High-performance storage',
    current: 'Business records remain the source of truth; local SQLite bridge stores extracted operating records.',
    next: 'Postgres for durable data, object storage for extraction artifacts, and indexed retrieval chunks.',
    risk: 'Local bridge is useful for rollout but not sufficient as the final enterprise database.',
  },
  {
    id: 'observability',
    name: 'Automation and management',
    current: 'Cron tokens, Sentry variables, ops notes, local smoke tests, and change monitor freshness.',
    next: 'Extraction failure dashboard, owner SLA tracking, cost meter, and RAG evaluation suite.',
    risk: 'Without evaluation, the assistant can feel smart while missing stale or unsupported data.',
  },
]

export const ytfAiOperatingActions: YtfAiOperatingAction[] = [
  {
    id: 'manager-record-once',
    audience: 'Manager',
    name: 'Record once',
    action: 'Open Daily Entry, pick the lane, enter the shift note, and attach evidence when there is a photo or document.',
    systemPath: 'The platform turns it into owner context, ISO evidence, KPI candidates, and next actions.',
    proof: 'Entry time, owner, lane, evidence attachment, and routed action are visible after save.',
    route: '/app/daily-entry',
    status: 'live',
  },
  {
    id: 'plant-manager-review',
    audience: 'Plant Manager',
    name: 'Review the changes',
    action: 'Open Change Monitor or Plant Manager and check record updates, risky lanes, KPI candidates, and owner handoffs.',
    systemPath: 'The system ranks fresh record changes, routes them by department, and labels what needs human decision.',
    proof: 'Change watch, owner handoff, and KPI candidate counts move as the data changes.',
    route: '/app/change-monitor',
    status: 'live',
  },
  {
    id: 'admin-harden-runtime',
    audience: 'Admin',
    name: 'Harden the runtime',
    action: 'Open Platform Admin and fix production database, account policy, cron secrets, and connector readiness.',
    systemPath: 'The cloud layer moves from temporary local storage to shared production state, jobs, traces, and audit history.',
    proof: 'Readiness warnings should disappear only after durable storage and env checks pass.',
    route: '/app/platform-admin',
    status: 'partial',
  },
  {
    id: 'agent-operator-run-loop',
    audience: 'Agent operator',
    name: 'Run and inspect loops',
    action: 'Open Agent Ops, run overdue loops, and review evidence before granting more autonomy.',
    systemPath: 'Agent jobs create summaries, actions, briefs, and escalation packets with bounded write scope.',
    proof: 'Recent outcomes, evidence ledger, approval gates, and runtime contract show what happened.',
    route: '/app/teams',
    status: 'partial',
  },
]

export const ytfAiGovernanceControls: YtfAiGovernanceControl[] = [
  {
    id: 'source-citation',
    name: 'Cited answers',
    risk: 'AI gives a confident answer without showing which Drive file, entry, or workbook supports it.',
    control: 'Every operating answer must carry source, owner, date, route, and confidence state.',
    escalation: 'If source is missing, create a review task instead of presenting it as official.',
    route: '/app/change-monitor',
  },
  {
    id: 'human-promotion',
    name: 'Human promotion',
    risk: 'Candidate metrics become official KPIs before a manager checks the definition.',
    control: 'Separate candidate, reviewed, and official records in KPI and ISO workflows.',
    escalation: 'Plant Manager or Admin promotes only after definition, owner, and data source are clear.',
    route: '/app/plant-manager',
  },
  {
    id: 'least-privilege',
    name: 'Least privilege',
    risk: 'One role sees or edits finance, HR, quality, and production data without boundaries.',
    control: 'Role capabilities decide which workspaces, tools, and write actions are visible.',
    escalation: 'Admin fixes account capability before expanding manager-specific workspaces.',
    route: '/app/platform-admin',
  },
  {
    id: 'runtime-trace',
    name: 'Runtime trace',
    risk: 'Autonomous jobs run but nobody can inspect why the output changed.',
    control: 'Each job records trigger, source, summary, status, approval gate, and next action.',
    escalation: 'Failed, stale, or unsupported runs stay in Agent Ops until reviewed.',
    route: '/app/teams',
  },
]

export function getYtfAiStackReadiness() {
  const allStages = [...ytfRagRuntimeStages, ...ytfOfflineDataPipelineStages]
  const live = allStages.filter((item) => item.status === 'live').length
  const partial = allStages.filter((item) => item.status === 'partial').length
  const next = allStages.filter((item) => item.status === 'next').length

  return {
    stageCount: allStages.length,
    live,
    partial,
    next,
    readinessScore: Math.round(((live + partial * 0.5) / allStages.length) * 100),
  }
}
