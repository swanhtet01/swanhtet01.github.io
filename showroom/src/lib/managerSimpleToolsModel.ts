export type ManagerSimpleWorkspace = {
  id: string
  title: string
  route: string
  purpose: string
  users: string
  rule: string
}

export type ManagerSimpleBridgeTool = {
  id: string
  title: string
  recommendation: 'Primary' | 'Bridge' | 'Fallback'
  route: string
  whenToUse: string
  whyItWorks: string
}

export type ManagerSimpleFormBlueprint = {
  id: string
  title: string
  route: string
  ownerDesk: string
  appsheetTable: string
  goal: string
  keyFields: string[]
}

export type ManagerSimpleIsoLoop = {
  id: string
  title: string
  route: string
  managerMove: string
  hiddenStandard: string
  records: string[]
}

export const MANAGER_SIMPLE_COORDINATION_RULES = [
  'Start with Manager Workspace unless the issue already affects the whole plant.',
  'Use Plant Manager only for cross-functional review, ISO escalation, and plant-wide closure.',
  'Portal first. AppSheet only bridges weak devices or early rollout. Google Forms only bridges weak training.',
  'Every record needs one owner, one due window, and one best evidence link.',
] as const

export const MANAGER_SIMPLE_WORKSPACES: ManagerSimpleWorkspace[] = [
  {
    id: 'manager-workspace',
    title: 'Manager Workspace',
    route: '/app/manager-system',
    purpose: 'Daily entry, document control, action routing, and simple review.',
    users: 'Department managers, admin, QC office, stores, and support functions.',
    rule: 'This should be the default home for most managers.',
  },
  {
    id: 'plant-manager',
    title: 'Plant Manager',
    route: '/app/plant-manager',
    purpose: 'Plant-wide command, ISO review, quality escalation, and cross-functional closure.',
    users: 'Plant Manager, quality head, operations head, maintenance lead, and director review.',
    rule: 'Use only when the issue crosses departments, shifts, or factory-level risk.',
  },
] as const

export const MANAGER_SIMPLE_BRIDGE_TOOLS: ManagerSimpleBridgeTool[] = [
  {
    id: 'portal-native',
    title: 'Portal-native entry',
    recommendation: 'Primary',
    route: '/app/daily-entry',
    whenToUse: 'Use when the portal is reachable and the manager can open one live screen.',
    whyItWorks: 'The record, evidence, review, and closeout stay on one system.',
  },
  {
    id: 'action-board',
    title: 'Action Board intake',
    recommendation: 'Primary',
    route: '/app/action-board',
    whenToUse: 'Use when the update is messy, mixed, spoken, or copied from chat.',
    whyItWorks: 'It forces one owner and one next move before another desk opens.',
  },
  {
    id: 'appsheet-bridge',
    title: 'AppSheet quick form',
    recommendation: 'Bridge',
    route: '/app/simple-tools',
    whenToUse: 'Use for line-side phones or shared devices during rollout.',
    whyItWorks: 'It keeps entry friction low while management review still happens in the portal.',
  },
  {
    id: 'google-form-bridge',
    title: 'Google Form fallback',
    recommendation: 'Fallback',
    route: '/app/simple-tools',
    whenToUse: 'Use only when training is weak or the device cannot handle the portal.',
    whyItWorks: 'It captures the fact fast, then a manager can promote it back into the main review loop.',
  },
] as const

export const MANAGER_SIMPLE_FORM_BLUEPRINTS: ManagerSimpleFormBlueprint[] = [
  {
    id: 'shift-handoff',
    title: 'Shift handoff',
    route: '/app/daily-entry',
    ownerDesk: 'Operations',
    appsheetTable: 'shift_handoffs',
    goal: 'Capture what changed, what remains open, and who owns the next move.',
    keyFields: ['date', 'shift', 'area', 'issue_summary', 'next_owner', 'review_by', 'evidence_link'],
  },
  {
    id: 'quality-incident',
    title: 'Quality incident',
    route: '/app/daily-entry',
    ownerDesk: 'DQMS',
    appsheetTable: 'quality_incidents',
    goal: 'Capture the defect, containment, and closeout owner without waiting for a long report.',
    keyFields: ['date', 'batch_or_lot', 'defect_summary', 'severity', 'containment', 'owner', 'evidence_link'],
  },
  {
    id: 'maintenance-stop',
    title: 'Maintenance stop',
    route: '/app/daily-entry',
    ownerDesk: 'Maintenance',
    appsheetTable: 'maintenance_stops',
    goal: 'Capture asset, downtime, and next action before the stop becomes memory-only.',
    keyFields: ['date', 'asset_name', 'issue_type', 'downtime_minutes', 'next_action', 'owner', 'evidence_link'],
  },
  {
    id: 'receiving-hold',
    title: 'Receiving hold',
    route: '/app/daily-entry',
    ownerDesk: 'Receiving',
    appsheetTable: 'receiving_holds',
    goal: 'Capture supplier, quantity gap, and release blocker before material flows further.',
    keyFields: ['date', 'supplier', 'material', 'po_or_pi', 'expected_qty', 'received_qty', 'hold_status', 'owner'],
  },
  {
    id: 'document-change',
    title: 'Document change',
    route: '/app/daily-entry',
    ownerDesk: 'Document control',
    appsheetTable: 'document_changes',
    goal: 'Capture SOP, form, COA, policy, and government document revisions in one governed loop.',
    keyFields: ['date', 'document_name', 'document_type', 'change_type', 'owner', 'effective_date', 'evidence_link'],
  },
  {
    id: 'audit-finding',
    title: 'Audit or review finding',
    route: '/app/daily-entry',
    ownerDesk: 'Plant Manager',
    appsheetTable: 'audit_reviews',
    goal: 'Capture the finding, the area, and the due window so review does not stay in meeting notes.',
    keyFields: ['date', 'review_type', 'area', 'finding_summary', 'owner', 'due_date', 'evidence_link'],
  },
  {
    id: 'training-gap',
    title: 'Training follow-up',
    route: '/app/daily-entry',
    ownerDesk: 'Adoption Command',
    appsheetTable: 'training_followups',
    goal: 'Capture the skill gap and verification step instead of informal coaching only.',
    keyFields: ['date', 'topic', 'audience', 'owner', 'due_date', 'verification', 'evidence_link'],
  },
] as const

export const MANAGER_SIMPLE_ISO_LOOPS: ManagerSimpleIsoLoop[] = [
  {
    id: 'documented-information',
    title: 'Documented information',
    route: '/app/documents',
    managerMove: 'Capture the change once, then route approval and effective date.',
    hiddenStandard: 'Document control, revision traceability, and governed release.',
    records: ['SOPs', 'forms', 'COAs', 'government files', 'supplier packets'],
  },
  {
    id: 'nonconformance-capa',
    title: 'Nonconformance and CAPA',
    route: '/app/dqms',
    managerMove: 'Capture the incident fast, show containment, then assign closeout.',
    hiddenStandard: 'Nonconformance control, corrective action, recurrence control.',
    records: ['defects', 'complaints', 'holds', 'containment notes', 'closeout evidence'],
  },
  {
    id: 'audit-management-review',
    title: 'Audit and management review',
    route: '/app/plant-manager',
    managerMove: 'Turn the finding into one owner and one next review date.',
    hiddenStandard: 'Performance evaluation, management review, follow-up closure.',
    records: ['audit findings', 'review points', 'repeat losses', 'next-day focus'],
  },
  {
    id: 'competence-training',
    title: 'Competence and training',
    route: '/app/adoption-command',
    managerMove: 'Capture who needs what training and how the behavior will be checked.',
    hiddenStandard: 'Competence, awareness, training verification.',
    records: ['training gaps', 'refreshers', 'coaching notes', 'verification proof'],
  },
  {
    id: 'incoming-traceability',
    title: 'Incoming control and traceability',
    route: '/app/receiving',
    managerMove: 'Hold unclear inbound material, attach the packet, and name the release owner.',
    hiddenStandard: 'Incoming quality control, traceability, supplier evidence completeness.',
    records: ['GRN gaps', 'COAs', 'supplier discrepancies', 'release decisions', 'batch references'],
  },
] as const
