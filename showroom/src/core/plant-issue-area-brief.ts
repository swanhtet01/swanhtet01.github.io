import type { ProductionState } from './production-workspace.ts'

export type PlantIssueAreaBrief = {
  totalIssues: number
  uniqueAreas: number
  topAreasByCount: Array<{ area: string; count: number }>
}

export function projectPlantIssueAreaBrief(
  production: ProductionState,
): PlantIssueAreaBrief {
  let totalIssues = 0
  const areaMap = new Map<string, number>()

  for (const issue of production.issues) {
    totalIssues++
    areaMap.set(issue.area, (areaMap.get(issue.area) ?? 0) + 1)
  }

  const topAreasByCount = Array.from(areaMap.entries())
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area))
    .slice(0, 5)

  return {
    totalIssues,
    uniqueAreas: areaMap.size,
    topAreasByCount,
  }
}
