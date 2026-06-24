import { MODULE_PROGRAMS, type ModuleProgram } from './companyBuildingModel'
import { type WorkspaceModuleRow } from './workspaceApi'

export type FactoryProgramModuleStatus = {
  requestedName: string
  requestedKey: string
  liveModule: WorkspaceModuleRow | null
  state: 'enabled' | 'pilot' | 'disabled' | 'missing'
}

export type FactoryProgramBoardRow = {
  program: ModuleProgram
  moduleStatuses: FactoryProgramModuleStatus[]
  readinessScore: number
  posture: 'Live sellable' | 'Pilot expansion' | 'In build' | 'Partially staffed' | 'Mapped only'
  matchedCount: number
  enabledCount: number
  pilotCount: number
  disabledCount: number
  gapCount: number
}

export type FactoryGapRow = {
  requestedName: string
  programNames: string[]
  count: number
}

const PROGRAM_MODULE_ALIASES: Record<string, string[]> = {
  'sales system': ['sales system', 'sales-system'],
  'founder brief': ['founder brief', 'founder-brief'],
  'operations inbox': ['operations inbox', 'operations-inbox'],
  'approval policy engine': ['approval flow', 'approval-flow'],
  'document intelligence': ['document intake', 'document-intake'],
  'client portal': ['client portal', 'client-portal'],
  'platform admin': ['platform admin', 'platform-admin'],
  'runtime desk': ['runtime desk', 'runtime-desk'],
}

function normalizeFactoryKey(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function matchProgramModule(requestedName: string, liveModules: WorkspaceModuleRow[]) {
  const requestedKey = normalizeFactoryKey(requestedName)
  const requestedAliases = Array.from(
    new Set([requestedKey, ...(PROGRAM_MODULE_ALIASES[requestedKey] ?? []).map((item) => normalizeFactoryKey(item))]),
  )

  return (
    liveModules.find((row) => {
      const candidates = [
        normalizeFactoryKey(row.name),
        normalizeFactoryKey(row.module_id),
        normalizeFactoryKey(row.route),
      ]
      return requestedAliases.some((alias) => candidates.includes(alias))
    }) ?? null
  )
}

function resolveModuleState(row: WorkspaceModuleRow | null): FactoryProgramModuleStatus['state'] {
  if (!row) {
    return 'missing'
  }
  const workspaceStatus = String(row.workspace_status || '').trim().toLowerCase()
  if (workspaceStatus === 'enabled') {
    return 'enabled'
  }
  if (workspaceStatus === 'pilot') {
    return 'pilot'
  }
  return 'disabled'
}

export function buildFactoryProgramBoard(liveModules: WorkspaceModuleRow[]) {
  return MODULE_PROGRAMS.map<FactoryProgramBoardRow>((program) => {
    const moduleStatuses = program.modules.map<FactoryProgramModuleStatus>((requestedName) => {
      const liveModule = matchProgramModule(requestedName, liveModules)
      return {
        requestedName,
        requestedKey: normalizeFactoryKey(requestedName),
        liveModule,
        state: resolveModuleState(liveModule),
      }
    })

    const matchedCount = moduleStatuses.filter((item) => item.liveModule).length
    const enabledCount = moduleStatuses.filter((item) => item.state === 'enabled').length
    const pilotCount = moduleStatuses.filter((item) => item.state === 'pilot').length
    const disabledCount = moduleStatuses.filter((item) => item.state === 'disabled').length
    const gapCount = moduleStatuses.filter((item) => item.state === 'missing').length
    const totalCount = Math.max(moduleStatuses.length, 1)
    const weightedProgress = enabledCount * 1 + pilotCount * 0.65 + disabledCount * 0.25
    const readinessScore = Math.round((weightedProgress / totalCount) * 100)

    let posture: FactoryProgramBoardRow['posture'] = 'Mapped only'
    if (enabledCount === totalCount) {
      posture = 'Live sellable'
    } else if (enabledCount + pilotCount === totalCount && pilotCount > 0) {
      posture = 'Pilot expansion'
    } else if (enabledCount + pilotCount >= Math.ceil(totalCount / 2)) {
      posture = 'In build'
    } else if (matchedCount > 0) {
      posture = 'Partially staffed'
    }

    return {
      program,
      moduleStatuses,
      readinessScore,
      posture,
      matchedCount,
      enabledCount,
      pilotCount,
      disabledCount,
      gapCount,
    }
  })
}

export function summarizeFactoryProgramBoard(programRows: FactoryProgramBoardRow[]) {
  return {
    liveSellableCount: programRows.filter((row) => row.posture === 'Live sellable').length,
    pilotExpansionCount: programRows.filter((row) => row.posture === 'Pilot expansion').length,
    inBuildCount: programRows.filter((row) => row.posture === 'In build').length,
    partiallyStaffedCount: programRows.filter((row) => row.posture === 'Partially staffed').length,
    mappedOnlyCount: programRows.filter((row) => row.posture === 'Mapped only').length,
    averageReadiness:
      programRows.length > 0
        ? Math.round(programRows.reduce((total, row) => total + row.readinessScore, 0) / programRows.length)
        : 0,
  }
}

export function buildFactoryGapQueue(programRows: FactoryProgramBoardRow[]) {
  const gapMap = new Map<string, FactoryGapRow>()

  for (const row of programRows) {
    for (const moduleStatus of row.moduleStatuses) {
      if (moduleStatus.state !== 'missing') {
        continue
      }
      const existing = gapMap.get(moduleStatus.requestedKey)
      if (existing) {
        existing.count += 1
        if (!existing.programNames.includes(row.program.name)) {
          existing.programNames.push(row.program.name)
        }
        continue
      }
      gapMap.set(moduleStatus.requestedKey, {
        requestedName: moduleStatus.requestedName,
        programNames: [row.program.name],
        count: 1,
      })
    }
  }

  return Array.from(gapMap.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count
    }
    return left.requestedName.localeCompare(right.requestedName)
  })
}
