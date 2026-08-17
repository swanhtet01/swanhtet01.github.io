import type { ProductionState } from './production-workspace.ts'

export type PlantIssueKindBrief = {
  totalIssues: number
  qualityCount: number
  maintenanceCount: number
  materialsCount: number
  operationsCount: number
  qualityRate: number
  maintenanceRate: number
  materialsRate: number
  operationsRate: number
}

export function projectPlantIssueKindBrief(
  production: ProductionState,
): PlantIssueKindBrief {
  let totalIssues = 0
  let qualityCount = 0
  let maintenanceCount = 0
  let materialsCount = 0
  let operationsCount = 0

  for (const issue of production.issues) {
    totalIssues++
    if (issue.kind === 'quality') qualityCount++
    else if (issue.kind === 'maintenance') maintenanceCount++
    else if (issue.kind === 'materials') materialsCount++
    else operationsCount++
  }

  return {
    totalIssues,
    qualityCount,
    maintenanceCount,
    materialsCount,
    operationsCount,
    qualityRate: totalIssues > 0 ? Math.round((qualityCount / totalIssues) * 100) : 0,
    maintenanceRate: totalIssues > 0 ? Math.round((maintenanceCount / totalIssues) * 100) : 0,
    materialsRate: totalIssues > 0 ? Math.round((materialsCount / totalIssues) * 100) : 0,
    operationsRate: totalIssues > 0 ? Math.round((operationsCount / totalIssues) * 100) : 0,
  }
}
