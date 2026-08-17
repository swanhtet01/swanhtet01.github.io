import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseOrderReturnClaimBrief = {
  totalClaims: number
  ordersWithReturnClaims: number
  totalClaimAmountMmk: number
  byStatus: {
    awaitingCredit: number
    partiallyCredited: number
    credited: number
  }
  byReasonCode: {
    damaged: number
    wrongItem: number
    qualityFailed: number
  }
  totalCreditedMmk: number
  pendingClaimAmountMmk: number
}

export function projectShopPurchaseOrderReturnClaimBrief(commerce: CommerceState): ShopPurchaseOrderReturnClaimBrief {
  let totalClaims = 0
  let totalClaimAmountMmk = 0
  let totalCreditedMmk = 0
  const ordersWithClaimsSet = new Set<string>()
  const byStatus = { awaitingCredit: 0, partiallyCredited: 0, credited: 0 }
  const byReasonCode = { damaged: 0, wrongItem: 0, qualityFailed: 0 }

  for (const po of commerce.purchaseOrders ?? []) {
    for (const claim of po.supplierReturns ?? []) {
      totalClaims++
      ordersWithClaimsSet.add(po.id)
      totalClaimAmountMmk += claim.claimAmountMmk
      const creditedMmk = claim.creditNotes.reduce((sum, note) => sum + note.amountMmk, 0)
      totalCreditedMmk += creditedMmk
      if (creditedMmk === 0) byStatus.awaitingCredit++
      else if (creditedMmk === claim.claimAmountMmk) byStatus.credited++
      else byStatus.partiallyCredited++
      if (claim.reasonCode === 'damaged') byReasonCode.damaged++
      else if (claim.reasonCode === 'wrong_item') byReasonCode.wrongItem++
      else if (claim.reasonCode === 'quality_failed') byReasonCode.qualityFailed++
    }
  }

  return {
    totalClaims,
    ordersWithReturnClaims: ordersWithClaimsSet.size,
    totalClaimAmountMmk,
    byStatus,
    byReasonCode,
    totalCreditedMmk,
    pendingClaimAmountMmk: totalClaimAmountMmk - totalCreditedMmk,
  }
}
