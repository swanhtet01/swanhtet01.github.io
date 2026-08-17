import type { ProductionState } from './production-workspace.ts'

export type PlantEquipmentStrategyReferenceBrief = {
  totalAssets: number
  assetsWithStrategy: number
  strategyRate: number
  uniqueProcedureReferences: number
  topProcedureReferencesByCount: Array<{ reference: string; count: number }>
  uniqueSafetyBaselineReferences: number
  topSafetyBaselineReferencesByCount: Array<{ reference: string; count: number }>
}

export function projectPlantEquipmentStrategyReferenceBrief(
  production: ProductionState,
): PlantEquipmentStrategyReferenceBrief {
  let totalAssets = 0
  let assetsWithStrategy = 0
  const procedureMap = new Map<string, number>()
  const safetyMap = new Map<string, number>()

  for (const asset of production.equipmentMaster?.assets ?? []) {
    totalAssets++
    if (asset.maintenanceStrategy !== undefined) {
      assetsWithStrategy++
      const pr = asset.maintenanceStrategy.procedureReference
      procedureMap.set(pr, (procedureMap.get(pr) ?? 0) + 1)
      const sr = asset.maintenanceStrategy.safetyBaselineReference
      safetyMap.set(sr, (safetyMap.get(sr) ?? 0) + 1)
    }
  }

  const topProcedureReferencesByCount = Array.from(procedureMap.entries())
    .map(([reference, count]) => ({ reference, count }))
    .sort((a, b) => b.count - a.count || a.reference.localeCompare(b.reference))
    .slice(0, 5)

  const topSafetyBaselineReferencesByCount = Array.from(safetyMap.entries())
    .map(([reference, count]) => ({ reference, count }))
    .sort((a, b) => b.count - a.count || a.reference.localeCompare(b.reference))
    .slice(0, 5)

  return {
    totalAssets,
    assetsWithStrategy,
    strategyRate: totalAssets > 0 ? Math.round((assetsWithStrategy / totalAssets) * 100) : 0,
    uniqueProcedureReferences: procedureMap.size,
    topProcedureReferencesByCount,
    uniqueSafetyBaselineReferences: safetyMap.size,
    topSafetyBaselineReferencesByCount,
  }
}
