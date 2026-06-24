export type SourceChangeStage = {
  id: string
  name: string
  action: string
  output: string
  humanGate: string
}

export type SourceConnectorContract = {
  id: string
  name: string
  watches: string
  extracts: string[]
  promotesTo: string[]
  reviewGate: string
  risk: string
}

export type SourceChangeReadinessMetric = {
  id: string
  label: string
  score: number
  good: string
  gap: string
  next: string
}

export const SOURCE_CHANGE_WORKFLOW: SourceChangeStage[] = [
  {
    id: 'watch',
    name: 'Watch',
    action: 'Detect new and changed files, emails, sheets, exports, and manual entries.',
    output: 'Changed-source queue',
    humanGate: 'Source owner can ignore, assign, or mark sensitive.',
  },
  {
    id: 'diff',
    name: 'Diff',
    action: 'Compare the current version against the last reviewed version.',
    output: 'What changed, where, and who owns it',
    humanGate: 'Ambiguous changes require owner confirmation.',
  },
  {
    id: 'classify',
    name: 'Classify',
    action: 'Map each change to operating domains, entities, KPIs, and module routes.',
    output: 'Owner brief, KPI candidate, or module action',
    humanGate: 'AI classification is advisory until reviewed.',
  },
  {
    id: 'promote',
    name: 'Promote',
    action: 'Create a structured operating record with source links and lineage.',
    output: 'Trusted record proposal',
    humanGate: 'Data owner approves canonical merge or rejects it.',
  },
  {
    id: 'act',
    name: 'Act',
    action: 'Route the record to the right portal module, owner, due window, and agent assist.',
    output: 'Owned work item, CAPA, supplier packet, KPI story, or executive brief',
    humanGate: 'High-risk writeback needs explicit approval.',
  },
  {
    id: 'learn',
    name: 'Learn',
    action: 'Measure which changes became useful actions and which source patterns keep recurring.',
    output: 'Gap analysis, schema improvement, and next module recommendation',
    humanGate: 'Implementation lead approves portal changes.',
  },
]

export const SOURCE_CONNECTOR_CONTRACTS: SourceConnectorContract[] = [
  {
    id: 'drive',
    name: 'Google Drive',
    watches: 'Folders, shortcuts, Docs, PDFs, photos, and uploaded exports.',
    extracts: ['folder owner', 'file type', 'modified time', 'entities', 'evidence links'],
    promotesTo: ['Document Control', 'Drive Monitor', 'Data Quality', 'Factory Knowledge Runtime'],
    reviewGate: 'Source owner confirms folder meaning and sensitive files.',
    risk: 'Shortcut debt and human folder naming can hide ownership.',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    watches: 'Supplier emails, complaints, approvals, shipment notes, and attachments.',
    extracts: ['sender', 'thread subject', 'attachment evidence', 'date', 'reply state'],
    promotesTo: ['Receiving Control', 'DQMS', 'Approval Queue', 'Executive Brief'],
    reviewGate: 'Customer/supplier-facing replies remain draft-only until approved.',
    risk: 'Email contains sensitive commercial and personal data.',
  },
  {
    id: 'sheets',
    name: 'Google Sheets',
    watches: 'QC logs, daily entries, stock trackers, maintenance logs, and ad hoc databases.',
    extracts: ['header map', 'row changes', 'formula hints', 'missing fields', 'candidate KPI'],
    promotesTo: ['KPI Review', 'Data Quality', 'Operations Command', 'Maintenance Reliability'],
    reviewGate: 'Metric formula and official status need process-owner approval.',
    risk: 'Spreadsheet drift can make AI metrics look precise but wrong.',
  },
  {
    id: 'manual-entry',
    name: 'Portal entry',
    watches: 'Daily entries, mobile issue capture, photos, approvals, and module forms.',
    extracts: ['role', 'timestamp', 'site', 'module', 'owner', 'proof'],
    promotesTo: ['Action Board', 'Evidence Ledger', 'KPI Review', 'Agent Workbench'],
    reviewGate: 'Managers approve closeout and business decisions.',
    risk: 'Bad forms create low-quality source data unless entry is short and role-specific.',
  },
]

export const SOURCE_CHANGE_READINESS: SourceChangeReadinessMetric[] = [
  {
    id: 'real-sources',
    label: 'Real source connectivity',
    score: 78,
    good: 'Drive root warehouse, Gmail probe, and Sheets-capable Drive scopes exist in the codebase.',
    gap: 'Production needs confirmed OAuth/service-account deployment and tenant source ownership screens.',
    next: 'Expose connector status, last sync, owner, and permission gap inside admin.',
  },
  {
    id: 'lineage',
    label: 'Lineage and review',
    score: 72,
    good: 'Monitor payloads already preserve source routes, owner briefs, KPI candidates, and generated actions.',
    gap: 'Lineage needs a stronger visible decision log for promoted metrics and canonical records.',
    next: 'Add approve/reject/promote actions with audit metadata.',
  },
  {
    id: 'module-routing',
    label: 'Module routing',
    score: 84,
    good: 'YTF domains now route into Plant, DQMS, Maintenance, Receiving, Data Quality, and Owner Brief screens.',
    gap: 'Restaurant modules need real connector mappings after the local-first preview.',
    next: 'Map POS, invoices, reviews, and schedules into the same changed-source queue.',
  },
  {
    id: 'operator-ux',
    label: 'Operator UX',
    score: 69,
    good: 'The YTF app shell is much calmer than the old public-site-feeling app.',
    gap: 'Some app pages still have too many buttons and too much explanatory copy.',
    next: 'Keep cutting screens down to one primary action, one queue, and one review path.',
  },
]
