import type { ProductionState } from './production-workspace.ts'

export type PlantCapaContentBrief = {
  totalCapa: number
  uniqueFailureModes: number
  topFailureModesByCount: Array<{ failureMode: string; count: number }>
  uniqueRootCauses: number
  topRootCausesByCount: Array<{ rootCause: string; count: number }>
}

export function projectPlantCapaContentBrief(production: ProductionState): PlantCapaContentBrief {
  let totalCapa = 0
  const failureModeMap = new Map<string, number>()
  const rootCauseMap = new Map<string, number>()

  for (const issue of production.issues ?? []) {
    const capa = issue.resolution?.qualityCorrectiveAction
    if (capa === undefined) continue
    totalCapa++
    failureModeMap.set(capa.failureMode, (failureModeMap.get(capa.failureMode) ?? 0) + 1)
    rootCauseMap.set(capa.rootCause, (rootCauseMap.get(capa.rootCause) ?? 0) + 1)
  }

  const topFailureModesByCount = Array.from(failureModeMap.entries())
    .map(([failureMode, count]) => ({ failureMode, count }))
    .sort((a, b) => b.count - a.count || a.failureMode.localeCompare(b.failureMode))
    .slice(0, 5)

  const topRootCausesByCount = Array.from(rootCauseMap.entries())
    .map(([rootCause, count]) => ({ rootCause, count }))
    .sort((a, b) => b.count - a.count || a.rootCause.localeCompare(b.rootCause))
    .slice(0, 5)

  return {
    totalCapa,
    uniqueFailureModes: failureModeMap.size,
    topFailureModesByCount,
    uniqueRootCauses: rootCauseMap.size,
    topRootCausesByCount,
  }
}
