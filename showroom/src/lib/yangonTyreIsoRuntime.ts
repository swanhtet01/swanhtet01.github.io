import type { ActionBoardCategory } from './tooling'

export type YangonTyreDailyEntryWorkflowId =
  | 'shift_handoff'
  | 'quality_incident'
  | 'maintenance_issue'
  | 'receiving_hold'
  | 'kpi_snapshot'
  | 'document_control'
  | 'audit_review'
  | 'training_followup'

export type YangonTyreRuntimeSurface = {
  label: string
  route: string
}

export type YangonTyreIsoWorkflowGuide = {
  id: string
  title: string
  trigger: string
  frontDoor: YangonTyreRuntimeSurface
  owningDesk: YangonTyreRuntimeSurface
  reviewDesk: YangonTyreRuntimeSurface
  managerPrompt: string
  aiAssist: string
  evidence: string[]
  hiddenControls: string[]
}

export type YangonTyreErpChainStep = {
  id: string
  label: string
  title: string
  detail: string
  route: string
}

export const YANGON_TYRE_ERP_CONTROL_CHAIN: YangonTyreErpChainStep[] = [
  {
    id: 'capture',
    label: '1. Capture',
    title: 'Start with the easiest truthful entry',
    detail: 'Use Daily Entry for structured first facts and Action Board for messy mixed updates.',
    route: '/app/daily-entry',
  },
  {
    id: 'route',
    label: '2. Route',
    title: 'Classify the work before another meeting starts',
    detail: 'The system chooses the owning desk, urgency, review cadence, and missing evidence hints.',
    route: '/app/action-board',
  },
  {
    id: 'work',
    label: '3. Work',
    title: 'Close the issue in the desk that owns it',
    detail: 'Operations, DQMS, Maintenance, Receiving, Knowledge, or Approvals should carry the live record.',
    route: '/app/operations',
  },
  {
    id: 'review',
    label: '4. Review',
    title: 'Use Plant Manager as the common command language',
    detail: 'Micro issues become one cross-functional plant review instead of parallel side updates.',
    route: '/app/plant-manager',
  },
  {
    id: 'learn',
    label: '5. Learn',
    title: 'Promote repeated pain into the system',
    detail: 'Data Fabric, Invisible ISO, and the ERP model turn repetition into better fields, alerts, and routines.',
    route: '/app/data-fabric',
  },
] as const

export const YANGON_TYRE_DAILY_ENTRY_WORKFLOWS: YangonTyreIsoWorkflowGuide[] = [
  {
    id: 'shift_handoff',
    title: 'Shift handoff to plant review',
    trigger: 'A shift ends, a new shift starts, or one team needs to hand over an abnormality cleanly.',
    frontDoor: { label: 'Daily Entry', route: '/app/daily-entry' },
    owningDesk: { label: 'Operations Control', route: '/app/operations' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'What changed, who owns the next move, and when do we review it again?',
    aiAssist: 'Convert the short handoff into a structured task with owner, due window, and evidence hint.',
    evidence: ['shift or date', 'line or section', 'short factual note', 'named owner'],
    hiddenControls: ['handoff traceability', 'operational control', 'management review input'],
  },
  {
    id: 'quality_incident',
    title: 'Incident to containment and CAPA',
    trigger: 'A defect, complaint, release hold, or containment case appears.',
    frontDoor: { label: 'Daily Entry', route: '/app/daily-entry' },
    owningDesk: { label: 'DQMS', route: '/app/dqms' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'What is the defect, what is contained now, and who owns closeout?',
    aiAssist: 'Convert the entry into an incident-ready quality record and prompt for missing evidence.',
    evidence: ['defect or complaint reference', 'batch or lot', 'severity', 'photo or test result'],
    hiddenControls: ['nonconformance control', 'containment', 'corrective-action discipline'],
  },
  {
    id: 'maintenance_issue',
    title: 'Breakdown to reliability follow-up',
    trigger: 'A machine issue, downtime event, or maintenance hold affects flow.',
    frontDoor: { label: 'Daily Entry', route: '/app/daily-entry' },
    owningDesk: { label: 'Maintenance', route: '/app/maintenance' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'Which asset failed, what is the next action, and does this repeat?',
    aiAssist: 'Turn the note into a downtime-ready maintenance record with asset, priority, and next action.',
    evidence: ['asset name', 'issue type', 'downtime minutes', 'next action'],
    hiddenControls: ['equipment control', 'repeat-failure review', 'preventive follow-up'],
  },
  {
    id: 'receiving_hold',
    title: 'Inbound variance to release control',
    trigger: 'Stores finds a COA gap, GRN mismatch, shortage, suspect lot, or release blocker.',
    frontDoor: { label: 'Daily Entry', route: '/app/daily-entry' },
    owningDesk: { label: 'Receiving Control', route: '/app/receiving' },
    reviewDesk: { label: 'Approvals', route: '/app/approvals' },
    managerPrompt: 'What is blocked, what evidence is missing, and who can release or escalate it?',
    aiAssist: 'Group supplier, GRN, material, and next action into one release-ready control record.',
    evidence: ['supplier', 'material or GRN', 'expected versus received', 'release note or discrepancy'],
    hiddenControls: ['incoming control', 'supplier evidence completeness', 'release approval path'],
  },
  {
    id: 'kpi_snapshot',
    title: 'KPI note to management learning loop',
    trigger: 'A plant, quality, maintenance, finance, or commercial number matters now and should not stay in chat.',
    frontDoor: { label: 'Daily Entry', route: '/app/daily-entry' },
    owningDesk: { label: 'Data Fabric', route: '/app/data-fabric' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'What changed in the number, what scope does it belong to, and who reviews the drift?',
    aiAssist: 'Write the metric into the shared mart layer so briefings and reviews can reuse it automatically.',
    evidence: ['metric name', 'value and unit', 'period label', 'scope or note'],
    hiddenControls: ['KPI traceability', 'management review evidence', 'trend integrity'],
  },
  {
    id: 'document_control',
    title: 'Document change to controlled record',
    trigger: 'A SOP, work instruction, form, COA, policy, government file, or revision request needs to enter the system.',
    frontDoor: { label: 'Daily Entry', route: '/app/daily-entry' },
    owningDesk: { label: 'Document Intelligence', route: '/app/documents' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'What changed in the document, why does it matter, and who signs or owns the next controlled step?',
    aiAssist: 'Turn the note into a controlled-document action with type, change reason, evidence link, and owner.',
    evidence: ['document name', 'document type', 'change type', 'owner', 'link or file reference'],
    hiddenControls: ['documented information', 'revision governance', 'controlled record traceability'],
  },
  {
    id: 'audit_review',
    title: 'Audit or review finding to management action',
    trigger: 'An audit finding, management-review issue, gemba observation, or recurring gap needs structured follow-up.',
    frontDoor: { label: 'Daily Entry', route: '/app/daily-entry' },
    owningDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    reviewDesk: { label: 'Data Fabric', route: '/app/data-fabric' },
    managerPrompt: 'What was found, what is the immediate risk, and when will the closure be checked again?',
    aiAssist: 'Convert the finding into one owned management-review action with risk level and evidence request.',
    evidence: ['finding title', 'area or process', 'owner', 'due date', 'evidence link'],
    hiddenControls: ['performance evaluation', 'management review', 'improvement tracking'],
  },
  {
    id: 'training_followup',
    title: 'Training gap to competence follow-up',
    trigger: 'A manager notices a skill gap, overdue refresher, weak handoff habit, or training proof problem.',
    frontDoor: { label: 'Daily Entry', route: '/app/daily-entry' },
    owningDesk: { label: 'Adoption Command', route: '/app/adoption-command' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'Who needs the training, what has to change in behavior, and how will you verify it happened?',
    aiAssist: 'Write the gap into a simple competence action instead of leaving it in chat or memory.',
    evidence: ['topic', 'audience', 'owner', 'due date', 'verification method'],
    hiddenControls: ['competence', 'awareness', 'training verification'],
  },
] as const

export const YANGON_TYRE_ACTION_BOARD_WORKFLOWS: Array<YangonTyreIsoWorkflowGuide & { category: ActionBoardCategory }> = [
  {
    id: 'shift-issue',
    category: 'Shift issue',
    title: 'Shift issue to operations ownership',
    trigger: 'A mixed production, line, utility, packing, or shift issue lands in chat or a spoken update.',
    frontDoor: { label: 'Action Board', route: '/app/action-board' },
    owningDesk: { label: 'Operations Control', route: '/app/operations' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'Clarify the blocker, the owner, and the review time before the next shift starts.',
    aiAssist: 'Split one messy update into operational work with due window, lane, and evidence hint.',
    evidence: ['line or stage', 'machine or batch if known', 'current blocker', 'owner'],
    hiddenControls: ['operational control', 'responsibility assignment', 'shift review discipline'],
  },
  {
    id: 'quality-issue',
    category: 'Quality issue',
    title: 'Quality issue to DQMS',
    trigger: 'A defect, complaint, release hold, or containment topic comes in as a rough note.',
    frontDoor: { label: 'Action Board', route: '/app/action-board' },
    owningDesk: { label: 'DQMS', route: '/app/dqms' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'Keep the first note short, but do not lose the defect evidence.',
    aiAssist: 'Route the issue into the quality desk with containment and corrective-action cues.',
    evidence: ['defect family', 'batch or lot', 'photo or test note', 'containment status'],
    hiddenControls: ['nonconformance control', 'CAPA structure', 'release review input'],
  },
  {
    id: 'supplier-issue',
    category: 'Supplier issue',
    title: 'Supplier issue to receiving and approvals',
    trigger: 'A missing document, COA gap, discrepancy, delay, or GRN problem appears in notes or email.',
    frontDoor: { label: 'Action Board', route: '/app/action-board' },
    owningDesk: { label: 'Approvals', route: '/app/approvals' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'Keep the packet complete enough that the plant can decide release or escalation quickly.',
    aiAssist: 'Convert the note into a supplier-control item with packet, owner, and release path.',
    evidence: ['supplier', 'PO or GRN', 'document gap', 'next approval or chase action'],
    hiddenControls: ['external provider control', 'release risk management', 'approval discipline'],
  },
  {
    id: 'document-control',
    category: 'Document control',
    title: 'Document drift to governed knowledge',
    trigger: 'An SOP, work instruction, form, or revision note appears in mixed updates.',
    frontDoor: { label: 'Action Board', route: '/app/action-board' },
    owningDesk: { label: 'Knowledge Control', route: '/app/knowledge' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'What changed, why did it change, and who must sign off?',
    aiAssist: 'Turn the raw note into one document-control action with revision logic and owner.',
    evidence: ['document name', 'revision reason', 'current version or link', 'owner'],
    hiddenControls: ['documented information', 'revision governance', 'approval trace'],
  },
  {
    id: 'training',
    category: 'Training',
    title: 'Training note to competence follow-up',
    trigger: 'A refresher, coaching gap, or overdue competence item appears during daily work.',
    frontDoor: { label: 'Action Board', route: '/app/action-board' },
    owningDesk: { label: 'Adoption Command', route: '/app/adoption-command' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'Who needs the training, what changed, and how will we verify it was actually done?',
    aiAssist: 'Classify the note into a competence or adoption action instead of leaving it in a meeting summary.',
    evidence: ['role or station', 'training gap', 'owner', 'proof method'],
    hiddenControls: ['competence', 'awareness', 'training verification'],
  },
  {
    id: 'audit-review',
    category: 'Audit / review',
    title: 'Audit finding to management review',
    trigger: 'A management-review item, audit finding, KPI drift, or checklist issue appears in plain language.',
    frontDoor: { label: 'Action Board', route: '/app/action-board' },
    owningDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    reviewDesk: { label: 'Data Fabric', route: '/app/data-fabric' },
    managerPrompt: 'Turn the finding into one owner, one due date, and one next review rhythm.',
    aiAssist: 'Attach the review item to the plant command loop and suggest evidence still missing.',
    evidence: ['finding or KPI reference', 'owner', 'due window', 'linked note or proof'],
    hiddenControls: ['performance evaluation', 'management review', 'improvement follow-up'],
  },
  {
    id: 'general-follow-up',
    category: 'General follow-up',
    title: 'General follow-up to shared queue',
    trigger: 'The update is real but still too vague to force into a specialist desk immediately.',
    frontDoor: { label: 'Action Board', route: '/app/action-board' },
    owningDesk: { label: 'Shared Queue', route: '/app/actions' },
    reviewDesk: { label: 'Plant Manager', route: '/app/plant-manager' },
    managerPrompt: 'Keep it visible first, then force a desk only after the owner and intent are clear.',
    aiAssist: 'Hold the action in one shared queue without losing the source context.',
    evidence: ['short issue summary', 'best-known owner', 'timing hint', 'original source note'],
    hiddenControls: ['planning and follow-up', 'action visibility', 'handoff discipline'],
  },
] as const

export function getYangonTyreDailyEntryWorkflow(id: string) {
  return YANGON_TYRE_DAILY_ENTRY_WORKFLOWS.find((item) => item.id === id) ?? YANGON_TYRE_DAILY_ENTRY_WORKFLOWS[0]
}

export function getYangonTyreActionBoardWorkflow(category: string) {
  return YANGON_TYRE_ACTION_BOARD_WORKFLOWS.find((item) => item.category === category) ?? YANGON_TYRE_ACTION_BOARD_WORKFLOWS.at(-1)
}
