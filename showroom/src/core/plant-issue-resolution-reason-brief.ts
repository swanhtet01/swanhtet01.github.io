import type { ProductionState } from './production-workspace.ts'

export type PlantIssueResolutionReasonBrief = {
  totalResolutions: number
  uniqueReasons: number
  topReasonsByCount: Array<{ reason: string; count: number }>
}

export function projectPlantIssueResolutionReasonBrief(
  production: ProductionState,
): PlantIssueResolutionReasonBrief {
  let totalResolutions = 0
  const reasonMap = new Map<string, number>()

  for (const issue of production.issues) {
    const resolution = issue.resolution
    if (resolution === undefined) continue
    totalResolutions++
    reasonMap.set(resolution.reason, (reasonMap.get(resolution.reason) ?? 0) + 1)
  }

  const topReasonsByCount = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  return {
    totalResolutions,
    uniqueReasons: reasonMap.size,
    topReasonsByCount,
  }
}
