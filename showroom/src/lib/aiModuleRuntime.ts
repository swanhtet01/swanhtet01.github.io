import type { PortalModuleContract } from './portalModuleContracts'

export type AiModuleRuntimeProfile = {
  moduleId: string
  name: string
  autonomy: 'assist' | 'prepare' | 'recommend' | 'writeback-gated'
  modelPattern: string
  llmJobs: string[]
  tools: string[]
  memory: string[]
  outputArtifacts: string[]
  guardrails: string[]
  evals: string[]
  actionPolicy: string
  firstRun: string
}

const sharedIndustrialTools = ['Drive search', 'Gmail search', 'Sheets parser', 'Evidence ledger', 'Approval queue']
const sharedRestaurantTools = ['Menu parser', 'POS import', 'Review intake', 'Invoice parser', 'Payment export', 'Local workspace']

const profileOverrides: Record<string, Partial<AiModuleRuntimeProfile>> = {
  'industrial-plant-manager-home': {
    autonomy: 'recommend',
    llmJobs: ['Shift brief', 'Top blocker triage', 'Owner handoff draft'],
    tools: ['Daily entry', 'Action board', 'Data fabric', 'Approval queue'],
    outputArtifacts: ['Daily focus card', 'Shift handover', 'Blocker owner map'],
    firstRun: 'Read new entries and changed sources, then prepare the one blocker the plant manager should review first.',
  },
  'industrial-dqms-control': {
    autonomy: 'writeback-gated',
    llmJobs: ['NCR draft', '5W1H completion', 'Ishikawa branch proposal', 'CAPA packet'],
    tools: ['QC sheet parser', 'Photo evidence', 'Complaint email search', 'Trace pack builder', 'Approval queue'],
    outputArtifacts: ['Containment packet', 'Root-cause draft', 'CAPA verification plan'],
    evals: ['Missing lot or batch evidence', 'Unverified root-cause claim', 'CAPA has measurable verification'],
    firstRun: 'Open the newest quality issue, extract facts, classify missing evidence, and draft a containment decision for human approval.',
  },
  'industrial-receiving-control': {
    autonomy: 'prepare',
    llmJobs: ['Supplier discrepancy packet', 'COA mismatch review', 'Claim email draft'],
    tools: ['PO/PI parser', 'Invoice parser', 'Receiving photo intake', 'Supplier history'],
    outputArtifacts: ['Supplier claim packet', 'Hold/release recommendation', 'Receiving exception record'],
    firstRun: 'Compare receiving evidence to supplier documents and prepare the claim or hold packet.',
  },
  'industrial-maintenance-reliability': {
    autonomy: 'recommend',
    llmJobs: ['Repeat fault clustering', 'PM risk list', 'Restart risk note'],
    tools: ['Breakdown log', 'PM checklist', 'Spares register', 'Technician notes'],
    outputArtifacts: ['MTBF/MTTR story', 'Repeat-fault cluster', 'Preventive action draft'],
    evals: ['Cause backed by evidence', 'Restart risk reviewed', 'Preventive action owner present'],
    firstRun: 'Cluster recent breakdowns and identify the one asset most likely to create repeated downtime.',
  },
  'industrial-executive-brief': {
    autonomy: 'recommend',
    llmJobs: ['CEO brief', 'Risk exposure summary', 'Decision options'],
    tools: ['Plant manager home', 'DQMS', 'Maintenance', 'Receiving', 'KPI review'],
    outputArtifacts: ['Executive decision brief', 'Evidence appendix', 'Intervention list'],
    firstRun: 'Create a three-risk brief with source links, owner, exposure, and decision needed.',
  },
  'industrial-agent-workcells': {
    autonomy: 'writeback-gated',
    llmJobs: ['Evidence assembly', 'Tool execution plan', 'Review packet routing'],
    tools: ['Agent job runner', 'MCP connector fabric', 'Policy gate', 'Run ledger'],
    outputArtifacts: ['Agent run trace', 'Review packet', 'Rollback note'],
    evals: ['Tool scope limited', 'Source links present', 'Human approval required for writeback'],
    firstRun: 'Prepare a governed work packet from one source change and route it to the correct module owner.',
  },
  'industrial-knowledge-runtime': {
    autonomy: 'prepare',
    llmJobs: ['Source classification', 'Entity extraction', 'Schema proposal', 'Duplicate merge suggestion'],
    tools: ['Drive crawler', 'Gmail classifier', 'Sheets profiler', 'Vector search', 'Knowledge graph'],
    outputArtifacts: ['Source ledger update', 'Entity proposal', 'Data quality queue'],
    evals: ['Source owner identified', 'Sensitive data scoped', 'Merge requires human approval'],
    firstRun: 'Scan recent changed files and propose the first trusted record improvements.',
  },
  'restaurant-shift-control': {
    autonomy: 'recommend',
    llmJobs: ['Shift handover', 'Rush blocker triage', 'Area manager note'],
    tools: ['Local shift records', 'Schedule import', 'Manager notes'],
    outputArtifacts: ['Shift summary', 'Open blocker list', 'Training cue'],
    firstRun: 'Summarize today by daypart and identify the one blocker that will repeat tomorrow.',
  },
  'restaurant-prep-stock': {
    autonomy: 'recommend',
    llmJobs: ['Par variance analysis', 'Waste explanation', 'Supplier recovery draft'],
    tools: ['Prep sheet', 'Invoice parser', 'POS item mix', 'Waste photo evidence'],
    outputArtifacts: ['Stock risk list', 'Waste reason draft', 'Reorder suggestion'],
    firstRun: 'Find stock-out and waste risk from today records and suggest one par or supplier action.',
  },
  'restaurant-guest-recovery': {
    autonomy: 'prepare',
    llmJobs: ['Complaint clustering', 'Recovery message draft', 'Training cue extraction'],
    tools: ['Review import', 'Delivery app intake', 'Refund log', 'Manager notes'],
    outputArtifacts: ['Guest recovery packet', 'Repeat issue cluster', 'Training action'],
    guardrails: ['Customer-facing messages require manager approval', 'No refund decision without human owner'],
    firstRun: 'Group guest issues by cause and draft one recovery response for approval.',
  },
  'restaurant-margin-brief': {
    autonomy: 'recommend',
    llmJobs: ['Promo contribution story', 'Menu item margin check', 'Branch variance explanation'],
    tools: ['POS import', 'Promo calendar', 'Labor schedule', 'Stock and waste records'],
    outputArtifacts: ['Promo decision brief', 'Margin pressure list', 'Menu action recommendation'],
    firstRun: 'Explain whether the current promo is increasing contribution after labor and food pressure.',
  },
  'restaurant-pos-payment-control': {
    autonomy: 'writeback-gated',
    llmJobs: ['Payment match review', 'Cash-up exception note', 'Duplicate or mismatch detection'],
    tools: ['Payment provider export', 'POS receipt import', 'Cash-up sheet', 'QR generator'],
    outputArtifacts: ['Payment exception list', 'Cash-up reconciliation draft', 'Owner approval queue'],
    guardrails: ['Only provider-issued payment links or confirmation payloads count as settlement evidence', 'No cardholder or bank credentials stored', 'Payment status changes require cashier lead approval'],
    evals: ['Order reference present', 'Amount matched to settlement evidence', 'Internal review code clearly marked review-only'],
    firstRun: 'Match open payment records to settlement evidence, flag unpaid or mismatched orders, and draft the cash-up exception note.',
  },
  'restaurant-qr-menu-transition': {
    autonomy: 'writeback-gated',
    llmJobs: ['Menu OCR/extraction', 'Item normalization', 'Allergen gap scan', 'Customer copy draft'],
    tools: ['PDF/image parser', 'Menu parser', 'QR generator', 'Public menu publisher'],
    outputArtifacts: ['Structured menu', 'QR menu page', 'Printable menu/PDF', 'Manager approval queue'],
    evals: ['Prices present', 'Duplicate items detected', 'Allergen/availability gaps flagged'],
    firstRun: 'Extract the uploaded menu into structured items, flag missing price/allergen fields, then wait for manager publish approval.',
  },
}

function defaultProfile(contract: PortalModuleContract): AiModuleRuntimeProfile {
  const restaurant = contract.portal === 'restaurant'
  return {
    moduleId: contract.id,
    name: contract.name,
    autonomy: 'prepare',
    modelPattern: restaurant ? 'LLM extraction plus owner approval' : 'RAG evidence packet plus review gate',
    llmJobs: contract.agentMoves,
    tools: restaurant ? sharedRestaurantTools : sharedIndustrialTools,
    memory: ['Source records', 'Decisions', 'Exceptions', 'KPI history'],
    outputArtifacts: ['Draft packet', 'Evidence links', 'Human review request'],
    guardrails: [contract.reviewGate, 'No silent writeback to source systems', 'All outputs carry source evidence'],
    evals: ['Source-backed answer', 'Missing evidence flagged', 'Owner and next action present'],
    actionPolicy: 'AI prepares and recommends. Human owner approves decisions, writeback, customer messages, and operational changes.',
    firstRun: `Use ${contract.trigger.toLowerCase()} to prepare ${contract.job.toLowerCase()}`,
  }
}

export function getAiModuleRuntimeProfile(contract: PortalModuleContract): AiModuleRuntimeProfile {
  return {
    ...defaultProfile(contract),
    ...profileOverrides[contract.id],
  }
}

export function getAiModuleRuntimeProfilesForContracts(contracts: PortalModuleContract[]) {
  return contracts.map(getAiModuleRuntimeProfile)
}
