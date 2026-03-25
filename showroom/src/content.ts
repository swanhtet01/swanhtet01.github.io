export type TrialModule = {
  id: 'lead-finder' | 'market-brief' | 'action-board'
  name: string
  promise: string
  testInput: string
}

export type Product = {
  kind: 'Free tool' | 'Control module'
  name: string
  availability: 'Try free' | 'Deploy'
  tagline: string
  buyer: string
  input: string
  output: string
  fit: string
  connectors: string[]
  requiredData: string[]
  workflow: string[]
  deliverables: string[]
  variants: string[]
  adaptation: string
  exampleId?: TrialModule['id']
}

export type SellableTemplate = {
  name: string
  lane: 'Run the day' | 'Control risk' | 'Commercial watch'
  buyer: string
  problem: string
  useWhen: string
  timeToFirstLiveOutput: string
  primaryOperator: string
  firstWeekOutcome: string
  requiredData: string[]
  outputs: string[]
  rollout: string
  reusePattern: string
}

export type PackageTier = {
  name: 'Pilot Sprint' | 'Control Build' | 'OS Rollout'
  timeline: string
  commercialModel: string
  bestFor: string
  deliverables: string[]
}

export type ServicePack = {
  name: 'Owner / Director OS' | 'Factory Control' | 'Commercial Control'
  audience: string
  promise: string
  bestFor: string
  includes: string[]
  outcomes: string[]
  rollout: string
}

export type ProofPoint = {
  label: string
  value: string
  detail: string
}

export type FlagshipSystem = {
  name: string
  tagline: string
  steps: string[]
  bestFor: string
}

export type MiniProduct = {
  name: string
  tagline: string
  bestFor: string
  data: string
  note: string
}

export const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Services', to: '/products' },
  { label: 'Free tools', to: '/examples' },
  { label: 'How we work', to: '/packages' },
  { label: 'Contact', to: '/contact' },
] as const

export const products: Product[] = [
  {
    kind: 'Free tool',
    name: 'Lead Finder',
    availability: 'Try free',
    tagline: 'Find clean business leads from messy directories in minutes.',
    buyer: 'Growth lead or founder',
    input: 'Directory text, URL, or pasted lead list',
    output: 'Scored leads, contact pack, CSV export',
    fit: 'Sales, partnerships, and outbound teams.',
    connectors: ['Pasted text', 'Directory URLs'],
    requiredData: ['Lead list or source page', 'ICP keywords', 'Optional scoring rules'],
    workflow: ['Parse source', 'Extract contacts', 'Score fit', 'Export shortlist'],
    deliverables: ['Lead score', 'Contact cleanup', 'CSV export'],
    variants: ['Distributors', 'Retail stores', 'Industrial buyers'],
    adaptation: 'Reuse the same parser and scoring engine. Swap the ICP keywords, lead fields, and scoring logic for each client.',
    exampleId: 'lead-finder',
  },
  {
    kind: 'Free tool',
    name: 'News Brief',
    availability: 'Try free',
    tagline: 'Turn public signals into one director-ready brief.',
    buyer: 'Director or market-watch owner',
    input: 'Headlines, copied articles, or pasted notes',
    output: 'Priority summary, risk tags, next actions',
    fit: 'Directors, founders, and market-watch teams.',
    connectors: ['Pasted headlines', 'Saved watchlists'],
    requiredData: ['Headlines or articles', 'Risk categories', 'Sector context'],
    workflow: ['Group signals', 'Tag themes', 'Write short brief', 'Suggest actions'],
    deliverables: ['Risk tags', 'Short brief', 'Next actions'],
    variants: ['News watch', 'Market watch', 'Policy watch'],
    adaptation: 'Reuse the same briefing engine. Swap the source pack, theme tags, and escalation rules per client.',
    exampleId: 'market-brief',
  },
  {
    kind: 'Free tool',
    name: 'Action Board',
    availability: 'Try free',
    tagline: 'Convert raw updates into owners, due dates, and next actions.',
    buyer: 'Manager or operations lead',
    input: 'Team updates, forwarded notes, or meeting scraps',
    output: 'Action list, priority lane, owner queue',
    fit: 'Operations, projects, and plant management.',
    connectors: ['Pasted updates', 'Meeting notes'],
    requiredData: ['Raw updates', 'Owner list or team map', 'Due-date rule'],
    workflow: ['Split updates', 'Infer owner', 'Set priority', 'Build action board'],
    deliverables: ['Owner queue', 'Priority lane', 'Due window'],
    variants: ['Daily standup', 'Director review', 'Follow-up tracker'],
    adaptation: 'Reuse the same action engine. Swap the owner map, lane names, and escalation timing for each client.',
    exampleId: 'action-board',
  },
  {
    kind: 'Control module',
    name: 'Action OS',
    availability: 'Deploy',
    tagline: 'Run one management board across Gmail, Drive, Sheets, and team updates.',
    buyer: 'Founder, GM, or operations director',
    input: 'Daily update sheet, forwarded notes, and role owner list',
    output: 'Action board, blocker queue, owner + due-date system',
    fit: 'Owner-led teams that need one working management layer first.',
    connectors: ['Sheets', 'Gmail', 'Drive'],
    requiredData: ['Daily update source', 'Owner map', 'Simple tracker or board'],
    workflow: ['Ingest updates', 'Classify urgency', 'Assign owner', 'Publish manager and director views'],
    deliverables: ['Action board', 'Blocker queue', 'Director summary'],
    variants: ['Daily ops OS', 'Director OS', 'Project follow-up OS'],
    adaptation: 'Reuse the same action operating model. Swap the owner map, review cadence, and issue taxonomy per client.',
  },
  {
    kind: 'Control module',
    name: 'Supplier Watch',
    availability: 'Deploy',
    tagline: 'See supplier delay, payment, and customs risk before it hits production.',
    buyer: 'Procurement manager or director',
    input: 'Supplier emails, ETA sheets, customs notes',
    output: 'Risk score, escalation queue, owner + due date',
    fit: 'Procurement and supply chain teams.',
    connectors: ['Gmail', 'Drive', 'Sheets'],
    requiredData: ['Supplier mailbox or forwarded mails', 'PO / ETA sheet', 'Supplier master list'],
    workflow: ['Ingest supplier signals', 'Classify risk', 'Assign owner', 'Track escalation'],
    deliverables: ['Risk score', 'Escalation board', 'Follow-up owner list'],
    variants: ['Import watch', 'Supplier delay watch', 'Documentation watch'],
    adaptation: 'Reuse the same core workflow. Swap supplier aliases, procurement docs, and risk rules per client.',
  },
  {
    kind: 'Control module',
    name: 'Quality Closeout',
    availability: 'Deploy',
    tagline: 'Turn one quality issue into a tracked closeout chain with ownership.',
    buyer: 'Quality head or plant manager',
    input: 'Incident text, severity, supplier, evidence',
    output: 'Incident record, containment, RCA, CAPA chain',
    fit: 'Quality teams and plant managers.',
    connectors: ['Gmail', 'Drive', 'Incident sheet'],
    requiredData: ['Issue intake', 'Evidence links', 'Severity rules', 'Owner map'],
    workflow: ['Log issue', 'Contain', 'Draft RCA', 'Track CAPA', 'Verify closeout'],
    deliverables: ['Incident register', 'CAPA chain', 'Closure checklist'],
    variants: ['Supplier NC', 'Customer complaint', 'Internal defect'],
    adaptation: 'Reuse the same closeout engine. Swap taxonomy, severity logic, and approval steps per client.',
  },
  {
    kind: 'Control module',
    name: 'Cash Watch',
    availability: 'Deploy',
    tagline: 'Put invoices, payment follow-up, and collections into one control view.',
    buyer: 'Finance lead or commercial controller',
    input: 'Invoice sheets, cash books, payment notes',
    output: 'Overdue queue, collections list, follow-up drafts',
    fit: 'Finance and commercial control.',
    connectors: ['Drive', 'Sheets', 'Gmail'],
    requiredData: ['Invoice register', 'Cash book or AR sheet', 'Payment reminder emails'],
    workflow: ['Match invoice and payment', 'Rank overdue items', 'Assign owner', 'Draft follow-up'],
    deliverables: ['Overdue queue', 'Collections list', 'Follow-up drafts'],
    variants: ['Collections', 'Invoice control', 'Payment confirmation'],
    adaptation: 'Reuse the same control logic. Swap invoice schema, aging rules, and follow-up cadence per client.',
  },
  {
    kind: 'Control module',
    name: 'Production Pulse',
    availability: 'Deploy',
    tagline: 'Turn shift updates and downtime into one daily plant control board.',
    buyer: 'Plant manager or operations director',
    input: 'Shift updates, downtime notes, output logs',
    output: 'Daily plant brief, blocker queue, owner actions',
    fit: 'Operations managers and plant leads.',
    connectors: ['Sheets', 'Drive', 'Mobile forms'],
    requiredData: ['Shift updates', 'Downtime log', 'Plan vs actual source'],
    workflow: ['Collect shift updates', 'Detect blockers', 'Rank actions', 'Publish plant brief'],
    deliverables: ['Plant brief', 'Blocker queue', 'Owner actions'],
    variants: ['Shift handover', 'Downtime watch', 'Plan vs actual'],
    adaptation: 'Reuse the same plant workflow. Swap shift structure, KPI logic, and escalation ladder per client.',
  },
  {
    kind: 'Control module',
    name: 'Sales Signal',
    availability: 'Deploy',
    tagline: 'Turn scattered market and distributor updates into one commercial watch.',
    buyer: 'Commercial lead or founder',
    input: 'Distributor notes, sales sheets, market headlines',
    output: 'Demand shift alerts, watchlist, follow-up actions',
    fit: 'Commercial teams, directors, and founders.',
    connectors: ['Sheets', 'Gmail', 'External watch'],
    requiredData: ['Distributor updates', 'Sales sheet', 'External source pack'],
    workflow: ['Collect signals', 'Detect shift', 'Tag impact', 'Assign commercial action'],
    deliverables: ['Demand watch', 'Channel alerts', 'Commercial actions'],
    variants: ['Distributor watch', 'Market watch', 'Price watch'],
    adaptation: 'Reuse the same commercial engine. Swap channels, sources, and signal thresholds per client.',
  },
]

export const sellableTemplates: SellableTemplate[] = [
  {
    name: 'Action OS',
    lane: 'Run the day',
    buyer: 'Founders, directors, plant and operations managers',
    problem: 'Important work is buried across inboxes, sheets, and verbal updates.',
    useWhen: 'When the team still runs on chat, forwarded notes, and sticky follow-up.',
    timeToFirstLiveOutput: '1 to 2 days',
    primaryOperator: 'Operations lead',
    firstWeekOutcome: 'One live owner queue with due dates and blocker review.',
    requiredData: ['Daily update sheet', 'Forwarded notes or emails', 'Owner list', 'Simple tracker'],
    outputs: ['Action board', 'Owner queue', 'Blocker list', 'Director summary'],
    rollout: 'Start with one update source and one owner list, then add write-back and review rhythm.',
    reusePattern: 'Swap the input source, owner mapping, and issue taxonomy. Keep the same action engine.',
  },
  {
    name: 'Supplier Watch',
    lane: 'Control risk',
    buyer: 'Procurement managers and supply chain leads',
    problem: 'Delay, payment, and customs risk shows up too late.',
    useWhen: 'When supplier threads are scattered and delay only gets noticed after it hurts output.',
    timeToFirstLiveOutput: '2 to 3 days',
    primaryOperator: 'Procurement manager',
    firstWeekOutcome: 'A live supplier risk queue with owner, date, and escalation status.',
    requiredData: ['Supplier emails', 'PO or ETA sheet', 'Payment status', 'Supplier master'],
    outputs: ['Supplier risk board', 'Escalation queue', 'Owner follow-up list', 'Reply draft support'],
    rollout: 'Connect one mailbox and ETA sheet first, then add escalation rules and review cadence.',
    reusePattern: 'Swap supplier list, shipment fields, payment rules, and escalation thresholds.',
  },
  {
    name: 'Quality Closeout',
    lane: 'Control risk',
    buyer: 'Quality managers and plant managers',
    problem: 'Issues get logged, but CAPA follow-up breaks after the first report.',
    useWhen: 'When quality incidents exist, but no one owns the closeout chain end to end.',
    timeToFirstLiveOutput: '2 to 4 days',
    primaryOperator: 'Quality head',
    firstWeekOutcome: 'One incident-to-CAPA board with containment, owner, and verification steps.',
    requiredData: ['Incident log', 'Complaint emails', 'Evidence links', 'Owner list'],
    outputs: ['Incident register', 'CAPA chain', 'Closure checklist', 'Trend view'],
    rollout: 'Connect intake first, then run incident-to-CAPA workflow, then add closure discipline.',
    reusePattern: 'Swap defect taxonomy, severity rules, evidence standards, and ownership map.',
  },
  {
    name: 'Cash Watch',
    lane: 'Control risk',
    buyer: 'Finance managers and commercial controllers',
    problem: 'Collections risk is visible too late and follow-up is weak.',
    useWhen: 'When invoices, reminders, and payment proof live in different places.',
    timeToFirstLiveOutput: '2 to 3 days',
    primaryOperator: 'Finance lead',
    firstWeekOutcome: 'One overdue queue with collection priority and follow-up drafts.',
    requiredData: ['Invoice register', 'Cash book', 'Payment emails', 'Customer master'],
    outputs: ['Overdue queue', 'Collection priority list', 'Promised-payment tracker', 'Cash summary'],
    rollout: 'Connect invoice and cash data first, then add owner workflow and weekly review.',
    reusePattern: 'Swap invoice schema, aging rules, customer segments, and escalation logic.',
  },
  {
    name: 'Sales Signal',
    lane: 'Commercial watch',
    buyer: 'Sales managers and commercial directors',
    problem: 'Demand shifts and channel signals are not turned into action quickly enough.',
    useWhen: 'When sales, distributor notes, and market headlines need one watch layer.',
    timeToFirstLiveOutput: '1 to 2 days',
    primaryOperator: 'Commercial lead',
    firstWeekOutcome: 'One demand-shift brief with a live follow-up queue.',
    requiredData: ['Sales update sheet', 'Distributor notes', 'Market headlines', 'Channel master'],
    outputs: ['Sales signal brief', 'Demand-shift watchlist', 'Follow-up queue', 'Weekly summary'],
    rollout: 'Connect one channel update source first, then add signals, follow-up, and weekly rhythm.',
    reusePattern: 'Swap channel structure, product categories, and pricing assumptions without changing the signal engine.',
  },
  {
    name: 'Production Pulse',
    lane: 'Run the day',
    buyer: 'Plant managers and operations directors',
    problem: 'Shift updates and downtime notes do not become one daily execution view.',
    useWhen: 'When production updates arrive by chat, paper, or partial sheets and need one clean board.',
    timeToFirstLiveOutput: '2 to 4 days',
    primaryOperator: 'Plant manager',
    firstWeekOutcome: 'One daily plant brief with blockers, owners, and plan-vs-actual notes.',
    requiredData: ['Shift updates', 'Downtime log', 'Plan vs actual source'],
    outputs: ['Plant brief', 'Blocker queue', 'Owner actions', 'Daily summary'],
    rollout: 'Connect shift updates first, then rank blockers, then add recurring plant review rhythm.',
    reusePattern: 'Swap plant structure, KPI rules, and escalation ladder without changing the operating pattern.',
  },
]

export const packages: PackageTier[] = [
  {
    name: 'Pilot Sprint',
    timeline: '2 weeks',
    commercialModel: 'One workflow, one owner board, one weekly review',
    bestFor: 'Teams that need one useful live result fast.',
    deliverables: ['One connected workflow', 'One manager board', 'Pilot handover SOP'],
  },
  {
    name: 'Control Build',
    timeline: '4 to 6 weeks',
    commercialModel: 'Two or three connected modules around one team',
    bestFor: 'Teams fixing a function end to end.',
    deliverables: ['Connected module pack', 'Role-based control views', 'Operating rhythm and SOP'],
  },
  {
    name: 'OS Rollout',
    timeline: 'Phased program',
    commercialModel: 'Shared action layer, records, approvals, and role views',
    bestFor: 'Companies replacing manual ERP work step by step.',
    deliverables: ['SuperMega OS foundation', 'Manager and director views', 'Rollout playbook'],
  },
]

export const flagshipSystem: FlagshipSystem = {
  name: 'SuperMega OS',
  tagline: 'An AI-native operating layer on top of Gmail, Drive, Sheets, and the records companies already have.',
  steps: [
    'Pull signals from inboxes, files, and simple team inputs',
    'Convert them into owners, due dates, blockers, and approvals',
    'Run managers and directors from one control layer instead of scattered trackers',
  ],
  bestFor: 'Owner-led companies that need control now and ERP replacement later.',
}

export const miniProducts: MiniProduct[] = [
  {
    name: 'Attendance Check-In',
    tagline: 'Simple shift attendance with photo-assisted proof.',
    bestFor: 'Factories, warehouses, and field teams that still run attendance manually.',
    data: 'Name, shift, station, status, optional photo link',
    note: 'Live now as a minimal attendance event workflow. Face matching is a later add-on, not fake-magic day one.',
  },
  {
    name: 'Reply Draft',
    tagline: 'Turn supplier or customer threads into a cleaner response draft.',
    bestFor: 'Procurement, sales, and directors who answer the same thread types repeatedly.',
    data: 'One email thread or copied message',
    note: 'Best used beside Supplier Watch, Cash Watch, or Sales Signal.',
  },
  {
    name: 'Document Intake',
    tagline: 'Turn a messy file or email into one structured record.',
    bestFor: 'Teams handling invoices, complaints, shipment docs, and quality evidence.',
    data: 'Drive file, email snippet, or pasted note',
    note: 'This is the fast lane into larger modules because it cleans the intake first.',
  },
  {
    name: 'Director Flash',
    tagline: 'One short management brief from the latest actions and signals.',
    bestFor: 'Owners and directors who need one command view instead of ten updates.',
    data: 'Current action board, market notes, and top exceptions',
    note: 'Works as a daily or weekly summary surface on top of the main system.',
  },
]

export const trialModules: TrialModule[] = [
  {
    id: 'lead-finder',
    name: 'Lead Finder',
    promise: 'Paste leads in. Get a cleaner contact pack out.',
    testInput: 'Lead list or URL',
  },
  {
    id: 'market-brief',
    name: 'News Brief',
    promise: 'Paste headlines in. Get one short market brief out.',
    testInput: 'Headlines or notes',
  },
  {
    id: 'action-board',
    name: 'Action Board',
    promise: 'Paste raw updates. Get owners and due dates out.',
    testInput: 'Daily notes or updates',
  },
]

export const engagementFlow = [
  'Try one free tool',
  'Connect one live data source',
  'Ship one manager view',
  'Scale into SuperMega OS',
]

export const servicePacks: ServicePack[] = [
  {
    name: 'Owner / Director OS',
    audience: 'Owners, directors, and general managers',
    promise: 'One place to see what matters, who owns it, and what is blocked.',
    bestFor: 'Owner-led companies that still run on Gmail, Drive, WhatsApp, and spreadsheets.',
    includes: ['Action OS', 'Director Flash', 'Document Intake'],
    outcomes: ['Daily priority board', 'Weekly director brief', 'Cleaner follow-up discipline'],
    rollout: 'Start with one action board and one summary rhythm. Add approvals and role views after the first win.',
  },
  {
    name: 'Factory Control',
    audience: 'Plant managers, operations leads, and quality teams',
    promise: 'One control layer for supplier risk, quality issues, and plant execution.',
    bestFor: 'Factories and operations teams that need control before a full ERP rollout.',
    includes: ['Supplier Watch', 'Quality Closeout', 'Production Pulse', 'Attendance Check-In'],
    outcomes: ['Supplier risk queue', 'Incident-to-CAPA board', 'Daily plant brief'],
    rollout: 'Start with one plant or one incoming-material workflow. Expand into receiving, inventory, and approvals.',
  },
  {
    name: 'Commercial Control',
    audience: 'Commercial leads, finance managers, and founders',
    promise: 'Turn invoices, market signals, and follow-up into one commercial control layer.',
    bestFor: 'Trading, distribution, and owner-managed sales teams.',
    includes: ['Cash Watch', 'Sales Signal', 'Reply Draft', 'Document Intake'],
    outcomes: ['Overdue queue', 'Demand-shift watchlist', 'Faster follow-up and reply support'],
    rollout: 'Start with cash or sales first, then connect the second workflow once the first board is live.',
  },
]

export const proofPoints: ProofPoint[] = [
  {
    label: 'Pilot client',
    value: 'Yangon Tyre',
    detail: 'Live pilot using Gmail, Drive, Sheets, and shared team inputs.',
  },
  {
    label: 'Connected sources',
    value: 'Gmail + Drive + Sheets',
    detail: 'The system already reads the tools teams use today instead of asking for a big rip-and-replace first.',
  },
  {
    label: 'Control outputs',
    value: 'Actions, supplier risk, quality closeout',
    detail: 'The pilot already publishes real queues and role-based outputs instead of static reports.',
  },
  {
    label: 'Rollout model',
    value: 'Template-based',
    detail: 'The same modules are meant to be reused for other clients by swapping context, owners, and thresholds.',
  },
]
