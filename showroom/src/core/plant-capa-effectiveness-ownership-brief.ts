import type { ProductionState } from './production-workspace.ts'

export type PlantCapaEffectivenessOwnershipBrief = {
  totalCapas: number
  uniqueOwners: number
  overdueCapas: number
  topOwnersByTotal: Array<{ owner: string; total: number; overdue: number }>
}

export function projectPlantCapaEffectivenessOwnershipBrief(
  production: ProductionState,
  asOf: string,
): PlantCapaEffectivenessOwnershipBrief {
  let totalCapas = 0
  let overdueCapas = 0
  const ownerMap = new Map<string, { total: number; overdue: number }>()

  for (const issue of production.issues ?? []) {
    const capa = issue.resolution?.qualityCorrectiveAction
    if (capa === undefined) continue

    totalCapas++
    const isOverdue = capa.effectivenessDue < asOf
    if (isOverdue) overdueCapas++

    const existing = ownerMap.get(capa.effectivenessOwner)
    if (existing !== undefined) {
      existing.total++
      if (isOverdue) existing.overdue++
    } else {
      ownerMap.set(capa.effectivenessOwner, { total: 1, overdue: isOverdue ? 1 : 0 })
    }
  }

  const topOwnersByTotal = Array.from(ownerMap.entries())
    .map(([owner, counts]) => ({ owner, ...counts }))
    .sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner))
    .slice(0, 5)

  return {
    totalCapas,
    uniqueOwners: ownerMap.size,
    overdueCapas,
    topOwnersByTotal,
  }
}
