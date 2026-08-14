import type { CommerceState } from './commerce-workspace.ts'

export type ShopSupplierReturnClaimQuantityBrief = {
  totalClaims: number
  totalQuantityRejected: number
  averageQuantityRejected: number
  minQuantityRejected: number | null
  maxQuantityRejected: number | null
}

export function projectShopSupplierReturnClaimQuantityBrief(
  commerce: CommerceState,
): ShopSupplierReturnClaimQuantityBrief {
  let totalClaims = 0
  let totalQuantityRejected = 0
  let minQuantityRejected: number | null = null
  let maxQuantityRejected: number | null = null

  for (const po of commerce.purchaseOrders ?? []) {
    for (const claim of po.supplierReturns ?? []) {
      totalClaims++
      const qty = claim.quantityRejected
      totalQuantityRejected += qty
      if (minQuantityRejected === null || qty < minQuantityRejected) minQuantityRejected = qty
      if (maxQuantityRejected === null || qty > maxQuantityRejected) maxQuantityRejected = qty
    }
  }

  return {
    totalClaims,
    totalQuantityRejected,
    averageQuantityRejected: totalClaims > 0 ? Math.round(totalQuantityRejected / totalClaims) : 0,
    minQuantityRejected,
    maxQuantityRejected,
  }
}
