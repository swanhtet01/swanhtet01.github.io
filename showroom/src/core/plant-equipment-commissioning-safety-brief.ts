import type { ProductionState } from './production-workspace.ts'

export type PlantEquipmentCommissioningSafetyBrief = {
  totalAssets: number
  assetsWithSafetyReference: number
  safetyReferencePresenceRate: number
  uniqueSafetyReferences: number
  topSafetyReferencesByCount: Array<{ reference: string; count: number }>
}

export function projectPlantEquipmentCommissioningSafetyBrief(
  production: ProductionState,
): PlantEquipmentCommissioningSafetyBrief {
  const assets = production.equipmentMaster?.assets ?? []
  let totalAssets = 0
  let assetsWithSafetyReference = 0
  const refMap = new Map<string, number>()

  for (const asset of assets) {
    const c = asset.commissioning
    if (c === undefined) continue
    totalAssets++
    if (c.safetyBaselineReference !== undefined) {
      assetsWithSafetyReference++
      refMap.set(c.safetyBaselineReference, (refMap.get(c.safetyBaselineReference) ?? 0) + 1)
    }
  }

  const topSafetyReferencesByCount = Array.from(refMap.entries())
    .map(([reference, count]) => ({ reference, count }))
    .sort((a, b) => b.count - a.count || a.reference.localeCompare(b.reference))
    .slice(0, 5)

  return {
    totalAssets,
    assetsWithSafetyReference,
    safetyReferencePresenceRate:
      totalAssets > 0 ? Math.round((assetsWithSafetyReference / totalAssets) * 100) : 0,
    uniqueSafetyReferences: refMap.size,
    topSafetyReferencesByCount,
  }
}
