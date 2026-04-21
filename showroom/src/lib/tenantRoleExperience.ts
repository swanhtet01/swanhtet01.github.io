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
  admin: 'tenant_admin',
  tenant_admin: 'tenant_admin',
  platform_admin: 'platform_admin',
  plant_manager: 'plant_manager',
  operations: 'plant_manager',
  ops: 'plant_manager',
  receiving_clerk: 'receiving_clerk',
  procurement_lead: 'procurement_lead',
  finance_controller: 'finance_controller',
  quality: 'quality_manager',
  qc: 'quality_manager',
  quality_manager: 'quality_manager',
  maintenance: 'maintenance_lead',
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
    title: 'Platform control',
    mission: 'Steer tenant posture, architecture, and execution tracks from one control layer.',
    defaultHome: '/app/workbench',
    sections: [
      { title: 'Control Workbench', route: '/app/workbench', detail: 'Run delegated pods, infrastructure phases, and execution tracks for the tenant.' },
      { title: 'Platform Admin', route: '/app/platform-admin', detail: 'Control tenant modules, roles, rollout, and control-plane posture.' },
      { title: 'Model Ops', route: '/app/model-ops', detail: 'Keep provider readiness, routing contracts, and benchmark drills explicit.' },
      { title: 'Runtime Control', route: '/app/runtime', detail: 'Connector freshness, autonomy posture, and trust signals.' },
      { title: 'Connector Control', route: '/app/connectors', detail: 'Drive, Gmail, ERP, chat, and shopfloor source coverage.' },
      { title: 'Product Ops', route: '/app/product-ops', detail: 'Turn portfolio pressure into release gates, execution tracks, and rollout moves.' },
      { title: 'Agent Ops', route: '/app/teams', detail: 'Run AI teams, approvals, and bounded automations.' },
    ],
    insights: [
      {
        label: 'Control surface',
        value: 'Workbench first',
        detail: 'Use the control layer to turn platform direction into concrete execution tracks before changing runtime or rollout posture.',
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
    focusModules: ['Control Workbench', 'Platform Admin', 'Model Ops', 'Runtime Control', 'Connector Control', 'Product Ops'],
    nextModules: ['Operating Intelligence Studio', 'AI App Foundry'],
  },
  director: {
    canonicalRole: 'director',
    title: 'CEO command',
    mission: 'Run the company from one review loop for plant risk, supplier exposure, commercial movement, and the next intervention.',
    defaultHome: '/app/director',
    sections: [
      { title: 'CEO Command Center', route: '/app/director', detail: 'Daily and weekly leadership review with risk, approvals, and follow-through.' },
      { title: 'Plant Manager', route: '/app/plant-manager', detail: 'See the plant-manager review loop, teaching packs, and the desks that factory leaders should actually use.' },
      { title: 'Control Workbench', route: '/app/workbench', detail: 'Resolve strategy, execution tracks, and infrastructure priorities from one control layer.' },
      { title: 'Model Ops', route: '/app/model-ops', detail: 'Review provider posture and routing contracts before expanding agent authority.' },
      { title: 'Workforce Command', route: '/app/workforce', detail: 'Role routines, manager review loops, and AI copilot coverage across the tenant.' },
      { title: 'Data Fabric', route: '/app/data-fabric', detail: 'Whole-folder ingestion, KPI marts, and section-specific stories for leadership review.' },
      { title: 'Operating Intelligence Studio', route: '/app/insights', detail: 'Gap analysis, KPI drift, and model-backed scenario review.' },
      { title: 'Sales and Dealer Control', route: '/app/revenue', detail: 'Dealer pipeline, quote posture, and commercial exposure.' },
      { title: 'Approvals and Supplier Recovery', route: '/app/approvals', detail: 'High-impact approvals, supplier delays, and financial control.' },
      { title: 'AI App Foundry', route: '/app/factory', detail: 'Design the platform, benchmark each app, and review the AI workforce that builds it.' },
      { title: 'Foundry Release Desk', route: '/app/foundry', detail: 'Run the hackathon board that promotes proofs into reusable modules.' },
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
    focusModules: ['CEO Command Center', 'Plant Manager', 'Control Workbench', 'Model Ops', 'Data Fabric', 'Workforce Command', 'Sales CRM', 'AI App Foundry'],
    nextModules: ['Lab SPC and Release', 'Operating Intelligence Studio', 'Product Ops'],
  },
  tenant_admin: {
    canonicalRole: 'tenant_admin',
    title: 'Tenant admin',
    mission: 'Control identity, connector scopes, rollout, runtime trust, and the AI workforce on the Yangon Tyre tenant.',
    defaultHome: '/app/platform-admin',
    sections: [
      { title: 'Platform Admin', route: '/app/platform-admin', detail: 'Tenant modules, roles, rollout, and control-plane posture.' },
      { title: 'Plant Manager', route: '/app/plant-manager', detail: 'Keep the factory manager layer simple, trainable, and connected to live desks.' },
      { title: 'Control Workbench', route: '/app/workbench', detail: 'Turn platform strategy, pod charters, and execution tracks into live operating work.' },
      { title: 'Model Ops', route: '/app/model-ops', detail: 'Bind provider posture, routing contracts, and benchmark drills to the tenant runtime.' },
      { title: 'Workforce Command', route: '/app/workforce', detail: 'Role routines, adoption gaps, AI coworker coverage, and manager discipline.' },
      { title: 'Data Fabric', route: '/app/data-fabric', detail: 'Source coverage, topic pipelines, feature marts, and writeback quality in one place.' },
      { title: 'Runtime Control', route: '/app/runtime', detail: 'Connector freshness, autonomy posture, and trust signals.' },
      { title: 'R&D Command', route: '/app/lab', detail: 'Review experiment loops, named research cells, and frontier module queue.' },
      { title: 'Connector Control', route: '/app/connectors', detail: 'Drive, Gmail, ERP, chat, and shopfloor source coverage.' },
      { title: 'Agent Ops', route: '/app/teams', detail: 'Run AI teams, approvals, and bounded automations.' },
      { title: 'AI App Foundry', route: '/app/factory', detail: 'Design each app, benchmark successful SaaS, and promote modules through release gates.' },
      { title: 'Foundry Release Desk', route: '/app/foundry', detail: 'Run the release desk for promotion gates, tenant rollout, and module graduation.' },
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
    focusModules: ['Platform Admin', 'Plant Manager', 'Control Workbench', 'Model Ops', 'Data Fabric', 'Workforce Command', 'AI App Foundry', 'CEO Command Center'],
    nextModules: ['Operating Intelligence Studio', 'Lab SPC and Release', 'Product Ops'],
  },
  plant_manager: {
    canonicalRole: 'plant_manager',
    title: 'Plant control',
    mission: 'Run shift flow, receiving, manufacturing control, quality escalation, and maintenance follow-up from one operator home.',
    defaultHome: '/app/plant-manager',
    sections: [
      { title: 'Plant Manager', route: '/app/plant-manager', detail: 'Start here for the daily review loop, teaching packs, and the next desk to open.' },
      { title: 'Operations Control', route: '/app/operations', detail: 'Daily blockers, shift actions, and cross-team handoff.' },
      { title: 'Workforce Command', route: '/app/workforce', detail: 'Role routines, shift-review governance, and copilot coverage for the plant.' },
      { title: 'Data Fabric', route: '/app/data-fabric', detail: 'Plant flow marts, industrial-engineering cuts, and feature freshness for operations.' },
      { title: 'Receiving Control', route: '/app/receiving', detail: 'Inbound holds, GRN mismatches, and next physical action.' },
      { title: 'DQMS and Quality Methods', route: '/app/dqms', detail: 'Incidents, CAPA, containment, and root-cause review.' },
      { title: 'Maintenance Control', route: '/app/maintenance', detail: 'Breakdowns, PM work, and repeat-failure follow-up.' },
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
    focusModules: ['Plant Manager', 'Operations Control', 'Data Fabric', 'Workforce Command', 'Receiving Control', 'Manufacturing Command', 'Maintenance Control'],
    nextModules: ['Lab SPC and Release', 'Operating Intelligence Studio'],
  },
  receiving_clerk: {
    canonicalRole: 'receiving_clerk',
    title: 'Receiving control',
    mission: 'Capture inbound issues at the source, link evidence, and keep the next action visible for procurement and plant teams.',
    defaultHome: '/app/receiving',
    sections: [
      { title: 'Receiving Control', route: '/app/receiving', detail: 'GRN, COA, shortage, hold, and next-action records.' },
      { title: 'Workforce Command', route: '/app/workforce', detail: 'Receiving routines, manager checks, and source-pack coverage for inbound issues.' },
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
    focusModules: ['Receiving Control', 'Workforce Command', 'Document Intelligence', 'Supplier Control'],
    nextModules: ['Manufacturing Command'],
  },
  procurement_lead: {
    canonicalRole: 'procurement_lead',
    title: 'Supplier recovery',
    mission: 'Own supplier follow-up, missing evidence, discrepancy recovery, and approval debt before it hits plant flow.',
    defaultHome: '/app/approvals',
    sections: [
      { title: 'Supplier Control', route: '/app/approvals', detail: 'Discrepancies, approvals, and supplier recovery loops.' },
      { title: 'Workforce Command', route: '/app/workforce', detail: 'Procurement routines, recovery queues, and AI support mapped to daily work.' },
      { title: 'Data Fabric', route: '/app/data-fabric', detail: 'Supplier recovery marts, evidence completeness, and mailbox-to-GRN linkage.' },
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
    focusModules: ['Supplier Control', 'Data Fabric', 'Workforce Command', 'Receiving Control', 'Document Intelligence'],
    nextModules: ['Operating Intelligence Studio'],
  },
  finance_controller: {
    canonicalRole: 'finance_controller',
    title: 'Finance control',
    mission: 'Review supplier exposure, approval thresholds, and commercial risk without losing the operating evidence underneath.',
    defaultHome: '/app/approvals',
    sections: [
      { title: 'Approvals', route: '/app/approvals', detail: 'Pending financial, supplier, and release decisions.' },
      { title: 'Workforce Command', route: '/app/workforce', detail: 'Finance review posture, approval evidence, and cross-functional manager loops.' },
      { title: 'Data Fabric', route: '/app/data-fabric', detail: 'Supplier, GRN, and finance evidence promoted into one reviewable data fabric.' },
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
    focusModules: ['Supplier Control', 'Data Fabric', 'Workforce Command', 'Sales CRM', 'CEO Command Center'],
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
      { title: 'Workforce Command', route: '/app/workforce', detail: 'Quality routines, evidence discipline, and copilot pairing for closeout work.' },
      { title: 'Data Fabric', route: '/app/data-fabric', detail: 'Quality-loss marts, release evidence, and recurring-defect analysis for technical review.' },
      { title: 'Knowledge Graph and SOP Vault', route: '/app/knowledge', detail: 'Standards, work instructions, root-cause learning, and evidence.' },
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
    focusModules: ['Plant Manager', 'DQMS and Quality Methods', 'Data Fabric', 'Workforce Command', 'Knowledge Graph and SOP Vault', 'Manufacturing Command'],
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
      { title: 'Workforce Command', route: '/app/workforce', detail: 'Reliability routines, downtime governance, and copilot support for repeat failures.' },
      { title: 'Data Fabric', route: '/app/data-fabric', detail: 'Downtime features, asset-linked engineering cuts, and reliability storytelling.' },
      { title: 'Operations Control', route: '/app/operations', detail: 'Plant issues and cross-team escalation from one queue.' },
      { title: 'DQMS and Quality Methods', route: '/app/dqms', detail: 'Link machine issues to quality incidents and containment.' },
      { title: 'Knowledge Vault', route: '/app/knowledge', detail: 'Preserve 5W1H, Ishikawa, and repeat-failure learning.' },
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
    focusModules: ['Plant Manager', 'Maintenance Control', 'Data Fabric', 'Workforce Command', 'Manufacturing Command', 'DQMS and Quality Methods'],
    nextModules: ['Lab SPC and Release'],
  },
  sales_lead: {
    canonicalRole: 'sales_lead',
    title: 'Commercial control',
    mission: 'Run dealer relationships, follow-up, visit plans, and commercial risk from one sales home.',
    defaultHome: '/app/revenue',
    sections: [
      { title: 'Revenue Desk', route: '/app/revenue', detail: 'Dealer accounts, quotes, next actions, and account history.' },
      { title: 'Workforce Command', route: '/app/workforce', detail: 'Commercial routines, follow-up discipline, and AI coverage for dealer work.' },
      { title: 'Data Fabric', route: '/app/data-fabric', detail: 'Dealer demand marts, campaign signals, and role-specific sales storytelling.' },
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
    focusModules: ['Sales CRM', 'Data Fabric', 'Workforce Command', 'CEO Command Center'],
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
        defaultHome: '/app/workbench',
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
        defaultHome: '/app/workbench',
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
        defaultHome: '/app/workbench',
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
  const adoptionSection = {
    title: 'Adoption Command',
    route: '/app/adoption-command',
    detail: 'Live role scoring, writeback health, manager rituals, and intervention paths for staff adoption.',
  }

  return experience.sections.some((section) => section.route === adoptionSection.route)
    ? experience
    : {
        ...experience,
        sections: [...experience.sections, adoptionSection],
      }
}

export function resolveTenantLandingRoute(tenantKey: TenantOperatingModel['tenantKey'], role?: string | null) {
  return resolveTenantRoleExperience(tenantKey, role).defaultHome
}
