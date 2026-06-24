export type YtfAttendanceMetric = {
  label: string
  value: string
  detail: string
}

export type YtfAttendanceSource = {
  id: string
  label: string
  status: string
  owner: string
  route: string
  detail: string
  nextStep: string
}

export type YtfAttendanceRuleLayer = {
  label: string
  rule: string
  owner: string
  gate: string
}

export type YtfAttendanceException = {
  worker: string
  shift: string
  signal: string
  decision: string
  owner: string
  payrollImpact: string
  status: string
}

export type YtfPayrollPreviewRow = {
  worker: string
  base: string
  ot: string
  deduction: string
  net: string
  approval: string
}

export type YtfAttendanceAgentLane = {
  lane: string
  reads: string
  writes: string
  guardrail: string
}

export const YTF_ATTENDANCE_PAYROLL_METRICS: YtfAttendanceMetric[] = [
  {
    label: 'Photo source',
    value: '100+',
    detail: 'Top Drive scan returned employee image records with department and ID hints.',
  },
  {
    label: 'Core lanes',
    value: '4',
    detail: 'Employee photos, employee details, OT records, and salary sheets are mapped.',
  },
  {
    label: 'Pilot surface',
    value: '1 gate',
    detail: 'Start with one entrance, one tablet, one payroll cycle, and old-vs-new comparison.',
  },
  {
    label: 'Payroll rule',
    value: 'Human lock',
    detail: 'Face and OT signals stay draft until supervisor and payroll approval are recorded.',
  },
]

export const YTF_ATTENDANCE_DRIVE_SOURCES: YtfAttendanceSource[] = [
  {
    id: 'employee-photo-folder',
    label: 'Employee photo enrollment folder',
    status: 'Mapped',
    owner: 'HR / Admin',
    route: 'https://drive.google.com/drive/folders/1Jy-A8HsSulbmY7Sq-0QbbUyELXA35Pm_',
    detail: 'Existing employee image records can seed enrollment and matching review.',
    nextStep: 'Normalize filename hints into employee code, department, and enrollment status.',
  },
  {
    id: 'employee-details-sheet',
    label: 'Employee Details sheet',
    status: 'Found',
    owner: 'HR / Admin',
    route: 'https://docs.google.com/spreadsheets/d/1E6ajDeQbzU1CCtQjoYtN5WSP9IrfpI2amfri_G-Y0vg',
    detail: 'Drive search found the employee detail register for matching employee codes to names and teams.',
    nextStep: 'Import only needed HR columns first: code, name, team, role, active status, payroll type.',
  },
  {
    id: 'ot-record-shortcut',
    label: 'OT Record shortcut',
    status: 'Indexed',
    owner: 'Plant Manager / Payroll',
    route: 'https://drive.google.com/file/d/1TtPxqQEqh2qcC7NN13fiTWRuD6ssCKRk/view',
    detail: 'Admin folder exposes an OT record lane that can become the first reconciliation source.',
    nextStep: 'Convert OT rows into approval claims tied to attendance summaries.',
  },
  {
    id: 'salary-shortcut',
    label: '002. Yangon Salary shortcut',
    status: 'Indexed',
    owner: 'Payroll',
    route: 'https://drive.google.com/file/d/1qVqaBWq7QJuUHsA7HNBtA0GV6BgFMnsx/view',
    detail: 'Admin folder exposes the salary lane that payroll can compare against approved attendance and OT.',
    nextStep: 'Keep salary export approval-gated; do not auto-write money changes from face match alone.',
  },
  {
    id: 'salary-2026-workbook',
    label: 'Factory Client Salary 2026 workbook',
    status: 'Found',
    owner: 'Payroll',
    route: 'https://drive.google.com/file/d/1S-it3UROboQbBhU9vOYR0bYmXJ1G_zf9/view',
    detail: 'Drive search found a 2026 salary workbook copy for payroll export mapping and reconciliation.',
    nextStep: 'Build CSV/XLSX export that mirrors payroll columns after manager approval.',
  },
]

export const YTF_ATTENDANCE_RULE_LAYERS: YtfAttendanceRuleLayer[] = [
  {
    label: 'Identity',
    rule: 'Face/photo check-in creates a draft attendance event with confidence, device, station, and evidence reference.',
    owner: 'HR Admin',
    gate: 'Employee consent and enrollment quality before face matching goes live.',
  },
  {
    label: 'Shift',
    rule: 'Daily summaries pair first valid check-in and last valid check-out against shift, grace, and break rules.',
    owner: 'Line Supervisor',
    gate: 'Missing checkout, duplicate punch, late arrival, and early leave require review.',
  },
  {
    label: 'OT',
    rule: 'Worked minutes above rule threshold become an OT claim, not a payroll line.',
    owner: 'Plant Manager',
    gate: 'Supervisor approval is required before payroll can include the OT minutes.',
  },
  {
    label: 'Payroll',
    rule: 'Approved attendance, approved OT, and manual adjustments produce payroll-ready rows.',
    owner: 'Payroll',
    gate: 'Payroll locks the period only after exception and adjustment reasons are auditable.',
  },
]

export const YTF_ATTENDANCE_EXCEPTIONS: YtfAttendanceException[] = [
  {
    worker: 'YT-07 / Building',
    shift: 'Day shift',
    signal: 'Check-out missing after photo check-in',
    decision: 'Ask supervisor to confirm last seen time',
    owner: 'Line Supervisor',
    payrollImpact: 'Hold daily summary',
    status: 'Review',
  },
  {
    worker: 'YT-03 / Store',
    shift: 'Night shift',
    signal: 'Possible OT 92 minutes over threshold',
    decision: 'Approve 90 rounded OT minutes or reject with reason',
    owner: 'Plant Manager',
    payrollImpact: 'Draft OT claim',
    status: 'Pending approval',
  },
  {
    worker: 'YT-01 / QC',
    shift: 'Day shift',
    signal: 'Two punches within 3 minutes at same station',
    decision: 'Mark duplicate and keep earliest valid punch',
    owner: 'HR Admin',
    payrollImpact: 'No pay change',
    status: 'Auto-suggested',
  },
  {
    worker: 'YT-05 / Security',
    shift: 'Rotating',
    signal: 'Low-confidence face match',
    decision: 'Manual identity review before official attendance',
    owner: 'HR Admin',
    payrollImpact: 'Excluded until matched',
    status: 'Blocked',
  },
]

export const YTF_PAYROLL_PREVIEW_ROWS: YtfPayrollPreviewRow[] = [
  {
    worker: 'YT-03',
    base: '26 days',
    ot: '11.5 hr',
    deduction: '0.5 day',
    net: 'Ready',
    approval: 'Supervisor approved / payroll review',
  },
  {
    worker: 'YT-07',
    base: '25 days',
    ot: 'Hold',
    deduction: 'Missing checkout',
    net: 'Blocked',
    approval: 'Needs exception reason',
  },
  {
    worker: 'YT-01',
    base: '26 days',
    ot: '4 hr',
    deduction: '0',
    net: 'Ready',
    approval: 'Locked for export',
  },
]

export const YTF_ATTENDANCE_AGENT_LANES: YtfAttendanceAgentLane[] = [
  {
    lane: 'Enrollment Curator',
    reads: 'Drive photo folder and Employee Details sheet',
    writes: 'Pending enrollment rows, missing-code tasks, quality flags',
    guardrail: 'Never exposes raw face templates to the browser.',
  },
  {
    lane: 'Punch Normalizer',
    reads: 'Tablet events, ZKTeco exports, and mobile check-ins',
    writes: 'Deduped attendance events and exception candidates',
    guardrail: 'Low confidence stays out of payroll.',
  },
  {
    lane: 'OT Judge',
    reads: 'Daily summaries, shift assignments, and OT rules',
    writes: 'Draft OT claims for supervisor approval',
    guardrail: 'No auto-approval for money-impacting claims.',
  },
  {
    lane: 'Payroll Reconciler',
    reads: 'Approved attendance, approved OT, salary workbook columns',
    writes: 'Payroll preview export and variance explanations',
    guardrail: 'Payroll period locks only after human sign-off.',
  },
]

export const YTF_ATTENDANCE_MEETING_POINTS = [
  'The Factory Client attendance layer turns face punches into approved OT and payroll evidence.',
  'ZKTeco can remain a backup device log source, but tablets/phones become the primary clean capture surface for the pilot.',
  'First pilot scope: one entrance, one device group, one worker register, one payroll cycle, and old-vs-new variance report.',
  'Do not promise automatic payroll from face recognition alone. Promise payroll-ready evidence, approvals, and clean exports.',
] as const
