export type YtfWorkspaceId = 'admin' | 'plant' | 'manager'

export type YtfWorkspaceBlueprint = {
  id: YtfWorkspaceId
  label: string
  badge: string
  title: string
  summary: string
  route: string
  primaryActionLabel: string
  secondaryRoute: string
  secondaryActionLabel: string
  outcome: string
  audience: string
  inputs: string[]
  readsFrom: string[]
  outputs: string[]
}

export const YTF_WORKSPACE_BLUEPRINTS: Record<YtfWorkspaceId, YtfWorkspaceBlueprint> = {
  admin: {
    id: 'admin',
    label: 'Admin workspace',
    badge: 'Tenant control',
    title: 'Control the tenant, not the day-to-day queue.',
    summary:
      'Admin owns roles, rollout, connectors, data-source posture, AI runtime, and module promotion so the operating system stays stable as Factory Client usage expands.',
    route: '/app/platform-admin',
    primaryActionLabel: 'Open admin workspace',
    secondaryRoute: '/app/runtime',
    secondaryActionLabel: 'Open runtime control',
    outcome: 'Trusted access, clean rollout, live connectors, and a stable AI-native control plane.',
    audience: 'Tenant admin, platform admin, and the person setting policy for the live system.',
    inputs: ['Role and access requests', 'Connector health changes', 'Module rollout state', 'Runtime and policy exceptions'],
    readsFrom: ['Runtime control', 'Connector control', 'Data Fabric health', 'Audit trail and rollout records'],
    outputs: ['Role changes', 'Connector activation', 'Module status decisions', 'Automation and policy changes'],
  },
  plant: {
    id: 'plant',
    label: 'Plant Manager workspace',
    badge: 'Factory control',
  title: 'Run cross-team plant control from one plant screen.',
    summary:
      'Plant Manager owns cross-shift review, containment, repeat failure control, and the daily factory decision loop after managers have entered the facts.',
    route: '/app/plant-manager',
    primaryActionLabel: 'Open plant manager',
    secondaryRoute: '/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection',
    secondaryActionLabel: 'Open quality entry',
    outcome: 'Containment, owner-based closure, and plant-wide decisions tied to evidence instead of side chat.',
    audience: 'Plant manager and senior factory leads running operations, quality, maintenance, and receiving together.',
    inputs: ['Manager entries', 'Quality incidents', 'Maintenance stops', 'Receiving holds and root warehouse signals'],
    readsFrom: ['Daily Entry and Action Board', 'Live Data and root warehouse', 'Operations, quality, and maintenance desks'],
    outputs: ['Cross-team actions', 'Containment and root-cause follow-up', 'Shift review decisions', 'Plant-level escalation and closure'],
  },
  manager: {
    id: 'manager',
    label: 'Manager workspace',
    badge: 'Daily entry',
    title: 'Capture the fact once, then route the next move.',
    summary:
      'Manager Workspace is the main front door for daily entry, documents, training follow-up, audit notes, and action routing. It should stay simple enough for daily phone use.',
    route: '/app/manager-system',
    primaryActionLabel: 'Open manager workspace',
    secondaryRoute: '/app/daily-entry',
    secondaryActionLabel: 'Open daily entry',
    outcome: 'Truthful entry, linked evidence, one owner, one due window, and the right escalation path.',
    audience: 'Department managers and shared-desk users entering plant, quality, maintenance, document, and audit updates.',
    inputs: ['Short manager updates', 'Photos and files', 'Document changes', 'Audit, training, KPI, quality, and maintenance notes'],
    readsFrom: ['Writeback lanes', 'Controlled documents', 'Current source coverage', 'Manager-facing review rules'],
    outputs: ['Daily records', 'Controlled files', 'Action Board items', 'Escalation to Plant Manager only when needed'],
  },
}

export const YTF_PLATFORM_LAYERS = [
  {
    id: 'capture',
    label: 'Capture',
    title: 'Managers enter facts once.',
    detail: 'Daily Entry, Documents, and Action Board collect short updates, evidence, and records from phones or shared PCs.',
  },
  {
    id: 'control',
    label: 'Control',
    title: 'Plant Manager runs closure and review.',
    detail: 'Cross-team issues move into plant control, quality review, and plant-wide decisions.',
  },
  {
    id: 'governance',
    label: 'Governance',
    title: 'Admin keeps data, access, and AI runtime stable.',
    detail: 'Admin controls roles, rollout, connectors, module state, and trust across the tenant control plane.',
  },
] as const

export function resolveYtfWorkspaceId(role?: string | null): YtfWorkspaceId {
  const normalized = String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

  if (new Set(['tenant_admin', 'platform_admin', 'admin', 'owner']).has(normalized)) {
    return 'admin'
  }

  if (new Set(['plant_manager', 'quality_manager', 'maintenance_lead', 'director']).has(normalized)) {
    return 'plant'
  }

  return 'manager'
}
