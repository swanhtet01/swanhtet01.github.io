export type SaasKillerTarget = {
  id: string
  name: string
  incumbents: string
  buyer: string
  firstWorkflow: string
  customSaas: string
  agentJobs: string[]
  proofRoute: string
}

export type SaasKillerPackage = {
  id: string
  name: string
  price: string
  customerDecision: string
  clientGets: string
  deliveryGate: string
}

export type SaasKillerBuildPhase = {
  id: string
  phase: string
  clientInput: string
  agentTeam: string
  output: string
}

export type SaasKillerAgentRole = {
  role: string
  mission: string
  tools: string[]
  requiredEvidence: string
}

export type SaasKillerChecklistItem = {
  label: string
  whyItMatters: string
}

export type SaasKillerShowcaseLane = {
  id: string
  name: string
  buyer: string
  sellableProduct: string
  firstWorkflow: string
  proof: string
  nextAction: string
  contactParam: string
}

export type SaasKillerBacklogItem = {
  id: string
  name: string
  buyer: string
  trigger: string
  firstModule: string
  sourceInputs: string
  status: string
  nextBuild: string
  packageId: string
}

export type SaasKillerProofSystemItem = {
  label: string
  proof: string
  salesUse: string
}

export const SAAS_KILLER_POSITION = {
  eyebrow: 'Custom AI-native SaaS',
  headline: 'Replace SaaS work, not just SaaS screens.',
  simpleOffer: 'SaaS Killer Sprint',
  customerPromise:
    'SuperMega builds a private app around one real workflow: your users, sources, approvals, tasks, and AI agents. The first module replaces the daily work loop; the platform expands only after usage proves value.',
  plainEnglish:
    'Clients do not need to choose from a huge menu. They answer one question: what SaaS, spreadsheet, inbox, or repeated staff task should stop being painful first?',
  moat:
    'The advantage is not another dashboard. It is a build system: intake, source map, custom module, guarded AI workers, browser tasks, release QA, and a repeatable portal factory.',
  boundary:
    'Do not rip out payroll, banking, accounting ledgers, SAP, or regulated systems on day one. Start as the AI-native work layer above them, then earn deeper writeback with evidence, approval, and rollback.',
} as const

export const SAAS_KILLER_TARGETS: SaasKillerTarget[] = [
  {
    id: 'crm-killer',
    name: 'AI-native CRM replacement',
    incumbents: 'Salesforce, HubSpot, Pipedrive, spreadsheets, WhatsApp follow-up',
    buyer: 'Founder, sales lead, relationship manager',
    firstWorkflow: 'Lead intake -> qualification -> follow-up -> pipeline review -> next action',
    customSaas: 'A revenue workspace that remembers every prospect, drafts follow-up, scores urgency, and keeps the owner in control.',
    agentJobs: ['qualify leads', 'draft follow-up', 'research account context', 'flag stalled deals'],
    proofRoute: '/app/revenue/pipeline',
  },
  {
    id: 'erp-action-layer',
    name: 'ERP action-layer replacement',
    incumbents: 'Odoo, SAP exports, local ERP, Excel trackers, daily manager chase',
    buyer: 'Owner, operations director, plant manager, finance controller',
    firstWorkflow: 'Import/export data -> detect exception -> assign owner -> approve action -> close loop',
    customSaas: 'A role-based action board over the existing record system, with exceptions, evidence, and manager-approved writeback.',
    agentJobs: ['find exceptions', 'prepare manager brief', 'draft supplier/internal messages', 'watch overdue items'],
    proofRoute: '/app/erp',
  },
  {
    id: 'service-ops-killer',
    name: 'Service business OS replacement',
    incumbents: 'Square, Fresha, paper booking, POS sheets, daily cash notebooks',
    buyer: 'Spa, clinic, repair shop, or service-retail owner',
    firstWorkflow: 'Booking -> checkout -> expense -> daily close -> owner report',
    customSaas: 'A single operating desk for appointments, payment evidence, staff tasks, expenses, and owner reporting.',
    agentJobs: ['summarize day close', 'spot missing cash evidence', 'prepare repeat-customer notes', 'flag staff follow-up'],
    proofRoute: '/app/service-desk',
  },
  {
    id: 'data-room-killer',
    name: 'Company data room replacement',
    incumbents: 'Drive folders, Notion, SharePoint, static PDFs, analyst decks',
    buyer: 'Owner, executive assistant, analyst, board operator',
    firstWorkflow: 'Connect files -> map sources -> ask with evidence -> produce memo -> assign actions',
    customSaas: 'A source-grounded company memory where every answer links to evidence and every insight can become an owned task.',
    agentJobs: ['classify files', 'extract facts', 'answer with citations', 'prepare board/owner briefs'],
    proofRoute: '/app/data-fabric',
  },
  {
    id: 'browser-worker-killer',
    name: 'Browser work replacement',
    incumbents: 'Manual portal checks, form filling, copy/paste admin, vendor website routines',
    buyer: 'Operations admin, finance admin, customer support lead',
    firstWorkflow: 'Define task -> run approved browser worker -> capture evidence -> approve submit/write action',
    customSaas: 'A browser worker control desk that performs repetitive web work with screenshots, logs, and approval gates.',
    agentJobs: ['navigate portals', 'download reports', 'fill drafts', 'capture screenshots'],
    proofRoute: '/app/workforce',
  },
  {
    id: 'internal-portal-killer',
    name: 'Internal portal replacement',
    incumbents: 'SharePoint, intranet pages, disconnected app launchers, email requests',
    buyer: 'CEO, admin lead, HR/ops lead, tenant operator',
    firstWorkflow: 'Login -> role home -> request queue -> approval -> knowledge/action history',
    customSaas: 'A private company OS where each role sees only the modules, files, tasks, and AI workers that matter.',
    agentJobs: ['route requests', 'prepare approval packets', 'watch missing evidence', 'recommend next module'],
    proofRoute: '/app/start',
  },
]

export const SAAS_KILLER_SHOWCASE_LANES: SaasKillerShowcaseLane[] = [
  {
    id: 'industrial-erp-layer',
    name: 'Industrial ERP Action Layer',
    buyer: 'Owner, COO, plant manager',
    sellableProduct: 'A plant operating portal that sits above SAP, Odoo, Excel, or local ERP exports.',
    firstWorkflow: 'Daily exceptions -> owner queue -> evidence -> approval -> closed action.',
  proof: 'Factory Operations App live proof route plus role-based daily brief.',
    nextAction: 'Ask for one production, quality, inventory, or receiving export.',
    contactParam: 'industrial-erp-action-layer',
  },
  {
    id: 'service-pos-owner-desk',
    name: 'Service POS Owner Desk',
    buyer: 'Spa, clinic, repair, salon, or service-retail owner',
    sellableProduct: 'A simple daily desk for bookings, checkout, expenses, staff actions, and owner close.',
    firstWorkflow: 'Appointment -> payment evidence -> daily close -> staff follow-up.',
    proof: 'Service Desk POS proof route with day ledger and owner report.',
    nextAction: 'Send the current booking sheet, POS export, or daily cash format.',
    contactParam: 'service-pos-owner-desk',
  },
  {
    id: 'revenue-crm-copilot',
    name: 'Revenue CRM Copilot',
    buyer: 'Founder, sales lead, relationship manager',
    sellableProduct: 'A relationship workspace that turns contacts, calls, and WhatsApp follow-up into next actions.',
    firstWorkflow: 'Lead capture -> account research -> follow-up draft -> pipeline review.',
    proof: 'Lead and account workflow contract backed by the portal action queue.',
    nextAction: 'Send one prospect list and one example follow-up thread.',
    contactParam: 'revenue-crm-copilot',
  },
  {
    id: 'data-room-to-board-pack',
    name: 'Data Room to Board Pack',
    buyer: 'Owner, board operator, analyst, executive assistant',
    sellableProduct: 'A company memory that turns folders, notes, and sheets into cited reports and decisions.',
    firstWorkflow: 'Upload sources -> extract facts -> create brief -> assign owner actions.',
    proof: 'File Cleanroom and Report Builder product outputs.',
    nextAction: 'Send one folder or weekly update package.',
    contactParam: 'data-room-to-board-pack',
  },
  {
    id: 'browser-worker-control-desk',
    name: 'Browser Worker Control Desk',
    buyer: 'Operations admin, finance admin, support lead',
    sellableProduct: 'A controlled agent desk for repetitive web portal checks, downloads, drafts, and screenshots.',
    firstWorkflow: 'Define browser routine -> run supervised worker -> capture proof -> approve submit.',
    proof: 'Browser-worker policy, screenshots, transcript, and approval gates.',
    nextAction: 'Record one repetitive browser task and the safe stopping point.',
    contactParam: 'browser-worker-control-desk',
  },
]

export const SAAS_KILLER_UNWORKED_BACKLOG: SaasKillerBacklogItem[] = [
  {
    id: 'finance-close-desk',
    name: 'Finance Close Desk',
    buyer: 'Finance controller, owner, accountant',
    trigger: 'Monthly close still happens through files, email, bank exports, and manual checking.',
    firstModule: 'Expense evidence inbox, variance flags, missing receipt queue, owner approval packet.',
    sourceInputs: 'Bank CSV, expense sheet, invoice folder, payment screenshots.',
    status: 'Next build candidate',
    nextBuild: 'Create a sample month-close route and pricing proof pack.',
    packageId: 'finance-close-desk',
  },
  {
    id: 'hr-payroll-evidence-desk',
    name: 'HR and Payroll Evidence Desk',
    buyer: 'HR lead, admin lead, owner',
    trigger: 'Attendance, leave, payroll changes, and staff documents are disconnected.',
    firstModule: 'Staff record, attendance exception queue, leave approval, payroll-change evidence.',
    sourceInputs: 'Attendance export, staff list, leave messages, payroll adjustment sheet.',
    status: 'Discovery ready',
    nextBuild: 'Build read-only staff workspace before payroll writeback.',
    packageId: 'hr-payroll-evidence-desk',
  },
  {
    id: 'procurement-supplier-desk',
    name: 'Procurement Supplier Desk',
    buyer: 'Purchasing lead, operations manager, owner',
    trigger: 'Purchase requests, supplier quotes, approvals, and receiving proof are scattered.',
    firstModule: 'Request intake, quote comparison, approval packet, receiving discrepancy queue.',
    sourceInputs: 'Supplier quotes, PR sheet, PO export, receiving notes.',
    status: 'High-value B2B wedge',
    nextBuild: 'Turn quote comparison into a live mini app.',
    packageId: 'procurement-supplier-desk',
  },
  {
    id: 'it-security-evidence-desk',
    name: 'IT and Security Evidence Desk',
    buyer: 'IT manager, compliance lead, founder',
    trigger: 'Access, device, incident, and vendor security checks need traceable evidence.',
    firstModule: 'Access review, incident register, security checklist, vendor evidence pack.',
    sourceInputs: 'User export, device list, policy docs, incident notes.',
    status: 'Enterprise trust gap',
    nextBuild: 'Create a secure access review proof route and guardrail checklist.',
    packageId: 'it-security-evidence-desk',
  },
  {
    id: 'support-quality-desk',
    name: 'Support Quality Desk',
    buyer: 'Customer support lead, service owner',
    trigger: 'Customer messages are handled manually with inconsistent follow-up and weak reporting.',
    firstModule: 'Conversation intake, sentiment/urgency flags, reply draft, escalation owner.',
    sourceInputs: 'Support inbox export, WhatsApp samples, ticket CSV, refund log.',
    status: 'Reusable general product',
    nextBuild: 'Ship a support queue prototype using sample tickets.',
    packageId: 'support-quality-desk',
  },
  {
    id: 'executive-board-pack',
    name: 'Executive Board Pack',
    buyer: 'CEO, board operator, investor-facing founder',
    trigger: 'Leaders need one weekly packet across sales, ops, cash, risks, and decisions.',
    firstModule: 'Weekly source intake, KPI summary, risk register, decision memo, action owners.',
    sourceInputs: 'KPI sheet, CRM export, finance summary, project updates.',
    status: 'Sales enablement product',
    nextBuild: 'Package the Report Builder into a recurring board pack offer.',
    packageId: 'executive-board-pack',
  },
]

export const SAAS_KILLER_PROOF_SYSTEM: SaasKillerProofSystemItem[] = [
  {
    label: 'Live proof route',
    proof: 'Every product should have a real route or a clearly marked prototype route.',
    salesUse: 'Lets a buyer see the workflow before a call.',
  },
  {
    label: 'Source sample',
    proof: 'Every pitch names the file, sheet, inbox, portal, or export needed to start.',
    salesUse: 'Turns vague interest into a scoped intake request.',
  },
  {
    label: 'Human approval gate',
    proof: 'Every AI action says what can be drafted, what can be submitted, and who approves.',
    salesUse: 'Makes automation safe enough for enterprise buyers.',
  },
  {
    label: 'Role policy',
    proof: 'Every portal has a buyer, operator, reviewer, and escalation owner.',
    salesUse: 'Prevents custom software from becoming a generic dashboard.',
  },
  {
    label: 'QA evidence',
    proof: 'Route, domain, mobile, protected login, and release checks run before client sharing.',
    salesUse: 'Makes product proof credible and repeatable.',
  },
  {
    label: 'Expansion path',
    proof: 'Every first module maps to the next 2-3 paid modules only after usage proves value.',
    salesUse: 'Keeps the first sale small while preserving enterprise upside.',
  },
]

export const SAAS_KILLER_PACKAGES: SaasKillerPackage[] = [
  {
    id: 'replacement-audit',
    name: 'SaaS Replacement Audit',
    price: 'USD 500-1,500',
    customerDecision: 'Which SaaS bill or manual workflow feels most painful?',
    clientGets: 'Workflow map, incumbent tool map, source checklist, first module scope, ROI estimate, and risk gates.',
    deliveryGate: 'No build starts until the first workflow, owner, source samples, and approval rule are clear.',
  },
  {
    id: 'custom-saas-sprint',
    name: 'Custom SaaS Sprint',
    price: 'USD 3,000-15,000',
    customerDecision: 'Do you want the first usable private module built now?',
    clientGets: 'Private portal module, role view, source intake, task queue, AI assistant draft loop, proof script, and QA evidence.',
    deliveryGate: 'Ship one role-ready workflow before expanding into more departments.',
  },
  {
    id: 'agentic-saas-retainer',
    name: 'Agentic SaaS Retainer',
    price: 'USD 2,000-20,000 per month',
    customerDecision: 'Should SuperMega keep improving the system every week?',
    clientGets: 'Managed agent runs, source-change review, new modules, release QA, security drills, and owner-level reporting.',
    deliveryGate: 'Every external post, message, client-system writeback, and billing change remains human approved.',
  },
  {
    id: 'enterprise-saas-factory',
    name: 'Enterprise SaaS Factory',
    price: 'USD 25,000+ setup plus managed contract',
    customerDecision: 'Do you need a custom tenant platform across multiple teams or companies?',
    clientGets: 'Tenant architecture, role policy, connector plan, agent workforce, domain setup, rollout plan, and operating cadence.',
    deliveryGate: 'Use staged rollout: read-only intelligence, reviewed actions, limited writeback, then deeper automation.',
  },
]

export const SAAS_KILLER_BUILD_SYSTEM: SaasKillerBuildPhase[] = [
  {
    id: 'diagnose',
    phase: 'Diagnose the SaaS pain',
    clientInput: 'Current tool, screenshots, sample export, repeated task, user role, and what success would look like.',
    agentTeam: 'Workflow extractor + ROI analyst',
    output: 'Replacement thesis, risk boundary, first workflow, and build/no-build recommendation.',
  },
  {
    id: 'map',
    phase: 'Map the sources and roles',
    clientInput: 'Drive folders, sheets, inboxes, PDFs, APIs, browser portals, users, permissions, and approval owners.',
    agentTeam: 'Data/source agent + role architect',
    output: 'Source ledger, role policy, route map, and minimum data contract.',
  },
  {
    id: 'build',
    phase: 'Build the first module',
    clientInput: 'Approved scope, brand, role list, source samples, and first workflow acceptance test.',
    agentTeam: 'Builder agent + UI/product agent + QA agent',
    output: 'Working private module with task queue, evidence panels, AI assistant loop, and smoke checks.',
  },
  {
    id: 'operate',
    phase: 'Operate with agents',
    clientInput: 'Live usage, exceptions, failed handoffs, new source changes, and manager feedback.',
    agentTeam: 'Operator agent + browser worker + release guard',
    output: 'Weekly improvements, controlled automations, audit log, and next module recommendation.',
  },
]

export const SAAS_KILLER_AGENT_TEAM: SaasKillerAgentRole[] = [
  {
    role: 'CEO / product strategist',
    mission: 'Pick the highest-value replacement wedge and keep the offer simple.',
    tools: ['product ladder', 'pricing model', 'market intel', 'proof packs'],
    requiredEvidence: 'Named buyer, current tool, painful workflow, and business outcome.',
  },
  {
    role: 'Workflow extractor',
    mission: 'Turn messy client language into one role, one queue, one source truth, and one success metric.',
    tools: ['intake form', 'call notes', 'screenshots', 'sample files'],
    requiredEvidence: 'Before/after workflow map and what not to automate yet.',
  },
  {
    role: 'Data/source agent',
    mission: 'Find where the truth currently lives and create the ingestion/permission plan.',
    tools: ['Drive', 'Gmail', 'Sheets', 'CSV/XLSX/PDF parser', 'source ledger'],
    requiredEvidence: 'Source owner, sample record, freshness rule, and ambiguity handling.',
  },
  {
    role: 'Builder agent',
    mission: 'Create the custom SaaS module, route, model, UI, and task contract.',
    tools: ['Codex workspace', 'React app shell', 'module registry', 'release scripts'],
    requiredEvidence: 'Changed files, local build, route coverage, and user acceptance test.',
  },
  {
    role: 'Browser worker',
    mission: 'Automate repetitive browser tasks only inside approved credential and action boundaries.',
    tools: ['browser automation', 'screenshots', 'download capture', 'approval queue'],
    requiredEvidence: 'Transcript, screenshots, submit/write approval, and rollback plan.',
  },
  {
    role: 'QA and security guard',
    mission: 'Block unsafe agent behavior, broken routes, stale domains, weak claims, and uncontrolled writeback.',
    tools: ['release QA', 'route audit', 'agent evidence ledger', 'security drill'],
    requiredEvidence: 'Green checks or explicit blockers before client sharing.',
  },
  {
    role: 'Growth operator',
    mission: 'Turn each replacement wedge into a prospect-specific pitch, proof pack, and follow-up.',
    tools: ['growth queue', 'social queue', 'commercial board', 'contact ledger'],
    requiredEvidence: 'Human-approved outbound message, target buyer, and next follow-up task.',
  },
]

export const SAAS_KILLER_CLIENT_CHECKLIST: SaasKillerChecklistItem[] = [
  {
    label: 'Current SaaS or workflow to replace',
    whyItMatters: 'Keeps the first build focused on a real pain instead of a giant menu.',
  },
  {
    label: 'One role that opens the system first',
    whyItMatters: 'A custom SaaS module fails if nobody knows who owns the first action.',
  },
  {
    label: 'Sample sources',
    whyItMatters: 'Agents need real files, screenshots, exports, or messages to build useful behavior.',
  },
  {
    label: 'Approval and writeback rule',
    whyItMatters: 'SuperMega can prepare work automatically, but business changes need an owner.',
  },
  {
    label: 'Success metric',
    whyItMatters: 'The sprint should prove faster closeout, fewer missed tasks, lower SaaS cost, or better manager visibility.',
  },
]

export const SAAS_KILLER_GATES = [
  'Human approval is required for outbound posts, messages, billing, production deploys, and client-system writeback.',
  'Every AI output needs source evidence or an explicit uncertainty label.',
  'Every browser worker action needs scoped credentials, screenshots/logs, and submit/write approval.',
  'Every custom SaaS module needs route coverage, role access, source contract, and rollback notes.',
  'Every sales claim needs a proof route, proof pack, or clearly marked prototype status.',
]

export const SAAS_KILLER_FIRST_PITCH =
  'Tell me the SaaS or manual workflow you wish you could replace. SuperMega will map the first role, sources, approval gates, and AI worker tasks, then build the first usable private module before expanding.'
