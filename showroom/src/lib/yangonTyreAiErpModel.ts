export type YangonTyreAiErpRoleGuide = {
  id: string
  title: string
  detail: string
  route: string
  note: string
}

export type YangonTyreAiErpModule = {
  id: string
  title: string
  route: string
  suite: 'Capture' | 'Control' | 'Governance' | 'Intelligence'
  status: 'Live now' | 'Live + expanding' | 'Next build'
  users: string
  summary: string
  automation: string
  hiddenIso: string
}

export type YangonTyreAiErpSuite = {
  id: string
  title: string
  detail: string
  route: string
}

export type YangonTyreAiErpAutomationLoop = {
  id: string
  title: string
  trigger: string
  systemAction: string
  reviewGate: string
  route: string
}

export type YangonTyreAiErpRoadmapStep = {
  id: string
  label: string
  timing: string
  outcome: string
  route: string
}

export type YangonTyrePlantCoverageArea = {
  id: string
  name: string
  focus: string
}

export type YangonTyreAiErpRail = {
  id: string
  title: string
  detail: string
}

export type YangonTyreEnterpriseBenchmarkCapability = {
  id: string
  area: string
  enterprisePattern: string
  absorbedFrom: string[]
  ytfImplementation: string
  route: string
  status: 'Live now' | 'Live + expanding' | 'Next build'
}

export type YangonTyreAiNativeIsoFeature = {
  id: string
  name: string
  whyItMatters: string
  howItWorks: string
  route: string
  status: 'Live now' | 'Live + expanding' | 'Next build'
}

export type YangonTyreEnterpriseModuleGap = {
  id: string
  title: string
  priority: 'Build now' | 'Build next' | 'Later'
  benchmark: string
  currentYtf: string
  missing: string
  disruption: string
  firstBuild: string
  owner: string
  dataNeeded: string[]
  route: string
}

export const YANGON_TYRE_AI_ERP_ROLE_GUIDES: YangonTyreAiErpRoleGuide[] = [
  {
    id: 'operator',
    title: 'Operator / clerk',
    detail: 'Open Daily Entry when the team needs to record one real event without learning the whole system first.',
    route: '/app/daily-entry',
    note: 'Fast capture',
  },
  {
    id: 'supervisor',
    title: 'Supervisor',
    detail: 'Use Action Board to turn mixed notes, chat instructions, and follow-up items into one owner, one due window, and one next desk.',
    route: '/app/action-board',
    note: 'Route the work',
  },
  {
    id: 'plant-manager',
    title: 'Plant manager',
    detail: 'Start from Plant Manager to split micro from macro, review only what changed, and move into the owning desk.',
    route: '/app/plant-manager',
    note: 'Command surface',
  },
  {
    id: 'leadership',
    title: 'Leadership',
    detail: 'Use Data Fabric and Insights for repeated loss, concentration, trend drift, and cross-desk review.',
    route: '/app/data-fabric',
    note: 'Management review',
  },
] as const

export const YANGON_TYRE_AI_ERP_SUITES: YangonTyreAiErpSuite[] = [
  {
    id: 'capture',
    title: 'Capture',
    detail: 'Front doors for short notes, photos, shift handoff, and first facts.',
    route: '/app/daily-entry',
  },
  {
    id: 'control',
    title: 'Control',
    detail: 'Live desks for operations, quality, maintenance, receiving, and plant command.',
    route: '/app/plant-manager',
  },
  {
    id: 'governance',
    title: 'Governance',
    detail: 'Document, approval, training, and review structure hidden behind daily work.',
    route: '/app/invisible-iso',
  },
  {
    id: 'intelligence',
    title: 'Intelligence',
    detail: 'Connected analytics, lineage, briefs, and management decision support.',
    route: '/app/data-fabric',
  },
] as const

export const YANGON_TYRE_AI_ERP_MODULES: YangonTyreAiErpModule[] = [
  {
    id: 'daily-entry',
    title: 'Daily Entry',
    route: '/app/daily-entry',
    suite: 'Capture',
    status: 'Live now',
    users: 'Operators, stores, quality, maintenance, supervisors',
    summary: 'One simple intake for shift handoff, quality issue, maintenance issue, receiving hold, and KPI snapshot.',
    automation: 'Turns short inputs into the right live record type instead of forcing a separate form for every department.',
    hiddenIso: 'Controlled records and traceable evidence',
  },
  {
    id: 'action-board',
    title: 'Action Board',
    route: '/app/action-board',
    suite: 'Capture',
    status: 'Live now',
    users: 'Supervisors and managers',
    summary: 'Paste messy updates and let the system classify category, owner, urgency, desk, and next step.',
    automation: 'Auto-routes mixed notes into operations, DQMS, approvals, knowledge, adoption, or plant review.',
    hiddenIso: 'Responsibility, due dates, and follow-up control',
  },
  {
    id: 'plant-manager',
    title: 'Plant Manager',
    route: '/app/plant-manager',
    suite: 'Control',
    status: 'Live now',
    users: 'Plant manager, quality manager, maintenance lead, leadership',
    summary: 'One command page for shift status, containment, downtime, receiving pressure, and escalation.',
    automation: 'Pulls plant signals into one review layer before deeper desk work starts.',
    hiddenIso: 'Management review and operating control',
  },
  {
    id: 'operations',
    title: 'Operations Control',
    route: '/app/operations',
    suite: 'Control',
    status: 'Live + expanding',
    users: 'Production office, planners, section leads',
    summary: 'Run shift blockers, queue pressure, receiving impact, and section-level follow-up in one flow desk.',
    automation: 'Moves blockers and handoff items into day queues instead of leaving them in photos and chat.',
    hiddenIso: 'Operational planning and line control',
  },
  {
    id: 'dqms',
    title: 'Quality and CAPA',
    route: '/app/dqms',
    suite: 'Control',
    status: 'Live + expanding',
    users: 'Quality, lab, plant leaders',
    summary: 'Containment, incidents, closeout, recurrence, and defect review without spreadsheet drift.',
    automation: 'Starts containment and corrective-action logic from the first defect signal.',
    hiddenIso: 'Nonconformance, CAPA, and verification',
  },
  {
    id: 'maintenance',
    title: 'Maintenance and Reliability',
    route: '/app/maintenance',
    suite: 'Control',
    status: 'Live + expanding',
    users: 'Maintenance and utilities',
    summary: 'Track downtime, repeat failures, next action, and asset-level review from one desk.',
    automation: 'Links machine issues to plant review and repeat-failure attention instead of isolated repair notes.',
    hiddenIso: 'Equipment control and preventive follow-up',
  },
  {
    id: 'receiving',
    title: 'Receiving and Supplier Control',
    route: '/app/receiving',
    suite: 'Control',
    status: 'Live + expanding',
    users: 'Stores, procurement, plant manager',
    summary: 'Holds, mismatches, COA gaps, GRN drift, and release blockers stay in one queue.',
    automation: 'Packages the supplier packet, variance note, and next approval step together.',
    hiddenIso: 'External provider control and release evidence',
  },
  {
    id: 'knowledge',
    title: 'Knowledge, SOP, and Training',
    route: '/app/knowledge',
    suite: 'Governance',
    status: 'Live + expanding',
    users: 'Admin, HR, section leads, auditors',
    summary: 'Keep SOP revision, work-instruction drift, training follow-up, and proof of completion inside the same runtime.',
    automation: 'Turns document and training issues into controlled follow-up rather than separate admin chatter.',
    hiddenIso: 'Document control and competence',
  },
  {
    id: 'fabric',
    title: 'Data Fabric and Insight',
    route: '/app/data-fabric',
    suite: 'Intelligence',
    status: 'Live + expanding',
    users: 'Managers, directors, analyst pods',
    summary: 'Drive-first analytics, lineage, KPI signals, feature engineering, and management narrative.',
    automation: 'Turns Drive, workbook, and desk signals into the macro review layer for leadership.',
    hiddenIso: 'Traceability, KPI integrity, and review evidence',
  },
] as const

export const YANGON_TYRE_AI_ERP_AUTOMATION_LOOPS: YangonTyreAiErpAutomationLoop[] = [
  {
    id: 'issue-routing',
    title: 'Issue routing loop',
    trigger: 'Someone pastes a shift note, complaint, supplier gap, or audit follow-up.',
    systemAction: 'The platform assigns category, owner, urgency, next desk, and evidence hint.',
    reviewGate: 'Supervisor checks the route before saving or escalating.',
    route: '/app/action-board',
  },
  {
    id: 'shift-close',
    title: 'Shift close loop',
    trigger: 'A shift ends with photos, short updates, and verbal handoff notes.',
    systemAction: 'Daily Entry converts the signal into structured records for queue, incident, downtime, hold, or KPI.',
    reviewGate: 'Shift lead verifies owner and due time before the next shift starts.',
    route: '/app/daily-entry',
  },
  {
    id: 'quality-containment',
    title: 'Quality containment loop',
    trigger: 'A defect, complaint, or release hold appears.',
    systemAction: 'DQMS starts containment, assigns closeout ownership, and keeps recurrence visible.',
    reviewGate: 'Quality manager confirms severity, evidence, and target close date.',
    route: '/app/dqms',
  },
  {
    id: 'supplier-hold',
    title: 'Supplier hold loop',
    trigger: 'Receiving finds a mismatch, missing COA, shortage, or suspect lot.',
    systemAction: 'The system groups the packet, supplier reference, and hold state into one release lane.',
    reviewGate: 'Stores or procurement confirms the next action before release.',
    route: '/app/receiving',
  },
  {
    id: 'document-training',
    title: 'Document and training loop',
    trigger: 'An SOP revision, work-instruction drift, or overdue refresher appears.',
    systemAction: 'The issue is pushed into knowledge or adoption with named ownership and evidence expectations.',
    reviewGate: 'Admin or the section lead signs off once the updated proof exists.',
    route: '/app/knowledge',
  },
  {
    id: 'management-brief',
    title: 'Management brief loop',
    trigger: 'Repeated abnormal signals stack across shifts, products, or sections.',
    systemAction: 'Data Fabric aggregates micro records into KPI drift, concentration, and review stories.',
    reviewGate: 'Plant leadership chooses the operating decision, not the AI.',
    route: '/app/data-fabric',
  },
] as const

export const YANGON_TYRE_AI_ERP_ROADMAP: YangonTyreAiErpRoadmapStep[] = [
  {
    id: 'now',
    label: 'Now',
    timing: 'Use every shift',
    outcome: 'Make Daily Entry, Action Board, and Plant Manager the default front doors for plant work so the new habit is capture first, not chat first.',
    route: '/app/plant-manager',
  },
  {
    id: 'next',
    label: 'Next',
    timing: 'Connector spine',
    outcome: 'Promote more Drive folders, workbook tabs, and inbox packets into canonical event tables so the desks stop depending on curated seed slices.',
    route: '/app/data-fabric',
  },
  {
    id: 'next-next',
    label: 'Next next',
    timing: 'Management packs',
    outcome: 'Generate recurring weekly, Saturday, and monthly review packs from the same operating records instead of rebuilding the story manually.',
    route: '/app/insights',
  },
  {
    id: 'next-next-next',
    label: 'Next next next',
    timing: 'Bounded autonomy',
    outcome: 'Let approved agents draft updates, chase missing evidence, and work legacy browser flows while keeping human sign-off on real decisions.',
    route: '/app/runtime',
  },
] as const

export const YANGON_TYRE_PLANT_COVERAGE_AREAS: YangonTyrePlantCoverageArea[] = [
  { id: 'mixing', name: 'Compound mixing', focus: 'batch, loss, downtime, SOP' },
  { id: 'rubberizing', name: 'Rubberizing', focus: 'line condition, output, deviation' },
  { id: 'tread', name: 'Tread extrusion', focus: 'quality drift, speed, waste' },
  { id: 'bead', name: 'Bead production', focus: 'defect, splice, material variance' },
  { id: 'cutting', name: 'Bias cutting', focus: 'setup, scrap, repeat issue' },
  { id: 'building', name: 'Tyre building', focus: 'handoff, defect, throughput' },
  { id: 'curing', name: 'Tyre curing', focus: 'press condition, repeat defect, release' },
  { id: 'packing', name: 'Packing', focus: 'final issue, hold, dispatch readiness' },
  { id: 'warehouse', name: 'Warehouse', focus: 'receipt, stock, release, forklift' },
  { id: 'utilities', name: 'Utilities', focus: 'power, compressor, steam, uptime' },
  { id: 'qc', name: 'Quality control', focus: 'inspection, complaint, containment' },
] as const

export const YANGON_TYRE_AI_ERP_RAILS: YangonTyreAiErpRail[] = [
  {
    id: 'evidence-first',
    title: 'Evidence before escalation',
    detail: 'No major review should depend on memory alone. Every escalation needs the linked photo, batch, lot, defect, machine, or packet.',
  },
  {
    id: 'bounded-automation',
    title: 'Bounded automation',
    detail: 'AI can classify, draft, remind, and summarize, but release, closeout, and plant decisions stay with named human owners.',
  },
  {
    id: 'role-safe-runtime',
    title: 'Role-safe runtime',
    detail: 'Operators get short entry surfaces, supervisors get routing, managers get command, and leadership gets intelligence rather than one giant universal menu.',
  },
  {
    id: 'drive-to-canonical',
    title: 'Drive to canonical record',
    detail: 'Shared Drive remains the source registry, but the ERP runtime turns those files and notes into controlled records and connected events.',
  },
] as const

export const YANGON_TYRE_ENTERPRISE_BENCHMARK_CAPABILITIES: YangonTyreEnterpriseBenchmarkCapability[] = [
  {
    id: 'production-planning-execution',
    area: 'Manufacturing operations',
    enterprisePattern: 'Production planning, manufacturing execution, work-center status, schedule adherence, and shopfloor exception control.',
    absorbedFrom: ['SAP S/4HANA Manufacturing', 'Dynamics 365 Supply Chain', 'Odoo Manufacturing'],
    ytfImplementation: 'Plant Manager, Operations Control, and Daily Entry convert production-office Drive changes and shift inputs into plant events, blockers, owners, and KPI candidates.',
    route: '/app/plant-manager',
    status: 'Live + expanding',
  },
  {
    id: 'quality-traceability-capa',
    area: 'Quality management',
    enterprisePattern: 'Quality planning, inspection, nonconformance, traceability, CAPA, release control, and quality analytics.',
    absorbedFrom: ['SAP Quality Management', 'Dynamics quality issue traceability', 'NetSuite Quality Management'],
    ytfImplementation: 'DQMS, Invisible ISO, and Data Fabric bind QC evidence, defect signals, release holds, 5W1H, CAPA, and source links into one simple quality loop.',
    route: '/app/dqms',
    status: 'Live + expanding',
  },
  {
    id: 'asset-maintenance-reliability',
    area: 'Maintenance and reliability',
    enterprisePattern: 'Asset history, breakdown records, preventive follow-up, downtime classification, repeat-failure review, and maintenance work queues.',
    absorbedFrom: ['SAP Enterprise Asset Management', 'Dynamics Asset Management', 'Odoo Maintenance'],
    ytfImplementation: 'Maintenance desk and Daily Entry capture machine, downtime, owner, next action, and repeat-failure signals so reliability work feeds the plant review.',
    route: '/app/maintenance',
    status: 'Live + expanding',
  },
  {
    id: 'supplier-procurement-finance',
    area: 'Supplier, procurement, and finance control',
    enterprisePattern: 'Purchase orders, receiving variance, GRN, supplier documents, approvals, cost exposure, and finance evidence.',
    absorbedFrom: ['SAP Materials Management', 'NetSuite procurement and finance', 'Dynamics Finance'],
    ytfImplementation: 'Receiving, Approvals, and Data Fabric turn supplier mail, Drive packets, GRN gaps, and finance evidence into release packets and escalation queues.',
    route: '/app/approvals',
    status: 'Live + expanding',
  },
  {
    id: 'crm-service-demand',
    area: 'CRM, service, and demand',
    enterprisePattern: 'Account timeline, sales planning, service cases, customer history, channel activity, and demand forecasting.',
    absorbedFrom: ['Salesforce Manufacturing Cloud', 'Dynamics Sales and Service', 'Odoo CRM'],
    ytfImplementation: 'Revenue desk and commercial demand mart prepare showroom, dealer, quote, campaign, inventory, and customer evidence for role-specific follow-up.',
    route: '/app/revenue',
    status: 'Next build',
  },
  {
    id: 'embedded-analytics-ai-copilot',
    area: 'Analytics and AI copilot',
    enterprisePattern: 'Embedded analytics, natural-language copilots, AI agents, exception summaries, and decision support inside business workflows.',
    absorbedFrom: ['SAP Joule', 'Microsoft Copilot for Dynamics 365', 'Salesforce Agentforce'],
    ytfImplementation: 'AI Stack, Data Fabric, Change Monitor, and Owner Brief convert Drive changes into evidence-linked summaries, KPI candidates, owner handoffs, and route suggestions.',
    route: '/app/ai-stack',
    status: 'Live now',
  },
]

export const YANGON_TYRE_ENTERPRISE_MODULE_GAPS: YangonTyreEnterpriseModuleGap[] = [
  {
    id: 'batch-genealogy-traceability',
    title: 'Batch genealogy and traceability',
    priority: 'Build now',
    benchmark: 'SAP Digital Manufacturing / SAP QM / Dynamics production quality',
    currentYtf: 'DQMS now creates Trace Packs from the live root warehouse when authenticated, but the chain still needs confirmed production and QC relationships.',
    missing: 'Raw material lot, compound batch, machine, operator, stage, cure press, finished tyre, QC result, claim, and shipment links with human approval.',
    disruption: 'Instead of forcing full MES data entry first, start from photos, sheets, Drive files, and short entries, then ask humans to confirm the chain.',
    firstBuild: 'Convert warehouse-backed Trace Packs into approved genealogy records after quality or plant-manager confirmation.',
    owner: 'Quality + Plant Manager',
    dataNeeded: ['Tyre production sheets', 'QC inspection records', 'claim tyre files', 'raw-stock/GRN records'],
    route: '/app/dqms',
  },
  {
    id: 'inspection-plan-lab-spc',
    title: 'Inspection plan, lab SPC, and quality orders',
    priority: 'Build now',
    benchmark: 'SAP QM inspection lots / Dynamics quality orders / AQL and certificate workflows',
    currentYtf: 'DQMS now has a first QC Inspection Pack for incoming material, compound release, final release, and claim review, but decisions are not yet persisted as quality orders/SPC rows.',
    missing: 'Inspection point, test method, instrument, sample size, AQL/spec limit, measured result, pass/fail, release authority, certificate or report output, and durable quality-order history.',
    disruption: 'Make QC entry phone/tablet-first and auto-suggest the test plan from product, stage, and source file instead of forcing SAP-style setup first.',
    firstBuild: 'Wire the QC Inspection Pack decisions into durable inspection records, then promote failed or held checks into DQMS incidents and Trace Packs.',
    owner: 'QC + Quality Manager',
    dataNeeded: ['QC inspection sheets', 'lab test files', 'product specs', 'claim tyre files', 'ISO forms'],
    route: '/app/dqms',
  },
  {
    id: 'mrp-production-planning',
    title: 'MRP and production planning',
    priority: 'Build now',
    benchmark: 'SAP S/4HANA PP / Dynamics master planning / NetSuite work orders',
    currentYtf: 'Plant Manager and Operations show issues and signals, but planned orders and material requirements are still shallow.',
    missing: 'Demand, inventory, BOM/recipe usage, planned production, shortage risk, and schedule impact in one planning loop.',
    disruption: 'Use existing Drive and showroom/head-office data to produce planning suggestions before asking the factory to adopt a heavy planner screen.',
    firstBuild: 'Build a weekly production-plan cockpit with demand, available stock, shortage warnings, and suggested next run.',
    owner: 'Planning + Plant Manager',
    dataNeeded: ['sales and inventory sheets', 'production plan files', 'stock records', 'product/spec lists'],
    route: '/app/operations',
  },
  {
    id: 'production-confirmation-oee',
    title: 'Production confirmation and OEE-lite',
    priority: 'Build now',
    benchmark: 'SAP production order confirmation / Dynamics production control / MES shift reporting',
    currentYtf: 'Daily Entry and Operations can capture shift facts, but yield, scrap, rework, downtime, speed loss, and stage confirmation are not yet one standard record.',
    missing: 'Work center, product, planned quantity, actual quantity, scrap/rework, downtime reason, changeover loss, operator/shift, and next bottleneck.',
    disruption: 'Skip the heavy MES screen. Use one compact manager confirmation per stage, then let the system compute OEE-lite and bottleneck stories.',
    firstBuild: 'Create stage confirmation packs for mixing, building, curing, QC, and packing with planned vs actual, scrap, downtime, and photo proof.',
    owner: 'Operations + Plant Manager',
    dataNeeded: ['daily production sheets', 'OT records', 'machine downtime notes', 'QC reject records'],
    route: '/app/daily-entry',
  },
  {
    id: 'inventory-wms-dispatch',
    title: 'Inventory, warehouse, and dispatch control',
    priority: 'Build now',
    benchmark: 'SAP EWM / Dynamics warehouse fulfillment / Odoo Inventory',
    currentYtf: 'Receiving and inventory signals exist, but bin, hold, release, pick, pack, and dispatch are not unified.',
    missing: 'Stock location, hold status, release authority, picking/packing, dispatch readiness, cycle counts, and variance explanation.',
    disruption: 'Make the first version mobile and exception-first: record holds, shortages, and dispatch blockers before implementing full barcode flows.',
    firstBuild: 'Create a warehouse pulse board for stock pressure, holds, release blockers, and dispatch-ready inventory.',
    owner: 'Stores + Sales/Inventory',
    dataNeeded: ['raw-stock details', 'tyre sales and inventory', 'GRN shortcuts', 'showroom stock files'],
    route: '/app/receiving',
  },
  {
    id: 'recipe-spec-plm-control',
    title: 'Recipe, spec, and change control',
    priority: 'Build now',
    benchmark: 'SAP PLM / S/4HANA engineering change / Odoo BoM and work instructions',
    currentYtf: 'SOP and document control exists, but recipe/spec revision control is not strict enough for manufacturing decisions.',
    missing: 'Current formula, product spec, approved revision, change reason, affected stages, training impact, and release decision.',
    disruption: 'Use AI to detect spec-like documents and propose controlled records, while humans approve the actual recipe/spec truth.',
    firstBuild: 'Create a controlled spec vault for one tyre family with current revision, source file, owner, and change log.',
    owner: 'Quality + Admin/Planning',
    dataNeeded: ['operations manual', 'product specs', 'ISO procedures', 'analysis workbook'],
    route: '/app/knowledge',
  },
  {
    id: 'agent-governance-eval',
    title: 'Agent governance and evals',
    priority: 'Build now',
    benchmark: 'OpenAI Agents SDK tracing/guardrails / Gemini Enterprise Agent Platform governance',
    currentYtf: 'Agent runtime surfaces exist, but agent work needs stricter eval, trace, approval, and rollback discipline.',
    missing: 'Read scope, write scope, tool-call trace, quality score, failure class, human approval, and promotion gate per agent job.',
    disruption: 'Make AI agents do prep work continuously, but only promote records when evidence, owner, and approval gates pass.',
    firstBuild: 'Add an agent job ledger for Drive change review, KPI extraction, CAPA drafting, and supplier follow-up drafts.',
    owner: 'Admin + Data Science',
    dataNeeded: ['agent run logs', 'action board decisions', 'KPI approvals', 'Drive change events'],
    route: '/app/ai-stack',
  },
  {
    id: 'security-rbac-audit',
    title: 'Security, RBAC, and audit hardening',
    priority: 'Build now',
    benchmark: 'Enterprise ERP role security / ISO documented control / agent platform governance',
    currentYtf: 'Role logins exist, but production rollout still needs stronger user lifecycle, field-level boundaries, and audit exports.',
    missing: 'Named users, password reset, role templates, sensitive-field policy, source-level access, audit export, and incident review.',
    disruption: 'Keep the manager UI simple while making the backend more enterprise than the tools it replaces.',
    firstBuild: 'Promote split role accounts into named-user onboarding with audit-safe access review.',
    owner: 'Admin',
    dataNeeded: ['current users', 'role matrix', 'connector scopes', 'audit events'],
    route: '/app/platform-admin',
  },
  {
    id: 'costing-copq-finance',
    title: 'Costing and cost of poor quality',
    priority: 'Build next',
    benchmark: 'SAP Finance/Controlling / Dynamics production cost insights / NetSuite WIP and routing',
    currentYtf: 'Finance and analysis files are connected, but cost drivers are not yet tied to defects, downtime, scrap, and claims.',
    missing: 'Material cost, labor/utility proxy, downtime cost, scrap, rework, claims, supplier discrepancy, and product margin bridge.',
    disruption: 'Do not start with perfect accounting. Start with operational cost signals and let finance approve the costing model.',
    firstBuild: 'Create a weekly COPQ packet that links quality/maintenance issues to estimated money impact.',
    owner: 'Finance + Plant Manager',
    dataNeeded: ['H1/H2 finance sheets', 'costing tabs', 'claim tyre files', 'maintenance downtime entries'],
    route: '/app/data-fabric',
  },
  {
    id: 'supplier-quality-portal',
    title: 'Supplier quality and procurement portal',
    priority: 'Build next',
    benchmark: 'SAP procurement/QM supplier control / Dynamics procurement and sourcing',
    currentYtf: 'Receiving and approval queues exist, but supplier evidence and response status are still mostly internal.',
    missing: 'Supplier score, missing document chase, discrepancy response, COA/inspection link, approval threshold, and escalation history.',
    disruption: 'Turn emails and Drive packets into supplier cases first, then expose a simple external supplier room only after the internal flow is stable.',
    firstBuild: 'Create supplier recovery cases from PO/GRN/email evidence and route missing-document reminders.',
    owner: 'Procurement + Quality',
    dataNeeded: ['NR purchase orders', 'supplier Gmail threads', 'GRN records', 'inspection evidence'],
    route: '/app/approvals',
  },
  {
    id: 'dealer-crm-demand',
    title: 'Dealer CRM and demand planning',
    priority: 'Build next',
    benchmark: 'Salesforce Manufacturing Cloud / Dynamics Sales / SAP Sales',
    currentYtf: 'Showroom and sales lanes are live, but dealer accounts, quotes, follow-up, and demand forecasts are not yet one operating system.',
    missing: 'Dealer account memory, quote history, visit plan, promised quantity, demand trend, credit/collection risk, and stock impact.',
    disruption: 'Connect showroom PCs and sales chat/email into account timelines so sales work becomes useful without asking sales staff to fill a CRM first.',
    firstBuild: 'Build a dealer account timeline from showroom, sales, inventory, and Gmail evidence.',
    owner: 'Sales + Director',
    dataNeeded: ['showroom sales lane', 'tyre sales inventory', 'dealer messages', 'quote/price files'],
    route: '/app/revenue',
  },
  {
    id: 'competency-training-matrix',
    title: 'Competency and training matrix',
    priority: 'Build next',
    benchmark: 'ISO 9001 competence/documented information / SuccessFactors-style HR integration / Odoo Employees',
    currentYtf: 'Training and SOP evidence can be logged, but there is no live matrix by role, machine, SOP, and observed gap.',
    missing: 'Role skill map, SOP acknowledgement, retraining trigger, observed weak evidence, and manager coaching loop.',
    disruption: 'Use real missing-field and late-close patterns to trigger micro-training instead of generic classroom compliance.',
    firstBuild: 'Create a Factory Floor role-training board for the 12 named managers and the SOPs they touch.',
    owner: 'Admin/HR + Plant Manager',
    dataNeeded: ['manager roster', 'SOP files', 'training notes', 'daily entry quality signals'],
    route: '/app/adoption-command',
  },
]

export const YANGON_TYRE_AI_NATIVE_ISO_FEATURES: YangonTyreAiNativeIsoFeature[] = [
  {
    id: 'voice-photo-to-capa',
    name: 'Voice/photo to CAPA record',
    whyItMatters: 'Managers should not need a long form before they contain a defect or machine issue.',
    howItWorks: 'A short Daily Entry note plus photo becomes a routed incident, owner, evidence request, and review gate with CAPA fields hidden underneath.',
    route: '/app/daily-entry',
    status: 'Live + expanding',
  },
  {
    id: 'drive-change-to-owner',
    name: 'Drive change to owner handoff',
    whyItMatters: 'The factory already works in Drive; the system must know which file changed, which lane it belongs to, and who should care.',
    howItWorks: 'Root warehouse change-watch maps new or modified evidence into route, owner, cadence, KPI candidates, and action-board follow-up.',
    route: '/app/change-monitor',
    status: 'Live now',
  },
  {
    id: 'invisible-clause-map',
    name: 'Invisible ISO clause map',
    whyItMatters: 'The plant needs ISO discipline without forcing staff to learn clause language.',
    howItWorks: 'Every entry stores a hidden control class: nonconformance, document control, competence, external provider, release, management review, or improvement.',
    route: '/app/invisible-iso',
    status: 'Live + expanding',
  },
  {
    id: 'quality-story-generator',
    name: 'Evidence-linked quality story',
    whyItMatters: 'Weekly quality review should start from defect pattern, containment status, source evidence, and owner aging, not manual slide rebuilding.',
    howItWorks: 'Quality loss mart and DQMS records produce a role-specific story with defect clusters, repeat issues, closeout age, and source links.',
    route: '/app/dqms',
    status: 'Next build',
  },
  {
    id: 'manager-training-loop',
    name: 'Manager training from real gaps',
    whyItMatters: 'Training should follow observed behavior and missing evidence, not generic classroom topics.',
    howItWorks: 'Adoption and Plant Manager surfaces detect repeated missing fields, late owner reviews, and weak handoffs, then create small training actions.',
    route: '/app/adoption-command',
    status: 'Live + expanding',
  },
  {
    id: 'feature-engineering-promoter',
    name: 'KPI and feature promoter',
    whyItMatters: 'Useful metrics should graduate from file signals into reviewed KPI definitions with lineage.',
    howItWorks: 'Data Fabric keeps candidate KPIs separate from approved KPIs until a manager accepts definition, source, cadence, and review use.',
    route: '/app/data-fabric',
    status: 'Live now',
  },
]
