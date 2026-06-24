export type IndustrialAgentWorkcell = {
  id: string
  name: string
  jobType: 'ops_watch' | 'task_triage' | 'founder_brief'
  moduleRoute: string
  role: string
  trigger: string
  llmJob: string
  tools: string[]
  output: string
  guardrail: string
  disruptiveMove: string
}

export const INDUSTRIAL_AGENT_WORKCELLS: IndustrialAgentWorkcell[] = [
  {
    id: 'quality-capa-agent',
    name: 'CAPA Root-Cause Agent',
    jobType: 'ops_watch',
    moduleRoute: '/app/dqms',
    role: 'Quality lead',
    trigger: 'Repeat defect, complaint, hold, or inspection drift.',
    llmJob: 'Read source evidence, cluster similar incidents, draft 5W1H/Ishikawa branches, and prepare a CAPA packet.',
    tools: ['Drive search', 'Gmail evidence', 'QC sheet extraction', 'knowledge graph'],
    output: 'Containment draft, suspected causes, missing evidence, CAPA checklist, verification plan.',
    guardrail: 'Human quality owner approves containment, cause, and CAPA before any official closeout.',
    disruptiveMove: 'Turns blank quality forms into a source-linked reasoning workflow.',
  },
  {
    id: 'maintenance-reliability-agent',
    name: 'Reliability Pattern Agent',
    jobType: 'ops_watch',
    moduleRoute: '/app/maintenance',
    role: 'Maintenance lead',
    trigger: 'Breakdown, repeat fault, PM miss, or spare shortage.',
    llmJob: 'Compare breakdown notes, PM logs, spares, readings, and technician comments to identify repeat failure modes.',
    tools: ['maintenance log parser', 'spares ledger', 'Drive attachments', 'feature mart'],
    output: 'MTBF/MTTR brief, repeat fault cluster, likely missing PM, spare action, next inspection.',
    guardrail: 'Technician or maintenance lead confirms cause and preventive action.',
    disruptiveMove: 'Makes maintenance a learning system instead of a repair diary.',
  },
  {
    id: 'supplier-claim-agent',
    name: 'Supplier Claim Agent',
    jobType: 'task_triage',
    moduleRoute: '/app/receiving',
    role: 'Receiving and procurement',
    trigger: 'Short quantity, damaged material, wrong item, price mismatch, COA mismatch.',
    llmJob: 'Assemble PO, invoice, COA, receiving photos, and prior supplier issues into a claim-ready packet.',
    tools: ['Gmail thread search', 'Drive invoice parser', 'receiving record', 'supplier scorecard'],
    output: 'Discrepancy packet, supplier email draft, production risk note, claim follow-up task.',
    guardrail: 'Procurement approves supplier-facing messages and commercial claims.',
    disruptiveMove: 'Shrinks supplier recovery from folder hunting to one packet.',
  },
  {
    id: 'executive-brief-agent',
    name: 'Executive Synthesis Agent',
    jobType: 'founder_brief',
    moduleRoute: '/app/director',
    role: 'CEO or director',
    trigger: 'Daily management review, KPI drift, major exception, or owner handoff.',
    llmJob: 'Synthesize plant, quality, maintenance, receiving, and source-change signals into decisions that need leadership.',
    tools: ['owner brief', 'action board', 'data fabric', 'agent run ledger'],
    output: 'Top risks, source-linked decision options, waiting approvals, and next management review questions.',
    guardrail: 'Leadership decisions remain explicit approvals, not automated edits.',
    disruptiveMove: 'Replaces passive dashboards with decision intelligence.',
  },
]
