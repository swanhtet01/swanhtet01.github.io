import type { CommerceState } from './commerce-workspace.ts'

export type ShopSupplierReturnClaimReasonBrief = {
  totalClaims: number
  damagedCount: number
  wrongItemCount: number
  qualityFailedCount: number
  damagedRate: number
  wrongItemRate: number
  qualityFailedRate: number
  totalClaimAmountMmk: number
  averageClaimAmountMmk: number
  minClaimAmountMmk: number | null
  maxClaimAmountMmk: number | null
}

export function projectShopSupplierReturnClaimReasonBrief(
  commerce: CommerceState,
): ShopSupplierReturnClaimReasonBrief {
  let totalClaims = 0
  let damagedCount = 0
  let wrongItemCount = 0
  let qualityFailedCount = 0
  let totalClaimAmountMmk = 0
  let minClaimAmountMmk: number | null = null
  let maxClaimAmountMmk: number | null = null

  for (const po of commerce.purchaseOrders ?? []) {
    for (const claim of po.supplierReturns ?? []) {
      totalClaims++
      if (claim.reasonCode === 'damaged') damagedCount++
      else if (claim.reasonCode === 'wrong_item') wrongItemCount++
      else if (claim.reasonCode === 'quality_failed') qualityFailedCount++

      const amount = claim.claimAmountMmk
      totalClaimAmountMmk += amount
      if (minClaimAmountMmk === null || amount < minClaimAmountMmk) minClaimAmountMmk = amount
      if (maxClaimAmountMmk === null || amount > maxClaimAmountMmk) maxClaimAmountMmk = amount
    }
  }

  return {
    totalClaims,
    damagedCount,
    wrongItemCount,
    qualityFailedCount,
    damagedRate: totalClaims > 0 ? Math.round((damagedCount / totalClaims) * 100) : 0,
    wrongItemRate: totalClaims > 0 ? Math.round((wrongItemCount / totalClaims) * 100) : 0,
    qualityFailedRate: totalClaims > 0 ? Math.round((qualityFailedCount / totalClaims) * 100) : 0,
    totalClaimAmountMmk,
    averageClaimAmountMmk:
      totalClaims > 0 ? Math.round(totalClaimAmountMmk / totalClaims) : 0,
    minClaimAmountMmk,
    maxClaimAmountMmk,
  }
}
