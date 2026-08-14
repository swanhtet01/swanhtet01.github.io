import type { CommerceState } from './commerce-workspace.ts'

export type ShopStockMovementDiscrepancyBrief = {
  totalMovements: number
  movementsWithDiscrepancy: number
  movementsWithoutDiscrepancy: number
  discrepancyRate: number
  byCode: { damaged: number; wrongItem: number; qualityFailed: number }
  topDiscrepancyCode: 'damaged' | 'wrong_item' | 'quality_failed' | null
}

export function projectShopStockMovementDiscrepancyBrief(commerce: CommerceState): ShopStockMovementDiscrepancyBrief {
  let movementsWithDiscrepancy = 0
  const byCode = { damaged: 0, wrongItem: 0, qualityFailed: 0 }

  for (const movement of commerce.movements) {
    if (movement.discrepancyCode !== undefined) {
      movementsWithDiscrepancy++
      if (movement.discrepancyCode === 'damaged') byCode.damaged++
      else if (movement.discrepancyCode === 'wrong_item') byCode.wrongItem++
      else byCode.qualityFailed++
    }
  }

  const totalMovements = commerce.movements.length
  const topDiscrepancyCode =
    movementsWithDiscrepancy === 0
      ? null
      : byCode.damaged >= byCode.wrongItem && byCode.damaged >= byCode.qualityFailed
        ? 'damaged'
        : byCode.wrongItem >= byCode.qualityFailed
          ? 'wrong_item'
          : 'quality_failed'

  return {
    totalMovements,
    movementsWithDiscrepancy,
    movementsWithoutDiscrepancy: totalMovements - movementsWithDiscrepancy,
    discrepancyRate: totalMovements > 0 ? Math.round((movementsWithDiscrepancy / totalMovements) * 100) : 0,
    byCode,
    topDiscrepancyCode,
  }
}
