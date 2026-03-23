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
  name: 'Starter' | 'Control Pack' | 'OS Build'
  timeline: string
  commercialModel: string
  bestFor: string
  deliverables: string[]
}

export type FlagshipSystem = {
  name: string
  tagline: string
  steps: string[]
  bestFor: string
}

export const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Products', to: '/products' },
  { label: 'Tools', to: '/examples' },
  { label: 'Plans', to: '/packages' },
  { label: 'Contact', to: '/contact' },
] as const

export const products: Product[] = [
  {
    kind: 'Free tool',
    name: 'Lead Finder',
    availability: 'Try free',
    tagline: 'Turn a messy list into a cleaner lead sheet in minutes.',
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
    tagline: 'Convert messy headlines into one short operating brief.',
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
    tagline: 'Turn raw updates into owners, priorities, and due windows.',
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
    tagline: 'Turn inboxes, notes, and sheets into one manager action system.',
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
    tagline: 'Catch delay, payment, and customs risk before it hurts operations.',
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
    tagline: 'Turn one quality issue into a tracked close-out chain.',
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
    tagline: 'Put invoices, reminders, and collections into one control view.',
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
    tagline: 'Turn plant updates into one daily execution board.',
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
    tagline: 'Turn scattered market updates into one commercial watch layer.',
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
    name: 'Starter',
    timeline: '2-week sprint',
    commercialModel: 'One free tool + one first workflow',
    bestFor: 'Teams that want one useful win without a heavy rollout.',
    deliverables: ['One live tool setup', 'One operator workflow', 'Simple handover SOP'],
  },
  {
    name: 'Control Pack',
    timeline: '4 to 6 weeks',
    commercialModel: 'Two or three connected workflow templates',
    bestFor: 'Teams fixing a function end-to-end.',
    deliverables: ['Supplier, quality, cash, or ops pack', 'Manager control board', 'Weekly operating rhythm'],
  },
  {
    name: 'OS Build',
    timeline: 'Program rollout',
    commercialModel: 'AI-native operating layer',
    bestFor: 'Companies replacing manual ERP work with one action system.',
    deliverables: ['SuperMega OS foundation', 'Role views', 'Governance and rollout playbook'],
  },
]

export const flagshipSystem: FlagshipSystem = {
  name: 'SuperMega OS',
  tagline: 'An AI-native action layer on top of Gmail, Drive, Sheets, and messy company data.',
  steps: [
    'Pull signals from inboxes, files, and simple team inputs',
    'Convert them into owners, due dates, blockers, and approvals',
    'Run managers and directors from one control layer instead of scattered spreadsheets',
  ],
  bestFor: 'Owner-led companies that are too messy for ERP and too operational for generic AI chat.',
}

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
  'Deploy one workflow template',
  'Ship one manager view',
  'Scale into SuperMega OS',
]
