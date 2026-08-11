import type { ProductionState } from './production-workspace.ts'

export type PlantEquipmentCriticalityBrief = {
  totalAssets: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  criticalRate: number
  highRate: number
  mediumRate: number
  lowRate: number
}

export function projectPlantEquipmentCriticalityBrief(
  production: ProductionState,
): PlantEquipmentCriticalityBrief {
  let totalAssets = 0
  let criticalCount = 0
  let highCount = 0
  let mediumCount = 0
  let lowCount = 0

  for (const asset of production.equipmentMaster?.assets ?? []) {
    totalAssets++
    if (asset.criticality === 'critical') criticalCount++
    else if (asset.criticality === 'high') highCount++
    else if (asset.criticality === 'medium') mediumCount++
    else lowCount++
  }

  return {
    totalAssets,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    criticalRate: totalAssets > 0 ? Math.round((criticalCount / totalAssets) * 100) : 0,
    highRate: totalAssets > 0 ? Math.round((highCount / totalAssets) * 100) : 0,
    mediumRate: totalAssets > 0 ? Math.round((mediumCount / totalAssets) * 100) : 0,
    lowRate: totalAssets > 0 ? Math.round((lowCount / totalAssets) * 100) : 0,
  }
}
