import type { YtfWorkspaceId } from './ytfWorkspaceModel'
import {
  YANGON_TYRE_PLANT_A_DEPARTMENTS,
  YANGON_TYRE_PLANT_A_DRIVE_ROOTS,
  type YangonTyrePlantADepartment,
  type YangonTyrePlantADriveRoot,
} from './yangonTyrePlantATransition'

export type YtfWorkspaceRoster = {
  workspaceId: YtfWorkspaceId
  accountLabel: string
  teamLabel: string
  summary: string
}

export type YtfWorkspaceStarterAccount = {
  id: string
  workspaceId: YtfWorkspaceId
  label: string
  username: string
  primaryRoute: string
  summary: string
  responsibilities: string[]
}

export type YtfRoleSplitAccount = {
  id: string
  workspaceId: YtfWorkspaceId
  teamGroupId: string
  label: string
  username: string
  displayName: string
  role: string
  stage: string
  primaryRoute: string
  secondaryRoute: string
  summary: string
  people: string[]
}

export type YtfPlantATeamMember = {
  name: string
  role: string
}

export type YtfPlantATeamGroup = {
  id: string
  title: string
  summary: string
  currentWorkspaceId: YtfWorkspaceId
  currentAccountLabel: string
  members: YtfPlantATeamMember[]
  primaryDeskRoute: string
  primaryDeskLabel: string
  secondaryDeskRoute: string
  secondaryDeskLabel: string
  departmentIds: string[]
  driveRootIds: string[]
  asks: string[]
  proof: string
  handoff: string
}

export type YtfPlantACollaborationLoop = {
  id: string
  title: string
  lead: string
  contributors: string[]
  trigger: string
  firstDeskRoute: string
  firstDeskLabel: string
  secondDeskRoute: string
  secondDeskLabel: string
  departmentIds: string[]
  driveRootIds: string[]
  outcome: string
}

export type YtfSourceContextLane = {
  id: string
  title: string
  stage: string
  driveUrl: string
  ownerWorkspaceId: YtfWorkspaceId
  route: string
  routeLabel: string
  purpose: string
  evidenceExamples: string[]
}

export type YtfPlantAEntryMode =
  | 'daily_routine'
  | 'normal_abnormal'
  | 'five_s_check'
  | 'shift_handoff'
  | 'whiteboard_snapshot'
  | 'quality_incident'
  | 'maintenance_issue'
  | 'receiving_hold'
  | 'kpi_snapshot'
  | 'document_control'
  | 'audit_review'
  | 'training_followup'

export type YtfPlantAEntryPack = {
  id: string
  teamGroupId: string
  label: string
  title: string
  summary: string
  username: string
  role: string
  defaultOwner: string
  allowedModes: YtfPlantAEntryMode[]
  primaryDeskRoute: string
  secondaryDeskRoute: string
  asks: string[]
  proof: string
}

export const YTF_WORKSPACE_ROSTERS: Record<YtfWorkspaceId, YtfWorkspaceRoster> = {
  admin: {
    workspaceId: 'admin',
    accountLabel: 'ytf-admin',
    teamLabel: 'Tenant admin',
    summary: 'Owns access, modules, connectors, and the shared data/runtime control layer.',
  },
  plant: {
    workspaceId: 'plant',
    accountLabel: 'ytf-plant-manager',
    teamLabel: 'Plant Manager',
    summary: 'Runs cross-team review and closes issues coming from the Factory Floor manager team.',
  },
  manager: {
    workspaceId: 'manager',
    accountLabel: 'ytf-manager',
    teamLabel: 'Factory Floor manager team',
    summary: 'Shared today by the 12 Factory Floor leads until each role gets its own named login.',
  },
}

export const YTF_STARTER_WORKSPACE_ACCOUNTS: YtfWorkspaceStarterAccount[] = [
  {
    id: 'account-admin',
    workspaceId: 'admin',
    label: 'Admin workspace',
    username: 'ytf-admin',
    primaryRoute: '/app/platform-admin',
    summary: 'Keep the tenant stable while real Factory Client teams start using the platform every day.',
    responsibilities: ['Create and split user access', 'Control modules and rollout', 'Track connector and source posture', 'Keep the data fabric trusted'],
  },
  {
    id: 'account-plant-manager',
    workspaceId: 'plant',
    label: 'Plant Manager workspace',
    username: 'ytf-plant-manager',
    primaryRoute: '/app/plant-manager',
    summary: 'Run the daily plant review, invisible ISO closure, and cross-team escalation loop.',
    responsibilities: ['Review the whole Factory Floor team', 'Close issues across shifts or departments', 'Coach managers on evidence quality', 'Turn repeating issues into plant-level action'],
  },
  {
    id: 'account-manager',
    workspaceId: 'manager',
    label: 'Manager workspace',
    username: 'ytf-manager',
    primaryRoute: '/app/manager-system',
    summary: 'Shared working account for the Factory Floor manager team while the role splits are still being rolled out.',
    responsibilities: ['Enter the fact once', 'Attach the photo, record, or evidence', 'Use the right desk for the next move', 'Escalate only when it becomes cross-team'],
  },
] as const

export const YTF_ROLE_SPLIT_ACCOUNTS: YtfRoleSplitAccount[] = [
  {
    id: 'split-operations',
    workspaceId: 'manager',
    teamGroupId: 'group-production-flow',
    label: 'Operations flow account',
    username: 'ytf-operations',
    displayName: 'YTF Operations Flow',
    role: 'operations',
    stage: 'First split after ytf-manager',
    primaryRoute: '/app/operations',
    secondaryRoute: '/app/daily-entry?pack=production-flow',
    summary: 'Shared login for production flow, shift handoff, and line-side abnormality capture before each named supervisor has an individual account.',
    people: ['Operations lead', 'Curing lead', 'Mixing lead', 'Tyre building lead', 'Shift support'],
  },
  {
    id: 'split-maintenance',
    workspaceId: 'manager',
    teamGroupId: 'group-reliability-utility',
    label: 'Maintenance and utility account',
    username: 'ytf-maintenance',
    displayName: 'YTF Maintenance and Utility',
    role: 'maintenance',
    stage: 'First split after ytf-manager',
    primaryRoute: '/app/daily-entry?mode=normal_abnormal&section=Maintenance',
    secondaryRoute: '/app/daily-entry?pack=reliability-utility',
    summary: 'Shared login for downtime, repair, utility, and repeat-failure capture before individual maintenance logins are issued.',
    people: ['Maintenance lead', 'Engineering lead', 'Repair lead', 'Utility lead'],
  },
  {
    id: 'split-quality',
    workspaceId: 'manager',
    teamGroupId: 'group-quality',
    label: 'Quality account',
    username: 'ytf-quality',
    displayName: 'YTF Quality',
    role: 'quality',
    stage: 'First split after ytf-manager',
    primaryRoute: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
    secondaryRoute: '/app/daily-entry?pack=quality',
    summary: 'Shared login for claim, defect, hold, and quality follow-up capture before individual QC and lab logins are issued.',
    people: ['Quality lead'],
  },
  {
    id: 'split-admin-planning',
    workspaceId: 'manager',
    teamGroupId: 'group-admin-planning',
    label: 'Admin and planning account',
    username: 'ytf-admin-planning',
    displayName: 'YTF Admin and Planning',
    role: 'admin_hr_planning',
    stage: 'First split after ytf-manager',
    primaryRoute: '/app/documents',
    secondaryRoute: '/app/daily-entry?pack=admin-planning',
    summary: 'Shared login for admin, planning, document control, training follow-up, and management-review preparation.',
    people: ['Admin and planning lead'],
  },
  {
    id: 'split-sales-inventory',
    workspaceId: 'manager',
    teamGroupId: 'group-sales-inventory',
    label: 'Sales and inventory account',
    username: 'ytf-sales',
    displayName: 'YTF Sales and Inventory',
    role: 'sales',
    stage: 'First split after ytf-manager',
    primaryRoute: '/app/revenue',
    secondaryRoute: '/app/daily-entry?pack=sales-inventory',
    summary: 'Shared login for sales, dealer, stock, showroom, and commercial evidence while showroom and account-specific logins are still being prepared.',
    people: ['Sales and inventory lead'],
  },
] as const

export const YTF_PLANT_A_TEAM_GROUPS: YtfPlantATeamGroup[] = [
  {
    id: 'group-production-flow',
    title: 'Production flow',
    summary: 'Run daily shift flow, line blockers, curing, mixing, and tyre-building handoff from one short manager loop.',
    currentWorkspaceId: 'manager',
    currentAccountLabel: 'ytf-manager',
    members: [
      { name: 'Operations lead', role: 'Operations & Admin' },
      { name: 'Curing lead', role: '07 Curing Press & Operations' },
      { name: 'Mixing lead', role: '01 Mixing' },
      { name: 'Tyre building lead', role: 'Tyre Building' },
      { name: 'Shift support', role: 'Tyre Building' },
    ],
    primaryDeskRoute: '/app/operations',
    primaryDeskLabel: 'Operations Control',
    secondaryDeskRoute: '/app/plant-manager',
    secondaryDeskLabel: 'Plant Manager',
    departmentIds: ['planning'],
    driveRootIds: ['plant-a-root', 'plant-a-production-office'],
    asks: ['What changed on the line or shift?', 'What quantity, batch, or press is affected?', 'Who owns the next review and when?'],
    proof: 'Photo plus short record plus the matching production or OT sheet reference.',
    handoff: 'Escalate to Plant Manager when the issue crosses shifts, lines, or needs cross-team help.',
  },
  {
    id: 'group-reliability-utility',
    title: 'Maintenance, engineering, and utility',
    summary: 'Capture machine stops, reliability risk, utility issues, and compliance blockers without leaving them in chat or verbal memory.',
    currentWorkspaceId: 'manager',
    currentAccountLabel: 'ytf-manager',
    members: [
      { name: 'Maintenance lead', role: 'Maintenance & Compliance' },
      { name: 'Engineering lead', role: 'Engineering & Maintenance' },
      { name: 'Repair lead', role: 'Maintenance & Operations' },
      { name: 'Utility lead', role: 'Utility' },
    ],
    primaryDeskRoute: '/app/maintenance',
    primaryDeskLabel: 'Maintenance',
    secondaryDeskRoute: '/app/invisible-iso',
    secondaryDeskLabel: 'Invisible ISO',
    departmentIds: ['planning'],
    driveRootIds: ['plant-a-production-office'],
    asks: ['Which machine, utility point, or spare blocker failed?', 'How long is the downtime or risk window?', 'What is the next containment or repair review time?'],
    proof: 'Photo or video, downtime note, and part or machine reference on the same record.',
    handoff: 'Move to Plant Manager when downtime hits production or when the same failure keeps repeating.',
  },
  {
    id: 'group-quality',
    title: 'Quality and claim control',
    summary: 'Turn claim, defect, release, and compliance issues into one quality record instead of scattered files and folders.',
    currentWorkspaceId: 'manager',
    currentAccountLabel: 'ytf-manager',
    members: [{ name: 'Quality lead', role: 'Quality' }],
    primaryDeskRoute: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
    primaryDeskLabel: 'Quality',
    secondaryDeskRoute: '/app/invisible-iso',
    secondaryDeskLabel: 'Invisible ISO',
    departmentIds: ['qc'],
    driveRootIds: ['plant-a-root'],
    asks: ['What defect, claim, or hold happened?', 'Which product, batch, or sample is involved?', 'What containment is active and when is the next review?'],
    proof: 'Claim file, batch evidence, lab or Excel reference, and a photo when available.',
    handoff: 'Move to Plant Manager when release, production, or customer exposure is affected.',
  },
  {
    id: 'group-admin-planning',
    title: 'Admin, HR, and planning follow-up',
    summary: 'Use the platform for admin, HR, planning, document, and training follow-up instead of leaving them in mirrored folders.',
    currentWorkspaceId: 'manager',
    currentAccountLabel: 'ytf-manager',
    members: [{ name: 'Admin and planning lead', role: 'Admin, HR, Planning' }],
    primaryDeskRoute: '/app/documents',
    primaryDeskLabel: 'Documents',
    secondaryDeskRoute: '/app/action-board',
    secondaryDeskLabel: 'Action Board',
    departmentIds: ['admin', 'planning'],
    driveRootIds: ['plant-a-root'],
    asks: ['What document, planning change, or training issue needs follow-up?', 'Who owns the next move?', 'What record or evidence must stay attached?'],
    proof: 'Document or screenshot plus one structured record with owner and due time.',
    handoff: 'Move to Plant Manager when the admin issue is blocking production, compliance, or more than one team.',
  },
  {
    id: 'group-sales-inventory',
    title: 'Sales and inventory',
    summary: 'Keep sales, stock, and commercial issues connected to the plant instead of trapped in desktop mirrors or Viber drops.',
    currentWorkspaceId: 'manager',
    currentAccountLabel: 'ytf-manager',
    members: [{ name: 'Sales and inventory lead', role: 'Admin, Sales' }],
    primaryDeskRoute: '/app/revenue',
    primaryDeskLabel: 'Revenue',
    secondaryDeskRoute: '/app/action-board',
    secondaryDeskLabel: 'Action Board',
    departmentIds: ['sales-inventory', 'admin'],
    driveRootIds: ['plant-a-root', 'showroom-pc'],
    asks: ['What sale, stock, or dealer issue changed?', 'What quantity, amount, or account is affected?', 'Who owns the next commercial or stock review?'],
    proof: 'Stock sheet, document, Viber export, or photo linked to the same record.',
    handoff: 'Move to Plant Manager when inventory pressure or customer risk affects the factory plan.',
  },
] as const

export const YTF_PLANT_A_COLLABORATION_LOOPS: YtfPlantACollaborationLoop[] = [
  {
    id: 'loop-shift-control',
    title: 'Shift control loop',
    lead: 'Operations lead',
    contributors: ['Curing lead', 'Mixing lead', 'Tyre building lead', 'Shift support'],
    trigger: 'Shift change, production drift, or abnormal line condition.',
    firstDeskRoute: '/app/daily-entry',
    firstDeskLabel: 'Daily Entry',
    secondDeskRoute: '/app/operations',
    secondDeskLabel: 'Operations Control',
    departmentIds: ['planning'],
    driveRootIds: ['plant-a-root', 'plant-a-production-office'],
    outcome: 'One owner, one due time, and one visible handoff before the next shift starts.',
  },
  {
    id: 'loop-reliability',
    title: 'Reliability and utility loop',
    lead: 'Maintenance lead',
    contributors: ['Engineering lead', 'Repair lead', 'Utility lead'],
    trigger: 'Machine stop, utility problem, spare issue, or repeat failure.',
    firstDeskRoute: '/app/maintenance',
    firstDeskLabel: 'Maintenance',
    secondDeskRoute: '/app/plant-manager',
    secondDeskLabel: 'Plant Manager',
    departmentIds: ['planning'],
    driveRootIds: ['plant-a-production-office'],
    outcome: 'Downtime is captured with cause, owner, review time, and cross-team visibility when needed.',
  },
  {
    id: 'loop-quality',
    title: 'Quality and compliance loop',
    lead: 'Quality lead',
    contributors: ['Maintenance lead', 'Operations lead'],
    trigger: 'Claim, defect, release hold, or ISO/compliance concern.',
    firstDeskRoute: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
    firstDeskLabel: 'Quality',
    secondDeskRoute: '/app/invisible-iso',
    secondDeskLabel: 'Invisible ISO',
    departmentIds: ['qc', 'planning'],
    driveRootIds: ['plant-a-root'],
    outcome: 'Containment, evidence, owner, and close date stay together instead of spreading across folders.',
  },
  {
    id: 'loop-admin-commercial',
    title: 'Admin, training, and commercial loop',
    lead: 'Admin and planning lead',
    contributors: ['Sales and inventory lead', 'Operations lead'],
    trigger: 'Document change, training follow-up, planning admin issue, or stock/commercial signal.',
    firstDeskRoute: '/app/action-board',
    firstDeskLabel: 'Action Board',
    secondDeskRoute: '/app/documents',
    secondDeskLabel: 'Documents',
    departmentIds: ['admin', 'sales-inventory'],
    driveRootIds: ['plant-a-root', 'showroom-pc'],
    outcome: 'Mixed updates become owned actions with the right document, sales, or approval route attached.',
  },
] as const

export const YTF_SOURCE_CONTEXT_LANES: YtfSourceContextLane[] = [
  {
    id: 'lane-data-sources',
    title: 'Data sources registry',
    stage: 'Live now',
    driveUrl: 'https://docs.google.com/document/d/1YYve0jCr09NmtsWwEKtY2kQOg1c_ipAPxtQc1J_t2_8/edit?usp=drivesdk',
    ownerWorkspaceId: 'admin',
    route: '/app/platform-admin',
    routeLabel: 'Platform Admin',
    purpose: 'Master list of the Drive, email, finance, and planning sources already identified for Factory Client.',
    evidenceExamples: ['Dad’s PC', 'Factory Floor production office data', 'H1 2025 financial', 'NR purchase orders'],
  },
  {
    id: 'lane-plant-a-root',
    title: 'Factory Floor shared folder',
    stage: 'Live now',
    driveUrl: YANGON_TYRE_PLANT_A_DRIVE_ROOTS[0].url,
    ownerWorkspaceId: 'manager',
    route: '/app/manager-system',
    routeLabel: 'Manager Workspace',
    purpose: 'Current shared plant root covering Planning, Admin, QC, and Tyre Sales & Inventory.',
    evidenceExamples: ['Tyre Production (daily,weekly,month)', 'OT Record', 'I.S.O (ALL)', 'Claim Tyre (2025)'],
  },
  {
    id: 'lane-plant-a-production-office',
    title: 'Factory Floor production office data',
    stage: 'Queue next',
    driveUrl: YANGON_TYRE_PLANT_A_DRIVE_ROOTS[1].url,
    ownerWorkspaceId: 'plant',
    route: '/app/plant-manager',
    routeLabel: 'Plant Manager',
    purpose: 'Needed to complete the line-side picture for mixing, tyre building, curing, maintenance, and utility evidence. The current connector pass found the source in the registry but no visible child items yet.',
    evidenceExamples: ['Production office folder is registered', 'No visible child items yet on current connector pass'],
  },
  {
    id: 'lane-ceo-data',
    title: 'CEO data',
    stage: 'Live now',
    driveUrl: 'https://drive.google.com/drive/folders/1dIOhd04trNsMYn4OPrrj1K3qQwRCDP5E',
    ownerWorkspaceId: 'admin',
    route: '/app/platform-admin',
    routeLabel: 'Platform Admin',
    purpose: 'Leadership, finance, supply chain, and governance packets for the admin and plant review layers. The current connector pass already sees 2025, 2026, export, and Bilin shortcuts here.',
    evidenceExamples: ['2025 YTF', '2026 YTF', 'EXPORT', 'BILIN 23-2026'],
  },
  {
    id: 'lane-head-office-finance',
    title: 'Head-office finance sheets',
    stage: 'Mapped from source registry',
    driveUrl: 'https://docs.google.com/spreadsheets/d/1JMTWiLHn1P834x1qy8VojIfsyMeCgv_t/edit?usp=sharing',
    ownerWorkspaceId: 'admin',
    route: '/app/approvals',
    routeLabel: 'Approvals',
    purpose: 'The shared data-sources registry already points to H1 2025, H1 2024, and H2 2024 finance sheets. These should feed approval, cash, and management-review lanes instead of staying as isolated spreadsheets.',
    evidenceExamples: ['H1 2025 financial', 'H1 2024 financials', 'H2 2024 financials'],
  },
  {
    id: 'lane-supply-chain-po',
    title: 'Head-office supply-chain and PO packs',
    stage: 'Mapped from source registry',
    driveUrl: 'https://docs.google.com/spreadsheets/d/1tIq8vZ1kOWV26Da2f8pegOUi4b79m8Qi/edit?usp=sharing',
    ownerWorkspaceId: 'admin',
    route: '/app/approvals',
    routeLabel: 'Approvals',
    purpose: 'NR purchase orders and export-planning documents are already listed in the source registry and should become supplier, procurement, and finance context inside the same system.',
    evidenceExamples: ['NR purchase orders', 'NR export planning', 'strategy docs'],
  },
  {
    id: 'lane-showroom-pc',
    title: 'Showroom PC',
    stage: 'Queue next',
    driveUrl: 'https://drive.google.com/drive/folders/1Fewjoh89sofTi0JDHYIvznaWOFc0rZMY',
    ownerWorkspaceId: 'manager',
    route: '/app/revenue',
    routeLabel: 'Revenue',
    purpose: 'Sales, customer, money, and account-side movement once the showroom PC lane is promoted into the same warehouse. The folder is visible but current connector access shows no child items yet.',
    evidenceExamples: ['Showroom PC folder is visible', 'No visible child items yet on current connector pass'],
  },
] as const

export const YTF_PLANT_A_ENTRY_PACKS: YtfPlantAEntryPack[] = [
  {
    id: 'production-flow',
    teamGroupId: 'group-production-flow',
    label: 'Production flow',
    title: 'Short entry mode for production flow and shift control.',
    summary: 'Use this for shift handoff, line blockers, curing, mixing, tyre-building issues, and quick production KPIs.',
    username: 'ytf-operations',
    role: 'operations',
    defaultOwner: 'Production Team',
    allowedModes: ['daily_routine', 'normal_abnormal', 'five_s_check', 'whiteboard_snapshot', 'shift_handoff', 'maintenance_issue', 'kpi_snapshot', 'quality_incident'],
    primaryDeskRoute: '/app/operations',
    secondaryDeskRoute: '/app/plant-manager',
    asks: ['What changed on the line or shift?', 'Which line, product, or press is affected?', 'When is the next control review?'],
    proof: 'Attach a phone photo plus the relevant production, OT, or shift evidence.',
  },
  {
    id: 'reliability-utility',
    teamGroupId: 'group-reliability-utility',
    label: 'Maintenance and utility',
    title: 'Short entry mode for downtime, repair, and utility follow-up.',
    summary: 'Use this for machine stops, utility failures, spares blockers, repeat faults, and reliability review.',
    username: 'ytf-maintenance',
    role: 'maintenance',
    defaultOwner: 'Maintenance Team',
    allowedModes: ['daily_routine', 'normal_abnormal', 'five_s_check', 'maintenance_issue', 'whiteboard_snapshot', 'shift_handoff', 'document_control'],
    primaryDeskRoute: '/app/maintenance',
    secondaryDeskRoute: '/app/plant-manager',
    asks: ['Which machine or utility point failed?', 'How long is the impact window?', 'What part, workaround, or next repair move is needed?'],
    proof: 'Attach a photo or video of the fault and note the asset or spare reference.',
  },
  {
    id: 'quality',
    teamGroupId: 'group-quality',
    label: 'Quality and claims',
    title: 'Short entry mode for defect, claim, hold, and compliance issues.',
    summary: 'Use this for claim cases, defects, release holds, audit findings, and quality-linked training gaps.',
    username: 'ytf-quality',
    role: 'quality',
    defaultOwner: 'Quality Team',
    allowedModes: ['daily_routine', 'normal_abnormal', 'five_s_check', 'quality_incident', 'whiteboard_snapshot', 'audit_review', 'training_followup', 'document_control'],
    primaryDeskRoute: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
    secondaryDeskRoute: '/app/invisible-iso',
    asks: ['What defect or claim happened?', 'Which batch, product, or release is affected?', 'What containment or review is active now?'],
    proof: 'Attach a defect photo, claim file, or Excel/lab reference on the same record.',
  },
  {
    id: 'admin-planning',
    teamGroupId: 'group-admin-planning',
    label: 'Admin and planning',
    title: 'Short entry mode for documents, planning, training, and admin follow-up.',
    summary: 'Use this for document changes, planning admin issues, training follow-up, audit points, and mixed admin tasks.',
    username: 'ytf-admin-planning',
    role: 'admin_hr_planning',
    defaultOwner: 'Admin and Planning Team',
    allowedModes: ['daily_routine', 'normal_abnormal', 'five_s_check', 'document_control', 'audit_review', 'training_followup', 'shift_handoff', 'whiteboard_snapshot', 'kpi_snapshot'],
    primaryDeskRoute: '/app/documents',
    secondaryDeskRoute: '/app/action-board',
    asks: ['What document, planning, or training issue changed?', 'Who owns the next move?', 'What record or evidence must stay attached?'],
    proof: 'Attach the current document, screenshot, or mirrored-file evidence before handing off.',
  },
  {
    id: 'sales-inventory',
    teamGroupId: 'group-sales-inventory',
    label: 'Sales and inventory',
    title: 'Short entry mode for showroom, stock, and customer-side movement.',
    summary: 'Use this for stock changes, customer issues, dealer follow-up, Viber drops, and showroom-side documentation.',
    username: 'ytf-sales',
    role: 'sales',
    defaultOwner: 'Sales and Inventory Team',
    allowedModes: ['daily_routine', 'normal_abnormal', 'five_s_check', 'kpi_snapshot', 'whiteboard_snapshot', 'document_control', 'shift_handoff', 'receiving_hold'],
    primaryDeskRoute: '/app/revenue',
    secondaryDeskRoute: '/app/action-board',
    asks: ['What sale, stock, or dealer issue changed?', 'What quantity, money, or account is affected?', 'Who owns the next commercial or stock review?'],
    proof: 'Attach stock evidence, a message export, a showroom document, or a photo from the account side.',
  },
  {
    id: 'plant-b-control',
    teamGroupId: 'group-production-flow',
    label: 'Plant B control',
    title: 'Short entry mode for Plant B daily routine, normal/abnormal, and 5S.',
    summary: 'Use this for Mr Wu style daily routine, normal/abnormal record, 5S, MC/PCR/radial/motorcycle signals, and Plant B board photos.',
    username: 'ytf-manager-b-shared',
    role: 'manager_plant_b',
    defaultOwner: 'Plant B Team',
    allowedModes: ['daily_routine', 'normal_abnormal', 'five_s_check', 'whiteboard_snapshot', 'maintenance_issue', 'quality_incident', 'document_control', 'kpi_snapshot'],
    primaryDeskRoute: '/app/daily-entry?pack=plant-b-control',
    secondaryDeskRoute: '/app/action-board',
    asks: ['What did the Plant B manager check today?', 'Was the section normal or abnormal?', 'What 5S or evidence should stay attached?'],
    proof: 'Attach a board photo, machine/section photo, or one record reference. The system reads and routes the detail.',
  },
] as const

export function getPlantATeamGroupsForWorkspace(workspaceId: YtfWorkspaceId) {
  return YTF_PLANT_A_TEAM_GROUPS.filter((group) => group.currentWorkspaceId === workspaceId)
}

export function getPlantADepartmentsForGroup(group: Pick<YtfPlantATeamGroup, 'departmentIds'>) {
  return YANGON_TYRE_PLANT_A_DEPARTMENTS.filter((department) => group.departmentIds.includes(department.id))
}

export function getPlantADriveRootsForGroup(group: Pick<YtfPlantATeamGroup, 'driveRootIds'>) {
  return YANGON_TYRE_PLANT_A_DRIVE_ROOTS.filter((driveRoot) => group.driveRootIds.includes(driveRoot.id))
}

export function collectPlantAGroupEvidence(group: Pick<YtfPlantATeamGroup, 'departmentIds'>) {
  return getPlantADepartmentsForGroup(group).flatMap((department) => department.evidenceExamples).slice(0, 4)
}

export function getSourceContextForWorkspace(workspaceId: YtfWorkspaceId) {
  return YTF_SOURCE_CONTEXT_LANES.filter((lane) => lane.ownerWorkspaceId === workspaceId)
}

export function getRoleSplitAccountsForWorkspace(workspaceId: YtfWorkspaceId) {
  return YTF_ROLE_SPLIT_ACCOUNTS.filter((account) => account.workspaceId === workspaceId)
}

export function getEntryPacksForWorkspace(workspaceId: YtfWorkspaceId) {
  if (workspaceId !== 'manager') {
    return []
  }
  return YTF_PLANT_A_ENTRY_PACKS
}

export function getEntryPackById(packId?: string | null) {
  const normalized = String(packId ?? '').trim().toLowerCase()
  return YTF_PLANT_A_ENTRY_PACKS.find((pack) => pack.id === normalized) ?? null
}

export function getEntryPackByRole(role?: string | null) {
  const normalized = String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

  if (!normalized) {
    return null
  }

  const roleToPack: Record<string, string> = {
    operations: 'production-flow',
    ops: 'production-flow',
    maintenance: 'reliability-utility',
    maintenance_lead: 'reliability-utility',
    quality: 'quality',
    qc: 'quality',
    quality_manager: 'quality',
    sales: 'sales-inventory',
    sales_lead: 'sales-inventory',
    admin_hr_planning: 'admin-planning',
    plant_a_manager: 'production-flow',
    manager_plant_a: 'production-flow',
    plant_b_manager: 'plant-b-control',
    manager_plant_b: 'plant-b-control',
  }

  return getEntryPackById(roleToPack[normalized] ?? null)
}

export function summarizePlantATeamMembers(members: readonly YtfPlantATeamMember[]) {
  return members.map((member) => member.name).join(' / ')
}

export function summarizeDepartmentTitles(departments: readonly YangonTyrePlantADepartment[]) {
  return departments.map((department) => department.title).join(' / ')
}

export function summarizeDriveRootTitles(roots: readonly YangonTyrePlantADriveRoot[]) {
  return roots.map((root) => root.title).join(' / ')
}
