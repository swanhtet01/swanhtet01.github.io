import type { ProductionState } from './production-workspace.ts'

export type PlantIssueStatusBrief = {
  totalIssues: number
  openCount: number
  resolvedCount: number
  openRate: number
  resolvedRate: number
}

export function projectPlantIssueStatusBrief(
  production: ProductionState,
): PlantIssueStatusBrief {
  let totalIssues = 0
  let openCount = 0
  let resolvedCount = 0

  for (const issue of production.issues) {
    totalIssues++
    if (issue.status === 'open') openCount++
    else resolvedCount++
  }

  return {
    totalIssues,
    openCount,
    resolvedCount,
    openRate: totalIssues > 0 ? Math.round((openCount / totalIssues) * 100) : 0,
    resolvedRate: totalIssues > 0 ? Math.round((resolvedCount / totalIssues) * 100) : 0,
  }
}
