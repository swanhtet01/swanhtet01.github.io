import type { ProductionState } from './production-workspace.ts'

export type PlantEquipmentAssetStatusBrief = {
  totalAssets: number
  commissionedCount: number
  notCommissionedCount: number
  commissionedRate: number
  uniqueWorkCentres: number
  topWorkCentresByCount: Array<{ workCentreId: string; count: number }>
}

export function projectPlantEquipmentAssetStatusBrief(
  production: ProductionState,
): PlantEquipmentAssetStatusBrief {
  let totalAssets = 0
  let commissionedCount = 0
  let notCommissionedCount = 0
  const wcMap = new Map<string, number>()

  for (const asset of production.equipmentMaster?.assets ?? []) {
    totalAssets++
    if (asset.commissioningStatus === 'commissioned') {
      commissionedCount++
    } else {
      notCommissionedCount++
    }
    wcMap.set(asset.workCentreId, (wcMap.get(asset.workCentreId) ?? 0) + 1)
  }

  const topWorkCentresByCount = Array.from(wcMap.entries())
    .map(([workCentreId, count]) => ({ workCentreId, count }))
    .sort((a, b) => b.count - a.count || a.workCentreId.localeCompare(b.workCentreId))
    .slice(0, 5)

  return {
    totalAssets,
    commissionedCount,
    notCommissionedCount,
    commissionedRate: totalAssets > 0 ? Math.round((commissionedCount / totalAssets) * 100) : 0,
    uniqueWorkCentres: wcMap.size,
    topWorkCentresByCount,
  }
}
