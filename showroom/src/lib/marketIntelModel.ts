export type CompetitorSource = {
  label: string
  url: string
  observed: string
}

export type ReplacementMapItem = {
  incumbentArea: string
  whatMitSells: string
  supermegaMove: string
  firstProofRoute: string
  buyerQuestion: string
  setupAutomation: string
  confidence: 'now' | 'near' | 'later'
}

export type SeminarAction = {
  phase: string
  goal: string
  actions: string[]
  owner: string
}

export type ClientScript = {
  id: string
  moment: string
  script: string
  followUp: string
}

export type DemoStackItem = {
  name: string
  route: string
  shows: string
  proof: string
}

export const UMFCCI_BUSINESS_AI_EVENT = {
  name: 'Business AI for Digital Transformation Seminar',
  organizer: 'UMFCCI Technology and Innovation Development Committee',
  speaker: 'Dr. Tun Thura Thet, CEO of MIT and EC member of UMFCCI',
  date: 'Monday, May 11, 2026',
  time: '13:00-15:00',
  location: 'Mingalar Hall, UMFCCI, No. 29 Min Ye Kyaw Swar Street, Lanmadaw Township, Yangon',
  registrationDeadline: 'May 10, 2026',
  seats: 200,
}

export const MIT_COMPETITOR_SOURCES: CompetitorSource[] = [
  {
    label: 'MIT products and services',
    url: 'https://www.mit.com.mm/products-and-services',
    observed:
      'ERP, POS, distribution, loyalty, e-commerce, HCM, hotel, education, hospital, core banking, mobile banking, dashboards, software development, security, cloud, database, and DevOps services.',
  },
  {
    label: 'MIT corporate overview',
    url: 'https://www.mit.com.mm/',
    observed:
      'Long-running Myanmar enterprise software integrator with hundreds of staff, regional offices, ISO posture, and Microsoft, Oracle, and SAP credibility.',
  },
  {
    label: 'MIT strategic partners',
    url: 'https://www.mit.com.mm/strategic-partners',
    observed:
      'SAP, Microsoft, and Oracle partner posture is the trust moat for large enterprise and banking buyers.',
  },
  {
    label: 'Kaizentic.ai',
    url: 'https://www.mit.com.mm/kaizentic-ai',
    observed:
      'MIT is now positioning an embedded enterprise agentic AI layer with data intelligence, agentic actions, RBAC, multi-agent support, multilingual access, private cloud, and on-prem deployment.',
  },
]

export const SUPERMEGA_POSITIONING = {
  thesis:
    'MIT is strong where Myanmar buyers want proven implementation, licensed enterprise platforms, and long-term support. SuperMega should beat them in the AI-native layer: faster diagnosis, role portals, source-grounded data workflows, agent-run operations, and cheaper first-value pilots.',
  wedge:
    'Offer a 7-day Business AI Readiness Sprint that turns one messy workflow into a live portal, source map, approval queue, and AI assistant before the client commits to a multi-year ERP project.',
  proof:
    'Show app.supermega.dev as the operating surface, ytf.supermega.dev as the industrial tenant blueprint, pos.supermega.dev as the Service Desk POS proof host, and Founder Machine as the internal product factory.',
  boundary:
    'Do not claim SuperMega replaces regulated core banking or SAP-scale implementations today. Claim that SuperMega replaces the slow discovery, dashboard, manual reporting, and first automation layer around those systems.',
}

export const SUPERMEGA_REPLACEMENT_MAP: ReplacementMapItem[] = [
  {
    incumbentArea: 'ERP, POS, distribution, inventory',
    whatMitSells: 'V6 ERP, V6 POS, SD Lite, mDistribution, loyalty, e-commerce.',
    supermegaMove: 'AI Operations OS with daily entry, action board, source-backed owner brief, inventory/receiving controls, and agent follow-up.',
    firstProofRoute: '/app/erp',
    buyerQuestion: 'Which daily decision still depends on WhatsApp, Excel, paper, or asking a manager manually?',
    setupAutomation: 'Import one spreadsheet/export, create roles, map daily entry fields, generate actions, and publish a manager workspace.',
    confidence: 'now',
  },
  {
    incumbentArea: 'HCM and attendance',
    whatMitSells: 'A365 App, HCM, attendance, leave, claims, directory, and AI insights.',
    supermegaMove: 'People Ops mini-portal with attendance exceptions, approval queue, policy Q&A, and manager follow-up agents.',
    firstProofRoute: '/app/manager-system',
    buyerQuestion: 'What HR question or approval takes more than one day because data is scattered?',
    setupAutomation: 'Start with staff list, attendance export, policy docs, leave form, and approval roles.',
    confidence: 'near',
  },
  {
    incumbentArea: 'Hospital, hotel, school vertical systems',
    whatMitSells: 'iTHIS, Hotelia, LMS and SMS modules for vertical operations.',
    supermegaMove: 'Vertical portal kits: role home, intake, document control, daily brief, service recovery, and client-specific AI assistant.',
    firstProofRoute: '/app/portal-factory',
    buyerQuestion: 'Which department needs a clean first screen more than a full system replacement?',
    setupAutomation: 'Use Portal Launch Sprint to choose industry, roles, data sources, intake forms, approvals, and proof route.',
    confidence: 'near',
  },
  {
    incumbentArea: 'Analytics and executive dashboards',
    whatMitSells: 'Executive dashboards and company performance views.',
    supermegaMove: 'Source-grounded daily brief with anomalies, next actions, evidence, and operator ownership instead of passive charts.',
    firstProofRoute: '/app/director',
    buyerQuestion: 'What dashboard do people ignore because it does not tell anyone what to do next?',
    setupAutomation: 'Connect the metric source, define review cadence, create exception rules, and route actions to owners.',
    confidence: 'now',
  },
  {
    incumbentArea: 'Cloud, Microsoft, Oracle, SAP, database, DevOps',
    whatMitSells: 'Implementation and support around Microsoft 365, Azure, AWS, Google Cloud, Oracle, SAP BTP, Odoo, databases, and software development.',
    supermegaMove: 'AI readiness layer over existing systems: connectors, data catalog, role permissions, process automation, and agent evidence ledger.',
    firstProofRoute: '/app/data-fabric',
    buyerQuestion: 'Which system already has the data, but nobody can safely ask questions or trigger follow-up from it?',
    setupAutomation: 'Catalog systems, choose read-only connectors first, set role scopes, and create a governed assistant workspace.',
    confidence: 'now',
  },
  {
    incumbentArea: 'Kaizentic-style enterprise AI',
    whatMitSells: 'Embedded AI layer for MIT systems with agentic actions, RBAC, private cloud, on-prem, and multilingual support.',
    supermegaMove: 'Agent workforce that is system-agnostic: it can sit on top of Drive, Sheets, Gmail, ERP exports, Postgres, and custom portals.',
    firstProofRoute: '/app/founder-machine',
    buyerQuestion: 'Do you want AI inside one vendor suite, or an AI operating layer across the messy tools you already use?',
    setupAutomation: 'Create a bounded agent, source contract, approval gate, rollback path, and first action queue.',
    confidence: 'now',
  },
  {
    incumbentArea: 'Core banking and regulated systems',
    whatMitSells: 'Oracle FLEXCUBE, iCBS, mBanking, and banking integration.',
    supermegaMove: 'Do not attack core banking first. Offer compliance-safe AI around reporting, policy search, internal workflows, and customer service preparation.',
    firstProofRoute: '/app/security',
    buyerQuestion: 'Which non-transactional banking workflow can be improved without touching the core ledger?',
    setupAutomation: 'Start read-only, restrict scope, log evidence, require approval, and keep regulated writes out of scope.',
    confidence: 'later',
  },
]

export const SEMINAR_PLAYBOOK: SeminarAction[] = [
  {
    phase: 'Before event',
    goal: 'Arrive with a clear wedge and proof links instead of a vague AI pitch.',
    actions: [
      'Register and prepare a one-page SuperMega Business AI Readiness Sprint offer.',
      'Open app.supermega.dev, ytf.supermega.dev, and pos.supermega.dev on phone and laptop.',
      'Prepare three buyer questions: workflow pain, current data source, and approval owner.',
      'Prepare one Myanmar SME story: messy data into daily actions in under one week.',
    ],
    owner: 'Founder plus Founder Machine',
  },
  {
    phase: 'During seminar',
    goal: 'Learn MIT positioning and collect buyer pain, not argue with the speaker.',
    actions: [
      'Record exact buyer objections: budget, trust, local support, data privacy, staff adoption.',
      'Ask one sharp question about AI ROI measurement and one about first workflow selection.',
      'Meet companies with existing ERP/POS/HCM pain and offer a no-pressure workflow audit.',
      'Avoid saying replace MIT; say AI layer on top of existing systems with faster first value.',
    ],
    owner: 'Founder plus Growth Operator',
  },
  {
    phase: 'After event',
    goal: 'Turn contacts into concrete proof routes and paid discovery.',
    actions: [
      'Send same-day follow-up with one relevant route and one proposed workflow audit.',
      'Log leads into the growth queue with industry, system, pain, decision owner, and follow-up date.',
    'Create one proof workspace per serious prospect using Portal Launch Sprint.',
      'Ship a public recap page or private proposal within 48 hours.',
    ],
    owner: 'Founder plus Client Delivery Analyst',
  },
]

export const CLIENT_COMMS_PACK: ClientScript[] = [
  {
    id: 'opening',
    moment: 'At the seminar',
    script:
      'We are building SuperMega as an AI operating layer for Myanmar companies. Instead of replacing your ERP first, we start with one workflow where your data is already available but action is still manual.',
    followUp: 'Ask: what is one report, approval, or follow-up your team still handles manually every week?',
  },
  {
    id: 'mit-comparison',
    moment: 'If they mention MIT, SAP, Oracle, Odoo, or Microsoft',
    script:
      'Those systems are useful as systems of record. SuperMega is the action layer: role portals, AI assistants, evidence, approvals, and owner briefs across the tools you already use.',
    followUp: 'Offer a read-only first sprint so there is no risky writeback to core systems.',
  },
  {
    id: 'privacy',
    moment: 'If they worry about company data',
    script:
      'The first version can be read-only, source-scoped, and approval-based. Every answer should cite source context, and every external action should have a human approval gate.',
    followUp: 'Show the agent evidence and approval model before asking for any sensitive connector.',
  },
  {
    id: 'close',
    moment: 'After a good conversation',
    script:
      'If you give us one workflow and one sample export or document folder, we can map the portal, roles, data source, and first AI action queue. Then you can decide whether it is worth expanding.',
    followUp: 'Book a 30-minute workflow audit and send the setup checklist.',
  },
]

export const SEMINAR_DEMO_STACK: DemoStackItem[] = [
  {
    name: 'Founder Machine',
    route: '/app/founder-machine',
    shows: 'How SuperMega turns market signals into product bets, agent crews, release gates, and sellable modules.',
    proof: 'This is the internal machine that makes SuperMega more than a normal dev shop.',
  },
  {
    name: 'Prototype Forge',
    route: '/app/prototype-forge',
    shows: 'How SuperMega turns SAP, MIT, Nirvasoft, Kaizentic, and open-source agent patterns into working general-use tools.',
    proof: 'This is the SaaS-killer catalog: data room, browser worker, market research room, ERP action layer, portal-in-a-week, and security drill.',
  },
  {
    name: 'Factory Client industrial portal',
    route: '/app/portal',
    shows: 'Role-based plant workspace, source-grounded operations, daily actions, data quality, and management views.',
    proof: 'A concrete Myanmar industrial tenant blueprint, not a generic AI deck.',
  },
  {
    name: 'AI ERP and operations',
    route: '/app/erp',
    shows: 'Daily entry, operational modules, review flow, and role-specific views that can sit beside existing ERP.',
    proof: 'Faster first value than a full ERP replacement.',
  },
  {
    name: 'Data Fabric',
    route: '/app/data-fabric',
    shows: 'How source systems become searchable, governed, role-aware operating context for AI agents.',
    proof: 'The bridge from messy Drive/Sheets/exports to reliable business AI.',
  },
  {
    name: 'Growth Machine',
    route: '/app/revenue/growth',
    shows: 'Lead queue, campaign prep, buyer segmentation, and follow-up operations.',
    proof: 'SuperMega can run its own sales loop and sell the same loop to clients.',
  },
  {
    name: 'Service Desk POS',
    route: '/app/service-desk',
    shows: 'Simple owner-led POS, daily close, service recovery, and cloud continuity wedge.',
    proof: 'Small businesses can get value without enterprise-scale procurement.',
  },
]
