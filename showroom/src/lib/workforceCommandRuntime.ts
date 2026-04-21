import { getAgentOperatingModel } from './agentOperatingModel'
import { YANGON_TYRE_ROLE_PLAYBOOKS } from './yangonTyreAdoptionModel'
import { resolveTenantRoleExperience } from './tenantRoleExperience'
import { YANGON_TYRE_MODEL } from './tenantOperatingModel'
import { YANGON_TYRE_SOURCE_PACKS, type YangonTyreSourcePack } from './yangonTyreDriveModel'

type AgentPlaybook = ReturnType<typeof getAgentOperatingModel>['playbooks'][number]
type EntrySurface = (typeof YANGON_TYRE_MODEL.dataEntrySurfaces)[number]

export type WorkforceCopilotPod = {
  id: string
  name: string
  mission: string
  cadence: string[]
  writePolicy: string
}

export type WorkforceEntrySurface = {
  id: string
  name: string
  route?: string
  captures: string[]
  qualityRules: string[]
}

export type WorkforceRoleCommandCell = {
  canonicalRole: string
  role: string
  home: string
  route: string
  frequency: string
  mission: string
  managerCadence: string
  mustCapture: string[]
  usefulOutputs: string[]
  focusModules: string[]
  nextModules: string[]
  aiPods: WorkforceCopilotPod[]
  entrySurfaces: WorkforceEntrySurface[]
  sourcePacks: YangonTyreSourcePack[]
}

export const YANGON_TYRE_WORKFORCE_DIALECTIC = {
  thesis: 'Every Yangon Tyre role should open one home, enter the minimum necessary evidence once, and get immediate operational value back.',
  antithesis:
    'If the portal behaves like an executive dashboard or second reporting burden, staff fall back to Viber, side spreadsheets, and manager memory.',
  synthesis:
    'Workforce Command binds role routines, entry contracts, source packs, manager cadences, and AI copilot pods into one daily operating system.',
} as const

const ROLE_BY_PLAYBOOK_ID: Record<string, string> = {
  receiving: 'receiving_clerk',
  plant: 'plant_manager',
  quality: 'quality_manager',
  maintenance: 'maintenance_lead',
  procurement: 'procurement_lead',
  sales: 'sales_lead',
  director: 'director',
  admin: 'tenant_admin',
}

const ROLE_USER_LABELS: Record<string, string[]> = {
  receiving_clerk: ['receiving clerk', 'receiving'],
  plant_manager: ['plant manager', 'operations'],
  quality_manager: ['quality manager', 'quality / qc', 'quality', 'qc'],
  maintenance_lead: ['maintenance lead', 'maintenance'],
  procurement_lead: ['procurement lead', 'procurement'],
  sales_lead: ['sales lead', 'sales'],
  director: ['ceo / director', 'director', 'ceo'],
  tenant_admin: ['tenant admin', 'admin'],
}

const ROLE_POD_IDS: Record<string, string[]> = {
  receiving_clerk: ['intake-router', 'operations-reliability'],
  plant_manager: ['operations-reliability', 'manufacturing-genealogy', 'director-brief'],
  quality_manager: ['quality-watch', 'manufacturing-genealogy'],
  maintenance_lead: ['operations-reliability', 'manufacturing-genealogy'],
  procurement_lead: ['supplier-recovery', 'intake-router'],
  sales_lead: ['commercial-memory', 'director-brief'],
  director: ['director-brief', 'data-science', 'tenant-app-foundry'],
  tenant_admin: ['tenant-app-foundry', 'data-science', 'experience-assurance', 'intake-router'],
}

const ROLE_SOURCE_PACK_IDS: Record<string, string[]> = {
  receiving_clerk: ['drive-plant-a', 'future-source-register'],
  plant_manager: ['drive-ops-manual', 'drive-plant-a', 'drive-tyre-analysis'],
  quality_manager: ['drive-ops-manual', 'drive-plant-a', 'drive-tyre-analysis'],
  maintenance_lead: ['drive-ops-manual', 'drive-plant-a'],
  procurement_lead: ['drive-plant-a', 'email-financials', 'future-source-register'],
  sales_lead: ['drive-tyre-analysis', 'drive-ceo-data'],
  director: ['drive-tyre-analysis', 'drive-ceo-data', 'email-financials'],
  tenant_admin: ['future-source-register', 'drive-ceo-data', 'drive-tyre-analysis'],
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function toCopilotPod(playbook: AgentPlaybook): WorkforceCopilotPod {
  return {
    id: playbook.id,
    name: playbook.name,
    mission: playbook.mission,
    cadence: playbook.cadence,
    writePolicy: playbook.writePolicy,
  }
}

function toEntrySurface(surface: EntrySurface): WorkforceEntrySurface {
  return {
    id: surface.id,
    name: surface.name,
    route: surface.route,
    captures: surface.captures,
    qualityRules: surface.qualityRules,
  }
}

function matchEntrySurfaces(canonicalRole: string) {
  const roleLabels = new Set((ROLE_USER_LABELS[canonicalRole] ?? []).map(normalize))
  return YANGON_TYRE_MODEL.dataEntrySurfaces.filter((surface) => surface.users.some((user) => roleLabels.has(normalize(user)))).map(toEntrySurface)
}

function matchPods(canonicalRole: string, playbookIndex: Map<string, AgentPlaybook>) {
  return (ROLE_POD_IDS[canonicalRole] ?? [])
    .map((id) => playbookIndex.get(id))
    .filter((playbook): playbook is AgentPlaybook => Boolean(playbook))
    .map(toCopilotPod)
}

function matchSourcePacks(canonicalRole: string, sourceIndex: Map<string, YangonTyreSourcePack>) {
  return (ROLE_SOURCE_PACK_IDS[canonicalRole] ?? [])
    .map((id) => sourceIndex.get(id))
    .filter((pack): pack is YangonTyreSourcePack => Boolean(pack))
}

export function buildYangonTyreWorkforceCommand() {
  const agentModel = getAgentOperatingModel('ytf-plant-a')
  const playbookIndex = new Map(agentModel.playbooks.map((playbook) => [playbook.id, playbook]))
  const sourceIndex = new Map(YANGON_TYRE_SOURCE_PACKS.map((pack) => [pack.id, pack]))

  return YANGON_TYRE_ROLE_PLAYBOOKS.map((playbook) => {
    const canonicalRole = ROLE_BY_PLAYBOOK_ID[playbook.id] ?? 'tenant_admin'
    const experience = resolveTenantRoleExperience('ytf-plant-a', canonicalRole)

    return {
      canonicalRole,
      role: playbook.role,
      home: playbook.home,
      route: playbook.route,
      frequency: playbook.frequency,
      mission: experience.mission,
      managerCadence: playbook.managerCadence,
      mustCapture: playbook.mustCapture,
      usefulOutputs: playbook.usefulOutputs,
      focusModules: experience.focusModules,
      nextModules: experience.nextModules,
      aiPods: matchPods(canonicalRole, playbookIndex),
      entrySurfaces: matchEntrySurfaces(canonicalRole),
      sourcePacks: matchSourcePacks(canonicalRole, sourceIndex),
    } satisfies WorkforceRoleCommandCell
  })
}

export function summarizeYangonTyreWorkforceCommand(cells: WorkforceRoleCommandCell[]) {
  const uniqueAiPods = new Set(cells.flatMap((cell) => cell.aiPods.map((pod) => pod.id)))
  const uniqueEntrySurfaces = new Set(cells.flatMap((cell) => cell.entrySurfaces.map((surface) => surface.id)))
  const uniqueSourcePacks = new Set(cells.flatMap((cell) => cell.sourcePacks.map((pack) => pack.id)))
  const liveSourcePacks = new Set(
    cells.flatMap((cell) => cell.sourcePacks.filter((pack) => pack.status === 'live').map((pack) => pack.id)),
  )
  const fullyCrewedRoles = cells.filter((cell) => cell.aiPods.length > 0 && cell.entrySurfaces.length > 0 && cell.sourcePacks.length > 0).length

  return {
    roleCount: cells.length,
    aiPodCount: uniqueAiPods.size,
    entrySurfaceCount: uniqueEntrySurfaces.size,
    sourcePackCount: uniqueSourcePacks.size,
    liveSourcePackCount: liveSourcePacks.size,
    fullyCrewedRoles,
    workforceCoveragePercent: Math.round((fullyCrewedRoles / Math.max(cells.length, 1)) * 100),
  }
}
