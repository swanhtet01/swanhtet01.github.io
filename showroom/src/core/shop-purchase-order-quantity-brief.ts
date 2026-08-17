import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseOrderQuantityBrief = {
  totalPurchaseOrders: number
  totalQuantityOrdered: number
  averageQuantityOrdered: number
  minQuantityOrdered: number | null
  maxQuantityOrdered: number | null
  ordersWithUnitCost: number
  totalUnitCostMmk: number
  averageUnitCostMmk: number
}

export function projectShopPurchaseOrderQuantityBrief(
  commerce: CommerceState,
): ShopPurchaseOrderQuantityBrief {
  let totalPurchaseOrders = 0
  let totalQuantityOrdered = 0
  let minQuantityOrdered: number | null = null
  let maxQuantityOrdered: number | null = null
  let ordersWithUnitCost = 0
  let totalUnitCostMmk = 0

  for (const po of commerce.purchaseOrders ?? []) {
    totalPurchaseOrders++
    totalQuantityOrdered += po.quantityOrdered
    if (minQuantityOrdered === null || po.quantityOrdered < minQuantityOrdered)
      minQuantityOrdered = po.quantityOrdered
    if (maxQuantityOrdered === null || po.quantityOrdered > maxQuantityOrdered)
      maxQuantityOrdered = po.quantityOrdered
    if (po.unitCostMmk !== undefined) {
      ordersWithUnitCost++
      totalUnitCostMmk += po.unitCostMmk
    }
  }

  return {
    totalPurchaseOrders,
    totalQuantityOrdered,
    averageQuantityOrdered:
      totalPurchaseOrders > 0 ? Math.round(totalQuantityOrdered / totalPurchaseOrders) : 0,
    minQuantityOrdered,
    maxQuantityOrdered,
    ordersWithUnitCost,
    totalUnitCostMmk,
    averageUnitCostMmk: ordersWithUnitCost > 0 ? Math.round(totalUnitCostMmk / ordersWithUnitCost) : 0,
  }
}
