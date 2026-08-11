import type { ProductionState } from './production-workspace.ts'

export type PlantEquipmentAssetIdentityBrief = {
  totalAssets: number
  uniqueNames: number
  uniqueOwners: number
  topOwnersByCount: Array<{ owner: string; count: number }>
  earliestImportedAt: string | null
  latestImportedAt: string | null
}

export function projectPlantEquipmentAssetIdentityBrief(
  production: ProductionState,
): PlantEquipmentAssetIdentityBrief {
  const assets = production.equipmentMaster?.assets ?? []
  let totalAssets = 0
  let earliestImportedAt: string | null = null
  let latestImportedAt: string | null = null
  const nameSet = new Set<string>()
  const ownerMap = new Map<string, number>()

  for (const asset of assets) {
    totalAssets++
    nameSet.add(asset.name)
    ownerMap.set(asset.owner, (ownerMap.get(asset.owner) ?? 0) + 1)
    const imported = asset.importedAt
    if (earliestImportedAt === null || imported < earliestImportedAt) earliestImportedAt = imported
    if (latestImportedAt === null || imported > latestImportedAt) latestImportedAt = imported
  }

  const topOwnersByCount = Array.from(ownerMap.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
    .slice(0, 5)

  return {
    totalAssets,
    uniqueNames: nameSet.size,
    uniqueOwners: ownerMap.size,
    topOwnersByCount,
    earliestImportedAt,
    latestImportedAt,
  }
}
