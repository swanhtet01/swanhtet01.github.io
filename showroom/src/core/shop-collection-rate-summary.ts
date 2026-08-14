import type { CommerceState } from './commerce-workspace.ts'

export type ShopCollectionRateSummary = {
  totalOrdersRequiringPayment: number
  totalOrdersReconciled: number
  collectionRate: number
  totalOutstandingAmountMmk: number
  totalReconciledAmountMmk: number
}

export function projectShopCollectionRateSummary(commerce: CommerceState): ShopCollectionRateSummary {
  let totalOrdersRequiringPayment = 0
  let totalOrdersReconciled = 0
  let totalOutstandingAmountMmk = 0
  let totalReconciledAmountMmk = 0

  for (const order of commerce.orders) {
    if (order.paymentStatus === 'reconciled') {
      totalOrdersReconciled++
      totalReconciledAmountMmk += order.total
    } else {
      totalOrdersRequiringPayment++
      totalOutstandingAmountMmk += order.total
    }
  }

  const total = totalOrdersRequiringPayment + totalOrdersReconciled
  return {
    totalOrdersRequiringPayment,
    totalOrdersReconciled,
    collectionRate: total > 0 ? Math.round((totalOrdersReconciled / total) * 100) : 0,
    totalOutstandingAmountMmk,
    totalReconciledAmountMmk,
  }
}
