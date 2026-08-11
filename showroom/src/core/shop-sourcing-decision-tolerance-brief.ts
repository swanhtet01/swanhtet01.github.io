import type { CommerceState } from './commerce-workspace.ts'

export type ShopSourcingDecisionToleranceBrief = {
  totalDecisions: number
  totalUnitCostToleranceBasisPoints: number
  averageUnitCostToleranceBasisPoints: number
  minUnitCostToleranceBasisPoints: number | null
  maxUnitCostToleranceBasisPoints: number | null
  totalDeliveryToleranceDays: number
  averageDeliveryToleranceDays: number
  minDeliveryToleranceDays: number | null
  maxDeliveryToleranceDays: number | null
}

export function projectShopSourcingDecisionToleranceBrief(
  commerce: CommerceState,
): ShopSourcingDecisionToleranceBrief {
  let totalDecisions = 0
  let totalUnitCostToleranceBasisPoints = 0
  let minUnitCostToleranceBasisPoints: number | null = null
  let maxUnitCostToleranceBasisPoints: number | null = null
  let totalDeliveryToleranceDays = 0
  let minDeliveryToleranceDays: number | null = null
  let maxDeliveryToleranceDays: number | null = null

  for (const decision of commerce.supplierSourcingDecisions ?? []) {
    totalDecisions++

    const costBp = decision.unitCostToleranceBasisPoints
    totalUnitCostToleranceBasisPoints += costBp
    if (minUnitCostToleranceBasisPoints === null || costBp < minUnitCostToleranceBasisPoints)
      minUnitCostToleranceBasisPoints = costBp
    if (maxUnitCostToleranceBasisPoints === null || costBp > maxUnitCostToleranceBasisPoints)
      maxUnitCostToleranceBasisPoints = costBp

    const delivDays = decision.deliveryToleranceDays
    totalDeliveryToleranceDays += delivDays
    if (minDeliveryToleranceDays === null || delivDays < minDeliveryToleranceDays)
      minDeliveryToleranceDays = delivDays
    if (maxDeliveryToleranceDays === null || delivDays > maxDeliveryToleranceDays)
      maxDeliveryToleranceDays = delivDays
  }

  return {
    totalDecisions,
    totalUnitCostToleranceBasisPoints,
    averageUnitCostToleranceBasisPoints:
      totalDecisions > 0
        ? Math.round(totalUnitCostToleranceBasisPoints / totalDecisions)
        : 0,
    minUnitCostToleranceBasisPoints,
    maxUnitCostToleranceBasisPoints,
    totalDeliveryToleranceDays,
    averageDeliveryToleranceDays:
      totalDecisions > 0 ? Math.round(totalDeliveryToleranceDays / totalDecisions) : 0,
    minDeliveryToleranceDays,
    maxDeliveryToleranceDays,
  }
}
