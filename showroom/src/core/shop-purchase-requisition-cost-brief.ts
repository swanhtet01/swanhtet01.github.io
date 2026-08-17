import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseRequisitionCostBrief = {
  totalRequisitions: number
  totalQuantityRequested: number
  averageQuantityRequested: number
  totalUnitCostMmk: number
  averageUnitCostMmk: number
  totalRequisitionValueMmk: number
  averageRequisitionValueMmk: number
}

export function projectShopPurchaseRequisitionCostBrief(
  commerce: CommerceState,
): ShopPurchaseRequisitionCostBrief {
  let totalRequisitions = 0
  let totalQuantityRequested = 0
  let totalUnitCostMmk = 0
  let totalRequisitionValueMmk = 0

  for (const req of commerce.purchaseRequisitions ?? []) {
    totalRequisitions++
    totalQuantityRequested += req.quantityRequested
    totalUnitCostMmk += req.unitCostMmk
    totalRequisitionValueMmk += req.totalMmk
  }

  return {
    totalRequisitions,
    totalQuantityRequested,
    averageQuantityRequested:
      totalRequisitions > 0 ? Math.round(totalQuantityRequested / totalRequisitions) : 0,
    totalUnitCostMmk,
    averageUnitCostMmk:
      totalRequisitions > 0 ? Math.round(totalUnitCostMmk / totalRequisitions) : 0,
    totalRequisitionValueMmk,
    averageRequisitionValueMmk:
      totalRequisitions > 0 ? Math.round(totalRequisitionValueMmk / totalRequisitions) : 0,
  }
}
