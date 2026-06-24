import { type AgentTeamRow, type AgentOperatingManifestPayload, type WorkspaceModuleRow } from './workspaceApi'
import { YANGON_TYRE_PORTAL_APPS, type YangonTyrePortalApp } from './yangonTyrePortalModel'
import { type TenantAppCrewRequirement, type TenantAppFoundryBlueprint, type TenantAppModuleRequirement } from './aiFoundryModel'

type ManifestPlaybook = NonNullable<AgentOperatingManifestPayload['playbooks']>[number]

export type TenantAppFoundryModuleStatus = {
  requirement: TenantAppModuleRequirement
  liveModule: WorkspaceModuleRow | null
  state: 'enabled' | 'pilot' | 'disabled' | 'missing'
}

export type TenantAppFoundryCrewStatus = {
  requirement: TenantAppCrewRequirement
  liveTeam: AgentTeamRow | null
  playbook: ManifestPlaybook | null
  state: 'active' | 'standby' | 'designed' | 'missing'
}

export type TenantAppFoundryBoardRow = {
  blueprint: TenantAppFoundryBlueprint
  portalApp: YangonTyrePortalApp | null
  moduleStatuses: TenantAppFoundryModuleStatus[]
  crewStatuses: TenantAppFoundryCrewStatus[]
  readinessScore: number
  moduleCoverage: number
  crewCoverage: number
  posture: 'Release candidate' | 'Pilot hardening' | 'Crewed build' | 'Workflow mapped' | 'Blueprint only'
  roleHomes: string[]
  dataSources: string[]
  missingModules: string[]
  missingCrews: string[]
  nextBuildGap: string
}

export type TenantAppFoundrySummary = {
  releaseCandidateCount: number
  pilotHardeningCount: number
  crewedBuildCount: number
  workflowMappedCount: number
  blueprintOnlyCount: number
  averageReadiness: number
}

export type TenantAppFoundryGapRow = {
  gapType: 'module' | 'crew'
  label: string
  appNames: string[]
  count: number
}

function normalizeFoundryKey(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function resolveModuleState(row: WorkspaceModuleRow | null): TenantAppFoundryModuleStatus['state'] {
  if (!row) {
    return 'missing'
  }
  const normalized = normalizeFoundryKey(row.workspace_status)
  if (normalized === 'enabled') {
    return 'enabled'
  }
  if (normalized === 'pilot') {
    return 'pilot'
  }
  return 'disabled'
}

function matchModuleRequirement(requirement: TenantAppModuleRequirement, liveModules: WorkspaceModuleRow[]) {
  const aliases = Array.from(
    new Set([requirement.key, requirement.name, ...requirement.match].map((item) => normalizeFoundryKey(item)).filter(Boolean)),
  )

  return (
    liveModules.find((row) => {
      const candidates = [
        normalizeFoundryKey(row.name),
        normalizeFoundryKey(row.module_id),
        normalizeFoundryKey(row.route),
        normalizeFoundryKey(row.category),
      ]
      return aliases.some((alias) => candidates.includes(alias))
    }) ?? null
  )
}

function matchCrewRequirement(
  requirement: TenantAppCrewRequirement,
  liveTeams: AgentTeamRow[],
  playbooks: ManifestPlaybook[],
) {
  const aliases = Array.from(new Set([requirement.id, requirement.name].map((item) => normalizeFoundryKey(item)).filter(Boolean)))

  const liveTeam =
    liveTeams.find((team) => {
      const candidates = [
        normalizeFoundryKey(team.team_id),
        normalizeFoundryKey(team.name),
        normalizeFoundryKey(team.lead_agent),
      ]
      return aliases.some((alias) => candidates.includes(alias))
    }) ?? null

  const playbook =
    playbooks.find((item) => {
      const candidates = [normalizeFoundryKey(item.id), normalizeFoundryKey(item.name), normalizeFoundryKey(item.workspace)]
      return aliases.some((alias) => candidates.includes(alias))
    }) ?? null

  return { liveTeam, playbook }
}

function resolveCrewState(liveTeam: AgentTeamRow | null, playbook: ManifestPlaybook | null): TenantAppFoundryCrewStatus['state'] {
  if (liveTeam) {
    const status = normalizeFoundryKey(liveTeam.status)
    if (['active', 'running', 'enabled', 'live'].includes(status)) {
      return 'active'
    }
    return 'standby'
  }
  if (playbook) {
    return 'designed'
  }
  return 'missing'
}

function moduleStateWeight(state: TenantAppFoundryModuleStatus['state']) {
  if (state === 'enabled') {
    return 1
  }
  if (state === 'pilot') {
    return 0.7
  }
  if (state === 'disabled') {
    return 0.25
  }
  return 0
}

function crewStateWeight(state: TenantAppFoundryCrewStatus['state']) {
  if (state === 'active') {
    return 1
  }
  if (state === 'standby') {
    return 0.75
  }
  if (state === 'designed') {
    return 0.45
  }
  return 0
}

function inferNextBuildGap(
  blueprint: TenantAppFoundryBlueprint,
  moduleStatuses: TenantAppFoundryModuleStatus[],
  crewStatuses: TenantAppFoundryCrewStatus[],
) {
  const missingModule = moduleStatuses.find((item) => item.state === 'missing')
  if (missingModule) {
    return `Ship ${missingModule.requirement.name} into the tenant runtime.`
  }

  const missingCrew = crewStatuses.find((item) => item.state === 'missing')
  if (missingCrew) {
    return `Stand up ${missingCrew.requirement.name} with a named cadence and reviewer.`
  }

  const disabledModule = moduleStatuses.find((item) => item.state === 'disabled')
  if (disabledModule) {
    return `Promote ${disabledModule.requirement.name} out of parked status.`
  }

  const pilotModule = moduleStatuses.find((item) => item.state === 'pilot')
  if (pilotModule) {
    return `Harden ${pilotModule.requirement.name} for daily manager use.`
  }

  const designedCrew = crewStatuses.find((item) => item.state === 'designed')
  if (designedCrew) {
    return `Activate ${designedCrew.requirement.name} against live records.`
  }

  const standbyCrew = crewStatuses.find((item) => item.state === 'standby')
  if (standbyCrew) {
    return `Move ${standbyCrew.requirement.name} from bench status into active review loops.`
  }

  return `Close release gate: ${blueprint.releaseGate}`
}

function findPortalApp(blueprint: TenantAppFoundryBlueprint) {
  const blueprintRoute = normalizeFoundryKey(blueprint.route)
  const blueprintName = normalizeFoundryKey(blueprint.name)
  return (
    YANGON_TYRE_PORTAL_APPS.find((app) => {
      return normalizeFoundryKey(app.route) === blueprintRoute || normalizeFoundryKey(app.name) === blueprintName
    }) ?? null
  )
}

export function buildTenantAppFoundryBoard(
  blueprints: TenantAppFoundryBlueprint[],
  liveModules: WorkspaceModuleRow[],
  liveTeams: AgentTeamRow[],
  playbooks: ManifestPlaybook[],
) {
  return blueprints.map<TenantAppFoundryBoardRow>((blueprint) => {
    const portalApp = findPortalApp(blueprint)
    const moduleStatuses = blueprint.moduleRequirements.map<TenantAppFoundryModuleStatus>((requirement) => {
      const liveModule = matchModuleRequirement(requirement, liveModules)
      return {
        requirement,
        liveModule,
        state: resolveModuleState(liveModule),
      }
    })
    const crewStatuses = blueprint.crewRequirements.map<TenantAppFoundryCrewStatus>((requirement) => {
      const { liveTeam, playbook } = matchCrewRequirement(requirement, liveTeams, playbooks)
      return {
        requirement,
        liveTeam,
        playbook,
        state: resolveCrewState(liveTeam, playbook),
      }
    })

    const moduleCoverage =
      moduleStatuses.length > 0
        ? moduleStatuses.reduce((total, item) => total + moduleStateWeight(item.state), 0) / moduleStatuses.length
        : 0
    const crewCoverage =
      crewStatuses.length > 0 ? crewStatuses.reduce((total, item) => total + crewStateWeight(item.state), 0) / crewStatuses.length : 0
    const readinessScore = Math.round((moduleCoverage * 0.65 + crewCoverage * 0.35) * 100)

    let posture: TenantAppFoundryBoardRow['posture'] = 'Blueprint only'
    if (moduleStatuses.every((item) => item.state === 'enabled') && crewStatuses.every((item) => item.state === 'active')) {
      posture = 'Release candidate'
    } else if (moduleStatuses.every((item) => item.state !== 'missing') && crewStatuses.every((item) => item.state !== 'missing')) {
      posture = 'Pilot hardening'
    } else if (readinessScore >= 60 || (moduleCoverage >= 0.5 && crewCoverage >= 0.45)) {
      posture = 'Crewed build'
    } else if (
      moduleStatuses.some((item) => item.state !== 'missing') ||
      crewStatuses.some((item) => item.state !== 'missing')
    ) {
      posture = 'Workflow mapped'
    }

    return {
      blueprint,
      portalApp,
      moduleStatuses,
      crewStatuses,
      readinessScore,
      moduleCoverage,
      crewCoverage,
      posture,
      roleHomes: portalApp?.users ?? [],
      dataSources: portalApp?.dataSources ?? [],
      missingModules: moduleStatuses.filter((item) => item.state === 'missing').map((item) => item.requirement.name),
      missingCrews: crewStatuses.filter((item) => item.state === 'missing').map((item) => item.requirement.name),
      nextBuildGap: inferNextBuildGap(blueprint, moduleStatuses, crewStatuses),
    }
  })
}

export function summarizeTenantAppFoundryBoard(rows: TenantAppFoundryBoardRow[]): TenantAppFoundrySummary {
  return {
    releaseCandidateCount: rows.filter((row) => row.posture === 'Release candidate').length,
    pilotHardeningCount: rows.filter((row) => row.posture === 'Pilot hardening').length,
    crewedBuildCount: rows.filter((row) => row.posture === 'Crewed build').length,
    workflowMappedCount: rows.filter((row) => row.posture === 'Workflow mapped').length,
    blueprintOnlyCount: rows.filter((row) => row.posture === 'Blueprint only').length,
    averageReadiness: rows.length > 0 ? Math.round(rows.reduce((total, row) => total + row.readinessScore, 0) / rows.length) : 0,
  }
}

export function buildTenantAppFoundryGapQueue(rows: TenantAppFoundryBoardRow[]) {
  const gapMap = new Map<string, TenantAppFoundryGapRow>()

  for (const row of rows) {
    for (const item of row.moduleStatuses.filter((status) => status.state === 'missing')) {
      const key = `module:${normalizeFoundryKey(item.requirement.name)}`
      const existing = gapMap.get(key)
      if (existing) {
        existing.count += 1
        if (!existing.appNames.includes(row.blueprint.name)) {
          existing.appNames.push(row.blueprint.name)
        }
        continue
      }
      gapMap.set(key, {
        gapType: 'module',
        label: item.requirement.name,
        appNames: [row.blueprint.name],
        count: 1,
      })
    }

    for (const item of row.crewStatuses.filter((status) => status.state === 'missing')) {
      const key = `crew:${normalizeFoundryKey(item.requirement.name)}`
      const existing = gapMap.get(key)
      if (existing) {
        existing.count += 1
        if (!existing.appNames.includes(row.blueprint.name)) {
          existing.appNames.push(row.blueprint.name)
        }
        continue
      }
      gapMap.set(key, {
        gapType: 'crew',
        label: item.requirement.name,
        appNames: [row.blueprint.name],
        count: 1,
      })
    }
  }

  return Array.from(gapMap.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count
    }
    return left.label.localeCompare(right.label)
  })
}
