import type { ProductionState } from './production-workspace.ts'

export type PlantMaintenanceCorrectiveActionBrief = {
  totalCorrectiveActions: number
  recommendedCount: number
  restrictedCount: number
  notRecommendedCount: number
  recommendedRate: number
  restrictedRate: number
  notRecommendedRate: number
}

export function projectPlantMaintenanceCorrectiveActionBrief(
  production: ProductionState,
): PlantMaintenanceCorrectiveActionBrief {
  let totalCorrectiveActions = 0
  let recommendedCount = 0
  let restrictedCount = 0
  let notRecommendedCount = 0

  for (const issue of production.issues ?? []) {
    const mca = issue.resolution?.maintenanceCorrectiveAction
    if (mca === undefined) continue
    totalCorrectiveActions++
    if (mca.finalDisposition === 'recommended') recommendedCount++
    else if (mca.finalDisposition === 'restricted') restrictedCount++
    else notRecommendedCount++
  }

  return {
    totalCorrectiveActions,
    recommendedCount,
    restrictedCount,
    notRecommendedCount,
    recommendedRate: totalCorrectiveActions > 0 ? Math.round((recommendedCount / totalCorrectiveActions) * 100) : 0,
    restrictedRate: totalCorrectiveActions > 0 ? Math.round((restrictedCount / totalCorrectiveActions) * 100) : 0,
    notRecommendedRate: totalCorrectiveActions > 0 ? Math.round((notRecommendedCount / totalCorrectiveActions) * 100) : 0,
  }
}
