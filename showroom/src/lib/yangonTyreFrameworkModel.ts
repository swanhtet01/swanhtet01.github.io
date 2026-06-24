export type YangonTyreFrameworkStatus = 'Live now' | 'Ready next' | 'Strategic moat'

export type YangonTyreFrameworkLayer = {
  id: string
  name: string
  status: YangonTyreFrameworkStatus
  standard: string
  purpose: string
  route: string
  modules: string[]
  dataNeeded: string[]
}

export type YangonTyreDataExpansionOpportunity = {
  id: string
  name: string
  status: 'Easy now' | 'Next after showroom' | 'Head office unlock'
  source: string
  why: string
  route: string
  outputs: string[]
}

export type YangonTyreKnowledgeMoat = {
  id: string
  name: string
  advantage: string
  dataSources: string[]
  effect: string
}

export type YangonTyreUxRule = {
  id: string
  title: string
  detail: string
}

export type YangonTyreInvisibleIsoPrinciple = {
  id: string
  title: string
  detail: string
  managerTranslation: string
}

export type YangonTyreInvisibleIsoCoach = {
  id: string
  role: string
  title: string
  oldWay: string
  aiWay: string
  managerPrompt: string
  route: string
}

export type YangonTyreInvisibleIsoCaptureMode = {
  id: string
  name: string
  whenToUse: string
  managerAction: string
  systemOutput: string
  route: string
}

export type YangonTyreInvisibleIsoRoadmapStep = {
  id: string
  label: string
  timing: string
  focus: string
  outcome: string
}

export const YANGON_TYRE_FRAMEWORK_STACK: YangonTyreFrameworkLayer[] = [
  {
    id: 'doc-control',
    name: 'Controlled records and document governance',
    status: 'Live now',
    standard: 'ISO 9001 modeled',
    purpose: 'Keep SOPs, forms, revisions, and evidence under one controlled document system instead of loose Drive memory.',
    route: '/app/knowledge',
    modules: ['Knowledge Control', 'Data Fabric', 'Plant Manager'],
    dataNeeded: ['SOP revisions', 'controlled forms', 'approval history', 'policy acknowledgements'],
  },
  {
    id: 'ncr-capa',
    name: 'Nonconformance, containment, CAPA, and 8D',
    status: 'Live now',
    standard: 'ISO 9001 and IATF-style quality loop',
    purpose: 'Move incidents from complaint or defect into containment, root cause, corrective action, and closure with evidence.',
    route: '/app/dqms',
    modules: ['DQMS', 'Pilot', 'Plant Manager'],
    dataNeeded: ['incident records', 'defect evidence', 'containment actions', 'CAPA closure history'],
  },
  {
    id: 'traceability',
    name: 'Traceability, genealogy, and release evidence',
    status: 'Ready next',
    standard: 'Manufacturing traceability and audit readiness',
    purpose: 'Bind batches, materials, inspections, photos, and release decisions into one searchable quality and production chain.',
    route: '/app/data-fabric',
    modules: ['Data Fabric', 'DQMS', 'Operations Control'],
    dataNeeded: ['batch IDs', 'lot and material references', 'inspection sheets', 'release packets'],
  },
  {
    id: 'oee-reliability',
    name: 'OEE, bottleneck review, and reliability control',
    status: 'Live now',
    standard: 'TPM and industrial engineering',
    purpose: 'Turn downtime, shift blockers, repeat failures, and output loss into one plant-improvement routine.',
    route: '/app/operations',
    modules: ['Operations Control', 'Maintenance Control', 'Plant Manager'],
    dataNeeded: ['downtime logs', 'shift output', 'asset history', 'repeat-failure causes'],
  },
  {
    id: 'supplier-quality',
    name: 'Incoming quality, supplier packets, and approval control',
    status: 'Ready next',
    standard: 'Supplier quality and incoming control',
    purpose: 'Keep GRN, discrepancies, supplier evidence, and release-impacting packets inside one governed approval lane.',
    route: '/app/approvals',
    modules: ['Approvals', 'Receiving Control', 'Data Fabric'],
    dataNeeded: ['GRN records', 'supplier communications', 'COA or compliance docs', 'claim and discrepancy history'],
  },
  {
    id: 'management-review',
    name: 'Management review and cross-functional KPI control',
    status: 'Strategic moat',
    standard: 'ISO management review with AI-native briefing',
    purpose: 'Give leadership one review layer for plant, quality, supply, finance, and commercial signals with evidence-linked actions.',
    route: '/app/plant-manager',
    modules: ['Plant Manager', 'Director', 'Data Fabric'],
    dataNeeded: ['KPI trends', 'exceptions', 'approved decisions', 'cross-functional escalation history'],
  },
] as const

export const YANGON_TYRE_DATA_EXPANSION_OPPORTUNITIES: YangonTyreDataExpansionOpportunity[] = [
  {
    id: 'qc-photos-lab',
    name: 'QC photos, lab sheets, and test evidence',
    status: 'Easy now',
    source: 'Existing QC Drive folders, phone uploads, and inspection sheets',
    why: 'This adds the visual and technical evidence needed for defect clustering, release review, and quality learning.',
    route: '/app/dqms',
    outputs: ['defect image sets', 'test-result lineage', 'quality-loss learning loops'],
  },
  {
    id: 'downtime-and-shift',
    name: 'Downtime, shift, and line-loss logs',
    status: 'Easy now',
    source: 'Production office spreadsheets, shift notes, maintenance records',
    why: 'This is the fastest path to a plant-improvement layer with OEE, bottleneck ranking, and repeat-failure visibility.',
    route: '/app/operations',
    outputs: ['loss-tree cuts', 'bottleneck rankings', 'repeat blocker alerts'],
  },
  {
    id: 'utility-and-energy',
    name: 'Utility, power, steam, and fuel records',
    status: 'Easy now',
    source: 'Admin sheets, meter photos, maintenance logs, monthly reports',
    why: 'Energy and utility instability often explain output and quality variation, especially in manufacturing environments like yours.',
    route: '/app/insights',
    outputs: ['energy-per-output trends', 'utility disruption correlation', 'cost-to-production views'],
  },
  {
    id: 'showroom-sales',
    name: 'Showroom sales, inquiries, invoices, and collections',
    status: 'Next after showroom',
    source: '1 or 2 showroom PCs linked to Drive plus email and chat follow-up',
    why: 'This completes the commercial chain so the system can learn demand, account behavior, payment support, and follow-up quality.',
    route: '/app/revenue',
    outputs: ['account timelines', 'quote and order memory', 'collections support and sales forecasting'],
  },
  {
    id: 'dealer-delivery',
    name: 'Dealer delivery, dispatch, and return patterns',
    status: 'Next after showroom',
    source: 'Sales sheets, dispatch records, complaint logs, delivery trackers',
    why: 'This creates a Myanmar-specific commercial and service moat around what products move, where, and what comes back.',
    route: '/app/revenue',
    outputs: ['dealer health scoring', 'regional demand mix', 'return-pattern intelligence'],
  },
  {
    id: 'head-office-finance',
    name: 'Head office supply-chain, finance, admin, and government docs',
    status: 'Head office unlock',
    source: 'Head office Drive, Gmail, approvals, government-document folders',
    why: 'This final layer turns the system from an operating portal into a full enterprise control plane with finance and governance memory.',
    route: '/app/director',
    outputs: ['enterprise finance packets', 'supply-chain control', 'company and government document governance'],
  },
  {
    id: 'chat-mesh',
    name: 'Viber, LINE, and WeChat decision capture',
    status: 'Head office unlock',
    source: 'Internal and supplier chat groups',
    why: 'Important supplier, sales, and plant decisions are often made in chat first. Capturing them closes one of the biggest blind spots.',
    route: '/app/adoption-command',
    outputs: ['decision evidence', 'task creation', 'shadow-process reduction'],
  },
] as const

export const YANGON_TYRE_KNOWLEDGE_MOATS: YangonTyreKnowledgeMoat[] = [
  {
    id: 'local-manufacturing-signature',
    name: 'Myanmar tyre manufacturing signature',
    advantage: 'Your own production, quality, and operating records are the only direct evidence base for how a privately owned Myanmar tyre maker actually runs.',
    dataSources: ['plant operations records', 'quality and release evidence', 'maintenance and utility logs'],
    effect: 'The AI learns your real loss patterns, process behavior, and operating rhythms instead of generic manufacturing averages.',
  },
  {
    id: 'road-and-market-behavior',
    name: 'Myanmar road and market behavior',
    advantage: 'Dealer, showroom, and return data can teach which tyres move, fail, or succeed under local usage, climate, load, and road conditions.',
    dataSources: ['showroom sales', 'dealer demand', 'complaints and returns', 'commercial follow-up'],
    effect: 'The platform develops product, service, and commercial knowledge that outside ERPs and generic LLMs do not have.',
  },
  {
    id: 'supplier-and-document-reality',
    name: 'Supplier and document reality',
    advantage: 'Your own discrepancy packets, approvals, COA gaps, and government-document flow reveal the real friction in your supply chain.',
    dataSources: ['approvals', 'supplier communications', 'head office documents', 'finance packets'],
    effect: 'The system can predict where supply, payment, or compliance work will stall before it becomes a plant problem.',
  },
  {
    id: 'cross-site-enterprise-memory',
    name: 'Cross-site enterprise memory',
    advantage: 'Factory, showroom, Plant B, and head office together form one unique internal graph of decisions, process changes, and outcomes.',
    dataSources: ['factory nodes', 'showroom nodes', 'head office nodes', 'chat and email evidence'],
    effect: 'This becomes a durable internal knowledge asset that competitors and off-the-shelf systems cannot copy.',
  },
] as const

export const YANGON_TYRE_UX_RULES: YangonTyreUxRule[] = [
  {
    id: 'one-home',
    title: 'One role home first',
    detail: 'Users start from a role-specific home instead of a menu of every tool.',
  },
  {
    id: 'one-desk',
    title: 'One desk per issue',
    detail: 'Each problem belongs to one working desk with one owner, not parallel chats and side sheets.',
  },
  {
    id: 'evidence-first',
    title: 'Evidence before opinion',
    detail: 'Every insight, approval, and escalation should link back to files, messages, forms, or records.',
  },
  {
    id: 'teach-through-routine',
    title: 'Teach through repeated routines',
    detail: 'The UI should train managers by repeated daily and shift review patterns, not by exposing every module at once.',
  },
] as const

export const YANGON_TYRE_INVISIBLE_ISO_DIALECTIC = {
  thesis:
    'Traditional ISO gives the company discipline, repeatability, and audit-ready control, but it usually lands on the floor as paperwork and delay.',
  antithesis:
    'If managers and supervisors are forced to read heavy SOP binders or fill long forms, they will bypass the system, fake updates, or move the work back into chat and memory.',
  synthesis:
    'Invisible ISO keeps the control logic, traceability, and management review inside the platform while the manager experience stays short, voice-first, and operational.',
} as const

export const YANGON_TYRE_INVISIBLE_ISO_PRINCIPLES: YangonTyreInvisibleIsoPrinciple[] = [
  {
    id: 'speak-dont-write',
    title: 'Speak the event, do not write the report',
    detail: 'Managers and supervisors should capture a breakdown, defect, delay, or decision in plain language, photo, or voice, and let the system create the structured record.',
    managerTranslation: 'Tell the system what happened; let the system do the paperwork.',
  },
  {
    id: 'standard-hidden',
    title: 'Keep the standard in the backend',
    detail: 'The platform should enforce containment, root cause, approvals, traceability, and follow-up sequencing even when the person on the floor never sees ISO language.',
    managerTranslation: 'The floor sees a routine. The system sees a standard.',
  },
  {
    id: 'review-not-admin',
    title: 'Managers review and coach, not transcribe',
    detail: 'The plant manager should spend time checking drift, assigning one owner, and teaching the next habit instead of rewriting updates from chat into spreadsheets.',
    managerTranslation: 'Managers should review the work, not re-enter the work.',
  },
  {
    id: 'one-record-chain',
    title: 'One issue should become one evidence chain',
    detail: 'Every breakdown, complaint, supplier hold, or shift loss should flow into one linked record with files, actions, and closure evidence instead of spreading across folders and messaging apps.',
    managerTranslation: 'One issue, one record, one owner, one next move.',
  },
] as const

export const YANGON_TYRE_INVISIBLE_ISO_COACHES: YangonTyreInvisibleIsoCoach[] = [
  {
    id: 'maintenance-root-cause',
    role: 'Maintenance lead',
    title: 'Root-cause copilot for machine failures',
    oldWay: 'Write a long breakdown report and fill a separate 5 Whys sheet after the shift.',
    aiWay: 'Speak the failure in plain language, let the copilot ask a few targeted questions, then log the structured cause, action, and verification step.',
    managerPrompt:
      'My maintenance lead says Extruder 2 motor burned out. Ask me three simple questions to find the likely root cause, then draft the corrective action.',
    route: '/app/maintenance',
  },
  {
    id: 'mixing-standard-work',
    role: 'Mixing supervisor',
    title: 'Dynamic standard-work and morning checklist coach',
    oldWay: 'Read a thick SOP binder and hope the right version is on the floor.',
    aiWay: 'Use a short, role-specific checklist in simple language with the latest standard embedded behind it.',
    managerPrompt:
      'Create a five-step mixing start-up checklist in simple Burmese for today, focused on safety, compound readiness, and the first quality checks.',
    route: '/app/operations',
  },
  {
    id: 'quality-closeout',
    role: 'Quality manager',
    title: 'Containment and CAPA closeout coach',
    oldWay: 'Collect scattered notes, ask for missing photos later, and rebuild the case by hand.',
    aiWay: 'Start from the incident evidence, let the system suggest containment and missing proof, then close the case with one linked record.',
    managerPrompt:
      'Review this defect event and tell me the containment move, the missing evidence, and the simplest 5W1H statement before CAPA starts.',
    route: '/app/dqms',
  },
  {
    id: 'plant-manager-shift-review',
    role: 'Plant manager',
    title: 'Executive shift review and next-action coach',
    oldWay: 'Read raw spreadsheets and chat updates at the end of the day, then decide tomorrow by memory.',
    aiWay: 'Feed the live day records into the plant manager and get one concise review of what went wrong, why it matters, and what to fix first tomorrow.',
    managerPrompt:
      'Act as an industrial engineering chief of staff. Summarize today in three bullets and tell me the one plant move that will improve tomorrow shift flow.',
    route: '/app/plant-manager',
  },
  {
    id: 'admin-automation',
    role: 'Admin and back office',
    title: 'Policy, attendance, and notice drafting assistant',
    oldWay: 'Rebuild notices, HR updates, and policy drafts from scratch every time.',
    aiWay: 'Use the internal evidence and current template to draft notices, explain policy changes, and prepare attendance or admin summaries faster.',
    managerPrompt:
      'Draft a factory notice from today attendance and machine schedule changes. Keep it short, clear, and ready for manager approval.',
    route: '/app/workforce',
  },
] as const

export const YANGON_TYRE_INVISIBLE_ISO_CAPTURE_MODES: YangonTyreInvisibleIsoCaptureMode[] = [
  {
    id: 'voice-incident',
    name: 'Voice incident capture',
    whenToUse: 'Use for breakdowns, quality incidents, supplier issues, and shift delays when speed matters more than typing.',
    managerAction: 'Record a short voice note or dictated summary with one photo if available.',
    systemOutput: 'A structured issue record with timestamp, owner, draft root cause, and next review route.',
    route: '/app/pilot',
  },
  {
    id: 'guided-checklist',
    name: 'Guided checklist capture',
    whenToUse: 'Use for start-of-shift, machine start-up, release, receiving, and daily standard work.',
    managerAction: 'Tap through a short checklist designed for one role and one moment.',
    systemOutput: 'A controlled record with checklist completion, missing checks, and linked evidence.',
    route: '/app/operations',
  },
  {
    id: 'chat-to-decision',
    name: 'Chat and message conversion',
    whenToUse: 'Use when supplier, admin, or management decisions are made first in Viber, LINE, WeChat, or email.',
    managerAction: 'Forward or copy the message into the platform record instead of leaving it buried in chat.',
    systemOutput: 'A decision log, follow-up task, and evidence link tied to the relevant workflow.',
    route: '/app/adoption-command',
  },
  {
    id: 'manager-review-brief',
    name: 'Manager review brief',
    whenToUse: 'Use at the end of the shift or before the morning walkthrough.',
    managerAction: 'Open the plant manager and review the generated summary instead of reading raw notes one by one.',
    systemOutput: 'A short executive brief with the key drift, recommended next move, and the desks to open.',
    route: '/app/plant-manager',
  },
] as const

export const YANGON_TYRE_INVISIBLE_ISO_ROADMAP: YangonTyreInvisibleIsoRoadmapStep[] = [
  {
    id: 'phase-1',
    label: 'Phase 1',
    timing: 'Weeks 1-4',
    focus: 'Turn the most painful daily routines into short capture flows for plant, quality, and maintenance.',
    outcome: 'Managers stop relying on scattered chat and start using one daily review pattern.',
  },
  {
    id: 'phase-2',
    label: 'Phase 2',
    timing: 'Weeks 5-10',
    focus: 'Convert repeated breakdown, defect, and receiving events into structured issue chains with AI-generated follow-up.',
    outcome: 'The platform starts building a real root-cause and process-learning database instead of isolated notes.',
  },
  {
    id: 'phase-3',
    label: 'Phase 3',
    timing: 'Weeks 11-16',
    focus: 'Bring showroom and head-office evidence into the same control layer so management review covers commercial, supply, and finance together.',
    outcome: 'The company begins operating from one evidence-backed ERP-grade review loop.',
  },
] as const
