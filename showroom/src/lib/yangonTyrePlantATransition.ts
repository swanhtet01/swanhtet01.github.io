export type YangonTyrePlantADriveRoot = {
  id: string
  title: string
  url: string
  why: string
}

export type YangonTyrePlantADepartment = {
  id: string
  title: string
  folderUrl: string
  observedBehavior: string
  firstDoorLabel: string
  firstDoorRoute: string
  managerMove: string
  automationMove: string
  evidenceExamples: string[]
}

export type YangonTyrePlantABehaviorPattern = {
  id: string
  label: string
  risk: string
  simpleShift: string
}

export type YangonTyrePlantAGap = {
  id: string
  title: string
  why: string
  neededNow: string
  route: string
}

export type YangonTyrePlantATrainingTrack = {
  id: string
  audience: string
  title: string
  dailyHabit: string
  proof: string
  route: string
}

export type YangonTyrePlantARolloutStage = {
  id: string
  label: string
  timing: string
  outcome: string
  route: string
}

export type YangonTyrePlantASimpleStart = {
  id: string
  situation: string
  move: string
  route: string
}

export const YANGON_TYRE_PLANT_A_DRIVE_ROOTS: YangonTyrePlantADriveRoot[] = [
  {
    id: 'plant-a-root',
    title: 'Factory Floor shared folder',
    url: 'https://drive.google.com/drive/folders/1t94diZCYNQsXzoIhSJCwxRhoMeduARoH',
    why: 'This is the current department split for Planning, Admin, QC, and the combined Tyre Sales and Inventory lane.',
  },
  {
    id: 'plant-a-production-office',
    title: 'Factory Floor production office data',
    url: 'https://drive.google.com/drive/folders/1-1b9zryLrFrS3yJVrmSQ0UlcwoPmwSEt',
    why: 'The source register shows this as a separate production-office root, so it has to be ingested alongside the reorganized shared folder.',
  },
  {
    id: 'tyre-analysis',
    title: 'Tyre Analysis workbook',
    url: 'https://docs.google.com/spreadsheets/d/18ID73Oq_GSipYslX-1V2lCn0CrtsqzreIlyY_AFLSkM/edit?usp=sharing',
    why: 'This is the existing high-value analytics source for product mix, cost, dealer concentration, and pricing movement.',
  },
  {
    id: 'ops-guide',
    title: 'YTF Operations Guide',
    url: 'https://docs.google.com/document/d/1KGY7_M6jPltOO-35Ee_ozKI3C_3obsUFkyzIZtW9xlw/edit?usp=sharing',
    why: 'It already describes the plant logic and should become the hidden SOP graph behind the daily modules.',
  },
] as const

export const YANGON_TYRE_PLANT_A_DEPARTMENTS: YangonTyrePlantADepartment[] = [
  {
    id: 'planning',
    title: 'Planning',
    folderUrl: 'https://drive.google.com/drive/folders/16oi48mB7nB0i9UsbJjw6Hh_NAL0zYNm8',
    observedBehavior:
      'Shortcut hub around OT records, tube and flap records, ISO bundles, employee photos, daily and weekly tyre production, and salary side files.',
    firstDoorLabel: 'Operations control',
    firstDoorRoute: '/app/operations',
    managerMove: 'Run schedule drift, carryover, and plan misses from Plant Manager, then push the abnormal item into Operations instead of a side spreadsheet.',
    automationMove: 'Resolve planning shortcuts, extract recurring production sheets, and turn OT and production records into canonical shift and output tables.',
    evidenceExamples: ['Tyre Production (daily, weekly, month)', 'OT Record', 'Tube Record & Flap Record', 'ISO (ALL)'],
  },
  {
    id: 'admin',
    title: 'Admin',
    folderUrl: 'https://drive.google.com/drive/folders/1in6lDIh83otr5e8hemtmSOFxOUKLFYwB',
    observedBehavior: 'Desktop, Documents, and Downloads are mirrored into Drive as shortcuts instead of controlled admin records.',
    firstDoorLabel: 'Action Board',
    firstDoorRoute: '/app/action-board',
    managerMove: 'Paste mixed admin requests, missing documents, or training follow-up into Action Board first, then route the record into Knowledge, Approvals, or Plant Manager.',
    automationMove: 'Index the desktop mirror, classify transient downloads, and add owner, due date, and revision status to the useful admin records.',
    evidenceExamples: ['Documents', 'Desktop', 'Downloads'],
  },
  {
    id: 'qc',
    title: 'QC',
    folderUrl: 'https://drive.google.com/drive/folders/1hYdQLoIboJozNikzuhKFDF6f1NW0YyxF',
    observedBehavior: 'Claims, Excel, knowledge, desktop material, and compliance files are grouped as shortcuts rather than an issue-led quality system.',
    firstDoorLabel: 'DQMS and quality',
    firstDoorRoute: '/app/dqms',
    managerMove: 'Treat every complaint, defect, release hold, and claim as one DQMS record with batch, evidence, containment, owner, and close date.',
    automationMove: 'Build a claim register, resolve the shortcut targets, and classify complaint and lab evidence into one quality lineage.',
    evidenceExamples: ['Claim Tyre (2025)', 'Claim Tyre (2026)', 'Excel', 'Knowledge'],
  },
  {
    id: 'sales-inventory',
    title: 'Tyre Sales and Inventory',
    folderUrl: 'https://drive.google.com/drive/folders/1DD3Ky60E4Ho2X7lalAr8pH79HENsklpY',
    observedBehavior: 'Commercial and stock work is still tied to Viber downloads, desktop mirrors, and loose document drops.',
    firstDoorLabel: 'Revenue desk',
    firstDoorRoute: '/app/revenue',
    managerMove: 'Use Revenue for dealer follow-up and commercial action, then check inventory pressure from the Floor And stock lanes instead of merging everything into one folder.',
    automationMove: 'Promote Viber and download evidence into account records, stock deltas, and demand signals with one owner and next action.',
    evidenceExamples: ['ViberDownloads', 'Downloads', 'Documents', 'Desktop'],
  },
] as const

export const YANGON_TYRE_PLANT_A_SIMPLE_STARTS: YangonTyrePlantASimpleStart[] = [
  {
    id: 'messy-update',
    situation: 'The update is messy, mixed, or copied from chat.',
    move: 'Open Action Board and let the system classify owner, urgency, desk, and next step.',
    route: '/app/action-board',
  },
  {
    id: 'single-event',
    situation: 'Someone needs to record one issue, one shift note, one defect, or one downtime event.',
    move: 'Open Daily Entry and capture the fact with the minimum useful fields.',
    route: '/app/daily-entry',
  },
  {
    id: 'manager-review',
    situation: 'A supervisor or manager is starting a shift or escalation review.',
    move: 'Open Plant Manager first, review only what changed, and then move into the owning desk.',
    route: '/app/plant-manager',
  },
  {
    id: 'trend-review',
    situation: 'Management wants a KPI, trend, or story instead of one case.',
    move: 'Open Data Fabric for the macro layer after the source event and owner are already clear.',
    route: '/app/data-fabric',
  },
] as const

export const YANGON_TYRE_PLANT_A_BEHAVIOR_PATTERNS: YangonTyrePlantABehaviorPattern[] = [
  {
    id: 'shortcut-heavy',
    label: 'Shortcut-heavy folders',
    risk: 'A folder looks organized, but the actual files still live elsewhere and lineage breaks as soon as the target changes.',
    simpleShift: 'Resolve shortcut targets first and store a canonical source ID before building any analytics on top.',
  },
  {
    id: 'desktop-mirror',
    label: 'Desktop and downloads mirrored into Drive',
    risk: 'Useful evidence sits next to noise, duplicates, and stale exports, which makes search and automation unreliable.',
    simpleShift: 'Classify desktop mirrors into controlled documents, transient drops, and ignored clutter.',
  },
  {
    id: 'photo-first',
    label: 'Photo-first records',
    risk: 'Photos prove something happened, but not the owner, batch, date, or next action.',
    simpleShift: 'Keep photo capture, but require one short structured record beside it.',
  },
  {
    id: 'chat-first',
    label: 'Chat and Viber file drops',
    risk: 'Commercial, supplier, and plant decisions disappear once the message thread moves on.',
    simpleShift: 'Promote chat evidence into Action Board, Revenue, Receiving, or DQMS before the issue is considered handled.',
  },
  {
    id: 'iso-as-folder',
    label: 'ISO stored as folders',
    risk: 'Documents exist, but the team still works outside the standard because the standard is not inside the workflow.',
    simpleShift: 'Keep ISO hidden inside Daily Entry, Action Board, Plant Manager, and DQMS instead of teaching paperwork first.',
  },
] as const

export const YANGON_TYRE_PLANT_A_GAPS: YangonTyrePlantAGap[] = [
  {
    id: 'receiving-grn',
    title: 'Receiving and GRN control',
    why: 'Factory Floor folders show planning, admin, QC, and sales or inventory, but not a clean hold and release lane for incoming material.',
    neededNow: 'Make Receiving the official place for GRN mismatch, COA gaps, shortages, and supplier hold decisions.',
    route: '/app/receiving',
  },
  {
    id: 'maintenance',
    title: 'Maintenance and downtime',
    why: 'Factory Floor will not be truly digital if downtime and repeat failures still live outside the same plant review rhythm.',
    neededNow: 'Capture machine, downtime, problem, next action, and spare blocker in the Maintenance desk.',
    route: '/app/maintenance',
  },
  {
    id: 'production-office-root',
    title: 'Production office root integration',
    why: 'The source register points to a separate Factory Floor production-office Drive root, so the current reorganized folders are only part of the real record.',
    neededNow: 'Index that root and map it into the same canonical record layer as the current Factory Floor folder.',
    route: '/app/data-fabric',
  },
  {
    id: 'finance-and-po',
    title: 'Finance and PO packet ingestion',
    why: 'The source document lists financial sheets and NR purchase-order packs coming from email-linked spreadsheets and docs.',
    neededNow: 'Tie those packets to approvals, supplier exposure, and leadership review instead of leaving them as isolated files.',
    route: '/app/approvals',
  },
  {
    id: 'training-and-competence',
    title: 'Training and competence matrix',
    why: 'Employee photos and ISO files exist, but role competence, refresher status, and proof of completion are not yet an intuitive runtime.',
    neededNow: 'Turn document control and training follow-up into one guided admin and manager workflow.',
    route: '/app/invisible-iso',
  },
  {
    id: 'shortcut-resolution',
    title: 'Shortcut target resolution and canonical IDs',
    why: 'Planning, QC, and the commercial folder all rely heavily on shortcuts, which makes analytics and lineage fragile.',
    neededNow: 'Promote shortcut targets into stable canonical records before building broader KPI automation.',
    route: '/app/data-fabric',
  },
] as const

export const YANGON_TYRE_PLANT_A_TRAINING_TRACKS: YangonTyrePlantATrainingTrack[] = [
  {
    id: 'manager-track',
    audience: 'Managers',
    title: 'Run review from the system',
    dailyHabit: 'Start every shift or abnormal review from Plant Manager, then update the owner and due time live.',
    proof: 'The meeting ends with the portal record updated, not with a separate chat summary.',
    route: '/app/plant-manager',
  },
  {
    id: 'employee-track',
    audience: 'Employees and clerks',
    title: 'Record the fact fast',
    dailyHabit: 'Use Daily Entry for one issue, one note, one photo, or one KPI instead of waiting until end of shift.',
    proof: 'Every abnormal event has a timestamped record, evidence, and named owner.',
    route: '/app/daily-entry',
  },
  {
    id: 'supervisor-track',
    audience: 'Supervisors and planners',
    title: 'Route mixed updates cleanly',
    dailyHabit: 'When updates come from chat, Viber, phone, or screenshots, paste them into Action Board first.',
    proof: 'The mixed update becomes one routed record and does not stay buried in chat.',
    route: '/app/action-board',
  },
  {
    id: 'quality-commercial-track',
    audience: 'Quality and sales leads',
    title: 'Close the loop with evidence',
    dailyHabit: 'Run quality through DQMS and commercial follow-up through Revenue, then attach the next action and proof.',
    proof: 'Claims, defects, dealer follow-up, and stock questions can be reviewed without reopening old folders.',
    route: '/app/dqms',
  },
] as const

export const YANGON_TYRE_PLANT_A_ROLLOUT_STAGES: YangonTyrePlantARolloutStage[] = [
  {
    id: 'week-1',
    label: 'Stage 1',
    timing: 'Week 1',
    outcome: 'Teach four front doors only: Plant Manager, Daily Entry, Action Board, and the owning desk.',
    route: '/app/portal',
  },
  {
    id: 'week-2-3',
    label: 'Stage 2',
    timing: 'Weeks 2-3',
    outcome: 'Make shift review, quality review, and daily carryover happen inside Plant Manager, Operations, and DQMS.',
    route: '/app/plant-manager',
  },
  {
    id: 'week-4-6',
    label: 'Stage 3',
    timing: 'Weeks 4-6',
    outcome: 'Turn the Drive lanes into canonical records with shortcut resolution, source IDs, and incremental extraction.',
    route: '/app/data-fabric',
  },
  {
    id: 'week-7-12',
    label: 'Stage 4',
    timing: 'Weeks 7-12',
    outcome: 'Publish automated briefs, quality and management packs, and bounded AI assist on top of the clean database layer.',
    route: '/app/erp',
  },
] as const
