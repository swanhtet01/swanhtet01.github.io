import type { CommerceState } from './commerce-workspace.ts'

export type ShopCatalogReorderBrief = {
  totalChanges: number
  changesWithReorderAtShift: number
  reorderAtShiftRate: number
  increasedReorderAtCount: number
  decreasedReorderAtCount: number
  totalNextReorderAtUnits: number
  averageNextReorderAtUnits: number
}

export function projectShopCatalogReorderBrief(commerce: CommerceState): ShopCatalogReorderBrief {
  const changes = commerce.catalogChanges ?? []
  let totalChanges = 0
  let changesWithReorderAtShift = 0
  let increasedReorderAtCount = 0
  let decreasedReorderAtCount = 0
  let totalNextReorderAtUnits = 0

  for (const change of changes) {
    totalChanges++
    totalNextReorderAtUnits += change.nextReorderAt
    if (change.nextReorderAt !== change.previousReorderAt) {
      changesWithReorderAtShift++
      if (change.nextReorderAt > change.previousReorderAt) increasedReorderAtCount++
      else decreasedReorderAtCount++
    }
  }

  return {
    totalChanges,
    changesWithReorderAtShift,
    reorderAtShiftRate:
      totalChanges > 0 ? Math.round((changesWithReorderAtShift / totalChanges) * 100) : 0,
    increasedReorderAtCount,
    decreasedReorderAtCount,
    totalNextReorderAtUnits,
    averageNextReorderAtUnits:
      totalChanges > 0 ? Math.round(totalNextReorderAtUnits / totalChanges) : 0,
  }
}
