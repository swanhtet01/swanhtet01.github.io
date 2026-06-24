export const AI_WORKFLOW_DESK_PACKAGE = {
  id: 'ai-workflow-desk',
  name: 'Document Extraction Ledger',
  tagline: 'Turn messy files into a governed review ledger.',
  buyer: 'Owner, operator, admin, finance, sales, support, or manager with one repeated manual workflow.',
  promise:
    'SuperMega turns approved files, screenshots, and exported records into a reviewed ledger with source evidence, extracted fields, exceptions, approval gates, and export proof.',
  firstResult:
    'The client sees which source produced each record, what was extracted, what needs review, what is blocked, and what export is ready next.',
  priceSignal: 'Start with a paid proof sprint, then expand into managed workspace and automation subscription.',
  publicRoute: '/products/ai-workflow-desk',
  appRoute: '/app/documents',
  image: '/site/shots/live-demo-clean-records.svg',
} as const

export const AI_WORKFLOW_DESK_MODULES = [
  {
    label: 'Source Register',
    detail: 'Collect files, sheets, email attachments, exports, and screenshots into one traceable input list.',
    status: 'source-ready',
  },
  {
    label: 'Field Extraction',
    detail: 'Map each incoming file into the output fields the team actually needs, with confidence and provenance.',
    status: 'queue-ready',
  },
  {
    label: 'Exception Queue',
    detail: 'Flag missing values, low-confidence rows, and conflicting source facts before any export is trusted.',
    status: 'guarded',
  },
  {
    label: 'Approval Gate',
    detail: 'Block external sends, money movement, client record writes, and policy changes until a human approves.',
    status: 'required',
  },
  {
    label: 'Export Pack',
    detail: 'Attach the reviewed export, source notes, screenshots, and next-run instructions to the workflow handoff.',
    status: 'proof-ready',
  },
] as const

export const AI_WORKFLOW_DESK_CLIENT_INPUTS = [
  'Five to twenty real files or exported rows',
  'The output fields that matter',
  'Who reviews exceptions and risky actions',
  'Where the final export should go',
  'One example of a correct finished record',
  'Actions that must stay blocked without approval',
] as const

export const AI_WORKFLOW_DESK_QUEUE = [
  {
    title: 'Ingest approved source batch',
    owner: 'Source analyst',
    risk: 'Low',
    evidence: 'Drive folder, PDF export, spreadsheet sample, screenshot set',
    nextAction: 'Build source inventory and propose the ledger schema.',
  },
  {
    title: 'Extract target fields',
    owner: 'Record cleaner',
    risk: 'Medium',
    evidence: 'Approved field list, source sample, reference row',
    nextAction: 'Prepare extracted rows and flag missing values.',
  },
  {
    title: 'Review low-confidence records',
    owner: 'Reviewer',
    risk: 'Medium',
    evidence: 'Confidence flags, source snapshot, exception note',
    nextAction: 'Approve, correct, or hold the record before export.',
  },
  {
    title: 'Prepare export and owner brief',
    owner: 'QA reviewer',
    risk: 'Low',
    evidence: 'Reviewed rows, export preview, source counts, exception totals',
    nextAction: 'Attach the reviewed export and safe next-run notes.',
  },
] as const

export const AI_WORKFLOW_DESK_AGENT_ARMY = [
  {
    role: 'Intake analyst',
    job: 'Turns rough client input into a one-workflow scope and missing-source checklist.',
  },
  {
    role: 'Source cleaner',
    job: 'Extracts, normalizes, deduplicates, and tags source data with confidence and provenance.',
  },
  {
    role: 'Workflow architect',
    job: 'Designs the smallest usable desk: queue, fields, role view, approvals, and first KPI.',
  },
  {
    role: 'Browser operator',
    job: 'Maps repeatable web steps and prepares guarded action plans for human approval.',
  },
  {
    role: 'QA auditor',
    job: 'Checks routes, source links, risky writes, output quality, and evidence before client handoff.',
  },
  {
    role: 'Sales operator',
    job: 'Turns proof into a proposal, follow-up note, expansion map, and case-study packet.',
  },
] as const

export const AI_WORKFLOW_DESK_PROOF_METRICS = [
  ['Source batch', 'approved files loaded'],
  ['Field map', 'output schema agreed'],
  ['Human gate', 'exceptions reviewed before export'],
  ['Proof pack', 'source links, flags, and export notes attached'],
  ['Expansion path', 'next queue ranked after first export'],
] as const
