import type { ProductionState } from './production-workspace.ts'

export type PlantEquipmentCommissioningDateBrief = {
  totalCommissioned: number
  earliestCommissionedAt: string | null
  latestCommissionedAt: string | null
  earliestInstalledAt: string | null
  latestInstalledAt: string | null
  uniqueCommissionedBy: number
  topCommissionedByCount: Array<{ commissionedBy: string; count: number }>
}

export function projectPlantEquipmentCommissioningDateBrief(
  production: ProductionState,
): PlantEquipmentCommissioningDateBrief {
  const assets = production.equipmentMaster?.assets ?? []
  let totalCommissioned = 0
  let earliestCommissionedAt: string | null = null
  let latestCommissionedAt: string | null = null
  let earliestInstalledAt: string | null = null
  let latestInstalledAt: string | null = null
  const byMap = new Map<string, number>()

  for (const asset of assets) {
    const c = asset.commissioning
    if (c === undefined) continue
    totalCommissioned++
    const ca = c.commissionedAt
    if (earliestCommissionedAt === null || ca < earliestCommissionedAt) earliestCommissionedAt = ca
    if (latestCommissionedAt === null || ca > latestCommissionedAt) latestCommissionedAt = ca
    const ia = c.installedAt
    if (earliestInstalledAt === null || ia < earliestInstalledAt) earliestInstalledAt = ia
    if (latestInstalledAt === null || ia > latestInstalledAt) latestInstalledAt = ia
    byMap.set(c.commissionedBy, (byMap.get(c.commissionedBy) ?? 0) + 1)
  }

  const topCommissionedByCount = Array.from(byMap.entries())
    .map(([commissionedBy, count]) => ({ commissionedBy, count }))
    .sort((a, b) => b.count - a.count || a.commissionedBy.localeCompare(b.commissionedBy))
    .slice(0, 5)

  return {
    totalCommissioned,
    earliestCommissionedAt,
    latestCommissionedAt,
    earliestInstalledAt,
    latestInstalledAt,
    uniqueCommissionedBy: byMap.size,
    topCommissionedByCount,
  }
}
