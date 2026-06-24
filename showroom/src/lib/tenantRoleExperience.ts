import { normalizeWorkspaceRole } from './workspaceApi'
import { YANGON_TYRE_DATA_PROFILE } from './yangonTyreDataProfile'
import { YANGON_TYRE_MODEL, type TenantOperatingModel } from './tenantOperatingModel'

export type TenantRoleSection = {
  title: string
  route: string
  detail: string
}

export type TenantRoleInsight = {
  label: string
  value: string
  detail: string
}

export type TenantRoleExperience = {
  canonicalRole: string
  title: string
  mission: string
  defaultHome: string
  sections: TenantRoleSection[]
  insights: TenantRoleInsight[]
  focusModules: string[]
  nextModules: string[]
}

const YTF_ROLE_ALIASES: Record<string, string> = {
  ceo: 'director',
  director: 'director',
  owner: 'manager',
  admin: 'tenant_admin',
  tenant_admin: 'tenant_admin',
  platform_admin: 'platform_admin',
  manager: 'manager',
  plant_manager: 'plant_manager',
  plant_a_manager: 'plant_manager',
  plant_b_manager: 'plant_manager',
  manager_plant_a: 'manager',
  manager_plant_b: 'manager',
  operations_admin: 'plant_manager',
  maintenance_compliance: 'maintenance_lead',
  engineering_maintenance: 'maintenance_lead',
  curing_press_operations: 'plant_manager',
  maintenance_operations: 'maintenance_lead',
  utility: 'maintenance_lead',
  admin_hr_planning: 'admin_hr_planning',
  mixing_operator: 'plant_manager',
  admin_sales: 'sales_lead',
  tyre_building: 'plant_manager',
  quality_control: 'quality_manager',
  operations: 'operations',
  ops: 'operations',
  receiving_clerk: 'receiving_clerk',
  procurement_lead: 'procurement_lead',
  finance_controller: 'finance_controller',
  quality: 'quality',
  qc: 'quality',
  quality_manager: 'quality_manager',
  maintenance: 'maintenance',
  maintenance_lead: 'maintenance_lead',
  sales: 'sales_lead',
  sales_lead: 'sales_lead',
}

function formatRoleId(id: string) {
  return id.replace(/_/g, ' ')
}

function getModulesForRole(model: TenantOperatingModel, canonicalRole: string) {
  const roleLabel = formatRoleId(canonicalRole)
  return model.modules.filter((module) => module.users.some((item) => item.toLowerCase() === roleLabel))
}

function getDefaultYtfExperience(canonicalRole: string): TenantRoleExperience {
  const modules = getModulesForRole(YANGON_TYRE_MODEL, canonicalRole)
  const currentModules = modules
    .filter((module) => module.status === 'Live now' || module.status === 'Rollout ready' || module.status === 'Control layer')
    .slice(0, 4)
    .map((module) => module.name)
  const nextModules = modules
    .filter((module) => module.status === 'Next module')
    .slice(0, 3)
    .map((module) => module.name)

  return {
    canonicalRole,
    title: 'Workspace',
    mission: 'Open the right desk, keep evidence linked, and move the next concrete action.',
    defaultHome: modules.find((module) => module.route)?.route ?? '/app/meta',
    sections: modules
      .filter((module) => module.route)
      .slice(0, 4)
      .map((module) => ({
        title: module.name,
        route: module.route || '/app/meta',
        detail: module.summary,
      })),
    insights: [
      {
        label: 'Annual output',
        value: `${YANGON_TYRE_DATA_PROFILE.annualBiasOutput2024.toLocaleString()} tyres`,
        detail: 'Bias-tyre output captured in the local 2024 workbook.',
      },
      {
        label: 'B+R average',
        value: `${YANGON_TYRE_DATA_PROFILE.annualBPlusRRate2024}%`,
        detail: 'Average B+R rate across the 2024 monthly sheet.',
      },
    ],
    focusModules: currentModules,
    nextModules,
  }
}

const YTF_ROLE_EXPERIENCES: Record<string, TenantRoleExperience> = {
  platform_admin: {
    canonicalRole: 'platform_admin',
    title: 'YTF setup control',
    mission: 'Keep Yangon Tyre access, data sources, scheduled jobs, and role screens stable without exposing internal build tools.',
    defaultHome: '/app/platform-admin',
    sections: [
      { title: 'Workspace Setup', route: '/app/platform-admin', detail: 'Control users, role access, rollout status, and safe setup requests.' },
      { title: 'Attendance and Payroll', route: '/app/attendance-payroll', detail: 'Prepare employee enrollment, tablet check-ins, OT approval, and payroll export controls.' },
      { title: 'System Health', route: '/app/system', detail: 'Check domain, database, scheduled jobs, source refresh, and privacy health.' },
      { title: 'Live Data', route: '/app/live-data', detail: 'Review transformed records, KPI candidates, changed files, and evidence search.' },
      { title: 'Email and Chat', route: '/app/email', detail: 'Admin-only connector view for supplier, sales, and forwarded message lanes.' },
      { title: 'Plant Review', route: '/app/plant-manager', detail: 'Confirm the manager and plant-manager loops are practical for daily use.' },
    ],
    insights: [
      {
        label: 'Control surface',
        value: 'Setup first',
        detail: 'Use Setup and System before changing any manager-facing workflow.',
      },
      {
        label: 'Production stages',
        value: '4 line groups',
        detail: YANGON_TYRE_DATA_PROFILE.productionLines.join(' / '),
      },
      {
        label: 'Machine clusters',
        value: `${YANGON_TYRE_DATA_PROFILE.machineClusters.length} core assets`,
        detail: YANGON_TYRE_DATA_PROFILE.machineClusters.join(', '),
      },
      {
        label: 'Target posture',
        value: 'B+R below 3.0%',
        detail: 'Control-layer improvements should tighten plant execution, adoption, and trust together.',
      },
    ],
    focusModules: ['Workspace Setup', 'Attendance and Payroll', 'System Health', 'Live Data', 'Email and Chat', 'Plant Review'],
    nextModules: ['KPI Review', 'Whiteboard Capture'],
  },
  director: {
    canonicalRole: 'director',
    title: 'CEO command',
    mission: 'Run the company from one review loop for plant risk, supplier exposure, commercial movement, and the next intervention.',
    defaultHome: '/app/director',
    sections: [
      { title: 'CEO Command Center', route: '/app/director', detail: 'Daily and weekly leadership review with risk, approvals, and follow-through.' },
      { title: 'Plant Manager', route: '/app/plant-manager', detail: 'See the plant review loop, teaching packs, and the desks that factory leaders should actually use.' },
      { title: 'Live Data', route: '/app/live-data', detail: 'Transformed records, KPIs, changed files, and role-safe data stories.' },
      { title: 'System Health', route: '/app/system', detail: 'Source freshness, scheduled jobs, database, email, and knowledge status.' },
      { title: 'Sales and Dealer Control', route: '/app/revenue', detail: 'Dealer pipeline, quote posture, and commercial exposure.' },
      { title: 'Approvals and Supplier Recovery', route: '/app/approvals', detail: 'High-impact approvals, supplier delays, and financial control.' },
      { title: 'DQMS', route: '/app/dqms', detail: 'Quality incidents, CAPA, containment, and ISO evidence review.' },
    ],
    insights: [
      {
        label: '2024 output',
        value: `${YANGON_TYRE_DATA_PROFILE.annualBiasOutput2024.toLocaleString()} tyres`,
        detail: 'Annual bias-tyre output from the local workbook.',
      },
      {
        label: 'Average B+R',
        value: `${YANGON_TYRE_DATA_PROFILE.annualBPlusRRate2024}%`,
        detail: 'Yearly average B+R based on the monthly 2024 sheet.',
      },
      {
        label: 'Worst month',
        value: `${YANGON_TYRE_DATA_PROFILE.worstMonth2024.month} ${YANGON_TYRE_DATA_PROFILE.worstMonth2024.bPlusRRate}%`,
        detail: 'Highest monthly B+R in the 2024 workbook.',
      },
      {
        label: 'Top SKU',
        value: YANGON_TYRE_DATA_PROFILE.focusProducts2025[0].name,
        detail: `${YANGON_TYRE_DATA_PROFILE.focusProducts2025[0].units.toLocaleString()} units across weeks 01-06 in 2025.`,
      },
    ],
    focusModules: ['CEO Command Center', 'Plant Manager', 'Live Data', 'System Health', 'Sales CRM', 'DQMS'],
    nextModules: ['Lab SPC and Release', 'Operating Intelligence Studio'],
  },
  tenant_admin: {
    canonicalRole: 'tenant_admin',
    title: 'Admin workspace',
    mission: 'Control identity, connector scopes, rollout, runtime trust, and private Yangon Tyre data readiness.',
    defaultHome: '/app/platform-admin',
    sections: [
      { title: 'Workspace Setup', route: '/app/platform-admin', detail: 'Users, roles, rollout, data sources, cloud jobs, and setup requests.' },
      { title: 'Attendance and Payroll', route: '/app/attendance-payroll', detail: 'Prepare phone/tablet check-ins, employee photo enrollment, OT approval, and salary export review.' },
      { title: 'Plant Manager', route: '/app/plant-manager', detail: 'Keep the factory manager layer simple, trainable, and connected to live desks.' },
      { title: 'Live Data', route: '/app/live-data', detail: 'Source coverage, KPI candidates, changed files, and role-safe data stories.' },
      { title: 'System Health', route: '/app/system', detail: 'Database, Drive, Gmail, scheduled jobs, privacy, and knowledge status.' },
      { title: 'Email and Chat', route: '/app/email', detail: 'Admin-only connector view for supplier, sales, and forwarded message lanes.' },
      { title: 'Action Board', route: '/app/action-board', detail: 'Confirm that source-backed tasks route to owners and close cleanly.' },
    ],
    insights: [
      {
        label: 'Production stages',
        value: '4 line groups',
        detail: YANGON_TYRE_DATA_PROFILE.productionLines.join(' / '),
      },
      {
        label: 'Machine clusters',
        value: `${YANGON_TYRE_DATA_PROFILE.machineClusters.length} core assets`,
        detail: YANGON_TYRE_DATA_PROFILE.machineClusters.join(', '),
      },
      {
        label: 'Target posture',
        value: 'B+R below 3.0%',
        detail: 'Use controlled incident capture and closeout to tighten plant and quality loops.',
      },
      {
        label: 'Top SKU mix',
        value: YANGON_TYRE_DATA_PROFILE.focusProducts2025.slice(0, 3).map((item) => item.name).join(' / '),
        detail: 'Leading SKUs from the 2025 weekly workbook.',
      },
    ],
    focusModules: ['Workspace Setup', 'Attendance and Payroll', 'Plant Manager', 'Live Data', 'System Health', 'Email and Chat', 'Action Board'],
    nextModules: ['Operating Intelligence Studio', 'Lab SPC and Release'],
  },
  manager: {
    canonicalRole: 'manager',
    title: 'Manager workspace',
    mission: 'Use one compact form to capture today’s work, then check the action board only when follow-up is needed.',
    defaultHome: '/app/manager-system',
    sections: [
      { title: 'Today', route: '/app/manager-system', detail: 'See only today work, missing proof, and useful plant numbers.' },
      { title: 'New Entry', route: '/app/daily-entry', detail: 'Daily 5W1H, normal or abnormal record, 5S, or board photo.' },
      { title: 'Team Board', route: '/app/action-board', detail: 'Finish open work with owner, proof, and next step.' },
      { title: 'Plant Data', route: '/app/live-data', detail: 'Production, quality, stock, and supplier values by plant and source date.' },
    ],
    insights: [
      {
        label: 'Main job',
        value: 'Capture and route',
        detail: 'Manager work should save the fact once and make the next step visible.',
      },
      {
        label: 'Default rhythm',
        value: 'Daily entry first',
        detail: 'Use the form before chat escalation or spreadsheet backfill.',
      },
      {
        label: 'Plant handoff',
        value: 'Escalate to Plant Manager',
        detail: 'Use Plant Manager only when the issue crosses teams, shifts, or factory-level risk.',
      },
    ],
    focusModules: ['Today', 'New Entry', 'Team Board', 'Plant Data'],
    nextModules: ['Role-specific section packs'],
  },
  operations: {
    canonicalRole: 'operations',
    title: 'Operations entry',
    mission: 'Capture shift flow, blockers, production drift, and line evidence from one short mobile-first pack.',
    defaultHome: '/app/daily-entry?pack=production-flow',
    sections: [
      { title: 'Production Flow Pack', route: '/app/daily-entry?pack=production-flow', detail: 'Short phone-first entry for shift handoff, line blockers, and quick production KPIs.' },
      { title: 'Operations Control', route: '/app/operations', detail: 'Escalate only after the issue is captured cleanly in the pack.' },
      { title: 'Plant Manager', route: '/app/plant-manager', detail: 'Use when the issue crosses teams, shifts, or plant-level risk.' },
      { title: 'Documents', route: '/app/documents', detail: 'Attach a file, screenshot, or controlled record when the entry needs more than a photo.' },
    ],
    insights: [
      { label: 'Default screen', value: 'Production flow pack', detail: 'The fastest true entry should open first on a shared plant phone.' },
      { label: 'Main proof', value: 'Photo + shift fact', detail: 'Capture the line, press, quantity, or blocker before discussing it in chat.' },
      { label: 'Escalation rule', value: 'Cross-team only', detail: 'Use Plant Manager after the first owned fact is already saved.' },
      { label: 'Data value', value: 'Flow history', detail: 'These entries become the production and loss story later in the warehouse.' },
    ],
    focusModules: ['Production Flow Pack', 'Operations Control', 'Plant Manager', 'Documents'],
    nextModules: ['Live Data'],
  },
  plant_manager: {
    canonicalRole: 'plant_manager',
    title: 'Plant Manager workspace',
    mission: 'Run shift flow, receiving, manufacturing control, quality escalation, and maintenance follow-up from one operator home.',
    defaultHome: '/app/plant-manager',
    sections: [
      { title: 'Today', route: '/app/plant-manager', detail: 'Plant review, open team work, latest values, and daily close.' },
      { title: 'Plant Data', route: '/app/live-data', detail: 'Production, quality, stock, supplier, and WCM signals by plant.' },
      { title: 'Team Board', route: '/app/action-board', detail: 'Cross-team work that needs owner, proof, or closeout.' },
      { title: 'New Entry', route: '/app/daily-entry', detail: 'Capture a plant-manager note, board photo, 5W1H, or abnormal condition.' },
    ],
    insights: [
      {
        label: 'Best month',
        value: `${YANGON_TYRE_DATA_PROFILE.bestMonth2024.month} ${YANGON_TYRE_DATA_PROFILE.bestMonth2024.bPlusRRate}%`,
        detail: 'Lowest monthly B+R in the 2024 sheet.',
      },
      {
        label: 'Factory stages',
        value: 'Mixing to curing',
        detail: YANGON_TYRE_DATA_PROFILE.productionLines.join(' / '),
      },
      {
        label: 'Focus SKU',
        value: YANGON_TYRE_DATA_PROFILE.focusProducts2025[1].name,
        detail: `${YANGON_TYRE_DATA_PROFILE.focusProducts2025[1].units.toLocaleString()} units in the early 2025 weekly data.`,
      },
      {
        label: 'Plant target',
        value: 'B+R under 3.0%',
        detail: 'Operate the daily queue around containment, downtime, and traceability.',
      },
    ],
    focusModules: ['Today', 'Plant Data', 'Team Board', 'New Entry'],
    nextModules: ['Plant B split', 'CEO review'],
  },
  quality: {
    canonicalRole: 'quality',
    title: 'Quality entry',
    mission: 'Capture defects, claims, release holds, audit findings, and closeout proof from one controlled quality pack.',
    defaultHome: '/app/daily-entry?pack=quality',
    sections: [
      { title: 'Quality Pack', route: '/app/daily-entry?pack=quality', detail: 'Short phone-first entry for claims, defects, audit notes, training gaps, and release concerns.' },
      { title: 'DQMS and Quality Methods', route: '/app/dqms', detail: 'Open the full quality desk only after the incident is captured cleanly.' },
      { title: 'Invisible ISO', route: '/app/invisible-iso', detail: 'Use the hidden ISO loop when the issue needs a structured closeout rhythm.' },
      { title: 'Plant Manager', route: '/app/plant-manager', detail: 'Escalate only when quality risk hits production, release, or customer exposure.' },
    ],
    insights: [
      { label: 'Default screen', value: 'Quality pack', detail: 'Claims and defects should not start from a broad dashboard.' },
      { label: 'Main proof', value: 'Photo + file', detail: 'Attach a defect image, claim evidence, or lab/Excel reference on the same record.' },
      { label: 'Escalation rule', value: 'Release or customer risk', detail: 'Use Plant Manager when the issue affects more than one quality owner or department.' },
      { label: 'Data value', value: 'Claim memory', detail: 'These entries build the internal quality knowledge base over time.' },
    ],
    focusModules: ['Quality Pack', 'DQMS and Quality Methods', 'Invisible ISO', 'Plant Manager'],
    nextModules: ['Live Data'],
  },
  maintenance: {
    canonicalRole: 'maintenance',
    title: 'Maintenance entry',
    mission: 'Capture downtime, failure, utility, and spare-part follow-up from one reliability pack before opening heavier control desks.',
    defaultHome: '/app/daily-entry?pack=reliability-utility',
    sections: [
      { title: 'Maintenance Pack', route: '/app/daily-entry?pack=reliability-utility', detail: 'Short phone-first entry for breakdowns, utility issues, repeat faults, and reliability follow-up.' },
      { title: 'Maintenance Control', route: '/app/maintenance', detail: 'Open the full maintenance desk after the fact, owner, and proof are saved.' },
      { title: 'Plant Manager', route: '/app/plant-manager', detail: 'Escalate when downtime or repeat failure is crossing into wider plant control.' },
      { title: 'Documents', route: '/app/documents', detail: 'Attach manuals, spare references, or compliance proof when needed.' },
    ],
    insights: [
      { label: 'Default screen', value: 'Maintenance pack', detail: 'Breakdown capture should start on a compact phone screen.' },
      { label: 'Main proof', value: 'Fault photo or video', detail: 'Capture the asset, spare, and downtime evidence on the first record.' },
      { label: 'Escalation rule', value: 'Production impact', detail: 'Use Plant Manager when the stop affects output, quality, or more than one team.' },
      { label: 'Data value', value: 'Failure memory', detail: 'These entries become repeat-failure and reliability intelligence later.' },
    ],
    focusModules: ['Maintenance Pack', 'Maintenance Control', 'Plant Manager', 'Documents'],
    nextModules: ['Live Data'],
  },
  admin_hr_planning: {
    canonicalRole: 'admin_hr_planning',
    title: 'Admin and planning entry',
    mission: 'Capture document changes, planning follow-up, training gaps, and admin issues from one compact manager pack.',
    defaultHome: '/app/daily-entry?pack=admin-planning',
    sections: [
      { title: 'Admin and Planning Pack', route: '/app/daily-entry?pack=admin-planning', detail: 'Short phone-first entry for document control, training, planning changes, and audit follow-up.' },
      { title: 'Document Control', route: '/app/documents', detail: 'Keep controlled files, SOPs, and records linked to the same operating layer.' },
      { title: 'Manager Workspace', route: '/app/manager-system', detail: 'Use the broader manager desk only when the issue needs mixed review.' },
      { title: 'Action Board', route: '/app/action-board', detail: 'Turn messy admin or planning notes into one owner and one due window.' },
    ],
    insights: [
      { label: 'Default screen', value: 'Admin and planning pack', detail: 'Planning and document work should start from one simple structured form.' },
      { label: 'Main proof', value: 'Current file or screenshot', detail: 'Attach the document, desktop proof, or training evidence before handoff.' },
      { label: 'Escalation rule', value: 'Factory impact', detail: 'Escalate only when the admin or planning issue blocks production or compliance.' },
      { label: 'Data value', value: 'Control history', detail: 'These entries become the living history for document and training control.' },
    ],
    focusModules: ['Admin and Planning Pack', 'Document Control', 'Manager Workspace', 'Action Board'],
    nextModules: ['Plant Manager'],
  },
  sales: {
    canonicalRole: 'sales',
    title: 'Sales and inventory entry',
    mission: 'Capture showroom, stock, dealer, and commercial signals from one compact pack that stays tied to plant reality.',
    defaultHome: '/app/daily-entry?pack=sales-inventory',
    sections: [
      { title: 'Sales and Inventory Pack', route: '/app/daily-entry?pack=sales-inventory', detail: 'Short phone-first entry for stock changes, dealer follow-up, showroom issues, and account-side proof.' },
      { title: 'Sales and Dealer Control', route: '/app/revenue', detail: 'Open the full sales desk after the commercial fact is saved cleanly.' },
      { title: 'Documents', route: '/app/documents', detail: 'Attach Viber exports, stock files, invoices, and showroom records.' },
      { title: 'Action Board', route: '/app/action-board', detail: 'Use when the update is mixed across money, stock, and customer follow-up.' },
    ],
    insights: [
      { label: 'Default screen', value: 'Sales and inventory pack', detail: 'Showroom work should start from a compact entry loop, not a broad CRM page.' },
      { label: 'Main proof', value: 'File, photo, or chat export', detail: 'Attach the stock file, screenshot, or Viber evidence to the same record.' },
      { label: 'Escalation rule', value: 'Factory or cash impact', detail: 'Escalate when the commercial issue changes plant planning or financial control.' },
      { label: 'Data value', value: 'Demand memory', detail: 'These entries later build the internal commercial and stock knowledge layer.' },
    ],
    focusModules: ['Sales and Inventory Pack', 'Sales and Dealer Control', 'Documents', 'Action Board'],
    nextModules: ['Live Data'],
  },
  receiving_clerk: {
    canonicalRole: 'receiving_clerk',
    title: 'Receiving control',
    mission: 'Capture inbound issues at the source, link evidence, and keep the next action visible for procurement and plant teams.',
    defaultHome: '/app/receiving',
    sections: [
      { title: 'Receiving Control', route: '/app/receiving', detail: 'GRN, COA, shortage, hold, and next-action records.' },
      { title: 'Role Routines', route: '/app/use', detail: 'Receiving routines, manager checks, and source-pack coverage for inbound issues.' },
      { title: 'Operations Control', route: '/app/operations', detail: 'Shared plant queue for escalation and review.' },
      { title: 'Document Intelligence', route: '/app/documents', detail: 'Attach photos, docs, and supplier evidence to the receipt record.' },
      { title: 'Approvals', route: '/app/approvals', detail: 'Escalate supplier and financial decisions that block release.' },
    ],
    insights: [
      {
        label: 'Inbound priority',
        value: 'GRN, COA, release',
        detail: 'Receiving is the first control gate before material enters production.',
      },
      {
        label: 'Supplier evidence',
        value: 'Drive + Gmail + chat',
        detail: 'Use one portal record instead of scattered attachments and threads.',
      },
      {
        label: 'Top material risk',
        value: 'Batch traceability',
        detail: 'Receipt records must stay linked to later quality and genealogy work.',
      },
      {
        label: 'Stage coverage',
        value: 'PD-1 to PD-4',
        detail: 'Release quality at receipt affects the whole tyre flow downstream.',
      },
    ],
    focusModules: ['Receiving Control', 'Role Routines', 'Document Intelligence', 'Supplier Control'],
    nextModules: ['Manufacturing Command'],
  },
  procurement_lead: {
    canonicalRole: 'procurement_lead',
    title: 'Supplier recovery',
    mission: 'Own supplier follow-up, missing evidence, discrepancy recovery, and approval debt before it hits plant flow.',
    defaultHome: '/app/approvals',
    sections: [
      { title: 'Supplier Control', route: '/app/approvals', detail: 'Discrepancies, approvals, and supplier recovery loops.' },
      { title: 'Role Routines', route: '/app/use', detail: 'Procurement routines, recovery queues, and AI support mapped to daily work.' },
      { title: 'Live Data', route: '/app/live-data', detail: 'Supplier recovery metrics, evidence completeness, and mailbox-to-GRN linkage.' },
      { title: 'Receiving Control', route: '/app/receiving', detail: 'Inbound issues and hold records tied back to shipment and PO.' },
      { title: 'Document Intelligence', route: '/app/documents', detail: 'Invoice, PO, COA, and customs evidence linked to the same case.' },
      { title: 'Director Review', route: '/app/director', detail: 'Escalate financial and supply-risk decisions with context.' },
    ],
    insights: [
      {
        label: 'Source mesh',
        value: 'Gmail, Drive, ERP, chat',
        detail: 'Supplier control needs all inbound document channels on one record.',
      },
      {
        label: 'Target result',
        value: 'Fewer holds and faster release',
        detail: 'Clear document debt before it becomes a plant blocker.',
      },
      {
        label: 'Most exposed SKU',
        value: YANGON_TYRE_DATA_PROFILE.focusProducts2025[0].name,
        detail: 'High-volume products make supplier drift more expensive.',
      },
      {
        label: 'Approval posture',
        value: 'Evidence before release',
        detail: 'Every escalation should carry owner, due date, and supporting files.',
      },
    ],
    focusModules: ['Supplier Control', 'Live Data', 'Role Routines', 'Receiving Control', 'Document Intelligence'],
    nextModules: ['Operating Intelligence Studio'],
  },
  finance_controller: {
    canonicalRole: 'finance_controller',
    title: 'Finance control',
    mission: 'Review supplier exposure, approval thresholds, and commercial risk without losing the operating evidence underneath.',
    defaultHome: '/app/approvals',
    sections: [
      { title: 'Approvals', route: '/app/approvals', detail: 'Pending financial, supplier, and release decisions.' },
      { title: 'Role Routines', route: '/app/use', detail: 'Finance review posture, approval evidence, and cross-functional manager loops.' },
      { title: 'Live Data', route: '/app/live-data', detail: 'Supplier, GRN, and finance evidence promoted into one reviewable view.' },
      { title: 'Director Dashboard', route: '/app/director', detail: 'Cross-module business risk and next decisions.' },
      { title: 'Sales Desk', route: '/app/revenue', detail: 'Commercial movement, credit context, and account exposure.' },
      { title: 'Document Intelligence', route: '/app/documents', detail: 'Invoice, PO, and evidence links for financial review.' },
    ],
    insights: [
      {
        label: 'Commercial + supply tie-in',
        value: 'One approval chain',
        detail: 'Supplier and commercial risk both need evidence-linked review.',
      },
      {
        label: 'Annual plant output',
        value: `${YANGON_TYRE_DATA_PROFILE.annualBiasOutput2024.toLocaleString()} tyres`,
        detail: 'Financial review is tied to actual plant throughput.',
      },
      {
        label: 'Quality cost watch',
        value: `${YANGON_TYRE_DATA_PROFILE.annualBPlusRRate2024}% average B+R`,
        detail: 'Quality drift directly affects scrap, rework, and customer exposure.',
      },
      {
        label: 'Focus SKU load',
        value: YANGON_TYRE_DATA_PROFILE.focusProducts2025.slice(0, 2).map((item) => item.name).join(' / '),
        detail: 'High-volume SKU issues can compound financial exposure quickly.',
      },
    ],
    focusModules: ['Supplier Control', 'Live Data', 'Role Routines', 'Sales CRM', 'CEO Command Center'],
    nextModules: ['Operating Intelligence Studio'],
  },
  quality_manager: {
    canonicalRole: 'quality_manager',
    title: 'Quality closeout',
    mission: 'Turn incidents, CAPA, lab review, and root-cause discipline into a reliable factory quality loop.',
    defaultHome: '/app/dqms',
    sections: [
      { title: 'Plant Manager', route: '/app/plant-manager', detail: 'Run the quality-manager review loop and teach structured closeout discipline.' },
      { title: 'DQMS and Quality Methods', route: '/app/dqms', detail: 'Incidents, CAPA, fishbone, 5W1H, and containment.' },
      { title: 'Role Routines', route: '/app/use', detail: 'Quality routines, evidence discipline, and closeout work.' },
      { title: 'Live Data', route: '/app/live-data', detail: 'Quality-loss metrics, release evidence, and recurring-defect analysis for technical review.' },
      { title: 'Knowledge and SOP evidence', route: '/app/live-data?view=data', detail: 'Standards, work instructions, root-cause learning, and evidence.' },
      { title: 'Operations Control', route: '/app/operations', detail: 'Shared execution queue with plant and maintenance.' },
      { title: 'Director Review', route: '/app/director', detail: 'Escalate major incidents and plant-quality debt.' },
    ],
    insights: [
      {
        label: 'Top defect set',
        value: YANGON_TYRE_DATA_PROFILE.topDefects.slice(0, 3).join(' / '),
        detail: 'Defect priorities already called out in the YTF DQMS project notes.',
      },
      {
        label: '2024 average B+R',
        value: `${YANGON_TYRE_DATA_PROFILE.annualBPlusRRate2024}%`,
        detail: 'Baseline from the local monthly quality sheet.',
      },
      {
        label: 'Worst quality month',
        value: `${YANGON_TYRE_DATA_PROFILE.worstMonth2024.month} ${YANGON_TYRE_DATA_PROFILE.worstMonth2024.bPlusRRate}%`,
        detail: 'Use as a management reference point for drift and escalation.',
      },
      {
        label: 'Compound and release',
        value: 'Lab SPC and genealogy',
        detail: 'Quality needs batch, recipe, cure, and release history on the same case.',
      },
    ],
    focusModules: ['Plant Manager', 'DQMS and Quality Methods', 'Live Data', 'Role Routines', 'Knowledge and SOP Memory', 'Manufacturing Command'],
    nextModules: ['Lab SPC and Release', 'Operating Intelligence Studio'],
  },
  maintenance_lead: {
    canonicalRole: 'maintenance_lead',
    title: 'Reliability control',
    mission: 'Keep equipment, downtime, spare-part blockers, and recurring-failure learning on one reliability loop.',
    defaultHome: '/app/maintenance',
    sections: [
      { title: 'Plant Manager', route: '/app/plant-manager', detail: 'Run daily reliability review, repeat-failure checks, and teaching drills for supervisors.' },
      { title: 'Maintenance Control', route: '/app/maintenance', detail: 'Breakdown logs, PM plans, and spare-part blockers.' },
      { title: 'Role Routines', route: '/app/use', detail: 'Reliability routines, downtime governance, and repeat-failure discipline.' },
      { title: 'Live Data', route: '/app/live-data', detail: 'Downtime metrics, asset-linked engineering cuts, and reliability storytelling.' },
      { title: 'Operations Control', route: '/app/operations', detail: 'Plant issues and cross-team escalation from one queue.' },
      { title: 'DQMS and Quality Methods', route: '/app/dqms', detail: 'Link machine issues to quality incidents and containment.' },
      { title: 'SOP and evidence base', route: '/app/live-data?view=data', detail: 'Preserve 5W1H, Ishikawa, and repeat-failure learning.' },
    ],
    insights: [
      {
        label: 'Machine set',
        value: YANGON_TYRE_DATA_PROFILE.machineClusters.join(' / '),
        detail: 'Core asset groups already referenced in the YTF notes.',
      },
      {
        label: 'Quality tie-in',
        value: YANGON_TYRE_DATA_PROFILE.topDefects.slice(0, 2).join(' / '),
        detail: 'Machine drift and defect clusters need one shared root-cause path.',
      },
      {
        label: 'Factory stages',
        value: 'PD-1 to PD-4',
        detail: 'Reliability work spans mixing, component prep, building, and curing.',
      },
      {
        label: 'Next module',
        value: 'Manufacturing genealogy',
        detail: 'Connect asset, batch, and incident history to isolate repeat failures faster.',
      },
    ],
    focusModules: ['Plant Manager', 'Maintenance Control', 'Live Data', 'Role Routines', 'Manufacturing Command', 'DQMS and Quality Methods'],
    nextModules: ['Lab SPC and Release'],
  },
  sales_lead: {
    canonicalRole: 'sales_lead',
    title: 'Commercial control',
    mission: 'Run dealer relationships, follow-up, visit plans, and commercial risk from one sales home.',
    defaultHome: '/app/revenue',
    sections: [
      { title: 'Revenue Desk', route: '/app/revenue', detail: 'Dealer accounts, quotes, next actions, and account history.' },
      { title: 'Role Routines', route: '/app/use', detail: 'Commercial routines and follow-up discipline for dealer work.' },
      { title: 'Live Data', route: '/app/live-data', detail: 'Dealer demand metrics, campaign signals, and role-specific sales storytelling.' },
      { title: 'Pipeline', route: '/app/revenue/pipeline', detail: 'Pipeline stages, offer readiness, and follow-up ownership.' },
      { title: 'Director Review', route: '/app/director', detail: 'Escalate pricing, collections, or strategy calls.' },
      { title: 'Approvals', route: '/app/approvals', detail: 'Coordinate credit, collections, and commercial exceptions.' },
    ],
    insights: [
      {
        label: 'Top product mix',
        value: YANGON_TYRE_DATA_PROFILE.focusProducts2025.slice(0, 3).map((item) => item.name).join(' / '),
        detail: 'High-volume tyres from the early 2025 weekly workbook.',
      },
      {
        label: 'Factory-backed selling',
        value: 'Live production context',
        detail: 'Sales can work against real product mix, availability pressure, and plant status.',
      },
      {
        label: 'Visit planning',
        value: 'Calendar-linked',
        detail: 'Commercial activity should stay tied to the dealer record and next task.',
      },
      {
        label: 'Commercial risk',
        value: 'Approvals + account memory',
        detail: 'Collections, pricing, and special cases stay evidence-linked.',
      },
    ],
    focusModules: ['Sales CRM', 'Live Data', 'Role Routines', 'CEO Command Center'],
    nextModules: ['Operating Intelligence Studio'],
  },
}

export function resolveTenantRoleExperience(tenantKey: TenantOperatingModel['tenantKey'], role?: string | null): TenantRoleExperience {
  if (tenantKey !== 'ytf-plant-a') {
    const normalizedRole = normalizeWorkspaceRole(role)

    if (normalizedRole === 'platform_admin' || normalizedRole === 'tenant_admin' || normalizedRole === 'admin') {
      return {
        canonicalRole: normalizedRole,
        title: 'Platform control',
        mission: 'Run the platform from the control layer, then move into rollout, runtime, and product execution surfaces as needed.',
        defaultHome: '/app/platform-admin',
        sections: [
          { title: 'Control Workbench', route: '/app/workbench', detail: 'Run delegated pods, infrastructure phases, and execution tracks.' },
          { title: 'Cloud Ops', route: '/app/cloud', detail: 'Keep pod ownership, cloud environments, and internal tooling visible from one map.' },
          { title: 'Model Ops', route: '/app/model-ops', detail: 'Keep provider readiness, routing contracts, and benchmark drills explicit before autonomy scales.' },
          { title: 'Platform Admin', route: '/app/platform-admin', detail: 'Control tenant posture, rollout, module state, and platform governance.' },
          { title: 'R&D Command', route: '/app/lab', detail: 'Run research cells, module bets, and graduation gates.' },
          { title: 'Product Ops', route: '/app/product-ops', detail: 'Turn portfolio and release pressure into staffed delivery work.' },
          { title: 'Build', route: '/app/factory', detail: 'Run the module factory, programs, and release readiness board.' },
        ],
        insights: [],
        focusModules: ['Control Workbench', 'Cloud Ops', 'Model Ops', 'Platform Admin', 'Product Ops', 'Build'],
        nextModules: ['Runtime', 'Knowledge'],
      }
    }

    if (normalizedRole === 'implementation_lead' || normalizedRole === 'architect') {
      return {
        canonicalRole: normalizedRole,
        title: 'Implementation control',
        mission: 'Translate company goals into tenant architecture, rollout plans, and the next bounded execution tracks.',
        defaultHome: '/app/architect',
        sections: [
          { title: 'Control Workbench', route: '/app/workbench', detail: 'Resolve architecture tradeoffs and seed execution tracks into the live queue.' },
          { title: 'Cloud Ops', route: '/app/cloud', detail: 'Define the pod topology, cloud environments, and service-lane shape before rollout expands.' },
          { title: 'Model Ops', route: '/app/model-ops', detail: 'Bind the right provider and benchmark lane to each crew before you scale execution.' },
          { title: 'Solution Architect', route: '/app/architect', detail: 'Map sector workflows into modules, data sources, and rollout order.' },
          { title: 'Product Ops', route: '/app/product-ops', detail: 'Review release trains, readiness, and delivery owners.' },
          { title: 'Build', route: '/app/factory', detail: 'Run the AI-native app factory and module promotion work.' },
        ],
        insights: [],
        focusModules: ['Control Workbench', 'Cloud Ops', 'Model Ops', 'Solution Architect', 'Product Ops', 'Build'],
        nextModules: ['Runtime', 'Platform Admin'],
      }
    }

    if (normalizedRole === 'director' || normalizedRole === 'ceo' || normalizedRole === 'owner') {
      return {
        canonicalRole: normalizedRole,
        title: 'Director control',
        mission: 'Review company posture, convert priorities into decisions, and steer the execution machine without losing the big picture.',
        defaultHome: '/app/director',
        sections: [
          { title: 'Control Workbench', route: '/app/workbench', detail: 'Use the control layer to steer strategy, architecture, and execution.' },
          { title: 'Cloud Ops', route: '/app/cloud', detail: 'Review how pods, environments, and service lanes are set up to scale on cloud.' },
          { title: 'Model Ops', route: '/app/model-ops', detail: 'Review provider posture, routing contracts, and benchmark drills before expanding agent authority.' },
          { title: 'Director Dashboard', route: '/app/director', detail: 'See leadership signals, approvals, and cross-functional exceptions.' },
          { title: 'Product Ops', route: '/app/product-ops', detail: 'Review programs, release trains, and readiness pressure.' },
          { title: 'Build', route: '/app/factory', detail: 'Inspect the module factory, launch work, and staffed AI workforce.' },
        ],
        insights: [],
        focusModules: ['Control Workbench', 'Cloud Ops', 'Model Ops', 'Director Dashboard', 'Product Ops', 'Build'],
        nextModules: ['Runtime', 'Knowledge'],
      }
    }

    return {
      canonicalRole: 'member',
      title: 'Workspace',
      mission: 'Open the right tool, run the next task, and keep the queue moving.',
      defaultHome: '/app/meta',
      sections: [
        { title: 'Meta workspace', route: '/app/meta', detail: 'Internal cockpit for queues, runtime, and rollout.' },
        { title: 'My Queue', route: '/app/actions', detail: 'The next owned work items.' },
      ],
      insights: [],
      focusModules: ['Meta workspace', 'My Queue'],
      nextModules: [],
    }
  }

  const normalizedRole = normalizeWorkspaceRole(role)
  const canonicalRole = YTF_ROLE_ALIASES[normalizedRole] ?? 'plant_manager'
  const experience = YTF_ROLE_EXPERIENCES[canonicalRole] ?? getDefaultYtfExperience(canonicalRole)
  const dailyEntrySection = {
    title: 'Daily Entry',
    route: '/app/daily-entry',
    detail: 'Use one simple screen for shift handoff, quality, maintenance, receiving, and KPI capture.',
  }
  const adoptionSection = {
    title: 'Adoption Command',
    route: '/app/adoption-command',
    detail: 'Live role scoring, writeback health, manager rituals, and intervention paths for staff adoption.',
  }
  const invisibleIsoSection = {
    title: 'Invisible ISO',
    route: '/app/invisible-iso',
    detail: 'Teach managers to use short routines, voice capture, and AI-backed standard work without paperwork overload.',
  }
  const managerSopsSection = {
    title: 'Manager SOPs',
    route: '/app/manager-sops',
    detail: 'Run the exact operating routines, capture mode, and escalation rules managers should repeat inside the platform.',
  }
  const supportsInvisibleIso = new Set([
    'director',
    'tenant_admin',
    'platform_admin',
    'plant_manager',
    'quality_manager',
    'maintenance_lead',
    'finance_controller',
  ]).has(canonicalRole)
  const supportsAdoptionCommand = new Set([
    'director',
    'tenant_admin',
    'platform_admin',
    'plant_manager',
  ]).has(canonicalRole)
  const supportsDailyEntry = new Set([
    'director',
    'tenant_admin',
    'platform_admin',
    'manager',
    'plant_manager',
    'quality_manager',
    'maintenance_lead',
    'receiving_clerk',
    'procurement_lead',
    'finance_controller',
  ]).has(canonicalRole)

  const sections = [...experience.sections]
  if (supportsDailyEntry && !sections.some((section) => section.route === dailyEntrySection.route)) {
    sections.push(dailyEntrySection)
  }
  if (supportsAdoptionCommand && !sections.some((section) => section.route === adoptionSection.route)) {
    sections.push(adoptionSection)
  }
  if (supportsInvisibleIso && !sections.some((section) => section.route === invisibleIsoSection.route)) {
    sections.push(invisibleIsoSection)
  }
  if (supportsInvisibleIso && !sections.some((section) => section.route === managerSopsSection.route)) {
    sections.push(managerSopsSection)
  }

  return {
    ...experience,
    sections,
  }
}

export function resolveTenantLandingRoute(tenantKey: TenantOperatingModel['tenantKey'], role?: string | null) {
  if (tenantKey === 'ytf-plant-a') {
    const normalized = normalizeWorkspaceRole(role)
    if (normalized) {
      return '/app/erp'
    }
  }
  return resolveTenantRoleExperience(tenantKey, role).defaultHome
}
