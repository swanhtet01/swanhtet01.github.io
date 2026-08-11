import type { CommerceState } from './commerce-workspace.ts'

export type ShopSupplierSourcingToleranceBrief = {
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

export function projectShopSupplierSourcingToleranceBrief(
  commerce: CommerceState,
): ShopSupplierSourcingToleranceBrief {
  const decisions = commerce.supplierSourcingDecisions ?? []
  let totalDecisions = 0
  let totalUnitCostToleranceBasisPoints = 0
  let minUnitCostToleranceBasisPoints: number | null = null
  let maxUnitCostToleranceBasisPoints: number | null = null
  let totalDeliveryToleranceDays = 0
  let minDeliveryToleranceDays: number | null = null
  let maxDeliveryToleranceDays: number | null = null

  for (const decision of decisions) {
    totalDecisions++
    const cost = decision.unitCostToleranceBasisPoints
    const days = decision.deliveryToleranceDays
    totalUnitCostToleranceBasisPoints += cost
    totalDeliveryToleranceDays += days
    if (minUnitCostToleranceBasisPoints === null || cost < minUnitCostToleranceBasisPoints) minUnitCostToleranceBasisPoints = cost
    if (maxUnitCostToleranceBasisPoints === null || cost > maxUnitCostToleranceBasisPoints) maxUnitCostToleranceBasisPoints = cost
    if (minDeliveryToleranceDays === null || days < minDeliveryToleranceDays) minDeliveryToleranceDays = days
    if (maxDeliveryToleranceDays === null || days > maxDeliveryToleranceDays) maxDeliveryToleranceDays = days
  }

  return {
    totalDecisions,
    totalUnitCostToleranceBasisPoints,
    averageUnitCostToleranceBasisPoints: totalDecisions > 0 ? Math.round(totalUnitCostToleranceBasisPoints / totalDecisions) : 0,
    minUnitCostToleranceBasisPoints,
    maxUnitCostToleranceBasisPoints,
    totalDeliveryToleranceDays,
    averageDeliveryToleranceDays: totalDecisions > 0 ? Math.round(totalDeliveryToleranceDays / totalDecisions) : 0,
    minDeliveryToleranceDays,
    maxDeliveryToleranceDays,
  }
}
