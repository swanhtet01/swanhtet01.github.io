import type { CommerceState } from './commerce-workspace.ts'

export type ShopStockMovementEvidenceBrief = {
  totalMovements: number
  uniqueEvidenceReferences: number
  topEvidenceReferencesByCount: Array<{ reference: string; count: number }>
  movementsWithConversionNote: number
  conversionNoteRate: number
}

export function projectShopStockMovementEvidenceBrief(
  commerce: CommerceState,
): ShopStockMovementEvidenceBrief {
  let totalMovements = 0
  let movementsWithConversionNote = 0
  const referenceMap = new Map<string, number>()

  for (const movement of commerce.movements) {
    totalMovements++
    referenceMap.set(
      movement.evidenceReference,
      (referenceMap.get(movement.evidenceReference) ?? 0) + 1,
    )
    if (movement.conversionNote !== undefined) {
      movementsWithConversionNote++
    }
  }

  const topEvidenceReferencesByCount = Array.from(referenceMap.entries())
    .map(([reference, count]) => ({ reference, count }))
    .sort((a, b) => b.count - a.count || a.reference.localeCompare(b.reference))
    .slice(0, 5)

  return {
    totalMovements,
    uniqueEvidenceReferences: referenceMap.size,
    topEvidenceReferencesByCount,
    movementsWithConversionNote,
    conversionNoteRate:
      totalMovements > 0 ? Math.round((movementsWithConversionNote / totalMovements) * 100) : 0,
  }
}
