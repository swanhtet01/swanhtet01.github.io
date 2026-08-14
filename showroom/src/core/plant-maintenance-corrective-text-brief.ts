import type { ProductionState } from './production-workspace.ts'

export type PlantMaintenanceCorrectiveTextBrief = {
  totalCorrectiveActions: number
  uniqueCorrectiveActions: number
  topCorrectiveActionsByCount: Array<{ correctiveAction: string; count: number }>
  uniqueVerificationResults: number
  topVerificationResultsByCount: Array<{ verificationResult: string; count: number }>
}

export function projectPlantMaintenanceCorrectiveTextBrief(
  production: ProductionState,
): PlantMaintenanceCorrectiveTextBrief {
  let totalCorrectiveActions = 0
  const actionMap = new Map<string, number>()
  const resultMap = new Map<string, number>()

  for (const issue of production.issues ?? []) {
    const mca = issue.resolution?.maintenanceCorrectiveAction
    if (mca === undefined) continue
    totalCorrectiveActions++
    actionMap.set(mca.correctiveAction, (actionMap.get(mca.correctiveAction) ?? 0) + 1)
    resultMap.set(mca.verificationResult, (resultMap.get(mca.verificationResult) ?? 0) + 1)
  }

  const topCorrectiveActionsByCount = Array.from(actionMap.entries())
    .map(([correctiveAction, count]) => ({ correctiveAction, count }))
    .sort((a, b) => b.count - a.count || a.correctiveAction.localeCompare(b.correctiveAction))
    .slice(0, 5)

  const topVerificationResultsByCount = Array.from(resultMap.entries())
    .map(([verificationResult, count]) => ({ verificationResult, count }))
    .sort((a, b) => b.count - a.count || a.verificationResult.localeCompare(b.verificationResult))
    .slice(0, 5)

  return {
    totalCorrectiveActions,
    uniqueCorrectiveActions: actionMap.size,
    topCorrectiveActionsByCount,
    uniqueVerificationResults: resultMap.size,
    topVerificationResultsByCount,
  }
}
