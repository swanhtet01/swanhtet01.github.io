export type AgentToolDefinition = {
  id: string
  name: string
  category: 'Connector' | 'Workspace' | 'Knowledge' | 'Control'
  purpose: string
}

export type AgentToolAccess = {
  toolId: string
  mode: 'Read' | 'Write' | 'Review' | 'Admin'
  scope: string
}

export type AgentKpi = {
  name: string
  target: string
}

export type AgentPlaybook = {
  id: string
  teamId?: string
  name: string
  workspace: string
  leadRole: string
  mission: string
  outputs: string[]
  cadence: string[]
  tools: AgentToolAccess[]
  instructions: string[]
  escalateWhen: string[]
  writePolicy: string
  kpis: AgentKpi[]
}

export type AgentOperatingModel = {
  version?: string
  tenantKey: 'default' | 'ytf-plant-a'
  title: string
  summary: string
  managerMoves: string[]
  tools: AgentToolDefinition[]
  playbooks: AgentPlaybook[]
}

const SUPERMEGA_AGENT_MODEL: AgentOperatingModel = {
  version: 'v2',
  tenantKey: 'default',
  title: 'SUPERMEGA.dev operating pods',
  summary: 'Shared pods that sell, launch, observe, and scale the core product and new tenant rollouts.',
  managerMoves: [
    'Keep one named owner on every tenant rollout, connector scope, and release decision.',
    'Approve only high-risk writes; everything else should stay inside bounded playbooks.',
    'Review runtime health, open escalations, and launch blockers every day from one control surface.',
  ],
  tools: [
    { id: 'gmail', name: 'Gmail', category: 'Connector', purpose: 'Watch rollout mailboxes, customer replies, and draft operator follow-up.' },
    { id: 'google-drive', name: 'Google Drive', category: 'Connector', purpose: 'Index files, sheets, and rollout bundles that feed product and tenant memory.' },
    { id: 'google-calendar', name: 'Google Calendar', category: 'Connector', purpose: 'Tie rollout reviews, sales meetings, and check-ins to live work.' },
    { id: 'github', name: 'GitHub', category: 'Connector', purpose: 'Track code changes, release readiness, and implementation backlog.' },
    { id: 'sentry', name: 'Sentry', category: 'Connector', purpose: 'Surface production failures and route them into runtime or product ops.' },
    { id: 'platform-admin', name: 'Platform Admin', category: 'Control', purpose: 'Own tenant setup, role scope, and rollout posture.' },
    { id: 'runtime-desk', name: 'Runtime Desk', category: 'Control', purpose: 'Monitor sync freshness, job health, and policy drift.' },
    { id: 'solution-architect', name: 'Solution Architect', category: 'Control', purpose: 'Map a client into modules, roles, and rollout order.' },
    { id: 'agent-ops', name: 'Agent Ops', category: 'Workspace', purpose: 'Run jobs, review outcomes, and manage operator access.' },
    { id: 'knowledge-runtime', name: 'Knowledge Runtime', category: 'Knowledge', purpose: 'Keep canonical documents, entities, and provenance usable by product teams and agents.' },
  ],
  playbooks: [
    {
      id: 'tenant-launch',
      name: 'Client Onboarding Pod',
      workspace: 'core-platform/provisioning',
      leadRole: 'Implementation Lead',
      mission: 'Turn one client blueprint into a live tenant with the right modules, roles, domain, and starter data.',
      outputs: ['tenant setup checklist', 'module map', 'role map', 'launch blocker list'],
      cadence: ['new tenant kickoff', 'daily rollout review', 'pre-launch validation'],
      tools: [
        { toolId: 'solution-architect', mode: 'Admin', scope: 'module and role blueprint' },
        { toolId: 'platform-admin', mode: 'Admin', scope: 'tenant, domain, and module posture' },
        { toolId: 'google-drive', mode: 'Read', scope: 'client files and rollout bundles' },
        { toolId: 'github', mode: 'Review', scope: 'implementation backlog and release scope' },
      ],
      instructions: [
        'Start from one live workflow, not the full transformation.',
        'Map current files, inboxes, exports, and human owners before enabling automations.',
        'Keep launch blockers visible until each one has a human owner.',
      ],
      escalateWhen: [
        'The tenant needs a new data model or connector scope not covered by the product base.',
        'A role boundary or domain setup decision affects security or billing.',
        'Launch requires custom code instead of configuration.',
      ],
      writePolicy: 'Tenant setup and domain changes are allowed only after implementation-lead or platform-admin review.',
      kpis: [
        { name: 'time to first live workflow', target: 'under 14 days for a standard rollout' },
        { name: 'launch blocker age', target: 'no blocker unresolved beyond 48 hours' },
      ],
    },
    {
      id: 'connector-reliability',
      name: 'Connector Reliability Pod',
      workspace: 'core-platform/connectors',
      leadRole: 'Platform Admin',
      mission: 'Keep Gmail, Drive, Calendar, and tenant data feeds fresh enough for agents and operators to trust.',
      outputs: ['stale-source alerts', 'retry decisions', 'connector health digest'],
      cadence: ['15-minute sync watch', 'daily connector review'],
      tools: [
        { toolId: 'gmail', mode: 'Review', scope: 'connector-linked inbox tests' },
        { toolId: 'google-drive', mode: 'Review', scope: 'file index freshness and sheet publishing' },
        { toolId: 'google-calendar', mode: 'Review', scope: 'calendar sync coverage' },
        { toolId: 'runtime-desk', mode: 'Admin', scope: 'sync freshness and job failures' },
        { toolId: 'sentry', mode: 'Review', scope: 'connector and runtime incidents' },
      ],
      instructions: [
        'Treat stale or partial sync as a production issue, not a cosmetic issue.',
        'Keep source-level provenance attached to every retry and repair decision.',
        'Prioritize the connectors that block live customer workflows first.',
      ],
      escalateWhen: [
        'A connector requires broader OAuth scope, credential rotation, or source-owner approval.',
        'Data freshness drops below the workflow’s required cadence.',
        'A broken sync affects more than one tenant or one critical client workspace.',
      ],
      writePolicy: 'Connector retries are allowed automatically; scope changes and credential changes require platform-admin approval.',
      kpis: [
        { name: 'critical connector freshness', target: 'no critical feed stale beyond one cadence window' },
        { name: 'incident recovery time', target: 'critical sync failures triaged within 30 minutes' },
      ],
    },
    {
      id: 'knowledge-graph',
      name: 'Knowledge Graph Pod',
      workspace: 'core-platform/knowledge',
      leadRole: 'Implementation Lead',
      mission: 'Turn files, sheets, notes, and messages into canonical business memory with provenance.',
      outputs: ['entity and relation candidates', 'document canon updates', 'knowledge quality review'],
      cadence: ['document ingest', 'daily relation repair', 'weekly knowledge review'],
      tools: [
        { toolId: 'google-drive', mode: 'Read', scope: 'files, sheets, and markdown bundles' },
        { toolId: 'knowledge-runtime', mode: 'Admin', scope: 'documents, entities, relations, provenance' },
        { toolId: 'agent-ops', mode: 'Review', scope: 'knowledge jobs and reviewer assignments' },
      ],
      instructions: [
        'Every extracted fact needs a source link that a human can inspect.',
        'Prefer canonical business entities over folder-level summaries.',
        'Do not publish schema changes into tenant workspaces without review.',
      ],
      escalateWhen: [
        'A knowledge rule changes the meaning of commercial, financial, or quality records.',
        'Entity extraction quality drops below reviewer trust.',
        'A tenant needs a new domain schema that affects several modules.',
      ],
      writePolicy: 'Knowledge writes are allowed for candidate records; canonical publishing requires reviewer approval when schema or trust boundaries change.',
      kpis: [
        { name: 'source-linked records', target: '100 percent of published knowledge records retain provenance' },
        { name: 'reviewer acceptance', target: 'over 85 percent accepted without rework' },
      ],
    },
    {
      id: 'runtime-safety',
      name: 'Runtime Safety Pod',
      workspace: 'core-platform/runtime',
      leadRole: 'Platform Admin',
      mission: 'Keep agent jobs bounded, observable, and safe enough to scale across client workspaces.',
      outputs: ['runtime health board', 'autonomy guardrail updates', 'escalation queue'],
      cadence: ['continuous monitoring', 'daily batch review', 'weekly policy review'],
      tools: [
        { toolId: 'agent-ops', mode: 'Admin', scope: 'job runs, members, and manual recovery' },
        { toolId: 'runtime-desk', mode: 'Admin', scope: 'runtime posture and policy drift' },
        { toolId: 'sentry', mode: 'Review', scope: 'production failures and runtime regressions' },
        { toolId: 'platform-admin', mode: 'Review', scope: 'tenant posture and unsafe rollout pressure' },
      ],
      instructions: [
        'Move work into scheduled loops only when the failure mode and approval gate are visible.',
        'Every autonomous write path needs a human rollback path.',
        'Treat repeated manual recovery as a design bug, not an operator job.',
      ],
      escalateWhen: [
        'An agent writes across tenant or security boundaries.',
        'A job repeatedly fails or goes stale beyond its approved cadence.',
        'A rollout depends on automations that do not have clear review gates.',
      ],
      writePolicy: 'Runtime jobs may run automatically inside existing guardrails; guardrail changes require platform-admin approval.',
      kpis: [
        { name: 'stale core loops', target: 'zero stale core loops at daily review' },
        { name: 'manual recovery pressure', target: 'down week over week' },
      ],
    },
    {
      id: 'growth-proof',
      name: 'Revenue Pod',
      workspace: 'core-platform/growth',
      leadRole: 'Owner',
      mission: 'Turn live products, case studies, and outreach into qualified rollout demand.',
      outputs: ['account shortlist', 'proof packs', 'qualified rollout requests'],
      cadence: ['daily prospect refresh', 'weekly proof review'],
      tools: [
        { toolId: 'gmail', mode: 'Review', scope: 'pilot follow-up and outbound drafts' },
        { toolId: 'google-drive', mode: 'Read', scope: 'case-study assets and rollout collateral' },
        { toolId: 'github', mode: 'Review', scope: 'release readiness for proof-worthy surfaces' },
      ],
      instructions: [
        'Lead with one real product and one concrete customer problem.',
        'Do not sell internal architecture as if it were customer value.',
        'Keep proof tied to working screens, rollout outcomes, and customer context.',
      ],
      escalateWhen: [
        'The site promises a feature that is not production-ready.',
        'A customer request requires a new rollout pattern or unsupported integration.',
        'Demand is blocked by product gaps rather than messaging gaps.',
      ],
      writePolicy: 'Drafting and proof-pack updates are allowed; public claims about enterprise readiness require owner review.',
      kpis: [
        { name: 'qualified rollout requests', target: 'increase month over month' },
        { name: 'time from proof to contact', target: 'shorter each release cycle' },
      ],
    },
  ],
}

const YTF_AGENT_MODEL: AgentOperatingModel = {
  version: 'v2',
  tenantKey: 'ytf-plant-a',
  title: 'Yangon Tyre tenant crews',
  summary: 'Tenant-scoped agent teams for sales, receiving, supplier recovery, quality, maintenance, data science, and the CEO brief.',
  managerMoves: [
    'Name one human owner for every queue, exception, and agent escalation.',
    'Keep Gmail, Drive, ERP extracts, and human entry mapped to the same operating records.',
    'Approve only sensitive writes and cross-functional decisions; keep routine prep autonomous.',
  ],
  tools: [
    { id: 'sales-gmail', name: 'Sales Gmail', category: 'Connector', purpose: 'Read dealer communication, quotes, and follow-up context.' },
    { id: 'procurement-gmail', name: 'Procurement Gmail', category: 'Connector', purpose: 'Track supplier replies, missing documents, and discrepancy follow-up.' },
    { id: 'drive-ops', name: 'Plant Google Drive', category: 'Connector', purpose: 'Index receiving docs, quality files, maintenance sheets, and shared reports.' },
    { id: 'calendar-review', name: 'Google Calendar', category: 'Connector', purpose: 'Tie visits, plant reviews, and follow-up meetings back to live work.' },
    { id: 'erp-extracts', name: 'ERP Extract Feed', category: 'Connector', purpose: 'Bring PO, GRN, stock, and invoice state into the tenant runtime.' },
    { id: 'human-entry', name: 'Structured Human Entry', category: 'Workspace', purpose: 'Capture inspection, CAPA, maintenance, supplier, and account reviews cleanly.' },
    { id: 'sales-crm', name: 'Sales CRM', category: 'Workspace', purpose: 'Keep dealer accounts, quote follow-up, and commercial context in one place.' },
    { id: 'operations-control', name: 'Operations Control', category: 'Workspace', purpose: 'Own plant action queues, inbound blockers, and shift follow-up.' },
    { id: 'receiving-control', name: 'Receiving Control', category: 'Workspace', purpose: 'Run GRN mismatch, hold, shortage, and next-action workflows.' },
    { id: 'dqms', name: 'DQMS and Quality Methods', category: 'Workspace', purpose: 'Structure incidents, 5W1H, Ishikawa, CAPA, and closeout work.' },
    { id: 'maintenance-control', name: 'Maintenance Control', category: 'Workspace', purpose: 'Track breakdowns, PM work, spare parts, and repeat-failure follow-up.' },
    { id: 'manufacturing-command', name: 'Manufacturing Command', category: 'Workspace', purpose: 'Model line flow, genealogy, drift, and shift-level manufacturing control.' },
    { id: 'lab-release', name: 'Lab SPC and Release', category: 'Workspace', purpose: 'Track compound release, test limits, SPC drift, and finished release logic.' },
    { id: 'approvals', name: 'Supplier and Approval Control', category: 'Workspace', purpose: 'Review supplier exposure, evidence debt, and approval thresholds.' },
    { id: 'director', name: 'CEO Command Center', category: 'Control', purpose: 'Condense risk, sales, plant, and runtime posture into one review surface.' },
    { id: 'app-foundry', name: 'Tenant App Foundry', category: 'Control', purpose: 'Design and refine each tenant app from job flows, roles, records, and AI workforce boundaries.' },
    { id: 'experience-evals', name: 'Experience Evals', category: 'Control', purpose: 'Measure entry friction, clarity, and recovery quality before an app or workflow is promoted.' },
    { id: 'knowledge-runtime', name: 'Knowledge Graph and SOP Vault', category: 'Knowledge', purpose: 'Attach files, notes, SOPs, entities, and decisions to the same company memory.' },
    { id: 'insights', name: 'Operating Intelligence Studio', category: 'Control', purpose: 'Run cleaned datasets, forecasts, KPI gaps, and scenario scoring.' },
  ],
  playbooks: [
    {
      id: 'intake-router',
      name: 'Intake Router Pod',
      workspace: 'ytf/inbox-router',
      leadRole: 'Admin',
      mission: 'Classify inbound email, file, and manual-entry items into the correct module and owner before work gets lost.',
      outputs: ['triaged task', 'document classification', 'owner suggestion', 'stale intake alert'],
      cadence: ['mailbox scan', 'folder scan', 'same-day stale intake sweep'],
      tools: [
        { toolId: 'procurement-gmail', mode: 'Read', scope: 'supplier and inbound mail metadata' },
        { toolId: 'drive-ops', mode: 'Read', scope: 'new files and folders' },
        { toolId: 'human-entry', mode: 'Review', scope: 'manual submissions and intake forms' },
        { toolId: 'operations-control', mode: 'Write', scope: 'task proposals and owner routing' },
      ],
      instructions: [
        'Route every inbound item to one owner and one module first.',
        'Prefer creating a clear task over leaving a raw document in a folder.',
        'If the source is ambiguous, assign human review instead of guessing a high-risk route.',
      ],
      escalateWhen: [
        'The item touches several modules or lacks a clear business owner.',
        'The inbound item implies external communication or supplier scoring.',
        'A new file pattern does not fit the current routing rules.',
      ],
      writePolicy: 'Task drafts and classifications are allowed; cross-module publication and external communication require human review.',
      kpis: [
        { name: 'time to route new intake', target: 'same shift' },
        { name: 'unowned intake rows', target: 'zero by daily review' },
      ],
    },
    {
      id: 'commercial-memory',
      name: 'Commercial Memory Pod',
      workspace: 'ytf/commercial',
      leadRole: 'Sales',
      mission: 'Keep dealer accounts, quote follow-up, and commercial history consistent across Gmail, calendar, and CRM.',
      outputs: ['account update draft', 'follow-up draft', 'commercial risk tag', 'visit reminder'],
      cadence: ['daily follow-up refresh', 'weekly account review'],
      tools: [
        { toolId: 'sales-gmail', mode: 'Read', scope: 'dealer and quote threads' },
        { toolId: 'calendar-review', mode: 'Read', scope: 'visit plans and meeting-linked notes' },
        { toolId: 'sales-crm', mode: 'Write', scope: 'account notes, stages, and next actions' },
        { toolId: 'director', mode: 'Review', scope: 'commercial risk brief' },
      ],
      instructions: [
        'Keep one clean account record per dealer or distributor.',
        'Attach every next step to an owner and date, not just a note.',
        'Treat credit-sensitive changes as finance-reviewed decisions.',
      ],
      escalateWhen: [
        'Credit exposure, pricing, or collection risk changes materially.',
        'Commercial context conflicts across Gmail, calendar, and CRM.',
        'A priority account has no next step or owner.',
      ],
      writePolicy: 'Routine follow-up and account updates are allowed; credit-sensitive or director-facing changes require finance or CEO review.',
      kpis: [
        { name: 'accounts with next step', target: '100 percent of active priority accounts' },
        { name: 'stale follow-up', target: 'none older than one review cycle' },
      ],
    },
    {
      id: 'supplier-recovery',
      name: 'Supplier Recovery Pod',
      workspace: 'ytf/procurement',
      leadRole: 'Procurement',
      mission: 'Chase missing documents, delayed replies, and unresolved supplier discrepancies before they age into plant blockers.',
      outputs: ['document request task', 'supplier follow-up draft', 'delay ranking', 'approval escalation'],
      cadence: ['missing-doc sweep', 'daily delay ranking', 'supplier digest'],
      tools: [
        { toolId: 'procurement-gmail', mode: 'Read', scope: 'supplier threads and evidence chase' },
        { toolId: 'drive-ops', mode: 'Read', scope: 'PO and evidence files' },
        { toolId: 'approvals', mode: 'Write', scope: 'discrepancy tasks and escalation proposals' },
        { toolId: 'erp-extracts', mode: 'Review', scope: 'PO, GRN, and invoice state' },
      ],
      instructions: [
        'Tie every discrepancy back to a shipment, PO, or receipt record.',
        'Separate missing evidence from true supplier delay so recovery work is specific.',
        'Escalate only the items that affect finance, supply continuity, or management review.',
      ],
      escalateWhen: [
        'A discrepancy affects finance thresholds or plant continuity.',
        'A supplier remains unresolved past the agreed recovery window.',
        'Evidence gaps block an approval or payment decision.',
      ],
      writePolicy: 'Recovery tasks and draft reminders are allowed; supplier escalation that changes scorecards or finance posture requires procurement-lead review.',
      kpis: [
        { name: 'aged supplier discrepancies', target: 'down every week' },
        { name: 'missing evidence closure', target: 'same week for priority items' },
      ],
    },
    {
      id: 'operations-reliability',
      name: 'Operations and Reliability Pod',
      workspace: 'ytf/ops-reliability',
      leadRole: 'Operations',
      mission: 'Turn shift notes, receiving issues, maintenance logs, and repeat blockers into owned follow-up work.',
      outputs: ['shift digest', 'repeat-failure tag', '5W1H draft', 'owner suggestion'],
      cadence: ['shift digest', 'repeat-failure watch', 'daily blocker review'],
      tools: [
        { toolId: 'operations-control', mode: 'Write', scope: 'queue shaping and owner suggestions' },
        { toolId: 'receiving-control', mode: 'Read', scope: 'GRN gaps, holds, shortages' },
        { toolId: 'maintenance-control', mode: 'Read', scope: 'breakdowns and PM logs' },
        { toolId: 'human-entry', mode: 'Review', scope: 'shift notes and operating forms' },
      ],
      instructions: [
        'Convert raw shift reporting into one clear next action per issue.',
        'Flag repeat failures and recurring plant blockers instead of reopening them as new noise.',
        'Keep receiving and maintenance context attached to the same operating record when possible.',
      ],
      escalateWhen: [
        'A repeat failure crosses shifts without a root-cause owner.',
        'A receiving issue blocks production or a senior approval.',
        'A plant blocker needs quality, maintenance, and operations review together.',
      ],
      writePolicy: 'Task shaping and draft follow-up are allowed; published root-cause tags and cross-functional escalations require manager review.',
      kpis: [
        { name: 'unowned plant blockers', target: 'zero by daily meeting' },
        { name: 'repeat failures without root-cause owner', target: 'zero' },
      ],
    },
    {
      id: 'manufacturing-genealogy',
      name: 'Manufacturing Genealogy Pod',
      workspace: 'ytf/factory',
      leadRole: 'Operations',
      mission: 'Connect raw material, compound, line stage, machine, batch, and finished-tyre history into one traceable manufacturing operating record.',
      outputs: ['traceability pack', 'drift alert', 'repeat-batch tag', 'stage genealogy view'],
      cadence: ['genealogy refresh', 'shift drift watch', 'batch trace pack'],
      tools: [
        { toolId: 'erp-extracts', mode: 'Read', scope: 'batch, lot, and production extracts' },
        { toolId: 'manufacturing-command', mode: 'Write', scope: 'stage flow, genealogy, and drift views' },
        { toolId: 'lab-release', mode: 'Read', scope: 'compound release, test limits, and release state' },
        { toolId: 'dqms', mode: 'Read', scope: 'quality incident links and defect context' },
      ],
      instructions: [
        'Prefer evidence-linked genealogy over broad process guesses.',
        'Track the path from raw material and compound into machine stage and finished batch.',
        'Publish drift alerts only when the batch, stage, and source signal are all visible.',
      ],
      escalateWhen: [
        'A genealogy gap blocks containment or release decisions.',
        'Several incidents appear to share the same stage, batch family, or equipment pattern.',
        'A traceability conclusion would change supplier, quality, or management action.',
      ],
      writePolicy: 'Trace packs and drift drafts are allowed; batch-containment or supplier-affecting classifications require plant or quality review.',
      kpis: [
        { name: 'batches with traceable lineage', target: 'increase every rollout cycle' },
        { name: 'major incidents with genealogy pack', target: '100 percent' },
      ],
    },
    {
      id: 'quality-watch',
      name: 'Quality Watch Pod',
      workspace: 'ytf/quality',
      leadRole: 'Quality / QC',
      mission: 'Turn incidents, evidence, and closeout work into structured DQMS records with usable root-cause preparation.',
      outputs: ['incident draft', 'CAPA starter', 'Ishikawa starter', 'closeout reminder'],
      cadence: ['incident match', 'CAPA prep', 'stale closeout watch'],
      tools: [
        { toolId: 'dqms', mode: 'Write', scope: 'incident and CAPA draft records' },
        { toolId: 'drive-ops', mode: 'Read', scope: 'quality evidence and inspection files' },
        { toolId: 'human-entry', mode: 'Review', scope: 'incident intake and closeout forms' },
        { toolId: 'knowledge-runtime', mode: 'Write', scope: 'knowledge suggestions and SOP links' },
      ],
      instructions: [
        'Every serious quality issue needs containment, owner, and evidence before closeout.',
        'Use 5W1H and Ishikawa as working structures, not after-the-fact paperwork.',
        'Link incidents back to lot, batch, supplier, or asset whenever possible.',
      ],
      escalateWhen: [
        'An incident affects customer status, supplier status, or major management review.',
        'Closeout lacks evidence or root-cause ownership.',
        'A quality issue appears to be recurring across several lots, machines, or suppliers.',
      ],
      writePolicy: 'Draft incidents and knowledge suggestions are allowed; published classifications that affect commercial or supplier posture require quality-manager review.',
      kpis: [
        { name: 'stale CAPA items', target: 'down each weekly review' },
        { name: 'major incidents with evidence attached', target: '100 percent' },
      ],
    },
    {
      id: 'tenant-app-foundry',
      name: 'Tenant App Foundry Pod',
      workspace: 'ytf/foundry',
      leadRole: 'Admin',
      mission: 'Design each Yangon Tyre app as an AI-native remake of successful SaaS: role home, core record, workflow contract, and bounded agent crew.',
      outputs: ['app brief', 'role-home spec', 'entry contract', 'agent crew proposal'],
      cadence: ['module benchmark', 'weekly app review', 'release candidate check'],
      tools: [
        { toolId: 'app-foundry', mode: 'Admin', scope: 'app briefs, benchmark map, and release posture' },
        { toolId: 'sales-crm', mode: 'Review', scope: 'commercial workflow shape' },
        { toolId: 'operations-control', mode: 'Review', scope: 'plant workflow shape' },
        { toolId: 'dqms', mode: 'Review', scope: 'quality workflow shape' },
        { toolId: 'maintenance-control', mode: 'Review', scope: 'reliability workflow shape' },
        { toolId: 'director', mode: 'Review', scope: 'executive workflow shape' },
      ],
      instructions: [
        'Start from the operator job and core record, not from the menu or the dashboard.',
        'Copy the winning workflow shape from strong SaaS, then simplify it around shared records and AI preparation.',
        'Do not promote an app until the role home, entry path, and escalation path are all clear.',
      ],
      escalateWhen: [
        'A new module needs schema or connector changes beyond the current tenant runtime.',
        'The workflow contract conflicts with actual daily use or manager review cadence.',
        'The app would introduce duplicate entry against an existing live lane.',
      ],
      writePolicy: 'App briefs and UX contracts are allowed; live module promotion requires admin or director review.',
      kpis: [
        { name: 'apps with approved role-home spec', target: 'all active tenant apps' },
        { name: 'modules promoted without duplicate entry', target: '100 percent' },
      ],
    },
    {
      id: 'data-science',
      name: 'Data Science Pod',
      workspace: 'ytf/data-science',
      leadRole: 'Admin',
      mission: 'Clean tenant data, engineer features, and generate advisory KPI, forecast, and gap-analysis signals for managers and CEO review.',
      outputs: ['clean dataset', 'feature refresh', 'forecast brief', 'gap-analysis pack'],
      cadence: ['dataset cleanup', 'feature refresh', 'weekly forecast run'],
      tools: [
        { toolId: 'erp-extracts', mode: 'Read', scope: 'PO, stock, invoice, and operating snapshots' },
        { toolId: 'sales-crm', mode: 'Read', scope: 'commercial pipeline and account signals' },
        { toolId: 'knowledge-runtime', mode: 'Read', scope: 'entity-linked operating context' },
        { toolId: 'insights', mode: 'Write', scope: 'forecast and KPI-gap outputs' },
        { toolId: 'director', mode: 'Review', scope: 'leadership-ready operating signals' },
      ],
      instructions: [
        'Treat model output as advisory until a manager accepts it into live decisions.',
        'Keep feature freshness visible so stale signals do not look authoritative.',
        'Prefer explainable KPI and gap packs over black-box rankings.',
      ],
      escalateWhen: [
        'A model suggests a decision that conflicts with current operating evidence.',
        'Dataset quality drops below the agreed management threshold.',
        'A forecast or risk flag would trigger commercial, finance, or plant interventions.',
      ],
      writePolicy: 'Prepared datasets and advisory signals are allowed; live decision changes require CEO or admin review.',
      kpis: [
        { name: 'freshness of managed feature sets', target: 'within agreed review cadence' },
        { name: 'management acceptance of advisory packs', target: 'improve every review cycle' },
      ],
    },
    {
      id: 'experience-assurance',
      name: 'Experience Assurance Pod',
      workspace: 'ytf/ux-evals',
      leadRole: 'Admin',
      mission: 'Review every live app for data-entry friction, screen clarity, operator speed, and recovery quality before broader rollout.',
      outputs: ['ux defect list', 'entry-friction report', 'training gaps', 'release recommendation'],
      cadence: ['weekly usability pass', 'pre-release review', 'adoption recovery sweep'],
      tools: [
        { toolId: 'experience-evals', mode: 'Admin', scope: 'eval criteria and release recommendation' },
        { toolId: 'human-entry', mode: 'Review', scope: 'entry forms and user friction points' },
        { toolId: 'sales-crm', mode: 'Review', scope: 'commercial path clarity' },
        { toolId: 'operations-control', mode: 'Review', scope: 'plant path clarity' },
        { toolId: 'dqms', mode: 'Review', scope: 'quality path clarity' },
        { toolId: 'maintenance-control', mode: 'Review', scope: 'maintenance path clarity' },
      ],
      instructions: [
        'Treat repeated user confusion as a product defect, not a training failure.',
        'Measure how quickly a user can create a valid record and reach the next action.',
        'Block promotion when a screen encourages duplicate entry or unclear ownership.',
      ],
      escalateWhen: [
        'Staff need shadow systems to complete the workflow.',
        'A critical screen still requires too much typing or too many switches.',
        'Managers are reviewing outside the app because the app view is not good enough yet.',
      ],
      writePolicy: 'Eval findings and release recommendations are allowed; module rollout changes require admin review.',
      kpis: [
        { name: 'entry time for common flows', target: 'down each release cycle' },
        { name: 'workflows needing off-system tracking', target: 'zero' },
      ],
    },
    {
      id: 'director-brief',
      name: 'CEO Brief Pod',
      workspace: 'ytf/director',
      leadRole: 'CEO',
      mission: 'Compile one short executive review from plant, supplier, quality, commercial, and runtime state.',
      outputs: ['daily brief draft', 'priority list', 'decision prompt', 'stale escalation watch'],
      cadence: ['daily brief', 'weekend review', 'stale decision watch'],
      tools: [
        { toolId: 'director', mode: 'Write', scope: 'brief draft and priority framing' },
        { toolId: 'approvals', mode: 'Read', scope: 'approval debt and supplier exposure' },
        { toolId: 'operations-control', mode: 'Read', scope: 'plant blockers and action pressure' },
        { toolId: 'sales-crm', mode: 'Read', scope: 'commercial risk and movement' },
        { toolId: 'knowledge-runtime', mode: 'Read', scope: 'decision history and linked evidence' },
      ],
      instructions: [
        'Condense the day into the few changes that justify management attention.',
        'Prefer cross-module risk and blocked flow over vanity metrics.',
        'Always point back to the source record that supports the brief.',
      ],
      escalateWhen: [
        'A risk crosses sales, operations, finance, or quality boundaries.',
        'A major decision is stale without owner or due date.',
        'The brief is missing source evidence for a high-severity claim.',
      ],
      writePolicy: 'Draft briefs and decision prompts are allowed; outward-facing summaries and high-severity escalations require CEO or admin review.',
      kpis: [
        { name: 'daily brief completeness', target: 'all critical risks represented with source links' },
        { name: 'stale executive decisions', target: 'down week over week' },
      ],
    },
  ],
}

const AGENT_MODELS: AgentOperatingModel[] = [SUPERMEGA_AGENT_MODEL, YTF_AGENT_MODEL]

export function getAgentOperatingModel(tenantKey: AgentOperatingModel['tenantKey']) {
  return AGENT_MODELS.find((model) => model.tenantKey === tenantKey) ?? SUPERMEGA_AGENT_MODEL
}

export function getToolDefinitionMap(model: AgentOperatingModel) {
  return new Map(model.tools.map((tool) => [tool.id, tool]))
}
