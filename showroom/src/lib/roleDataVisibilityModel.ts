import { normalizeWorkspaceRole, type WorkspaceCapability } from './workspaceApi'

export type RoleDataRuntime = {
  tenantKey?: string
  sourceRecordCount?: number
  sourceChangeCount?: number
  reviewTaskCount?: number
  latestMetricCount?: number
  officialKpiCount?: number
  knowledgeChunkCount?: number
  liveSourceCount?: number
  connectorGapCount?: number
  openTaskCount?: number
  /** Kept for API compatibility; user-facing copy treats this as manager confirmation. */
  pendingApprovalCount?: number
}

export type RoleDataMetric = {
  label: string
  value: string
  detail: string
  route: string
}

export type RoleDataView = {
  roleKey: string
  title: string
  subtitle: string
  defaultRoute: string
  visibleData: string[]
  hiddenData: string[]
  kpis: RoleDataMetric[]
  isoControls: string[]
  aiActions: string[]
  nextBestAction: {
    label: string
    route: string
    detail: string
  }
}

export type RoleIsoEvidenceItem = {
  id: string
  label: string
  value: string
  source: string
  standard: string
  aiAction: string
  route: string
  reviewGate: string
}

function compactNumber(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return new Intl.NumberFormat().format(value)
}

function pickRole(role?: string | null) {
  const normalized = normalizeWorkspaceRole(role)
  if (['platform_admin', 'tenant_admin', 'admin'].includes(normalized)) return 'admin'
  if (['director', 'ceo', 'owner'].includes(normalized)) return 'director'
  if (['plant_manager', 'operations_admin', 'operations', 'ops', 'mixing_operator', 'tyre_building'].includes(normalized)) return 'plant_manager'
  if (['quality', 'qc', 'quality_control', 'quality_manager', 'quality_lead'].includes(normalized)) return 'quality'
  if (['maintenance', 'maintenance_lead', 'engineering_maintenance', 'maintenance_operations', 'utility'].includes(normalized)) return 'maintenance'
  if (['sales', 'sales_lead', 'admin_sales', 'sales_manager'].includes(normalized)) return 'sales'
  if (['finance_controller', 'finance'].includes(normalized)) return 'finance'
  if (['receiving_clerk', 'procurement_lead', 'receiving', 'procurement'].includes(normalized)) return 'receiving'
  if (normalized === 'manager') return 'manager'
  return normalized || 'member'
}

function baseMetrics(runtime: RoleDataRuntime): RoleDataMetric[] {
  return [
    {
      label: 'Records',
      value: compactNumber(runtime.sourceRecordCount),
      detail: 'Organized business records, sheets, uploads, email/chat evidence, and entries.',
      route: '/app/live-data?view=data',
    },
    {
      label: 'Record updates',
      value: compactNumber(runtime.sourceChangeCount),
      detail: 'Changed records that may affect today, numbers, or team work.',
      route: '/app/live-data?view=actions',
    },
    {
      label: 'Numbers',
      value: compactNumber(runtime.latestMetricCount),
      detail: `${compactNumber(runtime.officialKpiCount)} saved dashboard definitions are available for entry.`,
      route: '/app/daily-entry',
    },
    {
      label: 'Searchable evidence',
      value: compactNumber(runtime.knowledgeChunkCount),
      detail: 'Clean business rows used for role-safe answers and evidence-backed summaries.',
      route: '/app/live-data?view=data',
    },
  ]
}

function withSharedControls(roleKey: string, view: Omit<RoleDataView, 'roleKey'>): RoleDataView {
  return { roleKey, ...view }
}

export function resolveRoleDataView(role: string | null | undefined, capabilities: WorkspaceCapability[] = [], runtime: RoleDataRuntime = {}): RoleDataView {
  const roleKey = pickRole(role)
  const metrics = baseMetrics(runtime)
  const hasAdminScope = capabilities.some((capability) => ['tenant_admin.view', 'platform_admin.view', 'connector_admin.view'].includes(capability))
  const hasDirectorScope = capabilities.includes('director.view') || hasAdminScope

  if (roleKey === 'admin') {
    return withSharedControls(roleKey, {
      title: 'Admin data control',
      subtitle: 'All users, data lanes, background updates, evidence, and operating controls are visible here.',
      defaultRoute: '/app/platform-admin',
      visibleData: ['All YTF records', 'Email/chat health', 'Role access', 'Job history', 'Change logs', 'Launch readiness'],
      hiddenData: ['Raw secrets', 'external messages not checked by owner', 'other-client data'],
      kpis: [
        ...metrics,
        {
          label: 'Data gaps',
          value: compactNumber(runtime.connectorGapCount),
          detail: `${compactNumber(runtime.liveSourceCount)} data lanes are connected now.`,
          route: '/app/platform-admin',
        },
        {
          label: 'Data follow-up',
          value: compactNumber(runtime.reviewTaskCount),
          detail: 'Changed records or extracted values that need an owner, evidence, or closeout.',
          route: '/app/action-board',
        },
      ],
      isoControls: ['ISO 27001 access scope', 'NIST CSF govern/protect/detect', 'NIST AI RMF measure/manage', 'ISO 9001 audit evidence'],
      aiActions: ['Check data freshness', 'Explain record risk', 'Draft cleanup tasks', 'Check write boundaries', 'Create rollout gap report'],
      nextBestAction: {
        label: 'Open control plane',
        route: '/app/platform-admin',
        detail: 'Review roles, data lanes, work areas, and write permissions before expanding autonomy.',
      },
    })
  }

  if (roleKey === 'director') {
    return withSharedControls(roleKey, {
      title: 'Executive operating view',
      subtitle: 'Only the top risks, number movement, transparency gaps, and cross-function decisions should reach this role.',
      defaultRoute: '/app/plant-manager',
      visibleData: ['Number stories', 'decision exposure', 'top blockers', 'supplier/customer risk', 'decision log', 'evidence-backed briefs'],
      hiddenData: ['raw message noise', 'operator-only drafts', 'low-impact record updates'],
      kpis: [
        metrics[0],
        metrics[2],
        {
          label: 'Manager follow-up',
          value: compactNumber(runtime.pendingApprovalCount),
          detail: 'Items waiting for leadership or process-owner follow-up.',
          route: '/app/action-board',
        },
        {
          label: 'Open actions',
          value: compactNumber(runtime.openTaskCount),
          detail: 'Owned work that may affect risk, delivery, quality, or revenue.',
          route: '/app/action-board',
        },
      ],
      isoControls: ['ISO 9001 management review', 'ISO 22301 continuity risk', 'NIST AI RMF human oversight'],
      aiActions: ['Explain number movement', 'Draft CEO brief', 'Find missing evidence', 'Compare today vs previous period', 'Prepare intervention options'],
      nextBestAction: {
        label: 'Open leadership review',
          route: '/app/plant-manager',
        detail: 'Review the few decisions that need leadership attention.',
      },
    })
  }

  if (roleKey === 'plant_manager' || roleKey === 'manager') {
    return withSharedControls(roleKey, {
      title: roleKey === 'plant_manager' ? 'Plant manager view' : 'Manager view',
      subtitle: 'Show the work to run today: entry, blockers, owners, numbers, and evidence.',
      defaultRoute: roleKey === 'plant_manager' ? '/app/plant-manager' : '/app/erp',
      visibleData: ['daily entries', 'open work', 'receiving/quality/maintenance blockers', 'record updates', 'operating values', 'missing evidence'],
      hiddenData: hasDirectorScope ? ['raw secrets'] : ['admin setup', 'billing', 'system deploys', 'unrelated departments'],
      kpis: [
        {
          label: 'Open actions',
          value: compactNumber(runtime.openTaskCount),
          detail: 'The work queue that needs owner, due date, and closeout.',
          route: '/app/action-board',
        },
        metrics[1],
        metrics[2],
        {
          label: 'Data follow-up',
          value: compactNumber(runtime.reviewTaskCount),
          detail: 'Changed records or extracted values waiting for owner confirmation.',
          route: '/app/action-board',
        },
      ],
      isoControls: ['Process owner', '5W1H follow-up', 'root-cause follow-up', 'daily management review'],
      aiActions: ['Summarize today', 'Cluster repeat blockers', 'Find missing evidence', 'Draft handover', 'Turn note into action'],
      nextBestAction: {
        label: roleKey === 'plant_manager' ? 'Open plant review' : 'Open manager workspace',
        route: roleKey === 'plant_manager' ? '/app/plant-manager' : '/app/erp',
        detail: 'Start from the owning workspace instead of browsing every module.',
      },
    })
  }

  if (roleKey === 'quality') {
    return withSharedControls(roleKey, {
      title: 'Quality view',
      subtitle: 'Defects, holds, inspection evidence, repeat-risk signals, and follow-up work.',
      defaultRoute: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
      visibleData: ['quality incidents', 'fix records', 'inspection evidence', 'complaints', 'repeat defects', 'release holds'],
      hiddenData: ['sales-only pipeline notes', 'unrelated maintenance drafts', 'admin credentials'],
      kpis: [metrics[2], metrics[1], { label: 'Quality follow-up', value: compactNumber(runtime.reviewTaskCount), detail: 'Quality evidence needing owner, result, or closeout.', route: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection' }],
      isoControls: ['Defect record', 'fishbone', '5 Why', 'traceability and release evidence'],
      aiActions: ['Draft fix record', 'Build fishbone branches', 'Find similar incidents', 'Check missing evidence', 'Prepare release decision'],
      nextBestAction: {
        label: 'Open quality entry',
        route: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
        detail: 'Record quality issue, evidence, owner, and next physical fix.',
      },
    })
  }

  if (roleKey === 'maintenance') {
    return withSharedControls(roleKey, {
      title: 'Maintenance view',
      subtitle: 'Downtime, repeat faults, PM follow-up, spares risk, and restart decisions.',
      defaultRoute: '/app/daily-entry?mode=normal_abnormal&section=Maintenance',
      visibleData: ['breakdown records', 'PM actions', 'spares notes', 'repeat-fault clusters', 'maintenance evidence'],
      hiddenData: ['customer-only sales notes', 'admin secrets', 'unrelated finance data'],
      kpis: [metrics[2], { label: 'Open actions', value: compactNumber(runtime.openTaskCount), detail: 'Maintenance and cross-team actions waiting for closeout.', route: '/app/action-board' }, metrics[1]],
      isoControls: ['ISO 55001 asset value', 'MTBF/MTTR', 'FMEA-lite', '5 Why closeout'],
      aiActions: ['Cluster repeat faults', 'Draft 5 Why', 'Flag missing PM evidence', 'Prepare restart risk note', 'Suggest spare follow-up'],
      nextBestAction: {
        label: 'Open maintenance',
        route: '/app/daily-entry?mode=normal_abnormal&section=Maintenance',
        detail: 'Start from reliability, not generic tasks.',
      },
    })
  }

  if (roleKey === 'sales') {
    return withSharedControls(roleKey, {
      title: 'Sales view',
      subtitle: 'Customer follow-up, quote risk, delivery promises, decisions, and next-best action.',
      defaultRoute: '/app/revenue',
      visibleData: ['leads', 'customers', 'follow-ups', 'quotes', 'delivery promises', 'sales tasks'],
      hiddenData: ['factory-only maintenance details', 'admin controls', 'restricted quality records'],
      kpis: [{ label: 'Open actions', value: compactNumber(runtime.openTaskCount), detail: 'Customer or internal follow-up still open.', route: '/app/revenue' }, metrics[0], metrics[2]],
      isoControls: ['ISO 9001 customer satisfaction', 'promise-to-delivery traceability', 'owner review before external message'],
      aiActions: ['Summarize customer history', 'Draft follow-up', 'Find missing evidence before promise', 'Create quote prep task', 'Flag stale account'],
      nextBestAction: {
        label: 'Open revenue desk',
        route: '/app/revenue',
        detail: 'Work customer follow-up from evidence and current tasks.',
      },
    })
  }

  return withSharedControls(roleKey, {
    title: 'My work view',
    subtitle: 'A small role-safe view of assigned work, evidence, and the next action.',
    defaultRoute: '/app/action-board',
    visibleData: ['assigned tasks', 'safe record links', 'daily entries', 'review requests'],
    hiddenData: ['admin setup', 'cross-role private notes', 'raw connector credentials'],
    kpis: [{ label: 'Open actions', value: compactNumber(runtime.openTaskCount), detail: 'Assigned work and follow-up.', route: '/app/action-board' }, metrics[2]],
    isoControls: ['ISO 9001 owner/action/evidence', 'role-based access', 'human review'],
    aiActions: ['Summarize my work', 'Draft update', 'Find missing evidence'],
    nextBestAction: {
      label: 'Open my queue',
      route: '/app/action-board',
      detail: 'Start with the work already assigned.',
    },
  })
}

export function resolveRoleIsoEvidenceLedger(role: string | null | undefined, runtime: RoleDataRuntime = {}): RoleIsoEvidenceItem[] {
  const roleKey = pickRole(role)
  const shared: RoleIsoEvidenceItem[] = [
    {
      id: 'daily-numbers',
      label: 'Daily number capture',
      value: `${compactNumber(runtime.latestMetricCount)}/${compactNumber(runtime.officialKpiCount)}`,
      source: 'Daily Entry and structured data extraction',
      standard: 'ISO 9001 performance evaluation and management review',
      aiAction: 'Explain movement and ask for missing value or evidence.',
      route: '/app/daily-entry',
      reviewGate: 'Manager confirms before a number is shown on dashboards.',
    },
    {
      id: 'source-change',
      label: 'Changed record check',
      value: compactNumber(runtime.sourceChangeCount),
      source: 'Business records, sheets, Gmail, uploads, and record register',
      standard: 'ISO 9001 documented information control',
      aiAction: 'Classify change, owner, risk, and next review route.',
      route: '/app/live-data?view=actions',
      reviewGate: 'Record owner reviews before system writeback.',
    },
    {
      id: 'action-evidence',
      label: 'Open action evidence',
      value: compactNumber(runtime.openTaskCount ?? runtime.reviewTaskCount),
      source: 'Action Board, daily handoffs, and promoted record changes',
      standard: 'ISO 9001 improvement, ownership, and closure evidence',
      aiAction: 'Draft owner update, missing evidence, and next action.',
      route: '/app/action-board',
      reviewGate: 'Owner closes with evidence, not chat-only closure.',
    },
    {
      id: 'knowledge-context',
      label: 'Knowledge context',
      value: compactNumber(runtime.knowledgeChunkCount),
      source: 'Indexed record chunks and role-safe knowledge graph',
      standard: 'ISO 9001 organizational knowledge plus NIST AI RMF context control',
      aiAction: 'Answer with record scope and uncertainty instead of generic advice.',
      route: '/app/live-data?view=data',
      reviewGate: 'AI output stays advisory unless a manager confirms the action.',
    },
  ]

  if (roleKey === 'admin') {
    return [
      {
        id: 'connector-scope',
        label: 'Connector scope',
        value: `${compactNumber(runtime.liveSourceCount)}/${compactNumber((runtime.liveSourceCount ?? 0) + (runtime.connectorGapCount ?? 0))}`,
        source: 'Tenant connectors, auth, record register, and scheduled jobs',
        standard: 'ISO 27001 access control and NIST CSF govern/protect/detect',
        aiAction: 'Find connector drift, stale credentials, and policy gaps.',
        route: '/app/platform-admin',
        reviewGate: 'Admin confirms connector and writeback permissions.',
      },
      ...shared,
    ]
  }

  if (roleKey === 'director') {
    return [
      shared[0],
      {
        id: 'leadership-decisions',
        label: 'Leadership follow-up',
        value: compactNumber(runtime.pendingApprovalCount),
        source: 'Decisions, escalations, number drift, and cross-team blockers',
        standard: 'ISO 9001 leadership, management review, and risk-based thinking',
        aiAction: 'Prepare intervention options with evidence-backed tradeoffs.',
        route: '/app/plant-manager',
        reviewGate: 'Director decides; the system only prepares the brief.',
      },
      shared[2],
      shared[3],
    ]
  }

  if (roleKey === 'quality') {
    return [
      {
        id: 'quality-follow-up',
        label: 'Quality evidence',
        value: compactNumber(runtime.reviewTaskCount),
        source: 'Defects, holds, complaints, release checks, and audit notes',
        standard: 'ISO 9001 nonconformity, corrective action, and release control',
        aiAction: 'Draft containment, 5 Why, fishbone branches, and verification asks.',
        route: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
        reviewGate: 'Quality owner confirms containment and closeout evidence.',
      },
      shared[0],
      shared[1],
      shared[3],
    ]
  }

  if (roleKey === 'maintenance') {
    return [
      {
        id: 'maintenance-reliability',
        label: 'Reliability evidence',
        value: compactNumber(runtime.openTaskCount),
        source: 'Downtime notes, repeat faults, PM actions, and spares follow-up',
        standard: 'ISO 9001 infrastructure control and ISO 55001 asset management logic',
        aiAction: 'Cluster repeat failures and draft restart risk notes.',
        route: '/app/maintenance',
        reviewGate: 'Maintenance owner validates asset, cause, and restart risk.',
      },
      shared[2],
      shared[1],
      shared[3],
    ]
  }

  if (roleKey === 'sales') {
    return [
      {
        id: 'customer-promise',
        label: 'Customer promise evidence',
        value: compactNumber(runtime.openTaskCount),
        source: 'Customer follow-ups, quotes, delivery promises, and decisions',
        standard: 'ISO 9001 customer communication and promise-to-delivery traceability',
        aiAction: 'Draft follow-up with evidence checks before external promise.',
        route: '/app/revenue',
        reviewGate: 'Sales owner reviews before customer-facing send.',
      },
      shared[2],
      shared[3],
      shared[0],
    ]
  }

  return shared
}
